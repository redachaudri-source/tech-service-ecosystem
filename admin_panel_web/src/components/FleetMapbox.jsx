import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { supabase } from '../lib/supabase';
import { User, Signal, Clock, Search, Map as MapIcon, Layers, ChevronLeft, ChevronRight, Zap, Navigation, Home, Store, Calendar, ArrowRight, Truck, GripVertical } from 'lucide-react';
import { formatDistanceToNow, format, startOfDay, endOfDay } from 'date-fns';
import { es } from 'date-fns/locale';
import { MAPBOX_TOKEN } from '../config/mapbox';

// Configure Mapbox token
mapboxgl.accessToken = MAPBOX_TOKEN;

/**
 * FleetMapbox - UBER STYLE EDITION
 * 
 * Aesthetic: Clean, Minimalist, White/Gray, Shadow-rich
 * Features:
 * - Light Map Navigation Style
 * - Floating White Cards
 * - Soft Animations
 * - 100% Spanish
 */
const FleetMapbox = () => {
    const mapContainerRef = useRef(null);
    const mapRef = useRef(null);
    const markersRef = useRef({});
    const routeMarkersRef = useRef([]);

    // State
    const [techs, setTechs] = useState([]);
    const [selectedTech, setSelectedTech] = useState(null);
    const [techItinerary, setTechItinerary] = useState([]);
    const [activeTechsCount, setActiveTechsCount] = useState(0);
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);

    // View Mode (Default to 2D for cleaner "App" feel)
    const [viewMode, setViewMode] = useState('2d');

    // -- MAP INITIALIZATION --
    useEffect(() => {
        if (!mapContainerRef.current) return;

        const map = new mapboxgl.Map({
            container: mapContainerRef.current,
            style: 'mapbox://styles/mapbox/navigation-day-v1', // Clean Uber style
            center: [-4.4214, 36.7213], // Málaga
            zoom: 12,
            pitch: 0, // Flat by default for clarity
            bearing: 0,
            projection: 'mercator', // Standard flat map
            attributionControl: false
        });

        // minimal UX
        map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'bottom-right');

        mapRef.current = map;
        return () => map.remove();
    }, []);

    // -- DATA FETCHING (Preserved Logic) --
    useEffect(() => {
        fetchFleetData();
        const sub = supabase.channel('fleet-uber').on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, fetchFleetData).subscribe();
        const interval = setInterval(fetchFleetData, 60000);
        return () => { supabase.removeChannel(sub); clearInterval(interval); };
    }, []);

    const fetchFleetData = async () => {
        const now = new Date();
        const start = startOfDay(now).toISOString();
        const end = endOfDay(now).toISOString();

        const [profilesRes, ticketsRes] = await Promise.all([
            supabase.from('profiles').select('id, full_name, avatar_url, current_lat, current_lng, last_location_update').eq('role', 'tech').eq('is_active', true),
            supabase.from('tickets')
                .select(`id, technician_id, status, scheduled_at, title, appliance_type, clients ( full_name, address, latitude, longitude )`)
                .gte('scheduled_at', start).lte('scheduled_at', end)
                .neq('status', 'cancelado')
        ]);

        const allTickets = ticketsRes.data || [];

        const merged = (profilesRes.data || []).map(t => {
            const myTickets = allTickets.filter(tk => tk.technician_id === t.id);
            const workload = myTickets.filter(tk => tk.status !== 'completado').length;

            let isActive = false;
            // 20 min active window
            if (t.last_location_update) {
                const diff = (new Date() - new Date(t.last_location_update)) / 1000 / 60;
                isActive = diff < 20;
            }

            return {
                ...t, technician_id: t.id, workload, allTickets: myTickets, isActive,
                lastUpdate: t.last_location_update ? new Date(t.last_location_update) : null,
                latitude: t.current_lat || 36.7212, longitude: t.current_lng || -4.4217,
            };
        });

        merged.sort((a, b) => b.isActive - a.isActive);
        setTechs(merged);
        setActiveTechsCount(merged.filter(m => m.isActive).length);
        updateMarkers(merged);

        if (selectedTech) {
            const updated = merged.find(t => t.id === selectedTech.id);
            if (updated) {
                const sorted = [...updated.allTickets].sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at));
                setTechItinerary(sorted);
                drawRoutesAndStops(updated, sorted);
            }
        }
    };

    // -- RENDERERS --
    const updateMarkers = (list) => {
        if (!mapRef.current) return;

        list.forEach(tech => {
            let marker = markersRef.current[tech.id];

            // Minimalist Tech Marker (Black Car/Puck style)
            const html = `
                <div class="relative group cursor-pointer hover:z-50 transition-transform duration-300">
                    <div class="absolute -inset-3 bg-black/5 rounded-full blur-sm"></div>
                    
                    <div class="relative w-12 h-12 bg-white rounded-full p-1 shadow-lg border border-gray-200 transition-transform hover:scale-110 flex items-center justify-center">
                         <div class="w-full h-full rounded-full overflow-hidden bg-gray-100">
                             ${tech.avatar_url
                    ? `<img src="${tech.avatar_url}" class="w-full h-full object-cover" />`
                    : `<span class="flex items-center justify-center h-full text-gray-800 font-bold">${tech.full_name[0]}</span>`
                }
                         </div>
                    </div>

                    <!-- Online Dot -->
                    <div class="absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full border-2 border-white ${tech.isActive ? 'bg-green-500' : 'bg-gray-300'}"></div>
                    
                    <!-- Floating Pill Badge (Tasks) -->
                    ${tech.workload > 0 ? `
                        <div class="absolute -top-3 left-1/2 -translate-x-1/2 bg-black text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-lg whitespace-nowrap">
                            ${tech.workload}
                        </div>
                    ` : ''}
                </div>
            `;

            if (!marker) {
                const el = document.createElement('div');
                el.innerHTML = html;
                marker = new mapboxgl.Marker({ element: el }).setLngLat([tech.longitude, tech.latitude]).addTo(mapRef.current);
                el.addEventListener('click', (e) => { e.stopPropagation(); handleTechSelect(tech); });
                markersRef.current[tech.id] = marker;
            } else {
                marker.setLngLat([tech.longitude, tech.latitude]);
                marker.getElement().innerHTML = html;
            }
        });
    };

    const handleTechSelect = (tech) => {
        setSelectedTech(tech);
        setIsSidebarOpen(true);
        const sorted = [...tech.allTickets].sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at));
        setTechItinerary(sorted);

        mapRef.current.flyTo({ center: [tech.longitude, tech.latitude], zoom: 14, pitch: 0, duration: 1500 });
        drawRoutesAndStops(tech, sorted);
    };

    const drawRoutesAndStops = async (tech, tickets) => {
        if (!mapRef.current) return;

        // Cleanup
        if (mapRef.current.getLayer('route-line')) mapRef.current.removeLayer('route-line');
        if (mapRef.current.getSource('route-source')) mapRef.current.removeSource('route-source');
        if (mapRef.current.getLayer('route-arrows')) mapRef.current.removeLayer('route-arrows');
        routeMarkersRef.current.forEach(m => m.remove());
        routeMarkersRef.current = [];

        // Draw Destinations (Clean black pins)
        tickets.forEach(t => {
            if (!t.clients?.latitude) return;
            const isNext = t.status === 'en_camino' || t.status === 'en_proceso';
            const isDone = t.status === 'completado';

            const el = document.createElement('div');
            el.innerHTML = `
                <div class="relative group hover:z-50">
                    <!-- Tooltip -->
                    <div class="absolute -top-8 left-1/2 -translate-x-1/2 bg-white text-gray-800 px-3 py-1 rounded-lg text-xs font-bold shadow-xl opacity-0 group-hover:opacity-100 transition-all pointer-events-none whitespace-nowrap z-50 border border-gray-100">
                        ${t.clients.full_name}
                    </div>
                    
                    <div class="w-4 h-4 rounded-full border-2 border-white shadow-md transition-transform hover:scale-125
                        ${isNext ? 'bg-black w-5 h-5' : isDone ? 'bg-green-500' : 'bg-gray-400'}
                    "></div>
                </div>
            `;
            const marker = new mapboxgl.Marker({ element: el }).setLngLat([t.clients.longitude, t.clients.latitude]).addTo(mapRef.current);
            routeMarkersRef.current.push(marker);
        });

        // Route Line (Black/Gray)
        const activeJob = tickets.find(t => t.status === 'en_camino') || tickets.find(t => t.status === 'asignado');
        if (activeJob?.clients?.latitude && tech.longitude) {
            try {
                const query = await fetch(`https://api.mapbox.com/directions/v5/mapbox/driving/${tech.longitude},${tech.latitude};${activeJob.clients.longitude},${activeJob.clients.latitude}?steps=true&geometries=geojson&access_token=${mapboxgl.accessToken}`);
                const json = await query.json();
                const route = json.routes?.[0]?.geometry?.coordinates;
                if (route) {
                    mapRef.current.addSource('route-source', { 'type': 'geojson', 'data': { 'type': 'Feature', 'geometry': { 'type': 'LineString', 'coordinates': route } } });
                    mapRef.current.addLayer({ 'id': 'route-line', 'type': 'line', 'source': 'route-source', 'layout': { 'line-join': 'round', 'line-cap': 'round' }, 'paint': { 'line-color': '#111827', 'line-width': 4, 'line-opacity': 0.8 } });
                }
            } catch (e) { console.error(e); }
        }
    };

    return (
        <div className="relative w-full h-[calc(100vh-80px)] overflow-hidden bg-gray-50 text-gray-800 font-sans flex text-sm">

            {/* --- MAP --- */}
            <div className="flex-1 relative">
                <div ref={mapContainerRef} className="absolute inset-0 z-0" />

                {/* Minimal Controls */}
                <div className="absolute top-6 right-6 flex flex-col gap-2 z-20">
                    <button onClick={() => fetchFleetData()} className="w-10 h-10 flex items-center justify-center bg-white text-gray-600 rounded-full shadow-lg border border-gray-100 hover:bg-gray-50 transition-all active:scale-95"><Signal size={18} /></button>
                </div>
            </div>

            {/* --- SIDEBAR (UBER STYLE) --- */}
            <div className={`
                absolute top-4 left-4 bottom-4 z-30 transition-transform duration-300 ease-[cubic-bezier(0.25,1,0.5,1)]
                ${isSidebarOpen ? 'translate-x-0' : '-translate-x-[120%]'}
                w-[380px] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-gray-100
            `}>
                {/* Header */}
                <div className="p-5 border-b border-gray-100 bg-white sticky top-0 z-10">
                    <div className="flex justify-between items-center mb-4">
                        <h1 className="text-xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
                            Fuerza de Campo
                        </h1>
                        <button onClick={() => setIsSidebarOpen(false)} className="p-2 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-full transition-colors"><ChevronLeft size={20} /></button>
                    </div>

                    {selectedTech ? (
                        /* PROFILE CARD (CLEAN) */
                        <div className="animate-in fade-in slide-in-from-left-2 duration-300">
                            <div className="flex items-center gap-4">
                                <div className="relative">
                                    <div className="w-14 h-14 rounded-full border border-gray-100 overflow-hidden bg-gray-50">
                                        <img src={selectedTech.avatar_url} className="w-full h-full object-cover" />
                                    </div>
                                    <div className={`absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full border-2 border-white ${selectedTech.isActive ? 'bg-green-500' : 'bg-gray-300'}`}></div>
                                </div>
                                <div>
                                    <h2 className="text-lg font-bold text-gray-900 leading-tight">{selectedTech.full_name}</h2>
                                    <div className="flex items-center gap-2 text-xs text-gray-500 mt-0.5">
                                        <Truck size={12} />
                                        {selectedTech.isActive ? <span className="text-green-600 font-medium">En ruta</span> : <span>Desconectado</span>}
                                    </div>
                                </div>
                            </div>
                            <button onClick={() => setSelectedTech(null)} className="mt-4 w-full py-2.5 text-xs text-gray-500 font-medium hover:text-gray-900 hover:bg-gray-50 rounded-lg transition-colors border border-transparent hover:border-gray-200">
                                ← Ver todos los técnicos
                            </button>
                        </div>
                    ) : (
                        /* STATS ROW */
                        <div className="flex gap-3">
                            <div className="flex-1 bg-gray-50/80 p-3 rounded-xl border border-gray-100">
                                <div className="text-2xl font-bold text-gray-900 mb-0.5">{activeTechsCount}</div>
                                <div className="text-[10px] font-bold text-green-600 uppercase tracking-wide">Activos</div>
                            </div>
                            <div className="flex-1 bg-gray-50/80 p-3 rounded-xl border border-gray-100">
                                <div className="text-2xl font-bold text-gray-400 mb-0.5">{techs.length}</div>
                                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Total</div>
                            </div>
                        </div>
                    )}
                </div>

                {/* List Container */}
                <div className="flex-1 overflow-y-auto custom-scrollbar bg-white p-2">
                    {selectedTech ? (
                        /* TIMELINE (CLEAN LINE) */
                        <div className="px-3 pt-2">
                            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-6 pl-2">Itinerario de Hoy</h3>

                            <div className="relative pl-5 border-l-2 border-dashed border-gray-100 space-y-8 pb-8">
                                {techItinerary.map((t, idx) => {
                                    const isDone = t.status === 'completado';
                                    const isActive = t.status === 'en_camino' || t.status === 'en_proceso';

                                    return (
                                        <div key={t.id} className="relative pl-6">
                                            {/* Dot */}
                                            <div className={`
                                                absolute -left-[9px] top-4 w-4 h-4 rounded-full border-2 border-white shadow-sm z-10
                                                ${isDone ? 'bg-green-500' : isActive ? 'bg-black scale-110' : 'bg-gray-300'}
                                            `}></div>

                                            <div className={`
                                                p-4 rounded-xl border transition-all duration-200
                                                ${isActive ? 'bg-black text-white shadow-lg scale-[1.02] border-black' : 'bg-white border-gray-100 hover:border-gray-300'}
                                            `}>
                                                <div className="flex justify-between items-start mb-2">
                                                    <span className={`text-lg font-bold ${isActive ? 'text-white' : 'text-gray-900'}`}>{format(new Date(t.scheduled_at), 'HH:mm')}</span>
                                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${isDone ? 'bg-green-100 text-green-700' : isActive ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'}`}>
                                                        {t.status.replace('_', ' ')}
                                                    </span>
                                                </div>

                                                <div className={`font-medium text-sm mb-1 ${isActive ? 'text-gray-100' : 'text-gray-700'}`}>{t.clients?.full_name}</div>
                                                <div className={`text-xs flex items-center gap-1.5 ${isActive ? 'text-gray-400' : 'text-gray-400'}`}>
                                                    <Home size={12} /> {t.clients?.address}
                                                </div>
                                            </div>
                                        </div>
                                    )
                                })}
                                {techItinerary.length === 0 && <div className="pl-6 text-gray-400 text-xs italic">Sin itinerario hoy.</div>}
                            </div>
                        </div>
                    ) : (
                        /* ROSTER LIST (CLEAN) */
                        <div className="space-y-2">
                            {techs.map(tech => (
                                <div key={tech.id} onClick={() => handleTechSelect(tech)}
                                    className="group p-3 rounded-xl hover:bg-gray-50 border border-transparent hover:border-gray-100 cursor-pointer transition-all flex items-center gap-4"
                                >
                                    <div className="relative">
                                        <div className="w-10 h-10 rounded-full bg-gray-200 overflow-hidden">
                                            {tech.avatar_url ? <img src={tech.avatar_url} className="w-full h-full object-cover" /> : <span className="flex items-center justify-center h-full text-gray-500 font-bold">{tech.full_name[0]}</span>}
                                        </div>
                                        {tech.isActive && <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 border-2 border-white rounded-full"></div>}
                                    </div>

                                    <div className="flex-1 min-w-0">
                                        <div className="flex justify-between items-center">
                                            <h4 className="font-bold text-gray-900 truncate">{tech.full_name}</h4>
                                            {tech.workload > 0 && <span className="text-[10px] font-bold bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{tech.workload}</span>}
                                        </div>
                                        <div className="text-xs text-gray-400 mt-0.5">
                                            {tech.isActive ? 'Conectado' : `Visto hace ${formatDistanceToNow(tech.lastUpdate || new Date(), { locale: es })}`}
                                        </div>
                                    </div>
                                    <ChevronRight size={16} className="text-gray-300 group-hover:text-gray-600 transition-colors" />
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Footer Input */}
                <div className="p-4 border-t border-gray-100 bg-gray-50/50">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                        <input type="text" placeholder="Buscar..." className="w-full bg-white border border-gray-200 rounded-lg pl-10 pr-4 py-2.5 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:border-black focus:ring-1 focus:ring-black/5 transition-all shadow-sm" />
                    </div>
                </div>
            </div>

            {/* Floating Toggle */}
            {!isSidebarOpen && (
                <button onClick={() => setIsSidebarOpen(true)} className="absolute top-6 left-6 z-40 bg-white text-gray-900 p-3 rounded-full shadow-xl hover:scale-105 transition-all">
                    <GripVertical size={20} />
                </button>
            )}

            <style>{`.custom-scrollbar::-webkit-scrollbar { width: 4px; } .custom-scrollbar::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 4px; } .mapboxgl-ctrl-group { border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); border: none; }`}</style>
        </div>
    );
};

export default FleetMapbox;
