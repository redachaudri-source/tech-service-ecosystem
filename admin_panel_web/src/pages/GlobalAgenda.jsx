import { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { Calendar, ChevronLeft, ChevronRight, User, Clock, MapPin, Maximize2, Minimize2, AlertTriangle, TrendingUp, MoreVertical, X, Phone, Navigation, Filter, CheckSquare, Square } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup, Polyline, Tooltip as MapTooltip } from 'react-leaflet';
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
const END_HOUR = 21;
const HOURS_COUNT = END_HOUR - START_HOUR;
const PIXELS_PER_HOUR = 120; // Taller for better visibility

const GlobalAgenda = () => {
    const navigate = useNavigate();
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [techs, setTechs] = useState([]);
    const [selectedTechs, setSelectedTechs] = useState([]); // Filter IDs
    const [appointments, setAppointments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedTechId, setSelectedTechId] = useState(null);

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
            // Default select all if empty or on init (could refine logic to persist selection)
            if (techData && selectedTechs.length === 0) {
                setSelectedTechs(techData.map(t => t.id));
            }

            // 2. Fetch Appointments
            // Try to join appliance (tickets.appliance_id -> client_appliances.id)
            // If this fails due to mismatched foreign key names, we'll revert.
            // Assuming tickets has 'appliance_id' FK to 'client_appliances'.
            const { data: apptData, error } = await supabase
                .from('tickets')
                .select(`
                    *, 
                    client:profiles!client_id(full_name, address, phone, current_lat, current_lng),
                    appliance:client_appliances!appliance_id(brand, model, type)
                `)
                .gte('scheduled_at', `${dateStr}T00:00:00`)
                //.lte('scheduled_at', `${dateStr}T23:59:59`)
                .not('technician_id', 'is', null)
                // Filter out finalizado? User said "when status CANCELADO/RECHAZADO cannot behave like normal". 
                // So we MUST fetch them. Previously we filtered 'finalizado', maybe keep that exclusion?
                // Let's exclude 'finalizado' but keep 'cancelado'/'rechazado'.
                .neq('status', 'finalizado');

            if (error) {
                console.warn("Error fetching deep data, retrying simple:", error);
                // Fallback query if alias/join fails
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

            // Transform dates
            const processed = (apptData || []).map(a => ({
                ...a,
                start: new Date(a.scheduled_at),
                duration: 60 // Default 1h
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

        // Optimistic
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
        const offsetY = e.clientY - container.top;
        const hoursFromStart = offsetY / PIXELS_PER_HOUR;
        const totalMinutes = Math.floor(hoursFromStart * 60 / 15) * 15;
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
        setDraggedAppt(null);
        setDragOverTech(null);
        setDragTime(null);
    };


    // --- VISUALS ---
    const hours = Array.from({ length: HOURS_COUNT + 1 }, (_, i) => i + START_HOUR);

    // Now Line
    const [nowPercent, setNowPercent] = useState(0);
    useEffect(() => {
        const calcNow = () => {
            const now = new Date();
            const startOfDay = new Date(selectedDate);
            startOfDay.setHours(START_HOUR, 0, 0, 0);
            const msPassed = now - startOfDay;
            const totalMs = (END_HOUR - START_HOUR) * 60 * 60 * 1000;
            const percent = (msPassed / totalMs) * 100;
            return Math.max(0, Math.min(100, percent));
        };
        const interval = setInterval(() => setNowPercent(calcNow()), 60000);
        setNowPercent(calcNow());
        return () => clearInterval(interval);
    }, [selectedDate]);

    // Filtered Techs
    const visibleTechs = useMemo(() => techs.filter(t => selectedTechs.includes(t.id)), [techs, selectedTechs]);

    return (
        <div className="h-[calc(100vh-80px)] flex flex-col bg-slate-50">
            {/* Header */}
            <div className="px-4 md:px-6 py-4 bg-white border-b border-slate-200 flex flex-col gap-4 shadow-sm z-20">
                <div className="flex flex-col md:flex-row justify-between items-center gap-3">
                    <div className="flex flex-col md:flex-row items-center gap-4 w-full md:w-auto">
                        <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                            <Calendar className="text-indigo-600" /> <span className="hidden md:inline">Tablero de Control</span>
                        </h1>
                        <div className="flex items-center bg-slate-100 p-1 rounded-lg w-full md:w-auto justify-between shadow-inner">
                            <button onClick={() => { const d = new Date(selectedDate); d.setDate(d.getDate() - 1); setSelectedDate(d); }} className="p-1 hover:bg-white hover:shadow-sm rounded transition text-slate-600"><ChevronLeft size={18} /></button>
                            <span className="px-4 font-bold text-slate-700 min-w-[140px] text-center text-sm">
                                {selectedDate.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'short' })}
                            </span>
                            <button onClick={() => { const d = new Date(selectedDate); d.setDate(d.getDate() + 1); setSelectedDate(d); }} className="p-1 hover:bg-white hover:shadow-sm rounded transition text-slate-600"><ChevronRight size={18} /></button>
                        </div>
                    </div>
                    <div className="flex items-center gap-3 w-full md:w-auto justify-end">
                        <button
                            onClick={() => window.open('/fleet', '_blank')}
                            className="flex items-center gap-2 bg-emerald-100 text-emerald-700 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-emerald-200 transition border border-emerald-200"
                        >
                            <MapPin size={14} /> <span className="hidden sm:inline">Ver Mapa Rutas</span>
                        </button>
                    </div>
                </div>

                {/* Tech Filter Pills */}
                <div className="flex flex-wrap gap-2 items-center pb-1">
                    <button
                        onClick={toggleAllTechs}
                        className={`text-xs px-2 py-1 rounded-full border transition font-bold flex items-center gap-1
                             ${selectedTechs.length === techs.length ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'}`}
                    >
                        {selectedTechs.length === techs.length ? <CheckSquare size={12} /> : <Square size={12} />} Todos
                    </button>
                    <div className="h-4 w-px bg-slate-300 mx-1"></div>
                    {techs.map(tech => (
                        <button
                            key={tech.id}
                            onClick={() => toggleTech(tech.id)}
                            className={`text-xs px-2 py-1 rounded-full border transition font-medium
                                ${selectedTechs.includes(tech.id) ? 'bg-indigo-100 text-indigo-700 border-indigo-200' : 'bg-white text-slate-500 border-slate-200 opacity-60 grayscale'}`}
                        >
                            {tech.full_name.split(' ')[0]}
                        </button>
                    ))}
                </div>
            </div>

            {/* Main Content: Agenda Grid */}
            <div className="flex-1 overflow-hidden flex relative">
                {/* Time Axis (Sticky Left) */}
                <div className="w-12 md:w-16 bg-white border-r border-slate-200 shrink-0 flex flex-col pt-10 select-none z-10 shadow-[2px_0_5px_rgba(0,0,0,0.02)]">
                    {hours.map(h => (
                        <div key={h} className="text-[10px] md:text-xs text-slate-400 font-bold text-right pr-2 md:pr-3 -mt-2" style={{ height: PIXELS_PER_HOUR }}>
                            {h}:00
                        </div>
                    ))}
                </div>

                {/* Grid */}
                <div className="flex-1 overflow-auto bg-slate-50/50 relative custom-scrollbar overscroll-x-contain">
                    <div className="flex min-w-max pb-10" style={{ height: HOURS_COUNT * PIXELS_PER_HOUR + 50 }}>
                        {/* Background Lines */}
                        <div className="absolute inset-0 w-full pointer-events-none mt-10">
                            {hours.map((h, i) => (
                                <div key={h} className="border-b border-slate-200/60" style={{ height: PIXELS_PER_HOUR }}></div>
                            ))}
                        </div>

                        {/* Current Time Line */}
                        {nowPercent > 0 && nowPercent < 100 && (
                            <div
                                className="absolute left-0 right-0 border-t-2 border-red-500 z-30 pointer-events-none flex items-center"
                                style={{ top: `${(nowPercent / 100) * (HOURS_COUNT * PIXELS_PER_HOUR) + 40}px` }}
                            >
                                <div className="bg-red-500 text-white text-[9px] px-1 rounded-r font-bold -ml-16">
                                    {new Date().toLocaleTimeString().slice(0, 5)}
                                </div>
                                <div className="w-2 h-2 rounded-full bg-red-500 -ml-1"></div>
                            </div>
                        )}

                        {/* Tech Columns */}
                        {visibleTechs.map(tech => (
                            <div
                                key={tech.id}
                                className={`flex-1 min-w-[200px] md:min-w-[180px] border-r border-slate-200 py-2 relative transition-all duration-300 ${dragOverTech === tech.id ? 'bg-indigo-50/50' : ''}`}
                                onDragOver={(e) => handleDragOver(e, tech.id)}
                                onDrop={(e) => handleDrop(e, tech.id)}
                            >
                                {/* Tech Header */}
                                <div
                                    className={`sticky top-0 z-20 bg-white/95 backdrop-blur p-2 text-center border-b-2 transition cursor-pointer mx-1 rounded-b-lg shadow-sm ${selectedTechId === tech.id ? 'border-indigo-500' : 'border-slate-100 hover:border-slate-300'}`}
                                    onClick={() => setSelectedTechId(selectedTechId === tech.id ? null : tech.id)}
                                >
                                    <div className="font-bold text-slate-700 text-sm truncate">{tech.full_name}</div>
                                    <div className="text-[10px] text-slate-400">{appointments.filter(a => a.technician_id === tech.id).length} Citas</div>
                                </div>

                                {/* Drag Preview Ghost */}
                                {dragOverTech === tech.id && dragTime && (
                                    <div
                                        className="absolute left-2 right-2 bg-indigo-200/40 border-2 border-dashed border-indigo-400 rounded-lg z-10 pointer-events-none"
                                        style={{
                                            top: `${((dragTime.getHours() - START_HOUR) + dragTime.getMinutes() / 60) * PIXELS_PER_HOUR + 40}px`,
                                            height: `${1 * PIXELS_PER_HOUR}px`
                                        }}
                                    >
                                        <div className="text-xs font-bold text-indigo-700 p-1">{dragTime.toLocaleTimeString().slice(0, 5)}</div>
                                    </div>
                                )}

                                {/* Appointments */}
                                <div className="mt-2 relative h-full w-full">
                                    {appointments.filter(a => a.technician_id === tech.id).map(appt => {
                                        const startH = appt.start.getHours();
                                        const startM = appt.start.getMinutes();
                                        const top = ((startH - START_HOUR) + startM / 60) * PIXELS_PER_HOUR;
                                        const height = (appt.duration / 60) * PIXELS_PER_HOUR;
                                        const isSelected = selectedAppt?.id === appt.id;

                                        const isCancelled = ['cancelado', 'rechazado'].includes(appt.status);

                                        // Tetris Style Colors
                                        let colors = {
                                            'pending': 'bg-amber-100 border-l-4 border-amber-400 text-amber-900',
                                            'confirmed': 'bg-blue-100 border-l-4 border-blue-500 text-blue-900',
                                            'en_camino': 'bg-purple-100 border-l-4 border-purple-500 text-purple-900',
                                            'in_progress': 'bg-green-100 border-l-4 border-green-500 text-green-900',
                                            'paused': 'bg-red-50 border-l-4 border-red-500 text-red-900'
                                        }[appt.appointment_status] || 'bg-slate-100 border-l-4 border-slate-400 text-slate-700';

                                        // Cancelled Override
                                        if (isCancelled) {
                                            colors = 'bg-red-50/80 border-l-2 border-red-300 text-red-800 opacity-70 border border-t-0 border-r-0 border-b-0';
                                        }

                                        // Cancelled Layout: Minimized Strip
                                        const layoutClass = isCancelled
                                            ? 'right-1 w-8 hover:w-[95%] hover:z-50 hover:right-1'
                                            : 'left-1 right-1';

                                        return (
                                            <div
                                                key={appt.id}
                                                draggable={!isCancelled}
                                                onDragStart={(e) => handleDragStart(e, appt)}
                                                onClick={(e) => { e.stopPropagation(); setSelectedAppt(appt); }}
                                                className={`absolute rounded-lg p-2 text-xs shadow-sm cursor-pointer transition-all duration-200 ease-in-out active:scale-95 group overflow-hidden 
                                                    ${layoutClass} ${colors} ${isSelected ? 'ring-2 ring-indigo-500 z-30' : 'hover:shadow-md hover:z-20'}`}
                                                style={{ top: `${top}px`, height: `${height - 4}px` }}
                                            >
                                                {isCancelled ? (
                                                    <div className="h-full flex flex-col items-center justify-center">
                                                        <AlertTriangle size={14} className="text-red-500 mb-1" />
                                                        <span className="text-[9px] font-bold rotate-90 whitespace-nowrap uppercase tracking-widest opacity-60">Cancelado</span>
                                                        {/* Hover Content reveals in expanded view via CSS group-hover or JS conditional rendering if w matches */}
                                                        <div className="hidden group-hover:block absolute left-10 top-2">
                                                            <div className="font-bold">CANCELADO</div>
                                                            <div className="text-[10px]">{appt.cancellation_reason || 'Sin motivo'}</div>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <>
                                                        <div className="flex justify-between font-bold leading-tight">
                                                            <span>{appt.start.toLocaleTimeString().slice(0, 5)}</span>
                                                            {appt.appliance && <span className="text-[10px] uppercase bg-white/50 px-1 rounded">{appt.appliance.brand}</span>}
                                                        </div>
                                                        <div className="font-semibold truncate mt-1">{appt.client?.full_name || 'Sin Cliente'}</div>
                                                        <div className="truncate opacity-75 text-[10px] hidden md:block">
                                                            {appt.appliance ? `${appt.appliance.type} ${appt.appliance.model}` : appt.client?.address}
                                                        </div>

                                                        {/* Hover Popover Hint */}
                                                        <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition">
                                                            <MoreVertical size={12} />
                                                        </div>
                                                    </>
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
                        <div className="fixed inset-0 bg-black/10 z-40 md:hidden" onClick={() => setSelectedAppt(null)}></div>
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 md:top-20 md:left-auto md:right-4 md:translate-x-0 md:translate-y-0 w-80 bg-white rounded-xl shadow-2xl border border-slate-200 z-50 animate-in fade-in zoom-in-95 duration-200">
                            <div className={`p-4 border-b flex justify-between items-start ${['cancelado', 'rechazado'].includes(selectedAppt.status) ? 'bg-red-50 border-red-100' : 'border-slate-100'}`}>
                                <div>
                                    <h3 className="font-bold text-slate-800">{selectedAppt.client?.full_name}</h3>
                                    <p className="text-xs text-slate-500">{new Date(selectedAppt.scheduled_at).toLocaleString()}</p>
                                    {['cancelado', 'rechazado'].includes(selectedAppt.status) && (
                                        <div className="mt-1 px-2 py-0.5 bg-red-100 text-red-700 text-[10px] font-bold rounded uppercase inline-block">
                                            Cancelado
                                        </div>
                                    )}
                                </div>
                                <button onClick={() => setSelectedAppt(null)} className="text-slate-400 hover:text-slate-600"><X size={16} /></button>
                            </div>
                            <div className="p-4 space-y-3">
                                {selectedAppt.appliance && (
                                    <div className="flex items-start gap-2 text-sm text-slate-700 font-medium">
                                        <div className="bg-indigo-50 p-1.5 rounded text-indigo-600"><CheckSquare size={14} /></div>
                                        <div>
                                            <div className="uppercase text-[10px] text-slate-400 font-bold">Equipo</div>
                                            {selectedAppt.appliance.type} {selectedAppt.appliance.brand} <span className="text-slate-400">{selectedAppt.appliance.model}</span>
                                        </div>
                                    </div>
                                )}

                                <div className="bg-slate-50 p-3 rounded-lg text-xs border border-slate-100">
                                    <div className="uppercase text-[10px] text-slate-400 font-bold mb-1">Descripción / Avería</div>
                                    <div className="italic text-slate-600">{selectedAppt.problem_description || "Sin descripción"}</div>

                                    {['cancelado', 'rechazado'].includes(selectedAppt.status) && selectedAppt.cancellation_reason && (
                                        <div className="mt-2 pt-2 border-t border-slate-200 text-red-600 font-medium">
                                            Motivo: {selectedAppt.cancellation_reason}
                                        </div>
                                    )}
                                </div>

                                <div className="flex items-center gap-2 text-sm text-slate-600 pt-1">
                                    <MapPin size={16} className="text-slate-400 shrink-0" />
                                    <span className="truncate">{selectedAppt.client?.address}</span>
                                </div>

                                <div className="pt-2 flex gap-2">
                                    <button
                                        onClick={() => navigate(`/services/${selectedAppt.id}`)}
                                        className="flex-1 bg-indigo-600 text-white py-2 rounded-lg text-xs font-bold hover:bg-indigo-700 shadow-md shadow-indigo-200"
                                    >
                                        Ver Servicio Completo
                                    </button>
                                    <button onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(selectedAppt.client?.address + ', Malaga')}`, '_blank')} className="px-3 bg-emerald-100 text-emerald-700 border border-emerald-200 py-2 rounded-lg text-xs font-bold hover:bg-emerald-200">
                                        <Navigation size={16} />
                                    </button>
                                </div>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default GlobalAgenda;
