import React, { useState, useEffect } from 'react'; // Added hooks
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase'; // Added supabase
import { X, Calendar, ClipboardList, CheckCircle, AlertCircle, Settings, LogOut, User, Star, Clock } from 'lucide-react'; // Added Star

const TechSidebar = ({ isOpen, onClose, user, onSignOut }) => {
    const navigate = useNavigate();
    const location = useLocation();
    const [stats, setStats] = useState({ rating: 0, reviews: 0 });

    const menuItems = [
        { label: 'Agenda de Hoy', icon: Calendar, path: '/tech/dashboard' },
        { label: 'Mis Servicios', icon: ClipboardList, path: '/tech/all-services' },
        { label: 'Agenda', icon: Calendar, path: '/tech/agenda' },
        { label: 'Nuevos sin atender', icon: AlertCircle, path: '/tech/new-services' },
        { label: 'Historial', icon: Clock, path: '/tech/history' },
    ];

    // Fetch Stats
    useEffect(() => {
        if (user && isOpen) {
            fetchStats();
        }
    }, [user, isOpen]);

    const fetchStats = async () => {
        // Mocking behavior if columns don't exist yet, but trying real query
        try {
            const { data, error } = await supabase
                .from('tickets')
                .select('rating')
                .eq('technician_id', user.id)
                .not('rating', 'is', null);

            if (data && data.length > 0) {
                const avg = data.reduce((acc, curr) => acc + curr.rating, 0) / data.length;
                setStats({ rating: avg.toFixed(1), reviews: data.length });
            } else {
                setStats({ rating: 0, reviews: 0 }); // New tech or no ratings
            }
        } catch (err) {
            console.error("Error fetching stats", err);
        }
    };

    const renderStars = (rating) => {
        return (
            <div className="flex items-center gap-0.5 mt-1">
                {[1, 2, 3, 4, 5].map((star) => (
                    <Star
                        key={star}
                        size={14}
                        className={`${star <= Math.round(rating) ? 'fill-yellow-400 text-yellow-400' : 'text-slate-600'}`}
                    />
                ))}
                <span className="text-xs text-slate-400 ml-2 font-medium">({stats.reviews})</span>
            </div>
        );
    };

    if (!isOpen) return null;

    return (
        <>
            {/* Backdrop */}
            <div
                className="fixed inset-0 bg-black/50 z-[60] backdrop-blur-sm transition-opacity"
                onClick={onClose}
            />

            {/* Sidebar/Drawer */}
            <div className={`fixed inset-y-0 left-0 w-[80%] max-w-xs bg-white z-[70] shadow-2xl flex flex-col animate-in slide-in-from-left duration-300`}>
                {/* Header Profile */}
                <div className="bg-slate-900 text-white p-6 pt-10">
                    <button
                        onClick={onClose}
                        className="absolute top-4 right-4 text-slate-400 hover:text-white"
                    >
                        <X size={24} />
                    </button>

                    <div className="flex items-center gap-4 mb-4">
                        <div className="w-14 h-14 bg-blue-600 rounded-full flex items-center justify-center border-2 border-slate-800 shadow-xl overflow-hidden shrink-0">
                            {user?.profile?.avatar_url ? (
                                <img src={user.profile.avatar_url} alt="Profile" className="w-full h-full object-cover" />
                            ) : (
                                <span className="text-xl font-bold">{user?.email?.charAt(0).toUpperCase()}</span>
                            )}
                        </div>
                        <div>
                            <p className="text-xs text-blue-400 font-bold uppercase tracking-wider">Técnico</p>
                            <h2 className="text-lg font-bold leading-tight">{user?.profile?.full_name || 'Sin Nombre'}</h2>
                            {/* Rating Stars */}
                            {renderStars(stats.rating)}
                        </div>
                    </div>
                </div>

                {/* Menu */}
                <div className="flex-1 overflow-y-auto py-4">
                    <nav className="space-y-1 px-2">
                        {menuItems.map((item, index) => (
                            <button
                                key={index}
                                onClick={() => {
                                    navigate(item.path);
                                    onClose();
                                }}
                                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${location.pathname === item.path
                                    ? 'bg-blue-50 text-blue-700'
                                    : 'text-slate-600 hover:bg-slate-50'
                                    }`}
                            >
                                <item.icon size={20} />
                                <span className="font-medium">{item.label}</span>
                            </button>
                        ))}
                    </nav>

                    <div className="px-4 py-4 mt-4 border-t border-slate-100">
                        <button
                            onClick={() => { navigate('/tech/settings'); onClose(); }}
                            className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-slate-600 hover:bg-slate-50"
                        >
                            <Settings size={20} />
                            <span className="font-medium">Ajustes</span>
                        </button>
                    </div>
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-slate-100 bg-slate-50">
                    <button
                        onClick={onSignOut}
                        className="w-full flex items-center justify-center gap-2 text-red-600 hover:bg-red-50 p-2 rounded-lg transition-colors font-medium border border-red-200"
                    >
                        <LogOut size={18} />
                        Cerrar Sesión
                    </button>
                </div>
            </div>
        </>
    );
};

export default TechSidebar;
