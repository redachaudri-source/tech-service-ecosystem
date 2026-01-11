import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useToast } from '../components/ToastProvider';
import { Search, Plus, Trash2, FileText, CheckCircle, Clock, AlertCircle, Eye, AlertTriangle, Phone, Star } from 'lucide-react';
import CreateTicketModal from '../components/CreateTicketModal';
import SmartAssignmentModal from '../components/SmartAssignmentModal'; // Import
import ServiceDetailsModal from '../components/ServiceDetailsModal'; // Import Details Modal
import BudgetManagerModal from '../components/BudgetManagerModal'; // Import Budget Modal
import { useAuth } from '../context/AuthContext';
import { useLocation } from 'react-router-dom';

const ServiceMonitor = () => {
    const { user } = useAuth();
    const location = useLocation();
    const [tickets, setTickets] = useState([]);
    const [techs, setTechs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isConnected, setIsConnected] = useState(false);
    const [showCreateModal, setShowCreateModal] = useState(false);

    // Assignment State
    const [selectedTicketForAssign, setSelectedTicketForAssign] = useState(null); // New
    const [selectedTicketForDetails, setSelectedTicketForDetails] = useState(null); // New Details Modal
    const [selectedTicketForBudget, setSelectedTicketForBudget] = useState(null); // New Budget Modal

    const [filterDate, setFilterDate] = useState('');
    const [filterTime, setFilterTime] = useState('');
    const [filterTech, setFilterTech] = useState('');
    const [filterOrigin, setFilterOrigin] = useState(''); // New Origin Filter
    const [filterCreator, setFilterCreator] = useState('');
    const [searchTerm, setSearchTerm] = useState('');

    // Delete State
    const [deleteId, setDeleteId] = useState(null);
    const [showDeleteModal, setShowDeleteModal] = useState(false);

    // ... useEffect and fetch logic (Keep same) ...
    // Note: Copied only essential parts for fetch to avoid massive diff, assume fetch is preserved if I don't touch it. 
    // Wait, replace_file_content needs me to be careful. I will replace the whole component structure or targeted blocks.

    useEffect(() => {
        if (location.state?.openCreate) {
            setShowCreateModal(true);
            // Clear state history to prevent reopening on reload (optional but good practice)
            window.history.replaceState({}, document.title);
        }
    }, [location]);

    useEffect(() => {
        let channel = null;

        const initRealtime = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) return;

            fetchData();

            if (channel) supabase.removeChannel(channel);

            channel = supabase.channel('tickets_monitor_global_v2')
                .on('postgres_changes', { event: '*', schema: 'public', table: 'tickets' }, (payload) => {
                    console.log('Admin: Realtime Update Received', payload);
                    fetchData();
                    if (payload.eventType === 'INSERT') {
                        addToast('Nuevo Ticket Recibido', 'info', true);
                    } else if (payload.eventType === 'UPDATE') {
                        // Optional: simpler toast for updates
                        // addToast('Ticket Actualizado', 'default', false);
                    }
                })
                .subscribe((status) => setIsConnected(status === 'SUBSCRIBED'));
        };

        const { data: { subscription } = {} } = supabase.auth.onAuthStateChange((event, session) => {
            if (session) initRealtime();
        });

        initRealtime();

        return () => {
            if (channel) supabase.removeChannel(channel);
            if (subscription) subscription.unsubscribe();
        };
    }, []);

    const [admins, setAdmins] = useState([]);

    const fetchData = async () => {
        try {
            // 1. Tickets (Try complex join first)
            const { data: ticketData, error } = await supabase
                .from('tickets')
                .select('*, profiles:client_id(full_name, address, phone), creator:created_by(full_name), reviews(rating)')
                .order('created_at', { ascending: false });

            if (error) throw error;
            if (ticketData) setTickets(ticketData);

        } catch (err) {
            console.warn("Complex fetch failed (likely missing created_by), falling back to simple fetch:", err);
            // Fallback: Simple fetch without creator join
            // Fallback: Simple fetch without creator join but keeping reviews
            const { data: ticketData } = await supabase
                .from('tickets')
                .select('*, profiles:client_id(full_name, address, phone), reviews(rating)')
                .order('created_at', { ascending: false });

            if (ticketData) setTickets(ticketData || []);
        }

        try {
            // 2. Techs
            const { data: techData } = await supabase
                .from('profiles')
                .select('*')
                .eq('role', 'tech')
                .order('full_name');
            if (techData) setTechs(techData);

            // 3. Admins
            const { data: adminData } = await supabase
                .from('profiles')
                .select('*')
                .in('role', ['admin', 'super_admin'])
                .order('full_name');
            if (adminData) setAdmins(adminData);

        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const confirmDelete = (id) => {
        setDeleteId(id);
        setShowDeleteModal(true);
    };

    const handleDelete = async () => {
        if (!deleteId) return;
        const { error } = await supabase.from('tickets').delete().eq('id', deleteId);
        if (error) alert('Error al eliminar: ' + error.message);
        else {
            setShowDeleteModal(false);
            setDeleteId(null);
            fetchData();
        }
    };

    if (loading) return <div className="text-center p-10">Cargando...</div>;

    return (
    return (
        <div className="flex flex-col h-[calc(100vh-64px)] overflow-hidden bg-slate-50/50">
            {/* --- STICKY HEADER & CONTROLS --- */}
            <div className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-slate-200/60 shadow-sm shrink-0">
                <div className="p-4 flex flex-col gap-4">

                    {/* Top Row: Title & Create Action */}
                    <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                        <div className="flex items-center gap-3">
                            <h1 className="text-2xl font-bold text-slate-800 tracking-tight flex items-center gap-2">
                                Monitor de Servicios
                                {isConnected && (
                                    <span className="flex items-center gap-1.5 text-[9px] font-bold bg-emerald-50 text-emerald-600 px-2.5 py-1 rounded-full border border-emerald-100/50 shadow-sm animate-pulse">
                                        <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></span> EN VIVO
                                    </span>
                                )}
                            </h1>
                        </div>
                        <button onClick={() => setShowCreateModal(true)} className="flex items-center gap-2 bg-slate-900 text-white px-5 py-2.5 rounded-lg hover:bg-black transition shadow-lg shadow-slate-900/10 font-medium text-sm w-full md:w-auto justify-center active:scale-95 group">
                            <Plus size={16} className="text-slate-400 group-hover:text-white transition-colors" /> Nuevo Servicio
                        </button>
                    </div>

                    {/* Bottom Row: Omni-Search & Filters */}
                    <div className="flex flex-col md:flex-row gap-3 items-center justify-between">
                        {/* Omni-Search Input */}
                        <div className="relative w-full md:w-96 group">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <Search className="text-slate-400 group-focus-within:text-indigo-500 transition-colors" size={16} />
                            </div>
                            <input
                                type="text"
                                placeholder="Buscar: Cliente, Tlf, Dirección, Marca, ID..."
                                className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white transition-all shadow-sm placeholder:text-slate-400"
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>

                        {/* Filters */}
                        <div className="flex flex-wrap gap-2 w-full md:w-auto justify-end overflow-x-auto pb-1 md:pb-0 hide-scrollbar">
                            <input type="date" className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 outline-none text-slate-600 text-sm shadow-sm focus:border-indigo-400 hover:border-slate-300 transition-colors" onChange={(e) => setFilterDate(e.target.value)} />

                            <select className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg outline-none text-slate-600 text-sm shadow-sm focus:border-indigo-400 hover:border-slate-300 transition-colors" value={filterOrigin} onChange={(e) => setFilterOrigin(e.target.value)}>
                                <option value="">Todos los Orígenes</option>
                                <option value="direct">Oficina</option>
                                <option value="client_web">Web Cliente</option>
                                <option value="tech_app">App Técnico</option>
                                <option value="budget">Presupuesto</option>
                            </select>

                            <select className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg outline-none text-slate-600 text-sm shadow-sm focus:border-indigo-400 hover:border-slate-300 transition-colors max-w-[160px]" value={filterTech} onChange={(e) => setFilterTech(e.target.value)}>
                                <option value="">Todos los Técnicos</option>
                                {techs.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}
                            </select>
                        </div>
                    </div>
                </div>
            </div>

            {showCreateModal && (
                <CreateTicketModal
                    onClose={() => setShowCreateModal(false)}
                    onSuccess={(newTicket, shouldOpenSmart) => {
                        fetchData();
                        setShowCreateModal(false);
                        if (shouldOpenSmart && newTicket) {
                            // Opens the Smart Assignment Modal instantly
                            setTimeout(() => {
                                setSelectedTicketForAssign(newTicket);
                            }, 100); // Small delay to allow modal transition
                        } else if (newTicket) {
                            addToast(`Ticket #${newTicket.ticket_number} creado correctamente.`, 'success', true);
                        }
                    }}
                />
            )}

            {/* --- MAIN CONTENT: TABLE --- */}
            <div className="flex-1 overflow-auto p-4 content-start">
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden relative">
                    {loading ? (
                        <div className="p-12 text-center text-slate-400 flex flex-col items-center gap-3">
                            <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                            <p className="text-xs font-mono uppercase tracking-widest animate-pulse">Cargando Datos...</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead className="bg-slate-50/50 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-wider sticky top-0 z-10 backdrop-blur-sm">
                                    <tr>
                                        <th className="px-4 py-3 sticky left-0 bg-slate-50 z-20 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)] text-center w-20">ID</th>
                                        <th className="px-4 py-3">Cliente / Dirección</th>
                                        <th className="px-4 py-3">Equipo / Avería</th>
                                        <th className="px-4 py-3 text-center">Estado</th>
                                        <th className="px-4 py-3 text-center">Técnico</th>
                                        <th className="px-4 py-3 text-center">Origen</th>
                                        <th className="px-4 py-3 text-right">Acciones</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
                                    {tickets.filter(t => {
                                        const s = searchTerm.toLowerCase();
                                        const brand = (t.appliance_info?.brand || '').toLowerCase();
                                        const type = (t.appliance_info?.type || '').toLowerCase();
                                        const clientName = (t.profiles?.full_name || '').toLowerCase();
                                        const clientPhone = (t.profiles?.phone || '').toLowerCase();
                                        const clientAddr = (t.profiles?.address || '').toLowerCase();
                                        const ticketId = (t.ticket_number?.toString() || '');

                                        // OMNI-SEARCH LOGIC
                                        const matchesSearch = !searchTerm || (
                                            ticketId.includes(s) ||
                                            clientName.includes(s) ||
                                            clientPhone.includes(s) ||
                                            clientAddr.includes(s) ||
                                            brand.includes(s) ||
                                            type.includes(s)
                                        );

                                        const matchesTech = !filterTech || t.technician_id === filterTech;
                                        const matchesDate = !filterDate ||
                                            (t.scheduled_at && t.scheduled_at.startsWith(filterDate)) ||
                                            (!t.scheduled_at && t.created_at && t.created_at.startsWith(filterDate));

                                        const matchesOrigin = !filterOrigin || (
                                            filterOrigin === 'budget' ? (t.origin_source?.includes('budget') || t.origin_source?.startsWith('Presupuesto')) :
                                                filterOrigin === 'tech_app' ? (t.origin_source?.includes('tech')) :
                                                    filterOrigin === 'client_web' ? (t.origin_source?.includes('client_web') || t.origin_source?.includes('web')) :
                                                        (t.origin_source === filterOrigin || (!t.origin_source && filterOrigin === 'direct'))
                                        );

                                        return matchesSearch && matchesTech && matchesDate && matchesOrigin;
                                    }).map(ticket => (
                                        <tr key={ticket.id} className="hover:bg-slate-50/80 transition-colors group">
                                            {/* ID (Sticky) */}
                                            <td className="px-4 py-3 font-mono text-xs font-bold text-slate-500 sticky left-0 bg-white group-hover:bg-slate-50 transition-colors border-r border-slate-100 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)] text-center">
                                                #{ticket.ticket_number}
                                                <div className="mt-1 text-[10px] text-slate-400 font-sans font-normal opacity-70">
                                                    {new Date(ticket.created_at).toLocaleDateString()}
                                                </div>
                                            </td>

                                            {/* Client */}
                                            <td className="px-4 py-3 max-w-[220px]">
                                                <div className="font-bold text-slate-800 truncate mb-0.5">{ticket.profiles?.full_name || 'Sin nombre'}</div>
                                                <div className="text-xs text-slate-500 truncate flex items-center gap-1 group-hover:text-indigo-500 transition-colors">
                                                    <span className="text-[10px]">📍</span> {ticket.profiles?.address || 'Sin dirección'}
                                                </div>
                                                {ticket.profiles?.phone && (
                                                    <div className="text-[10px] bg-slate-100 inline-block px-1.5 py-0.5 rounded text-slate-500 font-mono mt-1">{ticket.profiles.phone}</div>
                                                )}
                                            </td>

                                            {/* Appliance */}
                                            <td className="px-4 py-3 max-w-[200px]">
                                                <div className="font-medium text-slate-700 truncate">
                                                    {ticket.appliance_info?.type} <span className="text-slate-400 mx-1">|</span> {ticket.appliance_info?.brand}
                                                </div>
                                                <div className="text-xs text-slate-500 italic mt-0.5 truncate max-w-full opacity-80" title={ticket.description_failure}>
                                                    "{ticket.description_failure || 'Sin descripción'}"
                                                </div>
                                            </td>

                                            {/* Status Badge */}
                                            <td className="px-4 py-3 text-center">
                                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wide border
                                                    ${ticket.status === 'solicitado' ? 'bg-yellow-50 text-yellow-700 border-yellow-200' :
                                                        ticket.status === 'asignado' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                                                            ticket.status === 'presupuesto_pendiente' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                                                ticket.status === 'presupuesto_aceptado' ? 'bg-green-50 text-green-700 border-green-200' :
                                                                    ticket.status === 'en_reparacion' ? 'bg-purple-50 text-purple-700 border-purple-200' :
                                                                        ticket.status === 'finalizado' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                                                                            'bg-gray-50 text-gray-600 border-gray-200'
                                                    }`}>
                                                    {ticket.status.replace('_', ' ')}
                                                </span>
                                            </td>

                                            {/* Technician */}
                                            <td className="px-4 py-3 text-center">
                                                {ticket.technician_id ? (
                                                    techs.find(t => t.id === ticket.technician_id)?.full_name ? (
                                                        <div className="text-xs font-semibold text-slate-700 bg-slate-100 px-2 py-1 rounded-md inline-block">
                                                            {techs.find(t => t.id === ticket.technician_id).full_name.split(' ')[0]}
                                                        </div>
                                                    ) : <span className="text-xs text-slate-400 font-mono">ID:{ticket.technician_id.slice(0, 4)}</span>
                                                ) : (
                                                    <span className="text-xs text-slate-400 italic">--</span>
                                                )}
                                                {ticket.scheduled_at && (
                                                    <div className="text-[10px] text-indigo-500 font-bold mt-1 flex items-center justify-center gap-1">
                                                        <Clock size={10} /> {new Date(ticket.scheduled_at).toLocaleDateString()}
                                                    </div>
                                                )}
                                            </td>

                                            {/* Origin */}
                                            <td className="px-4 py-3 text-center">
                                                <div className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase inline-block border ${ticket.origin_source === 'client_web' ? 'bg-indigo-50 text-indigo-600 border-indigo-100' :
                                                    ticket.origin_source === 'tech_app' ? 'bg-cyan-50 text-cyan-600 border-cyan-100' :
                                                        'bg-white text-slate-500 border-slate-200'
                                                    }`}>
                                                    {ticket.origin_source === 'client_web' ? 'WEB' :
                                                        ticket.origin_source === 'tech_app' ? 'APP' :
                                                            'OFFICE'}
                                                </div>
                                            </td>

                                            {/* Actions */}
                                            <td className="px-4 py-3 text-right">
                                                <div className="flex items-center justify-end gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                                                    <button onClick={() => setSelectedTicketForDetails(ticket)} className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-all" title="Ver Ficha">
                                                        <Eye size={16} />
                                                    </button>

                                                    {/* Budget Action */}
                                                    <button onClick={() => setSelectedTicketForBudget(ticket)} className={`p-1.5 rounded transition-all ${ticket.status.includes('presupuesto') ? 'text-amber-500 bg-amber-50 hover:bg-amber-100' : 'text-slate-400 hover:text-amber-600 hover:bg-amber-50'}`} title="Presupuesto">
                                                        <FileText size={16} />
                                                    </button>

                                                    {/* Assign Action */}
                                                    <button onClick={() => setSelectedTicketForAssign(ticket)} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-all" title="Reasignar">
                                                        <AlertTriangle size={16} />
                                                    </button>

                                                    {/* Reviews Star */}
                                                    {ticket.reviews && ticket.reviews.length > 0 && (
                                                        <div className="p-1.5 text-yellow-500">
                                                            <Star size={14} fill="currentColor" />
                                                        </div>
                                                    )}

                                                    <button onClick={() => confirmDelete(ticket.id)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-all" title="Eliminar">
                                                        <Trash2 size={16} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                    {tickets.length === 0 && (
                                        <tr>
                                            <td colSpan="7" className="p-12 text-center text-slate-400 italic">No se encontraron servicios.</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>


            {/* MODALS */}
            {
                showCreateModal && (
                    <CreateTicketModal
                        onClose={() => setShowCreateModal(false)}
                        onSuccess={(newTicket, shouldOpenSmart) => {
                            fetchData();
                            setShowCreateModal(false);
                            if (shouldOpenSmart && newTicket) {
                                setTimeout(() => { setSelectedTicketForAssign(newTicket); }, 100);
                            } else if (newTicket) {
                                addToast(`Ticket #${newTicket.ticket_number} creado correctamente.`, 'success', true);
                            }
                        }}
                    />
                )
            }

            {
                showDeleteModal && (
                    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                        <div className="bg-white rounded-lg p-6 max-w-sm w-full shadow-xl">
                            <h3 className="text-lg font-bold text-slate-900 mb-2">¿Eliminar Servicio?</h3>
                            <p className="text-sm text-slate-600 mb-6">Esta acción no se puede deshacer. El ticket será eliminado permanentemente.</p>
                            <div className="flex justify-end gap-3">
                                <button onClick={() => setShowDeleteModal(false)} className="px-4 py-2 text-slate-600 font-bold hover:bg-slate-100 rounded">Cancelar</button>
                                <button onClick={handleDelete} className="px-4 py-2 bg-red-600 text-white font-bold rounded hover:bg-red-700">Eliminar</button>
                            </div>
                        </div>
                    </div>
                )
            }

            {
                selectedTicketForAssign && (
                    <SmartAssignmentModal
                        isOpen={!!selectedTicketForAssign}
                        onClose={() => { setSelectedTicketForAssign(null); fetchData(); }}
                        ticket={selectedTicketForAssign}
                        onAssignSuccess={() => { setSelectedTicketForAssign(null); fetchData(); }}
                    />
                )
            }

            {
                selectedTicketForDetails && (
                    <ServiceDetailsModal
                        ticket={selectedTicketForDetails}
                        onClose={() => setSelectedTicketForDetails(null)}
                    />
                )
            }

            {
                selectedTicketForBudget && (
                    <BudgetManagerModal
                        isOpen={!!selectedTicketForBudget}
                        onClose={() => setSelectedTicketForBudget(null)}
                        ticket={selectedTicketForBudget}
                        onUpdate={() => fetchData()}
                    />
                )
            }
        </div >
    );
};

export default ServiceMonitor;
