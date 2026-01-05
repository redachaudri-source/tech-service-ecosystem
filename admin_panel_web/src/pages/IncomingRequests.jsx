import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Clock, User, CheckCircle, AlertCircle, Calendar, Wrench, X, TrendingUp, Search } from 'lucide-react';
import SmartAssignmentModal from '../components/SmartAssignmentModal';

const IncomingRequests = () => {
    const [tickets, setTickets] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedTicket, setSelectedTicket] = useState(null);

    const [isConnected, setIsConnected] = useState(false);

    const fetchData = async () => {
        try {
            const { data: ticketData } = await supabase
                .from('tickets')
                .select(`*, client:profiles!client_id (*)`)
                .eq('status', 'solicitado')
                .order('created_at', { ascending: false });

            setTickets(ticketData || []);
        } catch (error) {
            console.error('Error fetching data:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();

        // Realtime Subscription
        const channel = supabase.channel('incoming_requests_monitor')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'tickets' }, () => {
                fetchData();
            })
            .subscribe((status) => {
                setIsConnected(status === 'SUBSCRIBED');
            });

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    // closeModal is simple now
    const closeModal = () => setSelectedTicket(null);

    if (loading) return <div className="p-8 text-center text-slate-500">Cargando solicitudes...</div>;

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-3">
                        Solicitudes Web
                        {isConnected && (
                            <span className="flex items-center gap-1 text-[10px] bg-green-100 text-green-600 px-2 py-0.5 rounded-full border border-green-200 animate-pulse">
                                <span className="w-1.5 h-1.5 bg-green-500 rounded-full"></span>
                                EN VIVO
                            </span>
                        )}
                    </h1>
                    <p className="text-slate-500">Gestina citas y asignaciones inteligentes.</p>
                </div>
                <div className="bg-blue-50 text-blue-700 px-4 py-2 rounded-lg font-medium border border-blue-100 flex items-center gap-2">
                    <Clock size={20} />
                    {tickets.length} Pendientes
                </div>
            </div>

            {/* Ticket List */}
            <div className="grid grid-cols-1 gap-4">
                {tickets.map(ticket => (
                    <div key={ticket.id} className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex flex-col md:flex-row justify-between gap-6 hover:shadow-md transition">
                        {/* Info Block (Same as before) */}
                        <div className="flex-1 space-y-4">
                            <div className="flex items-start justify-between">
                                <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                                    <Wrench size={20} className="text-blue-500" />
                                    {ticket.appliance_info?.type} - {ticket.appliance_info?.brand}
                                    <span className="text-xs font-normal text-slate-400 ml-2">#{ticket.ticket_number}</span>
                                </h3>
                                <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded font-bold uppercase tracking-wider">
                                    Solicitud Web
                                </span>
                            </div>
                            <p className="text-slate-600 bg-slate-50 p-3 rounded-lg border border-slate-100">
                                "{ticket.description_failure}"
                            </p>
                            <div className="flex items-center gap-6 text-sm text-slate-500">
                                <div className="flex items-center gap-2">
                                    <User size={16} />
                                    <span className="font-medium text-slate-700">{ticket.client?.full_name}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Calendar size={16} />
                                    <span>{new Date(ticket.created_at).toLocaleDateString()}</span>
                                </div>
                            </div>
                        </div>

                        {/* Action Block */}
                        <div className="flex items-center justify-end border-l border-slate-100 pl-6 md:w-48">
                            <button
                                onClick={() => setSelectedTicket(ticket)}
                                className="w-full bg-slate-900 text-white py-2 px-4 rounded-lg hover:bg-slate-800 transition shadow-lg shadow-slate-900/10 font-medium"
                            >
                                Asignar Cita
                            </button>
                        </div>
                    </div>
                ))}
                {tickets.length === 0 && (
                    <div className="p-12 text-center text-slate-400 italic">No hay solicitudes pendientes.</div>
                )}
            </div>

            {/* Smart Assignment Modal */}
            {
                selectedTicket && (
                    <SmartAssignmentModal
                        ticket={selectedTicket}
                        onClose={closeModal}
                        onSuccess={() => {
                            fetchData();
                            closeModal();
                            alert('Técnico asignado y cita propuesta correctamente.');
                        }}
                    />
                )
            }
        </div >
    );
};

export default IncomingRequests;
