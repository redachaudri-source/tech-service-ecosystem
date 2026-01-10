import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { format, subMonths, startOfYear } from 'date-fns';
import { es } from 'date-fns/locale';
import {
    LayoutGrid, Monitor, User, Map, ChevronRight, ChevronLeft, ChevronDown, ChevronUp,
    Download, Calendar as CalendarIcon, Filter, Layers, Tag as TagIcon,
    PieChart, BarChart, Activity, Smartphone, HelpCircle, Search, X
} from 'lucide-react';
import {
    ResponsiveContainer, PieChart as RePie, Pie, Cell,
    BarChart as ReBar, Bar, XAxis, YAxis, Tooltip, Legend,
    LineChart as ReLine, Line, CartesianGrid, AreaChart, Area
} from 'recharts';
import { generateExecutiveReport } from '../../utils/pdfReportGenerator';

import { MapContainer, TileLayer, CircleMarker, Tooltip as MapTooltip } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

const COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#6366f1', '#ec4899', '#64748b'];

// --- UI COMPONENTS ---

const TooltipHelp = ({ text }) => (
    <div className="group relative ml-2 inline-flex z-50">
        <HelpCircle size={14} className="text-slate-400 cursor-help hover:text-blue-500 transition-colors" />
        <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 w-56 bg-slate-900 text-white text-[10px] p-2.5 rounded-lg shadow-xl opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50 leading-relaxed font-medium">
            {text}
            <div className="absolute left-0 top-1/2 -translate-y-1/2 -ml-1 border-4 border-transparent border-r-slate-900" />
        </div>
    </div>
);

const SearchableSelect = ({ items, onSelect, placeholder, labelKey = 'name', idKey = 'id', renderItem }) => {
    const [query, setQuery] = useState('');
    const [isOpen, setIsOpen] = useState(false);

    const filtered = useMemo(() => {
        if (!query) return items; // Show all if no query (user might just want to scroll)
        return items.filter(i => {
            const val = typeof i === 'object' ? i[labelKey] : i;
            return val?.toLowerCase().includes(query.toLowerCase());
        }).slice(0, 10);
    }, [items, query, labelKey]);

    return (
        <div className="relative mb-3">
            <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                    type="text"
                    value={query}
                    onChange={e => { setQuery(e.target.value); setIsOpen(true); }}
                    onFocus={() => setIsOpen(true)}
                    // On Blur needs delay to allow click
                    onBlur={() => setTimeout(() => setIsOpen(false), 200)}
                    placeholder={placeholder}
                    className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition-all outline-none"
                />
            </div>
            {isOpen && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-100 rounded-lg shadow-lg z-50 max-h-48 overflow-y-auto custom-scrollbar">
                    {filtered.length > 0 ? filtered.map((item, idx) => {
                        const val = typeof item === 'object' ? item[idKey] : item;
                        return (
                            <button
                                key={idx}
                                onClick={() => { onSelect(val); setQuery(''); setIsOpen(false); }}
                                className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50 text-slate-700 flex items-center gap-2 border-b border-slate-50 last:border-0"
                            >
                                {renderItem ? renderItem(item) : (
                                    <>
                                        <TagIcon size={12} className="text-slate-400" />
                                        {typeof item === 'object' ? item[labelKey] : item}
                                    </>
                                )}
                            </button>
                        );
                    }) : (
                        <div className="p-3 text-[10px] text-slate-400 text-center">No hay coincidencias</div>
                    )}
                </div>
            )}
        </div>
    );
};

const TagChip = ({ category, label, onRemove }) => (
    <span className="inline-flex items-center gap-1 bg-white border border-slate-200 rounded-full px-2 py-1 text-[10px] font-medium text-slate-700 shadow-sm animate-in fade-in zoom-in duration-200">
        <span className="text-slate-400 text-[9px] uppercase tracking-wider">{category}:</span>
        {label}
        <button onClick={onRemove} className="ml-1 p-0.5 hover:bg-red-50 hover:text-red-500 rounded-full transition-colors">
            <X size={10} />
        </button>
    </span>
);

const AccordionItem = ({ title, children, isOpen, onToggle, helpText }) => (
    <div className="border-b border-slate-100 last:border-0">
        <button
            onClick={onToggle}
            className="w-full flex items-center justify-between p-3 text-left hover:bg-slate-50 transition-colors"
        >
            <div className="flex items-center">
                <span className="text-xs font-bold text-slate-600 uppercase tracking-wide">{title}</span>
                {helpText && <TooltipHelp text={helpText} />}
            </div>
            {isOpen ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
        </button>
        {isOpen && <div className="p-3 pt-0 animate-in slide-in-from-top-2 duration-200">{children}</div>}
    </div>
);


const Navigator = ({ collapsed, setCollapsed, activeConcept, onSelect, filters, setFilters, metadata }) => {
    const [openSection, setOpenSection] = useState('appliance');

    const toggleSection = (sec) => setOpenSection(openSection === sec ? null : sec);

    const addFilter = (type, value) => {
        setFilters(prev => {
            const current = prev[type] || [];
            if (current.includes(value)) return prev;
            return { ...prev, [type]: [...current, value] };
        });
    };

    const removeFilter = (type, value) => {
        setFilters(prev => ({
            ...prev,
            [type]: (prev[type] || []).filter(v => v !== value)
        }));
    };

    const getLabel = (type, id) => {
        if (type === 'type') return id; // It's just a string string
        if (type === 'brand') return metadata.brands.find(b => b.id === id)?.name || '...';
        if (type === 'tech') return metadata.techs.find(t => t.id === id)?.full_name || '...';
        return id;
    };

    return (
        <div className={`h-full bg-white border-r border-slate-200 flex flex-col transition-all duration-300 ${collapsed ? 'w-16' : 'w-72'}`}>
            {/* HEAD */}
            <div className="p-4 border-b border-slate-100 flex items-center justify-between shrink-0 h-16">
                {!collapsed && (
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-slate-900 rounded-lg flex items-center justify-center text-white shadow-lg shadow-slate-200">
                            <Activity size={18} />
                        </div>
                        <div>
                            <h1 className="font-black text-sm text-slate-800 leading-tight">ANALYTICS</h1>
                            <p className="text-[9px] text-blue-600 font-bold tracking-wide">V3.1 TAG SYSTEM</p>
                        </div>
                    </div>
                )}
                <button onClick={() => setCollapsed(!collapsed)} className="p-1.5 hover:bg-slate-50 rounded-lg text-slate-400 transition-colors">
                    {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
                </button>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar">

                {/* GLOBAL VIEW TOGGLES */}
                <div className="p-3 space-y-1">
                    <button
                        onClick={() => onSelect('global')} // 'global' matches default in Canvas
                        className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-all ${activeConcept === 'global' ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50'}`}
                    >
                        <LayoutGrid size={16} /> {collapsed ? '' : 'Vista Global'}
                    </button>
                    <button
                        onClick={() => onSelect('geo')}
                        className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-all ${activeConcept === 'geo' ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50'}`}
                    >
                        <Map size={16} /> {collapsed ? '' : 'Mapa de Calor'}
                    </button>
                </div>

                {!collapsed && (
                    <>
                        {/* ACTIVE TAGS AREA */}
                        <div className="px-4 py-3 bg-slate-50/50 border-y border-slate-100 min-h-[80px]">
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center justify-between">
                                Comparando:
                                {(filters.type.length + filters.brand.length + filters.tech.length > 0) &&
                                    <button onClick={() => setFilters({ type: [], brand: [], tech: [] })} className="text-[9px] text-red-500 hover:underline">Borrar todo</button>
                                }
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                                {filters.type.map(val => (
                                    <TagChip key={val} category="Tipo" label={getLabel('type', val)} onRemove={() => removeFilter('type', val)} />
                                ))}
                                {filters.brand.map(val => (
                                    <TagChip key={val} category="Marca" label={getLabel('brand', val)} onRemove={() => removeFilter('brand', val)} />
                                ))}
                                {filters.tech.map(val => (
                                    <TagChip key={val} category="Tech" label={getLabel('tech', val)} onRemove={() => removeFilter('tech', val)} />
                                ))}
                                {(filters.type.length + filters.brand.length + filters.tech.length === 0) && (
                                    <p className="text-[10px] text-slate-400 italic">Selecciona filtros abajo...</p>
                                )}
                            </div>
                        </div>

                        {/* FILTER BUILDER ACCORDION */}
                        <div
                            onClick={() => onSelect('appliance')} // Auto-switch view when using these tags
                        >
                            <AccordionItem
                                title="Electrodomésticos"
                                isOpen={openSection === 'appliance'}
                                onToggle={() => toggleSection('appliance')}
                                helpText="Busca y añade tipos de aparato para comparar."
                            >
                                <SearchableSelect
                                    items={metadata.types}
                                    placeholder="Buscar tipo..."
                                    onSelect={(val) => addFilter('type', val)}
                                    labelKey="name" idKey="name" // Types are strings
                                />
                            </AccordionItem>
                        </div>

                        <div onClick={() => onSelect('appliance')}>
                            <AccordionItem
                                title="Marcas"
                                isOpen={openSection === 'brand'}
                                onToggle={() => toggleSection('brand')}
                                helpText="Añade marcas para ver su cuota de mercado o cruzarlas."
                            >
                                <SearchableSelect
                                    items={metadata.brands}
                                    placeholder="Buscar marca..."
                                    onSelect={(val) => addFilter('brand', val)}
                                    labelKey="name" idKey="id"
                                />
                            </AccordionItem>
                        </div>

                        <div onClick={() => onSelect('tech')}>
                            <AccordionItem
                                title="Equipo Técnico"
                                isOpen={openSection === 'tech'}
                                onToggle={() => toggleSection('tech')}
                                helpText="Analiza rendimiento técnico."
                            >
                                <SearchableSelect
                                    items={metadata.techs}
                                    placeholder="Buscar técnico..."
                                    onSelect={(val) => addFilter('tech', val)}
                                    labelKey="full_name" idKey="id"
                                    renderItem={(item) => (
                                        <div className="flex items-center gap-2 w-full">
                                            <div className={`w-2 h-2 rounded-full ${item.is_active ? 'bg-green-500' : 'bg-red-400'}`} />
                                            <span className={`${!item.is_active && 'text-slate-400 line-through decoration-slate-300'}`}>{item.full_name}</span>
                                        </div>
                                    )}
                                />
                            </AccordionItem>
                        </div>
                    </>
                )}
            </div>

            {/* FOOTER NAV - FIXED 'client' mismatch -> 'adoption' */}
            <div className="p-3 border-t border-slate-100 shrink-0 bg-slate-50">
                <button
                    onClick={() => onSelect('adoption')}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-bold transition-all border ${activeConcept === 'adoption' ? 'bg-white border-blue-200 text-blue-700 shadow-sm' : 'border-transparent text-slate-500 hover:bg-white hover:border-slate-200'}`}
                >
                    <div className="flex items-center gap-2">
                        <Smartphone size={16} /> {collapsed ? '' : 'App Clientes'}
                    </div>
                    {!collapsed && <span className="bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded text-[9px]">{metadata.appUsers || 0}</span>}
                </button>
            </div>
        </div>
    );
};

// --- VISUALIZATION CANVAS (Unchanged mostly, just cleaner) ---
// ... (Keeping logic for Chart selection)

// --- GEO MAP (Unchanged) ---
const GeoMap = ({ data, metric = 'volume' }) => {
    const position = [36.7213, -4.4214];
    const markers = data.map(d => {
        const offsetLat = (Math.random() - 0.5) * 0.05;
        const offsetLng = (Math.random() - 0.5) * 0.05;
        return { ...d, lat: 36.7213 + offsetLat, lng: -4.4214 + offsetLng };
    });
    const maxVal = Math.max(...data.map(d => metric === 'revenue' ? (d.revenue || 0) : d.value));

    return (
        <div className="h-full w-full rounded-xl overflow-hidden relative z-0 group">
            <MapContainer center={position} zoom={11} scrollWheelZoom={false} style={{ height: '100%', width: '100%' }}>
                <TileLayer url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png" attribution='&copy; OpenStreetMap' />
                {markers.map((marker, idx) => {
                    const val = metric === 'revenue' ? (marker.revenue || 0) : marker.value;
                    const radius = 5 + (val / (maxVal || 1)) * 20;
                    const color = metric === 'revenue' ? '#10b981' : '#3b82f6';
                    return (
                        <CircleMarker key={idx} center={[marker.lat, marker.lng]} radius={radius} pathOptions={{ color: color, fillColor: color, fillOpacity: 0.6, stroke: false }}>
                            <MapTooltip>
                                <div className="text-xs font-bold">{marker.postal_code}</div>
                                <div className="text-xs">{metric === 'revenue' ? `${val} €` : `${val} Tickets`}</div>
                            </MapTooltip>
                        </CircleMarker>
                    );
                })}
            </MapContainer>
            <div className="absolute top-2 right-2 z-[400] bg-white/90 backdrop-blur p-1 rounded-lg border border-slate-200 shadow-sm text-[10px] font-bold">
                {metric === 'revenue' ? '🔥 Facturación (€)' : '🔥 Volumen (Tickets)'}
            </div>
        </div>
    );
};

// --- CHART & KPI COMPONENTS (Unchanged) ---
const KPICard = ({ label, value, sub, highlight }) => (
    <div className={`bg-white rounded-xl border p-4 shadow-sm ${highlight ? 'border-blue-200 ring-1 ring-blue-50' : 'border-slate-200'}`}>
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{label}</p>
        <div className="flex items-baseline gap-1 mt-1">
            <span className="text-xl font-black text-slate-800 tracking-tight">{value || (value === 0 ? '0' : '--')}</span>
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
// Aliases
const RePieChart = RePie; const ReBarChart = ReBar; const ReLineChart = ReLine;

const VisualizationCanvas = ({ data, loading, dateRange, setDateRange, viewMode, setViewMode, activeConcept, rpcError, mapMetric, onToggleMapMetric, filters }) => {

    const applyPreset = (months) => {
        const end = new Date();
        const start = months === 'YTD' ? startOfYear(new Date()) : subMonths(new Date(), months);
        if (months === 'ALL') { start.setFullYear(2020); }
        setDateRange({ start: start.toISOString(), end: end.toISOString() });
    };

    let mainChartData = data.market_share;
    let mainChartTitle = 'Distribución Principal';

    if (activeConcept === 'appliance') {
        const hasTypeFilter = filters?.type?.length > 0;
        const hasBrandFilter = filters?.brand?.length > 0;

        if (hasTypeFilter && hasBrandFilter && data.cross_reference && data.cross_reference.length > 0) {
            mainChartData = data.cross_reference;
            mainChartTitle = `COMPARATIVA CRUZADA (${filters.brand.length} Marcas x ${filters.type.length} Tipos)`;
        } else if (hasTypeFilter && filters.type.length > 1) {
            mainChartData = data.type_share; // If multiple types, show type share? No, usually type share shows breakdown.
            mainChartTitle = 'Comparativa de Tipos Seleccionados';
        } else if (hasTypeFilter) {
            // 1 Type selected -> Show Brands for that type
            mainChartData = data.market_share;
            mainChartTitle = `Marcas para: ${filters.type[0]}`;
        } else if (hasBrandFilter) {
            // 1 Brand selected -> Show Types for that brand
            mainChartData = data.type_share;
            mainChartTitle = `Tipos para: ${filters.brand.length} Marcas`;
        } else {
            mainChartData = data.market_share;
            mainChartTitle = 'Cuota de Mercado Global';
        }
    } else if (activeConcept === 'tech') {
        mainChartData = data.tech_performance;
        mainChartTitle = 'Rendimiento Técnico';
    }

    // Force Bar for Cross Ref
    const effectiveViewMode = (activeConcept === 'appliance' && filters?.type?.length > 0 && filters?.brand?.length > 0) ? 'bar' : viewMode;

    const getDashboardTitle = () => {
        if (activeConcept === 'appliance' && (filters.brand.length > 0 || filters.type.length > 0)) return "ANÁLISIS FILTRADO";
        switch (activeConcept) {
            case 'adoption': return 'Adopción App';
            case 'geo': return 'Mapa Geográfico';
            case 'tech': return 'Equipo Técnico';
            default: return 'Visión Global';
        }
    };

    return (
        <div className="flex flex-col h-full bg-slate-50 overflow-hidden">
            <div className="bg-white border-b border-slate-200 px-6 py-3 flex justify-between items-center shrink-0">
                <div className="flex items-center gap-4">
                    <h1 className="text-sm font-black text-slate-800 uppercase tracking-tight">{getDashboardTitle()}</h1>
                    <div className="h-4 w-px bg-slate-200" />
                    <div className="flex gap-1">
                        {[{ l: '6M', v: 6 }, { l: 'YTD', v: 'YTD' }, { l: 'ALL', v: 'ALL' }].map(p => (
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

            <div className="flex-1 overflow-y-auto p-4 md:p-6 text-slate-800">
                {activeConcept === 'adoption' ? (
                    <div className="space-y-6">
                        <div className="flex items-center justify-between">
                            <h2 className="text-xl font-bold text-slate-800">Métricas de Adopción (App)</h2>
                            <button
                                onClick={() => onSelect('global')}
                                className="text-xs text-slate-500 hover:text-slate-800 underline"
                            >
                                Volver al Dashboard
                            </button>
                        </div>
                        <div className="grid grid-cols-3 gap-6">
                            <KPICard label="Usuarios Totales" value={data.client_adoption?.total_users} sub="Registros Históricos (APP)" />
                            <KPICard label="Usuarios Activos" value={data.client_adoption?.active_30d} sub="Login últimos 30 días" highlight />
                            <KPICard label="Tasa Conversión" value={`${data.client_adoption?.conversion_rate}%`} sub="Registros CON Ticket" />
                        </div>
                        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm h-80">
                            <h3 className="text-xs font-bold text-slate-700 uppercase mb-4">Curva de Crecimiento</h3>
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={data.client_adoption?.growth_curve}>
                                    <defs><linearGradient id="colorNew" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8} /><stop offset="95%" stopColor="#3b82f6" stopOpacity={0} /></linearGradient></defs>
                                    <XAxis dataKey="month" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                                    <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                                    <Tooltip />
                                    <Area type="monotone" dataKey="new_users" stroke="#3b82f6" fillOpacity={1} fill="url(#colorNew)" />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                ) : (
                    <div className="grid grid-cols-12 gap-4">
                        <div className="col-span-12 grid grid-cols-2 md:grid-cols-4 gap-4">
                            <KPICard label="Volumen" value={data.kpis?.total_volume} sub="Tickets" />
                            <KPICard label="Facturación" value={`${data.kpis?.total_revenue}€`} sub="Total" />
                            <KPICard label="Ticket Medio" value={`${data.kpis?.avg_ticket}€`} sub="+2% vs mes anterior" highlight />
                            <KPICard label="Tasa Cierre" value={`${data.kpis?.completion_rate}%`} sub="Finalizados" />
                        </div>

                        <div className="col-span-12 lg:col-span-8 bg-white rounded-xl border border-slate-200 p-4 shadow-sm h-[450px] flex flex-col">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="text-xs font-bold text-slate-700 uppercase">{activeConcept === 'geo' ? 'Mapa Geográfico' : mainChartTitle}</h3>
                                {activeConcept !== 'geo' && (
                                    <div className="flex bg-slate-100 rounded p-0.5">
                                        <ChartToggle icon={PieChart} active={effectiveViewMode === 'donut'} onClick={() => setViewMode('donut')} />
                                        <ChartToggle icon={BarChart} active={effectiveViewMode === 'bar'} onClick={() => setViewMode('bar')} />
                                        <ChartToggle icon={Activity} active={effectiveViewMode === 'line'} onClick={() => setViewMode('line')} />
                                    </div>
                                )}
                                {activeConcept === 'geo' && (
                                    <button onClick={onToggleMapMetric} className="bg-slate-100 text-slate-600 px-2 py-1 rounded text-[10px] font-bold border border-slate-200 hover:bg-slate-200">
                                        {mapMetric === 'revenue' ? 'Ver Volumen' : 'Ver €'}
                                    </button>
                                )}
                            </div>
                            <div className="flex-1 w-full min-h-0">
                                {activeConcept === 'geo'
                                    ? <GeoMap data={data.hot_zones} metric={mapMetric} />
                                    : <MainChart data={mainChartData} mode={effectiveViewMode} />
                                }
                            </div>
                        </div>

                        <div className="col-span-12 lg:col-span-4 flex flex-col gap-4">
                            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex-1">
                                <h3 className="text-xs font-bold text-slate-700 uppercase mb-3">Estados</h3>
                                <div className="space-y-2">
                                    {data.status_breakdown?.map((s, idx) => (
                                        <div key={idx} className="flex justify-between text-[11px]">
                                            <span className="capitalize text-slate-600">{s.status}</span>
                                            <span className="font-bold">{s.count}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm h-32 flex flex-col justify-center items-center text-center">
                                <span className="text-[10px] text-slate-400 font-bold uppercase">Top Avería</span>
                                <span className="text-xl font-black text-slate-800 mt-1">{data.top_fault}</span>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

const AnalyticsContainer = () => {
    const [collapsed, setCollapsed] = useState(false);
    const [activeConcept, setActiveConcept] = useState('global');
    const [filters, setFilters] = useState({ type: [], brand: [], tech: [] });
    const [viewMode, setViewMode] = useState('donut');
    const [mapMetric, setMapMetric] = useState('volume');
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState({});
    const [metadata, setMetadata] = useState({ types: [], brands: [], techs: [], appUsers: 0 });
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
                supabase.from('profiles').select('id, full_name, role, is_active').eq('role', 'tech')
            ]);

            const { count } = await supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'client').neq('created_via', 'admin');
            setMetadata({
                types: t.data?.map(x => x.name) || [],
                brands: b.data || [],
                techs: te.data || [],
                appUsers: count || 0
            });
        };
        loadMeta();
    }, []);

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                const params = {
                    p_start_date: dateRange.start,
                    p_end_date: dateRange.end,
                    p_tech_ids: filters.tech.length > 0 ? filters.tech : null,
                    p_zone_cps: null,
                    p_appliance_types: filters.type.length > 0 ? filters.type : null,
                    p_brand_ids: filters.brand.length > 0 ? filters.brand : null
                };
                const { data: rpc, error } = await supabase.rpc('get_analytics_v3', params);
                if (error) throw error;
                setData(rpc || {});
            } catch (e) {
                console.error(e);
                setData({});
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
            <div className="flex-1 min-w-0 flex flex-col">
                <VisualizationCanvas
                    data={data} loading={loading}
                    dateRange={dateRange} setDateRange={setDateRange}
                    viewMode={viewMode} setViewMode={setViewMode}
                    activeConcept={activeConcept}
                    mapMetric={mapMetric}
                    onToggleMapMetric={() => setMapMetric(prev => prev === 'volume' ? 'revenue' : 'volume')}
                    filters={filters}
                />
            </div>
        </div>
    );
};

export default AnalyticsContainer;
