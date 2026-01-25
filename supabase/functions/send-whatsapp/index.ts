// Supabase Edge Function: send-whatsapp
// Uses Meta Cloud API to send WhatsApp messages with optional media (PDF/documents)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

// Environment variables (set with `supabase secrets set`)
const META_TOKEN = Deno.env.get('META_WHATSAPP_TOKEN');
const META_PHONE_NUMBER_ID = Deno.env.get('META_PHONE_NUMBER_ID');

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface WhatsAppRequest {
    to: string;           // Phone number with country code: +34612345678
    message: string;      // Text message to send
    mediaUrl?: string;    // Optional: URL of PDF or image to attach
    mediaType?: 'document' | 'image'; // Type of media (default: document)
    filename?: string;    // Optional: filename for document
}

interface WhatsAppResponse {
    success: boolean;
    messageId?: string;
    provider: string;
    error?: string;
}

/**
 * Normalize phone number for Meta API (removes + and spaces)
 */
function normalizePhoneForMeta(phone: string): string {
    return phone.replace(/[^\d]/g, '');
}

/**
 * Send text message via Meta Cloud API
 */
async function sendTextMessage(to: string, message: string): Promise<any> {
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

    return { response, result: await response.json() };
}

/**
 * Send document (PDF) via Meta Cloud API
 */
async function sendDocument(to: string, caption: string, documentUrl: string, filename?: string): Promise<any> {
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
                type: 'document',
                document: {
                    link: documentUrl,
                    caption: caption,
                    filename: filename || 'documento.pdf'
                }
            })
        }
    );

    return { response, result: await response.json() };
}

/**
 * Send image via Meta Cloud API
 */
async function sendImage(to: string, caption: string, imageUrl: string): Promise<any> {
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
                type: 'image',
                image: {
                    link: imageUrl,
                    caption: caption
                }
            })
        }
    );

    return { response, result: await response.json() };
}

serve(async (req: Request) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        // Validate credentials
        if (!META_TOKEN || !META_PHONE_NUMBER_ID) {
            throw new Error('Missing Meta credentials. Set META_WHATSAPP_TOKEN and META_PHONE_NUMBER_ID.');
        }

        // Parse request body
        const { to, message, mediaUrl, mediaType, filename }: WhatsAppRequest = await req.json();

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

        console.log(`[send-whatsapp] Sending to ${to} via Meta Cloud API`);
        console.log(`[send-whatsapp] Message: "${message.substring(0, 50)}..."`);

        let apiResponse: any;
        let apiResult: any;

        // If media URL provided, send with media
        if (mediaUrl) {
            console.log(`[send-whatsapp] With media: ${mediaUrl}`);

            if (mediaType === 'image') {
                const { response, result } = await sendImage(to, message, mediaUrl);
                apiResponse = response;
                apiResult = result;
            } else {
                // Default to document (PDF)
                const { response, result } = await sendDocument(to, message, mediaUrl, filename);
                apiResponse = response;
                apiResult = result;
            }
        } else {
            // Text only
            const { response, result } = await sendTextMessage(to, message);
            apiResponse = response;
            apiResult = result;
        }

        // Log response
        console.log('[send-whatsapp] Meta API Response:', JSON.stringify(apiResult));

        if (!apiResponse.ok) {
            console.error('[send-whatsapp] Meta API Error:', JSON.stringify(apiResult));
            throw new Error(apiResult.error?.message || `Meta API error: ${apiResponse.status}`);
        }

        const messageId = apiResult.messages?.[0]?.id;
        console.log(`[send-whatsapp] Success: ${messageId}`);

        const result: WhatsAppResponse = {
            success: true,
            messageId: messageId,
            provider: 'meta'
        };

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
                provider: 'meta',
                error: error.message,
            }),
            {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            }
        );
    }
});
