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
    const [sortOrder, setSortOrder] = useState('desc'); // Sorting state

    // Delete State
    const [deleteId, setDeleteId] = useState(null);
    const [showDeleteModal, setShowDeleteModal] = useState(false);

    const { addToast } = useToast();

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
        <div className="flex flex-col h-[calc(100vh-64px)] overflow-hidden bg-slate-50/50">
            {/* STICKY HEADER SECTION (RESTORED & ENHANCED) */}
            <div className="sticky top-0 z-40 bg-white/95 backdrop-blur-sm border-b border-slate-200 shadow-sm shrink-0 px-4 py-3 md:px-6 md:py-4 space-y-4">
                {/* Header Title & Button */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-3">
                        Monitor de Servicios
                        {isConnected && (
                            <span className="flex items-center gap-1 text-[10px] bg-green-100 text-green-600 px-2 py-0.5 rounded-full border border-green-200 animate-pulse">
                                <span className="w-1.5 h-1.5 bg-green-500 rounded-full"></span>
                                EN VIVO
                            </span>
                        )}
                    </h1>
                    <button onClick={() => setShowCreateModal(true)} className="flex items-center gap-2 bg-slate-900 text-white px-6 py-2 rounded-lg hover:bg-slate-800 transition shadow-lg shadow-slate-900/10 font-medium text-sm w-full md:w-auto justify-center">
                        <Plus size={18} /> Nuevo Servicio
                    </button>
                </div>

                {/* Filters & Search - SAME FUNCTIONALITY, RESTORED LAYOUT */}
                <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
                    <div className="relative w-full md:w-1/3">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                        <input
                            type="text"
                            placeholder="Buscar: Cliente, Tlf, Dirección, Marca, ID..."
                            className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50 text-sm"
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <div className="flex flex-wrap gap-2 w-full md:w-auto justify-end">
                        {/* Sort Button */}
                        <button
                            onClick={() => setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc')}
                            className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-slate-600 text-xs hover:bg-slate-50 transition-colors"
                            title={sortOrder === 'desc' ? "Más recientes primero" : "Más antiguos primero"}
                        >
                            <Clock size={14} />
                            {sortOrder === 'desc' ? 'Recientes' : 'Antiguos'}
                        </button>

                        <input type="date" className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 outline-none text-slate-600 text-xs" onChange={(e) => setFilterDate(e.target.value)} />

                        <select className="px-3 py-1.5 border border-slate-200 rounded-lg outline-none text-[10px] bg-white !hidden xl:block" value={filterOrigin} onChange={(e) => setFilterOrigin(e.target.value)}>
                            <option value="">Todos los Orígenes</option>
                            <option value="direct">Oficina</option>
                            <option value="client_web">Web Cliente</option>
                            <option value="tech_app">App Técnico</option>
                            <option value="budget">Presupuesto</option>
                        </select>

                        <select className="px-3 py-1.5 border border-slate-200 rounded-lg outline-none text-[10px] bg-white !hidden xl:block" value={filterTech} onChange={(e) => setFilterTech(e.target.value)}>
                            <option value="">Todos los Técnicos</option>
                            {techs.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}
                        </select>
                    </div>
                </div>
            </div>

            {/* MAIN TABLE CONTENT - RESTORED ORIGINAL COLUMNS & LAYOUT */}
            <div className="flex-1 overflow-hidden flex flex-col">
                <div className="bg-white flex flex-col h-full overflow-hidden">
                    {loading ? (
                        <div className="p-10 text-center text-slate-400">Cargando...</div>
                    ) : (
                        <div className="flex-1 overflow-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']">
                            <table className="w-full text-left">
                                <thead className="text-[10px] uppercase text-slate-500 font-semibold">
                                    <tr>
                                        <th className="px-3 py-2 md:px-4 md:py-3 min-w-[100px] sticky top-0 z-30 bg-slate-50 border-b border-slate-200 shadow-sm">ID / Cita</th>
                                        <th className="px-3 py-2 md:px-4 md:py-3 min-w-[180px] sticky top-0 z-30 bg-slate-50 border-b border-slate-200 shadow-sm">Cliente</th>
                                        <th className="px-3 py-2 md:px-4 md:py-3 text-center hidden sm:table-cell sticky top-0 z-30 bg-slate-50 border-b border-slate-200 shadow-sm">Origen</th>
                                        <th className="px-3 py-2 md:px-4 md:py-3 min-w-[150px] sticky top-0 z-30 bg-slate-50 border-b border-slate-200 shadow-sm">Equipo</th>
                                        <th className="px-3 py-2 md:px-4 md:py-3 text-center sticky top-0 z-30 bg-slate-50 border-b border-slate-200 shadow-sm">Estado</th>
                                        <th className="px-3 py-2 md:px-4 md:py-3 text-center hidden sm:table-cell sticky top-0 z-30 bg-slate-50 border-b border-slate-200 shadow-sm">Doc</th>
                                        <th className="px-3 py-2 md:px-4 md:py-3 min-w-[140px] sticky top-0 z-30 bg-slate-50 border-b border-slate-200 shadow-sm">Asignación</th>
                                        <th className="px-3 py-2 md:px-4 md:py-3 text-right sticky top-0 z-30 bg-slate-50 border-b border-slate-200 shadow-sm">Acciones</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 text-[10px]"> {/* Ultra small font */}
                                    {tickets.filter(t => {
                                        const s = searchTerm.toLowerCase();
                                        const brand = (t.appliance_info?.brand || '').toLowerCase();
                                        const type = (t.appliance_info?.type || '').toLowerCase();
                                        const clientName = (t.profiles?.full_name || '').toLowerCase();
                                        const clientPhone = (t.profiles?.phone || '').toLowerCase();
                                        const clientAddr = (t.profiles?.address || '').toLowerCase();
                                        const ticketId = (t.ticket_number?.toString() || '');

                                        // OMNI-SEARCH LOGIC (PRESERVED)
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
                                    }).sort((a, b) => {
                                        const dateA = new Date(a.created_at).getTime();
                                        const dateB = new Date(b.created_at).getTime();
                                        return sortOrder === 'asc' ? dateA - dateB : dateB - dateA;
                                    }).map(ticket => (
                                        <tr key={ticket.id} className="hover:bg-slate-50 transition-colors">
                                            {/* ID / Cita (Enhanced based on screenshot) */}
                                            <td className="px-3 py-2 md:px-4 md:py-3 sticky left-0 bg-white group-hover:bg-slate-50 transition-colors border-r border-slate-100 shadow-[4px_0_8px_-2px_rgba(0,0,0,0.1)] align-top min-w-[120px] md:min-w-[140px]">
                                                <div className="font-mono font-bold text-lg text-slate-800 tracking-tight">#{ticket.ticket_number}</div>

                                                {ticket.scheduled_at ? (
                                                    <div className="mt-2 space-y-1.5 leading-none">
                                                        {/* Date Box */}
                                                        <div className="bg-slate-100 rounded-md p-1.5 border border-slate-200 text-slate-600 flex items-start gap-1.5">
                                                            <Clock size={12} className="mt-0.5 text-slate-400" />
                                                            <div className="flex flex-col">
                                                                <span className="text-[10px] font-semibold">
                                                                    {new Date(ticket.scheduled_at).toLocaleDateString()}
                                                                </span>
                                                                <span className="text-[9px] font-mono text-slate-500 whitespace-nowrap">
                                                                    {(() => {
                                                                        const start = new Date(ticket.scheduled_at);
                                                                        const end = new Date(start.getTime() + (ticket.estimated_duration || 60) * 60000);
                                                                        const startStr = start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                                                                        const endStr = end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                                                                        return `${startStr} - ${endStr}`;
                                                                    })()}
                                                                </span>
                                                            </div>
                                                        </div>

                                                        {/* Confirmation Badge */}
                                                        {ticket.technician_id ? (
                                                            <div className="flex items-center justify-center gap-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded px-1.5 py-1 text-[10px] font-black uppercase tracking-wide">
                                                                <CheckCircle size={10} />
                                                                CONFIRMADA
                                                            </div>
                                                        ) : (
                                                            <div className="flex items-center justify-center gap-1 bg-amber-50 text-amber-700 border border-amber-200 rounded px-1.5 py-1 text-[10px] font-black uppercase tracking-wide">
                                                                <Clock size={10} />
                                                                PENDIENTE
                                                            </div>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <div className="mt-2 text-[10px] text-slate-400 italic">Sin cita</div>
                                                )}
                                            </td>

                                            {/* Cliente */}
                                            <td className="px-3 py-2 md:px-4 md:py-3 max-w-[220px] align-top">
                                                <div className="font-bold text-slate-800 text-xs mb-1">{ticket.profiles?.full_name || 'Sin nombre'}</div>

                                                {ticket.profiles?.phone ? (
                                                    <a href={`tel:${ticket.profiles.phone}`} className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-800 hover:underline transition-colors mb-1.5 w-fit">
                                                        <Phone size={12} />
                                                        {ticket.profiles.phone}
                                                    </a>
                                                ) : <div className="text-[10px] text-slate-400 italic mb-1">Sin teléfono</div>}

                                                <div className="text-xs text-slate-500 flex items-start gap-1 leading-snug">
                                                    <span className="text-[10px] mt-0.5">📍</span>
                                                    <span className="line-clamp-2">{ticket.profiles?.address || 'Sin dirección'}</span>
                                                </div>
                                            </td>

                                            {/* Origen (Restored Column) */}
                                            <td className="px-3 py-2 md:px-4 md:py-3 text-center align-top hidden sm:table-cell">
                                                <div className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded border inline-block ${ticket.origin_source === 'client_web' ? 'bg-indigo-50 text-indigo-600 border-indigo-100' :
                                                    ticket.origin_source === 'tech_app' ? 'bg-cyan-50 text-cyan-600 border-cyan-100' :
                                                        'bg-white text-slate-500 border-slate-200'
                                                    }`}>
                                                    {ticket.origin_source === 'client_web' ? 'WEB' : ticket.origin_source === 'tech_app' ? 'APP' : 'OFICINA'}
                                                </div>
                                            </td>

                                            {/* Equipo */}
                                            <td className="px-3 py-2 md:px-4 md:py-3 max-w-[200px] align-top">
                                                <div className="font-medium text-slate-700">
                                                    {ticket.appliance_info?.type} <span className="text-slate-400">|</span> {ticket.appliance_info?.brand}
                                                </div>
                                                <div className="text-xs text-slate-500 italic mt-0.5 line-clamp-2 max-w-[200px]" title={ticket.description_failure}>
                                                    "{ticket.description_failure}"
                                                </div>
                                            </td>

                                            {/* Estado */}
                                            <td className="px-3 py-2 md:px-4 md:py-3 text-center align-top">
                                                <StatusBadge status={ticket.status} />
                                            </td>

                                            {/* Doc (Restored Column) */}
                                            <td className="px-3 py-2 md:px-4 md:py-3 text-center align-top hidden sm:table-cell">
                                                <div className="flex justify-center gap-1">
                                                    {ticket.quote_pdf_url ? (
                                                        <a href={ticket.quote_pdf_url} target="_blank" className="p-1 text-amber-600 hover:bg-amber-50 rounded" title="Presupuesto">
                                                            <FileText size={14} />
                                                        </a>
                                                    ) : <span className="text-slate-200">-</span>}
                                                    {ticket.pdf_url ? (
                                                        <a href={ticket.pdf_url} target="_blank" className="p-1 text-blue-600 hover:bg-blue-50 rounded" title="Factura/Informe">
                                                            <FileText size={14} />
                                                        </a>
                                                    ) : <span className="text-slate-200">-</span>}
                                                </div>
                                            </td>

                                            {/* Asignación */}
                                            <td className="px-3 py-2 md:px-4 md:py-3 align-top">
                                                {ticket.technician_id ? (
                                                    <div className="flex flex-col items-start gap-1">
                                                        <div className="font-medium text-slate-700 text-xs bg-slate-100 px-2 py-1 rounded">
                                                            {techs.find(t => t.id === ticket.technician_id)?.full_name || 'Desconocido'}
                                                        </div>
                                                        <button onClick={() => setSelectedTicketForAssign(ticket)} className="text-[10px] text-blue-500 hover:underline">
                                                            Reasignar
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <button onClick={() => setSelectedTicketForAssign(ticket)} className="text-xs bg-slate-100 text-slate-600 px-3 py-1 rounded hover:bg-slate-200 font-medium">
                                                        Asignar
                                                    </button>
                                                )}
                                            </td>

                                            {/* Acciones */}
                                            <td className="px-3 py-2 md:px-4 md:py-3 text-right align-top">
                                                <div className="flex items-center justify-end gap-2 md:gap-1">
                                                    <button onClick={() => setSelectedTicketForDetails(ticket)} className="p-2 md:p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded" title="Ver">
                                                        <Eye size={16} />
                                                    </button>
                                                    <button onClick={() => confirmDelete(ticket.id)} className="p-2 md:p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded" title="Eliminar">
                                                        <Trash2 size={16} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                    {tickets.length === 0 && (
                                        <tr><td colSpan="8" className="p-12 text-center text-slate-400">No se encontraron resultados</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>

            {/* MODALS */}
            {showCreateModal && (
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
            )}

            {showDeleteModal && (
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
            )}

            {selectedTicketForAssign && (
                <SmartAssignmentModal
                    isOpen={!!selectedTicketForAssign}
                    onClose={() => { setSelectedTicketForAssign(null); fetchData(); }}
                    ticket={selectedTicketForAssign}
                    onSuccess={() => { setSelectedTicketForAssign(null); fetchData(); }}
                />
            )}

            {selectedTicketForDetails && (
                <ServiceDetailsModal
                    ticket={selectedTicketForDetails}
                    onClose={() => setSelectedTicketForDetails(null)}
                />
            )}

            {selectedTicketForBudget && (
                <BudgetManagerModal
                    isOpen={!!selectedTicketForBudget}
                    onClose={() => setSelectedTicketForBudget(null)}
                    ticket={selectedTicketForBudget}
                    onUpdate={() => fetchData()}
                />
            )}
        </div>
    );
};

const StatusBadge = ({ status }) => {
    const colors = {
        solicitado: 'bg-yellow-100 text-yellow-800',
        asignado: 'bg-blue-100 text-blue-800',
        en_camino: 'bg-indigo-100 text-indigo-800',
        en_diagnostico: 'bg-purple-100 text-purple-800',
        presupuesto_pendiente: 'bg-amber-100 text-amber-800',
        presupuesto_aceptado: 'bg-green-100 text-green-800',
        en_reparacion: 'bg-pink-100 text-pink-800',
        finalizado: 'bg-green-100 text-green-800',
        pagado: 'bg-green-100 text-green-800',
        cancelado: 'bg-red-100 text-red-800'
    };
    return (
        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-medium ${colors[status] || 'bg-gray-100 text-gray-800'}`}>
            {status === 'cancelado' ? 'CANCELADO POR CLIENTE' : (status ? status.toUpperCase().replace('_', ' ') : 'UNKNOWN')}
        </span>
    );
};

export default ServiceMonitor;
