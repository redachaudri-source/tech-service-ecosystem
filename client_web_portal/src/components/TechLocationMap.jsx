import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { Navigation } from 'lucide-react';

// Fix for Leaflet default icon issues in React
import L from 'leaflet';
import iconUrl from 'leaflet/dist/images/marker-icon.png';
import iconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png';
import shadowUrl from 'leaflet/dist/images/marker-shadow.png';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: iconRetinaUrl,
    iconUrl: iconUrl,
    shadowUrl: shadowUrl,
});

// Component to recenter map when position changes
const RecenterAutomatically = ({ pos }) => {
    const map = useMap();
    useEffect(() => {
        if (pos) {
            map.flyTo(pos, map.getZoom());
        }
    }, [pos, map]);
    return null;
};

const TechLocationMap = ({ technicianId }) => {
    const [position, setPosition] = useState(null);
    const [lastUpdate, setLastUpdate] = useState(null);

    useEffect(() => {
        if (!technicianId) return;

        // Fetch initial position
        const fetchPos = async () => {
            const { data } = await supabase
                .from('profiles')
                .select('current_lat, current_lng, last_location_update')
                .eq('id', technicianId)
                .single();

            if (data && data.current_lat && data.current_lng) {
                setPosition([data.current_lat, data.current_lng]);
                setLastUpdate(data.last_location_update);
            }
        };

        fetchPos();

        // Subscribe to updates
        const channel = supabase.channel(`tech-tracking-${technicianId}`)
            .on('postgres_changes',
                { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${technicianId}` },
                (payload) => {
                    const { current_lat, current_lng, last_location_update } = payload.new;
                    if (current_lat && current_lng) {
                        setPosition([current_lat, current_lng]);
                        setLastUpdate(last_location_update);
                    }
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [technicianId]);

    if (!position) return (
        <div className="h-48 bg-slate-100 rounded-lg flex items-center justify-center text-slate-400 text-sm animate-pulse">
            Esperando ubicación del técnico...
        </div>
    );

    return (
        <div className="h-64 w-full rounded-xl overflow-hidden shadow-lg border-2 border-slate-200 relative z-0">
            <MapContainer
                center={position}
                zoom={14}
                className="h-full w-full"
                scrollWheelZoom={false}
            >
                <TileLayer
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                />
                <Marker position={position}>
                    <Popup>
                        <div className="text-center font-bold">
                            Tu técnico está aquí
                            <br />
                            <span className="text-xs text-slate-500">
                                {lastUpdate ? new Date(lastUpdate).toLocaleTimeString() : ''}
                            </span>
                        </div>
                    </Popup>
                </Marker>
                <RecenterAutomatically pos={position} />
            </MapContainer>

            {/* Overlay Banner */}
            <div className="absolute top-2 left-2 right-2 bg-white/90 backdrop-blur-sm p-2 rounded-lg shadow-md z-[1000] flex items-center gap-2 border border-slate-200">
                <div className="bg-green-100 text-green-600 p-1.5 rounded-full animate-pulse">
                    <Navigation size={16} />
                </div>
                <div>
                    <h4 className="text-xs font-bold text-slate-800">Técnico en camino</h4>
                    <p className="text-[10px] text-slate-500">Ubicación actualizada en tiempo real</p>
                </div>
            </div>
        </div>
    );
};

export default TechLocationMap;
