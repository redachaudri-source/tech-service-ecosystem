import { useState, useEffect } from 'react';
import { APIProvider, Map, AdvancedMarker, Pin, InfoWindow } from '@vis.gl/react-google-maps';
import { supabase } from '../lib/supabase';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || 'AIzaSyAzaTWQlJ7B2xqHvUrhcNUNuN_pN_QKKKQ'; // Fallback to provided key

const FleetMap = () => {
    const [locations, setLocations] = useState([]);
    const [selectedTech, setSelectedTech] = useState(null);

    useEffect(() => {
        fetchLocations();

        // Realtime Subscription
        const subscription = supabase
            .channel('fleet-map-tracker')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'technician_locations' }, (payload) => {
                handleRealtimeUpdate(payload);
            })
            .subscribe();

        return () => {
            supabase.removeChannel(subscription);
        };
    }, []);

    const fetchLocations = async () => {
        const { data, error } = await supabase
            .from('technician_locations')
            .select(`
                *,
                profiles:technician_id(full_name, avatar_url, role)
            `);

        if (data) setLocations(data);
    };

    const handleRealtimeUpdate = async (payload) => {
        // Optimistic update or refetch? Refetch is safer for joining profile data
        // For efficiency in high freq, we could merge payload, but profile name is needed.
        // Let's just fetch the specific row's profile info if it's an insert/update.
        fetchLocations();
    };

    // Center map on Malaga by default or average of techs
    const defaultCenter = { lat: 36.7212, lng: -4.4217 };

    return (
        <div className="h-[500px] w-full rounded-2xl overflow-hidden shadow-sm border border-slate-200 relative">
            <APIProvider apiKey={GOOGLE_MAPS_API_KEY}>
                <Map
                    defaultCenter={defaultCenter}
                    defaultZoom={11}
                    mapId="DEMO_MAP_ID" // Required for AdvancedMarker
                    fullscreenControl={false}
                    streetViewControl={false}
                    mapTypeControl={false}
                >
                    {locations.map(loc => (
                        <AdvancedMarker
                            key={loc.technician_id}
                            position={{ lat: loc.latitude, lng: loc.longitude }}
                            onClick={() => setSelectedTech(loc)}
                        >
                            <div className="relative group">
                                <div className="absolute -top-12 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-xs font-bold px-2 py-1 rounded shadow-lg opacity-0 group-hover:opacity-100 transition whitespace-nowrap z-10">
                                    {loc.profiles?.full_name || 'Técnico'}
                                </div>
                                <div className="w-10 h-10 rounded-full border-2 border-white shadow-lg overflow-hidden relative bg-blue-600 flex items-center justify-center transform transition hover:scale-110">
                                    {/* Pin Avatar or Icon */}
                                    {loc.profiles?.avatar_url ? (
                                        <img src={loc.profiles.avatar_url} alt="" className="w-full h-full object-cover" />
                                    ) : (
                                        <span className="text-white font-bold text-xs">{(loc.profiles?.full_name || 'T')[0]}</span>
                                    )}
                                    {/* Status indicator (green dot) */}
                                    <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-white rounded-full"></div>
                                </div>
                            </div>
                        </AdvancedMarker>
                    ))}

                    {selectedTech && (
                        <InfoWindow
                            position={{ lat: selectedTech.latitude, lng: selectedTech.longitude }}
                            onCloseClick={() => setSelectedTech(null)}
                            pixelOffset={[0, -40]}
                        >
                            <div className="p-1 min-w-[150px]">
                                <h3 className="font-bold text-slate-800 text-sm mb-1">{selectedTech.profiles?.full_name}</h3>
                                <p className="text-xs text-slate-500">
                                    Velocidad: {Math.round(selectedTech.speed * 3.6)} km/h
                                </p>
                                <p className="text-[10px] text-slate-400 mt-1">
                                    Actualizado {formatDistanceToNow(new Date(selectedTech.updated_at), { addSuffix: true, locale: es })}
                                </p>
                            </div>
                        </InfoWindow>
                    )}
                </Map>
            </APIProvider>

            {/* Legend / Overlay */}
            <div className="absolute top-4 left-4 bg-white/90 backdrop-blur px-4 py-2 rounded-xl shadow-lg border border-white/50 z-10">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Flota en tiempo real</h3>
                <div className="flex items-center gap-2 mt-1">
                    <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                    <span className="text-sm font-bold text-slate-800">{locations.length} Activos</span>
                </div>
            </div>
        </div>
    );
};

export default FleetMap;
