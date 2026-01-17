import React, { useState, useEffect } from 'react'; // Added hooks
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase'; // Added supabase
import { X, Calendar, ClipboardList, CheckCircle, AlertCircle, Settings, LogOut, User, Star, Clock } from 'lucide-react'; // Added Star
import TechReviewsModal from './TechReviewsModal';

const TechSidebar = ({ isOpen, onClose, user, onSignOut }) => {
    const navigate = useNavigate();
    const location = useLocation();
    const [stats, setStats] = useState({ rating: 0, reviews: 0 });
    const [showReviews, setShowReviews] = useState(false);
    const [hasUpdates, setHasUpdates] = useState(false); // Red Dot

    // Menu: Removed 'Nuevos sin atender' as requested
    const menuItems = [
        { label: 'Agenda de Hoy', icon: Calendar, path: '/tech/dashboard', hasBadge: hasUpdates },
        { label: 'Mis Servicios', icon: ClipboardList, path: '/tech/all-services' },
        { label: 'Agenda Global', icon: Calendar, path: '/tech/agenda' },
        { label: 'Historial', icon: Clock, path: '/tech/history' },
    ];

    // Fetch Stats (Real from Reviews)
    useEffect(() => {
        if (user && isOpen) {
            fetchStats();

            // Listen for changes today to show red dot
            const today = new Date().toISOString().split('T')[0];
            const channel = supabase.channel('sidebar_updates')
                .on('postgres_changes', { event: '*', schema: 'public', table: 'tickets', filter: `technician_id=eq.${user.id}` }, (payload) => {
                    // Check if update is related to today (simplified check)
                    //Ideally parse payload.new.scheduled_at 
                    setHasUpdates(true);
                })
                .subscribe();

            return () => { supabase.removeChannel(channel); };
        }
    }, [user, isOpen]);

    // Clear badge when visiting dashboard
    useEffect(() => {
        if (location.pathname === '/tech/dashboard') {
            setHasUpdates(false);
        }
    }, [location.pathname]);

    const fetchStats = async () => {
        try {
            // Fetch real avg from reviews table
            const { data, error } = await supabase
                .from('reviews')
                .select('rating')
                .eq('technician_id', user.id);

            if (error) {
                console.error("Reviews fetch error:", error);
                return;
            }

            if (data && data.length > 0) {
                const totalRating = data.reduce((acc, curr) => acc + (Number(curr.rating) || 0), 0);
                const avg = totalRating / data.length;
                setStats({ rating: avg.toFixed(1), reviews: data.length });
            } else {
                setStats({ rating: 0, reviews: 0 }); // Default 0 for new techs
            }
        } catch (err) {
            console.error("Error fetching stats", err);
        }
    };

    const renderStars = (rating) => {
        return (
            <div
                className="flex items-center gap-1 mt-1 cursor-pointer group hover:bg-slate-800/50 p-1 rounded transition-colors"
                onClick={() => setShowReviews(true)}
            >
                <div className="flex">
                    {[1, 2, 3, 4, 5].map((star) => (
                        <Star
                            key={star}
                            size={14}
                            className={`${star <= Math.round(rating) ? 'fill-yellow-400 text-yellow-400' : 'text-slate-600'}`}
                        />
                    ))}
                </div>
                <span className="text-xs text-blue-400 ml-2 font-medium underline decoration-blue-400/30 group-hover:text-blue-300">
                    Ver {stats.reviews} reseñas
                </span>
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
            <div className={`fixed inset-y-0 left-0 w-[85%] max-w-xs bg-white z-[70] shadow-2xl flex flex-col animate-in slide-in-from-left duration-300`}>
                {/* Header Profile */}
                <div className="bg-slate-900 text-white p-6 pt-10 relative overflow-hidden">
                    {/* Background decoration */}
                    <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none"></div>

                    <button
                        onClick={onClose}
                        className="absolute top-4 right-4 text-slate-400 hover:text-white"
                    >
                        <X size={24} />
                    </button>

                    <div className="flex items-center gap-4 mb-4 relative z-10">
                        <div className="w-16 h-16 bg-gradient-to-br from-blue-600 to-blue-800 rounded-full flex items-center justify-center border-4 border-slate-800 shadow-xl overflow-hidden shrink-0">
                            {user?.profile?.avatar_url ? (
                                <img src={user.profile.avatar_url} alt="Profile" className="w-full h-full object-cover" />
                            ) : (
                                <span className="text-2xl font-bold">{user?.email?.charAt(0).toUpperCase()}</span>
                            )}
                        </div>
                        <div>
                            <p className="text-[10px] text-blue-400 font-bold uppercase tracking-widest mb-0.5">TÉCNICO</p>
                            <h2 className="text-lg font-bold leading-tight">{user?.profile?.full_name || 'Sin Nombre'}</h2>
                            {/* Rating Stars */}
                            {renderStars(stats.rating)}
                        </div>
                    </div>

                    {/* Status Badge - Click to see reason */}
                    <div
                        onClick={() => {
                            if (user?.profile?.status_reason) {
                                alert(`📢 INFORMACIÓN DE ESTADO\n\nMotivo: ${user.profile.status_reason}`);
                            } else {
                                // Optional: Show modal even if no reason? No, just info.
                                // Actually user wants to see it.
                                alert(`📢 ESTADO: ${user?.profile?.status?.toUpperCase()}\n\nTodo parece correcto.`);
                            }
                        }}
                        className="flex items-center gap-2 mt-2 bg-slate-800/50 p-2 rounded-lg border border-slate-700/50 cursor-pointer hover:bg-slate-700 transition"
                    >
                        <div className={`w-2 h-2 rounded-full animate-pulse shadow-[0_0_8px_rgba(255,255,255,0.2)] ${user?.profile?.status === 'paused' ? 'bg-yellow-500 shadow-yellow-500/50' :
                            user?.profile?.status === 'suspended' ? 'bg-red-500 shadow-red-500/50' :
                                'bg-emerald-500 shadow-emerald-500/50'
                            }`}></div>
                        <span className={`text-xs font-medium ${user?.profile?.status === 'paused' ? 'text-yellow-400' :
                            user?.profile?.status === 'suspended' ? 'text-red-400' :
                                'text-emerald-400'
                            }`}>
                            Estado: {user?.profile?.status === 'paused' ? 'Pausado' : user?.profile?.status === 'suspended' ? 'Suspendido' : 'Activo'}
                        </span>
                        {(user?.profile?.status === 'paused' || user?.profile?.status === 'suspended') && (
                            <AlertCircle size={14} className="text-slate-400 ml-auto" />
                        )}
                    </div>
                </div>

                {/* Menu */}
                <div className="flex-1 overflow-y-auto py-6">
                    <nav className="space-y-2 px-3">
                        {menuItems.map((item, index) => (
                            <button
                                key={index}
                                onClick={() => {
                                    navigate(item.path);
                                    onClose();
                                }}
                                className={`w-full flex items-center gap-4 px-4 py-3.5 rounded-xl transition-all duration-200 group relative ${location.pathname === item.path
                                    ? 'bg-blue-50 text-blue-700 shadow-sm border border-blue-100'
                                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 border border-transparent'
                                    }`}
                            >
                                <item.icon size={22} className={`transition-colors ${location.pathname === item.path ? 'text-blue-600' : 'text-slate-400 group-hover:text-slate-600'}`} />
                                <span className="font-semibold">{item.label}</span>
                                {location.pathname === item.path && (
                                    <div className="ml-auto w-1.5 h-1.5 bg-blue-600 rounded-full"></div>
                                )}
                                {/* Red Dot Notification */}
                                {item.hasBadge && (
                                    <div className="absolute right-2 top-2 w-2.5 h-2.5 bg-red-500 rounded-full border border-white animate-bounce"></div>
                                )}
                            </button>
                        ))}
                    </nav>

                    <div className="px-3 mt-6 pt-6 border-t border-slate-100">
                        <button
                            onClick={() => { navigate('/tech/settings'); onClose(); }}
                            className="w-full flex items-center gap-4 px-4 py-3 rounded-xl text-slate-500 hover:bg-slate-50 hover:text-slate-800 transition-colors"
                        >
                            <Settings size={22} />
                            <span className="font-medium">Configuración</span>
                        </button>
                    </div>
                </div>

                {/* Footer */}
                <div className="p-4 bg-slate-50/50">
                    <button
                        onClick={onSignOut}
                        className="w-full flex items-center justify-center gap-2 text-red-600 hover:bg-white hover:shadow-sm p-3 rounded-xl transition-all font-bold text-sm border border-transparent hover:border-red-100"
                    >
                        <LogOut size={18} />
                        Cerrar Sesión
                    </button>
                    <p className="text-center text-[10px] text-slate-300 mt-2">v4.5.0 PRO</p>
                </div>
            </div>

            {/* Modal */}
            <TechReviewsModal
                isOpen={showReviews}
                onClose={() => setShowReviews(false)}
                userId={user?.id}
            />
        </>
    );
};

export default TechSidebar;
