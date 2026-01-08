import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    PieChart, Pie, Cell, AreaChart, Area, Legend
} from 'recharts';
import {
    TrendingUp, Activity, MapPin, Award, Clock,
    Calendar, Filter, Download, Zap, ChevronRight, DollarSign
} from 'lucide-react';
import AnalyticsSidebar from '../components/analytics/AnalyticsSidebar';
import { generateExecutiveReport } from '../utils/pdfReportGenerator';

const COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#6366f1', '#ec4899', '#64748b'];

const Analytics = () => {
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState(null);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);

    // Filters State
    const [dateRange, setDateRange] = useState('30'); // Quick Select
    const [filters, setFilters] = useState({
        techId: null,
        zoneCp: null,
        applianceType: null,
        startDate: null,
        endDate: null
    });

    useEffect(() => {
        updateDateFilters();
    }, [dateRange]);

    useEffect(() => {
        if (filters.startDate) {
            fetchData();
        }
    }, [filters]);

    const updateDateFilters = () => {
        const end = new Date();
        const start = new Date();
        start.setDate(end.getDate() - parseInt(dateRange));

        setFilters(prev => ({
            ...prev,
            startDate: start.toISOString(),
            endDate: end.toISOString()
        }));
    };

    const fetchData = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase.rpc('get_business_intelligence', {
                p_start_date: filters.startDate,
                p_end_date: filters.endDate,
                p_tech_id: filters.techId,
                p_zone_cp: filters.zoneCp,
                p_appliance_type: filters.applianceType
            });

            if (error) throw error;
            setData(data);
        } catch (err) {
            console.error("Analytics Error:", err);
        } finally {
            setLoading(false);
        }
    };

    const handleExport = () => {
        if (data) {
            generateExecutiveReport(data, filters);
        }
    };

    // Safe Accessors
    const kpis = data?.kpis || {};
    const marketShare = data?.market_share || [];
    const seasonality = data?.seasonality || [];
    const techPerf = data?.tech_performance || [];
    const hotspots = data?.hot_zones || [];

    // Filter Badges Display
    const activeFiltersCount = [filters.techId, filters.zoneCp, filters.applianceType].filter(Boolean).length;

    return (
        <div className="min-h-screen bg-slate-50/50 pb-20 relative overflow-hidden">

            {/* MAIN CONTENT */}
            <div className="max-w-7xl mx-auto px-6 py-6 space-y-8">

                {/* 1. HEADER & CONTROLS */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm sticky top-0 z-10">
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                            <div className="bg-blue-600 text-white p-2 rounded-lg shadow-blue-200 shadow-lg">
                                <Activity size={20} />
                            </div>
                            Business Intelligence
                        </h1>
                        <p className="text-xs text-slate-500 mt-1 ml-1">
                            {filters.startDate && new Date(filters.startDate).toLocaleDateString()} - {filters.endDate && new Date(filters.endDate).toLocaleDateString()}
                        </p>
                    </div>

                    <div className="flex items-center gap-2">
                        {/* Quick Date Select */}
                        <div className="bg-slate-50 p-1 rounded-xl border border-slate-200 flex text-sm font-medium">
                            {['7', '30', '90', '365'].map(days => (
                                <button
                                    key={days}
                                    onClick={() => setDateRange(days)}
                                    className={`px-3 py-1.5 rounded-lg transition-all ${dateRange === days ? 'bg-white shadow text-blue-600' : 'text-slate-500 hover:text-slate-800'
                                        }`}
                                >
                                    {days === '365' ? '1A' : `${days}D`}
                                </button>
                            ))}
                        </div>

                        {/* Filter Toggle */}
                        <button
                            onClick={() => setIsSidebarOpen(true)}
                            className={`p-2.5 rounded-xl border transition-all flex items-center gap-2 ${activeFiltersCount > 0
                                    ? 'bg-blue-50 border-blue-200 text-blue-600 shadow-sm'
                                    : 'bg-white border-slate-200 text-slate-500 hover:border-blue-300 hover:text-blue-600'
                                }`}
                        >
                            <Filter size={18} />
                            {activeFiltersCount > 0 && (
                                <span className="bg-blue-600 text-white text-[10px] w-5 h-5 flex items-center justify-center rounded-full font-bold">
                                    {activeFiltersCount}
                                </span>
                            )}
                        </button>

                        {/* Export Button */}
                        <button
                            onClick={handleExport}
                            className="bg-slate-900 hover:bg-slate-800 text-white px-4 py-2.5 rounded-xl text-sm font-bold shadow-lg shadow-slate-200 transition-all flex items-center gap-2"
                        >
                            <Download size={16} /> Exportar PDF
                        </button>
                    </div>
                </div>

                {/* 2. KPI GRID (Executive Summary) */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    {/* Volume */}
                    <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm relative overflow-hidden group">
                        <div className="flex justify-between items-start z-10 relative">
                            <div>
                                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Volumen Total</p>
                                <h3 className="text-3xl font-black text-slate-800 mt-1">{loading ? '...' : kpis.total_volume}</h3>
                            </div>
                            <div className="bg-blue-50 text-blue-600 p-2 rounded-lg"><TrendingUp size={20} /></div>
                        </div>
                        <div className="absolute right-0 bottom-0 opacity-10 group-hover:opacity-20 transition-opacity">
                            <TrendingUp size={80} />
                        </div>
                    </div>

                    {/* Revenue */}
                    <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm relative overflow-hidden group">
                        <div className="flex justify-between items-start z-10 relative">
                            <div>
                                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Facturación</p>
                                <h3 className="text-3xl font-black text-slate-800 mt-1">{loading ? '...' : `${kpis.total_revenue}€`}</h3>
                            </div>
                            <div className="bg-green-50 text-green-600 p-2 rounded-lg"><DollarSign size={20} /></div>
                        </div>
                        <div className="absolute right-0 bottom-0 opacity-10 group-hover:opacity-20 transition-opacity text-green-600">
                            <DollarSign size={80} />
                        </div>
                    </div>

                    {/* Avg Ticket */}
                    <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm relative overflow-hidden">
                        <div className="flex justify-between items-start">
                            <div>
                                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Ticket Medio</p>
                                <h3 className="text-3xl font-black text-slate-800 mt-1">{loading ? '...' : `${kpis.avg_ticket}€`}</h3>
                            </div>
                            <div className="bg-purple-50 text-purple-600 p-2 rounded-lg"><Award size={20} /></div>
                        </div>
                        <div className="mt-4 flex items-center gap-1 text-xs font-medium text-slate-400 bg-slate-50 w-fit px-2 py-1 rounded-full">
                            Tasa Cierre: <span className="text-slate-800">{kpis.completion_rate}%</span>
                        </div>
                    </div>

                    {/* Top Zone */}
                    <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm relative overflow-hidden">
                        <div className="flex justify-between items-start">
                            <div>
                                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Zona Caliente</p>
                                <h3 className="text-2xl font-black text-slate-800 mt-1 truncate max-w-[140px]">
                                    {loading ? '...' : (hotspots[0]?.postal_code || '--')}
                                </h3>
                            </div>
                            <div className="bg-red-50 text-red-600 p-2 rounded-lg"><MapPin size={20} /></div>
                        </div>
                        <p className="text-xs text-slate-400 mt-2">Mayor volumen de incidencias</p>
                    </div>
                </div>

                {/* 3. CHARTS LAYOUT */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                    {/* A. Market Share (Donut) */}
                    <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm col-span-1 lg:col-span-1 flex flex-col">
                        <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2">
                            <Zap size={18} className="text-amber-500" /> Cuota de Mercado
                        </h3>
                        <div className="flex-1 min-h-[300px] relative">
                            {loading ? <div className="animate-pulse bg-slate-50 w-full h-full rounded-full" /> : (
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={marketShare}
                                            innerRadius={60}
                                            outerRadius={100}
                                            paddingAngle={4}
                                            dataKey="value"
                                        >
                                            {marketShare.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                            ))}
                                        </Pie>
                                        <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                                        <Legend verticalAlign="bottom" height={36} iconType="circle" />
                                    </PieChart>
                                </ResponsiveContainer>
                            )}
                        </div>
                    </div>

                    {/* B. Seasonality (Area) */}
                    <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm col-span-1 lg:col-span-2">
                        <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2">
                            <Clock size={18} className="text-blue-500" /> Estacionalidad y Volumen
                        </h3>
                        <div className="h-[300px]">
                            {loading ? <div className="animate-pulse bg-slate-50 w-full h-full rounded-xl" /> : (
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={seasonality} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                                        <defs>
                                            <linearGradient id="colorTickets" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                                                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} />
                                        <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} />
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                        <Tooltip
                                            contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                                            cursor={{ stroke: '#3b82f6', strokeWidth: 1 }}
                                        />
                                        <Area type="monotone" dataKey="tickets" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorTickets)" />
                                    </AreaChart>
                                </ResponsiveContainer>
                            )}
                        </div>
                    </div>
                </div>

                {/* 4. ROI & ZONES */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                    {/* Tech ROI */}
                    <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
                        <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2">
                            <Award size={18} className="text-purple-500" /> Rentabilidad por Técnico (ROI)
                        </h3>
                        <div className="h-[350px] overflow-y-auto pr-2">
                            {loading ? <div className="space-y-4">{[1, 2, 3].map(i => <div key={i} className="h-12 bg-slate-50 rounded-xl animate-pulse" />)}</div> : (
                                <div className="space-y-4">
                                    {techPerf.map((tech, idx) => (
                                        <div key={idx} className="flex items-center justify-between p-3 hover:bg-slate-50 rounded-xl transition group">
                                            <div className="flex items-center gap-3">
                                                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${idx === 0 ? 'bg-yellow-100 text-yellow-700' : 'bg-slate-100 text-slate-600'}`}>
                                                    {idx + 1}
                                                </div>
                                                <div>
                                                    <p className="font-bold text-slate-800 text-sm">{tech.name}</p>
                                                    <p className="text-xs text-slate-400">{tech.jobs} trabajos</p>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <p className="font-bold text-green-600 font-mono text-sm">{tech.revenue}€</p>
                                                <div className="w-24 h-1.5 bg-slate-100 rounded-full mt-1 ml-auto overflow-hidden">
                                                    <div
                                                        className="h-full bg-green-500 rounded-full"
                                                        style={{ width: `${(tech.revenue / (techPerf[0]?.revenue || 1)) * 100}%` }}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Hot Zones Heatmap List */}
                    <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
                        <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2">
                            <MapPin size={18} className="text-red-500" /> Zonas Calientes (CP)
                        </h3>
                        <div className="h-[350px] overflow-y-auto">
                            <table className="w-full text-sm">
                                <thead className="text-xs text-slate-400 uppercase bg-slate-50 sticky top-0">
                                    <tr>
                                        <th className="px-4 py-3 text-left">Zona</th>
                                        <th className="px-4 py-3 text-right">Volumen</th>
                                        <th className="px-4 py-3 text-right">Intensidad</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                    {loading ? <tr><td colSpan="3" className="p-4 text-center">Cargando...</td></tr> : hotspots.map((zone) => (
                                        <tr key={zone.id} className="hover:bg-slate-50/50">
                                            <td className="px-4 py-3 font-mono font-bold text-slate-600">{zone.postal_code}</td>
                                            <td className="px-4 py-3 text-right font-medium">{zone.value}</td>
                                            <td className="px-4 py-3">
                                                <div className="h-1.5 bg-slate-100 rounded-full max-w-[100px] ml-auto overflow-hidden">
                                                    <div
                                                        className="h-full bg-red-500"
                                                        style={{ width: `${(zone.value / (hotspots[0]?.value || 1)) * 100}%` }}
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

            </div>

            {/* SIDEBAR OVERLAY */}
            <AnalyticsSidebar
                isOpen={isSidebarOpen}
                onClose={() => setIsSidebarOpen(false)}
                filters={filters}
                onFilterChange={setFilters}
            />

        </div>
    );
};

export default Analytics;
