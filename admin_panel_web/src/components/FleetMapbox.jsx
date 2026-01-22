import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { supabase } from '../lib/supabase';
import { User, Signal, Clock, Search, Map as MapIcon, Layers, ChevronLeft, ChevronRight, Zap, Navigation, Home, Store, Calendar, ArrowRight } from 'lucide-react';
import { formatDistanceToNow, format, startOfDay, endOfDay } from 'date-fns';
import { es } from 'date-fns/locale';
import { MAPBOX_TOKEN } from '../config/mapbox';

// Configure Mapbox token
mapboxgl.accessToken = MAPBOX_TOKEN;

/**
 * FleetMapbox - UX RESCUE EDITION
 * 
 * fixes:
 * - Date Timezone Logic (using explicit startOfDay/endOfDay)
 * - Visual Contrast (Reduced transparency for readability)
 * - Explicit "Casitas" rendering
 */
const FleetMapbox = () => {
    const mapContainerRef = useRef(null);
    const mapRef = useRef(null);
    const markersRef = useRef({}); // Tech markers
    const routeMarkersRef = useRef([]); // Destination markers (Houses)

    const [techs, setTechs] = useState([]);
    const [selectedTech, setSelectedTech] = useState(null);
    const [techItinerary, setTechItinerary] = useState([]);
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
            zoom: 11,
            pitch: 45,
            bearing: -10,
            projection: 'globe'
        });

        map.addControl(new mapboxgl.NavigationControl(), 'top-right');

        map.on('load', () => {
            console.log("✅ MAP LOADED");
            add3DBuildings(map);
        });

        mapRef.current = map;
        return () => map.remove();
    }, []);

    // -- DATA FETCHING --
    useEffect(() => {
        fetchFleetData();
        const sub = supabase.channel('fleet-v3').on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, fetchFleetData).subscribe();
        const interval = setInterval(fetchFleetData, 30000);
        return () => { supabase.removeChannel(sub); clearInterval(interval); };
    }, []);

    const fetchFleetData = async () => {
        // Robuster Date Logic
        const now = new Date();
        const start = startOfDay(now).toISOString();
        const end = endOfDay(now).toISOString();

        console.log("🔍 Fetching Fleet Data for:", start, "to", end);

        const [profilesRes, ticketsRes] = await Promise.all([
            supabase.from('profiles')
                .select('id, full_name, avatar_url, current_lat, current_lng, last_location_update')
                .eq('role', 'tech')
                .eq('is_active', true),
            supabase.from('tickets')
                .select(`
                    id, technician_id, status, scheduled_at, title, appliance_type,
                    clients ( full_name, address, city, latitude, longitude )
                `)
                .gte('scheduled_at', start)
                .lte('scheduled_at', end)
                .neq('status', 'cancelado') // Exclude cancelled, keep completed for history
        ]);

        const allTickets = ticketsRes.data || [];
        console.log(`🎫 Found ${allTickets.length} tickets for today.`);

        const merged = (profilesRes.data || []).map(t => {
            const myTickets = allTickets.filter(tk => tk.technician_id === t.id);
            // Workload: Pending/Active tasks only
            const workload = myTickets.filter(tk => tk.status !== 'completado').length;

            let isActive = false;
            if (t.last_location_update) {
                const diff = (new Date() - new Date(t.last_location_update)) / 1000 / 60;
                isActive = diff < 20; // Relaxed to 20 mins
            }

            return {
                ...t,
                technician_id: t.id,
                workload,
                allTickets: myTickets,
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

        // Refresh selected View
        if (selectedTech) {
            const updated = merged.find(t => t.id === selectedTech.id);
            if (updated) {
                // Determine logic for route
                const sorted = [...updated.allTickets].sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at));
                setTechItinerary(sorted);
                drawRoutesAndStops(updated, sorted);
            }
        }
    };

    // -- MARKERS & VISUALS --
    const updateMarkers = (list) => {
        if (!mapRef.current) return;

        list.forEach(tech => {
            // Tech Marker
            let marker = markersRef.current[tech.id];

            if (!marker) {
                const el = document.createElement('div');
                el.className = `tech-marker-${tech.id}`;
                el.innerHTML = renderTechMarkerHTML(tech);
                marker = new mapboxgl.Marker({ element: el })
                    .setLngLat([tech.longitude, tech.latitude])
                    .addTo(mapRef.current);

                el.addEventListener('click', (e) => {
                    e.stopPropagation();
                    handleTechSelect(tech);
                });
                markersRef.current[tech.id] = marker;
            } else {
                marker.setLngLat([tech.longitude, tech.latitude]);
                // Refresh content for status updates
                marker.getElement().innerHTML = renderTechMarkerHTML(tech);
            }
        });
    };

    const renderTechMarkerHTML = (tech) => `
        <div class="relative group cursor-pointer hover:z-50 transition-transform duration-200 hover:scale-110">
            <div class="absolute -inset-4 rounded-full blur-md bg-blue-500/40 ${tech.isActive ? 'animate-pulse' : 'hidden'}"></div>
            
            <div class="relative w-12 h-12 rounded-full border-[3px] border-white shadow-2xl flex items-center justify-center overflow-hidden bg-slate-900">
                    ${tech.avatar_url
            ? `<img src="${tech.avatar_url}" class="w-full h-full object-cover" />`
            : `<span class="text-white font-bold text-lg">${tech.full_name[0]}</span>`
        }
            </div>

            <div class="absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-slate-900 ${tech.isActive ? 'bg-emerald-500' : 'bg-slate-400'}"></div>
            
            <!-- Workload Badge (Always visible if > 0) -->
            ${tech.workload > 0 ? `
            <div class="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full border border-white/20 shadow-lg whitespace-nowrap z-20">
                    ${tech.workload} Tareas
            </div>` : ''}
        </div>
    `;

    const handleTechSelect = (tech) => {
        setSelectedTech(tech);
        setIsSidebarOpen(true);
        const sorted = [...tech.allTickets].sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at));
        setTechItinerary(sorted);

        mapRef.current.flyTo({ center: [tech.longitude, tech.latitude], zoom: 14, duration: 1500 });
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

        // Draw Casitas (Destinations)
        tickets.forEach(t => {
            if (!t.clients?.latitude) return;

            const isNext = t.status === 'en_camino' || t.status === 'en_proceso';
            const isDone = t.status === 'completado';

            const el = document.createElement('div');
            el.innerHTML = `
                <div class="relative group hover:z-50">
                    <div class="absolute -inset-3 bg-blue-500/30 rounded-full blur-md ${isNext ? 'animate-pulse' : 'hidden'}"></div>
                    <div class="relative w-9 h-9 flex items-center justify-center bg-white rounded-full shadow-xl border-2 ${isNext ? 'border-blue-600 scale-110' : isDone ? 'border-emerald-500 opacity-80' : 'border-slate-500'} transition-transform hover:scale-125">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${isDone ? '#10b981' : isNext ? '#2563eb' : '#64748b'}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                            <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                            <polyline points="9 22 9 12 15 12 15 22"/>
                        </svg>
                    </div>
                    
                    <div class="absolute -top-10 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-2 py-1 rounded text-[10px] font-bold opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none border border-white/10">
                        ${t.clients.full_name}
                    </div>
                </div>
            `;

            const marker = new mapboxgl.Marker({ element: el })
                .setLngLat([t.clients.longitude, t.clients.latitude])
                .addTo(mapRef.current);
            routeMarkersRef.current.push(marker);
        });

        // Route Line
        const activeJob = tickets.find(t => t.status === 'en_camino') || tickets.find(t => t.status === 'asignado');

        if (activeJob?.clients?.latitude && tech.longitude) {
            try {
                const query = await fetch(
                    `https://api.mapbox.com/directions/v5/mapbox/driving/${tech.longitude},${tech.latitude};${activeJob.clients.longitude},${activeJob.clients.latitude}?steps=true&geometries=geojson&access_token=${mapboxgl.accessToken}`
                );
                const json = await query.json();
                if (!json.routes || json.routes.length === 0) return;

                const route = json.routes[0].geometry.coordinates;

                mapRef.current.addSource('route-source', {
                    'type': 'geojson',
                    'data': { 'type': 'Feature', 'geometry': { 'type': 'LineString', 'coordinates': route } }
                });

                mapRef.current.addLayer({
                    'id': 'route-line',
                    'type': 'line',
                    'source': 'route-source',
                    'layout': { 'line-join': 'round', 'line-cap': 'round' },
                    'paint': { 'line-color': '#3b82f6', 'line-width': 5, 'line-opacity': 0.8 }
                });

                // Add arrows
                mapRef.current.addLayer({
                    'id': 'route-arrows',
                    'type': 'symbol',
                    'source': 'route-source',
                    'layout': {
                        'symbol-placement': 'line',
                        'text-field': '▶',
                        'text-size': 14,
                        'symbol-spacing': 50,
                        'text-keep-upright': false
                    },
                    'paint': { 'text-color': '#ffffff', 'text-halo-color': '#3b82f6', 'text-halo-width': 2 }
                });

            } catch (err) { console.error("Route Error", err); }
        }
    };

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
                'fill-extrusion-color': '#0f172a',
                'fill-extrusion-height': ['interpolate', ['linear'], ['zoom'], 15, 0, 15.05, ['get', 'height']],
                'fill-extrusion-base': ['interpolate', ['linear'], ['zoom'], 15, 0, 15.05, ['get', 'min_height']],
                'fill-extrusion-opacity': 0.8
            }
        }, labelLayerId);
    };

    return (
        <div className="relative w-full h-[calc(100vh-80px)] overflow-hidden bg-slate-950 flex">
            <div className="flex-1 relative">
                <div ref={mapContainerRef} className="absolute inset-0 z-0 w-full h-full" />

                <div className="absolute top-4 right-14 flex flex-col gap-2 z-20">
                    <button onClick={() => fetchFleetData()} className="p-2 bg-slate-900/80 text-blue-400 rounded-lg hover:bg-slate-800 border border-white/10 shadow-lg"><Signal /></button>
                </div>
            </div>

            {/* SIDEBAR - IMPROVED VISIBILITY */}
            <div className={`
                absolute top-0 bottom-0 left-0 z-30 transition-transform duration-300
                ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
                w-[380px] bg-[#0f172a] border-r border-slate-800 shadow-2xl flex flex-col
            `}>
                {/* Header */}
                <div className="p-5 border-b border-slate-800 bg-slate-900">
                    <div className="flex justify-between items-center mb-4">
                        <h2 className="text-white font-bold text-lg flex items-center gap-2 tracking-tight">
                            <MapIcon className="text-blue-500" size={20} /> CONTROL DE FLOTA
                        </h2>
                        <button onClick={() => setIsSidebarOpen(false)} className="text-slate-400 hover:text-white"><ChevronLeft /></button>
                    </div>

                    {selectedTech ? (
                        <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700 animate-in fade-in zoom-in-95 duration-200">
                            <div className="flex items-center gap-3">
                                <img src={selectedTech.avatar_url} className="w-14 h-14 rounded-full border-2 border-slate-600 object-cover" />
                                <div>
                                    <h3 className="font-bold text-white text-lg">{selectedTech.full_name}</h3>
                                    <div className="text-sm">
                                        {selectedTech.isActive
                                            ? <span className="text-emerald-400 font-medium flex items-center gap-1"><Signal size={12} /> Activo Ahora</span>
                                            : <span className="text-slate-500 flex items-center gap-1"><Clock size={12} /> Ausente hace {formatDistanceToNow(selectedTech.lastUpdate || new Date(), { locale: es })}</span>
                                        }
                                    </div>
                                </div>
                            </div>
                            <button onClick={() => setSelectedTech(null)} className="w-full mt-3 py-1.5 text-xs font-bold text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded transition-colors">
                                ← VOLVER AL MAPA GENERAL
                            </button>
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 gap-3">
                            <div className="bg-blue-600/10 border border-blue-500/20 p-3 rounded-xl">
                                <span className="text-2xl font-bold text-blue-400 block">{activeTechsCount}</span>
                                <span className="text-[10px] font-bold text-blue-300 uppercase tracking-wider">Online</span>
                            </div>
                            <div className="bg-slate-800 p-3 rounded-xl border border-slate-700">
                                <span className="text-2xl font-bold text-slate-300 block">{techs.length}</span>
                                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Total</span>
                            </div>
                        </div>
                    )}
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto custom-scrollbar bg-[#0f172a]">
                    {selectedTech ? (
                        <div className="p-5">
                            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-6">Itinerario / Paradas</h4>

                            {/* Timeline */}
                            <div className="relative border-l-2 border-slate-800 ml-3 space-y-8 pb-10">
                                {techItinerary.length > 0 ? techItinerary.map((t, i) => {
                                    const isDone = t.status === 'completado';
                                    const isNav = t.status === 'en_camino';
                                    const isWork = t.status === 'en_proceso';

                                    return (
                                        <div key={t.id} className="relative pl-6 group">
                                            <div className={`absolute -left-[9px] top-0 w-4 h-4 rounded-full border-2 transition-colors duration-300 ${isDone ? 'bg-emerald-500 border-emerald-900' : isNav ? 'bg-blue-500 border-blue-900 animate-pulse' : 'bg-slate-800 border-slate-600'}`}></div>

                                            <div className={`p-4 rounded-xl border transition-all hover:translate-x-1 duration-200 ${isNav || isWork ? 'bg-blue-900/10 border-blue-500/30' : 'bg-slate-800/40 border-slate-700/50 hover:bg-slate-800 hover:border-slate-600'}`}>
                                                <div className="flex justify-between items-center mb-2">
                                                    <span className="text-xl font-bold text-slate-200">{format(new Date(t.scheduled_at), 'HH:mm')}</span>
                                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${isDone ? 'text-emerald-400 bg-emerald-900/20' : isNav ? 'text-blue-400 bg-blue-900/20' : 'text-amber-400 bg-amber-900/20'}`}>
                                                        {t.status.replace('_', ' ')}
                                                    </span>
                                                </div>
                                                <div className="font-bold text-white mb-0.5">{t.clients?.full_name}</div>
                                                <div className="text-xs text-slate-400 truncate mb-2">{t.clients?.address}</div>
                                                <div className="inline-flex items-center gap-1.5 px-2 py-1 bg-black/20 rounded text-xs text-slate-300 font-medium">
                                                    <Store size={10} className="text-amber-500" /> {t.appliance_type}
                                                </div>
                                            </div>
                                        </div>
                                    )
                                }) : (
                                    <div className="pl-6 text-slate-500 italic">No hay paradas en ruta.</div>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="p-2 space-y-2">
                            {techs.map(tech => (
                                <div key={tech.id} onClick={() => handleTechSelect(tech)} className="p-3 mx-2 rounded-xl bg-slate-800/40 border border-slate-800 hover:bg-slate-800 hover:border-slate-600 transition-all cursor-pointer group">
                                    <div className="flex items-center gap-3">
                                        <div className="relative">
                                            <img src={tech.avatar_url || 'https://via.placeholder.com/40'} className="w-10 h-10 rounded-full bg-slate-700 object-cover" />
                                            <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-slate-900 ${tech.isActive ? 'bg-emerald-500' : 'bg-rose-500'}`}></div>
                                        </div>
                                        <div className="flex-1">
                                            <div className="flex justify-between">
                                                <span className="font-bold text-slate-200 group-hover:text-white">{tech.full_name}</span>
                                                {tech.workload > 0 && <span className="text-[10px] font-bold bg-blue-600 text-white px-1.5 py-0.5 rounded">{tech.workload}</span>}
                                            </div>
                                            <div className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                                                {tech.isActive ? 'Conectado' : 'Desconectado'}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {!isSidebarOpen && (
                <button onClick={() => setIsSidebarOpen(true)} className="absolute top-6 left-0 z-50 bg-slate-900 border border-slate-700 text-white p-3 rounded-r-xl shadow-xl hover:pl-5 transition-all"><ChevronRight /></button>
            )}

            <style>{`.mapboxgl-ctrl-attrib { display: none; }`}</style>
        </div>
    );
};

export default FleetMapbox;
