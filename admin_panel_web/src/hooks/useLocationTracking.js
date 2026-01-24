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
                    // 🛡️ PRIVACY CHECK: Working Hours (European Data Protection)
                    const now = new Date();
                    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']; // 0-6
                    const currentDay = days[now.getDay()];

                    // Fetch schedule if not already loaded (Optimization: Cache in a ref or simple fetch per ping if infrequent)
                    // For robustness and real-time updates, we'll fetch 'business_config' occasionally or assume passed via context.
                    // Given hook isolation, let's fast-fetch or check logic here.

                    // To avoid massive reads, we'll fetch once on mount and check.
                    // But to ensure "real-time" compliance, let's do a lightweight check or use the fetched schedule.

                    // BETTER APPROACH: The hook should probably receive the schedule or fetch it.
                    // Let's lazy-fetch inside the hook.

                    if (!window.latestSchedule) {
                        const { data } = await supabase.from('business_config').select('value').eq('key', 'working_hours').single();
                        if (data) window.latestSchedule = data.value;
                    }

                    const schedule = window.latestSchedule;
                    const dayConfig = schedule ? schedule[currentDay] : null;

                    let isAllowed = false;

                    if (dayConfig) {
                        // Check if today is open
                        // Parse times "09:00" -> Compare
                        const currentTime = now.getHours() * 60 + now.getMinutes();
                        const [startH, startM] = dayConfig.start.split(':').map(Number);
                        const [endH, endM] = dayConfig.end.split(':').map(Number);
                        const startTime = startH * 60 + startM;
                        const endTime = endH * 60 + endM;

                        if (currentTime >= startTime && currentTime < endTime) {
                            isAllowed = true;
                        }
                    }

                    if (!isAllowed) {
                        console.log(`🛡️ GPS Paused: Outside Working Hours (${currentDay}, ${now.toLocaleTimeString()})`);
                        setError('⏸️ RASTREO PAUSADO (Fuera de Horario Laboral)');
                        setIsTracking(false); // Visually indicate pause
                        return; // ⛔ STOP: Do not send to DB
                    }

                    // Proceed if allowed
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
                    // Don't show technical errors to user if it's just a hiccup, but show privacy pause clearly
                    if (err.message !== 'Privacy') setError('Error al compartir ubicación');
                }
            },
            (err) => {
                console.error('❌ Geolocation error:', err);
                setError(`Error GPS: ${err.message}`);
                setIsTracking(false);
            },
            {
                enableHighAccuracy: true,
                timeout: 30000, // Increased to 30 seconds
                maximumAge: 0 // Always get fresh position
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
