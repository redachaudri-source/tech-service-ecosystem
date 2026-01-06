import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Calendar, MapPin, Wrench, CheckCircle, Clock, AlertCircle, ChevronRight, Search, ClipboardList } from 'lucide-react';

const TechServiceList = ({ filterType }) => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [tickets, setTickets] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    // History specific filters
    const [historyDate, setHistoryDate] = useState('');
    const [sortOrder, setSortOrder] = useState('desc'); // 'desc' (newest first) or 'asc' (oldest first)

    useEffect(() => {
        if (user) {
            fetchTickets();
        }
    }, [user, filterType, historyDate, sortOrder]);

    const fetchTickets = async () => {
        setLoading(true);
        let query = supabase
            .from('tickets')
            .select('*, profiles:client_id(full_name, address, city)')
            .eq('technician_id', user.id); // Only my tickets

        // Apply Filters
        if (filterType === 'new') {
            // "Nuevos sin atender" -> Explicitly whitelist ACTIVE statuses
            // This guarantees no 'finalizado'/'cancelado'/'pagado' leaks
            query = query.in('status', ['solicitado', 'asignado', 'en_camino', 'en_diagnostico', 'en_reparacion', 'en_espera']);

            // Default sort for active: Oldest first (urgent ones usually) or scheduled_at
            query = query.order('scheduled_at', { ascending: true });

        } else if (filterType === 'history') {
            // "Historial Cerrados"
            query = query.in('status', ['finalizado', 'cancelado', 'pagado']);

            // Apply Date Filter if selected
            if (historyDate) {
                // Filter by updated_at (closing date approx) or created_at? 
                // Usually we care when it was closed, so updated_at is better for history.
                // We need to match the whole day.
                const startOfDay = new Date(historyDate).toISOString();
                const endOfDay = new Date(new Date(historyDate).setHours(23, 59, 59, 999)).toISOString();

                query = query.gte('updated_at', startOfDay).lte('updated_at', endOfDay);
            }

            // Apply Sort Order (Dynamic)
            // Sorting by updated_at (when it was finished)
            query = query.order('updated_at', { ascending: sortOrder === 'asc' });

        } else if (filterType === 'pending_material') {
            // "Pendientes de Material"
            query = query.eq('status', 'pendiente_material').order('updated_at', { ascending: false });

        } else if (filterType === 'all') {
            // "Todos" 
            query = query.order('created_at', { ascending: false });
        }

        const { data, error } = await query;

        if (error) {
            console.error('Error fetching tickets:', error);
        } else {
            setTickets(data || []);
        }
        setLoading(false);
    };

    // Client-side search
    const filteredTickets = tickets.filter(t => {
        const s = searchTerm.toLowerCase();
        return (
            t.ticket_number?.toString().includes(s) ||
            t.profiles?.full_name?.toLowerCase().includes(s) ||
            t.profiles?.address?.toLowerCase().includes(s) ||
            t.appliance_info?.brand?.toLowerCase().includes(s)
        );
    });

    const getStatusColor = (status) => {
        const map = {
            solicitado: 'bg-yellow-100 text-yellow-700',
            asignado: 'bg-blue-100 text-blue-700',
            en_camino: 'bg-indigo-100 text-indigo-700',
            en_diagnostico: 'bg-purple-100 text-purple-700',
            en_reparacion: 'bg-orange-100 text-orange-700',
            en_espera: 'bg-gray-100 text-gray-700',
            pendiente_material: 'bg-orange-100 text-orange-800 border border-orange-200',
            finalizado: 'bg-green-100 text-green-700',
            pagado: 'bg-emerald-100 text-emerald-700',
            cancelado: 'bg-red-100 text-red-700',
        };
        return map[status] || 'bg-slate-100 text-slate-700';
    };

    const getTitle = () => {
        switch (filterType) {
            case 'new': return 'Nuevos sin Atender';
            case 'pending_material': return 'En Espera de Material';
            case 'history': return 'Historial Completado';
            default: return 'Todos los Servicios';
        }
    };

    return (
        <div className="p-4 space-y-4 pb-24">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold text-slate-800">{getTitle()}</h1>
                <p className="text-slate-500 text-sm">{filteredTickets.length} servicios encontrados</p>
            </div>

            {/* Controls */}
            <div className="space-y-3">
                {/* Search Bar */}
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input
                        type="text"
                        placeholder="Buscar cliente, dirección..."
                        className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>

                {/* History Specific Filters */}
                {filterType === 'history' && (
                    <div className="flex gap-2 animate-in fade-in slide-in-from-top-2">
                        <input
                            type="date"
                            value={historyDate}
                            onChange={(e) => setHistoryDate(e.target.value)}
                            className="flex-1 px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <button
                            onClick={() => setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc')}
                            className="px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-600 flex items-center gap-2 active:bg-slate-50"
                        >
                            {sortOrder === 'desc' ? (
                                <>
                                    <Clock size={16} className="text-blue-500" />
                                    Más Recientes
                                </>
                            ) : (
                                <>
                                    <Clock size={16} className="text-slate-400" />
                                    Más Antiguos
                                </>
                            )}
                        </button>
                    </div>
                )}
            </div>

            {/* List */}
            <div className="space-y-3">
                {loading ? (
                    <div className="text-center py-10 text-slate-400">Cargando servicios...</div>
                ) : filteredTickets.length === 0 ? (
                    <div className="text-center py-10">
                        <div className="bg-slate-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-3">
                            <ClipboardList size={32} className="text-slate-300" />
                        </div>
                        <h3 className="text-slate-600 font-medium">No hay servicios aquí</h3>
                        <p className="text-slate-400 text-sm">Prueba a cambiar los filtros.</p>
                        {filterType === 'history' && historyDate && (
                            <button
                                onClick={() => setHistoryDate('')}
                                className="mt-4 text-blue-600 font-medium text-sm hover:underline"
                            >
                                Borrar filtro de fecha
                            </button>
                        )}
                    </div>
                ) : (
                    filteredTickets.map(ticket => (
                        <div
                            key={ticket.id}
                            onClick={() => navigate(`/tech/ticket/${ticket.id}`)}
                            className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 active:scale-[0.98] transition-transform"
                        >
                            <div className="flex justify-between items-start mb-2">
                                <span className="font-mono text-xs font-bold text-slate-400">#{ticket.ticket_number}</span>
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${getStatusColor(ticket.status)}`}>
                                    {ticket.status.replace('_', ' ')}
                                </span>
                            </div>

                            <div className="flex items-start gap-3 mb-3">
                                <div className={`mt-1 p-2 rounded-lg shrink-0 ${filterType === 'history' ? 'bg-green-50 text-green-600' : 'bg-blue-50 text-blue-600'}`}>
                                    {filterType === 'history' ? <CheckCircle size={18} /> : <Wrench size={18} />}
                                </div>
                                <div>
                                    <h3 className="font-bold text-slate-800 text-base leading-tight mb-1">
                                        {ticket.profiles?.full_name || 'Cliente Desconocido'}
                                    </h3>
                                    <div className="flex items-center gap-1 text-xs text-slate-500 mb-0.5">
                                        <MapPin size={12} />
                                        <span className="truncate max-w-[200px]">{ticket.profiles?.address}</span>
                                    </div>
                                    <div className="flex items-center gap-1 text-xs text-slate-500">
                                        <Wrench size={12} />
                                        <span>{ticket.appliance_info?.type} {ticket.appliance_info?.brand}</span>
                                    </div>

                                    {/* Reason for Cancellation */}
                                    {(ticket.status === 'cancelado' || ticket.status === 'rejected') && ticket.client_feedback && (
                                        <div className="mt-2 text-[10px] bg-red-50 text-red-800 p-2 rounded border border-red-100 italic">
                                            <span className="font-bold not-italic">Motivo: </span>
                                            "{ticket.client_feedback}"
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="flex items-center gap-2 pt-3 border-t border-slate-50">
                                <Clock size={14} className={filterType === 'history' ? "text-slate-400" : "text-indigo-500"} />
                                <span className={`text-xs font-medium ${filterType === 'history' ? "text-slate-500" : "text-indigo-900"}`}>
                                    {filterType === 'history'
                                        ? (() => {
                                            const dateVal = ticket.updated_at || ticket.created_at;
                                            if (!dateVal) return 'Fecha desconocida';
                                            const d = new Date(dateVal);
                                            return `Cerrado: ${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
                                        })()
                                        : (ticket.scheduled_at
                                            ? new Date(ticket.scheduled_at).toLocaleString('es-ES', { weekday: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                                            : 'Sin Fecha')
                                    }
                                </span>
                                <ChevronRight size={16} className="ml-auto text-slate-300" />
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};

// Manual definition removed, imported from lucide-react instead

export default TechServiceList;
