import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Navigation } from 'lucide-react';
import { supabase } from '../lib/supabase';

// Configure Mapbox token
mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN;

/**
 * MapboxTrackingMap - Tier-1 GPS Tracking Component
 * 
 * Phase 1: Infrastructure Base
 * - Clean Mapbox GL rendering with navigation-day-v1 style
 * - Proper initialization and cleanup
 * - Error handling and loading states
 * 
 * Future Phases:
 * - Phase 2: Interpolation engine (60 FPS smooth movement)
 * - Phase 3: Real-time GPS integration
 * - Phase 4: Camera controls (Lock/Free modes)
 */
const MapboxTrackingMap = ({ technicianId }) => {
    const mapContainerRef = useRef(null);
    const mapRef = useRef(null);
    const [mapLoaded, setMapLoaded] = useState(false);
    const [mapError, setMapError] = useState(null);
    const [position, setPosition] = useState(null);
    const [lastUpdate, setLastUpdate] = useState(null);

    // Initialize Mapbox map
    useEffect(() => {
        if (!mapContainerRef.current) return;

        try {
            // Create map instance
            const map = new mapboxgl.Map({
                container: mapContainerRef.current,
                style: 'mapbox://styles/mapbox/navigation-day-v1', // Clean navigation style
                center: [-4.4214, 36.7213], // Default: Málaga, Spain
                zoom: 13,
                attributionControl: false, // Clean UI
                logoPosition: 'bottom-right'
            });

            // Add zoom and rotation controls
            map.addControl(new mapboxgl.NavigationControl({
                showCompass: true,
                showZoom: true,
                visualizePitch: false
            }), 'top-right');

            // Map loaded event
            map.on('load', () => {
                setMapLoaded(true);
                console.log('✅ Mapbox GL loaded successfully');
            });

            // Error handling
            map.on('error', (e) => {
                console.error('❌ Mapbox error:', e);
                setMapError('Error loading map');
            });

            mapRef.current = map;

            // Cleanup on unmount
            return () => {
                map.remove();
                mapRef.current = null;
            };
        } catch (error) {
            console.error('❌ Failed to initialize Mapbox:', error);
            setMapError('Failed to initialize map');
        }
    }, []);

    // Fetch technician position (Phase 1: Basic positioning, Phase 2 will add interpolation)
    useEffect(() => {
        if (!technicianId || !mapLoaded) return;

        const fetchPosition = async () => {
            try {
                const { data, error } = await supabase
                    .from('profiles')
                    .select('current_lat, current_lng, last_location_update')
                    .eq('id', technicianId)
                    .single();

                if (error) throw error;

                if (data?.current_lat && data?.current_lng) {
                    const newPosition = [data.current_lng, data.current_lat]; // Mapbox uses [lng, lat]
                    setPosition(newPosition);
                    setLastUpdate(data.last_location_update);

                    // Center map on technician (Phase 1: Simple centering, Phase 4 will add smart camera)
                    if (mapRef.current) {
                        mapRef.current.flyTo({
                            center: newPosition,
                            zoom: 15,
                            duration: 2000,
                            essential: true
                        });
                    }
                }
            } catch (error) {
                console.error('❌ Error fetching position:', error);
            }
        };

        fetchPosition();

        // Subscribe to real-time updates (Phase 3 will connect to interpolation engine)
        const channel = supabase
            .channel(`tech-tracking-mapbox-${technicianId}`)
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'profiles',
                    filter: `id=eq.${technicianId}`
                },
                (payload) => {
                    const { current_lat, current_lng, last_location_update } = payload.new;
                    if (current_lat && current_lng) {
                        const newPosition = [current_lng, current_lat];
                        setPosition(newPosition);
                        setLastUpdate(last_location_update);

                        // Phase 1: Simple update (Phase 2 will replace with smooth interpolation)
                        if (mapRef.current) {
                            mapRef.current.flyTo({
                                center: newPosition,
                                duration: 2000,
                                essential: true
                            });
                        }
                    }
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [technicianId, mapLoaded]);

    // Loading state
    if (!position && !mapError) {
        return (
            <div className="h-48 bg-slate-100 rounded-lg flex items-center justify-center text-slate-400 text-sm animate-pulse">
                <span className="flex items-center gap-2">
                    <Navigation size={16} className="animate-spin" />
                    Localizando técnico...
                </span>
            </div>
        );
    }

    // Error state
    if (mapError) {
        return (
            <div className="h-48 bg-red-50 rounded-lg flex items-center justify-center text-red-500 text-sm">
                <span className="flex items-center gap-2">
                    ⚠️ {mapError}
                </span>
            </div>
        );
    }

    return (
        <div className="h-64 w-full rounded-xl overflow-hidden shadow-lg border-2 border-slate-200 relative">
            {/* Mapbox Container */}
            <div ref={mapContainerRef} className="h-full w-full" />

            {/* Status Overlay Banner */}
            <div className="absolute top-2 left-2 right-2 bg-white/90 backdrop-blur-sm p-2 rounded-lg shadow-md z-10 flex items-center gap-2 border border-slate-200">
                <div className="bg-green-100 text-green-600 p-1.5 rounded-full animate-pulse">
                    <Navigation size={16} />
                </div>
                <div>
                    <h4 className="text-xs font-bold text-slate-800">Técnico en camino</h4>
                    <p className="text-[10px] text-slate-500">
                        {lastUpdate
                            ? `Actualizado: ${new Date(lastUpdate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                            : 'Ubicación en tiempo real'
                        }
                    </p>
                </div>
            </div>
        </div>
    );
};

export default MapboxTrackingMap;
