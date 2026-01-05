import React, { useState } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { Menu } from 'lucide-react'; // Changed standard User/Logout icons to just Menu
import { useAuth } from '../context/AuthContext';
import TechSidebar from './TechSidebar';
import { supabase } from '../lib/supabase';
import TechLocationTracker from './TechLocationTracker';

const TechLayout = () => {
    const { signOut, user } = useAuth();
    const navigate = useNavigate();
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);

    const handleSignOut = async () => {
        await signOut();
        navigate('/tech/login');
    };

    // Get First Name for Header
    const firstName = user?.profile?.full_name?.split(' ')[0] || 'Técnico';

    return (
        <div className="min-h-screen bg-slate-50 relative flex flex-col">
            <TechLocationTracker />

            {/* Sidebar Component */}
            <TechSidebar
                isOpen={isSidebarOpen}
                onClose={() => setIsSidebarOpen(false)}
                user={user}
                onSignOut={handleSignOut}
            />

            {/* Mobile Header - Improved */}
            <header className="bg-slate-900 text-white px-4 py-3 shadow-md sticky top-0 z-40">
                <div className="flex justify-between items-center max-w-2xl mx-auto w-full">

                    {/* Hamburger Menu & Welcome */}
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => setIsSidebarOpen(true)}
                            className="p-2 -ml-2 hover:bg-white/10 rounded-lg transition-colors"
                        >
                            <Menu size={24} />
                        </button>

                        <div>
                            <p className="text-[10px] text-blue-400 font-bold uppercase tracking-wider leading-none mb-0.5">Panel Técnico</p>
                            <h1 className="font-bold text-lg leading-none">Hola, {firstName}</h1>
                        </div>
                    </div>

                    {/* Notification/Action Placeholder (Bell?) - Or just empty for now */}
                    <div className="w-8"></div>
                </div>
            </header>

            {/* Main Content Area - Mobile Optimized */}
            <main className="flex-1 w-full max-w-2xl mx-auto p-4 pb-24">
                <Outlet />
            </main>
        </div>
    );
};

export default TechLayout;
