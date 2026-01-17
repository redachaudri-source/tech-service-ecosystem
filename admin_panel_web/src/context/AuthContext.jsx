import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext({});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [role, setRole] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Check active session
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (session?.user) {
                initializeUser(session.user);
            } else {
                setLoading(false);
            }
        });

        // Listen for changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            if (session?.user) {
                initializeUser(session.user);
            } else {
                setUser(null);
                setRole(null);
                setLoading(false);
            }
        });

        return () => subscription.unsubscribe();
    }, []);

    const initializeUser = async (authUser) => {
        try {
            // Fetch profile to get role
            const { data: profile, error } = await supabase
                .from('profiles')
                .select('role, full_name, permissions, is_super_admin, status, status_reason, avatar_url') // Added avatar_url
                .eq('id', authUser.id)
                .single();

            if (error) {
                console.error("Error fetching role:", error);
                setRole(null);
            } else {
                setRole(profile.role);
                authUser.profile = profile;

                // Security Check 1: Initial Load
                if (profile.status === 'suspended') {
                    alert('Tu cuenta ha sido suspendida. Contacta con administración.');
                    await signOut();
                    return;
                }

                // Security Check 2: Real-time Listener (Kill Switch)
                const channel = supabase.channel(`auth_watch_${authUser.id}`)
                    .on(
                        'postgres_changes',
                        { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${authUser.id}` },
                        async (payload) => {
                            const newStatus = payload.new.status;
                            const newReason = payload.new.status_reason;

                            if (newStatus === 'suspended') {
                                alert(`⛔ CUENTA SUSPENDIDA\n\nMotivo: ${newReason || 'Sin motivo especificado.'}\n\nCerrando sesión...`);
                                await signOut();
                                window.location.href = '/'; // Force clear
                            } else {
                                // Update local state for Paused mode etc without reload
                                setUser(prev => ({
                                    ...prev,
                                    profile: {
                                        ...prev.profile,
                                        status: newStatus,
                                        status_reason: newReason
                                    }
                                }));

                                // Optional: Alert on change to Paused if active?
                                // if (newStatus === 'paused') alert(`⚠️ TU ESTADO HA CAMBIADO A: PAUSADO\n\nMotivo: ${newReason}`);
                            }
                        }
                    )
                    .subscribe();
            }
            setUser(authUser);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const signOut = async () => {
        await supabase.auth.signOut();
        setUser(null);
        setRole(null);
    };

    return (
        <AuthContext.Provider value={{ user, role, loading, signOut }}>
            {!loading ? children : <div className="h-screen flex items-center justify-center bg-slate-900 text-white">Cargando...</div>}
        </AuthContext.Provider>
    );
};
