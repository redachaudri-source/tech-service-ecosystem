import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import {
    Scale, AlertCircle, CheckCircle, XCircle, Clock,
    ChevronRight, Search, Filter, Settings
} from 'lucide-react';
import MortifyVerdict from '../components/MortifyVerdict';
import MortifySettingsModal from '../components/MortifySettingsModal';

const MortifyDashboard = () => {
    const [assessments, setAssessments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('PENDING_JUDGE'); // PENDING_JUDGE, HISTORY
    const [selectedAssessment, setSelectedAssessment] = useState(null);
    const [showSettings, setShowSettings] = useState(false);

    // TEMPORARY DEBUG STATE
    const [debugError, setDebugError] = useState(null);

    useEffect(() => {
        fetchAssessments();
    }, [filter]);

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
                            address
                        )
                    )
                `)
                .order('created_at', { ascending: false });

            if (filter === 'PENDING_JUDGE') {
                query = query.eq('status', 'PENDING_JUDGE');
            } else {
                query = query.neq('status', 'PENDING_JUDGE');
            }

            const { data, error } = await query;
            if (error) throw error;
            setAssessments(data || []);
        } catch (err) {
            console.error('Error fetching assessments:', err);
            setDebugError(err.message || JSON.stringify(err));
        } finally {
            setLoading(false);
        }
    };

    const handleVerdict = () => {
        setSelectedAssessment(null);
        fetchAssessments(); // Refresh list
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

            {/* Filters */}
            <div className="flex bg-white p-1 rounded-lg border border-slate-200 w-fit">
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
                                ) : assessments.length === 0 ? (
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
                                    assessments.map((a) => (
                                        <tr key={a.id} className="hover:bg-slate-50/50 transition-colors">
                                            <td className="px-6 py-4">
                                                <div className="font-medium text-slate-900">
                                                    {a.client_appliances?.type} {a.client_appliances?.brand}
                                                </div>
                                                <div className="text-xs text-slate-500">
                                                    {a.client_appliances?.profiles?.full_name}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-2">
                                                    <span className={`text-lg font-bold ${a.total_score >= 5 ? 'text-green-600' :
                                                        a.total_score < 3 ? 'text-red-500' : 'text-amber-500'
                                                        }`}>
                                                        {a.total_score}
                                                    </span>
                                                    <span className="text-xs text-slate-400">/ 8 pts</span>
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
        </div>
    );
};

export default MortifyDashboard;
