import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import CreateBudgetModal from '../../components/CreateBudgetModal';
import AcceptBudgetModal from '../../components/AcceptBudgetModal';
import SmartAssignmentModal from '../../components/SmartAssignmentModal';
import { FileText, Search, Plus, Trash2, CheckCircle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';

const BudgetRegistry = () => {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filterSource, setFilterSource] = useState('all'); // all, admin, tech
    const [searchTerm, setSearchTerm] = useState('');
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [selectedBudgetToAccept, setSelectedBudgetToAccept] = useState(null);
    const [selectedTicketToAssign, setSelectedTicketToAssign] = useState(null);

    useEffect(() => {
        fetchData();

        // Realtime Subscription
        const budgetSub = supabase
            .channel('budget-registry-changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'budgets' }, () => {
                fetchData();
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'tickets' }, () => {
                fetchData();
            })
            .subscribe();

        return () => {
            supabase.removeChannel(budgetSub);
        };
    }, []);

    const fetchData = async () => {
        try {
            setLoading(true);

            // 1. Fetch Admin Budgets
            const { data: adminBudgets, error: adminError } = await supabase
                .from('budgets')
                .select(`*, profiles:client_id(full_name), ticket:tickets!converted_ticket_id(status)`)
                .order('created_at', { ascending: false });

            if (adminError) throw adminError;

            // 2. Fetch Tech Tickets (Quotes)
            // Get tickets that are in budget status OR have a quote PDF
            const { data: techTickets, error: techError } = await supabase
                .from('tickets')
                .select(`*, profiles:client_id(full_name)`)
                .or('status.eq.presupuesto_pendiente,status.eq.presupuesto_aceptado,status.eq.presupuesto_revision,quote_pdf_url.neq.null')
                .order('created_at', { ascending: false });

            if (techError) throw techError;

            // 3. Merging Logic (The "PT" Concept)
            // Create a lookup for budgets that have been converted to tickets
            const budgetMap = {}; // ticket_id -> budget_obj
            const convertedBudgetIds = new Set();

            (adminBudgets || []).forEach(b => {
                if (b.converted_ticket_id) {
                    budgetMap[b.converted_ticket_id] = b;
                    convertedBudgetIds.add(b.id);
                }
            });

            // 4. Normalize & Filter
            const normalizeItem = (item, type) => {
                // If it's a Budget that has been converted (P-1 -> T-25), we SKIP it here
                // We will handle it when processing the Ticket (T-25) to show as PT-1
                if (type === 'admin' && item.converted_ticket_id) return null;

                // Process Ticket
                if (type === 'tech') {
                    const linkedBudget = budgetMap[item.id];
                    if (linkedBudget) {
                        // This is a "Unified" PT item
                        return {
                            id: item.id,
                            source: 'unified', // New Source
                            original_budget_id: linkedBudget.id, // Keep ref
                            number: 'PT-' + linkedBudget.budget_number, // User Request: PT Numbering
                            client_name: item.profiles?.full_name || 'Desconocido',
                            date: item.quote_generated_at || item.created_at,
                            total: calculateTicketTotal(item), // Use current ticket real total
                            status: item.status,
                            pdf_url: item.quote_pdf_url || linkedBudget.pdf_url, // Prefer ticket PDF (final), fallback to budget
                            raw: item,
                            is_unified: true
                        };
                    }
                }

                return {
                    id: item.id,
                    source: type,
                    number: type === 'admin' ? 'P-' + item.budget_number : 'T-' + item.ticket_number,
                    client_name: item.profiles?.full_name || 'Desconocido',
                    date: type === 'admin' ? item.created_at : (item.quote_generated_at || item.created_at),
                    total: type === 'admin' ? item.total_amount : calculateTicketTotal(item),
                    status: item.status,
                    pdf_url: type === 'admin' ? item.pdf_url : item.quote_pdf_url,
                    raw: item,
                    is_unified: false
                };
            };

            const allItems = [
                ...(adminBudgets || []).map(b => normalizeItem(b, 'admin')),
                ...(techTickets || []).map(t => normalizeItem(t, 'tech'))
            ].filter(Boolean); // Remove nulls (hidden converted budgets)

            setItems(allItems.sort((a, b) => new Date(b.date) - new Date(a.date)));

        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const calculateTicketTotal = (t) => {
        try {
            let parts = Array.isArray(t.parts_list) ? t.parts_list : JSON.parse(t.parts_list || '[]');
            let labor = Array.isArray(t.labor_list) ? t.labor_list : JSON.parse(t.labor_list || '[]');
            const pTotal = parts.reduce((acc, i) => acc + (Number(i.price || 0) * Number(i.qty || 1)), 0);
            const lTotal = labor.reduce((acc, i) => acc + (Number(i.price || 0) * Number(i.qty || 1)), 0);
            return (pTotal + lTotal) * 1.21;
        } catch (e) { return 0; }
    };

    const filteredItems = items.filter(item => {
        const matchesSource = filterSource === 'all' ||
            (filterSource === 'admin' && (item.source === 'admin' || item.source === 'unified')) ||
            (item.source === filterSource);

        const matchesSearch = item.client_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            item.number.toLowerCase().includes(searchTerm.toLowerCase());
        return matchesSource && matchesSearch;
    });

    const getStatusBadge = (status, source, isUnified) => {
        if (isUnified) {
            // Show Ticket Status but with PT styling
            // Show Ticket Status but with PT styling
            const isFinished = ['finalizado', 'pagado'].includes(status);

            return (
                <div className="flex flex-col items-center">
                    <span className={`text-xs px-2 py-1 rounded-full font-bold mb-0.5 uppercase tracking-tighter ${isFinished ? 'bg-green-100 text-green-800' : 'bg-purple-100 text-purple-800'
                        }`}>
                        {isFinished ? 'ACEPTADO (FIN)' : status.replace(/_/g, ' ')}
                    </span>
                    <span className={`text-[9px] font-bold ${isFinished ? 'text-green-600' : 'text-purple-400'}`}>
                        {isFinished ? 'PT / COMPLETADO' : 'PT / EN PROCESO'}
                    </span>
                </div>
            );
        }

        if (source === 'admin') {
            switch (status) {
                case 'pending': return <span className="bg-yellow-100 text-yellow-800 text-xs px-2 py-1 rounded-full font-bold">Pendiente</span>;
                case 'accepted': return <span className="bg-green-100 text-green-800 text-xs px-2 py-1 rounded-full font-bold">Aceptado</span>;
                default: return <span className="bg-slate-100 text-slate-600 text-xs px-2 py-1 rounded-full font-bold">{status}</span>;
            }
        }
        // Tech / Ticket statuses
        switch (status) {
            case 'presupuesto_pendiente': return <span className="bg-yellow-100 text-yellow-800 text-xs px-2 py-1 rounded-full font-bold">Pendiente</span>;
            case 'presupuesto_aceptado': return <span className="bg-green-100 text-green-800 text-xs px-2 py-1 rounded-full font-bold">Aceptado</span>;
            case 'presupuesto_revision': return <span className="bg-red-100 text-red-800 text-xs px-2 py-1 rounded-full font-bold">Caducado</span>;
            default: return <span className="bg-slate-100 text-slate-600 text-xs px-2 py-1 rounded-full font-bold">{status}</span>;
        }
    };

    const formatDateSafe = (dateString) => {
        if (!dateString) return '-';
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return '-';
        return date.toLocaleDateString();
    };

    const formatDistanceSafe = (dateString) => {
        if (!dateString) return '';
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return '';
        try {
            return formatDistanceToNow(date, { addSuffix: true, locale: es });
        } catch (e) {
            return '';
        }
    };

    const handleDelete = async (id, source) => {
        if (source !== 'admin') {
            alert('No se pueden eliminar solicitudes de App desde aquí. Ve a "Solicitudes Web".');
            return;
        }

        if (window.confirm('¿Seguro que quieres eliminar este presupuesto permanentemente?')) {
            try {
                const { error } = await supabase.from('budgets').delete().eq('id', id);
                if (error) throw error;
                fetchData(); // Refresh
            } catch (err) {
                alert('Error al eliminar: ' + err.message);
            }
        }
    };

    return (
        <div className="p-8">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-2xl font-black text-slate-800 flex items-center gap-3">
                        <FileText className="text-blue-600" size={32} />
                        Registro de Presupuestos
                    </h1>
                    <p className="text-slate-500 mt-1">Gestión Unificada: Oficina (P-) y App Técnicos (T-)</p>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={() => setFilterSource('all')}
                        className={`px-4 py-2 rounded-lg font-bold text-sm transition ${filterSource === 'all' ? 'bg-slate-800 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
                    >
                        Todos
                    </button>
                    <button
                        onClick={() => setFilterSource('admin')}
                        className={`px-4 py-2 rounded-lg font-bold text-sm transition ${filterSource === 'admin' ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 hover:bg-blue-50'}`}
                    >
                        Oficina (Admin)
                    </button>
                    <button
                        onClick={() => setFilterSource('tech')}
                        className={`px-4 py-2 rounded-lg font-bold text-sm transition ${filterSource === 'tech' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 hover:bg-indigo-50'}`}
                    >
                        App Técnicos
                    </button>
                </div>
            </div>

            <div className="flex justify-between mb-6">
                <div className="relative w-96">
                    <Search className="absolute left-3 top-3 text-slate-400" size={20} />
                    <input
                        type="text"
                        placeholder="Buscar por Nº o Cliente..."
                        className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>

                <button
                    onClick={() => setShowCreateModal(true)}
                    className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition font-bold shadow-lg shadow-blue-500/20"
                >
                    <Plus size={20} />
                    Crear Presupuesto (Oficina)
                </button>
            </div>

            {/* Content */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <table className="w-full">
                    <thead className="bg-slate-50 border-b border-slate-100 text-left">
                        <tr>
                            <th className="p-4 text-xs font-bold text-slate-500 uppercase">Origen</th>
                            <th className="p-4 text-xs font-bold text-slate-500 uppercase">Fecha</th>
                            <th className="p-4 text-xs font-bold text-slate-500 uppercase">Referencia</th>
                            <th className="p-4 text-xs font-bold text-slate-500 uppercase">Cliente</th>
                            <th className="p-4 text-xs font-bold text-slate-500 uppercase text-right">Importe</th>
                            <th className="p-4 text-xs font-bold text-slate-500 uppercase text-center">Estado</th>
                            <th className="p-4 text-xs font-bold text-slate-500 uppercase text-right">Acciones</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {loading ? (
                            <tr><td colSpan="7" className="p-8 text-center text-slate-400">Cargando registros...</td></tr>
                        ) : filteredItems.length === 0 ? (
                            <tr><td colSpan="7" className="p-8 text-center text-slate-400">No se encontraron presupuestos.</td></tr>
                        ) : (
                            filteredItems.map(item => (
                                <tr key={`${item.source}-${item.id}`} className="hover:bg-slate-50 transition">
                                    <td className="p-4">
                                        <span className={`text-[10px] uppercase font-bold px-2 py-1 rounded border 
                                            ${item.source === 'admin' ? 'bg-blue-50 text-blue-600 border-blue-100'
                                                : item.source === 'unified' ? 'bg-purple-50 text-purple-600 border-purple-100'
                                                    : 'bg-indigo-50 text-indigo-600 border-indigo-100'}`}>
                                            {item.source === 'admin' ? 'OFICINA' : item.source === 'unified' ? 'PT (Oficina+App)' : 'APP TÉCNICO'}
                                        </span>
                                    </td>
                                    <td className="p-4 text-sm text-slate-600">
                                        {formatDateSafe(item.date)}
                                        <div className="text-xs text-slate-400">{formatDistanceSafe(item.date)}</div>
                                    </td>
                                    <td className="p-4 font-mono font-bold text-slate-800">{item.number}</td>
                                    <td className="p-4 font-medium text-slate-700">{item.client_name}</td>
                                    <td className="p-4 font-bold text-slate-800 text-right">{(item.total || 0).toFixed(2)}€</td>
                                    <td className="p-4 text-center">{getStatusBadge(item.status, item.source, item.is_unified)}</td>
                                    <td className="p-4 text-right flex items-center justify-end gap-2">
                                        {item.pdf_url ? (
                                            <a
                                                href={item.pdf_url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="inline-flex items-center gap-2 px-3 py-1.5 bg-slate-100 text-slate-600 rounded-lg text-xs font-bold hover:bg-slate-200 transition"
                                                title="Ver PDF"
                                            >
                                                <FileText size={14} />
                                            </a>
                                        ) : null}

                                        {/* Actions for Admin Budgets */}
                                        {item.source === 'admin' && (
                                            <>
                                                {item.status === 'pending' && (
                                                    <button
                                                        onClick={() => setSelectedBudgetToAccept(item.raw)}
                                                        className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg transition"
                                                        title="Aceptar y Convertir a Servicio"
                                                    >
                                                        <CheckCircle size={16} />
                                                    </button>
                                                )}

                                                <button
                                                    onClick={() => handleDelete(item.id, item.source)}
                                                    className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition"
                                                    title="Eliminar Presupuesto"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </>
                                        )}
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {showCreateModal && (
                <CreateBudgetModal
                    onClose={() => setShowCreateModal(false)}
                    onSuccess={() => {
                        fetchData();
                        setShowCreateModal(false);
                    }}
                />
            )}

            {selectedBudgetToAccept && (
                <AcceptBudgetModal
                    budget={selectedBudgetToAccept}
                    onClose={() => setSelectedBudgetToAccept(null)}
                    onSuccess={(newTicket) => {
                        fetchData();
                        setSelectedBudgetToAccept(null);
                        if (newTicket) {
                            setSelectedTicketToAssign(newTicket);
                        }
                    }}
                />
            )}

            {selectedTicketToAssign && (
                <SmartAssignmentModal
                    ticket={selectedTicketToAssign}
                    onClose={() => setSelectedTicketToAssign(null)}
                    onSuccess={() => {
                        fetchData();
                        setSelectedTicketToAssign(null);
                        alert('Servicio asignado correctamente.');
                    }}
                />
            )}
        </div>
    );
};

export default BudgetRegistry;
