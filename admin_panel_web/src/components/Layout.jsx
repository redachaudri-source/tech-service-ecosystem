import { Link, Outlet, useLocation } from 'react-router-dom';
import { LayoutDashboard, Users, Map, Package, LogOut, UserCheck, Settings as SettingsIcon, Globe, Calendar, Tag, FileText, Menu as MenuIcon, X, Briefcase } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';


const Layout = () => {
    const { signOut, user } = useAuth();
    const location = useLocation();
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

    const navItems = [
        { icon: LayoutDashboard, label: 'Dashboard', path: '/' },
        { icon: Calendar, label: 'Agenda Global', path: '/agenda' },
        { icon: Users, label: 'Servicios', path: '/services' },
        { icon: Map, label: 'Flota', path: '/tracking' },
        { icon: Users, label: 'Clientes', path: '/clients' },
        { icon: UserCheck, label: 'Equipo', path: '/team' },
        { icon: Package, label: 'Inventario', path: '/inventory' },
        { icon: Tag, label: 'Tipos Electro.', path: '/appliance-types' },
        { icon: Package, label: 'Gestión Materiales', path: '/materials' },
        { icon: FileText, label: 'Presupuestos', path: '/budgets' },
        { icon: Briefcase, label: 'Ajustes de Negocio', path: '/business-settings' },
        { icon: SettingsIcon, label: 'Ajustes Panel', path: '/settings' },
    ];

    // Close mobile menu when route changes
    useEffect(() => {
        setIsMobileMenuOpen(false);
    }, [location.pathname]);

    return (
        <div className="flex h-screen w-full bg-slate-50 overflow-hidden">

            {/* Mobile Header */}
            <header className="lg:hidden absolute top-0 left-0 right-0 h-16 bg-slate-900 text-white flex items-center justify-between px-4 z-20 shadow-lg">
                <button onClick={() => setIsMobileMenuOpen(true)}>
                    <MenuIcon size={24} />
                </button>
                <span className="font-bold text-lg">AdminPanel</span>
                <div className="w-6"></div> {/* Spacer for center alignment */}
            </header>

            {/* Overlay for mobile */}
            {isMobileMenuOpen && (
                <div
                    className="fixed inset-0 bg-black/50 z-30 lg:hidden"
                    onClick={() => setIsMobileMenuOpen(false)}
                />
            )}

            {/* Sidebar */}
            <aside className={`
                fixed lg:static inset-y-0 left-0 z-40
                w-64 bg-slate-900 text-white flex flex-col
                transform transition-transform duration-300 ease-in-out
                ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
            `}>
                <div className="p-6 border-b border-slate-700 flex justify-between items-center">
                    <div>
                        <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-cyan-300 bg-clip-text text-transparent">
                            AdminPanel
                        </h1>
                        <div className="mt-2">
                            <p className="text-xs text-slate-500 uppercase font-semibold">Bienvenido</p>
                            <p className="text-sm font-medium text-slate-300 truncate w-48">
                                {user?.profile?.full_name || user?.email || 'Usuario'}
                            </p>
                        </div>
                    </div>
                    {/* Close button for mobile */}
                    <button className="lg:hidden text-slate-400 hover:text-white" onClick={() => setIsMobileMenuOpen(false)}>
                        <X size={24} />
                    </button>
                </div>

                <nav className="flex-1 p-4 space-y-2 overflow-y-auto custom-scrollbar">
                    {navItems.map((item) => {
                        const Icon = item.icon;
                        const isActive = location.pathname === item.path;

                        return (
                            <Link
                                key={item.path}
                                to={item.path}
                                className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors
                  ${isActive ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}
                            >
                                <Icon size={20} />
                                <span className="font-medium">{item.label}</span>
                            </Link>
                        )
                    })}
                </nav>

                <div className="p-4 border-t border-slate-700">
                    <button
                        onClick={() => signOut()}
                        className="flex items-center gap-3 px-4 py-3 w-full text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg"
                    >
                        <LogOut size={20} />
                        <span>Cerrar Sesión</span>
                    </button>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 overflow-auto bg-slate-50 pt-16 lg:pt-0">
                <div className="p-4 lg:p-8">
                    <Outlet />
                </div>
            </main>
        </div>
    );
};

export default Layout;
