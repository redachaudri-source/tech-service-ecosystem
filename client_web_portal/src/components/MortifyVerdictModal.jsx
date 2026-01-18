import React, { useState, useEffect } from 'react';
import ViabilityLabel from './ViabilityLabel';
import { Quote, Briefcase, Bot, CheckCircle, Ghost, Info } from 'lucide-react';
import { supabase } from '../lib/supabase';

const MortifyVerdictModal = ({ assessment, onClose }) => {
    const [financials, setFinancials] = useState(null);
    const [loadingFin, setLoadingFin] = useState(true);

    if (!assessment) return null;

    const { admin_note, ia_suggestion, total_score, admin_recovered_points } = assessment;

    // Load Financial Context (Similar to Admin Panel V13 Logic)
    useEffect(() => {
        const loadFin = async () => {
            if (!assessment.client_appliances) return;
            const app = assessment.client_appliances;

            try {
                // 1. Get Categories for Default Price
                const { data: catData } = await supabase.from('appliance_category_defaults')
                    .select('*')
                    .ilike('category_name', app.type)
                    .maybeSingle();

                const marketPrice = catData?.average_market_price || 700;
                const lifespan = catData?.average_lifespan_years || 10;
                const bScore = assessment.score_brand || 1;

                // Prestige Multiplier
                let multiplier = 1.0;
                if (bScore >= 4) multiplier = 2.2;
                else if (bScore === 3) multiplier = 1.6;
                else if (bScore === 2) multiplier = 1.25;

                const prestigePrice = marketPrice * multiplier;

                // Age & Depreciation
                const appYear = assessment.input_year || app.purchase_year;
                const currentYear = new Date().getFullYear();
                let age = appYear ? (currentYear - parseInt(appYear)) : 0;
                if (age < 0) age = 0;

                let currentValue = 0;
                if (age < lifespan) {
                    currentValue = prestigePrice * (1.0 - (age / lifespan));
                }

                // Total Spent
                const { data: tickets } = await supabase
                    .from('tickets')
                    .select('final_price')
                    .eq('appliance_id', app.id)
                    .in('status', ['finalizado', 'pagado']);

                const totalSpent = tickets?.reduce((sum, t) => sum + (Number(t.final_price) || 0), 0) || 0;

                // Limits (Amnesty Logic Simplified)
                let limitRatio = 0.51;
                if (age >= 3 && age <= 7) limitRatio = 0.70;

                const ruinLimit = currentValue * limitRatio;
                const remainingBudget = Math.max(0, ruinLimit - totalSpent);

                setFinancials({
                    currentValue,
                    totalSpent,
                    limitRatio,
                    ruinLimit,
                    remainingBudget
                });
            } catch (err) {
                console.error("Error loading financials for client modal:", err);
            } finally {
                setLoadingFin(false);
            }
        };
        loadFin();
    }, [assessment]);


    // Determine content source logic
    const hasAdminNote = !!(admin_note && admin_note.trim().length > 0);
    const app = assessment.client_appliances || {};
    const type = app.type || 'aparato';
    const brand = app.brand || '';
    const pYear = assessment.input_year || app.purchase_year;
    const currentYear = new Date().getFullYear();
    const age = pYear ? (currentYear - parseInt(pYear)) : 'unos';

    const getFallBackText = (suggestion) => {
        const baseInfo = `su ${type} ${brand} de ${age} años`;
        if (!suggestion) return `El análisis de ${baseInfo} ha concluido con una puntuación basada en el valor de mercado actual y el coste estimado de reparación.`;
        switch (suggestion) {
            case 'VIABLE': return `Excelente noticia. Su ${type} ${brand} conserva un alto valor pese a tener ${age} años. La reparación es una inversión totalmente recomendada.`;
            case 'DOUBTFUL': return `Análisis complejo para ${baseInfo}. El coste de reparación es considerable respecto al valor actual del equipo. Recomendamos proceder con cautela.`;
            case 'OBSOLETE': return `Desaconsejado. Su ${type} ${brand} ha superado su vida útil económica (${age} años) o el coste de reparación excede el límite de seguridad.`;
            default: return suggestion;
        }
    }

    const content = hasAdminNote ? admin_note : getFallBackText(ia_suggestion);
    const authorLabel = hasAdminNote ? "Opinión del Experto Técnico" : "Análisis Automático (IA)";
    const AuthorIcon = hasAdminNote ? Briefcase : Bot;
    const themeColor = hasAdminNote ? "text-blue-700 bg-blue-100" : "text-purple-700 bg-purple-100";

    return (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 animate-in fade-in backdrop-blur-sm">
            <div className="bg-white rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl relative flex flex-col max-h-[90vh]">

                {/* Close Button */}
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 bg-white/80 hover:bg-white text-slate-400 hover:text-slate-800 p-2 rounded-full transition z-10 backdrop-blur-sm border border-slate-100 shadow-sm"
                >
                    ✕
                </button>

                <div className="overflow-y-auto custom-scrollbar">
                    {/* Header / V-Label Area */}
                    <div className="bg-slate-50 p-8 pb-8 border-b border-slate-100 flex flex-col items-center text-center relative">
                        <h2 className="text-xl font-bold text-slate-800 mb-6 relative z-10">Dictamen de Viabilidad</h2>
                        <div className="w-full max-w-[320px] transform hover:scale-105 transition duration-500 relative z-10 shadow-2xl rounded-2xl">
                            <ViabilityLabel score={total_score} size="lg" />
                        </div>

                        {/* NECROMANCY BADGE (If restored points > 0) */}
                        {admin_recovered_points > 0 && (
                            <div className="mt-6 flex items-center gap-2 px-4 py-2 bg-indigo-900 text-white rounded-full shadow-lg shadow-indigo-500/30 border border-indigo-400/50 relative z-10 animate-in slide-in-from-bottom-2">
                                <Ghost size={14} className="text-indigo-300" />
                                <span className="text-xs font-bold uppercase tracking-wide">
                                    Bonus de Calidad: <span className="text-indigo-300">+{admin_recovered_points} pts</span>
                                </span>
                            </div>
                        )}

                        <div className="absolute top-0 left-0 w-full h-full overflow-hidden opacity-30 pointer-events-none">
                            <div className="absolute top-[-50px] right-[-50px] w-[200px] h-[200px] bg-blue-200/50 rounded-full blur-[80px]"></div>
                            <div className="absolute bottom-[-50px] left-[-50px] w-[200px] h-[200px] bg-purple-200/50 rounded-full blur-[80px]"></div>
                        </div>
                    </div>

                    {/* FINANCIAL INSIGHTS (The "Premium" Data) */}
                    <div className="bg-white px-8 pt-6 pb-2">
                        <div className="p-5 bg-gradient-to-br from-slate-50 to-indigo-50/30 rounded-2xl border border-indigo-100 shadow-sm relative overflow-hidden">
                            <div className="flex justify-between items-start mb-4 relative z-10">
                                <div>
                                    <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1">Valor Actual Estimado</p>
                                    <h3 className="text-2xl font-black text-slate-800">
                                        {loadingFin || !financials ? '...' : financials.currentValue.toFixed(0)}€
                                    </h3>
                                </div>
                                <div className="text-right">
                                    <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1">Margen de Inversión</p>
                                    <h3 className={`text-2xl font-black ${financials?.remainingBudget > 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                                        {loadingFin || !financials ? '...' : financials.remainingBudget.toFixed(0)}€
                                    </h3>
                                </div>
                            </div>

                            {/* The Bar */}
                            {financials && (
                                <div className="relative pt-2">
                                    <div className="flex justify-between text-[10px] font-bold text-slate-400 mb-1.5 uppercase tracking-wide">
                                        <span>Gastado: {financials.totalSpent.toFixed(0)}€</span>
                                        <span>Límite Seguro: {financials.ruinLimit.toFixed(0)}€</span>
                                    </div>
                                    <div className="h-4 w-full bg-slate-200 rounded-full overflow-hidden flex relative shadow-inner">
                                        {/* Safe Zone (Green to Emerald) */}
                                        <div className="h-full bg-gradient-to-r from-emerald-400 to-teal-500" style={{ width: (financials.limitRatio * 100) + '%' }}></div>
                                        {/* Danger Zone (Rose) */}
                                        <div className="h-full bg-rose-100 pattern-diagonal-lines" style={{ width: (100 - (financials.limitRatio * 100)) + '%' }}></div>

                                        {/* Needle / Marker */}
                                        <div
                                            className="absolute top-0 bottom-0 w-1.5 bg-slate-800 z-10 shadow-[0_0_10px_rgba(0,0,0,0.3)] transition-all duration-1000 ease-out"
                                            style={{ left: Math.min(100, (financials.totalSpent / financials.currentValue) * 100) + '%' }}
                                        >
                                            <div className="absolute -top-1 -left-[3px] w-3 h-3 bg-slate-800 rounded-full"></div>
                                        </div>
                                    </div>
                                    {financials.remainingBudget <= 0 && (
                                        <p className="text-[10px] text-rose-500 font-bold mt-2 text-center bg-rose-50 py-1 rounded border border-rose-100">
                                            ⚠️ Has superado el límite de inversión recomendado.
                                        </p>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Verdict Text Content */}
                    <div className="p-6 md:p-8 bg-white relative">
                        {/* Icon */}
                        <div className="absolute top-6 left-6 text-slate-100 -z-0 opacity-50">
                            <Quote size={80} />
                        </div>

                        <div className="relative z-10">
                            <div className="flex items-center gap-2 mb-4">
                                <div className={`p-1.5 rounded-lg ${themeColor}`}>
                                    <AuthorIcon size={16} />
                                </div>
                                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                                    {authorLabel}
                                </span>
                            </div>

                            <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 text-slate-700 leading-relaxed text-lg font-medium shadow-sm relative">
                                <div className="absolute -top-2 left-6 w-4 h-4 bg-slate-50 border-t border-l border-slate-100 transform rotate-45"></div>
                                "{content}"
                            </div>

                            {!hasAdminNote && (
                                <p className="text-[10px] text-slate-400 mt-3 text-center italic">
                                    * Nota generada por algoritmos de Mortify Intelligence.
                                </p>
                            )}
                        </div>

                        <div className="mt-8">
                            <button
                                onClick={onClose}
                                className="w-full bg-slate-900 text-white py-3.5 rounded-xl font-bold hover:bg-slate-800 transition shadow-lg active:scale-95 flex items-center justify-center gap-2"
                            >
                                <CheckCircle size={18} /> Entendido
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default MortifyVerdictModal;
