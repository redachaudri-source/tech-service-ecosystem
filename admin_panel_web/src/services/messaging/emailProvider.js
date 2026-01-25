/**
 * Email Provider - Resend Implementation
 * 
 * This file handles email delivery via Resend API through Supabase Edge Function.
 */

import { supabase } from '../../lib/supabase';

const EDGE_FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-email`;

/**
 * Send email via Resend (through Supabase Edge Function)
 * 
 * @param {string} to - Email address
 * @param {string} subject - Email subject
 * @param {string} message - Plain text message (will be converted to HTML if no html provided)
 * @param {string} attachmentUrl - Optional URL of PDF to attach
 * @param {string} attachmentName - Optional filename for the attachment
 * @returns {Promise<{success: boolean, messageId?: string, error?: string}>}
 */
export const sendEmailMessage = async (to, subject, message, attachmentUrl = null, attachmentName = null) => {
    try {
        // Get current session for auth
        const { data: { session } } = await supabase.auth.getSession();

        if (!session) {
            throw new Error('No active session. Please log in.');
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(to)) {
            throw new Error(`Formato de email inválido: ${to}`);
        }

        const response = await fetch(EDGE_FUNCTION_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({
                to: to,
                subject: subject,
                text: message, // Edge function will generate HTML from this
                attachmentUrl: attachmentUrl,
                attachmentName: attachmentName,
            }),
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || `HTTP ${response.status}`);
        }

        return {
            success: true,
            messageId: result.messageId,
        };

    } catch (error) {
        console.error('[Email Provider] Error:', error);
        return {
            success: false,
            error: error.message || 'Error enviando email',
        };
    }
};

/**
 * Generate email subject based on document type
 */
export const generateEmailSubject = (documentName, ticketNumber) => {
    // Detect document type and create appropriate subject
    const lowerName = documentName.toLowerCase();

    if (lowerName.includes('presupuesto') || lowerName.includes('quote')) {
        return `Presupuesto de Servicio Técnico #${ticketNumber}`;
    }
    if (lowerName.includes('garantía') || lowerName.includes('warranty')) {
        return `Certificado de Garantía - Servicio #${ticketNumber}`;
    }
    if (lowerName.includes('recibo') || lowerName.includes('receipt')) {
        return `Recibo de Pago - Servicio #${ticketNumber}`;
    }

    // Default: Parte de trabajo
    return `Parte de Trabajo - Servicio #${ticketNumber}`;
};

/**
 * Format default message for email
 */
export const formatEmailMessage = (documentName, ticketNumber, customMessage = '') => {
    const base = `Adjunto encontrarás el documento "${documentName}" correspondiente al servicio #${ticketNumber}.`;
    const custom = customMessage ? `\n\n${customMessage}` : '';

    return `${base}${custom}`;
};
