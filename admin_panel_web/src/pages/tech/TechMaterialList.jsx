import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { Package, ShoppingCart, CheckCircle, ExternalLink, RefreshCw, Smartphone, ClipboardCheck, Clock } from 'lucide-react';

const TechMaterialList = () => {
    const { user } = useAuth();
    const [tickets, setTickets] = useState([]);
    const [loading, setLoading] = useState(true);

    const fetchPendingMaterials = async () => {
        if (!user) return;
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('tickets')
                .select(`
                    id, ticket_number, 
                    required_parts_description, material_status_at,
                    deposit_amount, total_price, payment_method,
                    client:profiles!client_id(full_name, address),
                    appliance_info
                `)
                .eq('technician_id', user.id)
                .eq('status', 'pendiente_material')
                .eq('material_received', false) // Show pending order OR ordered but not received
                .order('material_status_at', { ascending: true });

            if (error) throw error;
            setTickets(data || []);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchPendingMaterials();
    }, [user]);

    const handleMarkAsBought = async (ticketId) => {
        const supplier = window.prompt("Introduce el nombre del proveedor donde has realizado el pedido:");
        if (supplier === null) return; // Cancelled
        if (!supplier.trim()) return alert("El nombre del proveedor es obligatorio.");

        try {
            const { error } = await supabase.from('tickets').update({
                material_ordered: true,
                material_supplier: supplier,
                material_ordered_by: user.id,
                material_status_at: new Date().toISOString()
            }).eq('id', ticketId);

            if (error) throw error;

            // Update local state to show 'Confirm Reception' button instead of removing
            setTickets(prev => prev.map(t =>
                t.id === ticketId
                    ? { ...t, material_ordered: true, material_supplier: supplier }
                    : t
            ));
        } catch (e) {
            alert("Error: " + e.message);
        }
    };

    const handleMarkAsReceived = async (ticketId) => {
        if (!window.confirm("¿Confirmas que ya tienes el repuesto contigo?")) return;

        try {
            const { error } = await supabase.from('tickets').update({
                material_received: true,
                material_received_by: user.id,
                material_status_at: new Date().toISOString()
            }).eq('id', ticketId);

            if (error) throw error;

            // Remove from list as it is now ready for assignment (Admin handles that)
            setTickets(prev => prev.filter(t => t.id !== ticketId));
        } catch (e) {
            alert("Error: " + e.message);
        }
    };

    return (
        <div className="p-4 safe-top pb-24 animate-in fade-in">
            <header className="mb-6">
                <h1 className="text-2xl font-black text-slate-800 flex items-center gap-2">
                    <Package className="text-orange-500" /> Repuestos Pendientes
                </h1>
                <p className="text-sm text-slate-500">Lista de compra y pedidos a realizar</p>
            </header>

            {loading ? (
                <div className="flex justify-center p-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500"></div></div>
            ) : tickets.length === 0 ? (
                <div className="text-center p-10 bg-white rounded-2xl shadow-sm border border-slate-100 flex flex-col items-center gap-4">
                    <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center">
                        <CheckCircle size={32} className="text-green-500" />
                    </div>
                    <h3 className="font-bold text-slate-800">¡Todo al día!</h3>
                    <p className="text-sm text-slate-400 max-w-xs">No tienes repuestos pendientes de pedir en este momento.</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {tickets.map(ticket => (
                        <div key={ticket.id} className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm relative overflow-hidden">
                            <div className="absolute top-0 left-0 w-1 h-full bg-orange-500"></div>

                            <div className="pl-3 mb-3">
                                <span className="text-xs font-bold text-orange-500 uppercase tracking-wider mb-1 block">Pedido Urgente</span>
                                <h3 className="font-bold text-lg text-slate-800 leading-tight mb-1">
                                    {ticket.required_parts_description || 'Repuesto sin especificar'}
                                </h3>
                                <p className="text-xs text-slate-500 flex items-center gap-1">
                                    <ClipboardCheck size={12} />
                                    {ticket.appliance_info?.type} {ticket.appliance_info?.brand}
                                </p>
                            </div>

                            <div className="bg-slate-50 p-3 rounded-lg mb-4 border border-slate-100">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <p className="text-[10px] uppercase font-bold text-slate-400">Cliente</p>
                                        <p className="text-sm font-bold text-slate-700">{ticket.client?.full_name}</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-[10px] uppercase font-bold text-slate-400">Servicio</p>
                                        <p className="text-sm font-mono text-slate-600">#{ticket.ticket_number}</p>
                                    </div>
                                </div>

                                {/* Financial Breakdown - Collapsible */}
                                {(ticket.deposit_amount > 0 || ticket.total_price > 0) && (
                                    <details className="mt-3 pt-3 border-t border-slate-200">
                                        <summary className="cursor-pointer text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1 hover:text-slate-600">
                                            💰 Ver Desglose Financiero
                                        </summary>
                                        <div className="mt-2 space-y-1 text-xs bg-white p-2 rounded border border-slate-200">
                                            {ticket.total_price > 0 && (
                                                <div className="flex justify-between">
                                                    <span className="text-slate-500">Total Presupuesto:</span>
                                                    <span className="font-mono font-bold text-slate-700">{ticket.total_price.toFixed(2)}€</span>
                                                </div>
                                            )}
                                            {ticket.deposit_amount > 0 && (
                                                <div className="flex justify-between text-green-700 font-bold">
                                                    <span>✅ Pagado a Cuenta:</span>
                                                    <span className="font-mono">{ticket.deposit_amount.toFixed(2)}€</span>
                                                </div>
                                            )}
                                            {(ticket.total_price > 0 && ticket.deposit_amount > 0) && (
                                                <div className="flex justify-between border-t pt-1 text-orange-700 font-bold">
                                                    <span>⏳ Saldo Pendiente:</span>
                                                    <span className="font-mono">{(ticket.total_price - ticket.deposit_amount).toFixed(2)}€</span>
                                                </div>
                                            )}
                                        </div>
                                    </details>
                                )}
                            </div>

                            {!ticket.material_ordered ? (
                                <button
                                    onClick={() => handleMarkAsBought(ticket.id)}
                                    className="w-full py-3 bg-slate-900 text-white rounded-xl font-bold text-sm shadow-lg shadow-slate-200 active:scale-[0.98] transition-transform flex items-center justify-center gap-2"
                                >
                                    <ShoppingCart size={18} className="text-orange-400" />
                                    Marcar como PEDIDO
                                </button>
                            ) : (
                                <div className="space-y-3">
                                    <div className="bg-orange-50 text-orange-800 text-xs p-3 rounded-lg border border-orange-100 flex items-center gap-2">
                                        <Clock size={14} />
                                        <span>Pedido a <strong>{ticket.material_supplier}</strong>. Esperando llegada.</span>
                                    </div>
                                    <button
                                        onClick={() => handleMarkAsReceived(ticket.id)}
                                        className="w-full py-3 bg-green-600 text-white rounded-xl font-bold text-sm shadow-lg shadow-green-200 active:scale-[0.98] transition-transform flex items-center justify-center gap-2"
                                    >
                                        <CheckCircle size={18} />
                                        Confirmar RECEPCIÓN
                                    </button>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default TechMaterialList;
