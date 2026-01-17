import React, { useState, useEffect } from 'react';
import { X, DollarSign, Smartphone, CreditCard, Banknote, Image as ImageIcon, Upload, CheckCircle, Loader2, AlertTriangle } from 'lucide-react';
import { supabase } from '../../lib/supabase';

const CloseTicketModal = ({ ticket, onClose, onComplete }) => {
    const [step, setStep] = useState('summary'); // summary | payment | processing | success
    const [finalPrice, setFinalPrice] = useState(ticket?.budget || '');
    const [paymentMethod, setPaymentMethod] = useState(''); // 'APP_PAYMENT' | 'CASH' | 'CARD'
    const [uploading, setUploading] = useState(false);
    const [paymentProofUrl, setPaymentProofUrl] = useState('');
    const [isListening, setIsListening] = useState(false);

    // REAL-TIME LISTENER FOR DIGITAL PAYMENT
    useEffect(() => {
        let channel;
        if (isListening && ticket.id) {
            channel = supabase
                .channel(`payment_watch_${ticket.id}`)
                .on(
                    'postgres_changes',
                    {
                        event: 'UPDATE',
                        schema: 'public',
                        table: 'tickets',
                        filter: `id=eq.${ticket.id}`
                    },
                    (payload) => {
                        console.log("Realtime Payload:", payload);
                        if (payload.new.status === 'finalizado' && payload.new.is_paid) {
                            setStep('success');
                            setIsListening(false);
                        }
                    }
                )
                .subscribe();
        }
        return () => {
            if (channel) supabase.removeChannel(channel);
        };
    }, [isListening, ticket.id]);


    const handleDigitalPayment = async () => {
        if (!finalPrice) return alert("Introduce el precio final");

        setPaymentMethod('APP_PAYMENT');
        setStep('processing');
        setIsListening(true);

        try {
            const { error } = await supabase
                .from('tickets')
                .update({
                    status: 'PENDING_PAYMENT',
                    final_price: parseFloat(finalPrice),
                    payment_method: 'APP_PAYMENT'
                })
                .eq('id', ticket.id);

            if (error) throw error;
            // Now we wait for Realtime update from Client App
        } catch (err) {
            alert("Error iniciando cobro: " + err.message);
            setStep('payment');
            setIsListening(false);
        }
    };

    const handleManualPayment = async (method) => { // method: 'CASH' or 'CARD'
        if (!finalPrice) return alert("Introduce el precio final");

        setPaymentMethod(method);
        setStep('upload_proof'); // Jump to upload step
    };

    const handleProofUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setUploading(true);
        try {
            const fileExt = file.name.split('.').pop();
            const fileName = `${ticket.id}_proof_${Date.now()}.${fileExt}`;
            const filePath = `${fileName}`;

            const { error: uploadError } = await supabase.storage
                .from('finance-proofs')
                .upload(filePath, file);

            if (uploadError) throw uploadError;

            const { data } = supabase.storage.from('finance-proofs').getPublicUrl(filePath);
            setPaymentProofUrl(data.publicUrl);
        } catch (error) {
            alert('Error subiendo foto: ' + error.message);
        } finally {
            setUploading(false);
        }
    };

    const finalizeManual = async () => {
        if (!paymentProofUrl) return alert("Es OBLIGATORIO subir una foto del ticket/recibo o dinero.");

        setStep('processing');
        try {
            const { error } = await supabase
                .from('tickets')
                .update({
                    status: 'finalizado',
                    is_paid: true,
                    final_price: parseFloat(finalPrice),
                    payment_method: paymentMethod,
                    payment_proof_url: paymentProofUrl
                })
                .eq('id', ticket.id);

            if (error) throw error;
            setStep('success');
        } catch (err) {
            alert("Error finalizando: " + err.message);
            setStep('summary'); // Go back
        }
    };

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in">
            <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">

                {/* Header */}
                <div className="p-4 bg-slate-900 text-white flex justify-between items-center">
                    <h2 className="font-bold text-lg flex items-center gap-2">
                        <Banknote className="text-green-400" />
                        Cobrar y Finalizar
                    </h2>
                    <button onClick={onClose} className="p-1 hover:bg-white/10 rounded-full">
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6">

                    {/* STEP 1: SUMMARY & INPUT */}
                    {step === 'summary' && (
                        <div className="space-y-6">
                            <div>
                                <label className="block text-sm font-bold text-slate-500 mb-1 uppercase">Importe Final a Cobrar</label>
                                <div className="relative">
                                    <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                                    <input
                                        type="number"
                                        value={finalPrice}
                                        onChange={(e) => setFinalPrice(e.target.value)}
                                        className="w-full pl-10 pr-4 py-3 text-2xl font-bold text-slate-800 border-2 border-slate-200 rounded-xl focus:border-blue-500 outline-none transition-all"
                                        placeholder="0.00"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 gap-3">
                                {ticket.client?.has_webapp ? (
                                    <button
                                        onClick={handleDigitalPayment}
                                        className="w-full py-4 bg-blue-600 text-white rounded-xl font-bold flex items-center justify-center gap-3 shadow-lg shadow-blue-200 hover:scale-[1.02] transition-transform"
                                    >
                                        <Smartphone size={24} />
                                        Cobrar por App
                                    </button>
                                ) : (
                                    <div className="w-full py-4 bg-slate-50 text-slate-400 rounded-xl font-bold flex items-center justify-center gap-3 border-2 border-slate-100 border-dashed cursor-not-allowed opacity-60">
                                        <Smartphone size={24} />
                                        <span>Cobro por App no disponible</span>
                                    </div>
                                )}

                                <div className="grid grid-cols-2 gap-3">
                                    <button
                                        onClick={() => handleManualPayment('CARD')}
                                        className="py-3 bg-slate-100 text-slate-700 rounded-xl font-bold flex flex-col items-center justify-center gap-1 hover:bg-slate-200 transition"
                                    >
                                        <CreditCard size={20} />
                                        Tarjeta (Datáfono)
                                    </button>
                                    <button
                                        onClick={() => handleManualPayment('CASH')}
                                        className="py-3 bg-slate-100 text-slate-700 rounded-xl font-bold flex flex-col items-center justify-center gap-1 hover:bg-slate-200 transition"
                                    >
                                        <Banknote size={20} />
                                        Efectivo
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* PROCESS: DIGITAL WAITING */}
                    {step === 'processing' && paymentMethod === 'APP_PAYMENT' && (
                        <div className="text-center py-8">
                            <div className="relative inline-block">
                                <span className="absolute inset-0 animate-ping rounded-full bg-blue-400 opacity-25"></span>
                                <Smartphone size={64} className="text-blue-600 relative z-10" />
                            </div>
                            <h3 className="text-xl font-bold text-slate-800 mt-6 mb-2">Esperando al Cliente...</h3>
                            <p className="text-slate-500 text-sm max-w-[200px] mx-auto">
                                Hemos enviado la solicitud de pago al móvil del cliente.
                            </p>
                            <div className="mt-8 p-4 bg-blue-50 rounded-xl border border-blue-100">
                                <Loader2 className="animate-spin mx-auto text-blue-500 mb-2" />
                                <p className="text-xs font-mono text-blue-700">Escuchando confirmación en tiempo real...</p>
                            </div>
                        </div>
                    )}

                    {/* PROCESS: MANUAL UPLOAD */}
                    {step === 'upload_proof' && (
                        <div className="space-y-6">
                            <div className="text-center">
                                <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                    <ImageIcon size={32} className="text-orange-500" />
                                </div>
                                <h3 className="text-lg font-bold text-slate-800">Foto del Justificante</h3>
                                <p className="text-sm text-slate-500">
                                    Para cerrar en <b>{paymentMethod === 'CASH' ? 'Efectivo' : 'Tarjeta Man.'}</b> es OBLIGATORIO subir una foto.
                                </p>
                            </div>

                            <div className="border-2 border-dashed border-slate-300 rounded-xl p-6 text-center hover:bg-slate-50 transition relative">
                                <input
                                    type="file"
                                    accept="image/*"
                                    capture="environment"
                                    onChange={handleProofUpload}
                                    className="absolute inset-0 opacity-0 w-full h-full cursor-pointer z-10"
                                />
                                {uploading ? (
                                    <Loader2 className="animate-spin mx-auto text-blue-500" />
                                ) : paymentProofUrl ? (
                                    <div className="relative">
                                        <img src={paymentProofUrl} alt="Proof" className="h-32 mx-auto rounded-lg object-contain" />
                                        <div className="absolute -top-2 -right-2 bg-green-500 text-white rounded-full p-1 shadow-sm">
                                            <CheckCircle size={16} />
                                        </div>
                                    </div>
                                ) : (
                                    <>
                                        <Upload className="mx-auto text-slate-400 mb-2" />
                                        <span className="text-sm font-bold text-blue-600">Tocar para hacer foto</span>
                                    </>
                                )}
                            </div>

                            <button
                                onClick={finalizeManual}
                                disabled={!paymentProofUrl}
                                className="w-full py-3 bg-slate-900 text-white rounded-xl font-bold disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                Confirmar y Cerrar
                            </button>
                        </div>
                    )}

                    {/* SUCCESS */}
                    {step === 'success' && (
                        <div className="text-center py-6">
                            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6 animate-in zoom-in">
                                <CheckCircle size={40} className="text-green-600" />
                            </div>
                            <h3 className="text-2xl font-black text-slate-800 mb-2">¡Cobrado!</h3>
                            <p className="text-slate-500 mb-8">El ticket se ha cerrado correctamente.</p>
                            <button
                                onClick={() => { onComplete(); onClose(); }}
                                className="w-full py-3 bg-green-600 text-white rounded-xl font-bold shadow-lg shadow-green-200"
                            >
                                Volver al Dashboard
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default CloseTicketModal;
