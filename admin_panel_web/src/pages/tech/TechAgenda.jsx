import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Calendar, Clock, MapPin, ChevronRight, AlertCircle } from 'lucide-react';

const TechAgenda = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [unscheduled, setUnscheduled] = useState([]);
    const [scheduledGroups, setScheduledGroups] = useState({});

    useEffect(() => {
        if (user) fetchAgenda();
    }, [user]);

    const fetchAgenda = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('tickets')
                .select('*, client:client_id(full_name, address, city)')
                .eq('technician_id', user.id)
                .in('status', ['asignado', 'en_camino', 'en_diagnostico', 'en_reparacion', 'en_espera']) // Active only
                .order('scheduled_at', { ascending: true });

            if (error) throw error;

            // Split Data
            const noDate = [];
            const withDate = {}; // { '2023-10-25': [tickets...] }

            data.forEach(t => {
                if (!t.scheduled_at) {
                    noDate.push(t);
                } else {
                    // Extract Date Key YYYY-MM-DD
                    try {
                        const d = new Date(t.scheduled_at);
                        if (!isNaN(d.getTime())) {
                            const dateKey = d.toISOString().split('T')[0];
                            if (!withDate[dateKey]) withDate[dateKey] = [];
                            withDate[dateKey].push(t);
                        } else {
                            // Invalid date treats as unscheduled
                            noDate.push(t);
                        }
                    } catch (e) {
                        noDate.push(t);
                    }
                }
            });

            setUnscheduled(noDate);
            setScheduledGroups(withDate);

        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const formatDateHeader = (dateStr) => {
        const options = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
        return new Date(dateStr).toLocaleDateString('es-ES', options);
    };

    const TicketCard = ({ ticket }) => (
        <div
            onClick={() => navigate(`/tech/ticket/${ticket.id}`)}
            className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 active:scale-[0.98] transition-transform mb-3 cursor-pointer"
        >
            <div className="flex justify-between items-start mb-2">
                <span className="font-mono text-xs font-bold text-slate-400">#{ticket.ticket_number}</span>
                {ticket.scheduled_at ? (
                    <span className="bg-slate-100 text-slate-600 text-[10px] font-bold px-2 py-1 rounded flex items-center gap-1">
                        <Clock size={12} />
                        {new Date(ticket.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        {ticket.estimated_duration && (
                            <span className="text-slate-400 font-normal">
                                - {new Date(new Date(ticket.scheduled_at).getTime() + ticket.estimated_duration * 60000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} ({ticket.estimated_duration}m)
                            </span>
                        )}
                    </span>
                ) : (
                    <span className="bg-amber-100 text-amber-700 text-[10px] font-bold px-2 py-1 rounded flex items-center gap-1">
                        <AlertCircle size={12} />
                        Sin Cita
                    </span>
                )}
            </div>

            <h3 className="font-bold text-slate-800">{ticket.client?.full_name || 'Cliente'}</h3>
            <div className="flex items-center gap-1 text-xs text-slate-500 mt-1">
                <MapPin size={12} />
                <span className="truncate">{ticket.client?.address}</span>
            </div>
            <div className="text-xs text-slate-400 mt-2">
                {ticket.appliance_info?.type} {ticket.appliance_info?.brand}
            </div>
        </div>
    );

    if (loading) return <div className="p-8 text-center text-slate-400">Cargando agenda...</div>;

    const sortedDates = Object.keys(scheduledGroups).sort();

    return (
        <div className="p-4 space-y-6 pb-24">
            <h1 className="text-2xl font-bold text-slate-800">Mi Agenda</h1>

            {/* Unscheduled Section */}
            {unscheduled.length > 0 && (
                <div className="animate-in fade-in slide-in-from-top-2">
                    <div className="flex items-center gap-2 mb-3">
                        <div className="bg-amber-100 p-1.5 rounded-lg">
                            <AlertCircle size={18} className="text-amber-600" />
                        </div>
                        <h2 className="font-bold text-slate-700">Pendientes de Agendar</h2>
                        <span className="bg-amber-100 text-amber-800 text-xs font-bold px-2 py-0.5 rounded-full">{unscheduled.length}</span>
                    </div>
                    <div>
                        {unscheduled.map(t => <TicketCard key={t.id} ticket={t} />)}
                    </div>
                </div>
            )}

            {/* Scheduled Section */}
            <div>
                {sortedDates.length === 0 && unscheduled.length === 0 ? (
                    <div className="text-center py-10 bg-white rounded-xl border border-slate-100">
                        <Calendar size={48} className="mx-auto text-slate-300 mb-2" />
                        <p className="text-slate-500">No tienes servicios asignados.</p>
                    </div>
                ) : (
                    sortedDates.map(date => (
                        <div key={date} className="mb-6">
                            <div className="flex items-center gap-2 mb-3 sticky top-[70px] bg-slate-50/95 py-2 backdrop-blur-sm z-10">
                                <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                                <h2 className="font-bold text-slate-700 capitalize">
                                    {formatDateHeader(date)}
                                </h2>
                            </div>
                            <div>
                                {scheduledGroups[date].map(t => <TicketCard key={t.id} ticket={t} />)}
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};

export default TechAgenda;
