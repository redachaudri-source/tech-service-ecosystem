import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';
import {
    Users, DollarSign, Wrench, AlertTriangle, Star, Plus, X,
    Calendar, Package, FileText, CheckCircle, Clock, Zap, BellRing, ArrowRight
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { useTicketNotifications } from '../hooks/useTicketNotifications'; // NEW HOOK

// --- CONFIGURATION ---
const AVAILABLE_SHORTCUTS = [
    { id: 'new_service', label: 'Nuevo Servicio', icon: Wrench, path: '/services', color: 'bg-blue-600' }, // Path updated to /services
    { id: 'agenda_today', label: 'Agenda Hoy', icon: Calendar, path: '/agenda', color: 'bg-indigo-600' },
    { id: 'clients', label: 'Clientes', icon: Users, path: '/clients', color: 'bg-emerald-600' },
    { id: 'stock', label: 'REPUESTOS PENDIENTES', icon: Package, path: '/materials', color: 'bg-amber-600' },
    // "Facturación" REMOVED
    { id: 'team', label: 'Equipo Técnico', icon: Users, path: '/team', color: 'bg-pink-600' },
    { id: 'budgets', label: 'Presupuestos', icon: FileText, path: '/budgets', color: 'bg-cyan-600' },
];

const DEFAULT_SHORTCUTS = ['new_service', 'agenda_today', 'stock'];

// --- COMPONENTS ---

// 1. Compact Stat Card
const CompactStatCard = ({ title, value, icon: Icon, colorClass, trend }) => (
    <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm flex items-center justify-between hover:shadow-md transition-shadow">
        <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-0.5">{title}</p>
            <div className="flex items-baseline gap-2">
                <h3 className="text-xl font-black text-slate-800">{value}</h3>
                {trend && <span className="text-[10px] text-green-500 font-bold">{trend}</span>}
            </div>
        </div>
        <div className={`p-2 rounded-lg ${colorClass} bg-opacity-10`}>
            <Icon size={18} className={colorClass.replace('bg-', 'text-')} />
        </div>
    </div>
);

// 2. Shortcut Button
const ShortcutButton = ({ shortcut, onClick }) => {
    const Icon = shortcut.icon;
    return (
        <button
            onClick={onClick}
            className="flex flex-col items-center justify-center gap-2 p-4 bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md hover:border-blue-300 hover:scale-[1.02] transition-all group h-24"
        >
            <div className={`p-2 rounded-full ${shortcut.color} text-white shadow-lg shadow-blue-900/10 group-hover:shadow-blue-900/20`}>
                <Icon size={18} />
            </div>
            <span className="text-[11px] font-bold text-slate-600 group-hover:text-slate-800">{shortcut.label}</span>
        </button>
    );
};

// 3. Selection Modal
const ShortcutSelectionModal = ({ isOpen, onClose, selectedIds, onToggle }) => {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg border border-slate-200 overflow-hidden animate-in fade-in zoom-in duration-200">
                <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                    <h3 className="font-bold text-slate-800 flex items-center gap-2">
                        <Zap size={18} className="text-amber-500" />
                        Personalizar Escritorio
                    </h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
                        <X size={20} />
                    </button>
                </div>
                <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[60vh] overflow-y-auto">
                    {AVAILABLE_SHORTCUTS.map(sc => {
                        const isSelected = selectedIds.includes(sc.id);
                        const Icon = sc.icon;
                        return (
                            <button
                                key={sc.id}
                                onClick={() => onToggle(sc.id)}
                                className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${isSelected ? 'bg-blue-50 border-blue-200 ring-1 ring-blue-300' : 'bg-white border-slate-100 hover:bg-slate-50 text-slate-400'}`}
                            >
                                <div className={`p-1.5 rounded-full ${isSelected ? sc.color : 'bg-slate-200'} text-white`}>
                                    <Icon size={14} />
                                </div>
                                <span className={`text-xs font-bold ${isSelected ? 'text-slate-800' : ''}`}>{sc.label}</span>
                                {isSelected && <CheckCircle size={14} className="ml-auto text-blue-500" />}
                            </button>
                        );
                    })}
                </div>
                <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end">
                    <button onClick={onClose} className="px-4 py-2 bg-slate-900 text-white text-xs font-bold rounded-lg hover:bg-slate-800">
                        Guardar Cambios
                    </button>
                </div>
            </div>
        </div>
    );
};

// --- MAIN PAGE ---
const DashboardHome = () => {
    const navigate = useNavigate();
    const [stats, setStats] = useState({ todayServices: 0, monthlyIncome: 0, topTech: 'N/A', activeServices: 0, techsActive: 0 }); // Added techsActive
    const [chartData, setChartData] = useState([]);
    const [alerts, setAlerts] = useState([]);

    // --- USE NEW HOOK ---
    const { count: webRequests, loading: loadingNotifications } = useTicketNotifications();

    // Shortcut State
    const [myShortcuts, setMyShortcuts] = useState(() => {
        const saved = localStorage.getItem('dashboard_shortcuts');
        return saved ? JSON.parse(saved) : DEFAULT_SHORTCUTS;
    });
    const [isShortcutModalOpen, setIsShortcutModalOpen] = useState(false);

    // Save shortcuts when changed
    const toggleShortcut = (id) => {
        const newShortcuts = myShortcuts.includes(id)
            ? myShortcuts.filter(s => s !== id)
            : [...myShortcuts, id];
        setMyShortcuts(newShortcuts);
        localStorage.setItem('dashboard_shortcuts', JSON.stringify(newShortcuts));
    };

    useEffect(() => {
        fetchDashboardData();
        fetchAlerts();

        const channel = supabase.channel('dashboard_stats_v3')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'tickets' }, () => {
                fetchDashboardData();
                fetchAlerts();
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory_items' }, () => {
                fetchAlerts();
            })
            .subscribe();
        return () => { supabase.removeChannel(channel); };
    }, []);

    const fetchAlerts = async () => {
        const newAlerts = [];

        // 0. PRIORITY: Handled by Hook (webRequests)

        // 1. Check Low Stock
        const { data: lowStock } = await supabase
            .from('inventory_items')
            .select('name, quantity, min_quantity')
            .limit(5);

        lowStock?.forEach(item => {
            if (item.quantity < (item.min_quantity || 5)) {
                newAlerts.push({
                    type: 'stock',
                    title: `Stock Bajo: ${item.name}`,
                    desc: `Quedan ${item.quantity} unidades (Min: ${item.min_quantity || 5})`,
                    color: 'bg-red-500'
                });
            }
        });

        // 2. Check Delayed Tickets
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        yesterday.setHours(23, 59, 59, 999);

        const { data: delayed } = await supabase
            .from('tickets')
            .select('ticket_id, title, status, created_at')
            .in('status', ['pendiente', 'en_proceso', 'asignado'])
            .lt('created_at', yesterday.toISOString())
            .limit(3);

        delayed?.forEach(t => {
            newAlerts.push({
                type: 'delay',
                title: `Retraso: Ticket #${t.ticket_id.slice(0, 6)}`,
                desc: `${t.title || 'Servicio'} lleva abierto más de 24h.`,
                color: 'bg-amber-500'
            });
        });

        setAlerts(newAlerts);
    };

    const fetchDashboardData = async () => {
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

        // 1. Parallel Fetching
        const [today, income, active, week, techsCount] = await Promise.all([
            // Today Count
            supabase.from('tickets').select('*', { count: 'exact', head: true }).gte('created_at', startOfDay),
            // Monthly Income (paid/final only)
            supabase.from('tickets').select('total_price').gte('created_at', startOfMonth).in('status', ['pagado', 'finalizado']),
            // Active Services (pending/assigned/in_progress)
            supabase.from('tickets').select('*', { count: 'exact', head: true }).in('status', ['pendiente', 'asignado', 'en_proceso']),
            // Week Data (last 7 days logic simplified)
            supabase.from('tickets').select('created_at').gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()),
            // Real Tech Count (Role 'tech' is_active true)
            supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'tech').eq('is_active', true)
        ]);

        const totalIncome = income.data?.reduce((acc, curr) => acc + (Number(curr.total_price) || 0), 0) || 0;

        // Chart Process
        const days = ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab'];
        const daysMap = {};
        for (let i = 0; i < 7; i++) {
            const d = new Date();
            d.setDate(now.getDate() - i);
            daysMap[days[d.getDay()]] = 0;
        }
        week.data?.forEach(t => {
            const dayName = days[new Date(t.created_at).getDay()];
            if (daysMap[dayName] !== undefined) daysMap[dayName]++;
        });

        setStats({
            todayServices: today.count || 0,
            monthlyIncome: totalIncome,
            topTech: 'N/A',
            activeServices: active.count || 0,
            techsActive: techsCount.count || 0 // Corrected
        });
        setChartData(Object.keys(daysMap).reverse().map(k => ({ name: k, services: daysMap[k] })));
    };

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Header */}
            <div className="flex justify-between items-end">
                <div>
                    <h1 className="text-2xl font-black text-slate-800 tracking-tight">Mi Escritorio</h1>
                    <p className="text-xs text-slate-500 font-medium">Resumen de actividad en tiempo real</p>
                </div>
                <div className="hidden sm:block text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-1 rounded">
                    {new Date().toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                </div>
            </div>

            {/* PRIORITY ALERT BANNER (Powered by Hook) */}
            {webRequests > 0 && (
                <div
                    onClick={() => navigate('/services')}
                    className="cursor-pointer group relative overflow-hidden bg-gradient-to-r from-orange-500 to-red-500 rounded-xl p-4 shadow-lg shadow-orange-900/20 hover:shadow-orange-900/30 transition-all transform hover:-translate-y-1"
                >
                    <div className="absolute top-0 right-0 p-4 opacity-10">
                        <BellRing size={80} className="text-white" />
                    </div>
                    <div className="relative z-10 flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className="bg-white/20 p-2.5 rounded-lg backdrop-blur-sm animate-pulse">
                                <BellRing size={24} className="text-white" />
                            </div>
                            <div>
                                <h3 className="text-white font-bold text-lg leading-tight">Tienes {webRequests} Solicitudes Web</h3>
                                <p className="text-orange-100 text-xs font-medium">Clientes esperando confirmación de servicio.</p>
                            </div>
                        </div>
                        <button className="bg-white text-orange-600 px-4 py-2 rounded-lg text-xs font-black shadow-sm flex items-center gap-2 group-hover:bg-orange-50 transition-colors">
                            REVISAR AHORA <ArrowRight size={14} />
                        </button>
                    </div>
                </div>
            )}

            {/* Compact KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
                <CompactStatCard title="Servicios Hoy" value={stats.todayServices} icon={Calendar} colorClass="bg-blue-500" trend="+2" />
                <CompactStatCard title="En Curso" value={stats.activeServices} icon={Clock} colorClass="bg-amber-500" />
                <CompactStatCard title="Ingresos Mes" value={`${(stats.monthlyIncome / 1000).toFixed(1)}k€`} icon={DollarSign} colorClass="bg-emerald-500" trend="+12%" />
                <CompactStatCard title="Tecnicos Activos" value={stats.techsActive} icon={Users} colorClass="bg-purple-500" /> {/* Corrected */}
            </div>

            {/* Dynamic Shortcuts Section */}
            <div>
                <div className="flex items-center justify-between mb-3 px-1">
                    <h2 className="text-xs font-black text-slate-700 uppercase tracking-widest flex items-center gap-2">
                        <Zap size={14} className="text-amber-500" />
                        Accesos Rápidos
                    </h2>
                    <button
                        onClick={() => setIsShortcutModalOpen(true)}
                        className="text-[10px] font-bold text-blue-600 hover:bg-blue-50 px-2 py-1 rounded transition-colors"
                    >
                        Configurar
                    </button>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
                    {myShortcuts.map(id => {
                        const sc = AVAILABLE_SHORTCUTS.find(s => s.id === id);
                        if (!sc) return null;
                        return (
                            <ShortcutButton
                                key={id}
                                shortcut={sc}
                                onClick={() => {
                                    if (sc.id === 'new_service') {
                                        navigate('/services', { state: { openCreate: true } });
                                    } else {
                                        navigate(sc.path);
                                    }
                                }}
                            />
                        );
                    })}
                    <button
                        onClick={() => setIsShortcutModalOpen(true)}
                        className="flex flex-col items-center justify-center gap-2 p-4 rounded-xl border-2 border-dashed border-slate-200 text-slate-400 hover:border-blue-300 hover:text-blue-500 hover:bg-blue-50 transition-colors h-24"
                    >
                        <Plus size={20} />
                        <span className="text-[10px] font-bold">Añadir</span>
                    </button>
                </div>
            </div>

            {/* Secondary Content Grid (Charts) */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* Weekly Chart */}
                <div className="lg:col-span-2 bg-white p-5 rounded-xl shadow-sm border border-slate-200">
                    <h2 className="text-xs font-bold text-slate-700 uppercase mb-4">Rendimiento Semanal</h2>
                    <div className="h-[250px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={chartData}>
                                <XAxis dataKey="name" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} stroke="#94a3b8" />
                                <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} stroke="#94a3b8" />
                                <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', fontSize: '12px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                                <Bar dataKey="services" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={40} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Notifications / Mini Feed */}
                <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200 flex flex-col">
                    <h2 className="text-xs font-bold text-slate-700 uppercase mb-4">Avisos Recientes</h2>
                    <div className="flex-1 space-y-3 overflow-y-auto max-h-[250px] pr-2">
                        {alerts.length > 0 ? alerts.map((alert, idx) => (
                            <div key={idx} className="flex gap-3 items-start p-2 hover:bg-slate-50 rounded transition-colors border-b border-slate-200 last:border-0">
                                <div className={`mt-1 w-2 h-2 rounded-full ${alert.color} shrink-0`} />
                                <div>
                                    <p className="text-xs font-bold text-slate-700">{alert.title}</p>
                                    <p className="text-[10px] text-slate-500 leading-tight">{alert.desc}</p>
                                </div>
                            </div>
                        )) : (
                            <div className="text-center py-8 text-slate-400 text-xs">
                                Todo en orden. No hay alertas.
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Modals */}
            <ShortcutSelectionModal
                isOpen={isShortcutModalOpen}
                onClose={() => setIsShortcutModalOpen(false)}
                selectedIds={myShortcuts}
                onToggle={toggleShortcut}
            />
        </div>
    );
};

export default DashboardHome;
