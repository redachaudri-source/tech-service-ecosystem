import React, { useState } from 'react';
import { CreditCard, Lock, CheckCircle, Loader2, ShieldCheck, X } from 'lucide-react';
import { supabase } from '../lib/supabase';

const PaymentGatewayModal = ({ ticket, onClose, onSuccess }) => {
    const [processing, setProcessing] = useState(false);
    const [step, setStep] = useState('review'); // review | processing | success

    const handlePay = async () => {
        setProcessing(true);
        setStep('processing');

        // Simulate Network Delay
        await new Promise(r => setTimeout(r, 2000));

        // Update DB
        const { error } = await supabase
            .from('tickets')
            .update({
                status: 'finalizado', // Or 'PAID' if we want to keep it open? Tech app said 'finalizado'
                is_paid: true,
                payment_method: 'APP_PAYMENT',
                payment_status: 'paid', // If column exists
                updated_at: new Date().toISOString()
            })
            .eq('id', ticket.id);

        if (error) {
            alert('Error en el pago: ' + error.message);
            setProcessing(false);
            setStep('review');
        } else {
            setStep('success');
            setTimeout(() => {
                onSuccess();
            }, 2000);
        }
    };

    if (step === 'success') {
        return (
            <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4 animate-in fade-in">
                <div className="bg-white rounded-3xl p-8 max-w-sm w-full text-center">
                    <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-6">
                        <CheckCircle size={40} />
                    </div>
                    <h2 className="text-2xl font-bold text-slate-900 mb-2">¡Pago Completado!</h2>
                    <p className="text-slate-500">Gracias por confiar en nosotros.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4 animate-in zoom-in-95 duration-200">
            <div className="bg-white rounded-3xl w-full max-w-md overflow-hidden relative shadow-2xl">
                {/* Header */}
                <div className="bg-slate-900 p-6 text-white pb-12 relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-4 opacity-10">
                        <ShieldCheck size={120} />
                    </div>
                    <div className="relative z-10">
                        <p className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-1">Solicitud de Pago</p>
                        <h2 className="text-2xl font-bold">Resumen del Servicio</h2>
                        <p className="text-slate-400 text-sm">Ticket #{ticket.ticket_number}</p>
                    </div>
                    {/* Close Button (Optional, maybe specific cases allowed) */}
                    <button onClick={onClose} className="absolute top-4 right-4 p-2 bg-white/10 rounded-full hover:bg-white/20 z-20">
                        <X size={16} />
                    </button>
                </div>

                {/* Body */}
                <div className="-mt-6 bg-white rounded-t-3xl relative z-10 px-6 pt-8 pb-6">
                    <div className="text-center mb-8">
                        <span className="text-slate-400 text-sm font-medium">Total a Pagar</span>
                        <div className="flex items-center justify-center gap-1 text-slate-900">
                            <span className="text-5xl font-black">{ticket.final_price || ticket.total_amount || 0}</span>
                            <span className="text-3xl font-bold">€</span>
                        </div>
                    </div>

                    <div className="space-y-4 mb-8">
                        {/* Fake Card Form */}
                        <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                            <div className="flex justify-between items-center mb-4">
                                <span className="text-xs font-bold text-slate-500 uppercase">Método de Pago</span>
                                <div className="flex gap-2">
                                    <div className="w-8 h-5 bg-blue-600 rounded"></div>
                                    <div className="w-8 h-5 bg-orange-500 rounded"></div>
                                </div>
                            </div>

                            <div className="space-y-3">
                                <div className="bg-white p-3 rounded-lg border border-slate-200 flex items-center gap-3">
                                    <CreditCard size={20} className="text-slate-400" />
                                    <input
                                        type="text"
                                        placeholder="0000 0000 0000 0000"
                                        className="w-full text-sm font-mono outline-none text-slate-700"
                                        disabled
                                        value="**** **** **** 4242"
                                    />
                                </div>
                                <div className="flex gap-3">
                                    <div className="flex-1 bg-white p-3 rounded-lg border border-slate-200">
                                        <input type="text" placeholder="MM/YY" className="w-full text-center text-sm outline-none" disabled value="12/28" />
                                    </div>
                                    <div className="flex-1 bg-white p-3 rounded-lg border border-slate-200">
                                        <input type="text" placeholder="CVC" className="w-full text-center text-sm outline-none" disabled value="***" />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <button
                        onClick={handlePay}
                        disabled={processing}
                        className="w-full py-4 bg-black text-white rounded-xl font-bold shadow-xl shadow-slate-200 flex items-center justify-center gap-2 hover:bg-slate-800 transition active:scale-[0.98]"
                    >
                        {processing ? (
                            <>
                                <Loader2 className="animate-spin" size={20} />
                                Procesando Pago...
                            </>
                        ) : (
                            <>
                                <Lock size={18} />
                                Pagar {ticket.final_price}€
                            </>
                        )}
                    </button>

                    <p className="text-center text-[10px] text-slate-400 mt-4 flex items-center justify-center gap-1">
                        <Lock size={10} /> Pagos seguros encriptados con SSL de 256-bits
                    </p>
                </div>
            </div>
        </div>
    );
};

export default PaymentGatewayModal;
