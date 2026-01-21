import React, { useEffect, useState, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { Phone, Navigation as NavigationIcon, X } from 'lucide-react';

const GOOGLE_MAPS_API_KEY = 'AIzaSyAzaTWQlJ7B2xqHvUrhcNUNuN_pN_QKKKQ';

const TechnicianTracking = ({ ticketId, onClose }) => {
    const mapRef = useRef(null);
    const [map, setMap] = useState(null);
    const [techMarker, setTechMarker] = useState(null);
    const [clientMarker, setClientMarker] = useState(null);
    const [routeLine, setRouteLine] = useState(null);

    const [ticket, setTicket] = useState(null);
    const [techLocation, setTechLocation] = useState(null);
    const [loading, setLoading] = useState(true);

    // Animation state
    const animationRef = useRef(null);
    const currentPosRef = useRef(null);
    const targetPosRef = useRef(null);

    // Load Google Maps script
    useEffect(() => {
        if (window.google) {
            initMap();
            return;
        }

        const script = document.createElement('script');
        script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&libraries=geometry`;
        script.async = true;
        script.defer = true;
        script.onload = initMap;
        document.head.appendChild(script);

        return () => {
            if (script.parentNode) {
                script.parentNode.removeChild(script);
            }
        };
    }, []);

    // Fetch ticket data
    useEffect(() => {
        fetchTicket();
    }, [ticketId]);

    // Subscribe to technician location updates
    useEffect(() => {
        if (!ticket?.technician_id) return;

        const channel = supabase
            .channel(`tech-location-${ticket.technician_id}`)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'technician_locations',
                    filter: `technician_id=eq.${ticket.technician_id}`
                },
                (payload) => {
                    console.log('📍 Location update:', payload);
                    if (payload.new) {
                        setTechLocation(payload.new);
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
    }, [ticket?.technician_id]);

    const fetchTicket = async () => {
        try {
            const { data, error } = await supabase
                .from('tickets')
                .select('*, profiles(*)')
                .eq('id', ticketId)
                .single();

            if (error) throw error;
            setTicket(data);
        } catch (error) {
            console.error('Error fetching ticket:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchTechLocation = async () => {
        if (!ticket?.technician_id) return;

        try {
            const { data, error } = await supabase
                .from('technician_locations')
                .select('*')
                .eq('technician_id', ticket.technician_id)
                .single();

            if (error) throw error;
            if (data) {
                setTechLocation(data);
                currentPosRef.current = { lat: data.latitude, lng: data.longitude };
            }
        } catch (error) {
            console.error('Error fetching tech location:', error);
        }
    };

    const initMap = () => {
        if (!mapRef.current || !window.google) return;

        const defaultCenter = { lat: 36.7213, lng: -4.4214 }; // Malaga
        const newMap = new window.google.maps.Map(mapRef.current, {
            center: defaultCenter,
            zoom: 14,
            disableDefaultUI: false,
            zoomControl: true,
            mapTypeControl: false,
            streetViewControl: false,
        });

        setMap(newMap);
    };

    const animateMarkerToPosition = (location) => {
        if (!map || !window.google) return;

        const newPos = { lat: location.latitude, lng: location.longitude };
        targetPosRef.current = newPos;

        if (!currentPosRef.current) {
            currentPosRef.current = newPos;
            updateMarkers(newPos, location.heading || 0);
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
            updateMarkers({ lat, lng }, location.heading || 0);

            if (progress < 1) {
                animationRef.current = requestAnimationFrame(animate);
            }
        };

        if (animationRef.current) {
            cancelAnimationFrame(animationRef.current);
        }
        animate();
    };

    const updateMarkers = (techPos, heading) => {
        if (!map || !window.google) return;

        // Update or create technician marker
        if (techMarker) {
            techMarker.setPosition(techPos);
            techMarker.setIcon({
                path: window.google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
                scale: 5,
                fillColor: '#1a73e8',
                fillOpacity: 1,
                strokeColor: '#ffffff',
                strokeWeight: 2,
                rotation: heading,
            });
        } else {
            const marker = new window.google.maps.Marker({
                position: techPos,
                map: map,
                title: 'Técnico',
                icon: {
                    path: window.google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
                    scale: 5,
                    fillColor: '#1a73e8',
                    fillOpacity: 1,
                    strokeColor: '#ffffff',
                    strokeWeight: 2,
                    rotation: heading,
                },
            });
            setTechMarker(marker);
        }

        // Create client marker if not exists
        if (!clientMarker && ticket?.profiles) {
            const clientPos = {
                lat: ticket.profiles.latitude || 36.7213,
                lng: ticket.profiles.longitude || -4.4214,
            };

            const marker = new window.google.maps.Marker({
                position: clientPos,
                map: map,
                title: 'Tu ubicación',
                icon: {
                    path: window.google.maps.SymbolPath.CIRCLE,
                    scale: 8,
                    fillColor: '#34a853',
                    fillOpacity: 1,
                    strokeColor: '#ffffff',
                    strokeWeight: 2,
                },
            });
            setClientMarker(marker);

            // Fetch and draw route
            fetchRoute(techPos, clientPos);
        }

        // Center map on technician
        map.panTo(techPos);
    };

    const fetchRoute = async (origin, destination) => {
        if (!window.google) return;

        const directionsService = new window.google.maps.DirectionsService();

        try {
            const result = await directionsService.route({
                origin,
                destination,
                travelMode: window.google.maps.TravelMode.DRIVING,
            });

            if (routeLine) {
                routeLine.setMap(null);
            }

            const newRouteLine = new window.google.maps.Polyline({
                path: result.routes[0].overview_path,
                geodesic: true,
                strokeColor: '#4285F4',
                strokeOpacity: 1.0,
                strokeWeight: 4,
                map: map,
            });

            setRouteLine(newRouteLine);
        } catch (error) {
            console.error('Error fetching route:', error);
        }
    };

    const callTechnician = () => {
        if (ticket?.technician?.phone) {
            window.location.href = `tel:${ticket.technician.phone}`;
        }
    };

    if (loading) {
        return (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                <div className="bg-white p-8 rounded-2xl">
                    <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto"></div>
                    <p className="mt-4 text-slate-600">Cargando mapa...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 bg-white z-50 flex flex-col">
            {/* Header */}
            <div className="bg-white border-b border-slate-200 p-4 flex items-center justify-between shadow-sm">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                        <NavigationIcon size={20} className="text-blue-600" />
                    </div>
                    <div>
                        <h2 className="font-bold text-slate-900">Tu técnico viene en camino</h2>
                        <p className="text-xs text-slate-500">Servicio #{ticket?.ticket_number}</p>
                    </div>
                </div>
                <button
                    onClick={onClose}
                    className="p-2 hover:bg-slate-100 rounded-full transition"
                >
                    <X size={24} className="text-slate-600" />
                </button>
            </div>

            {/* Map */}
            <div ref={mapRef} className="flex-1" />

            {/* Bottom Info Card */}
            <div className="bg-white border-t border-slate-200 p-4 shadow-lg">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                        <div>
                            <p className="text-sm font-bold text-slate-900">
                                {ticket?.technician?.full_name || 'Técnico'}
                            </p>
                            <p className="text-xs text-slate-500">Llegará pronto</p>
                        </div>
                    </div>

                    {ticket?.technician?.phone && (
                        <button
                            onClick={callTechnician}
                            className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-full font-bold hover:bg-green-600 transition"
                        >
                            <Phone size={16} />
                            Llamar
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default TechnicianTracking;
