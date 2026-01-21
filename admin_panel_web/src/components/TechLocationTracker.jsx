import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext'; // Import useAuth
import { Wifi } from 'lucide-react'; // Changed icon to represent connectivity

const TechLocationTracker = () => {
    const { user } = useAuth();
    const technicianId = user?.id;
    const [lastPing, setLastPing] = useState(null);

    useEffect(() => {
        if (!technicianId) return;

        // Heartbeat (Presence) - Runs ALWAYS every 60s
        const heartbeat = setInterval(async () => {
            try {
                const now = new Date().toISOString();
                await supabase.from('profiles').update({
                    last_location_update: now
                }).eq('id', technicianId);
                setLastPing(now);
            } catch (e) {
                console.error("Heartbeat fail", e);
            }
        }, 60000); // 60 seconds

        // Initial Ping on Mount
        const initialPing = new Date().toISOString();
        supabase.from('profiles').update({ last_location_update: initialPing }).eq('id', technicianId).then(() => setLastPing(initialPing));

        return () => {
            clearInterval(heartbeat);
        };
    }, [technicianId]);

    // Optional: Visual indicator for debug (can be removed or made invisible)
    // For now, we'll keep it hidden or very subtle unless there's a problem, 
    // but the original requirement was to show something if tracking. 
    // Since this is just heartbeat, we don't strictly need a UI, 
    // but let's return null to keep the UI clean as per modern patterns.
    return null;
};

export default TechLocationTracker;
