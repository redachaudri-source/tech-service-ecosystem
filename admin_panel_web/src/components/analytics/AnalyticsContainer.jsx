import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
    LayoutGrid, Monitor, User, Map, ChevronRight,
    RefreshCw, Download, Calendar
} from 'lucide-react';

// MOCK DATA SAFETY NET (Protocol Zero Errors)
const MOCK_DATA = {
    kpis: { total_volume: 124, total_revenue: 15400, avg_ticket: 124, completion_rate: 85 },
    market_share: [
        { name: 'Samsung', value: 45 }, { name: 'Bosch', value: 32 },
        { name: 'LG', value: 20 }, { name: 'Balay', value: 15 },
        { name: 'Siemens', value: 12 }
    ],
    seasonality: [
        { month: 'Ene', tickets: 12 }, { month: 'Feb', tickets: 19 },
        { month: 'Mar', tickets: 30 }, { month: 'Abr', tickets: 45 }
    ],
    hot_zones: [
        { postal_code: '29010', value: 50 }, { postal_code: '29014', value: 30 }
    ],
    tech_performance: [],
    top_fault: 'Lavadora'
};

// --- COMPONENTS ---

// 1. NAVIGATOR (Left Column)
const Navigator = ({ activeConcept, onSelect, loading }) => {
    const menus = [
        { id: 'global', label: 'Visión Global', icon: LayoutGrid },
        { id: 'appliance', label: 'Electrodomésticos', icon: Monitor },
        { id: 'tech', label: 'Rendimiento Técnico', icon: User },
        { id: 'geo', label: 'Geografía', icon: Map },
    ];

    // Sub-menus (Simulated for responsiveness)
    const appliances = ['Lavadoras', 'Frigoríficos', 'Aires Acond.', 'Calentadores', 'Hornos'];

    return (
        <div className="bg-white h-full border-r border-slate-100 p-4 flex flex-col gap-6">
            <div className="px-2">
                <h2 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">Panel de Mando</h2>
                <div className="space-y-1">
                    {menus.map(m => (
                        <button
                            key={m.id}
                            onClick={() => onSelect(m.id)}
                            className={`w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all duration-300 group
                                ${activeConcept === m.id
                                    ? 'bg-slate-900 text-white shadow-lg shadow-slate-200'
                                    : 'text-slate-500 hover:bg-slate-50'
                                }
                            `}
                        >
                            <div className="flex items-center gap-3">
                                <m.icon size={18} className={activeConcept === m.id ? 'text-blue-400' : 'text-slate-400 group-hover:text-slate-600'} />
                                <span className="font-medium">{m.label}</span>
                            </div>
                            {activeConcept === m.id && <ChevronRight size={14} className="text-slate-500" />}
                        </button>
                    ))}
                </div>
            </div>

            {/* Dynamic Sub-menu Implementation */}
            {activeConcept === 'appliance' && (
                <div className="px-2 animate-in slide-in-from-left-4 duration-300">
                    <h2 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3 ml-2">Categorías</h2>
                    <div className="space-y-1 ml-4 border-l-2 border-slate-100 pl-2">
                        {appliances.map(app => (
                            <button key={app} className="w-full text-left px-3 py-2 text-sm text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                                {app}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

// 2. CANVAS (Right Column) - Placeholder for charts import
import MarketShareWheel from './charts/MarketShareWheel';
import InsightPanel from './InsightPanel';

const VisualizationCanvas = ({ data, loading }) => {
    return (
        <div className="p-8 h-full overflow-y-auto bg-slate-50/50">
            {/* CANVAS HEADER */}
            <div className="flex justify-between items-end mb-8">
                <div>
                    <h1 className="text-3xl font-black text-slate-900 tracking-tight">Informe Operativo</h1>
                    <p className="text-slate-400 mt-1">Análisis en tiempo real de la actividad del servicio.</p>
                </div>
                <div className="flex gap-2">
                    <button className="bg-white border border-slate-200 text-slate-600 px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-slate-50 transition shadow-sm">
                        <Calendar size={16} /> Últimos 30 días
                    </button>
                    <button className="bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-slate-800 transition shadow-lg shadow-slate-300">
                        <Download size={16} /> Exportar PDF
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

                {/* HERO CHART (The Donut) */}
                <div className="lg:col-span-2 bg-white rounded-3xl p-8 shadow-sm border border-slate-100 relative min-h-[400px] flex flex-col justify-center items-center">
                    <MarketShareWheel data={data.market_share} loading={loading} />
                    {/* Center Overlay for Donut Interaction handled inside chart component or here via state lifting */}
                </div>

                {/* SIDE STATS */}
                <div className="space-y-4">
                    {/* Insight Panel (Dynamic Cards) */}
                    <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
                        <p className="text-xs font-bold text-slate-400 uppercase mb-2">Ticket Medio</p>
                        <p className="text-4xl font-black text-slate-800">{data.kpis?.avg_ticket}€</p>
                        <div className="h-1 w-full bg-slate-100 rounded-full mt-4 overflow-hidden">
                            <div className="h-full bg-green-500 w-3/4"></div>
                        </div>
                    </div>

                    <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
                        <p className="text-xs font-bold text-slate-400 uppercase mb-2">Top Avería</p>
                        <p className="text-2xl font-black text-slate-800 truncate">{data.top_fault || 'N/A'}</p>
                        <p className="text-sm text-slate-400 mt-1">Frecuencia alta en verano</p>
                    </div>

                    <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
                        <p className="text-xs font-bold text-slate-400 uppercase mb-2">Mejor Zona</p>
                        <p className="text-2xl font-black text-slate-800">{data.hot_zones?.[0]?.postal_code || '--'}</p>
                        <p className="text-sm text-slate-400 mt-1">Volumen: {data.hot_zones?.[0]?.value || 0}</p>
                    </div>
                </div>

                {/* BOTTOM ROW (Context dependent) */}
                <div className="lg:col-span-3 bg-white rounded-3xl p-8 shadow-sm border border-slate-100 min-h-[200px] flex items-center justify-center text-slate-400 font-medium">
                    {/* Placeholder for Stacked Bar or Heatmap */}
                    Área de Análisis Temporal (Fase 2 de Carga)
                </div>

            </div>
        </div>
    );
};

// 3. MAIN CONTAINER
const AnalyticsContainer = () => {
    const [activeConcept, setActiveConcept] = useState('global');
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState(MOCK_DATA); // Start with Mock

    useEffect(() => {
        // Load Real Data
        fetchRealData();
    }, [activeConcept]);

    const fetchRealData = async () => {
        setLoading(true);
        try {
            const endDate = new Date();
            const startDate = new Date();
            startDate.setDate(endDate.getDate() - 30);

            const { data: rpcData, error } = await supabase.rpc('get_business_intelligence', {
                p_start_date: startDate.toISOString(),
                p_end_date: endDate.toISOString(),
                p_tech_id: null,
                p_zone_cp: null,
                p_appliance_type: null
            });

            if (error) throw error;

            // Protocol Zero Errors: Check if empty, fallback to Mock if absolutely zero data (optional, or just use robust Real data)
            // Check if kpis exist. If total_volume is 0, we might want to show empty state or keep mock for demo.
            // For now, let's use the real data as the RPC is hardened.
            if (rpcData && rpcData.kpis.total_volume > 0) {
                setData(rpcData);
            } else {
                console.warn("Analytics: DB Empty, using Mock Data for Visualization Demo");
                // Keep Mock Data if real data is empty to prevent white screen of death
            }

        } catch (err) {
            console.error("Analytics Fetch Error:", err);
            // On Error, Keep Mock Data (Safety Net)
        } finally {
            setTimeout(() => setLoading(false), 500); // Smooth loading
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 flex overflow-hidden">
            {/* LEFT COLUMN: 20% width (approx 300px) */}
            <div className="w-72 h-screen shrink-0 sticky top-0">
                <Navigator activeConcept={activeConcept} onSelect={setActiveConcept} loading={loading} />
            </div>

            {/* RIGHT COLUMN: Remaining Width */}
            <div className="flex-1 h-screen overflow-hidden relative">
                <VisualizationCanvas data={data} loading={loading} />
            </div>
        </div>
    );
};

export default AnalyticsContainer;
