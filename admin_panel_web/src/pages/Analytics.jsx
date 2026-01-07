import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { TrendingUp, AlertTriangle, MapPin, DollarSign, Award, Clock } from 'lucide-react';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d'];

const Analytics = () => {
    const [loading, setLoading] = useState(true);
    const [kpiData, setKpiData] = useState(null);
    const [timeRange, setTimeRange] = useState('30'); // days

    useEffect(() => {
        fetchAnalytics();
    }, [timeRange]);

    const fetchAnalytics = async () => {
        setLoading(true);
        try {
            // Calculate Dates
            const endDate = new Date();
            const startDate = new Date();
            startDate.setDate(endDate.getDate() - parseInt(timeRange));

            // Call RPC
            const { data, error } = await supabase.rpc('get_analytics_kpis', {
                start_date: startDate.toISOString(),
                end_date: endDate.toISOString()
            });

            if (error) throw error;
            setKpiData(data);
        } catch (err) {
            console.error("Error fetching analytics:", err);
        } finally {
            setLoading(false);
        }
    };

    if (loading) return (
        <div className="flex items-center justify-center h-screen bg-slate-50">
            <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
        </div>
    );

    if (!kpiData) return <div className="p-10 text-center">No hay datos disponibles.</div>;

    const { top_brands, daily_rhythm, tech_ranking, heatmap } = kpiData;

    return (
        <div className="p-6 max-w-7xl mx-auto space-y-6 pb-20">
            {/* HEADER */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                        <TrendingUp className="text-blue-600" />
                        Centro de Inteligencia (BI)
                    </h1>
                    <p className="text-slate-500">Análisis de rendimiento y tendencias de mercado.</p>
                </div>

                <div className="bg-white p-1 rounded-lg border border-slate-200 shadow-sm flex items-center">
                    <span className="px-3 text-xs font-bold text-slate-400 uppercase tracking-wider">Rango:</span>
                    <select
                        className="p-1 text-sm font-medium text-slate-700 bg-transparent outline-none cursor-pointer"
                        value={timeRange}
                        onChange={(e) => setTimeRange(e.target.value)}
                    >
                        <option value="7">Últimos 7 días</option>
                        <option value="30">Últimos 30 días</option>
                        <option value="90">Último Trimestre</option>
                        <option value="365">Anual</option>
                    </select>
                </div>
            </div>

            {/* KPI CARDS ROW */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-white p-5 rounded-xl border border-slate-100 shadow-sm flex items-center justify-between">
                    <div>
                        <p className="text-xs font-bold text-slate-400 uppercase">Volumen Total</p>
                        <p className="text-2xl font-bold text-slate-800">
                            {top_brands?.reduce((acc, curr) => acc + curr.count, 0) || 0}
                            <span className="text-sm font-normal text-slate-400 ml-1">tickets</span>
                        </p>
                    </div>
                    <div className="p-3 bg-blue-50 text-blue-600 rounded-lg"><TrendingUp size={20} /></div>
                </div>
                <div className="bg-white p-5 rounded-xl border border-slate-100 shadow-sm flex items-center justify-between">
                    <div>
                        <p className="text-xs font-bold text-slate-400 uppercase">Ticket Medio</p>
                        <p className="text-2xl font-bold text-slate-800">
                            {top_brands?.length > 0 ? (
                                Math.round(top_brands.reduce((acc, curr) => acc + (curr.avg_ticket * curr.count), 0) / top_brands.reduce((acc, curr) => acc + curr.count, 0)) + '€'
                            ) : '0€'}
                        </p>
                    </div>
                    <div className="p-3 bg-green-50 text-green-600 rounded-lg"><DollarSign size={20} /></div>
                </div>
                <div className="bg-white p-5 rounded-xl border border-slate-100 shadow-sm flex items-center justify-between">
                    <div>
                        <p className="text-xs font-bold text-slate-400 uppercase">Top Marca</p>
                        <p className="text-lg font-bold text-slate-800 truncate max-w-[120px]">
                            {top_brands?.[0]?.name || 'N/A'}
                        </p>
                    </div>
                    <div className="p-3 bg-purple-50 text-purple-600 rounded-lg"><Award size={20} /></div>
                </div>
                <div className="bg-white p-5 rounded-xl border border-slate-100 shadow-sm flex items-center justify-between">
                    <div>
                        <p className="text-xs font-bold text-slate-400 uppercase">Día Pico</p>
                        <p className="text-lg font-bold text-slate-800">
                            {daily_rhythm?.sort((a, b) => b.count - a.count)[0]?.day_name || 'N/A'}
                        </p>
                    </div>
                    <div className="p-3 bg-amber-50 text-amber-600 rounded-lg"><Clock size={20} /></div>
                </div>
            </div>

            {/* MAIN CHART ROW */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                {/* 1. BRAND WAR */}
                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm min-h-[400px]">
                    <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                        <Award size={18} className="text-purple-500" />
                        Guerra de Marcas
                    </h3>
                    <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={top_brands || []} layout="vertical" margin={{ left: 20 }}>
                            <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                            <XAxis type="number" hide />
                            <YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 12 }} />
                            <Tooltip cursor={{ fill: '#f8fafc' }} />
                            <Bar dataKey="count" fill="#8884d8" radius={[0, 4, 4, 0]}>
                                {top_brands?.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>

                {/* 2. HEATMAP (Simplified List for now) */}
                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm min-h-[400px] flex flex-col">
                    <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                        <MapPin size={18} className="text-red-500" />
                        Zonas Calientes (Códigos Postales)
                    </h3>
                    {/* Placeholder for real heatmap - showing top list */}
                    <div className="flex-1 overflow-y-auto pr-2">
                        <table className="w-full text-sm text-left">
                            <thead className="text-xs text-slate-500 uppercase bg-slate-50 sticky top-0">
                                <tr>
                                    <th className="px-4 py-3">C. Postal</th>
                                    <th className="px-4 py-3 text-right">Incidencias</th>
                                    <th className="px-4 py-3 text-right">Intensidad</th>
                                </tr>
                            </thead>
                            <tbody>
                                {heatmap?.sort((a, b) => b.count - a.count).map((zone, idx) => (
                                    <tr key={zone.postal_code} className="border-b border-slate-100 hover:bg-slate-50">
                                        <td className="px-4 py-3 font-mono font-medium text-slate-700">{zone.postal_code}</td>
                                        <td className="px-4 py-3 text-right font-bold">{zone.count}</td>
                                        <td className="px-4 py-3 text-right">
                                            <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                                                <div
                                                    className="h-full bg-red-500"
                                                    style={{ width: `${Math.min(100, (zone.count / (heatmap[0]?.count || 1)) * 100)}%` }}
                                                />
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* TECH RANKING ROW */}
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                    <Award size={18} className="text-amber-500" />
                    Ranking Técnico (Top Performers)
                </h3>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="text-xs text-slate-500 uppercase bg-slate-50">
                            <tr>
                                <th className="px-4 py-3">Técnico</th>
                                <th className="px-4 py-3 text-right">Servicios Cerrados</th>
                                <th className="px-4 py-3 text-right">Facturación Total</th>
                                <th className="px-4 py-3 text-center">Nivel</th>
                            </tr>
                        </thead>
                        <tbody>
                            {tech_ranking?.map((tech, idx) => (
                                <tr key={idx} className="border-b border-slate-100 hover:bg-slate-50 transition">
                                    <td className="px-4 py-4 font-bold text-slate-800 flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-600">
                                            {tech.full_name.charAt(0)}
                                        </div>
                                        {tech.full_name}
                                        {idx === 0 && <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">👑 MVP</span>}
                                    </td>
                                    <td className="px-4 py-4 text-right">{tech.jobs}</td>
                                    <td className="px-4 py-4 text-right font-mono text-green-600">{tech.total_revenue}€</td>
                                    <td className="px-4 py-4 text-center">
                                        <div className="w-24 h-2 bg-slate-200 rounded-full mx-auto overflow-hidden">
                                            <div className="h-full bg-blue-500" style={{ width: '85%' }}></div>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {(!tech_ranking || tech_ranking.length === 0) && (
                                <tr>
                                    <td colSpan="4" className="text-center py-8 text-slate-400">No hay datos de técnicos en este periodo.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* AI ANOMALY ALERT (Simulated) */}
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3 animate-in slide-in-from-bottom-4 duration-700 delay-300">
                <div className="bg-red-100 p-2 rounded-full text-red-600 shrink-0">
                    <AlertTriangle size={20} />
                </div>
                <div>
                    <h4 className="font-bold text-red-800">Centinela IA: Anomalía Detectada</h4>
                    <p className="text-sm text-red-700 mt-1">
                        Se ha detectado un volumen inusual de reparaciones de <strong>Aire Acondicionado</strong> en la zona <strong>29014</strong> (+300% vs media histórica).
                        Posible ola de calor local o fallo de red eléctrica.
                    </p>
                    <button className="mt-2 text-xs font-bold text-red-700 underline">Ver Análisis Detallado</button>
                </div>
            </div>

        </div>
    );
};

export default Analytics;
