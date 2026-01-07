import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { Calendar, ChevronLeft, ChevronRight, User, Clock, MapPin, Maximize2, Minimize2, AlertTriangle, TrendingUp } from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
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
    html: `<div style="background-color: ${color}; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 4px rgba(0,0,0,0.4);"></div>`,
    iconSize: [12, 12],
    iconAnchor: [6, 6]
});

// --- MATH HELPERS ---
const toRad = (x) => x * Math.PI / 180;
const getDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371; // km
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
};

const GlobalAgenda = () => {
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [techs, setTechs] = useState([]);
    const [appointments, setAppointments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showRouteMode, setShowRouteMode] = useState(false);
    const [splitView, setSplitView] = useState(true);

    useEffect(() => {
        fetchAgendaData();
    }, [selectedDate]);

    const fetchAgendaData = async () => {
        setLoading(true);
        try {
            const dateStr = selectedDate.toISOString().split('T')[0];

            // 1. Fetch Techs (Clean & Active ONLY)
            const { data: techData } = await supabase
                .from('profiles')
                .select('*')
                .eq('role', 'tech')
                .eq('is_active', true)
                .is('deleted_at', null)
                .order('full_name');
            setTechs(techData || []);

            // 2. Fetch Appointments for Date
            const { data: apptData } = await supabase
                .from('tickets')
                .select(`*, client:profiles!client_id(full_name, address, current_lat, current_lng)`)
                .gte('scheduled_at', `${dateStr}T00:00:00`)
                .lte('scheduled_at', `${dateStr}T23:59:59`)
                .not('technician_id', 'is', null)
                .neq('status', 'finalizado');

            setAppointments(apptData || []);

        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const changeDate = (days) => {
        const newDate = new Date(selectedDate);
        newDate.setDate(selectedDate.getDate() + days);
        setSelectedDate(newDate);
    };

    // Helper to generate consistent colors from Tech ID (for Map Routes)
    const getTechColor = (techId) => {
        const colors = ['#ef4444', '#f97316', '#f59e0b', '#84cc16', '#10b981', '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6', '#d946ef', '#f43f5e'];
        let hash = 0;
        if (!techId) return '#64748b';
        for (let i = 0; i < techId.length; i++) hash = techId.charCodeAt(i) + ((hash << 5) - hash);
        return colors[Math.abs(hash) % colors.length];
    };

    const getCpColor = (cp) => {
        if (!cp) return 'bg-slate-100 border-slate-200 text-slate-500';
        const colors = ['bg-red-100 border-red-300 text-red-800', 'bg-orange-100 border-orange-300 text-orange-800', 'bg-amber-100 border-amber-300 text-amber-800', 'bg-green-100 border-green-300 text-green-800', 'bg-emerald-100 border-emerald-300 text-emerald-800', 'bg-teal-100 border-teal-300 text-teal-800', 'bg-cyan-100 border-cyan-300 text-cyan-800', 'bg-sky-100 border-sky-300 text-sky-800', 'bg-blue-100 border-blue-300 text-blue-800', 'bg-indigo-100 border-indigo-300 text-indigo-800', 'bg-violet-100 border-violet-300 text-violet-800', 'bg-purple-100 border-purple-300 text-purple-800', 'bg-fuchsia-100 border-fuchsia-300 text-fuchsia-800', 'bg-pink-100 border-pink-300 text-pink-800', 'bg-rose-100 border-rose-300 text-rose-800'];
        let hash = 0;
        for (let i = 0; i < cp.length; i++) hash = cp.charCodeAt(i) + ((hash << 5) - hash);
        return colors[Math.abs(hash) % colors.length];
    };

    const getStatusColor = (status) => {
        switch (status) {
            case 'confirmed': return 'bg-green-100 border-green-200 text-green-800';
            case 'rejected': return 'bg-red-100 border-red-200 text-red-800';
            case 'pending': return 'bg-amber-100 border-amber-200 text-amber-800';
            default: return 'bg-blue-100 border-blue-200 text-blue-800';
        }
    };
    const getParamStatusIcon = (status) => {
        if (status === 'confirmed') return '✅';
        if (status === 'rejected') return '❌';
        if (status === 'pending') return '⏳';
        return '';
    };

    const getCpFromAppointment = (appt) => {
        if (appt.client?.address) {
            const match = appt.client.address.match(/\b\d{5}\b/);
            return match ? match[0] : null;
        }
        return null;
    };

    const getPosition = (dateStr) => {
        const date = new Date(dateStr);
        const startHour = 8;
        const pixelsPerHour = 100;
        const hour = date.getHours();
        const minutes = date.getMinutes();
        if (hour < startHour) return 0;
        return ((hour - startHour) + (minutes / 60)) * pixelsPerHour;
    };
    const hours = Array.from({ length: 13 }, (_, i) => i + 8);
    const techAppointmentsCount = (techId, appointments) => appointments.filter(a => a.technician_id === techId).length;


    // --- MAP & AI LOGIC ---
    // Calculates Route Efficiency (ZigZags + Total Distance)
    const routeData = useMemo(() => {
        return techs.map(tech => {
            const techAppts = appointments
                .filter(a => a.technician_id === tech.id)
                .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at));

            let totalDist = 0;
            const path = techAppts.map((a, index) => {
                // Determine Lat/Lng (Simulated for demo if missing)
                // In real prod, this comes from geocoding 'a.client.address'
                const lat = a.client?.current_lat || (36.72 + (Math.random() * 0.05 - 0.025));
                const lng = a.client?.current_lng || (-4.42 + (Math.random() * 0.05 - 0.025));

                return { lat, lng, ...a, index };
            });

            // Calculate Metrics
            const badPoints = new Set();
            for (let i = 0; i < path.length - 1; i++) {
                const dist = getDistance(path[i].lat, path[i].lng, path[i + 1].lat, path[i + 1].lng);
                totalDist += dist;

                // Simple "Zig-Zag" heuristic: 
                // Simplified for Demo: Flag legs > 8km as "Inefficient Alert"
                if (dist > 8) {
                    badPoints.add(path[i].id); // Leg start is culprit (or end?)
                    // Let's flag the destination as "Far Reach"
                    badPoints.add(path[i + 1].id);
                }
            }

            // Efficiency Score (Inverse of avg distance per hop, normalized to 100)
            const hopCount = Math.max(path.length - 1, 1);
            const avgHop = totalDist / hopCount;
            // Assume 2km avg is Perfect (100). 15km avg is Bad (0). 
            let score = Math.max(0, Math.min(100, 100 - ((avgHop - 2) * 5)));
            if (path.length === 0) score = 100; // Idle is efficient? Or N/A.

            return { tech, path, color: getTechColor(tech.id), score: Math.round(score), badPoints, totalDist: totalDist.toFixed(1) };
        });
    }, [techs, appointments]);


    if (loading) return <div className="p-8 text-center text-slate-500">Cargando agenda...</div>;

    return (
        <div className="h-[calc(100vh-100px)] flex flex-col">
            {/* Header */}
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                    <Calendar className="text-blue-600" />
                    Agenda Global <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 text-xs rounded-full uppercase tracking-wider font-bold">God Mode</span>
                </h1>

                <div className="flex items-center gap-4">
                    <button
                        onClick={() => setShowRouteMode(!showRouteMode)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg font-bold text-sm transition border ${showRouteMode ? 'bg-indigo-600 text-white border-indigo-700' : 'bg-white text-slate-600 border-slate-200'
                            }`}
                    >
                        <MapPin size={16} /> CP
                    </button>

                    <button
                        onClick={() => setSplitView(!splitView)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg font-bold text-sm transition border ${splitView ? 'bg-blue-600 text-white border-blue-700' : 'bg-white text-slate-600 border-slate-200'
                            }`}
                    >
                        {splitView ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                        {splitView ? 'Ocultar Mapa' : 'Ver Mapa'}
                    </button>

                    <div className="flex items-center gap-4 bg-white p-2 rounded-lg border border-slate-200 shadow-sm">
                        <button onClick={() => changeDate(-1)} className="p-2 hover:bg-slate-100 rounded-full"><ChevronLeft /></button>
                        <div className="font-bold text-lg w-48 text-center">
                            {selectedDate.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}
                        </div>
                        <button onClick={() => changeDate(1)} className="p-2 hover:bg-slate-100 rounded-full"><ChevronRight /></button>
                    </div>
                </div>
            </div>

            {/* Split Content */}
            <div className="flex-1 flex gap-4 overflow-hidden">

                {/* LEFT: Agenda Grid */}
                <div className={`flex-1 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col transition-all ${splitView ? 'w-1/2' : 'w-full'}`}>
                    {/* Header Row (Techs) */}
                    <div className="flex border-b border-slate-200 bg-slate-50 overflow-x-auto hide-scrollbar">
                        <div className="w-14 border-r border-slate-200 shrink-0"></div>
                        {techs.map(tech => {
                            const stats = routeData.find(r => r.tech.id === tech.id);
                            return (
                                <div key={tech.id} className="flex-1 min-w-[120px] py-2 text-center border-r border-slate-200 last:border-0 font-semibold text-slate-700 px-2 group cursor-pointer hover:bg-blue-50 transition">
                                    <div className="truncate">{tech.full_name.split(' ')[0]}</div>

                                    {/* Efficiency Score Badge */}
                                    {stats && stats.path.length > 0 && (
                                        <div className={`text-[10px] font-bold mt-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border ${stats.score > 80 ? 'bg-green-100 text-green-700 border-green-200' :
                                                stats.score > 50 ? 'bg-yellow-100 text-yellow-700 border-yellow-200' :
                                                    'bg-red-100 text-red-700 border-red-200'
                                            }`}>
                                            <TrendingUp size={10} />
                                            {stats.score}% Eff
                                        </div>
                                    )}
                                    <div className="text-[10px] text-slate-400 font-normal mt-0.5">{techAppointmentsCount(tech.id, appointments)} citas</div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Body (Timeline) */}
                    <div className="flex-1 overflow-y-auto relative bg-slate-50/30">
                        <div className="flex min-h-[1300px]">
                            <div className="absolute inset-0 flex flex-col pointer-events-none w-full">
                                {hours.map(hour => (<div key={hour} className="h-[100px] border-b border-slate-100 w-full"></div>))}
                            </div>
                            <div className="w-14 border-r border-slate-200 shrink-0 bg-white z-10">
                                {hours.map(hour => (<div key={hour} className="h-[100px] text-xs text-slate-400 text-center pt-2">{hour}:00</div>))}
                            </div>

                            {techs.map(tech => (
                                <div key={tech.id} className="flex-1 min-w-[120px] border-r border-slate-100 relative group">
                                    {appointments.filter(a => a.technician_id === tech.id).map(appt => {
                                        const top = getPosition(appt.scheduled_at);
                                        const cp = getCpFromAppointment(appt);
                                        const styleClass = showRouteMode ? getCpColor(cp) : getStatusColor(appt.appointment_status);

                                        // Is Inefficient?
                                        const stats = routeData.find(r => r.tech.id === tech.id);
                                        const isInefficient = stats?.badPoints.has(appt.id);

                                        return (
                                            <div
                                                key={appt.id}
                                                className={`absolute left-1 right-1 p-2 rounded-md border text-xs shadow-sm hover:shadow-lg hover:z-20 transition cursor-pointer overflow-hidden ${styleClass}`}
                                                style={{ top: `${top}px`, height: '90px' }}
                                                title={`${appt.client?.full_name}\n${appt.profiles?.address}`}
                                            >
                                                <div className="font-bold flex justify-between">
                                                    <span>{appt.scheduled_at.split('T')[1].slice(0, 5)}</span>
                                                    {isInefficient && (
                                                        <span className="text-amber-600 bg-amber-100 rounded-full px-1 animate-pulse" title="Ruta Ineficiente">
                                                            <AlertTriangle size={12} />
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="font-medium truncate mt-0.5">{appt.client?.full_name}</div>
                                                {showRouteMode && cp && <div className="text-[9px] font-mono opacity-80">{cp}</div>}
                                                <div className="absolute bottom-1 right-1">{getParamStatusIcon(appt.appointment_status)}</div>
                                            </div>
                                        );
                                    })}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* RIGHT: Map View */}
                {splitView && (
                    <div className="w-1/3 min-w-[400px] bg-slate-100 rounded-xl border border-slate-300 shadow-inner overflow-hidden relative">
                        <MapContainer
                            center={[36.7213, -4.4214]}
                            zoom={12}
                            style={{ height: '100%', width: '100%' }}
                            attributionControl={false}
                        >
                            <TileLayer url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png" />
                            {routeData.map((route, idx) => (
                                route.path.length > 0 && (
                                    <div key={route.tech.id}>
                                        <Polyline
                                            positions={route.path.map(p => [p.lat, p.lng])}
                                            pathOptions={{ color: route.color, weight: 4, opacity: 0.7, dashArray: '5, 10' }}
                                        />
                                        {route.path.map((stop, i) => (
                                            <Marker
                                                key={stop.id}
                                                position={[stop.lat, stop.lng]}
                                                icon={createTechIcon(route.color)}
                                            >
                                                <Popup className="text-xs font-sans">
                                                    <strong>{stop.scheduled_at.split('T')[1].slice(0, 5)}</strong> <br />
                                                    Tech: {route.tech.full_name} <br />
                                                    Client: {stop.client?.full_name} <br />
                                                    {route.badPoints.has(stop.id) && <span className="text-red-600 font-bold">⚠️ Ineficiente (+8km)</span>}
                                                </Popup>
                                            </Marker>
                                        ))}
                                    </div>
                                )
                            ))}
                        </MapContainer>
                        <div className="absolute top-4 right-4 bg-white/90 backdrop-blur p-2 rounded-lg shadow-md z-[1000] text-xs max-w-[150px]">
                            <h4 className="font-bold mb-1 border-b pb-1">Técnicos</h4>
                            {routeData.filter(r => r.path.length > 0).map(r => (
                                <div key={r.tech.id} className="flex justify-between items-center mb-1">
                                    <div className="flex items-center gap-2">
                                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: r.color }}></div>
                                        <span className="truncate w-16">{r.tech.full_name.split(' ')[0]}</span>
                                    </div>
                                    <span className={`font-bold ${r.score < 50 ? 'text-red-500' : 'text-green-600'}`}>{r.score}%</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default GlobalAgenda;
