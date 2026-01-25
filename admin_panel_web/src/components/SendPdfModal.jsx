/**
 * SendPdfModal - Modal for sending documents via WhatsApp and/or Email
 * 
 * Opens automatically after PDF generation, allows user to choose delivery channels.
 * Features:
 *   - Privacy masking for phone/email
 *   - Multi-channel delivery (WhatsApp, Email, or both)
 *   - Custom message support
 *   - Loading/success/error states
 *   - Skip option
 */

import React, { useState, useEffect } from 'react';
import { X, MessageCircle, Mail, Send, Loader2, CheckCircle, AlertCircle, FileText, Eye, EyeOff } from 'lucide-react';
import { sendWhatsApp, sendEmail, sendBoth } from '../services/messaging';
import { formatWhatsAppMessage } from '../services/messaging/whatsappProvider';
import { generateEmailSubject, formatEmailMessage } from '../services/messaging/emailProvider';

/**
 * Mask phone number for privacy display
 * +34612345678 → +34***345678
 */
const maskPhone = (phone) => {
    if (!phone) return null;
    const clean = phone.replace(/\s/g, '');
    if (clean.length < 6) return clean;

    // Show first 3 and last 6 characters
    const start = clean.slice(0, 3);
    const end = clean.slice(-6);
    return `${start}***${end}`;
};

/**
 * Mask email for privacy display
 * example@gmail.com → e***@gmail.com
 */
const maskEmail = (email) => {
    if (!email) return null;
    const [local, domain] = email.split('@');
    if (!domain) return email;

    const maskedLocal = local.charAt(0) + '***';
    return `${maskedLocal}@${domain}`;
};

const SendPdfModal = ({
    isOpen,
    onClose,
    pdfUrl,
    pdfName,
    clientPhone,
    clientEmail,
    ticketNumber,
    onSuccess
}) => {
    // Channel selection
    const [sendViaWhatsApp, setSendViaWhatsApp] = useState(!!clientPhone);
    const [sendViaEmail, setSendViaEmail] = useState(!!clientEmail);

    // Custom message
    const [customMessage, setCustomMessage] = useState('');

    // Privacy toggle
    const [showFullContact, setShowFullContact] = useState(false);

    // Status management
    const [status, setStatus] = useState('idle'); // 'idle' | 'loading' | 'success' | 'partial' | 'error'
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
        }
    }, [isOpen, clientPhone, clientEmail]);

    const handleSend = async () => {
        if (!sendViaWhatsApp && !sendViaEmail) {
            setErrorMessage('Selecciona al menos un canal de envío');
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

            // Send based on selection
            if (sendViaWhatsApp && sendViaEmail) {
                const bothResults = await sendBoth({
                    phone: clientPhone,
                    email: clientEmail,
                    message: whatsappMessage,
                    pdfUrl: pdfUrl,
                    pdfName: pdfName,
                    subject: emailSubject
                });
                whatsappResult = bothResults.whatsapp;
                emailResult = bothResults.email;
            } else if (sendViaWhatsApp) {
                whatsappResult = await sendWhatsApp(clientPhone, whatsappMessage, pdfUrl);
            } else if (sendViaEmail) {
                emailResult = await sendEmail(clientEmail, emailSubject, emailMessage, pdfUrl, pdfName);
            }

            setResults({ whatsapp: whatsappResult, email: emailResult });

            // Determine overall status
            const whatsappOk = !sendViaWhatsApp || whatsappResult.success;
            const emailOk = !sendViaEmail || emailResult.success;

            if (whatsappOk && emailOk) {
                setStatus('success');
                if (onSuccess) onSuccess({ whatsapp: whatsappResult, email: emailResult });
            } else if (whatsappOk || emailOk) {
                setStatus('partial');
                const failedChannel = !whatsappOk ? 'WhatsApp' : 'Email';
                setErrorMessage(`El envío por ${failedChannel} falló. ${!whatsappOk ? whatsappResult.error : emailResult.error}`);
            } else {
                setStatus('error');
                setErrorMessage('Error al enviar. Revisa la conexión e intenta de nuevo.');
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

    const hasPhone = !!clientPhone;
    const hasEmail = !!clientEmail;
    const canSend = (sendViaWhatsApp && hasPhone) || (sendViaEmail && hasEmail);

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">

                {/* Header - Fixed at top */}
                <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-4 flex justify-between items-center flex-shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-white/20 rounded-lg">
                            <Send size={20} className="text-white" />
                        </div>
                        <div>
                            <h2 className="text-white font-bold text-lg">Enviar Documento</h2>
                            <p className="text-blue-100 text-xs">Elige cómo enviar al cliente</p>
                        </div>
                    </div>
                    <button
                        onClick={handleClose}
                        className="p-2 hover:bg-white/20 rounded-full transition text-white/80 hover:text-white"
                        title="Cerrar"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Content - Scrollable */}
                <div className="p-6 space-y-5 overflow-y-auto flex-1">

                    {/* Document Info */}
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex items-center gap-3">
                        <div className="p-2 bg-blue-100 rounded-lg">
                            <FileText size={24} className="text-blue-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">Documento</p>
                            <p className="text-slate-800 font-bold truncate">{pdfName || 'Documento.pdf'}</p>
                            {ticketNumber && (
                                <p className="text-xs text-slate-400">Servicio #{ticketNumber}</p>
                            )}
                        </div>
                        <a
                            href={pdfUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-2 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition text-slate-600"
                            title="Ver PDF"
                        >
                            <Eye size={16} />
                        </a>
                    </div>

                    {/* Delivery Channels */}
                    <div className="space-y-3">
                        <div className="flex justify-between items-center">
                            <p className="text-sm font-bold text-slate-700">Canales de Envío</p>
                            <button
                                onClick={() => setShowFullContact(!showFullContact)}
                                className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1"
                            >
                                {showFullContact ? <EyeOff size={12} /> : <Eye size={12} />}
                                {showFullContact ? 'Ocultar' : 'Mostrar'}
                            </button>
                        </div>

                        {/* WhatsApp Option */}
                        <label className={`flex items-center gap-4 p-4 rounded-xl border-2 transition cursor-pointer ${sendViaWhatsApp && hasPhone
                            ? 'border-green-500 bg-green-50'
                            : hasPhone
                                ? 'border-slate-200 bg-white hover:border-green-300'
                                : 'border-slate-100 bg-slate-50 cursor-not-allowed opacity-60'
                            }`}>
                            <input
                                type="checkbox"
                                checked={sendViaWhatsApp && hasPhone}
                                onChange={(e) => setSendViaWhatsApp(e.target.checked)}
                                disabled={!hasPhone || status === 'loading'}
                                className="w-5 h-5 rounded border-slate-300 text-green-600 focus:ring-green-500"
                            />
                            <div className="p-2 bg-green-100 rounded-lg">
                                <MessageCircle size={20} className="text-green-600" />
                            </div>
                            <div className="flex-1">
                                <p className="font-bold text-slate-800">WhatsApp</p>
                                <p className="text-sm text-slate-500">
                                    {hasPhone
                                        ? (showFullContact ? clientPhone : maskPhone(clientPhone))
                                        : 'No hay teléfono registrado'
                                    }
                                </p>
                            </div>
                            {results.whatsapp?.success && (
                                <CheckCircle size={20} className="text-green-500" />
                            )}
                            {results.whatsapp?.error && (
                                <AlertCircle size={20} className="text-red-500" />
                            )}
                        </label>

                        {/* Email Option */}
                        <label className={`flex items-center gap-4 p-4 rounded-xl border-2 transition cursor-pointer ${sendViaEmail && hasEmail
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
                                className="w-5 h-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                            />
                            <div className="p-2 bg-blue-100 rounded-lg">
                                <Mail size={20} className="text-blue-600" />
                            </div>
                            <div className="flex-1">
                                <p className="font-bold text-slate-800">Email</p>
                                <p className="text-sm text-slate-500">
                                    {hasEmail
                                        ? (showFullContact ? clientEmail : maskEmail(clientEmail))
                                        : 'No hay email registrado'
                                    }
                                </p>
                            </div>
                            {results.email?.success && (
                                <CheckCircle size={20} className="text-green-500" />
                            )}
                            {results.email?.error && (
                                <AlertCircle size={20} className="text-red-500" />
                            )}
                        </label>
                    </div>

                    {/* Custom Message */}
                    <div>
                        <label className="block text-sm font-bold text-slate-700 mb-2">
                            Mensaje personalizado <span className="font-normal text-slate-400">(opcional)</span>
                        </label>
                        <textarea
                            value={customMessage}
                            onChange={(e) => setCustomMessage(e.target.value)}
                            placeholder="Añade un mensaje adicional para el cliente..."
                            className="w-full p-3 border border-slate-200 rounded-xl text-sm resize-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                            rows={2}
                            disabled={status === 'loading'}
                        />
                    </div>

                    {/* Error Message */}
                    {errorMessage && (
                        <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
                            <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
                            <span>{errorMessage}</span>
                        </div>
                    )}

                    {/* Success Message */}
                    {status === 'success' && (
                        <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700">
                            <CheckCircle size={16} />
                            <span className="font-medium">¡Documento enviado correctamente!</span>
                        </div>
                    )}

                    {/* Partial Success Message */}
                    {status === 'partial' && (
                        <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-700">
                            <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
                            <span>Envío parcial completado. {errorMessage}</span>
                        </div>
                    )}
                </div>

                {/* Actions - Fixed at bottom */}
                <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex gap-3 flex-shrink-0">
                    <button
                        onClick={handleClose}
                        disabled={status === 'loading'}
                        className="flex-1 py-3 px-4 bg-white border border-slate-200 text-slate-600 rounded-xl font-bold hover:bg-slate-50 transition disabled:opacity-50"
                    >
                        {status === 'success' || status === 'partial' ? 'Cerrar' : 'Omitir'}
                    </button>

                    {status !== 'success' && (
                        <button
                            onClick={handleSend}
                            disabled={!canSend || status === 'loading'}
                            className="flex-1 py-3 px-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl font-bold hover:from-blue-700 hover:to-indigo-700 transition shadow-lg shadow-blue-600/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                            {status === 'loading' ? (
                                <>
                                    <Loader2 size={18} className="animate-spin" />
                                    Enviando...
                                </>
                            ) : status === 'partial' || status === 'error' ? (
                                <>
                                    <Send size={18} />
                                    Reintentar
                                </>
                            ) : (
                                <>
                                    <Send size={18} />
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
