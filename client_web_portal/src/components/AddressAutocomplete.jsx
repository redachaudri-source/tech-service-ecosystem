import { useState, useEffect } from 'react';
import { MapPin, Search, Loader2 } from 'lucide-react';
import usePlacesAutocomplete, { getGeocode, getLatLng } from "use-places-autocomplete";

// Google Maps Script Loader
const loadGoogleMapsScript = (callback) => {
    if (window.google?.maps?.places) {
        callback();
        return;
    }
    
    const existingScript = document.getElementById('googleMapsScript');
    if (existingScript) {
        existingScript.addEventListener('load', callback);
        return;
    }
    
    const script = document.createElement('script');
    script.id = 'googleMapsScript';
    script.src = `https://maps.googleapis.com/maps/api/js?key=AIzaSyARtxO5dn63c3TKh5elT06jl42ai_ItEcA&libraries=places&language=es`;
    script.async = true;
    script.defer = true;
    script.onload = () => callback();
    document.body.appendChild(script);
};

/**
 * AddressAutocomplete Component
 * Provides Google Places autocomplete for address input
 * 
 * @param {string} value - Current address value
 * @param {function} onChange - Callback when address text changes
 * @param {function} onSelect - Callback when address is selected from suggestions
 *                              Receives: { address, postal_code, city, latitude, longitude }
 * @param {string} placeholder - Input placeholder text
 * @param {string} className - Additional CSS classes for the container
 */
const AddressAutocomplete = ({ 
    value = '', 
    onChange, 
    onSelect, 
    placeholder = "Buscar dirección...",
    className = ""
}) => {
    const [isGoogleReady, setIsGoogleReady] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    // Load Google Maps script
    useEffect(() => {
        loadGoogleMapsScript(() => {
            setIsGoogleReady(true);
            setIsLoading(false);
        });
    }, []);

    // Google Places hook
    const {
        ready,
        suggestions: { status, data },
        setValue,
        clearSuggestions,
        init
    } = usePlacesAutocomplete({
        requestOptions: {
            componentRestrictions: { country: "es" },
            types: ['address']
        },
        debounce: 300,
        initOnMount: false,
    });

    // Initialize when Google is ready
    useEffect(() => {
        if (isGoogleReady && window.google) {
            init();
        }
    }, [isGoogleReady, init]);

    // Sync external value
    useEffect(() => {
        if (value !== undefined) {
            setValue(value, false);
        }
    }, [value]);

    // Handle input change
    const handleInputChange = (e) => {
        const newValue = e.target.value;
        setValue(newValue);
        if (onChange) onChange(newValue);
    };

    // Handle suggestion selection
    const handleSelect = async (description) => {
        setValue(description, false);
        clearSuggestions();
        
        if (onChange) onChange(description);

        try {
            const results = await getGeocode({ address: description });
            const { lat, lng } = await getLatLng(results[0]);

            // Extract address components
            const addressComponents = results[0].address_components;
            const postalCodeObj = addressComponents.find(c => c.types.includes('postal_code'));
            const cityObj = addressComponents.find(c => c.types.includes('locality')) ||
                addressComponents.find(c => c.types.includes('administrative_area_level_2'));

            // Call onSelect with full address data
            if (onSelect) {
                onSelect({
                    address: description,
                    postal_code: postalCodeObj?.long_name || '',
                    city: cityObj?.long_name || '',
                    latitude: lat,
                    longitude: lng
                });
            }
        } catch (error) {
            console.error("Google Geocoding Error:", error);
            // Still call onSelect with basic data if geocoding fails
            if (onSelect) {
                onSelect({
                    address: description,
                    postal_code: '',
                    city: '',
                    latitude: null,
                    longitude: null
                });
            }
        }
    };

    return (
        <div className={`relative ${className}`}>
            <div className="relative">
                {isLoading ? (
                    <Loader2 size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 animate-spin" />
                ) : (
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                )}
                <input
                    value={value}
                    onChange={handleInputChange}
                    disabled={!ready && isGoogleReady}
                    placeholder={isLoading ? "Cargando..." : placeholder}
                    className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition disabled:bg-slate-50 disabled:cursor-wait"
                />
            </div>
            
            {/* Suggestions Dropdown */}
            {status === "OK" && data.length > 0 && (
                <div className="absolute z-50 w-full bg-white border border-slate-200 mt-1 rounded-xl shadow-xl overflow-hidden max-h-60 overflow-y-auto">
                    {data.map(({ place_id, description }) => (
                        <div
                            key={place_id}
                            onClick={() => handleSelect(description)}
                            className="px-4 py-3 hover:bg-blue-50 cursor-pointer text-sm border-b border-slate-100 last:border-0 flex items-start gap-3"
                        >
                            <MapPin size={16} className="text-blue-500 mt-0.5 shrink-0" />
                            <span className="text-slate-700">{description}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default AddressAutocomplete;
