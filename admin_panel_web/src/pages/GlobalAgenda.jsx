import { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { Calendar, ChevronLeft, ChevronRight, User, Clock, MapPin, Maximize2, Minimize2, AlertTriangle, TrendingUp, MoreVertical, X, Phone, Navigation, Filter, CheckSquare, Square, Map as MapIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup, Polyline, Tooltip as MapTooltip, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

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
const END_HOUR = 20; // Changed to 20:00 as per request "business hours" (usually 20 or 21, user said 8-20 constraint example)
const HOURS_COUNT = END_HOUR - START_HOUR + 1; // Include end hour slot? Usually agenda ends at 20:00 means slost 19:00-20:00. Let's say last slot starts at 19:00.
// If End Hour is 20, that means 20:00 is the limit. So slots are 8,9...19.
// User said: "minTime: '08:00', maxTime: '20:00'"
const PIXELS_PER_HOUR = 120;
const HEADER_OFFSET = 40; // Spacing for top labels aligned

const GlobalAgenda = () => {
    const navigate = useNavigate();
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [techs, setTechs] = useState([]);
    const [selectedTechs, setSelectedTechs] = useState([]);
    const [appointments, setAppointments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedTechId, setSelectedTechId] = useState(null);
    const [showMapModal, setShowMapModal] = useState(false); // Map Overlay State

    // Drag & Drop State
    const [draggedAppt, setDraggedAppt] = useState(null);
    const [dragOverTech, setDragOverTech] = useState(null);
    const [dragTime, setDragTime] = useState(null);

    // Popover State
    const [selectedAppt, setSelectedAppt] = useState(null);

    useEffect(() => {
        fetchAgendaData();
    }, [selectedDate]);

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
                    client:profiles!client_id(full_name, address, phone, current_lat, current_lng),
                    appliance:client_appliances!appliance_id(brand, model, type)
                `)
                .gte('scheduled_at', `${dateStr}T00:00:00`)
                .lt('scheduled_at', `${dateStr}T23:59:59`) // Strict day filtering
                .not('technician_id', 'is', null)
                .neq('status', 'finalizado');

            if (error) {
                const { data: simpleData } = await supabase
                    .from('tickets')
                    .select(`*, client:profiles!client_id(full_name, address, phone)`)
                    .gte('scheduled_at', `${dateStr}T00:00:00`)
                    .not('technician_id', 'is', null)
                    .neq('status', 'finalizado');
                const processedSimple = (simpleData || []).map(a => ({ ...a, start: new Date(a.scheduled_at), duration: 60 }));
                setAppointments(processedSimple);
                return;
            }

            const processed = (apptData || []).map(a => ({
                ...a,
                start: new Date(a.scheduled_at),
                duration: 60
            }));

            setAppointments(processed || []);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const handleUpdateAppointment = async (apptId, newTechId, newDate) => {
        const iso = newDate.toISOString();

        setAppointments(prev => prev.map(a => a.id === apptId ? { ...a, technician_id: newTechId, scheduled_at: iso, start: newDate } : a));

        const { error } = await supabase
            .from('tickets')
            .update({ technician_id: newTechId, scheduled_at: iso })
            .eq('id', apptId);

        if (error) {
            alert("Error al mover cita: " + error.message);
            fetchAgendaData();
        }
    };

    const toggleTech = (id) => {
        if (selectedTechs.includes(id)) {
            setSelectedTechs(selectedTechs.filter(t => t !== id));
        } else {
            setSelectedTechs([...selectedTechs, id]);
        }
    };

    const toggleAllTechs = () => {
        if (selectedTechs.length === techs.length) setSelectedTechs([]);
        else setSelectedTechs(techs.map(t => t.id));
    };

    // --- DND LOGIC ---
    const handleDragStart = (e, appt) => {
        if (['cancelado', 'rechazado'].includes(appt.status)) {
            e.preventDefault();
            return;
        }
        setDraggedAppt(appt);
        e.dataTransfer.effectAllowed = "move";
    };

    const handleDragOver = (e, techId) => {
        e.preventDefault();
        const container = e.currentTarget.getBoundingClientRect();
        // Adjust for scroll? container is the col, so y is relative to col top.
        // Col top is sticky header bottom? No, col includes header but the drop zone is the body.
        // We need to be careful. The events are on the `div` which includes the header and body.
        // Let's refine: Use the 'Appointments Container' inside the col for drop handling to avoid header offset issues?
        // Or just substract header height.
        // Actually the current structure has `onDragOver` on the whole column `div` which includes the header.

        // Simpler: Calculate relative to the START of the timeline grid.
        // The event `e.clientY` is global.
        // We can use a ref for the grid container start?
        // Let's rely on `offsetY` but subtracting header height if it's included.
        // The column div has `relative`. The Header is inside it. 
        // Let's assume the user drags over the empty space below header.
        // Better: `e.currentTarget` is the column. `offsetY` is from top of column.

        // Correct approach: grid starts after some padding/margin? 
        // In current markup: `mt-2` relative h-full...
        // Let's check the markup. 
        // Logic: `offsetY` includes the sticky header height (~36px?).
        // We need to subtract that to get "time pixels".

        // Hack: The visual lineup relies on `top: ...`.
        // Let's assume simpler math: `e.clientY` relative to the `Grid` container top.
        // But `handleDragOver` is per column.

        // Refined Logic for Constraints:
        // 1. Calculate Time.
        // 2. Clamp Time.

        const rect = e.currentTarget.getBoundingClientRect();
        // Offset Y relative to the column top.
        const yInCol = e.clientY - rect.top;

        // Subtract Header Height and Top Margin if any.
        // Visually: Header is ~40px-50px.
        // Let's use `HEADER_OFFSET` (40px) as the start of 08:00?
        // In the render: `mt-10` is used for the grid lines. `mt-10` is 40px/2.5rem.
        // So 08:00 starts at 40px from top of container?
        // Yes, render uses `mt-10` (40px) for the background lines.
        // Appointment `top` is relative to that?
        // No, current render: `style={{ top: ${top}px }}` inside `mt-2 relative h-full`.
        // This is getting potentially misaligned.

        // Let's simplify and unify in this rewrite.
        // `GridContainer` -> Relative.
        // `Lines` -> Absolute, Top 0.
        // `Events` -> Absolute, Top calculated directly.

        // For drag:
        // We will assume the `y` is relative to the `EventsContainer` which starts at 8:00.
        // But since we catch event on `Col`, we subtract `HEADER_HEIGHT`.

        const effectiveY = yInCol - 50; // Approx header height + margin
        if (effectiveY < 0) return;

        const hoursFromStart = effectiveY / PIXELS_PER_HOUR;
        let totalMinutes = Math.floor(hoursFromStart * 60 / 15) * 15;

        // Constraints
        const maxMinutes = (END_HOUR - START_HOUR) * 60;
        if (totalMinutes < 0) totalMinutes = 0;
        if (totalMinutes > maxMinutes - 60) totalMinutes = maxMinutes - 60; // Don't allow start at very end

        const newDate = new Date(selectedDate);
        newDate.setHours(START_HOUR + Math.floor(totalMinutes / 60));
        newDate.setMinutes(totalMinutes % 60);

        if (dragOverTech !== techId || dragTime?.getTime() !== newDate.getTime()) {
            setDragOverTech(techId);
            setDragTime(newDate);
        }
    };

    const handleDrop = async (e, techId) => {
        e.preventDefault();
        if (draggedAppt && dragTime) {
            await handleUpdateAppointment(draggedAppt.id, techId, dragTime);
        }
        setDraggedAppt(null); // Reset
        setDragOverTech(null);
        setDragTime(null);
    };


    // --- VISUALS ---
    const hours = Array.from({ length: HOURS_COUNT }, (_, i) => i + START_HOUR); // 8, 9, ... 20

    const visibleTechs = useMemo(() => techs.filter(t => selectedTechs.includes(t.id)), [techs, selectedTechs]);

    // Map Route Logic for Overlay
    const activeRoute = useMemo(() => {
        // If specific tech selected via header (selectedTechId), filter only their route.
        // If not, maybe show all? Or none.
        // User asked for "Map of Routes". Usually all. 
        // But let's respect the "selectedTechId" purely for highlighting. 
        // If no tech selected, showing ALL might be chaotic but let's try showing all visible techs?
        // Let's stick to: Show ONE focused route if selected, or ALL points if not.

        const techsToShow = selectedTechId ? [selectedTechId] : visibleTechs.map(t => t.id);
        const relevantAppts = appointments.filter(a => techsToShow.includes(a.technician_id)).sort((a, b) => a.start - b.start);

        // Group by tech for lines
        const routes = {};
        relevantAppts.forEach(a => {
            if (!routes[a.technician_id]) routes[a.technician_id] = [];
            routes[a.technician_id].push({
                ...a,
                lat: a.client?.current_lat || 36.72 + (Math.random() * 0.05 - 0.025),
                lng: a.client?.current_lng || -4.42 + (Math.random() * 0.05 - 0.025)
            });
        });
        return routes;
    }, [selectedTechId, visibleTechs, appointments]);

    return (
        <div className="h-[calc(100vh-80px)] flex flex-col bg-slate-50 relative">
            {/* Header */}
            <div className="px-4 py-3 bg-white border-b border-slate-200 flex flex-col gap-3 shadow-sm z-30 shrink-0">
                <div className="flex flex-col md:flex-row justify-between items-center gap-3">
                    <div className="flex items-center gap-4 w-full md:w-auto justify-between md:justify-start">
                        <h1 className="text-lg md:text-xl font-bold text-slate-800 flex items-center gap-2">
                            <Calendar className="text-indigo-600" /> <span className="inline">Agenda</span>
                        </h1>
                        <div className="flex items-center bg-slate-100 p-1 rounded-lg shadow-inner">
                            <button onClick={() => { const d = new Date(selectedDate); d.setDate(d.getDate() - 1); setSelectedDate(d); }} className="p-1 hover:bg-white hover:shadow-sm rounded transition text-slate-600"><ChevronLeft size={16} /></button>
                            <span className="px-3 font-bold text-slate-700 min-w-[100px] text-center text-xs md:text-sm capitalize">
                                {selectedDate.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })}
                            </span>
                            <button onClick={() => { const d = new Date(selectedDate); d.setDate(d.getDate() + 1); setSelectedDate(d); }} className="p-1 hover:bg-white hover:shadow-sm rounded transition text-slate-600"><ChevronRight size={16} /></button>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 w-full md:w-auto justify-end">
                        <button
                            onClick={() => setShowMapModal(true)}
                            className="flex items-center gap-2 bg-emerald-100 text-emerald-700 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-emerald-200 transition border border-emerald-200 active:scale-95"
                        >
                            <MapIcon size={14} /> Mapa de Rutas
                        </button>
                    </div>
                </div>

                {/* Tech Filter Pills */}
                <div className="flex flex-wrap gap-2 items-center pb-1 overflow-x-auto no-scrollbar mask-linear-fade">
                    <button
                        onClick={toggleAllTechs}
                        className={`text-[10px] md:text-xs px-2 py-1 rounded-full border transition font-bold flex items-center gap-1 shrink-0
                             ${selectedTechs.length === techs.length ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'}`}
                    >
                        {selectedTechs.length === techs.length ? <CheckSquare size={12} /> : <Square size={12} />} Todos
                    </button>
                    <div className="h-4 w-px bg-slate-300 mx-1 shrink-0"></div>
                    {techs.map(tech => (
                        <button
                            key={tech.id}
                            onClick={() => toggleTech(tech.id)}
                            className={`text-[10px] md:text-xs px-2 py-1 rounded-full border transition font-medium shrink-0
                                ${selectedTechs.includes(tech.id) ? 'bg-indigo-100 text-indigo-700 border-indigo-200' : 'bg-white text-slate-500 border-slate-200 opacity-60 grayscale'}`}
                        >
                            {tech.full_name.split(' ')[0]}
                        </button>
                    ))}
                </div>
            </div>

            {/* Main Content: Agenda Grid */}
            <div className="flex-1 overflow-hidden flex relative bg-slate-50/50">
                {/* Time Axis (Sticky Left) */}
                <div className="w-10 md:w-14 bg-white border-r border-slate-200 shrink-0 flex flex-col select-none z-20 shadow-[2px_0_5px_rgba(0,0,0,0.02)]">
                    <div className="h-[40px] shrink-0 border-b border-white"></div> {/* Match Header Height inside Col */}
                    {hours.map(h => (
                        <div key={h} className="text-[10px] text-slate-400 font-bold text-center border-b border-transparent flex items-start justify-center pt-1" style={{ height: PIXELS_PER_HOUR }}>
                            <span className="-translate-y-1/2 bg-white px-1">{h}:00</span>
                        </div>
                    ))}
                </div>

                {/* Grid (Horizontal Scrollable) */}
                <div className="flex-1 overflow-auto relative custom-scrollbar overscroll-x-contain">
                    <div className="flex min-w-max" style={{ height: HOURS_COUNT * PIXELS_PER_HOUR + 50 }}>

                        {/* Global Horizontal Lines Layer */}
                        <div className="absolute left-0 right-0 top-[40px] z-0 pointer-events-none">
                            {hours.map(h => (
                                <div key={h} className="border-t border-slate-100 w-full" style={{ height: PIXELS_PER_HOUR }}></div>
                            ))}
                        </div>

                        {/* Tech Columns */}
                        {visibleTechs.map(tech => (
                            <div
                                key={tech.id}
                                className={`flex-1 min-w-[200px] md:min-w-[200px] border-r border-slate-200 relative transition-all duration-300 ${dragOverTech === tech.id ? 'bg-indigo-50/30' : ''}`}
                                onDragOver={(e) => handleDragOver(e, tech.id)}
                                onDrop={(e) => handleDrop(e, tech.id)}
                            >
                                {/* Tech Column Header */}
                                <div
                                    className={`sticky top-0 z-20 bg-white/95 backdrop-blur h-[40px] flex items-center justify-center border-b transition cursor-pointer px-2 shadow-sm
                                        ${selectedTechId === tech.id ? 'border-b-indigo-500 bg-indigo-50/20' : 'border-b-slate-200'}`}
                                    onClick={() => setSelectedTechId(selectedTechId === tech.id ? null : tech.id)}
                                >
                                    <div className="text-center w-full">
                                        <div className={`font-bold text-xs truncate ${selectedTechId === tech.id ? 'text-indigo-700' : 'text-slate-700'}`}>{tech.full_name}</div>
                                        {/* <div className="text-[9px] text-slate-400">{appointments.filter(a => a.technician_id === tech.id).length}</div> */}
                                    </div>
                                </div>

                                {/* Drag Preview Ghost */}
                                {dragOverTech === tech.id && dragTime && (
                                    <div
                                        className="absolute left-1 right-1 bg-indigo-200/40 border-2 border-dashed border-indigo-400 rounded-lg z-10 pointer-events-none flex items-center justify-center"
                                        style={{
                                            // Top is proportional to Time. 8:00 is at 0px inside the container below Header?
                                            // Since we rendered Header inside the column with h=[40px], the content starts at 40px?
                                            // Yes, 'mt-2' was used before. Now we should be precise.
                                            // Let's use absolute positioning relative to the Column (which includes header).
                                            // So 08:00 is at y=40.
                                            top: `${((dragTime.getHours() - START_HOUR) + dragTime.getMinutes() / 60) * PIXELS_PER_HOUR + 40}px`,
                                            height: `${1 * PIXELS_PER_HOUR}px`
                                        }}
                                    >
                                        <div className="bg-white/80 px-2 py-0.5 rounded text-[10px] font-bold text-indigo-700 shadow-sm">
                                            {dragTime.toLocaleTimeString().slice(0, 5)}
                                        </div>
                                    </div>
                                )}

                                {/* Appointments Container */}
                                <div className="relative w-full h-full">
                                    {appointments.filter(a => a.technician_id === tech.id).map(appt => {
                                        const startH = appt.start.getHours();
                                        const startM = appt.start.getMinutes();
                                        // 08:00 starts at y=40px (below header)
                                        const top = ((startH - START_HOUR) + startM / 60) * PIXELS_PER_HOUR + 40;
                                        const height = (appt.duration / 60) * PIXELS_PER_HOUR;
                                        const isSelected = selectedAppt?.id === appt.id;
                                        const isCancelled = ['cancelado', 'rechazado'].includes(appt.status);

                                        let colors = {
                                            'pending': 'bg-amber-100 border-l-4 border-amber-400 text-amber-900',
                                            'confirmed': 'bg-blue-100 border-l-4 border-blue-500 text-blue-900',
                                            'en_camino': 'bg-purple-100 border-l-4 border-purple-500 text-purple-900',
                                            'in_progress': 'bg-green-100 border-l-4 border-green-500 text-green-900',
                                            'paused': 'bg-red-50 border-l-4 border-red-500 text-red-900'
                                        }[appt.appointment_status] || 'bg-slate-100 border-l-4 border-slate-400 text-slate-700';

                                        if (isCancelled) {
                                            colors = 'bg-red-50 hover:bg-red-100 border-r-2 border-red-300 text-red-800 opacity-80';
                                        }

                                        // Cancelled: Narrow strip on Right
                                        const layoutClass = isCancelled
                                            ? 'right-1 w-6 hover:w-48 hover:z-[60] z-0 transition-all duration-200'
                                            : 'left-1 right-1 z-10';

                                        return (
                                            <div
                                                key={appt.id}
                                                draggable={!isCancelled}
                                                onDragStart={(e) => handleDragStart(e, appt)}
                                                onClick={(e) => { e.stopPropagation(); setSelectedAppt(appt); }}
                                                className={`absolute rounded md:rounded-lg p-1 md:p-2 text-[10px] md:text-xs shadow-sm cursor-pointer active:scale-95 group overflow-hidden 
                                                    ${layoutClass} ${colors} ${isSelected ? 'ring-2 ring-indigo-500 z-30' : 'hover:shadow-md hover:z-20'}`}
                                                style={{ top: `${top}px`, height: `${height - 2}px` }}
                                            >
                                                {isCancelled ? (
                                                    <div className="h-full flex flex-col items-center pt-2">
                                                        <span className="font-bold rotate-90 whitespace-nowrap uppercase tracking-widest text-[8px] md:text-[9px]">Cancel</span>

                                                        {/* Expanded View Content */}
                                                        <div className="hidden group-hover:flex flex-col absolute inset-0 bg-red-50 p-2 text-left">
                                                            <div className="font-bold text-red-700 text-xs mb-1">CANCELADO</div>
                                                            <div className="text-[10px] leading-tight text-red-600 line-clamp-3">{appt.cancellation_reason || 'Sin motivo'}</div>
                                                            <div className="mt-auto text-[9px] text-red-400 font-mono">{appt.client?.full_name}</div>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div className="h-full flex flex-col">
                                                        <div className="flex justify-between items-center font-bold leading-tight mb-0.5">
                                                            <span>{appt.start.toLocaleTimeString().slice(0, 5)}</span>
                                                            {appt.appliance && <span className="text-[8px] bg-white/40 px-1 rounded truncate max-w-[50px]">{appt.appliance.brand}</span>}
                                                        </div>
                                                        <div className="font-semibold truncate text-[10px] md:text-xs">{appt.client?.full_name || 'Sin Cliente'}</div>
                                                        <div className="truncate opacity-75 text-[9px] hidden md:block mt-auto">
                                                            {appt.appliance ? `${appt.appliance.type} ${appt.appliance.model}` : appt.client?.address}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Popover Details */}
                {selectedAppt && (
                    <>
                        <div className="fixed inset-0 bg-black/20 z-40" onClick={() => setSelectedAppt(null)}></div>
                        <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90%] md:w-96 bg-white rounded-xl shadow-2xl border border-slate-200 z-50 animate-in fade-in zoom-in-95 duration-200">
                            <div className={`p-4 border-b flex justify-between items-start ${['cancelado', 'rechazado'].includes(selectedAppt.status) ? 'bg-red-50 border-red-100' : 'border-slate-100'}`}>
                                <div>
                                    <h3 className="font-bold text-slate-800 text-lg">{selectedAppt.client?.full_name}</h3>
                                    <p className="text-xs text-slate-500 font-mono">{new Date(selectedAppt.scheduled_at).toLocaleString()}</p>
                                    {['cancelado', 'rechazado'].includes(selectedAppt.status) && (
                                        <div className="mt-1 px-2 py-0.5 bg-red-100 text-red-700 text-[10px] font-bold rounded uppercase inline-block">
                                            Cancelado
                                        </div>
                                    )}
                                </div>
                                <button onClick={() => setSelectedAppt(null)} className="text-slate-400 hover:text-slate-600 bg-slate-50 p-1 rounded-full"><X size={18} /></button>
                            </div>
                            <div className="p-4 space-y-4">
                                {selectedAppt.appliance && (
                                    <div className="flex items-start gap-3 text-sm text-slate-700 font-medium bg-indigo-50/50 p-2 rounded-lg">
                                        <div className="bg-indigo-100 p-1.5 rounded text-indigo-600 mt-0.5"><CheckSquare size={16} /></div>
                                        <div>
                                            <div className="uppercase text-[10px] text-indigo-400 font-bold mb-0.5">Equipo Afectado</div>
                                            <div className="font-bold">{selectedAppt.appliance.type} {selectedAppt.appliance.brand}</div>
                                            <div className="text-xs text-slate-500 font-mono">{selectedAppt.appliance.model}</div>
                                        </div>
                                    </div>
                                )}

                                <div className="bg-slate-50 p-3 rounded-lg text-xs border border-slate-100">
                                    <div className="uppercase text-[10px] text-slate-400 font-bold mb-1">Descripción / Avería</div>
                                    <div className="italic text-slate-700 text-sm leading-relaxed">{selectedAppt.problem_description || "Sin descripción proporcionada."}</div>

                                    {['cancelado', 'rechazado'].includes(selectedAppt.status) && selectedAppt.cancellation_reason && (
                                        <div className="mt-3 pt-2 border-t border-slate-200 text-red-600 font-medium bg-red-50 p-2 rounded">
                                            <span className="font-bold">Motivo:</span> {selectedAppt.cancellation_reason}
                                        </div>
                                    )}
                                </div>

                                <div className="flex items-center gap-2 text-sm text-slate-600 border-t border-slate-50 pt-3">
                                    <MapPin size={16} className="text-slate-400 shrink-0" />
                                    <span className="truncate">{selectedAppt.client?.address}</span>
                                </div>
                                <div className="flex items-center gap-2 text-sm text-slate-600">
                                    <Phone size={16} className="text-slate-400 shrink-0" />
                                    <a href={`tel:${selectedAppt.client?.phone}`} className="hover:text-blue-600 underline font-mono">{selectedAppt.client?.phone}</a>
                                </div>

                                <div className="pt-2 flex gap-2">
                                    <button
                                        onClick={() => navigate(`/services/${selectedAppt.id}`)}
                                        className="flex-1 bg-indigo-600 text-white py-2.5 rounded-lg text-sm font-bold hover:bg-indigo-700 shadow-lg shadow-indigo-200 active:scale-95 transition"
                                    >
                                        Ver Ficha Completa
                                    </button>
                                    <button onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(selectedAppt.client?.address + ', Malaga')}`, '_blank')} className="px-4 bg-emerald-100 text-emerald-700 border border-emerald-200 py-2 rounded-lg text-xs font-bold hover:bg-emerald-200 active:scale-95 transition">
                                        <Navigation size={18} />
                                    </button>
                                </div>
                            </div>
                        </div>
                    </>
                )}
            </div>

            {/* MAP FLOATING MODAL OVERLAY */}
            {showMapModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-10 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white w-full h-full md:max-w-6xl md:h-[80vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden relative border border-white/20">
                        {/* Header */}
                        <div className="px-4 py-3 border-b border-slate-100 flex justify-between items-center bg-white z-10">
                            <h2 className="font-bold text-lg flex items-center gap-2">
                                <MapIcon className="text-emerald-500" /> Mapa de Rutas del Día
                            </h2>
                            <button
                                onClick={() => setShowMapModal(false)}
                                className="bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 p-2 rounded-full transition"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* Map Content */}
                        <div className="flex-1 bg-slate-100 relative">
                            {/* Hint Overlay */}
                            {!selectedTechId && Object.keys(activeRoute).length === 0 && (
                                <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[500] bg-white/90 backdrop-blur px-4 py-2 rounded-full shadow-lg text-xs font-bold text-slate-500 pointer-events-none">
                                    Mostrando todos los técnicos. Filtra en la agenda para ver individualmente.
                                </div>
                            )}

                            <MapContainer
                                center={[36.7213, -4.4214]}
                                zoom={11}
                                style={{ height: '100%', width: '100%' }}
                                attributionControl={false}
                            >
                                <TileLayer url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png" />

                                {Object.entries(activeRoute).map(([techId, routePoints], idx) => {
                                    // Make color deterministic
                                    const color = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'][idx % 5];
                                    return (
                                        <div key={techId}>
                                            <Polyline
                                                positions={routePoints.map(a => [a.lat, a.lng])}
                                                pathOptions={{ color: color, weight: 4, opacity: 0.8 }}
                                            />
                                            {routePoints.map((stop, i) => (
                                                <Marker
                                                    key={stop.id}
                                                    position={[stop.lat, stop.lng]}
                                                    icon={createTechIcon(color)}
                                                >
                                                    <Popup>
                                                        <div className="text-xs font-bold">{stop.client?.full_name}</div>
                                                        <div className="text-[10px]">{new Date(stop.scheduled_at).toLocaleTimeString().slice(0, 5)}</div>
                                                    </Popup>
                                                    <MapTooltip direction="top" offset={[0, -10]} opacity={1} permanent>
                                                        <span className="font-bold text-xs bg-white px-1 rounded shadow" style={{ color }}>{i + 1}</span>
                                                    </MapTooltip>
                                                </Marker>
                                            ))}
                                        </div>
                                    )
                                })}
                            </MapContainer>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default GlobalAgenda;
