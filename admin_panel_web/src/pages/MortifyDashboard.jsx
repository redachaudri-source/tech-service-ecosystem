import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import {
    Scale, AlertCircle, CheckCircle, XCircle, Clock,
    ChevronRight, Search, Filter, Settings, TrendingUp, Eye, History
} from 'lucide-react';
import MortifyVerdict from '../components/MortifyVerdict';
import MortifySettingsModal from '../components/MortifySettingsModal';

const MortifyDashboard = () => {
    const [rawAssessments, setRawAssessments] = useState([]);
    const [groupedAssessments, setGroupedAssessments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('PENDING_JUDGE'); // PENDING_JUDGE, HISTORY
    const [selectedAssessment, setSelectedAssessment] = useState(null);
    const [showSettings, setShowSettings] = useState(false);

    // History Modal State
    const [historyModalApplianceId, setHistoryModalApplianceId] = useState(null);

    // TEMPORARY DEBUG STATE
    const [debugError, setDebugError] = useState(null);

    useEffect(() => {
        fetchAssessments();

        // Realtime Subscription for Table
        const channel = supabase
            .channel('mortify-dashboard-table')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'mortify_assessments' },
                () => {
                    fetchAssessments(); // Auto-refresh list on any change
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    const fetchAssessments = async () => {
        setLoading(true);
        setDebugError(null);
        try {
            let query = supabase
                .from('mortify_assessments')
                .select(`
                    *,
                    client_appliances (
                        *,
                        profiles (
                            full_name,
                            address,
                            phone,
                            email
                        )
                    )
                `)
                .order('created_at', { ascending: false });

            const { data, error } = await query;
            if (error) throw error;

            setRawAssessments(data || []);
            processGroups(data || [], filter);

        } catch (err) {
            console.error('Error fetching assessments:', err);
            setDebugError(err.message || JSON.stringify(err));
        } finally {
            setLoading(false);
        }
    };

    // Re-process groups when filter changes
    useEffect(() => {
        processGroups(rawAssessments, filter);
    }, [filter, rawAssessments]);

    const processGroups = (data, currentFilter) => {
        // 1. Filter by Status
        let filtered = [];
        if (currentFilter === 'PENDING_JUDGE') {
            filtered = data.filter(a => a.status === 'PENDING_JUDGE');
        } else {
            filtered = data.filter(a => a.status !== 'PENDING_JUDGE');
        }

        // 2. Group by Appliance ID (Take latest)
        const groups = {};
        filtered.forEach(item => {
            const appId = item.appliance_id;
            if (!groups[appId]) {
                groups[appId] = item; // First one found is latest because of order('created_at', descending)
            }
        });

        setGroupedAssessments(Object.values(groups));
    };

    const handleVerdict = () => {
        setSelectedAssessment(null);
        fetchAssessments(); // Refresh list
    };

    // --- FINANCIAL INTELLIGENCE DASHBOARD (CALCULATED ON FLY) ---
    const stats = {
        ingresos: (rawAssessments.length * 9.99).toFixed(2),
        ahorro: (rawAssessments.filter(a => a.admin_verdict === 'CONFIRMED_VIABLE').length * 150).toFixed(2),
        tasa: rawAssessments.length > 0
            ? Math.round((rawAssessments.filter(a => a.ia_suggestion === 'VIABLE').length / rawAssessments.length) * 100)
            : 0
    };

    const MortifyStatsBanner = () => (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6 animate-in slide-in-from-top-4 duration-500">
            {/* CARD 1: INGRESOS */}
            <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-xl p-5 text-white shadow-lg border border-slate-700 relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                    <Scale size={64} />
                </div>
                <p className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-1">Ingresos Consultas (Est.)</p>
                <h3 className="text-3xl font-black">{stats.ingresos}€</h3>
                <div className="mt-2 flex items-center gap-2 text-xs text-green-400 bg-green-400/10 w-fit px-2 py-1 rounded-full">
                    <TrendingUp size={12} /> +12% vs mes pasado
                </div>
            </div>

            {/* CARD 2: AHORRO CLIENTE */}
            <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-4 text-emerald-500 opacity-10 group-hover:opacity-20 transition-opacity">
                    <Settings size={64} />
                </div>
                <p className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-1">Ahorro Generado (Clientes)</p>
                <h3 className="text-3xl font-black text-slate-800">{stats.ahorro}€</h3>
                <p className="text-xs text-slate-400 mt-2">En aparatos salvados de la basura.</p>
            </div>

            {/* CARD 3: TASA VIABILIDAD */}
            <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-4 text-blue-500 opacity-10 group-hover:opacity-20 transition-opacity">
                    <CheckCircle size={64} />
                </div>
                <p className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-1">Tasa Viabilidad IA</p>
                <h3 className="text-3xl font-black text-slate-800">{stats.tasa}%</h3>
                <div className="w-full bg-slate-100 h-1.5 rounded-full mt-3 overflow-hidden">
                    <div className="bg-blue-600 h-full rounded-full transition-all duration-1000" style={{ width: `${stats.tasa}%` }}></div>
                </div>
            </div>
        </div>
    );

    const HistoryModal = () => {
        if (!historyModalApplianceId) return null;

        // Filter ALL history for this appliance, regardless of status
        // Sort Chronologically (Oldest First) to show the "Story" top-down
        const historyData = rawAssessments
            .filter(a => a.appliance_id === historyModalApplianceId)
            .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

        const latest = historyData[historyData.length - 1]; // Latest is now last

        return (
            <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
                <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden max-h-[80vh] flex flex-col">
                    <div className="p-6 border-b border-slate-100 flex justify-between items-start bg-slate-50">
                        <div>
                            <h3 className="text-lg font-bold text-slate-800">Historial de Evaluaciones</h3>
                            <p className="text-sm text-slate-500 font-medium">
                                {latest?.client_appliances?.type} {latest?.client_appliances?.brand} - {latest?.client_appliances?.profiles?.full_name}
                            </p>
                        </div>
                        <button onClick={() => setHistoryModalApplianceId(null)} className="p-2 hover:bg-slate-200 rounded-full transition">
                            <XCircle size={20} className="text-slate-400" />
                        </button>
                    </div>

                    <div className="overflow-y-auto p-6 space-y-4">
                        {historyData.map((item, idx) => (
                            <div key={item.id} className="border border-slate-200 rounded-xl p-4 hover:border-indigo-200 transition-colors bg-white shadow-sm">
                                <div className="flex justify-between items-start mb-2">
                                    <div className="flex items-center gap-2">
                                        <span className={`px-2 py-1 rounded text-xs font-bold uppercase ${item.status === 'PENDING_JUDGE' ? 'bg-amber-100 text-amber-700' :
                                            item.admin_verdict === 'CONFIRMED_VIABLE' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                                            }`}>
                                            {item.status === 'PENDING_JUDGE' ? 'Pendiente' : item.admin_verdict}
                                        </span>
                                        <span className="text-xs text-slate-400 font-medium flex items-center gap-1">
                                            <Clock size={12} /> {new Date(item.created_at).toLocaleString()}
                                        </span>
                                    </div>
                                    <span className="font-mono text-xs font-bold text-slate-400">#{item.id.slice(0, 8)}</span>
                                </div>

                                <div className="grid grid-cols-2 gap-4 text-sm mb-3">
                                    <div>
                                        <span className="text-xs text-slate-400 uppercase font-bold block">Puntuación Total</span>
                                        <span className={`text-lg font-black ${item.total_score >= 18 ? 'text-green-600' : item.total_score < 10 ? 'text-red-600' : 'text-amber-600'}`}>
                                            {item.total_score} <span className="text-xs text-slate-400 font-medium">/ 24</span>
                                        </span>
                                    </div>
                                    <div>
                                        <span className="text-xs text-slate-400 uppercase font-bold block">Sugerencia IA</span>
                                        <span className="font-bold text-slate-700">{item.ia_suggestion}</span>
                                    </div>
                                </div>

                                <div className="bg-slate-50 p-3 rounded-lg text-xs text-slate-600 italic border border-slate-100">
                                    "{item.admin_note || 'Sin notas'}"
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="h-full flex flex-col space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                        <Scale className="text-indigo-600" />
                        Sala Mortify (Tribunal de Viabilidad)
                    </h1>
                    <p className="text-slate-500">Juzga la viabilidad de reparación de los aparatos.</p>
                </div>

                <button
                    onClick={() => setShowSettings(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 transition font-medium shadow-sm"
                >
                    <Settings size={18} />
                    Configuración Algoritmo
                </button>
            </div>

            {/* Filters & Actions */}
            <div className="flex justify-between items-center bg-white p-1 rounded-lg border border-slate-200 w-fit gap-2">
                <div className="flex">
                    <button
                        onClick={() => setFilter('PENDING_JUDGE')}
                        className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${filter === 'PENDING_JUDGE'
                            ? 'bg-indigo-50 text-indigo-700'
                            : 'text-slate-500 hover:text-slate-700'
                            }`}
                    >
                        Pendientes de Juicio
                    </button>
                    <button
                        onClick={() => setFilter('HISTORY')}
                        className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${filter === 'HISTORY'
                            ? 'bg-indigo-50 text-indigo-700'
                            : 'text-slate-500 hover:text-slate-700'
                            }`}
                    >
                        Histórico de Veredictos
                    </button>
                </div>

                {filter === 'HISTORY' && (
                    <button
                        onClick={async () => {
                            if (confirm("¿Estás seguro de BORRAR todo el historial de veredictos? Esta acción es para testing.")) {
                                const { error } = await supabase.rpc('fn_clear_mortify_history');
                                if (!error) {
                                    fetchAssessments();
                                    alert("Historial limpiado.");
                                } else {
                                    alert("Error: " + error.message);
                                }
                            }
                        }}
                        className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors"
                        title="Limpiar Historial (Testing)"
                    >
                        <History size={16} />
                    </button>
                )}
            </div>

            {/* FINANCIAL DASHBOARD */}
            {!selectedAssessment && <MortifyStatsBanner />}

            {/* Content */}
            {selectedAssessment ? (
                <MortifyVerdict
                    assessment={selectedAssessment}
                    onBack={() => setSelectedAssessment(null)}
                    onComplete={handleVerdict}
                />
            ) : (
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex-1">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                                <tr>
                                    <th className="px-6 py-4">Aparato / Cliente</th>
                                    <th className="px-6 py-4">Puntuación IA</th>
                                    <th className="px-6 py-4">Sugerencia</th>
                                    <th className="px-6 py-4">Fecha Solicitud</th>
                                    <th className="px-6 py-4 text-right">Acción</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {loading ? (
                                    <tr>
                                        <td colSpan="5" className="px-6 py-8 text-center text-slate-500">
                                            Cargando expedientes...
                                        </td>
                                    </tr>
                                ) : groupedAssessments.length === 0 ? (
                                    <tr>
                                        <td colSpan="5" className="px-6 py-12 text-center text-slate-400">
                                            {debugError ? (
                                                <div className="text-red-500 font-bold bg-red-50 p-4 rounded-lg border border-red-200">
                                                    ERROR CRÍTICO: {debugError}
                                                    <br />
                                                    <span className="text-xs font-mono text-slate-600">Revisa la consola (F12) o reporta este mensaje.</span>
                                                </div>
                                            ) : (
                                                <div className="flex flex-col items-center gap-2">
                                                    <CheckCircle size={32} className="text-slate-200" />
                                                    <p>No hay expedientes en esta categoría.</p>
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                ) : (
                                    groupedAssessments.map((a) => (
                                        <tr key={a.id} className="hover:bg-slate-50/50 transition-colors">
                                            <td className="px-6 py-4">
                                                <div className="font-medium text-slate-900">
                                                    {a.client_appliances?.type} {a.client_appliances?.brand}
                                                </div>
                                                <div className="text-xs text-slate-500">
                                                    {a.client_appliances?.profiles?.full_name}
                                                </div>
                                                {/* AUTO-TRIGGER BADGE */}
                                                {(a.admin_note || '').startsWith('Actualización automática') && (
                                                    <span className="inline-flex items-center gap-1 mt-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-700 border border-blue-200 uppercase tracking-wide">
                                                        <Clock size={10} /> Re-Evaluación
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-2">
                                                    <span className={`text-lg font-bold ${a.total_score >= 18 ? 'text-green-600' :
                                                        a.total_score < 4 ? 'text-red-500' : 'text-amber-500'
                                                        }`}>
                                                        {a.total_score}
                                                    </span>
                                                    <span className="text-xs text-slate-400">/ 24 pts</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${a.ia_suggestion === 'VIABLE' ? 'bg-green-100 text-green-800' :
                                                    a.ia_suggestion === 'OBSOLETE' ? 'bg-red-100 text-red-800' :
                                                        'bg-amber-100 text-amber-800'
                                                    }`}>
                                                    {a.ia_suggestion === 'VIABLE' ? 'VIABLE' :
                                                        a.ia_suggestion === 'OBSOLETE' ? 'OBSOLETO' : 'DUDOSO'}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-slate-500 flex items-center gap-2">
                                                <Clock size={14} />
                                                {new Date(a.created_at).toLocaleDateString()}
                                                <span className="text-xs ml-1">
                                                    {new Date(a.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <div className="flex items-center justify-end gap-2">
                                                    {/* NEW: VIEW HISTORY BUTTON */}
                                                    <button
                                                        onClick={() => setHistoryModalApplianceId(a.appliance_id)}
                                                        className="p-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 border border-blue-200 transition-colors"
                                                        title="Ver historial completo"
                                                    >
                                                        <Eye size={16} />
                                                    </button>

                                                    {filter === 'PENDING_JUDGE' ? (
                                                        <button
                                                            onClick={() => setSelectedAssessment(a)}
                                                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-xs font-bold shadow-sm shadow-indigo-200"
                                                        >
                                                            <Scale size={14} />
                                                            JUZGAR
                                                        </button>
                                                    ) : (
                                                        <span className={`text-xs font-bold ${a.admin_verdict === 'CONFIRMED_VIABLE' ? 'text-green-600' : 'text-red-600'
                                                            }`}>
                                                            {a.admin_verdict === 'CONFIRMED_VIABLE' ? 'VIABLE ✅' : 'OBSOLETO ❌'}
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
            {showSettings && (
                <MortifySettingsModal onClose={() => setShowSettings(false)} />
            )}

            <HistoryModal />
        </div>
    );
};

export default MortifyDashboard;
