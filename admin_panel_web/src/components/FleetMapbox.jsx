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
    const [showStops, setShowStops] = useState(false); // DEFAULT FALSE (Req by user)
    const [showRoute, setShowRoute] = useState(true); // Route Toggle (Auto-Draw) - DEFAULT TRUE

    const [schedule, setSchedule] = useState(null); // PRIVACY: Store working hours
    const [isShopOpen, setIsShopOpen] = useState(true); // PRIVACY: Global shop status (persists across fetch cycles)

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

    // DATA FETCHING (Combined Fleet + Schedule + Loop)
    useEffect(() => {
        // 1. Load Schedule ONCE on mount
        const loadSchedule = async () => {
            const { data } = await supabase.from('business_config').select('value').eq('key', 'working_hours').single();
            if (data?.value) {
                setSchedule(data.value);
                console.log("📅 Privacy Schedule Loaded:", data.value);
            }
        };
        loadSchedule();

        fetchFleetData();
        const sub = supabase.channel('fleet-premium').on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, fetchFleetData).subscribe();
        const interval = setInterval(fetchFleetData, 60000); // 1 min refresh
        return () => { supabase.removeChannel(sub); clearInterval(interval); };
    }, []);

    // 🛡️ PRIVACY HELPER
    const isWorkingNow = (scheduleConfig) => {
        if (!scheduleConfig) return false; // Default blocked if no schedule yet

        const now = new Date();

        // ✅ FIX: Capitalized to match DB (Screenshot shows "Monday", "Tuesday"...)
        const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const currentDay = days[now.getDay()];

        // ✅ FALLBACK: Case-insensitive lookup (try Capitalized, then lowercase)
        let dayConfig = scheduleConfig[currentDay];
        if (!dayConfig) {
            dayConfig = scheduleConfig[currentDay.toLowerCase()];
        }

        if (!dayConfig) {
            console.log(`🛡️ PRIVACY: ${currentDay} cerrado (sin config), GPS bloqueado`);
            return false; // Closed today (no entry in DB)
        }

        const nowMins = now.getHours() * 60 + now.getMinutes();
        const [startH, startM] = dayConfig.start.split(':').map(Number);
        const [endH, endM] = dayConfig.end.split(':').map(Number);
        const startMins = startH * 60 + startM;
        const endMins = endH * 60 + endM;

        const isWorking = nowMins >= startMins && nowMins < endMins;

        if (!isWorking) {
            console.log(`🛡️ PRIVACY: Fuera de horario (${nowMins} mins vs ${startMins}-${endMins}), GPS bloqueado`);
        }

        return isWorking;
    };

    // Helper: Generate stop labels (A, B, C... → 1A, 1B after Z)
    const getStopLabel = (index) => {
        if (index < 26) {
            return String.fromCharCode(65 + index); // A-Z (0-25)
        }
        // For indices >= 26: 1A, 1B, 1C..., 2A, 2B...
        const cycle = Math.floor(index / 26);
        const letter = String.fromCharCode(65 + (index % 26));
        return `${cycle}${letter}`; // "1A", "1B", "2A"...
    };



    // Ref-based schedule access for the Interval
    const scheduleRef = useRef(null);
    useEffect(() => { scheduleRef.current = schedule; }, [schedule]);

    // Replacing the original fetchFleetData with the implementation that accepts schedule
    const fetchFleetData = () => fetchFleetDataImpl(scheduleRef.current);

    const fetchFleetDataImpl = async (currentSchedule) => {
        try {
            const now = new Date();
            // STRICT: Only Today (00:00:00 to 23:59:59)
            const start = new Date(now);
            start.setHours(0, 0, 0, 0);

            const end = new Date(now);
            end.setHours(23, 59, 59, 999);

            const startDate = start.toISOString();
            const endDate = end.toISOString();

            // 🛡️ PRIVACY CHECK LIST
            // 1. Is the shop open right now?
            const shopOpen = isWorkingNow(currentSchedule);
            setIsShopOpen(shopOpen); // ✅ Update global state (persists across fetch cycles)

            if (!shopOpen && currentSchedule) { // If schedule loaded AND closed
                console.log("🛡️ PRIVACY GUARD: Shop Closed. Entering PRIVACY MODE (techs visible but grayed out)");
                // ❌ NO: setTechs([]); // Don't hide techs completely
                // ✅ YES: Continue fetch - markers will use isShopOpen to apply opacity
            }

            // ... (Rest of fetch logic, profiles, tickets, etc.)

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
            const { data: ticketsRaw, error: ticketsError } = await supabase
                .from('tickets')
                .select('*') // Wildcard is safer
                .gte('scheduled_at', startDate)
                .lte('scheduled_at', endDate);

            if (ticketsError) {
                console.error("❌ CRITICAL ERROR fetching tickets raw:", ticketsError);
            }

            const validTicketsRaw = ticketsRaw || [];

            // Step B: Extract Client IDs (Strict Validation)
            // Aggressive cleanup: Remove anything that is NOT a hex char or hyphen
            const clientIds = [...new Set(validTicketsRaw
                .map(t => t.client_id)
                .filter(id => id && typeof id === 'string' && id.length > 10)
                .map(id => id.replace(/[^a-f0-9-]/gi, '').toLowerCase())
            )];

            // Step C: Fetch Client Profiles manually (ROBUST PARALLEL FETCH)
            let clientsMap = {};
            if (clientIds.length > 0) {
                // Fetch independently to isolate errors
                const results = await Promise.all(clientIds.map(async (id) => {
                    const { data, error } = await supabase
                        .from('profiles')
                        .select('id, full_name, address, current_lat, current_lng, latitude, longitude')
                        .eq('id', id)
                        .maybeSingle();

                    if (data) {
                        // Priority: Explicit Latitude/Longitude (from address) > Current Location (Real-time)
                        let lat = data.latitude || data.current_lat;
                        let lng = data.longitude || data.current_lng;
                        let wasGeocoded = false;

                        // AUTOMATIC GEOCODING (Fallback if no GPS but Address exists)
                        if ((!lat || !lng) && data.address && data.address.length > 5) {
                            try {
                                const geoUrl = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(data.address)}.json?access_token=${mapboxgl.accessToken}&limit=1&country=es`;
                                const geoRes = await fetch(geoUrl);
                                const geoJson = await geoRes.json();
                                if (geoJson.features && geoJson.features.length > 0) {
                                    const [gLng, gLat] = geoJson.features[0].center;
                                    lat = gLat;
                                    lng = gLng;
                                    wasGeocoded = true;
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
            }

            // Step D: Merge Manually
            const allTickets = validTicketsRaw.map(t => ({
                ...t,
                client: t.client_id ? (clientsMap[t.client_id] || {}) : {},
            }));


            // Filter valid tickets
            const validTickets = allTickets.filter(t => {
                const s = (t.status || '').toLowerCase();
                return !['cancelado', 'rechazado', 'anulado'].includes(s);
            });

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
                    // STRICTER TIMEOUT: 5 minutes max to be "Online"
                    isActive = diff < 5;
                }

                // Force location from profile if available, else default
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

            // Update selected tech if exists
            if (selectedTech) {
                const updated = merged.find(t => t.id === selectedTech.id);
                if (updated) {
                    const sorted = [...updated.allTickets].sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at));
                    setTechItinerary(sorted);
                    setTechStops(updated.allTickets);
                    // Refresh Route if view is static? 
                    // No, existing effect handles stops. We might need to trigger route redraw here too?
                    // Let's rely on handleTechSelect or the effect below
                }
            }

        } catch (e) {
            console.error("🔥 EXCEPTION in fetchFleetData:", e);
        }
    };

    // AUTO-RENDER STOPS & ROUTES when tech/stops/showStops changes
    useEffect(() => {
        if (selectedTech && techStops.length > 0) {

            // Stops Logic (Only if showStops ON)
            if (showStops) {
                renderStopMarkers(techStops);
            } else {
                stopMarkersRef.current.forEach(marker => marker.remove());
                stopMarkersRef.current = [];
            }

            // Route Logic (Only if showRoute ON)
            if (showRoute) {
                // SORT: scheduled_at first (chronological), then by created_at
                const sortedStops = [...techStops]
                    .filter(t => !['cancelado', 'rechazado'].includes(t.status?.toLowerCase()))
                    .sort((a, b) => {
                        // Priority 1: With scheduled_at comes first
                        if (a.scheduled_at && b.scheduled_at) {
                            return new Date(a.scheduled_at) - new Date(b.scheduled_at);
                        }
                        if (a.scheduled_at) return -1; // With scheduled_at first
                        if (b.scheduled_at) return 1;  // Without scheduled_at goes last (FIXED COMMENT)

                        // Priority 2: Among tickets without scheduled_at, sort by created_at
                        return new Date(a.created_at || 0) - new Date(b.created_at || 0);
                    });

                if (sortedStops.length > 0) {
                    // Add labels to stops (A, B, C... → 1A, 1B...)
                    const stopsWithLabels = sortedStops.map((ticket, i) => ({
                        ...ticket,
                        stopLabel: getStopLabel(i)
                    }));

                    drawRoutesAndStops(selectedTech, stopsWithLabels);
                }
            } else {
                clearRoute();
            }

        } else {
            // Clear stops if no tech selected
            stopMarkersRef.current.forEach(marker => marker.remove());
            stopMarkersRef.current = [];
            clearRoute();
        }
    }, [selectedTech, techStops, showStops, showRoute, techItinerary]);

    const clearRoute = () => {
        if (!mapRef.current) return;
        if (mapRef.current.getLayer('route-line')) mapRef.current.removeLayer('route-line');
        if (mapRef.current.getSource('route-source')) mapRef.current.removeSource('route-source');
        routeMarkersRef.current.forEach(m => m.remove());
        routeMarkersRef.current = [];
    };

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

        // Hide markers that are not in the new list (Privacy Handling)
        const newIds = new Set(list.map(t => t.id));
        Object.keys(markersRef.current).forEach(id => {
            if (!newIds.has(id)) {
                markersRef.current[id].remove();
                delete markersRef.current[id];
            }
        });

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

                // ✅ PRIVACY MODE: Apply opacity + grayscale when shop is closed
                if (!isShopOpen) {
                    el.style.opacity = '0.3';
                    el.style.filter = 'grayscale(1)';
                    el.title = `${tech.full_name} - 🛡️ Fuera de horario laboral`;
                }

                marker = new mapboxgl.Marker({ element: el }).setLngLat([tech.longitude, tech.latitude]).addTo(mapRef.current);
                el.addEventListener('click', (e) => { e.stopPropagation(); handleTechSelect(tech); });
                markersRef.current[tech.id] = marker;
            } else {
                marker.setLngLat([tech.longitude, tech.latitude]);
                const el = marker.getElement();
                el.innerHTML = html;

                // ✅ PRIVACY MODE: Update opacity + grayscale based on current shop status
                if (!isShopOpen) {
                    el.style.opacity = '0.3';
                    el.style.filter = 'grayscale(1)';
                    el.title = `${tech.full_name} - 🛡️ Fuera de horario laboral`;
                } else {
                    el.style.opacity = '1';
                    el.style.filter = 'none';
                    el.title = tech.full_name;
                }
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
                        <div class="mt-1 flex items-center gap-1">
                             <div class="w-2 h-2 rounded-full ${stop.status === 'completado' ? 'bg-green-500' : 'bg-gray-300'}"></div>
                             <span class="text-[10px] uppercase font-bold text-slate-400">${stop.status}</span>
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
        setTechStops(tech.allTickets); // FIX: Populate techStops to trigger route drawing
        mapRef.current.flyTo({ center: [tech.longitude, tech.latitude], zoom: 14, duration: 1500 });
        // Route drawing handled by effect now
    };

    // Handler: Deselect technician + cleanup all state
    const handleTechDeselect = () => {
        setSelectedTech(null);
        setTechItinerary([]);
        setTechStops([]);
        clearRoute();
        // Reset zoom to overview
        mapRef.current?.flyTo({ center: [-4.4214, 36.7213], zoom: 12, duration: 1000 });
    };

    const drawRoutesAndStops = async (tech, tickets) => {
        if (!mapRef.current || !showRoute) { // Guard: Check showRoute!
            console.log("⚠️ Mapa no listo o ruta desactivada");
            return;
        }

        // Limpiar ruta existente
        clearRoute();

        // Filtrar tickets válidos con coordenadas
        const validStops = tickets.filter(t => {
            // Soportar ambas estructuras: client y clients
            const clientData = t.client || t.clients;

            if (!clientData) {
                console.warn("⚠️ Ticket sin datos de cliente:", t.id);
                return false;
            }

            const hasCoords = clientData.latitude && clientData.longitude;
            const isNotCancelled = !['cancelado', 'rechazado', 'anulado'].includes((t.status || '').toLowerCase());

            return hasCoords && isNotCancelled;
        });

        if (validStops.length === 0) {
            console.log("ℹ️ No hay paradas válidas para trazar ruta");
            return;
        }

        console.log(`🗺️ Trazando ruta con ${validStops.length} paradas para ${tech.full_name}`);

        // IMPORTANTE: Mapbox Directions API límite = 25 coordenadas (incluyendo origen)
        const maxWaypoints = 24; // 25 - 1 (origen técnico)
        const stopsToUse = validStops.slice(0, maxWaypoints);

        if (validStops.length > maxWaypoints) {
            console.warn(`⚠️ Limitando a ${maxWaypoints} paradas (Mapbox límite)`);
        }

        // Construir coordenadas: Origen (Técnico) + Paradas
        const coordinates = [
            `${tech.longitude},${tech.latitude}`, // Origen
            ...stopsToUse.map(t => {
                const clientData = t.client || t.clients;
                return `${clientData.longitude},${clientData.latitude}`;
            })
        ].join(';');

        try {
            console.log("� Solicitando ruta optimizada a Mapbox...");

            const response = await fetch(
                `https://api.mapbox.com/directions/v5/mapbox/driving/${coordinates}?` +
                `steps=true&` +
                `geometries=geojson&` +
                `overview=full&` +
                `access_token=${mapboxgl.accessToken}`
            );

            if (!response.ok) {
                throw new Error(`Mapbox API Error: ${response.status} ${response.statusText}`);
            }

            const json = await response.json();

            if (!json.routes || json.routes.length === 0) {
                console.error("❌ Mapbox no devolvió rutas:", json);
                return;
            }

            const routeGeoJSON = json.routes[0].geometry;
            const distance = (json.routes[0].distance / 1000).toFixed(1); // km
            const duration = Math.round(json.routes[0].duration / 60); // minutos

            console.log(`✅ Ruta obtenida: ${distance} km, ~${duration} min`);

            // Añadir source
            mapRef.current.addSource('route-source', {
                type: 'geojson',
                data: {
                    type: 'Feature',
                    geometry: routeGeoJSON
                }
            });

            // Añadir layer de la línea
            mapRef.current.addLayer({
                id: 'route-line',
                type: 'line',
                source: 'route-source',
                layout: {
                    'line-join': 'round',
                    'line-cap': 'round'
                },
                paint: {
                    'line-color': '#3b82f6', // Azul
                    'line-width': 5,
                    'line-opacity': 0.8
                }
            });

            console.log("✅ Ruta dibujada exitosamente");

            // ✅ ADD LETTERED MARKERS for each stop
            routeMarkersRef.current.forEach(m => m.remove());
            routeMarkersRef.current = [];

            stopsToUse.forEach((stop, index) => {
                const clientData = stop.client || stop.clients || {};
                if (!clientData.latitude || !clientData.longitude) return;

                const el = document.createElement('div');
                el.className = 'route-stop-marker';
                el.innerHTML = `
                    <div class="flex flex-col items-center cursor-pointer">
                        <div class="relative">
                            <div class="text-3xl drop-shadow-lg">🏠</div>
                            <div class="absolute -bottom-1 -right-1 bg-blue-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold border-2 border-white shadow-lg">
                                ${stop.stopLabel || getStopLabel(index)}
                            </div>
                        </div>
                    </div>
                `;

                const marker = new mapboxgl.Marker({ element: el })
                    .setLngLat([clientData.longitude, clientData.latitude])
                    .addTo(mapRef.current);

                const popupContent = `
                    <div class="p-2">
                        <p class="font-bold text-sm text-blue-600">${stop.stopLabel || getStopLabel(index)}: ${clientData.full_name || 'Cliente'}</p>
                        <p class="text-xs text-gray-600 mt-1">📍 ${clientData.address || 'Sin dirección'}</p>
                        ${stop.scheduled_at ? `<p class="text-xs text-blue-600 mt-1">📅 ${format(new Date(stop.scheduled_at), 'HH:mm', { locale: es })}</p>` : '<p class="text-xs text-gray-500 mt-1">⏰ Sin hora programada</p>'}
                    </div>
                `;

                const popup = new mapboxgl.Popup({ offset: 25 }).setHTML(popupContent);
                marker.setPopup(popup);
                routeMarkersRef.current.push(marker);
            });

            console.log(`✅ ${stopsToUse.length} marcadores etiquetados añadidos`);

        } catch (error) {
            console.error("❌ Error al obtener/dibujar ruta:", error);
        }
    };

    // MANUAL ROUTE TESTER
    const handleManualRouteTest = async () => {
        if (!manualRouteInput.trim()) return;

        console.log("🗺️ Testing Manual Route:", manualRouteInput);
        const addresses = manualRouteInput.split(/[\n;]/).map(s => s.trim()).filter(Boolean);

        if (addresses.length < 2) {
            alert("Introduce al menos 2 direcciones (Origen y Destino)");
            return;
        }

        try {
            // Geocode all addresses
            const coords = await Promise.all(addresses.map(async (addr) => {
                const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(addr)}.json?access_token=${mapboxgl.accessToken}&limit=1&country=es`;
                const res = await fetch(url);
                const data = await res.json();
                if (data.features && data.features.length > 0) {
                    return {
                        addr,
                        lng: data.features[0].center[0],
                        lat: data.features[0].center[1]
                    };
                }
                return null;
            }));

            const validCoords = coords.filter(Boolean);
            if (validCoords.length < 2) {
                alert("No se pudieron geocodificar suficientes direcciones.");
                return;
            }

            // Construct Fake Tech (First Address)
            const fakeTech = {
                id: 'manual-test',
                full_name: 'Test Manual',
                latitude: validCoords[0].lat,
                longitude: validCoords[0].lng
            };

            // Construct Fake Stops (Rest of Addresses)
            const fakeStops = validCoords.slice(1).map((c, i) => ({
                id: `stop-${i}`,
                client: {
                    latitude: c.lat,
                    longitude: c.lng,
                    address: c.addr
                },
                scheduled_at: new Date(Date.now() + i * 3600000).toISOString() // Fake times +1h
            }));

            // Force Draw
            // First clear old
            clearRoute();

            // Draw
            console.log("🎨 Drawing Manual Route:", validCoords);
            await drawRoutesAndStops(fakeTech, fakeStops);

            // Move Camera to Start
            mapRef.current.flyTo({ center: [fakeTech.longitude, fakeTech.latitude], zoom: 12 });

        } catch (e) {
            console.error("Manual Route Error:", e);
            alert("Error al trazar ruta manual");
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

                    {/* Stop Markers Toggle (HIDDEN per user request) */}
                    {/* 
                    <button
                        onClick={() => setShowStops(!showStops)}
                        ...
                    </button> 
                    */}
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

                            {/* Toggle Traffic */}
                            <button
                                onClick={toggleTraffic}
                                className={`w-full px-3 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-between mb-2 ${showTraffic
                                    ? 'bg-gradient-to-r from-orange-500 to-red-500 text-white shadow-md'
                                    : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                                    }`}
                            >
                                <span className="flex items-center gap-2">
                                    🚦 Tráfico
                                </span>
                                <span className="text-[10px] opacity-70">{showTraffic ? 'ON' : 'OFF'}</span>
                            </button>

                            {/* Toggle Route (New Feature) */}
                            <button
                                onClick={() => setShowRoute(!showRoute)}
                                className={`w-full px-3 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-between ${showRoute
                                    ? 'bg-gradient-to-r from-blue-500 to-indigo-600 text-white shadow-md shadow-blue-500/20'
                                    : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                                    }`}
                            >
                                <span className="flex items-center gap-2">
                                    🗺️ Ruta del Día
                                </span>
                                <span className="text-[10px] opacity-70">{showRoute ? 'ON' : 'OFF'}</span>
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

                    {/* Header - ULTRA COMPACT (Linear-style) */}
                    <div className="p-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white">
                        {/* Top Bar: Título + Cerrar */}
                        <div className="flex justify-between items-center mb-2">
                            <div className="flex items-center gap-2">
                                <MapIcon size={16} className="text-blue-200" />
                                <h1 className="text-sm font-bold tracking-tight">Tracking</h1>
                            </div>
                            <button
                                onClick={() => setIsSidebarOpen(false)}
                                className="p-1.5 hover:bg-white/20 rounded-lg transition-colors"
                            >
                                <ChevronLeft size={16} />
                            </button>
                        </div>

                        {selectedTech ? (
                            /* TÉCNICO SELECCIONADO - Layout Horizontal Compacto */
                            <div className="flex items-center gap-3 bg-white/10 rounded-xl p-2.5 border border-white/20">
                                {/* Avatar Pequeño */}
                                <div className="relative flex-shrink-0">
                                    <div className="w-10 h-10 rounded-xl overflow-hidden ring-2 ring-white/30">
                                        {selectedTech.avatar_url ? (
                                            <img src={selectedTech.avatar_url} className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="w-full h-full bg-white/20 flex items-center justify-center">
                                                <span className="text-sm font-bold">{selectedTech.full_name?.[0]}</span>
                                            </div>
                                        )}
                                    </div>
                                    <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-indigo-600 ${selectedTech.isActive ? 'bg-emerald-400' : 'bg-gray-400'}`} />
                                </div>

                                {/* Info + Botón Inline */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between gap-2">
                                        <h2 className="text-sm font-bold truncate">{selectedTech.full_name}</h2>
                                        <button
                                            onClick={handleTechDeselect}
                                            className="text-[10px] font-medium px-2 py-0.5 bg-white/20 hover:bg-white/30 rounded-md transition-colors flex-shrink-0"
                                        >
                                            ✕
                                        </button>
                                    </div>
                                    <div className="flex items-center gap-2 mt-0.5">
                                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${selectedTech.isActive ? 'bg-emerald-400/30 text-emerald-200' : 'bg-white/20 text-white/60'}`}>
                                            {selectedTech.isActive ? '● Online' : '○ Offline'}
                                        </span>
                                        {selectedTech.workload > 0 && (
                                            <span className="text-[10px] font-semibold px-1.5 py-0.5 bg-orange-400/30 text-orange-200 rounded">
                                                {selectedTech.workload} tareas
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ) : (
                            /* STATS - Inline Horizontal */
                            <div className="flex gap-2">
                                <div className="flex-1 bg-white/10 rounded-lg p-2 border border-white/20">
                                    <div className="flex items-center gap-2">
                                        <Activity size={14} className="text-emerald-300" />
                                        <span className="text-lg font-black">{activeTechsCount}</span>
                                        <span className="text-[10px] text-blue-200 font-medium">activos</span>
                                    </div>
                                </div>
                                <div className="flex-1 bg-white/10 rounded-lg p-2 border border-white/20">
                                    <div className="flex items-center gap-2">
                                        <TrendingUp size={14} className="text-purple-300" />
                                        <span className="text-lg font-black">{techs.length}</span>
                                        <span className="text-[10px] text-blue-200 font-medium">total</span>
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
