import { Link, Outlet, useLocation } from 'react-router-dom';
import { LayoutDashboard, Users, Map, Package, LogOut, UserCheck, Settings as SettingsIcon, Globe, Calendar, Tag, FileText } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';


const Layout = () => {
    const { signOut, user } = useAuth();
    const location = useLocation();

    const navItems = [
        { icon: LayoutDashboard, label: 'Dashboard', path: '/' },

        { icon: Calendar, label: 'Agenda Global', path: '/agenda' }, // New Agenda
        { icon: Users, label: 'Servicios', path: '/services' }, // Monitor
        { icon: Map, label: 'Flota', path: '/tracking' },
        { icon: Users, label: 'Clientes', path: '/clients' },
        { icon: UserCheck, label: 'Equipo', path: '/team' },
        { icon: Package, label: 'Inventario', path: '/inventory' },
        { icon: Tag, label: 'Tipos Electro.', path: '/appliance-types' },
        { icon: FileText, label: 'Presupuestos', path: '/budgets' }, // New Registry
        { icon: SettingsIcon, label: 'Ajustes Panel', path: '/settings' },

    ];

    return (
        <div className="flex h-screen w-full">
            {/* Sidebar */}
            <aside className="w-64 bg-slate-900 text-white flex flex-col">
                <div className="p-6 border-b border-slate-700">
                    <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-cyan-300 bg-clip-text text-transparent">
                        AdminPanel
                    </h1>
                    {/* Welcome Message */}
                    <div className="mt-4 pt-4 border-t border-slate-800">
                        <p className="text-xs text-slate-500 uppercase font-semibold">Bienvenido</p>
                        <p className="text-sm font-medium text-slate-300 truncate">
                            {user?.profile?.full_name || user?.email || 'Usuario'}
                        </p>
                    </div>
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
            <main className="flex-1 overflow-auto bg-slate-50">
                <div className="p-8">
                    <Outlet />
                </div>
            </main>
        </div>
    );
};

export default Layout;
