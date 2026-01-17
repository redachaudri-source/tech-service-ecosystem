import { Outlet, Navigate } from 'react-router-dom';

import PaymentGatewayModal from '../components/PaymentGatewayModal';
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

const DashboardLayout = ({ session }) => {
    if (!session) return <Navigate to="/auth/login" />;

    const [paymentRequest, setPaymentRequest] = useState(null);

    useEffect(() => {
        if (!session?.user?.id) return;

        // Listen for tickets in PENDING_PAYMENT status for this user
        const channel = supabase
            .channel(`client-payments-${session.user.id}`)
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'tickets',
                    filter: `client_id=eq.${session.user.id}`
                },
                (payload) => {
                    const newStatus = payload.new.status;
                    if (newStatus === 'PENDING_PAYMENT' && !payload.new.is_paid) {
                        setPaymentRequest(payload.new);
                    } else if (newStatus === 'finalizado' || payload.new.is_paid) {
                        setPaymentRequest(null); // Close if paid elsewhere
                    }
                }
            )
            .subscribe();

        // Initial check? (Optional, might be annoying on refresh if already pending, but good for persistence)
        // For now, relies on realtime event or if user navigates. 
        // Better to check on mount if there's any pending payment.
        const checkPending = async () => {
            const { data } = await supabase
                .from('tickets')
                .select('*')
                .eq('client_id', session.user.id)
                .eq('status', 'PENDING_PAYMENT')
                .eq('is_paid', false)
                .maybeSingle();

            if (data) setPaymentRequest(data);
        };
        checkPending();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [session.user.id]);

    return (
        <div className="min-h-screen bg-slate-50">
            {/* We can put a global Navbar here if needed, or leave it to pages */}
            {/* For now, just wrapping the content */}
            <div className="max-w-7xl mx-auto pb-20 sm:pb-0">
                <Outlet />
            </div>

            {/* Global Modals */}
            {paymentRequest && (
                <PaymentGatewayModal
                    ticket={paymentRequest}
                    onClose={() => setPaymentRequest(null)} // Or disallow close?
                    onSuccess={() => setPaymentRequest(null)}
                />
            )}
        </div>
    );
};

export default DashboardLayout;
