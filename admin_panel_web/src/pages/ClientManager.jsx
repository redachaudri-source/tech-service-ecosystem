import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext'; // Import useAuth
import { Plus, User, MapPin, Trash2, Edit2, X, Phone, Mail, History, Filter, Search as SearchIcon, Lock, Unlock, Package, Zap, Waves, Wind, Refrigerator, Flame, Thermometer, Tv, Smartphone, Disc, TrendingUp, AlertTriangle, CheckCircle, Clock, Star, ShieldAlert, Building2, Laptop, Navigation, Search, ChevronDown } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
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

const ClientManager = () => {
    const { user } = useAuth(); // Get current user
    const [clients, setClients] = useState([]);
    const [loading, setLoading] = useState(true);

    // Delete Modal State
    const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState(false);
    const [deleteTargetClient, setDeleteTargetClient] = useState(null);
    const [deletePassword, setDeletePassword] = useState('');

    // UI State
    const [showModal, setShowModal] = useState(false);
    const [showBlockModal, setShowBlockModal] = useState(false);
    const [blockActionData, setBlockActionData] = useState(null);

    // Dynamic Zones State
    const [serviceZones, setServiceZones] = useState([]);
    const [availableCities, setAvailableCities] = useState([]);

    // Form State
    const [id, setId] = useState(null);
    const [fullName, setFullName] = useState('');
    const [email, setEmail] = useState('');
    const [phone, setPhone] = useState('');
    const [phone2, setPhone2] = useState('');
    const [address, setAddress] = useState('');
    const [floor, setFloor] = useState('');
    const [apartment, setApartment] = useState('');

    // Default to empty, will be auto-set by dynamic zones
    const [province, setProvince] = useState('');
    const [city, setCity] = useState('');

    const [postalCode, setPostalCode] = useState('');
    const [notes, setNotes] = useState('');
    const [isLookingUpCP, setIsLookingUpCP] = useState(false);
    const [latitude, setLatitude] = useState('');
    const [longitude, setLongitude] = useState('');
    const [isGeocoding, setIsGeocoding] = useState(false);

    // Load Service Zones
    useEffect(() => {
        const fetchZones = async () => {
            const { data, error } = await supabase
                .from('service_zones')
                .select('*')
                .eq('is_active', true)
                .order('province');

            if (data && data.length > 0) {
                setServiceZones(data);

                // AUTO-SELECT DEFAULT (First Province)
                const defaultZone = data[0];
                setProvince(defaultZone.province);
                setAvailableCities(defaultZone.cities || []);

                // Default to first city if available
                if (defaultZone.cities && defaultZone.cities.length > 0) {
                    setCity(defaultZone.cities[0]);
                }
            }
        };
        fetchZones();
    }, []);

    // Update cities when province changes
    const handleProvinceChange = (newProvince) => {
        setProvince(newProvince);
        const zone = serviceZones.find(z => z.province === newProvince);
        if (zone) {
            setAvailableCities(zone.cities || []);
            setCity(zone.cities[0] || '');
        } else {
            setAvailableCities([]);
            setCity('');
        }
    };

    // Search & Filter State
    const [searchTerm, setSearchTerm] = useState('');
    const [cityFilter, setCityFilter] = useState('Todas');
    const [sourceFilter, setSourceFilter] = useState('Todos');
    const [sortBy, setSortBy] = useState('newest'); // newest, fidelity, review

    // History/Details State
    const [showHistory, setShowHistory] = useState(false);
    const [selectedClient, setSelectedClient] = useState(null);
    const [clientTickets, setClientTickets] = useState([]);
    const [errorMsg, setErrorMsg] = useState(null);

    // Appliances State
    const [showAppliances, setShowAppliances] = useState(false);
    const [clientAppliances, setClientAppliances] = useState([]);
    const [appliancesLoading, setAppliancesLoading] = useState(false);

    useEffect(() => {
        fetchClients();
    }, []);

    const [isGoogleReady, setIsGoogleReady] = useState(false);
    const [showMap, setShowMap] = useState(false); // New State for Map Toggle
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
    } = usePlacesAutocomplete({
        requestOptions: {
            componentRestrictions: { country: "es" }
        },
        debounce: 300,
        cache: 24 * 60 * 60,
    });

    // SYNC: Google Search -> Map & Form
    const handleGoogleSelect = async (address) => {
        setValue(address, false);
        clearSuggestions();
        setAddress(address);

        try {
            const results = await getGeocode({ address });
            const { lat, lng } = await getLatLng(results[0]);

            // 1. Update Map View (Fly to location)
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
            const cityObj = addressComponents.find(c => c.types.includes('locality')) || addressComponents.find(c => c.types.includes('administrative_area_level_2'));

            if (postalCodeObj) setPostalCode(postalCodeObj.long_name);
            if (cityObj) setCity(cityObj.long_name);

            console.log("📍 Precise Location (Google):", { lat, lng, address });

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

    const fetchClients = async () => {
        setErrorMsg(null);
        try {
            // Fetch Clients
            const { data: clientsData, error } = await supabase
                .from('profiles')
                .select('*')
                .eq('role', 'client')
                .order('created_at', { ascending: false });

            if (error) throw error;

            // Optional: Parallel Fetch for Reviews/Tickets aggregation
            // We use separate queries to avoid massive joins on large datasets for the list view
            // In a real optimized app, this would be a View or RPC.
            const { data: reviewsData } = await supabase.from('reviews').select('client_id');
            const { data: ticketsData } = await supabase.from('tickets').select('client_id');

            const enhanced = clientsData.map(c => {
                const reviewCount = reviewsData?.filter(r => r.client_id === c.id).length || 0;
                const ticketCount = ticketsData?.filter(t => t.client_id === c.id).length || 0;
                return { ...c, reviewCount, ticketCount };
            });

            setClients(enhanced);
        } catch (err) {
            console.error('Error fetching clients:', err);
            setErrorMsg(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async (e) => {
        e.preventDefault();
        setLoading(true);

        const payload = {
            full_name: fullName, email, phone, phone_2: phone2,
            address, floor, apartment, city, province, postal_code: postalCode,
            latitude: latitude ? parseFloat(latitude) : null,
            longitude: longitude ? parseFloat(longitude) : null,
            notes, role: 'client', created_via: id ? undefined : 'admin'
        };

        const { error } = id
            ? await supabase.from('profiles').update(payload).eq('id', id)
            : await supabase.from('profiles').insert(payload);

        if (error) alert('Error: ' + error.message);
        else {
            await fetchClients();
            handleClose();
        }
        setLoading(false);
    };

    const handleBlockConfirm = async () => {
        if (!blockActionData) return;
        const { client, action } = blockActionData;
        const newStatus = action === 'desbloquear' ? true : false;

        const { error } = await supabase.from('profiles').update({ is_active: newStatus }).eq('id', client.id);
        if (error) alert('Error: ' + error.message);
        else await fetchClients();

        setShowBlockModal(false);
        setBlockActionData(null);
    };

    const handleDelete = (client) => {
        setDeleteTargetClient(client);
        setDeletePassword(''); // Reset password field
        setShowDeleteConfirmModal(true);
    };

    const confirmDelete = async () => {
        if (!deleteTargetClient || !deletePassword) return;
        setLoading(true);

        try {
            // 1. Verify Password
            const { error: authError } = await supabase.auth.signInWithPassword({
                email: user.email,
                password: deletePassword
            });

            if (authError) {
                alert("Contraseña incorrecta. No se puede borrar.");
                setLoading(false);
                return;
            }

            // 2. Perform Delete
            const { error: deleteError } = await supabase.from('profiles').delete().eq('id', deleteTargetClient.id);
            if (deleteError) throw deleteError;

            // Success
            await fetchClients();
            setShowDeleteConfirmModal(false);
            setDeleteTargetClient(null);
            setDeletePassword('');

        } catch (err) {
            console.error("Delete failed:", err);
            alert("Error al borrar: " + err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleEdit = (client) => {
        setId(client.id);
        setFullName(client.full_name); setEmail(client.email); setPhone(client.phone); setPhone2(client.phone_2);
        setAddress(client.address); setFloor(client.floor); setApartment(client.apartment);
        setCity(client.city || 'Málaga'); setPostalCode(client.postal_code); setNotes(client.notes);
        setLatitude(client.latitude || ''); setLongitude(client.longitude || '');
        setSelectedClient(client);
        setShowModal(true);
    };

    const handleClose = () => {
        setShowModal(false); setId(null); setFullName(''); setEmail(''); setPhone(''); setPhone2('');
        setAddress(''); setFloor(''); setApartment(''); setCity('Málaga'); setPostalCode(''); setNotes('');
        setLatitude(''); setLongitude('');
    };

    const handleViewAppliances = async (client) => {
        setSelectedClient(client);
        setShowAppliances(true);
        setAppliancesLoading(true);
        setClientAppliances([]);

        try {
            // FIX: Robust Query. Attempt simple fetch first if join fails, or assume it works.
            // We'll stick to the join but log accurately.
            // Explicitly selecting foreign key relation if named differently? 
            // Previous check confirmed 'client_id' column exists.

            const { data, error } = await supabase
                .from('client_appliances')
                .select(`*, tickets (*)`)
                .eq('client_id', client.id)
                .order('created_at', { ascending: false });

            if (error) {
                console.error("Error fetching appliances (Deep):", error);
                // Fallback attempt without tickets join if RLS blocks the join
                const { data: fallbackData, error: fallbackError } = await supabase
                    .from('client_appliances')
                    .select('*')
                    .eq('client_id', client.id);

                if (fallbackError) throw fallbackError;

                // If fallback worked, use it with empty tickets
                if (fallbackData) {
                    const mapped = fallbackData.map(app => ({ ...app, tickets: [], repairCount: 0, totalSpent: 0 }));
                    setClientAppliances(mapped);
                    return;
                }
            }

            // Process metrics if data exists
            const processed = (data || []).map(app => {
                const tickets = app.tickets || [];
                const repairCount = tickets.filter(t => ['finalizado', 'pagado'].includes(t.status)).length;
                const totalSpent = tickets
                    .filter(t => ['finalizado', 'pagado'].includes(t.status))
                    .reduce((sum, t) => sum + (t.total || 0), 0);
                return { ...app, repairCount, totalSpent, tickets };
            });
            setClientAppliances(processed);

        } catch (err) {
            console.error("Critical Error fetching appliances:", err);
            alert("Error al cargar equipos: " + err.message);
        } finally {
            setAppliancesLoading(false);
        }
    };

    const handleViewHistory = async (client) => {
        setSelectedClient(client);
        setShowHistory(true);
        const { data } = await supabase.from('tickets').select('*').eq('client_id', client.id).order('created_at', { ascending: false });
        setClientTickets(data || []);
    };

    // --- Smart Filter ---
    const filteredClients = useMemo(() => {
        let result = clients.filter(client => {
            const term = searchTerm.toLowerCase();
            const matchesSearch =
                client.full_name?.toLowerCase().includes(term) ||
                client.phone?.includes(term) ||
                client.email?.toLowerCase().includes(term) ||
                client.address?.toLowerCase().includes(term) ||
                (client.city || '').toLowerCase().includes(term);

            const matchesCity = cityFilter === 'Todas' || client.city === cityFilter;
            const matchesSource = sourceFilter === 'Todos' || (sourceFilter === 'Admin' ? client.created_via === 'admin' : client.created_via !== 'admin');

            return matchesSearch && matchesCity && matchesSource;
        });

        // Sorting
        if (sortBy === 'fidelity') {
            result.sort((a, b) => b.ticketCount - a.ticketCount);
        } else if (sortBy === 'reviews') {
            result.sort((a, b) => b.reviewCount - a.reviewCount);
        } else if (sortBy === 'az') {
            result.sort((a, b) => a.full_name.localeCompare(b.full_name));
        }

        return result;
    }, [clients, searchTerm, cityFilter, sourceFilter, sortBy]);

    const uniqueCities = ['Todas', ...new Set(clients.map(c => c.city).filter(Boolean))];

    return (
        <div className="space-y-4 pb-20">
            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800">Cartera de Clientes</h1>
                    <p className="text-sm text-slate-500">{filteredClients.length} Clientes registrados</p>
                </div>
                <button
                    onClick={() => { handleClose(); setShowModal(true); }}
                    className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition shadow-lg shadow-blue-600/20 active:scale-95 text-sm font-bold"
                >
                    <Plus size={18} /> Nuevo Cliente
                </button>
            </div>

            {/* Smart Toolbar (Sticky) */}
            <div className="bg-white p-3 rounded-xl shadow-sm border border-slate-200 sticky top-0 z-20 flex flex-col md:flex-row gap-3">
                <div className="flex-1 relative">
                    <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <input
                        type="text"
                        placeholder="Buscar por nombre, teléfono, dirección..."
                        className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                </div>
                <div className="flex gap-2 overflow-x-auto pb-1 md:pb-0">
                    <select
                        className="p-2 border border-slate-200 rounded-lg text-sm text-slate-700 focus:outline-none bg-slate-50 w-32"
                        value={cityFilter}
                        onChange={e => setCityFilter(e.target.value)}
                    >
                        <option value="Todas">Localidades</option>
                        {uniqueCities.filter(c => c !== 'Todas').map(city => <option key={city} value={city}>{city}</option>)}
                    </select>

                    <select
                        className="p-2 border border-slate-200 rounded-lg text-sm text-slate-700 focus:outline-none bg-slate-50 w-32"
                        value={sortBy}
                        onChange={e => setSortBy(e.target.value)}
                    >
                        <option value="newest">Recientes</option>
                        <option value="fidelity">Mas Servicios</option>
                        <option value="reviews">Mas Reseñas</option>
                        <option value="az">A-Z</option>
                    </select>
                </div>
            </div>

            {/* Compact Table */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-bold tracking-wider border-b border-slate-200">
                            <tr>
                                <th className="px-4 py-3">Cliente</th>
                                <th className="px-4 py-3">Contacto / Residencia</th>
                                <th className="px-4 py-3 text-center">Fidelidad</th>
                                <th className="px-4 py-3 text-right">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-sm">
                            {filteredClients.map(client => (
                                <tr key={client.id} className={`hover:bg-slate-50 transition group ${!client.is_active ? 'bg-red-50/50' : ''}`}>
                                    <td className="px-4 py-2">
                                        <div className="flex items-center gap-3">
                                            {/* AVATAR + STATUS DOT */}
                                            <div className="relative">
                                                <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm text-white shrink-0 
                                                    ${client.created_via === 'admin' ? 'bg-indigo-500' : 'bg-blue-600'}`}>
                                                    {client.full_name.charAt(0)}
                                                </div>
                                                <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white 
                                                    ${client.is_active ? 'bg-green-500' : 'bg-red-500'}`} title={client.is_active ? 'Activo' : 'Bloqueado'}></div>
                                            </div>

                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <span className="font-bold text-slate-800 leading-tight">{client.full_name}</span>
                                                    {/* ORIGIN BADGE */}
                                                    {/* ORIGIN BADGE */}
                                                    {client.created_via === 'admin' ? (
                                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-emerald-50 text-emerald-700 border border-emerald-200">
                                                            <Building2 size={10} /> Oficina
                                                        </span>
                                                    ) : (
                                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-blue-50 text-blue-700 border border-blue-200">
                                                            <Smartphone size={10} /> App
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="text-[10px] text-slate-400 font-mono">ID: ...{client.id.slice(-4)}</div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-4 py-2">
                                        <div className="flex flex-col gap-0.5">
                                            <div className="flex items-center gap-1.5 text-slate-600">
                                                <Phone size={12} className="text-slate-400" />
                                                {/* CLICK TO CALL */}
                                                <a href={`tel:${client.phone}`} className="font-mono text-xs text-blue-600 hover:text-blue-800 hover:underline">
                                                    {client.phone}
                                                </a>
                                            </div>
                                            <div className="flex items-center gap-1.5 text-slate-500 text-xs">
                                                <MapPin size={12} className="text-slate-400" />
                                                <span className="truncate max-w-[200px]" title={client.address}>{client.address} {client.city ? `(${client.city})` : ''}</span>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-4 py-2 text-center">
                                        <div className="flex justify-center gap-4">
                                            <div className="flex flex-col items-center" title="Tickets Solicitados">
                                                <span className="text-sm font-bold text-slate-700">{client.ticketCount}</span>
                                                <span className="text-[9px] text-slate-400 uppercase">Servicios</span>
                                            </div>
                                            {client.reviewCount > 0 && (
                                                <div className="flex flex-col items-center" title="Reseñas Dejadas">
                                                    <div className="flex items-center gap-1 text-amber-500 font-bold text-sm">
                                                        {client.reviewCount} <Star size={10} fill="currentColor" />
                                                    </div>
                                                    <span className="text-[9px] text-slate-400 uppercase">Reseñas</span>
                                                </div>
                                            )}
                                        </div>
                                    </td>

                                    <td className="px-4 py-2 text-right">
                                        <div className="flex justify-end gap-1 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button onClick={() => handleViewHistory(client)} className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded" title="Ver Historial">
                                                <History size={16} />
                                            </button>
                                            <button onClick={() => handleViewAppliances(client)} className="p-1.5 text-slate-500 hover:text-purple-600 hover:bg-purple-50 rounded" title="Ver Equipos">
                                                <Package size={16} />
                                            </button>
                                            <button onClick={() => handleEdit(client)} className="p-1.5 text-slate-500 hover:text-orange-600 hover:bg-orange-50 rounded" title="Editar">
                                                <Edit2 size={16} />
                                            </button>
                                            {client.created_via === 'app' && (
                                                <button
                                                    onClick={() => { setBlockActionData({ client, action: client.is_active ? 'bloquear' : 'desbloquear' }); setShowBlockModal(true); }}
                                                    className={`p-1.5 rounded ${client.is_active ? 'text-slate-400 hover:text-red-600' : 'text-red-600 bg-red-100'}`}
                                                    title="Bloquear/Desbloquear Acceso App"
                                                >
                                                    {client.is_active ? <Lock size={16} /> : <Unlock size={16} />}
                                                </button>
                                            )}

                                            <button onClick={() => handleDelete(client)} className="p-1.5 text-slate-300 hover:text-red-600 rounded" title="Eliminar Definitivamente">
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* --- MODALS --- */}

            {/* Block Modal */}
            {showBlockModal && blockActionData && (
                <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 animate-in fade-in backdrop-blur-sm">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden p-6 text-center">
                        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4 text-red-600">
                            <ShieldAlert size={32} />
                        </div>
                        <h2 className="text-xl font-bold text-slate-800 mb-2">
                            ¿{blockActionData.action === 'bloquear' ? 'Bloquear Acceso' : 'Reactivar Cuenta'}?
                        </h2>
                        <p className="text-sm text-slate-600 mb-6">
                            {blockActionData.action === 'bloquear'
                                ? `El usuario ${blockActionData.client.full_name} perderá acceso inmediato a la App. Sus datos se mantienen.`
                                : `El usuario ${blockActionData.client.full_name} recuperará el acceso a la App.`}
                        </p>
                        <div className="flex gap-3">
                            <button onClick={() => setShowBlockModal(false)} className="flex-1 py-2.5 rounded-lg border border-slate-200 font-bold text-slate-600 hover:bg-slate-50">Cancelar</button>
                            <button onClick={handleBlockConfirm} className={`flex-1 py-2.5 rounded-lg font-bold text-white ${blockActionData.action === 'bloquear' ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'}`}>
                                Confirmar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Edit/Create Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 animate-in fade-in backdrop-blur-sm">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
                        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 shrink-0">
                            <h2 className="text-lg font-bold text-slate-800">{id ? 'Editar Cliente' : 'Nuevo Cliente'}</h2>
                            <button onClick={handleClose}><X size={20} className="text-slate-400" /></button>
                        </div>
                        <form onSubmit={handleSave} className="p-6 space-y-4 overflow-y-auto custom-scrollbar">
                            <div>
                                <label className="text-xs font-bold text-slate-500 uppercase">Nombre</label>
                                <input required value={fullName} onChange={e => setFullName(e.target.value)} className="w-full p-2 border rounded-lg text-sm" />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-xs font-bold text-slate-500 uppercase">Teléfono</label>
                                    <input required value={phone} onChange={e => setPhone(e.target.value)} className="w-full p-2 border rounded-lg text-sm" />
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-slate-500 uppercase">Email</label>
                                    <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="w-full p-2 border rounded-lg text-sm" />
                                </div>
                            </div>
                            {/* --- LOCATION PRO SECTION --- */}
                            <div className="space-y-4 bg-slate-50/50 p-5 rounded-2xl border border-slate-100">
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

                                {/* SEARCH & MAP TOGGLE */}
                                <div className="relative group">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                        <Search size={16} className="text-slate-400 group-focus-within:text-blue-500 transition-colors" />
                                    </div>
                                    <input
                                        value={value}
                                        onChange={(e) => {
                                            setValue(e.target.value);
                                            setAddress(e.target.value);
                                        }}
                                        // removed disabled={!ready} to prevent blocking
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

                                {/* MAP TOGGLE BUTTON */}
                                {!showMap ? (
                                    <button
                                        type="button"
                                        onClick={() => setShowMap(true)}
                                        className="w-full flex items-center justify-center gap-2 py-2.5 bg-gradient-to-r from-slate-800 to-slate-900 hover:from-slate-700 hover:to-slate-800 text-white rounded-xl font-bold text-xs shadow-lg shadow-slate-200 transition-all hover:scale-[1.02] active:scale-[0.98]"
                                    >
                                        <MapPin size={14} />
                                        Abrir Mapa para Ajuste Preciso
                                    </button>
                                ) : (
                                    <div className="relative rounded-2xl overflow-hidden border-2 border-slate-200/60 shadow-xl bg-white animate-in slide-in-from-top-4 duration-300">
                                        <div className="h-[320px] w-full relative">
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
                                                        <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-[10px] font-bold px-2 py-1 rounded shadow-lg whitespace-nowrap opacity-0 group-hover/pin:opacity-100 transition-opacity pointer-events-none">
                                                            ¡Arrástrame!
                                                        </div>
                                                    </div>
                                                </Marker>
                                                <NavigationControl position="top-right" showCompass={false} />
                                            </Map>

                                            {/* INSTRUCTION OVERLAY (Floating Glass Card) */}
                                            <div className="absolute top-3 left-3 right-12 bg-white/90 backdrop-blur-md p-3 rounded-xl border border-white/50 shadow-lg z-10">
                                                <div className="flex gap-3">
                                                    <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center shrink-0 text-blue-600">
                                                        <MapPin size={16} />
                                                    </div>
                                                    <div>
                                                        <h4 className="text-[11px] font-extrabold text-slate-800 uppercase tracking-wide">Ajuste de Precisión</h4>
                                                        <p className="text-[10px] text-slate-600 leading-snug mt-0.5">
                                                            Arrastra el <strong>pin rojo</strong> hasta la puerta exacta. Google te acerca, <strong>tú confirmas la ubicación exacta.</strong>
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Close Map Button */}
                                            <button
                                                onClick={() => setShowMap(false)}
                                                className="absolute top-3 right-3 p-2 bg-white rounded-full shadow-lg text-slate-500 hover:text-red-500 hover:bg-red-50 transition-colors z-20"
                                            >
                                                <X size={16} />
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* DATA FEEDBACK (Read Only) */}
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

                            {/* --- DYNAMIC ZONES (Province & City) --- */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-xs font-bold text-slate-500 uppercase">Provincia</label>
                                    <div className="relative">
                                        <select
                                            value={province}
                                            onChange={e => handleProvinceChange(e.target.value)}
                                            className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 focus:bg-white focus:border-blue-400 outline-none appearance-none cursor-pointer"
                                        >
                                            {serviceZones.map(z => (
                                                <option key={z.id} value={z.province}>{z.province}</option>
                                            ))}
                                        </select>
                                        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                                            <ChevronDown size={14} />
                                        </div>
                                    </div>
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-slate-500 uppercase">Localidad</label>
                                    <div className="relative">
                                        <select
                                            value={city}
                                            onChange={e => setCity(e.target.value)}
                                            className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 focus:bg-white focus:border-blue-400 outline-none appearance-none cursor-pointer"
                                            disabled={availableCities.length === 0}
                                        >
                                            {availableCities.map(c => (
                                                <option key={c} value={c}>{c}</option>
                                            ))}
                                        </select>
                                        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                                            <ChevronDown size={14} />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <button className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-bold hover:bg-blue-700">Guardar</button>
                        </form>
                    </div>
                </div>
            )}

            {/* Appliances Modal Refined */}
            {showAppliances && selectedClient && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl overflow-hidden max-h-[90vh] flex flex-col">
                        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                            <div>
                                <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                                    <Package size={20} className="text-purple-600" /> Equipos Registrados
                                </h2>
                                <p className="text-xs text-slate-500">{selectedClient.full_name}</p>
                            </div>
                            <button onClick={() => setShowAppliances(false)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
                        </div>
                        <div className="p-6 overflow-y-auto flex-1 bg-slate-50/50">
                            {appliancesLoading ? (
                                <div className="text-center py-8 text-slate-400">Cargando equipos...</div>
                            ) : clientAppliances.length === 0 ? (
                                <div className="p-8 text-center text-slate-400 border-2 border-dashed rounded-xl">
                                    <p>Este cliente no tiene equipos registrados.</p>
                                    <p className="text-xs mt-2">Nota: Si el cliente tiene equipos y no salen, verifica los permisos de seguridad (RLS).</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {clientAppliances.map(app => (
                                        <div key={app.id} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex gap-4 items-start">
                                            <div className="w-10 h-10 bg-purple-50 rounded flex items-center justify-center text-purple-600 font-bold shrink-0 shadow-inner">
                                                {app.type?.[0]?.toUpperCase()}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <h4 className="font-bold text-slate-800 text-sm">{app.brand} {app.model}</h4>
                                                <p className="text-xs text-slate-500 uppercase">{app.type}</p>
                                                <div className="mt-2 flex gap-3 text-xs text-slate-400">
                                                    <span className="flex items-center gap-1"><History size={12} /> {app.repairCount} Rep.</span>
                                                    <span className="flex items-center gap-1"><Zap size={12} /> {app.totalSpent}€</span>
                                                </div>
                                            </div>
                                            {/* OCR Badge or similar could go here */}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* History Modal Reuse Logic */}
            {showHistory && selectedClient && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl overflow-hidden max-h-[90vh] flex flex-col">
                        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                            <h2 className="text-lg font-bold text-slate-800">Historial</h2>
                            <button onClick={() => setShowHistory(false)}><X size={20} /></button>
                        </div>
                        <div className="p-6 overflow-y-auto flex-1">
                            {clientTickets.length === 0 ? <div className="text-center text-slate-400">Sin tickets</div> : (
                                <div className="space-y-2">
                                    {clientTickets.map(t => (
                                        <div key={t.id} className="bg-slate-50 p-3 rounded-lg text-sm border border-slate-100">
                                            <div className="flex justify-between font-bold text-slate-700">
                                                <span>{format(new Date(t.created_at), 'dd/MM/yyyy')}</span>
                                                <span className="uppercase">{t.status}</span>
                                            </div>
                                            <p className="text-slate-600">{t.problem_description}</p>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Confirm Modal */}
            {showDeleteConfirmModal && (
                <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 animate-in fade-in backdrop-blur-sm">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden p-6 text-center">
                        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4 text-red-600">
                            <Trash2 size={32} />
                        </div>
                        <h2 className="text-xl font-bold text-slate-800 mb-2">Eliminar Cliente Definitivamente</h2>
                        <p className="text-sm text-slate-600 mb-4">
                            Esta acción borrará al cliente <strong>{deleteTargetClient?.full_name}</strong> y es <strong>irreversible</strong>.
                        </p>

                        <div className="mb-4 text-left">
                            <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Tu Contraseña de Super Admin</label>
                            <input
                                type="password"
                                autoFocus
                                value={deletePassword}
                                onChange={e => setDeletePassword(e.target.value)}
                                className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none transition"
                                placeholder="Escribe tu contraseña..."
                            />
                        </div>

                        <div className="flex gap-3">
                            <button
                                onClick={() => { setShowDeleteConfirmModal(false); setDeletePassword(''); setDeleteTargetClient(null); }}
                                className="flex-1 py-2.5 rounded-lg border border-slate-200 font-bold text-slate-600 hover:bg-slate-50"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={confirmDelete}
                                disabled={!deletePassword}
                                className="flex-1 py-2.5 rounded-lg font-bold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {loading ? 'Borrando...' : 'Confirmar Borrado'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
};

export default ClientManager;
