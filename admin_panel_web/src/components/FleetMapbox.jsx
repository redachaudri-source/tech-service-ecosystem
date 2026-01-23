import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { supabase } from '../lib/supabase';
import { User, Signal, Clock, Search, Map as MapIcon, Layers, ChevronLeft, ChevronRight, Zap, Navigation, Home, Store, Calendar, ArrowRight, BarChart3, Radio } from 'lucide-react';
import { formatDistanceToNow, format, startOfDay, endOfDay } from 'date-fns';
import { es } from 'date-fns/locale';
import { MAPBOX_TOKEN } from '../config/mapbox';

// Configure Mapbox token
mapboxgl.accessToken = MAPBOX_TOKEN;

/**
 * FleetMapbox - GOD TIER EDITION "Midnight Commander"
 * 
 * Aesthetic: Cyberpunk / High-End Military Ops
 * Features:
 * - HUD-style Analytics
 * - High Contrast Dark Mode (Slate 950/900)
 * - Cinematic Markers & Route Lines
 * - Contextual Timeline Flight Plan
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
    const [viewMode, setViewMode] = useState('3d');

    // -- MAP INITIALIZATION --
    useEffect(() => {
        if (!mapContainerRef.current) return;

        const map = new mapboxgl.Map({
            container: mapContainerRef.current,
            style: 'mapbox://styles/mapbox/dark-v11', // Deep Dark Base
            center: [-4.4214, 36.7213], // Málaga
            zoom: 11.5,
            pitch: 55, // Aggressive pitch for 3D feel
            bearing: -15,
            projection: 'globe',
            antialias: true
        });

        // Atmospheric styling
        map.on('style.load', () => {
            map.setFog({
                'range': [0.5, 10],
                'color': '#0f172a',
                'horizon-blend': 0.1,
                'high-color': '#020617',
                'space-color': '#020617',
                'star-intensity': 0.5
            });
            add3DBuildings(map);
        });

        // Minimal controls
        map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'bottom-right');

        mapRef.current = map;
        return () => map.remove();
    }, []);

    // -- DATA CORE (Strict Logic Preserved) --
    useEffect(() => {
        fetchFleetData();
        const sub = supabase.channel('fleet-god-tier').on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, fetchFleetData).subscribe();
        const interval = setInterval(fetchFleetData, 30000);
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
            // HTML for Marker
            const html = `
                <div class="relative group cursor-pointer hover:z-50 transition-all duration-300">
                    <!-- Radar Ping -->
                    <div class="absolute -inset-8 rounded-full border border-blue-500/30 opacity-0 group-hover:opacity-100 scale-0 group-hover:scale-100 transition-all duration-500"></div>
                    <div class="absolute -inset-4 rounded-full bg-blue-500/20 blur-md ${tech.isActive ? 'animate-pulse' : 'hidden'}"></div>
                    
                    <!-- Core Avatar -->
                    <div class="relative w-14 h-14 rounded-full border-[3px] ${tech.isActive ? 'border-blue-400 shadow-[0_0_15px_rgba(59,130,246,0.5)]' : 'border-slate-500'} bg-slate-900 overflow-hidden flex items-center justify-center transition-transform hover:scale-110">
                         ${tech.avatar_url
                    ? `<img src="${tech.avatar_url}" class="w-full h-full object-cover" />`
                    : `<span class="text-white font-bold text-lg">${tech.full_name[0]}</span>`
                }
                    </div>

                    <!-- Status Dot -->
                    <div class="absolute bottom-0 right-0 w-4 h-4 rounded-full border-2 border-slate-900 ${tech.isActive ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]' : 'bg-slate-500'}"></div>
                    
                    <!-- Floating Data Badge (Tasks) -->
                    ${tech.workload > 0 ? `
                        <div class="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-sm shadow-lg border border-white/10 uppercase tracking-wider flex items-center gap-1">
                            ${tech.workload} Tareas
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
        mapRef.current.flyTo({ center: [tech.longitude, tech.latitude], zoom: 14.5, pitch: 60, duration: 1800 });
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

        // Draw Destinations
        tickets.forEach(t => {
            if (!t.clients?.latitude) return;
            const isNext = t.status === 'en_camino' || t.status === 'en_proceso';
            const isDone = t.status === 'completado';

            const el = document.createElement('div');
            el.innerHTML = `
                <div class="relative group hover:z-50">
                    <div class="absolute -top-12 left-1/2 -translate-x-1/2 bg-slate-900/90 backdrop-blur text-white px-3 py-1.5 rounded border border-white/10 text-xs font-bold opacity-0 group-hover:opacity-100 transition-all pointer-events-none whitespace-nowrap z-50 shadow-xl">
                        ${t.clients.full_name}
                        <div class="text-[10px] text-slate-400 font-normal mt-0.5">${t.appliance_type}</div>
                    </div>
                    
                    <div class="w-10 h-10 flex items-center justify-center rounded-full border-2 ${isNext ? 'bg-blue-600 border-white shadow-[0_0_15px_rgba(37,99,235,0.6)] scale-110' : isDone ? 'bg-slate-900 border-emerald-500 opacity-60' : 'bg-slate-800 border-slate-500'} transition-transform shadow-lg">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                            <polyline points="9 22 9 12 15 12 15 22"></polyline>
                        </svg>
                    </div>
                </div>
            `;
            const marker = new mapboxgl.Marker({ element: el }).setLngLat([t.clients.longitude, t.clients.latitude]).addTo(mapRef.current);
            routeMarkersRef.current.push(marker);
        });

        // Smart Route
        const activeJob = tickets.find(t => t.status === 'en_camino') || tickets.find(t => t.status === 'asignado');
        if (activeJob?.clients?.latitude && tech.longitude) {
            try {
                const query = await fetch(`https://api.mapbox.com/directions/v5/mapbox/driving/${tech.longitude},${tech.latitude};${activeJob.clients.longitude},${activeJob.clients.latitude}?steps=true&geometries=geojson&access_token=${mapboxgl.accessToken}`);
                const json = await query.json();
                const route = json.routes?.[0]?.geometry?.coordinates;
                if (route) {
                    mapRef.current.addSource('route-source', { 'type': 'geojson', 'data': { 'type': 'Feature', 'geometry': { 'type': 'LineString', 'coordinates': route } } });
                    // Neon Path
                    mapRef.current.addLayer({ 'id': 'route-line', 'type': 'line', 'source': 'route-source', 'layout': { 'line-join': 'round', 'line-cap': 'round' }, 'paint': { 'line-color': '#3b82f6', 'line-width': 4, 'line-opacity': 0.9, 'line-blur': 1 } });
                    // Arrows
                    mapRef.current.addLayer({ 'id': 'route-arrows', 'type': 'symbol', 'source': 'route-source', 'layout': { 'symbol-placement': 'line', 'text-field': '▶', 'text-size': 12, 'symbol-spacing': 30, 'text-keep-upright': false }, 'paint': { 'text-color': '#eff6ff', 'text-halo-color': '#3b82f6', 'text-halo-width': 1 } });
                }
            } catch (e) { console.error(e); }
        }
    };

    const add3DBuildings = (map) => {
        if (map.getLayer('3d-buildings')) return;
        map.addLayer({
            'id': '3d-buildings', 'source': 'composite', 'source-layer': 'building', 'filter': ['==', 'extrude', 'true'], 'type': 'fill-extrusion', 'minzoom': 14,
            'paint': { 'fill-extrusion-color': '#111827', 'fill-extrusion-height': ['interpolate', ['linear'], ['zoom'], 15, 0, 15.05, ['get', 'height']], 'fill-extrusion-base': ['interpolate', ['linear'], ['zoom'], 15, 0, 15.05, ['get', 'min_height']], 'fill-extrusion-opacity': 0.9 }
        });
    };

    return (
        <div className="relative w-full h-[calc(100vh-80px)] overflow-hidden bg-[#020617] text-white flex">

            {/* --- MAP --- */}
            <div className="flex-1 relative">
                <div ref={mapContainerRef} className="absolute inset-0 z-0" />

                {/* HUD Overlay Effects */}
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(2,6,23,0.4)_100%)] pointer-events-none z-10"></div>

                {/* Controls */}
                <div className="absolute top-6 right-6 flex flex-col gap-2 z-20">
                    <button onClick={() => fetchFleetData()} className="w-10 h-10 flex items-center justify-center bg-slate-900 border border-slate-700 text-blue-400 rounded-lg shadow-xl hover:bg-slate-800 transition-all hover:scale-105 active:scale-95"><Signal size={20} /></button>
                    <button onClick={() => { if (!mapRef.current) return; const is3d = viewMode === '3d'; mapRef.current.setStyle(is3d ? 'mapbox://styles/mapbox/satellite-streets-v12' : 'mapbox://styles/mapbox/dark-v11'); setViewMode(is3d ? 'sat' : '3d'); }} className="w-10 h-10 flex items-center justify-center bg-slate-900 border border-slate-700 text-slate-300 rounded-lg shadow-xl hover:bg-slate-800 transition-all hover:scale-105 active:scale-95"><Layers size={20} /></button>
                </div>
            </div>

            {/* --- GOD TIER SIDEBAR --- */}
            <div className={`
                absolute top-0 bottom-0 left-0 z-30 transition-transform duration-500 cubic-bezier(0.22, 1, 0.36, 1)
                ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
                w-[420px] bg-[#020617]/95 backdrop-blur-2xl border-r border-slate-800 shadow-[20px_0_50px_rgba(0,0,0,0.5)] flex flex-col
            `}>
                {/* Sidebar Header */}
                <div className="p-6 border-b border-slate-800 bg-[#0f172a]/50">
                    <div className="flex justify-between items-center mb-6">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-blue-600 rounded-lg shadow-lg shadow-blue-600/20">
                                <Navigation size={20} className="text-white" />
                            </div>
                            <div>
                                <h1 className="text-xl font-black tracking-tight text-white uppercase font-mono">Mission Control</h1>
                                <div className="text-[10px] text-slate-400 font-mono tracking-widest uppercase">Live Fleet Tracking System</div>
                            </div>
                        </div>
                        <button onClick={() => setIsSidebarOpen(false)} className="p-2 text-slate-500 hover:text-white transition-colors"><ChevronLeft /></button>
                    </div>

                    {selectedTech ? (
                        /* SELECTED TECH HUD */
                        <div className="animate-in fade-in zoom-in-95 duration-300">
                            <div className="bg-gradient-to-r from-slate-800 to-slate-900 p-5 rounded-2xl border border-slate-700/50 shadow-xl relative overflow-hidden group">
                                <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full blur-3xl -mr-10 -mt-10"></div>

                                <div className="flex items-start justify-between relative z-10">
                                    <div className="flex items-center gap-4">
                                        <div className="relative">
                                            <div className="w-16 h-16 rounded-2xl border-2 border-slate-600 overflow-hidden shadow-lg">
                                                <img src={selectedTech.avatar_url} className="w-full h-full object-cover" />
                                            </div>
                                            <div className={`absolute -bottom-2 -right-2 w-5 h-5 rounded-full border-4 border-slate-800 ${selectedTech.isActive ? 'bg-emerald-500 animate-pulse' : 'bg-slate-500'}`}></div>
                                        </div>
                                        <div>
                                            <h2 className="text-2xl font-bold text-white leading-tight">{selectedTech.full_name}</h2>
                                            <div className="flex items-center gap-2 mt-1">
                                                <span className={`text-xs font-bold px-2 py-0.5 rounded-md uppercase tracking-wider ${selectedTech.isActive ? 'bg-emerald-950 text-emerald-400 border border-emerald-900' : 'bg-slate-800 text-slate-400'}`}>
                                                    {selectedTech.isActive ? 'ONLINE' : 'OFFLINE'}
                                                </span>
                                                <span className="text-xs text-slate-500 font-mono">ID: #{selectedTech.id.substring(0, 6)}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <button onClick={() => setSelectedTech(null)} className="mt-4 w-full py-2 bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 font-bold uppercase tracking-wider rounded-lg border border-slate-700 transition-all">
                                    ← Volver al Radar
                                </button>
                            </div>
                        </div>
                    ) : (
                        /* DASHBOARD STATS HUD */
                        <div className="grid grid-cols-2 gap-3">
                            <div className="bg-slate-900/50 border border-blue-900/30 p-4 rounded-xl relative overflow-hidden group hover:border-blue-500/50 transition-all">
                                <div className="absolute right-2 top-2 text-blue-500/20 group-hover:text-blue-500/40 transition-colors"><Radio size={40} /></div>
                                <div className="text-3xl font-black text-white mb-1 font-mono">{activeTechsCount}</div>
                                <div className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">Active Units</div>
                                <div className="h-1 w-full bg-slate-800 mt-3 rounded-full overflow-hidden">
                                    <div className="h-full bg-blue-500 w-1/2"></div>
                                </div>
                            </div>
                            <div className="bg-slate-900/50 border border-slate-800 p-4 rounded-xl relative overflow-hidden group hover:border-slate-600 transition-all">
                                <div className="absolute right-2 top-2 text-slate-700 group-hover:text-slate-600"><BarChart3 size={40} /></div>
                                <div className="text-3xl font-black text-slate-400 mb-1 font-mono">{techs.length}</div>
                                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Total Fleet</div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Sidebar Body */}
                <div className="flex-1 overflow-y-auto custom-scrollbar p-6 bg-[#020617]">
                    {selectedTech ? (
                        /* FLIGHT PLAN (TIMELINE) */
                        <div>
                            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
                                <span className="w-1.5 h-1.5 bg-slate-500 rounded-full"></span> Flight Plan (Itinerary)
                            </h3>

                            <div className="relative pl-4 border-l-2 border-slate-800 space-y-8">
                                {techItinerary.map((t, idx) => {
                                    const isDone = t.status === 'completado';
                                    const isActive = t.status === 'en_camino' || t.status === 'en_proceso';

                                    return (
                                        <div key={t.id} className="relative pl-8 group">
                                            {/* Connector & Dot */}
                                            <div className="absolute -left-[2px] top-6 w-4 border-t-2 border-slate-800"></div>
                                            <div className={`
                                                absolute -left-[9px] top-4 w-4 h-4 rounded-full border-2 
                                                ${isDone ? 'bg-emerald-950 border-emerald-500' : isActive ? 'bg-blue-950 border-blue-500 shadow-[0_0_10px_#3b82f6] scale-110' : 'bg-slate-900 border-slate-600'}
                                                transition-all duration-300 z-10
                                            `}></div>

                                            {/* Card */}
                                            <div className={`
                                                p-4 rounded-xl border transition-all duration-300 relative overflow-hidden
                                                ${isActive ? 'bg-blue-900/10 border-blue-500/50' : 'bg-slate-900 border-slate-800 hover:border-slate-600'}
                                            `}>
                                                {isActive && <div className="absolute top-0 right-0 p-1.5 bg-blue-600 text-white shadow-lg"><Navigation size={12} /></div>}

                                                <div className="flex justify-between items-start mb-2 opacity-80">
                                                    <span className="font-mono text-lg font-bold text-white">{format(new Date(t.scheduled_at), 'HH:mm')}</span>
                                                    <span className={`text-[9px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${isDone ? 'text-emerald-400 bg-emerald-950' : isActive ? 'text-blue-400 bg-blue-950' : 'text-slate-400 bg-slate-800'}`}>
                                                        {t.status.replace('_', ' ')}
                                                    </span>
                                                </div>

                                                <div className="text-sm font-bold text-white mb-1 truncate">{t.clients?.full_name}</div>
                                                <div className="text-xs text-slate-400 flex items-center gap-1 mb-3">
                                                    <Home size={10} /> {t.clients?.address}
                                                </div>

                                                <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-black/40 rounded-lg border border-white/5 text-xs text-slate-300 font-medium w-full">
                                                    <Store size={12} className="text-amber-500" />
                                                    {t.appliance_type}
                                                </div>
                                            </div>
                                        </div>
                                    )
                                })}
                                {techItinerary.length === 0 && <div className="pl-8 text-slate-600 font-mono text-sm">NO MISSION DATA FOR TODAY</div>}
                            </div>
                        </div>
                    ) : (
                        /* ROSTER LIST */
                        <div className="space-y-3">
                            {techs.map(tech => (
                                <div key={tech.id} onClick={() => handleTechSelect(tech)}
                                    className="group relative p-4 bg-slate-900/50 border border-slate-800 hover:border-blue-500/50 hover:bg-slate-800/80 rounded-xl cursor-pointer transition-all duration-300 overflow-hidden"
                                >
                                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-500 opacity-0 group-hover:opacity-100 transition-opacity"></div>

                                    <div className="flex items-center gap-4 relative z-10">
                                        <div className="relative">
                                            <div className="w-12 h-12 rounded-full bg-slate-950 border border-slate-700 overflow-hidden group-hover:border-blue-400 transition-colors">
                                                {tech.avatar_url ? <img src={tech.avatar_url} className="w-full h-full object-cover" /> : <span className="flex items-center justify-center h-full text-slate-500 font-bold">{tech.full_name[0]}</span>}
                                            </div>
                                            {tech.isActive && <div className="absolute -top-1 -right-1 flex h-3 w-3"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75"></span><span className="relative inline-flex rounded-full h-3 w-3 bg-sky-500"></span></div>}
                                        </div>

                                        <div className="flex-1 min-w-0">
                                            <div className="flex justify-between items-center mb-1">
                                                <h4 className="text-sm font-bold text-white truncate group-hover:text-blue-400 transition-colors">{tech.full_name}</h4>
                                                {tech.workload > 0 && <span className="text-[10px] font-bold bg-blue-600 text-white px-2 py-0.5 rounded-sm shadow-lg shadow-blue-900/50">{tech.workload} Tareas</span>}
                                            </div>
                                            <div className="flex items-center gap-2 text-[10px] text-slate-500 font-mono uppercase tracking-wider">
                                                {tech.isActive ? <span className="text-emerald-500 flex items-center gap-1">● Signal Active</span> : <span>Last Signal: {formatDistanceToNow(tech.lastUpdate || new Date(), { addSuffix: true })}</span>}
                                            </div>
                                        </div>

                                        <div className="text-slate-600 group-hover:text-white transition-colors opacity-0 group-hover:opacity-100 -translate-x-2 group-hover:translate-x-0 duration-300">
                                            <ArrowRight size={18} />
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-slate-800 bg-[#0f172a]">
                    <div className="relative group">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-blue-500 transition-colors" size={16} />
                        <input type="text" placeholder="SEARCH UNIT..." className="w-full bg-[#020617] border border-slate-700 rounded-lg pl-10 pr-4 py-3 text-sm text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/50 placeholder-slate-700 font-mono transition-all" />
                    </div>
                </div>
            </div>

            {/* Toggle Tab */}
            {!isSidebarOpen && (
                <button onClick={() => setIsSidebarOpen(true)} className="absolute top-1/2 left-0 -translate-y-1/2 z-40 bg-blue-600 text-white p-3 rounded-r-xl shadow-[0_0_20px_rgba(37,99,235,0.5)] hover:pl-5 transition-all">
                    <ChevronRight size={24} />
                </button>
            )}

            <style>{`.custom-scrollbar::-webkit-scrollbar { width: 4px; } .custom-scrollbar::-webkit-scrollbar-track { bg: #020617; } .custom-scrollbar::-webkit-scrollbar-thumb { background: #334155; border-radius: 2px; } .mapboxgl-ctrl-group { background: #0f172a !important; border: 1px solid #334155; } .mapboxgl-ctrl-icon { filter: invert(1); }`}</style>
        </div>
    );
};

export default FleetMapbox;
