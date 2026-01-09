import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { format, subMonths, startOfYear } from 'date-fns';
import { es } from 'date-fns/locale';
import {
    LayoutGrid, Monitor, User, Map, ChevronRight, ChevronLeft,
    Download, Calendar as CalendarIcon, Filter, Layers, Tag as TagIcon,
    PieChart, BarChart, Activity, SidebarClose, SidebarOpen
} from 'lucide-react';
import {
    ResponsiveContainer, PieChart as RePie, Pie, Cell,
    BarChart as ReBar, Bar, XAxis, YAxis, Tooltip, Legend,
    LineChart as ReLine, Line, CartesianGrid
} from 'recharts';
import { generateExecutiveReport } from '../../utils/pdfReportGenerator';

const COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#6366f1', '#ec4899', '#64748b'];

const EMPTY_DATA = {
    kpis: { total_volume: 0, total_revenue: 0, avg_ticket: 0, completion_rate: 0 },
    market_share: [],
    seasonality: [],
    hot_zones: [],
    tech_performance: [],
    top_fault: 'Sin datos',
    status_breakdown: []
};

// --- HELPER COMPONENTS ---

const BrandLogo = ({ name }) => (
    <div className="flex items-center gap-2">
        <img
            src={`https://logo.clearbit.com/${name.toLowerCase().replace(/\s/g, '')}.com`}
            onError={(e) => { e.target.style.display = 'none'; }}
            className="w-4 h-4 object-contain"
            alt=""
        />
        <span>{name}</span>
    </div>
);

// 1. NAVIGATOR (Collapsible & High Density)
const Navigator = ({ activeConcept, onSelect, filters, setFilters, metadata, loadingMetadata, collapsed, setCollapsed }) => {

    const { types, brands, techs } = metadata;

    const toggleFilter = (key, value) => {
        setFilters(prev => ({ ...prev, [key]: prev[key] === value ? null : value }));
    };

    if (collapsed) {
        return (
            <div className="h-full border-r border-slate-200 bg-white flex flex-col items-center py-4 gap-4 w-16 transition-all">
                <button onClick={() => setCollapsed(false)} className="p-2 hover:bg-slate-100 rounded-lg text-slate-500">
                    <ChevronRight size={20} />
                </button>
                <div className="border-t border-slate-100 w-full my-2" />
                {[
                    { id: 'global', icon: LayoutGrid },
                    { id: 'appliance', icon: Filter },
                    { id: 'tech', icon: User },
                    { id: 'geo', icon: Map }
                ].map(m => (
                    <button
                        key={m.id}
                        onClick={() => onSelect(m.id)}
                        className={`p-2 rounded-lg transition-colors ${activeConcept === m.id ? 'bg-blue-50 text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}
                    >
                        <m.icon size={20} />
                    </button>
                ))}
            </div>
        );
    }

    return (
        <div className="bg-white h-full border-r border-slate-200 flex flex-col w-64 transition-all">
            {/* Header */}
            <div className="p-3 border-b border-slate-100 flex justify-between items-center">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">FILTROS</span>
                <button onClick={() => setCollapsed(true)} className="text-slate-400 hover:text-slate-600">
                    <ChevronLeft size={16} />
                </button>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-1">
                {/* Global */}
                <NavButton
                    id="global" label="Global" icon={LayoutGrid}
                    isActive={activeConcept === 'global'} onClick={() => onSelect('global')}
                />

                {/* Appliance Multi-Filter */}
                <NavButton
                    id="appliance" label="Electro & Marca" icon={Filter}
                    isActive={activeConcept === 'appliance'} onClick={() => onSelect('appliance')}
                />

                {activeConcept === 'appliance' && (
                    <div className="ml-3 pl-3 border-l border-slate-100 space-y-4 my-2 animate-in slide-in-from-left-2">
                        {/* Types */}
                        <div className="space-y-1">
                            <h4 className="text-[10px] font-bold text-slate-400 uppercase mb-1">Tipo</h4>
                            {types.map(t => (
                                <FilterItem key={t} label={t} isActive={filters.type === t} onClick={() => toggleFilter('type', t)} />
                            ))}
                        </div>
                        {/* Brands */}
                        <div className="space-y-1">
                            <h4 className="text-[10px] font-bold text-slate-400 uppercase mb-1">Marca</h4>
                            {brands.map(b => (
                                <FilterItem
                                    key={b.id}
                                    label={<BrandLogo name={b.name} />}
                                    isActive={filters.brand === b.id}
                                    onClick={() => toggleFilter('brand', b.id)}
                                />
                            ))}
                        </div>
                    </div>
                )}

                {/* Tech Filter */}
                <NavButton
                    id="tech" label="Técnicos" icon={User}
                    isActive={activeConcept === 'tech'} onClick={() => onSelect('tech')}
                />
                {activeConcept === 'tech' && (
                    <div className="ml-3 pl-3 border-l border-slate-100 space-y-1 my-2">
                        {techs.map(t => (
                            <FilterItem key={t.id} label={t.full_name} isActive={filters.tech === t.id} onClick={() => toggleFilter('tech', t.id)} />
                        ))}
                    </div>
                )}

                {/* Geo */}
                <NavButton
                    id="geo" label="Geografía" icon={Map}
                    isActive={activeConcept === 'geo'} onClick={() => onSelect('geo')}
                />
            </div>
        </div>
    );
};

const NavButton = ({ id, label, icon: Icon, isActive, onClick }) => (
    <button
        onClick={onClick}
        className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-all
            ${isActive ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'}
        `}
    >
        <div className="flex items-center gap-2.5">
            <Icon size={16} className={isActive ? 'text-blue-400' : 'text-slate-400'} />
            <span>{label}</span>
        </div>
        {isActive && <ChevronRight size={12} />}
    </button>
);

const FilterItem = ({ label, isActive, onClick }) => (
    <button
        onClick={onClick}
        className={`w-full text-left px-2 py-1.5 text-[11px] rounded transition-colors flex justify-between items-center
            ${isActive ? 'bg-blue-50 text-blue-700 font-bold' : 'text-slate-500 hover:bg-slate-50'}
        `}
    >
        <span className="truncate">{label}</span>
        {isActive && <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />}
    </button>
);

// 2. VISUALIZATION CANVAS (High Density)
const VisualizationCanvas = ({ data, loading, dateRange, setDateRange, setDatePreset, viewMode, setViewMode, activeConcept }) => {

    // Date Presets
    const applyPreset = (months) => {
        const end = new Date();
        const start = months === 'YTD' ? startOfYear(new Date()) : subMonths(new Date(), months);
        if (months === 'ALL') { /* Logic for all time? limited to 2 years for now */ start.setFullYear(2020); }
        setDateRange({ start: start.toISOString(), end: end.toISOString() });
    };

    return (
        <div className="flex flex-col h-full bg-slate-50 overflow-hidden">
            {/* HEADER TOOLBAR */}
            <div className="bg-white border-b border-slate-200 px-6 py-3 flex justify-between items-center shrink-0">
                <div className="flex items-center gap-4">
                    <h1 className="text-sm font-black text-slate-800 uppercase tracking-tight">Analytics v3.0</h1>
                    <div className="h-4 w-px bg-slate-200" />
                    <div className="flex gap-1">
                        {[{ l: '6 Meses', v: 6 }, { l: 'Este Año', v: 'YTD' }, { l: 'Histórico', v: 'ALL' }].map(p => (
                            <button key={p.l} onClick={() => applyPreset(p.v)} className="text-[10px] font-bold text-slate-500 hover:text-blue-600 px-2 py-1 bg-slate-50 hover:bg-blue-50 rounded border border-slate-100 transition-colors">
                                {p.l}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <input
                        type="date" value={dateRange.start.split('T')[0]}
                        onChange={e => setDateRange({ ...dateRange, start: new Date(e.target.value).toISOString() })}
                        className="text-xs border border-slate-200 rounded p-1 text-slate-600 font-medium"
                    />
                    <span className="text-slate-300">-</span>
                    <input
                        type="date" value={dateRange.end.split('T')[0]}
                        onChange={e => setDateRange({ ...dateRange, end: new Date(e.target.value).toISOString() })}
                        className="text-xs border border-slate-200 rounded p-1 text-slate-600 font-medium"
                    />
                    <button
                        onClick={() => generateExecutiveReport(data, { startDate: dateRange.start, endDate: dateRange.end })}
                        className="ml-2 bg-slate-900 text-white px-3 py-1.5 rounded text-[10px] font-bold flex items-center gap-1 hover:bg-slate-800"
                    >
                        <Download size={12} /> PDF
                    </button>
                </div>
            </div>

            {/* DASHBOARD CONTENT */}
            <div className="flex-1 overflow-y-auto p-4 md:p-6 grid grid-cols-12 gap-4">

                {/* A. KPI CARDS (Top Row) */}
                <div className="col-span-12 grid grid-cols-2 md:grid-cols-4 gap-4">
                    <KPICard label="Volumen" value={data.kpis?.total_volume} sub="Tickets" />
                    <KPICard label="Facturación" value={`${data.kpis?.total_revenue}€`} sub="Total" />
                    <KPICard label="Ticket Medio" value={`${data.kpis?.avg_ticket}€`} sub="+2% vs mes anterior" highlight />
                    <KPICard label="Tasa Cierre" value={`${data.kpis?.completion_rate}%`} sub="Finalizados" />
                </div>

                {/* B. MAIN CHART (Variable View) */}
                <div className="col-span-12 lg:col-span-8 bg-white rounded-xl border border-slate-200 p-4 shadow-sm h-[400px] flex flex-col">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="text-xs font-bold text-slate-700 uppercase">
                            {activeConcept === 'geo' ? 'Mapa de Densidad' : 'Distribución Principal'}
                        </h3>
                        <div className="flex bg-slate-100 rounded p-0.5">
                            <ChartToggle icon={PieChart} active={viewMode === 'donut'} onClick={() => setViewMode('donut')} />
                            <ChartToggle icon={BarChart} active={viewMode === 'bar'} onClick={() => setViewMode('bar')} />
                            <ChartToggle icon={Activity} active={viewMode === 'line'} onClick={() => setViewMode('line')} />
                        </div>
                    </div>

                    <div className="flex-1 w-full min-h-0">
                        {loading ? <div className="w-full h-full bg-slate-50 animate-pulse rounded" /> : (
                            activeConcept === 'geo'
                                ? <GeoHeatmapGrid data={data.hot_zones} />
                                : <MainChart data={data.market_share} mode={viewMode} /> // Default mock to market_share, adaptable
                        )}
                    </div>
                </div>

                {/* C. FUNNEL & INSIGHTS */}
                <div className="col-span-12 lg:col-span-4 flex flex-col gap-4">

                    {/* Resolution Funnel */}
                    <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex-1">
                        <h3 className="text-xs font-bold text-slate-700 uppercase mb-3">Embudo de Resolución</h3>
                        <div className="space-y-3">
                            {data.status_breakdown?.map((s, idx) => {
                                const max = Math.max(...data.status_breakdown.map(i => i.count));
                                return (
                                    <div key={idx}>
                                        <div className="flex justify-between text-[11px] mb-1">
                                            <span className="capitalize text-slate-600 font-medium">{s.status}</span>
                                            <span className="font-bold text-slate-800">{s.count}</span>
                                        </div>
                                        <div className="h-1.5 w-full bg-slate-50 rounded-full overflow-hidden">
                                            <div
                                                className={`h-full rounded-full ${s.status === 'finalizado' ? 'bg-green-500' : s.status === 'cancelado' ? 'bg-red-400' : 'bg-blue-400'}`}
                                                style={{ width: `${(s.count / max) * 100}%` }}
                                            />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Top Fault */}
                    <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm h-32 flex flex-col justify-center items-center text-center">
                        <span className="text-[10px] text-slate-400 font-bold uppercase">Top Avería Recurrente</span>
                        <span className="text-xl font-black text-slate-800 mt-1">{data.top_fault}</span>
                        <span className="text-[10px] text-red-500 font-medium bg-red-50 px-2 py-0.5 rounded-full mt-2">Atención Requerida</span>
                    </div>

                </div>

            </div>
        </div>
    );
};

// --- SUB-WIDGETS ---

const KPICard = ({ label, value, sub, highlight }) => (
    <div className={`bg-white rounded-xl border p-4 shadow-sm ${highlight ? 'border-blue-200 ring-1 ring-blue-50' : 'border-slate-200'}`}>
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{label}</p>
        <div className="flex items-baseline gap-1 mt-1">
            <span className="text-xl font-black text-slate-800 tracking-tight">{value || '--'}</span>
        </div>
        <p className={`text-[10px] mt-1 font-medium ${highlight ? 'text-green-600' : 'text-slate-400'}`}>{sub}</p>
    </div>
);

const ChartToggle = ({ icon: Icon, active, onClick }) => (
    <button onClick={onClick} className={`p-1.5 rounded ${active ? 'bg-white shadow-sm text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}>
        <Icon size={14} />
    </button>
);

const MainChart = ({ data, mode }) => {
    if (!data || data.length === 0) return <div className="h-full flex items-center justify-center text-slate-400 text-xs">Sin datos para visualizar</div>;

    return (
        <ResponsiveContainer width="100%" height="100%">
            {mode === 'donut' ? (
                <RePieChart>
                    <Pie data={data} innerRadius={60} outerRadius={80} paddingAngle={2} dataKey="value">
                        {data.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', fontSize: '12px' }} />
                    <Legend verticalAlign="bottom" iconType="circle" wrapperStyle={{ fontSize: '11px' }} />
                </RePieChart>
            ) : mode === 'bar' ? (
                <ReBarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} interval={0} />
                    <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', fontSize: '12px' }} />
                    <Bar dataKey="value" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={30} />
                </ReBarChart>
            ) : (
                <ReLineChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', fontSize: '12px' }} />
                    <Line type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={3} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                </ReLineChart>
            )}
        </ResponsiveContainer>
    );
};
// Re-export aliases for cleaner code above
const RePieChart = RePie; const ReBarChart = ReBar; const ReLineChart = ReLine;


const GeoHeatmapGrid = ({ data }) => {
    if (!data || data.length === 0) return <div className="h-full flex items-center justify-center text-slate-400 text-xs">Sin datos geo</div>;

    // Simulate a grid density
    const max = Math.max(...data.map(d => d.value));

    return (
        <div className="grid grid-cols-4 gap-2 h-full content-start overflow-y-auto pr-2">
            {data.map((zone, idx) => {
                const intensity = (zone.value / max) * 100;
                return (
                    <div key={idx} className="bg-slate-50 border border-slate-100 rounded-lg p-2 flex flex-col items-center justify-center relative overflow-hidden group">
                        <span className="text-[10px] text-slate-400 font-mono z-10 relative">{zone.postal_code}</span>
                        <span className="text-sm font-black text-slate-800 z-10 relative">{zone.value}</span>
                        {/* Heat Background */}
                        <div
                            className="absolute bottom-0 left-0 w-full bg-red-500 opacity-20 transition-all group-hover:opacity-30"
                            style={{ height: `${intensity}%` }}
                        />
                    </div>
                );
            })}
        </div>
    );
};


// 3. MAIN CONTAINER
const AnalyticsContainer = () => {
    const [collapsed, setCollapsed] = useState(false);
    const [activeConcept, setActiveConcept] = useState('global');
    const [filters, setFilters] = useState({ type: null, brand: null, tech: null });
    const [viewMode, setViewMode] = useState('donut');

    const [loading, setLoading] = useState(true);
    const [data, setData] = useState(EMPTY_DATA);
    const [metadata, setMetadata] = useState({ types: [], brands: [], techs: [] });

    const [dateRange, setDateRange] = useState(() => {
        const end = new Date();
        const start = new Date();
        start.setDate(end.getDate() - 30);
        return { start: start.toISOString(), end: end.toISOString() };
    });

    useEffect(() => {
        const loadMeta = async () => {
            const [t, b, te] = await Promise.all([
                supabase.from('appliance_types').select('name'),
                supabase.from('brands').select('id, name').order('name'),
                supabase.from('profiles').select('id, full_name').eq('role', 'technician')
            ]);
            setMetadata({
                types: t.data?.map(x => x.name) || [],
                brands: b.data || [],
                techs: te.data || []
            });
        };
        loadMeta();
    }, []);

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                const { data: rpc, error } = await supabase.rpc('get_business_intelligence', {
                    p_start_date: dateRange.start,
                    p_end_date: dateRange.end,
                    p_tech_id: activeConcept === 'tech' ? filters.tech : null,
                    p_zone_cp: null,
                    p_appliance_type: activeConcept === 'appliance' ? filters.type : null,
                    p_brand_id: activeConcept === 'appliance' ? filters.brand : null
                });
                if (error) throw error;
                setData(rpc || EMPTY_DATA);
            } catch (e) {
                console.error(e);
                setData(EMPTY_DATA);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [activeConcept, filters, dateRange]);

    return (
        <div className="h-screen bg-slate-50 flex overflow-hidden font-sans">
            <Navigator
                collapsed={collapsed} setCollapsed={setCollapsed}
                activeConcept={activeConcept} onSelect={setActiveConcept}
                filters={filters} setFilters={setFilters}
                metadata={metadata}
            />
            <div className="flex-1 min-w-0">
                <VisualizationCanvas
                    data={data} loading={loading}
                    dateRange={dateRange} setDateRange={setDateRange}
                    viewMode={viewMode} setViewMode={setViewMode}
                    activeConcept={activeConcept}
                />
            </div>
        </div>
    );
};

export default AnalyticsContainer;
