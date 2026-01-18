import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Lock, Mail, AlertCircle } from 'lucide-react';
import { Capacitor } from '@capacitor/core';

const Login = () => {
    const navigate = useNavigate();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const isNative = Capacitor.isNativePlatform();

    const [error, setError] = useState(null);

    // [REDIRECT LOGIC] If accessed via 'tecnico' subdomain, go to Tech Login
    useEffect(() => {
        if (window.location.hostname.includes('tecnico')) {
            navigate('/tech/login');
        }
    }, []);

    const handleLogin = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            // Auto-append domain for simple usernames
            let loginEmail = email.trim();
            if (!loginEmail.includes('@')) {
                loginEmail = `${loginEmail}@example.com`;
            }

            const { data, error: authError } = await supabase.auth.signInWithPassword({
                email: loginEmail,
                password,
            });

            if (authError) throw authError;

            // Check if user is admin
            const { data: profile, error: profileError } = await supabase
                .from('profiles')
                .select('role')
                .eq('id', data.user.id)
                .single();

            if (profileError) throw profileError;

            if (profileError) throw profileError;

            // [NATIVE APP LOGIC] Allow techs to login if native
            if (isNative) {
                // If it's a tech app, we allow techs (and admins too for debugging)
                // But we redirect them to tech dashboard
                if (profile.role === 'technician') {
                    navigate('/tech/dashboard'); // Direct to tech dashboard
                    return;
                }
            } else {
                // [WEB LOGIC] Only admins on main web (techs use subdomain usually)
                if (profile.role !== 'admin') {
                    // Optional: check if we are on tech subdomain, but here we enforce admin for main panel
                    if (!window.location.hostname.includes('tecnico')) {
                        await supabase.auth.signOut();
                        throw new Error('Acceso denegado. Esta área es exclusiva para Administradores.');
                    }
                }
            }

            // Success
            navigate('/');
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
            <div className="max-w-md w-full bg-white rounded-2xl shadow-2xl overflow-hidden">
                <div className="p-8">
                    <div className="text-center mb-8">
                        <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-cyan-500 bg-clip-text text-transparent">
                            {isNative ? "Fixarr Tech'Go" : "AdminPanel"}
                        </h1>
                        <p className="text-slate-500 mt-2">{isNative ? "Acceso Técnico" : "Acceso Seguro"}</p>
                    </div>

                    {error && (
                        <div className="mb-6 p-4 bg-red-50 border-l-4 border-red-500 flex items-start gap-3 rounded text-red-700 text-sm">
                            <AlertCircle size={18} className="mt-0.5" />
                            <span>{error}</span>
                        </div>
                    )}

                    <form onSubmit={handleLogin} className="space-y-6">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Usuario o Email</label>
                            <div className="relative">
                                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                                <input
                                    type="text"
                                    required
                                    className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                                    placeholder="admin o admin@techservice.com"
                                    value={email}
                                    onChange={e => setEmail(e.target.value)}
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Contraseña</label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                                <input
                                    type="password"
                                    required
                                    className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                                    placeholder="••••••••"
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                />
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full bg-slate-900 text-white py-3 rounded-lg font-bold hover:bg-slate-800 transition transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {loading ? 'Verificando...' : 'Entrar al Sistema'}
                        </button>
                    </form>
                </div>
                <div className="bg-slate-50 p-4 text-center text-xs text-slate-400 border-t border-slate-100">
                    Tech Service Ecosystem &copy; 2024
                </div>
            </div>
        </div>
    );
};

export default Login;
