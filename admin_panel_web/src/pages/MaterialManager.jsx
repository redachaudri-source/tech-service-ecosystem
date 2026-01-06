import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { Package, Search, Clock, CheckCircle, AlertTriangle, History, ArrowRight, FileText } from 'lucide-react';
import SmartAssignmentModal from '../components/SmartAssignmentModal';

const MaterialManager = () => {
    const { user } = useAuth();
    const [tickets, setTickets] = useState([]);
    const [loading, setLoading] = useState(true);
    const [tab, setTab] = useState('pending'); // 'pending' | 'history'
    const [selectedTicket, setSelectedTicket] = useState(null); // For assignment

    const fetchTickets = async () => {
        setLoading(true);
        try {
            let query = supabase
                .from('tickets')
                .select(`
                    *,
                    client:profiles!client_id(full_name, phone, address),
                    tech:profiles!technician_id(full_name)
                `)
                .order('material_status_at', { ascending: false });

            // Status Filter Logic
            // If tab is pending, we strictly want 'pendiente_material'
            // If tab is history, we want tickets that WERE pending material but moved on. 
            // Since we don't have a specific "Was Pending Material" flag, we can infer by checking if 'material_status_at' is NOT NULL 
            // AND status is NOT 'pendiente_material'. 
            // This is a heuristic. For better precision, we rely on 'material_status_at' presence.

            if (tab === 'pending') {
                query = query.eq('status', 'pendiente_material');
            } else {
                query = query.neq('status', 'pendiente_material').not('material_status_at', 'is', null);
            }

            const { data, error } = await query;
            if (error) throw error;
            setTickets(data || []);

        } catch (error) {
            console.error('Error fetching materials:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchTickets();

        // Realtime Subscription
        const channel = supabase.channel('material_updates')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'tickets' }, (payload) => {
                // Simple refresh on any change to keep it sync
                fetchTickets();
            })
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, [tab]);

    const handleMaterialReceived = (ticket) => {
        // We simply open the SmartAssignmentModal. 
        // Logic: When modal completes (assigns new date), the status becomes 'asignado' or 'solicitado'.
        // This naturally removes it from 'pending' list.
        setSelectedTicket(ticket);
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-slate-800 flex items-center gap-3">
                        <Package className="text-orange-500" size={32} />
                        Gestión de Materiales
                    </h1>
                    <p className="text-slate-500 mt-1">
                        Control de servicios en pausa por espera de repuestos.
                    </p>
                </div>

                {/* Tabs */}
                <div className="flex p-1 bg-slate-100 rounded-lg">
                    <button
                        onClick={() => setTab('pending')}
                        className={`px-4 py-2 rounded-md text-sm font-bold transition-all ${tab === 'pending' ? 'bg-white shadow text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        Pendientes ({tickets.length})
                    </button>
                    <button
                        onClick={() => setTab('history')}
                        className={`px-4 py-2 rounded-md text-sm font-bold transition-all ${tab === 'history' ? 'bg-white shadow text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        Histórico
                    </button>
                </div>
            </div>

            {/* Content */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                {loading ? (
                    <div className="p-10 text-center text-slate-400">Cargando datos...</div>
                ) : tickets.length === 0 ? (
                    <div className="p-12 text-center flex flex-col items-center gap-3">
                        <div className="bg-slate-50 p-4 rounded-full">
                            <Package size={32} className="text-slate-300" />
                        </div>
                        <h3 className="text-lg font-bold text-slate-600">
                            {tab === 'pending' ? 'No hay servicios esperando material' : 'No hay histórico de materiales'}
                        </h3>
                        <p className="text-slate-400 text-sm max-w-sm">
                            {tab === 'pending'
                                ? 'Todo está al día. Cuando un técnico solicite una pieza, aparecerá aquí.'
                                : 'Aquí aparecerán los servicios que requirieron material en el pasado.'}
                        </p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="bg-slate-50 border-b border-slate-200">
                                <tr>
                                    <th className="px-6 py-4 font-semibold text-slate-600">Servicio</th>
                                    <th className="px-6 py-4 font-semibold text-slate-600">Pieza Solicitada</th>
                                    <th className="px-6 py-4 font-semibold text-slate-600">Pago a Cuenta</th>
                                    <th className="px-6 py-4 font-semibold text-slate-600">Tiempo en Espera</th>
                                    <th className="px-6 py-4 font-semibold text-slate-600 text-right">Acciones</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {tickets.map(ticket => (
                                    <tr key={ticket.id} className="hover:bg-slate-50 transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="font-bold text-slate-900">#{ticket.ticket_number}</div>
                                            <div className="text-sm text-slate-500">{ticket.client?.full_name}</div>
                                            <div className="text-xs text-slate-400 mt-1">{ticket.appliance_info?.type} {ticket.appliance_info?.brand}</div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="bg-orange-50 text-orange-800 px-3 py-2 rounded-lg text-sm font-medium border border-orange-100 inline-block max-w-xs truncate" title={ticket.required_parts_description}>
                                                {ticket.required_parts_description || 'Sin descripción'}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="font-mono font-bold text-slate-700">
                                                {ticket.deposit_amount ? `${ticket.deposit_amount}€` : '-'}
                                            </div>
                                            {ticket.deposit_amount > 0 && (
                                                <div className="text-[10px] text-green-600 flex items-center gap-1 font-bold mt-1">
                                                    <CheckCircle size={10} /> PAGADO
                                                </div>
                                            )}
                                            {ticket.deposit_receipt_url && (
                                                <a
                                                    href={ticket.deposit_receipt_url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-[10px] text-blue-500 font-bold hover:text-blue-700 flex items-center gap-1 mt-1 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100 w-fit"
                                                >
                                                    <FileText size={10} /> Recibo
                                                </a>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-sm text-slate-500">
                                            {ticket.material_status_at ? (
                                                <div className="flex items-center gap-2">
                                                    <Clock size={14} className="text-slate-400" />
                                                    {new Date(ticket.material_status_at).toLocaleDateString()}
                                                </div>
                                            ) : '-'}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            {tab === 'pending' ? (
                                                <button
                                                    onClick={() => handleMaterialReceived(ticket)}
                                                    className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-green-600/20 shadow-lg hover:bg-green-700 transition flex items-center gap-2 ml-auto"
                                                >
                                                    <CheckCircle size={16} />
                                                    Recibido y Citar
                                                </button>
                                            ) : (
                                                <div className="text-xs text-slate-400 font-medium bg-slate-100 px-2 py-1 rounded inline-block">
                                                    YA PROCESADO
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Smart Assignment Modal */}
            {selectedTicket && (
                <SmartAssignmentModal
                    ticket={selectedTicket}
                    onClose={() => setSelectedTicket(null)}
                    onSuccess={() => {
                        fetchTickets(); // Refresh list (item should disappear)
                        setSelectedTicket(null);
                        // Optional: Show success toast or alert
                        // alert('Servicio reactivado y cita asignada.'); 
                    }}
                />
            )}
        </div>
    );
};

export default MaterialManager;
