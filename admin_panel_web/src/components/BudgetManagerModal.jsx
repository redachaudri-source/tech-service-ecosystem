import React, { useState, useEffect } from 'react';
import { X, Clock, FileText, CheckCircle, AlertTriangle, Send, RefreshCw, DollarSign, Edit3, Calendar } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { formatDistanceToNow, addDays, isPast } from 'date-fns';
import { es } from 'date-fns/locale';
import { generateServiceReport, loadImage } from '../utils/pdfGenerator'; // Import generator

const BudgetManagerModal = ({ ticket, onClose, onUpdate, onEdit, onOpenAssignment }) => {
    const [loading, setLoading] = useState(false);
    const [timeLeft, setTimeLeft] = useState(null);
    const [localTicket, setLocalTicket] = useState(ticket); // Local state for fresh data

    useEffect(() => {
        // Fetch fresh data when modal opens to ensure we have latest PDF url
        const fetchFreshData = async () => {
            const { data } = await supabase.from('tickets').select('*').eq('id', ticket.id).single();
            if (data) setLocalTicket(data);
        };
        fetchFreshData();
    }, [ticket.id]);

    const [status, setStatus] = useState(ticket.status);

    useEffect(() => {
        if (localTicket.quote_generated_at) {
            const expiryDate = addDays(new Date(localTicket.quote_generated_at), 15);
            // Simple string for display
            setTimeLeft(expiryDate);
        }
    }, [ticket]);

    const handleRevalidate = async () => {
        if (!window.confirm('¿Revalidar presupuesto por otros 15 días?')) return;
        setLoading(true);
        try {
            const { error } = await supabase.from('tickets').update({
                status: 'presupuesto_pendiente',
                quote_generated_at: new Date().toISOString()
            }).eq('id', ticket.id);

            if (error) throw error;
            onUpdate();
            onClose();
        } catch (e) {
            console.error(e);
            alert('Error: ' + e.message);
        } finally {
            setLoading(false);
        }
    };

    const handleForceAccept = async () => {
        if (!window.confirm('ATENCIÓN: Al aceptar el presupuesto, se reiniciará el proceso de cita para que se asigne de nuevo el técnico. ¿Proceder?')) return;
        setLoading(true);
        try {
            // LOGIC: Accept Quote AND Reset Appointment to force re-scheduling
            const { error } = await supabase.from('tickets').update({
                status: 'presupuesto_aceptado',
                appointment_status: 'pending', // FORCE RESET
                // We keep the tech assigned, but maybe clear the slot if it was tentative? 
                // Let's keep tech but clear 'scheduled_at' if we want strictly new appointment, 
                // OR just mark 'pending' so Dispatcher sees it needs confirmation again.
                // User said: "asignarlo al tecnico en cuestio o otro ... reiniciar la linea de asignacion con la cita"
                // So 'pending' appointment status is best.
                status_history: [...(ticket.status_history || []), {
                    status: 'presupuesto_aceptado',
                    label: 'Aceptado por Admin - Reinicio Cita',
                    timestamp: new Date().toISOString()
                }]
            }).eq('id', ticket.id);

            if (error) throw error;
            onUpdate();
            onClose();
        } catch (e) {
            console.error(e);
            alert('Error: ' + e.message);
        } finally {
            setLoading(false);
        }
    };

    const handleGeneratePdf = async () => {
        setLoading(true);
        try {
            // 1. Generate Quote PDF
            // We need full ticket data with relations? Assuming 'ticket' has enough or we fetch it?
            // Usually 'ticket' prop here comes from ServiceMonitor join, might be missing detailed breakdown if not carefully fetched.
            // But let's try generating with what we have + refetch if needed.
            // Ideally we should fetch fresh data.
            const { data: fullTicket } = await supabase.from('tickets').select('*, client:profiles!client_id(*), technician:profiles!technician_id(*), appliance_info').eq('id', localTicket.id).single();

            const logoImg = await loadImage('https://placehold.co/150x50/2563eb/white?text=LOGO'); // Mock or use settings
            const doc = generateServiceReport(fullTicket || localTicket, logoImg, { isQuote: true });
            const pdfBlob = doc.output('blob');
            const fileName = `quote_${localTicket.ticket_number}_${Date.now()}.pdf`;

            const { error: uploadError } = await supabase.storage
                .from('service-reports')
                .upload(fileName, pdfBlob, { contentType: 'application/pdf' });

            if (uploadError) throw uploadError;

            const { data } = supabase.storage.from('service-reports').getPublicUrl(fileName);

            // Save Quote URL to ticket
            await supabase.from('tickets').update({
                quote_pdf_url: data.publicUrl,
                quote_generated_at: localTicket.quote_generated_at || new Date().toISOString()
            }).eq('id', localTicket.id);

            onUpdate();
            alert('PDF Generado y guardado correctamente.');
        } catch (e) {
            console.error(e);
            alert('Error generando PDF: ' + e.message);
        } finally {
            setLoading(false);
        }
    };

    const handleResendNotification = async () => {
        let email = ticket.client?.email;
        if (!email) {
            email = window.prompt("El cliente no tiene email registrado. Introduce uno para enviar el presupuesto:");
        }

        if (email) {
            // Here we would call the backend API to send the email
            // For now, mock success
            alert(`📧 Notificación enviada a: ${email}\n(Simulación: En producción esto enviaría el PDF adjunto).`);
        }
    };

    const calculateTotal = () => {
        // Handle parsing safe
        let parts = [], labor = [];
        try { parts = typeof ticket.parts_list === 'string' ? JSON.parse(ticket.parts_list) : ticket.parts_list || []; } catch (e) { }
        try { labor = typeof ticket.labor_list === 'string' ? JSON.parse(ticket.labor_list) : ticket.labor_list || []; } catch (e) { }

        const pTotal = parts.reduce((acc, i) => acc + (i.price * (i.qty || 1)), 0);
        const lTotal = labor.reduce((acc, i) => acc + (i.price * (i.qty || 1)), 0);
        return (pTotal + lTotal) * 1.21; // VAT
    };

    const isExpired = ticket.status === 'presupuesto_revision' || (timeLeft && isPast(timeLeft));

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 animate-in fade-in backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">

                {/* Header */}
                <div className="p-6 bg-slate-50 border-b border-slate-100 flex justify-between items-start">
                    <div>
                        <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                            <FileText className="text-blue-600" /> Gestión de Presupuesto
                        </h2>
                        <p className="text-sm text-slate-500 mt-1">Ticket #{ticket.ticket_number}</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition"><X size={20} /></button>
                </div>

                {/* Body */}
                <div className="p-6 overflow-y-auto space-y-6">

                    {/* Timer / Status Banner */}
                    <div className={`p-4 rounded-xl border flex items-center gap-4 ${isExpired ? 'bg-red-50 border-red-200' : 'bg-blue-50 border-blue-200'}`}>
                        <div className={`p-3 rounded-full ${isExpired ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'}`}>
                            {isExpired ? <AlertTriangle size={24} /> : <Clock size={24} />}
                        </div>
                        <div>
                            <p className="text-xs font-bold uppercase opacity-60 mb-1">
                                {isExpired ? 'ESTADO: CADUCADO' : 'VALIDEZ RESTANTE'}
                            </p>
                            <h3 className={`text-xl font-black ${isExpired ? 'text-red-700' : 'text-blue-700'}`}>
                                {isExpired ? 'Requiere Revisión' : timeLeft ? formatDistanceToNow(timeLeft, { locale: es, addSuffix: true }) : '15 días'}
                            </h3>
                            {ticket.quote_generated_at && (
                                <p className="text-xs opacity-60 mt-1">Generado el: {new Date(ticket.quote_generated_at).toLocaleDateString()}</p>
                            )}
                        </div>
                    </div>

                    {/* Financial Summary */}
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                        <div className="flex justify-between items-center mb-3">
                            <span className="text-sm font-bold text-slate-600">Total Presupuestado (IVA inc.)</span>
                            <span className="text-2xl font-bold text-slate-800">{calculateTotal().toFixed(2)}€</span>
                        </div>
                        <div className="flex gap-2">
                            {localTicket.quote_pdf_url ? (
                                <a href={localTicket.quote_pdf_url} target="_blank" rel="noopener noreferrer" className="flex-1 py-2 bg-white border border-slate-200 rounded-lg text-sm font-bold text-slate-600 flex items-center justify-center gap-2 hover:bg-slate-50">
                                    <FileText size={14} /> Ver PDF Original
                                </a>
                            ) : (
                                <button
                                    onClick={handleGeneratePdf}
                                    disabled={loading}
                                    className="flex-1 py-2 bg-yellow-100 border border-yellow-200 rounded-lg text-sm font-bold text-yellow-800 flex items-center justify-center gap-2 hover:bg-yellow-200"
                                >
                                    <FileText size={14} /> Generar PDF (Faltante)
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Actions Grid */}
                    <div className="grid grid-cols-1 gap-3">
                        {/* Edit Button REMOVED as per request */}

                        <button
                            onClick={handleResendNotification}
                            className="p-4 bg-white border-2 border-slate-100 rounded-xl hover:border-indigo-500 hover:text-indigo-600 transition group text-left"
                        >
                            <Send className="mb-2 text-slate-400 group-hover:text-indigo-500" size={24} />
                            <span className="block font-bold text-sm">Re-Notificar / Enviar Email</span>
                            <span className="text-xs text-slate-400">Enviar email al cliente (solicita email si falta)</span>
                        </button>
                    </div>

                </div>

                {/* Footer Actions */}
                <div className="p-4 border-t border-slate-100 bg-slate-50 flex flex-col gap-3">
                    {isExpired ? (
                        <button
                            onClick={handleRevalidate}
                            disabled={loading}
                            className="w-full py-3 bg-slate-900 text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-slate-800 disabled:opacity-50"
                        >
                            <RefreshCw size={18} /> Revalidar por 15 días
                        </button>
                    ) : (
                        <div className="space-y-2">
                            <button
                                onClick={onOpenAssignment}
                                className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-blue-700 shadow-lg shadow-blue-900/10"
                            >
                                <Calendar size={18} /> Gestionar Cita y Asignación
                            </button>
                            <p className="text-xs text-center text-slate-400 px-4">
                                * Redirige al panel de asignación para confirmar técnico y fecha. El cliente deberá aceptar los cambios.
                            </p>
                        </div>
                    )}
                </div>

            </div>
        </div>
    );
};

export default BudgetManagerModal;
