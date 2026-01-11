import { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { Calendar, ChevronLeft, ChevronRight, CheckSquare, Square, Map as MapIcon, X, MapPin, Phone, Navigation, Clock, AlertTriangle, Zap, ArrowRight, LayoutList } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup, Polyline, Tooltip as MapTooltip } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import ClockWidget from '../components/ClockWidget'; // Premium Clock
import ServiceDetailsModal from '../components/ServiceDetailsModal'; // Replica of ServiceTable logic

// Fix Leaflet Icon
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Custom Icons
const createTechIcon = (color) => new L.DivIcon({
    className: 'custom-div-icon',
    html: `<div style="background-color: ${color}; width: 14px; height: 14px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 4px rgba(0,0,0,0.5);"></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7]
});

// --- CONSTANTS ---
const START_HOUR = 8;
const END_HOUR = 20;
const HOURS_COUNT = END_HOUR - START_HOUR + 1;
const PIXELS_PER_HOUR = 160;
const GRID_HEIGHT = HOURS_COUNT * PIXELS_PER_HOUR;

const GlobalAgenda = () => {
    // const navigate = useNavigate(); // Not needed for detail modal
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [techs, setTechs] = useState([]);
    const [selectedTechs, setSelectedTechs] = useState([]);
    const [appointments, setAppointments] = useState([]);
    const [businessConfig, setBusinessConfig] = useState(null);
    const [loading, setLoading] = useState(true);

    // UI States
    const [showMapModal, setShowMapModal] = useState(false);
    const [showRoutePanel, setShowRoutePanel] = useState(false);
    const [selectedAppt, setSelectedAppt] = useState(null); // For Popover
    const [detailTicket, setDetailTicket] = useState(null); // For Full Modal

    // Data Fetching
    useEffect(() => {
        fetchAgendaData();
        fetchBusinessConfig();
    }, [selectedDate]);

    const fetchBusinessConfig = async () => {
        const { data } = await supabase.from('business_config').select('*').single();
        if (data) setBusinessConfig(data);
    };

    const fetchAgendaData = async () => {
        setLoading(true);
        try {
            const dateStr = selectedDate.toISOString().split('T')[0];

            // 1. Fetch Techs
            const { data: techData } = await supabase
                .from('profiles')
                .select('*')
                .eq('role', 'tech')
                .eq('is_active', true)
                .is('deleted_at', null)
                .order('full_name');
            setTechs(techData || []);
            if (techData && selectedTechs.length === 0) {
                setSelectedTechs(techData.map(t => t.id));
            }

            // 2. Fetch Appointments
            const { data: apptData, error } = await supabase
                .from('tickets')
                .select(`
                    *, 
                    client:profiles!client_id(full_name, address, phone, current_lat, current_lng, postal_code),
                    appliance:client_appliances!appliance_id(brand, model, type)
                `)
                .gte('scheduled_at', `${dateStr}T00:00:00`)
                .lt('scheduled_at', `${dateStr}T23:59:59`)
                .not('technician_id', 'is', null)
                .neq('status', 'finalizado');

            // Transform & Filter
            const processed = (apptData || [])
                .filter(a => !['cancelado', 'rechazado', 'anulado'].includes(a.status))
                .map(a => ({
                    ...a,
                    start: new Date(a.scheduled_at),
                    duration: a.estimated_duration || 60,
                    profiles: a.client, // REMAP FOR MODAL COMPATIBILITY
                    appliance_info: a.appliance // REMAP FOR MODAL COMPATIBILITY
                }));

            setAppointments(processed || []);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    // --- BUSINESS LOGIC ---
    const isDayClosed = useMemo(() => {
        if (!businessConfig?.working_hours) return false;
        const dayName = selectedDate.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
        const dayConfig = businessConfig.working_hours[dayName];
        return dayConfig ? !dayConfig.isOpen : false;
    }, [businessConfig, selectedDate]);

    const handleUpdateAppointment = async (apptId, newTechId, newDate) => {
        if (isDayClosed) {
            alert("⛔ El negocio está CERRADO este día. No se pueden agendar citas.");
            return;
        }
        const iso = newDate.toISOString();
        setAppointments(prev => prev.map(a => a.id === apptId ? { ...a, technician_id: newTechId, scheduled_at: iso, start: newDate } : a));

        const { error } = await supabase.from('tickets').update({ technician_id: newTechId, scheduled_at: iso }).eq('id', apptId);
        if (error) { alert("Error: " + error.message); fetchAgendaData(); }
    };

    const toggleTech = (id) => {
        if (selectedTechs.includes(id)) setSelectedTechs(selectedTechs.filter(t => t !== id));
        else setSelectedTechs([...selectedTechs, id]);
    };

    const toggleAllTechs = () => {
        if (selectedTechs.length === techs.length) setSelectedTechs([]);
        else setSelectedTechs(techs.map(t => t.id));
    };

    // --- POSITIONING ---
    const getPositionedEvents = (techId) => {
        let events = appointments.filter(a => a.technician_id === techId)
            .map(a => ({
                ...a,
                startMs: a.start.getTime(),
                endMs: a.start.getTime() + (a.duration * 60000)
            }))
            .sort((a, b) => a.startMs - b.startMs);

        if (events.length === 0) return [];
        const expandedEvents = events.map(e => ({ ...e, col: 0, totalCols: 1 }));

        for (let i = 0; i < expandedEvents.length; i++) {
            let current = expandedEvents[i];
            const overlapping = expandedEvents.filter((other, idx) =>
                idx !== i &&
                ((current.startMs >= other.startMs && current.startMs < other.endMs) ||
                    (current.endMs > other.startMs && current.endMs <= other.endMs) ||
                    (current.startMs <= other.startMs && current.endMs >= other.endMs))
            );

            if (overlapping.length > 0) {
                current.totalCols = overlapping.length + 1;
                const group = [current, ...overlapping].sort((a, b) => a.startMs - b.startMs || a.id.localeCompare(b.id));
                current.col = group.indexOf(current);
            }
        }
        return expandedEvents;
    };


    // --- DND HANDLERS ---
    const [dragState, setDragState] = useState({ id: null, offset: 0 });
    const [ghostState, setGhostState] = useState(null);

    const handleDragStart = (e, appt) => {
        if (isDayClosed) { e.preventDefault(); return; }
        const rect = e.currentTarget.getBoundingClientRect();
        const offset = e.clientY - rect.top;
        setDragState({ id: appt.id, offset, duration: appt.duration });
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", appt.id);
    };

    const handleDragOver = (e, techId) => {
        e.preventDefault();
        if (isDayClosed) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const y = e.clientY - rect.top;
        const cardTopRaw = y - dragState.offset;
        const snapPixels = PIXELS_PER_HOUR / 4;
        const snappedTop = Math.round(cardTopRaw / snapPixels) * snapPixels;
        const hoursToAdd = snappedTop / PIXELS_PER_HOUR;
        const totalMinutes = Math.floor(hoursToAdd * 60);

        if (totalMinutes < 0) return;
        const maxMinutes = (END_HOUR - START_HOUR) * 60;
        if (totalMinutes > maxMinutes) return;

        const ghostTime = new Date(selectedDate);
        ghostTime.setHours(START_HOUR + Math.floor(hoursToAdd), (hoursToAdd % 1) * 60);

        setGhostState({
            top: snappedTop,
            height: (dragState.duration / 60) * PIXELS_PER_HOUR,
            techId,
            timeStr: ghostTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        });
    };

    const handleDrop = (e, techId) => {
        e.preventDefault();
        setGhostState(null);
        if (isDayClosed) return;
        const apptId = e.dataTransfer.getData("text/plain");
        const appt = appointments.find(a => a.id === apptId);
        if (!appt) return;

        const rect = e.currentTarget.getBoundingClientRect();
        const y = e.clientY - rect.top;
        const cardTopRaw = y - dragState.offset;
        const snapPixels = PIXELS_PER_HOUR / 4;
        const snappedTop = Math.round(cardTopRaw / snapPixels) * snapPixels;
        const hoursToAdd = snappedTop / PIXELS_PER_HOUR;
        const newDate = new Date(selectedDate);
        newDate.setHours(START_HOUR + Math.floor(hoursToAdd), (hoursToAdd % 1) * 60);

        const maxMinutes = (END_HOUR - START_HOUR) * 60;
        const totalMinutes = hoursToAdd * 60;
        if (totalMinutes < 0 || totalMinutes > maxMinutes) return;

        handleUpdateAppointment(apptId, techId, newDate);
    };

    // --- UTILS ---
    const visibleTechs = useMemo(() => techs.filter(t => selectedTechs.includes(t.id)), [techs, selectedTechs]);
    const hours = Array.from({ length: HOURS_COUNT }, (_, i) => i + START_HOUR);
    const optimizedSuggestions = useMemo(() => {
        if (!showRoutePanel) return [];
        const all = [...appointments].filter(a => selectedTechs.includes(a.technician_id));
        return [...all].sort((a, b) => (a.client?.postal_code || '').localeCompare(b.client?.postal_code || ''));
    }, [showRoutePanel, appointments, selectedTechs]);


    return (
        <div className="h-[calc(100vh-80px)] flex flex-col bg-slate-50 relative overflow-hidden font-sans">
            {/* --- HEADER --- */}
            <div className="bg-white border-b border-slate-200 px-4 py-2 z-30 shadow-sm shrink-0 flex flex-col gap-2">
                <div className="flex flex-col md:flex-row justify-between items-center gap-2 relative">
                    {/* Left: Title */}
                    <div className="flex items-center gap-2 text-slate-800 w-1/3">
                        <Calendar className="text-indigo-600" size={24} />
                        <div>
                            <h1 className="font-bold text-lg leading-tight">Agenda Global</h1>
                            <p className="text-[10px] text-slate-400 font-bold tracking-wider uppercase">Panel de Control</p>
                        </div>
                    </div>

                    {/* CENTER: CLOCK WITH GOLD BORDER */}
                    {/* CENTER: CLOCK & DATE - GOLD CONTAINER */}
                    <div className="flex flex-col md:flex-row items-center justify-center gap-4 p-2 rounded-2xl border border-amber-300/50 bg-gradient-to-b from-amber-50/50 to-white shadow-sm relative group w-2/4 hover:shadow-md transition-all">
                        <div className="absolute -top-2.5 bg-white px-3 py-0.5 text-[8px] font-black tracking-[0.2em] text-amber-600 uppercase border border-amber-200 rounded-full flex items-center gap-1.5 z-20 shadow-sm">
                            <Clock size={8} className="text-amber-500" /> CONTROL DE TIEMPO
                        </div>

                        {/* Clock */}
                        <div className="shrink-0 relative z-10 scale-90">
                            <ClockWidget />
                        </div>

                        {/* Separator */}
                        <div className="hidden md:block w-px h-12 bg-amber-200/50"></div>

                        {/* Date Selector (Moved Here) */}
                        <div className="flex items-center gap-1">
                            <button onClick={() => { const d = new Date(selectedDate); d.setDate(d.getDate() - 1); setSelectedDate(d); }}
                                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-amber-100 text-slate-400 hover:text-amber-700 transition active:scale-95">
                                <ChevronLeft size={18} />
                            </button>
                            <div className="text-center w-32">
                                <div className="text-[10px] font-bold text-amber-600/70 uppercase tracking-wide leading-none mb-1">{selectedDate.toLocaleDateString('es-ES', { weekday: 'long' })}</div>
                                <div className="text-xl font-black text-slate-800 leading-none tracking-tight">{selectedDate.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}</div>
                            </div>
                            <button onClick={() => { const d = new Date(selectedDate); d.setDate(d.getDate() + 1); setSelectedDate(d); }}
                                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-amber-100 text-slate-400 hover:text-amber-700 transition active:scale-95">
                                <ChevronRight size={18} />
                            </button>
                        </div>
                    </div>

                    <div className="flex gap-2">
                        <button onClick={() => setShowRoutePanel(true)} className="flex items-center gap-2 bg-amber-100 text-amber-800 px-3 py-2 rounded-lg text-xs font-bold hover:bg-amber-200 border border-amber-200 shadow-sm transition active:scale-95">
                            <Zap size={16} className="fill-current" /> Ruta Mágica
                        </button>
                        <button onClick={() => setShowMapModal(true)} className="flex items-center gap-2 bg-slate-100 text-slate-700 px-3 py-2 rounded-lg text-xs font-bold hover:bg-slate-200 border border-slate-200 shadow-sm transition active:scale-95">
                            <MapIcon size={16} /> Mapa
                        </button>
                    </div>
                </div>

                <div className="flex flex-wrap gap-2 items-center">
                    <button onClick={toggleAllTechs} className={`text-[10px] font-bold px-2 py-1 rounded border flex items-center gap-1 transition-all ${selectedTechs.length === techs.length ? 'bg-indigo-600 text-white border-indigo-600 shadow-md' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'}`}>
                        {selectedTechs.length === techs.length ? <CheckSquare size={12} /> : <Square size={12} />} EQUIPO COMPLETO
                    </button>
                    <div className="w-px h-4 bg-slate-200 mx-1"></div>
                    {techs.map(t => (
                        <button key={t.id} onClick={() => toggleTech(t.id)} className={`text-[10px] font-bold px-3 py-1 rounded-full border transition-all ${selectedTechs.includes(t.id) ? 'bg-indigo-50 text-indigo-700 border-indigo-200 shadow-sm scale-105' : 'bg-white text-slate-400 border-slate-100 grayscale opacity-70'}`}>
                            {t.full_name.split(' ')[0]}
                        </button>
                    ))}
                </div>
            </div>

            {/* --- BODY --- */}
            <div className="flex-1 overflow-auto bg-slate-50 relative flex custom-scrollbar">
                {isDayClosed && (
                    <div className="absolute inset-0 z-50 bg-slate-100/80 backdrop-blur-sm flex items-center justify-center">
                        <div className="bg-white p-6 rounded-2xl shadow-2xl border border-red-100 text-center max-w-md transform rotate-2">
                            <div className="bg-red-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                                <Clock size={32} className="text-red-500" />
                            </div>
                            <h2 className="text-2xl font-black text-slate-800 mb-2">NEGOCIO CERRADO</h2>
                        </div>
                    </div>
                )}

                <div className="w-14 shrink-0 bg-white border-r border-slate-200 sticky left-0 z-20 select-none shadow-[4px_0_10px_rgba(0,0,0,0.02)]">
                    <div className="h-10 border-b border-slate-200 bg-slate-50"></div>
                    {hours.map(h => (
                        <div key={h} className="text-right pr-2 text-[10px] text-slate-400 font-bold relative -top-2 font-mono" style={{ height: PIXELS_PER_HOUR }}>{h}:00</div>
                    ))}
                </div>

                <div className="flex-1 flex min-w-[600px] relative">
                    <div className="absolute inset-0 mt-10 pointer-events-none z-0">
                        {hours.map(h => (<div key={h} className="border-b border-slate-200/50 w-full" style={{ height: PIXELS_PER_HOUR }}></div>))}
                    </div>

                    {visibleTechs.map(tech => (
                        <div key={tech.id} className="flex-1 border-r border-slate-100 min-w-[150px] relative transition-colors duration-300"
                            style={{ backgroundColor: ghostState?.techId === tech.id ? 'rgba(99, 102, 241, 0.05)' : 'transparent' }}
                            onDragOver={(e) => handleDragOver(e, tech.id)}
                            onDrop={(e) => handleDrop(e, tech.id)}
                        >
                            <div className="h-10 border-b border-slate-200 bg-white/95 backdrop-blur sticky top-0 z-20 flex items-center justify-center shadow-sm">
                                <div className="font-extrabold text-[10px] text-slate-700 uppercase tracking-widest">{tech.full_name}</div>
                            </div>

                            {ghostState?.techId === tech.id && (
                                <div className="absolute left-1 right-1 z-0 bg-indigo-50 border-2 border-dashed border-indigo-400 rounded transition-all duration-75 pointer-events-none flex items-center justify-center opacity-70"
                                    style={{ top: `${ghostState.top}px`, height: `${ghostState.height}px` }}
                                >
                                    <span className="text-xs font-bold text-indigo-600 bg-white/80 px-2 py-1 rounded shadow-sm">{ghostState.timeStr}</span>
                                </div>
                            )}

                            <div className="relative w-full z-10" style={{ height: GRID_HEIGHT }}>
                                {getPositionedEvents(tech.id).map(appt => {
                                    const startH = appt.start.getHours();
                                    const startM = appt.start.getMinutes();
                                    const top = ((startH - START_HOUR) + startM / 60) * PIXELS_PER_HOUR;
                                    const height = (appt.duration / 60) * PIXELS_PER_HOUR;
                                    const width = 100 / appt.totalCols;
                                    const left = width * appt.col;

                                    let colors = 'bg-white border-l-4 border-slate-300 text-slate-600 shadow-sm';
                                    if (appt.status === 'confirmed') colors = 'bg-sky-50 border-l-4 border-sky-400 text-sky-900';
                                    if (appt.status === 'pending') colors = 'bg-amber-50 border-l-4 border-amber-400 text-amber-900';
                                    if (appt.status === 'en_camino') colors = 'bg-purple-50 border-l-4 border-purple-400 text-purple-900';
                                    if (appt.status === 'in_progress') colors = 'bg-emerald-50 border-l-4 border-emerald-500 text-emerald-900';

                                    return (
                                        <div
                                            key={appt.id}
                                            draggable
                                            onDragStart={(e) => handleDragStart(e, appt)}
                                            onClick={(e) => { e.stopPropagation(); setSelectedAppt(appt); }}
                                            className={`absolute rounded p-2 text-xs cursor-pointer transition-all duration-200 group flex flex-col justify-between overflow-hidden hover:z-50 hover:shadow-lg
                                                     ${colors} ${selectedAppt?.id === appt.id ? 'ring-2 ring-indigo-500 z-40 transform scale-[1.02]' : 'z-10'}`}
                                            style={{ top: `${top}px`, height: `${height - 3}px`, left: `${left}%`, width: `${width}%` }}
                                        >
                                            {/* REAL DATA HIERARCHY */}
                                            <div className="flex flex-col gap-0.5">
                                                {/* 1. Brand/Appliance - ROBUST */}
                                                <div className="font-extrabold text-[10px] uppercase tracking-tight leading-none bg-white/60 backdrop-blur-sm self-start px-1 rounded mb-0.5 max-w-full truncate">
                                                    {(appt.appliance && (appt.appliance.brand || appt.appliance.type)) ? (
                                                        `${appt.appliance.type || ''} ${appt.appliance.brand || ''}`.trim()
                                                    ) : (
                                                        <span className="text-slate-400 opacity-80">DESCONOCIDO</span>
                                                    )}
                                                </div>
                                                {/* 2. Problem */}
                                                <div className="text-[9px] font-medium leading-tight line-clamp-2 text-slate-500 italic mb-1">
                                                    {appt.problem_description ? `"${appt.problem_description}"` : <span className="opacity-50">-</span>}
                                                </div>
                                                {/* 3. Client */}
                                                <div className="font-bold text-[10px] leading-tight truncate text-slate-800">{appt.client?.full_name || 'Sin Cliente'}</div>
                                                <div className="text-[9px] opacity-80 truncate leading-tight">{appt.client?.address}</div>
                                            </div>

                                            {/* Footer: CP */}
                                            <div className="mt-auto flex justify-between items-end border-t border-black/5 pt-1">
                                                <span className="font-mono text-[9px] opacity-70">
                                                    {appt.start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                                {appt.client?.postal_code && (
                                                    <span className="text-[8px] font-bold opacity-50 tracking-wider bg-black/5 px-1 rounded">CP {appt.client.postal_code}</span>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Magic Route Panel */}
            <div className={`fixed inset-y-0 right-0 w-80 bg-white shadow-2xl z-[60] transform transition-transform duration-300 flex flex-col border-l border-slate-200 ${showRoutePanel ? 'translate-x-0' : 'translate-x-full'}`}>
                <div className="p-4 bg-slate-900 text-white flex justify-between items-center shrink-0">
                    <div className="flex items-center gap-2 font-bold text-amber-400">
                        <Zap className="fill-current" size={18} /> <span>Optimizador</span>
                    </div>
                    <button onClick={() => setShowRoutePanel(false)} className="text-slate-400 hover:text-white"><X size={20} /></button>
                </div>
                <div className="flex-1 overflow-auto p-2">
                    {optimizedSuggestions.length === 0 ? (<div className="p-4 text-center text-slate-400 text-xs italic">Vacío</div>) : (
                        <div className="space-y-4">
                            {Object.entries(optimizedSuggestions.reduce((acc, curr) => {
                                const cp = curr.client?.postal_code || 'SIN CP';
                                if (!acc[cp]) acc[cp] = [];
                                acc[cp].push(curr);
                                return acc;
                            }, {})).map(([cp, list]) => (
                                <div key={cp} className="bg-slate-50 rounded border border-slate-100 overflow-hidden">
                                    <div className="bg-slate-200/50 px-3 py-1 text-xs font-bold text-slate-600 flex justify-between"><span>CP {cp}</span><span>{list.length}</span></div>
                                    <div className="divide-y divide-slate-100">
                                        {list.map(item => (
                                            <div key={item.id} className="p-2 flex justify-between items-center group cursor-grab" draggable onDragStart={(e) => handleDragStart(e, item)}>
                                                <div className="text-xs">{item.client?.full_name}</div>
                                                <ArrowRight size={14} className="text-slate-300" />
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* POPOVER Details */}
            {selectedAppt && (
                <div className="fixed inset-0 bg-black/40 z-[70] flex items-center justify-center p-4 backdrop-blur-[1px]" onClick={() => setSelectedAppt(null)}>
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200 border border-slate-200 ring-4 ring-black/5" onClick={e => e.stopPropagation()}>
                        <div className="p-4 border-b flex justify-between items-start bg-slate-50">
                            <div><div className="text-[10px] font-bold uppercase tracking-wider text-indigo-500 mb-1">Detalle</div><h3 className="font-bold text-slate-800 text-lg">{selectedAppt.client?.full_name}</h3></div>
                            <button onClick={() => setSelectedAppt(null)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
                        </div>
                        <div className="p-5 space-y-5">
                            {selectedAppt.appliance && (
                                <div className="flex gap-3 bg-indigo-50/50 p-3 rounded-lg border border-indigo-100/50 items-center">
                                    <div className="bg-white p-2 rounded shadow-sm text-indigo-600"><CheckSquare size={18} /></div>
                                    <div><div className="text-[10px] font-bold text-slate-500 uppercase">Equipo</div><div className="font-bold text-slate-800 text-sm">{selectedAppt.appliance.type} {selectedAppt.appliance.brand}</div></div>
                                </div>
                            )}
                            <div className="space-y-3">
                                <div className="flex items-start gap-3 text-sm text-slate-600"><MapPin size={18} className="text-red-400 mt-0.5" /> <div><div className="font-medium text-slate-700">{selectedAppt.client?.address}</div><div className="text-xs text-slate-400">CP {selectedAppt.client?.postal_code || 'N/A'}</div></div></div>
                                <div className="flex items-center gap-3 text-sm text-slate-600"><Phone size={18} className="text-emerald-400" /><a href={`tel:${selectedAppt.client?.phone}`} className="font-mono font-bold text-slate-700 underline decoration-slate-300">{selectedAppt.client?.phone}</a></div>
                            </div>
                            <div className="pt-2">
                                <button
                                    onClick={() => {
                                        setDetailTicket(selectedAppt);
                                        setSelectedAppt(null); // Close popover
                                    }}
                                    className="w-full bg-slate-900 text-white py-3 rounded-lg font-bold text-sm shadow hover:bg-black transition flex items-center justify-center gap-2"
                                >
                                    <LayoutList size={16} /> Ver Ficha Completa
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* FULL DETAIL MODAL (Replica of ServiceTable) */}
            {detailTicket && (
                <ServiceDetailsModal
                    ticket={detailTicket}
                    onClose={() => setDetailTicket(null)}
                />
            )}

            {/* Map Modal */}
            {showMapModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-10 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
                    <div className="bg-white w-full h-full md:max-w-6xl rounded-2xl shadow-2xl flex flex-col overflow-hidden relative">
                        <div className="px-5 py-4 border-b flex justify-between items-center bg-white z-10 shrink-0">
                            <h2 className="font-bold text-lg flex items-center gap-3"><MapIcon className="text-emerald-500" /> Rutas</h2>
                            <button onClick={() => setShowMapModal(false)} className="bg-slate-100 hover:bg-slate-200 p-2 rounded-full"><X size={20} /></button>
                        </div>
                        <div className="flex-1 bg-slate-100 relative">
                            <MapContainer center={[36.7213, -4.4214]} zoom={11} style={{ height: '100%', width: '100%' }} attributionControl={false}>
                                <TileLayer url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png" />
                                {/* Map items ... */}
                            </MapContainer>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default GlobalAgenda;
