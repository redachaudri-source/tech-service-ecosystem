import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { X, MapPin, Navigation, Search, User, Phone, Mail, Building2 } from 'lucide-react';
import { MAPBOX_TOKEN } from '../config/mapbox';
import usePlacesAutocomplete, { getGeocode, getLatLng } from "use-places-autocomplete";
import Map, { Marker, NavigationControl } from 'react-map-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

// GOOGLE MAPS LOADER HELPER
const loadGoogleMapsScript = (callback) => {
    const existingScript = document.getElementById('googleMapsScript');
    if (existingScript) {
        callback();
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
 * ClientFormModal - Reusable modal for creating/editing clients
 * 
 * Features:
 * - Google Places autocomplete for address
 * - Mapbox for precise pin adjustment
 * - Auto postal code extraction
 * - Floor/Apartment fields
 * - GPS coordinates display
 * 
 * @param {boolean} isOpen - Controls modal visibility
 * @param {function} onClose - Callback when modal closes
 * @param {function} onSuccess - Callback with created/edited client data
 * @param {object} editClient - Optional client to edit (null for new)
 */
const ClientFormModal = ({ isOpen, onClose, onSuccess, editClient = null }) => {
    const [loading, setLoading] = useState(false);
    const [isGoogleReady, setIsGoogleReady] = useState(false);
    const [showMap, setShowMap] = useState(false);

    // Form State
    const [fullName, setFullName] = useState('');
    const [email, setEmail] = useState('');
    const [phone, setPhone] = useState('');
    const [phone2, setPhone2] = useState('');
    const [address, setAddress] = useState('');
    const [floor, setFloor] = useState('');
    const [apartment, setApartment] = useState('');
    const [city, setCity] = useState('');
    const [postalCode, setPostalCode] = useState('');
    const [notes, setNotes] = useState('');
    const [latitude, setLatitude] = useState('');
    const [longitude, setLongitude] = useState('');

    // Map State
    const [viewState, setViewState] = useState({
        longitude: -4.4214,
        latitude: 36.7213,
        zoom: 13
    });

    // Load Google Maps Script
    useEffect(() => {
        loadGoogleMapsScript(() => setIsGoogleReady(true));
    }, []);

    // GOOGLE PLACES HOOK
    const {
        ready,
        value,
        setValue,
        suggestions: { status, data },
        clearSuggestions,
        init
    } = usePlacesAutocomplete({
        requestOptions: {
            componentRestrictions: { country: "es" }
        },
        debounce: 300,
        cache: 24 * 60 * 60,
        initOnMount: false,
    });

    // Initialize Google Places when script is ready
    useEffect(() => {
        if (window.google) {
            init();
        } else {
            const checkGoogle = setInterval(() => {
                if (window.google) {
                    init();
                    clearInterval(checkGoogle);
                }
            }, 100);
            return () => clearInterval(checkGoogle);
        }
    }, [init]);

    // Pre-fill form when editing
    useEffect(() => {
        if (editClient) {
            setFullName(editClient.full_name || '');
            setEmail(editClient.email || '');
            setPhone(editClient.phone || '');
            setPhone2(editClient.phone_2 || '');
            setAddress(editClient.address || '');
            setFloor(editClient.floor || '');
            setApartment(editClient.apartment || '');
            setCity(editClient.city || '');
            setPostalCode(editClient.postal_code || '');
            setNotes(editClient.notes || '');
            setLatitude(editClient.latitude?.toString() || '');
            setLongitude(editClient.longitude?.toString() || '');

            if (editClient.latitude && editClient.longitude) {
                setViewState(prev => ({
                    ...prev,
                    latitude: parseFloat(editClient.latitude),
                    longitude: parseFloat(editClient.longitude),
                    zoom: 16
                }));
            }
        } else {
            // Reset for new client
            setFullName('');
            setEmail('');
            setPhone('');
            setPhone2('');
            setAddress('');
            setFloor('');
            setApartment('');
            setCity('');
            setPostalCode('');
            setNotes('');
            setLatitude('');
            setLongitude('');
            setShowMap(false);
        }
    }, [editClient, isOpen]);

    // SYNC: Google Search -> Map & Form
    const handleGoogleSelect = async (selectedAddress) => {
        setValue(selectedAddress, false);
        clearSuggestions();
        setAddress(selectedAddress);

        try {
            const results = await getGeocode({ address: selectedAddress });
            const { lat, lng } = await getLatLng(results[0]);

            // 1. Update Map View
            setViewState(prev => ({
                ...prev,
                latitude: lat,
                longitude: lng,
                zoom: 16,
                transitionDuration: 1000
            }));

            // 2. Update Form Coordinates
            setLatitude(lat.toFixed(6));
            setLongitude(lng.toFixed(6));

            // 3. Extract Postal Code & City
            const addressComponents = results[0].address_components;
            const postalCodeObj = addressComponents.find(c => c.types.includes('postal_code'));
            const cityObj = addressComponents.find(c => c.types.includes('locality')) ||
                addressComponents.find(c => c.types.includes('administrative_area_level_2'));

            if (postalCodeObj) setPostalCode(postalCodeObj.long_name);
            if (cityObj) setCity(cityObj.long_name);

            console.log("📍 Precise Location (Google):", { lat, lng, address: selectedAddress });

        } catch (error) {
            console.error("❌ Google Geocoding Error: ", error);
        }
    };

    // SYNC: Drag Marker -> Form
    const onMarkerDragEnd = (event) => {
        const { lng, lat } = event.lngLat;
        setLatitude(lat.toFixed(6));
        setLongitude(lng.toFixed(6));
        console.log("📌 Pin Dropped:", { lat, lng });
    };

    const handleSave = async (e) => {
        e.preventDefault();
        setLoading(true);

        try {
            const payload = {
                full_name: fullName,
                email: email || null,
                phone,
                phone_2: phone2 || null,
                address,
                floor: floor || null,
                apartment: apartment || null,
                city,
                postal_code: postalCode || null,
                latitude: latitude ? parseFloat(latitude) : null,
                longitude: longitude ? parseFloat(longitude) : null,
                notes: notes || null,
                role: 'client',
                created_via: editClient ? undefined : 'admin'
            };

            let result;
            if (editClient) {
                const { data, error } = await supabase
                    .from('profiles')
                    .update(payload)
                    .eq('id', editClient.id)
                    .select()
                    .single();

                if (error) throw error;
                result = data;
            } else {
                const { data, error } = await supabase
                    .from('profiles')
                    .insert(payload)
                    .select()
                    .single();

                if (error) throw error;
                result = data;
            }

            // Success callback with the new/updated client
            if (onSuccess) {
                onSuccess(result);
            }
            onClose();

        } catch (error) {
            console.error('Error saving client:', error);
            alert('Error al guardar cliente: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 animate-in fade-in backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
                {/* Header */}
                <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-gradient-to-r from-blue-600 to-indigo-600 text-white shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                            <User size={20} />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold">
                                {editClient ? 'Editar Cliente' : 'Nuevo Cliente'}
                            </h2>
                            <p className="text-xs text-blue-100">
                                {editClient ? 'Actualiza los datos del cliente' : 'Completa la información del cliente'}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-white/20 rounded-lg transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Form */}
                <form onSubmit={handleSave} className="p-6 space-y-4 overflow-y-auto custom-scrollbar">
                    {/* Name */}
                    <div>
                        <label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-1">
                            Nombre Completo <span className="text-amber-500">*</span>
                        </label>
                        <input
                            required
                            value={fullName}
                            onChange={e => setFullName(e.target.value)}
                            className="w-full p-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                            placeholder="Ej: María García López"
                        />
                    </div>

                    {/* Phone & Email */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-1">
                                <Phone size={12} /> Teléfono <span className="text-amber-500">*</span>
                            </label>
                            <input
                                required
                                value={phone}
                                onChange={e => setPhone(e.target.value)}
                                className="w-full p-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                                placeholder="600 123 456"
                            />
                        </div>
                        <div>
                            <label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-1">
                                <Mail size={12} /> Email
                            </label>
                            <input
                                type="email"
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                                className="w-full p-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                                placeholder="correo@ejemplo.com"
                            />
                        </div>
                    </div>

                    {/* Location Pro Section */}
                    <div className="space-y-4 bg-gradient-to-br from-slate-50 to-blue-50/30 p-5 rounded-2xl border border-slate-200">
                        <div className="flex items-center justify-between mb-2">
                            <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                                <Navigation size={12} className="text-blue-500" />
                                Dirección Exacta (Google)
                            </label>
                            {latitude && (
                                <div className="flex items-center gap-1.5 px-2 py-1 bg-emerald-50 border border-emerald-100 rounded-full">
                                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
                                    <span className="text-[9px] font-bold text-emerald-700 uppercase">GPS Activo</span>
                                </div>
                            )}
                        </div>

                        {/* Google Search */}
                        <div className="relative group z-40">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <Search size={16} className="text-slate-400 group-focus-within:text-blue-500 transition-colors" />
                            </div>
                            <input
                                value={value}
                                onChange={(e) => {
                                    setValue(e.target.value);
                                    setAddress(e.target.value);
                                }}
                                placeholder="🔍 Ej: Carretera de Olias 46, Málaga..."
                                className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-700 shadow-sm focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all outline-none"
                            />

                            {/* Google Suggestions Dropdown */}
                            {status === "OK" && (
                                <div className="absolute z-50 w-full bg-white border border-slate-100 mt-2 rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                                    {data.map(({ place_id, description, structured_formatting }) => (
                                        <div
                                            key={place_id}
                                            onClick={() => handleGoogleSelect(description)}
                                            className="px-4 py-3 hover:bg-blue-50/50 cursor-pointer border-b border-slate-50 last:border-0 transition-colors group/item"
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 group-hover/item:bg-blue-100 group-hover/item:text-blue-600 transition-colors">
                                                    <MapPin size={14} />
                                                </div>
                                                <div>
                                                    <p className="text-sm font-semibold text-slate-700 group-hover/item:text-blue-700">
                                                        {structured_formatting?.main_text || description}
                                                    </p>
                                                    <p className="text-[10px] text-slate-400">
                                                        {structured_formatting?.secondary_text || ''}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                    <div className="bg-slate-50 px-3 py-1.5 flex justify-end">
                                        <img src="https://developers.google.com/static/maps/documentation/images/powered_by_google_on_white.png" alt="Powered by Google" className="h-3 opacity-50" />
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Floor / Apartment */}
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-xs font-bold text-slate-500 uppercase">Planta / Piso</label>
                                <input
                                    value={floor}
                                    onChange={e => setFloor(e.target.value)}
                                    placeholder="Ej: 2º, Bajo..."
                                    className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-blue-400 outline-none transition-colors"
                                />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-slate-500 uppercase">Puerta / Oficina</label>
                                <input
                                    value={apartment}
                                    onChange={e => setApartment(e.target.value)}
                                    placeholder="Ej: A, Izq..."
                                    className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-blue-400 outline-none transition-colors"
                                />
                            </div>
                        </div>

                        {/* Map Toggle */}
                        {!showMap ? (
                            <button
                                type="button"
                                onClick={() => setShowMap(true)}
                                className="w-full flex items-center justify-center gap-2 py-2.5 bg-gradient-to-r from-slate-800 to-slate-900 hover:from-slate-700 hover:to-slate-800 text-white rounded-xl font-bold text-xs shadow-lg transition-all hover:scale-[1.02] active:scale-[0.98]"
                            >
                                <MapPin size={14} />
                                Abrir Mapa para Ajuste Preciso
                            </button>
                        ) : (
                            <div className="relative rounded-2xl overflow-hidden border-2 border-slate-200/60 shadow-xl bg-white animate-in slide-in-from-top-4 duration-300">
                                <div className="h-[280px] w-full relative">
                                    <Map
                                        {...viewState}
                                        onMove={evt => setViewState(evt.viewState)}
                                        style={{ width: '100%', height: '100%' }}
                                        mapStyle="mapbox://styles/mapbox/streets-v12"
                                        mapboxAccessToken={MAPBOX_TOKEN}
                                        cursor="grab"
                                    >
                                        <Marker
                                            longitude={parseFloat(longitude || viewState.longitude)}
                                            latitude={parseFloat(latitude || viewState.latitude)}
                                            draggable
                                            onDragEnd={onMarkerDragEnd}
                                            anchor="bottom"
                                        >
                                            <div className="relative group/pin cursor-grab active:cursor-grabbing">
                                                <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-4 h-4 bg-black/20 rounded-full blur-[2px] transition-all group-active/pin:scale-75"></div>
                                                <MapPin size={42} className="text-red-600 drop-shadow-xl filter transition-transform group-hover/pin:scale-110 group-active/pin:-translate-y-2 fill-red-600" />
                                            </div>
                                        </Marker>
                                        <NavigationControl position="top-right" showCompass={false} />
                                    </Map>

                                    {/* Instruction Overlay */}
                                    <div className="absolute top-3 left-3 right-12 bg-white/90 backdrop-blur-md p-2.5 rounded-xl border border-white/50 shadow-lg z-10">
                                        <p className="text-[10px] text-slate-600 leading-snug">
                                            <strong>📍 Arrastra el pin rojo</strong> hasta la puerta exacta
                                        </p>
                                    </div>

                                    {/* Close Map Button */}
                                    <button
                                        type="button"
                                        onClick={() => setShowMap(false)}
                                        className="absolute bottom-3 right-3 p-2 bg-white rounded-full shadow-lg text-slate-500 hover:text-red-500 hover:bg-red-50 transition-colors z-50"
                                    >
                                        <X size={16} />
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Coordinates Display */}
                        <div className="grid grid-cols-2 gap-3 opacity-60 hover:opacity-100 transition-opacity">
                            <div className="p-2 bg-slate-100 rounded-lg border border-slate-200">
                                <div className="text-[9px] uppercase font-bold text-slate-400 mb-0.5 ml-1">Latitud</div>
                                <div className="font-mono text-[10px] font-bold text-slate-600 pl-1">
                                    {latitude || '---'}
                                </div>
                            </div>
                            <div className="p-2 bg-slate-100 rounded-lg border border-slate-200">
                                <div className="text-[9px] uppercase font-bold text-slate-400 mb-0.5 ml-1">Longitud</div>
                                <div className="font-mono text-[10px] font-bold text-slate-600 pl-1">
                                    {longitude || '---'}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex gap-3 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 py-3 rounded-xl border border-slate-200 font-bold text-slate-600 hover:bg-slate-50 transition-colors"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="flex-1 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl font-bold hover:from-blue-700 hover:to-indigo-700 shadow-lg shadow-blue-600/20 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                            {loading ? (
                                <>
                                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    Guardando...
                                </>
                            ) : (
                                <>
                                    {editClient ? 'Actualizar' : 'Crear Cliente'}
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default ClientFormModal;
