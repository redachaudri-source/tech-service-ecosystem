import { useEffect, useRef, useState } from 'react';
import ReactDOMServer from 'react-dom/server';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { supabase } from '../lib/supabase';
import { Signal, Clock, Search, MapIcon, Layers, ChevronLeft, ChevronRight, Navigation, Home, Store, Zap, TrendingUp, Activity, Calendar } from 'lucide-react';
import { formatDistanceToNow, format, startOfDay, endOfDay } from 'date-fns';
import { es } from 'date-fns/locale';
import { MAPBOX_TOKEN } from '../config/mapbox';
import StopMarker from './map/StopMarker';

mapboxgl.accessToken = MAPBOX_TOKEN;

/**
 * FleetMapbox - PREMIUM EDITION
 * 
 * Aesthetic: Warm, Professional, Sophisticated
 * Inspired by: Apple Maps, Tesla Dashboard, Notion
 */
const FleetMapbox = () => {
    const mapContainerRef = useRef(null);
    const mapRef = useRef(null);
    const markersRef = useRef({});
    const routeMarkersRef = useRef([]);
    const stopMarkersRef = useRef([]); // NEW: Stop markers

    const [techs, setTechs] = useState([]);
    const [selectedTech, setSelectedTech] = useState(null);
    const [techItinerary, setTechItinerary] = useState([]);
    const [techStops, setTechStops] = useState([]); // NEW: Stops for selected tech
    const [activeTechsCount, setActiveTechsCount] = useState(0);
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);
    const [mapStyle, setMapStyle] = useState('light');
    const [showTraffic, setShowTraffic] = useState(false);
    const [isMapSettingsOpen, setIsMapSettingsOpen] = useState(false);
    const [showStops, setShowStops] = useState(true); // NEW: Toggle stops visibility

    // MAP INIT
    useEffect(() => {
        if (!mapContainerRef.current) return;

        const map = new mapboxgl.Map({
            container: mapContainerRef.current,
            style: 'mapbox://styles/mapbox/light-v11',
            center: [-4.4214, 36.7213],
            zoom: 12,
            pitch: 0,
            bearing: 0,
            attributionControl: false
        });

        // Listen for style changes
        map.on('style.load', () => {
            console.log('Map style loaded:', mapStyle);
        });

        map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'bottom-right');
        mapRef.current = map;
        return () => map.remove();
    }, []);

    // DATA FETCHING
    useEffect(() => {
        fetchFleetData();
        const sub = supabase.channel('fleet-premium').on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, fetchFleetData).subscribe();
        const interval = setInterval(fetchFleetData, 60000);
        return () => { supabase.removeChannel(sub); clearInterval(interval); };
    }, []);

    const fetchFleetData = async () => {
        try {
            const now = new Date();
            // STRICT: Only Today (00:00:00 to 23:59:59)
            const start = new Date(now);
            start.setHours(0, 0, 0, 0);

            const end = new Date(now);
            end.setHours(23, 59, 59, 999);

            const startDate = start.toISOString();
            const endDate = end.toISOString();

            console.log('🔍 Fetching with defensive strategy:', { startDate, endDate });

            // 1. Fetch Profiles first (Safe)
            const { data: profiles, error: profilesError } = await supabase
                .from('profiles')
                .select('id, full_name, avatar_url, current_lat, current_lng, last_location_update')
                .eq('role', 'tech')
                .eq('is_active', true);

            if (profilesError) {
                console.error("❌ Error fetching profiles:", profilesError);
                return;
            }

            // 2. Fetch Tickets separately with robust error handling
            // 2. EMERGENCY STRATEGY: Manual Join (No Supabase Relationship)
            // Step A: Fetch Tickets RAW (only IDs)
            // Note: client_id might be stored in a different column if the relationship is failing
            // We fetch the raw ticket first
            const { data: ticketsRaw, error: ticketsError } = await supabase
                .from('tickets')
                .select('*') // Wildcard is safer
                .gte('scheduled_at', startDate)
                .lte('scheduled_at', endDate);

            if (ticketsError) {
                console.error("❌ CRITICAL ERROR fetching tickets raw:", ticketsError);
                // Continue with empty array instead of returning to avoid crash
            }

            const validTicketsRaw = ticketsRaw || [];

            // Step B: Extract Client IDs (Strict Validation)
            // Trim and lowercase to avoid UUID format errors
            // Step B: Extract Client IDs (Strict Validation)
            // Aggressive cleanup: Remove anything that is NOT a hex char or hyphen
            const clientIds = [...new Set(validTicketsRaw
                .map(t => t.client_id)
                .filter(id => id && typeof id === 'string' && id.length > 10)
                .map(id => id.replace(/[^a-f0-9-]/gi, '').toLowerCase())
            )];

            console.log("🧨 CLIENT IDS CLEANED:", JSON.stringify(clientIds));

            // Step C: Fetch Client Profiles manually (ROBUST PARALLEL FETCH)
            // Instead of .in() which crashes on one bad ID, we fetch individually
            let clientsMap = {};
            if (clientIds.length > 0) {
                // Fetch independently to isolate errors
                const results = await Promise.all(clientIds.map(async (id) => {
                    const { data, error } = await supabase
                        .from('profiles')
                        .select('id, full_name, address, current_lat, current_lng, latitude, longitude')
                        .eq('id', id)
                        .maybeSingle();

                    if (error) console.warn(`⚠️ Error fetching profile ${id}:`, error.message);

                    if (data) {
                        // Priority: Explicit Latitude/Longitude (from address) > Current Location (Real-time)
                        let lat = data.latitude || data.current_lat;
                        let lng = data.longitude || data.current_lng;
                        let wasGeocoded = false;

                        // AUTOMATIC GEOCODING (Fallback if no GPS but Address exists)
                        if ((!lat || !lng) && data.address && data.address.length > 5) {
                            try {
                                const geoUrl = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(data.address)}.json?access_token=${mapboxgl.accessToken}&limit=1&country=es`;
                                // Note: We fetch sequentially inside Promise.all which is fine for small batches.
                                // For production, we might want to throttle or cache this.
                                const geoRes = await fetch(geoUrl);
                                const geoJson = await geoRes.json();
                                if (geoJson.features && geoJson.features.length > 0) {
                                    const [gLng, gLat] = geoJson.features[0].center;
                                    lat = gLat;
                                    lng = gLng;
                                    wasGeocoded = true;
                                    console.log(`📍 Geocoded: "${data.address}" -> [${lat}, ${lng}]`);
                                }
                            } catch (err) {
                                console.error("Geocoding failed:", err);
                            }
                        }

                        return {
                            ...data,
                            latitude: lat,
                            longitude: lng,
                            isGeocoded: wasGeocoded
                        };
                    }
                    return null;
                }));

                const validProfiles = results.filter(Boolean);
                clientsMap = validProfiles.reduce((acc, c) => ({ ...acc, [c.id]: c }), {});
                console.log(`✅ PERFILES OK: ${validProfiles.length} de ${clientIds.length}`);
            }

            // Step D: Merge Manually
            const allTickets = validTicketsRaw.map(t => ({
                ...t,
                client: t.client_id ? (clientsMap[t.client_id] || {}) : {},
            }));

            if (allTickets.length > 0) {
                console.log('🔍 DEBUG MERGE:', allTickets[0]);
            }


            // Filter valid tickets
            const validTickets = allTickets.filter(t => {
                const s = (t.status || '').toLowerCase();
                return !['cancelado', 'rechazado', 'anulado'].includes(s);
            });

            console.log(`📦 Tickets merged manually: ${validTickets.length}`);

            // Merge Data
            const merged = (profiles || []).map(t => {
                const myTickets = validTickets.filter(tk => tk.technician_id === t.id);
                // Workload logic
                const workload = myTickets.filter(tk => {
                    const s = (tk.status || '').toLowerCase();
                    return !['completado', 'finalizado'].includes(s);
                }).length;

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
                    setTechStops(updated.allTickets); // Update stops
                    console.log('✅ Stops updated for:', updated.full_name);
                }
            }

        } catch (e) {
            console.error("🔥 EXCEPTION in fetchFleetData:", e);
        }
    };

    // AUTO-RENDER STOPS when tech/stops/showStops changes
    useEffect(() => {
        if (selectedTech && techStops.length > 0) {
            renderStopMarkers(techStops);
        } else {
            // Clear stops if no tech selected
            stopMarkersRef.current.forEach(marker => marker.remove());
            stopMarkersRef.current = [];
        }
    }, [selectedTech, techStops, showStops]);

    const toggle3DView = () => {
        if (!mapRef.current) return;
        const currentPitch = mapRef.current.getPitch();

        if (currentPitch === 0) {
            // Enable 3D
            mapRef.current.easeTo({ pitch: 60, duration: 1000 });
            setMapStyle('3d');

            // Add 3D buildings if not already added
            setTimeout(() => {
                if (!mapRef.current.getLayer('3d-buildings')) {
                    const layers = mapRef.current.getStyle().layers;
                    const labelLayerId = layers.find(l => l.type === 'symbol' && l.layout['text-field'])?.id;

                    if (labelLayerId) {
                        mapRef.current.addLayer({
                            'id': '3d-buildings',
                            'source': 'composite',
                            'source-layer': 'building',
                            'filter': ['==', 'extrude', 'true'],
                            'type': 'fill-extrusion',
                            'minzoom': 14,
                            'paint': {
                                'fill-extrusion-color': '#aaa',
                                'fill-extrusion-height': ['interpolate', ['linear'], ['zoom'], 15, 0, 15.05, ['get', 'height']],
                                'fill-extrusion-base': ['interpolate', ['linear'], ['zoom'], 15, 0, 15.05, ['get', 'min_height']],
                                'fill-extrusion-opacity': 0.6
                            }
                        }, labelLayerId);
                    }
                }
            }, 1000);
        } else {
            // Disable 3D
            mapRef.current.easeTo({ pitch: 0, duration: 1000 });
            if (mapRef.current.getLayer('3d-buildings')) {
                mapRef.current.removeLayer('3d-buildings');
            }
        }
    };

    const toggleTraffic = () => {
        if (!mapRef.current) return;

        if (showTraffic) {
            // Remove traffic layer
            if (mapRef.current.getLayer('traffic')) {
                mapRef.current.removeLayer('traffic');
            }
            if (mapRef.current.getSource('traffic')) {
                mapRef.current.removeSource('traffic');
            }
            setShowTraffic(false);
        } else {
            // Add traffic layer
            mapRef.current.addSource('traffic', {
                type: 'vector',
                url: 'mapbox://mapbox.mapbox-traffic-v1'
            });

            mapRef.current.addLayer({
                'id': 'traffic',
                'type': 'line',
                'source': 'traffic',
                'source-layer': 'traffic',
                'paint': {
                    'line-width': 3,
                    'line-color': [
                        'case',
                        ['==', ['get', 'congestion'], 'low'], '#10b981',
                        ['==', ['get', 'congestion'], 'moderate'], '#f59e0b',
                        ['==', ['get', 'congestion'], 'heavy'], '#ef4444',
                        ['==', ['get', 'congestion'], 'severe'], '#991b1b',
                        '#6b7280'
                    ]
                }
            });
            setShowTraffic(true);
        }
    };

    const updateMarkers = (list) => {
        if (!mapRef.current) return;

        list.forEach(tech => {
            let marker = markersRef.current[tech.id];

            const html = `
                <div class="relative group cursor-pointer hover:z-50 transition-all duration-300">
                    <!-- Glow Effect -->
                    <div class="absolute -inset-4 bg-gradient-to-r from-blue-500/20 to-purple-500/20 rounded-full blur-lg opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                    
                    <!-- Main Container -->
                    <div class="relative">
                        <!-- Avatar Ring -->
                        <div class="w-14 h-14 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 p-[2px] shadow-lg shadow-blue-500/30 transition-transform group-hover:scale-110 duration-300">
                            <div class="w-full h-full rounded-full overflow-hidden bg-white">
                                ${tech.avatar_url
                    ? `<img src="${tech.avatar_url}" class="w-full h-full object-cover" />`
                    : `<div class="w-full h-full bg-gradient-to-br from-blue-100 to-purple-100 flex items-center justify-center"><span class="text-blue-600 font-bold text-lg">${tech.full_name[0]}</span></div>`
                }
                            </div>
                        </div>

                        <!-- Status Indicator -->
                        <div class="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full border-[3px] border-white ${tech.isActive ? 'bg-gradient-to-r from-emerald-400 to-green-500 shadow-lg shadow-emerald-500/50' : 'bg-gray-300'} transition-all"></div>
                        
                        <!-- Task Badge -->
                        ${tech.workload > 0 ? `
                            <div class="absolute -top-2 -right-2 min-w-[24px] h-6 px-2 flex items-center justify-center bg-gradient-to-r from-orange-500 to-red-500 text-white text-xs font-bold rounded-full shadow-lg shadow-orange-500/40 border-2 border-white">
                                ${tech.workload}
                            </div>
                        ` : ''}
                    </div>
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

    // CREATE STOP ICON (House Marker)
    const createStopIcon = (stop) => {
        const isActive = stop.status === 'en_proceso';
        const status = stop.status || 'pendiente';

        // Render React component to HTML string
        const svgHtml = ReactDOMServer.renderToString(
            <StopMarker status={status} isActive={isActive} />
        );

        const el = document.createElement('div');
        el.innerHTML = svgHtml;
        el.style.cursor = 'pointer';
        el.className = 'stop-marker-container';

        return el;
    };

    // RENDER STOP MARKERS
    const renderStopMarkers = (stops) => {
        // Clear previous stop markers
        stopMarkersRef.current.forEach(marker => marker.remove());
        stopMarkersRef.current = [];

        if (!showStops || !selectedTech || !mapRef.current || stops.length === 0) return;

        stops.forEach(stop => {
            // Validate coordinates - Support both new 'client' and old 'clients' structure
            const clientData = stop.client || stop.clients || {};

            if (!clientData.latitude || !clientData.longitude) {
                console.warn('Stop missing coordinates:', stop.id, clientData);
                return;
            }

            const el = createStopIcon(stop);

            // Create popup content
            const popupContent = `
                <div class="p-3 min-w-[200px]">
                    <h3 class="font-bold text-sm text-slate-800 mb-1">${clientData.full_name || 'Cliente'}</h3>
                    <p class="text-xs text-slate-600 mb-2">${stop.title || 'Sin título'}</p>
                    <div class="flex items-center gap-2 text-xs text-slate-500">
                        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span>${new Date(stop.scheduled_at).toLocaleTimeString('es-ES', {
                hour: '2-digit',
                minute: '2-digit'
            })}</span>
                    </div>
                    ${stop.appliance_type ? `
                        <div class="mt-2 text-xs text-slate-500">
                            <span class="font-medium">Tipo:</span> ${stop.appliance_type}
                        </div>
                    ` : ''}
                </div>
            `;

            const popup = new mapboxgl.Popup({
                offset: 25,
                closeButton: false,
                className: 'stop-popup'
            }).setHTML(popupContent);

            const marker = new mapboxgl.Marker({ element: el })
                .setLngLat([Number(clientData.longitude), Number(clientData.latitude)])
                .setPopup(popup)
                .addTo(mapRef.current);

            stopMarkersRef.current.push(marker);
        });

        console.log(`✅ Rendered ${stopMarkersRef.current.length} stop markers`);
    };

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

        if (mapRef.current.getLayer('route-line')) mapRef.current.removeLayer('route-line');
        if (mapRef.current.getSource('route-source')) mapRef.current.removeSource('route-source');
        routeMarkersRef.current.forEach(m => m.remove());
        routeMarkersRef.current = [];

        tickets.forEach(t => {
            if (!t.clients?.latitude) return;
            const isNext = t.status === 'en_camino' || t.status === 'en_proceso';
            const isDone = t.status === 'completado';

            const el = document.createElement('div');
            el.innerHTML = `
                <div class="relative group hover:z-50">
                    <div class="absolute -top-14 left-1/2 -translate-x-1/2 bg-gradient-to-r from-slate-900 to-slate-800 text-white px-3 py-2 rounded-xl text-xs font-medium opacity-0 group-hover:opacity-100 transition-all pointer-events-none whitespace-nowrap shadow-xl border border-white/10 backdrop-blur-sm">
                        <div class="font-bold">${t.clients.full_name}</div>
                        <div class="text-slate-300 text-[10px] mt-0.5">${t.appliance_type} • ${format(new Date(t.scheduled_at), 'HH:mm')}</div>
                    </div>
                    
                    <div class="w-10 h-10 flex items-center justify-center rounded-xl shadow-lg transition-all hover:scale-110 ${isNext ? 'bg-gradient-to-br from-blue-500 to-purple-600 shadow-blue-500/50 scale-110' :
                    isDone ? 'bg-gradient-to-br from-emerald-400 to-green-500 shadow-emerald-500/30 opacity-70' :
                        'bg-white border-2 border-gray-200'
                }">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${isNext || isDone ? 'white' : '#6b7280'}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                            <polyline points="9 22 9 12 15 12 15 22"></polyline>
                        </svg>
                    </div>
                </div>
            `;
            const marker = new mapboxgl.Marker({ element: el }).setLngLat([t.clients.longitude, t.clients.latitude]).addTo(mapRef.current);
            routeMarkersRef.current.push(marker);
        });

        const activeJob = tickets.find(t => t.status === 'en_camino') || tickets.find(t => t.status === 'asignado');
        if (activeJob?.clients?.latitude && tech.longitude) {
            try {
                const query = await fetch(`https://api.mapbox.com/directions/v5/mapbox/driving/${tech.longitude},${tech.latitude};${activeJob.clients.longitude},${activeJob.clients.latitude}?steps=true&geometries=geojson&access_token=${mapboxgl.accessToken}`);
                const json = await query.json();
                const route = json.routes?.[0]?.geometry?.coordinates;
                if (route) {
                    mapRef.current.addSource('route-source', { 'type': 'geojson', 'data': { 'type': 'Feature', 'geometry': { 'type': 'LineString', 'coordinates': route } } });
                    mapRef.current.addLayer({
                        'id': 'route-line',
                        'type': 'line',
                        'source': 'route-source',
                        'layout': { 'line-join': 'round', 'line-cap': 'round' },
                        'paint': {
                            'line-color': ['interpolate', ['linear'], ['line-progress'], 0, '#3b82f6', 1, '#8b5cf6'],
                            'line-width': 5,
                            'line-opacity': 0.8,
                            'line-gradient': ['interpolate', ['linear'], ['line-progress'], 0, '#3b82f6', 1, '#8b5cf6']
                        }
                    });
                }
            } catch (e) { console.error(e); }
        }
    };

    return (
        <div className="relative w-full h-[calc(100vh-80px)] overflow-hidden bg-gradient-to-br from-slate-50 via-blue-50/30 to-purple-50/30 flex">

            {/* MAP */}
            <div className="flex-1 relative">
                <div ref={mapContainerRef} className="absolute inset-0 z-0" />

                {/* Ambient Overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-white/20 via-transparent to-transparent pointer-events-none z-10"></div>

                {/* Map Controls - Top Right */}
                <div className="absolute top-6 right-6 flex flex-col gap-3 z-20">
                    {/* Refresh Button */}
                    <button onClick={() => fetchFleetData()} className="group w-12 h-12 flex items-center justify-center bg-white/90 backdrop-blur-xl text-blue-600 rounded-2xl shadow-lg shadow-blue-500/10 border border-white/50 hover:shadow-xl hover:shadow-blue-500/20 transition-all duration-300 hover:scale-105 active:scale-95">
                        <Signal size={20} className="group-hover:animate-pulse" />
                    </button>

                    {/* Settings Panel Toggle */}
                    <button
                        onClick={() => setIsMapSettingsOpen(!isMapSettingsOpen)}
                        className="group w-12 h-12 flex items-center justify-center bg-white/90 backdrop-blur-xl text-slate-700 rounded-2xl shadow-lg shadow-slate-900/10 border border-white/50 hover:shadow-xl hover:bg-gradient-to-br hover:from-blue-500 hover:to-purple-600 hover:text-white transition-all duration-300 hover:scale-105 active:scale-95"
                        title="Configuración del Mapa"
                    >
                        <Layers size={20} className={`transition-transform duration-300 ${isMapSettingsOpen ? 'rotate-180' : ''}`} />
                    </button>

                    {/* Stop Markers Toggle */}
                    <button
                        onClick={() => setShowStops(!showStops)}
                        className={`group w-12 h-12 flex items-center justify-center backdrop-blur-xl rounded-2xl shadow-lg border border-white/50 transition-all duration-300 hover:scale-105 active:scale-95 ${showStops
                            ? 'bg-gradient-to-br from-emerald-500 to-green-600 text-white shadow-emerald-500/20 hover:shadow-emerald-500/30'
                            : 'bg-white/90 text-slate-700 shadow-slate-900/10 hover:shadow-xl'
                            }`}
                        title={showStops ? "Ocultar Paradas" : "Mostrar Paradas"}
                    >
                        <Home size={20} className={showStops ? 'animate-pulse' : ''} />
                    </button>
                </div>

                {/* Collapsible Settings Panel - Expands Left */}
                <div className={`
                    absolute top-6 right-20 z-20
                    overflow-hidden transition-all duration-300 ease-out origin-right
                    ${isMapSettingsOpen ? 'opacity-100 scale-100' : 'opacity-0 scale-95 pointer-events-none'}
                `}>
                    <div className="bg-white/90 backdrop-blur-xl rounded-2xl shadow-xl shadow-slate-900/10 border border-white/50 p-4 space-y-3 min-w-[200px]">
                        {/* Section: Estilo de Mapa */}
                        <div>
                            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Estilo de Mapa</h3>
                            <div className="grid grid-cols-2 gap-2">
                                <button
                                    onClick={() => { setMapStyle('light'); mapRef.current?.setStyle('mapbox://styles/mapbox/light-v11'); }}
                                    className={`px-3 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${mapStyle === 'light'
                                        ? 'bg-gradient-to-r from-blue-500 to-purple-600 text-white shadow-md'
                                        : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                                        }`}
                                >
                                    ☀️ Claro
                                </button>
                                <button
                                    onClick={() => { setMapStyle('satellite'); mapRef.current?.setStyle('mapbox://styles/mapbox/satellite-streets-v12'); }}
                                    className={`px-3 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${mapStyle === 'satellite'
                                        ? 'bg-gradient-to-r from-blue-500 to-purple-600 text-white shadow-md'
                                        : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                                        }`}
                                >
                                    🛰️ Satélite
                                </button>
                                <button
                                    onClick={() => { setMapStyle('dark'); mapRef.current?.setStyle('mapbox://styles/mapbox/dark-v11'); }}
                                    className={`px-3 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${mapStyle === 'dark'
                                        ? 'bg-gradient-to-r from-blue-500 to-purple-600 text-white shadow-md'
                                        : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                                        }`}
                                >
                                    🌙 Oscuro
                                </button>
                                <button
                                    onClick={toggle3DView}
                                    className={`px-3 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${mapStyle === '3d'
                                        ? 'bg-gradient-to-r from-blue-500 to-purple-600 text-white shadow-md'
                                        : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                                        }`}
                                >
                                    🏙️ 3D
                                </button>
                            </div>
                        </div>

                        {/* Divider */}
                        <div className="h-px bg-slate-200"></div>

                        {/* Section: Capas */}
                        <div>
                            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Capas</h3>
                            <button
                                onClick={toggleTraffic}
                                className={`w-full px-3 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-between ${showTraffic
                                    ? 'bg-gradient-to-r from-orange-500 to-red-500 text-white shadow-md'
                                    : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                                    }`}
                            >
                                <span className="flex items-center gap-2">
                                    🚦 Tráfico
                                </span>
                                <span className="text-[10px] opacity-70">{showTraffic ? 'ON' : 'OFF'}</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* PREMIUM SIDEBAR */}
            <div className={`
                absolute top-6 left-6 bottom-6 z-30 transition-all duration-500 ease-out
                ${isSidebarOpen ? 'translate-x-0 opacity-100' : '-translate-x-[120%] opacity-0'}
                w-[420px]
            `}>
                <div className="h-full bg-white/80 backdrop-blur-2xl rounded-3xl shadow-2xl shadow-slate-900/10 border border-white/50 flex flex-col overflow-hidden">

                    {/* Header */}
                    <div className="relative p-6 bg-gradient-to-br from-blue-600 via-blue-500 to-purple-600 text-white">
                        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAxMCAwIEwgMCAwIDAgMTAiIGZpbGw9Im5vbmUiIHN0cm9rZT0id2hpdGUiIHN0cm9rZS1vcGFjaXR5PSIwLjA1IiBzdHJva2Utd2lkdGg9IjEiLz48L3BhdHRlcm4+PC9kZWZzPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9InVybCgjZ3JpZCkiLz48L3N2Zz4=')] opacity-30"></div>

                        <div className="relative flex justify-between items-start mb-6">
                            <div>
                                <h1 className="text-2xl font-bold tracking-tight mb-1 flex items-center gap-2">
                                    <div className="w-8 h-8 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm">
                                        <MapIcon size={18} />
                                    </div>
                                    Fuerza de Campo
                                </h1>
                                <p className="text-blue-100 text-sm font-medium">Control en Tiempo Real</p>
                            </div>
                            <button onClick={() => setIsSidebarOpen(false)} className="p-2 hover:bg-white/20 rounded-xl transition-colors backdrop-blur-sm">
                                <ChevronLeft size={20} />
                            </button>
                        </div>

                        {selectedTech ? (
                            <div className="relative bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-white/20">
                                <div className="flex items-center gap-4">
                                    <div className="relative">
                                        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-white to-blue-50 p-0.5 shadow-lg">
                                            <div className="w-full h-full rounded-2xl overflow-hidden">
                                                <img src={selectedTech.avatar_url} className="w-full h-full object-cover" />
                                            </div>
                                        </div>
                                        <div className={`absolute -bottom-1 -right-1 w-5 h-5 rounded-full border-[3px] border-blue-600 ${selectedTech.isActive ? 'bg-emerald-400' : 'bg-gray-300'}`}></div>
                                    </div>
                                    <div className="flex-1">
                                        <h2 className="text-xl font-bold leading-tight mb-1">{selectedTech.full_name}</h2>
                                        <div className="flex items-center gap-2">
                                            <span className={`text-xs font-bold px-2.5 py-1 rounded-lg ${selectedTech.isActive ? 'bg-emerald-400/20 text-emerald-100 border border-emerald-300/30' : 'bg-white/20 text-white/70'}`}>
                                                {selectedTech.isActive ? '● En Línea' : 'Desconectado'}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                <button onClick={() => setSelectedTech(null)} className="mt-3 w-full py-2.5 bg-white/10 hover:bg-white/20 text-white text-sm font-medium rounded-xl transition-all border border-white/20">
                                    ← Ver todos
                                </button>
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 gap-2">
                                <div className="relative overflow-hidden bg-white/10 backdrop-blur-md rounded-xl p-3 border border-white/20">
                                    <div className="absolute top-0 right-0 w-16 h-16 bg-emerald-400/20 rounded-full blur-xl"></div>
                                    <div className="relative">
                                        <Activity size={16} className="text-emerald-300 mb-1" />
                                        <div className="text-2xl font-black mb-0.5">{activeTechsCount}</div>
                                        <div className="text-[10px] font-bold text-blue-100 uppercase tracking-wider">Activos</div>
                                    </div>
                                </div>
                                <div className="relative overflow-hidden bg-white/10 backdrop-blur-md rounded-xl p-3 border border-white/20">
                                    <div className="absolute top-0 right-0 w-16 h-16 bg-purple-400/20 rounded-full blur-xl"></div>
                                    <div className="relative">
                                        <TrendingUp size={16} className="text-purple-300 mb-1" />
                                        <div className="text-2xl font-black text-white/90 mb-0.5">{techs.length}</div>
                                        <div className="text-[10px] font-bold text-blue-100/80 uppercase tracking-wider">Total</div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 overflow-y-auto custom-scrollbar p-6 bg-gradient-to-b from-transparent to-slate-50/50">
                        {selectedTech ? (
                            <div>
                                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-6 flex items-center gap-2">
                                    <div className="w-1 h-1 bg-blue-500 rounded-full"></div>
                                    Itinerario de Hoy
                                </h3>

                                <div className="space-y-4">
                                    {techItinerary.map((t, idx) => {
                                        const isDone = t.status === 'completado';
                                        const isActive = t.status === 'en_camino' || t.status === 'en_proceso';

                                        return (
                                            <div key={t.id} className="group relative">
                                                <div className={`
                                                    relative p-5 rounded-2xl border-2 transition-all duration-300
                                                    ${isActive
                                                        ? 'bg-gradient-to-br from-blue-500 to-purple-600 border-transparent shadow-lg shadow-blue-500/30 text-white scale-[1.02]'
                                                        : isDone
                                                            ? 'bg-gradient-to-br from-emerald-50 to-green-50 border-emerald-200/50 opacity-75'
                                                            : 'bg-white border-slate-100 hover:border-slate-200 hover:shadow-md'
                                                    }
                                                `}>
                                                    {isActive && (
                                                        <div className="absolute -top-2 -right-2 w-6 h-6 bg-white rounded-full flex items-center justify-center shadow-lg">
                                                            <Navigation size={14} className="text-blue-600" />
                                                        </div>
                                                    )}

                                                    <div className="flex justify-between items-start mb-3">
                                                        <span className={`text-2xl font-black ${isActive ? 'text-white' : isDone ? 'text-emerald-600' : 'text-slate-800'}`}>
                                                            {format(new Date(t.scheduled_at), 'HH:mm')}
                                                        </span>
                                                        <span className={`text-[10px] font-bold px-2.5 py-1 rounded-lg uppercase tracking-wider ${isDone ? 'bg-emerald-500/20 text-emerald-700' :
                                                            isActive ? 'bg-white/20 text-white' :
                                                                'bg-slate-100 text-slate-500'
                                                            }`}>
                                                            {t.status.replace('_', ' ')}
                                                        </span>
                                                    </div>

                                                    <div className={`font-bold text-base mb-2 ${isActive ? 'text-white' : isDone ? 'text-emerald-900' : 'text-slate-800'}`}>
                                                        {t.clients?.full_name}
                                                    </div>
                                                    <div className={`text-sm flex items-center gap-2 mb-3 ${isActive ? 'text-blue-100' : isDone ? 'text-emerald-600' : 'text-slate-500'}`}>
                                                        <Home size={14} />
                                                        <span className="truncate">{t.clients?.address}</span>
                                                    </div>

                                                    <div className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium ${isActive ? 'bg-white/20 text-white' :
                                                        isDone ? 'bg-emerald-100 text-emerald-700' :
                                                            'bg-slate-50 text-slate-700'
                                                        }`}>
                                                        <Store size={14} />
                                                        {t.appliance_type}
                                                    </div>
                                                </div>
                                            </div>
                                        )
                                    })}
                                    {techItinerary.length === 0 && (
                                        <div className="text-center py-12">
                                            <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
                                                <Calendar size={24} className="text-slate-400" />
                                            </div>
                                            <p className="text-slate-400 font-medium">Sin itinerario hoy</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {techs.map(tech => (
                                    <div key={tech.id} onClick={() => handleTechSelect(tech)}
                                        className="group relative p-4 bg-white rounded-2xl border border-slate-100 hover:border-blue-200 hover:shadow-lg hover:shadow-blue-500/10 cursor-pointer transition-all duration-300 overflow-hidden"
                                    >
                                        <div className="absolute inset-0 bg-gradient-to-r from-blue-500/0 to-purple-500/0 group-hover:from-blue-500/5 group-hover:to-purple-500/5 transition-all duration-300"></div>

                                        <div className="relative flex items-center gap-4">
                                            <div className="relative">
                                                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 p-[2px] shadow-md group-hover:shadow-lg group-hover:shadow-blue-500/30 transition-all">
                                                    <div className="w-full h-full rounded-2xl overflow-hidden bg-white">
                                                        {tech.avatar_url ? <img src={tech.avatar_url} className="w-full h-full object-cover" /> :
                                                            <div className="w-full h-full bg-gradient-to-br from-blue-100 to-purple-100 flex items-center justify-center">
                                                                <span className="text-blue-600 font-bold text-lg">{tech.full_name[0]}</span>
                                                            </div>}
                                                    </div>
                                                </div>
                                                {tech.isActive && (
                                                    <div className="absolute -top-1 -right-1 flex h-4 w-4">
                                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                                        <span className="relative inline-flex rounded-full h-4 w-4 bg-emerald-500 border-2 border-white"></span>
                                                    </div>
                                                )}
                                            </div>

                                            <div className="flex-1 min-w-0">
                                                <div className="flex justify-between items-center mb-1">
                                                    <h4 className="font-bold text-slate-800 truncate group-hover:text-blue-600 transition-colors">{tech.full_name}</h4>
                                                    {tech.workload > 0 && (
                                                        <span className="flex items-center gap-1 text-xs font-bold bg-gradient-to-r from-orange-500 to-red-500 text-white px-2.5 py-1 rounded-lg shadow-md shadow-orange-500/30">
                                                            <Zap size={12} /> {tech.workload}
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="text-xs text-slate-500 flex items-center gap-1.5">
                                                    {tech.isActive ? (
                                                        <><Signal size={12} className="text-emerald-500" /> <span className="text-emerald-600 font-medium">Conectado</span></>
                                                    ) : (
                                                        <><Clock size={12} /> {formatDistanceToNow(tech.lastUpdate || new Date(), { locale: es })}</>
                                                    )}
                                                </div>
                                            </div>

                                            <ChevronRight size={18} className="text-slate-300 group-hover:text-blue-500 group-hover:translate-x-1 transition-all" />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="p-4 border-t border-slate-100 bg-white/50 backdrop-blur-sm">
                        <div className="relative group">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors" size={18} />
                            <input type="text" placeholder="Buscar técnico..."
                                className="w-full bg-white border-2 border-slate-100 focus:border-blue-500 rounded-2xl pl-12 pr-4 py-3.5 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-4 focus:ring-blue-500/10 transition-all shadow-sm" />
                        </div>
                    </div>
                </div>
            </div>

            {/* Floating Toggle */}
            {!isSidebarOpen && (
                <button onClick={() => setIsSidebarOpen(true)}
                    className="absolute top-8 left-8 z-40 w-14 h-14 bg-gradient-to-br from-blue-600 to-purple-600 text-white rounded-2xl shadow-2xl shadow-blue-500/40 hover:shadow-blue-500/60 hover:scale-110 transition-all duration-300 flex items-center justify-center border-2 border-white/20">
                    <ChevronRight size={24} />
                </button>
            )}

            <style>{`
                .custom-scrollbar::-webkit-scrollbar { width: 6px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: linear-gradient(to bottom, #3b82f6, #8b5cf6); border-radius: 10px; }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: linear-gradient(to bottom, #2563eb, #7c3aed); }
            `}</style>
        </div>
    );
};

export default FleetMapbox;
