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
    const [subTab, setSubTab] = useState('to_order'); // 'to_order' | 'ordered' (Only for pending)
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
                fetchTickets();
            })
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, [tab]);

    const handleMaterialReceived = (ticket) => {
        setSelectedTicket(ticket);
    };

    const handleMarkAsOrdered = async (ticket) => {
        const supplier = prompt("Introduce el nombre del proveedor donde has realizado el pedido:", ticket.material_supplier || "");
        if (supplier === null) return; // Cancelled
        if (!supplier.trim()) {
            alert("El nombre del proveedor es obligatorio.");
            return;
        }

        try {
            const { error } = await supabase
                .from('tickets')
                .update({
                    material_ordered: true,
                    material_supplier: supplier,
                    material_ordered_by: user.id,
                    material_status_at: new Date().toISOString()
                })
                .eq('id', ticket.id);

            if (error) throw error;
            fetchTickets();
        } catch (error) {
            console.error(error);
            alert('Error al actualizar: ' + error.message);
        }
    };

    const handleForceReception = async (ticket) => {
        if (!window.confirm("¿Estás seguro de que quieres forzar la recepción? Esto marcará el material como recibido por la oficina.")) return;

        try {
            const { error } = await supabase
                .from('tickets')
                .update({
                    material_received: true,
                    material_received_by: user.id,
                    material_status_at: new Date().toISOString()
                })
                .eq('id', ticket.id);

            if (error) throw error;
            fetchTickets();
        } catch (error) {
            console.error(error);
            alert('Error al forzar recepción: ' + error.message);
        }
    };

    // Filter Logic for Display
    const displayedTickets = tickets.filter(t => {
        if (tab === 'history') return true;
        // In pending, filter by subTab
        if (subTab === 'to_order') return !t.material_ordered;
        if (subTab === 'ordered') return t.material_ordered && !t.material_received;
        if (subTab === 'received') return t.material_received;
        return true;
    });

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Header and Tabs are already correct */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-slate-800 flex items-center gap-3">
                        <Package className="text-orange-500" size={32} />
                        Gestión de Materiales
                    </h1>
                    <p className="text-slate-500 mt-1">
                        Control de pedidos y recepción de repuestos.
                    </p>
                </div>

                {/* Main Tabs */}
                <div className="flex p-1 bg-slate-100 rounded-lg">
                    <button
                        onClick={() => setTab('pending')}
                        className={`px-4 py-2 rounded-md text-sm font-bold transition-all ${tab === 'pending' ? 'bg-white shadow text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        En Curso
                    </button>
                    <button
                        onClick={() => setTab('history')}
                        className={`px-4 py-2 rounded-md text-sm font-bold transition-all ${tab === 'history' ? 'bg-white shadow text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        Histórico
                    </button>
                </div>
            </div>

            {/* Sub Tabs (Only for Pending) */}
            {tab === 'pending' && (
                <div className="flex gap-2 border-b border-slate-200 pb-1 overflow-x-auto">
                    <button
                        onClick={() => setSubTab('to_order')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-t-lg text-sm font-bold border-b-2 transition-all whitespace-nowrap ${subTab === 'to_order' ? 'border-red-500 text-red-600 bg-red-50' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                    >
                        <AlertTriangle size={16} />
                        Por Pedir
                        <span className="bg-red-200 text-red-800 text-[10px] px-1.5 py-0.5 rounded-full ml-1">
                            {tickets.filter(t => !t.material_ordered).length}
                        </span>
                    </button>
                    <button
                        onClick={() => setSubTab('ordered')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-t-lg text-sm font-bold border-b-2 transition-all whitespace-nowrap ${subTab === 'ordered' ? 'border-orange-500 text-orange-600 bg-orange-50' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                    >
                        <Clock size={16} />
                        En Curso (Esperando)
                        <span className="bg-orange-200 text-orange-800 text-[10px] px-1.5 py-0.5 rounded-full ml-1">
                            {tickets.filter(t => t.material_ordered && !t.material_received).length}
                        </span>
                    </button>
                    <button
                        onClick={() => setSubTab('received')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-t-lg text-sm font-bold border-b-2 transition-all whitespace-nowrap ${subTab === 'received' ? 'border-green-500 text-green-600 bg-green-50' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                    >
                        <CheckCircle size={16} />
                        Recibidos (Listo para Asignar)
                        <span className="bg-green-200 text-green-800 text-[10px] px-1.5 py-0.5 rounded-full ml-1">
                            {tickets.filter(t => t.material_received).length}
                        </span>
                    </button>
                </div>
            )}

            {/* Content */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                {loading ? (
                    <div className="p-10 text-center text-slate-400">Cargando datos...</div>
                ) : displayedTickets.length === 0 ? (
                    <div className="p-12 text-center flex flex-col items-center gap-3">
                        <div className="bg-slate-50 p-4 rounded-full">
                            <Package size={32} className="text-slate-300" />
                        </div>
                        <h3 className="text-lg font-bold text-slate-600">
                            No hay servicios en esta lista
                        </h3>
                        <p className="text-slate-400 text-sm max-w-sm">
                            {tab === 'pending' && subTab === 'to_order' ? '¡Genial! No tienes materiales pendientes de pedir.' : ''}
                            {tab === 'pending' && subTab === 'ordered' ? 'No hay pedidos esperando llegada.' : ''}
                            {tab === 'pending' && subTab === 'received' ? 'No hay repuestos recibidos pendientes de asignar.' : ''}
                        </p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="bg-slate-50 border-b border-slate-200">
                                <tr>
                                    <th className="px-6 py-4 font-semibold text-slate-600">Servicio</th>
                                    <th className="px-6 py-4 font-semibold text-slate-600">Pieza Solicitada</th>
                                    <th className="px-6 py-4 font-semibold text-slate-600">Estado Pedido</th>
                                    <th className="px-6 py-4 font-semibold text-slate-600 text-right">Acciones</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {displayedTickets.map(ticket => (
                                    <tr key={ticket.id} className="hover:bg-slate-50 transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="font-bold text-slate-900">#{ticket.ticket_number}</div>
                                            <div className="text-sm text-slate-500">{ticket.client?.full_name}</div>
                                            <div className="text-xs text-slate-400 mt-1">{ticket.appliance_info?.type} {ticket.appliance_info?.brand}</div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="bg-slate-100 px-3 py-2 rounded-lg text-sm font-medium border border-slate-200 inline-block max-w-xs" title={ticket.required_parts_description}>
                                                {ticket.required_parts_description || 'Sin descripción'}
                                            </div>
                                            {/* Receipt Link */}
                                            {ticket.deposit_receipt_url && (
                                                <a
                                                    href={ticket.deposit_receipt_url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="flex items-center gap-1 mt-2 text-[10px] text-blue-500 font-bold hover:underline"
                                                >
                                                    <FileText size={12} /> Ver Recibo Señal
                                                </a>
                                            )}
                                        </td>
                                        <td className="px-6 py-4">
                                            {!ticket.material_ordered ? (
                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-red-100 text-red-700 border border-red-200">
                                                    <AlertTriangle size={12} />
                                                    PENDIENTE PEDIR
                                                </span>
                                            ) : !ticket.material_received ? (
                                                <div className="flex flex-col items-start gap-1">
                                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-orange-100 text-orange-700 border border-orange-200">
                                                        <Clock size={12} />
                                                        ESPERANDO TÉCNICO
                                                    </span>
                                                    {ticket.material_supplier && (
                                                        <span className="text-xs text-slate-500 font-medium ml-1">
                                                            Prov: {ticket.material_supplier}
                                                        </span>
                                                    )}
                                                </div>
                                            ) : (
                                                <div className="flex flex-col items-start gap-1">
                                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-green-100 text-green-700 border border-green-200">
                                                        <CheckCircle size={12} />
                                                        RECIBIDO EN TALLER
                                                    </span>
                                                    <span className="text-xs text-slate-500 font-medium ml-1">
                                                        Listo para asignar
                                                    </span>
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            {tab === 'history' ? (
                                                <span className="text-xs text-slate-400 font-bold">COMPLETADO</span>
                                            ) : (
                                                <div className="flex justify-end gap-2">
                                                    {!ticket.material_ordered && (
                                                        <button
                                                            onClick={() => handleMarkAsOrdered(ticket)}
                                                            className="bg-slate-900 text-white px-3 py-2 rounded-lg text-xs font-bold hover:bg-slate-800 transition shadow-sm"
                                                        >
                                                            Marcar Pedido
                                                        </button>
                                                    )}

                                                    {(ticket.material_ordered && !ticket.material_received) && (
                                                        <div className="flex items-center gap-2">
                                                            <button
                                                                onClick={() => handleMarkAsOrdered(ticket)} // Allow verify/edit supplier
                                                                className="text-slate-400 hover:text-slate-600 p-2"
                                                                title="Editar Proveedor"
                                                            >
                                                                <FileText size={16} />
                                                            </button>
                                                            <span className="text-xs font-bold text-orange-400">
                                                                Esperando al Técnico...
                                                            </span>
                                                            <button
                                                                onClick={() => handleForceReception(ticket)}
                                                                className="ml-2 bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-800 px-2 py-1 rounded text-xs transition border border-slate-300 font-bold"
                                                                title="Forzar Recepción (Oficina)"
                                                            >
                                                                Forzar Rx
                                                            </button>
                                                        </div>
                                                    )}

                                                    {ticket.material_received && (
                                                        <button
                                                            onClick={() => handleMaterialReceived(ticket)}
                                                            className="bg-green-600 text-white px-3 py-2 rounded-lg text-xs font-bold hover:bg-green-700 transition shadow-green-200 flex items-center gap-1"
                                                        >
                                                            <CheckCircle size={14} />
                                                            Asignar Cita
                                                        </button>
                                                    )}
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
                        fetchTickets();
                        setSelectedTicket(null);
                    }}
                />
            )}
        </div>
    );
};

export default MaterialManager;
