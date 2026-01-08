import { TrendingUp, DollarSign, Award, Target } from 'lucide-react';

const InsightPanel = ({ data, loading }) => {

    const SkeletonMetric = () => (
        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm animate-pulse">
            <div className="h-3 w-20 bg-slate-100 rounded mb-2"></div>
            <div className="h-8 w-16 bg-slate-100 rounded mb-2"></div>
        </div>
    );

    if (loading) return (
        <>
            <SkeletonMetric />
            <SkeletonMetric />
            <SkeletonMetric />
            <SkeletonMetric />
        </>
    );

    const metrics = [
        { label: 'Volumen', value: data?.total_volume || 0, unit: '', icon: TrendingUp, color: 'text-blue-600', bg: 'bg-blue-50' },
        { label: 'Facturación', value: data?.total_revenue || 0, unit: '€', icon: DollarSign, color: 'text-green-600', bg: 'bg-green-50' },
        { label: 'Ticket Medio', value: data?.avg_ticket || 0, unit: '€', icon: Award, color: 'text-purple-600', bg: 'bg-purple-50' },
        { label: 'Cierre', value: data?.completion_rate || 0, unit: '%', icon: Target, color: 'text-amber-600', bg: 'bg-amber-50' },
    ];

    return (
        <>
            {metrics.map((m, idx) => (
                <div key={idx} className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all group">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">{m.label}</p>
                            <h3 className="text-2xl font-black text-slate-800 mt-1 tracking-tight">
                                {m.value}{m.unit && <span className="text-sm text-slate-400 font-medium ml-0.5">{m.unit}</span>}
                            </h3>
                        </div>
                        <div className={`p-2 rounded-lg ${m.bg} ${m.color} bg-opacity-50 group-hover:scale-110 transition-transform`}>
                            <m.icon size={18} />
                        </div>
                    </div>
                </div>
            ))}
        </>
    );
};

export default InsightPanel;
