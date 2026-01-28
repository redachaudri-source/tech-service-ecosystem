// Supabase Edge Function: send-reminders
// Cron job that sends 24h reminders for scheduled services
// Run hourly: supabase functions schedule send-reminders --schedule "0 * * * *"

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Environment variables
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const META_TOKEN = Deno.env.get('META_WHATSAPP_TOKEN');
const META_PHONE_NUMBER_ID = Deno.env.get('META_PHONE_NUMBER_ID');

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Format date for Spanish locale
function formatDate(date: Date): string {
    return date.toLocaleDateString('es-ES', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    });
}

// Format time
function formatTime(date: Date): string {
    return date.toLocaleTimeString('es-ES', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Europe/Madrid'
    });
}

// Send WhatsApp message
async function sendWhatsAppMessage(to: string, message: string): Promise<boolean> {
    if (!META_TOKEN || !META_PHONE_NUMBER_ID) {
        console.error('[send-reminders] Missing WhatsApp credentials');
        return false;
    }

    // Normalize phone (remove + and spaces)
    const toNumber = to.replace(/[^\d]/g, '');

    try {
        const response = await fetch(
            `https://graph.facebook.com/v17.0/${META_PHONE_NUMBER_ID}/messages`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${META_TOKEN}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    messaging_product: 'whatsapp',
                    to: toNumber,
                    type: 'text',
                    text: { body: message }
                })
            }
        );

        const result = await response.json();

        if (!response.ok) {
            console.error('[send-reminders] WhatsApp API error:', result);
            return false;
        }

        console.log('[send-reminders] Message sent:', result.messages?.[0]?.id);
        return true;
    } catch (error) {
        console.error('[send-reminders] Send error:', error);
        return false;
    }
}

serve(async (req: Request) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    try {
        console.log('[send-reminders] Starting 24h reminder check...');

        // Calculate time window: ~24 hours from now (with 1 hour tolerance)
        const now = new Date();
        const tomorrow = new Date(now);
        tomorrow.setHours(tomorrow.getHours() + 24);

        // Window: 23h to 25h from now
        const windowStart = new Date(now);
        windowStart.setHours(windowStart.getHours() + 23);
        const windowEnd = new Date(now);
        windowEnd.setHours(windowEnd.getHours() + 25);

        console.log(`[send-reminders] Checking window: ${windowStart.toISOString()} to ${windowEnd.toISOString()}`);

        // Query tickets needing reminder
        const { data: tickets, error: queryError } = await supabase
            .from('tickets')
            .select(`
                id,
                ticket_number,
                scheduled_at,
                reminder_sent,
                appliance_info,
                client:profiles!client_id (
                    id,
                    full_name,
                    phone,
                    address
                ),
                technician:profiles!technician_id (
                    id,
                    full_name,
                    phone
                )
            `)
            .in('status', ['asignado', 'en_ruta', 'confirmado'])
            .gte('scheduled_at', windowStart.toISOString())
            .lte('scheduled_at', windowEnd.toISOString())
            .or('reminder_sent.is.null,reminder_sent.eq.false');

        if (queryError) {
            throw new Error(`Query error: ${queryError.message}`);
        }

        console.log(`[send-reminders] Found ${tickets?.length || 0} tickets needing reminders`);

        const results = {
            total: tickets?.length || 0,
            sent: 0,
            failed: 0,
            skipped: 0
        };

        // Process each ticket
        for (const ticket of (tickets || [])) {
            const clientPhone = ticket.client?.phone;

            if (!clientPhone) {
                console.log(`[send-reminders] Ticket #${ticket.ticket_number}: No client phone, skipping`);
                results.skipped++;
                continue;
            }

            const scheduledDate = new Date(ticket.scheduled_at);
            const clientName = ticket.client?.full_name?.split(' ')[0] || '';
            const techName = ticket.technician?.full_name || 'Por confirmar';
            const techPhone = ticket.technician?.phone || '';
            const address = ticket.client?.address || 'Por confirmar';
            const applianceType = ticket.appliance_info?.type || '';

            const message = `⏰ Recordatorio de Servicio

¡Hola${clientName ? ` ${clientName}` : ''}!

Mañana tienes programado el servicio de reparación:

📅 ${formatDate(scheduledDate)} a las ${formatTime(scheduledDate)}
🔧 Técnico: ${techName}${techPhone ? `\n📱 ${techPhone}` : ''}
📍 Dirección: ${address}${applianceType ? `\n⚙️ Equipo: ${applianceType}` : ''}

Te esperamos mañana. Si necesitas cambios, contáctanos.

Servicio #${ticket.ticket_number}`;

            const sent = await sendWhatsAppMessage(clientPhone, message);

            if (sent) {
                // Mark as reminder sent
                await supabase
                    .from('tickets')
                    .update({ reminder_sent: true })
                    .eq('id', ticket.id);

                results.sent++;
                console.log(`[send-reminders] ✅ Ticket #${ticket.ticket_number}: Reminder sent to ${clientPhone}`);
            } else {
                results.failed++;
                console.log(`[send-reminders] ❌ Ticket #${ticket.ticket_number}: Failed to send reminder`);
            }

            // Rate limit: small delay between messages
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        console.log('[send-reminders] Completed:', results);

        return new Response(
            JSON.stringify({
                success: true,
                ...results,
                timestamp: new Date().toISOString()
            }),
            {
                status: 200,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            }
        );

    } catch (error: any) {
        console.error('[send-reminders] Error:', error.message);

        return new Response(
            JSON.stringify({
                success: false,
                error: error.message
            }),
            {
                status: 500,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            }
        );
    }
});
