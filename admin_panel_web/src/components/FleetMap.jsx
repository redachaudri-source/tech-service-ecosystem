import { useState, useEffect, useMemo } from 'react';
import { APIProvider, Map, AdvancedMarker, InfoWindow } from '@vis.gl/react-google-maps';
import { supabase } from '../lib/supabase';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { User, MapPin, Navigation, Clock, Sun, Moon, Battery, Signal } from 'lucide-react';

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || 'AIzaSyAzaTWQlJ7B2xqHvUrhcNUNuN_pN_QKKKQ';

// --- SOLAR CLOCK WIDGET ---
const SolarClock = ({ workingHours }) => {
    const [time, setTime] = useState(new Date());

    useEffect(() => {
        const timer = setInterval(() => setTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    // Helper: Weekday Key
    const getWeekdayKey = (date) => {
        const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        return days[date.getDay()];
    };

    const todayKey = getWeekdayKey(time);
    const dayConfig = workingHours?.[todayKey];

    // Parse Config or Default (09:00 - 18:00)
    const startStr = dayConfig?.start || '09:00';
    const endStr = dayConfig?.end || '18:00';
    const isClosed = !dayConfig;

    const parseTime = (str) => {
        const [h, m] = str.split(':').map(Number);
        return h + m / 60;
    };

    const startH = parseTime(startStr);
    const endH = parseTime(endStr);
    const currentH = time.getHours() + time.getMinutes() / 60;

    // Calculate Position
    let sunPos = 0;
    let statusText = 'FUERA DE TURNO';
    let statusColor = 'bg-slate-700 text-slate-300 border-slate-600';

    if (isClosed) {
        sunPos = 0;
        statusText = 'CERRADO (DOMINGO)';
        statusColor = 'bg-red-900/50 text-red-300 border-red-700';
    } else if (currentH < startH) {
        sunPos = 0;
        statusText = 'ESPERANDO APERTURA';
    } else if (currentH > endH) {
        sunPos = 100;
        statusText = 'JORNADA FINALIZADA';
        statusColor = 'bg-indigo-900/50 text-indigo-300 border-indigo-700';
    } else {
        sunPos = ((currentH - startH) / (endH - startH)) * 100;
        statusText = 'JORNADA ACTIVA';
        statusColor = 'bg-emerald-900/50 text-emerald-300 border-emerald-700';
    }

    const isNight = isClosed || currentH > endH || currentH < startH;

    return (
        <div className="bg-gradient-to-br from-slate-900 to-slate-800 p-4 rounded-xl shadow-lg border border-slate-700 text-white relative overflow-hidden mb-4 transition-all duration-500">
            {/* Digital Clock */}
            <div className="flex justify-between items-start z-10 relative">
                <div>
                    <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Tiempo Operativo</h3>
                    <div className="text-2xl font-black tracking-tight font-mono">
                        {time.toLocaleTimeString('es-ES')}
                    </div>
                    <div className="text-xs text-slate-400 font-medium">
                        {time.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}
                    </div>
                </div>
                {/* Status Badge */}
                <div className={`px-2 py-1 rounded text-[10px] font-bold border transition-colors ${statusColor}`}>
                    {statusText}
                </div>
            </div>

            {/* Solar Arch Visualization */}
            <div className={`mt-6 relative h-16 w-full ${isClosed ? 'opacity-30 grayscale' : 'opacity-100'}`}>
                {/* The Path */}
                <svg className="w-full h-full overflow-visible" preserveAspectRatio="none">
                    <path
                        d="M 10 60 Q 150 -30 290 60"
                        fill="none"
                        stroke="rgba(255,255,255,0.1)"
                        strokeWidth="2"
                        strokeDasharray="4 4"
                    />
                </svg>

                {/* The Sun/Moon Icon */}
                <div
                    className="absolute top-0 left-0 transition-all duration-1000 ease-out flex flex-col items-center"
                    style={{
                        left: `${sunPos}%`,
                        top: `${50 - Math.sin(sunPos * Math.PI / 100) * 50}px`,
                        transform: 'translate(-50%, -50%)'
                    }}
                >
                    <div className={`p-1.5 rounded-full shadow-[0_0_15px_rgba(255,255,0,0.5)] transition-colors ${isNight ? 'bg-indigo-400 text-white' : 'bg-amber-400 text-white'}`}>
                        {isNight ? <Moon size={14} fill="currentColor" /> : <Sun size={14} fill="currentColor" />}
                    </div>
                    {!isClosed && <div className="w-0.5 h-8 bg-gradient-to-b from-white/20 to-transparent"></div>}
                </div>

                {/* Markers */}
                <div className="absolute bottom-0 left-0 text-[9px] text-slate-500 font-mono">{startStr}</div>
                <div className="absolute bottom-0 right-0 text-[9px] text-slate-500 font-mono">{endStr}</div>
            </div>
        </div>
    );
};

// --- MAIN FLEET MAP COMPONENT ---
const FleetMap = () => {
    const [techs, setTechs] = useState([]);
    const [selectedTech, setSelectedTech] = useState(null);
    const [mapInstance, setMapInstance] = useState(null);
    const [activeTechsCount, setActiveTechsCount] = useState(0);
    const [workingHours, setWorkingHours] = useState(null);

    // Initial Load & Realtime
    useEffect(() => {
        fetchFleetData();

        // 1. Tech Updates (Location/Status)
        const profileSub = supabase
            .channel('fleet-profile-updates')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => {
                fetchFleetData();
            })
            .subscribe();

        // 2. Ticket Updates (Workload)
        const ticketSub = supabase
            .channel('fleet-workload-updates')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'tickets' }, () => {
                fetchFleetData();
            })
            .subscribe();

        // 3. Heartbeat Timer (Refresh 'Active' status every minute)
        const heartbeat = setInterval(() => {
            fetchFleetData(); // Or just force re-render
        }, 60000);

        return () => {
            supabase.removeChannel(profileSub);
            supabase.removeChannel(ticketSub);
            clearInterval(heartbeat);
        };
    }, []);

    const fetchFleetData = async () => {
        // Parallel Fetch for efficiency
        const [profilesRes, configRes, ticketsRes] = await Promise.all([
            // 1. Techs
            supabase.from('profiles').select('id, full_name, avatar_url, current_lat, current_lng, last_location_update').eq('role', 'tech').eq('is_active', true),
            // 2. Config
            supabase.from('business_config').select('value').eq('key', 'working_hours').single(),
            // 3. Today's Workload
            supabase.from('tickets')
                .select('technician_id')
                .gte('scheduled_at', new Date(new Date().setHours(0, 0, 0, 0)).toISOString())
                .lte('scheduled_at', new Date(new Date().setHours(23, 59, 59, 999)).toISOString())
                .neq('status', 'cancelado')
        ]);

        if (configRes.data) setWorkingHours(configRes.data.value);

        const techData = profilesRes.data || [];
        const tickets = ticketsRes.data || [];

        // Merge Data
        const merged = techData.map(t => {
            const workload = tickets.filter(tk => tk.technician_id === t.id).length;

            // Calc Active Status (< 5 mins)
            let isActive = false;
            let lastUpdateDate = null;

            if (t.last_location_update) {
                lastUpdateDate = new Date(t.last_location_update);
                const now = new Date();
                const diffMins = (now - lastUpdateDate) / 1000 / 60;
                isActive = diffMins < 5;
            }

            return {
                technician_id: t.id,
                profiles: t, // Keep consistent struct for display
                latitude: t.current_lat || 36.7212, // User profile defaults
                longitude: t.current_lng || -4.4217,
                workload,
                isActive,
                lastUpdate: lastUpdateDate
            };
        });

        // Sort: Active first, then by workload
        merged.sort((a, b) => (b.isActive === a.isActive) ? b.workload - a.workload : b.isActive - a.isActive);

        setTechs(merged);
        setActiveTechsCount(merged.filter(m => m.isActive).length);
    };

    const handleTechClick = (loc) => {
        setSelectedTech(loc);
        if (mapInstance && loc.latitude) {
            mapInstance.panTo({ lat: loc.latitude, lng: loc.longitude });
            mapInstance.setZoom(14);
        }
    };

    // Default: Malaga Center
    const defaultCenter = { lat: 36.7212, lng: -4.4217 };

    return (
        <div className="flex flex-col lg:flex-row gap-4 h-[calc(100vh-140px)] min-h-[600px]">
            {/* RIGHT SIDEBAR (OPERATIONS) */}
            <div className="lg:order-2 w-full lg:w-1/3 xl:w-1/4 flex flex-col gap-4">
                {/* WIDGET */}
                <SolarClock workingHours={workingHours} />

                {/* TECH LIST */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex-1 flex flex-col overflow-hidden">
                    <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                        <h3 className="font-bold text-slate-700 flex items-center gap-2">
                            <User size={16} />
                            Fuerza de Campo
                        </h3>
                        <span className="text-xs font-bold bg-green-100 text-green-700 px-2 py-0.5 rounded-full border border-green-200">
                            {activeTechsCount} Activos
                        </span>
                    </div>

                    <div className="flex-1 overflow-y-auto p-2 space-y-2">
                        {techs.map(tech => (
                            <div
                                key={tech.technician_id}
                                onClick={() => handleTechClick(tech)}
                                className={`p-3 rounded-lg border transition-all cursor-pointer flex items-center justify-between group
                                    ${selectedTech?.technician_id === tech.technician_id
                                        ? 'bg-blue-50 border-blue-200 ring-1 ring-blue-300'
                                        : 'bg-white border-slate-100 hover:border-blue-200 hover:shadow-sm'
                                    }`}
                            >
                                <div className="flex items-center gap-3">
                                    <div className="relative">
                                        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm shadow-sm transition-colors
                                            ${tech.isActive ? 'bg-blue-600' : 'bg-slate-300 grayscale'}
                                        `}>
                                            {tech.profiles?.avatar_url ? (
                                                <img src={tech.profiles.avatar_url} className="w-full h-full rounded-full object-cover" />
                                            ) : (
                                                tech.profiles?.full_name?.[0] || 'T'
                                            )}
                                        </div>
                                        {/* Status Dot */}
                                        <div className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 border-2 border-white rounded-full ${tech.isActive ? 'bg-green-500 animate-pulse' : 'bg-slate-400'}`} />
                                    </div>
                                    <div>
                                        <h4 className={`text-sm font-bold ${tech.isActive ? 'text-slate-800' : 'text-slate-500'}`}>
                                            {tech.profiles?.full_name}
                                        </h4>
                                        <div className="flex items-center gap-2 text-[10px] text-slate-400">
                                            {tech.isActive ? (
                                                <span className="text-green-600 font-medium flex items-center gap-0.5">
                                                    <Signal size={10} /> Conectado
                                                </span>
                                            ) : (
                                                <span className="flex items-center gap-0.5">
                                                    <Clock size={10} /> {tech.lastUpdate ? formatDistanceToNow(tech.lastUpdate, { addSuffix: true, locale: es }) : 'Sin señal'}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Workload Badge */}
                                <div className="text-right">
                                    <div className={`text-xs font-black px-2 py-1 rounded-lg text-center min-w-[30px]
                                        ${tech.workload > 4 ? 'bg-red-100 text-red-600' :
                                            tech.workload > 0 ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-400'}
                                    `}>
                                        {tech.workload}
                                    </div>
                                    <span className="text-[9px] text-slate-400 uppercase tracking-tighter">Servicios</span>
                                </div>
                            </div>
                        ))}

                        {techs.length === 0 && (
                            <div className="text-center py-10 text-slate-400 text-xs">
                                No hay técnicos localizados.
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* LEFT MAP (75%) */}
            <div className="lg:order-1 flex-1 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden relative">
                <APIProvider apiKey={GOOGLE_MAPS_API_KEY}>
                    <Map
                        defaultCenter={defaultCenter}
                        defaultZoom={12}
                        mapId="FLEET_CONTROL_MAP"
                        fullscreenControl={false}
                        streetViewControl={false}
                        mapTypeControl={false}
                        onMapInit={({ map }) => setMapInstance(map)}
                    >
                        {techs.map(loc => (
                            <AdvancedMarker
                                key={loc.technician_id}
                                position={{ lat: loc.latitude, lng: loc.longitude }}
                                onClick={() => handleTechClick(loc)}
                            >
                                <div className="relative group">
                                    {/* Tooltip */}
                                    <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-slate-900/90 backdrop-blur text-white text-[10px] font-bold px-2 py-1 rounded shadow-lg opacity-0 group-hover:opacity-100 transition whitespace-nowrap z-20 pointer-events-none">
                                        {loc.profiles?.full_name}
                                    </div>

                                    {/* The Pin */}
                                    <div className={`w-8 h-8 rounded-full border-2 border-white shadow-xl flex items-center justify-center transform transition duration-300 hover:scale-125
                                        ${loc.isActive ? 'bg-blue-600' : 'bg-slate-400 grayscale'}
                                    `}>
                                        {loc.profiles?.avatar_url ? (
                                            <img src={loc.profiles.avatar_url} className="w-full h-full rounded-full object-cover" />
                                        ) : (
                                            <span className="text-white text-xs font-bold">{loc.profiles?.full_name?.[0]}</span>
                                        )}
                                    </div>

                                    {/* Radar Pulse */}
                                    {loc.isActive && (
                                        <div className="absolute top-0 left-0 w-8 h-8 bg-blue-500 rounded-full -z-10 animate-ping opacity-50"></div>
                                    )}
                                </div>
                            </AdvancedMarker>
                        ))}
                    </Map>
                </APIProvider>

                {/* Overlay Info */}
                <div className="absolute top-4 left-4 bg-white/90 backdrop-blur-sm p-3 rounded-xl shadow-lg border border-white/50 z-10 max-w-[200px]">
                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Estado GSM</h4>
                    <div className="flex items-center gap-2">
                        <div className="flex flex-col">
                            <span className="text-sm font-bold text-slate-700 flex items-center gap-2">
                                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                                {activeTechsCount} Online
                            </span>
                            <span className="text-[10px] text-slate-500">
                                {techs.length - activeTechsCount} Offline
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
export default FleetMap;
