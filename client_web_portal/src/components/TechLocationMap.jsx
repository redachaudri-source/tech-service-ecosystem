import { useEffect, useState, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { Navigation } from 'lucide-react';

const GOOGLE_MAPS_API_KEY = 'AIzaSyAzaTWQlJ7B2xqHvUrhcNUNuN_pN_QKKKQ';

const TechLocationMap = ({ technicianId }) => {
    const mapRef = useRef(null);
    const [map, setMap] = useState(null);
    const markerRef = useRef(null); // Use ref for marker singleton
    const [techMarker, setTechMarker] = useState(null); // Keep state for other potential uses, but rely on ref
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
                disableDefaultUI: false, // Enable UI controls
                zoomControl: true,       // Explicitly enable zoom
                mapTypeControl: false,
                streetViewControl: false,
                fullscreenControl: true,
                backgroundColor: '#f0f0f0',
                gestureHandling: 'greedy', // Better mobile touch handling
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

        // Uber-like Smooth Animation
        const startPos = { ...currentPosRef.current };
        const startTime = Date.now();
        const duration = 2000; // 2 seconds glides

        const animate = () => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);

            // Ease-out cubic for car-like deceleration
            const easeProgress = 1 - Math.pow(1 - progress, 3);

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

        // Custom Car Icon (Uber-style black car)
        const carIcon = {
            path: "M17.402,0H5.643C2.526,0,0,3.467,0,6.584v34.804c0,3.116,2.526,5.644,5.643,5.644h11.759c3.116,0,5.644-2.527,5.644-5.644 V6.584C23.044,3.467,20.518,0,17.402,0z M22.057,14.188v11.665l-2.729,0.351v-4.806L22.057,14.188z M20.625,10.773 c-1.016,3.9-2.219,8.51-2.219,8.51H4.638l-2.222-8.51C2.417,10.773,11.3,7.755,20.625,10.773z M19.148,1.443v3.327 c0,0.88-0.714,1.593-1.592,1.593H5.485c-0.878,0-1.591-0.713-1.591-1.593V1.443C3.894,1.443,12.609,0,19.148,1.443z",
            fillColor: "#000000",
            fillOpacity: 1,
            scale: 0.7,
            strokeColor: "#ffffff",
            strokeWeight: 1,
            anchor: new window.google.maps.Point(11.5, 23.5), // Center of the car path
            rotation: heading,
        };

        if (markerRef.current) {
            markerRef.current.setPosition(position);
            markerRef.current.setIcon({
                ...carIcon,
                rotation: heading,
            });
        } else {
            const marker = new window.google.maps.Marker({
                position,
                map: map,
                title: 'Técnico',
                icon: {
                    ...carIcon,
                    rotation: heading,
                },
                zIndex: 999
            });
            markerRef.current = marker;
            setTechMarker(marker);
        }

        // Smooth Pan: Only pan if tech moves significantly out of center bounds to avoid jitter
        if (map && !map.getBounds()?.contains(position)) {
            map.panTo(position);
        }
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
