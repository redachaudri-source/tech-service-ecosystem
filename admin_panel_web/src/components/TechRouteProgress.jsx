import React, { useEffect, useState, useRef } from 'react';
import { useGeolocation } from '../hooks/useGeolocation';
import { calculateDistance, estimateTravelTime } from '../utils/geoUtils';
import { MapPin, Navigation, Home, Truck } from 'lucide-react';

const GOOGLE_MAPS_API_KEY = 'AIzaSyAzaTWQlJ7B2xqHvUrhcNUNuN_pN_QKKKQ'; // Using key from TechLocationMap

const TechRouteProgress = ({ ticket, user }) => {
    const { location: userLocation, error: gpsError } = useGeolocation(user?.id, true);
    const [destCoords, setDestCoords] = useState(null);
    const [distance, setDistance] = useState(null); // Current km
    const [initialDistance, setInitialDistance] = useState(null);
    const [progress, setProgress] = useState(0);
    const [loading, setLoading] = useState(true);

    // Load Google Maps Script (if not present) for Geocoding
    useEffect(() => {
        if (window.google && window.google.maps) {
            geocodeAddress();
            return;
        }

        if (!document.querySelector('script[src*="maps.googleapis.com"]')) {
            const script = document.createElement('script');
            script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&loading=async`;
            script.async = true;
            script.defer = true;
            script.onload = () => geocodeAddress();
            document.head.appendChild(script);
        } else {
            // Script loading, wait a bit
            const interval = setInterval(() => {
                if (window.google && window.google.maps) {
                    clearInterval(interval);
                    geocodeAddress();
                }
            }, 500);
            return () => clearInterval(interval);
        }
    }, [ticket.client.address]);

    const geocodeAddress = () => {
        if (!window.google || !window.google.maps) return;
        const geocoder = new window.google.maps.Geocoder();
        const address = `${ticket.client.address}, ${ticket.client.city || ''}`;

        geocoder.geocode({ address: address }, (results, status) => {
            if (status === 'OK' && results[0]) {
                const lat = results[0].geometry.location.lat();
                const lng = results[0].geometry.location.lng();
                setDestCoords({ lat, lng });
            } else {
                console.error('Geocoding failed:', status);
                setLoading(false);
            }
        });
    };

    // Calculate Distance & Progress
    useEffect(() => {
        if (userLocation && destCoords) {
            const d = calculateDistance(
                userLocation.lat,
                userLocation.lng,
                destCoords.lat,
                destCoords.lng
            );
            setDistance(d);

            // Handle Initial Distance Persistence
            const storageKey = `trip_start_dist_${ticket.id}`;
            const storedInit = localStorage.getItem(storageKey);

            if (storedInit) {
                setInitialDistance(parseFloat(storedInit));
            } else {
                // First calculation ever for this trip
                localStorage.setItem(storageKey, d.toString());
                setInitialDistance(d);
            }

            setLoading(false);
        }
    }, [userLocation, destCoords, ticket.id]);

    // Update Progress Percentage
    useEffect(() => {
        if (initialDistance && distance !== null) {
            // If we somehow moved further away, clamp to 0. If closer, goes up.
            // If distance < 0.1km, assume 100%
            if (distance < 0.1) {
                setProgress(100);
            } else {
                let p = 1 - (distance / initialDistance);
                if (p < 0) p = 0.05; // Minimum 5% visible
                if (p > 1) p = 1;
                setProgress(p * 100);
            }
        }
    }, [distance, initialDistance]);

    if (loading && !distance) {
        return (
            <div className="w-full h-16 bg-slate-50 flex items-center justify-center animate-pulse rounded-lg">
                <span className="text-xs font-bold text-slate-400">Calculando ruta...</span>
            </div>
        );
    }

    const travelTime = estimateTravelTime(distance) || 0;

    return (
        <div className="w-full bg-white relative">
            <div className="flex justify-between items-end mb-2 px-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                    <Navigation size={12} className="text-blue-500" />
                    EN RUTTA
                </span>
                <span className="font-mono text-sm font-black text-slate-700">
                    {distance ? distance.toFixed(1) : '--'} km
                    <span className="text-slate-400 text-[10px] ml-1 font-bold">({travelTime} min)</span>
                </span>
            </div>

            {/* PROGRESS BAR TRACK */}
            <div className="h-3 w-full bg-slate-100 rounded-full relative overflow-visible mt-3 mb-1">
                {/* FILL */}
                <div
                    className="h-full bg-gradient-to-r from-blue-400 to-blue-600 rounded-full shadow-sm shadow-blue-200 transition-all duration-[1000ms] ease-out relative"
                    style={{ width: `${progress}%` }}
                >
                    {/* VAN ICON (The "Flag") */}
                    <div className="absolute -right-3 -top-3.5 z-10 transition-all duration-[1000ms]">
                        <div className="bg-blue-600 text-white p-1 rounded-full shadow-lg border-2 border-white transform hover:scale-110 transition cursor-pointer" title="Tu Ubicación">
                            <Truck size={14} fill="currentColor" />
                        </div>
                        {/* Ripple Effect */}
                        <div className="absolute top-1 right-1 w-full h-full bg-blue-400 rounded-full animate-ping opacity-20 -z-10"></div>
                    </div>
                </div>

                {/* END POINTS */}
                {/* Start Dot */}
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-2 h-2 bg-slate-300 rounded-full ml-1"></div>

                {/* House Icon (End) */}
                <div className="absolute -right-1 -top-3">
                    <div className="bg-slate-100 text-slate-400 p-1 rounded-full border border-slate-200">
                        <Home size={12} />
                    </div>
                </div>
            </div>

            <p className="text-[10px] text-center text-slate-400 font-medium mt-3">
                {ticket.client?.address}
            </p>
        </div>
    );
};

export default TechRouteProgress;
