import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { ArrowLeft, PieChart, TrendingUp, DollarSign, Calendar } from 'lucide-react';

const Analytics = () => {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [tickets, setTickets] = useState([]);

    // Derived Stats
    const [totalSpent, setTotalSpent] = useState(0);
    const [avgCost, setAvgCost] = useState(0);
    const [byType, setByType] = useState([]);

    useEffect(() => {
        fetchPaidTickets();
    }, []);

    const fetchPaidTickets = async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            // Fetch only paid final tickets
            const { data, error } = await supabase
                .from('tickets')
                .select('*')
                .eq('client_id', user.id)
                .or('status.eq.pagado,status.eq.finalizado'); // Include finalizado as sometimes they pay manually

            if (error) throw error;

            console.log('Tickets for analytics:', data);

            // Calculate Stats
            // Note: need to parse total from labor+parts or use a stored total column if exists
            // Stored column is safer if we didn't store it, we recalculate.
            // TechTicketDetail usually saves it? No, it saves parts/labor lists.
            // We'll recalculate on the fly for old tickets.

            const processed = data.map(t => {
                const parts = Array.isArray(t.parts_list) ? t.parts_list : JSON.parse(t.parts_list || '[]');
                const labor = Array.isArray(t.labor_list) ? t.labor_list : JSON.parse(t.labor_list || '[]');
                const subtotal = parts.reduce((s, i) => s + (Number(i.price) * (Number(i.qty) || 1)), 0) +
                    labor.reduce((s, i) => s + (Number(i.price) * (Number(i.qty) || 1)), 0);
                const total = subtotal * 1.21; // VAT
                return { ...t, total_cost: total, type: t.appliance_info?.type || 'Otros' };
            });

            setTickets(processed);

            const total = processed.reduce((sum, t) => sum + t.total_cost, 0);
            setTotalSpent(total);
            setAvgCost(processed.length ? total / processed.length : 0);

            // Group by Type
            const typeMap = {};
            processed.forEach(t => {
                typeMap[t.type] = (typeMap[t.type] || 0) + t.total_cost;
            });

            const typeArray = Object.entries(typeMap)
                .map(([name, value]) => ({ name, value, percent: (value / total) * 100 }))
                .sort((a, b) => b.value - a.value);

            setByType(typeArray);

        } catch (error) {
            console.error('Error fetching stats:', error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 p-4 md:p-8">
            <div className="max-w-5xl mx-auto space-y-8">

                {/* Header */}
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => navigate('/dashboard')}
                        className="bg-white p-2 rounded-full shadow-sm border border-slate-200 text-slate-500 hover:text-slate-800 transition"
                    >
                        <ArrowLeft size={20} />
                    </button>
                    <div>
                        <h1 className="text-2xl font-bold text-slate-800">Mis Gastos</h1>
                        <p className="text-slate-500 text-sm">Resumen financiero de tus reparaciones.</p>
                    </div>
                </div>

                {loading ? (
                    <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>
                ) : tickets.length === 0 ? (
                    <div className="bg-white rounded-2xl p-12 text-center border border-slate-200 border-dashed">
                        <div className="w-16 h-16 bg-green-50 text-green-500 rounded-full flex items-center justify-center mx-auto mb-4">
                            <DollarSign size={32} />
                        </div>
                        <h3 className="font-bold text-slate-700 text-lg mb-2">Sin datos financieros</h3>
                        <p className="text-slate-500">Aún no tienes reparaciones finalizadas o pagadas para mostrar estadísticas.</p>
                    </div>
                ) : (
                    <>
                        {/* KPI Cards */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex items-center gap-4">
                                <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
                                    <DollarSign size={24} />
                                </div>
                                <div>
                                    <p className="text-slate-500 text-xs uppercase font-bold tracking-wider">Total Invertido</p>
                                    <p className="text-2xl font-bold text-slate-800">{totalSpent.toFixed(2)}€</p>
                                </div>
                            </div>
                            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex items-center gap-4">
                                <div className="p-3 bg-purple-50 text-purple-600 rounded-xl">
                                    <TrendingUp size={24} />
                                </div>
                                <div>
                                    <p className="text-slate-500 text-xs uppercase font-bold tracking-wider">Coste Medio</p>
                                    <p className="text-2xl font-bold text-slate-800">{avgCost.toFixed(2)}€</p>
                                </div>
                            </div>
                            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex items-center gap-4">
                                <div className="p-3 bg-orange-50 text-orange-600 rounded-xl">
                                    <Calendar size={24} />
                                </div>
                                <div>
                                    <p className="text-slate-500 text-xs uppercase font-bold tracking-wider">Servicios</p>
                                    <p className="text-2xl font-bold text-slate-800">{tickets.length}</p>
                                </div>
                            </div>
                        </div>

                        {/* Breakdown Chart */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Spending by Type (Bar/List) */}
                            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                                <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2">
                                    <PieChart size={20} className="text-slate-400" /> Desglose por Aparato
                                </h3>

                                <div className="space-y-5">
                                    {byType.map((item, idx) => (
                                        <div key={idx}>
                                            <div className="flex justify-between text-sm mb-1">
                                                <span className="font-medium text-slate-700">{item.name}</span>
                                                <span className="font-bold text-slate-900">{item.value.toFixed(2)}€</span>
                                            </div>
                                            <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
                                                <div
                                                    className="h-full bg-blue-500 rounded-full transition-all duration-1000"
                                                    style={{ width: `${item.percent}%` }}
                                                ></div>
                                            </div>
                                            <div className="text-xs text-slate-400 mt-1 text-right">{item.percent.toFixed(1)}% del total</div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Recent Transactions List */}
                            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                                <h3 className="font-bold text-slate-800 mb-6">Últimas Reparaciones</h3>
                                <div className="space-y-4">
                                    {tickets.slice(0, 5).map(ticket => (
                                        <div key={ticket.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                                            <div>
                                                <p className="font-bold text-slate-800 text-sm">{ticket.appliance_info?.type} - {ticket.appliance_info?.brand}</p>
                                                <p className="text-xs text-slate-500">{new Date(ticket.created_at).toLocaleDateString()}</p>
                                            </div>
                                            <span className="font-mono font-bold text-slate-700">{ticket.total_cost.toFixed(2)}€</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default Analytics;
