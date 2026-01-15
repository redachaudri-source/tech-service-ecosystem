import { useState } from 'react';
import { assessMortifyViability } from '../services/mortifyService';
import { PiggyBank, Loader2, Calendar, Building, CheckCircle } from 'lucide-react';

const MortifyWizard = ({ appliance, onClose, onSuccess }) => {
    const [step, setStep] = useState('input'); // input, processing, done
    const [year, setYear] = useState(appliance.purchase_year || '');
    const [floor, setFloor] = useState(0); // Default Planta Baja
    const [price, setPrice] = useState(appliance.initial_value_estimate || ''); // Optional for now
    const [error, setError] = useState(null);

    const handleAnalyze = async (e) => {
        e.preventDefault();
        setStep('processing');
        setError(null);

        try {
            const inputs = {
                input_year: year,
                input_floor_level: floor
            };

            const result = await assessMortifyViability(appliance.id, inputs);

            if (result.success) {
                setStep('done');
                if (onSuccess) onSuccess();
            } else {
                throw new Error(result.error);
            }
        } catch (err) {
            console.error(err);
            setError('Error al analizar. Inténtalo de nuevo.');
            setStep('input');
        }
    };

    return (
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
                        <form onSubmit={handleAnalyze} className="space-y-4">
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

                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1 uppercase flex gap-1 items-center">
                                    <Building size={12} /> Planta / Piso
                                </label>
                                <select
                                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-pink-200 outline-none text-slate-700"
                                    value={floor}
                                    onChange={(e) => setFloor(e.target.value)}
                                >
                                    <option value="0">Bajo / Casa / Chalet</option>
                                    <option value="1">Planta 1</option>
                                    <option value="2">Planta 2</option>
                                    <option value="3">Planta 3 o superior (Sin ascensor carga)</option>
                                    <option value="99">Planta 3 o superior (Con ascensor grande)</option>
                                </select>
                            </div>

                            {error && <p className="text-xs text-red-500 font-bold text-center bg-red-50 p-2 rounded">{error}</p>}

                            <button
                                type="submit"
                                className="w-full bg-pink-500 text-white py-3.5 rounded-xl font-bold hover:bg-pink-600 transition shadow-lg shadow-pink-500/20 active:scale-95 flex items-center justify-center gap-2"
                            >
                                <PiggyBank size={20} /> Analizar Rentabilidad
                            </button>
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
                                <h3 className="text-lg font-bold text-slate-800">¡Solicitud Recibida!</h3>
                                <p className="text-sm text-slate-600 mt-2">
                                    Nuestros expertos y la IA están revisando tu caso.
                                </p>
                            </div>
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
    );
};

export default MortifyWizard;
