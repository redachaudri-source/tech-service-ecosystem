import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import {
    ArrowLeft, CheckCircle, XCircle, AlertTriangle,
    Thermometer, ShieldCheck, Banknote, Calendar,
    Eye, Sparkles, X, Info, Loader2, Bot, MapPin, Phone
} from 'lucide-react';
import ViabilityLabel from './ViabilityLabel';

const MortifyVerdict = ({ assessment, onBack, onComplete }) => {
    const [processing, setProcessing] = useState(false);
    const [note, setNote] = useState('');
    const [showApplianceModal, setShowApplianceModal] = useState(false);

    const { client_appliances: appliance } = assessment;

    if (!appliance) {
        return (
            <div className="p-8 text-center bg-red-50 text-red-600 rounded-xl border border-red-200">
                <AlertTriangle size={48} className="mx-auto mb-4 opacity-50" />
                <h3 className="text-lg font-bold">Error de Datos</h3>
                <p>No se encontraron datos del aparato para este expediente.</p>
                <button onClick={onBack} className="mt-4 px-4 py-2 bg-white border border-red-200 rounded-lg hover:bg-red-50 text-sm font-bold">
                    Volver
                </button>
            </div>
        );
    }

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

            // 4. Calc Age Score (Granular 0-5)
            let newScoreAge = 0;
            const currentYear = new Date().getFullYear();
            const pYear = assessment.input_year || appData.purchase_year;
            if (pYear) {
                const age = currentYear - parseInt(pYear);
                if (age <= 2) newScoreAge = 5;
                else if (age <= 4) newScoreAge = 4;
                else if (age <= 6) newScoreAge = 3;
                else if (age <= 8) newScoreAge = 2;
                else if (age <= 10) newScoreAge = 1;
                else newScoreAge = 0;
            }

            // 5. Calc Installation Score (Granular 0-5)
            let newScoreInstall = 5; // Default max (House/Chalet)
            const housingType = (assessment.client_appliances?.housing_type || appData.housing_type || 'PISO');

            if (housingType === 'PISO') {
                const floor = parseInt(assessment.input_floor_level !== null ? assessment.input_floor_level : (appData.floor_level || 0));
                if (floor === 0) newScoreInstall = 5;
                else if (floor === 1) newScoreInstall = 4;
                else if (floor === 2) newScoreInstall = 3;
                else if (floor === 3) newScoreInstall = 2;
                else if (floor === 4) newScoreInstall = 1;
                else newScoreInstall = 0;
            }

            // 6. Calc Financial Score
            const newScoreFinancial = assessment.score_financial; // Keep existing (deprecated/penalty logic separate)

            // 7. Total (Max 14)
            const newTotal = newScoreBrand + newScoreAge + newScoreInstall + newScoreFinancial;

            let newSuggestion = 'DOUBTFUL';
            if (newTotal >= 10) newSuggestion = 'VIABLE';
            else if (newTotal <= 3) newSuggestion = 'OBSOLETE';

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
                    admin_decision_date: new Date().toISOString()
                })
                .eq('id', assessment.id);

            if (asmtError) throw asmtError;

            // FORCE SIGNAL to Client: Touch the appliance record to trigger Realtime on the client side
            // (Client listeners on 'client_appliances' are often more reliable than joined RLS on mortify_assessments)
            await supabase
                .from('client_appliances')
                .update({ updated_at: new Date().toISOString() })
                .eq('id', assessment.appliance_id);

            onComplete();
        } catch (err) {
            console.error('Error saving verdict:', err);
            alert(`Error al guardar el veredicto: ${err.message || JSON.stringify(err)}`);
        } finally {
            setProcessing(false);
        }
    };

    // "AI" Text Improver (Heuristic)
    const handleImproveText = () => {
        if (!note.trim()) {
            alert("Escribe algo primero para mejorar.");
            return;
        }

        setProcessing(true);
        // Simulate advanced AI processing
        setTimeout(() => {
            const improvements = [
                "Tras el análisis técnico realizado según el protocolo Mortify...",
                "Se ha detectado una incidencia crítica en el sistema...",
                "La evaluación forense del aparato indica..."
            ];

            // Basic heuristic improvement: Make it sound professional
            const improved = `Tras el análisis técnico, se observa que: ${note.toLowerCase()}. \n\nConsiderando la antigüedad del aparato y el coste estimado de reparación, la relación costo-beneficio sugiere que la reparación NO es la opción más eficiente para el cliente. Se recomienda proceder con la sustitución del equipo para garantizar una solución duradera.\n\nFirma: Departamento Técnico.`;

            setNote(improved);
            setProcessing(false);
        }, 1200);
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
                            <div className="text-right flex items-center justify-end w-full md:w-auto">
                                {/* Banner removed from here */}
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
                                label={`Antigüedad: ${assessment.input_year ? (new Date().getFullYear() - assessment.input_year) : '?'} años (${assessment.input_year || '?'})`}
                                score={assessment.score_age}
                                description="Vida útil restante estimada. 0-2 años (5pts) ... >10 años (0pts)."
                            />
                            <ScoreRow
                                icon={Thermometer} color="text-purple-500"
                                label={`Instalación (${assessment.input_floor_level !== undefined ? (assessment.input_floor_level === 0 ? 'Bajo/Casa' : `Piso ${assessment.input_floor_level}`) : '?'})`}
                                score={assessment.score_installation}
                                description="Accesibilidad y dificultad de instalación."
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

                        {/* MORTIFY BANNER (CENTERED) */}
                        <div className="w-full flex justify-center mb-2">
                            <ViabilityLabel score={assessment.total_score} />
                        </div>

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
                                    onClick={handleImproveText}
                                    disabled={processing}
                                    className="absolute bottom-2 right-2 text-xs text-purple-600 hover:bg-purple-50 px-2 py-1 rounded-full flex items-center gap-1 transition-colors"
                                >
                                    <Bot size={14} />
                                    {processing ? 'Mejorando...' : 'Mejorar con IA'}
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

                        {(appliance.image_url || appliance.photo_url || appliance.image) ? (
                            <div className="h-64 overflow-hidden bg-slate-100 flex items-center justify-center group cursor-pointer" onClick={() => window.open(appliance.image_url || appliance.photo_url || appliance.image, '_blank')}>
                                <img src={appliance.image_url || appliance.photo_url || appliance.image} alt="Aparato" className="w-full h-full object-cover transition-transform group-hover:scale-105" />
                                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                                    <span className="bg-white/90 text-xs font-bold px-3 py-1 rounded-full shadow-lg">Abrir Original</span>
                                </div>
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

                            <div className="grid grid-cols-2 gap-4 text-sm mb-6">
                                <div className="bg-slate-50 p-3 rounded-lg">
                                    <span className="text-slate-400 text-xs font-bold uppercase block mb-1">Año Compra</span>
                                    <span className="font-bold text-slate-900">{appliance.purchase_year || 'N/A'}</span>
                                </div>
                                <div className="bg-slate-50 p-3 rounded-lg">
                                    <span className="text-slate-400 text-xs font-bold uppercase block mb-1">ID Sistema</span>
                                    <span className="font-mono text-slate-900 truncate" title={appliance.id}>{appliance.id?.slice(0, 8)}...</span>
                                </div>
                            </div>

                            {/* Client Info Section within Modal */}
                            <div className="border-t border-slate-100 pt-4">
                                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Propietario</h4>
                                <div className="flex items-center gap-3 mb-2">
                                    <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold">
                                        {clientName.charAt(0)}
                                    </div>
                                    <div>
                                        <p className="font-bold text-slate-900">{clientName}</p>
                                        <p className="text-xs text-slate-500">{appliance.profiles?.email}</p>
                                    </div>
                                </div>
                                <div className="space-y-1 pl-11">
                                    <p className="text-sm text-slate-600 flex items-center gap-2">
                                        <Phone size={14} className="text-slate-400" />
                                        {appliance.profiles?.phone || 'Sin teléfono'}
                                    </p>
                                    <p className="text-sm text-slate-600 flex items-center gap-2">
                                        <MapPin size={14} className="text-slate-400" />
                                        {appliance.profiles?.address || 'Sin dirección'}
                                    </p>
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
