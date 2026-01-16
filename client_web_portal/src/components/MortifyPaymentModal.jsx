import { useState, useEffect } from 'react';
import { CreditCard, Lock, ShieldCheck, User, Calendar, Loader2, CheckCircle } from 'lucide-react';

const MortifyPaymentModal = ({ onClose, onSuccess }) => {
    const [step, setStep] = useState('form'); // form | processing | success

    const handlePay = (e) => {
        e.preventDefault();
        setStep('processing');

        // Simulate Processing Delay
        setTimeout(() => {
            setStep('success');
            // Wait a bit to show success check, then close
            setTimeout(() => {
                onSuccess();
            }, 1000);
        }, 1500);
    };

    if (step === 'success') {
        return (
            <div className="fixed inset-0 bg-emerald-600 z-[60] flex items-center justify-center animate-in fade-in duration-300">
                <div className="text-center text-white space-y-4 transform scale-110">
                    <div className="bg-white text-emerald-600 p-6 rounded-full inline-block mb-4 shadow-xl">
                        <CheckCircle size={64} className="stroke-[3]" />
                    </div>
                    <h2 className="text-4xl font-black tracking-tight">¡PAGO ACEPTADO!</h2>
                    <p className="text-emerald-100 font-medium text-lg">Iniciando análisis de Inteligencia Artificial...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in">
            <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden flex flex-col relative">

                {/* Close Button implementation if needed, though usually forced flow. Let's allow generic close outside or top right if we want. */}
                <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 z-10 p-2">✕</button>

                {/* Header */}
                <div className="bg-gradient-to-r from-slate-900 to-slate-800 p-6 text-white text-center relative overflow-hidden">
                    <div className="relative z-10">
                        <div className="flex justify-center mb-3">
                            <div className="bg-white/10 p-3 rounded-2xl backdrop-blur-md">
                                <ShieldCheck size={32} className="text-emerald-400" />
                            </div>
                        </div>
                        <h2 className="text-xl font-bold mb-1">Pasarela Segura</h2>
                        <p className="text-slate-400 text-xs">Informe de Viabilidad IA - Premium</p>
                    </div>
                    {/* Background decor */}
                    <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
                </div>

                {/* Price Tag */}
                <div className="bg-emerald-50 border-b border-emerald-100 p-4 flex justify-between items-center px-8">
                    <span className="text-emerald-800 font-bold text-sm">TOTAL A PAGAR</span>
                    <div className="text-right">
                        <span className="text-slate-400 line-through text-xs font-bold mr-2">29.99€</span>
                        <span className="text-3xl font-black text-slate-900">9.99€</span>
                    </div>
                </div>

                {/* Fake Form */}
                <form onSubmit={handlePay} className="p-8 space-y-5">
                    {/* Card Number */}
                    <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-500 uppercase ml-1">Número de Tarjeta</label>
                        <div className="relative">
                            <input
                                type="text"
                                placeholder="0000 0000 0000 0000"
                                className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-mono text-slate-700 outline-none focus:ring-2 focus:ring-emerald-500 transition"
                                required
                            />
                            <CreditCard className="absolute left-3.5 top-3.5 text-slate-400" size={20} />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <label className="text-xs font-bold text-slate-500 uppercase ml-1">Caducidad</label>
                            <div className="relative">
                                <input
                                    type="text"
                                    placeholder="MM/YY"
                                    className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-mono text-slate-700 outline-none focus:ring-2 focus:ring-emerald-500 transition"
                                    required
                                />
                                <Calendar className="absolute left-3.5 top-3.5 text-slate-400" size={20} />
                            </div>
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-bold text-slate-500 uppercase ml-1">CVC</label>
                            <div className="relative">
                                <input
                                    type="text"
                                    placeholder="123"
                                    className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-mono text-slate-700 outline-none focus:ring-2 focus:ring-emerald-500 transition"
                                    required
                                />
                                <Lock className="absolute left-3.5 top-3.5 text-slate-400" size={20} />
                            </div>
                        </div>
                    </div>

                    <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-500 uppercase ml-1">Titular</label>
                        <div className="relative">
                            <input
                                type="text"
                                placeholder="NOMBRE APELLIDO"
                                className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 outline-none focus:ring-2 focus:ring-emerald-500 transition"
                                required
                            />
                            <User className="absolute left-3.5 top-3.5 text-slate-400" size={20} />
                        </div>
                    </div>

                    {/* Disclaimer */}
                    <div className="flex gap-2 items-start bg-blue-50 p-3 rounded-lg">
                        <div className="mt-0.5"><Lock size={12} className="text-blue-500" /></div>
                        <p className="text-[10px] text-blue-600 leading-tight">
                            <strong>Modo Simulación:</strong> No se realizará ningún cargo real en su tarjeta. Esto es una prueba de concepto del servicio.
                        </p>
                    </div>

                    {/* Submit */}
                    <button
                        disabled={step === 'processing'}
                        className="w-full bg-slate-900 text-white py-4 rounded-xl font-bold text-lg hover:bg-slate-800 transition shadow-xl shadow-slate-900/20 active:scale-[0.98] flex items-center justify-center gap-3 disabled:opacity-80"
                    >
                        {step === 'processing' ? (
                            <>
                                <Loader2 className="animate-spin" /> Procesando...
                            </>
                        ) : (
                            <>
                                <Lock size={20} /> PAGAR Y ANALIZAR
                            </>
                        )}
                    </button>

                    <div className="flex justify-center gap-4 opacity-40 grayscale">
                        <img src="https://upload.wikimedia.org/wikipedia/commons/4/41/Visa_Logo.png" className="h-4" alt="Visa" />
                        <img src="https://upload.wikimedia.org/wikipedia/commons/b/b7/MasterCard_Logo.svg" className="h-4" alt="Mastercard" />
                    </div>

                </form>
            </div>
        </div>
    );
};

export default MortifyPaymentModal;
