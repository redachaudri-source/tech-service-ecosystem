// Supabase Edge Function: send-whatsapp
// Uses Twilio API to send WhatsApp messages with optional media (PDF)
// Prepared for future migration to WhatsApp Cloud API (Meta)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

// Environment variables (set with `supabase secrets set`)
const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID');
const TWILIO_AUTH_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN');
const TWILIO_WHATSAPP_NUMBER = Deno.env.get('TWILIO_WHATSAPP_NUMBER') || 'whatsapp:+14155238886';

// Provider flag for future migration
const WHATSAPP_PROVIDER = Deno.env.get('WHATSAPP_PROVIDER') || 'twilio'; // 'twilio' | 'meta'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface WhatsAppRequest {
    to: string;           // Phone number with country code: +34612345678
    message: string;      // Text message to send
    mediaUrl?: string;    // Optional: URL of PDF or image to attach
}

interface WhatsAppResponse {
    success: boolean;
    messageId?: string;
    provider: string;
    error?: string;
}

/**
 * Send WhatsApp message via Twilio
 */
async function sendViaTwilio(to: string, message: string, mediaUrl?: string): Promise<WhatsAppResponse> {
    if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
        throw new Error('Missing Twilio credentials. Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN.');
    }

    // Normalize phone number to WhatsApp format
    const toNumber = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;
    const fromNumber = TWILIO_WHATSAPP_NUMBER.startsWith('whatsapp:')
        ? TWILIO_WHATSAPP_NUMBER
        : `whatsapp:${TWILIO_WHATSAPP_NUMBER}`;

    // Build form data for Twilio API
    const formData = new URLSearchParams();
    formData.append('From', fromNumber);
    formData.append('To', toNumber);
    formData.append('Body', message);

    if (mediaUrl) {
        formData.append('MediaUrl', mediaUrl);
    }

    // Call Twilio Messages API
    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`;
    const authHeader = btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`);

    const response = await fetch(twilioUrl, {
        method: 'POST',
        headers: {
            'Authorization': `Basic ${authHeader}`,
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData.toString(),
    });

    const result = await response.json();

    if (!response.ok) {
        console.error('Twilio Error:', result);
        throw new Error(result.message || `Twilio API error: ${response.status}`);
    }

    return {
        success: true,
        messageId: result.sid,
        provider: 'twilio',
    };
}

/**
 * Placeholder for Meta WhatsApp Cloud API
 * To be implemented when migrating from Twilio
 */
async function sendViaMeta(_to: string, _message: string, _mediaUrl?: string): Promise<WhatsAppResponse> {
    // TODO: Implement Meta WhatsApp Cloud API
    // Documentation: https://developers.facebook.com/docs/whatsapp/cloud-api/
    throw new Error('Meta WhatsApp Cloud API not yet implemented. Set WHATSAPP_PROVIDER=twilio');
}

serve(async (req: Request) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        // Parse request body
        const { to, message, mediaUrl }: WhatsAppRequest = await req.json();

        // Validate required fields
        if (!to) {
            throw new Error('Missing required field: to (phone number)');
        }
        if (!message) {
            throw new Error('Missing required field: message');
        }

        // Validate phone number format (basic check)
        const phoneRegex = /^\+?[1-9]\d{6,14}$/;
        const cleanPhone = to.replace(/\s/g, '').replace('whatsapp:', '');
        if (!phoneRegex.test(cleanPhone)) {
            throw new Error(`Invalid phone number format: ${to}. Expected format: +34612345678`);
        }

        console.log(`[send-whatsapp] Sending to ${to} via ${WHATSAPP_PROVIDER}`);

        // Route to appropriate provider
        let result: WhatsAppResponse;

        if (WHATSAPP_PROVIDER === 'meta') {
            result = await sendViaMeta(to, message, mediaUrl);
        } else {
            result = await sendViaTwilio(to, message, mediaUrl);
        }

        console.log(`[send-whatsapp] Success: ${result.messageId}`);

        return new Response(
            JSON.stringify(result),
            {
                status: 200,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            }
        );

    } catch (error: any) {
        console.error('[send-whatsapp] Error:', error.message);

        return new Response(
            JSON.stringify({
                success: false,
                provider: WHATSAPP_PROVIDER,
                error: error.message,
            }),
            {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            }
        );
    }
});
