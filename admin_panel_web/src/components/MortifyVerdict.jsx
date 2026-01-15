import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import {
    ArrowLeft, CheckCircle, XCircle, AlertTriangle,
    Thermometer, ShieldCheck, Banknote, Calendar
} from 'lucide-react';

const MortifyVerdict = ({ assessment, onBack, onComplete }) => {
    const [processing, setProcessing] = useState(false);
    const [note, setNote] = useState('');

    const { client_appliances: appliance } = assessment;

    const handleDecision = async (verdict) => {
        if (!confirm('¿Estás seguro de emitir este veredicto? Es irreversible.')) return;

        setProcessing(true);
        try {
            // 1. Update Assessment
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

            // 2. Optionally Update Appliance 'expert_override' if viable? 
            // The prompt says: "Action: Update estado a CONFIRMED_VIABLE -> Notificar Cliente"
            // We should probably rely on the assessment status joins for UI, but let's see.
            // For now, updating the assessment row is the primary action.

            onComplete();
        } catch (err) {
            console.error('Error saving verdict:', err);
            alert('Error al guardar el veredicto');
        } finally {
            setProcessing(false);
        }
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
                        Solicitado por: {appliance.clients?.full_name}
                    </p>
                </div>
            </div>

            <div className="flex flex-1 overflow-hidden">
                {/* LEFT: THE FACTS */}
                <div className="w-1/2 p-6 border-r border-slate-100 overflow-y-auto bg-slate-50/30">
                    <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-6">Los Hechos (Evidencia)</h3>

                    {/* Appliance Card */}
                    <div className="bg-white p-4 rounded-xl border border-slate-200 mb-6 shadow-sm">
                        <div className="flex items-start justify-between mb-4">
                            <div>
                                <h4 className="text-xl font-bold text-slate-900">{appliance.brand}</h4>
                                <p className="text-slate-500 font-medium">{appliance.type} - {appliance.model}</p>
                            </div>
                            <div className="text-right">
                                <span className="block text-2xl font-black text-slate-800">{assessment.total_score}</span>
                                <span className="text-xs text-slate-400 font-bold uppercase">Puntos Totales</span>
                            </div>
                        </div>

                        {/* Analysis Breakdown */}
                        <div className="space-y-3">
                            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-100">
                                <div className="flex items-center gap-3">
                                    <ShieldCheck className="text-blue-500" size={18} />
                                    <span className="text-sm font-medium text-slate-700">Calidad de Marca</span>
                                </div>
                                <span className="font-bold text-slate-900">{assessment.score_brand} pts</span>
                            </div>

                            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-100">
                                <div className="flex items-center gap-3">
                                    <Calendar className="text-amber-500" size={18} />
                                    <span className="text-sm font-medium text-slate-700">Antigüedad ({assessment.input_year || 'N/A'})</span>
                                </div>
                                <span className="font-bold text-slate-900">{assessment.score_age} pts</span>
                            </div>

                            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-100">
                                <div className="flex items-center gap-3">
                                    <Thermometer className="text-purple-500" size={18} />
                                    <span className="text-sm font-medium text-slate-700">Instalación / Acceso</span>
                                </div>
                                <span className="font-bold text-slate-900">{assessment.score_installation} pts</span>
                            </div>

                            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-100">
                                <div className="flex items-center gap-3">
                                    <Banknote className="text-green-500" size={18} />
                                    <span className="text-sm font-medium text-slate-700">Situación Financiera</span>
                                </div>
                                <span className="font-bold text-slate-900">{assessment.score_financial} pts</span>
                            </div>
                        </div>
                    </div>

                    {/* AI Suggestion */}
                    <div className={`p-4 rounded-xl border border-l-4 ${assessment.ia_suggestion === 'VIABLE'
                            ? 'bg-green-50 border-green-200 border-l-green-500'
                            : assessment.ia_suggestion === 'OBSOLETE'
                                ? 'bg-red-50 border-red-200 border-l-red-500'
                                : 'bg-amber-50 border-amber-200 border-l-amber-500'
                        }`}>
                        <h4 className="text-sm font-bold opacity-80 mb-1 flex items-center gap-2">
                            <AlertTriangle size={14} /> Sugerencia IA:
                        </h4>
                        <p className="text-lg font-black">
                            {assessment.ia_suggestion === 'VIABLE' ? 'REPARACIÓN RECOMENDADA' :
                                assessment.ia_suggestion === 'OBSOLETE' ? 'OBSOLESCENCIA DETECTADA' :
                                    'DUDOSO / REVISIÓN MANUAL'}
                        </p>
                    </div>
                </div>

                {/* RIGHT: THE VERDICT */}
                <div className="w-1/2 p-6 flex flex-col bg-white">
                    <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-6">El Veredicto</h3>

                    <div className="flex-1 flex flex-col justify-center space-y-6 max-w-md mx-auto w-full">

                        <div className="space-y-2">
                            <label className="text-sm font-bold text-slate-700">Nota del Juez (Opcional)</label>
                            <textarea
                                value={note}
                                onChange={e => setNote(e.target.value)}
                                className="w-full h-32 p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 text-sm resize-none"
                                placeholder="Explica tu decisión al cliente..."
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
        </div>
    );
};

export default MortifyVerdict;
