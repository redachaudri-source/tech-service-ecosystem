import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import {
    X, MapPin, Navigation, Search, User, Phone, Mail, Building2,
    AlertTriangle, CheckCircle, Loader2, UserCheck, Plus, Trash2,
    Home, Briefcase, Star, ChevronDown, ChevronUp
} from 'lucide-react';
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

// CLIENT TYPE CONSTANTS
const CLIENT_TYPES = {
    particular: { label: 'Particular', icon: Home, maxAddresses: 3, color: 'blue' },
    professional: { label: 'Profesional', icon: Briefcase, maxAddresses: 15, color: 'purple' }
};

// SINGLE ADDRESS CARD COMPONENT
const AddressCard = ({
    address,
    index,
    onUpdate,
    onRemove,
    onSetPrimary,
    canRemove,
    isPrimary,
    isExpanded,
    onToggleExpand
}) => {
    const [localAddress, setLocalAddress] = useState(address);
    const [showMap, setShowMap] = useState(false);
    const [viewState, setViewState] = useState({
        longitude: address.longitude || -4.4214,
        latitude: address.latitude || 36.7213,
        zoom: 15
    });

    // Google Places hook for this address
    const {
        ready,
        value,
        setValue,
        suggestions: { status, data },
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

    useEffect(() => {
        if (window.google) init();
    }, [init]);

    useEffect(() => {
        setValue(address.address_line || '', false);
    }, [address.address_line]);

    const handleGoogleSelect = async (selectedAddress) => {
        setValue(selectedAddress, false);
        clearSuggestions();

        try {
            const results = await getGeocode({ address: selectedAddress });
            const { lat, lng } = await getLatLng(results[0]);

            const addressComponents = results[0].address_components;
            const postalCodeObj = addressComponents.find(c => c.types.includes('postal_code'));
            const cityObj = addressComponents.find(c => c.types.includes('locality')) ||
                addressComponents.find(c => c.types.includes('administrative_area_level_2'));

            const updated = {
                ...localAddress,
                address_line: selectedAddress,
                latitude: lat,
                longitude: lng,
                postal_code: postalCodeObj?.long_name || localAddress.postal_code,
                city: cityObj?.long_name || localAddress.city
            };

            setLocalAddress(updated);
            onUpdate(updated);
            setViewState(prev => ({ ...prev, latitude: lat, longitude: lng, zoom: 16 }));

        } catch (error) {
            console.error("Google Geocoding Error:", error);
        }
    };

    const handleFieldChange = (field, value) => {
        const updated = { ...localAddress, [field]: value };
        setLocalAddress(updated);
        onUpdate(updated);
    };

    const onMarkerDragEnd = (event) => {
        const { lng, lat } = event.lngLat;
        const updated = { ...localAddress, latitude: lat, longitude: lng };
        setLocalAddress(updated);
        onUpdate(updated);
    };

    return (
        <div className={`border rounded-xl overflow-hidden transition-all ${isPrimary ? 'border-amber-400 bg-amber-50/30' : 'border-slate-200 bg-white'}`}>
            {/* Header - Always Visible */}
            <div
                className={`px-4 py-3 flex items-center justify-between cursor-pointer ${isPrimary ? 'bg-amber-100/50' : 'bg-slate-50'}`}
                onClick={onToggleExpand}
            >
                <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold ${isPrimary ? 'bg-amber-500 text-white' : 'bg-slate-200 text-slate-600'}`}>
                        {index + 1}
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <span className="font-semibold text-slate-700">
                                {localAddress.label || `Dirección ${index + 1}`}
                            </span>
                            {isPrimary && (
                                <span className="px-2 py-0.5 bg-amber-500 text-white text-[10px] font-bold uppercase rounded-full flex items-center gap-1">
                                    <Star size={10} /> Principal
                                </span>
                            )}
                        </div>
                        <p className="text-xs text-slate-500 truncate max-w-[250px]">
                            {localAddress.address_line || 'Sin dirección'}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {!isPrimary && (
                        <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); onSetPrimary(); }}
                            className="p-1.5 text-slate-400 hover:text-amber-500 hover:bg-amber-50 rounded-lg transition-colors"
                            title="Marcar como principal"
                        >
                            <Star size={16} />
                        </button>
                    )}
                    {canRemove && (
                        <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); onRemove(); }}
                            className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                            title="Eliminar dirección"
                        >
                            <Trash2 size={16} />
                        </button>
                    )}
                    {isExpanded ? <ChevronUp size={18} className="text-slate-400" /> : <ChevronDown size={18} className="text-slate-400" />}
                </div>
            </div>

            {/* Expanded Content */}
            {isExpanded && (
                <div className="p-4 space-y-4 border-t border-slate-100">
                    {/* Label */}
                    <div>
                        <label className="text-xs font-bold text-slate-500 uppercase">Nombre / Alias</label>
                        <input
                            value={localAddress.label || ''}
                            onChange={e => handleFieldChange('label', e.target.value)}
                            placeholder="Ej: Casa, Oficina, Apartamento 1..."
                            className="w-full p-2.5 border border-slate-200 rounded-lg text-sm mt-1"
                        />
                    </div>

                    {/* Address Search */}
                    <div className="relative z-40">
                        <label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-1">
                            <MapPin size={12} /> Dirección Completa
                        </label>
                        <div className="relative mt-1">
                            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                value={value}
                                onChange={e => setValue(e.target.value)}
                                placeholder="Buscar dirección..."
                                className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm"
                            />
                        </div>
                        {status === "OK" && (
                            <div className="absolute z-50 w-full bg-white border border-slate-200 mt-1 rounded-lg shadow-xl overflow-hidden">
                                {data.map(({ place_id, description }) => (
                                    <div
                                        key={place_id}
                                        onClick={() => handleGoogleSelect(description)}
                                        className="px-4 py-2.5 hover:bg-blue-50 cursor-pointer text-sm border-b border-slate-100 last:border-0"
                                    >
                                        {description}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Floor / Apartment */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-xs font-bold text-slate-500 uppercase">Planta</label>
                            <input
                                value={localAddress.floor || ''}
                                onChange={e => handleFieldChange('floor', e.target.value)}
                                placeholder="Ej: 2º"
                                className="w-full p-2.5 border border-slate-200 rounded-lg text-sm mt-1"
                            />
                        </div>
                        <div>
                            <label className="text-xs font-bold text-slate-500 uppercase">Puerta</label>
                            <input
                                value={localAddress.apartment || ''}
                                onChange={e => handleFieldChange('apartment', e.target.value)}
                                placeholder="Ej: A"
                                className="w-full p-2.5 border border-slate-200 rounded-lg text-sm mt-1"
                            />
                        </div>
                    </div>

                    {/* Map Toggle */}
                    {!showMap ? (
                        <button
                            type="button"
                            onClick={() => setShowMap(true)}
                            className="w-full py-2 border border-slate-200 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-50 flex items-center justify-center gap-2"
                        >
                            <MapPin size={14} /> Ajustar ubicación en mapa
                        </button>
                    ) : (
                        <div className="relative h-48 rounded-lg overflow-hidden border border-slate-200">
                            <Map
                                {...viewState}
                                onMove={evt => setViewState(evt.viewState)}
                                style={{ width: '100%', height: '100%' }}
                                mapStyle="mapbox://styles/mapbox/streets-v12"
                                mapboxAccessToken={MAPBOX_TOKEN}
                            >
                                <Marker
                                    longitude={viewState.longitude}
                                    latitude={viewState.latitude}
                                    draggable
                                    onDragEnd={onMarkerDragEnd}
                                    anchor="bottom"
                                >
                                    <MapPin size={32} className="text-red-600 fill-red-600" />
                                </Marker>
                                <NavigationControl position="top-right" showCompass={false} />
                            </Map>
                            <button
                                type="button"
                                onClick={() => setShowMap(false)}
                                className="absolute top-2 right-2 p-1.5 bg-white rounded-full shadow"
                            >
                                <X size={14} />
                            </button>
                        </div>
                    )}

                    {/* GPS Display */}
                    {localAddress.latitude && (
                        <div className="flex gap-2 text-[10px] text-slate-400">
                            <span>📍 {localAddress.latitude?.toFixed(6)}, {localAddress.longitude?.toFixed(6)}</span>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

// MAIN MODAL COMPONENT
const ClientFormModal = ({
    isOpen,
    onClose,
    onSuccess,
    editClient = null,
    context = 'client-management',
    onSelectExisting = null
}) => {
    const [loading, setLoading] = useState(false);
    const [isGoogleReady, setIsGoogleReady] = useState(false);

    // Client Type (only for new clients)
    const [clientType, setClientType] = useState('particular');

    // Phone Validation
    const [phoneCheck, setPhoneCheck] = useState({ loading: false, exists: false, client: null });
    const phoneValidationTimeout = useRef(null);

    // Basic Form Fields
    const [fullName, setFullName] = useState('');
    const [email, setEmail] = useState('');
    const [phone, setPhone] = useState('');
    const [phone2, setPhone2] = useState('');
    const [notes, setNotes] = useState('');

    // Multiple Addresses
    const [addresses, setAddresses] = useState([{
        id: null,
        label: '',
        address_line: '',
        floor: '',
        apartment: '',
        postal_code: '',
        city: '',
        latitude: null,
        longitude: null,
        is_primary: true
    }]);
    const [expandedIndex, setExpandedIndex] = useState(0);
    const [addressSearch, setAddressSearch] = useState('');

    // Load Google Maps Script
    useEffect(() => {
        loadGoogleMapsScript(() => setIsGoogleReady(true));
    }, []);

    // Pre-fill form when editing
    useEffect(() => {
        const loadClientData = async () => {
            if (editClient) {
                setFullName(editClient.full_name || '');
                setEmail(editClient.email || '');
                setPhone(editClient.phone || '');
                setPhone2(editClient.phone_2 || '');
                setNotes(editClient.notes || '');
                setClientType(editClient.client_type || 'particular');

                // Load addresses from client_addresses table
                const { data: addressData } = await supabase
                    .from('client_addresses')
                    .select('*')
                    .eq('client_id', editClient.id)
                    .order('address_order', { ascending: true });

                if (addressData && addressData.length > 0) {
                    setAddresses(addressData);
                } else if (editClient.address) {
                    // Fallback to legacy address field
                    setAddresses([{
                        id: null,
                        label: 'Principal',
                        address_line: editClient.address,
                        floor: editClient.floor || '',
                        apartment: editClient.apartment || '',
                        postal_code: editClient.postal_code || '',
                        city: editClient.city || '',
                        latitude: editClient.latitude,
                        longitude: editClient.longitude,
                        is_primary: true
                    }]);
                }
            } else {
                // Reset for new client
                setFullName('');
                setEmail('');
                setPhone('');
                setPhone2('');
                setNotes('');
                setClientType('particular');
                setAddresses([{
                    id: null,
                    label: '',
                    address_line: '',
                    floor: '',
                    apartment: '',
                    postal_code: '',
                    city: '',
                    latitude: null,
                    longitude: null,
                    is_primary: true
                }]);
                setExpandedIndex(0);
            }
        };

        if (isOpen) loadClientData();
    }, [editClient, isOpen]);

    // Phone validation functions
    const normalizePhone = (phoneInput) => {
        let cleaned = phoneInput.replace(/\s+/g, '').replace(/[^\d+]/g, '');
        if (cleaned && !cleaned.startsWith('+')) {
            cleaned = '+34' + cleaned;
        }
        return cleaned;
    };

    const isValidPhoneFormat = (phoneInput) => {
        const cleaned = phoneInput.replace(/\s+/g, '');
        return /^\+?\d{9,15}$/.test(cleaned);
    };

    const validatePhoneDebounced = (phoneInput) => {
        if (phoneValidationTimeout.current) clearTimeout(phoneValidationTimeout.current);
        if (!phoneInput || phoneInput.length < 9 || !isValidPhoneFormat(phoneInput)) {
            setPhoneCheck({ loading: false, exists: false, client: null });
            return;
        }

        setPhoneCheck(prev => ({ ...prev, loading: true }));
        phoneValidationTimeout.current = setTimeout(async () => {
            try {
                const normalized = normalizePhone(phoneInput);
                const { data } = await supabase
                    .from('profiles')
                    .select('id, full_name, address, phone, city')
                    .eq('phone', normalized)
                    .eq('role', 'client')
                    .maybeSingle();

                if (data && (!editClient || data.id !== editClient.id)) {
                    setPhoneCheck({ loading: false, exists: true, client: data });
                } else {
                    setPhoneCheck({ loading: false, exists: false, client: null });
                }
            } catch {
                setPhoneCheck({ loading: false, exists: false, client: null });
            }
        }, 500);
    };

    const handleUseExistingClient = () => {
        if (phoneCheck.client && onSelectExisting) {
            onSelectExisting(phoneCheck.client);
            onClose();
        }
    };

    // Address management
    const maxAddresses = CLIENT_TYPES[clientType]?.maxAddresses || 3;
    const canAddMore = addresses.length < maxAddresses;

    const addAddress = () => {
        if (!canAddMore) return;
        setAddresses(prev => [...prev, {
            id: null,
            label: '',
            address_line: '',
            floor: '',
            apartment: '',
            postal_code: '',
            city: '',
            latitude: null,
            longitude: null,
            is_primary: false
        }]);
        setExpandedIndex(addresses.length);
    };

    const removeAddress = (index) => {
        if (addresses.length <= 1) return;
        const wasPrimary = addresses[index].is_primary;
        const newAddresses = addresses.filter((_, i) => i !== index);
        if (wasPrimary && newAddresses.length > 0) {
            newAddresses[0].is_primary = true;
        }
        setAddresses(newAddresses);
        setExpandedIndex(Math.min(expandedIndex, newAddresses.length - 1));
    };

    const updateAddress = (index, updated) => {
        setAddresses(prev => prev.map((addr, i) => i === index ? updated : addr));
    };

    const setPrimaryAddress = (index) => {
        setAddresses(prev => prev.map((addr, i) => ({
            ...addr,
            is_primary: i === index
        })));
    };

    // Filter addresses for search (Professional clients)
    const filteredAddresses = addressSearch
        ? addresses.filter(a =>
            a.label?.toLowerCase().includes(addressSearch.toLowerCase()) ||
            a.address_line?.toLowerCase().includes(addressSearch.toLowerCase())
        )
        : addresses;

    // Save handler
    const handleSave = async (e) => {
        e.preventDefault();
        setLoading(true);

        try {
            // Validate at least one address has data
            const primaryAddress = addresses.find(a => a.is_primary) || addresses[0];
            if (!primaryAddress.address_line) {
                throw new Error('La dirección principal es obligatoria');
            }

            const payload = {
                full_name: fullName,
                email: email || null,
                phone: normalizePhone(phone),
                phone_2: phone2 ? normalizePhone(phone2) : null,
                address: primaryAddress.address_line,
                floor: primaryAddress.floor || null,
                apartment: primaryAddress.apartment || null,
                city: primaryAddress.city || null,
                postal_code: primaryAddress.postal_code || null,
                latitude: primaryAddress.latitude,
                longitude: primaryAddress.longitude,
                notes: notes || null,
                role: 'client',
                client_type: clientType,
                created_via: editClient ? undefined : 'admin'
            };

            let clientId;
            if (editClient) {
                const { data, error } = await supabase
                    .from('profiles')
                    .update(payload)
                    .eq('id', editClient.id)
                    .select();
                if (error) throw error;
                clientId = editClient.id;
            } else {
                const { data, error } = await supabase
                    .from('profiles')
                    .insert(payload)
                    .select();
                if (error) throw error;
                clientId = data[0].id;
            }

            // Sync addresses to client_addresses table
            // First, get existing addresses
            const { data: existingAddresses } = await supabase
                .from('client_addresses')
                .select('id')
                .eq('client_id', clientId);

            const existingIds = existingAddresses?.map(a => a.id) || [];
            const currentIds = addresses.filter(a => a.id).map(a => a.id);

            // Delete addresses that were removed
            const toDelete = existingIds.filter(id => !currentIds.includes(id));
            if (toDelete.length > 0) {
                await supabase.from('client_addresses').delete().in('id', toDelete);
            }

            // Upsert addresses
            for (let i = 0; i < addresses.length; i++) {
                const addr = addresses[i];
                const addressPayload = {
                    client_id: clientId,
                    label: addr.label || `Dirección ${i + 1}`,
                    address_line: addr.address_line,
                    floor: addr.floor || null,
                    apartment: addr.apartment || null,
                    postal_code: addr.postal_code || null,
                    city: addr.city || null,
                    latitude: addr.latitude,
                    longitude: addr.longitude,
                    is_primary: addr.is_primary,
                    address_order: i + 1
                };

                if (addr.id) {
                    await supabase.from('client_addresses').update(addressPayload).eq('id', addr.id);
                } else {
                    await supabase.from('client_addresses').insert(addressPayload);
                }
            }

            if (onSuccess) {
                const { data: result } = await supabase
                    .from('profiles')
                    .select('*')
                    .eq('id', clientId)
                    .single();
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

    const TypeConfig = CLIENT_TYPES[clientType];

    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 animate-in fade-in backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[95vh]">
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
                                {editClient
                                    ? `${TypeConfig.label} · ${addresses.length} direcciones`
                                    : 'Completa la información del cliente'
                                }
                            </p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-lg transition-colors">
                        <X size={20} />
                    </button>
                </div>

                {/* Form */}
                <form onSubmit={handleSave} className="flex-1 overflow-y-auto custom-scrollbar">
                    <div className="p-6 space-y-6">
                        {/* SECTION 1: Basic Info */}
                        <div className="space-y-4">
                            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                                <User size={14} /> Datos Básicos
                            </h3>

                            {/* Name */}
                            <div>
                                <label className="text-xs font-bold text-slate-500 uppercase">
                                    Nombre Completo <span className="text-amber-500">*</span>
                                </label>
                                <input
                                    required
                                    value={fullName}
                                    onChange={e => setFullName(e.target.value)}
                                    className="w-full p-3 border border-slate-200 rounded-xl text-sm mt-1"
                                    placeholder="Ej: María García López"
                                />
                            </div>

                            {/* Phone & Email */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-1">
                                        <Phone size={12} /> Teléfono <span className="text-amber-500">*</span>
                                    </label>
                                    <div className="relative mt-1">
                                        <input
                                            required
                                            value={phone}
                                            onChange={e => { setPhone(e.target.value); validatePhoneDebounced(e.target.value); }}
                                            className={`w-full p-3 border rounded-xl text-sm pr-10 ${phoneCheck.exists
                                                    ? (context === 'client-management' ? 'border-amber-400 bg-amber-50' : 'border-emerald-400 bg-emerald-50')
                                                    : 'border-slate-200'
                                                }`}
                                            placeholder="+34 600123456"
                                        />
                                        <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                            {phoneCheck.loading && <Loader2 size={16} className="text-blue-500 animate-spin" />}
                                            {!phoneCheck.loading && phoneCheck.exists && context === 'client-management' && <AlertTriangle size={16} className="text-amber-500" />}
                                            {!phoneCheck.loading && phoneCheck.exists && context === 'service-creation' && <CheckCircle size={16} className="text-emerald-500" />}
                                        </div>
                                    </div>

                                    {/* Phone validation feedback */}
                                    {phoneCheck.exists && context === 'client-management' && (
                                        <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded-lg text-xs">
                                            <p className="font-bold text-amber-800">Este teléfono pertenece a: {phoneCheck.client?.full_name}</p>
                                        </div>
                                    )}
                                    {phoneCheck.exists && context === 'service-creation' && (
                                        <button
                                            type="button"
                                            onClick={handleUseExistingClient}
                                            className="mt-2 w-full py-2 bg-emerald-600 text-white text-xs font-bold rounded-lg hover:bg-emerald-700"
                                        >
                                            <UserCheck size={14} className="inline mr-1" /> Usar Este Cliente
                                        </button>
                                    )}
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-1">
                                        <Mail size={12} /> Email
                                    </label>
                                    <input
                                        type="email"
                                        value={email}
                                        onChange={e => setEmail(e.target.value)}
                                        className="w-full p-3 border border-slate-200 rounded-xl text-sm mt-1"
                                        placeholder="correo@ejemplo.com"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* SECTION 2: Client Type (Only for new clients) */}
                        {!editClient && (
                            <div className="space-y-4">
                                <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                                    <Building2 size={14} /> Tipo de Cliente
                                    <span className="text-[10px] font-normal text-slate-400 normal-case">(decisión permanente)</span>
                                </h3>

                                <div className="grid grid-cols-2 gap-4">
                                    {Object.entries(CLIENT_TYPES).map(([type, config]) => {
                                        const Icon = config.icon;
                                        const isSelected = clientType === type;
                                        return (
                                            <button
                                                key={type}
                                                type="button"
                                                onClick={() => setClientType(type)}
                                                className={`p-4 rounded-xl border-2 text-left transition-all ${isSelected
                                                        ? `border-${config.color}-500 bg-${config.color}-50 ring-2 ring-${config.color}-500/20`
                                                        : 'border-slate-200 hover:border-slate-300'
                                                    }`}
                                            >
                                                <div className="flex items-center gap-3 mb-2">
                                                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${isSelected ? `bg-${config.color}-500 text-white` : 'bg-slate-100 text-slate-500'
                                                        }`}>
                                                        <Icon size={20} />
                                                    </div>
                                                    <div>
                                                        <p className={`font-bold ${isSelected ? `text-${config.color}-700` : 'text-slate-700'}`}>
                                                            {config.label}
                                                        </p>
                                                        <p className="text-xs text-slate-500">
                                                            Máx {config.maxAddresses} direcciones
                                                        </p>
                                                    </div>
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* Type badge for edit mode */}
                        {editClient && (
                            <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-xl border border-slate-200">
                                <TypeConfig.icon size={18} className="text-slate-500" />
                                <span className="font-semibold text-slate-700">{TypeConfig.label}</span>
                                <span className="text-xs text-slate-400">(no editable)</span>
                            </div>
                        )}

                        {/* SECTION 3: Addresses */}
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                                    <MapPin size={14} />
                                    {clientType === 'professional' ? 'Propiedades' : 'Direcciones'}
                                    <span className="px-2 py-0.5 bg-slate-100 rounded-full text-xs font-bold text-slate-600">
                                        {addresses.length}/{maxAddresses}
                                    </span>
                                </h3>
                            </div>

                            {/* Search for professionals with many addresses */}
                            {clientType === 'professional' && addresses.length > 5 && (
                                <div className="relative">
                                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                    <input
                                        value={addressSearch}
                                        onChange={e => setAddressSearch(e.target.value)}
                                        placeholder="Buscar propiedad..."
                                        className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg text-sm"
                                    />
                                </div>
                            )}

                            {/* Address Cards */}
                            <div className="space-y-3">
                                {filteredAddresses.map((addr, index) => {
                                    const originalIndex = addresses.indexOf(addr);
                                    return (
                                        <AddressCard
                                            key={originalIndex}
                                            address={addr}
                                            index={originalIndex}
                                            onUpdate={(updated) => updateAddress(originalIndex, updated)}
                                            onRemove={() => removeAddress(originalIndex)}
                                            onSetPrimary={() => setPrimaryAddress(originalIndex)}
                                            canRemove={addresses.length > 1}
                                            isPrimary={addr.is_primary}
                                            isExpanded={expandedIndex === originalIndex}
                                            onToggleExpand={() => setExpandedIndex(expandedIndex === originalIndex ? -1 : originalIndex)}
                                        />
                                    );
                                })}
                            </div>

                            {/* Add Address Button */}
                            <button
                                type="button"
                                onClick={addAddress}
                                disabled={!canAddMore}
                                className={`w-full py-3 border-2 border-dashed rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all ${canAddMore
                                        ? 'border-blue-300 text-blue-600 hover:bg-blue-50 hover:border-blue-400'
                                        : 'border-slate-200 text-slate-400 cursor-not-allowed'
                                    }`}
                            >
                                <Plus size={18} />
                                {canAddMore
                                    ? `Añadir ${clientType === 'professional' ? 'Propiedad' : 'Dirección'} (${maxAddresses - addresses.length} restantes)`
                                    : `Límite alcanzado (${maxAddresses})`
                                }
                            </button>
                        </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="sticky bottom-0 p-4 bg-white border-t border-slate-100 flex gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 py-3 rounded-xl border border-slate-200 font-bold text-slate-600 hover:bg-slate-50"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={loading || (phoneCheck.exists && context === 'client-management')}
                            className="flex-1 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl font-bold hover:from-blue-700 hover:to-indigo-700 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                            {loading ? (
                                <>
                                    <Loader2 size={16} className="animate-spin" />
                                    Guardando...
                                </>
                            ) : (
                                editClient ? 'Actualizar Cliente' : 'Crear Cliente'
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default ClientFormModal;
