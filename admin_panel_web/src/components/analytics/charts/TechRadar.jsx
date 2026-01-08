import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Award } from 'lucide-react';

const COLORS = ['#8b5cf6', '#ec4899', '#6366f1', '#a855f7'];

const TechRadar = ({ data, loading }) => {

    if (loading) return (
        <div className="h-full w-full flex flex-col gap-4">
            <div className="h-6 w-1/2 bg-slate-100 rounded animate-pulse"></div>
            <div className="flex-1 bg-slate-50 rounded animate-pulse"></div>
        </div>
    );
    // Note: Using Bar Chart instead of Radar for now as it's clearer for straightforward "Performance" comparison.
    // Radar is good for multi-axis (skills), but here we compare Revenue/Jobs.

    if (!data || data.length === 0) return <div className="h-full flex items-center justify-center text-slate-400">Sin datos de técnicos</div>;

    return (
        <div className="h-full flex flex-col">
            <h3 className="text-lg font-bold text-slate-800 mb-2 flex items-center gap-2">
                <Award size={18} className="text-purple-500" />
                Rendimiento Técnico
            </h3>
            <p className="text-xs text-slate-400 mb-4">Ranking por facturación total.</p>

            <div className="flex-1 min-h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                        data={data}
                        layout="vertical"
                        margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                        barSize={20}
                    >
                        <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#f1f5f9" />
                        <XAxis type="number" hide />
                        <YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                        <Tooltip cursor={{ fill: '#f8fafc' }} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                        <Bar dataKey="revenue" fill="#8884d8" radius={[0, 4, 4, 0]}>
                            {data.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
};

export default TechRadar;
