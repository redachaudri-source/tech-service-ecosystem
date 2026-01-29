import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { Plus, User, MapPin, Trash2, Edit2, X, Phone, Mail, History, Filter, Search as SearchIcon, Lock, Unlock, Package, Zap, Waves, Wind, Refrigerator, Flame, Thermometer, Tv, Smartphone, Disc, TrendingUp, AlertTriangle, CheckCircle, Clock, Star, ShieldAlert, Building2, Laptop, Navigation, Search, ChevronDown, Eye } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import ClientFormModal from '../components/ClientFormModal';

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

    // Addresses State
    const [showAddresses, setShowAddresses] = useState(false);
    const [clientAddresses, setClientAddresses] = useState([]);
    const [addressesLoading, setAddressesLoading] = useState(false);

    useEffect(() => {
        fetchClients();
    }, []);


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
            notes, role: 'client',
            created_via: id ? undefined : 'admin',
            registration_source: id ? undefined : 'office' // Admin-created clients are 'office'
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
        if (!deleteTargetClient || !deletePassword) {
            console.log("❌ Delete aborted: missing client or password");
            return;
        }
        setLoading(true);
        console.log("🗑️ Attempting to delete client:", deleteTargetClient.id, deleteTargetClient.full_name);

        try {
            // 1. Verify Password
            console.log("🔐 Verifying password for:", user.email);
            const { error: authError } = await supabase.auth.signInWithPassword({
                email: user.email,
                password: deletePassword
            });

            if (authError) {
                console.error("❌ Password verification failed:", authError);
                alert("Contraseña incorrecta. No se puede borrar.");
                setLoading(false);
                return;
            }
            console.log("✅ Password verified successfully");

            // 2. Perform Delete
            console.log("🗑️ Executing DELETE on profiles for ID:", deleteTargetClient.id);
            const { error: deleteError } = await supabase.from('profiles').delete().eq('id', deleteTargetClient.id);

            if (deleteError) {
                console.error("❌ Delete error from Supabase:", deleteError);
                throw deleteError;
            }
            console.log("✅ Client deleted successfully");

            // Success
            await fetchClients();
            setShowDeleteConfirmModal(false);
            setDeleteTargetClient(null);
            setDeletePassword('');

        } catch (err) {
            console.error("❌ Delete failed:", err);
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

    const handleViewAddresses = async (client) => {
        setSelectedClient(client);
        setShowAddresses(true);
        setAddressesLoading(true);
        setClientAddresses([]);

        try {
            const { data, error } = await supabase
                .from('client_addresses')
                .select('*')
                .eq('client_id', client.id)
                .order('is_primary', { ascending: false })
                .order('label');

            if (error) throw error;
            setClientAddresses(data || []);
        } catch (err) {
            console.error('Error fetching addresses:', err);
        } finally {
            setAddressesLoading(false);
        }
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
                                                    {/* ORIGIN BADGE - Based on registration_source */}
                                                    {client.registration_source === 'app' ? (
                                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-blue-50 text-blue-700 border border-blue-200">
                                                            <Smartphone size={10} /> App
                                                        </span>
                                                    ) : client.registration_source === 'whatsapp' ? (
                                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-green-50 text-green-700 border border-green-200">
                                                            <svg viewBox="0 0 24 24" fill="currentColor" className="w-2.5 h-2.5"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" /></svg>
                                                            WhatsApp
                                                        </span>
                                                    ) : (
                                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-amber-50 text-amber-700 border border-amber-200">
                                                            <Building2 size={10} /> Oficina
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
                                                <span className="truncate max-w-[200px]" title={`${client.address} ${client.floor || ''} ${client.apartment || ''}`}>
                                                    {client.address}
                                                    {(client.floor || client.apartment) && <span className="text-slate-400 ml-1">· {client.floor} {client.apartment}</span>}
                                                    {client.city ? ` (${client.city})` : ''}
                                                </span>
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
                                            <button onClick={() => handleViewAddresses(client)} className="p-1.5 text-slate-500 hover:text-teal-600 hover:bg-teal-50 rounded" title="Ver Direcciones">
                                                <Eye size={16} />
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

            {/* Edit/Create Modal - Using ClientFormModal component */}
            <ClientFormModal
                isOpen={showModal}
                onClose={handleClose}
                onSuccess={(clientData) => {
                    fetchClients();
                    handleClose();
                }}
                editClient={selectedClient}
                context="client-management"
            />

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
            )
            }

            {/* Addresses Modal */}
            {showAddresses && selectedClient && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl overflow-hidden max-h-[90vh] flex flex-col">
                        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                            <div>
                                <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                                    <MapPin size={20} className="text-teal-600" /> Direcciones Registradas
                                </h2>
                                <p className="text-xs text-slate-500">{selectedClient.full_name}</p>
                            </div>
                            <button onClick={() => setShowAddresses(false)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
                        </div>
                        <div className="p-6 overflow-y-auto flex-1 bg-slate-50/50">
                            {addressesLoading ? (
                                <div className="text-center py-8 text-slate-400">Cargando direcciones...</div>
                            ) : clientAddresses.length === 0 ? (
                                <div className="p-8 text-center text-slate-400 border-2 border-dashed rounded-xl">
                                    <MapPin size={32} className="mx-auto mb-2 opacity-50" />
                                    <p>Este cliente no tiene direcciones en la tabla multi-direcciones.</p>
                                    <p className="text-xs mt-1">Dirección del perfil: {selectedClient.address || 'No especificada'}</p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {clientAddresses.map(addr => (
                                        <div key={addr.id} className={`bg-white p-4 rounded-xl border ${addr.is_primary ? 'border-teal-300 ring-2 ring-teal-100' : 'border-slate-200'} shadow-sm`}>
                                            <div className="flex justify-between items-start">
                                                <div className="flex items-center gap-2">
                                                    {addr.is_primary && (
                                                        <span className="px-2 py-0.5 text-[10px] font-bold bg-teal-100 text-teal-700 rounded-full uppercase">Principal</span>
                                                    )}
                                                    <span className="font-bold text-slate-800">{addr.label || 'Sin etiqueta'}</span>
                                                </div>
                                            </div>
                                            <p className="text-sm text-slate-600 mt-2 flex items-start gap-2">
                                                <MapPin size={14} className="text-slate-400 mt-0.5 shrink-0" />
                                                {addr.address_line}
                                            </p>
                                            <div className="flex gap-4 mt-2 text-xs text-slate-400">
                                                <span>Ciudad: {addr.city || '-'}</span>
                                                <span>CP: {addr.postal_code || '-'}</span>
                                                {addr.floor && <span>Piso: {addr.floor}</span>}
                                                {addr.apartment && <span>Pta: {addr.apartment}</span>}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* History Modal Reuse Logic */}
            {
                showHistory && selectedClient && (
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
                )
            }

            {/* Delete Confirm Modal */}
            {
                showDeleteConfirmModal && (
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
                )
            }

        </div >
    );
};

export default ClientManager;
