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
 * FleetMapbox - PRO LEVEL UI/UX
 * 
 * Features:
 * - Immersive Full-Screen Map
 * - Floating Glassmorphic Sidebar
 * - Interactive 3D Markers
 * - Real-time Status Pulse
 * - Dark Mode Aesthetic Support
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
    const [viewMode, setViewMode] = useState('2d'); // '2d' or '3d'

    // Initialize Mapbox map with Premium Styles
    useEffect(() => {
        if (!mapContainerRef.current) return;

        const map = new mapboxgl.Map({
            container: mapContainerRef.current,
            style: 'mapbox://styles/mapbox/dark-v11', // Premium Dark Mode
            center: [-4.4214, 36.7213], // Málaga
            zoom: 12.5,
            pitch: 45, // Cinematic angle
            bearing: -17.6,
            antialias: true,
            attributionControl: false,
            logoPosition: 'bottom-right'
        });

        map.addControl(new mapboxgl.NavigationControl({
            showCompass: true,
            showZoom: true,
            visualizePitch: true
        }), 'top-right');

        map.on('load', () => {
            console.log('✅ PRO Fleet Map loaded');
            setMapLoaded(true);

            // Add 3D Buildings Layer for "God Mode" feel
            const layers = map.getStyle().layers;
            const labelLayerId = layers.find(
                (layer) => layer.type === 'symbol' && layer.layout['text-field']
            ).id;

            map.addLayer(
                {
                    'id': 'add-3d-buildings',
                    'source': 'composite',
                    'source-layer': 'building',
                    'filter': ['==', 'extrude', 'true'],
                    'type': 'fill-extrusion',
                    'minzoom': 15,
                    'paint': {
                        'fill-extrusion-color': '#242424', // Sleek dark buildings
                        'fill-extrusion-height': [
                            'interpolate',
                            ['linear'],
                            ['zoom'],
                            15,
                            0,
                            15.05,
                            ['get', 'height']
                        ],
                        'fill-extrusion-base': [
                            'interpolate',
                            ['linear'],
                            ['zoom'],
                            15,
                            0,
                            15.05,
                            ['get', 'min_height']
                        ],
                        'fill-extrusion-opacity': 0.8
                    }
                },
                labelLayerId
            );
        });

        mapRef.current = map;

        return () => {
            map.remove();
            mapRef.current = null;
        };
    }, []);

    // Fetch and sync data
    useEffect(() => {
        fetchFleetData();

        const profileSub = supabase
            .channel('fleet-profile-updates-pro')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => {
                fetchFleetData();
            })
            .subscribe();

        const heartbeat = setInterval(() => {
            fetchFleetData();
        }, 30000); // Faster updates

        return () => {
            supabase.removeChannel(profileSub);
            clearInterval(heartbeat);
        };
    }, []);

    const fetchFleetData = async () => {
        const [profilesRes, ticketsRes] = await Promise.all([
            supabase
                .from('profiles')
                .select('id, full_name, avatar_url, current_lat, current_lng, last_location_update')
                .eq('role', 'tech')
                .eq('is_active', true),
            supabase
                .from('tickets')
                .select('technician_id')
                .gte('scheduled_at', new Date(new Date().setHours(0, 0, 0, 0)).toISOString())
                .lte('scheduled_at', new Date(new Date().setHours(23, 59, 59, 999)).toISOString())
                .neq('status', 'cancelado')
        ]);

        const techData = profilesRes.data || [];
        const tickets = ticketsRes.data || [];

        const merged = techData.map(t => {
            const workload = tickets.filter(tk => tk.technician_id === t.id).length;
            let isActive = false, lastUpdateDate = null;
            if (t.last_location_update) {
                lastUpdateDate = new Date(t.last_location_update);
                isActive = ((new Date() - lastUpdateDate) / 1000 / 60) < 5;
            }
            return {
                technician_id: t.id,
                profiles: t,
                latitude: t.current_lat || 36.7212,
                longitude: t.current_lng || -4.4217,
                workload,
                isActive,
                lastUpdate: lastUpdateDate
            };
        });

        merged.sort((a, b) => (b.isActive === a.isActive) ? b.workload - a.workload : b.isActive - a.isActive);
        setTechs(merged);
        setActiveTechsCount(merged.filter(m => m.isActive).length);
        updateMarkers(merged);
    };

    const updateMarkers = (techList) => {
        if (!mapRef.current) return;

        // Smart marker update: don't recreate if exists, just update position
        techList.forEach(tech => {
            if (markersRef.current[tech.technician_id]) {
                const marker = markersRef.current[tech.technician_id];
                marker.setLngLat([tech.longitude, tech.latitude]);

                // Update marker element style based on status
                const el = marker.getElement();
                const pulse = el.querySelector('.pulse-ring');
                if (pulse) {
                    pulse.style.opacity = tech.isActive ? '1' : '0';
                }
            } else {
                // Create new marker
                const el = document.createElement('div');
                el.className = 'tech-marker-pro';
                el.innerHTML = `
                    <div class="relative group cursor-pointer transition-transform duration-300 hover:scale-110">
                        <div class="pulse-ring absolute -inset-4 bg-blue-500/30 rounded-full blur-md ${tech.isActive ? 'animate-pulse' : 'hidden'}"></div>
                        <div class="relative w-10 h-10 rounded-full border-2 border-white/20 shadow-2xl flex items-center justify-center overflow-hidden bg-slate-800">
                             ${tech.profiles?.avatar_url
                        ? `<img src="${tech.profiles.avatar_url}" class="w-full h-full object-cover" />`
                        : `<span class="text-white font-bold text-sm">${tech.profiles?.full_name?.[0] || 'T'}</span>`
                    }
                        </div>
                        <div class="absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-slate-900 ${tech.isActive ? 'bg-emerald-500 shadow-[0_0_10px_#10b981]' : 'bg-slate-500'}"></div>
                        
                        <!-- Tooltip -->
                        <div class="absolute -top-10 left-1/2 -translate-x-1/2 bg-slate-900/90 backdrop-blur-md text-white px-3 py-1 rounded-lg text-xs font-bold whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-200 shadow-xl border border-white/10 pointer-events-none transform translate-y-2 group-hover:translate-y-0">
                            ${tech.profiles?.full_name}
                        </div>
                    </div>
                `;

                const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
                    .setLngLat([tech.longitude, tech.latitude])
                    .addTo(mapRef.current);

                el.addEventListener('click', () => handleTechClick(tech));
                markersRef.current[tech.technician_id] = marker;
            }
        });

        // Cleanup removed techs
        Object.keys(markersRef.current).forEach(id => {
            if (!techList.find(t => t.technician_id === id)) {
                markersRef.current[id].remove();
                delete markersRef.current[id];
            }
        });
    };

    const handleTechClick = (tech) => {
        setSelectedTech(tech);
        if (mapRef.current && tech.latitude) {
            mapRef.current.flyTo({
                center: [tech.longitude, tech.latitude],
                zoom: 16,
                pitch: 60,
                bearing: 0,
                duration: 2000,
                essential: true
            });
        }
    };

    const toggleSidebar = () => setIsSidebarOpen(!isSidebarOpen);

    const toggleMapStyle = () => {
        if (!mapRef.current) return;
        const currentStyle = viewMode === '2d' ? 'mapbox://styles/mapbox/satellite-streets-v12' : 'mapbox://styles/mapbox/dark-v11';
        mapRef.current.setStyle(currentStyle);
        setViewMode(viewMode === '2d' ? '3d' : '2d');
    };

    return (
        <div className="relative w-full h-[calc(100vh-80px)] overflow-hidden bg-slate-950">
            {/* Full Screen Map */}
            <div ref={mapContainerRef} className="absolute inset-0 z-0" />

            {/* Gradient Overlay for Cinematic Effect */}
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/50 via-transparent to-slate-950/20 pointer-events-none z-10" />

            {/* Floating Sidebar */}
            <div className={`absolute left-4 top-4 bottom-4 w-80 bg-slate-900/80 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl z-20 transition-transform duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] flex flex-col ${isSidebarOpen ? 'translate-x-0' : '-translate-x-[110%]'}`}>

                {/* Header */}
                <div className="p-5 border-b border-white/5 flex justify-between items-center bg-white/5">
                    <div>
                        <h2 className="text-white font-bold text-lg flex items-center gap-2">
                            <MapIcon className="text-blue-500" size={20} />
                            Fuerza de Campo
                        </h2>
                        <div className="flex items-center gap-2 mt-1">
                            <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-bold border border-emerald-500/30">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                {activeTechsCount} ONLINE
                            </span>
                            <span className="text-slate-500 text-[10px] font-medium">{techs.length} TOTAL</span>
                        </div>
                    </div>
                    <button onClick={toggleMapStyle} className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-colors" title="Cambiar Vista">
                        <Layers size={18} />
                    </button>
                </div>

                {/* Tech List */}
                <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
                    {techs.map(tech => (
                        <div
                            key={tech.technician_id}
                            onClick={() => handleTechClick(tech)}
                            className={`group p-3 rounded-xl border transition-all duration-300 cursor-pointer relative overflow-hidden ${selectedTech?.technician_id === tech.technician_id
                                    ? 'bg-blue-600/20 border-blue-500/50 shadow-[0_0_20px_rgba(37,99,235,0.2)]'
                                    : 'bg-white/5 border-transparent hover:bg-white/10 hover:border-white/10'
                                }`}
                        >
                            {/* Workload Indicator Bar */}
                            <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-transparent via-slate-700 to-transparent opacity-50" />
                            <div className={`absolute left-0 top-0 bottom-0 w-1 transition-all duration-500 ${tech.workload > 3 ? 'bg-amber-500' : 'bg-blue-500'}`} style={{ height: `${Math.min(tech.workload * 20, 100)}%` }} />

                            <div className="flex items-center gap-3 pl-2">
                                <div className="relative">
                                    <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-white/10 shadow-md">
                                        {tech.profiles?.avatar_url
                                            ? <img src={tech.profiles.avatar_url} className="w-full h-full object-cover" />
                                            : <div className="w-full h-full bg-slate-800 flex items-center justify-center text-white text-xs font-bold">{tech.profiles?.full_name?.[0]}</div>
                                        }
                                    </div>
                                    <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-slate-900 ${tech.isActive ? 'bg-emerald-500 shadow-[0_0_8px_#10b981]' : 'bg-slate-500'}`} />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h4 className={`text-sm font-bold truncate ${selectedTech?.technician_id === tech.technician_id ? 'text-blue-400' : 'text-slate-200 group-hover:text-white'}`}>
                                        {tech.profiles?.full_name}
                                    </h4>
                                    <div className="flex items-center gap-3 mt-0.5">
                                        <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                                            {tech.isActive
                                                ? <span className="text-emerald-400 flex items-center gap-1"><Signal size={10} /> 4G LTE</span>
                                                : <span className="flex items-center gap-1"><Clock size={10} /> {tech.lastUpdate ? formatDistanceToNow(tech.lastUpdate, { locale: es, addSuffix: true }) : 'N/A'}</span>
                                            }
                                        </div>
                                        {tech.workload > 0 && (
                                            <span className="flex items-center gap-1 text-[10px] text-blue-300 bg-blue-500/20 px-1.5 py-0.5 rounded">
                                                <Zap size={10} /> {tech.workload} Tareas
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Search / Footer */}
                <div className="p-4 border-t border-white/5 bg-white/5 backdrop-blur-lg">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                        <input
                            type="text"
                            placeholder="Buscar técnico..."
                            className="w-full bg-slate-950/50 border border-white/10 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50 transition-colors"
                        />
                    </div>
                </div>
            </div>

            {/* Toggle Button */}
            <button
                onClick={toggleSidebar}
                className={`absolute top-6 z-20 bg-slate-900/90 text-white p-2 rounded-r-xl shadow-xl transition-all duration-500 hover:bg-blue-600 hover:pr-3 border-y border-r border-white/10 ${isSidebarOpen ? 'left-80' : 'left-0'}`}
            >
                {isSidebarOpen ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
            </button>

            {/* Global Styles for Map HUD */}
            <style>{`
                .mapboxgl-ctrl-group {
                    background-color: rgba(15, 23, 42, 0.8) !important;
                    backdrop-filter: blur(12px);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                }
                .mapboxgl-ctrl button {
                    color: rgba(255, 255, 255, 0.7) !important;
                }
                .mapboxgl-ctrl button:hover {
                    background-color: rgba(255, 255, 255, 0.1) !important;
                    color: white !important;
                }
                .custom-scrollbar::-webkit-scrollbar {
                    width: 4px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: transparent;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background: rgba(255, 255, 255, 0.1);
                    border-radius: 10px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                    background: rgba(255, 255, 255, 0.2);
                }
            `}</style>
        </div>
    );
};

export default FleetMapbox;
