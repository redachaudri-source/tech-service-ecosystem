import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { getViabilityStatus } from '../utils/viability';
import { ShieldCheck, AlertTriangle, CheckCircle, Save, Loader2, Gauge } from 'lucide-react';

const ViabilityJudge = ({ applianceId, applianceSnapshot }) => {
    const [appliance, setAppliance] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    // Local edit states
    const [editYear, setEditYear] = useState('');
    const [editValue, setEditValue] = useState('');
    const [editNote, setEditNote] = useState('');

    useEffect(() => {
        if (applianceId) {
            fetchAppliance();
        } else if (applianceSnapshot) {
            // Fallback if we only have snapshot (read-only mode essentially, or limited)
            setAppliance(applianceSnapshot);
            setLoading(false);
        }
    }, [applianceId]);

    const fetchAppliance = async () => {
        try {
            const { data, error } = await supabase
                .from('client_appliances')
                .select('*')
                .eq('id', applianceId)
                .single();

            if (data) {
                setAppliance(data);
                // Init form values
                setEditYear(data.purchase_year || '');
                setEditValue(data.initial_value_estimate || '');
                setEditNote(data.expert_note || '');
            }
        } catch (err) {
            console.error('Error fetching appliance for judge:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleUpdate = async (field, value) => {
        if (!applianceId) return;
        setSaving(true);

        try {
            const updates = { [field]: value };

            // Optimistic update for UI responsiveness
            setAppliance(prev => ({ ...prev, ...updates }));

            const { error } = await supabase
                .from('client_appliances')
                .update(updates)
                .eq('id', applianceId);

            if (error) throw error;

        } catch (err) {
            console.error('Error updating appliance:', err);
            // Revert on error would go here ideally
        } finally {
            setSaving(false);
        }
    };

    const handleBlur = (field, value) => {
        // Only update if value changed
        if (appliance && appliance[field] != value) {
            handleUpdate(field, value);
        }
    };

    const toggleOverride = () => {
        handleUpdate('expert_override', !appliance.expert_override);
    };

    if (loading) return <div className="p-4 flex justify-center"><Loader2 className="animate-spin text-slate-400" /></div>;
    if (!appliance) return null; // Should not happen if ID exists

    const verdict = getViabilityStatus(appliance);

    // Styles mapping
    const colorStyles = {
        green: 'bg-green-100 text-green-800 border-green-200',
        red: 'bg-red-100 text-red-800 border-red-200',
        blue: 'bg-blue-100 text-blue-800 border-blue-200',
        gray: 'bg-slate-100 text-slate-600 border-slate-200'
    };

    const Icon = verdict.icon === 'ShieldCheck' ? ShieldCheck :
        verdict.icon === 'AlertTriangle' ? AlertTriangle : CheckCircle;

    return (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden animate-in fade-in duration-500">
            {/* Header / Verdict Bar */}
            <div className={`px-4 py-3 border-b flex items-center justify-between ${colorStyles[verdict.color] || colorStyles.gray}`}>
                <div className="flex items-center gap-2">
                    <Icon size={18} />
                    <span className="font-bold text-sm tracking-wide uppercase">{verdict.label}</span>
                </div>
                {saving && <Loader2 size={14} className="animate-spin opacity-50" />}
            </div>

            {/* Controls */}
            <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50/50">

                {/* Data Inputs */}
                <div className="space-y-3">
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                        <Gauge size={12} /> Datos Técnicos
                    </h4>
                    <div className="flex gap-2">
                        <div className="flex-1">
                            <label className="block text-[10px] text-slate-500 font-bold mb-0.5">AÑO COMPRA</label>
                            <input
                                type="number"
                                placeholder="Ej: 2018"
                                className="w-full text-sm px-2 py-1.5 border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                                value={editYear}
                                onChange={(e) => setEditYear(e.target.value)}
                                onBlur={(e) => handleBlur('purchase_year', e.target.value)}
                            />
                        </div>
                        <div className="flex-1">
                            <label className="block text-[10px] text-slate-500 font-bold mb-0.5">VALOR APX (€)</label>
                            <input
                                type="number"
                                placeholder="Ej: 400"
                                className="w-full text-sm px-2 py-1.5 border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                onBlur={(e) => handleBlur('initial_value_estimate', e.target.value)}
                            />
                        </div>
                    </div>
                </div>

                {/* God Mode Switch */}
                <div className="space-y-3 flex flex-col justify-between">
                    <div className="flex items-center justify-between bg-white p-2 rounded-lg border border-slate-200 shadow-sm">
                        <div className="flex items-center gap-2">
                            <div className={`p-1.5 rounded-full ${appliance.expert_override ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-400'}`}>
                                <ShieldCheck size={16} />
                            </div>
                            <div>
                                <span className="block text-xs font-bold text-slate-700">Modo Experto</span>
                                <span className="block text-[9px] text-slate-500">Forzar Viabilidad</span>
                            </div>
                        </div>
                        <button
                            onClick={toggleOverride}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${appliance.expert_override ? 'bg-blue-600' : 'bg-slate-300'}`}
                        >
                            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${appliance.expert_override ? 'translate-x-6' : 'translate-x-1'}`} />
                        </button>
                    </div>

                    {/* Expert Note (Conditional) */}
                    {appliance.expert_override && (
                        <input
                            type="text"
                            placeholder="Justificación del experto..."
                            className="w-full text-xs px-2 py-1.5 bg-blue-50 border border-blue-200 text-blue-800 rounded focus:outline-none placeholder-blue-300/70"
                            value={editNote}
                            onChange={(e) => setEditNote(e.target.value)}
                            onBlur={(e) => handleBlur('expert_note', e.target.value)}
                        />
                    )}
                </div>
            </div>
        </div>
    );
};

export default ViabilityJudge;
