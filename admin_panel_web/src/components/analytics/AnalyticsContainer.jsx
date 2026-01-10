import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { format, subMonths, startOfYear } from 'date-fns';
import { es } from 'date-fns/locale';
import {
    LayoutGrid, Monitor, User, Map, ChevronRight, ChevronLeft, ChevronDown, ChevronUp,
    Download, Calendar as CalendarIcon, Filter, Layers, Tag as TagIcon,
    PieChart, BarChart, Activity, Smartphone, HelpCircle, Search, X, Menu
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


const Navigator = ({ collapsed, setCollapsed, activeConcept, onSelect, filters, setFilters, metadata, isMobileOpen, setIsMobileOpen }) => {
    // defined concepts: 'business', 'tech', 'adoption'
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
        if (type === 'type') return id;
        if (type === 'brand') return metadata.brands.find(b => b.id === id)?.name || '...';
        if (type === 'tech') return metadata.techs.find(t => t.id === id)?.full_name || '...';
        return id;
    };

    const NavButton = ({ id, icon: Icon, label, count }) => (
        <button
            onClick={() => { onSelect(id); setIsMobileOpen(false); }}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-bold transition-all border mb-1 ${activeConcept === id ? 'bg-blue-50 border-blue-200 text-blue-700 shadow-sm' : 'border-transparent text-slate-500 hover:bg-slate-50'}`}
        >
            <div className="flex items-center gap-3">
                <Icon size={16} />
                {(!collapsed || isMobileOpen) && label}
            </div>
            {(!collapsed || isMobileOpen) && count !== undefined && <span className="bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded text-[9px]">{count}</span>}
        </button>
    );

    // Sidebar Classes: Fixed on Mobile, Static on Desktop
    // Mobile: Hidden by default (translate-x-full), Slide in when open.
    // Desktop: Always visible, width controlled by collapsed.
    const sidebarClasses = `
        fixed inset-y-0 left-0 z-50 bg-white border-r border-slate-200 flex flex-col transition-all duration-300 shadow-2xl md:shadow-none
        md:static md:translate-x-0
        ${isMobileOpen ? 'translate-x-0 w-72' : '-translate-x-full'}
        ${collapsed ? 'md:w-16' : 'md:w-72'}
    `;

    return (
        <>
            {/* Mobile Overlay */}
            {isMobileOpen && (
                <div
                    className="fixed inset-0 bg-slate-900/50 z-40 md:hidden backdrop-blur-sm"
                    onClick={() => setIsMobileOpen(false)}
                />
            )}

            <div className={sidebarClasses}>
                {/* HEAD */}
                <div className="p-4 border-b border-slate-100 flex items-center justify-between shrink-0 h-16">
                    {(!collapsed || isMobileOpen) && (
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 bg-slate-900 rounded-lg flex items-center justify-center text-white shadow-lg shadow-slate-200">
                                <Activity size={18} />
                            </div>
                            <div>
                                <h1 className="font-black text-sm text-slate-800 leading-tight">ANALYTICS</h1>
                                <p className="text-[9px] text-blue-600 font-bold tracking-wide">V4.1 MOBILE</p>
                            </div>
                        </div>
                    )}
                    <div className="flex gap-1">
                        {/* Only show collapse toggle on desktop */}
                        <button onClick={() => setCollapsed(!collapsed)} className="hidden md:block p-1.5 hover:bg-slate-50 rounded-lg text-slate-400 transition-colors">
                            {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
                        </button>
                        {/* Close button on mobile */}
                        <button onClick={() => setIsMobileOpen(false)} className="md:hidden p-1.5 hover:bg-slate-50 rounded-lg text-slate-400">
                            <X size={16} />
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col">

                    {/* PRIMARY NAVIGATION */}
                    <div className="p-3 pb-0">
                        <p className="px-3 mb-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider">{(!collapsed || isMobileOpen) && 'Vistas'}</p>
                        <NavButton id="business" icon={LayoutGrid} label="Negocio & Mercado" />
                        <NavButton id="tech" icon={User} label="Equipo Técnico" />
                        <NavButton id="adoption" icon={Smartphone} label="App Clientes" count={metadata.appUsers || 0} />
                    </div>

                    {/* FILTERS SECTION */}
                    {(!collapsed || isMobileOpen) && (
                        <div className="mt-4 flex-1">
                            <div className="px-4 py-2 bg-slate-50/50 border-y border-slate-100 min-h-[60px]">
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center justify-between">
                                    {filters.type.length + filters.brand.length + filters.tech.length > 0 ? 'Filtros:' : 'Sin filtros'}
                                    {(filters.type.length + filters.brand.length + filters.tech.length > 0) &&
                                        <button onClick={() => setFilters({ type: [], brand: [], tech: [] })} className="text-[9px] text-red-500 hover:underline">Borrar</button>
                                    }
                                </p>
                                <div className="flex flex-wrap gap-1.5">
                                    {activeConcept === 'business' && filters.type.map(val => (
                                        <TagChip key={val} category="Tipo" label={getLabel('type', val)} onRemove={() => removeFilter('type', val)} />
                                    ))}
                                    {activeConcept === 'business' && filters.brand.map(val => (
                                        <TagChip key={val} category="Marca" label={getLabel('brand', val)} onRemove={() => removeFilter('brand', val)} />
                                    ))}
                                    {activeConcept === 'tech' && filters.tech.map(val => (
                                        <TagChip key={val} category="Tech" label={getLabel('tech', val)} onRemove={() => removeFilter('tech', val)} />
                                    ))}
                                </div>
                            </div>

                            {/* BUSINESS FILTERS */}
                            {activeConcept === 'business' && (
                                <div className="animate-in fade-in slide-in-from-left-4 duration-300">
                                    <AccordionItem
                                        title="Electrodomésticos"
                                        isOpen={openSection === 'appliance'}
                                        onToggle={() => toggleSection('appliance')}
                                        helpText="Filtra por tipo de aparato."
                                    >
                                        <SearchableSelect
                                            items={metadata.types} placeholder="Buscar tipo..."
                                            onSelect={(val) => addFilter('type', val)}
                                            labelKey="name" idKey="name"
                                        />
                                    </AccordionItem>
                                    <AccordionItem
                                        title="Marcas"
                                        isOpen={openSection === 'brand'}
                                        onToggle={() => toggleSection('brand')}
                                        helpText="Filtra por marca."
                                    >
                                        <SearchableSelect
                                            items={metadata.brands} placeholder="Buscar marca..."
                                            onSelect={(val) => addFilter('brand', val)}
                                            labelKey="name" idKey="id"
                                        />
                                    </AccordionItem>
                                </div>
                            )}

                            {/* TECH FILTERS */}
                            {activeConcept === 'tech' && (
                                <div className="animate-in fade-in slide-in-from-left-4 duration-300">
                                    <AccordionItem
                                        title="Selección de Técnicos"
                                        isOpen={openSection === 'tech'}
                                        onToggle={() => toggleSection('tech')}
                                        helpText="Comparar técnicos específicos."
                                    >
                                        <SearchableSelect
                                            items={metadata.techs} placeholder="Añadir técnico..."
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
                            )}
                        </div>
                    )}
                </div>
                {/* Logged User or Extra Info could go here if needed, Footer removed */}
            </div>
        </>
    );
};

// --- VISUALIZATION CANVAS (Unchanged mostly, just cleaner) ---
// ... (Keeping logic for Chart selection)

// --- MAP COMPONENT (Heatmap Style) ---
const GeoMap = ({ data, metric }) => {
    // Fixed Center for Malaga
    const CENTER = [36.7213, -4.4214];
    const ZOOM = 10;

    const getColor = (val) => {
        if (val >= 15) return '#ef4444'; // Red (Hot)
        if (val >= 5) return '#eab308';  // Yellow (Medium)
        return '#22c55e';                // Green (Low)
    };

    const getRadius = (val) => {
        // Logarithmic scale for radius density feel
        return Math.min(20, 10 + Math.log(val || 1) * 3);
    };

    return (
        <div className="h-full w-full rounded-xl overflow-hidden relative border border-slate-200 group">
            <MapContainer center={CENTER} zoom={ZOOM} style={{ height: '100%', width: '100%' }}>
                <TileLayer
                    url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                />
                {data.map((zone, idx) => {
                    // Mock coordinates based on CP hash
                    const pseudoRandom = (str) => {
                        let hash = 0;
                        for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
                        return hash;
                    };
                    const offsetLat = (pseudoRandom(zone.postal_code || '0') % 100) / 400;
                    const offsetLng = (pseudoRandom((zone.postal_code || '0') + 'X') % 100) / 400;

                    const lat = CENTER[0] + offsetLat;
                    const lng = CENTER[1] + offsetLng;

                    const val = metric === 'revenue' ? zone.revenue / 100 : zone.value;
                    const rawVal = metric === 'revenue' ? zone.revenue : zone.value;
                    const displayVal = metric === 'revenue' ? `${zone.revenue}€` : `${zone.value} Jobs`;

                    return (
                        <CircleMarker
                            key={idx}
                            center={[lat, lng]}
                            radius={getRadius(metric === 'revenue' ? zone.value : zone.value)}
                            pathOptions={{
                                fillColor: getColor(metric === 'revenue' ? (zone.value * 5) : zone.value),
                                color: getColor(metric === 'revenue' ? (zone.value * 5) : zone.value),
                                weight: 0,
                                fillOpacity: 0.6
                            }}
                        >
                            <MapTooltip direction="top" offset={[0, -10]} opacity={1}>
                                <div className="text-xs font-bold bg-white text-slate-800 p-1 rounded shadow-sm">
                                    CP: {zone.postal_code} <br /> <span className="text-blue-600">{displayVal}</span>
                                </div>
                            </MapTooltip>
                        </CircleMarker>
                    );
                })}
            </MapContainer>

            {/* HEATMAP LEGEND */}
            <div className="absolute bottom-4 right-4 bg-white/90 backdrop-blur-sm p-3 rounded-lg border border-slate-200 shadow-lg text-[10px] space-y-2 z-[1000]">
                <h4 className="font-bold text-slate-700 uppercase mb-1">Densidad de Actividad</h4>
                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-red-500 shadow-sm shadow-red-200"></div>
                    <span className="text-slate-600 font-medium">Zona Caliente (+15)</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-yellow-500 shadow-sm shadow-yellow-200"></div>
                    <span className="text-slate-600 font-medium">Media (5-15)</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-green-500 shadow-sm shadow-green-200"></div>
                    <span className="text-slate-600 font-medium">Baja (1-5)</span>
                </div>
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

const VisualizationCanvas = ({ data, loading, dateRange, setDateRange, viewMode, setViewMode, activeConcept, rpcError, mapMetric, onToggleMapMetric, filters, onToggleMenu }) => {

    // ... (keep helper functions same)
    const applyPreset = (months) => {
        const end = new Date();
        const start = months === 'YTD' ? startOfYear(new Date()) : subMonths(new Date(), months);
        if (months === 'ALL') { start.setFullYear(2020); }
        setDateRange({ start: start.toISOString(), end: end.toISOString() });
    };

    let mainChartData = [];
    let mainChartTitle = '';

    if (activeConcept === 'business') {
        const hasType = filters?.type?.length > 0;
        const hasBrand = filters?.brand?.length > 0;

        if (hasType && hasBrand && data.cross_reference?.length > 0) {
            mainChartData = data.cross_reference;
            mainChartTitle = `Comparativa Cruzada (${filters.brand.length}x${filters.type.length})`;
        } else if (hasType) {
            mainChartData = data.market_share;
            mainChartTitle = `Cuota Mercado (Filtrada)`;
        } else if (hasBrand) {
            mainChartData = data.type_share;
            mainChartTitle = `Distribución Tipos (Filtrada)`;
        } else {
            mainChartData = data.market_share;
            mainChartTitle = 'Cuota de Mercado Global';
        }
    } else if (activeConcept === 'tech') {
        mainChartData = data.tech_performance?.map(t => ({ ...t, value: t.jobs })) || [];
        mainChartTitle = 'Rendimiento Técnico';
    }

    const effectiveViewMode = (
        (activeConcept === 'business' && filters?.type?.length > 0 && filters?.brand?.length > 0) ||
        (activeConcept === 'tech')
    ) ? 'bar' : viewMode;

    const getDashboardTitle = () => {
        switch (activeConcept) {
            case 'adoption': return 'Adopción App';
            case 'tech': return 'Equipo Técnico';
            case 'business': return 'Negocio';
            default: return 'Analítica';
        }
    };

    const showMapToggle = activeConcept !== 'adoption';
    const [showMap, setShowMap] = useState(false);

    return (
        <div className="flex flex-col h-full bg-slate-50 overflow-hidden">
            {/* HEADER */}
            <div className="bg-white border-b border-slate-200 px-4 py-3 flex justify-between items-center shrink-0 gap-2">
                <div className="flex items-center gap-3">
                    <button onClick={onToggleMenu} className="md:hidden text-slate-500 hover:text-slate-800">
                        <Menu size={20} />
                    </button>
                    <h1 className="text-sm font-black text-slate-800 uppercase tracking-tight truncate max-w-[120px] md:max-w-none">{getDashboardTitle()}</h1>
                    <div className="hidden md:block h-4 w-px bg-slate-200" />
                    <div className="hidden md:flex gap-1">
                        {[{ l: '6M', v: 6 }, { l: 'YTD', v: 'YTD' }, { l: 'ALL', v: 'ALL' }].map(p => (
                            <button key={p.l} onClick={() => applyPreset(p.v)} className="text-[10px] font-bold text-slate-500 hover:text-blue-600 px-2 py-1 bg-slate-50 hover:bg-blue-50 rounded border border-slate-100 transition-colors">
                                {p.l}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <div className="flex items-center bg-slate-100 rounded-lg p-1">
                        <input
                            type="date" value={dateRange.start.split('T')[0]}
                            onChange={e => setDateRange({ ...dateRange, start: new Date(e.target.value).toISOString() })}
                            className="bg-transparent text-[10px] w-20 md:w-auto text-slate-600 font-medium outline-none"
                        />
                        <span className="text-slate-300 mx-1">-</span>
                        <input
                            type="date" value={dateRange.end.split('T')[0]}
                            onChange={e => setDateRange({ ...dateRange, end: new Date(e.target.value).toISOString() })}
                            className="bg-transparent text-[10px] w-20 md:w-auto text-slate-600 font-medium outline-none"
                        />
                    </div>
                    <button
                        onClick={() => generateExecutiveReport(data, { startDate: dateRange.start, endDate: dateRange.end })}
                        className="hidden md:flex ml-2 bg-slate-900 text-white px-3 py-1.5 rounded text-[10px] font-bold items-center gap-1 hover:bg-slate-800"
                    >
                        <Download size={12} /> PDF
                    </button>
                </div>
            </div>

            {/* CONTENT */}
            <div className="flex-1 overflow-y-auto p-4 md:p-6 text-slate-800">
                {activeConcept === 'adoption' ? (
                    <div className="space-y-6">
                        <div className="flex items-center justify-between">
                            <h2 className="text-lg md:text-xl font-bold text-slate-800">Métricas de Clientes</h2>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 md:gap-6">
                            <KPICard label="Usuarios Totales" value={data.client_adoption?.total_users} sub="Registros Históricos" />
                            <KPICard label="Usuarios Activos" value={data.client_adoption?.active_30d} sub="Login últimos 30 días" highlight />
                            <KPICard label="Tasa Conversión" value={`${data.client_adoption?.conversion_rate}%`} sub="Registros CON Ticket" />
                        </div>
                        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm h-64 md:h-80">
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
                        <div className="col-span-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                            <KPICard label="Volumen" value={data.kpis?.total_volume} sub="Tickets (Filtrado)" />
                            <KPICard label="Facturación" value={`${data.kpis?.total_revenue}€`} sub="Total (Filtrado)" />
                            <KPICard label="Ticket Medio" value={`${data.kpis?.avg_ticket}€`} sub="Media" highlight />
                            <KPICard label="Tasa Cierre" value={`${data.kpis?.completion_rate}%`} sub="Finalizados" />
                        </div>

                        <div className="col-span-12 lg:col-span-8 bg-white rounded-xl border border-slate-200 p-4 shadow-sm h-[350px] lg:h-[450px] flex flex-col">
                            <div className="flex justify-between items-center mb-4">
                                <div className="flex items-center gap-2 md:gap-4">
                                    <h3 className="text-xs font-bold text-slate-700 uppercase truncate max-w-[150px] md:max-w-none">{showMap ? 'Mapa' : mainChartTitle}</h3>
                                    {showMapToggle && (
                                        <button
                                            onClick={() => setShowMap(!showMap)}
                                            className={`flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold border transition-colors ${showMap ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'}`}
                                        >
                                            <Map size={12} /> {showMap ? 'Graf' : 'Mapa'}
                                        </button>
                                    )}
                                </div>
                                <div className="flex gap-2">
                                    {showMap ? (
                                        <button onClick={onToggleMapMetric} className="bg-slate-100 text-slate-600 px-2 py-1 rounded text-[10px] font-bold border border-slate-200 hover:bg-slate-200">
                                            {mapMetric === 'revenue' ? 'Vol' : '€'}
                                        </button>
                                    ) : (
                                        <div className="hidden md:flex bg-slate-100 rounded p-0.5">
                                            <ChartToggle icon={PieChart} active={effectiveViewMode === 'donut'} onClick={() => setViewMode('donut')} />
                                            <ChartToggle icon={BarChart} active={effectiveViewMode === 'bar'} onClick={() => setViewMode('bar')} />
                                            <ChartToggle icon={Activity} active={effectiveViewMode === 'line'} onClick={() => setViewMode('line')} />
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div className="flex-1 w-full min-h-0">
                                {showMap
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
    const [isMobileOpen, setIsMobileOpen] = useState(false); // Mobile Menu State
    const [activeConcept, setActiveConcept] = useState('business');
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
                isMobileOpen={isMobileOpen} setIsMobileOpen={setIsMobileOpen}
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
                    onToggleMenu={() => setIsMobileOpen(true)}
                />
            </div>
        </div>
    );
};

export default AnalyticsContainer;
