import { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { Calendar, ChevronLeft, ChevronRight, User, CheckSquare, Square, Map as MapIcon, X, MapPin, Phone, Navigation, Clock, AlertTriangle } from 'lucide-react';
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
const END_HOUR = 20;
const HOURS_COUNT = END_HOUR - START_HOUR + 1;
const PIXELS_PER_HOUR = 140; // Increased for better card readability
const GRID_HEIGHT = HOURS_COUNT * PIXELS_PER_HOUR;

const GlobalAgenda = () => {
    const navigate = useNavigate();
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [techs, setTechs] = useState([]);
    const [selectedTechs, setSelectedTechs] = useState([]);
    const [appointments, setAppointments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showMapModal, setShowMapModal] = useState(false);
    const [selectedAppt, setSelectedAppt] = useState(null);

    // Filter/Header Refs to calculate available height if needed, but we use flex.

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
                .lt('scheduled_at', `${dateStr}T23:59:59`)
                .not('technician_id', 'is', null)
                .neq('status', 'finalizado');

            if (error) {
                // Fallback
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
                duration: 60 // Default, ideally fetch from ticket if available
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

    // --- OVERLAP & POSITION LOGIC ---
    // Pack events for a column to handle overlaps side-by-side
    const getPositionedEvents = (techId) => {
        // Filter events for this tech
        let events = appointments.filter(a => a.technician_id === techId)
            .map(a => ({
                ...a,
                startMs: a.start.getTime(),
                endMs: a.start.getTime() + (a.duration * 60000)
            }))
            .sort((a, b) => a.startMs - b.startMs); // Sort by start time

        if (events.length === 0) return [];

        // Simple column packing algorithm
        // 1. Assign columns
        const columns = [];
        let lastEventEnds = null;

        // Visual "Lanes" approach is better for calendar:
        // Group overlapping events.
        // For each group, assign width = 100% / group.size, left = index * width

        // Step 1: Detect clusters of overlapping events
        // A cluster is a set where each event overlaps with at least one other in the set (chain reaction)
        // Actually for simple "fullcalendar" style: 
        // Iterate events. Place in first free visual column (0...n).

        const placements = []; // { event, colIndex, maxColsInCluster }

        // Expand events with calculated visual layout
        // We will do a simpler "Width Sharing" based on direct overlap
        // If A and B overlap, both get 50% width.
        // Layout algorithm:
        // 1. Calculate overlaps for every event.
        // 2. Maximum concurrent events at any point determine width?

        // Let's use a simpler greedy approach for now that works for 90% cases:
        // If event overlaps with previous, shift right.

        const expandedEvents = events.map(e => ({ ...e, col: 0, totalCols: 1 }));

        for (let i = 0; i < expandedEvents.length; i++) {
            let current = expandedEvents[i];
            // Check established overlap with subsequent events?
            // Or simpler: Check all other events that overlap this one.
            const overlapping = expandedEvents.filter((other, idx) =>
                idx !== i &&
                ((current.startMs >= other.startMs && current.startMs < other.endMs) ||
                    (current.endMs > other.startMs && current.endMs <= other.endMs) ||
                    (current.startMs <= other.startMs && current.endMs >= other.endMs))
            );

            if (overlapping.length > 0) {
                // Determine indices. 
                // Assign a column index 0..N that isn't taken by overlapping neighbours
                const takenCols = new Set();
                overlapping.forEach(o => {
                    // Logic is tricky without a full sweep.
                    // Fallback to simpler visual: Indent if overlap.
                });

                // Let's stick to strict 50% split if ONE overlap, 33% if TWO.
                current.totalCols = overlapping.length + 1;
                // Find visible index order
                const group = [current, ...overlapping].sort((a, b) => a.startMs - b.startMs || a.id.localeCompare(b.id));
                current.col = group.indexOf(current);
            }
        }

        return expandedEvents;
    };


    // --- DND HANDLERS ---
    const [dragState, setDragState] = useState({ id: null, offset: 0 }); // offset in pixels from top of event to mouse

    const handleDragStart = (e, appt) => {
        if (['cancelado', 'rechazado'].includes(appt.status)) { e.preventDefault(); return; }

        // Calculate offset so we don't snap the top of the card to the mouse
        const rect = e.currentTarget.getBoundingClientRect();
        const offset = e.clientY - rect.top;

        setDragState({ id: appt.id, offset });
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", appt.id);
        e.dataTransfer.setDragImage(new Image(), 0, 0); // Hide default ghost
    };

    const handleDragOver = (e, techId) => {
        e.preventDefault();
        // Calculate Time
        const rect = e.currentTarget.getBoundingClientRect();
        const y = e.clientY - rect.top; // y in container
        // Snap to grid (15 mins = PIXELS_PER_HOUR / 4)
        const snapPixels = PIXELS_PER_HOUR / 4;
        const snappedY = Math.round(y / snapPixels) * snapPixels;

        // Convert to time
        const hoursToAdd = snappedY / PIXELS_PER_HOUR;
        const totalMinutes = Math.floor(hoursToAdd * 60);

        // Bound checks
        if (totalMinutes < 0) return;
        const maxMinutes = (END_HOUR - START_HOUR) * 60;
        if (totalMinutes > maxMinutes) return;

        // This is purely for "Drag Preview" calculation if we wanted to show a shadow
        // For actual drop, we recalculate.
    };

    const handleDrop = (e, techId) => {
        e.preventDefault();
        const apptId = e.dataTransfer.getData("text/plain");
        const appt = appointments.find(a => a.id === apptId);
        if (!appt) return;

        // Calculate Time again
        const rect = e.currentTarget.getBoundingClientRect();
        const y = e.clientY - rect.top;
        const snapPixels = PIXELS_PER_HOUR / 4;
        // Adjust using start offset? 
        // If I grab the card at the bottom, I want the top to be at (mouseY - offset).
        // Let's rely on mouse pointer being the "target" time for now or adjust logic.
        // User didn't specify strict anchor, but typically it's top-left.
        // Let's treat the mouse position as the insertion point for the clicked part of the card?
        // Simpler: Mouse Y corresponds to the time slot under the mouse. 
        // If I want to move start time, I should align top of card.
        // Let's assume user aims the mouse at the desired slot for the "point they grabbed"? 
        // No, standard is: top of card moves to slot.
        // We need to correct Y by `dragState.offset`? 
        // Since we are not doing a full dnd-kit implementation, let's just use raw mouse Y as the new Start Time.
        // It's intuitive enough for "click and move to here".

        const snappedY = Math.round(y / snapPixels) * snapPixels;

        const hoursToAdd = snappedY / PIXELS_PER_HOUR;
        const newDate = new Date(selectedDate);
        newDate.setHours(START_HOUR + Math.floor(hoursToAdd), (hoursToAdd % 1) * 60);

        handleUpdateAppointment(apptId, techId, newDate);
    };

    const visibleTechs = useMemo(() => techs.filter(t => selectedTechs.includes(t.id)), [techs, selectedTechs]);
    const hours = Array.from({ length: HOURS_COUNT }, (_, i) => i + START_HOUR);

    // Map Routes
    const activeRoute = useMemo(() => {
        const relevantAppts = appointments.filter(a => selectedTechs.includes(a.technician_id)).sort((a, b) => a.start - b.start);
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
    }, [visibleTechs, appointments, selectedTechs]);

    return (
        <div className="h-[calc(100vh-80px)] flex flex-col bg-slate-50 relative overflow-hidden">
            {/* --- HEADER --- */}
            <div className="bg-white border-b border-slate-200 px-4 py-3 z-30 shadow-sm shrink-0 flex flex-col gap-3">
                <div className="flex flex-col md:flex-row justify-between items-center gap-3">
                    {/* Title & Date */}
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2 text-slate-800">
                            <Calendar className="text-indigo-600" size={20} />
                            <span className="font-bold text-lg hidden md:inline">Agenda de Recursos</span>
                        </div>
                        <div className="flex items-center bg-slate-100 rounded-lg p-1 border border-slate-200">
                            <button onClick={() => { const d = new Date(selectedDate); d.setDate(d.getDate() - 1); setSelectedDate(d); }} className="p-1 hover:bg-white rounded transition"><ChevronLeft size={16} /></button>
                            <span className="text-sm font-bold text-slate-700 w-32 text-center capitalize">{selectedDate.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                            <button onClick={() => { const d = new Date(selectedDate); d.setDate(d.getDate() + 1); setSelectedDate(d); }} className="p-1 hover:bg-white rounded transition"><ChevronRight size={16} /></button>
                        </div>
                    </div>
                    {/* Actions */}
                    <button onClick={() => setShowMapModal(true)} className="flex items-center gap-2 bg-emerald-100 text-emerald-700 px-3 py-2 rounded-lg text-xs font-bold hover:bg-emerald-200 border border-emerald-200 shadow-sm transition active:scale-95">
                        <MapIcon size={16} /> Mapa de Rutas
                    </button>
                </div>
                {/* Tech Filter */}
                <div className="flex flex-wrap gap-2 items-center">
                    <button onClick={toggleAllTechs} className={`text-[10px] font-bold px-2 py-1 rounded border flex items-center gap-1 transition ${selectedTechs.length === techs.length ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'}`}>
                        {selectedTechs.length === techs.length ? <CheckSquare size={12} /> : <Square size={12} />} TODOS
                    </button>
                    <div className="w-px h-4 bg-slate-300 mx-1"></div>
                    {techs.map(t => (
                        <button key={t.id} onClick={() => toggleTech(t.id)} className={`text-[10px] font-bold px-2 py-1 rounded border transition ${selectedTechs.includes(t.id) ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-white text-slate-400 border-slate-200 opacity-60'}`}>
                            {t.full_name}
                        </button>
                    ))}
                </div>
            </div>

            {/* --- BODY (SCROLLABLE) --- */}
            <div className="flex-1 overflow-auto bg-white relative flex">
                {/* --- TIME SIDEBAR (Fixed Width) --- */}
                <div className="w-14 shrink-0 bg-white border-r border-slate-200 sticky left-0 z-20 select-none">
                    <div className="h-10 border-b border-slate-200 bg-slate-50"></div> {/* Header Placeholder */}
                    {hours.map(h => (
                        <div key={h} className="text-right pr-2 text-xs text-slate-400 font-medium relative -top-3" style={{ height: PIXELS_PER_HOUR }}>
                            {h}:00
                        </div>
                    ))}
                </div>

                {/* --- GRID COLUMNS --- */}
                <div className="flex-1 flex min-w-[600px]"> {/* Ensure min width implies horizontal scroll on mobile */}
                    {visibleTechs.map(tech => (
                        <div key={tech.id} className="flex-1 border-r border-slate-100 min-w-[150px] relative bg-slate-50/10"
                            onDragOver={(e) => handleDragOver(e, tech.id)}
                            onDrop={(e) => handleDrop(e, tech.id)}
                        >
                            {/* Column Header */}
                            <div className="h-10 border-b border-slate-200 bg-slate-50/80 backdrop-blur sticky top-0 z-10 flex items-center justify-center font-bold text-xs text-slate-700 uppercase tracking-wide">
                                {tech.full_name}
                            </div>

                            {/* Grid Background Lines */}
                            <div className="absolute inset-0 top-10 pointer-events-none z-0">
                                {hours.map(h => (
                                    <div key={h} className="border-b border-slate-100 w-full" style={{ height: PIXELS_PER_HOUR }}></div>
                                ))}
                            </div>

                            {/* Events Container */}
                            <div className="relative w-full h-[calc(100%-40px)] z-0" style={{ height: GRID_HEIGHT }}>
                                {getPositionedEvents(tech.id).map(appt => {
                                    // Calculated Positioning
                                    // top is relative to start of grid (08:00)
                                    // (Current Hour - Start Hour) + Mins
                                    const startHourFloat = appt.start.getHours() + appt.start.getMinutes() / 60;
                                    const offsetHours = startHourFloat - START_HOUR;
                                    const top = offsetHours * PIXELS_PER_HOUR;
                                    const height = (appt.duration / 60) * PIXELS_PER_HOUR;

                                    // Overlap Width Logic
                                    const width = 100 / appt.totalCols;
                                    const left = width * appt.col;

                                    const isCancelled = ['cancelado', 'rechazado'].includes(appt.status);

                                    // Colors (Pastel Solids)
                                    let colorClass = 'bg-slate-100 text-slate-600 border-slate-200';
                                    if (appt.status === 'confirmed') colorClass = 'bg-sky-100 text-sky-800 border-sky-200 hover:bg-sky-200';
                                    if (appt.status === 'en_camino') colorClass = 'bg-purple-100 text-purple-800 border-purple-200 hover:bg-purple-200';
                                    if (appt.status === 'in_progress') colorClass = 'bg-emerald-100 text-emerald-800 border-emerald-200 hover:bg-emerald-200';
                                    if (appt.status === 'pending') colorClass = 'bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-200';
                                    if (isCancelled) colorClass = 'bg-red-50 text-red-800 border-red-200 opacity-60';

                                    return (
                                        <div
                                            key={appt.id}
                                            draggable={!isCancelled}
                                            onDragStart={(e) => handleDragStart(e, appt)}
                                            onClick={() => setSelectedAppt(appt)}
                                            className={`absolute p-1.5 rounded border shadow-sm transition-all cursor-pointer group flex flex-col justify-between overflow-hidden
                                                     ${colorClass} ${selectedAppt?.id === appt.id ? 'ring-2 ring-indigo-500 z-50' : 'z-10'}`}
                                            style={{
                                                top: `${top}px`,
                                                height: `${height - 2}px`, // Slight gap
                                                left: `${left}%`,
                                                width: `${width}%`
                                            }}
                                        >
                                            {/* Content F-TECH Style */}
                                            <div>
                                                <div className="flex justify-between items-start">
                                                    <span className="font-extrabold text-[10px] uppercase tracking-tighter leading-none">
                                                        {appt.title || appt.ticket_type || 'SERVICIO'}
                                                    </span>
                                                    {isCancelled && <AlertTriangle size={10} className="text-red-500" />}
                                                </div>
                                                <div className="text-[10px] leading-tight mt-0.5 line-clamp-2 font-medium opacity-90">
                                                    {appt.client?.full_name}
                                                </div>
                                            </div>
                                            <div className="flex justify-between items-end mt-auto">
                                                <div className="text-[9px] font-mono opacity-70">
                                                    {appt.start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - {new Date(appt.start.getTime() + appt.duration * 60000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                </div>
                                                <div className="text-[8px] bg-white/40 px-1 rounded font-mono">
                                                    T-{appt.id.toString().slice(-3)}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* --- MAP OVERLAY --- */}
            {showMapModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-8 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
                    <div className="bg-white w-full h-full md:max-w-6xl rounded-xl shadow-2xl flex flex-col overflow-hidden relative">
                        <div className="px-4 py-3 border-b flex justify-between items-center bg-white z-10 shrink-0">
                            <h2 className="font-bold flex items-center gap-2"><MapIcon className="text-emerald-500" /> Rutas del Día</h2>
                            <button onClick={() => setShowMapModal(false)} className="bg-slate-100 hover:bg-slate-200 p-2 rounded-full"><X size={18} /></button>
                        </div>
                        <div className="flex-1 bg-slate-100 relative">
                            <MapContainer center={[36.7213, -4.4214]} zoom={11} style={{ height: '100%', width: '100%' }} attributionControl={false}>
                                <TileLayer url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png" />
                                {Object.entries(activeRoute).map(([techId, routePoints], idx) => {
                                    const color = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'][idx % 5];
                                    return (
                                        <div key={techId}>
                                            <Polyline positions={routePoints.map(a => [a.lat, a.lng])} pathOptions={{ color, weight: 4 }} />
                                            {routePoints.map((stop, i) => (
                                                <Marker key={stop.id} position={[stop.lat, stop.lng]} icon={createTechIcon(color)}>
                                                    <Popup><div className="font-bold text-xs">{stop.client?.full_name}</div></Popup>
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

            {/* --- POPOVER OVERLAY --- */}
            {selectedAppt && (
                <div className="fixed inset-0 bg-black/20 z-50 flex items-center justify-center p-4" onClick={() => setSelectedAppt(null)}>
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200 border border-slate-200" onClick={e => e.stopPropagation()}>
                        <div className={`p-4 border-b flex justify-between items-start ${['cancelado', 'rechazado'].includes(selectedAppt.status) ? 'bg-red-50' : 'bg-slate-50'}`}>
                            <div>
                                <h3 className="font-bold text-slate-800 text-lg">{selectedAppt.client?.full_name}</h3>
                                <div className="text-xs text-slate-500 font-mono">{new Date(selectedAppt.scheduled_at).toLocaleString()}</div>
                            </div>
                            <button onClick={() => setSelectedAppt(null)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
                        </div>
                        <div className="p-4 space-y-4">
                            {selectedAppt.appliance && (
                                <div className="flex gap-3 bg-indigo-50 p-3 rounded-lg border border-indigo-100">
                                    <CheckSquare size={16} className="text-indigo-600 mt-0.5" />
                                    <div>
                                        <div className="text-[10px] font-bold text-indigo-400 uppercase">Equipo</div>
                                        <div className="font-bold text-indigo-900 text-sm">{selectedAppt.appliance.type} {selectedAppt.appliance.brand}</div>
                                    </div>
                                </div>
                            )}
                            <div className="space-y-2 text-sm text-slate-600">
                                <div className="flex items-center gap-2"><MapPin size={16} className="text-slate-400" /> <span>{selectedAppt.client?.address}</span></div>
                                <div className="flex items-center gap-2"><Phone size={16} className="text-slate-400" /> <a href={`tel:${selectedAppt.client?.phone}`} className="underline decoration-dotted">{selectedAppt.client?.phone}</a></div>
                            </div>
                            <div className="flex gap-2 pt-2">
                                <button onClick={() => navigate(`/services/${selectedAppt.id}`)} className="flex-1 bg-indigo-600 text-white py-2 rounded-lg font-bold text-sm shadow hover:bg-indigo-700">Ver Ficha</button>
                                <button onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(selectedAppt.client?.address + ', Malaga')}`, '_blank')} className="bg-emerald-100 text-emerald-700 px-4 py-2 rounded-lg hover:bg-emerald-200"><Navigation size={18} /></button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default GlobalAgenda;
