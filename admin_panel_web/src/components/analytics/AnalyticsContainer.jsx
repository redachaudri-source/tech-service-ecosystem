import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
    LayoutGrid, Monitor, User, Map, ChevronRight,
    Download, Calendar as CalendarIcon, Filter, Layers, Tag as TagIcon
} from 'lucide-react';
import MarketShareWheel from './charts/MarketShareWheel';
import { generateExecutiveReport } from '../../utils/pdfReportGenerator';

const EMPTY_DATA = {
    kpis: { total_volume: 0, total_revenue: 0, avg_ticket: 0, completion_rate: 0 },
    market_share: [],
    seasonality: [],
    hot_zones: [],
    tech_performance: [],
    top_fault: 'Sin datos'
};

// --- COMPONENTS ---

// 1. NAVIGATOR (Multi-Dim Filter)
const Navigator = ({ activeConcept, onSelect, filters, setFilters, metadata, loadingMetadata }) => {

    const { types, brands } = metadata;

    const toggleFilter = (key, value) => {
        setFilters(prev => ({
            ...prev,
            [key]: prev[key] === value ? null : value // Toggle Logic
        }));
    };

    return (
        <div className="bg-white h-full border-r border-slate-100 p-4 flex flex-col gap-6 overflow-y-auto w-full">
            <div className="px-2">
                <h2 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">Panel de Mando</h2>

                {/* GLOBAL VIEW */}
                <button
                    onClick={() => onSelect('global')}
                    className={`w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all duration-300 group mb-2
                        ${activeConcept === 'global'
                            ? 'bg-slate-900 text-white shadow-lg shadow-slate-200'
                            : 'text-slate-500 hover:bg-slate-50'
                        }
                    `}
                >
                    <div className="flex items-center gap-3">
                        <LayoutGrid size={18} className={activeConcept === 'global' ? 'text-blue-400' : 'text-slate-400'} />
                        <span className="font-medium">Global</span>
                    </div>
                </button>

                {/* DEEP FILTERING SECTION */}
                <div>
                    <button
                        onClick={() => onSelect('appliance')}
                        className={`w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all duration-300 group
                            ${activeConcept === 'appliance'
                                ? 'bg-blue-50 text-blue-700 font-bold border border-blue-100'
                                : 'text-slate-500 hover:bg-slate-50'
                            }
                        `}
                    >
                        <div className="flex items-center gap-3">
                            <Filter size={18} className={activeConcept === 'appliance' ? 'text-blue-600' : 'text-slate-400'} />
                            <span>Filtrado Profundo</span>
                        </div>
                    </button>

                    {/* EXPANDED FILTERS (When 'appliance' concept / Deep Filter is active) */}
                    {activeConcept === 'appliance' && (
                        <div className="mt-3 ml-2 border-l-2 border-slate-100 pl-3 space-y-6 animate-in slide-in-from-left-2 duration-300">

                            {/* TYPE FILTER */}
                            <div>
                                <h3 className="text-xs font-bold text-slate-400 uppercase flex items-center gap-2 mb-2">
                                    <Layers size={12} /> Por Tipo
                                </h3>
                                <div className="space-y-1">
                                    {loadingMetadata ? <p className="text-xs text-slate-300">Cargando...</p> : types.map(t => (
                                        <button
                                            key={t}
                                            onClick={() => toggleFilter('type', t)}
                                            className={`w-full text-left px-3 py-1.5 text-xs rounded-md transition-all flex justify-between items-center
                                                ${filters.type === t
                                                    ? 'bg-blue-600 text-white shadow-md'
                                                    : 'text-slate-500 hover:bg-slate-100'
                                                }`}
                                        >
                                            {t}
                                            {filters.type === t && <span className="bg-white/20 text-white px-1.5 rounded text-[9px]">ON</span>}
                                        </button>
                                    ))}
                                    {types.length === 0 && <p className="text-xs text-slate-300 italic">Sin tipos registrados</p>}
                                </div>
                            </div>

                            {/* BRAND FILTER */}
                            <div>
                                <h3 className="text-xs font-bold text-slate-400 uppercase flex items-center gap-2 mb-2">
                                    <TagIcon size={12} /> Por Marca
                                </h3>
                                <div className="space-y-1">
                                    {loadingMetadata ? <p className="text-xs text-slate-300">Cargando...</p> : brands.map(b => (
                                        <button
                                            key={b.id}
                                            onClick={() => toggleFilter('brand', b.id)}
                                            className={`w-full text-left px-3 py-1.5 text-xs rounded-md transition-all flex justify-between items-center
                                                ${filters.brand === b.id
                                                    ? 'bg-purple-600 text-white shadow-md'
                                                    : 'text-slate-500 hover:bg-slate-100'
                                                }`}
                                        >
                                            {b.name}
                                            {filters.brand === b.id && <span className="bg-white/20 text-white px-1.5 rounded text-[9px]">ON</span>}
                                        </button>
                                    ))}
                                    {brands.length === 0 && <p className="text-xs text-slate-300 italic">Sin marcas registradas</p>}
                                </div>
                            </div>

                        </div>
                    )}
                </div>

                {/* OTHER CONCEPTS (Disabled if filtering deeply?) No, keep available */}
                <div className="mt-2 space-y-1">
                    {['tech', 'geo'].map(id => (
                        <button
                            key={id}
                            onClick={() => onSelect(id)}
                            className={`w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all duration-300 group
                                ${activeConcept === id
                                    ? 'bg-slate-900 text-white shadow-lg shadow-slate-200'
                                    : 'text-slate-500 hover:bg-slate-50'
                                }
                            `}
                        >
                            <div className="flex items-center gap-3">
                                {id === 'tech' ? <User size={18} className="text-slate-400" /> : <Map size={18} className="text-slate-400" />}
                                <span className="font-medium">{id === 'tech' ? 'Técnicos' : 'Zonas'}</span>
                            </div>
                        </button>
                    ))}
                </div>

            </div>
        </div>
    );
};

// 2. CANVAS
const VisualizationCanvas = ({ data, loading, dateRange, setDateRange }) => {
    // Canvas Helper
    const formatDate = (date) => date ? date.split('T')[0] : '';
    return (
        <div className="p-8 h-full overflow-y-auto bg-slate-50/50">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-8 gap-4">
                <div>
                    <h1 className="text-3xl font-black text-slate-900 tracking-tight">Informe Operativo</h1>
                    <p className="text-slate-400 mt-1">
                        {loading ? 'Sincronizando...' : 'Datos en tiempo real de Supabase'}
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <div className="bg-white border border-slate-200 p-1 rounded-lg flex items-center shadow-sm">
                        <div className="flex items-center px-2 text-slate-400"><CalendarIcon size={16} /></div>
                        <input
                            type="date"
                            className="text-sm font-bold text-slate-600 bg-transparent outline-none p-1"
                            value={formatDate(dateRange.start)}
                            onChange={(e) => setDateRange({ ...dateRange, start: new Date(e.target.value).toISOString() })}
                        />
                        <span className="text-slate-300 mx-1">-</span>
                        <input
                            type="date"
                            className="text-sm font-bold text-slate-600 bg-transparent outline-none p-1"
                            value={formatDate(dateRange.end)}
                            onChange={(e) => setDateRange({ ...dateRange, end: new Date(e.target.value).toISOString() })}
                        />
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 pb-20">

                <div className="lg:col-span-2 bg-white rounded-3xl p-6 shadow-sm border border-slate-100 relative h-[450px] flex flex-col">
                    <MarketShareWheel data={data.market_share} loading={loading} />
                </div>

                <div className="space-y-4 h-full flex flex-col justify-start">
                    <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex-1 max-h-[140px] flex flex-col justify-center">
                        <p className="text-xs font-bold text-slate-400 uppercase mb-2">Ticket Medio</p>
                        <p className="text-4xl font-black text-slate-800">{data.kpis?.avg_ticket || 0}€</p>
                        <div className="h-1 w-full bg-slate-100 rounded-full mt-4 overflow-hidden">
                            <div className="h-full bg-green-500" style={{ width: '100%' }}></div>
                        </div>
                    </div>
                    <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex-1 max-h-[140px] flex flex-col justify-center">
                        <p className="text-xs font-bold text-slate-400 uppercase mb-2">Volumen</p>
                        <p className="text-3xl font-black text-slate-800 truncate">{data.kpis?.total_volume || 0} trabajos</p>
                        <p className="text-sm text-slate-400 mt-1">Facturado: {data.kpis?.total_revenue || 0}€</p>
                    </div>
                    <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex-1 max-h-[140px] flex flex-col justify-center">
                        <p className="text-xs font-bold text-slate-400 uppercase mb-2">Top Avería</p>
                        <p className="text-2xl font-black text-slate-800 truncate">{data.top_fault || 'N/A'}</p>
                    </div>
                </div>
            </div>
        </div>
    );
};

// 3. MAIN CONTAINER
const AnalyticsContainer = () => {
    const [activeConcept, setActiveConcept] = useState('global');
    const [filters, setFilters] = useState({ type: null, brand: null }); // Deep Filters (Type AND Brand)

    // Data & State
    const [loading, setLoading] = useState(true);
    const [loadingMetadata, setLoadingMetadata] = useState(true);
    const [data, setData] = useState(EMPTY_DATA);
    const [metadata, setMetadata] = useState({ types: [], brands: [] });

    const [dateRange, setDateRange] = useState(() => {
        const end = new Date();
        const start = new Date();
        start.setDate(end.getDate() - 30);
        return { start: start.toISOString(), end: end.toISOString() };
    });

    useEffect(() => {
        // Init: Load Metadata for filters
        fetchMetadata();
    }, []);

    useEffect(() => {
        fetchRealData();
    }, [activeConcept, filters, dateRange]);

    const fetchMetadata = async () => {
        setLoadingMetadata(true);
        try {
            // 1. Fetch Types (From tickets/config)
            // Ideally from config, but let's query distinct tickets types if needed.
            // Using appliance_types table for clean list:
            const { data: typesData } = await supabase.from('appliance_types').select('name');
            const types = typesData ? typesData.map(t => t.name) : [];

            // 2. Fetch Brands (Real brands used in tickets)
            // We can query the brands table.
            const { data: brandsData } = await supabase.from('brands').select('id, name').order('name');
            const brands = brandsData || [];

            setMetadata({ types, brands });

        } catch (err) {
            console.error("Metadata Error:", err);
        } finally {
            setLoadingMetadata(false);
        }
    };

    const fetchRealData = async () => {
        setLoading(true);
        try {
            const { data: rpcData, error } = await supabase.rpc('get_business_intelligence', {
                p_start_date: dateRange.start,
                p_end_date: dateRange.end,
                p_tech_id: null, // Tech filter logic could be added here later if concept is 'tech'
                p_zone_cp: null,
                p_appliance_type: activeConcept === 'appliance' ? filters.type : null, // Only apply if in 'appliance' mode? Or always? Let's obey ActiveConcept convention.
                p_brand_id: activeConcept === 'appliance' ? filters.brand : null
            });

            if (error) throw error;
            setData(rpcData || EMPTY_DATA);

        } catch (err) {
            console.error("Analytics Fetch Error:", err);
            setData(EMPTY_DATA); // Mocks removed, clean fallback
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 flex overflow-hidden">
            {/* LEFT COLUMN: 20% width (approx 300px) */}
            <div className="w-72 h-screen shrink-0 sticky top-0 hidden md:block border-r border-slate-200">
                <Navigator
                    activeConcept={activeConcept}
                    onSelect={(c) => {
                        setActiveConcept(c);
                        if (c !== 'appliance') {
                            setFilters({ type: null, brand: null }); // Reset deep filters when leaving mode
                        }
                    }}
                    filters={filters}
                    setFilters={setFilters}
                    metadata={metadata}
                    loadingMetadata={loadingMetadata}
                />
            </div>

            {/* RIGHT COLUMN */}
            <div className="flex-1 h-screen overflow-hidden relative">
                <VisualizationCanvas
                    data={data}
                    loading={loading}
                    dateRange={dateRange}
                    setDateRange={setDateRange}
                />
            </div>
        </div>
    );
};

export default AnalyticsContainer;
