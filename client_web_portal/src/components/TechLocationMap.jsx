import { useEffect, useState, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { Navigation } from 'lucide-react';

const GOOGLE_MAPS_API_KEY = 'AIzaSyAzaTWQlJ7B2xqHvUrhcNUNuN_pN_QKKKQ';

const TechLocationMap = ({ technicianId }) => {
    const mapRef = useRef(null);
    const [map, setMap] = useState(null);
    const [techMarker, setTechMarker] = useState(null);
    const [lastUpdate, setLastUpdate] = useState(null);
    const [loading, setLoading] = useState(true);

    // Animation state
    const animationRef = useRef(null);
    const currentPosRef = useRef(null);
    const targetPosRef = useRef(null);

    // Load Google Maps script
    useEffect(() => {
        // Define callback function globally
        window.initMapCallback = () => {
            console.log('🗺️ Google Maps Script Loaded callback fired');
            initMap();
        };

        if (window.google && window.google.maps) {
            console.log('🗺️ Google Maps already loaded');
            initMap();
            return;
        }

        // Check if script already exists to avoid duplicates
        if (document.querySelector('script[src*="maps.googleapis.com"]')) {
            console.log('🗺️ Script tag already exists, waiting for callback...');
            return;
        }

        const script = document.createElement('script');
        // Add callback param and loading=async
        script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&callback=initMapCallback&loading=async&v=weekly`;
        script.async = true;
        script.defer = true;
        script.onerror = () => {
            console.error('❌ Error loading Google Maps');
            setLoading(false);
        };
        document.head.appendChild(script);

        return () => {
            // Cleanup
            if (window.initMapCallback) delete window.initMapCallback;
        };
    }, []);

    // Subscribe to technician location updates
    useEffect(() => {
        if (!technicianId) return;

        const channel = supabase
            .channel(`tech-location-${technicianId}`)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'technician_locations',
                    filter: `technician_id=eq.${technicianId}`
                },
                (payload) => {
                    console.log('📍 Location update:', payload);
                    if (payload.new) {
                        setLastUpdate(payload.new.updated_at);
                        animateMarkerToPosition(payload.new);
                    }
                }
            )
            .subscribe();

        // Fetch initial location
        fetchTechLocation();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [technicianId, map]);

    const fetchTechLocation = async () => {
        if (!technicianId) return;

        try {
            const { data, error } = await supabase
                .from('technician_locations')
                .select('*')
                .eq('technician_id', technicianId)
                .maybeSingle(); // Use maybeSingle instead of single to avoid error if no rows

            if (error) {
                console.error('Error fetching tech location:', error);
                // Keep loading state if error
                return;
            }

            if (data) {
                setLastUpdate(data.updated_at);
                currentPosRef.current = { lat: data.latitude, lng: data.longitude };

                if (map) {
                    createOrUpdateMarker({ lat: data.latitude, lng: data.longitude }, data.heading || 0);
                    map.setCenter({ lat: data.latitude, lng: data.longitude });
                }
                setLoading(false);
            } else {
                console.log('⏳ Waiting for technician to start GPS tracking...');
                // Keep loading state - technician hasn't started tracking yet
            }
        } catch (error) {
            console.error('Error fetching tech location:', error);
            // Keep loading state on error
        }
    };

    const initMap = () => {
        if (!mapRef.current) {
            console.warn("⚠️ initMap called but mapRef is null, retrying later if needed");
            return;
        }

        if (!window.google || !window.google.maps) {
            console.warn("⚠️ initMap called but window.google is missing");
            return;
        }

        console.log("🗺️ Initializing Map Instance...");

        const defaultCenter = { lat: 36.7213, lng: -4.4214 }; // Malaga

        try {
            const newMap = new window.google.maps.Map(mapRef.current, {
                center: defaultCenter,
                zoom: 15,
                disableDefaultUI: true,
                zoomControl: false,
                mapTypeControl: false,
                streetViewControl: false,
                fullscreenControl: false,
                backgroundColor: '#f0f0f0', // Visible background to detect rendering
            });

            setMap(newMap);
            console.log("✅ Map Instance Created Successfully");

            // Should stop loading if we have map, even if we don't have tech location yet (optional)
            // But we keep loading until we have tech location to prevent empty map confusion
        } catch (err) {
            console.error("❌ Error initializing Google Map:", err);
        }
    };

    const animateMarkerToPosition = (location) => {
        if (!map || !window.google) return;

        const newPos = { lat: location.latitude, lng: location.longitude };
        targetPosRef.current = newPos;

        if (!currentPosRef.current) {
            currentPosRef.current = newPos;
            createOrUpdateMarker(newPos, location.heading || 0);
            return;
        }

        // Smooth animation
        const startPos = { ...currentPosRef.current };
        const startTime = Date.now();
        const duration = 1500; // 1.5 seconds

        const animate = () => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);

            // Easing function
            const easeProgress = progress < 0.5
                ? 2 * progress * progress
                : 1 - Math.pow(-2 * progress + 2, 2) / 2;

            const lat = startPos.lat + (newPos.lat - startPos.lat) * easeProgress;
            const lng = startPos.lng + (newPos.lng - startPos.lng) * easeProgress;

            currentPosRef.current = { lat, lng };
            createOrUpdateMarker({ lat, lng }, location.heading || 0);

            if (progress < 1) {
                animationRef.current = requestAnimationFrame(animate);
            }
        };

        if (animationRef.current) {
            cancelAnimationFrame(animationRef.current);
        }
        animate();
    };

    const createOrUpdateMarker = (position, heading) => {
        if (!map || !window.google) return;

        if (techMarker) {
            techMarker.setPosition(position);
            techMarker.setIcon({
                path: window.google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
                scale: 5,
                fillColor: '#000000',
                fillOpacity: 1,
                strokeColor: '#ffffff',
                strokeWeight: 2,
                rotation: heading,
            });
        } else {
            const marker = new window.google.maps.Marker({
                position,
                map: map,
                title: 'Técnico',
                icon: {
                    path: window.google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
                    scale: 5,
                    fillColor: '#000000',
                    fillOpacity: 1,
                    strokeColor: '#ffffff',
                    strokeWeight: 2,
                    rotation: heading,
                },
            });
            setTechMarker(marker);
        }

        // Center map on technician
        map.panTo(position);
    };

    if (loading) {
        return (
            <div className="h-48 bg-slate-100 rounded-lg flex items-center justify-center text-slate-400 text-sm animate-pulse">
                <span className="flex items-center gap-2">
                    <Navigation size={16} className="animate-spin" />
                    Localizando técnico...
                </span>
            </div>
        );
    }

    return (
        <div className="h-64 w-full rounded-xl overflow-hidden shadow-lg border-2 border-slate-200 relative z-0">
            {/* Map */}
            <div ref={mapRef} className="h-full w-full" />

            {/* Overlay Banner */}
            <div className="absolute top-2 left-2 right-2 bg-white/95 backdrop-blur-md p-3 rounded-xl shadow-lg z-[1000] flex items-center gap-3 border border-slate-100">
                <div className="bg-black text-white p-2 rounded-full shadow-lg shadow-black/20">
                    <Navigation size={18} />
                </div>
                <div>
                    <h4 className="text-sm font-black text-slate-800 tracking-tight">EN CAMINO</h4>
                    <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                        {lastUpdate
                            ? `Actualizado ${new Date(lastUpdate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                            : 'Conectando GPS...'}
                    </p>
                </div>
            </div>
        </div>
    );
};

export default TechLocationMap;
