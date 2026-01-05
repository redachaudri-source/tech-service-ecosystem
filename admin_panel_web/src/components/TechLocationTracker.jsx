import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

const TRACKING_INTERVAL = 10000; // 10 seconds

const TechLocationTracker = () => {
    const [active, setActive] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        // Start tracking immediately if we are mounting (meaning user is logged in as tech)
        // Ideally we check if there are "en_camino" tickets, but for now we track as long as app is open for simplicity in MVP
        // or we can just track if the user allows it.
        startTracking();

        return () => stopTracking();
    }, []);

    const startTracking = async () => {
        if (!navigator.geolocation) {
            setError('Geolocation not supported');
            return;
        }

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        setActive(true);
        console.log('📡 Starting GPS Tracking for Tech:', user.email);

        const watchId = navigator.geolocation.watchPosition(
            (position) => {
                updateLocation(user.id, position);
            },
            (err) => {
                console.error('GPS Error:', err);
                setError(err.message);
            },
            {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 0
            }
        );

        // Cleanup function for internal use
        window.techWatchId = watchId;
    };

    const stopTracking = () => {
        if (window.techWatchId) {
            navigator.geolocation.clearWatch(window.techWatchId);
        }
        setActive(false);
    };

    const updateLocation = async (userId, position) => {
        try {
            const { latitude, longitude, heading, speed } = position.coords;

            // Upsert location
            const { error } = await supabase
                .from('technician_locations')
                .upsert({
                    technician_id: userId,
                    latitude,
                    longitude,
                    heading: heading || 0,
                    speed: speed || 0,
                    updated_at: new Date().toISOString()
                });

            if (error) throw error;
            // console.log('📍 Location updated:', latitude, longitude);

        } catch (err) {
            console.error('Error syncing location:', err);
        }
    };

    if (error) return null; // Invisible component usually, or show error icon
    return null; // This is a "headless" component
};

export default TechLocationTracker;
