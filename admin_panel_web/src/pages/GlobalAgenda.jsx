import { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { Calendar, ChevronLeft, ChevronRight, User, Clock, MapPin, Maximize2, Minimize2, AlertTriangle, TrendingUp, MoreVertical, X, Phone, Navigation } from 'lucide-react';
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
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [techs, setTechs] = useState([]);
    const [appointments, setAppointments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedTechId, setSelectedTechId] = useState(null); // For Map Focus

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

            // 2. Fetch Appointments
            const { data: apptData, error } = await supabase
                .from('tickets')
                .select(`*, client:profiles!client_id(full_name, address, phone, current_lat, current_lng)`)
                .gte('scheduled_at', `${dateStr}T00:00:00`)
                // .lte('scheduled_at', `${dateStr}T23:59:59`) // Allow overflow if needed
                .not('technician_id', 'is', null)
                .neq('status', 'finalizado'); // Show confirmed/pending/en_camino

            // Transform dates to local objects for math
            const processed = (apptData || []).map(a => ({
                ...a,
                start: new Date(a.scheduled_at),
                // Assume 1h duration default if not set, or diff between scheduled_at and something else?
                // For now fixed duration 1h for visualization or logic
                duration: 60 // minutes
            }));

            setAppointments(processed || []);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const handleUpdateAppointment = async (apptId, newTechId, newDate) => {
        const iso = newDate.toISOString(); // Keep timezone in mind!

        // Simple Optimistic Update
        setAppointments(prev => prev.map(a => a.id === apptId ? { ...a, technician_id: newTechId, scheduled_at: iso, start: newDate } : a));

        const { error } = await supabase
            .from('tickets')
            .update({ technician_id: newTechId, scheduled_at: iso })
            .eq('id', apptId);

        if (error) {
            alert("Error al mover cita: " + error.message);
            fetchAgendaData(); // Revert
        }
    };

    // --- DND LOGIC (Custom) ---
    const handleDragStart = (e, appt) => {
        setDraggedAppt(appt);
        e.dataTransfer.effectAllowed = "move";
        // Hide ghost image if possible or custom styling
    };

    const handleDragOver = (e, techId) => {
        e.preventDefault(); // Allow Drop
        const container = e.currentTarget.getBoundingClientRect();
        const offsetY = e.clientY - container.top;

        // Snap to 15 mins
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
            // Validate: Don't allow past time? Or allow.
            // Check overlaps? For now, allow "Tetris" placement.
            await handleUpdateAppointment(draggedAppt.id, techId, dragTime);
        }
        setDraggedAppt(null);
        setDragOverTech(null);
        setDragTime(null);
    };


    // --- VISUALIZATION MARKERS ---
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

    // Map Route Logic
    const getTechColor = (techId) => {
        if (!techId) return '#64748b';
        const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4'];
        let hash = 0;
        for (let i = 0; i < techId.length; i++) hash = techId.charCodeAt(i) + ((hash << 5) - hash);
        return colors[Math.abs(hash) % colors.length];
    };

    const activeRoute = useMemo(() => {
        if (!selectedTechId) return null;
        const techAppts = appointments
            .filter(a => a.technician_id === selectedTechId)
            .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at));

        if (techAppts.length === 0) return null;

        return techAppts.map((a, i) => ({
            ...a,
            lat: a.client?.current_lat || 36.72 + (Math.random() * 0.05 - 0.025), // Mock if missing
            lng: a.client?.current_lng || -4.42 + (Math.random() * 0.05 - 0.025)
        }));
    }, [selectedTechId, appointments]);


    return (
        <div className="h-[calc(100vh-80px)] flex flex-col bg-slate-50">
            {/* Header */}
            <div className="px-6 py-4 bg-white border-b border-slate-200 flex justify-between items-center shadow-sm z-20">
                <div className="flex items-center gap-4">
                    <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                        <Calendar className="text-indigo-600" /> Tablero de Control
                    </h1>
                    <div className="flex items-center bg-slate-100 p-1 rounded-lg">
                        <button onClick={() => { const d = new Date(selectedDate); d.setDate(d.getDate() - 1); setSelectedDate(d); }} className="p-1 hover:bg-white hover:shadow-sm rounded transition"><ChevronLeft size={18} /></button>
                        <span className="px-4 font-bold text-slate-700 min-w-[140px] text-center text-sm">
                            {selectedDate.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'short' })}
                        </span>
                        <button onClick={() => { const d = new Date(selectedDate); d.setDate(d.getDate() + 1); setSelectedDate(d); }} className="p-1 hover:bg-white hover:shadow-sm rounded transition"><ChevronRight size={18} /></button>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Hoy: {appointments.length} Servicios</span>
                </div>
            </div>

            {/* Main Content: Agenda Grid */}
            <div className="flex-1 overflow-hidden flex relative">
                {/* Time Axis */}
                <div className="w-16 bg-white border-r border-slate-200 shrink-0 flex flex-col pt-10 select-none">
                    {hours.map(h => (
                        <div key={h} className="text-xs text-slate-400 font-bold text-right pr-3 -mt-2" style={{ height: PIXELS_PER_HOUR }}>
                            {h}:00
                        </div>
                    ))}
                </div>

                {/* Grid */}
                <div className="flex-1 overflow-auto bg-slate-50/50 relative custom-scrollbar">
                    <div className="flex min-w-max" style={{ height: HOURS_COUNT * PIXELS_PER_HOUR + 50 }}>
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
                        {techs.map(tech => (
                            <div
                                key={tech.id}
                                className={`flex-1 min-w-[160px] border-r border-slate-200 py-2 relative transition ${dragOverTech === tech.id ? 'bg-indigo-50/50' : ''}`}
                                onDragOver={(e) => handleDragOver(e, tech.id)}
                                onDrop={(e) => handleDrop(e, tech.id)}
                            >
                                {/* Tech Header */}
                                <div
                                    className={`sticky top-0 z-40 bg-white/95 backdrop-blur p-2 text-center border-b-2 transition cursor-pointer ${selectedTechId === tech.id ? 'border-indigo-500' : 'border-slate-100 hover:border-slate-300'}`}
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
                                <div className="mt-2 relative h-full">
                                    {appointments.filter(a => a.technician_id === tech.id).map(appt => {
                                        const startH = appt.start.getHours();
                                        const startM = appt.start.getMinutes();
                                        const top = ((startH - START_HOUR) + startM / 60) * PIXELS_PER_HOUR;
                                        const height = (appt.duration / 60) * PIXELS_PER_HOUR;
                                        const isSelected = selectedAppt?.id === appt.id;

                                        // Tetris Style Colors
                                        // Dynamic based on status or random color per client? Let's use Status.
                                        const colors = {
                                            'pending': 'bg-amber-100 border-l-4 border-amber-400 text-amber-900',
                                            'confirmed': 'bg-blue-100 border-l-4 border-blue-500 text-blue-900',
                                            'en_camino': 'bg-purple-100 border-l-4 border-purple-500 text-purple-900',
                                            'in_progress': 'bg-green-100 border-l-4 border-green-500 text-green-900',
                                            'paused': 'bg-red-50 border-l-4 border-red-500 text-red-900'
                                        }[appt.appointment_status] || 'bg-slate-100 border-l-4 border-slate-400 text-slate-700';

                                        return (
                                            <div
                                                key={appt.id}
                                                draggable
                                                onDragStart={(e) => handleDragStart(e, appt)}
                                                onClick={(e) => { e.stopPropagation(); setSelectedAppt(appt); }}
                                                className={`absolute left-1 right-1 rounded-lg p-2 text-xs shadow-sm cursor-move transition-all active:scale-95 group hover:shadow-md hover:z-20 overflow-hidden ${colors} ${isSelected ? 'ring-2 ring-indigo-500 z-30' : ''}`}
                                                style={{ top: `${top}px`, height: `${height - 4}px` }}
                                            >
                                                <div className="flex justify-between font-bold leading-tight">
                                                    <span>{appt.start.toLocaleTimeString().slice(0, 5)}</span>
                                                    {appt.client_id ? <User size={12} /> : <AlertTriangle size={12} className="text-red-500" />}
                                                </div>
                                                <div className="font-semibold truncate mt-1">{appt.client?.full_name || 'Sin Cliente'}</div>
                                                <div className="truncate opacity-75 text-[10px]">{appt.client?.address}</div>

                                                {/* Hover Popover Hint */}
                                                <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition">
                                                    <MoreVertical size={12} />
                                                </div>
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
                    <div className="absolute top-20 right-4 w-72 bg-white rounded-xl shadow-2xl border border-slate-200 z-50 animate-in fade-in slide-in-from-right-5">
                        <div className="p-4 border-b border-slate-100 flex justify-between items-start">
                            <div>
                                <h3 className="font-bold text-slate-800">{selectedAppt.client?.full_name}</h3>
                                <p className="text-xs text-slate-500">{new Date(selectedAppt.scheduled_at).toLocaleString()}</p>
                            </div>
                            <button onClick={() => setSelectedAppt(null)} className="text-slate-400 hover:text-slate-600"><X size={16} /></button>
                        </div>
                        <div className="p-4 space-y-3">
                            <div className="flex items-start gap-2 text-sm text-slate-600">
                                <MapPin size={16} className="text-slate-400 mt-0.5 shrink-0" />
                                <span>{selectedAppt.client?.address || 'Sin dirección'}</span>
                            </div>
                            <div className="flex items-center gap-2 text-sm text-slate-600">
                                <Phone size={16} className="text-slate-400 shrink-0" />
                                <a href={`tel:${selectedAppt.client?.phone}`} className="hover:text-blue-600 underline decoration-dotted">{selectedAppt.client?.phone || 'Sin teléfono'}</a>
                            </div>
                            <div className="bg-slate-50 p-2 rounded text-xs text-slate-500 italic border border-slate-100">
                                {selectedAppt.problem_description || "Sin descripción"}
                            </div>
                            <div className="pt-2 flex gap-2">
                                <button className="flex-1 bg-indigo-600 text-white py-1.5 rounded text-xs font-bold hover:bg-indigo-700">Ver Servicio</button>
                                <button className="flex-1 bg-white border border-slate-200 text-slate-600 py-1.5 rounded text-xs font-bold hover:bg-slate-50">Editar</button>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Footer: Map View */}
            <div className="h-48 bg-white border-t border-slate-200 flex shrink-0 shadow-[0_-5px_15px_rgba(0,0,0,0.05)] z-20">
                <div className="w-full relative">
                    {!selectedTechId && <div className="absolute inset-0 bg-white/60 backdrop-blur-[1px] z-[1000] flex items-center justify-center pointer-events-none">
                        <div className="bg-white px-4 py-2 rounded-full shadow-lg border border-slate-200 flex items-center gap-2 text-sm font-bold text-slate-500">
                            <Navigation size={16} className="text-blue-500" />
                            Selecciona un técnico arriba para ver su ruta
                        </div>
                    </div>}

                    <MapContainer
                        center={[36.7213, -4.4214]}
                        zoom={11}
                        style={{ height: '100%', width: '100%' }}
                        attributionControl={false}
                        zoomControl={false}
                    >
                        <TileLayer url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png" />
                        {activeRoute && (
                            <>
                                <Polyline
                                    positions={activeRoute.map(a => [a.lat, a.lng])}
                                    pathOptions={{ color: '#3b82f6', weight: 4, opacity: 0.8 }}
                                />
                                {activeRoute.map((stop, i) => (
                                    <Marker
                                        key={stop.id}
                                        position={[stop.lat, stop.lng]}
                                        icon={createTechIcon('#f59e0b')} // Yellow dots
                                    >
                                        <Popup>{stop.client?.full_name} ({new Date(stop.scheduled_at).toLocaleTimeString().slice(0, 5)})</Popup>
                                        <MapTooltip direction="top" offset={[0, -10]} opacity={1}>
                                            <span className="font-bold text-xs">{i + 1}</span>
                                        </MapTooltip>
                                    </Marker>
                                ))}
                            </>
                        )}
                    </MapContainer>
                </div>
            </div>
        </div>
    );
};

export default GlobalAgenda;
