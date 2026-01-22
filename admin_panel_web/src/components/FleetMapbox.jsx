import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { supabase } from '../lib/supabase';
import { User, Signal, Clock, Search, Map as MapIcon, Layers, ChevronLeft, ChevronRight, Zap } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { MAPBOX_TOKEN } from '../config/mapbox';

// Configure Mapbox token
mapboxgl.accessToken = MAPBOX_TOKEN;

/**
 * FleetMapbox - PRO LEVEL UI/UX (Manual Control Version)
 * 
 * Features:
 * - Immersive Full-Screen Map (Dark Mode by Default)
 * - Manual Satellite Toggle
 * - Explicit Task Counters (Corrected Logic)
 * - Glassmorphic Sidebar
 */
const FleetMapbox = () => {
    const mapContainerRef = useRef(null);
    const mapRef = useRef(null);
    const markersRef = useRef({});
    const [techs, setTechs] = useState([]);
    const [selectedTech, setSelectedTech] = useState(null);
    const [activeTechsCount, setActiveTechsCount] = useState(0);
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);
    const [mapLoaded, setMapLoaded] = useState(false);
    const [viewMode, setViewMode] = useState('3d'); // '3d' (Dark) or 'satellite'

    // Initialize Mapbox map
    useEffect(() => {
        if (!mapContainerRef.current) return;

        const map = new mapboxgl.Map({
            container: mapContainerRef.current,
            style: 'mapbox://styles/mapbox/dark-v11', // Default Premium Dark
            center: [-4.4214, 36.7213], // Málaga
            zoom: 12.5,
            pitch: 45,
            bearing: -17.6,
            antialias: true,
            attributionControl: false,
            logoPosition: 'bottom-right'
        });

        map.addControl(new mapboxgl.NavigationControl({ showCompass: true, showZoom: true, visualizePitch: true }), 'top-right');

        map.on('load', () => {
            console.log('✅ PRO Fleet Map loaded (Manual Mode)');
            setMapLoaded(true);
            add3DBuildings(map);
        });

        mapRef.current = map;

        return () => {
            map.remove();
            mapRef.current = null;
        };
    }, []);

    const add3DBuildings = (map) => {
        const layers = map.getStyle().layers;
        const labelLayerId = layers.find(l => l.type === 'symbol' && l.layout['text-field'])?.id;
        if (!labelLayerId) return;

        if (map.getLayer('3d-buildings')) return;

        map.addLayer({
            'id': '3d-buildings',
            'source': 'composite',
            'source-layer': 'building',
            'filter': ['==', 'extrude', 'true'],
            'type': 'fill-extrusion',
            'minzoom': 15,
            'paint': {
                'fill-extrusion-color': '#242424',
                'fill-extrusion-height': ['interpolate', ['linear'], ['zoom'], 15, 0, 15.05, ['get', 'height']],
                'fill-extrusion-base': ['interpolate', ['linear'], ['zoom'], 15, 0, 15.05, ['get', 'min_height']],
                'fill-extrusion-opacity': 0.6
            }
        }, labelLayerId);
    };

    const toggleMapStyle = () => {
        if (!mapRef.current) return;
        const isCurrentlyDark = viewMode === '3d';
        const newStyle = isCurrentlyDark ? 'mapbox://styles/mapbox/satellite-streets-v12' : 'mapbox://styles/mapbox/dark-v11';

        mapRef.current.setStyle(newStyle);
        setViewMode(isCurrentlyDark ? 'satellite' : '3d');

        mapRef.current.once('style.load', () => {
            if (!isCurrentlyDark) add3DBuildings(mapRef.current);
        });
    };

    // Fetch Data
    useEffect(() => {
        fetchFleetData();
        const sub = supabase.channel('fleet-pro').on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, fetchFleetData).subscribe();
        const interval = setInterval(fetchFleetData, 30000);
        return () => { supabase.removeChannel(sub); clearInterval(interval); };
    }, []);

    const fetchFleetData = async () => {
        // Calculate Today's Range (00:00:00 - 23:59:59 Local Time)
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date();
        todayEnd.setHours(23, 59, 59, 999);

        const [profilesRes, ticketsRes] = await Promise.all([
            supabase.from('profiles').select('id, full_name, avatar_url, current_lat, current_lng, last_location_update').eq('role', 'tech').eq('is_active', true),
            supabase.from('tickets')
                .select('technician_id, status')
                .gte('scheduled_at', todayStart.toISOString())
                .lte('scheduled_at', todayEnd.toISOString())
                .neq('status', 'cancelado')
                .neq('status', 'completado') // Don't count finished work
        ]);

        const merged = (profilesRes.data || []).map(t => {
            // Strict match: Tech ID match + Not Cancelled + Not Completed
            const activeTickets = (ticketsRes.data || []).filter(tk =>
                tk.technician_id === t.id &&
                tk.status !== 'completado' &&
                tk.status !== 'cancelado'
            );

            const workload = activeTickets.length;

            let isActive = false;
            if (t.last_location_update) {
                isActive = ((new Date() - new Date(t.last_location_update)) / 1000 / 60) < 5;
            }
            return {
                ...t,
                technician_id: t.id,
                profiles: t,
                latitude: t.current_lat || 36.7212,
                longitude: t.current_lng || -4.4217,
                workload,
                isActive,
                lastUpdate: t.last_location_update ? new Date(t.last_location_update) : null
            };
        });

        merged.sort((a, b) => b.isActive - a.isActive);
        setTechs(merged);
        setActiveTechsCount(merged.filter(m => m.isActive).length);
        updateMarkers(merged);
    };

    const updateMarkers = (list) => {
        if (!mapRef.current) return;
        list.forEach(tech => {
            if (markersRef.current[tech.id]) {
                const marker = markersRef.current[tech.id];
                marker.setLngLat([tech.longitude, tech.latitude]);
                const el = marker.getElement();
                const pulse = el.querySelector('.pulse-ring');
                if (pulse) pulse.style.display = tech.isActive ? 'block' : 'none';

                // Update Badge in marker
                const badge = el.querySelector('.tech-badge');
                if (badge) {
                    badge.innerText = tech.workload;
                    badge.style.display = tech.workload > 0 ? 'block' : 'none';
                }

            } else {
                const el = document.createElement('div');
                el.className = 'tech-marker-pro';
                el.innerHTML = `
                    <div class="relative group cursor-pointer transition-transform duration-300 hover:scale-110">
                        <div class="pulse-ring absolute -inset-4 rounded-full blur-md bg-blue-500/30 animate-pulse" style="display: ${tech.isActive ? 'block' : 'none'}"></div>
                        <div class="relative w-10 h-10 rounded-full border-2 border-white/20 shadow-2xl flex items-center justify-center overflow-hidden bg-slate-800">
                             ${tech.avatar_url ? `<img src="${tech.avatar_url}" class="w-full h-full object-cover" />` : `<span class="text-white font-bold text-xs">${tech.full_name[0]}</span>`}
                        </div>
                        <div class="absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full border-2 border-slate-900 ${tech.isActive ? 'bg-emerald-500 shadow-[0_0_8px_#10b981]' : 'bg-slate-500'}"></div>
                        
                        <div class="tech-badge absolute -top-1 -right-1 bg-blue-600 text-white text-[9px] font-bold px-1.5 rounded-full border border-slate-900 shadow-sm" style="display: ${tech.workload > 0 ? 'block' : 'none'}">
                            ${tech.workload}
                        </div>
                    </div>
                `;
                const marker = new mapboxgl.Marker({ element: el }).setLngLat([tech.longitude, tech.latitude]).addTo(mapRef.current);
                el.addEventListener('click', () => handleTechClick(tech));
                markersRef.current[tech.id] = marker;
            }
        });
    };

    const handleTechClick = (tech) => {
        setSelectedTech(tech);
        mapRef.current?.flyTo({ center: [tech.longitude, tech.latitude], zoom: 16, pitch: 60, duration: 2000 });
    };

    return (
        <div className="relative w-full h-[calc(100vh-80px)] overflow-hidden bg-slate-950">
            <div ref={mapContainerRef} className="absolute inset-0 z-0" />

            {/* Gradient Overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/50 via-transparent to-slate-950/20 pointer-events-none z-10" />

            {/* Sidebar */}
            <div className={`absolute left-4 top-4 bottom-4 w-80 bg-slate-900/80 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl z-20 flex flex-col transition-all duration-300 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-[110%]'}`}>

                {/* Header */}
                <div className="p-5 border-b border-white/5 flex justify-between items-center bg-white/5">
                    <div>
                        <h2 className="text-white font-bold text-lg flex items-center gap-2">
                            <MapIcon className="text-blue-500" size={20} /> Fuerza de Campo
                        </h2>
                        <div className="flex items-center gap-2 mt-1">
                            <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-bold border border-emerald-500/30 flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> {activeTechsCount} ONLINE
                            </span>
                            <span className="text-slate-500 text-[10px]">{techs.length} TOTAL</span>
                        </div>
                    </div>

                    <button onClick={toggleMapStyle} className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-colors border border-white/5" title={viewMode === '3d' ? 'Cambiar a Satélite' : 'Cambiar a Modo Oscuro'}>
                        <Layers size={18} />
                    </button>
                </div>

                {/* List */}
                <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
                    {techs.map(tech => (
                        <div key={tech.id} onClick={() => handleTechClick(tech)}
                            className={`p-3 rounded-xl border transition-all cursor-pointer relative overflow-hidden group ${selectedTech?.id === tech.id ? 'bg-blue-600/20 border-blue-500/50 shadow-[0_0_20px_rgba(37,99,235,0.2)]' : 'bg-white/5 border-transparent hover:bg-white/10'}`}>

                            {/* Workload Bar */}
                            <div className={`absolute left-0 top-0 bottom-0 w-1 transition-all ${tech.workload > 3 ? 'bg-amber-500' : 'bg-blue-500'}`} style={{ height: `${Math.min(tech.workload * 20, 100)}%` }} />

                            <div className="flex items-center gap-3 pl-2">
                                <div className="relative w-10 h-10 rounded-full border-2 border-white/10 overflow-hidden shadow-sm bg-slate-800">
                                    {tech.avatar_url ? <img src={tech.avatar_url} className="w-full h-full object-cover" /> : <span className="flex items-center justify-center h-full font-bold text-slate-400">{tech.full_name[0]}</span>}
                                    <div className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-slate-900 ${tech.isActive ? 'bg-emerald-500 shadow-[0_0_5px_#10b981]' : 'bg-slate-500'}`}></div>
                                </div>

                                <div className="flex-1 min-w-0">
                                    <div className="flex justify-between items-center mb-0.5">
                                        <h4 className={`text-sm font-bold truncate ${selectedTech?.id === tech.id ? 'text-blue-400' : 'text-slate-200 group-hover:text-white'}`}>{tech.full_name}</h4>

                                        {/* Task Counter Badge - FIXED */}
                                        <div className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md ${tech.workload > 0 ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30' : 'bg-slate-800 text-slate-500'}`}>
                                            <Zap size={10} className={tech.workload > 0 ? 'text-blue-400' : 'text-slate-600'} /> {tech.workload} {tech.workload === 1 ? 'Tarea' : 'Tareas'}
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2 text-[10px] text-slate-500">
                                        {tech.isActive
                                            ? <span className="text-emerald-400 flex gap-1 items-center font-medium"><Signal size={10} /> Conectado</span>
                                            : <span className="flex gap-1 items-center opacity-60"><Clock size={10} /> {tech.lastUpdate ? formatDistanceToNow(tech.lastUpdate, { addSuffix: true, locale: es }) : 'Sin señal'}</span>}
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Search Footer */}
                <div className="p-4 border-t border-white/5 bg-white/5 backdrop-blur-lg">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                        <input type="text" placeholder="Buscar técnico..." className="w-full bg-slate-950/50 border border-white/10 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50 transition-colors" />
                    </div>
                </div>
            </div>

            {/* Collapse Button */}
            <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className={`absolute top-6 z-20 bg-slate-900/90 text-white p-2 rounded-r-xl shadow-xl transition-all duration-300 border-y border-r border-white/10 hover:bg-blue-600 ${isSidebarOpen ? 'left-80' : 'left-0'}`}>
                {isSidebarOpen ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
            </button>
        </div>
    );
};

export default FleetMapbox;
