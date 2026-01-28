/**
 * WhatsApp Notification Service
 * Sends automated notifications to clients via WhatsApp
 */

import { supabase } from '../lib/supabase';

/**
 * Format date for Spanish locale
 * @param {string|Date} date - ISO date string or Date object
 * @returns {string} Formatted date like "28 de enero de 2026"
 */
const formatDate = (date) => {
    const d = new Date(date);
    return d.toLocaleDateString('es-ES', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    });
};

/**
 * Format time for Spanish locale
 * @param {string|Date} date - ISO date string or Date object
 * @returns {string} Formatted time like "10:00"
 */
const formatTime = (date) => {
    const d = new Date(date);
    return d.toLocaleTimeString('es-ES', {
        hour: '2-digit',
        minute: '2-digit'
    });
};

/**
 * Send WhatsApp notification when technician is assigned to a service
 * 
 * @param {Object} params - Notification parameters
 * @param {string} params.clientPhone - Client phone number (+34...)
 * @param {string} params.clientName - Client name
 * @param {string} params.technicianName - Technician name
 * @param {string} params.technicianPhone - Technician phone (optional)
 * @param {string} params.scheduledAt - ISO date string of scheduled appointment
 * @param {string} params.address - Service address
 * @param {string|number} params.ticketNumber - Ticket number
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function notifyClientAssignment({
    clientPhone,
    clientName,
    technicianName,
    technicianPhone,
    scheduledAt,
    address,
    ticketNumber
}) {
    // Validate required fields
    if (!clientPhone) {
        console.warn('[notifyClient] Missing client phone, skipping notification');
        return { success: false, error: 'Missing client phone' };
    }

    // Build the message
    const message = `🔧 ¡Tu servicio ha sido asignado!

Técnico: ${technicianName || 'Por confirmar'}
📅 Fecha: ${formatDate(scheduledAt)}
🕐 Hora: ${formatTime(scheduledAt)}
📍 Dirección: ${address || 'Por confirmar'}

El técnico se pondrá en contacto contigo para confirmar.

Servicio #${ticketNumber}`;

    try {
        console.log(`[notifyClient] Sending assignment notification to ${clientPhone}`);

        const { data, error } = await supabase.functions.invoke('send-whatsapp', {
            body: {
                to: clientPhone,
                message
            }
        });

        if (error) {
            console.error('[notifyClient] Error sending notification:', error);
            return { success: false, error: error.message };
        }

        console.log('[notifyClient] Notification sent successfully:', data);
        return { success: true, messageId: data?.messageId };
    } catch (err) {
        console.error('[notifyClient] Exception:', err);
        return { success: false, error: err.message };
    }
}

/**
 * Send WhatsApp reminder 24h before appointment
 * 
 * @param {Object} params - Reminder parameters
 * @param {string} params.clientPhone - Client phone number
 * @param {string} params.clientName - Client name
 * @param {string} params.technicianName - Technician name
 * @param {string} params.technicianPhone - Technician phone
 * @param {string} params.scheduledAt - ISO date string
 * @param {string} params.address - Service address
 * @param {string} params.applianceType - Type of appliance
 * @param {string|number} params.ticketNumber - Ticket number
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function notifyClientReminder({
    clientPhone,
    clientName,
    technicianName,
    technicianPhone,
    scheduledAt,
    address,
    applianceType,
    ticketNumber
}) {
    if (!clientPhone) {
        console.warn('[notifyClient] Missing client phone, skipping reminder');
        return { success: false, error: 'Missing client phone' };
    }

    const message = `⏰ Recordatorio de Servicio

¡Hola${clientName ? ` ${clientName.split(' ')[0]}` : ''}!

Mañana tienes programado el servicio de reparación:

📅 ${formatDate(scheduledAt)} a las ${formatTime(scheduledAt)}
🔧 Técnico: ${technicianName || 'Por confirmar'}${technicianPhone ? `\n📱 ${technicianPhone}` : ''}
📍 Dirección: ${address || 'Por confirmar'}${applianceType ? `\n⚙️ Equipo: ${applianceType}` : ''}

Te esperamos mañana. Si necesitas cambios, contáctanos.

Servicio #${ticketNumber}`;

    try {
        console.log(`[notifyClient] Sending reminder to ${clientPhone}`);

        const { data, error } = await supabase.functions.invoke('send-whatsapp', {
            body: { to: clientPhone, message }
        });

        if (error) {
            console.error('[notifyClient] Reminder error:', error);
            return { success: false, error: error.message };
        }

        console.log('[notifyClient] Reminder sent successfully:', data);
        return { success: true, messageId: data?.messageId };
    } catch (err) {
        console.error('[notifyClient] Reminder exception:', err);
        return { success: false, error: err.message };
    }
}
