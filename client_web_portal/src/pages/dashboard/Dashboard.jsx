import { useEffect, useState, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { LogOut, Plus, Clock, CheckCircle, AlertCircle, Wrench, User, Calendar, FileText, Package, PieChart, ShieldAlert, MapPin, RefreshCw } from 'lucide-react';
import TechLocationMap from '../../components/TechLocationMap';

import { useToast } from '../../components/ToastProvider';
import TechProfileCard from '../../components/TechProfileCard';
import ReviewModal from '../../components/ReviewModal';
import AppointmentSelectorModal from '../../components/AppointmentSelectorModal';

const Dashboard = () => {
    const navigate = useNavigate();
    const { addToast } = useToast();
    const [loading, setLoading] = useState(true);
    const [profile, setProfile] = useState(null);
    const [tickets, setTickets] = useState([]);
    const [budgets, setBudgets] = useState([]); // New Budgets State
    const [isConnected, setIsConnected] = useState(false);
    const [lastUpdate, setLastUpdate] = useState(null);
    const [cancelModal, setCancelModal] = useState({ show: false, ticketId: null });
    const [cancelReason, setCancelReason] = useState('');
    const [proposalModal, setProposalModal] = useState({
        show: false,
        ticket: null,
        slots: [],
        proposal: null,
        timeoutMinutes: 3,
        confirming: false  // Flag para evitar reabrir durante confirmación
    });

    // REF para evitar reapertura del modal (más confiable que estado por closures)
    const recentlyHandledTicketRef = useRef(null);
    const modalBlockedUntilRef = useRef(0);

    // Reputation System State
    const [reviewModal, setReviewModal] = useState({ show: false, ticketId: null, technicianId: null });
    const [reviewedTicketIds, setReviewedTicketIds] = useState([]);

    useEffect(() => {
        let channel = null;
        let fastPollingInterval = null;

        const initRealtime = async () => {
            // Ensure we have a session before subscribing to avoid Anon RLS issues
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) return;

            fetchDashboardData();

            if (channel) supabase.removeChannel(channel);

            channel = supabase.channel('client_dashboard_realtime_v3')
                .on(
                    'postgres_changes',
                    { event: '*', schema: 'public', table: 'tickets' },
                    (payload) => {
                        console.log('🔔 Realtime Update:', payload);
                        fetchDashboardData();
                        setLastUpdate(new Date());

                        if (payload.eventType === 'UPDATE') {
                            if (payload.new.status !== payload.old.status) {
                                addToast(`Tu servicio ha cambiado a: ${payload.new.status.toUpperCase().replace('_', ' ')}`, 'info', true);
                            }
                            if (payload.new.technician_id && !payload.old.technician_id) {
                                addToast('¡Técnico Asignado!', 'success', true);
                            }
                            // Soportar ambas estructuras: 'slots' (bot PRO) y 'proposed_slots' (legacy)
                            const slotsFromUpdate = payload.new?.pro_proposal?.slots || payload.new?.pro_proposal?.proposed_slots;
                            if (slotsFromUpdate?.length) {
                                const status = (payload.new.pro_proposal.status ?? 'waiting_selection').toString().toLowerCase();
                                // FIX: Solo abrir si no hay modal abierto para evitar reset de selección
                                if (status === 'waiting_selection' && !proposalModal.show) {
                                    openProposalModal(payload.new);
                                }
                            }
                        }
                    }
                )
                .subscribe((status) => {
                    console.log('Realtime Status:', status);
                    setIsConnected(status === 'SUBSCRIBED');
                });

            // ═══════════════════════════════════════════════════════════════
            // FAST POLLING: Check every 3 seconds for pending proposals
            // This ensures near-instant response even if Realtime has lag
            // ═══════════════════════════════════════════════════════════════
            fastPollingInterval = setInterval(async () => {
                try {
                    const { data: { user } } = await supabase.auth.getUser();
                    if (!user) return;

                    // Only fetch tickets with status='solicitado' that might have new proposals
                    const { data: pendingTickets } = await supabase
                        .from('tickets')
                        .select('id, ticket_number, status, pro_proposal, appliance_info')
                        .eq('client_id', user.id)
                        .eq('status', 'solicitado')
                        .order('created_at', { ascending: false })
                        .limit(5);

                    if (pendingTickets && pendingTickets.length > 0) {
                        const pendingWithProposal = findPendingProposal(pendingTickets);
                        if (pendingWithProposal && !proposalModal.show) {
                            console.log('⚡ FAST POLL: Found pending proposal for ticket', pendingWithProposal.ticket_number);
                            // Fetch full ticket data
                            const { data: fullTicket } = await supabase
                                .from('tickets')
                                .select('*, technician:profiles!technician_id (full_name)')
                                .eq('id', pendingWithProposal.id)
                                .single();
                            if (fullTicket) {
                                openProposalModal(fullTicket);
                            }
                        }
                    }
                } catch (err) {
                    // Silent fail for polling
                }
            }, 3000); // Every 3 seconds
        };

        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            if (session) initRealtime();
        });

        initRealtime();

        return () => {
            if (channel) supabase.removeChannel(channel);
            if (fastPollingInterval) clearInterval(fastPollingInterval);
            subscription.unsubscribe();
        };
    }, []);

    const checkQuoteExpiration = async (ticket) => {
        if (ticket.status !== 'presupuesto_pendiente' || !ticket.quote_generated_at) return;

        const generatedAt = new Date(ticket.quote_generated_at);
        const now = new Date();
        const diffDays = (now - generatedAt) / (1000 * 60 * 60 * 24);

        if (diffDays > 15) {
            console.log(`Ticket ${ticket.ticket_number} expired (${diffDays.toFixed(1)} days). Updating status...`);
            await supabase
                .from('tickets')
                .update({ status: 'presupuesto_revision' })
                .eq('id', ticket.id);
            return true; // Indicates status changed
        }
        return false;
    };

    const findPendingProposal = (ticketList) => {
        const now = Date.now();
        console.log('🔍 [BOT PRO DEBUG] findPendingProposal llamado con', ticketList?.length, 'tickets');

        const found = (ticketList || []).find((t) => {
            const proposal = t.pro_proposal;
            console.log(`   📋 Ticket #${t.ticket_number}: status=${t.status}, pro_proposal=`, proposal);

            // Soportar ambas estructuras: 'slots' (bot PRO) y 'proposed_slots' (legacy)
            const slots = proposal?.slots || proposal?.proposed_slots;
            if (!slots?.length) {
                console.log(`   ❌ Sin slots (slots=${proposal?.slots?.length}, proposed_slots=${proposal?.proposed_slots?.length})`);
                return false;
            }

            const status = (proposal.status ?? 'waiting_selection').toString().toLowerCase();
            if (status !== 'waiting_selection') {
                console.log(`   ❌ Status no es waiting_selection: ${status}`);
                return false;
            }

            // Soportar ambos campos: 'expires_at' (bot PRO) y 'timeout_at' (legacy)
            const expiresAt = proposal.expires_at || proposal.timeout_at;
            if (expiresAt && new Date(expiresAt).getTime() < now) {
                console.log(`   ❌ Expirado: ${expiresAt} < ${new Date(now).toISOString()}`);
                return false;
            }

            if (t.status !== 'solicitado') {
                console.log(`   ❌ Ticket status no es solicitado: ${t.status}`);
                return false;
            }

            console.log(`   ✅ Ticket #${t.ticket_number} CUMPLE TODOS LOS CRITERIOS`);
            return true;
        });

        console.log('🔍 [BOT PRO DEBUG] Resultado:', found ? `Ticket #${found.ticket_number}` : 'NINGUNO');
        return found;
    };

    const fetchDashboardData = async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return; // Silent return if no user, redirect handled by Auth wrapper usually

            // Fetch Profile
            const { data: profileData } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', user.id)
                .single();
            setProfile(profileData);

            // Fetch Tickets
            const { data: ticketData, error } = await supabase
                .from('tickets')
                .select(`
                    *,
                    technician:profiles!technician_id (full_name)
                `)
                .eq('client_id', user.id)
                .order('created_at', { ascending: false });

            if (error) throw error;

            // Fetch Existing Reviews (to hide button if already reviewed)
            const { data: reviews } = await supabase
                .from('reviews')
                .select('ticket_id')
                .eq('client_id', user.id);

            if (reviews) {
                setReviewedTicketIds(reviews.map(r => r.ticket_id));
            }

            // Fetch Pending Budgets (Proposals from Admin)
            const { data: budgetData, error: budgetError } = await supabase
                .from('budgets')
                .select('*')
                .eq('client_id', user.id)
                .eq('status', 'pending')
                .order('created_at', { ascending: false });

            if (budgetError) console.error('Error fetching budgets:', budgetError);
            if (budgetData) setBudgets(budgetData);

            // Check Expiration for Pending Quotes
            let updated = false;
            for (const t of ticketData || []) {
                if (await checkQuoteExpiration(t)) updated = true;
            }

            // If any expired, re-fetch to show correct status immediately
            if (updated) {
                const { data: refreshedData } = await supabase
                    .from('tickets')
                    .select(`
                    *,
                    technician:profiles!technician_id (full_name)
                `)
                    .eq('client_id', user.id)
                    .order('created_at', { ascending: false });
                setTickets(refreshedData || []);
                const pending = findPendingProposal(refreshedData || []);
                if (pending && !proposalModal.show) openProposalModal(pending);
            } else {
                setTickets(ticketData || []);
                const pending = findPendingProposal(ticketData || []);
                if (pending && !proposalModal.show) openProposalModal(pending);
            }

        } catch (error) {
            console.error('Error fetching dashboard:', error);
        } finally {
            setLoading(false);
        }
    };

    const openProposalModal = (ticket) => {
        console.log('🚀 [BOT PRO DEBUG] openProposalModal llamado para ticket:', ticket?.ticket_number);

        // PROTECCIÓN 1: Bloqueo temporal después de confirmar (5 segundos)
        if (Date.now() < modalBlockedUntilRef.current) {
            console.log('   ⏭️ Modal bloqueado temporalmente');
            return;
        }

        // PROTECCIÓN 2: No reabrir para ticket recientemente manejado
        if (recentlyHandledTicketRef.current === ticket?.id) {
            console.log('   ⏭️ Ticket recién manejado - no reabrir');
            return;
        }

        // No abrir si estamos en proceso de confirmación
        if (proposalModal.confirming) {
            console.log('   ⏭️ Confirmación en proceso - no reabrir modal');
            return;
        }

        const proposal = ticket?.pro_proposal;
        console.log('   📋 pro_proposal:', proposal);

        // Verificar que la propuesta esté en estado waiting_selection
        const propStatus = (proposal?.status ?? '').toString().toLowerCase();
        if (propStatus !== 'waiting_selection') {
            console.log('   ⏭️ Propuesta no está en waiting_selection, status:', propStatus);
            return;
        }

        // Soportar ambas estructuras: 'slots' (bot PRO) y 'proposed_slots' (legacy)
        const slots = proposal?.slots || proposal?.proposed_slots || [];
        console.log('   📋 Slots encontrados:', slots.length, slots);

        if (!slots.length) {
            console.log('   ❌ NO HAY SLOTS - Modal no se abre');
            return;
        }
        if (proposalModal.show && proposalModal.ticket?.id === ticket.id) {
            console.log('   ⏭️ Modal ya abierto para este ticket');
            return;
        }

        // Calcular tiempo RESTANTE hasta expiración (solo para verificar si expiró)
        const expiresAt = proposal?.expires_at || proposal?.timeout_at;
        console.log('   ⏰ expires_at:', expiresAt);

        // Verificar si ya expiró
        if (expiresAt) {
            const remaining = (new Date(expiresAt).getTime() - Date.now()) / 60000;
            console.log('   ⏰ Minutos restantes hasta expiración:', remaining.toFixed(2));
            if (remaining <= 0) {
                console.log('   ❌ PROPUESTA EXPIRADA - Modal no se abre');
                return;
            }
        }

        // Timer siempre 3 minutos (UX consistente para el cliente)
        const timeoutMinutes = 3;

        // ORDENAR SLOTS POR HORA antes de mostrar
        const sortedSlots = [...slots].sort((a, b) => {
            const timeA = a.time_start || '00:00';
            const timeB = b.time_start || '00:00';
            return timeA.localeCompare(timeB);
        });

        console.log('   ✅ ABRIENDO MODAL con', sortedSlots.length, 'slots ordenados y', timeoutMinutes, 'min timeout');
        setProposalModal({
            show: true,
            ticket,
            slots: sortedSlots,
            proposal,
            timeoutMinutes,
            confirming: false
        });
    };

    const handleProposalConfirm = async (selectedIndex) => {
        const ticket = proposalModal.ticket;
        const slot = proposalModal.slots[selectedIndex];
        const proposal = proposalModal.proposal || ticket?.pro_proposal;

        console.log('[Dashboard] handleProposalConfirm called:', { selectedIndex, ticketId: ticket?.id });

        if (!ticket || !slot) {
            console.log('[Dashboard] Missing ticket or slot, aborting');
            return;
        }

        // BLOQUEAR REAPERTURA: Guardar ticket ID y bloquear modal por 5 segundos
        recentlyHandledTicketRef.current = ticket.id;
        modalBlockedUntilRef.current = Date.now() + 5000; // 5 segundos

        // CERRAR MODAL INMEDIATAMENTE - resetear todo el estado
        setProposalModal({ show: false, ticket: null, slots: [], proposal: null, timeoutMinutes: 3, confirming: true });

        try {
            // La hora del slot ya está en hora España, convertir a UTC restando 1 hora
            const [hours, minutes] = slot.time_start.split(':').map(Number);
            const utcHours = hours - 1; // España = UTC+1 (invierno)
            const utcTimeStr = `${utcHours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
            const scheduledAt = `${slot.date}T${utcTimeStr}:00.000Z`;

            console.log('[Dashboard] Hora España:', slot.time_start, '-> UTC:', utcTimeStr);

            const updatedProposal = {
                ...(proposal || {}),
                status: 'selected',
                selected_slot_index: selectedIndex,
                selected_at: new Date().toISOString()
            };

            console.log('[Dashboard] Updating ticket with scheduledAt:', scheduledAt);

            const { error } = await supabase
                .from('tickets')
                .update({
                    status: 'asignado',
                    appointment_status: 'confirmed',
                    technician_id: slot.technician_id,
                    scheduled_at: scheduledAt,
                    pro_proposal: updatedProposal
                })
                .eq('id', ticket.id);

            if (error) throw error;

            console.log('[Dashboard] Ticket updated successfully');
            // Resetear estado completo
            setProposalModal({ show: false, ticket: null, slots: [], proposal: null, timeoutMinutes: 3, confirming: false });
            fetchDashboardData();
            addToast('✅ ¡Cita confirmada!', 'success', true);
        } catch (error) {
            console.error('[Dashboard] Error confirming proposal:', error);
            setProposalModal({ show: false, ticket: null, slots: [], proposal: null, timeoutMinutes: 3, confirming: false });
            addToast('Error al confirmar la cita. Te llamaremos para coordinar.', 'error', true);
        }
    };

    const handleProposalSkip = async () => {
        const ticket = proposalModal.ticket;
        const proposal = proposalModal.proposal || ticket?.pro_proposal;
        if (!ticket) return;

        // BLOQUEAR REAPERTURA
        recentlyHandledTicketRef.current = ticket.id;
        modalBlockedUntilRef.current = Date.now() + 5000;

        // Cerrar modal INMEDIATAMENTE
        setProposalModal({ show: false, ticket: null, slots: [], proposal: null, timeoutMinutes: 3, confirming: false });

        try {
            // Marcar propuesta como rechazada - NO reprocesar automáticamente
            const updatedProposal = {
                ...(proposal || {}),
                status: 'client_rejected',
                rejected_at: new Date().toISOString(),
                rejected_reason: 'client_skip'
            };

            const { error } = await supabase
                .from('tickets')
                .update({
                    status: 'cita_rechazada',  // Nuevo estado - el bot NO lo reprocesa
                    pro_proposal: updatedProposal
                })
                .eq('id', ticket.id);

            if (error) {
                console.error('Supabase update error:', error);
                addToast('Error al procesar. Te llamaremos para coordinar.', 'error', true);
            } else {
                addToast('Citas rechazadas. Puedes pulsar "Repetir Solicitud" para buscar nuevas opciones.', 'info', true);
            }

            fetchDashboardData();
        } catch (error) {
            console.error('Error rejecting proposal:', error);
            addToast('Error al procesar. Te llamaremos para coordinar.', 'error', true);
        }
    };

    const handleProposalTimeout = async () => {
        const ticket = proposalModal.ticket;
        const proposal = proposalModal.proposal || ticket?.pro_proposal;
        if (!ticket) return;

        // BLOQUEAR REAPERTURA
        recentlyHandledTicketRef.current = ticket.id;
        modalBlockedUntilRef.current = Date.now() + 5000;

        // Cerrar modal INMEDIATAMENTE
        setProposalModal({ show: false, ticket: null, slots: [], proposal: null, timeoutMinutes: 3, confirming: false });

        try {
            const updatedProposal = {
                ...(proposal || {}),
                status: 'expired',
                expired_at: new Date().toISOString()
            };

            const { error } = await supabase
                .from('tickets')
                .update({
                    status: 'cita_rechazada',  // Nuevo estado - el bot NO lo reprocesa
                    pro_proposal: updatedProposal
                })
                .eq('id', ticket.id);

            if (error) {
                console.error('Supabase update error:', error);
            } else {
                addToast('Tiempo expirado. Puedes pulsar "Repetir Solicitud" para buscar nuevas citas.', 'info', true);
            }

            fetchDashboardData();
        } catch (error) {
            console.error('Error expiring proposal:', error);
        }
    };

    const handleUpdateAppointment = async (ticketId, status, feedback = null, selectedSlot = null) => {
        try {
            const updateData = { appointment_status: status };
            if (feedback) updateData.client_feedback = feedback;

            // If confirmed with a specific slot, set that as the final schedule
            if (status === 'confirmed' && selectedSlot) {
                // Support both Smart Slots (ISO start) and Legacy (date+time)
                if (selectedSlot.start) {
                    updateData.scheduled_at = selectedSlot.start;
                } else {
                    updateData.scheduled_at = `${selectedSlot.date}T${selectedSlot.time}:00`;
                }

                updateData.proposed_slots = []; // Clear proposals

                // IMPORTANT: Update technician to the one assigned for this specifi slot
                if (selectedSlot.technician_id) {
                    updateData.technician_id = selectedSlot.technician_id;
                    updateData.status = 'asignado'; // Fix: Ensure status reflects assignment
                }
            }

            const { error } = await supabase
                .from('tickets')
                .update(updateData)
                .eq('id', ticketId);

            if (error) throw error;

            // Refresh to show new state
            fetchDashboardData();
            alert(status === 'confirmed' ? '¡Cita confirmada correctamente!' : 'Solicitud de cambio enviada.');

        } catch (error) {
            console.error(error);
            alert('Error actualizando cita.');
        }
    };

    const handleAcceptQuote = async (ticketOrId) => {
        const id = typeof ticketOrId === 'object' ? ticketOrId.id : ticketOrId;
        if (!window.confirm('¿Aceptas el presupuesto y das permiso para proceder con la reparación?')) return;

        try {
            const { error } = await supabase
                .from('tickets')
                .update({
                    status: 'presupuesto_aceptado',
                    status_history: ticketOrId.status_history
                        ? [...ticketOrId.status_history, { status: 'presupuesto_aceptado', label: 'Presupuesto Aceptado - Cliente', timestamp: new Date().toISOString() }]
                        : [] // Fallback handled by trigger or next update
                })
                .eq('id', id);

            if (error) {
                // Try fallback without history
                const { error: fallbackError } = await supabase.from('tickets').update({ status: 'presupuesto_aceptado' }).eq('id', id);
                if (fallbackError) throw fallbackError;
            }

            fetchDashboardData();
            alert('¡Presupuesto aceptado! El técnico será notificado para continuar.');
        } catch (error) {
            console.error(error);
            alert('Error al aceptar presupuesto.');
        }
    };

    const handleRejectQuote = async (ticketId) => {
        const reason = prompt("¿Por qué rechazas el presupuesto? (Esto cancelará el servicio)");
        if (!reason) return;

        try {
            const { error } = await supabase
                .from('tickets')
                .update({
                    status: 'cancelado',
                    client_feedback: reason, // Keep legacy feedback
                    cancellation_reason: reason // New specific column
                })
                .eq('id', ticketId);

            if (error) throw error;

            fetchDashboardData();
            alert('Presupuesto rechazado. El servicio ha sido cancelado.');
        } catch (error) {
            console.error(error);
            alert('Error al rechazar presupuesto.');
        }
    };

    const handleAcceptBudgetProposal = async (budget) => {
        // Confirm
        if (!window.confirm(`¿Aceptas el presupuesto P-${budget.budget_number} por ${budget.total_amount}€?`)) return;

        try {
            setLoading(true);
            // 1. Create Ticket (Similar to Admin AcceptBudgetModal)
            const ticketData = {
                client_id: budget.client_id,
                created_by: (await supabase.auth.getUser()).data.user?.id,
                status: 'solicitado', // Pending Assignment
                appointment_status: 'pending',

                description_failure: budget.description,
                appliance_info: (budget.appliance_info?.type === 'General') ? null : budget.appliance_info,
                labor_list: budget.labor_items,
                parts_list: budget.part_items,

                total_amount: budget.total_amount,
                payment_deposit: budget.deposit_amount,
                payment_terms: budget.payment_terms,

                quote_pdf_url: budget.pdf_url,
                origin_source: `Presupuesto P-${budget.budget_number}`,
                created_via: 'client_budget_accept'
            };

            const { data: newTicket, error: ticketError } = await supabase
                .from('tickets')
                .insert(ticketData)
                .select()
                .single();

            if (ticketError) throw ticketError;

            // 2. Update Budget
            const { error: budgetError } = await supabase
                .from('budgets')
                .update({
                    status: 'accepted',
                    converted_ticket_id: newTicket.id
                })
                .eq('id', budget.id);

            if (budgetError) throw budgetError;

            fetchDashboardData();
            alert('¡Presupuesto aceptado! Se ha creado un nuevo servicio. Un técnico revisará tu solicitud pronto.');

        } catch (error) {
            console.error('Error accepting budget:', error);
            alert('Error al aceptar el presupuesto: ' + error.message);
        } finally {
            setLoading(false);
        }

    };

    const handleClaimWarranty = async (ticket) => {
        if (!window.confirm(`¿Quieres reclamar la garantía para tu ${ticket.appliance_info?.type} ${ticket.appliance_info?.brand}?\n\nEsto abrirá un nuevo servicio vinculado a esta reparación.`)) return;

        try {
            setLoading(true);
            const { data: user } = await supabase.auth.getUser();

            const newTicket = {
                client_id: ticket.client_id,
                created_by: user.user?.id,
                status: 'solicitado',
                appointment_status: 'pending',
                description_failure: `RECLAMACIÓN DE GARANTÍA (Origen: #${ticket.ticket_number}) - ${ticket.description_failure || 'Sin descripción'}`,
                appliance_info: ticket.appliance_info,
                link_ticket_id: ticket.id,
                is_warranty: true,
                origin_source: 'Garantía Web Cliente',
                created_via: 'client_warranty_claim'
            };

            const { error } = await supabase.from('tickets').insert(newTicket);
            if (error) throw error;

            alert('¡Garantía reclamada! Se ha abierto un nuevo servicio prioritario.');
            fetchDashboardData();

        } catch (error) {
            console.error('Error claiming warranty:', error);
            alert('Error al reclamar garantía: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    // Repetir Solicitud - Resetea el ticket para que el bot lo reprocese
    const handleResetRequest = async (ticket) => {
        if (!window.confirm('¿Quieres volver a solicitar citas para este servicio?\n\nEsto buscará nuevas opciones de horario disponibles.')) return;

        try {
            setLoading(true);

            // Limpiar pro_proposal y volver a status 'solicitado' para que el bot lo reprocese
            const { error } = await supabase
                .from('tickets')
                .update({
                    status: 'solicitado',  // Volver a solicitado para que el bot lo procese
                    pro_proposal: null,
                    processing_started_at: null,
                    appointment_status: 'pending'
                })
                .eq('id', ticket.id);

            if (error) throw error;

            addToast('🔄 Buscando nuevas citas disponibles...', 'info', true);
            fetchDashboardData();
        } catch (error) {
            console.error('Error resetting request:', error);
            addToast('Error al reiniciar solicitud: ' + error.message, 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleLogout = async () => {
        await supabase.auth.signOut();
        navigate('/auth/login');
    };

    const getStatusColor = (status) => {
        switch (status) {
            case 'nuevo':
            case 'solicitado': return 'bg-blue-100 text-blue-700 border-blue-200';
            case 'cita_rechazada': return 'bg-orange-100 text-orange-700 border-orange-200';
            case 'asignado': return 'bg-yellow-100 text-yellow-700 border-yellow-200';
            case 'presupuesto_pendiente': return 'bg-yellow-100 text-yellow-800 border-yellow-300';
            case 'presupuesto_revision': return 'bg-red-100 text-red-800 border-red-300'; // New
            case 'presupuesto_aceptado': return 'bg-blue-100 text-blue-700 border-blue-200';
            case 'en_proceso':
            case 'en_reparacion':
            case 'en_diagnostico': return 'bg-orange-100 text-orange-700 border-orange-200';
            case 'finalizado':
            case 'pagado': return 'bg-green-100 text-green-700 border-green-200';
            case 'cancelado': return 'bg-red-100 text-red-700 border-red-200';
            default: return 'bg-slate-100 text-slate-600 border-slate-200';
        }
    };

    const getStatusLabel = (status) => {
        const labels = {
            'nuevo': 'Pendiente',
            'solicitado': 'Solicitud Enviada',
            'cita_rechazada': 'Cita Rechazada',
            'asignado': 'Técnico Asignado',
            'en_diagnostico': 'En Diagnóstico',
            'presupuesto_pendiente': 'Presupuesto Pte. Aceptación',
            'presupuesto_revision': 'Presupuesto Caducado (Revisando)', // New
            'presupuesto_aceptado': 'Presupuesto Aceptado (En Cola)',
            'en_reparacion': 'En Reparación',
            'finalizado': 'Reparación Finalizada',
            'pagado': 'Servicio Completado',
            'cancelado': 'Cancelado'
        };
        return labels[status] || status;
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-50">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
        );
    }

    const activeTickets = tickets.filter(t => !['finalizado', 'pagado', 'cancelado'].includes(t.status));
    const historyTickets = tickets.filter(t => ['finalizado', 'pagado', 'cancelado'].includes(t.status));

    const isPro = profile?.client_type === 'professional';

    return (
        <div className={`min-h-screen ${isPro ? 'bg-slate-900' : 'bg-slate-50'}`}>
            {/* Navbar - Premium Dual Mode */}
            <div className={`${isPro
                ? 'bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 border-b border-slate-700/50 shadow-lg shadow-black/20'
                : 'bg-white border-b border-slate-200 shadow-sm'
                } sticky top-0 z-50 backdrop-blur-xl`}>
                <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex justify-between h-16 items-center">
                        {/* Logo & Brand */}
                        <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold shadow-lg ${isPro
                                ? 'bg-gradient-to-br from-amber-400 to-orange-500 text-slate-900 shadow-amber-500/20'
                                : 'bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-blue-500/30'
                                }`}>
                                F
                            </div>
                            <div className="flex flex-col">
                                <span className={`font-bold text-lg ${isPro ? 'text-white' : 'text-slate-800'}`}>Fixarr</span>
                                {isPro && (
                                    <span className="text-[10px] font-bold text-amber-400 uppercase tracking-widest -mt-1">Profesional</span>
                                )}
                            </div>
                        </div>

                        {/* Navigation Links - Pro Version */}
                        {isPro && (
                            <nav className="hidden md:flex items-center gap-1">
                                <button onClick={() => navigate('/dashboard')} className="px-4 py-2 text-sm font-medium text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition">
                                    Dashboard
                                </button>
                                <button onClick={() => navigate('/addresses')} className="px-4 py-2 text-sm font-medium text-white/60 hover:text-white hover:bg-white/10 rounded-lg transition">
                                    Propiedades
                                </button>
                                <button onClick={() => navigate('/appliances')} className="px-4 py-2 text-sm font-medium text-white/60 hover:text-white hover:bg-white/10 rounded-lg transition">
                                    Equipos
                                </button>
                                <button onClick={() => navigate('/analytics')} className="px-4 py-2 text-sm font-medium text-white/60 hover:text-white hover:bg-white/10 rounded-lg transition">
                                    Analytics
                                </button>
                            </nav>
                        )}

                        {/* User Section */}
                        <div className="flex items-center gap-3">
                            {isPro ? (
                                <>
                                    <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-white/5 border border-white/10 rounded-full">
                                        <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></div>
                                        <span className="text-xs font-medium text-white/70">En línea</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white text-sm font-bold shadow-lg shadow-purple-500/20">
                                            {profile?.full_name?.charAt(0)?.toUpperCase() || 'U'}
                                        </div>
                                        <div className="hidden sm:block">
                                            <p className="text-sm font-semibold text-white">{profile?.full_name?.split(' ')[0] || 'Usuario'}</p>
                                            <p className="text-[10px] text-white/50">Gestora de Propiedades</p>
                                        </div>
                                    </div>
                                </>
                            ) : (
                                <span className="text-sm font-medium text-slate-600 hidden sm:block">
                                    Hola, {profile?.full_name?.split(' ')[0] || 'Usuario'}
                                </span>
                            )}
                            <button
                                onClick={handleLogout}
                                className={`p-2 rounded-full transition ${isPro
                                    ? 'text-white/60 hover:text-red-400 hover:bg-red-500/10'
                                    : 'text-slate-400 hover:text-red-600 hover:bg-red-50'
                                    }`}
                                title="Cerrar Sesión"
                            >
                                <LogOut size={20} />
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <div className={`max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 ${isPro ? 'pt-6' : ''}`}>

                {/* Header Section - Conditional */}
                {isPro ? (
                    /* PROFESIONAL: Premium Hero Section */
                    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-800 via-slate-800 to-purple-900/50 p-8 border border-white/10">
                        <div className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg width=&quot;60&quot; height=&quot;60&quot; viewBox=&quot;0 0 60 60&quot; xmlns=&quot;http://www.w3.org/2000/svg&quot;%3E%3Cg fill=&quot;none&quot; fill-rule=&quot;evenodd&quot;%3E%3Cg fill=&quot;%239C92AC&quot; fill-opacity=&quot;0.03&quot;%3E%3Cpath d=&quot;M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z&quot;/%3E%3C/g%3E%3C/g%3E%3C/svg%3E')] opacity-50"></div>
                        <div className="relative z-10 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
                            <div>
                                <p className="text-amber-400 text-sm font-semibold uppercase tracking-widest mb-2">Panel de Control</p>
                                <h1 className="text-3xl lg:text-4xl font-bold text-white mb-2">
                                    Hola, {profile?.full_name?.split(' ')[0] || 'Usuario'} 👋
                                </h1>
                                <p className="text-white/60 text-lg">
                                    Gestiona tus {tickets.length} servicios técnicos desde aquí.
                                </p>
                            </div>
                            <button
                                onClick={() => navigate('/new-service')}
                                className="flex items-center gap-3 bg-gradient-to-r from-amber-400 to-orange-500 text-slate-900 px-6 py-3.5 rounded-xl font-bold hover:from-amber-500 hover:to-orange-600 transition shadow-xl shadow-amber-500/20 active:scale-95 transform duration-150"
                            >
                                <Plus size={22} />
                                <span>Nueva Solicitud</span>
                            </button>
                        </div>
                        {/* Stats within Hero */}
                        <div className="relative z-10 grid grid-cols-2 lg:grid-cols-4 gap-4 mt-8">
                            <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-4">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                                        <Clock size={20} className="text-emerald-400" />
                                    </div>
                                    <div>
                                        <p className="text-xs font-medium text-white/50 uppercase tracking-wider">Activos</p>
                                        <p className="text-2xl font-bold text-white">{activeTickets.length}</p>
                                    </div>
                                </div>
                            </div>
                            <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-4">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
                                        <CheckCircle size={20} className="text-blue-400" />
                                    </div>
                                    <div>
                                        <p className="text-xs font-medium text-white/50 uppercase tracking-wider">Historial</p>
                                        <p className="text-2xl font-bold text-white">{historyTickets.length}</p>
                                    </div>
                                </div>
                            </div>
                            <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-4">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
                                        <MapPin size={20} className="text-purple-400" />
                                    </div>
                                    <div>
                                        <p className="text-xs font-medium text-white/50 uppercase tracking-wider">Propiedades</p>
                                        <p className="text-2xl font-bold text-white">{profile?.address_count || '—'}</p>
                                    </div>
                                </div>
                            </div>
                            <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-4">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center">
                                        <Package size={20} className="text-amber-400" />
                                    </div>
                                    <div>
                                        <p className="text-xs font-medium text-white/50 uppercase tracking-wider">Equipos</p>
                                        <p className="text-2xl font-bold text-white">{profile?.appliance_count || '—'}</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                ) : (
                    /* PARTICULAR: Clean & Intuitive */
                    <>
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                            <div>
                                <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-3">
                                    Mis Servicios
                                    {isConnected && (
                                        <span className="flex items-center gap-1 text-[10px] bg-green-100 text-green-600 px-2 py-0.5 rounded-full border border-green-200 animate-pulse">
                                            <span className="w-1.5 h-1.5 bg-green-500 rounded-full"></span>
                                            EN VIVO
                                        </span>
                                    )}
                                </h1>
                                <p className="text-slate-500">Consulta el estado de tus reparaciones en tiempo real.</p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                <button
                                    onClick={() => navigate('/appliances')}
                                    className="flex items-center gap-2 bg-white text-slate-600 px-4 py-2.5 rounded-xl font-bold border border-slate-200 hover:bg-slate-50 hover:border-slate-300 transition shadow-sm active:scale-95"
                                >
                                    <Package size={20} className="text-purple-500" />
                                    <span className="hidden sm:inline">Mis Equipos</span>
                                </button>
                                <button
                                    onClick={() => navigate('/analytics')}
                                    className="flex items-center gap-2 bg-white text-slate-600 px-4 py-2.5 rounded-xl font-bold border border-slate-200 hover:bg-slate-50 hover:border-slate-300 transition shadow-sm active:scale-95"
                                >
                                    <PieChart size={20} className="text-blue-500" />
                                    <span className="hidden sm:inline">Gastos</span>
                                </button>
                                <button
                                    onClick={() => navigate('/addresses')}
                                    className="flex items-center gap-2 bg-white text-slate-600 px-4 py-2.5 rounded-xl font-bold border border-slate-200 hover:bg-slate-50 hover:border-slate-300 transition shadow-sm active:scale-95"
                                >
                                    <MapPin size={20} className="text-teal-500" />
                                    <span className="hidden sm:inline">Direcciones</span>
                                </button>
                                <button
                                    onClick={() => navigate('/new-service')}
                                    className="flex items-center gap-2 bg-gradient-to-r from-blue-500 to-blue-600 text-white px-5 py-2.5 rounded-xl font-bold hover:from-blue-600 hover:to-blue-700 transition shadow-lg shadow-blue-500/25 active:scale-95 transform duration-150"
                                >
                                    <Plus size={20} />
                                    <span>Solicitar Reparación</span>
                                </button>
                            </div>
                        </div>

                        {/* Stats Grid - PARTICULAR */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200 hover:shadow-md hover:border-blue-200 transition-all duration-200">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                                        <Clock size={18} className="text-blue-600" />
                                    </div>
                                    <div>
                                        <div className="text-slate-400 text-xs font-medium uppercase tracking-wider">Activos</div>
                                        <div className="text-2xl font-bold text-slate-800">{activeTickets.length}</div>
                                    </div>
                                </div>
                            </div>
                            <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200 hover:shadow-md hover:border-green-200 transition-all duration-200">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
                                        <CheckCircle size={18} className="text-green-600" />
                                    </div>
                                    <div>
                                        <div className="text-slate-400 text-xs font-medium uppercase tracking-wider">Historial</div>
                                        <div className="text-2xl font-bold text-slate-800">{historyTickets.length}</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </>
                )}

                {/* PENDING BUDGET PROPOSALS (From Admin) */}
                {budgets.length > 0 && (
                    <div className="space-y-4 animate-in slide-in-from-left-2">
                        <h2 className="font-bold text-lg text-slate-700 flex items-center gap-2">
                            <FileText size={20} className="text-purple-500" />
                            Propuestas de Presupuesto
                            <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full border border-purple-200">
                                {budgets.length} Pendiente(s)
                            </span>
                        </h2>
                        <div className="grid gap-4 md:grid-cols-2">
                            {budgets.map(budget => (
                                <div key={budget.id} className="bg-white rounded-xl p-6 shadow-sm border border-purple-100 hover:shadow-md transition relative overflow-hidden">
                                    <div className="absolute top-0 right-0 bg-purple-100 text-purple-700 px-3 py-1 text-xs font-bold rounded-bl-lg">
                                        P-{budget.budget_number}
                                    </div>
                                    <div className="mb-4">
                                        <h3 className="font-bold text-slate-800 text-lg mb-1">{budget.description}</h3>
                                        <p className="text-slate-500 text-sm">
                                            {budget.appliance_info?.type} - {budget.appliance_info?.brand}
                                        </p>
                                    </div>

                                    <div className="flex justify-between items-end mb-4 bg-purple-50 p-3 rounded-lg">
                                        <div>
                                            <span className="text-xs text-purple-600 font-bold uppercase">Total Estimado</span>
                                            <div className="text-2xl font-bold text-purple-900">{budget.total_amount}€</div>
                                        </div>
                                        {budget.pdf_url && (
                                            <a href={budget.pdf_url} target="_blank" className="text-sm font-bold text-purple-600 hover:underline flex items-center gap-1">
                                                <FileText size={16} /> Ver PDF
                                            </a>
                                        )}
                                    </div>

                                    <button
                                        onClick={() => handleAcceptBudgetProposal(budget)}
                                        className="w-full py-2.5 bg-purple-600 text-white rounded-lg font-bold hover:bg-purple-700 transition shadow-lg shadow-purple-200 active:scale-95"
                                    >
                                        Aceptar y Crear Servicio
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Active Services List */}
                {activeTickets.length > 0 ? (
                    <div className="space-y-4">
                        <h2 className={`font-bold text-lg flex items-center gap-2 ${isPro ? 'text-white' : 'text-slate-700'}`}>
                            <Clock size={20} className={isPro ? 'text-emerald-400' : 'text-blue-500'} />
                            En Curso
                            <span className={`text-xs px-2 py-0.5 rounded-full ${isPro ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-blue-100 text-blue-600 border border-blue-200'}`}>
                                {activeTickets.length}
                            </span>
                        </h2>
                        {activeTickets.map(ticket => (
                            <div key={ticket.id} className={`rounded-xl p-6 transition ${isPro
                                ? 'bg-slate-800/50 backdrop-blur-sm border border-white/10 hover:border-white/20 hover:bg-slate-800/70'
                                : 'bg-white shadow-sm border border-slate-200 hover:shadow-md hover:border-slate-300'
                                }`}>
                                <div className="flex flex-col md:flex-row justify-between gap-4">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-3 mb-2">
                                            <span className={`px-3 py-1 rounded-full text-xs font-bold border ${getStatusColor(ticket.status)}`}>
                                                {getStatusLabel(ticket.status)}
                                            </span>
                                            <span className={`text-xs ${isPro ? 'text-white/50' : 'text-slate-400'}`}>#{ticket.ticket_number}</span>
                                        </div>
                                        <h3 className={`font-bold text-lg mb-1 ${isPro ? 'text-white' : 'text-slate-800'}`}>
                                            {ticket.appliance_info?.type} - {ticket.appliance_info?.brand}
                                        </h3>
                                        <p className={`text-sm line-clamp-2 ${isPro ? 'text-white/60' : 'text-slate-500'}`}>
                                            {ticket.description_failure}
                                        </p>

                                        {/* Botón Repetir Solicitud - Para tickets 'solicitado' o 'cita_rechazada' */}
                                        {(ticket.status === 'solicitado' || ticket.status === 'cita_rechazada') && (
                                            <div className="mt-3">
                                                <button
                                                    onClick={() => handleResetRequest(ticket)}
                                                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition ${isPro
                                                        ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30 hover:bg-blue-500/30'
                                                        : 'bg-blue-50 text-blue-600 border border-blue-200 hover:bg-blue-100 hover:border-blue-300'
                                                        }`}
                                                >
                                                    <RefreshCw size={16} />
                                                    Repetir Solicitud
                                                </button>
                                            </div>
                                        )}

                                        {/* TECH LOCATION MAP - Only when 'en_camino' */}
                                        {ticket.status === 'en_camino' && ticket.technician_id && (
                                            <div className="mt-4 mb-4 animate-in fade-in slide-in-from-top-4">
                                                <TechLocationMap technicianId={ticket.technician_id} />
                                            </div>
                                        )}

                                        {/* Technician & Appointment Info */}
                                        {(ticket.technician || ticket.scheduled_at || (ticket.proposed_slots && ticket.proposed_slots.length > 0)) && (
                                            <div className="mt-4 space-y-3">
                                                {/* Tech Info */}
                                                {ticket.technician && (
                                                    <div className="w-full sm:w-auto">
                                                        <TechProfileCard technician={ticket.technician} compact={true} />
                                                    </div>
                                                )}

                                                {/* Appointment Pending Card */}
                                                {/* Appointment Pending Card (Multi-Slot or Single) */}
                                                {(ticket.appointment_status === 'pending' || (ticket.proposed_slots && ticket.proposed_slots.length > 0 && ticket.appointment_status !== 'confirmed' && ticket.appointment_status !== 'rejected')) && (
                                                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 animate-in fade-in slide-in-from-top-2">
                                                        <h4 className="font-bold text-amber-800 text-sm flex items-center gap-2 mb-2">
                                                            <Calendar size={16} /> Propuesta de Cita
                                                        </h4>

                                                        {ticket.proposed_slots && ticket.proposed_slots.length > 0 ? (
                                                            <div className="mb-3 space-y-2">
                                                                <p className="text-sm text-amber-700 mb-2">
                                                                    El técnico ha propuesto las siguientes fechas. Por favor, confirma la que mejor te venga:
                                                                </p>
                                                                {ticket.proposed_slots.map((slot, idx) => {
                                                                    const dateStr = slot.start ? new Date(slot.start).toLocaleDateString() : new Date(slot.date).toLocaleDateString();
                                                                    const timeStr = slot.start ? new Date(slot.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : slot.time;
                                                                    const duration = slot.duration ? `${slot.duration} min` : '';

                                                                    return (
                                                                        <div key={idx} className="flex justify-between items-center bg-white p-3 rounded-lg border border-amber-200 shadow-sm">
                                                                            <div>
                                                                                <span className="block font-bold text-slate-800 text-sm">
                                                                                    {dateStr}
                                                                                </span>
                                                                                <span className="block text-slate-500 text-xs flex items-center gap-1">
                                                                                    {timeStr}
                                                                                    {duration && <span className="bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded text-[10px] font-bold">{duration}</span>}
                                                                                </span>
                                                                            </div>
                                                                            <button
                                                                                onClick={() => handleUpdateAppointment(ticket.id, 'confirmed', null, slot)}
                                                                                className="px-3 py-1.5 bg-green-600 text-white text-xs font-bold rounded-lg hover:bg-green-700 shadow-sm"
                                                                            >
                                                                                Confirmar
                                                                            </button>
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        ) : (
                                                            // Legacy / Single Slot Fallback
                                                            ticket.scheduled_at && (
                                                                <div className="mb-3">
                                                                    <p className="text-sm text-amber-700 mb-3">
                                                                        El técnico propone visitar tu domicilio el: <br />
                                                                        <span className="font-bold text-lg">
                                                                            {new Date(ticket.scheduled_at).toLocaleDateString()} a las {new Date(ticket.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                                        </span>
                                                                    </p>
                                                                    <button
                                                                        onClick={() => handleUpdateAppointment(ticket.id, 'confirmed')}
                                                                        className="w-full bg-green-600 text-white py-2 rounded-lg text-sm font-bold hover:bg-green-700 transition shadow-sm"
                                                                    >
                                                                        Aceptar Cita
                                                                    </button>
                                                                </div>
                                                            )
                                                        )}

                                                        <div className="mt-3 pt-3 border-t border-amber-200/50">
                                                            <button
                                                                onClick={() => {
                                                                    const reason = prompt("Indica tu disponibilidad preferida:");
                                                                    if (reason) handleUpdateAppointment(ticket.id, 'rejected', reason);
                                                                }}
                                                                className="w-full bg-white text-amber-700 border border-amber-300 py-2 rounded-lg text-sm font-bold hover:bg-amber-100 transition"
                                                            >
                                                                Ninguna me va bien (Solicitar Cambio)
                                                            </button>
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Confirmed Card */}
                                                {ticket.appointment_status === 'confirmed' && ticket.scheduled_at && (
                                                    <div className="bg-green-50 p-3 rounded-lg border border-green-200 animate-in fade-in">
                                                        <div className="flex items-center gap-2 text-sm text-green-800 font-bold mb-1">
                                                            <CheckCircle size={16} />
                                                            Cita Confirmada
                                                        </div>
                                                        <p className="text-green-900 text-lg font-mono font-bold mb-2">
                                                            {new Date(ticket.scheduled_at).toLocaleDateString()} - {new Date(ticket.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                        </p>

                                                        {/* Cancellation Logic */}
                                                        {['en_camino', 'trabajando', 'en_diagnostico', 'en_reparacion', 'pendiente_material'].includes(ticket.status) ? (
                                                            <div className="text-xs text-slate-500 bg-white/50 p-2 rounded border border-slate-100 italic">
                                                                🚫 No es posible cancelar: El técnico ya está trabajando o hay material pedido. Contacta por teléfono si es urgente.
                                                            </div>
                                                        ) : (
                                                            <div className="mt-2 pt-2 border-t border-green-200/50 flex flex-col items-start gap-1">
                                                                <button
                                                                    onClick={() => setCancelModal({ show: true, ticketId: ticket.id })}
                                                                    className="text-xs text-red-600 hover:text-red-800 font-bold hover:underline flex items-center gap-1"
                                                                >
                                                                    <AlertCircle size={14} /> Cancelar Servicio
                                                                </button>
                                                                <span className="text-[10px] text-slate-500 italic leading-tight ml-5">
                                                                    * Solo disponible antes de que su técnico inicie el servicio.
                                                                </span>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}

                                                {/* Rejected Card */}
                                                {ticket.appointment_status === 'rejected' && (
                                                    <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 p-2 rounded-lg border border-red-100 w-fit">
                                                        <Clock size={16} />
                                                        <span className="font-bold">Solicitud de cambio enviada. Esperando nueva propuesta.</span>
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {/* DOCUMENTS / RECEIPT SECTION (Visible always if exists) */}
                                        {ticket.deposit_receipt_url && (
                                            <div className="mt-4 bg-orange-50 border border-orange-100 p-4 rounded-lg shadow-sm flex justify-between items-center animate-in fade-in">
                                                <div>
                                                    <h4 className="text-sm font-bold text-orange-800 flex items-center gap-2">
                                                        <FileText size={16} /> Recibo de Señal Disponible
                                                    </h4>
                                                    <p className="text-xs text-orange-700 mt-1">
                                                        Justificante del pago a cuenta realizado.
                                                    </p>
                                                </div>
                                                <a
                                                    href={ticket.deposit_receipt_url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="bg-white text-orange-600 px-4 py-2 rounded-lg text-xs font-bold shadow-sm border border-orange-200 hover:bg-orange-600 hover:text-white transition"
                                                >
                                                    Ver Recibo
                                                </a>
                                            </div>
                                        )}

                                        {/* QUOTE PENDING / REVISION ALERT */}
                                        {(ticket.status === 'presupuesto_pendiente' || ticket.status === 'presupuesto_revision') && (
                                            <div className={`mt-4 border-l-4 p-4 rounded-r-lg shadow-sm animate-in fade-in ${ticket.status === 'presupuesto_revision' ? 'bg-red-50 border-red-400' : 'bg-yellow-50 border-yellow-400'}`}>
                                                <div className="flex justify-between items-start">
                                                    <div>
                                                        <h4 className={`font-bold flex items-center gap-2 mb-1 ${ticket.status === 'presupuesto_revision' ? 'text-red-800' : 'text-yellow-800'}`}>
                                                            {ticket.status === 'presupuesto_revision' ? <AlertCircle size={18} /> : <FileText size={18} />}
                                                            {ticket.status === 'presupuesto_revision' ? 'Presupuesto Caducado' : 'Presupuesto Disponible'}
                                                        </h4>
                                                        <p className={`text-sm mb-3 ${ticket.status === 'presupuesto_revision' ? 'text-red-700' : 'text-yellow-700'}`}>
                                                            {ticket.status === 'presupuesto_revision'
                                                                ? 'Este presupuesto ha superado los 15 días de validez. Está siendo revisado por un agente.'
                                                                : 'Se ha generado un presupuesto detallado. Válido por 15 días.'}
                                                        </p>

                                                        {ticket.quote_pdf_url && (
                                                            <a
                                                                href={ticket.quote_pdf_url}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="inline-flex items-center gap-2 text-sm font-bold text-blue-600 bg-white px-3 py-1.5 rounded-lg border border-blue-100 hover:bg-blue-50 transition mb-3 shadow-sm mr-2"
                                                            >
                                                                <FileText size={16} /> Ver Presupuesto
                                                            </a>
                                                        )}
                                                        {/* Duplicate Removed */}
                                                    </div>
                                                </div>

                                                {ticket.status === 'presupuesto_pendiente' ? (
                                                    <div className="flex gap-3 mt-2">
                                                        <button
                                                            onClick={() => handleAcceptQuote(ticket)}
                                                            className="flex-1 bg-green-600 text-white py-2 rounded-lg font-bold hover:bg-green-700 transition shadow-sm"
                                                        >
                                                            Aceptar Presupuesto
                                                        </button>
                                                        <button
                                                            onClick={() => handleRejectQuote(ticket.id)}
                                                            className="flex-1 bg-white text-red-600 border border-red-200 py-2 rounded-lg font-bold hover:bg-red-50 transition"
                                                        >
                                                            Rechazar
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <div className="mt-2 text-xs font-bold text-red-500 bg-white/50 p-2 rounded border border-red-100">
                                                        🚫 No puedes aceptar este presupuesto temporalmente. Espera a la revisión.
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {/* HISTORY TIMELINE */}
                                        {ticket.status_history && ticket.status_history.length > 0 && (
                                            <div className="mt-6 pt-4 border-t border-slate-100">
                                                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Historial de Actividad</h4>
                                                <div className="relative pl-4 space-y-4 before:absolute before:left-[5px] before:top-1 before:bottom-1 before:w-[2px] before:bg-slate-200 before:content-['']">
                                                    {ticket.status_history.map((entry, idx) => (
                                                        <div key={idx} className="relative">
                                                            <div className="absolute -left-4 top-1 w-3 h-3 rounded-full bg-white border-2 border-blue-400"></div>
                                                            <p className="text-xs font-bold text-slate-700">{entry.label}</p>
                                                            <p className="text-[10px] text-slate-400">
                                                                {new Date(entry.timestamp).toLocaleString()}
                                                            </p>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="bg-white rounded-xl p-12 text-center border border-slate-200 border-dashed">
                        <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                            <Wrench className="text-slate-400" size={32} />
                        </div>
                        <h3 className="font-bold text-slate-700 mb-1">No tienes servicios activos</h3>
                        <p className="text-slate-500 text-sm mb-6">Si tienes una avería, solicita una reparación ahora.</p>
                        <Link
                            to="/new-service"
                            className="inline-flex items-center gap-2 text-blue-600 font-bold hover:text-blue-700"
                        >
                            Solicitar Reparación <Plus size={16} />
                        </Link>
                    </div>
                )}

                {/* History List (Collapsible or just below) */}
                {historyTickets.length > 0 && (
                    <div className="space-y-4 pt-8 border-t border-slate-200">
                        <h2 className="font-bold text-lg text-slate-700 flex items-center gap-2 opacity-75">
                            <CheckCircle size={20} className="text-green-500" />
                            Historial Finalizado
                        </h2>
                        {historyTickets.map(ticket => (
                            <div key={ticket.id} className="bg-slate-50 rounded-xl p-4 border border-slate-200 opacity-75 hover:opacity-100 transition">
                                <div className="flex justify-between items-center">
                                    <div>
                                        <h3 className="font-bold text-slate-700">
                                            {ticket.appliance_info?.type} - {ticket.appliance_info?.brand}
                                        </h3>
                                        <p className="text-xs text-slate-500">
                                            Finalizado el: {new Date(ticket.updated_at).toLocaleDateString()}
                                        </p>
                                    </div>
                                    <span className={`px-2 py-1 rounded text-xs font-bold border ${getStatusColor(ticket.status)}`}>
                                        {getStatusLabel(ticket.status)}
                                    </span>
                                </div>

                                {/* REVIEW BUTTON (Only if not reviewed yet) */}
                                {ticket.status === 'finalizado' && !reviewedTicketIds.includes(ticket.id) && (
                                    <div className="mt-3 bg-yellow-50 border border-yellow-200 rounded-lg p-3 flex justify-between items-center animate-in fade-in">
                                        <div className="text-xs text-yellow-800">
                                            <span className="font-bold">¡Servicio finalizado!</span>
                                            <p>Valora al técnico para cerrarlo.</p>
                                        </div>
                                        <button
                                            onClick={() => setReviewModal({ show: true, ticketId: ticket.id, technicianId: ticket.technician_id })}
                                            className="bg-yellow-400 text-yellow-900 px-3 py-1.5 rounded-lg text-xs font-bold shadow-sm hover:bg-yellow-500 transition flex items-center gap-1"
                                        >
                                            <User size={14} /> Valorar
                                        </button>
                                    </div>
                                )}

                                {/* WARRANTY SECTION */}
                                {ticket.status === 'finalizado' && (
                                    <div className="mt-2">
                                        {ticket.warranty_until && new Date(ticket.warranty_until) > new Date() ? (
                                            <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 flex flex-wrap gap-2 justify-between items-center animate-in fade-in">
                                                <div>
                                                    <h4 className="text-xs font-bold text-purple-800 flex items-center gap-1">
                                                        <ShieldAlert size={14} /> Garantía Activa
                                                    </h4>
                                                    <p className="text-[10px] text-purple-600">
                                                        Válida hasta el {new Date(ticket.warranty_until).toLocaleDateString()}
                                                    </p>
                                                </div>
                                                <button
                                                    onClick={() => handleClaimWarranty(ticket)}
                                                    className="bg-purple-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold shadow-sm hover:bg-purple-700 transition flex items-center gap-1"
                                                >
                                                    <ShieldAlert size={14} /> Solicitar Garantía
                                                </button>
                                            </div>
                                        ) : (ticket.warranty_until ? (
                                            <div className="bg-slate-100 border border-slate-200 rounded-lg p-2 flex items-center gap-2 opacity-60 mt-2">
                                                <ShieldAlert size={12} className="text-slate-400" />
                                                <span className="text-[10px] font-bold text-slate-500">
                                                    Garantía expirada el {new Date(ticket.warranty_until).toLocaleDateString()}
                                                </span>
                                            </div>
                                        ) : null)}
                                    </div>
                                )}

                                <div className="mt-3 flex justify-end gap-2">
                                    {ticket.quote_pdf_url && (
                                        <a
                                            href={ticket.quote_pdf_url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-xs text-slate-500 hover:text-blue-600 underline flex items-center gap-1"
                                        >
                                            <FileText size={12} /> Ver Presupuesto
                                        </a>
                                    )}
                                    {ticket.pdf_url && (
                                        <a
                                            href={ticket.pdf_url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-xs bg-red-50 text-red-600 px-3 py-1.5 rounded-lg border border-red-100 font-bold hover:bg-red-100 transition flex items-center gap-1"
                                        >
                                            <FileText size={14} /> Ver Informe Final
                                        </a>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )
                }

            </div >

            {/* PRO Autopilot Proposal Modal (asynchronous after ticket creation) */}
            <AppointmentSelectorModal
                isOpen={proposalModal.show}
                slots={proposalModal.slots}
                ticketId={proposalModal.ticket?.ticket_number || proposalModal.ticket?.id}
                ticketInfo={{
                    appliance: proposalModal.ticket?.appliance_info?.type || 'Reparación',
                    brand: proposalModal.ticket?.appliance_info?.brand || '',
                    address: profile?.address || ''
                }}
                timeoutMinutes={proposalModal.timeoutMinutes}
                onConfirm={handleProposalConfirm}
                onSkip={handleProposalSkip}
                onTimeout={handleProposalTimeout}
            />

            {/* Cancel Modal */}
            {
                cancelModal.show && (
                    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-in fade-in">
                        <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4">
                            <div className="flex items-center gap-3 text-red-600 border-b border-red-100 pb-3">
                                <div className="bg-red-50 p-2 rounded-full">
                                    <AlertCircle size={24} />
                                </div>
                                <h3 className="text-lg font-bold">Cancelar Cita Confirmada</h3>
                            </div>

                            <div className="space-y-3">
                                <p className="text-slate-600 text-sm">
                                    Estás a punto de cancelar una cita que ya estaba confirmada.
                                    <br />
                                    Por favor, indícanos el motivo para gestionar tu solicitud correctamente:
                                </p>

                                <textarea
                                    value={cancelReason}
                                    onChange={(e) => setCancelReason(e.target.value)}
                                    placeholder="Ej: Me ha surgido un imprevisto, ya no necesito la reparación..."
                                    className="w-full h-24 border border-slate-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-red-500 focus:outline-none"
                                ></textarea>

                                {!cancelReason.trim() && (
                                    <p className="text-xs text-red-500 font-bold">* El motivo es obligatorio</p>
                                )}
                            </div>

                            <div className="flex gap-3 pt-2">
                                <button
                                    onClick={() => { setCancelModal({ show: false, ticketId: null }); setCancelReason(''); }}
                                    className="flex-1 py-2.5 border border-slate-300 rounded-xl font-bold text-slate-700 hover:bg-slate-50 transition"
                                >
                                    Volver
                                </button>
                                <button
                                    onClick={() => {
                                        if (!cancelReason.trim()) return;
                                        // Use direct update for cancellation to ensure status change
                                        const cancelTicket = async () => {
                                            try {
                                                const { error } = await supabase
                                                    .from('tickets')
                                                    .update({
                                                        status: 'cancelado',
                                                        appointment_status: 'rejected',
                                                        client_feedback: cancelReason,
                                                        cancellation_reason: cancelReason // New specific column
                                                    })
                                                    .eq('id', cancelModal.ticketId);

                                                if (error) throw error;

                                                fetchDashboardData();
                                                alert('Servicio cancelado correctamente.');
                                            } catch (err) {
                                                console.error(err);
                                                alert('Error al cancelar el servicio.');
                                            }
                                        };
                                        cancelTicket();
                                        setCancelModal({ show: false, ticketId: null });
                                        setCancelReason('');
                                    }}
                                    disabled={!cancelReason.trim()}
                                    className="flex-1 py-2.5 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    Confirmar Cancelación del Servicio
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Review Modal */}
            {
                reviewModal.show && (
                    <ReviewModal
                        ticketId={reviewModal.ticketId}
                        technicianId={reviewModal.technicianId}
                        onClose={() => setReviewModal({ show: false, ticketId: null, technicianId: null })}
                        onSuccess={() => {
                            fetchDashboardData();
                            addToast('¡Valoración enviada! ⭐️⭐️⭐️⭐️⭐️', 'success');
                        }}
                    />
                )
            }
        </div >
    );
};

export default Dashboard;
