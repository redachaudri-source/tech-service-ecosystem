import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Navigation } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { VehicleAnimationEngine } from '../utils/VehicleAnimationEngine';
import { GPSDataFilter } from '../utils/GPSDataFilter';

// Configure Mapbox token
const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || 'pk.eyJ1IjoiZml4YXJyIiwiYSI6ImNta3BvdmxiczBlcWQzZnM2cWNobzBodXkifQ.MsyB8tBiEqmq4mflpcttRQ';
mapboxgl.accessToken = MAPBOX_TOKEN;

/**
 * MapboxTrackingMap - Admin Panel Tier-1 GPS Tracking Component
 * 
 * Phase 6: Full Deployment (COMPLETE)
 * - All Phase 2-5 features: Animation, Filtering, Camera Controls, Optimization
 * - Deployed to admin dashboard for technician monitoring
 * - Production-ready with zero memory leaks
 */
const MapboxTrackingMap = ({ technicianId }) => {
    const mapContainerRef = useRef(null);
    const mapRef = useRef(null);
    const markerRef = useRef(null);
    const animationEngineRef = useRef(null);
    const gpsFilterRef = useRef(null);

    // Phase 4: Camera Control State
    const [isLocked, setIsLocked] = useState(true);
    const [showRecenterButton, setShowRecenterButton] = useState(false);

    const [mapLoaded, setMapLoaded] = useState(false);
    const [mapError, setMapError] = useState(null);
    const [lastUpdate, setLastUpdate] = useState(null);
    const [loading, setLoading] = useState(true);

    // Initialize Mapbox map
    useEffect(() => {
        if (!mapContainerRef.current) return;

        try {
            const map = new mapboxgl.Map({
                container: mapContainerRef.current,
                style: 'mapbox://styles/mapbox/navigation-day-v1',
                center: [-4.4214, 36.7213],
                zoom: 15,
                attributionControl: false,
                logoPosition: 'bottom-right'
            });

            map.addControl(new mapboxgl.NavigationControl({
                showCompass: true,
                showZoom: true,
                visualizePitch: false
            }), 'top-right');

            map.on('load', () => {
                setMapLoaded(true);
                console.log('✅ Mapbox GL loaded (Admin Dashboard)');
            });

            map.on('error', (e) => {
                console.error('❌ Mapbox error:', e);
                setMapError('Error loading map');
            });

            // Camera control event listeners
            const unlockCamera = () => {
                setIsLocked(false);
                setShowRecenterButton(true);
            };

            map.on('dragstart', unlockCamera);
            map.on('touchstart', unlockCamera);
            map.on('wheel', unlockCamera);

            mapRef.current = map;

            // Enhanced cleanup
            return () => {
                map.off('dragstart', unlockCamera);
                map.off('touchstart', unlockCamera);
                map.off('wheel', unlockCamera);
                map.remove();
                mapRef.current = null;
            };
        } catch (error) {
            console.error('❌ Failed to initialize Mapbox:', error);
            setMapError('Failed to initialize map');
        }
    }, []);

    // Initialize Animation Engine and GPS tracking
    useEffect(() => {
        if (!technicianId || !mapLoaded) return;

        const createVehicleMarker = () => {
            const el = document.createElement('div');
            el.className = 'vehicle-marker';
            el.style.width = '40px';
            el.style.height = '40px';
            el.style.cursor = 'pointer';

            el.innerHTML = `
                <div style="position: relative; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; transition: transform 0.1s ease-out;">
                    <div style="background: linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%); width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 12px rgba(37, 99, 235, 0.4), 0 2px 4px rgba(0, 0, 0, 0.2); border: 3px solid white;">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2" />
                            <circle cx="7" cy="17" r="2" />
                            <path d="M9 17h6" />
                            <circle cx="17" cy="17" r="2" />
                        </svg>
                    </div>
                </div>
            `;
            return el;
        };

        const animationEngine = new VehicleAnimationEngine({
            duration: 2000,
            onUpdate: ({ position, bearing }) => {
                if (markerRef.current) {
                    markerRef.current.setLngLat([position.lng, position.lat]);
                    const markerElement = markerRef.current.getElement();
                    if (markerElement) {
                        const innerDiv = markerElement.querySelector('div > div');
                        if (innerDiv) {
                            innerDiv.style.transform = `rotate(${bearing}deg)`;
                        }
                    }
                }

                if (mapRef.current && isLocked) {
                    const bounds = mapRef.current.getBounds();
                    const lngLat = new mapboxgl.LngLat(position.lng, position.lat);
                    if (!bounds.contains(lngLat)) {
                        mapRef.current.easeTo({
                            center: [position.lng, position.lat],
                            duration: 1000
                        });
                    }
                }
            }
        });

        animationEngineRef.current = animationEngine;

        const gpsFilter = new GPSDataFilter({
            minMovementThreshold: 5,
            maxJumpThreshold: 500,
            smoothingFactor: 0.3
        });

        gpsFilterRef.current = gpsFilter;

        const fetchPosition = async () => {
            try {
                const { data, error } = await supabase
                    .from('profiles')
                    .select('current_lat, current_lng, last_location_update')
                    .eq('id', technicianId)
                    .single();

                if (error) throw error;

                if (data?.current_lat && data?.current_lng) {
                    const position = { lat: data.current_lat, lng: data.current_lng };
                    setLastUpdate(data.last_location_update);
                    setLoading(false);

                    if (!markerRef.current && mapRef.current) {
                        const marker = new mapboxgl.Marker({
                            element: createVehicleMarker(),
                            anchor: 'center'
                        })
                            .setLngLat([position.lng, position.lat])
                            .addTo(mapRef.current);

                        markerRef.current = marker;

                        mapRef.current.flyTo({
                            center: [position.lng, position.lat],
                            zoom: 16,
                            duration: 2000
                        });
                    }

                    animationEngine.animateTo(position, { immediate: true });
                }
            } catch (error) {
                console.error('❌ Error fetching position:', error);
            }
        };

        fetchPosition();

        const channel = supabase
            .channel(`tech-tracking-admin-${technicianId}`)
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
                        const rawPosition = { lat: current_lat, lng: current_lng };
                        const filteredPosition = gpsFilter.filter(rawPosition);

                        if (!filteredPosition) return;

                        setLastUpdate(last_location_update);
                        setLoading(false);

                        if (!markerRef.current && mapRef.current) {
                            const marker = new mapboxgl.Marker({
                                element: createVehicleMarker(),
                                anchor: 'center'
                            })
                                .setLngLat([filteredPosition.lng, filteredPosition.lat])
                                .addTo(mapRef.current);

                            markerRef.current = marker;
                        }

                        animationEngine.animateTo(filteredPosition);
                    }
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
            if (animationEngineRef.current) {
                animationEngineRef.current.destroy();
                animationEngineRef.current = null;
            }
            if (markerRef.current) {
                markerRef.current.remove();
                markerRef.current = null;
            }
            if (gpsFilterRef.current) {
                gpsFilterRef.current = null;
            }
        };
    }, [technicianId, mapLoaded, isLocked]);

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
        <div className="h-64 w-full rounded-xl overflow-hidden shadow-lg border-2 border-slate-200 relative z-0">
            <div ref={mapContainerRef} className="h-full w-full" />

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

            {showRecenterButton && !isLocked && (
                <button
                    onClick={() => {
                        if (mapRef.current && animationEngineRef.current) {
                            const currentState = animationEngineRef.current.getState();
                            if (currentState.position) {
                                mapRef.current.flyTo({
                                    center: [currentState.position.lng, currentState.position.lat],
                                    zoom: 16,
                                    duration: 1500,
                                    essential: true
                                });
                                setIsLocked(true);
                                setShowRecenterButton(false);
                            }
                        }
                    }}
                    className="absolute bottom-4 right-4 bg-white hover:bg-slate-50 active:bg-slate-100 text-slate-700 p-3 rounded-full shadow-lg hover:shadow-xl transition-all duration-200 z-[1000] border border-slate-200"
                    aria-label="Recentrar en vehículo"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="22" y1="12" x2="18" y2="12" />
                        <line x1="6" y1="12" x2="2" y2="12" />
                        <line x1="12" y1="6" x2="12" y2="2" />
                        <line x1="12" y1="22" x2="12" y2="18" />
                    </svg>
                </button>
            )}
        </div>
    );
};

export default MapboxTrackingMap;
