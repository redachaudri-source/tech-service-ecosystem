import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Clock } from 'lucide-react';

const SeasonalityStack = ({ data, loading }) => {

    if (loading) return (
        <div className="h-full w-full flex flex-col gap-4">
            <div className="h-6 w-1/2 bg-slate-100 rounded animate-pulse"></div>
            <div className="flex-1 bg-slate-50 rounded animate-pulse"></div>
        </div>
    );

    if (!data || data.length === 0) return <div className="h-full flex items-center justify-center text-slate-400">Sin datos históricos</div>;

    return (
        <div className="h-full flex flex-col">
            <h3 className="text-lg font-bold text-slate-800 mb-2 flex items-center gap-2">
                <Clock size={18} className="text-blue-500" />
                Ciclo Estacional
            </h3>
            <p className="text-xs text-slate-400 mb-4">Evolución mensual de la demanda.</p>

            <div className="flex-1 min-h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                        data={data}
                        margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
                    >
                        <defs>
                            <linearGradient id="colorTickets" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} />
                        <Tooltip
                            contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                            cursor={{ stroke: '#3b82f6', strokeWidth: 1 }}
                        />
                        <Area type="monotone" dataKey="tickets" stroke="#3b82f6" strokeWidth={3} fill="url(#colorTickets)" />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
};

export default SeasonalityStack;
