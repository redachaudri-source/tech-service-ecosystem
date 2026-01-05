import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import FleetMap from '../components/FleetMap';
import { Users, DollarSign, Wrench, AlertTriangle, Star } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

const DashboardHome = () => {
    const [stats, setStats] = useState({
        todayServices: 0,
        monthlyIncome: 0,
        topTech: 'N/A',
        recentReviews: [],
        avgRating: '0.0'
    });

    const [chartData, setChartData] = useState([]);

    useEffect(() => {
        fetchDashboardData();
    }, []);

    const fetchDashboardData = async () => {
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

        // 1. SERVICES TODAY
        const { count: todayCount } = await supabase
            .from('tickets')
            .select('*', { count: 'exact', head: true })
            .gte('created_at', startOfDay);

        // 2. MONTHLY INCOME (Sum total_price of PAID/FINISHED tickets)
        const { data: incomeData } = await supabase
            .from('tickets')
            .select('total_price')
            .gte('created_at', startOfMonth)
            .in('status', ['pagado', 'finalizado']); // Assuming finalized also counts or just paid? keeping both for now

        const totalIncome = incomeData?.reduce((acc, curr) => acc + (Number(curr.total_price) || 0), 0) || 0;

        // 3. TOP TECH (Simple calc: max assigned tickets in active/closed state this month)
        // This is complex to do efficiently in one query without aggregate functions extension or RPC.
        // For MVP, fetch all tickets this month and count in JS.
        const { data: monthTickets } = await supabase
            .from('tickets')
            .select('technician_id, profiles:technician_id(full_name)')
            .gte('created_at', startOfMonth)
            .not('technician_id', 'is', null);

        const techCounts = {};
        monthTickets?.forEach(t => {
            const name = t.profiles?.full_name || 'Desconocido';
            techCounts[name] = (techCounts[name] || 0) + 1;
        });

        const topTechName = Object.keys(techCounts).reduce((a, b) => techCounts[a] > techCounts[b] ? a : b, 'N/A');

        // 4. CHART DATA (Services per day of current week)
        // Get start of week (Sunday or Monday?) Let's say last 7 days for simplicity
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(now.getDate() - 6);
        const { data: weekTickets } = await supabase
            .from('tickets')
            .select('created_at')
            .gte('created_at', sevenDaysAgo.toISOString());

        // Process for Chart
        const daysMap = {};
        const days = ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab'];

        // Init last 7 days
        for (let i = 0; i < 7; i++) {
            const d = new Date();
            d.setDate(now.getDate() - i);
            const dayName = days[d.getDay()];
            daysMap[dayName] = 0; // Initialize
        }

        weekTickets?.forEach(t => {
            const d = new Date(t.created_at);
            const dayName = days[d.getDay()];
            if (daysMap[dayName] !== undefined) daysMap[dayName]++;
        });

        const formattedChartData = Object.keys(daysMap).reverse().map(key => ({
            name: key,
            services: daysMap[key]
        }));




        // 5. RECENT RATINGS
        const { data: ratedTickets } = await supabase
            .from('tickets')
            .select('id, rating, client_feedback, updated_at, profiles:client_id(full_name), technician:technician_id(full_name)')
            .not('rating', 'is', null)
            .order('updated_at', { ascending: false })
            .limit(3);

        const { data: allRatings } = await supabase
            .from('tickets')
            .select('rating')
            .not('rating', 'is', null);

        const avgRating = allRatings?.length
            ? (allRatings.reduce((a, b) => a + b.rating, 0) / allRatings.length).toFixed(1)
            : '0.0';

        setStats({
            todayServices: todayCount || 0,
            monthlyIncome: totalIncome,
            topTech: topTechName,
            recentReviews: ratedTickets || [],
            avgRating: avgRating
        });
        setChartData(formattedChartData);
    };

    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold text-slate-800">Dashboard General</h1>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
                <StatCard
                    title="Servicios Hoy"
                    value={stats.todayServices}
                    icon={Wrench}
                    color="bg-blue-500"
                />
                <StatCard
                    title="Ingresos Mes"
                    value={`$${stats.monthlyIncome}`}
                    icon={DollarSign}
                    color="bg-green-500"
                />
                <StatCard
                    title="Top Técnico"
                    value={stats.topTech}
                    icon={Users}
                    color="bg-purple-500"
                />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Fleet Map */}
                <FleetMap />

                {/* Chart */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                    <h2 className="text-lg font-bold text-slate-800 mb-4">Rendimiento Semanal</h2>
                    <div className="h-[300px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={chartData}>
                                <XAxis dataKey="name" stroke="#94a3b8" />
                                <YAxis stroke="#94a3b8" />
                                <Tooltip
                                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                />
                                <Bar dataKey="services" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Reviews Widget (Full Width below map/chart or new row) */}
                <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                            <Star className="text-yellow-400 fill-yellow-400" size={20} />
                            Satisfacción del Cliente
                        </h2>
                        <div className="bg-blue-50 text-blue-700 px-3 py-1 rounded-full text-sm font-bold">
                            {stats.avgRating} / 5.0
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {stats.recentReviews.length > 0 ? (
                            stats.recentReviews.map((review) => (
                                <div key={review.id} className="p-4 bg-slate-50 rounded-lg border border-slate-100">
                                    <div className="flex justify-between items-start mb-2">
                                        <div className="flex items-center gap-1">
                                            {[...Array(5)].map((_, i) => (
                                                <Star
                                                    key={i}
                                                    size={12}
                                                    className={i < review.rating ? "text-yellow-400 fill-yellow-400" : "text-slate-300"}
                                                />
                                            ))}
                                        </div>
                                        <span className="text-xs text-slate-400">
                                            {new Date(review.updated_at).toLocaleDateString()}
                                        </span>
                                    </div>
                                    <p className="text-sm text-slate-600 italic mb-2 line-clamp-2">
                                        "{review.client_feedback || 'Sin comentario'}"
                                    </p>
                                    <div className="flex justify-between items-end">
                                        <div className="text-xs font-bold text-slate-700">
                                            {review.profiles?.full_name || 'Cliente'}
                                        </div>
                                        <div className="text-[10px] text-slate-400">
                                            Tech: {review.technician?.full_name?.split(' ')[0]}
                                        </div>
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="col-span-full text-center py-8 text-slate-400">
                                Sin valoraciones recientes.
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

// ... existing StatCard ...

const StatCard = ({ title, value, icon: Icon, color }) => (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex items-center justify-between">
        <div>
            <p className="text-sm font-medium text-slate-500 mb-1">{title}</p>
            <h3 className="text-2xl font-bold text-slate-800">{value}</h3>
        </div>
        <div className={`p-3 rounded-lg ${color} bg-opacity-10`}>
            <Icon className={`w-8 h-8 ${color.replace('bg-', 'text-')}`} />
        </div>
    </div>
);

export default DashboardHome;
