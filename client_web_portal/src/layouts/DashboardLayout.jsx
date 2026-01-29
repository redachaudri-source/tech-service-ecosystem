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
        if (!session?.user?.id) return;

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
                        setPaymentRequest(null);
                    }
                }
            )
            .subscribe();

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

        return () => { supabase.removeChannel(channel); };
    }, [session.user.id]);

    // AUTOPILOT badge + borde oro — dato real desde business_config
    useEffect(() => {
        const norm = (v) => (v != null ? String(v).toLowerCase().trim() : '');
        const check = async () => {
            const { data } = await supabase.from('business_config').select('value').eq('key', 'secretary_mode').single();
            setIsProModeActive(norm(data?.value) === 'pro');
        };
        check();
        const ch = supabase
            .channel('client-secretary-mode')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'business_config', filter: 'key=eq.secretary_mode' }, (p) => {
                setIsProModeActive(norm(p.new?.value) === 'pro');
            })
            .subscribe();
        return () => { supabase.removeChannel(ch); };
    }, []);

    return (
        <div className={`min-h-screen bg-slate-50 relative ${isProModeActive ? 'ring-4 ring-[#D4AF37] ring-inset shadow-[inset_0_0_30px_rgba(212,175,55,0.2)]' : ''}`}>
            <div className="max-w-7xl mx-auto pb-20 sm:pb-0">
                <Outlet />
            </div>

            {isProModeActive && (
                <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[9999]">
                    <div className="bg-gradient-to-r from-[#1a1506] via-[#2a2010] to-[#1a1506] px-5 py-2 rounded-full shadow-xl flex items-center gap-2.5 border-2 border-[#D4AF37]">
                        <div className="relative">
                            <div className="w-7 h-7 bg-[#D4AF37] rounded-full flex items-center justify-center">
                                <Bot size={14} className="text-[#1a1506]" />
                            </div>
                            <div className="absolute -inset-1 bg-[#D4AF37] rounded-full animate-ping opacity-30" />
                        </div>
                        <span className="text-sm font-bold text-[#D4AF37]">AUTOPILOT ACTIVO</span>
                        <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
                    </div>
                </div>
            )}

            {paymentRequest && (
                <PaymentGatewayModal
                    ticket={paymentRequest}
                    onClose={() => setPaymentRequest(null)}
                    onSuccess={() => setPaymentRequest(null)}
                />
            )}
        </div>
    );
};

export default DashboardLayout;
