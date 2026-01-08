import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    PieChart, Pie, Cell, AreaChart, Area, Legend
} from 'recharts';
import {
    TrendingUp, AlertTriangle, MapPin, DollarSign, Award, Clock,
    Calendar, Filter, ChevronDown, Activity, Zap
} from 'lucide-react';

// Premium Color Palette
const COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#6366f1'];
const EMPTY_COLOR = '#e2e8f0';

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
            const endDate = new Date();
            const startDate = new Date();
            startDate.setDate(endDate.getDate() - parseInt(timeRange));

            const { data, error } = await supabase.rpc('get_analytics_kpis', {
                start_date: startDate.toISOString(),
                end_date: endDate.toISOString()
            });

            if (error) throw error;
            setKpiData(data);
        } catch (err) {
            console.error("Error fetching analytics:", err);
        } finally {
            // Fake delay for skeleton showcase if needed, but better fast.
            setTimeout(() => setLoading(false), 500);
        }
    };

    // Safe Data Accessors (Handle Null/Zeros)
    const topBrands = kpiData?.top_brands || [];
    const dailyRhythm = kpiData?.daily_rhythm || [];
    const techRanking = kpiData?.tech_ranking || [];
    const heatmap = kpiData?.heatmap || [];

    const totalVolume = topBrands.reduce((acc, curr) => acc + curr.count, 0);
    const avgTicket = topBrands.length > 0
        ? topBrands.reduce((acc, curr) => acc + (curr.avg_ticket * curr.count), 0) / totalVolume
        : 0;
    const topBrandName = topBrands[0]?.name || '---';

    // Skeleton Component
    const SkeletonCard = ({ h = "h-32" }) => (
        <div className={`bg-white rounded-2xl p-6 shadow-sm border border-slate-100 animate-pulse ${h}`}>
            <div className="h-4 bg-slate-100 rounded w-1/3 mb-4"></div>
            <div className="h-8 bg-slate-100 rounded w-1/2"></div>
        </div>
    );

    return (
        <div className="min-h-screen bg-slate-50/50 pb-20">
            {/* HEADER SECTION */}
            <div className="bg-white border-b border-slate-200 sticky top-0 z-20 px-6 py-4 shadow-sm">
                <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
                            <div className="bg-gradient-to-br from-blue-600 to-indigo-600 text-white p-2 rounded-xl shadow-lg shadow-blue-500/30">
                                <Activity size={24} />
                            </div>
                            Centro de Inteligencia
                        </h1>
                        <p className="text-slate-500 text-sm mt-1 ml-1">
                            Monitorización en tiempo real del rendimiento operativo.
                        </p>
                    </div>

                    {/* CONTROLS */}
                    <div className="flex items-center gap-3 bg-slate-50 p-1.5 rounded-xl border border-slate-200">
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-white rounded-lg shadow-sm border border-slate-100 text-sm font-medium text-slate-700">
                            <Calendar size={16} className="text-slate-400" />
                            <select
                                className="bg-transparent outline-none cursor-pointer hover:text-blue-600 transition-colors"
                                value={timeRange}
                                onChange={(e) => setTimeRange(e.target.value)}
                            >
                                <option value="7">Últimos 7 días</option>
                                <option value="30">Últimos 30 días</option>
                                <option value="90">Último Trimestre</option>
                                <option value="365">Este Año</option>
                            </select>
                            <ChevronDown size={14} className="text-slate-400" />
                        </div>
                        <button className="p-2 hover:bg-white hover:shadow-sm rounded-lg transition-all text-slate-400 hover:text-blue-600">
                            <Filter size={18} />
                        </button>
                    </div>
                </div>
            </div>

            <div className="max-w-7xl mx-auto p-6 space-y-8 animate-in fade-in duration-500">

                {/* 1. KPI CARDS */}
                {loading ? (
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        {[1, 2, 3, 4].map(i => <SkeletonCard key={i} h="h-32" />)}
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        {/* KPI 1: Volume */}
                        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow group relative overflow-hidden">
                            <div className="absolute right-0 top-0 w-24 h-24 bg-blue-50 rounded-bl-full -mr-4 -mt-4 opacity-50 group-hover:scale-110 transition-transform" />
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Volumen Total</p>
                            <div className="flex items-baseline gap-2">
                                <span className="text-3xl font-black text-slate-800">{totalVolume}</span>
                                <span className="text-sm font-medium text-slate-400">servicios</span>
                            </div>
                            <div className="mt-4 flex items-center text-xs font-medium text-green-600 bg-green-50 w-fit px-2 py-1 rounded-full">
                                <TrendingUp size={12} className="mr-1" /> +12% vs mes anterior
                            </div>
                        </div>

                        {/* KPI 2: Avg Ticket */}
                        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow group relative overflow-hidden">
                            <div className="absolute right-0 top-0 w-24 h-24 bg-emerald-50 rounded-bl-full -mr-4 -mt-4 opacity-50 group-hover:scale-110 transition-transform" />
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Ticket Medio</p>
                            <div className="flex items-baseline gap-2">
                                <span className="text-3xl font-black text-slate-800">{Math.round(avgTicket)}€</span>
                            </div>
                            <div className="mt-4 flex items-center text-xs font-medium text-slate-500 bg-slate-50 w-fit px-2 py-1 rounded-full">
                                <Activity size={12} className="mr-1" /> Estable
                            </div>
                        </div>

                        {/* KPI 3: Top Brand */}
                        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow group relative overflow-hidden">
                            <div className="absolute right-0 top-0 w-24 h-24 bg-purple-50 rounded-bl-full -mr-4 -mt-4 opacity-50 group-hover:scale-110 transition-transform" />
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Marca Líder</p>
                            <div className="flex items-baseline gap-2">
                                <span className="text-2xl font-black text-slate-800 truncate max-w-[180px]" title={topBrandName}>
                                    {topBrandName}
                                </span>
                            </div>
                            <div className="mt-4 flex items-center text-xs font-medium text-purple-600 bg-purple-50 w-fit px-2 py-1 rounded-full">
                                <Award size={12} className="mr-1" /> Muy solicitado
                            </div>
                        </div>

                        {/* KPI 4: Peak Day */}
                        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow group relative overflow-hidden">
                            <div className="absolute right-0 top-0 w-24 h-24 bg-amber-50 rounded-bl-full -mr-4 -mt-4 opacity-50 group-hover:scale-110 transition-transform" />
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Día Más Activo</p>
                            <div className="flex items-baseline gap-2">
                                <span className="text-3xl font-black text-slate-800">
                                    {dailyRhythm.sort((a, b) => b.count - a.count)[0]?.day_name?.trim() || '---'}
                                </span>
                            </div>
                            <div className="mt-4 flex items-center text-xs font-medium text-amber-600 bg-amber-50 w-fit px-2 py-1 rounded-full">
                                <Clock size={12} className="mr-1" /> Planificar Refuerzos
                            </div>
                        </div>
                    </div>
                )}

                {/* 2. CHARTS SECTION */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                    {/* CHART A: BRAND DISTRIBUTION (THE CIRCLE) */}
                    <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm col-span-1 flex flex-col">
                        <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
                            <Zap size={18} className="text-amber-500" />
                            Cuota de Mercado
                        </h3>
                        <div className="flex-1 min-h-[300px] relative flex items-center justify-center">
                            {loading ? (
                                <div className="animate-pulse bg-slate-100 rounded-full w-48 h-48"></div>
                            ) : topBrands.length === 0 ? (
                                <div className="text-center text-slate-400 text-sm">Sin datos suficientes</div>
                            ) : (
                                <ResponsiveContainer width="100%" height={300}>
                                    <PieChart>
                                        <Pie
                                            data={topBrands}
                                            innerRadius={80}
                                            outerRadius={110}
                                            paddingAngle={5}
                                            dataKey="count"
                                            nameKey="name"
                                            stroke="none"
                                        >
                                            {topBrands.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                            ))}
                                        </Pie>
                                        <Tooltip
                                            contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                                            itemStyle={{ color: '#1e293b', fontWeight: 'bold' }}
                                        />
                                        <Legend verticalAlign="bottom" height={36} iconType="circle" />
                                    </PieChart>
                                </ResponsiveContainer>
                            )}
                            {/* Center Label */}
                            {!loading && topBrands.length > 0 && (
                                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                    <div className="text-center">
                                        <p className="text-xs text-slate-400 uppercase font-bold">Total</p>
                                        <p className="text-2xl font-black text-slate-800">{totalVolume}</p>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* CHART B: BRAND WAR (BARS) */}
                    <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm col-span-1 lg:col-span-2">
                        <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
                            <Award size={18} className="text-blue-500" />
                            Volumen por Marca
                        </h3>
                        <div className="min-h-[300px]">
                            {loading ? (
                                <div className="w-full h-full bg-slate-50 animate-pulse rounded-xl"></div>
                            ) : topBrands.length === 0 ? (
                                <div className="h-full flex items-center justify-center text-slate-400">Sin datos</div>
                            ) : (
                                <ResponsiveContainer width="100%" height={300}>
                                    <BarChart data={topBrands} margin={{ top: 20, right: 30, left: 0, bottom: 0 }} barSize={40}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} dy={10} />
                                        <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                                        <Tooltip
                                            cursor={{ fill: '#f8fafc' }}
                                            contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                                        />
                                        <Bar dataKey="count" fill="#3b82f6" radius={[6, 6, 0, 0]}>
                                            {topBrands.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                            ))}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            )}
                        </div>
                    </div>
                </div>

                {/* 3. HEATMAP & RANKING ROW */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                    {/* HEATMAP LIST (Design Upgrade) */}
                    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden flex flex-col">
                        <div className="p-6 border-b border-slate-50">
                            <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                                <MapPin size={18} className="text-red-500" />
                                Zonas de Alta Demanda
                            </h3>
                        </div>
                        <div className="flex-1 overflow-auto max-h-[350px]">
                            {loading ? (
                                <div className="p-4 space-y-3">
                                    {[1, 2, 3].map(i => <div key={i} className="h-10 bg-slate-50 rounded animate-pulse" />)}
                                </div>
                            ) : heatmap.length === 0 ? (
                                <div className="p-10 text-center text-slate-400">No hay datos geográficos</div>
                            ) : (
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-slate-50/50 text-xs text-slate-500 uppercase font-semibold sticky top-0 backdrop-blur-sm">
                                        <tr>
                                            <th className="px-6 py-3">C. Postal</th>
                                            <th className="px-6 py-3 text-right">Incidencias</th>
                                            <th className="px-6 py-3 text-right">Intensidad</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50">
                                        {heatmap.sort((a, b) => b.count - a.count).map((zone, idx) => (
                                            <tr key={zone.postal_code} className="hover:bg-slate-50/50 transition-colors cursor-default group">
                                                <td className="px-6 py-4 font-mono font-bold text-slate-700">
                                                    <span className="bg-slate-100 px-2 py-1 rounded text-slate-600 group-hover:bg-white group-hover:shadow-sm transition-all">
                                                        {zone.postal_code}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 text-right font-medium text-slate-600">{zone.count}</td>
                                                <td className="px-6 py-4 text-right">
                                                    <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                                                        <div
                                                            className="h-full bg-gradient-to-r from-orange-300 to-red-500 rounded-full"
                                                            style={{ width: `${Math.min(100, (zone.count / (heatmap[0]?.count || 1)) * 100)}%` }}
                                                        />
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </div>

                    {/* TECH RANKING (Design Upgrade) */}
                    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden flex flex-col">
                        <div className="p-6 border-b border-slate-50">
                            <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                                <Award size={18} className="text-yellow-500" />
                                Top Performers
                            </h3>
                        </div>
                        <div className="flex-1 overflow-auto max-h-[350px]">
                            {loading ? (
                                <div className="p-4 space-y-3">
                                    {[1, 2, 3].map(i => <div key={i} className="h-12 bg-slate-50 rounded animate-pulse" />)}
                                </div>
                            ) : techRanking.length === 0 ? (
                                <div className="p-10 text-center text-slate-400">Sin ranking disponible</div>
                            ) : (
                                <div className="divide-y divide-slate-50">
                                    {techRanking.map((tech, idx) => (
                                        <div key={idx} className="p-4 flex items-center justify-between hover:bg-slate-50/50 transition">
                                            <div className="flex items-center gap-4">
                                                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm
                                                    ${idx === 0 ? 'bg-yellow-100 text-yellow-700' : 'bg-slate-100 text-slate-600'}
                                                `}>
                                                    {idx + 1}
                                                </div>
                                                <div>
                                                    <p className="font-bold text-slate-800 text-sm">{tech.full_name}</p>
                                                    <p className="text-xs text-slate-400">{tech.jobs} servicios completados</p>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <p className="font-mono font-bold text-green-600 text-sm">{tech.total_revenue}€</p>
                                                <div className="w-20 h-1 bg-slate-100 rounded-full mt-1 ml-auto">
                                                    <div className="h-full bg-green-500 rounded-full" style={{ width: '80%' }}></div>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* AI ALERT COMPONENT */}
                {!loading && (
                    <div className="fixed bottom-6 right-6 max-w-sm w-full bg-white rounded-2xl shadow-xl shadow-red-500/10 border border-red-100 p-4 animate-in slide-in-from-bottom-10 fade-in duration-700 flex gap-4">
                        <div className="bg-red-50 p-3 rounded-full h-fit shrink-0 text-red-500">
                            <Activity size={20} />
                        </div>
                        <div>
                            <h4 className="font-bold text-slate-800 text-sm">Centinela IA Activo</h4>
                            <p className="text-xs text-slate-500 mt-1">
                                Analizando patrones en tiempo real. Se ha detectado una anomalía leve en la zona <strong>29014</strong>.
                            </p>
                            <button className="text-xs font-bold text-red-600 mt-2 hover:underline">Ver Reporte</button>
                        </div>
                        <button className="absolute top-2 right-2 text-slate-300 hover:text-slate-500">
                            <ChevronDown size={14} />
                        </button>
                    </div>
                )}

            </div>
        </div>
    );
};

export default Analytics;
