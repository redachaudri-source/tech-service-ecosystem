import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { MapPin, Phone, Calendar, Clock, ChevronRight, Search, Filter, Package, History, Star } from 'lucide-react';
import TechRouteLine from '../../components/TechRouteLine';

import { useToast } from '../../components/ToastProvider';

const TechDashboard = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const { addToast } = useToast();
    const [tickets, setTickets] = useState([]);
    const [closedTickets, setClosedTickets] = useState([]); // Separete bucket for History Today
    const [loading, setLoading] = useState(true);
    const [filterDate, setFilterDate] = useState(new Date().toISOString().split('T')[0]);
    const [searchQuery, setSearchQuery] = useState('');
    const [stats, setStats] = useState({ rating: 0, reviews: 0 });
    const [currentTime, setCurrentTime] = useState(new Date());

    // Live Clock
    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    useEffect(() => {
        if (user) {
            fetchTickets();
            // ... realtime setup ... (keeping existing subscription conceptually)
            const channel = supabase.channel('tech_dashboard_updates')
                .on('postgres_changes', { event: '*', schema: 'public', table: 'tickets', filter: `technician_id=eq.${user.id}` }, () => {
                    fetchTickets();
                })
                .subscribe();
            return () => { supabase.removeChannel(channel); };
        }
    }, [user, filterDate]);

    const fetchTickets = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('tickets')
                .select(`*, client:client_id (full_name, city, address, phone)`)
                .eq('technician_id', user.id)
                // We want ALL tickets relevant to today to sort them locally
                // Ideally this date filter should be robust, but for now fetching all for user is safer to client-side filter
                .order('scheduled_at', { ascending: true });

            if (error) throw error;

            // 1. Filter Logic: Only Today (or active/past but relevant)
            const todayStr = filterDate;

            // Separate Open vs Closed
            const relevantData = (data || []).filter(t => {
                const tDate = t.scheduled_at ? t.scheduled_at.split('T')[0] : '';
                return tDate === todayStr || ['en_camino', 'en_diagnostico'].includes(t.status); // Always show active even if date drifted
            });

            const open = [];
            const closed = [];

            relevantData.forEach(t => {
                if (['finalizado', 'cancelado', 'rechazado', 'pagado'].includes(t.status)) {
                    closed.push(t);
                } else {
                    open.push(t);
                }
            });

            setTickets(open);
            setClosedTickets(closed);

            // Fetch Stats (Reviews)
            const { data: revData } = await supabase
                .from('reviews')
                .select('rating')
                .eq('technician_id', user.id);

            if (revData && revData.length > 0) {
                const avg = revData.reduce((acc, curr) => acc + curr.rating, 0) / revData.length;
                setStats({ rating: avg.toFixed(1), reviews: revData.length });
            }

        } catch (error) {
            console.error('Error fetching tickets:', error);
        } finally {
            setLoading(false);
        }
    };

    // "Mood Text" Logic
    const getMoodText = () => {
        const count = tickets.length + closedTickets.length;
        if (count === 0) return "DÍA LIBRE, ¡DISFRUTA!";
        if (count <= 3) return "DÍA TRANQUILO, ÉXITO ASEGURADO 🧘‍♂️";
        if (count <= 9) return "DÍA MOVIDITO, CONCENTRATE Y ÁNIMO 💪";
        return "¡MODO BESTIA! TÚ PUEDES CON TODO 🔥";
    };

    // Filtered Display
    const filterList = (list) => {
        const query = searchQuery.toLowerCase();
        return list.filter(t =>
            (t.client?.full_name || '').toLowerCase().includes(query) ||
            (t.ticket_number || '').includes(query) ||
            (t.client?.address || '').toLowerCase().includes(query) ||
            (t.appliance_info?.brand || '').toLowerCase().includes(query)
        );
    };

    const displayOpen = filterList(tickets);
    const displayClosed = filterList(closedTickets);

    const getStatusBadge = (status) => {
        const map = {
            'solicitado': { color: 'bg-slate-100 text-slate-600', label: 'PENDIENTE' },
            'en_camino': { color: 'bg-blue-600 text-white animate-pulse', label: 'EN CAMINO' },
            'en_diagnostico': { color: 'bg-indigo-600 text-white animate-pulse', label: 'DIAGNÓSTICO' },
            'en_reparacion': { color: 'bg-orange-500 text-white', label: 'REPARANDO' },
            'pendiente_material': { color: 'bg-yellow-100 text-yellow-800', label: 'MATERIAL' },
            'finalizado': { color: 'bg-green-100 text-green-700', label: 'FINALIZADO' },
            'pagado': { color: 'bg-emerald-100 text-emerald-800', label: 'COBRADO' }
        };
        const s = map[status] || { color: 'bg-gray-100 text-gray-500', label: status };
        return <span className={`px-2 py-0.5 rounded text-[10px] font-black tracking-wider uppercase ${s.color}`}>{s.label}</span>;
    };

    return (
        <div className="space-y-6 pb-20">
            {/* Header / Mood / Clock */}
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/5 rounded-full -mr-8 -mt-8"></div>

                <div className="flex justify-between items-start mb-2 relative z-10">
                    <div>
                        <h1 className="text-xl font-bold text-slate-800">Hola, {user?.user_metadata?.first_name || 'Técnico'}</h1>
                        <p className="text-xs font-bold text-blue-600 mt-1 tracking-wide">{getMoodText()}</p>
                    </div>
                    {/* Live Clock */}
                    <div className="text-right">
                        <div className="text-2xl font-black text-slate-800 leading-none">
                            {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                        <div className="text-[10px] text-slate-400 font-medium uppercase tracking-wider mt-1">
                            {currentTime.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'short' })}
                        </div>
                    </div>
                </div>

                {/* Quick Stats Row */}
                <div className="flex items-center gap-4 mt-4 pt-4 border-t border-slate-50">
                    <div
                        className="flex items-center gap-2 cursor-pointer"
                        onClick={() => navigate('/tech/history')}
                    >
                        <div className="flex">
                            {[1, 2, 3, 4, 5].map(star => (
                                <Star key={star} size={14} className={star <= Math.round(stats.rating || 5) ? "fill-yellow-400 text-yellow-400" : "text-slate-200"} />
                            ))}
                        </div>
                        <span className="text-xs font-bold text-slate-600 border-b-2 border-blue-200 text-blue-600">Tu Puntuación</span>
                    </div>
                </div>
            </div>

            {/* Smart Search */}
            <div className="sticky top-0 z-20 bg-gray-50/95 backdrop-blur py-2">
                <div className="relative shadow-sm">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                    <input
                        type="text"
                        placeholder="Buscar cliente, avería, modelo..."
                        className="w-full pl-11 pr-4 py-3.5 bg-white border-0 rounded-2xl ring-1 ring-slate-200 focus:ring-2 focus:ring-blue-500 text-sm font-medium transition-shadow placeholder:text-slate-400"
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                    />
                    {searchQuery && (
                        <button
                            onClick={() => setSearchQuery('')}
                            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 bg-slate-100 rounded-full text-slate-400"
                        >
                            <Package size={14} />
                        </button>
                    )}
                </div>
            </div>

            {/* Filter Buttons (Quick Status) */}
            <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
                {['Todos', 'En Camino', 'Diagnóstico', 'Pendiente'].map((f) => (
                    <button key={f} className="px-4 py-2 bg-white rounded-xl border border-slate-200 text-xs font-bold text-slate-600 whitespace-nowrap active:bg-blue-50 active:border-blue-200 active:text-blue-600 transition-colors shadow-sm">
                        {f}
                    </button>
                ))}
            </div>

            {/* MAIN AGENDA (OPEN) */}
            <div className="space-y-4">
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest pl-1 mb-2">
                    Siguiente Servicio ({displayOpen.length})
                </h3>

                {loading ? (
                    <div className="p-8 text-center text-slate-400"><div className="animate-spin h-6 w-6 border-2 border-blue-500 rounded-full border-t-transparent mx-auto mb-2"></div>Cargando...</div>
                ) : displayOpen.length === 0 ? (
                    <div className="bg-white p-8 rounded-2xl border border-dashed border-slate-300 text-center">
                        <p className="text-slate-500 font-medium">Todo despejado por ahora 🌴</p>
                    </div>
                ) : (
                    displayOpen.map((ticket, idx) => (
                        <div
                            key={ticket.id}
                            onClick={() => navigate(`/tech/ticket/${ticket.id}`)}
                            className={`relative bg-white rounded-2xl p-0 shadow-sm border border-slate-100 overflow-hidden active:scale-[0.98] transition-transform ${idx === 0 ? 'ring-2 ring-blue-500 shadow-blue-100' : ''}`}
                        >
                            {/* Priority Indicator for first item */}
                            {idx === 0 && <div className="bg-blue-600 text-white text-[10px] font-bold text-center py-1">SIGUIENTE PARADA</div>}

                            <div className="p-5">
                                <div className="flex justify-between items-start mb-3">
                                    {getStatusBadge(ticket.status)}
                                    <span className="font-mono text-xl font-black text-slate-800">
                                        {ticket.scheduled_at
                                            ? new Date(ticket.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                                            : '--:--'}
                                    </span>
                                </div>

                                <div className="mb-4">
                                    <h3 className="text-lg font-bold text-slate-900 leading-tight mb-1">
                                        {ticket.client?.full_name || 'Cliente'}
                                    </h3>
                                    <div className="flex items-start gap-2 text-slate-500 text-sm">
                                        <MapPin size={16} className="mt-0.5 shrink-0 text-blue-400" />
                                        <span className="line-clamp-2 font-medium">{ticket.client?.address}, {ticket.client?.city}</span>
                                    </div>
                                </div>

                                {/* Avery / Issue Info */}
                                <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                                    <div className="flex justify-between items-center mb-1">
                                        <span className="text-[10px] font-bold text-slate-400 uppercase">Avería Reportada</span>
                                        {/* Ticket # in Corner */}
                                        <span className="text-[10px] font-bold text-yellow-600 bg-yellow-100 px-1.5 rounded">#{ticket.ticket_number}</span>
                                    </div>
                                    <p className="text-sm font-medium text-slate-700 line-clamp-2">
                                        {ticket.description || ticket.issue || 'Sin descripción del problema.'}
                                    </p>
                                    <div className="mt-2 text-xs font-bold text-slate-500">
                                        {ticket.appliance_info?.type} {ticket.appliance_info?.brand}
                                    </div>
                                </div>
                            </div>

                            {/* Action Strip */}
                            <div className="bg-slate-50 p-3 flex justify-between items-center border-t border-slate-100">
                                <span className="text-xs font-bold text-blue-600 flex items-center gap-1">
                                    VER DETALLES <ChevronRight size={14} />
                                </span>
                                <Phone size={18} className="text-slate-400" />
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* HISTORY TODAY (CLOSED) */}
            {displayClosed.length > 0 && (
                <div className="space-y-4 pt-6 border-t border-slate-200 mt-6">
                    <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest pl-1 mb-2">
                        Completados Hoy ({displayClosed.length})
                    </h3>
                    <div className="opacity-60 hover:opacity-100 transition-opacity space-y-3">
                        {displayClosed.map(ticket => (
                            <div
                                key={ticket.id}
                                className="bg-slate-50 rounded-xl p-4 border border-slate-200 flex justify-between items-center"
                            >
                                <div>
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="text-xs font-bold text-slate-500 line-through">{ticket.client?.full_name}</span>
                                        {getStatusBadge(ticket.status)}
                                    </div>
                                    <div className="text-xs font-mono text-slate-400">
                                        {ticket.ticket_number} • {new Date(ticket.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </div>
                                </div>
                                <CheckCircle size={20} className="text-green-500/50" />
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default TechDashboard;
