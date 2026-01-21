import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';

/**
 * Custom hook for GPS location tracking
 * Automatically starts/stops based on isActive prop
 * Sends location updates to Supabase technician_locations table
 */
export const useLocationTracking = (isActive, userId) => {
    const [isTracking, setIsTracking] = useState(false);
    const [error, setError] = useState(null);
    const watchIdRef = useRef(null);

    useEffect(() => {
        console.log('🔍 useLocationTracking - isActive:', isActive, 'userId:', userId);

        if (!isActive || !userId) {
            stopTracking();
            return;
        }

        startTracking();
        return () => stopTracking();
    }, [isActive, userId]);

    const startTracking = () => {
        if (!navigator.geolocation) {
            setError('GPS no disponible en este dispositivo');
            console.error('❌ Geolocation API not supported');
            return;
        }

        console.log('🚀 Starting GPS tracking...');

        watchIdRef.current = navigator.geolocation.watchPosition(
            async (position) => {
                const { latitude, longitude, heading, speed } = position.coords;

                try {
                    const { error: dbError } = await supabase
                        .from('technician_locations')
                        .upsert({
                            technician_id: userId,
                            latitude,
                            longitude,
                            heading: heading || 0,
                            speed: speed || 0,
                            updated_at: new Date().toISOString()
                        });

                    if (dbError) throw dbError;

                    setIsTracking(true);
                    setError(null);
                    console.log('✅ GPS Tracking ACTIVE - isTracking:', true);
                    console.log(`📍 Location updated: ${latitude.toFixed(6)}, ${longitude.toFixed(6)} | Heading: ${heading}° | Speed: ${speed} m/s`);
                } catch (err) {
                    console.error('❌ Error updating location:', err);
                    setError('Error al compartir ubicación');
                }
            },
            (err) => {
                console.error('❌ Geolocation error:', err);
                setError(`Error GPS: ${err.message}`);
                setIsTracking(false);
            },
            {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 5000
            }
        );
    };

    const stopTracking = () => {
        if (watchIdRef.current) {
            navigator.geolocation.clearWatch(watchIdRef.current);
            watchIdRef.current = null;
            setIsTracking(false);
            console.log('🛑 GPS tracking stopped');
        }
    };

    return { isTracking, error };
};
