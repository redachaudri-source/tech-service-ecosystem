import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { X, CheckCircle, ArrowRight } from 'lucide-react';

const AcceptBudgetModal = ({ budget, onClose, onSuccess }) => {
    const [loading, setLoading] = useState(false);

    const handleAccept = async (e) => {
        e.preventDefault();
        setLoading(true);

        try {
            // 1. Create Ticket in 'tickets' table
            // Status 'solicitado' (Pending Assignment)
            const ticketData = {
                client_id: budget.client_id,
                created_by: (await supabase.auth.getUser()).data.user?.id,
                status: 'solicitado',
                appointment_status: 'pending',

                description_failure: budget.description,
                appliance_info: (budget.appliance_info?.type === 'General') ? null : budget.appliance_info,
                labor_list: budget.labor_items,
                parts_list: budget.part_items,

                // Financials
                total_amount: budget.total_amount,
                payment_deposit: budget.deposit_amount,
                payment_terms: budget.payment_terms,

                // Assignment (Left empty for SmartAssignment)
                technician_id: null,
                scheduled_at: null,

                // Meta
                quote_pdf_url: budget.pdf_url,
                origin_source: `Presupuesto P-${budget.budget_number}`,
                created_via: 'budget_conversion'
            };

            const { data: newTicket, error: ticketError } = await supabase
                .from('tickets')
                .insert(ticketData)
                .select()
                .single();

            if (ticketError) throw ticketError;

            // 2. Update Budget Status
            const { error: budgetError } = await supabase
                .from('budgets')
                .update({
                    status: 'accepted',
                    converted_ticket_id: newTicket.id
                })
                .eq('id', budget.id);

            if (budgetError) throw budgetError;

            // Pass the new ticket to parent to trigger assignment modal
            onSuccess(newTicket);
            onClose();

        } catch (error) {
            console.error(error);
            alert('Error al aceptar: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-green-50">
                    <h2 className="text-lg font-bold text-green-800 flex items-center gap-2">
                        <CheckCircle className="text-green-600" /> Aceptar Presupuesto P-{budget.budget_number}
                    </h2>
                    <button onClick={onClose} className="text-green-700 hover:text-green-900">
                        <X size={20} />
                    </button>
                </div>

                <form onSubmit={handleAccept} className="p-6 space-y-6">
                    <p className="text-slate-600">
                        Se creará una nueva <strong>Orden de Servicio</strong> basada en este presupuesto.
                        <br /><br />
                        A continuación se abrirá automáticamente el panel de agenda para que puedas <strong>asignar el técnico y la fecha</strong>.
                    </p>

                    <div className="flex gap-3 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 py-3 border border-slate-200 rounded-lg text-slate-600 font-bold hover:bg-slate-50 transition"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="flex-1 py-3 bg-green-600 text-white rounded-lg font-bold hover:bg-green-700 shadow-lg shadow-green-500/20 active:scale-95 transition flex items-center justify-center gap-2"
                        >
                            {loading ? 'Procesando...' : (
                                <>Aceptar y Continuar <ArrowRight size={18} /></>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default AcceptBudgetModal;
