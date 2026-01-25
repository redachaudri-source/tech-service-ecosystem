/**
 * SendPdfModal - Modal for sending documents via WhatsApp and/or Email
 * 
 * Features:
 *   - Privacy masking for phone/email
 *   - Multi-channel delivery (WhatsApp, Email, or both)
 *   - Alternative phone number input
 *   - Custom message support
 *   - Loading/success/error states
 *   - Saves tracking to database
 */

import React, { useState, useEffect } from 'react';
import { X, MessageCircle, Mail, Send, Loader2, CheckCircle, AlertCircle, FileText, Eye, Phone } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { sendWhatsApp, sendEmail, sendBoth } from '../services/messaging';
import { formatWhatsAppMessage } from '../services/messaging/whatsappProvider';
import { generateEmailSubject, formatEmailMessage } from '../services/messaging/emailProvider';

/**
 * Mask phone number for privacy display
 */
const maskPhone = (phone) => {
    if (!phone) return null;
    const clean = phone.replace(/\s/g, '');
    if (clean.length < 6) return clean;
    const start = clean.slice(0, 3);
    const end = clean.slice(-4);
    return `${start}***${end}`;
};

/**
 * Mask email for privacy display
 */
const maskEmail = (email) => {
    if (!email) return null;
    const [local, domain] = email.split('@');
    if (!domain) return email;
    return `${local.charAt(0)}***@${domain}`;
};

const SendPdfModal = ({
    isOpen,
    onClose,
    pdfUrl,
    pdfName,
    clientPhone,
    clientEmail,
    ticketNumber,
    ticketId, // NEW: for DB tracking
    onSuccess
}) => {
    // Channel selection
    const [sendViaWhatsApp, setSendViaWhatsApp] = useState(!!clientPhone);
    const [sendViaEmail, setSendViaEmail] = useState(!!clientEmail);

    // Phone mode: 'client' = use client phone, 'alternative' = manual input
    const [phoneMode, setPhoneMode] = useState('client');
    const [alternativePhone, setAlternativePhone] = useState('');

    // Custom message
    const [customMessage, setCustomMessage] = useState('');

    // Status management
    const [status, setStatus] = useState('idle');
    const [results, setResults] = useState({ whatsapp: null, email: null });
    const [errorMessage, setErrorMessage] = useState('');

    // Reset state when modal opens
    useEffect(() => {
        if (isOpen) {
            setStatus('idle');
            setResults({ whatsapp: null, email: null });
            setErrorMessage('');
            setCustomMessage('');
            setSendViaWhatsApp(!!clientPhone);
            setSendViaEmail(!!clientEmail);
            setPhoneMode('client');
            setAlternativePhone('');
        }
    }, [isOpen, clientPhone, clientEmail]);

    // Get the actual phone to use
    const getPhoneToUse = () => {
        if (phoneMode === 'alternative' && alternativePhone.trim()) {
            let phone = alternativePhone.trim();
            if (!phone.startsWith('+')) {
                phone = `+34${phone.replace(/^0+/, '')}`;
            }
            return phone;
        }
        return clientPhone;
    };

    const handleSend = async () => {
        const phoneToUse = getPhoneToUse();

        if (!sendViaWhatsApp && !sendViaEmail) {
            setErrorMessage('Selecciona al menos un canal de envío');
            return;
        }

        if (sendViaWhatsApp && !phoneToUse) {
            setErrorMessage('Introduce un número de teléfono válido');
            return;
        }

        setStatus('loading');
        setErrorMessage('');

        try {
            const whatsappMessage = formatWhatsAppMessage(pdfName, ticketNumber, customMessage);
            const emailSubject = generateEmailSubject(pdfName, ticketNumber);
            const emailMessage = formatEmailMessage(pdfName, ticketNumber, customMessage);

            let whatsappResult = { success: false };
            let emailResult = { success: false };

            if (sendViaWhatsApp && sendViaEmail) {
                const bothResults = await sendBoth({
                    phone: phoneToUse,
                    email: clientEmail,
                    message: whatsappMessage,
                    pdfUrl: pdfUrl,
                    pdfName: pdfName,
                    subject: emailSubject
                });
                whatsappResult = bothResults.whatsapp;
                emailResult = bothResults.email;
            } else if (sendViaWhatsApp) {
                whatsappResult = await sendWhatsApp(phoneToUse, whatsappMessage, pdfUrl);
            } else if (sendViaEmail) {
                emailResult = await sendEmail(clientEmail, emailSubject, emailMessage, pdfUrl, pdfName);
            }

            setResults({ whatsapp: whatsappResult, email: emailResult });

            // Determine overall status
            const whatsappOk = !sendViaWhatsApp || whatsappResult.success;
            const emailOk = !sendViaEmail || emailResult.success;

            if (whatsappOk && emailOk) {
                setStatus('success');

                // Save to database
                if (ticketId) {
                    const sentVia = sendViaWhatsApp && sendViaEmail ? 'both'
                        : sendViaWhatsApp ? 'whatsapp' : 'email';
                    const sentTo = sendViaWhatsApp ? phoneToUse : clientEmail;

                    await supabase.from('tickets').update({
                        pdf_sent_at: new Date().toISOString(),
                        pdf_sent_via: sentVia,
                        pdf_sent_to: sentTo
                    }).eq('id', ticketId);
                }

                if (onSuccess) onSuccess({ whatsapp: whatsappResult, email: emailResult });
            } else if (whatsappOk || emailOk) {
                setStatus('partial');
                const failedChannel = !whatsappOk ? 'WhatsApp' : 'Email';
                const errorDetail = !whatsappOk ? whatsappResult.error : emailResult.error;
                setErrorMessage(`El envío por ${failedChannel} falló: ${errorDetail}`);
            } else {
                setStatus('error');
                const errorDetail = whatsappResult.error || emailResult.error;
                setErrorMessage(`Error al enviar: ${errorDetail}`);
            }

        } catch (error) {
            console.error('SendPdfModal error:', error);
            setStatus('error');
            setErrorMessage(error.message || 'Error inesperado al enviar');
        }
    };

    const handleClose = () => {
        setStatus('idle');
        onClose();
    };

    if (!isOpen) return null;

    const phoneToUse = getPhoneToUse();
    const hasEmail = !!clientEmail;
    const canSendWhatsApp = phoneMode === 'client' ? !!clientPhone : !!alternativePhone.trim();
    const canSend = (sendViaWhatsApp && canSendWhatsApp) || (sendViaEmail && hasEmail);

    return (
        <div
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[9999] flex items-center justify-center p-3"
            onClick={handleClose}
        >
            <div
                className="bg-white rounded-xl shadow-2xl w-full max-w-sm max-h-[85vh] flex flex-col overflow-hidden"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-3 flex justify-between items-center flex-shrink-0">
                    <div className="flex items-center gap-2">
                        <Send size={18} className="text-white" />
                        <h2 className="text-white font-bold">Enviar Documento</h2>
                    </div>
                    <button
                        onClick={handleClose}
                        className="p-1.5 bg-white/20 hover:bg-white/30 rounded-full transition"
                        title="Cerrar"
                    >
                        <X size={18} className="text-white" />
                    </button>
                </div>

                {/* Content - Scrollable */}
                <div className="p-4 space-y-3 overflow-y-auto flex-1">

                    {/* Document Info - Compact */}
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 flex items-center gap-2">
                        <FileText size={20} className="text-blue-600 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-slate-800 truncate">{pdfName || 'Documento.pdf'}</p>
                            {ticketNumber && <p className="text-xs text-slate-400">#{ticketNumber}</p>}
                        </div>
                        <a href={pdfUrl} target="_blank" rel="noopener noreferrer"
                            className="p-1.5 bg-white border rounded hover:bg-slate-50" title="Ver PDF">
                            <Eye size={14} className="text-slate-600" />
                        </a>
                    </div>

                    {/* WhatsApp Option */}
                    <div className="space-y-2">
                        <label className={`flex items-center gap-3 p-3 rounded-lg border-2 transition cursor-pointer ${sendViaWhatsApp && canSendWhatsApp
                                ? 'border-green-500 bg-green-50'
                                : 'border-slate-200 bg-white hover:border-green-300'
                            }`}>
                            <input
                                type="checkbox"
                                checked={sendViaWhatsApp}
                                onChange={(e) => setSendViaWhatsApp(e.target.checked)}
                                disabled={status === 'loading'}
                                className="w-4 h-4 rounded text-green-600"
                            />
                            <MessageCircle size={18} className="text-green-600" />
                            <span className="font-bold text-sm">WhatsApp</span>
                            {results.whatsapp?.success && <CheckCircle size={16} className="text-green-500 ml-auto" />}
                            {results.whatsapp?.error && <AlertCircle size={16} className="text-red-500 ml-auto" />}
                        </label>

                        {/* Phone Selection */}
                        {sendViaWhatsApp && (
                            <div className="ml-6 space-y-2 text-sm">
                                {/* Client phone option */}
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="radio"
                                        name="phoneMode"
                                        checked={phoneMode === 'client'}
                                        onChange={() => setPhoneMode('client')}
                                        disabled={!clientPhone || status === 'loading'}
                                        className="text-green-600"
                                    />
                                    <span className={!clientPhone ? 'text-slate-400' : ''}>
                                        Tel. cliente: {clientPhone ? maskPhone(clientPhone) : 'No registrado'}
                                    </span>
                                </label>

                                {/* Alternative phone option */}
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="radio"
                                        name="phoneMode"
                                        checked={phoneMode === 'alternative'}
                                        onChange={() => setPhoneMode('alternative')}
                                        disabled={status === 'loading'}
                                        className="text-green-600"
                                    />
                                    <span>Otro número:</span>
                                </label>

                                {phoneMode === 'alternative' && (
                                    <div className="flex items-center gap-2 ml-5">
                                        <Phone size={14} className="text-slate-400" />
                                        <input
                                            type="tel"
                                            value={alternativePhone}
                                            onChange={(e) => setAlternativePhone(e.target.value)}
                                            placeholder="+34 612 345 678"
                                            className="flex-1 p-2 border rounded-lg text-sm focus:ring-2 focus:ring-green-500 outline-none"
                                            disabled={status === 'loading'}
                                        />
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Email Option */}
                    <label className={`flex items-center gap-3 p-3 rounded-lg border-2 transition cursor-pointer ${sendViaEmail && hasEmail
                            ? 'border-blue-500 bg-blue-50'
                            : hasEmail
                                ? 'border-slate-200 bg-white hover:border-blue-300'
                                : 'border-slate-100 bg-slate-50 cursor-not-allowed opacity-60'
                        }`}>
                        <input
                            type="checkbox"
                            checked={sendViaEmail && hasEmail}
                            onChange={(e) => setSendViaEmail(e.target.checked)}
                            disabled={!hasEmail || status === 'loading'}
                            className="w-4 h-4 rounded text-blue-600"
                        />
                        <Mail size={18} className="text-blue-600" />
                        <div className="flex-1">
                            <span className="font-bold text-sm">Email</span>
                            <p className="text-xs text-slate-500">
                                {hasEmail ? maskEmail(clientEmail) : 'No registrado'}
                            </p>
                        </div>
                        {results.email?.success && <CheckCircle size={16} className="text-green-500" />}
                        {results.email?.error && <AlertCircle size={16} className="text-red-500" />}
                    </label>

                    {/* Custom Message - Collapsible */}
                    <details className="text-sm">
                        <summary className="cursor-pointer font-medium text-slate-600 hover:text-slate-800">
                            ➕ Añadir mensaje personalizado
                        </summary>
                        <textarea
                            value={customMessage}
                            onChange={(e) => setCustomMessage(e.target.value)}
                            placeholder="Mensaje adicional para el cliente..."
                            className="mt-2 w-full p-2 border rounded-lg text-sm resize-none focus:ring-2 focus:ring-blue-500 outline-none"
                            rows={2}
                            disabled={status === 'loading'}
                        />
                    </details>

                    {/* Error Message */}
                    {errorMessage && (
                        <div className="flex items-start gap-2 p-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                            <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
                            <span>{errorMessage}</span>
                        </div>
                    )}

                    {/* Success Message */}
                    {status === 'success' && (
                        <div className="flex items-center gap-2 p-2 bg-green-50 border border-green-200 rounded-lg text-xs text-green-700">
                            <CheckCircle size={14} />
                            <span className="font-medium">¡Enviado correctamente!</span>
                        </div>
                    )}
                </div>

                {/* Footer - Fixed */}
                <div className="px-4 py-3 bg-slate-50 border-t flex gap-2 flex-shrink-0">
                    <button
                        onClick={handleClose}
                        disabled={status === 'loading'}
                        className="flex-1 py-2.5 px-3 bg-white border border-slate-200 text-slate-600 rounded-lg font-bold text-sm hover:bg-slate-50 transition disabled:opacity-50"
                    >
                        {status === 'success' ? 'Cerrar' : 'Omitir'}
                    </button>

                    {status !== 'success' && (
                        <button
                            onClick={handleSend}
                            disabled={!canSend || status === 'loading'}
                            className="flex-1 py-2.5 px-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg font-bold text-sm hover:from-blue-700 hover:to-indigo-700 transition shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                            {status === 'loading' ? (
                                <>
                                    <Loader2 size={16} className="animate-spin" />
                                    Enviando...
                                </>
                            ) : status === 'partial' || status === 'error' ? (
                                <>
                                    <Send size={16} />
                                    Reintentar
                                </>
                            ) : (
                                <>
                                    <Send size={16} />
                                    Enviar
                                </>
                            )}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default SendPdfModal;
