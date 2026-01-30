// ═══════════════════════════════════════════════════════════════════════════
// Supabase Edge Function: ticket-autopilot-processor
// Motor PRO: Procesa tickets con prioridad bifurcada y lock optimista
// ═══════════════════════════════════════════════════════════════════════════

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SlotFromRPC {
  technician_id: string;
  technician_name: string;
  slot_start: string;
  is_optimal_cp: boolean;
  efficiency_score: number;
}

interface ProposedSlot {
  option: number;
  date: string;
  time_start: string;
  time_end: string;
  technician_id: string;
  technician_name: string;
}

interface ProProposal {
  slots: ProposedSlot[];
  created_at: string;
  expires_at: string;
  status: string;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  try {
    const payload = await req.json().catch(() => ({}));
    const { mode, ticket_id } = payload;

    console.log('[PRO-Processor] Mode:', mode, 'Ticket ID:', ticket_id);

    // ═══════════════════════════════════════════════════════════════
    // MODO WEBHOOK: Procesar ticket específico
    // ═══════════════════════════════════════════════════════════════
    if (ticket_id) {
      const result = await procesarTicket(supabase, ticket_id);
      return new Response(JSON.stringify({ processed: ticket_id, result }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ═══════════════════════════════════════════════════════════════
    // MODO CRON: Buscar y procesar siguiente pendiente
    // ═══════════════════════════════════════════════════════════════
    if (mode === 'cron') {
      // 1. Limpiar locks antiguos (>5 min)
      await limpiarLocksAntiguos(supabase);

      // 2. Buscar tickets con prioridad bifurcada
      const tickets = await buscarTicketsPriorizados(supabase);

      if (tickets.length === 0) {
        return new Response(JSON.stringify({ message: 'No pending tickets' }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // 3. Procesar solo el primero
      const result = await procesarTicket(supabase, tickets[0].id);
      return new Response(JSON.stringify({ processed: tickets[0].id, result }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ═══════════════════════════════════════════════════════════════
    // MODO SCAN (compatibilidad con ticket-autopilot existente)
    // ═══════════════════════════════════════════════════════════════
    if (mode === 'scan') {
      await limpiarLocksAntiguos(supabase);
      const tickets = await buscarTicketsPriorizados(supabase);
      
      let processed = 0;
      for (const ticket of tickets.slice(0, 5)) {
        const result = await procesarTicket(supabase, ticket.id);
        if (result?.success) processed++;
      }

      return new Response(JSON.stringify({ processed, scanned: tickets.length }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ═══════════════════════════════════════════════════════════════
    // MODO TRIGGER: Procesar ticket desde trigger INSERT
    // ═══════════════════════════════════════════════════════════════
    if (payload?.record?.id && payload?.type === 'INSERT') {
      const ticketId = payload.record.id;
      const result = await procesarTicket(supabase, ticketId);
      return new Response(JSON.stringify({ processed: ticketId, result }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Invalid mode' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[PRO-Processor] Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// Limpiar locks antiguos (>5 minutos)
// ═══════════════════════════════════════════════════════════════════════════
async function limpiarLocksAntiguos(supabase: any) {
  const hace5min = new Date(Date.now() - 5 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('tickets')
    .update({ processing_started_at: null })
    .lt('processing_started_at', hace5min)
    .is('pro_proposal', null)
    .select('id');

  if (data && data.length > 0) {
    console.log(`[PRO-Processor] Cleaned ${data.length} stale locks`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Buscar tickets con prioridad bifurcada: Día DESC + Hora ASC
// ═══════════════════════════════════════════════════════════════════════════
async function buscarTicketsPriorizados(supabase: any) {
  const { data, error } = await supabase
    .from('tickets')
    .select('*')
    .eq('status', 'solicitado')
    .is('pro_proposal', null)
    .is('processing_started_at', null)
    .is('technician_id', null)
    .is('scheduled_at', null);

  if (error || !data) {
    console.error('[PRO-Processor] Error fetching tickets:', error);
    return [];
  }

  // Ordenar: Día más reciente primero, FIFO dentro del mismo día
  return data.sort((a: any, b: any) => {
    const diaA = a.created_at.split('T')[0];
    const diaB = b.created_at.split('T')[0];

    if (diaA !== diaB) {
      return diaB.localeCompare(diaA); // Día más reciente primero
    }

    return a.created_at.localeCompare(b.created_at); // FIFO dentro del día
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Procesar un ticket individual
// ═══════════════════════════════════════════════════════════════════════════
async function procesarTicket(supabase: any, ticketId: string) {
  try {
    // PASO 1: Verificar modo PRO activo
    const { data: modeConfig } = await supabase
      .from('business_config')
      .select('value')
      .eq('key', 'secretary_mode')
      .single();

    const secretaryMode = (modeConfig?.value ?? '').toString().toLowerCase().replace(/"/g, '');
    if (secretaryMode !== 'pro') {
      console.log('[PRO-Processor] PRO mode not active, skipping');
      return { skipped: 'mode_not_pro' };
    }

    // PASO 2: Lock optimista
    const { data: locked, error: lockError } = await supabase
      .from('tickets')
      .update({ processing_started_at: new Date().toISOString() })
      .eq('id', ticketId)
      .is('processing_started_at', null)
      .eq('status', 'solicitado')
      .is('pro_proposal', null)
      .select('*');

    if (lockError || !locked || locked.length === 0) {
      console.log('[PRO-Processor] Ticket already being processed or not eligible');
      return { skipped: 'already_processing' };
    }

    const ticket = locked[0];
    console.log(`[PRO-Processor] Locked ticket #${ticketId} for processing`);

    // PASO 3: Obtener configuración PRO
    const { data: proConfigData } = await supabase
      .from('business_config')
      .select('value')
      .eq('key', 'pro_config')
      .single();

    const proConfig = proConfigData?.value || { slots_count: 3, timeout_minutes: 3, search_days: 7 };

    // PASO 4: Buscar disponibilidad usando RPC (7 días)
    let slotsEncontrados: SlotFromRPC[] = [];
    const postalCode = ticket.postal_code || ticket.address_cp || null;

    for (let day = 1; day <= (proConfig.search_days || 7); day++) {
      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() + day);
      const dateStr = targetDate.toISOString().split('T')[0];

      const { data: slots, error: rpcError } = await supabase.rpc('get_tech_availability', {
        target_date: dateStr,
        duration_minutes: 120,
        target_cp: postalCode
      });

      if (rpcError) {
        console.error(`[PRO-Processor] RPC error for ${dateStr}:`, rpcError);
        continue;
      }

      if (slots && slots.length > 0) {
        slotsEncontrados = slots;
        console.log(`[PRO-Processor] Found ${slots.length} slots on ${dateStr}`);
        break;
      }
    }

    // PASO 5: Sin disponibilidad
    if (slotsEncontrados.length === 0) {
      console.log('[PRO-Processor] No availability found');
      await supabase
        .from('tickets')
        .update({
          pro_proposal: {
            status: 'no_slots',
            proposed_at: new Date().toISOString()
          },
          processing_started_at: null
        })
        .eq('id', ticketId);

      return { success: false, reason: 'no_availability' };
    }

    // PASO 6: Aplicar Regla de Oro
    const totalHuecos = slotsEncontrados.length;
    let cantidad: number;
    if (totalHuecos < 5) cantidad = 1;
    else if (totalHuecos < 8) cantidad = 2;
    else cantidad = 3;

    // Respetar config máximo
    cantidad = Math.min(cantidad, proConfig.slots_count || 3);

    console.log(`[PRO-Processor] Regla de Oro: ${totalHuecos} slots → offering ${cantidad}`);

    // PASO 7: Seleccionar slots según estrategia
    const seleccionados = await aplicarEstrategia(supabase, slotsEncontrados, cantidad);

    // PASO 8: Construir propuesta
    const timeoutMinutes = proConfig.timeout_minutes || 3;
    const propuesta: ProProposal = {
      slots: seleccionados.map((s: SlotFromRPC, i: number) => {
        const slotDate = new Date(s.slot_start);
        return {
          option: i + 1,
          date: slotDate.toISOString().split('T')[0],
          time_start: slotDate.toTimeString().slice(0, 5),
          time_end: new Date(slotDate.getTime() + 120 * 60 * 1000).toTimeString().slice(0, 5),
          technician_id: s.technician_id,
          technician_name: s.technician_name
        };
      }),
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + timeoutMinutes * 60 * 1000).toISOString(),
      status: 'waiting_selection'
    };

    // PASO 9: Guardar propuesta y liberar lock
    const { error: updateError } = await supabase
      .from('tickets')
      .update({
        pro_proposal: propuesta,
        processing_started_at: null // Liberar lock
      })
      .eq('id', ticketId);

    if (updateError) {
      console.error('[PRO-Processor] Error saving proposal:', updateError);
      await rollback(supabase, ticketId);
      return { success: false, error: updateError.message };
    }

    console.log(`[PRO-Processor] ✅ Ticket #${ticketId} processed successfully - ${cantidad} slots proposed`);

    // PASO 10: Enviar notificación WhatsApp si corresponde
    const originSource = ticket.origin_source || 'admin';
    if (originSource === 'whatsapp' && ticket.client_phone) {
      await enviarNotificacionWhatsApp(supabase, ticket, propuesta);
    }

    return { success: true, slotsProposed: cantidad };

  } catch (error) {
    console.error(`[PRO-Processor] Error processing ticket ${ticketId}:`, error);
    await rollback(supabase, ticketId);
    return { success: false, error: error.message };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Aplicar estrategia de selección de slots
// ═══════════════════════════════════════════════════════════════════════════
async function aplicarEstrategia(supabase: any, slots: SlotFromRPC[], cantidad: number): Promise<SlotFromRPC[]> {
  // Obtener estrategia configurada
  const { data: config } = await supabase
    .from('business_config')
    .select('value')
    .eq('key', 'pro_selection_strategy')
    .single();

  const estrategia = (config?.value ?? 'balanced').toString().replace(/"/g, '');
  console.log(`[PRO-Processor] Applying strategy: ${estrategia}`);

  const seleccionados: SlotFromRPC[] = [];

  // Slot 1: Siempre el primero (más cercano en tiempo)
  seleccionados.push(slots[0]);

  if (cantidad >= 2 && slots.length >= 2) {
    // Slot 2: Buscar variedad según estrategia
    let slot2: SlotFromRPC | undefined;

    if (estrategia === 'speed') {
      // Velocidad: simplemente el segundo
      slot2 = slots[1];
    } else if (estrategia === 'variety') {
      // Variedad: priorizar técnico diferente
      slot2 = slots.find((s, i) =>
        i > 0 && s.technician_id !== seleccionados[0].technician_id
      );
    } else {
      // Balanceado: tarde o técnico diferente
      slot2 = slots.find((s, i) => {
        if (i === 0) return false;
        const hour = new Date(s.slot_start).getHours();
        return hour >= 14 || s.technician_id !== seleccionados[0].technician_id;
      });
    }

    seleccionados.push(slot2 || slots[1]);
  }

  if (cantidad >= 3 && slots.length >= 3) {
    // Slot 3: Técnico diferente a los anteriores
    const techsUsados = seleccionados.map(s => s.technician_id);
    const slot3 = slots.find((s, i) =>
      i > 1 && !techsUsados.includes(s.technician_id)
    ) || slots.find((s, i) => i > 1 && !seleccionados.includes(s)) || slots[2];

    seleccionados.push(slot3);
  }

  return seleccionados;
}

// ═══════════════════════════════════════════════════════════════════════════
// Rollback: Liberar lock en caso de error
// ═══════════════════════════════════════════════════════════════════════════
async function rollback(supabase: any, ticketId: string) {
  await supabase
    .from('tickets')
    .update({ processing_started_at: null })
    .eq('id', ticketId);
}

// ═══════════════════════════════════════════════════════════════════════════
// Enviar notificación WhatsApp con propuesta de citas
// ═══════════════════════════════════════════════════════════════════════════
async function enviarNotificacionWhatsApp(supabase: any, ticket: any, propuesta: ProProposal) {
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const days = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    return `${days[date.getDay()]} ${date.getDate()}/${date.getMonth() + 1}`;
  };

  let message = `📅 *Citas disponibles para tu servicio #${ticket.id}*\n\n`;
  message += `Elige una opción respondiendo con el número:\n\n`;

  propuesta.slots.forEach((slot) => {
    message += `*${slot.option}.* ${formatDate(slot.date)} de ${slot.time_start} a ${slot.time_end}\n`;
    message += `    👨‍🔧 ${slot.technician_name}\n\n`;
  });

  message += `⏰ _Tienes 3 minutos para elegir_`;

  try {
    await supabase.functions.invoke('send-whatsapp', {
      body: {
        to: ticket.client_phone,
        message: message
      }
    });
    console.log('[PRO-Processor] WhatsApp notification sent');
  } catch (e) {
    console.error('[PRO-Processor] WhatsApp send error:', e);
  }
}
