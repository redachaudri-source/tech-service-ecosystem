import React from 'react';

const ViabilityLabel = ({ score, size = 'md' }) => {
    // 1. Calculate V-Level (Direct Mapping: 1 to 6)
    // Logic: If score is >= 6 -> V6. If score < 1 -> V1.
    // We treat score as the direct V number essentially, capped at 6.
    const vLevel = Math.max(1, Math.min(Math.floor(score || 0), 6));

    // 2. Visual Config
    const configs = {
        6: { color: 'bg-emerald-600', text: 'EXCELENTE', sub: 'Inversión Maestra', ring: 'ring-emerald-200' }, // 6+
        5: { color: 'bg-green-500', text: 'MUY RENTABLE', sub: 'Reparación Segura', ring: 'ring-green-200' }, // 5
        4: { color: 'bg-yellow-500', text: 'ACEPTABLE', sub: 'Riesgo Bajo', ring: 'ring-yellow-200' }, // 4
        3: { color: 'bg-orange-400', text: 'RIESGO MODERADO', sub: 'Evaluar Coste', ring: 'ring-orange-200' }, // 3
        2: { color: 'bg-red-500', text: 'POCO RENTABLE', sub: 'Desaconsejado', ring: 'ring-red-200' }, // 2
        1: { color: 'bg-slate-800', text: 'OBSOLETO', sub: 'Zona de Muerte', ring: 'ring-slate-200' }  // 0-1
    };

    const config = configs[vLevel] || configs[1];

    // Sizing
    const isSmall = size === 'sm';

    if (isSmall) {
        return (
            <div className={`flex items-center gap-2 px-2 py-1 rounded-md text-white font-bold text-[10px] ${config.color} shadow-sm`}>
                <span className="bg-white/20 px-1 rounded">V{vLevel}</span>
                <span>{config.text}</span>
            </div>
        );
    }

    // Default / Large Size (for Modal)
    return (
        <div className={`w-full overflow-hidden rounded-2xl border-2 border-white shadow-xl ${config.ring} ring-4 transition-all duration-500`}>
            {/* Header: The V-Label */}
            <div className={`${config.color} p-6 text-white flex items-center justify-between`}>
                <div className="flex flex-col">
                    <span className="text-xs font-bold opacity-80 tracking-widest uppercase mb-1">Resultado Mortify</span>
                    <span className="text-3xl font-black tracking-tight">{config.text}</span>
                    <span className="text-sm font-medium opacity-90">{config.sub}</span>
                </div>
                <div className="bg-white/20 backdrop-blur-md px-5 py-2 rounded-2xl flex flex-col items-center border border-white/10">
                    <span className="text-xs font-bold opacity-80">NIVEL</span>
                    <span className="text-4xl font-black leading-none">V{vLevel}</span>
                </div>
            </div>

            {/* Score Bar Visualization */}
            <div className="bg-slate-50 p-3 flex gap-1">
                {[1, 2, 3, 4, 5, 6].map(level => (
                    <div
                        key={level}
                        className={`h-2 flex-1 rounded-full transition-all duration-700 ${level <= vLevel ? configs[level].color : 'bg-slate-200'}`}
                    />
                ))}
            </div>
        </div>
    );
};

export default ViabilityLabel;
