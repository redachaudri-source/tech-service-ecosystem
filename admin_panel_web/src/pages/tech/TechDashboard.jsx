import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { MapPin, Phone, Calendar, Clock, ChevronRight, Search, Filter, Package, History, Star, ShieldAlert, CheckCircle, FileText } from 'lucide-react'; // Added ShieldAlert, CheckCircle, FileText
import TechRouteLine from '../../components/TechRouteLine';
import TechReviewsModal from '../../components/TechReviewsModal';
import ServiceCard from '../../components/ServiceCard';

import { useToast } from '../../components/ToastProvider';

const TechDashboard = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const { addToast } = useToast();
    const [tickets, setTickets] = useState([]);
    const [pendingTickets, setPendingTickets] = useState([]); // Pending Material Bucket
    const [closedTickets, setClosedTickets] = useState([]); // Separete bucket for History Today
    const [loading, setLoading] = useState(true);
    const [filterDate, setFilterDate] = useState(new Date().toISOString().split('T')[0]);
    const [searchQuery, setSearchQuery] = useState('');
    const [stats, setStats] = useState({ rating: 0, reviews: 0 });
    const [currentTime, setCurrentTime] = useState(new Date());
    const [showReviewsModal, setShowReviewsModal] = useState(false); // Added state
    const [statusFilter, setStatusFilter] = useState('Todos'); // Added Filter State

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
            const pending = [];

            relevantData.forEach(t => {
                if (['finalizado', 'cancelado', 'rechazado', 'pagado'].includes(t.status)) {
                    closed.push(t);
                } else if (['pendiente_material', 'pending_parts'].includes(t.status)) {
                    pending.push(t);
                } else {
                    open.push(t);
                }
            });

            setTickets(open);
            setPendingTickets(pending);
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
        return list.filter(t => {
            // Text Search
            const matchesText = (t.client?.full_name || '').toLowerCase().includes(query) ||
                (t.ticket_number || '').includes(query) ||
                (t.client?.address || '').toLowerCase().includes(query) ||
                (t.appliance_info?.brand || '').toLowerCase().includes(query);

            // Status/Type Filter
            if (statusFilter === 'Todos') return matchesText;
            if (statusFilter === 'Garantía') return matchesText && t.is_warranty;
            if (statusFilter === 'Pendiente') return matchesText && t.status === 'solicitado';

            // Map other filters loosely or exactly
            const statusMap = {
                'En Camino': 'en_camino',
                'Diagnóstico': 'en_diagnostico'
            };
            if (statusMap[statusFilter]) return matchesText && t.status === statusMap[statusFilter];

            return matchesText;
        });
    };

    const displayOpen = filterList(tickets);
    const displayPending = filterList(pendingTickets);
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

    const handleTicketClick = (ticketId) => {
        if (user?.profile?.status === 'paused') {
            alert(`⛔ ACCESO PAUSADO\n\nNo puedes realizar servicios en este momento.\n\nCausa: ${user?.profile?.status_reason || 'Sin motivo especificado.'}`);
            return;
        }
        navigate(`/tech/ticket/${ticketId}`);
    };

    // Quick Action: Start Journey without navigation
    const handleStartJourney = async (ticketId) => {
        // e.stopPropagation() is handled in ServiceCard
        if (user?.profile?.status === 'paused') return;

        try {
            const { error } = await supabase
                .from('tickets')
                .update({ status: 'en_camino' })
                .eq('id', ticketId);

            if (error) throw error;
            addToast('¡Viaje iniciado! Estado actualizado.', 'success');
            fetchTickets(); // Refresh UI instantly
        } catch (error) {
            console.error(error);
            addToast('Error al iniciar viaje', 'error');
        }
    };

    return (
        <div className="space-y-6 pb-20">
            {/* ... keeping header ... */}
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
                        onClick={() => setShowReviewsModal(true)}
                    >
                        <div className="flex">
                            {[1, 2, 3, 4, 5].map(star => (
                                <Star key={star} size={14} className={star <= Math.round(stats.rating || 0) ? "fill-yellow-400 text-yellow-400" : "text-slate-200"} />
                            ))}
                        </div>
                        <span className="text-xs font-bold text-slate-600 border-b-2 border-blue-200 text-blue-600">
                            {stats.reviews > 0 ? `Tu Puntuación (${stats.reviews})` : 'Tu Puntuación'}
                        </span>
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
                {['Todos', 'Garantía', 'En Camino', 'Diagnóstico', 'Pendiente'].map((f) => (
                    <button
                        key={f}
                        onClick={() => setStatusFilter(f)}
                        className={`px-4 py-2 rounded-xl border text-xs font-bold whitespace-nowrap transition-colors shadow-sm ${statusFilter === f ? 'bg-blue-600 text-white border-blue-600' : 'bg-white border-slate-200 text-slate-600 active:bg-blue-50'}`}
                    >
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
                    displayOpen.map((ticket, idx) => {
                        // Use New Service Card for the Top Priority Item if it's in a relevant status
                        // (Solicitado/Asignado or En Camino)
                        const useServiceCard = idx === 0 && ['solicitado', 'asignado', 'en_camino'].includes(ticket.status);

                        if (useServiceCard) {
                            return (
                                <ServiceCard
                                    key={ticket.id}
                                    ticket={ticket}
                                    user={user}
                                    onTicketUpdate={fetchTickets}
                                    className="mb-6 ring-2 ring-blue-500 ring-offset-2"
                                    isNextHeader={true} // Trigger Blue Header Design
                                    onClick={() => handleTicketClick(ticket.id)}
                                    onStartJourney={handleStartJourney}
                                />
                            );
                        }

                        // Standard Card
                        return (
                            <div
                                key={ticket.id}
                                onClick={() => handleTicketClick(ticket.id)}
                                className={`relative bg-white rounded-2xl p-0 shadow-sm border border-slate-100 overflow-hidden active:scale-[0.98] transition-transform ${idx === 0 ? 'ring-2 ring-blue-500 shadow-blue-100' : ''} ${user?.profile?.status === 'paused' ? 'opacity-75 grayscale-[0.5]' : ''} ${ticket.is_warranty ? 'border-l-4 border-l-purple-500' : ''}`}
                            >
                                {/* Priority Indicator for first item (if standard card used) */}
                                {idx === 0 && <div className="bg-blue-600 text-white text-[10px] font-bold text-center py-1">SIGUIENTE PARADA</div>}

                                {/* Paused Overlay Hint if needed, or just let opacity speak */}

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
                                            <span className={`text-[10px] font-bold px-1.5 rounded flex items-center gap-1 ${ticket.is_warranty ? 'text-purple-600 bg-purple-100' : 'text-yellow-600 bg-yellow-100'}`}>
                                                {ticket.is_warranty && <ShieldAlert size={10} />}
                                                #{ticket.ticket_number}
                                            </span>
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
                        );
                    })

                )}
            </div>

            {/* PENDING MATERIAL SECTION */}
            {
                displayPending.length > 0 && (
                    <div className="space-y-4 pt-6 border-t border-slate-200 mt-6">
                        <h3 className="text-xs font-black text-orange-400 uppercase tracking-widest pl-1 mb-2">
                            Pendiente de Material ({displayPending.length})
                        </h3>
                        <div className="space-y-3">
                            {displayPending.map(ticket => (
                                <div
                                    key={ticket.id}
                                    onClick={() => handleTicketClick(ticket.id)}
                                    className="bg-orange-50/50 rounded-xl p-4 border border-orange-100 flex justify-between items-center active:scale-[0.98] transition-transform"
                                >
                                    <div>
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="text-xs font-bold text-slate-700">{ticket.client?.full_name}</span>
                                            {getStatusBadge(ticket.status)}
                                        </div>
                                        <div className="text-xs font-mono text-slate-400">
                                            {ticket.ticket_number} • {ticket.appliance_info?.brand || 'Electrodoméstico'}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        {ticket.material_deposit_pdf_url && (
                                            <a
                                                href={ticket.material_deposit_pdf_url}
                                                target="_blank"
                                                onClick={(e) => e.stopPropagation()}
                                                className="p-2 bg-orange-100 text-orange-600 rounded-lg hover:bg-orange-200 transition"
                                                title="Ver PDF del Depósito"
                                            >
                                                <FileText size={18} />
                                            </a>
                                        )}
                                        <Package size={20} className="text-orange-300" />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )
            }

            {/* HISTORY TODAY (CLOSED) */}
            {
                displayClosed.length > 0 && (
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
                                    <div className="flex items-center gap-3">
                                        {ticket.pdf_url && (
                                            <a
                                                href={ticket.pdf_url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="p-2 text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
                                                title="Ver Parte de Trabajo PDF"
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                <FileText size={18} />
                                            </a>
                                        )}
                                        <CheckCircle size={20} className="text-green-500/50" />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )
            }

            {/* Reviews Modal */}
            <TechReviewsModal
                isOpen={showReviewsModal}
                onClose={() => setShowReviewsModal(false)}
                userId={user?.id}
            />
        </div >
    );
};

export default TechDashboard;
