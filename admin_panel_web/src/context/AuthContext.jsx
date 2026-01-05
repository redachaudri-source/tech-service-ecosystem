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
                .select('role, full_name, permissions, is_super_admin')
                .eq('id', authUser.id)
                .single();

            if (error) {
                console.error("Error fetching role:", error);
                // If profile doesn't exist but auth does, we might have an issue. 
                // For now, assume guest/no-role.
                setRole(null);
            } else {
                setRole(profile.role);
                // Extend user object with profile data for easy access
                authUser.profile = profile;
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
