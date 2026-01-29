import { Outlet, Navigate } from 'react-router-dom';
import { Bot } from 'lucide-react';
import PaymentGatewayModal from '../components/PaymentGatewayModal';
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

const DashboardLayout = ({ session }) => {
    if (!session) return <Navigate to="/auth/login" />;

    const [paymentRequest, setPaymentRequest] = useState(null);
    const [isProModeActive, setIsProModeActive] = useState(false);

    useEffect(() => {
        const checkProMode = async () => {
            const { data } = await supabase
                .from('business_config')
                .select('value')
                .eq('key', 'secretary_mode')
                .single();
            setIsProModeActive((data?.value ?? '').toString().toLowerCase() === 'pro');
        };
        checkProMode();
        const channel = supabase
            .channel('client-secretary-mode')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'business_config', filter: 'key=eq.secretary_mode' }, (payload) => {
                setIsProModeActive((payload.new?.value ?? '').toString().toLowerCase() === 'pro');
            })
            .subscribe();
        return () => { supabase.removeChannel(channel); };
    }, []);

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

        // Initial check
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
        <div className="min-h-screen bg-slate-50 relative" style={isProModeActive ? { border: '4px solid #D4AF37', boxSizing: 'border-box' } : undefined}>
            {isProModeActive && (
                <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[9999] pointer-events-none">
                    <div className="bg-gradient-to-r from-[#1a1506] via-[#2a2010] to-[#1a1506] px-5 py-2 rounded-full shadow-xl flex items-center gap-2.5 border-2 border-[#D4AF37]">
                        <div className="relative">
                            <div className="w-7 h-7 bg-gradient-to-br from-[#D4AF37] to-[#c9a227] rounded-full flex items-center justify-center">
                                <Bot size={16} className="text-[#1a1506]" />
                            </div>
                            <div className="absolute -inset-1 bg-emerald-400 rounded-full animate-ping opacity-30" />
                        </div>
                        <span className="text-xs font-black text-[#D4AF37] uppercase tracking-wide">AUTOPILOT ACTIVO</span>
                        <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse shadow-lg shadow-emerald-400/50" />
                    </div>
                </div>
            )}
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
