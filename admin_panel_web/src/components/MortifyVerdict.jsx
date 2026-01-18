import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import {
    AlertTriangle, CheckCircle, XCircle, Sparkles, Loader2, ArrowLeft,
    ShieldCheck, Calendar, Thermometer, Banknote, Bot, Eye, X,
    Skull, Ghost, Plus, Minus, ArrowRight
} from 'lucide-react';
import ViabilityLabel from './ViabilityLabel';

const MortifyVerdict = ({ assessment, onBack, onComplete }) => {
    const [processing, setProcessing] = useState(false);
    const [explanation, setExplanation] = useState(''); // FOR THE CLIENT
    const [showApplianceModal, setShowApplianceModal] = useState(false);
    const [recalculating, setRecalculating] = useState(false);

    // Financial UI State
    const [financialMetrics, setFinancialMetrics] = useState(null);
    const [loadingFin, setLoadingFin] = useState(true);

    const { client_appliances: appliance } = assessment;

    // Load Financial Data on Mount
    useEffect(() => {
        if (!assessment || !appliance) return;

        // Initialize Admin Note if exists
        setExplanation(assessment.admin_note || '');

        const loadFinancials = async () => {
            try {
                // 1. Get Configs
                const { data: catData } = await supabase.from('appliance_category_defaults')
                    .select('*')
                    .ilike('category_name', appliance.type)
                    .maybeSingle();

                const marketPrice = catData?.average_market_price || 700;
                const lifespan = catData?.average_lifespan_years || 10;

                // 2. PRESTIGE LOGIC
                let multiplier = 1.0;
                const bScore = assessment.score_brand || 1;
                if (bScore >= 4) multiplier = 2.2;
                else if (bScore === 3) multiplier = 1.6;
                else if (bScore === 2) multiplier = 1.25;

                const prestigePrice = marketPrice * multiplier;

                // 3. Calculate Age & Current Value
                const pYear = assessment.input_year || appliance.purchase_year;
                const currentYear = new Date().getFullYear();
                let age = pYear ? (currentYear - parseInt(pYear)) : 0;
                if (age < 0) age = 0;

                let currentValue = 0;
                if (age < lifespan) {
                    currentValue = prestigePrice * (1.0 - (age / lifespan));
                }

                // 4. Get Total Spent
                const { data: tickets } = await supabase.from('tickets')
                    .select('final_price')
                    .eq('appliance_id', appliance.id)
                    .in('status', ['finalizado', 'pagado']);

                const totalSpent = tickets?.reduce((sum, t) => sum + (Number(t.final_price) || 0), 0) || 0;

                // 5. AMNESTY LOGIC (The Bathtub Curve)
                let limitRatio = 0.51; // Default
                if (age >= 3 && age <= 7) {
                    limitRatio = 0.70; // Amnesty for prime age
                }

                // 6. Limits
                const ruinLimit = currentValue * limitRatio;
                const remainingBudget = Math.max(0, ruinLimit - totalSpent);
                const percentSpent = currentValue > 0 ? (totalSpent / currentValue) * 100 : 100;
                const percentLimit = limitRatio * 100;

                // Calculate Financial Score (0-10) for UI display consistency
                let financialScore = 10;
                if (totalSpent > 0) {
                    const spendRatio = totalSpent / currentValue;
                    if (spendRatio > limitRatio) {
                        financialScore = 0;
                    } else {
                        financialScore = Math.round(10 * (1.0 - (spendRatio / limitRatio)));
                        if (financialScore < 1) financialScore = 1;
                    }
                }

                setFinancialMetrics({
                    marketPrice, prestigePrice, multiplier, lifespan, age, currentValue,
                    totalSpent, ruinLimit, remainingBudget, percentSpent, percentLimit, financialScore
                });

            } catch (err) {
                console.error("Error loading financials:", err);
            } finally {
                setLoadingFin(false);
            }
        };

        loadFinancials();
    }, [assessment, appliance]);

    if (!appliance) return null;

    const clientName = appliance?.profiles?.full_name || 'Desconocido';

    // State for The Cemetery (Recovery)
    const [localRecovered, setLocalRecovered] = useState(0);

    // Initialize recovered points from DB
    useEffect(() => {
        if (assessment) {
            setLocalRecovered(assessment.admin_recovered_points || 0);
        }
    }, [assessment]);

    // REACTIVE LIVE SCORE
    const baseScore = assessment.total_score - (assessment.admin_recovered_points || 0);
    const liveScore = baseScore + localRecovered;

    // Determine Live Verdict Label
    let liveVerdict = 'DUDOSO';
    if (liveScore >= 18) liveVerdict = 'VIABLE';
    else if ((financialMetrics?.financialScore === 0) && localRecovered === 0) liveVerdict = 'OBSOLETO';


    const handleRecalculate = async () => {
        setRecalculating(true);
        try {
            const { error: rpcError } = await supabase.rpc('fn_calculate_mortify_score', {
                p_appliance_id: appliance.id
            });
            if (rpcError) throw rpcError;
            alert("Solicitud de recálculo enviada al sistema (Trigger V11).");
            onComplete();
        } catch (err) {
            console.error(err);
            alert('Error al recalcular: ' + err.message);
        } finally {
            setRecalculating(false);
        }
    };

    const handleSaveRecovery = async () => {
        setProcessing(true);
        try {
            // 1. Update the Secret Column + The Explanation
            const { error: updError } = await supabase
                .from('mortify_assessments')
                .update({
                    admin_recovered_points: localRecovered,
                    admin_note: explanation, // SAVE THE CLIENT NOTE HERE
                    status: 'JUDGED', // Force Judge status
                    admin_verdict: liveScore >= 18 ? 'CONFIRMED_VIABLE' : 'OBSOLETE', // Auto-set verdict based on final score
                    admin_decision_date: new Date().toISOString()
                })
                .eq('id', assessment.id);

            if (updError) throw updError;

            // 2. Trigger RPC to Recalculate Total (Base + Financial + Recovered)
            const { error: rpcError } = await supabase.rpc('fn_calculate_mortify_score', {
                p_appliance_id: appliance.id
            });

            if (rpcError) throw rpcError;

            // 3. Close with success
            alert("¡Expediente actualizado correctamente! (" + localRecovered + " pts resucitados)");
            onComplete();

        } catch (err) {
            console.error('Error in Necromancy:', err);
            alert('Fallo al guardar: ' + err.message);
        } finally {
            setProcessing(false);
        }
    };

    const handleImproveText = () => {
        if (!explanation.trim()) {
            setExplanation("El cliente es leal y merece una consideración especial. A pesar del coste de reparación, el valor residual del aparato justifica la inversión.");
            return;
        }

        setProcessing(true);
        setTimeout(() => {
            const val = financialMetrics ? financialMetrics.currentValue.toFixed(0) : '???';
            const spent = financialMetrics ? financialMetrics.totalSpent.toFixed(0) : '???';

            const improved = `Estimado cliente, tras analizar su caso hemos considerado factores adicionales: ${explanation.toLowerCase()}. Teniendo en cuenta el valor de mercado (${val}€) y su historial (${spent}€ invertidos), hemos aplicado una bonificación de calidad para aprobar esta reparación.`;

            setExplanation(improved);
            setProcessing(false);
        }, 800);
    };

    return (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-full animate-in fade-in slide-in-from-bottom-4 duration-300">
            {/* Header */}
            <div className="border-b border-slate-100 p-4 flex items-center gap-4 bg-slate-50/50">
                <button onClick={onBack} className="p-2 hover:bg-slate-200 rounded-lg transition-colors text-slate-500">
                    <ArrowLeft size={20} />
                </button>
                <div className="flex-1">
                    <h2 className="text-lg font-bold text-slate-800">Expediente #{assessment.id.slice(0, 8)}</h2>
                    <p className="text-xs text-slate-500 uppercase font-bold tracking-wider">
                        Solicitado por: <span className="text-indigo-600">{clientName}</span>
                    </p>
                </div>
                {/* BIG SCORE HEADER - REACTIVE NOW */}
                <div className="text-right">
                    <div className="text-2xl font-black text-slate-800">{liveScore} <span className="text-sm text-slate-400 font-bold">/ 24</span></div>
                    <div className={`text-xs font-bold uppercase px-2 py-0.5 rounded ${liveVerdict === 'VIABLE' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                        }`}>
                        {liveVerdict}
                    </div>
                </div>
            </div>

            <div className="flex flex-1 overflow-hidden">
                {/* LEFT: THE FACTS */}
                <div className="w-1/2 p-6 border-r border-slate-100 overflow-y-auto bg-slate-50/30">
                    {/* FINANCIAL HEALTH BAR */}
                    <div className="bg-white p-5 rounded-2xl border border-indigo-100 shadow-lg shadow-indigo-500/5 mb-6">
                        <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                            <Banknote size={14} className="text-indigo-500" />
                            Análisis de Rentabilidad (V11)
                        </h4>

                        {loadingFin ? (
                            <div className="animate-pulse space-y-2">
                                <div className="h-4 bg-slate-100 rounded w-3/4"></div>
                                <div className="h-8 bg-slate-100 rounded w-full"></div>
                            </div>
                        ) : financialMetrics ? (
                            <div>
                                <div className="flex justify-between items-end mb-2">
                                    <div>
                                        <span className="text-3xl font-black text-slate-800">{financialMetrics.remainingBudget.toFixed(2)}€</span>
                                        <span className="text-xs text-slate-500 font-bold uppercase ml-2">Disponibles para gastar</span>
                                    </div>
                                    <div className="text-right">
                                        <span className="text-xs text-slate-400 font-medium block">Valor Residual Actual</span>
                                        <span className="text-sm font-bold text-slate-600">{financialMetrics.currentValue.toFixed(2)}€</span>
                                    </div>
                                </div>

                                {/* Progress Bar Container */}
                                <div className="relative h-6 w-full bg-slate-200 rounded-full overflow-hidden border border-slate-300 mb-1">
                                    {/* The Safe Zone (0-51%) */}
                                    <div className="absolute top-0 left-0 h-full bg-gradient-to-r from-emerald-400 to-emerald-500" style={{ width: (financialMetrics.percentLimit) + '%' }}></div>
                                    {/* The DANGER Zone (51-100%) */}
                                    <div className="absolute top-0 right-0 h-full bg-rose-100" style={{ width: (100 - financialMetrics.percentLimit) + '%' }}></div>

                                    {/* Needle / Marker for Current Spend */}
                                    <div
                                        className="absolute top-0 bottom-0 w-1 bg-slate-900 z-10 transition-all duration-1000 shadow-[0_0_10px_rgba(0,0,0,0.5)]"
                                        style={{ left: Math.min(100, (financialMetrics.totalSpent / financialMetrics.currentValue) * 100) + '%' }}
                                    ></div>

                                    {/* Percentage text inside bar if space allows, otherwise separate? Let's rely on labels below */}
                                </div>

                                {/* Labels */}
                                <div className="flex justify-between text-[10px] text-slate-400 font-bold mt-1 uppercase">
                                    <span>0€</span>
                                    <span className="text-emerald-600">Límite Seguro ({financialMetrics.percentLimit.toFixed(0)}%): {financialMetrics.ruinLimit.toFixed(0)}€</span>
                                    <span>100% ({financialMetrics.currentValue.toFixed(0)}€)</span>
                                </div>

                                {financialMetrics.remainingBudget <= 0 && (
                                    <div className="mt-3 bg-red-50 text-red-600 px-3 py-2 rounded-lg text-xs font-bold border border-red-100 flex items-center gap-2 animate-pulse">
                                        <AlertTriangle size={14} />
                                        <span>PRECAUCIÓN: Límite financiero excedido.</span>
                                    </div>
                                )}
                            </div>
                        ) : null}
                    </div>

                    {/* Appliance Card */}
                    <div className="bg-white p-4 rounded-xl border border-slate-200 mb-6 shadow-sm relative group/card">
                        <div className="flex items-start justify-between mb-4">
                            <div>
                                <div className="flex items-center gap-2">
                                    <h4 className="text-xl font-bold text-slate-900 uppercase">{appliance.brand}</h4>
                                    <button onClick={() => setShowApplianceModal(true)} className="p-1.5 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition shadow-sm border border-blue-100">
                                        <Eye size={16} />
                                    </button>
                                </div>
                                <p className="text-slate-500 font-medium">{appliance.type} {appliance.model ? ("- " + appliance.model) : ''}</p>
                            </div>
                        </div>

                        <div className="space-y-3">
                            <ScoreRow icon={ShieldCheck} color="text-blue-500" label="Calidad de Marca" score={assessment.score_brand} description="Basado en la reputación." />
                            <ScoreRow icon={Calendar} color="text-amber-500" label={"Antigüedad: " + (financialMetrics?.age || '?') + " años"} score={assessment.score_age} description="Vida útil restante." />
                            <ScoreRow icon={Thermometer} color="text-purple-500" label="Instalación" score={assessment.score_installation} description="Accesibilidad." />
                            <ScoreRow icon={Banknote} color="text-green-500" label="Puntuación Financiera (V11)" score={financialMetrics?.financialScore ?? assessment.score_financial} description="0-10 basado en gasto/valor." />
                        </div>
                    </div>
                </div>

                {/* RIGHT: THE VERDICT */}
                <div className="w-1/2 p-6 flex flex-col bg-white overflow-y-auto">
                    <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-6">El Veredicto</h3>

                    {/* === ZONA CEMENTERIO (THE NECROMANCER UI) === */}
                    <div className="bg-slate-900 rounded-xl p-5 text-white shadow-2xl relative overflow-hidden group/cemetery border border-slate-700 mb-6">
                        <div className="absolute top-0 right-0 p-8 opacity-5">
                            <Ghost size={120} />
                        </div>

                        <div className="relative z-10">
                            <div className="flex justify-between items-start mb-4">
                                <div>
                                    <h4 className="text-sm font-black text-purple-400 uppercase tracking-widest flex items-center gap-2">
                                        <Skull size={16} /> Cementerio Financiero
                                    </h4>
                                    <p className="text-xs text-slate-400 mt-1">Recupera puntos para aprobar la reparación.</p>
                                </div>
                                <div className="bg-slate-800 px-3 py-1 rounded text-xs font-bold text-slate-300 border border-slate-700">
                                    Rescatable: {Math.max(0, 10 - (financialMetrics?.financialScore || 0))} pts
                                </div>
                            </div>

                            {/* Controls */}
                            <div className="flex items-center justify-between bg-slate-800/50 rounded-lg p-3 border border-slate-700 mb-4">
                                <button
                                    onClick={() => setLocalRecovered(Math.max(0, localRecovered - 1))}
                                    className="p-2 hover:bg-slate-700 rounded-lg transition text-slate-400 hover:text-white"
                                    disabled={processing}
                                >
                                    <Minus size={20} />
                                </button>

                                <div className="text-center">
                                    <span className="block text-3xl font-black text-purple-400">{localRecovered}</span>
                                    <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Puntos Rescatados</span>
                                </div>

                                <button
                                    onClick={() => {
                                        const lost = Math.max(0, 10 - (financialMetrics?.financialScore || 0));
                                        if (localRecovered < lost) setLocalRecovered(localRecovered + 1);
                                    }}
                                    className="p-2 hover:bg-slate-700 rounded-lg transition text-slate-400 hover:text-white"
                                    disabled={processing}
                                >
                                    <Plus size={20} />
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* === CLIENT EXPLANATION (NEW) === */}
                    <div className="mb-6 flex-1 flex flex-col">
                        <div className="flex justify-between items-center mb-2">
                            <h4 className="text-xs font-bold text-slate-700 uppercase">Explicación para el Cliente</h4>
                            <button
                                onClick={handleImproveText}
                                className="text-[10px] flex items-center gap-1 text-indigo-600 bg-indigo-50 px-2 py-1 rounded-full hover:bg-indigo-100 transition"
                            >
                                <Sparkles size={10} /> {explanation ? 'Mejorar Redacción con IA' : 'Generar Explicación Auto'}
                            </button>
                        </div>
                        <textarea
                            value={explanation}
                            onChange={(e) => setExplanation(e.target.value)}
                            placeholder="Escribe aquí por qué has decidido rescatar puntos (ej: cliente VIP, aparato histórico)..."
                            className="w-full flex-1 p-3 text-sm border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none resize-none bg-slate-50"
                        />
                    </div>

                    {/* ACTION BUTTON */}
                    <button
                        onClick={handleSaveRecovery}
                        disabled={processing || recalculating}
                        className="w-full py-4 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-bold transition flex items-center justify-center gap-2 shadow-lg shadow-purple-600/20 active:scale-95"
                    >
                        {processing ? <Loader2 size={18} className="animate-spin" /> : <Ghost size={18} />}
                        {localRecovered > 0 ? 'CONFIRMAR RESURRECCIÓN' : 'GUARDAR VEREDICTO'}
                    </button>

                    <button onClick={handleRecalculate} disabled={recalculating} className="mt-3 text-xs text-slate-400 underline text-center">
                        Forzar Recálculo
                    </button>
                </div>
            </div>

            {/* Modal Logic (same) */}
            {showApplianceModal && (
                <div className="fixed inset-0 bg-black/80 z-[60] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
                    <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden relative">
                        <button onClick={() => setShowApplianceModal(false)} className="absolute top-4 right-4 bg-white/50 hover:bg-white p-2 rounded-full text-slate-800 transition z-10">
                            <X size={24} />
                        </button>
                        <div className="p-6">
                            <h3 className="text-2xl font-bold text-slate-900 mb-1">{appliance.brand}</h3>
                            <p className="text-lg text-slate-600 font-medium mb-6">{appliance.type} {appliance.model}</p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

// Subcomponent
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
