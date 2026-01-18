import React from 'react';
import { Wrench } from 'lucide-react';

const ViabilityLabel = ({ score, size = 'md' }) => {
    // 1. Calculate V-Level (Granular Mapping 0-14 to V1-V6)
    // Scale:
    // V6: 12-14
    // V5: 10-11
    // V4: 8-9
    // V3: 6-7
    // V2: 4-5
    // V1: 0-3
    const rawScore = Math.floor(score || 0);
    let vLevel = 1;
    if (rawScore >= 12) vLevel = 6;
    else if (rawScore >= 10) vLevel = 5;
    else if (rawScore >= 8) vLevel = 4;
    else if (rawScore >= 6) vLevel = 3;
    else if (rawScore >= 4) vLevel = 2;
    else vLevel = 1;

    // 2. Visual Config (STRICT MODE)
    // V6 = Emerald (Pure Green)
    // V5 = Lime (Yellow-Green)
    // V4 = Yellow
    // V3 = Orange
    const configs = {
        6: { color: 'bg-emerald-600', text: 'EXCELENTE', sub: 'Inversión Maestra', ring: 'ring-emerald-200' },
        5: { color: 'bg-lime-500', text: 'MUY RENTABLE', sub: 'Reparación Segura', ring: 'ring-lime-200', textColor: 'text-lime-700' },
        4: { color: 'bg-yellow-400', text: 'ACEPTABLE', sub: 'Riesgo Bajo', ring: 'ring-yellow-200', textColor: 'text-yellow-700' },
        3: { color: 'bg-orange-400', text: 'RIESGO MODERADO', sub: 'Evaluar Coste', ring: 'ring-orange-200' },
        2: { color: 'bg-red-500', text: 'POCO RENTABLE', sub: 'Desaconsejado', ring: 'ring-red-200' },
        1: { color: 'bg-slate-800', text: 'OBSOLETO', sub: 'Zona de Muerte', ring: 'ring-slate-200' }
    };

    const config = configs[vLevel] || configs[1];

    // Sizing
    const isSmall = size === 'sm';

    if (isSmall) {
        // "Repairability Index" Style
        return (
            <div className="flex items-stretch select-none shadow-sm hover:scale-105 transition-transform">
                {/* Left: Icon Block (Solid Color) */}
                <div className={`${config.color} text-white px-2 py-1 rounded-l-md flex items-center justify-center`}>
                    <Wrench size={14} className="fill-current stroke-[2.5]" />
                </div>
                {/* Right: Score Block (White with colored border/text) */}
                <div className={`bg-white border-y border-r ${config.borderColor || 'border-slate-100'} rounded-r-md flex items-center justify-center px-2 min-w-[50px]`}>
                    <div className="flex flex-col items-center leading-none py-0.5">
                        <div className="flex items-baseline leading-none">
                            <span className={`font-black text-sm ${config.textColor || config.color.replace('bg-', 'text-')}`}>
                                {vLevel}
                            </span>
                            <span className="text-[9px] text-slate-300 font-bold ml-0.5">/6</span>
                        </div>
                        <span className="text-[8px] text-slate-400 font-medium tracking-tight">Sc: {rawScore}</span>
                    </div>
                </div>
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
                    <div className="flex items-end leading-none">
                        <span className="text-4xl font-black">V{vLevel}</span>
                        <span className="text-sm font-bold opacity-60 mb-1 ml-1">/6</span>
                    </div>
                    <span className="text-[10px] font-mono mt-1 opacity-70">Score: {rawScore}/24</span>
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
