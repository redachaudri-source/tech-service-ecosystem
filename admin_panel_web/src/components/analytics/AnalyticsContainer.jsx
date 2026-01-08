import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import ConceptNavigator from './ConceptNavigator';
import InsightPanel from './InsightPanel';
import MarketShareWheel from './charts/MarketShareWheel';
import SeasonalityStack from './charts/SeasonalityStack';
import TechRadar from './charts/TechRadar';
import GeoHeatmap from './charts/GeoHeatmap';
import { Activity, Download, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

// Main Container for the Interactive Intelligence Center
const AnalyticsContainer = () => {
    // 1. GLOBAL STATE (THE BRAIN)
    const [loading, setLoading] = useState(true);
    const [lastUpdated, setLastUpdated] = useState(new Date());

    // Selection State
    const [activeConcept, setActiveConcept] = useState('overview'); // overview, appliance, tech, geo
    const [subSelection, setSubSelection] = useState(null); // specific ID or Name (e.g. "Lavadora")

    // Data State (Fetched from RPC)
    const [intelligenceData, setIntelligenceData] = useState(null);
    const [dateRange, setDateRange] = useState('30'); // days

    // 2. DATA FETCHING (THE FEED)
    useEffect(() => {
        fetchIntelligence();
    }, [dateRange, activeConcept, subSelection]);

    const fetchIntelligence = async () => {
        setLoading(true);
        try {
            const endDate = new Date();
            const startDate = new Date();
            startDate.setDate(endDate.getDate() - parseInt(dateRange));

            // Construct Filters based on Concept
            // If activeConcept is 'appliance' and subSelection is 'Lavadora', we filter by type.
            let typeFilter = activeConcept === 'appliance' ? subSelection : null;
            let techFilter = activeConcept === 'tech' ? subSelection : null;

            const { data, error } = await supabase.rpc('get_business_intelligence', {
                p_start_date: startDate.toISOString(),
                p_end_date: endDate.toISOString(),
                p_tech_id: techFilter, // If tech concept active
                p_zone_cp: null, // Zone concept logic to be added
                p_appliance_type: typeFilter
            });

            if (error) throw error;
            setIntelligenceData(data);
            setLastUpdated(new Date());

        } catch (err) {
            console.error('Intelligence Fetch Error:', err);
        } finally {
            // Artificial delay for smooth transition animations if it's too fast
            setTimeout(() => setLoading(false), 300);
        }
    };

    // 3. RENDER LOGIC
    return (
        <div className="min-h-screen bg-slate-50/50 pb-20 relative overflow-hidden flex flex-col">

            {/* A. HEADER (Context Bar) */}
            <div className="bg-white border-b border-slate-200 sticky top-0 z-20 px-6 py-4 flex justify-between items-center shadow-sm">
                <div>
                    <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                        <Activity className="text-blue-600" />
                        Centro de Inteligencia
                    </h1>
                    <p className="text-xs text-slate-400 flex items-center gap-1 mt-1">
                        <RefreshCw size={10} className={loading ? "animate-spin" : ""} />
                        Actualizado: {format(lastUpdated, 'HH:mm:ss', { locale: es })}
                    </p>
                </div>

                {/* Date Controls */}
                <div className="bg-slate-100 p-1 rounded-xl flex text-xs font-bold text-slate-500">
                    {['7', '30', '90', '365'].map(d => (
                        <button
                            key={d}
                            onClick={() => setDateRange(d)}
                            className={`px-3 py-1.5 rounded-lg transition-all ${dateRange === d ? 'bg-white text-slate-800 shadow-sm' : 'hover:text-slate-700'}`}
                        >
                            {d === '365' ? '1A' : `${d}D`}
                        </button>
                    ))}
                </div>
            </div>

            <div className="flex-1 max-w-7xl mx-auto w-full p-6 grid grid-cols-12 gap-6">

                {/* B. NAVIGATION (Left Sidebar / Top Menu) */}
                <div className="col-span-12 md:col-span-3 lg:col-span-2">
                    <ConceptNavigator
                        activeConcept={activeConcept}
                        setActiveConcept={setActiveConcept}
                        subSelection={subSelection}
                        setSubSelection={setSubSelection}
                    />
                </div>

                {/* C. VISUALIZATION STAGE (Center Stage) */}
                <div className="col-span-12 md:col-span-9 lg:col-span-10 space-y-6">

                    {/* KPI Summary (Always visible, adapts to context) */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <InsightPanel data={intelligenceData?.kpis} loading={loading} />
                    </div>

                    {/* DYNAMIC CHARTS GRID */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 min-h-[400px]">

                        {/* Chart 1: Market Share Wheel OR Tech Radar */}
                        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex flex-col">
                            {activeConcept === 'tech' ? (
                                <TechRadar data={intelligenceData?.tech_performance} loading={loading} />
                            ) : (
                                <MarketShareWheel data={intelligenceData?.market_share} loading={loading} />
                            )}
                        </div>

                        {/* Chart 2: Seasonality Stack OR Heatmap */}
                        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex flex-col">
                            <SeasonalityStack data={intelligenceData?.seasonality} loading={loading} />
                        </div>

                    </div>

                    {/* DETAILED DRILLDOWN (Botton Panel) */}
                    <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
                        <h3 className="font-bold text-slate-800 mb-4">Análisis Detallado: {subSelection || 'General'}</h3>
                        {/* We can reuse the Heatmap here or a detailed table depending on context */}
                        <GeoHeatmap data={intelligenceData?.hot_zones} loading={loading} />
                    </div>

                </div>
            </div>
        </div>
    );
};

export default AnalyticsContainer;
