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
        // Tracker Init
        console.log('🔍 useLocationTracking - isActive:', isActive, 'userId:', userId);

        if (!isActive || !userId) {
            stopTracking();
            return;
        }

        startTracking();
        return () => stopTracking();
    }, [isActive, userId]);

    const [schedule, setSchedule] = useState(null);

    // 🕒 Load Schedule on Mount
    useEffect(() => {
        const fetchSchedule = async () => {
            const { data } = await supabase.from('business_config').select('value').eq('key', 'working_hours').single();
            if (data) {
                setSchedule(data.value);
                console.log('📅 Schedule loaded for GPS tracking:', data.value);
            }
        };
        fetchSchedule();
    }, []);

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
                    // 🛡️ PRIVACY CHECK: Fail-Closed Strategy
                    const now = new Date();
                    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
                    const currentDay = days[now.getDay()];

                    // Default to CLOSED (Block) until proven OPEN
                    let isAllowed = false;

                    if (schedule) {
                        const dayConfig = schedule[currentDay];

                        // Only if day has config (is open)
                        if (dayConfig) {
                            const currentTime = now.getHours() * 60 + now.getMinutes();
                            const [startH, startM] = dayConfig.start.split(':').map(Number);
                            const [endH, endM] = dayConfig.end.split(':').map(Number);
                            const startTime = startH * 60 + startM;
                            const endTime = endH * 60 + endM;

                            if (currentTime >= startTime && currentTime < endTime) {
                                isAllowed = true;
                            }
                        }
                    } else {
                        console.warn('⚠️ Privacy Schedule not loaded yet - Blocking GPS by default');
                    }

                    if (!isAllowed) {
                        console.log(`🛡️ GPS Paused: Outside Working Hours or Schedule Unloaded (${currentDay})`);
                        setError('⏸️ RASTREO PAUSADO (Fuera de Horario Laboral)');
                        setIsTracking(false);
                        return; // ⛔ STOP
                    }

                    // Proceed only if explicit permission found
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
                    // End check block (structure flattened)
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
