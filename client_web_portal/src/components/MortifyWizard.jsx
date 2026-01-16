import { useState } from 'react';
import { assessMortifyViability } from '../services/mortifyService';
import { PiggyBank, Loader2, Calendar, Building, CheckCircle, AlertTriangle } from 'lucide-react';
import MortifyPaymentModal from './MortifyPaymentModal';

const MortifyWizard = ({ appliance, onClose, onSuccess }) => {
    const [step, setStep] = useState('input'); // input | payment | processing | done
    const [year, setYear] = useState(appliance.purchase_year || '');
    const [floor, setFloor] = useState(0); // Default Planta Baja
    const [error, setError] = useState(null);
    const [resultData, setResultData] = useState(null); // Store result for UI warning

    // Initial Form Submit -> Go to Payment
    const handleInputSubmit = (e) => {
        e.preventDefault();
        setStep('payment');
    };

    // Called after Fake Payment Success
    const handleAnalyze = async () => {
        setStep('processing');
        setError(null);

        try {
            const inputs = {
                input_year: year,
                input_floor_level: floor,
                total_spent_override: appliance.totalSpent || 0,
                repair_count: appliance.repairCount || 0
                // Note: History penalty logic will be added in Task 2 using repairCount
            };

            const result = await assessMortifyViability(appliance.id, inputs);

            if (result.success) {
                setResultData(result.data); // Save full result data (including penalty info)
                setStep('done');
                if (onSuccess) onSuccess();
            } else {
                throw new Error(result.error);
            }
        } catch (err) {
            console.error(err);
            setError(`Error: ${err.message || 'Desconocido'}`);
            setStep('input');
        }
    };

    return (
        <>
            {/* PAYMENT MODAL LAYER */}
            {step === 'payment' && (
                <MortifyPaymentModal
                    onClose={() => setStep('input')}
                    onSuccess={handleAnalyze}
                />
            )}

            {/* WIZARD MODAL (Hidden while paying to emulate stacking/focus, or keep visible behind? 
               Lets hide/unmount or keep it simple. If we unmount, we lose state. 
               Better to just render conditionally or keep it in background. 
               Since PaymentModal has its own backdrop, we can keep this one rendered but maybe hidden?
               Actually, let's replace the view content if step is payment, or just overlay. 
               The instruction says "Se abre el Modal MortifyPaymentModal".
               Let's keep this mounted but if step === 'payment', maybe we return null here to let the other modal take over?
               No, we need the state (year, floor) to persist. 
               So we render PaymentModal INSTEAD of the wizard content if step is payment? No, it's a modal over modal?
               Let's do: If step is payment, show PaymentModal. This Wizard container can stay or hide. 
               Cleaner UX: Switch the rendered content entirely if step is 'payment'. 
            */}

            {step !== 'payment' && (
                <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 animate-in fade-in backdrop-blur-sm">
                    <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl relative">

                        {/* Close Button */}
                        {step !== 'processing' && (
                            <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 z-10">✕</button>
                        )}

                        {/* HEADER */}
                        <div className="bg-pink-50 p-6 text-center border-b border-pink-100">
                            <div className="w-16 h-16 bg-pink-100 text-pink-500 rounded-full flex items-center justify-center mx-auto mb-3 shadow-inner">
                                <PiggyBank size={32} />
                            </div>
                            <h2 className="text-xl font-bold text-pink-900">Asesor de Viabilidad</h2>
                            <p className="text-sm text-pink-700/80">Mortify Intelligence System</p>
                        </div>

                        {/* BODY */}
                        <div className="p-6">
                            {step === 'input' && (
                                <form onSubmit={handleInputSubmit} className="space-y-4">
                                    <p className="text-sm text-slate-600 text-center mb-4">
                                        Para calcular si merece la pena reparar tu <strong>{appliance.brand} {appliance.type}</strong>, necesitamos confirmar unos datos.
                                    </p>

                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 mb-1 uppercase flex gap-1 items-center">
                                            <Calendar size={12} /> Año de Compra
                                        </label>
                                        <input
                                            type="number"
                                            required
                                            min="1990"
                                            max={new Date().getFullYear()}
                                            className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-pink-200 outline-none"
                                            value={year}
                                            onChange={(e) => setYear(e.target.value)}
                                            placeholder="Ej. 2018"
                                        />
                                    </div>

                                    <div className={`p-3 rounded-xl border transition-colors ${isSmartData ? 'bg-green-50/50 border-green-200' : 'bg-slate-50 border-slate-200'}`}>
                                        <label className="block text-xs font-bold text-slate-500 mb-1 uppercase flex gap-1 items-center justify-between">
                                            <span className="flex items-center gap-1"><Building size={12} /> Planta / Piso</span>
                                            {isSmartData && <CheckCircle size={12} className="text-green-500" />}
                                        </label>
                                        <select
                                            className="w-full bg-transparent font-bold text-lg text-slate-800 outline-none"
                                            value={floor}
                                            onChange={(e) => setFloor(e.target.value)}
                                        >
                                            <option value="0">Bajo / Casa / Chalet</option>
                                            <option value="1">1ª Planta</option>
                                            <option value="2">2ª Planta</option>
                                            <option value="3">3ª Planta (Sin ascensor)</option>
                                            <option value="99">3ª Planta (Con ascensor)</option>
                                        </select>
                                    </div>

                                    {error && <p className="text-xs text-red-500 font-bold text-center bg-red-50 p-2 rounded">{error}</p>}

                                    <button
                                        type="submit"
                                        className="w-full bg-pink-500 text-white py-3.5 rounded-xl font-bold hover:bg-pink-600 transition shadow-lg shadow-pink-500/20 active:scale-95 flex items-center justify-center gap-2"
                                    >
                                        <PiggyBank size={20} /> Continuar al Pago
                                    </button>
                                    <p className="text-[10px] text-center text-slate-400 mt-2">Paso 1 de 2: Confirmación de datos</p>

                                </form>
                            )}

                            {step === 'processing' && (
                                <div className="text-center py-8 space-y-4">
                                    <Loader2 size={40} className="animate-spin text-pink-500 mx-auto" />
                                    <p className="text-slate-600 font-medium">Consultando bases de datos de mercado...</p>
                                    <p className="text-xs text-slate-400">Calculando depreciación y logística...</p>
                                </div>
                            )}

                            {step === 'done' && (
                                <div className="text-center py-4 space-y-4 animate-in zoom-in">
                                    <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto">
                                        <CheckCircle size={32} />
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-bold text-slate-800">¡Solicitud Procesada!</h3>
                                        <p className="text-sm text-slate-600 mt-2">
                                            El análisis ha sido guardado exitosamente.
                                        </p>
                                    </div>

                                    {/* RISK WARNING */}
                                    {resultData && resultData.history_penalty > 0 && (
                                        <div className="bg-orange-50 p-3 rounded-xl border border-orange-200 text-left flex gap-3 items-start mt-2">
                                            <div className="bg-orange-100 p-1 rounded-full shrink-0 text-orange-600 mt-0.5">
                                                <AlertTriangle size={14} />
                                            </div>
                                            <div className="space-y-1">
                                                <p className="text-xs font-bold text-orange-800">Factor de Riesgo Detectado</p>
                                                <p className="text-[11px] text-orange-700 leading-tight">
                                                    Este aparato ya acumula <strong>{resultData.total_spent_ref.toFixed(0)}€</strong> en reparaciones previas o tiene un historial de averías frecuente. Seguir invirtiendo es financieramente arriesgado (-{resultData.history_penalty} ptos).
                                                </p>
                                            </div>
                                        </div>
                                    )}

                                    <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 text-blue-800 text-sm font-medium">
                                        ⏳ Tiempo estimado: 1h - 48h
                                    </div>
                                    <button
                                        onClick={onClose}
                                        className="w-full bg-slate-900 text-white py-3 rounded-xl font-bold hover:bg-slate-800 transition"
                                    >
                                        Entendido
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default MortifyWizard;
