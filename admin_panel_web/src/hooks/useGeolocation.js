import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export const useGeolocation = (technicianId, isTracking) => {
    const [location, setLocation] = useState(null);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!technicianId || !isTracking) {
            return;
        }

        let watchId;
        const options = { enableHighAccuracy: true, timeout: 20000, maximumAge: 1000 };
        let lastUpdate = 0;

        const success = async (pos) => {
            const now = Date.now();
            const { latitude, longitude } = pos.coords;

            // UI Update (Immediate)
            setLocation({ lat: latitude, lng: longitude });

            // Supabase Update (Throttled 10s)
            if (now - lastUpdate > 10000) {
                lastUpdate = now;
                try {
                    await supabase.from('profiles').update({
                        current_lat: latitude,
                        current_lng: longitude,
                        last_location_update: new Date().toISOString()
                    }).eq('id', technicianId);
                    setError(null);
                } catch (err) { console.error("GPS Supabase Update Error:", err); }
            }
        };

        const errorCallback = (err) => {
            console.warn("GPS Watch Error:", err);
            setError(err.message || 'GPS Signal Lost');
        };

        watchId = navigator.geolocation.watchPosition(success, errorCallback, options);

        return () => {
            if (watchId) navigator.geolocation.clearWatch(watchId);
        };

    }, [technicianId, isTracking]);

    return { location, error };
};
