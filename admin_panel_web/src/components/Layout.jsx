import { Link, Outlet, useLocation } from 'react-router-dom';
import {
    LayoutDashboard, Users, Map, Package, LogOut, UserCheck, Settings as SettingsIcon,
    Globe, Calendar, Tag, FileText, Menu as MenuIcon, X, Briefcase, TrendingUp,
    ChevronDown, ChevronRight, HelpCircle
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

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
        { icon: Map, label: 'Flota', path: '/tracking' },
        { icon: Users, label: 'Clientes', path: '/clients' },
        { icon: Calendar, label: 'Agenda Global', path: '/agenda' },
        { icon: Users, label: 'Servicios', path: '/services', isHero: true },
        { icon: Package, label: 'Gestión de Repuestos', path: '/materials' },
        { icon: FileText, label: 'Presupuestos', path: '/budgets' },
        { icon: UserCheck, label: 'Equipo Técnico', path: '/team' },
        { icon: TrendingUp, label: 'Analytics (BI)', path: '/analytics' },
    ];

    const settingsNav = [
        { icon: Tag, label: 'Tipos Electro.', path: '/appliance-types', help: 'Define catálogo de aparatos y averías comunes.' },
        { icon: Briefcase, label: 'Ajustes de Negocio', path: '/business-settings', help: 'Configuración fiscal y datos de empresa.' },
        { icon: SettingsIcon, label: 'Ajustes Panel', path: '/settings', help: 'Preferencias generales del sistema.' },
    ];

    // Close mobile menu when route changes
    useEffect(() => {
        setIsMobileMenuOpen(false);
    }, [location.pathname]);

    // State for Notifications
    const [notifications, setNotifications] = useState({ services: 0 });

    useEffect(() => {
        fetchNotifications();
        // Subscribe to changes
        const channel = supabase.channel('sidebar_notifications')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'tickets' }, () => fetchNotifications())
            .subscribe();
        return () => { supabase.removeChannel(channel); };
    }, []);

    const fetchNotifications = async () => {
        const { count } = await supabase
            .from('tickets')
            .select('*', { count: 'exact', head: true })
            .in('status', ['request', 'solicitado', 'pendiente_aceptacion', 'pendiente']); // Robust check

        setNotifications({ services: count || 0 });
    };

    const NavItem = ({ item, isSub = false }) => {
        const Icon = item.icon;
        const isActive = location.pathname === item.path;
        const isHero = item.isHero;
        const hasBadge = item.path === '/services' && notifications.services > 0;

        return (
            <Link
                to={item.path}
                className={`group relative flex items-center justify-between px-3 py-2.5 rounded-md transition-all duration-200 border border-transparent
                    ${isActive
                        ? 'bg-blue-600/10 border-blue-600/20 text-blue-400'
                        : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'}
                    ${isSub ? 'ml-3 pl-3 border-l border-slate-800 hover:border-slate-700 rounded-none rounded-r-md text-[11px]' : 'text-[12px]'}
                    ${isHero ? 'font-bold text-[13px] bg-indigo-500/10 border-indigo-500/20 text-indigo-300 hover:bg-indigo-500/20 hover:text-indigo-200 my-1' : ''}
                `}
            >
                <div className="flex items-center gap-2.5">
                    <Icon size={isSub ? 13 : (isHero ? 16 : 15)} className={`${isActive ? 'text-blue-400' : (isHero ? 'text-indigo-400' : 'text-slate-500 group-hover:text-slate-300')}`} />
                    <span className={`tracking-wide ${isHero ? 'uppercase tracking-wider' : 'font-medium'}`}>{item.label}</span>
                </div>

                {hasBadge && (
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-red-500 shadow-sm shadow-red-900 animate-pulse"></span>
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
        <div className="flex h-screen w-full bg-slate-50 overflow-hidden font-sans">

            {/* Mobile Header */}
            <header className="lg:hidden absolute top-0 left-0 right-0 h-14 bg-slate-900 border-b border-slate-800 text-white flex items-center justify-between px-4 z-20 shadow-md">
                <button onClick={() => setIsMobileMenuOpen(true)} className="text-slate-400 hover:text-white">
                    <MenuIcon size={20} />
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
                {/* Brand Header */}
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
                    {/* Close button for mobile */}
                    <button className="lg:hidden text-slate-500 hover:text-white" onClick={() => setIsMobileMenuOpen(false)}>
                        <X size={18} />
                    </button>
                </div>

                {/* User Info (Compact) */}
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

                {/* Scrollable Nav Area (Hidden Scrollbar) */}
                <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5 scrollbar-hide" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                    <style>{`
                        .scrollbar-hide::-webkit-scrollbar { display: none; }
                    `}</style>

                    <p className="px-3 pt-2 pb-1 text-[9px] font-black text-slate-600 uppercase tracking-widest">General</p>
                    {mainNav.map(item => <NavItem key={item.path} item={item} />)}

                    <div className="h-4" /> {/* Spacer */}

                    {/* Accordion Group: Settings */}
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

                {/* Footer Actions */}
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

            {/* Main Content */}
            <main className="flex-1 overflow-auto bg-slate-50 pt-14 lg:pt-0">
                <div className="p-4 lg:p-6 max-w-[1600px] mx-auto">
                    <Outlet />
                </div>
            </main>
        </div>
    );
};

export default Layout;
