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
const PIXELS_PER_HOUR = 90; // Compact for weekly view
const GRID_HEIGHT = HOURS_COUNT * PIXELS_PER_HOUR;

const APPLIANCE_COLORS = {
    wash: 'bg-cyan-300 border-l-4 border-cyan-600 text-slate-900', // Lavado (Fresh)
    cold: 'bg-violet-300 border-l-4 border-violet-600 text-slate-900', // Frío (Premium)
    climate: 'bg-lime-300 border-l-4 border-lime-600 text-slate-900', // Clima (Acid)
    heat: 'bg-rose-300 border-l-4 border-rose-600 text-slate-900', // Cocción (Alert)
    default: 'bg-yellow-300 border-l-4 border-yellow-600 text-slate-900' // Otros (Banana)
};

const getApplianceCategory = (type) => {
    if (!type) return 'default';
    const t = type.toLowerCase();
    if (t.includes('lavadora') || t.includes('secadora') || t.includes('lavavajillas')) return 'wash';
    if (t.includes('frigor') || t.includes('congelador') || t.includes('never') || t.includes('vino')) return 'cold';
    if (t.includes('aire') || t.includes('caldera') || t.includes('termo')) return 'climate';
    if (t.includes('horno') || t.includes('vitro') || t.includes('micro') || t.includes('fuego')) return 'heat';
    return 'default';
};

const getStartOfWeek = (d) => {
    const date = new Date(d);
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
    return new Date(date.setDate(diff));
};

const GlobalAgenda = () => {
    // const navigate = useNavigate(); // Not needed for detail modal
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [techs, setTechs] = useState([]);
    const [selectedTechs, setSelectedTechs] = useState([]);
    const [appointments, setAppointments] = useState([]);
    const [businessConfig, setBusinessConfig] = useState(null);
    const [loading, setLoading] = useState(true);

    // --- DYNAMIC TIME CONFIGURATION ---
    // Reads from Business Settings (e.g. 09:00 - 19:00) and adds padding (-1 / +1)
    const openH = businessConfig?.opening_time ? parseInt(businessConfig.opening_time.split(':')[0]) : 8;
    // FORCE BRUTE MODE: Always show full day until 23:00 to remove "The Wall" (User Request)
    const startHour = Math.max(0, (isNaN(openH) ? 8 : openH) - 1);
    const endHour = 23;

    const hoursCount = Math.max(1, endHour - startHour + 1);
    const gridHeight = hoursCount * PIXELS_PER_HOUR;

    // UI States
    const [showMapModal, setShowMapModal] = useState(false);
    const [showRoutePanel, setShowRoutePanel] = useState(false);
    const [selectedAppt, setSelectedAppt] = useState(null); // For Popover
    const [detailTicket, setDetailTicket] = useState(null); // For Full Modal

    // Week Calculation
    const startOfWeek = useMemo(() => getStartOfWeek(selectedDate), [selectedDate]);
    const weekDays = useMemo(() => {
        return Array.from({ length: 7 }, (_, i) => {
            const d = new Date(startOfWeek);
            d.setDate(d.getDate() + i);
            return d;
        });
    }, [startOfWeek]);

    // Data Fetching
    useEffect(() => {
        fetchAgendaData();
        fetchBusinessConfig();
    }, [startOfWeek]); // Refetch when week changes

    const fetchBusinessConfig = async () => {
        const { data } = await supabase.from('business_config').select('*').single();
        if (data) setBusinessConfig(data);
    };

    const fetchAgendaData = async () => {
        setLoading(true);
        try {
            // Fetch range: Start of Week to End of Week
            const startStr = startOfWeek.toISOString().split('T')[0];
            const endOfWeek = new Date(startOfWeek);
            endOfWeek.setDate(endOfWeek.getDate() + 7);
            const endStr = endOfWeek.toISOString().split('T')[0];

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

            // 1.5 Fetch Brands
            const { data: brandsData } = await supabase.from('brands').select('name, logo_url');

            // 2. Fetch Appointments (SAFE MODE - "TRINITY" LOGIC)
            // Reverting query to avoid ambiguous relationship errors, but relying on 'appliance_info' JSON for rich data
            const { data: apptData, error } = await supabase
                .from('tickets')
                .select(`
                    *, 
                    client:profiles!client_id(*),
                    client_appliances(*)
                `)
                .gte('scheduled_at', `${startStr}T00:00:00`)
                .lt('scheduled_at', `${endStr}T23:59:59`)
                .order('scheduled_at', { ascending: true });

            if (error) {
                console.error("Error fetching tickets:", error);
            }

            const processed = (apptData || [])
                .filter(a => {
                    const s = a.status?.toLowerCase() || '';
                    return !['cancelado', 'rechazado', 'anulado', 'finalizado'].includes(s) && a.technician_id;
                })
                .map(a => {
                    // RESOLVE "THE TRINITY": JSON vs DB
                    // ServiceMonitor uses 'appliance_info' JSON column. We prioritize it.
                    let dbAppliance = a.client_appliances;
                    if (Array.isArray(dbAppliance)) dbAppliance = dbAppliance[0];
                    const jsonAppliance = a.appliance_info;

                    // Priority: JSON (Service Snapshot) > DB Relation (Live Data) > Empty
                    const bestAppliance = (jsonAppliance?.type || jsonAppliance?.brand) ? jsonAppliance : (dbAppliance || {});

                    // Brand & Logo
                    const brandName = bestAppliance?.brand || 'Generico';
                    const brandInfo = brandsData?.find(b => b.name?.toLowerCase() === brandName?.toLowerCase());

                    // Debug
                    console.log('Processed Agenda Item:', { id: a.id, appliance: bestAppliance, title: a.title });

                    return {
                        ...a,
                        start: new Date(a.scheduled_at),
                        duration: a.estimated_duration || 60,
                        profiles: a.client || {},
                        appliance_info: bestAppliance, // The Truth
                        brand_logo: brandInfo?.logo_url || null
                    };
                });

            if (processed.length > 0) console.log('Agenda Data Loaded:', processed.length, 'items.');

            setAppointments(processed || []);
        } catch (error) {
            console.error("Fatal Error in fetchAgendaData:", error);
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

        // 1. Snapshot for Rollback
        const previousAppointments = [...appointments];
        const iso = newDate.toISOString();

        // 2. Optimistic Update (Immediate Feedback)
        setAppointments(prev => prev.map(a =>
            a.id === apptId ? { ...a, technician_id: newTechId, scheduled_at: iso, start: newDate } : a
        ));

        try {
            const { error } = await supabase
                .from('tickets')
                .update({
                    scheduled_at: iso,
                    technician_id: newTechId
                })
                .eq('id', apptId);

            if (error) throw error;
            // Success: Silent

        } catch (error) {
            console.error("Error moving appointment:", error);
            // 3. Rollback on Critical Fail
            setAppointments(previousAppointments);
            alert("⚠️ No se pudo mover la cita. Se ha revertido el cambio.");
        }
    };

    const toggleTech = (id) => {
        if (selectedTechs.includes(id)) setSelectedTechs(selectedTechs.filter(t => t !== id));
        else setSelectedTechs([...selectedTechs, id]);
    };

    const toggleAllTechs = () => {
        if (selectedTechs.length === techs.length) setSelectedTechs([]);
        else setSelectedTechs(techs.map(t => t.id));
    };

    // --- GRID LAYOUT LOGIC (BY DAY) ---
    const getPositionedEvents = (dayDate) => {
        // Filter: Must be on 'dayDate' AND assigned to 'selectedTechs'
        const dayStartStr = dayDate.toISOString().split('T')[0];

        const events = appointments
            .filter(a => {
                const aDate = a.start.toISOString().split('T')[0];
                return aDate === dayStartStr && selectedTechs.includes(a.technician_id);
            })
            .map(a => {
                const startH = a.start.getHours();
                const startM = a.start.getMinutes();
                const startMs = startH * 60 + startM;
                const duration = a.duration;
                return { ...a, startMs, endMs: startMs + duration };
            });

        // Grouping/Column logic within the day...
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
        // Calculate offset relative to the CARD, not the column
        const rect = e.currentTarget.getBoundingClientRect();
        const offset = e.clientY - rect.top;

        setDragState({ id: appt.id, offset, duration: appt.duration });
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", appt.id);

        // Transparent Ghost
        const emptyImg = new Image();
        emptyImg.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
        e.dataTransfer.setDragImage(emptyImg, 0, 0);
    };

    // --- AUTO SCROLL REF ---
    const scrollContainerRef = useRef(null);

    const handleDragOver = (e, targetDate) => {
        e.preventDefault();
        e.stopPropagation(); // Prevent bubbling to parent columns
        if (isDayClosed) return;

        // Auto Scroll (Enhanced Sensitivity)
        const container = scrollContainerRef.current;
        if (container) {
            const { top, bottom } = container.getBoundingClientRect();
            const threshold = 150; // Increased trigger area
            const scrollSpeed = 25;  // Faster scroll

            if (e.clientY > bottom - threshold) {
                container.scrollTop += scrollSpeed;
            } else if (e.clientY < top + threshold) {
                container.scrollTop -= scrollSpeed;
            }
        }

        // Use currentTarget to ensure we measure the DROP ZONE (Grid), not the internal elements
        const rect = e.currentTarget.getBoundingClientRect();
        const y = e.clientY - rect.top;

        // "Buttery Smooth" Physics: Use precise rounding for 15 min snaps
        const snapMinutes = 15;
        const snapPixels = PIXELS_PER_HOUR * (snapMinutes / 60);

        // Correct Y using the offset captured at DragStart
        const rawTop = y - dragState.offset;
        const snappedTop = Math.round(rawTop / snapPixels) * snapPixels;

        const hoursToAdd = snappedTop / PIXELS_PER_HOUR;

        // Limits Check
        const totalMinutes = hoursToAdd * 60;
        const maxMinutes = (endHour - startHour) * 60 - dragState.duration; // Ensure failsafe within day

        // Visual Bounds (Optional, clamping)
        // if (totalMinutes < 0 || totalMinutes > maxMinutes) return; 

        // Calculate Ghost Time
        const ghostTime = new Date(targetDate);
        ghostTime.setHours(startHour + Math.floor(hoursToAdd), (hoursToAdd % 1) * 60);

        setGhostState({
            top: snappedTop,
            height: (dragState.duration / 60) * PIXELS_PER_HOUR,
            targetDate: targetDate.toISOString(),
            timeStr: ghostTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        });
    };

    const handleDrop = (e, targetDate) => {
        e.preventDefault();
        e.stopPropagation();
        setGhostState(null);
        if (isDayClosed) return;
        const apptId = e.dataTransfer.getData("text/plain");
        const appt = appointments.find(a => a.id === apptId);
        if (!appt) return;

        // Re-calculate one last time to ensure sync with visual ghost
        const rect = e.currentTarget.getBoundingClientRect();
        const y = e.clientY - rect.top;
        const snapMinutes = 15;
        const snapPixels = PIXELS_PER_HOUR * (snapMinutes / 60);
        const rawTop = y - dragState.offset;
        const snappedTop = Math.round(rawTop / snapPixels) * snapPixels;
        const hoursToAdd = snappedTop / PIXELS_PER_HOUR;

        const newDate = new Date(targetDate);
        newDate.setHours(startHour + Math.floor(hoursToAdd), (hoursToAdd % 1) * 60);

        handleUpdateAppointment(apptId, appt.technician_id, newDate);
    };

    // --- UTILS ---
    const visibleTechs = useMemo(() => techs.filter(t => selectedTechs.includes(t.id)), [techs, selectedTechs]);
    const hours = Array.from({ length: hoursCount }, (_, i) => i + startHour);

    // Optimized Suggestions
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
                    {/* Left: Title & Buttons */}
                    <div className="flex items-center gap-4 text-slate-800 w-1/3">
                        <div className="flex items-center gap-2">
                            <Calendar className="text-indigo-600" size={24} />
                            <div>
                                <h1 className="font-bold text-lg leading-tight">Agenda Semanal</h1>
                                <p className="text-[10px] text-slate-400 font-bold tracking-wider uppercase">Vista Global</p>
                            </div>
                        </div>
                        <button onClick={() => setSelectedDate(new Date())} className="text-xs font-bold px-2 py-1 bg-indigo-50 text-indigo-700 rounded hover:bg-indigo-100 transition">
                            Hoy
                        </button>
                    </div>

                    {/* CENTER: Date Navigation */}
                    <div className="flex items-center gap-2">
                        <button onClick={() => { const d = new Date(selectedDate); d.setDate(d.getDate() - 7); setSelectedDate(d); }} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 text-slate-600 transition">
                            <ChevronLeft size={20} />
                        </button>
                        <div className="text-center w-40">
                            <div className="text-sm font-bold text-slate-800 capitalize">
                                {startOfWeek.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })}
                            </div>
                            <div className="text-[10px] text-slate-400 font-mono tracking-wide">
                                Semana {Math.ceil((((new Date(selectedDate) - new Date(new Date(selectedDate).getFullYear(), 0, 1)) / 86400000) + 1) / 7)}
                            </div>
                        </div>
                        <button onClick={() => { const d = new Date(selectedDate); d.setDate(d.getDate() + 7); setSelectedDate(d); }} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 text-slate-600 transition">
                            <ChevronRight size={20} />
                        </button>
                    </div>

                    <div className="flex gap-2">
                        {/* Legend Bar (Candy Shop Style) */}
                        <div className="flex gap-2 mr-4 bg-white/50 backdrop-blur-sm px-3 py-1 rounded-full items-center shadow-sm border border-slate-100">
                            <div className="flex items-center gap-1"><div className="w-2.5 h-2.5 rounded-full bg-cyan-300 ring-2 ring-cyan-100"></div><span className="text-[10px] font-bold text-cyan-700">Lavado</span></div>
                            <div className="flex items-center gap-1"><div className="w-2.5 h-2.5 rounded-full bg-violet-300 ring-2 ring-violet-100"></div><span className="text-[10px] font-bold text-violet-700">Frío</span></div>
                            <div className="flex items-center gap-1"><div className="w-2.5 h-2.5 rounded-full bg-rose-300 ring-2 ring-rose-100"></div><span className="text-[10px] font-bold text-rose-700">Cocción</span></div>
                            <div className="flex items-center gap-1"><div className="w-2.5 h-2.5 rounded-full bg-lime-300 ring-2 ring-lime-100"></div><span className="text-[10px] font-bold text-lime-700 font-black">Clima</span></div>
                            <div className="flex items-center gap-1"><div className="w-2.5 h-2.5 rounded-full bg-yellow-300 ring-2 ring-yellow-100"></div><span className="text-[10px] font-bold text-yellow-700">Otros</span></div>
                        </div>
                    </div>
                </div>

                {/* Tech Filter */}
                <div className="flex flex-wrap gap-2 items-center">
                    <button onClick={toggleAllTechs} className={`text-[10px] font-bold px-2 py-1 rounded border flex items-center gap-1 transition-all ${selectedTechs.length === techs.length ? 'bg-indigo-600 text-white border-indigo-600 shadow-md' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'}`}>
                        {selectedTechs.length === techs.length ? <CheckSquare size={12} /> : <Square size={12} />} EQUIPO FILTRO
                    </button>
                    <div className="w-px h-4 bg-slate-200 mx-1"></div>
                    {techs.map(t => (
                        <button key={t.id} onClick={() => toggleTech(t.id)} className={`text-[10px] font-bold px-3 py-1 rounded-full border transition-all ${selectedTechs.includes(t.id) ? 'bg-indigo-50 text-indigo-700 border-indigo-200 shadow-sm scale-105' : 'bg-white text-slate-400 border-slate-100 grayscale opacity-70'}`}>
                            {t.full_name.split(' ')[0]}
                        </button>
                    ))}
                </div>
            </div>

            {/* --- BODY (WEEK GRID) --- */}
            <div ref={scrollContainerRef} className="flex-1 overflow-auto bg-slate-50 relative flex custom-scrollbar">
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

                {/* Time Axis */}
                <div className="w-12 shrink-0 bg-white border-r border-slate-200 sticky left-0 z-20 select-none shadow-[4px_0_10px_rgba(0,0,0,0.02)]">
                    <div className="h-8 border-b border-slate-200 bg-slate-50"></div>
                    {hours.map(h => (
                        <div key={h} className="text-right pr-2 text-[10px] text-slate-400 font-bold relative -top-2 font-mono" style={{ height: PIXELS_PER_HOUR }}>{h}:00</div>
                    ))}
                </div>

                {/* Day Columns */}
                <div className="flex-1 flex min-w-[800px] relative">
                    <div className="absolute inset-0 mt-8 pointer-events-none z-0">
                        {hours.map(h => (<div key={h} className="border-b border-slate-200/50 w-full" style={{ height: PIXELS_PER_HOUR }}></div>))}
                    </div>

                    {weekDays.map(dayDate => {
                        const isToday = dayDate.toDateString() === new Date().toDateString();

                        return (
                            <div key={dayDate.toISOString()} className={`flex-1 border-r border-slate-100 relative transition-colors duration-300 flex flex-col ${isToday ? 'bg-white' : 'bg-slate-50/30'}`}>

                                {/* Header: Day Name (NO DRAG INTERACTION HERE) */}
                                <div className={`h-8 border-b border-slate-200 sticky top-0 z-20 flex items-center justify-center gap-1 shadow-sm shrink-0 ${isToday ? 'bg-indigo-50 text-indigo-700' : 'bg-white text-slate-600'}`}>
                                    <span className="font-bold text-xs uppercase">{dayDate.toLocaleDateString('es-ES', { weekday: 'short' })}</span>
                                    <span className={`font-black text-xs ${isToday ? 'bg-indigo-600 text-white px-1.5 py-0.5 rounded-full' : ''}`}>
                                        {dayDate.getDate()}
                                    </span>
                                </div>

                                {/* DROP ZONE CONTAINER (Calculations relative to THIS) */}
                                <div
                                    className="relative w-full z-10 flex-1"
                                    style={{ height: gridHeight }}
                                    onDragOver={(e) => handleDragOver(e, dayDate)}
                                    onDrop={(e) => handleDrop(e, dayDate)}
                                >
                                    {/* Ghost Event (Rendered relative to Drop Zone) */}
                                    {ghostState?.targetDate === dayDate.toISOString() && (
                                        <div className="absolute left-1 right-1 z-50 bg-indigo-600/10 border-2 border-dashed border-indigo-500 rounded-md pointer-events-none transition-all duration-75"
                                            style={{ top: `${ghostState.top}px`, height: `${ghostState.height}px` }}
                                        >
                                            <div className="bg-indigo-600 text-white text-[9px] font-bold px-2 py-0.5 rounded-br absolute top-0 left-0">
                                                {ghostState.timeStr}
                                            </div>
                                        </div>
                                    )}

                                    {/* Events */}
                                    {getPositionedEvents(dayDate).map(appt => {
                                        const startH = appt.start.getHours();
                                        const startM = appt.start.getMinutes();
                                        // Use dynamic startHour
                                        const top = ((startH - startHour) + startM / 60) * PIXELS_PER_HOUR;
                                        const height = (appt.duration / 60) * PIXELS_PER_HOUR;
                                        const width = 100 / appt.totalCols;
                                        const left = width * appt.col;

                                        // Robust Appliance Resolver
                                        const dbAppliance = Array.isArray(appt.client_appliances) ? appt.client_appliances[0] : appt.client_appliances;
                                        const jsonAppliance = appt.appliance_info; // This is what Service Monitor uses!
                                        const bestAppliance = jsonAppliance?.type ? jsonAppliance : (dbAppliance || {});

                                        // COLOR BY APPLIANCE TYPE
                                        // Use the Resolved Appliance Type for color, fallback to default
                                        const category = getApplianceCategory(bestAppliance.type || bestAppliance.name);
                                        const colorClass = APPLIANCE_COLORS[category] || APPLIANCE_COLORS.default;
                                        const techName = techs.find(t => t.id === appt.technician_id)?.full_name.split(' ')[0] || '???';

                                        // "The Trinity" Display Data
                                        const displayType = bestAppliance.type || bestAppliance.name || 'SIN EQUIPO ASIGNADO';
                                        const displayBrand = bestAppliance.brand;
                                        const displayConcept = appt.title || appt.description || 'Sin concepto';

                                        // Debug for User
                                        console.log('Agenda Item Full:', appt);

                                        return (
                                            <div
                                                key={appt.id}
                                                draggable
                                                onDragStart={(e) => handleDragStart(e, appt)}
                                                onClick={(e) => { e.stopPropagation(); setSelectedAppt(appt); }}
                                                className={`absolute rounded-lg cursor-grab active:cursor-grabbing hover:z-50 hover:scale-[1.05] hover:shadow-xl transition-all shadow-md overflow-hidden flex flex-col font-sans
                                                         ${colorClass} ${selectedAppt?.id === appt.id ? 'ring-2 ring-indigo-600 z-40' : 'z-10'}`}
                                                style={{ top: `${top}px`, height: `${height - 2}px`, left: `${left}%`, width: `${width}%` }}
                                            >
                                                {/* --- BODY: LOGO, TYPE, CONCEPT --- */}
                                                <div className="relative flex-1 flex flex-col items-center justify-center p-1 overflow-hidden text-center">

                                                    {/* A) Watermark Logo (Brand) */}
                                                    {appt.brand_logo && (
                                                        <img src={appt.brand_logo} className="absolute inset-0 w-full h-full object-contain opacity-15 p-2 pointer-events-none mix-blend-multiply" />
                                                    )}

                                                    <div className="relative z-10 w-full">
                                                        {/* B) APPLIANCE TYPE (Equipo) - Pop Text */}
                                                        <div className="font-black text-[11px] uppercase tracking-tight leading-none text-slate-900 drop-shadow-sm mb-0.5 truncate">
                                                            {displayType}
                                                        </div>

                                                        {/* C) CONCEPT (Avería) - Sticker Label */}
                                                        <div className="text-[9px] font-bold leading-tight text-slate-800/90 line-clamp-2 bg-white/30 rounded px-1.5 py-0.5 backdrop-blur-[2px] mt-0.5 inline-block">
                                                            {displayConcept}
                                                        </div>

                                                        {/* Brand Text if No Logo */}
                                                        {!appt.brand_logo && displayBrand && (
                                                            <div className="text-[8px] font-bold text-slate-600 uppercase mt-0.5 tracking-wider opacity-80">{displayBrand}</div>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* --- FOOTER: MATRÍCULA (Tech & CP) --- */}
                                                <div className="shrink-0 h-5 bg-black/10 flex items-center justify-between px-2 backdrop-blur-sm">
                                                    <div className="flex items-center gap-1 max-w-[60%]">
                                                        <span className="text-[9px] font-black text-slate-900 truncate">👤 {techName}</span>
                                                    </div>
                                                    <div className="flex items-center">
                                                        <span className="text-[9px] font-mono font-black text-slate-800 opacity-90 tracking-wide">
                                                            {appt.profiles?.postal_code || '---'}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}
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
