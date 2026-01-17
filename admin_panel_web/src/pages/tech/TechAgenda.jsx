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

    // Filters
    const [viewRange, setViewRange] = useState('week'); // week, fortnight, month
    const [typeFilter, setTypeFilter] = useState('Todos');

    useEffect(() => {
        if (user) fetchAgenda();
    }, [user, viewRange]); // Refetch when range changes

    const fetchAgenda = async () => {
        setLoading(true);
        try {
            // Calculate date range
            const start = new Date();
            start.setHours(0, 0, 0, 0);

            const end = new Date();
            if (viewRange === 'week') end.setDate(end.getDate() + 7);
            else if (viewRange === 'fortnight') end.setDate(end.getDate() + 15);
            else if (viewRange === 'month') end.setMonth(end.getMonth() + 1);

            const { data, error } = await supabase
                .from('tickets')
                .select('*, client:client_id(full_name, address, city)')
                .eq('technician_id', user.id)
                .in('status', ['asignado', 'en_camino', 'en_diagnostico', 'en_reparacion', 'en_espera']) // Active only
                .gte('scheduled_at', start.toISOString())
                .lte('scheduled_at', end.toISOString())
                .order('scheduled_at', { ascending: true });

            if (error) throw error;

            // Process Data & Apply Type Filter in memory
            const noDate = [];
            const withDate = {};

            data.forEach(t => {
                // Type Filter Logic
                const tType = t.appliance_info?.type || 'Otro';
                if (typeFilter !== 'Todos' && !tType.includes(typeFilter)) return;

                const d = new Date(t.scheduled_at);
                const dateKey = d.toISOString().split('T')[0];
                if (!withDate[dateKey]) withDate[dateKey] = [];
                withDate[dateKey].push(t);
            });

            // Also fetch unscheduled if needed? No, let's keep unscheduled separate or always fetch them.
            // For now, only showing scheduled in the range view.

            setScheduledGroups(withDate);

        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const formatDateHeader = (dateStr) => {
        const options = { weekday: 'long', day: 'numeric', month: 'long' };
        return new Date(dateStr).toLocaleDateString('es-ES', options);
    };

    const TicketCard = ({ ticket }) => (
        <div
            onClick={() => navigate(`/tech/ticket/${ticket.id}`)}
            className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 active:scale-[0.98] transition-transform mb-3 cursor-pointer"
        >
            <div className="flex justify-between items-start mb-2">
                <span className="font-mono text-xs font-bold text-slate-400">#{ticket.ticket_number}</span>
                <span className="bg-slate-100 text-slate-600 text-[10px] font-bold px-2 py-1 rounded flex items-center gap-1">
                    <Clock size={12} />
                    {new Date(ticket.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
            </div>

            <h3 className="font-bold text-slate-800">{ticket.client?.full_name || 'Cliente'}</h3>
            <div className="flex items-center gap-1 text-xs text-slate-500 mt-1">
                <MapPin size={12} />
                <span className="truncate">{ticket.client?.address}</span>
            </div>
            <div className="flex justify-between items-center mt-3 pt-3 border-t border-slate-50">
                <div className="text-xs font-bold text-blue-600">
                    {ticket.appliance_info?.type} {ticket.appliance_info?.brand}
                </div>
                <ChevronRight size={14} className="text-slate-300" />
            </div>
        </div>
    );

    const sortedDates = Object.keys(scheduledGroups).sort();

    return (
        <div className="p-4 space-y-6 pb-24">
            <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold text-slate-800">Mi Agenda</h1>
                <div className="flex bg-slate-100 rounded-lg p-1">
                    <button onClick={() => setViewRange('week')} className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${viewRange === 'week' ? 'bg-white shadow text-blue-600' : 'text-slate-500'}`}>7D</button>
                    <button onClick={() => setViewRange('fortnight')} className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${viewRange === 'fortnight' ? 'bg-white shadow text-blue-600' : 'text-slate-500'}`}>15D</button>
                    <button onClick={() => setViewRange('month')} className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${viewRange === 'month' ? 'bg-white shadow text-blue-600' : 'text-slate-500'}`}>30D</button>
                </div>
            </div>

            {/* Type Filters */}
            <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
                {['Todos', 'Lavadora', 'Frigorífico', 'Lavavajillas', 'Horno', 'Aire'].map((f) => (
                    <button
                        key={f}
                        onClick={() => { setTypeFilter(f); fetchAgenda(); }} // Simple re-trigger or useEffect dep? Better separate active filter
                        className={`px-4 py-2 rounded-xl border text-xs font-bold whitespace-nowrap transition-colors shadow-sm ${typeFilter === f ? 'bg-slate-800 text-white border-slate-800' : 'bg-white border-slate-200 text-slate-600'}`}
                    >
                        {f}
                    </button>
                ))}
            </div>

            {/* Scheduled Section */}
            <div>
                {loading ? (
                    <div className="p-8 text-center text-slate-400"><div className="animate-spin h-6 w-6 border-2 border-blue-500 rounded-full border-t-transparent mx-auto mb-2"></div>Cargando...</div>
                ) : sortedDates.length === 0 ? (
                    <div className="text-center py-10 bg-white rounded-xl border border-slate-100">
                        <Calendar size={48} className="mx-auto text-slate-300 mb-2" />
                        <p className="text-slate-500">No hay servicios en este periodo.</p>
                    </div>
                ) : (
                    sortedDates.map(date => (
                        <div key={date} className="mb-6">
                            <div className="flex items-center gap-2 mb-3 sticky top-[70px] bg-slate-50/95 py-2 backdrop-blur-sm z-10">
                                <span className="text-2xl font-black text-slate-200 leading-none">{new Date(date).getDate()}</span>
                                <div>
                                    <h2 className="font-bold text-slate-700 capitalize text-sm leading-tight">
                                        {formatDateHeader(date)}
                                    </h2>
                                    <p className="text-[10px] text-slate-400 font-bold uppercase">{scheduledGroups[date].length} Servicios</p>
                                </div>
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
