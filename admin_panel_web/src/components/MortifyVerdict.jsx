import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import {
    ArrowLeft, CheckCircle, XCircle, AlertTriangle,
    Thermometer, ShieldCheck, Banknote, Calendar,
    Eye, Sparkles, X, Info
} from 'lucide-react';

const MortifyVerdict = ({ assessment, onBack, onComplete }) => {
    const [processing, setProcessing] = useState(false);
    const [note, setNote] = useState('');
    const [showApplianceModal, setShowApplianceModal] = useState(false);

    const { client_appliances: appliance } = assessment;

    // FIX: Access profiles instead of clients
    const clientName = appliance?.profiles?.full_name || 'Desconocido';

    const [recalculating, setRecalculating] = useState(false);

    const handleRecalculate = async () => {
        setRecalculating(true);
        try {
            // 1. Get Fresh Data
            const { data: appData } = await supabase.from('client_appliances').select('*').eq('id', assessment.appliance_id).single();
            const brandName = (appData.brand || '').trim();
            const typeName = (appData.type || '').trim();

            // 2. Fetch Configs
            const { data: brandScoreData } = await supabase.from('mortify_brand_scores').select('score_points').ilike('brand_name', brandName).maybeSingle();
            const { data: catData } = await supabase.from('appliance_category_defaults').select('*').ilike('category_name', typeName).maybeSingle();

            // 3. Calc Brand Score
            const newScoreBrand = brandScoreData ? brandScoreData.score_points : 1;

            // 4. Calc Age Score (Keep existing logic but refresh base)
            let newScoreAge = 0;
            const currentYear = new Date().getFullYear();
            const pYear = assessment.input_year || appData.purchase_year; // Prefer snapshot input, fallback to app data
            if (pYear) {
                const age = currentYear - parseInt(pYear);
                if (age < 6) newScoreAge = 1;
            }

            // 5. Calc Installation Score
            let newScoreInstall = 0;
            const floor = assessment.input_floor_level || 0;
            const baseDiff = catData?.base_installation_difficulty || 0;
            if (baseDiff === 0 && floor <= 2) newScoreInstall = 1;

            // 6. Calc Financial Score
            // We need original spent override if it exists? 
            // We'll assume the snapshot financial score logic was correct based on 'total_spent_override' hidden in logic.
            // But we don't have that override stored separately?
            // Wait, `assessMortifyViability` used `userInputs.total_spent_override`.
            // The `mortify_assessments` table DOES NOT store `total_spent`. 
            // So we can't perfectly recalculate Financial Score if it depended on a transient input.
            // HOWEVER: We can keep the existing `score_financial` unless we want to assume 0 or 1.
            // Let's Keep `score_financial` as is, only update Brand and Age if possible.
            const newScoreFinancial = assessment.score_financial;

            // 7. Total
            const newTotal = newScoreBrand + newScoreAge + newScoreInstall + newScoreFinancial;
            let newSuggestion = 'DOUBTFUL';
            if (newTotal >= 5) newSuggestion = 'VIABLE';
            else if (newTotal < 3) newSuggestion = 'OBSOLETE';

            // 8. Update DB
            const { error: updErr } = await supabase.from('mortify_assessments').update({
                score_brand: newScoreBrand,
                score_age: newScoreAge,
                score_installation: newScoreInstall,
                total_score: newTotal,
                ia_suggestion: newSuggestion
            }).eq('id', assessment.id);

            if (updErr) throw updErr;

            alert(`Recálculo completado.\nNuevo Total: ${newTotal} pts\nMarca: ${newScoreBrand} pts`);
            onComplete(); // Refresh parent
        } catch (err) {
            console.error(err);
            alert('Error al recalcular: ' + err.message);
        } finally {
            setRecalculating(false);
        }
    };

    const handleDecision = async (verdict) => {
        if (!confirm('¿Estás seguro de emitir este veredicto? Es irreversible.')) return;

        setProcessing(true);
        try {
            const { error: asmtError } = await supabase
                .from('mortify_assessments')
                .update({
                    status: 'JUDGED',
                    admin_verdict: verdict,
                    admin_note: note,
                    judged_at: new Date().toISOString()
                })
                .eq('id', assessment.id);

            if (asmtError) throw asmtError;
            onComplete();
        } catch (err) {
            console.error('Error saving verdict:', err);
            alert('Error al guardar el veredicto');
        } finally {
            setProcessing(false);
        }
    };

    // "AI" Text Improver (Heuristic)
    const improveText = () => {
        let improved = note;
        if (!improved) improved = "Estimado cliente, tras analizar su aparato...";

        const replacements = {
            "hola": "Estimado/a cliente",
            "roto": "averiado",
            "viejo": "antiguo",
            "malo": "deficiente",
            "no vale": "no resulta viable",
            "tirar": "reciclar",
            "comprar": "adquirir",
            "arreglar": "reparar",
            "caro": "costoso",
            "creo que": "según nuestro análisis técnico,",
            "adiós": "Atentamente, el equipo técnico"
        };

        Object.keys(replacements).forEach(key => {
            const regex = new RegExp(`\\b${key}\\b`, 'gi');
            improved = improved.replace(regex, replacements[key]);
        });

        // Ensure sentences start with uppercase
        improved = improved.replace(/(^\w|[.!?]\s+\w)/g, letter => letter.toUpperCase());

        // Add intro if missing
        if (!improved.toLowerCase().includes('estimado') && !improved.toLowerCase().includes('hola')) {
            improved = "Estimado cliente: " + improved;
        }

        setNote(improved);
    };

    return (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-full animate-in fade-in slide-in-from-bottom-4 duration-300">
            {/* Header */}
            <div className="border-b border-slate-100 p-4 flex items-center gap-4 bg-slate-50/50">
                <button
                    onClick={onBack}
                    className="p-2 hover:bg-slate-200 rounded-lg transition-colors text-slate-500"
                >
                    <ArrowLeft size={20} />
                </button>
                <div>
                    <h2 className="text-lg font-bold text-slate-800">Expediente #{assessment.id.slice(0, 8)}</h2>
                    <p className="text-xs text-slate-500 uppercase font-bold tracking-wider">
                        Solicitado por: <span className="text-indigo-600">{clientName}</span>
                    </p>
                </div>
            </div>

            <div className="flex flex-1 overflow-hidden">
                {/* LEFT: THE FACTS */}
                <div className="w-1/2 p-6 border-r border-slate-100 overflow-y-auto bg-slate-50/30">
                    <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-6 flex items-center gap-2">
                        Los Hechos (Evidencia)
                        <div className="group relative">
                            <Info size={14} className="text-slate-300 cursor-help" />
                            <div className="absolute left-0 top-6 w-64 bg-slate-800 text-white text-xs p-3 rounded-lg shadow-xl opacity-0 group-hover:opacity-100 transition pointer-events-none z-10">
                                Los datos reflejan la configuración en el momento de la solicitud. Si cambiaste los ajustes después, estos números no se actualizarán automáticamente.
                            </div>
                        </div>
                    </h3>

                    {/* Appliance Card */}
                    <div className="bg-white p-4 rounded-xl border border-slate-200 mb-6 shadow-sm relative group/card">
                        <div className="flex items-start justify-between mb-4">
                            <div>
                                <div className="flex items-center gap-2">
                                    <h4 className="text-xl font-bold text-slate-900 uppercase">{appliance.brand}</h4>
                                    <button
                                        onClick={() => setShowApplianceModal(true)}
                                        className="p-1.5 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition shadow-sm border border-blue-100"
                                        title="Ver ficha del aparato"
                                    >
                                        <Eye size={16} />
                                    </button>
                                </div>
                                <p className="text-slate-500 font-medium">{appliance.type} {appliance.model ? `- ${appliance.model}` : ''}</p>
                            </div>
                            <div className="text-right">
                                <span className={`block text-2xl font-black ${assessment.total_score >= 5 ? 'text-green-600' : assessment.total_score <= 2 ? 'text-red-500' : 'text-amber-500'}`}>
                                    {assessment.total_score}
                                </span>
                                <span className="text-xs text-slate-400 font-bold uppercase">Puntos Totales</span>
                            </div>
                        </div>

                        {/* Analysis Breakdown */}
                        <div className="space-y-3">
                            <ScoreRow
                                icon={ShieldCheck} color="text-blue-500"
                                label="Calidad de Marca"
                                score={assessment.score_brand}
                                description="Basado en la reputación y disponibilidad de repuestos de la marca."
                            />
                            <ScoreRow
                                icon={Calendar} color="text-amber-500"
                                label={`Antigüedad (${assessment.input_year || '?'})`}
                                score={assessment.score_age}
                                description="Vida útil restante estimada según el año de compra."
                            />
                            <ScoreRow
                                icon={Thermometer} color="text-purple-500"
                                label="Instalación / Acceso"
                                score={assessment.score_installation}
                                description="Complejidad técnica para acceder y reparar el equipo."
                            />
                            <ScoreRow
                                icon={Banknote} color="text-green-500"
                                label="Situación Financiera"
                                score={assessment.score_financial}
                                description="Relación coste reparación estimado vs. valor residual del aparato."
                            />
                        </div>
                    </div>

                    {/* AI Suggestion */}
                    <div className={`p-4 rounded-xl border border-l-4 shadow-sm ${assessment.ia_suggestion === 'VIABLE'
                        ? 'bg-green-50 border-green-200 border-l-green-500'
                        : assessment.ia_suggestion === 'OBSOLETE'
                            ? 'bg-red-50 border-red-200 border-l-red-500'
                            : 'bg-amber-50 border-amber-200 border-l-amber-500'
                        }`}>
                        <h4 className="text-sm font-bold opacity-80 mb-1 flex items-center gap-2">
                            <AlertTriangle size={14} /> Sugerencia Algoritmo:
                        </h4>
                        <p className="text-lg font-black">
                            {assessment.ia_suggestion === 'VIABLE' ? 'REPARACIÓN VIABLE' :
                                assessment.ia_suggestion === 'OBSOLETE' ? 'OBSOLESCENCIA DETECTADA' :
                                    'DUDOSO / REVISIÓN MANUAL'}
                        </p>
                    </div>
                </div>

                {/* RIGHT: THE VERDICT */}
                <div className="w-1/2 p-6 flex flex-col bg-white">
                    <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-6">El Veredicto</h3>

                    <div className="flex-1 flex flex-col justify-center space-y-6 max-w-md mx-auto w-full">

                        {/* UPDATE SCORES BUTTON */}
                        <button
                            onClick={handleRecalculate}
                            disabled={recalculating || processing}
                            className="text-xs w-full py-2 bg-slate-50 border border-slate-200 text-slate-500 rounded-lg hover:bg-slate-100 hover:text-indigo-600 transition flex items-center justify-center gap-2"
                        >
                            {recalculating ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                            Actualizar Puntuación (Si cambiaste configuración)
                        </button>

                        <div className="space-y-2">
                            <div className="flex justify-between items-end">
                                <label className="text-sm font-bold text-slate-700">Nota del Juez (Visible al cliente)</label>
                                <button
                                    onClick={improveText}
                                    className="text-xs flex items-center gap-1 text-indigo-600 font-bold hover:bg-indigo-50 px-2 py-1 rounded transition"
                                >
                                    <Sparkles size={12} /> Mejorar con IA
                                </button>
                            </div>
                            <textarea
                                value={note}
                                onChange={e => setNote(e.target.value)}
                                className="w-full h-40 p-4 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 text-sm resize-none shadow-sm leading-relaxed"
                                placeholder="Explica tu decisión al cliente de forma profesional..."
                            />
                        </div>

                        <div className="grid grid-cols-1 gap-4">
                            <button
                                onClick={() => handleDecision('CONFIRMED_VIABLE')}
                                disabled={processing}
                                className="group relative flex items-center justify-center gap-3 w-full py-4 bg-green-50 text-green-700 border border-green-200 rounded-xl font-bold hover:bg-green-600 hover:text-white hover:border-green-600 transition-all shadow-sm hover:shadow-lg hover:shadow-green-500/20"
                            >
                                <CheckCircle size={24} />
                                <span className="text-lg">CONFIRMAR VIABILIDAD</span>
                            </button>

                            <div className="relative flex items-center py-2">
                                <div className="flex-grow border-t border-slate-200"></div>
                                <span className="flex-shrink-0 mx-4 text-slate-400 text-xs font-bold uppercase">O</span>
                                <div className="flex-grow border-t border-slate-200"></div>
                            </div>

                            <button
                                onClick={() => handleDecision('CONFIRMED_OBSOLETE')}
                                disabled={processing}
                                className="group relative flex items-center justify-center gap-3 w-full py-4 bg-red-50 text-red-700 border border-red-200 rounded-xl font-bold hover:bg-red-600 hover:text-white hover:border-red-600 transition-all shadow-sm hover:shadow-lg hover:shadow-red-500/20"
                            >
                                <XCircle size={24} />
                                <span className="text-lg">DECLARAR OBSOLETO</span>
                            </button>
                        </div>

                    </div>

                    {processing && (
                        <div className="absolute inset-0 bg-white/50 backdrop-blur-sm flex items-center justify-center z-50">
                            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
                        </div>
                    )}
                </div>
            </div>

            {/* Appliance Detail Modal */}
            {showApplianceModal && (
                <div className="fixed inset-0 bg-black/80 z-[60] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
                    <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden relative">
                        <button
                            onClick={() => setShowApplianceModal(false)}
                            className="absolute top-4 right-4 bg-white/50 hover:bg-white p-2 rounded-full text-slate-800 transition z-10"
                        >
                            <X size={24} />
                        </button>

                        {appliance.image_url ? (
                            <div className="h-64 overflow-hidden bg-slate-100 flex items-center justify-center">
                                <img src={appliance.image_url} alt="Aparato" className="w-full h-full object-cover" />
                            </div>
                        ) : (
                            <div className="h-48 bg-slate-100 flex flex-col items-center justify-center text-slate-400">
                                <Eye size={48} className="mb-2 opacity-50" />
                                <span className="text-sm font-medium">Sin foto disponible</span>
                            </div>
                        )}

                        <div className="p-6">
                            <h3 className="text-2xl font-bold text-slate-900 mb-1">{appliance.brand}</h3>
                            <p className="text-lg text-slate-600 font-medium mb-6">{appliance.type} {appliance.model}</p>

                            <div className="grid grid-cols-2 gap-4 text-sm">
                                <div className="bg-slate-50 p-3 rounded-lg">
                                    <span className="text-slate-400 text-xs font-bold uppercase block mb-1">Año Compra</span>
                                    <span className="font-bold text-slate-900">{appliance.purchase_year || 'N/A'}</span>
                                </div>
                                <div className="bg-slate-50 p-3 rounded-lg">
                                    <span className="text-slate-400 text-xs font-bold uppercase block mb-1">ID Sistema</span>
                                    <span className="font-mono text-slate-900 truncate">{appliance.id}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

// Subcomponent for cleaner code
const ScoreRow = ({ icon: Icon, color, label, score, description }) => (
    <div className="group relative flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-100 hover:border-indigo-200 transition-colors">
        <div className="flex items-center gap-3">
            <Icon className={color} size={18} />
            <div>
                <span className="text-sm font-medium text-slate-700 block">{label}</span>
                <span className="text-[10px] text-slate-400 hidden group-hover:block leading-tight max-w-[200px] mt-1">{description}</span>
            </div>
        </div>
        <span className="font-bold text-slate-900 bg-white px-2 py-1 rounded border border-slate-100 shadow-sm">{score} pts</span>
    </div>
);

export default MortifyVerdict;
