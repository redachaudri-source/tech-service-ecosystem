import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Plus, User, MapPin, Trash2, Edit2, X, Phone, Mail, History, Filter, Search as SearchIcon, Lock, Unlock, Package, Zap, Waves, Wind, Refrigerator, Flame, Thermometer, Tv, Smartphone, Disc, TrendingUp, AlertTriangle, CheckCircle } from 'lucide-react';
import { format } from 'date-fns';


const ClientManager = () => {
    const [clients, setClients] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);

    const [cities] = useState([
        'Málaga', 'Marbella', 'Mijas', 'Fuengirola', 'Vélez-Málaga',
        'Torremolinos', 'Benalmádena', 'Estepona', 'Rincón de la Victoria',
        'Antequera', 'Alhaurín de la Torre', 'Ronda', 'Cártama',
        'Alhaurín el Grande', 'Coín', 'Nerja', 'Torrox', 'Manilva', 'Álora'
    ]);

    // Form State
    const [id, setId] = useState(null);
    const [fullName, setFullName] = useState('');
    const [email, setEmail] = useState('');
    const [phone, setPhone] = useState('');
    const [phone2, setPhone2] = useState('');
    const [address, setAddress] = useState('');
    const [floor, setFloor] = useState('');
    const [apartment, setApartment] = useState('');
    const [city, setCity] = useState('Málaga'); // Default City
    const [province] = useState('Málaga'); // Fixed
    const [postalCode, setPostalCode] = useState('');
    const [notes, setNotes] = useState('');
    const [isLookingUpCP, setIsLookingUpCP] = useState(false);

    // Search & Filter State
    const [searchTerm, setSearchTerm] = useState('');
    const [cityFilter, setCityFilter] = useState('Todas'); // Changed from Province
    const [sourceFilter, setSourceFilter] = useState('Todos'); // Admin vs App

    // History State
    const [showHistory, setShowHistory] = useState(false);
    const [selectedClient, setSelectedClient] = useState(null);
    const [clientTickets, setClientTickets] = useState([]);
    const [errorMsg, setErrorMsg] = useState(null);

    // Appliances State
    const [showAppliances, setShowAppliances] = useState(false);
    const [clientAppliances, setClientAppliances] = useState([]);

    useEffect(() => {
        fetchClients();
    }, []);

    // Nominatim Lookup Logic
    const lookupPostalCode = async (addr, cit, prov) => {
        if (!addr || !cit) return;
        setIsLookingUpCP(true);
        try {
            const query = `${addr}, ${cit}, ${prov}, Spain`;
            const resp = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`);
            const data = await resp.json();
            if (data && data.length > 0) {
                // Try to perform a reverse lookup on the coordinates to get the proper postal code
                // Sometimes Nominatim search result doesn't strictly have the postcode in the top level
                // But let's check display_name or extra logic.
                // A better approach with Nominatim is 'addressdetails=1'

                const detailResp = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1&addressdetails=1`);
                const detailData = await detailResp.json();

                if (detailData && detailData.length > 0 && detailData[0].address) {
                    const foundPostcode = detailData[0].address.postcode;
                    if (foundPostcode) {
                        setPostalCode(foundPostcode);
                    }
                }
            }
        } catch (error) {
            console.error("CP Lookup failed", error);
        } finally {
            setIsLookingUpCP(false);
        }
    };

    // Handlers to debounce or trigger lookup
    const handleAddressChange = (val) => {
        setAddress(val);
        // Simple debounce could be here, but for now we'll trigger if user pauses? 
        // Or just let them type. Let's trigger onBlur for now or use a timeout effect.
    };

    // Using Effect for Debounce
    useEffect(() => {
        const timer = setTimeout(() => {
            if (address.length > 5 && city.length > 2) {
                lookupPostalCode(address, city, province);
            }
        }, 1500); // 1.5s delay after typing stops
        return () => clearTimeout(timer);
    }, [address, city, province]);

    const handleCityChange = (val) => setCity(val);
    const handleProvinceChange = (val) => setProvince(val);


    const fetchClients = async () => {
        setErrorMsg(null);
        // SIMPLIFIED FETCH FOR DEBUGGING RLS
        const { data, error } = await supabase
            .from('profiles')
            .select('*') // Removed tickets(count) temporarily to fix visibility
            .eq('role', 'client')
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error fetching clients:', error);
            setErrorMsg(error.message);
        } else {
            const formattedData = data.map(client => ({
                ...client,
                ticket_count: 0 // Placeholder until we fix the join RLS
            }));
            setClients(formattedData);
        }
        setLoading(false);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);

        const payload = {
            full_name: fullName,
            email: email,
            phone: phone,
            phone_2: phone2,
            address: address,
            floor: floor,
            apartment: apartment,
            city: city, // New Field
            province: province,
            postal_code: postalCode,
            notes: notes,
            role: 'client',
            created_via: id ? undefined : 'admin' // Only set on insert
        };

        let result;
        if (id) {
            result = await supabase.from('profiles').update(payload).eq('id', id);
        } else {
            result = await supabase.from('profiles').insert(payload);
        }

        if (result.error) {
            alert('Error: ' + result.error.message);
        } else {
            await fetchClients(); // Ensure we wait for the fetch to complete
            handleClose();
        }
        setLoading(false);
    };

    const handleDelete = async (clientId) => {
        if (!confirm('¿Eliminar cliente? Se borrarán sus tickets asociados.')) return;
        setLoading(true);

        try {
            // 0. Get tickets IDs to delete service parts first (if cascade isn't working)
            const { data: tickets } = await supabase.from('tickets').select('id').eq('client_id', clientId);

            if (tickets && tickets.length > 0) {
                const ticketIds = tickets.map(t => t.id);
                // Delete Parts
                const { error: partsError } = await supabase.from('service_parts').delete().in('ticket_id', ticketIds);
                if (partsError) console.error('Error delete parts', partsError);

                // Delete Warranties (if any)
                const { error: warrError } = await supabase.from('warranties').delete().in('ticket_id', ticketIds);
                if (warrError) console.error('Error delete warranties', warrError);
            }

            // 1. Delete tickets
            const { error: ticketError } = await supabase.from('tickets').delete().eq('client_id', clientId);
            if (ticketError) {
                console.error('Error deleting tickets:', ticketError);
                throw new Error('Falló al borrar tickets: ' + ticketError.message);
            }

            // 2. Delete the profile
            const { error } = await supabase.from('profiles').delete().eq('id', clientId);

            if (error) {
                throw new Error(error.message);
            }

            await fetchClients();

        } catch (err) {
            alert('Error al eliminar: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleToggleBlock = async (client) => {
        const newStatus = !client.is_active;
        const action = newStatus ? 'desbloquear' : 'bloquear';
        if (!confirm(`¿Estás seguro de que quieres ${action} a ${client.full_name}?`)) return;

        const { error } = await supabase.from('profiles').update({ is_active: newStatus }).eq('id', client.id);
        if (error) alert('Error: ' + error.message);
        else await fetchClients();
    };

    const handleEdit = (client) => {
        setId(client.id);
        setFullName(client.full_name);
        setEmail(client.email);
        setPhone(client.phone);
        setPhone2(client.phone_2 || '');
        setAddress(client.address || '');
        setFloor(client.floor || '');
        setApartment(client.apartment || '');
        setCity(client.city || 'Málaga');
        // setProvince is fixed
        setPostalCode(client.postal_code || '');
        setNotes(client.notes || '');

        // Pass ticket count context to modal indirectly? 
        // We can check 'client.ticket_count' in the render, 
        // but easier to store selectedClient for editing context if needed, or just rely on the ID check + known list.
        // Actually, let's just use a ref or state. 
        // Or simpler: The modal logic can check the 'client' object if we store it.
        setSelectedClient(client); // Reusing this for both History and Edit context
        setShowModal(true);
    };

    const handleClose = () => {
        setShowModal(false);
        setId(null);
        setFullName('');
        setEmail('');
        setPhone('');
        setPhone2('');
        setAddress('');
        setFloor('');
        setApartment('');
        setCity('Málaga');
        setPostalCode('');
        setNotes('');
    };

    const handleViewHistory = async (client) => {
        setSelectedClient(client);
        setShowHistory(true);
        const { data } = await supabase
            .from('tickets')
            .select('*, appliance_info')
            .eq('client_id', client.id)
            .order('created_at', { ascending: false });
        setClientTickets(data || []);
    };

    const handleViewAppliances = async (client) => {
        setSelectedClient(client);
        setShowAppliances(true);
        // Fetch appliances with simple history counts
        const { data } = await supabase
            .from('client_appliances')
            .select(`
                *,
                tickets (*)
            `)
            .eq('client_id', client.id)
            .order('created_at', { ascending: false });

        // Process metrics simply
        const processed = (data || []).map(app => {
            const tickets = app.tickets || [];
            const repairCount = tickets.filter(t => ['finalizado', 'pagado'].includes(t.status)).length;
            const totalSpent = tickets
                .filter(t => ['finalizado', 'pagado'].includes(t.status))
                .reduce((sum, t) => {
                    // Loose calculation fallback if JSON parsing is heavy, but let's try to match client logic
                    // For admin list, just knowing if they spend a lot is enough
                    return sum + (t.total || 0); // Assuming we might save total in future, or just 0 for now if null
                }, 0);
            return { ...app, repairCount, totalSpent, tickets };
        });

        setClientAppliances(processed);
    };

    // Filter Logic
    const filteredClients = clients.filter(client => {
        const matchSearch =
            client.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            client.phone?.includes(searchTerm) ||
            client.email?.toLowerCase().includes(searchTerm.toLowerCase());

        const matchCity = cityFilter === 'Todas' || client.city === cityFilter;
        const matchSource = sourceFilter === 'Todos' ||
            (sourceFilter === 'Admin' ? client.created_via === 'admin' : client.created_via !== 'admin');

        return matchSearch && matchCity && matchSource;
    });

    const uniqueCities = ['Todas', ...new Set(clients.map(c => c.city).filter(Boolean))];

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold text-slate-800">Cartera de Clientes</h1>
                <button
                    onClick={() => { handleClose(); setShowModal(true); }}
                    className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition"
                >
                    <Plus size={20} />
                    Nuevo Cliente
                </button>
            </div>

            {/* Smart Search Bar */}
            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex gap-4 flex-wrap">
                <div className="flex-1 min-w-[300px] relative">
                    <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                    <input
                        type="text"
                        placeholder="Buscar por nombre, teléfono o email..."
                        className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                </div>

                <div className="flex items-center gap-2">
                    <Filter size={20} className="text-slate-400" />
                    <select
                        className="p-2 border border-slate-200 rounded-lg text-slate-700 focus:outline-none"
                        value={cityFilter}
                        onChange={e => setCityFilter(e.target.value)}
                    >
                        {uniqueCities.map(city => <option key={city} value={city}>{city}</option>)}
                    </select>
                </div>

                <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-lg">
                    {['Todos', 'Admin', 'App'].map(src => (
                        <button
                            key={src}
                            onClick={() => setSourceFilter(src)}
                            className={`px-3 py-1.5 rounded-md text-sm font-medium transition ${sourceFilter === src ? 'bg-white shadow text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            {src}
                        </button>
                    ))}
                </div>
            </div>

            {errorMsg && (
                <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl flex items-center gap-2">
                    <span className="font-bold">Error de Carga:</span> {errorMsg}
                </div>
            )}

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <table className="w-full text-left">
                    <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                            <th className="px-6 py-4 font-semibold text-slate-600">Nombre</th>
                            <th className="px-6 py-4 font-semibold text-slate-600">Contacto</th>
                            <th className="px-6 py-4 font-semibold text-slate-600">Ubicación</th>
                            <th className="px-6 py-4 font-semibold text-slate-600">Origen</th>
                            <th className="px-6 py-4 font-semibold text-slate-600 text-right">Acciones</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {filteredClients.map(client => (
                            <tr key={client.id} className="hover:bg-slate-50">
                                <td className="px-6 py-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold">
                                            {client.full_name.charAt(0)}
                                        </div>
                                        <div className="font-medium text-slate-900">{client.full_name}</div>
                                    </div>
                                </td>
                                <td className="px-6 py-4">
                                    <div className="flex flex-col gap-1 text-sm text-slate-600">
                                        {client.phone && (
                                            <div className="flex items-center gap-2">
                                                <Phone size={14} />
                                                <span>{client.phone}</span>
                                                {client.phone_2 && <span className="text-slate-400">/ {client.phone_2}</span>}
                                            </div>
                                        )}
                                        {client.email && (
                                            <div className="flex items-center gap-2">
                                                <Mail size={14} /> {client.email}
                                            </div>
                                        )}
                                    </div>
                                </td>
                                <td className="px-6 py-4 text-slate-600 text-sm">
                                    <div>{client.address}</div>
                                    {(client.floor || client.apartment) && (
                                        <div className="text-xs text-slate-500">
                                            {client.floor && `Planta: ${client.floor}`}
                                            {client.floor && client.apartment && ' - '}
                                            {client.apartment && `Puerta: ${client.apartment}`}
                                        </div>
                                    )}
                                    <div className="text-xs text-slate-400">
                                        {client.city ? `${client.city}, ` : ''}{client.postal_code}
                                    </div>
                                </td>
                                <td className="px-6 py-4">
                                    <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold ${client.created_via === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-green-100 text-green-700'}`}>
                                        {client.created_via === 'admin' ? 'ADMIN' : 'APP'}
                                    </span>
                                </td>
                                <td className="px-6 py-4 text-right">
                                    <div className="flex justify-end gap-2 text-right">
                                        <button onClick={() => handleViewHistory(client)} className="p-1.5 text-slate-500 hover:bg-slate-50 hover:text-blue-600 rounded" title="Historial">
                                            <History size={16} />
                                        </button>

                                        <button onClick={() => handleEdit(client)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded" title="Editar">
                                            <Edit2 size={16} />
                                        </button>

                                        <button onClick={() => handleViewAppliances(client)} className="p-1.5 text-purple-600 hover:bg-purple-50 rounded" title="Ver Equipos">
                                            <Package size={16} />
                                        </button>

                                        {client.created_via === 'app' ? (
                                            <button
                                                onClick={() => handleToggleBlock(client)}
                                                className={`p-1.5 rounded transition ${client.is_active ? 'text-slate-400 hover:text-red-500 hover:bg-red-50' : 'text-red-600 bg-red-100 hover:bg-red-200'}`}
                                                title={client.is_active ? "Bloquear Cuenta" : "Cuenta Bloqueada (Click para activar)"}
                                            >
                                                {client.is_active ? <Lock size={16} /> : <Unlock size={16} />}
                                            </button>
                                        ) : (
                                            // Admin Created
                                            (client.tickets && client.tickets.length === 0 /* Check raw count from join if mapped, or use ticket_count prop above */) || client.ticket_count === 0 ? (
                                                <button onClick={() => handleDelete(client.id)} className="p-1.5 text-red-600 hover:bg-red-50 rounded" title="Eliminar (Sin Tickets)">
                                                    <Trash2 size={16} />
                                                </button>
                                            ) : (
                                                <div className="w-8"></div> // Spacer if can't delete
                                            )
                                        )}
                                    </div>
                                </td>
                            </tr>
                        ))}
                        {filteredClients.length === 0 && !loading && (
                            <tr>
                                <td colSpan="4" className="px-6 py-8 text-center text-slate-400">
                                    No hay clientes registrados.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
                        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 shrink-0">
                            <h2 className="text-lg font-bold text-slate-800">
                                {id ? 'Editar Cliente' : 'Nuevo Cliente'}
                            </h2>
                            <button onClick={handleClose} className="text-slate-400 hover:text-slate-600">
                                <X size={20} />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto custom-scrollbar">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Nombre Completo <span className="text-red-500">*</span></label>
                                <input
                                    required
                                    disabled={id && selectedClient?.ticket_count > 0} // Disable if editing existing client with tickets
                                    type="text"
                                    className={`w-full p-2 border border-slate-200 rounded-lg ${id && selectedClient?.ticket_count > 0 ? 'bg-slate-100 text-slate-500 cursor-not-allowed' : ''}`}
                                    value={fullName}
                                    onChange={e => setFullName(e.target.value)}
                                />
                                {id && selectedClient?.ticket_count > 0 && (
                                    <p className="text-xs text-amber-600 mt-1">Nombre no editable (tiene tickets asociados).</p>
                                )}
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Teléfono 1 <span className="text-red-500">*</span></label>
                                    <input
                                        required
                                        type="text"
                                        className="w-full p-2 border border-slate-200 rounded-lg"
                                        value={phone}
                                        onChange={e => setPhone(e.target.value)}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Teléfono 2 (Opcional)</label>
                                    <input
                                        type="text"
                                        className="w-full p-2 border border-slate-200 rounded-lg"
                                        value={phone2}
                                        onChange={e => setPhone2(e.target.value)}
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                                <input
                                    type="email"
                                    className="w-full p-2 border border-slate-200 rounded-lg"
                                    value={email}
                                    onChange={e => setEmail(e.target.value)}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Dirección (Calle y Número) <span className="text-red-500">*</span></label>
                                <input
                                    required
                                    type="text"
                                    placeholder="Ej: Av. Andalucía 10"
                                    className="w-full p-2 border border-slate-200 rounded-lg"
                                    value={address}
                                    onChange={e => handleAddressChange(e.target.value)}
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Piso / Planta</label>
                                    <input
                                        type="text"
                                        placeholder="Ej: 1º"
                                        className="w-full p-2 border border-slate-200 rounded-lg"
                                        value={floor}
                                        onChange={e => setFloor(e.target.value)}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Puerta</label>
                                    <input
                                        type="text"
                                        placeholder="Ej: A"
                                        className="w-full p-2 border border-slate-200 rounded-lg"
                                        value={apartment}
                                        onChange={e => setApartment(e.target.value)}
                                    />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Localidad <span className="text-red-500">*</span></label>
                                    <select
                                        required
                                        className="w-full p-2 border border-slate-200 rounded-lg"
                                        value={city}
                                        onChange={e => handleCityChange(e.target.value)}
                                    >
                                        {cities.map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">
                                        Código Postal <span className="text-red-500">*</span>
                                        {isLookingUpCP && <span className="text-xs text-blue-500 ml-2 animate-pulse">Buscando...</span>}
                                    </label>
                                    <input
                                        required
                                        type="text"
                                        className="w-full p-2 border border-slate-200 rounded-lg bg-slate-50"
                                        value={postalCode}
                                        onChange={e => setPostalCode(e.target.value)}
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Notas Importantes</label>
                                <textarea
                                    className="w-full p-2 border border-slate-200 rounded-lg h-24"
                                    placeholder="Ej: Llamar antes de ir, perro bravo, etc."
                                    value={notes}
                                    onChange={e => setNotes(e.target.value)}
                                />
                            </div>

                            <button
                                type="submit"
                                className="w-full py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700"
                            >
                                Guardar Cliente
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* Appliances Modal */}
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
                            <button onClick={() => setShowAppliances(false)} className="text-slate-400 hover:text-slate-600">
                                <X size={20} />
                            </button>
                        </div>
                        <div className="p-6 overflow-y-auto flex-1 bg-slate-50/50">
                            {clientAppliances.length === 0 ? (
                                <div className="p-8 text-center text-slate-400 border-2 border-dashed rounded-xl">
                                    Este cliente no tiene equipos registrados.
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {clientAppliances.map(app => (
                                        <ApplianceCardAdmin key={app.id} appliance={app} />
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

// --- Helpers & Components ---

const AI_ESTIMATES = {
    'lavadora': 450, 'lavavajillas': 500, 'frigorífico': 700, 'secadora': 400,
    'horno': 350, 'aire acondicionado': 600, 'televisión': 500, 'microondas': 150,
    'vitrocerámica': 300, 'campana': 200, 'calentador': 300
};

const ViabilityAnalysis = ({ appliance }) => { // Simplified version for Admin
    // Re-calculate simplistic total for display if fetching was loose
    // Here we rely on the passed appliance.totalSpent calculated in fetch

    const typeKey = (appliance.type || '').toLowerCase();
    const estimateKey = Object.keys(AI_ESTIMATES).find(k => typeKey.includes(k));
    const estimatedNewPrice = estimateKey ? AI_ESTIMATES[estimateKey] : 400;

    // We don't have perfect totalSpent here because we didn't parse JSON in the simplified fetch
    // But we can check repairCount as a proxy for now, OR rely on upcoming `tickets.total` column
    // For now, let's mock the "Check"

    const repairCount = appliance.repairCount || 0;
    const purchaseYear = appliance.purchase_date ? new Date(appliance.purchase_date).getFullYear() : new Date().getFullYear();
    const age = new Date().getFullYear() - purchaseYear;

    let status = 'good';
    let msg = 'Rentable';

    if (repairCount > 2 || age > 10) {
        status = 'bad';
        msg = 'Renove Sugerido';
    } else if (repairCount > 0 || age > 7) {
        status = 'warning';
        msg = 'Vigilar';
    }

    const colors = {
        good: 'bg-green-100 text-green-700 border-green-200',
        warning: 'bg-amber-100 text-amber-700 border-amber-200',
        bad: 'bg-red-100 text-red-700 border-red-200'
    };

    return (
        <div className={`flex items-center gap-1.5 px-2 py-1 rounded border text-[10px] font-bold uppercase ${colors[status]}`}>
            {status === 'good' && <CheckCircle size={12} />}
            {status === 'warning' && <AlertTriangle size={12} />}
            {status === 'bad' && <TrendingUp size={12} />}
            <span>IA: {msg}</span>
        </div>
    );
};

const getIconForType = (type) => {
    const t = (type || '').toLowerCase();
    const size = 20; const className = "text-purple-600";
    if (t.includes('lav')) return <Waves size={size} className={className} />;
    if (t.includes('secadora')) return <Wind size={size} className={className} />;
    if (t.includes('frigo') || t.includes('never')) return <Refrigerator size={size} className={className} />;
    if (t.includes('horno') || t.includes('micro') || t.includes('vitro')) return <Flame size={size} className={className} />;
    if (t.includes('aire')) return <Thermometer size={size} className={className} />;
    if (t.includes('tv')) return <Tv size={size} className={className} />;
    if (t.includes('movil')) return <Smartphone size={size} className={className} />;
    if (t.includes('plato')) return <Disc size={size} className={className} />;
    return <Zap size={size} className={className} />;
};

const ApplianceCardAdmin = ({ appliance }) => {
    return (
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex gap-4">
            <div className="w-12 h-12 bg-purple-50 rounded-lg flex items-center justify-center shrink-0">
                {getIconForType(appliance.type)}
            </div>
            <div className="flex-1 min-w-0">
                <div className="flex justify-between items-start">
                    <div>
                        <h4 className="font-bold text-slate-800 text-sm">{appliance.brand} {appliance.model}</h4>
                        <p className="text-xs text-slate-500">{appliance.type}</p>
                    </div>
                    <ViabilityAnalysis appliance={appliance} />
                </div>

                <div className="mt-3 flex items-center gap-4 text-xs text-slate-600">
                    <div className="flex items-center gap-1">
                        <History size={14} className="text-slate-400" />
                        <span className="font-bold">{appliance.repairCount}</span> Reparaciones
                    </div>
                    {appliance.purchase_date && (
                        <div className="bg-slate-100 px-2 py-0.5 rounded text-[10px]">
                            {new Date(appliance.purchase_date).getFullYear()}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ClientManager;
