import { useEffect, useState, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { Navigation } from 'lucide-react';
import L from 'leaflet';

// --- LEAFLET ICON FIX ---
import iconUrl from 'leaflet/dist/images/marker-icon.png';
import iconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png';
import shadowUrl from 'leaflet/dist/images/marker-shadow.png';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: iconRetinaUrl,
    iconUrl: iconUrl,
    shadowUrl: shadowUrl,
});

// --- UBER CAR ICON ---
const UberCarIcon = new L.DivIcon({
    className: 'bg-transparent',
    html: `<div style="
        background-color: black; 
        color: white; 
        width: 36px; 
        height: 36px; 
        border-radius: 50%; 
        display: flex; 
        align-items: center; 
        justify-content: center;
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.5);
        border: 2px solid white;
        transition: transform 0.3s ease;
    ">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2" />
            <circle cx="7" cy="17" r="2" />
            <path d="M9 17h6" />
            <circle cx="17" cy="17" r="2" />
        </svg>
    </div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    popupAnchor: [0, -20]
});

// --- SMOOTH MARKER COMPONENT (The "Uber Effect") ---
const SmoothMarker = ({ position, icon, children }) => {
    const markerRef = useRef(null);
    const [currentPos, setCurrentPos] = useState(position);
    const requestRef = useRef();
    const startTimeRef = useRef(null);
    const startPosRef = useRef(position);
    const targetPosRef = useRef(position);

    // Update target when prop changes
    useEffect(() => {
        if (position && (position[0] !== targetPosRef.current[0] || position[1] !== targetPosRef.current[1])) {
            startPosRef.current = currentPos;
            targetPosRef.current = position;
            startTimeRef.current = null; // Reset animation timer

            // Cancel previous animation
            if (requestRef.current) cancelAnimationFrame(requestRef.current);

            // Start new animation
            requestRef.current = requestAnimationFrame(animate);
        }
    }, [position]);

    const animate = (time) => {
        if (!startTimeRef.current) startTimeRef.current = time;
        const progress = Math.min((time - startTimeRef.current) / 2000, 1); // 2000ms duration

        // Linear interpolation (Lerp)
        const lat = startPosRef.current[0] + (targetPosRef.current[0] - startPosRef.current[0]) * progress;
        const lng = startPosRef.current[1] + (targetPosRef.current[1] - startPosRef.current[1]) * progress;

        const newPos = [lat, lng];
        setCurrentPos(newPos);

        if (progress < 1) {
            requestRef.current = requestAnimationFrame(animate);
        }
    };

    useEffect(() => {
        return () => cancelAnimationFrame(requestRef.current);
    }, []);

    return (
        <Marker position={currentPos} icon={icon} ref={markerRef}>
            {children}
        </Marker>
    );
};

// --- RECENTER MAP COMPONENT ---
const RecenterAutomatically = ({ pos }) => {
    const map = useMap();
    useEffect(() => {
        if (pos) {
            map.flyTo(pos, map.getZoom(), {
                animate: true,
                duration: 2 // Slower map pan for smoothness
            });
        }
    }, [pos, map]);
    return null;
};

// --- MAIN COMPONENT ---
const TechLocationMap = ({ technicianId }) => {
    const [position, setPosition] = useState(null);
    const [lastUpdate, setLastUpdate] = useState(null);

    useEffect(() => {
        if (!technicianId) return;

        // Fetch initial
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

        // Subscribe Realtime
        const channel = supabase.channel(`tech-tracking-admin-${technicianId}`)
            .on('postgres_changes',
                { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${technicianId}` },
                (payload) => {
                    const { current_lat, current_lng, last_location_update } = payload.new;
                    if (current_lat && current_lng) {
                        // Position updates here -> Triggers SmoothMarker animation
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
            <span className="flex items-center gap-2">
                <Navigation size={16} className="animate-spin" />
                Localizando técnico...
            </span>
        </div>
    );

    return (
        <div className="h-64 w-full rounded-xl overflow-hidden shadow-lg border-2 border-slate-200 relative z-0">
            <MapContainer
                center={position}
                zoom={14}
                className="h-full w-full"
                scrollWheelZoom={false}
                zoomControl={false}
            >
                <TileLayer
                    url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
                />

                {/* SMOOTH MARKER */}
                <SmoothMarker position={position} icon={UberCarIcon}>
                    <Popup>
                        <div className="text-center font-bold">
                            Técnico en movimiento
                            <br />
                            <span className="text-xs text-slate-500">
                                {lastUpdate ? new Date(lastUpdate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Ahora'}
                            </span>
                        </div>
                    </Popup>
                </SmoothMarker>

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
