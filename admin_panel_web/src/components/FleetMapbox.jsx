import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { supabase } from '../lib/supabase';
import { User, Signal, Clock, Search, Map as MapIcon, Layers, ChevronLeft, ChevronRight, Zap, Navigation, Home, Store, Calendar, ArrowRight } from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import { es } from 'date-fns/locale';
import { MAPBOX_TOKEN } from '../config/mapbox';

// Configure Mapbox token
mapboxgl.accessToken = MAPBOX_TOKEN;

/**
 * FleetMapbox - Enterprise Edition
 * 
 * Features:
 * - Live Tech Tracking with Route Prediction (Directions API)
 * - Daily Itinerary Visualization (Timeline)
 * - Smart Workload Analysis (Strict Date Filtering)
 * - Premium Glassmorphism UI
 */
const FleetMapbox = () => {
    const mapContainerRef = useRef(null);
    const mapRef = useRef(null);
    const markersRef = useRef({}); // Tech markers
    const routeMarkersRef = useRef([]); // Destination markers (Houses)

    const [techs, setTechs] = useState([]);
    const [selectedTech, setSelectedTech] = useState(null);
    const [techItinerary, setTechItinerary] = useState([]); // Stores tickets for selected tech
    const [activeTechsCount, setActiveTechsCount] = useState(0);
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);
    const [viewMode, setViewMode] = useState('3d');

    // -- INITIALIZATION --
    useEffect(() => {
        if (!mapContainerRef.current) return;

        const map = new mapboxgl.Map({
            container: mapContainerRef.current,
            style: 'mapbox://styles/mapbox/dark-v11',
            center: [-4.4214, 36.7213], // Málaga
            zoom: 12,
            pitch: 50,
            bearing: -10,
            projection: 'globe'
        });

        // Add 3D Fog and Atmosphere
        map.on('style.load', () => {
            map.setFog({
                'color': 'rgb(186, 210, 235)', // Lower atmosphere
                'high-color': 'rgb(36, 92, 223)', // Upper atmosphere
                'horizon-blend': 0.02, // Atmosphere thickness (default 0.2 at low zooms)
                'space-color': 'rgb(11, 11, 25)', // Background color
                'star-intensity': 0.6 // Background star brightness (default 0.35 at low zoooms )
            });
            add3DBuildings(map);
        });

        map.addControl(new mapboxgl.NavigationControl(), 'top-right');
        mapRef.current = map;

        return () => map.remove();
    }, []);

    // -- DATA FETCHING --
    useEffect(() => {
        fetchFleetData();
        const sub = supabase.channel('fleet-v2').on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, fetchFleetData).subscribe();
        const interval = setInterval(fetchFleetData, 60000); // 1 min update used to be 30s
        return () => { supabase.removeChannel(sub); clearInterval(interval); };
    }, []);

    // 🔴 CORE DATA LOGIC 🔴
    const fetchFleetData = async () => {
        // Strict Local Time "Today"
        const now = new Date();
        const todayStr = now.toISOString().split('T')[0]; // YYYY-MM-DD

        const [profilesRes, ticketsRes] = await Promise.all([
            supabase.from('profiles')
                .select('id, full_name, avatar_url, current_lat, current_lng, last_location_update')
                .eq('role', 'tech')
                .eq('is_active', true),
            // Fetch FULL ticket details including clients
            supabase.from('tickets')
                .select(`
                    id, technician_id, status, scheduled_at, title, appliance_type,
                    clients ( full_name, address, city, latitude, longitude )
                `)
                .gte('scheduled_at', `${todayStr}T00:00:00`)
                .lte('scheduled_at', `${todayStr}T23:59:59`)
                .neq('status', 'cancelado')
        ]);

        const allTickets = ticketsRes.data || [];

        const merged = (profilesRes.data || []).map(t => {
            // Filter tickets for this tech
            const myTickets = allTickets.filter(tk => tk.technician_id === t.id);

            // Workload = Count active (not completed/cancelled)
            const activeWorkload = myTickets.filter(tk => tk.status !== 'completado').length;

            let isActive = false;
            // "Active" if location updated in last 15 mins (more lenient)
            if (t.last_location_update) {
                const diff = (new Date() - new Date(t.last_location_update)) / 1000 / 60;
                isActive = diff < 15;
            }

            return {
                ...t,
                technician_id: t.id,
                workload: activeWorkload, // FIXED: Now strictly counts pending tasks
                allTickets: myTickets,    // Store all daily tickets for timeline
                isActive,
                lastUpdate: t.last_location_update ? new Date(t.last_location_update) : null,
                latitude: t.current_lat || 36.7212,
                longitude: t.current_lng || -4.4217,
            };
        });

        merged.sort((a, b) => b.isActive - a.isActive);
        setTechs(merged);
        setActiveTechsCount(merged.filter(m => m.isActive).length);
        updateMarkers(merged);

        // Update selected tech if exists (for itinerary refresh)
        if (selectedTech) {
            const updated = merged.find(t => t.id === selectedTech.id);
            if (updated) handleTechSelect(updated, false); // Don't fly on update
        }
    };

    // -- VISUALIZATION LOGIC --

    const updateMarkers = (list) => {
        if (!mapRef.current) return;

        list.forEach(tech => {
            const el = document.createElement('div');
            el.className = `tech-marker-${tech.id}`;

            // Render Tech Marker
            if (markersRef.current[tech.id]) {
                const marker = markersRef.current[tech.id];
                marker.setLngLat([tech.longitude, tech.latitude]);
                // Update badge content dynamically if needed
                const badge = marker.getElement().querySelector('.workload-badge');
                if (badge) {
                    badge.innerText = `${tech.workload} Tareas`;
                    badge.style.display = tech.workload > 0 ? 'flex' : 'none';
                }
            } else {
                el.innerHTML = `
                    <div class="relative group cursor-pointer hover:z-50">
                        <!-- Pulse -->
                        <div class="pointer-events-none absolute -inset-6 rounded-full blur-xl bg-blue-500/20 ${tech.isActive ? 'animate-pulse' : 'hidden'}"></div>
                        
                        <!-- Avatar Container -->
                        <div class="relative w-12 h-12 rounded-full border-2 border-white shadow-2xl flex items-center justify-center overflow-hidden bg-slate-800 transition-transform hover:scale-110 duration-300">
                             ${tech.avatar_url
                        ? `<img src="${tech.avatar_url}" class="w-full h-full object-cover" />`
                        : `<span class="text-white font-bold text-lg">${tech.full_name[0]}</span>`
                    }
                        </div>

                        <!-- Status Indicator -->
                        <div class="absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-white ${tech.isActive ? 'bg-emerald-500' : 'bg-slate-400'}"></div>

                        <!-- Pill Badge (Workload) -->
                        <div class="workload-badge absolute -top-8 left-1/2 -translate-x-1/2 bg-slate-900/90 text-white text-[10px] font-bold px-2 py-1 rounded-full border border-white/20 shadow-lg whitespace-nowrap flex items-center gap-1 ${tech.workload > 0 ? 'flex' : 'hidden'}">
                             ${tech.workload} Tareas
                        </div>
                    </div>
                `;

                const marker = new mapboxgl.Marker({ element: el })
                    .setLngLat([tech.longitude, tech.latitude])
                    .addTo(mapRef.current);

                el.addEventListener('click', () => handleTechSelect(tech, true));
                markersRef.current[tech.id] = marker;
            }
        });
    };

    // Selecting a Tech -> Show Route & Timeline
    const handleTechSelect = async (tech, shouldFly = true) => {
        setSelectedTech(tech);
        setIsSidebarOpen(true);

        // Sort Itinerary: active/en_camino first, then by time
        const sortedTickets = [...tech.allTickets].sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at));
        setTechItinerary(sortedTickets);

        if (shouldFly && mapRef.current) {
            mapRef.current.flyTo({ center: [tech.longitude, tech.latitude], zoom: 14, duration: 2000 });
        }

        // Draw Route & Destinations
        drawRoutesAndStops(tech, sortedTickets);
    };

    const drawRoutesAndStops = async (tech, tickets) => {
        if (!mapRef.current) return;

        // 1. Clear previous routes/markers
        if (mapRef.current.getLayer('route-line')) mapRef.current.removeLayer('route-line');
        if (mapRef.current.getSource('route-source')) mapRef.current.removeSource('route-source');
        routeMarkersRef.current.forEach(m => m.remove());
        routeMarkersRef.current = [];

        // 2. Identify "Current/Next" Job for Routing
        // We look for 'en_camino' or the first 'asignado'
        const nextJob = tickets.find(t => t.status === 'en_camino') || tickets.find(t => t.status === 'asignado' || t.status === 'pendiente');

        // 3. Draw Destinations (Casitas)
        tickets.forEach(t => {
            if (!t.clients?.latitude) return; // Skip if no geo

            const isNext = nextJob?.id === t.id;
            const isCompleted = t.status === 'completado';

            const el = document.createElement('div');
            // Custom SVG Marker
            el.innerHTML = `
                <div class="relative group">
                    <div class="absolute -inset-2 bg-blue-500/30 rounded-full blur-md ${isNext ? 'animate-pulse' : 'hidden'}"></div>
                    <div class="relative w-8 h-8 flex items-center justify-center bg-white rounded-full shadow-lg border-2 ${isNext ? 'border-blue-500 scale-110' : isCompleted ? 'border-emerald-500 opacity-60' : 'border-slate-400'} transition-all hover:scale-125 hover:z-50">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${isCompleted ? '#10b981' : '#334155'}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                            <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                            <polyline points="9 22 9 12 15 12 15 22"/>
                        </svg>
                    </div>
                    
                    <!-- Tooltip Hover -->
                    <div class="absolute -top-12 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-3 py-2 rounded-lg text-xs opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50 pointer-events-none shadow-xl border border-white/10">
                        <div class="font-bold">${t.clients.full_name}</div>
                        <div class="text-slate-400">${t.appliance_type} • ${format(new Date(t.scheduled_at), 'HH:mm')}</div>
                        <div class="absolute bottom-[-6px] left-1/2 -translate-x-1/2 w-3 h-3 bg-slate-900 rotate-45"></div>
                    </div>
                </div>
            `;

            const marker = new mapboxgl.Marker({ element: el })
                .setLngLat([t.clients.longitude, t.clients.latitude])
                .addTo(mapRef.current);

            routeMarkersRef.current.push(marker);
        });

        // 4. Draw Route Path (Only if we have a next job & tech location)
        if (nextJob?.clients?.latitude && tech.longitude) {
            try {
                // Fetch Route from Mapbox Directions API
                const query = await fetch(
                    `https://api.mapbox.com/directions/v5/mapbox/driving/${tech.longitude},${tech.latitude};${nextJob.clients.longitude},${nextJob.clients.latitude}?steps=true&geometries=geojson&access_token=${mapboxgl.accessToken}`
                );
                const json = await query.json();
                const data = json.routes[0];
                const route = data.geometry.coordinates;

                // Add Path to Map
                mapRef.current.addSource('route-source', {
                    'type': 'geojson',
                    'data': {
                        'type': 'Feature',
                        'properties': {},
                        'geometry': {
                            'type': 'LineString',
                            'coordinates': route
                        }
                    }
                });

                mapRef.current.addLayer({
                    'id': 'route-line',
                    'type': 'line',
                    'source': 'route-source',
                    'layout': {
                        'line-join': 'round',
                        'line-cap': 'round'
                    },
                    'paint': {
                        'line-color': '#3b82f6', // Corporate Blue
                        'line-width': 5,
                        'line-opacity': 0.8
                    }
                });

                // Add "Road Dashes" animation layer (Optional polish)
                mapRef.current.addLayer({
                    'id': 'route-arrows',
                    'type': 'symbol',
                    'source': 'route-source',
                    'layout': {
                        'symbol-placement': 'line',
                        'text-field': '▶',
                        'text-size': 12,
                        'symbol-spacing': 50,
                        'text-keep-upright': false
                    },
                    'paint': {
                        'text-color': '#ffffff',
                        'text-halo-color': '#3b82f6',
                        'text-halo-width': 2
                    }
                });

            } catch (error) {
                console.error("Routing error:", error);
            }
        }
    };

    // Helper: Add 3D buildings (for aesthetics)
    const add3DBuildings = (map) => {
        if (map.getLayer('3d-buildings')) return;
        const layers = map.getStyle().layers;
        const labelLayerId = layers.find(l => l.type === 'symbol' && l.layout['text-field'])?.id;
        map.addLayer({
            'id': '3d-buildings',
            'source': 'composite',
            'source-layer': 'building',
            'filter': ['==', 'extrude', 'true'],
            'type': 'fill-extrusion',
            'minzoom': 15,
            'paint': {
                'fill-extrusion-color': '#111827',
                'fill-extrusion-height': ['interpolate', ['linear'], ['zoom'], 15, 0, 15.05, ['get', 'height']],
                'fill-extrusion-base': ['interpolate', ['linear'], ['zoom'], 15, 0, 15.05, ['get', 'min_height']],
                'fill-extrusion-opacity': 0.8
            }
        }, labelLayerId);
    };

    return (
        <div className="relative w-full h-[calc(100vh-80px)] overflow-hidden bg-slate-950 flex">

            {/* --- MAP CONTAINER --- */}
            <div className="flex-1 relative">
                <div ref={mapContainerRef} className="absolute inset-0 z-0 h-full w-full" />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/20 via-transparent to-transparent pointer-events-none z-10" />

                {/* Manual Controls */}
                <div className="absolute top-4 right-14 bg-slate-900/80 backdrop-blur border border-white/10 rounded-lg flex flex-col p-1 gap-1 z-20">
                    <button
                        onClick={() => {
                            if (!mapRef.current) return;
                            const is3d = viewMode === '3d';
                            mapRef.current.setStyle(is3d ? 'mapbox://styles/mapbox/satellite-streets-v12' : 'mapbox://styles/mapbox/dark-v11');
                            setViewMode(is3d ? 'satellite' : '3d');
                            mapRef.current.once('style.load', () => !is3d && add3DBuildings(mapRef.current));
                        }}
                        className="p-2 hover:bg-white/10 rounded text-white"
                        title="Cambiar Vista">
                        <Layers size={20} />
                    </button>
                    <button
                        onClick={() => fetchFleetData()}
                        className="p-2 hover:bg-white/10 rounded text-blue-400"
                        title="Actualizar Datos">
                        <Signal size={20} />
                    </button>
                </div>
            </div>

            {/* --- SIDEBAR --- */}
            <div className={`
                absolute top-0 bottom-0 left-0 z-30 transition-all duration-300 ease-in-out
                ${isSidebarOpen ? 'w-[400px] translate-x-0' : 'w-0 -translate-x-full'}
                bg-slate-900/90 backdrop-blur-xl border-r border-white/10 shadow-2xl flex flex-col
            `}>
                {/* Header */}
                <div className="p-6 border-b border-white/5 bg-white/5">
                    <div className="flex justify-between items-center mb-4">
                        <h2 className="text-xl font-bold text-white flex items-center gap-2">
                            <MapIcon className="text-blue-500" /> Control de Flota
                        </h2>
                        <button onClick={() => setIsSidebarOpen(false)} className="p-1 hover:bg-white/10 rounded-full text-slate-400">
                            <ChevronLeft />
                        </button>
                    </div>

                    {/* Selected Tech Detail View */}
                    {selectedTech ? (
                        <div className="animate-in fade-in slide-in-from-left-4 duration-300">
                            <div className="flex items-center gap-4 mb-4">
                                <img src={selectedTech.avatar_url} className="w-16 h-16 rounded-full border-2 border-white/20 shadow-lg object-cover" />
                                <div>
                                    <h3 className="text-lg font-bold text-white">{selectedTech.full_name}</h3>
                                    <div className="flex items-center gap-2 text-sm mt-1">
                                        {/* DYNAMIC STATUS TEXT */}
                                        {selectedTech.allTickets.find(t => t.status === 'en_camino') ? (
                                            <span className="text-blue-400 font-medium flex items-center gap-1">
                                                <Navigation size={14} className="animate-pulse" /> En camino al cliente
                                            </span>
                                        ) : selectedTech.allTickets.find(t => t.status === 'en_proceso') ? (
                                            <span className="text-emerald-400 font-medium flex items-center gap-1">
                                                <Zap size={14} /> Trabajando...
                                            </span>
                                        ) : (
                                            <span className="text-slate-400 flex items-center gap-1">
                                                <Signal size={14} /> Localizando...
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                            <button onClick={() => setSelectedTech(null)} className="text-xs text-slate-400 hover:text-white underline mb-2">
                                ← Volver a lista general
                            </button>
                        </div>
                    ) : (
                        // General Summary
                        <div className="flex gap-3">
                            <div className="flex-1 bg-white/5 p-3 rounded-lg border border-white/5">
                                <div className="text-2xl font-bold text-white">{activeTechsCount}</div>
                                <div className="text-xs text-slate-400 uppercase font-bold tracking-wider">Online</div>
                            </div>
                            <div className="flex-1 bg-white/5 p-3 rounded-lg border border-white/5">
                                <div className="text-2xl font-bold text-slate-200">{techs.length}</div>
                                <div className="text-xs text-slate-500 uppercase font-bold tracking-wider">Total</div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Content Area */}
                <div className="flex-1 overflow-y-auto custom-scrollbar p-4">
                    {selectedTech ? (
                        // --- DETAIL VIEW: TIMELINE ---
                        <div className="space-y-6">
                            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4">Itinerario de Hoy</h4>
                            <div className="relative pl-4 border-l-2 border-slate-700 space-y-8">
                                {techItinerary.length === 0 ? (
                                    <div className="text-slate-500 text-sm italic py-4">Sin tareas asignadas para hoy.</div>
                                ) : (
                                    techItinerary.map((ticket, idx) => {
                                        const isCompleted = ticket.status === 'completado';
                                        const isCurrent = ticket.status === 'en_camino' || ticket.status === 'en_proceso';

                                        return (
                                            <div key={ticket.id} className="relative group pl-6">
                                                {/* Timeline Dot */}
                                                <div className={`
                                                    absolute -left-[9px] top-0 w-4 h-4 rounded-full border-2 
                                                    ${isCompleted ? 'bg-emerald-500 border-emerald-900' : isCurrent ? 'bg-blue-500 border-blue-900 animate-pulse' : 'bg-slate-800 border-slate-600'}
                                                `}></div>

                                                <div className={`p-4 rounded-xl border transition-all ${isCurrent ? 'bg-blue-900/20 border-blue-500/50' : 'bg-white/5 border-transparent hover:bg-white/10'}`}>
                                                    <div className="flex justify-between items-start mb-2">
                                                        <span className="text-xs font-mono text-slate-400 bg-white/5 px-1.5 py-0.5 rounded">{format(new Date(ticket.scheduled_at), 'HH:mm')}</span>
                                                        <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${isCompleted ? 'bg-emerald-500/20 text-emerald-400' : isCurrent ? 'bg-blue-500/20 text-blue-400' : 'bg-slate-700 text-slate-400'}`}>
                                                            {ticket.status.replace('_', ' ')}
                                                        </span>
                                                    </div>
                                                    <h5 className="font-bold text-white text-sm mb-1">{ticket.clients?.full_name || 'Cliente Desconocido'}</h5>
                                                    <div className="text-xs text-slate-400 flex items-center gap-1 mb-2">
                                                        <Home size={12} />
                                                        {ticket.clients?.address || 'Dirección no disponible'}
                                                    </div>
                                                    <div className="flex items-center gap-2 text-xs text-slate-300 bg-black/20 p-2 rounded">
                                                        <Store size={12} className="text-amber-500" />
                                                        {ticket.appliance_type}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </div>
                    ) : (
                        // --- LIST VIEW: ALL TECHS ---
                        <div className="space-y-3">
                            {techs.map(tech => (
                                <div
                                    key={tech.id}
                                    onClick={() => handleTechSelect(tech)}
                                    className="p-4 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 hover:border-blue-500/30 transition-all cursor-pointer group"
                                >
                                    <div className="flex items-center gap-4">
                                        <div className="relative">
                                            <div className="w-12 h-12 rounded-full bg-slate-800 overflow-hidden">
                                                {tech.avatar_url ? <img src={tech.avatar_url} className="w-full h-full object-cover" /> : <span className="flex text-lg h-full items-center justify-center font-bold text-slate-500">{tech.full_name[0]}</span>}
                                            </div>
                                            <div className={`absolute -bottom-1 -right-1 w-3 h-3 rounded-full border-2 border-slate-900 ${tech.isActive ? 'bg-emerald-500' : 'bg-slate-500'}`}></div>
                                        </div>
                                        <div className="flex-1">
                                            <div className="flex justify-between items-center mb-1">
                                                <h4 className="font-bold text-white group-hover:text-blue-400 transition-colors">{tech.full_name}</h4>

                                                {/* FIXED BADGE */}
                                                {tech.workload > 0 && (
                                                    <span className="flex items-center gap-1 text-[10px] font-bold bg-blue-600/20 text-blue-300 px-2 py-0.5 rounded border border-blue-500/20">
                                                        {tech.workload} Tareas
                                                    </span>
                                                )}
                                            </div>
                                            <div className="text-xs text-slate-500 flex items-center gap-2">
                                                {tech.isActive ? <span className="text-emerald-500">Online</span> : <span>{tech.lastUpdate ? formatDistanceToNow(tech.lastUpdate, { addSuffix: true, locale: es }) : 'Offline'}</span>}
                                            </div>
                                        </div>
                                        <ArrowRight size={16} className="text-slate-600 group-hover:text-white transition-colors" />
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Footer Search */}
                <div className="p-4 border-t border-white/5 bg-white/5">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                        <input type="text" placeholder="Filtrar..." className="w-full bg-slate-900 border border-white/10 rounded-lg pl-10 pr-4 py-3 text-sm text-white focus:border-blue-500 focus:outline-none placeholder-slate-600" />
                    </div>
                </div>
            </div>

            {/* Toggle Sidebar Button (When closed) */}
            {!isSidebarOpen && (
                <button
                    onClick={() => setIsSidebarOpen(true)}
                    className="absolute top-6 left-0 z-40 bg-slate-900 text-white p-3 rounded-r-xl shadow-xl hover:pl-5 transition-all border-y border-r border-white/20"
                >
                    <ChevronRight />
                </button>
            )}

            <style>{`
                .custom-scrollbar::-webkit-scrollbar { width: 4px; }
                .custom-scrollbar::-webkit-scrollbar-track { bg: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: #334155; border-radius: 10px; }
            `}</style>
        </div>
    );
};

export default FleetMapbox;
