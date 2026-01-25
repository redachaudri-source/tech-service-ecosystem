/**
 * Messaging Service - Main Exports
 * 
 * This is the entry point for all messaging functionality.
 * Abstracts the underlying providers (Twilio, Meta, Resend) for easy migration.
 * 
 * Usage:
 *   import { sendWhatsApp, sendEmail, sendBoth } from '../services/messaging';
 */

import { sendWhatsAppMessage } from './whatsappProvider';
import { sendEmailMessage } from './emailProvider';

// Re-export provider functions
export { sendWhatsAppMessage as sendWhatsApp } from './whatsappProvider';
export { sendEmailMessage as sendEmail } from './emailProvider';

/**
 * Send document via both WhatsApp and Email
 * Returns results for both channels
 */
export const sendBoth = async ({
    phone,
    email,
    message,
    pdfUrl,
    pdfName,
    subject
}) => {
    const results = {
        whatsapp: { success: false, error: null },
        email: { success: false, error: null }
    };

    // Send in parallel for speed
    const [whatsappResult, emailResult] = await Promise.allSettled([
        phone ? sendWhatsAppMessage(phone, message, pdfUrl) : Promise.resolve({ success: false, error: 'No phone provided' }),
        email ? sendEmailMessage(email, subject, message, pdfUrl, pdfName) : Promise.resolve({ success: false, error: 'No email provided' })
    ]);

    // Process WhatsApp result
    if (whatsappResult.status === 'fulfilled') {
        results.whatsapp = whatsappResult.value;
    } else {
        results.whatsapp = { success: false, error: whatsappResult.reason?.message || 'Unknown error' };
    }

    // Process Email result
    if (emailResult.status === 'fulfilled') {
        results.email = emailResult.value;
    } else {
        results.email = { success: false, error: emailResult.reason?.message || 'Unknown error' };
    }

    return results;
};

/**
 * Check if messaging services are available
 * (Edge functions are deployed and env vars are set)
 */
export const checkMessagingAvailability = async () => {
    // For now, we assume services are available if Supabase URL is set
    // In production, you could ping the edge functions
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    return {
        available: !!supabaseUrl,
        whatsapp: true,
        email: true
    };
};
