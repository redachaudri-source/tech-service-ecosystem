import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { supabase } from '../lib/supabase';
import { User, Signal, Clock, Search, Map as MapIcon, Layers, ChevronLeft, ChevronRight, Zap, Sun, Moon } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { MAPBOX_TOKEN } from '../config/mapbox';

// Configure Mapbox token
mapboxgl.accessToken = MAPBOX_TOKEN;

/**
 * FleetMapbox - PRO LEVEL UI/UX
 * 
 * Features:
 * - Immersive Full-Screen Map
 * - Floating Glassmorphic Sidebar
 * - Dynamic Day/Night Cycle (Auto Switch)
 * - Interactive 3D Markers
 */
const FleetMapbox = () => {
    const mapContainerRef = useRef(null);
    const mapRef = useRef(null);
    const markersRef = useRef({});
    const [techs, setTechs] = useState([]);
    const [selectedTech, setSelectedTech] = useState(null);
    const [activeTechsCount, setActiveTechsCount] = useState(0);
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);
    const [isDayTime, setIsDayTime] = useState(true);

    // checkDayNight helper
    const checkIsDay = () => {
        const hour = new Date().getHours();
        // Day is between 07:00 and 19:00
        return hour >= 7 && hour < 19;
    };

    // Initialize Map
    useEffect(() => {
        if (!mapContainerRef.current) return;

        const isDay = checkIsDay();
        setIsDayTime(isDay);

        const style = isDay
            ? 'mapbox://styles/mapbox/navigation-day-v1'
            : 'mapbox://styles/mapbox/dark-v11';

        const map = new mapboxgl.Map({
            container: mapContainerRef.current,
            style: style,
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
            console.log(`✅ Fleet Map loaded (${isDay ? 'Day' : 'Night'} Mode)`);
            if (!isDay) add3DBuildings(map);
        });

        mapRef.current = map;

        return () => {
            map.remove();
            mapRef.current = null;
        };
    }, []);

    // 3D Buildings for Night Mode
    const add3DBuildings = (map) => {
        const layers = map.getStyle().layers;
        const labelLayerId = layers.find(l => l.type === 'symbol' && l.layout['text-field']).id;

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

    // Fetch Data (Same logic)
    useEffect(() => {
        fetchFleetData();
        const sub = supabase.channel('fleet-pro').on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, fetchFleetData).subscribe();
        const interval = setInterval(fetchFleetData, 30000);
        return () => { supabase.removeChannel(sub); clearInterval(interval); };
    }, []);

    const fetchFleetData = async () => {
        const [profilesRes, ticketsRes] = await Promise.all([
            supabase.from('profiles').select('id, full_name, avatar_url, current_lat, current_lng, last_location_update').eq('role', 'tech').eq('is_active', true),
            supabase.from('tickets').select('technician_id').gte('scheduled_at', new Date(new Date().setHours(0, 0, 0, 0)).toISOString()).neq('status', 'cancelado')
        ]);

        const merged = (profilesRes.data || []).map(t => {
            const workload = (ticketsRes.data || []).filter(tk => tk.technician_id === t.id).length;
            let isActive = false;
            if (t.last_location_update) {
                isActive = ((new Date() - new Date(t.last_location_update)) / 1000 / 60) < 5;
            }
            return { ...t, technician_id: t.id, profiles: t, latitude: t.current_lat || 36.7212, longitude: t.current_lng || -4.4217, workload, isActive, lastUpdate: t.last_location_update ? new Date(t.last_location_update) : null };
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
                markersRef.current[tech.id].setLngLat([tech.longitude, tech.latitude]);
            } else {
                const el = document.createElement('div');
                el.className = 'tech-marker-pro';
                el.innerHTML = `
                    <div class="relative group cursor-pointer transition-transform duration-300 hover:scale-110">
                        <div class="absolute -inset-4 rounded-full blur-md ${tech.isActive ? 'bg-blue-500/30 animate-pulse' : 'hidden'}"></div>
                        <div class="relative w-10 h-10 rounded-full border-2 border-white shadow-xl flex items-center justify-center overflow-hidden bg-slate-800">
                             ${tech.avatar_url ? `<img src="${tech.avatar_url}" class="w-full h-full object-cover" />` : `<span class="text-white font-bold text-xs">${tech.full_name[0]}</span>`}
                        </div>
                        <div class="absolute -bottom-1 -right-1 w-3 h-3 rounded-full border-2 border-white ${tech.isActive ? 'bg-emerald-500' : 'bg-slate-400'}"></div>
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

    // Styling CONSTANTS based on Theme
    const sidebarBg = isDayTime ? 'bg-white/80 border-slate-200 text-slate-800' : 'bg-slate-900/80 border-white/10 text-white';
    const itemHover = isDayTime ? 'hover:bg-blue-50' : 'hover:bg-white/10';
    const itemActive = isDayTime ? 'bg-blue-50 border-blue-200' : 'bg-blue-600/20 border-blue-500/50';

    return (
        <div className="relative w-full h-[calc(100vh-80px)] overflow-hidden">
            <div ref={mapContainerRef} className="absolute inset-0 z-0" />

            {/* Sidebar */}
            <div className={`absolute left-4 top-4 bottom-4 w-80 backdrop-blur-xl border rounded-2xl shadow-2xl z-20 flex flex-col transition-all duration-300 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-[110%]'} ${sidebarBg}`}>

                {/* Header */}
                <div className={`p-5 border-b flex justify-between items-center ${isDayTime ? 'border-slate-100' : 'border-white/5'}`}>
                    <div>
                        <h2 className="font-bold text-lg flex items-center gap-2">
                            <MapIcon className="text-blue-500" size={20} /> Fuerza de Campo
                        </h2>
                        <div className="flex items-center gap-2 mt-1 text-[10px]">
                            <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 font-bold border border-emerald-500/20 flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> {activeTechsCount} ONLINE
                            </span>
                            <span className="opacity-60">{isDayTime ? <Sun size={10} className="inline mr-1" /> : <Moon size={10} className="inline mr-1" />} {isDayTime ? 'MODO DÍA' : 'MODO NOCHE'}</span>
                        </div>
                    </div>
                    <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-1 opacity-50 hover:opacity-100"><ChevronLeft /></button>
                </div>

                {/* List */}
                <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
                    {techs.map(tech => (
                        <div key={tech.id} onClick={() => handleTechClick(tech)}
                            className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center gap-3 group relative overflow-hidden ${selectedTech?.id === tech.id ? itemActive : `border-transparent ${itemHover}`}`}>

                            <div className={`absolute left-0 top-0 bottom-0 w-1 transition-all ${tech.workload > 3 ? 'bg-amber-500' : 'bg-blue-500'}`} style={{ height: `${Math.min(tech.workload * 20, 100)}%` }} />

                            <div className="relative w-10 h-10 rounded-full bg-slate-200 overflow-hidden shadow-sm">
                                {tech.avatar_url ? <img src={tech.avatar_url} className="w-full h-full object-cover" /> : <span className="flex items-center justify-center h-full font-bold text-slate-500">{tech.full_name[0]}</span>}
                            </div>

                            <div className="flex-1">
                                <h4 className="font-bold text-sm truncate">{tech.full_name}</h4>
                                <div className="flex items-center gap-2 text-[10px] opacity-60 mt-0.5">
                                    {tech.isActive ? <span className="text-emerald-500 font-bold flex gap-1"><Signal size={10} /> 4G</span> : <span className="flex gap-1"><Clock size={10} /> {tech.lastUpdate ? formatDistanceToNow(tech.lastUpdate, { addSuffix: true, locale: es }) : 'N/A'}</span>}
                                    {tech.workload > 0 && <span className="ml-auto flex gap-1 bg-blue-500/10 text-blue-500 px-1.5 py-0.5 rounded"><Zap size={10} /> {tech.workload}</span>}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Toggle (Collapsed) */}
            {!isSidebarOpen && (
                <button onClick={() => setIsSidebarOpen(true)} className="absolute top-6 left-0 bg-white shadow-xl p-2 rounded-r-xl z-20 hover:pl-4 transition-all"><ChevronRight className="text-slate-700" /></button>
            )}
        </div>
    );
};

export default FleetMapbox;
