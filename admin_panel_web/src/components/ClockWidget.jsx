import React, { useState, useEffect } from 'react';
import { Settings } from 'lucide-react';

const ClockWidget = () => {
    const [time, setTime] = useState(new Date());
    const [theme, setTheme] = useState('mickey'); // mickey, minimal, industrial, retro
    const [showConfig, setShowConfig] = useState(false);

    useEffect(() => {
        const timer = setInterval(() => setTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    const hours = time.getHours();
    const minutes = time.getMinutes();
    const seconds = time.getSeconds();

    // Analog Calculations
    const secDeg = seconds * 6;
    const minDeg = minutes * 6 + seconds * 0.1;
    const hourDeg = (hours % 12) * 30 + minutes * 0.5;

    // --- SUB-COMPONENTS ---
    const MickeyFace = () => (
        <div className="relative w-full h-full bg-white rounded-2xl shadow-sm border-2 border-slate-200 flex items-center justify-center overflow-hidden">
            {/* Mickey Ears Silhouette (More visible) */}
            <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-black rounded-full opacity-5 pointer-events-none"></div>
            <div className="absolute top-[-10%] right-[-10%] w-[50%] h-[50%] bg-black rounded-full opacity-5 pointer-events-none"></div>

            {/* Face Circle */}
            <div className="absolute w-[80%] h-[80%] bg-slate-50 rounded-full border border-slate-100 flex items-center justify-center">
                <div className="text-[8px] font-bold text-slate-300 mt-8">MICKEY</div>
            </div>

            {/* Hour Markers */}
            {[...Array(12)].map((_, i) => (
                <div key={i} className="absolute w-full h-full text-center pt-1" style={{ transform: `rotate(${i * 30}deg)` }}>
                    <div className="w-0.5 h-1.5 bg-slate-300 mx-auto"></div>
                </div>
            ))}

            {/* Hands (Mickey Arms Style) */}
            {/* Hour Hand (Thick) */}
            <div className="absolute w-2.5 bg-yellow-500 rounded-full origin-bottom bottom-1/2 left-1/2 -translate-x-1/2 shadow-sm z-10 border border-yellow-600"
                style={{ transform: `translateX(-50%) rotate(${hourDeg}deg)`, height: '28%' }}>
                {/* Glove */}
                <div className="absolute -top-1 left-[-2px] w-4 h-4 bg-white border-2 border-slate-300 rounded-full"></div>
            </div>

            {/* Minute Hand (Longer) */}
            <div className="absolute w-2 bg-yellow-500 rounded-full origin-bottom bottom-1/2 left-1/2 -translate-x-1/2 shadow-sm z-10 border border-yellow-600"
                style={{ transform: `translateX(-50%) rotate(${minDeg}deg)`, height: '38%' }}>
                <div className="absolute -top-1 left-[-2px] w-3 h-3 bg-white border-2 border-slate-300 rounded-full"></div>
            </div>

            {/* Second Hand */}
            <div className="absolute w-0.5 bg-red-500 origin-bottom bottom-1/2 left-1/2 -translate-x-1/2 z-20" style={{ transform: `translateX(-50%) rotate(${secDeg}deg)`, height: '45%' }}></div>

            <div className="absolute w-2 h-2 bg-red-500 rounded-full z-30 border-2 border-white"></div>
        </div>
    );

    const MinimalFace = () => (
        <div className="w-full h-full bg-slate-900 rounded-xl border-2 border-slate-700 flex items-center justify-center relative shadow-lg">
            <div className="absolute inset-0">
                {[0, 90, 180, 270].map(deg => (
                    <div key={deg} className="absolute top-1/2 left-1/2 w-full h-0.5 bg-slate-700 -translate-y-1/2 -translate-x-1/2" style={{ transform: `translate(-50%, -50%) rotate(${deg}deg)` }}>
                        <div className="w-1.5 h-full bg-slate-400 absolute right-1"></div>
                    </div>
                ))}
            </div>
            <div className="absolute w-1 bg-white origin-bottom bottom-1/2 left-1/2 -translate-x-1/2 rounded-full" style={{ transform: `translateX(-50%) rotate(${hourDeg}deg)`, height: '25%' }}></div>
            <div className="absolute w-0.5 bg-slate-300 origin-bottom bottom-1/2 left-1/2 -translate-x-1/2 rounded-full" style={{ transform: `translateX(-50%) rotate(${minDeg}deg)`, height: '38%' }}></div>
            <div className="absolute w-0.5 bg-orange-500 origin-bottom bottom-1/2 left-1/2 -translate-x-1/2 z-10" style={{ transform: `translateX(-50%) rotate(${secDeg}deg)`, height: '42%' }}></div>
            <div className="absolute w-1.5 h-1.5 bg-orange-500 rounded-full z-20"></div>
        </div>
    );

    const IndustrialFace = () => (
        <div className="w-full h-full bg-zinc-800 rounded-lg border-2 border-zinc-600 shadow-inner flex items-center justify-center font-mono text-amber-500 relative">
            <div className="absolute top-1 text-[8px] tracking-widest text-zinc-600">SYS</div>
            <div className="text-xl font-bold tracking-widest drop-shadow-md">
                {time.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit' })}
            </div>
            <div className="absolute bottom-1 right-2 text-[8px] text-zinc-500">{time.getSeconds()}</div>
        </div>
    );

    return (
        // Reduced size: w-20 h-20 md:w-24 md:h-24 (Previous was 28/32)
        <div className="relative group w-20 h-20 md:w-24 md:h-24 shrink-0 select-none cursor-pointer hover:scale-105 transition-transform" onClick={() => setShowConfig(!showConfig)}>
            {theme === 'mickey' && <MickeyFace />}
            {theme === 'minimal' && <MinimalFace />}
            {theme === 'industrial' && <IndustrialFace />}

            {/* Config Overlay - Compact */}
            {showConfig && (
                <div className="absolute top-full mt-1 left-1/2 -translate-x-1/2 bg-white/95 backdrop-blur rounded p-1 z-[60] flex gap-1 border border-slate-200 shadow-lg">
                    {['mickey', 'minimal', 'industrial'].map(t => (
                        <button
                            key={t}
                            onClick={(e) => { e.stopPropagation(); setTheme(t); setShowConfig(false); }}
                            className={`w-4 h-4 rounded-full border ${theme === t ? 'border-indigo-500 scale-125' : 'border-slate-300 hover:scale-110'} transition-all`}
                            style={{ backgroundColor: t === 'mickey' ? '#fff' : t === 'minimal' ? '#0f172a' : '#27272a' }}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

export default ClockWidget;
