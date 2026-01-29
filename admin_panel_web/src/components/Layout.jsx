import { Link, Outlet, useLocation } from 'react-router-dom';
import {
    LayoutDashboard, Users, Map, Package, LogOut, UserCheck, Settings as SettingsIcon,
    Globe, Calendar, Tag, FileText, Menu as MenuIcon, X, Briefcase, TrendingUp,
    ChevronDown, ChevronRight, HelpCircle, Scale, Bell, Truck, Bot
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useState, useEffect } from 'react';
import { useTicketNotifications } from '../hooks/useTicketNotifications'; // NEW HOOK

// Helper: Custom Tooltip
const NavTooltip = ({ text }) => (
    <div className="group relative ml-auto inline-flex z-50">
        <HelpCircle size={10} className="text-slate-600 cursor-help hover:text-blue-400 transition-colors opacity-0 group-hover:opacity-100 peer-hover:opacity-100" />
        <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 w-48 bg-slate-800 text-white text-[9px] p-2 rounded shadow-xl opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50 border border-slate-700 font-medium">
            {text}
            <div className="absolute left-0 top-1/2 -translate-y-1/2 -ml-1 border-4 border-transparent border-r-slate-800" />
        </div>
    </div>
);

const Layout = () => {
    const { signOut, user } = useAuth();
    const location = useLocation();
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

    // State for Section Toggles
    const [openSections, setOpenSections] = useState({ settings: true });

    const toggleSection = (key) => setOpenSections(prev => ({ ...prev, [key]: !prev[key] }));

    // Items
    const mainNav = [
        { icon: LayoutDashboard, label: 'Escritorio', path: '/' },
        { icon: Scale, label: 'Sala Mortify', path: '/mortify' },
        { icon: Map, label: 'Flota', path: '/tracking' },
        { icon: Users, label: 'Clientes', path: '/clients' },
        { icon: Calendar, label: 'Agenda Global', path: '/agenda' },
        { icon: Truck, label: 'Servicios', path: '/services', isHero: true },
        { icon: Package, label: 'Gestión de Repuestos', path: '/materials' },
        { icon: FileText, label: 'Presupuestos', path: '/budgets' },
        { icon: UserCheck, label: 'Equipo Técnico', path: '/team' },
        { icon: TrendingUp, label: 'Analytics (BI)', path: '/analytics' },
        { icon: Bot, label: 'Secretaria Virtual', path: '/secretary' },
    ];

    const settingsNav = [
        { icon: SettingsIcon, label: 'Configuración', path: '/settings', help: 'Gestión integral del sistema (Identidad, Reglas, Catálogos).' },
    ];

    // Close mobile menu when route changes
    useEffect(() => {
        setIsMobileMenuOpen(false);
    }, [location.pathname]);

    // --- NEW ARCHITECTURE: USE HOOK ---
    const { count: notificationCount } = useTicketNotifications();

    // MORTIFY NOTIFICATIONS
    // MORTIFY NOTIFICATIONS & REALTIME
    const [mortifyCount, setMortifyCount] = useState(0);
    const [showMortifyBanner, setShowMortifyBanner] = useState(false);

    useEffect(() => {
        // 1. Initial Fetch
        const fetchMortifyCount = async () => {
            const { count } = await supabase
                .from('mortify_assessments')
                .select('*', { count: 'exact', head: true })
                .eq('status', 'PENDING_JUDGE');
            setMortifyCount(count || 0);

            // Auto-dismiss if 0
            if (count === 0) setShowMortifyBanner(false);
        };
        fetchMortifyCount();

        // 2. Realtime Subscription (Robust Re-fetch Strategy)
        const channel = supabase
            .channel('admin-mortify-notifications')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'mortify_assessments' },
                (payload) => {
                    // Refetch on any change to ensure accuracy without complex state logic
                    fetchMortifyCount();

                    // Optional: Show banner only on NEW incoming requests
                    if (payload.eventType === 'INSERT' && payload.new.status === 'PENDING_JUDGE') {
                        setShowMortifyBanner(true);
                        playNotificationSound();
                    }
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    // AUTO-DISMISS LOGIC
    useEffect(() => {
        if (mortifyCount === 0) {
            setShowMortifyBanner(false);
        }
    }, [mortifyCount]);

    useEffect(() => {
        if (location.pathname === '/mortify') {
            setShowMortifyBanner(false);
        }
    }, [location.pathname]);

    // ═══════════════════════════════════════════════════════════════
    // SECRETARIA VIRTUAL PRO INDICATOR
    // ═══════════════════════════════════════════════════════════════
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

        // Subscribe to changes (source of truth: DB)
        const channel = supabase
            .channel('secretary-mode-changes')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'business_config', filter: "key=eq.secretary_mode" },
                (payload) => {
                    setIsProModeActive((payload.new?.value ?? '').toString().toLowerCase() === 'pro');
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    // Sound Effect Helper
    const playNotificationSound = () => {
        try {
            const isMuted = localStorage.getItem('mute_notifications') === 'true';
            if (!isMuted) {
                const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
                audio.volume = 0.5;
                audio.play().catch(e => console.log('Audio blocked', e));
            }
        } catch (e) { }
    };

    // Sound Effect on Count Increase (Local State to track prev)
    const [prevCount, setPrevCount] = useState(0);

    useEffect(() => {
        if (notificationCount > prevCount) {
            try {
                const isMuted = localStorage.getItem('mute_notifications') === 'true';
                if (!isMuted) {
                    const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
                    audio.volume = 0.5;
                    audio.play().catch(e => console.log('Audio blocked', e));
                }
            } catch (e) { }
        }
        setPrevCount(notificationCount);
    }, [notificationCount]);
    // ----------------------------------

    const NavItem = ({ item, isSub = false }) => {
        const Icon = item.icon;
        const isActive = location.pathname === item.path;
        const isHero = item.isHero;
        // Badge Logic
        const hasTicketBadge = item.path === '/services' && notificationCount > 0;
        const hasMortifyBadge = item.path === '/mortify' && mortifyCount > 0;
        const hasBadge = hasTicketBadge || hasMortifyBadge;
        const badgeCount = hasTicketBadge ? notificationCount : mortifyCount;

        return (
            <Link
                to={item.path}
                className={`group relative flex items-center justify-between px-3 rounded-md transition-all duration-300 border border-transparent
                    ${isActive
                        ? 'bg-blue-600/10 border-blue-600/20 text-blue-400'
                        : 'text-slate-400 hover:text-[#d4a017] hover:bg-slate-800/70'}
                    ${isSub ? 'ml-3 pl-3 border-l border-slate-800 hover:border-slate-700 rounded-none rounded-r-md text-[11px] py-2' : 'text-[12px] py-2.5'}
                    ${isHero
                        ? 'font-black text-[14px] bg-gradient-to-r from-orange-500/20 to-amber-500/20 border-l-4 border-l-orange-500 text-orange-200 hover:from-orange-500/30 hover:to-amber-500/30 hover:text-[#d4a017] hover:border-l-[#d4a017] hover:shadow-lg hover:shadow-orange-500/20 my-2 py-3.5 hover:scale-[1.02]'
                        : 'hover:scale-[1.01]'}
                `}
                style={!isActive && !isSub ? {
                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
                } : {}}
            >
                <div className="flex items-center gap-2.5">
                    <Icon
                        size={isSub ? 13 : (isHero ? 18 : 15)}
                        className={`transition-all duration-300 ${isActive
                            ? 'text-blue-400'
                            : isHero
                                ? 'text-orange-400 group-hover:text-[#d4a017] group-hover:drop-shadow-[0_0_8px_rgba(212,160,23,0.6)]'
                                : 'text-slate-500 group-hover:text-[#d4a017] group-hover:drop-shadow-[0_0_6px_rgba(212,160,23,0.5)]'
                            }`}
                    />
                    <span
                        className={`tracking-wide transition-all duration-300 ${isHero
                            ? 'uppercase tracking-widest font-black group-hover:drop-shadow-[0_0_10px_rgba(212,160,23,0.7)]'
                            : 'font-medium group-hover:drop-shadow-[0_0_8px_rgba(212,160,23,0.6)]'
                            }`}
                    >
                        {item.label}
                    </span>
                </div>

                {hasBadge && (
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 flex h-4 w-4">
                        <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${hasMortifyBadge ? 'bg-amber-400' : 'bg-red-400'}`}></span>
                        <span className={`relative inline-flex rounded-full h-4 w-4 items-center justify-center text-[8px] font-bold text-white ${hasMortifyBadge ? 'bg-amber-500' : 'bg-red-500'}`}>
                            {badgeCount > 9 ? '9+' : badgeCount}
                        </span>
                    </span>
                )}

                {item.help && !hasBadge && (
                    <div className="group/help relative ml-2">
                        <HelpCircle size={12} className="text-slate-700 cursor-help hover:text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                        <div className="absolute left-full top-1/2 -translate-y-1/2 ml-3 w-40 bg-slate-900 text-slate-300 text-[10px] p-2 rounded border border-slate-700 shadow-xl opacity-0 group-hover/help:opacity-100 pointer-events-none z-[60]">
                            {item.help}
                        </div>
                    </div>
                )}
            </Link>
        );
    };

    return (
        <div className={`flex h-screen w-full bg-slate-50 overflow-hidden font-sans relative ${isProModeActive ? 'shadow-[inset_0_0_30px_rgba(212,175,55,0.12)]' : ''}`} style={isProModeActive ? { border: '4px solid #D4AF37', boxSizing: 'border-box' } : undefined}>

            {/* ═══════════════════════════════════════════════════════════════ */}
            {/* SECRETARIA VIRTUAL PRO ACTIVE INDICATOR */}
            {/* ═══════════════════════════════════════════════════════════════ */}
            {isProModeActive && (
                <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[9999]">
                    <div className="bg-gradient-to-r from-[#1a1506] via-[#2a2010] to-[#1a1506] px-6 py-2.5 rounded-full shadow-2xl flex items-center gap-3 border-2 border-[#c9a227] backdrop-blur-sm">
                        {/* Animated Bot Icon */}
                        <div className="relative">
                            <div className="w-8 h-8 bg-gradient-to-br from-[#d4a853] to-[#c9a227] rounded-full flex items-center justify-center shadow-lg">
                                <Bot size={18} className="text-[#1a1506]" />
                            </div>
                            {/* Pulse ring */}
                            <div className="absolute -inset-1 bg-[#c9a227] rounded-full animate-ping opacity-30" />
                        </div>

                        {/* Text */}
                        <div className="flex flex-col">
                            <span className="text-[10px] font-bold text-[#D4AF37]/80 uppercase tracking-widest">
                                Autopilot
                            </span>
                            <span className="text-sm font-black text-[#D4AF37] tracking-wide">
                                AUTOPILOT ACTIVO
                            </span>
                        </div>

                        {/* Status Dot - verde pulsante */}
                        <div className="flex items-center gap-1.5 ml-2 px-3 py-1 bg-[#D4AF37]/20 rounded-full">
                            <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse shadow-lg shadow-emerald-400/50" />
                            <span className="text-xs font-bold text-emerald-400 uppercase">Activo</span>
                        </div>
                    </div>
                </div>
            )}

            {/* GLOBAL NOTIFICATION BANNER (MORTIFY) */}
            {showMortifyBanner && (
                <div className="absolute top-4 right-4 z-[9999] animate-in slide-in-from-top-5 duration-300">
                    <Link
                        to="/mortify"
                        onClick={() => setShowMortifyBanner(false)}
                        className="bg-slate-900 text-white px-4 py-3 rounded-xl shadow-2xl flex items-center gap-4 border border-slate-700 hover:scale-105 transition-transform cursor-pointer"
                    >
                        <div className="bg-amber-500 p-2 rounded-lg text-slate-900 animate-pulse">
                            <Scale size={20} />
                        </div>
                        <div>
                            <p className="font-bold text-sm">Nueva Solicitud Mortify</p>
                            <p className="text-xs text-slate-400">Un cliente requiere análisis de viabilidad</p>
                        </div>
                        <button
                            onClick={(e) => { e.preventDefault(); setShowMortifyBanner(false); }}
                            className="p-1 hover:bg-slate-800 rounded-full"
                        >
                            <X size={16} className="text-slate-500" />
                        </button>
                    </Link>
                </div>
            )}

            {/* Mobile Header */}
            <header className="lg:hidden absolute top-0 left-0 right-0 h-14 bg-slate-900 border-b border-slate-800 text-white flex items-center justify-between px-4 z-20 shadow-md">
                <button onClick={() => setIsMobileMenuOpen(true)} className="text-slate-400 hover:text-white p-2">
                    <MenuIcon size={24} />
                </button>
                <div className="flex items-center gap-2">
                    <div className="w-6 h-6 bg-blue-600 rounded flex items-center justify-center font-bold text-xs">AP</div>
                    <span className="font-bold text-sm tracking-tight">AdminPanel</span>
                </div>
                <div className="w-5"></div>
            </header>

            {/* Overlay for mobile */}
            {isMobileMenuOpen && (
                <div
                    className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-30 lg:hidden"
                    onClick={() => setIsMobileMenuOpen(false)}
                />
            )}

            {/* Sidebar (High Density) */}
            <aside className={`
                fixed lg:static inset-y-0 left-0 z-40
                w-60 bg-[#0f172a] text-slate-400 flex flex-col border-r border-slate-800
                transform transition-transform duration-300 ease-in-out
                ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
            `}>
                <div className="h-14 px-4 border-b border-slate-800/50 flex items-center justify-between shrink-0 bg-[#0f172a]">
                    <div className="flex items-center gap-3">
                        <div className="w-7 h-7 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-lg shadow-lg shadow-blue-900/50 flex items-center justify-center text-white">
                            <Briefcase size={14} />
                        </div>
                        <div>
                            <h1 className="text-xs font-black text-slate-100 tracking-tight leading-none uppercase">AdminPanel</h1>
                            <p className="text-[9px] font-bold text-blue-500 mt-0.5">V4.2.0 PRO</p>
                        </div>
                    </div>
                    <button className="lg:hidden text-slate-500 hover:text-white" onClick={() => setIsMobileMenuOpen(false)}>
                        <X size={18} />
                    </button>
                </div>

                <div className="px-4 py-3 border-b border-slate-800/50 bg-slate-900/50">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-500">
                            <UserCheck size={14} />
                        </div>
                        <div className="min-w-0">
                            <p className="text-[10px] uppercase font-bold text-slate-500">Sesión Activa</p>
                            <p className="text-[11px] font-semibold text-slate-200 truncate leading-tight">
                                {user?.profile?.full_name || user?.email || 'Usuario'}
                            </p>
                        </div>
                    </div>
                </div>

                <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5 scrollbar-hide" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                    <style>{`
                        .scrollbar-hide::-webkit-scrollbar { display: none; }
                    `}</style>

                    <p className="px-3 pt-2 pb-1 text-[9px] font-black text-slate-600 uppercase tracking-widest">General</p>
                    {mainNav.map(item => <NavItem key={item.path} item={item} />)}

                    <div className="h-4" />

                    <div>
                        <button
                            onClick={() => toggleSection('settings')}
                            className="w-full flex items-center justify-between px-3 py-1.5 text-[9px] font-black text-slate-600 uppercase tracking-widest hover:text-slate-400 group transition-colors"
                        >
                            <span>Configuración</span>
                            <ChevronDown size={12} className={`transition-transform duration-200 ${openSections.settings ? 'rotate-180' : ''}`} />
                        </button>

                        <div className={`space-y-0.5 overflow-hidden transition-all duration-300 ${openSections.settings ? 'max-h-96 opacity-100 mt-1' : 'max-h-0 opacity-0'}`}>
                            {settingsNav.map(item => <NavItem key={item.path} item={item} isSub={true} />)}
                        </div>
                    </div>
                </nav>

                {/* Footer Minimalista v2 */}
                <div className="mt-auto px-4 py-4 border-t border-white/5">
                    <div className="flex flex-col items-center text-center">

                        {/* Marca Texto - Limpio y Sutil */}
                        <p className="text-xs font-medium text-slate-400">
                            <span className="text-white font-bold tracking-wide">FIXARR</span> ECOSYSTEM
                        </p>

                        {/* Copyright y Versión */}
                        <div className="flex items-center gap-1 mt-1 text-[10px] text-slate-600">
                            <span>© 2026</span>
                            <span>•</span>
                            <span>v4.2.0 PRO</span>
                        </div>

                    </div>
                </div>

                <div className="p-2 border-t border-slate-800 bg-[#0f172a]">
                    <button
                        onClick={() => signOut()}
                        className="flex items-center justify-center gap-2 w-full px-3 py-2 text-[10px] font-bold text-slate-500 hover:text-red-400 hover:bg-slate-800/50 rounded-lg transition-colors"
                    >
                        <LogOut size={12} />
                        <span>CERRAR SESIÓN</span>
                    </button>
                </div>
            </aside>

            <main className="flex-1 overflow-auto bg-slate-50 pt-14 lg:pt-0">
                <div className="p-4 lg:p-6 max-w-[1600px] mx-auto">
                    <Outlet />
                </div>
            </main>
        </div>
    );
};

export default Layout;
