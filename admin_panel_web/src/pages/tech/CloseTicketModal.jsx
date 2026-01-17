import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Smartphone, Banknote, Camera, CheckCircle, Loader2, AlertTriangle, Upload, X } from 'lucide-react';

const CloseTicketModal = ({ ticket, onClose, onComplete }) => {
    const [mode, setMode] = useState(null); // 'digital' | 'manual'
    const [amount, setAmount] = useState(ticket.total_amount || 0); // Need to calc total effectively
    const [uploading, setUploading] = useState(false);
    const [proofUrl, setProofUrl] = useState('');
    const [waitingForClient, setWaitingForClient] = useState(false);

    // Calculate total if not provided directly
    // (Ideally pass the calculated total from parent)

    // REALTIME LISTENER FOR DIGITAL PAYMENT
    useEffect(() => {
        if (mode === 'digital' && waitingForClient) {
            const channel = supabase
                .channel(`payment-check-${ticket.id}`)
                .on(
                    'postgres_changes',
                    {
                        event: 'UPDATE',
                        schema: 'public',
                        table: 'tickets',
                        filter: `id=eq.${ticket.id}`
                    },
                    (payload) => {
                        const newStatus = payload.new.status;
                        const newPaymentStatus = payload.new.payment_status; // If we added this column

                        // Check if Paid
                        if (newStatus === 'finalizado' || payload.new.is_paid === true) {
                            setWaitingForClient(false);
                            onComplete(); // Close modal and refresh parent
                        }
                    }
                )
                .subscribe();

            return () => {
                supabase.removeChannel(channel);
            };
        }
    }, [mode, waitingForClient, ticket.id]);

    const handleDigitalStart = async () => {
        setWaitingForClient(true);
        // Update DB to PENDING_PAYMENT
        const { error } = await supabase
            .from('tickets')
            .update({
                status: 'pend_pago', // Or 'en_reparacion' but marking payment pending? 
                // Let's use the new column/status we discussed or reuse fields
                // User requirement: status = 'PENDING_PAYMENT' (check enum)
                // Actually my enum update added 'PENDING_PAYMENT' to ticket_status
                status: 'PENDING_PAYMENT',
                payment_method: 'APP_PAYMENT',
                final_price: amount
            })
            .eq('id', ticket.id);

        if (error) {
            alert('Error iniciando cobro: ' + error.message);
            setWaitingForClient(false);
        }
    };

    const handleManualClose = async () => {
        if (!proofUrl) return alert('Debes subir la foto del justificante/dinero.');

        // Update DB and Close
        const { error } = await supabase
            .from('tickets')
            .update({
                status: 'finalizado',
                is_paid: true,
                payment_method: 'CASH', // or card, simplified for now
                payment_proof_url: proofUrl,
                final_price: amount
            })
            .eq('id', ticket.id);

        if (error) alert('Error cerrando: ' + error.message);
        else onComplete();
    };

    const handleFileUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        setUploading(true);
        try {
            const ext = file.name.split('.').pop();
            const path = `${ticket.id}_close_${Date.now()}.${ext}`;
            await supabase.storage.from('finance-proofs').upload(path, file);
            const { data } = supabase.storage.from('finance-proofs').getPublicUrl(path);
            setProofUrl(data.publicUrl);
        } catch (err) {
            console.error(err);
            alert('Error subiendo foto');
        } finally {
            setUploading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4 animate-in fade-in">
            <div className="bg-white rounded-3xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
                {/* Header */}
                <div className="p-6 bg-slate-900 text-white flex justify-between items-center">
                    <div>
                        <h2 className="text-xl font-bold">Cobrar y Cerrar</h2>
                        <p className="text-slate-400 text-sm">Servicio #{ticket.ticket_number}</p>
                    </div>
                    <button onClick={onClose} className="p-2 bg-white/10 rounded-full hover:bg-white/20">
                        <X size={20} />
                    </button>
                </div>

                <div className="p-6 flex-1 overflow-y-auto">
                    {/* Amount Input */}
                    <div className="mb-8 text-center">
                        <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Total a Cobrar</label>
                        <div className="flex items-center justify-center gap-2">
                            <input
                                type="number"
                                value={amount}
                                onChange={e => setAmount(Number(e.target.value))}
                                className="text-4xl font-black text-slate-800 text-center w-48 border-b-2 border-slate-200 focus:border-blue-500 outline-none bg-transparent"
                            />
                            <span className="text-4xl font-bold text-slate-400">€</span>
                        </div>
                    </div>

                    {!mode ? (
                        <div className="grid gap-4">
                            <button
                                onClick={() => setMode('digital')}
                                className="p-6 bg-blue-50 border-2 border-blue-100 rounded-2xl flex items-center gap-4 hover:bg-blue-100 transition group"
                            >
                                <div className="bg-blue-600 text-white p-4 rounded-xl shadow-lg shadow-blue-200 group-hover:scale-110 transition-transform">
                                    <Smartphone size={32} />
                                </div>
                                <div className="text-left">
                                    <h3 className="font-bold text-blue-900 text-lg">Cobro Digital (App)</h3>
                                    <p className="text-blue-600 text-sm leading-tight">Cliente paga ahora mismo desde su móvil.</p>
                                </div>
                            </button>

                            <button
                                onClick={() => setMode('manual')}
                                className="p-6 bg-slate-50 border-2 border-slate-100 rounded-2xl flex items-center gap-4 hover:bg-slate-100 transition group"
                            >
                                <div className="bg-slate-800 text-white p-4 rounded-xl shadow-lg group-hover:scale-110 transition-transform">
                                    <Banknote size={32} />
                                </div>
                                <div className="text-left">
                                    <h3 className="font-bold text-slate-900 text-lg">Cobro Manual</h3>
                                    <p className="text-slate-500 text-sm leading-tight">Efectivo o Datáfono físico.</p>
                                </div>
                            </button>
                        </div>
                    ) : mode === 'digital' ? (
                        <div className="text-center py-8">
                            {!waitingForClient ? (
                                <div className="space-y-6">
                                    <div className="bg-blue-50 p-6 rounded-full inline-block mb-4">
                                        <Smartphone size={48} className="text-blue-600" />
                                    </div>
                                    <p className="text-lg text-slate-600">
                                        Se enviará una solicitud de cobro por <strong>{amount}€</strong> al cliente.
                                    </p>
                                    <button
                                        onClick={handleDigitalStart}
                                        className="w-full py-4 bg-blue-600 text-white rounded-xl font-bold shadow-lg shadow-blue-200 hover:bg-blue-700 transition"
                                    >
                                        🚀 Enviar Solicitud
                                    </button>
                                </div>
                            ) : (
                                <div className="space-y-6 animate-in fade-in">
                                    <div className="relative inline-block">
                                        <div className="absolute inset-0 bg-blue-500 rounded-full animate-ping opacity-20"></div>
                                        <div className="bg-white p-6 rounded-full border-4 border-blue-100 relative z-10">
                                            <Loader2 size={48} className="text-blue-600 animate-spin" />
                                        </div>
                                    </div>
                                    <div>
                                        <h3 className="text-xl font-bold text-slate-800 mb-2">Esperando al cliente...</h3>
                                        <p className="text-slate-500">Pídele que abra su App y confirme el pago.</p>
                                    </div>
                                    <div className="p-4 bg-yellow-50 rounded-xl border border-yellow-100 text-xs text-yellow-800 font-medium">
                                        ⚠️ Si tarda mucho, cierra esto e inténtalo manual.
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="space-y-6 animate-in fade-in">
                            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-3">Foto Justificante / Dinero *</label>

                                {!proofUrl ? (
                                    <label className="w-full aspect-video border-2 border-dashed border-slate-300 rounded-xl flex flex-col items-center justify-center gap-2 cursor-pointer hover:bg-white transition relative overflow-hidden">
                                        <input type="file" onChange={handleFileUpload} accept="image/*" className="hidden" />
                                        {uploading ? (
                                            <Loader2 className="animate-spin text-slate-400" />
                                        ) : (
                                            <>
                                                <Camera className="text-slate-400" size={32} />
                                                <span className="text-xs font-bold text-slate-500">Tocar para Foto</span>
                                            </>
                                        )}
                                    </label>
                                ) : (
                                    <div className="relative w-full aspect-video rounded-xl overflow-hidden group">
                                        <img src={proofUrl} className="w-full h-full object-cover" />
                                        <button
                                            onClick={() => setProofUrl('')}
                                            className="absolute top-2 right-2 p-2 bg-red-600 text-white rounded-full shadow-lg"
                                        >
                                            <X size={16} />
                                        </button>
                                    </div>
                                )}
                            </div>

                            <button
                                onClick={handleManualClose}
                                disabled={!proofUrl}
                                className={`w-full py-4 rounded-xl font-bold shadow-lg transition flex items-center justify-center gap-2 ${proofUrl ? 'bg-green-600 text-white hover:bg-green-700' : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                                    }`}
                            >
                                <CheckCircle size={20} />
                                Confirmar Cobro y Cerrar
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default CloseTicketModal;
