import { MapPin } from 'lucide-react';

const GeoHeatmap = ({ data, loading }) => {

    if (loading) return (
        <div className="flex gap-4 overflow-hidden">
            {[1, 2, 3, 4].map(i => <div key={i} className="h-32 w-48 bg-slate-50 rounded-xl animate-pulse shrink-0"></div>)}
        </div>
    );

    if (!data || data.length === 0) return <div className="p-4 text-center text-slate-400">No hay datos geográficos relevantes.</div>;

    const maxVal = data[0]?.value || 1;

    return (
        <div className="flex flex-col">
            <div className="flex items-center gap-2 mb-4">
                <MapPin size={16} className="text-red-500" />
                <span className="text-sm font-semibold text-slate-600">Top Zonas (Códigos Postales)</span>
            </div>

            <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide">
                {data.map((zone, idx) => (
                    <div key={idx} className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm min-w-[160px] flex flex-col justify-between group hover:border-red-200 transition-colors">
                        <div>
                            <p className="text-xs text-slate-400 uppercase font-bold">CP {zone.postal_code}</p>
                            <p className="text-2xl font-black text-slate-800 mt-1">{zone.value}</p>
                            <p className="text-xs text-slate-400">incidencias</p>
                        </div>

                        <div className="mt-4 h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-gradient-to-r from-orange-400 to-red-500 rounded-full"
                                style={{ width: `${(zone.value / maxVal) * 100}%` }}
                            />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default GeoHeatmap;
