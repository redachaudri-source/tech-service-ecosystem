/**
 * WhatsApp Provider - Twilio Implementation
 * 
 * This file handles WhatsApp messaging via Twilio API through Supabase Edge Function.
 * To migrate to Meta WhatsApp Cloud API in the future:
 *   1. Create whatsappMeta.js with the new implementation
 *   2. Change the import in index.js
 */

import { supabase } from '../../lib/supabase';

const EDGE_FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-whatsapp`;

/**
 * Send WhatsApp message via Twilio (through Supabase Edge Function)
 * 
 * @param {string} to - Phone number with country code (+34612345678)
 * @param {string} message - Text message to send
 * @param {string} mediaUrl - Optional URL of PDF/image to attach
 * @returns {Promise<{success: boolean, messageId?: string, error?: string}>}
 */
export const sendWhatsAppMessage = async (to, message, mediaUrl = null) => {
    try {
        // Get current session for auth
        const { data: { session } } = await supabase.auth.getSession();

        if (!session) {
            throw new Error('No active session. Please log in.');
        }

        // Normalize phone number
        let phone = to.replace(/\s/g, '');
        if (!phone.startsWith('+')) {
            // Assume Spanish number if no country code
            phone = `+34${phone.replace(/^0+/, '')}`;
        }

        const response = await fetch(EDGE_FUNCTION_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({
                to: phone,
                message: message,
                mediaUrl: mediaUrl,
            }),
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || `HTTP ${response.status}`);
        }

        return {
            success: true,
            messageId: result.messageId,
            provider: result.provider || 'twilio',
        };

    } catch (error) {
        console.error('[WhatsApp Provider] Error:', error);
        return {
            success: false,
            error: error.message || 'Error enviando WhatsApp',
        };
    }
};

/**
 * Format message for WhatsApp with PDF link
 * WhatsApp handles media URLs automatically, but we include a fallback text link
 */
export const formatWhatsAppMessage = (documentName, ticketNumber, customMessage = '') => {
    const greeting = '¡Hola! 👋';
    const intro = `Te enviamos el documento "${documentName}" del servicio #${ticketNumber}.`;
    const custom = customMessage ? `\n\n${customMessage}` : '';
    const footer = '\n\n📄 El documento está adjunto a este mensaje.';
    const signature = '\n\n— Fixarr Servicio Técnico';

    return `${greeting}\n\n${intro}${custom}${footer}${signature}`;
};
