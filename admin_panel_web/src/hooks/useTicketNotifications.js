import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export const useTicketNotifications = () => {
    const [count, setCount] = useState(0);
    const [loading, setLoading] = useState(true);

    const fetchCounts = async () => {
        try {
            // Broadest possible query: Get all active tickets
            const { data, error } = await supabase
                .from('tickets')
                .select('status')
                .not('status', 'in', '("finalizado","pagado","cancelado","entregado")');

            if (error) throw error;

            if (data) {
                const alertStatuses = [
                    'request', 'solicitado', 'pendiente_aceptacion', 'pendiente', 'new',
                    'requested', 'pendiente aceptación', 'pendiente_aceptacion',
                    'waiting_approval', 'en espera', 'abierto'
                ];

                const matchCount = data.filter(t => {
                    if (!t.status) return false;
                    const normalized = t.status.toLowerCase().trim();
                    // Fuzzy match: exact list OR contains 'solicitado'
                    return alertStatuses.includes(normalized) || normalized.includes('solicitado');
                }).length;

                console.log('🔔 useTicketNotifications: Found', matchCount, 'DB Raw Statuses:', data.map(t => t.status));
                setCount(matchCount);
            }
        } catch (err) {
            console.error('Error in notification hook:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchCounts();

        // 1. Realtime Subscription
        const channel = supabase.channel('global_notifications')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'tickets' },
                () => {
                    console.log('🔔 RT Update received, refetching...');
                    fetchCounts();
                }
            )
            .subscribe();

        // 2. Fallback Polling (Every 30s) - "A prueba o balas"
        const interval = setInterval(fetchCounts, 30000);

        return () => {
            supabase.removeChannel(channel);
            clearInterval(interval);
        };
    }, []);

    return { count, loading };
};
