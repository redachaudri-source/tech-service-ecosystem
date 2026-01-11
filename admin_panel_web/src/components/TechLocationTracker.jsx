import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { MapPin } from 'lucide-react';

const TechLocationTracker = ({ ticketStatus, technicianId }) => {
    const [tracking, setTracking] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!technicianId) return;

        // 1. High Precision Tracking (Movement) - Only when 'en_camino'
        let watchId;
        if (ticketStatus === 'en_camino') {
            setTracking(true);
            const options = { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 };
            let lastUpdate = 0;

            const success = async (pos) => {
                const now = Date.now();
                if (now - lastUpdate < 15000) return; // Throttle 15s
                lastUpdate = now;
                const { latitude, longitude } = pos.coords;

                try {
                    await supabase.from('profiles').update({
                        current_lat: latitude,
                        current_lng: longitude,
                        last_location_update: new Date().toISOString()
                    }).eq('id', technicianId);
                    setError(null);
                } catch (err) { console.error(err); }
            };

            const errorCallback = (err) => { console.warn(err); setError('GPS Error'); };
            watchId = navigator.geolocation.watchPosition(success, errorCallback, options);
        } else {
            setTracking(false);
            if (watchId) navigator.geolocation.clearWatch(watchId);
        }

        // 2. Heartbeat (Presence) - Runs ALWAYS every 60s
        const heartbeat = setInterval(async () => {
            // Just update timestamp to show "Online"
            try {
                await supabase.from('profiles').update({
                    last_location_update: new Date().toISOString()
                }).eq('id', technicianId);
            } catch (e) {
                console.error("Heartbeat fail", e);
            }
        }, 60000); // 60 seconds

        // Initial Ping on Mount
        supabase.from('profiles').update({ last_location_update: new Date().toISOString() }).eq('id', technicianId).then();

        return () => {
            if (watchId) navigator.geolocation.clearWatch(watchId);
            clearInterval(heartbeat);
        };
    }, [ticketStatus, technicianId]);

    if (!tracking) return null;

    if (error) {
        return (
            <div className="fixed bottom-4 right-4 bg-red-100 text-red-700 px-3 py-2 rounded-full text-xs font-bold shadow-lg z-50 flex items-center gap-2">
                <MapPin size={14} />
                GPS Error: {error}
            </div>
        );
    }

    return (
        <div className="fixed bottom-4 right-4 bg-green-100 text-green-700 px-3 py-2 rounded-full text-xs font-bold shadow-lg z-50 flex items-center gap-2 animate-pulse">
            <MapPin size={14} />
            Compartiendo Ubicación con Cliente
        </div>
    );
};

export default TechLocationTracker;
