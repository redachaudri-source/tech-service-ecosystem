import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { supabase } from '../lib/supabase';
import { User, Signal, Clock } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';

// Configure Mapbox token
mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN;

/**
 * FleetMapbox - Mapbox-based Fleet Tracking
 * Replacement for Google Maps FleetMap
 */
const FleetMapbox = () => {
    const mapContainerRef = useRef(null);
    const mapRef = useRef(null);
    const markersRef = useRef({});
    const [techs, setTechs] = useState([]);
    const [selectedTech, setSelectedTech] = useState(null);
    const [activeTechsCount, setActiveTechsCount] = useState(0);

    // Initialize Mapbox map
    useEffect(() => {
        if (!mapContainerRef.current) return;

        const map = new mapboxgl.Map({
            container: mapContainerRef.current,
            style: 'mapbox://styles/mapbox/navigation-day-v1',
            center: [-4.4214, 36.7213], // Málaga
            zoom: 12,
            attributionControl: false,
            logoPosition: 'bottom-right'
        });

        map.addControl(new mapboxgl.NavigationControl({
            showCompass: true,
            showZoom: true,
            visualizePitch: false
        }), 'top-right');

        map.on('load', () => {
            console.log('✅ Fleet Map loaded (Mapbox)');
        });

        mapRef.current = map;

        return () => {
            map.remove();
            mapRef.current = null;
        };
    }, []);

    // Fetch fleet data
    useEffect(() => {
        fetchFleetData();

        const profileSub = supabase
            .channel('fleet-profile-updates')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => {
                fetchFleetData();
            })
            .subscribe();

        const heartbeat = setInterval(() => {
            fetchFleetData();
        }, 60000);

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

        // Update markers
        updateMarkers(merged);
    };

    const updateMarkers = (techList) => {
        if (!mapRef.current) return;

        // Remove old markers
        Object.values(markersRef.current).forEach(marker => marker.remove());
        markersRef.current = {};

        // Add new markers
        techList.forEach(tech => {
            const el = document.createElement('div');
            el.className = 'tech-marker';
            el.style.width = '32px';
            el.style.height = '32px';
            el.style.cursor = 'pointer';

            el.innerHTML = `
                <div style="position: relative;">
                    <div style="
                        width: 32px;
                        height: 32px;
                        border-radius: 50%;
                        border: 2px solid white;
                        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
                        background: ${tech.isActive ? 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)' : '#94a3b8'};
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        color: white;
                        font-weight: bold;
                        font-size: 14px;
                    ">
                        ${tech.profiles?.full_name?.[0] || 'T'}
                    </div>
                    ${tech.isActive ? '<div style="position: absolute; top: 0; left: 0; width: 32px; height: 32px; border-radius: 50%; background: #3b82f6; opacity: 0.5; animation: ping 1s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>' : ''}
                </div>
            `;

            const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
                .setLngLat([tech.longitude, tech.latitude])
                .addTo(mapRef.current);

            el.addEventListener('click', () => handleTechClick(tech));

            markersRef.current[tech.technician_id] = marker;
        });
    };

    const handleTechClick = (tech) => {
        setSelectedTech(tech);
        if (mapRef.current && tech.latitude) {
            mapRef.current.flyTo({
                center: [tech.longitude, tech.latitude],
                zoom: 14,
                duration: 1500
            });
        }
    };

    return (
        <div className="flex flex-col lg:flex-row gap-4 h-[calc(100vh-140px)]">
            {/* Sidebar */}
            <div className="order-2 lg:order-2 w-full lg:w-1/3 xl:w-1/4 flex flex-col gap-4">
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex-1 flex flex-col overflow-hidden">
                    <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                        <h3 className="font-bold text-slate-700 flex items-center gap-2">
                            <User size={16} /> Fuerza de Campo
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
                                className={`p-3 rounded-lg border transition-all cursor-pointer flex items-center justify-between group ${selectedTech?.technician_id === tech.technician_id
                                        ? 'bg-blue-50 border-blue-200 ring-1 ring-blue-300'
                                        : 'bg-white border-slate-100 hover:border-blue-200'
                                    }`}
                            >
                                <div className="flex items-center gap-3">
                                    <div className="relative">
                                        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm shadow-sm ${tech.isActive ? 'bg-blue-600' : 'bg-slate-300 grayscale'
                                            }`}>
                                            {tech.profiles?.full_name?.[0] || 'T'}
                                        </div>
                                        <div className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 border-2 border-white rounded-full ${tech.isActive ? 'bg-green-500 animate-pulse' : 'bg-slate-400'
                                            }`} />
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
                                                    <Clock size={10} />
                                                    {tech.lastUpdate ? formatDistanceToNow(tech.lastUpdate, { addSuffix: true, locale: es }) : 'Sin señal'}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className={`text-xs font-black px-2 py-1 rounded-lg text-center min-w-[30px] ${tech.workload > 4 ? 'bg-red-100 text-red-600' :
                                            tech.workload > 0 ? 'bg-blue-100 text-blue-600' :
                                                'bg-slate-100 text-slate-400'
                                        }`}>
                                        {tech.workload}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Map */}
            <div className="order-1 lg:order-1 flex-1 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden relative">
                <div ref={mapContainerRef} className="h-full w-full" />

                {/* Status overlay */}
                <div className="absolute top-4 left-4 bg-white/90 backdrop-blur-sm p-3 rounded-xl shadow-lg border border-white/50 z-10">
                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Estado GSM</h4>
                    <div className="flex items-center gap-2">
                        <div className="flex flex-col">
                            <span className="text-sm font-bold text-slate-700 flex items-center gap-2">
                                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                                {activeTechsCount} Online
                            </span>
                            <span className="text-[10px] text-slate-500">{techs.length - activeTechsCount} Offline</span>
                        </div>
                    </div>
                </div>
            </div>

            <style>{`
                @keyframes ping {
                    75%, 100% {
                        transform: scale(2);
                        opacity: 0;
                    }
                }
            `}</style>
        </div>
    );
};

export default FleetMapbox;
