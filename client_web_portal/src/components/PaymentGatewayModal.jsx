import React, { useState, useEffect } from 'react';
import { CreditCard, Lock, CheckCircle, ShieldCheck, X, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';

const PaymentGatewayModal = ({ ticket, onClose, onSuccess }) => {
    const [processing, setProcessing] = useState(false);
    const [step, setStep] = useState('confirm'); // confirm | processing | success

    const handleSimulatePayment = async () => {
        setProcessing(true);
        setStep('processing');

        // Simulate 2s processing
        setTimeout(async () => {
            try {
                // Perform the "Payment" -> Update Ticket
                const { error } = await supabase
                    .from('tickets')
                    .update({
                        status: 'finalizado',
                        is_paid: true,
                        payment_method: 'APP_PAYMENT',
                        // final_price should already be set by tech
                    })
                    .eq('id', ticket.id);

                if (error) throw error;

                setStep('success');
                setTimeout(() => {
                    onSuccess();
                }, 2000);

            } catch (err) {
                alert("Error en el pago: " + err.message);
                setProcessing(false);
                setStep('confirm');
            }
        }, 2000);
    };

    if (!ticket) return null;

    return (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-[9999] flex items-center justify-center p-4 animate-in fade-in">
            <div className="bg-white rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl relative">

                {/* Security Badge */}
                <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-green-400 to-blue-500"></div>

                <div className="p-6 text-center">

                    {step === 'confirm' && (
                        <>
                            <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-blue-100">
                                <CreditCard size={32} className="text-blue-600" />
                            </div>

                            <h2 className="text-xl font-bold text-slate-900 mb-1">Confirmar Pago</h2>
                            <p className="text-slate-500 text-sm mb-6">Servicio #{ticket.ticket_number}</p>

                            <div className="bg-slate-50 rounded-xl p-4 mb-6 border border-slate-100">
                                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Total a Pagar</p>
                                <p className="text-3xl font-black text-slate-900">{ticket.final_price?.toFixed(2)}€</p>
                            </div>

                            <button
                                onClick={handleSimulatePayment}
                                disabled={processing}
                                className="w-full py-4 bg-black text-white rounded-xl font-bold shadow-lg hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                            >
                                <Lock size={16} />
                                Pagar con Tarjeta
                            </button>

                            <div className="mt-4 flex items-center justify-center gap-2 text-[10px] text-slate-400 uppercase font-bold tracking-wider">
                                <ShieldCheck size={12} className="text-green-500" />
                                Pagos Seguros SSL
                            </div>
                        </>
                    )}

                    {step === 'processing' && (
                        <div className="py-8">
                            <Loader2 size={48} className="animate-spin text-blue-600 mx-auto mb-4" />
                            <h3 className="text-lg font-bold text-slate-800">Procesando Pago...</h3>
                            <p className="text-sm text-slate-500">Conectando con el banco</p>
                        </div>
                    )}

                    {step === 'success' && (
                        <div className="py-6 animate-in zoom-in">
                            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                <CheckCircle size={40} className="text-green-600" />
                            </div>
                            <h3 className="text-2xl font-black text-slate-800 mb-2">¡Pago Correcto!</h3>
                            <p className="text-slate-500">Hemos enviado el recibo a tu email.</p>
                        </div>
                    )}

                </div>
            </div>
        </div>
    );
};

export default PaymentGatewayModal;
