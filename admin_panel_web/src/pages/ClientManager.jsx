import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { Plus, User, MapPin, Trash2, Edit2, X, Phone, Mail, History, Filter, Search as SearchIcon, Lock, Unlock, Package, Zap, Waves, Wind, Refrigerator, Flame, Thermometer, Tv, Smartphone, Disc, TrendingUp, AlertTriangle, CheckCircle, Clock, Star, ShieldAlert } from 'lucide-react';
import { format } from 'date-fns';

const ClientManager = () => {
    const [clients, setClients] = useState([]);
    const [loading, setLoading] = useState(true);

    // UI State
    const [showModal, setShowModal] = useState(false);
    const [showBlockModal, setShowBlockModal] = useState(false);
    const [blockActionData, setBlockActionData] = useState(null);

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
    const [city, setCity] = useState('Málaga');
    const [province] = useState('Málaga');
    const [postalCode, setPostalCode] = useState('');
    const [notes, setNotes] = useState('');
    const [isLookingUpCP, setIsLookingUpCP] = useState(false);

    // Search & Filter State
    const [searchTerm, setSearchTerm] = useState('');
    const [cityFilter, setCityFilter] = useState('Todas');
    const [sourceFilter, setSourceFilter] = useState('Todos');
    const [sortBy, setSortBy] = useState('newest'); // newest, fidelity, az

    // History/Details State
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

    // CP Lookup
    const lookupPostalCode = async (addr, cit, prov) => {
        if (!addr || !cit) return;
        setIsLookingUpCP(true);
        try {
            const query = `${addr}, ${cit}, ${prov}, Spain`;
            const resp = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1&addressdetails=1`);
            const data = await resp.json();
            if (data?.[0]?.address?.postcode) {
                setPostalCode(data[0].address.postcode);
            }
        } catch (error) {
            console.error("CP Lookup failed", error);
        } finally {
            setIsLookingUpCP(false);
        }
    };

    useEffect(() => {
        const timer = setTimeout(() => {
            if (address.length > 5 && city.length > 2) lookupPostalCode(address, city, province);
        }, 1500);
        return () => clearTimeout(timer);
    }, [address, city, province]);

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

            // Fetch Extra Metrics (Tickets Count + Reviews Count)
            // Parallel fetch for review counts? Or just fetch all reviews? 
            // Better: fetch all reviews group by client_id, but RPC is ideal. 
            // For now, client-side aggregation is acceptable for < 1000 clients. 
            // Or simplified: Just 0 for now if table join RLS is tricky, but we try.

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

    const handleDelete = async (clientId) => {
        if (!confirm('¿Eliminar definitivamente? Esta acción es irreversible.')) return;
        setLoading(true);
        // Cascade deletion logic here or handled by DB constraints
        const { error } = await supabase.from('profiles').delete().eq('id', clientId);
        if (error) alert('Error: ' + error.message);
        else await fetchClients();
        setLoading(false);
    };

    const handleEdit = (client) => {
        setId(client.id);
        setFullName(client.full_name); setEmail(client.email); setPhone(client.phone); setPhone2(client.phone_2);
        setAddress(client.address); setFloor(client.floor); setApartment(client.apartment);
        setCity(client.city || 'Málaga'); setPostalCode(client.postal_code); setNotes(client.notes);
        setSelectedClient(client);
        setShowModal(true);
    };

    const handleClose = () => {
        setShowModal(false); setId(null); setFullName(''); setEmail(''); setPhone(''); setPhone2('');
        setAddress(''); setFloor(''); setApartment(''); setCity('Málaga'); setPostalCode(''); setNotes('');
    };

    const handleViewAppliances = async (client) => {
        setSelectedClient(client);
        setShowAppliances(true);
        // Correct query based on verification
        const { data } = await supabase
            .from('client_appliances')
            .select(`*, tickets (*)`) // tickets for metrics
            .eq('client_id', client.id)
            .order('created_at', { ascending: false });

        // Process metrics
        const processed = (data || []).map(app => {
            const tickets = app.tickets || [];
            const repairCount = tickets.filter(t => ['finalizado', 'pagado'].includes(t.status)).length;
            const totalSpent = tickets
                .filter(t => ['finalizado', 'pagado'].includes(t.status))
                .reduce((sum, t) => sum + (t.total || 0), 0);
            return { ...app, repairCount, totalSpent, tickets };
        });
        setClientAppliances(processed);
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
        } else {
            // Newest (Default) - assuming fetched order is by created_at desc
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
                                <th className="px-4 py-3 text-center">Estado</th>
                                <th className="px-4 py-3 text-right">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-sm">
                            {filteredClients.map(client => (
                                <tr key={client.id} className={`hover:bg-slate-50 transition group ${!client.is_active ? 'bg-red-50/50' : ''}`}>
                                    <td className="px-4 py-2">
                                        <div className="flex items-center gap-3">
                                            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs shrink-0 
                                                ${client.created_via === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                                                {client.full_name.charAt(0)}
                                            </div>
                                            <div>
                                                <div className="font-bold text-slate-800 leading-tight">{client.full_name}</div>
                                                <div className="text-[10px] text-slate-400 font-mono">ID: ...{client.id.slice(-4)}</div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-4 py-2">
                                        <div className="flex flex-col gap-0.5">
                                            <div className="flex items-center gap-1.5 text-slate-600">
                                                <Phone size={12} className="text-slate-400" />
                                                <span className="font-mono text-xs">{client.phone}</span>
                                            </div>
                                            <div className="flex items-center gap-1.5 text-slate-500 text-xs">
                                                <MapPin size={12} className="text-slate-400" />
                                                <span className="truncate max-w-[200px]" title={client.address}>{client.address} {client.city ? `(${client.city})` : ''}</span>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-4 py-2 text-center">
                                        <div className="flex justify-center gap-3">
                                            <div className="flex flex-col items-center" title="Tickets Solicitados">
                                                <div className="flex items-center gap-1 text-slate-700 font-bold">
                                                    <package size={14} className="text-blue-500" /> {client.ticketCount}
                                                </div>
                                                <span className="text-[9px] text-slate-400 uppercase">Servicios</span>
                                            </div>
                                            {client.reviewCount > 0 && (
                                                <div className="flex flex-col items-center" title="Reseñas Dejadas">
                                                    <div className="flex items-center gap-1 text-amber-600 font-bold">
                                                        <Star size={14} fill="currentColor" /> {client.reviewCount}
                                                    </div>
                                                    <span className="text-[9px] text-slate-400 uppercase">Reseñas</span>
                                                </div>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-4 py-2 text-center">
                                        <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold border 
                                            ${client.is_active
                                                ? 'bg-green-50 text-green-700 border-green-100'
                                                : 'bg-red-50 text-red-700 border-red-100'}`}>
                                            {client.is_active ? 'Activo' : 'Bloqueado'}
                                        </span>
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
                                            {client.created_via === 'app' ? (
                                                <button
                                                    onClick={() => { setBlockActionData({ client, action: client.is_active ? 'bloquear' : 'desbloquear' }); setShowBlockModal(true); }}
                                                    className={`p-1.5 rounded ${client.is_active ? 'text-slate-400 hover:text-red-600' : 'text-red-600 bg-red-100'}`}
                                                    title="Bloquear/Desbloquear"
                                                >
                                                    {client.is_active ? <Lock size={16} /> : <Unlock size={16} />}
                                                </button>
                                            ) : (
                                                <button onClick={() => handleDelete(client.id)} className="p-1.5 text-slate-300 hover:text-red-600 rounded" title="Eliminar">
                                                    <Trash2 size={16} />
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                {/* Mobile Card View Fallback (Hidden on md+) - Optional based on complexity, keeping table with scrolling for now but responsive table container handles it well enough for "compact" view */}
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
                            {/* ... Form Inputs Same as Before but Compact ... */}
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
                            <div>
                                <label className="text-xs font-bold text-slate-500 uppercase">Dirección</label>
                                <input required value={address} onChange={e => setAddress(e.target.value)} className="w-full p-2 border rounded-lg text-sm" />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-xs font-bold text-slate-500 uppercase">Ciudad</label>
                                    <select value={city} onChange={e => setCity(e.target.value)} className="w-full p-2 border rounded-lg text-sm">
                                        {cities.map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-slate-500 uppercase">C.P. {isLookingUpCP && '...'}</label>
                                    <input value={postalCode} onChange={e => setPostalCode(e.target.value)} className="w-full p-2 border rounded-lg text-sm" />
                                </div>
                            </div>
                            <button className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-bold hover:bg-blue-700">Guardar</button>
                        </form>
                    </div>
                </div>
            )}

            {/* Appliances Modal Reuse Logic */}
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
                            {clientAppliances.length === 0 ? (
                                <div className="p-8 text-center text-slate-400 border-2 border-dashed rounded-xl">Este cliente no tiene equipos registrados.</div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {clientAppliances.map(app => (
                                        <div key={app.id} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex gap-4">
                                            {/* Simplified Appliance Card for Admin */}
                                            <div className="w-10 h-10 bg-purple-50 rounded flex items-center justify-center text-purple-600 font-bold shrink-0">{app.type?.[0]}</div>
                                            <div>
                                                <h4 className="font-bold text-slate-800 text-sm">{app.brand} {app.model}</h4>
                                                <p className="text-xs text-slate-500">{app.type}</p>
                                                <div className="text-[10px] bg-slate-100 px-1.5 py-0.5 rounded inline-block mt-1">Gastado: {app.totalSpent}€</div>
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

        </div>
    );
};

export default ClientManager;
