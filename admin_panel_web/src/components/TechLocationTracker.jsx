import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { MapPin } from 'lucide-react';

const TechLocationTracker = ({ ticketStatus, technicianId }) => {
    const [tracking, setTracking] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        let watchId;

        // Only track if status is 'en_camino'
        if (ticketStatus === 'en_camino' && technicianId) {
            setTracking(true);

            // Options: High accuracy, check every 10s roughly (by throttling in success callback if needed, 
            // but watchPosition triggers on movement. We might want to throttle updates to DB).
            const options = {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 5000
            };

            let lastUpdate = 0;

            const success = async (pos) => {
                const now = Date.now();
                // Throttle updates to every 15 seconds to save DB writes
                if (now - lastUpdate < 15000) return;

                lastUpdate = now;
                const { latitude, longitude } = pos.coords;

                try {
                    await supabase
                        .from('profiles')
                        .update({
                            current_lat: latitude,
                            current_lng: longitude,
                            last_location_update: new Date().toISOString()
                        })
                        .eq('id', technicianId);

                    setError(null);
                } catch (err) {
                    console.error('Error updating location:', err);
                }
            };

            const errorCallback = (err) => {
                console.warn('Geolocation error:', err);
                setError('No se puede acceder al GPS.');
            };

            watchId = navigator.geolocation.watchPosition(success, errorCallback, options);
        } else {
            setTracking(false);
        }

        return () => {
            if (watchId) navigator.geolocation.clearWatch(watchId);
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
