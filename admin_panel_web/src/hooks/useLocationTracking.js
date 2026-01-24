import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';

/**
 * useLocationTracking - CORREGIDO POR EL AMIGO DE JAVI
 * 
 * Lógica:
 * 1. Carga horario de business_config.
 * 2. Verifica hora actual vs horario.
 * 3. Si es válido -> GPS ON -> Update 'profiles' (current_lat, current_lng).
 * 4. Si no es válido -> GPS OFF.
 * 5. THROTTLE: Máximo 1 update cada 20s.
 */
export const useLocationTracking = (isActive, userId) => {
    const [isTracking, setIsTracking] = useState(false);
    const [error, setError] = useState(null);

    const watchIdRef = useRef(null);
    const scheduleRef = useRef(null);
    const isTrackingRef = useRef(false);

    // THROTTLE REF
    const lastUpdateRef = useRef(0);

    // 1. Cargar horario de trabajo
    useEffect(() => {
        const loadSchedule = async () => {
            const { data } = await supabase
                .from('business_config')
                .select('value')
                .eq('key', 'working_hours')
                .single();

            if (data?.value) {
                scheduleRef.current = data.value;
                console.log("📅 Horario cargado (Hook):", data.value);
            }
        };
        loadSchedule();
    }, []);

    // 2. Función para verificar si estamos en horario laboral
    const isWorkingNow = () => {
        if (!scheduleRef.current) return false; // Fail-closed

        const now = new Date();
        const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        const currentDay = days[now.getDay()];
        const dayConfig = scheduleRef.current[currentDay];

        if (!dayConfig) {
            console.log(`🛡️ PRIVACIDAD: ${currentDay} cerrado, GPS DETENIDO`);
            return false;
        }

        const nowMins = now.getHours() * 60 + now.getMinutes();
        const [startH, startM] = dayConfig.start.split(':').map(Number);
        const [endH, endM] = dayConfig.end.split(':').map(Number);
        const startMins = startH * 60 + startM;
        const endMins = endH * 60 + endM;

        const isWorking = nowMins >= startMins && nowMins < endMins;

        if (!isWorking) {
            console.log("🛡️ PRIVACIDAD: Fuera de horario, GPS DETENIDO");
        }

        return isWorking;
    };

    // 3. Función para enviar ubicación (THROTTLED)
    const sendLocation = async (position) => {
        if (!isWorkingNow()) {
            stopTracking();
            setError("Fuera de horario laboral");
            return;
        }

        const now = Date.now();
        // 🛡️ THROTTLE: Máximo 1 actualización cada 20 segundos
        if (now - lastUpdateRef.current < 20000) {
            // console.log("⏳ GPS Throttled...");
            return;
        }

        const { latitude, longitude } = position.coords;

        // CORRECCIÓN: Update profiles en lugar de technician_locations
        const { error: dbError } = await supabase
            .from('profiles')
            .update({
                current_lat: latitude,
                current_lng: longitude,
                last_location_update: new Date().toISOString()
            })
            .eq('id', userId);

        if (dbError) {
            console.error("❌ Error enviando ubicación:", dbError);
            setError("Error de conexión");
        } else {
            setError(null);
            setIsTracking(true);
            lastUpdateRef.current = now;
        }
    };

    // 4. Iniciar tracking
    const startTracking = () => {
        if (!userId) return;
        if (isTrackingRef.current) return;

        if (!isWorkingNow()) {
            console.log("🛡️ Bloqueo: No se puede iniciar tracking fuera de horario");
            setError("Horario laboral no activo");
            setIsTracking(false);
            return;
        }

        if ('geolocation' in navigator) {
            watchIdRef.current = navigator.geolocation.watchPosition(
                sendLocation,
                (err) => {
                    console.error("GPS Error:", err);
                    setError(err.message);
                },
                {
                    enableHighAccuracy: true,
                    timeout: 5000,
                    maximumAge: 0
                }
            );
            isTrackingRef.current = true;
            setIsTracking(true);
            console.log("🛰️ GPS Tracking INICIADO (Hook)");
        } else {
            setError("GPS no soportado");
        }
    };

    // 5. Detener tracking
    const stopTracking = () => {
        if (watchIdRef.current !== null) {
            navigator.geolocation.clearWatch(watchIdRef.current);
            watchIdRef.current = null;
            isTrackingRef.current = false;
            setIsTracking(false);
            console.log("🛑 GPS Tracking DETENIDO (Hook)");
        }
    };

    // 6. Control de ciclo de vida
    useEffect(() => {
        if (isActive && userId) {
            // Verificar inmediatamente
            if (isWorkingNow()) {
                startTracking();
            } else {
                console.log("🛡️ Hook Init: Fuera de horario, no iniciamos.");
            }

            // Verificar cada minuto
            const interval = setInterval(() => {
                if (isWorkingNow()) {
                    if (!isTrackingRef.current) {
                        startTracking();
                    }
                } else {
                    if (isTrackingRef.current) {
                        stopTracking();
                    }
                }
            }, 60000); // 1 minuto

            return () => {
                clearInterval(interval);
                stopTracking();
            };
        } else {
            stopTracking();
        }
    }, [isActive, userId]);

    return { isTracking, error };
};
