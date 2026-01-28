// Supabase Edge Function: notify-departure
// Sends WhatsApp notification when technician changes status to "en_camino"
// Uses Mapbox Directions API for ETA calculation

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'

// Environment variables
const META_TOKEN = Deno.env.get('META_WHATSAPP_TOKEN');
const META_PHONE_NUMBER_ID = Deno.env.get('META_PHONE_NUMBER_ID');
const MAPBOX_TOKEN = Deno.env.get('MAPBOX_TOKEN');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface DepartureRequest {
    ticket_id: string;
    tech_latitude?: number;
    tech_longitude?: number;
}

/**
 * Calculate ETA using Mapbox Directions API
 */
async function calculateETA(
    techCoords: { lat: number; lng: number },
    clientCoords: { lat: number; lng: number }
): Promise<number | null> {
    if (!MAPBOX_TOKEN) {
        console.warn('[notify-departure] MAPBOX_TOKEN not configured, using fallback ETA');
        return null;
    }

    try {
        // Mapbox expects: lng,lat format
        const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${techCoords.lng},${techCoords.lat};${clientCoords.lng},${clientCoords.lat}?access_token=${MAPBOX_TOKEN}`;

        const response = await fetch(url);
        const data = await response.json();

        if (!data.routes || data.routes.length === 0) {
            console.warn('[notify-departure] No route found from Mapbox');
            return null;
        }

        const durationSeconds = data.routes[0].duration;
        const etaMinutes = Math.round(durationSeconds / 60);

        console.log(`[notify-departure] Mapbox ETA calculated: ${etaMinutes} minutes`);
        return etaMinutes;
    } catch (error) {
        console.error('[notify-departure] Mapbox API error:', error);
        return null;
    }
}

/**
 * Normalize phone number for Meta API
 */
function normalizePhoneForMeta(phone: string): string {
    return phone.replace(/[^\d]/g, '');
}

/**
 * Send text message via Meta WhatsApp Cloud API
 */
async function sendWhatsApp(to: string, message: string): Promise<boolean> {
    const toNumber = normalizePhoneForMeta(to);

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
        console.error('[notify-departure] WhatsApp API error:', result);
        return false;
    }

    console.log('[notify-departure] WhatsApp sent:', result.messages?.[0]?.id);
    return true;
}

serve(async (req: Request) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        // Validate credentials
        if (!META_TOKEN || !META_PHONE_NUMBER_ID) {
            throw new Error('Missing Meta credentials.');
        }
        if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
            throw new Error('Missing Supabase credentials.');
        }

        // Parse request
        const { ticket_id, tech_latitude, tech_longitude }: DepartureRequest = await req.json();

        if (!ticket_id) {
            throw new Error('Missing required field: ticket_id');
        }

        console.log(`[notify-departure] Processing ticket: ${ticket_id}`);

        // Initialize Supabase client
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

        // 1. Fetch ticket with client and technician data
        const { data: ticket, error: ticketError } = await supabase
            .from('tickets')
            .select(`
                id,
                ticket_number,
                status,
                departure_notification_sent,
                appliance_info,
                technician_id,
                client_id,
                client:profiles!tickets_client_id_fkey(
                    id,
                    full_name,
                    phone,
                    address,
                    latitude,
                    longitude
                ),
                technician:profiles!tickets_technician_id_fkey(
                    id,
                    full_name,
                    latitude,
                    longitude
                )
            `)
            .eq('id', ticket_id)
            .single();

        if (ticketError || !ticket) {
            throw new Error(`Ticket not found: ${ticket_id}`);
        }

        // 2. Check if already notified
        if (ticket.departure_notification_sent) {
            console.log('[notify-departure] Already notified, skipping');
            return new Response(
                JSON.stringify({ success: true, skipped: true, reason: 'already_notified' }),
                { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // 3. Validate client phone
        const clientPhone = ticket.client?.phone;
        if (!clientPhone) {
            throw new Error('Client phone not found');
        }

        // 4. Calculate ETA if coordinates available
        let etaMinutes: number | null = null;

        // Use provided tech coordinates or saved profile coordinates
        const techLat = tech_latitude || ticket.technician?.latitude;
        const techLng = tech_longitude || ticket.technician?.longitude;
        const clientLat = ticket.client?.latitude;
        const clientLng = ticket.client?.longitude;

        if (techLat && techLng && clientLat && clientLng) {
            etaMinutes = await calculateETA(
                { lat: techLat, lng: techLng },
                { lat: clientLat, lng: clientLng }
            );
        }

        // 5. Build message
        const clientName = ticket.client?.full_name?.split(' ')[0] || 'Cliente';
        const techName = ticket.technician?.full_name || 'nuestro técnico';
        const applianceType = ticket.appliance_info?.type || 'tu electrodoméstico';

        const etaText = etaMinutes
            ? `en aproximadamente ${etaMinutes} minutos`
            : 'en breve';

        const message = `Hola ${clientName},

🚗 Buenas noticias: tu técnico está en camino y llegará ${etaText}.

Servicio: ${applianceType}
Técnico: ${techName}

Gracias por confiar en FIXARR. 🔧`;

        console.log(`[notify-departure] Sending to: ${clientPhone}`);

        // 6. Send WhatsApp
        const sent = await sendWhatsApp(clientPhone, message);

        if (!sent) {
            throw new Error('Failed to send WhatsApp notification');
        }

        // 7. Mark as notified
        const { error: updateError } = await supabase
            .from('tickets')
            .update({ departure_notification_sent: true })
            .eq('id', ticket_id);

        if (updateError) {
            console.error('[notify-departure] Failed to update flag:', updateError);
            // Don't throw - notification was sent successfully
        }

        console.log(`[notify-departure] Success for ticket ${ticket.ticket_number}`);

        return new Response(
            JSON.stringify({
                success: true,
                ticket_number: ticket.ticket_number,
                eta_minutes: etaMinutes,
                message_sent: true
            }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

    } catch (error: any) {
        console.error('[notify-departure] Error:', error.message);

        return new Response(
            JSON.stringify({ success: false, error: error.message }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
