import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { MapPin, Phone, Calendar, Clock, ChevronRight, Search, Filter, Package, History } from 'lucide-react';
import TechRouteLine from '../../components/TechRouteLine';

import { useToast } from '../../components/ToastProvider';

const TechDashboard = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const { addToast } = useToast(); // Hook
    const [tickets, setTickets] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filterDate, setFilterDate] = useState(new Date().toISOString().split('T')[0]); // Default Today
    const [searchQuery, setSearchQuery] = useState('');

    useEffect(() => {
        if (user) {
            fetchTickets();

            // Realtime: Listen for assignments to ME
            const channel = supabase.channel('tech_dashboard_updates')
                .on('postgres_changes', { event: '*', schema: 'public', table: 'tickets', filter: `technician_id=eq.${user.id}` }, (payload) => {
                    console.log('Tech: Ticket Update', payload);
                    fetchTickets();

                    if (payload.eventType === 'UPDATE' && payload.new.technician_id === user.id && payload.old.technician_id !== user.id) {
                        addToast('¡Nueva Asignación!', 'success', true);
                    } else if (payload.eventType === 'INSERT' && payload.new.technician_id === user.id) {
                        addToast('¡Nuevo Ticket Asignado!', 'success', true);
                    }
                })
                .subscribe();

            return () => {
                supabase.removeChannel(channel);
            };
        }
    }, [user, filterDate]);

    const fetchTickets = async () => {
        setLoading(true);
        try {
            // Fetch tickets assigned to this tech AND scheduled for the specific date
            // Note: We'll filter via JS for now if date matching is tricky with timestamptz, 
            // but ideally use .gte and .lte

            const startOfDay = new Date(filterDate);
            startOfDay.setHours(0, 0, 0, 0);

            const endOfDay = new Date(filterDate);
            endOfDay.setHours(23, 59, 59, 999);

            const { data, error } = await supabase
                .from('tickets')
                .select(`
                    *,
                    client:client_id (full_name, city, address, phone)
                `)
                .eq('technician_id', user.id)
                .order('scheduled_at', { ascending: true });

            if (error) throw error;

            console.log("DEBUG TICKETS FETCHED:", data?.length, data); // FORCE_DEPLOY_FIX_V3

            const safeData = data || [];

            // Client-side date filtering (safer for timezones initially)
            // Fixed syntax error
            const filtered = safeData.filter(t => {
                // DEBUG: Show everything for now to prove data exists
                console.log(`Checking ticket ${t.id} - Status: ${t.status}`);
                return true;

                /*
                // 1. Always show active tickets regardless of date (Exclude cancelled/rejected)
                if (['en_camino', 'en_diagnostico', 'en_reparacion', 'solicitado', 'asignado', 'presupuesto_pendiente', 'presupuesto_aceptado', 'presupuesto_revision', 'pendiente_material'].includes(t.status)) {
                    return true;
                }
                
                // ... rest of filter logic ...
                */
            });

            // If no tickets today, maybe show all active just so user sees something (Fallback)
            // But wait, we want to respect the empty state if there's nothing. 
            // Only show 'safeData' (all) if something fundamental failed? 
            // No, just show filtered.
            setTickets(filtered);

        } catch (error) {
            console.error('Error fetching tickets:', error);
            // Don't leave it loading forever
        } finally {
            setLoading(false);
        }
    };

    // Derived state for display
    const displayedTickets = (tickets || []).filter(t => {
        const query = searchQuery.toLowerCase() || '';
        return (
            (t.client?.full_name || '').toLowerCase().includes(query) ||
            (t.ticket_number?.toString() || '').includes(query) ||
            (t.client?.address || '').toLowerCase().includes(query)
        );
    });

    const todayOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const dateString = new Date(filterDate).toLocaleDateString('es-ES', todayOptions);

    return (
        <div className="space-y-4">
            {/* Search Bar */}
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                <input
                    type="text"
                    placeholder="Buscar cliente, dirección..."
                    className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl shadow-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                />
                <button className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 bg-slate-100 rounded-lg text-slate-500 hover:text-slate-800">
                    <Filter size={18} />
                </button>
            </div>

            {/* Quick Actions */}
            <div className="grid grid-cols-2 gap-3 animate-in fade-in slide-in-from-top-2">
                <button
                    onClick={() => navigate('/tech/pending-material')}
                    className="p-4 bg-orange-50 text-orange-800 rounded-2xl border border-orange-100 font-bold text-sm flex flex-col items-center justify-center gap-1 active:scale-95 transition shadow-sm"
                >
                    <Package size={24} className="text-orange-500 mb-1" />
                    En Espera Material
                </button>
                <button
                    onClick={() => navigate('/tech/history')}
                    className="p-4 bg-slate-50 text-slate-700 rounded-2xl border border-slate-200 font-bold text-sm flex flex-col items-center justify-center gap-1 active:scale-95 transition shadow-sm"
                >
                    <History size={24} className="text-slate-400 mb-1" />
                    Historial
                </button>
            </div>

            {/* Date Header */}
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800">Hola, {user?.user_metadata?.first_name || 'Técnico'}</h1>
                    <p className="text-slate-500">Aquí tienes tu agenda de hoy</p>
                </div>
                <div className="bg-blue-50 text-blue-700 px-3 py-1 rounded-full text-sm font-medium">
                    {dateString}
                </div>
            </div>

            {/* DEBUG OVERLAY - TEMPORARY */}
            <div className="mb-6 p-4 bg-yellow-50 border-2 border-yellow-400 rounded-lg text-xs font-mono text-slate-800 overflow-auto max-h-40">
                <p className="font-bold text-red-600">MODO DEBUG ACTIVADO</p>
                <p>User ID (Auth): {user?.id}</p>
                <p>Tickets Cargados: {tickets.length}</p>
                <p>Fecha Filtro: {filterDate}</p>
                <details>
                    <summary className="cursor-pointer text-blue-600 underline">Ver JSON raw (Click)</summary>
                    <pre>{JSON.stringify(tickets, null, 2)}</pre>
                </details>
            </div>
            {/* Agenda List */}
            <div className="space-y-3">
                {loading ? (
                    <div className="text-center py-10">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
                        <p className="text-slate-400 text-sm">Cargando agenda...</p>
                    </div>
                ) : displayedTickets.length === 0 ? (
                    <div className="bg-white rounded-xl p-8 text-center shadow-sm border border-slate-200">
                        <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                            <Calendar className="text-slate-300" size={32} />
                        </div>
                        <h3 className="text-slate-800 font-bold mb-1">Agenda Libre</h3>
                        <p className="text-slate-500 text-sm">No tienes servicios programados para hoy.</p>
                        <button onClick={() => setFilterDate(new Date().toISOString().split('T')[0])} className="mt-4 text-blue-600 font-medium text-sm">
                            Ver todos los pendientes
                        </button>
                    </div>
                ) : (
                    displayedTickets.map(ticket => (
                        <div
                            key={ticket.id}
                            onClick={() => navigate(`/tech/ticket/${ticket.id}`)}
                            className="bg-white rounded-xl p-4 shadow-sm border border-slate-200 active:scale-[0.98] transition-transform cursor-pointer relative overflow-hidden"
                        >
                            {/* Blue Accent Line for Active */}
                            {['en_camino', 'en_diagnostico', 'en_reparacion'].includes(ticket.status) && (
                                <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-blue-500"></div>
                            )}

                            <div className="flex justify-between items-start mb-2 pl-2">
                                <div className="flex items-center gap-2">
                                    <span className="bg-slate-100 text-slate-600 text-[10px] font-bold px-1.5 py-0.5 rounded font-mono">
                                        {ticket.scheduled_at
                                            ? new Date(ticket.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                                            : 'Sin hora'}
                                    </span>
                                    {ticket.status === 'en_camino' || ticket.status === 'en_diagnostico' ? (
                                        <span className="bg-blue-100 text-blue-700 text-[10px] font-bold px-1.5 py-0.5 rounded uppercase animate-pulse">
                                            En Curso
                                        </span>
                                    ) : null}
                                </div>
                                <span className="text-slate-400 text-xs font-mono">#{ticket.ticket_number}</span>
                            </div>

                            <div className="pl-2">
                                <h3 className="font-bold text-slate-800 truncate pr-4">{ticket.client?.full_name || 'Cliente Desconocido'}</h3>
                                <div className="flex items-start gap-1.5 text-slate-500 text-sm mt-1">
                                    <MapPin size={14} className="mt-0.5 shrink-0" />
                                    <p className="line-clamp-2 leading-tight">
                                        {ticket.client?.address || 'Sin dirección'}, {ticket.client?.city}
                                    </p>
                                </div>

                                {ticket.appliance_info && (
                                    <p className="text-xs text-slate-400 mt-2 pl-5">
                                        {(ticket.appliance_info.type === 'General' || (ticket.appliance_info.type === 'Lavadora' && !ticket.appliance_info.brand))
                                            ? 'Varios / General'
                                            : `${ticket.appliance_info.type} ${ticket.appliance_info.brand || ''}`}
                                    </p>
                                )}
                            </div>

                            <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300">
                                <ChevronRight />
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Route Map Visualization */}
            {!loading && displayedTickets.length > 0 && (
                <TechRouteLine tickets={displayedTickets} />
            )}
        </div>
    );
};

export default TechDashboard;
