/**
 * WhatsApp Provider - Meta Cloud API (Placeholder)
 * 
 * This file will contain the Meta WhatsApp Cloud API implementation
 * when migrating from Twilio.
 * 
 * Migration steps:
 *   1. Implement the functions below using Meta's API
 *   2. Update the Edge Function or call Meta API directly
 *   3. Change the import in index.js from whatsappProvider to whatsappMeta
 * 
 * Meta WhatsApp Cloud API Documentation:
 * https://developers.facebook.com/docs/whatsapp/cloud-api/
 */

/**
 * PLACEHOLDER - Send WhatsApp message via Meta Cloud API
 * 
 * Required environment variables for Meta:
 *   - WHATSAPP_PHONE_NUMBER_ID
 *   - WHATSAPP_ACCESS_TOKEN
 *   - WHATSAPP_BUSINESS_ID
 * 
 * @param {string} to - Phone number with country code
 * @param {string} message - Text message to send
 * @param {string} mediaUrl - Optional URL of PDF/image to attach
 * @returns {Promise<{success: boolean, messageId?: string, error?: string}>}
 */
export const sendWhatsAppMessage = async (to, message, mediaUrl = null) => {
    // TODO: Implement Meta WhatsApp Cloud API
    console.warn('[WhatsApp Meta] Not implemented. Using Twilio provider.');

    throw new Error(
        'Meta WhatsApp Cloud API not yet implemented. ' +
        'Please use the Twilio provider (whatsappProvider.js) for now.'
    );

    /*
    Example Meta API call structure:
    
    const response = await fetch(
        `https://graph.facebook.com/v17.0/${PHONE_NUMBER_ID}/messages`,
        {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${ACCESS_TOKEN}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                messaging_product: 'whatsapp',
                to: to,
                type: mediaUrl ? 'document' : 'text',
                text: mediaUrl ? undefined : { body: message },
                document: mediaUrl ? { link: mediaUrl, caption: message } : undefined,
            }),
        }
    );
    
    return await response.json();
    */
};

/**
 * PLACEHOLDER - Format message for Meta WhatsApp
 */
export const formatWhatsAppMessage = (documentName, ticketNumber, customMessage = '') => {
    // Same format as Twilio version for consistency
    const greeting = '¡Hola! 👋';
    const intro = `Te enviamos el documento "${documentName}" del servicio #${ticketNumber}.`;
    const custom = customMessage ? `\n\n${customMessage}` : '';
    const footer = '\n\n📄 El documento está adjunto a este mensaje.';
    const signature = '\n\n— Fixarr Servicio Técnico';

    return `${greeting}\n\n${intro}${custom}${footer}${signature}`;
};
