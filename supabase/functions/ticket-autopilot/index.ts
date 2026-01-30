// Supabase Edge Function: ticket-autopilot
// Triggers when a new ticket with status 'solicitado' is created
// Proposes available slots to client if PRO mode is enabled

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ProConfig {
    slots_count: number;
    timeout_minutes: number;
    search_days: number;
    channels: {
        whatsapp: boolean;
        app: boolean;
    };
}

interface SlotProposal {
    date: string;
    time_start: string;
    time_end: string;
    technician_id: string;
    technician_name: string;
}

const DEFAULT_PRO_CONFIG: ProConfig = {
    slots_count: 3,
    timeout_minutes: 3,
    search_days: 7,
    channels: { whatsapp: true, app: true }
};

async function getSecretaryConfig(supabase: any) {
    const { data: configs } = await supabase
        .from('business_config')
        .select('key, value')
        .in('key', ['secretary_mode', 'pro_config']);

    let secretaryMode = 'basic';
    let proConfig: ProConfig = { ...DEFAULT_PRO_CONFIG };

    if (configs) {
        for (const c of configs) {
            if (c.key === 'secretary_mode') secretaryMode = (c.value ?? '').toString().toLowerCase();
            if (c.key === 'pro_config' && c.value) proConfig = { ...proConfig, ...c.value };
        }
    }

    const secretaryModeNorm = (secretaryMode ?? '').toString().toLowerCase();
    return { secretaryModeNorm, proConfig };
}

async function processTicket(
    supabase: any,
    ticket: any,
    secretaryModeNorm: string,
    proConfig: ProConfig
) {
    const status = (ticket?.status ?? '').toString().toLowerCase();
    if (status !== 'solicitado') {
        console.log('[Autopilot] Ignored: status is', ticket?.status);
        return { skipped: 'status' };
    }

    if (ticket.technician_id || ticket.scheduled_at) {
        console.log('[Autopilot] Ignored: already assigned or scheduled');
        return { skipped: 'assigned' };
    }

    if (secretaryModeNorm !== 'pro') {
        console.log('[Autopilot] PRO mode not active (secretary_mode=' + secretaryModeNorm + '), skipping');
        return { skipped: 'mode' };
    }

    const originSource = ticket.origin_source || 'admin';
    const isWebApp = originSource === 'client_web' || originSource === 'client_app';
    const isWhatsApp = originSource === 'whatsapp';

    if (isWebApp && !proConfig.channels.app) {
        console.log('[Autopilot] Web App channel disabled');
        return { skipped: 'app_disabled' };
    }
    if (isWhatsApp && !proConfig.channels.whatsapp) {
        console.log('[Autopilot] WhatsApp channel disabled');
        return { skipped: 'whatsapp_disabled' };
    }

    console.log('[Autopilot] PRO mode active, searching slots...');
    const slots = await findAvailableSlots(supabase, proConfig);

    if (slots.length === 0) {
        console.log('[Autopilot] No slots available');
        await supabase
            .from('tickets')
            .update({
                pro_proposal: {
                    status: 'no_slots',
                    proposed_at: new Date().toISOString()
                }
            })
            .eq('id', ticket.id);
        return { skipped: 'no_slots' };
    }

    console.log('[Autopilot] Found', slots.length, 'slots');

    const proposalData = {
        proposed_slots: slots,
        proposed_at: new Date().toISOString(),
        timeout_at: new Date(Date.now() + proConfig.timeout_minutes * 60 * 1000).toISOString(),
        status: 'waiting_selection'
    };

    await supabase
        .from('tickets')
        .update({ pro_proposal: proposalData })
        .eq('id', ticket.id);

    console.log('[Autopilot] Stored proposal in ticket #', ticket.id);

    if (isWebApp) {
        console.log('[Autopilot] Web App client will receive proposal via realtime');
    } else if (isWhatsApp && ticket.client_phone) {
        await sendWhatsAppSlotProposal(supabase, ticket, slots, proConfig.timeout_minutes);
    }

    return { success: true, ticketId: ticket.id, slotsProposed: slots.length, channel: originSource };
}

async function scanPendingTickets(supabase: any) {
    const { secretaryModeNorm, proConfig } = await getSecretaryConfig(supabase);
    if (secretaryModeNorm !== 'pro') {
        return { skipped: 'mode' };
    }

    const { data: tickets, error } = await supabase
        .from('tickets')
        .select('*')
        .eq('status', 'solicitado')
        .is('technician_id', null)
        .is('scheduled_at', null)
        .order('created_at', { ascending: true })
        .limit(10);

    if (error || !tickets || tickets.length === 0) {
        return { processed: 0 };
    }

    let processed = 0;
    for (const ticket of tickets) {
        const proposal = ticket.pro_proposal;
        const pStatus = (proposal?.status ?? '').toString().toLowerCase();
        const expired = proposal?.timeout_at && new Date(proposal.timeout_at).getTime() < Date.now();
        if (proposal && pStatus === 'waiting_selection' && !expired) {
            continue;
        }

        const result = await processTicket(supabase, ticket, secretaryModeNorm, proConfig);
        if (result?.success) processed += 1;
    }

    return { processed, scanned: tickets.length };
}

serve(async (req) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        // Parse payload (trigger or cron)
        const payload = await req.json().catch(() => ({}));
        console.log('[Autopilot] Received payload type:', payload?.type, 'table:', payload?.table, 'record.id:', payload?.record?.id, 'mode:', payload?.mode);

        const isScan = payload?.mode === 'scan' || !payload?.record;
        if (isScan) {
            const result = await scanPendingTickets(supabase);
            return new Response(JSON.stringify(result), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        const { table, record } = payload;
        if (table !== 'tickets') {
            console.log('[Autopilot] Ignored: table is', table, '(expected tickets)');
            return new Response(JSON.stringify({ message: 'Ignored: not tickets table' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        const ticket = record;
        const { secretaryModeNorm, proConfig } = await getSecretaryConfig(supabase);
        console.log('[Autopilot] business_config secretary_mode normalized:', secretaryModeNorm);

        const result = await processTicket(supabase, ticket, secretaryModeNorm, proConfig);
        return new Response(JSON.stringify(result), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });

    } catch (error) {
        console.error('[Autopilot] Error:', error);
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
});

// ═══════════════════════════════════════════════════════════════
// HELPERS: Calendario y eventos
// ═══════════════════════════════════════════════════════════════
/** day_of_week: 0=Dom, 1=Lun, ... 6=Sab (JS getDay()). */
interface CalendarRow {
    technician_id: string;
    day_of_week: number;
    start_time: string;
    end_time: string;
    is_working_day: boolean;
}

/** Genera horas de inicio de slot cada 2h entre start_time y end_time (slot 2h). */
function getSlotTimesBetween(startTime: string, endTime: string, slotDurationHours = 2): string[] {
    const parse = (t: string) => {
        const parts = (t || '').split(':');
        const h = parseInt(parts[0], 10) || 0;
        const m = parseInt(parts[1], 10) || 0;
        return h * 60 + m;
    };
    const startM = parse(startTime);
    const endM = parse(endTime);
    const step = slotDurationHours * 60;
    const out: string[] = [];
    for (let m = startM; m + step <= endM; m += step) {
        const h = Math.floor(m / 60);
        const min = m % 60;
        out.push(`${h.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`);
    }
    return out;
}

/** Overlap: slot [dateStr + time_start, dateStr + time_end] con event [start_time, end_time]. */
function slotOverlapsEvent(
    dateStr: string,
    timeStart: string,
    timeEnd: string,
    eventStart: string,
    eventEnd: string
): boolean {
    const slotStart = `${dateStr}T${timeStart}:00.000Z`;
    const slotEnd = `${dateStr}T${timeEnd}:00.000Z`;
    return slotStart < eventEnd && slotEnd > eventStart;
}

// ═══════════════════════════════════════════════════════════════
// HELPER: Find available slots (calendario + eventos + tickets)
// ═══════════════════════════════════════════════════════════════
async function findAvailableSlots(
    supabase: any,
    config: ProConfig
): Promise<SlotProposal[]> {

    const { slots_count, search_days } = config;

    // 1. Get active technicians
    const { data: technicians, error: techError } = await supabase
        .from('profiles')
        .select('id, full_name, is_active')
        .eq('role', 'tech')
        .eq('is_deleted', false);

    if (techError || !technicians || technicians.length === 0) {
        console.log('[Autopilot] No technicians found:', techError);
        return [];
    }

    const activeTechs = technicians.filter((t: any) => t.is_active !== false);
    if (activeTechs.length === 0) return [];

    const techIds = activeTechs.map((t: any) => t.id);
    console.log('[Autopilot] Active technicians:', activeTechs.length);

    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + search_days);
    const endDateISO = endDate.toISOString();
    const startDateISO = startDate.toISOString();

    // 2. Horario base: technician_calendars (por technician_id y day_of_week)
    let calendarRows: any[] = [];
    try {
        const res = await supabase
            .from('technician_calendars')
            .select('technician_id, day_of_week, start_time, end_time, is_working_day')
            .in('technician_id', techIds);
        if (res.data) calendarRows = res.data;
    } catch (_) {
        // Tabla technician_calendars puede no existir aún
    }
    const calendarMap = new Map<string, { start_time: string; end_time: string; is_working_day: boolean }>();
    if (calendarRows.length > 0) {
        for (const row of calendarRows as CalendarRow[]) {
            const key = `${row.technician_id}_${row.day_of_week}`;
            calendarMap.set(key, {
                start_time: (row.start_time ?? '09:00').toString().slice(0, 5),
                end_time: (row.end_time ?? '18:00').toString().slice(0, 5),
                is_working_day: row.is_working_day !== false
            });
        }
        console.log('[Autopilot] Loaded', calendarMap.size, 'calendar rows');
    } else {
        // Fallback: sin calendario definido, Lun-Vie 09:00-18:00 (comportamiento anterior)
        for (const t of activeTechs) {
            for (let dow = 1; dow <= 5; dow++) {
                calendarMap.set(`${t.id}_${dow}`, { start_time: '09:00', end_time: '18:00', is_working_day: true });
            }
        }
        console.log('[Autopilot] No calendar rows → using default Mon-Fri 09:00-18:00');
    }

    // 3. Bloqueos: events (Vacaciones, Médico, etc.) — overlap con [startDate, endDate]
    let events: any[] = [];
    try {
        const res = await supabase
            .from('events')
            .select('technician_id, start_time, end_time')
            .in('technician_id', techIds)
            .lt('start_time', endDateISO)
            .gt('end_time', startDateISO);
        if (res.data) events = res.data;
    } catch (_) {
        // Tabla events puede no exister aún
    }
    const eventsByTech = new Map<string, Array<{ start_time: string; end_time: string }>>();
    if (events.length > 0) {
        for (const ev of events) {
            const list = eventsByTech.get(ev.technician_id) || [];
            list.push({ start_time: ev.start_time, end_time: ev.end_time });
            eventsByTech.set(ev.technician_id, list);
        }
        console.log('[Autopilot] Loaded', events?.length ?? 0, 'events in range');
    }

    // 4. Ocupación por tickets existentes
    const { data: busySlots } = await supabase
        .from('tickets')
        .select('technician_id, scheduled_at')
        .in('technician_id', techIds)
        .not('scheduled_at', 'is', null)
        .gte('scheduled_at', startDateISO)
        .lte('scheduled_at', endDateISO)
        .in('status', ['asignado', 'en_camino', 'en_proceso']);

    const busyMap = new Map<string, Set<string>>();
    if (busySlots) {
        for (const slot of busySlots) {
            const slotDate = new Date(slot.scheduled_at);
            const dateStr = slotDate.toISOString().split('T')[0];
            const timeStr = `${slotDate.getUTCHours().toString().padStart(2, '0')}:00`;
            const key = `${slot.technician_id}_${dateStr}`;
            if (!busyMap.has(key)) busyMap.set(key, new Set());
            busyMap.get(key)!.add(timeStr);
        }
    }

    // 5. Generar candidatos: por día, por técnico, según calendario y filtrar eventos + tickets
    const allSlots: SlotProposal[] = [];
    let techIndex = 0;
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const nowHour = now.getHours();
    const nowMinute = now.getMinutes();

    for (let d = 0; d <= search_days; d++) {
        const checkDate = new Date();
        checkDate.setDate(checkDate.getDate() + d);
        const dayOfWeek = checkDate.getDay();
        const dateStr = checkDate.toISOString().split('T')[0];
        const isToday = dateStr === todayStr;

        for (let i = 0; i < activeTechs.length; i++) {
            const tech = activeTechs[(techIndex + i) % activeTechs.length];
            const calKey = `${tech.id}_${dayOfWeek}`;
            const cal = calendarMap.get(calKey);

            // Sin registro o no laborable -> no generar slots ese día para este técnico
            if (!cal || !cal.is_working_day) continue;

            const timeSlots = getSlotTimesBetween(cal.start_time, cal.end_time);
            const dayEvents = eventsByTech.get(tech.id) || [];

            for (const time of timeSlots) {
                // Hoy: descartar slots ya pasados
                if (isToday) {
                    const [slotHour, slotMin] = time.split(':').map(Number);
                    if (slotHour < nowHour || (slotHour === nowHour && slotMin <= nowMinute + 30)) continue;
                }

                const busyKey = `${tech.id}_${dateStr}`;
                if (busyMap.get(busyKey)?.has(time)) continue;

                const startHour = parseInt(time.split(':')[0], 10);
                const endHour = startHour + 2;
                const endTime = `${endHour.toString().padStart(2, '0')}:00`;

                // Comprobar solapamiento con eventos
                let overlaps = false;
                for (const ev of dayEvents) {
                    if (slotOverlapsEvent(dateStr, time, endTime, ev.start_time, ev.end_time)) {
                        overlaps = true;
                        break;
                    }
                }
                if (overlaps) continue;

                allSlots.push({
                    date: dateStr,
                    time_start: time,
                    time_end: endTime,
                    technician_id: tech.id,
                    technician_name: tech.full_name
                });

                const busySet = busyMap.get(busyKey) || new Set();
                busySet.add(time);
                busyMap.set(busyKey, busySet);
            }
        }
        techIndex = (techIndex + 1) % activeTechs.length;
    }

    // 6. REGLA DE ORO: cuántas opciones ofrecer según huecos libres totales
    const totalFree = allSlots.length;
    let slotsToOffer: number;
    if (totalFree < 5) slotsToOffer = 1;
    else if (totalFree < 8) slotsToOffer = 2;
    else slotsToOffer = Math.min(3, totalFree);

    const capped = Math.min(slotsToOffer, slots_count);
    console.log(`[Autopilot] Total free slots: ${totalFree} → offering ${capped} (rule: ${slotsToOffer}, config max: ${slots_count})`);
    return allSlots.slice(0, capped);
}

// ═══════════════════════════════════════════════════════════════
// HELPER: Send WhatsApp slot proposal
// ═══════════════════════════════════════════════════════════════
async function sendWhatsAppSlotProposal(
    supabase: any,
    ticket: any,
    slots: SlotProposal[],
    timeoutMinutes: number
) {
    const formatDate = (dateStr: string) => {
        const date = new Date(dateStr);
        const days = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
        const day = days[date.getDay()];
        return `${day} ${date.getDate()}/${date.getMonth() + 1}`;
    };

    let message = `📅 *Citas disponibles para tu servicio #${ticket.id}*\n\n`;
    message += `Elige una opción respondiendo con el número:\n\n`;

    slots.forEach((slot, i) => {
        message += `*${i + 1}.* ${formatDate(slot.date)} de ${slot.time_start} a ${slot.time_end}\n`;
        message += `    👨‍🔧 ${slot.technician_name}\n\n`;
    });

    message += `⏰ _Tienes ${timeoutMinutes} minutos para elegir_`;

    // Call the send-whatsapp function
    try {
        const { data, error } = await supabase.functions.invoke('send-whatsapp', {
            body: {
                to: ticket.client_phone,
                message: message
            }
        });

        if (error) {
            console.error('[Autopilot] WhatsApp send error:', error);
        } else {
            console.log('[Autopilot] WhatsApp sent successfully');
        }
    } catch (e) {
        console.error('[Autopilot] WhatsApp invoke error:', e);
    }
}
