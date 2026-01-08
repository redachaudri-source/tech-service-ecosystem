import { PieChart, Pie, Sector, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { useState } from 'react';
import { Zap } from 'lucide-react';

const COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#6366f1'];

const renderActiveShape = (props) => {
    const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill, payload, percent, value } = props;

    return (
        <g>
            <text x={cx} y={cy} dy={-10} textAnchor="middle" fill="#1e293b" className="text-xl font-bold">
                {payload.name}
            </text>
            <text x={cx} y={cy} dy={20} textAnchor="middle" fill="#64748b" className="text-sm">
                {`${(percent * 100).toFixed(0)}%`}
            </text>
            <Sector
                cx={cx}
                cy={cy}
                innerRadius={innerRadius}
                outerRadius={outerRadius + 8}
                startAngle={startAngle}
                endAngle={endAngle}
                fill={fill}
            />
            <Sector
                cx={cx}
                cy={cy}
                startAngle={startAngle}
                endAngle={endAngle}
                innerRadius={outerRadius + 10}
                outerRadius={outerRadius + 12}
                fill={fill}
            />
        </g>
    );
};

const MarketShareWheel = ({ data, loading }) => {
    const [activeIndex, setActiveIndex] = useState(0);

    const onPieEnter = (_, index) => {
        setActiveIndex(index);
    };

    if (loading) return (
        <div className="h-full w-full flex flex-col gap-4">
            <div className="h-6 w-1/3 bg-slate-100 rounded animate-pulse"></div>
            <div className="flex-1 bg-slate-50 rounded-full animate-pulse mx-auto w-64 h-64"></div>
        </div>
    );

    if (!data || data.length === 0) return <div className="h-full flex items-center justify-center text-slate-400">Sin datos</div>;

    return (
        <div className="h-full flex flex-col">
            <h3 className="text-lg font-bold text-slate-800 mb-2 flex items-center gap-2">
                <Zap size={18} className="text-amber-500" />
                Cuota de Mercado
            </h3>
            <p className="text-xs text-slate-400 mb-4">Distribución por volumen de reparaciones.</p>

            <div className="flex-1 min-h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                        <Pie
                            activeIndex={activeIndex}
                            activeShape={renderActiveShape}
                            data={data}
                            innerRadius={80}
                            outerRadius={120}
                            fill="#8884d8"
                            dataKey="value"
                            onMouseEnter={onPieEnter}
                            paddingAngle={2}
                        >
                            {data.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} stroke="none" />
                            ))}
                        </Pie>
                    </PieChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
};

export default MarketShareWheel;
