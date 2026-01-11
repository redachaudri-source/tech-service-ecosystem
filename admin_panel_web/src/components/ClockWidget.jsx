import React, { useState, useEffect } from 'react';
import { Settings, Clock } from 'lucide-react';

const ClockWidget = () => {
    const [time, setTime] = useState(new Date());
    const [theme, setTheme] = useState('mickey'); // mickey, minimal, industrial, retro, digital-retro
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
        <div className="relative w-full h-full bg-slate-100 rounded-2xl shadow-inner border-4 border-slate-300 flex items-center justify-center overflow-hidden">
            {/* Simple visual approximation of Mickey silhouette */}
            <div className="absolute inset-0 flex items-center justify-center opacity-10 pointer-events-none">
                <div className="w-32 h-32 bg-black rounded-full mb-12"></div>
            </div>

            {/* Hour Markers */}
            {[...Array(12)].map((_, i) => (
                <div key={i} className="absolute w-full h-full text-center pt-2 font-bold text-slate-400" style={{ transform: `rotate(${i * 30}deg)` }}>
                    <span className="inline-block transform -rotate-[${i * 30}deg] text-[10px]"></span>
                </div>
            ))}

            {/* Arms */}
            <div className="absolute w-2 h-16 bg-black rounded-full origin-bottom bottom-1/2 left-1/2 -translate-x-1/2 shadow-lg" style={{ transform: `translateX(-50%) rotate(${hourDeg}deg)`, height: '25%', width: '6px' }}></div>
            <div className="absolute w-1.5 h-20 bg-slate-800 rounded-full origin-bottom bottom-1/2 left-1/2 -translate-x-1/2 shadow-lg" style={{ transform: `translateX(-50%) rotate(${minDeg}deg)`, height: '35%' }}></div>
            <div className="absolute w-0.5 h-20 bg-red-500 origin-bottom bottom-1/2 left-1/2 -translate-x-1/2 z-10" style={{ transform: `translateX(-50%) rotate(${secDeg}deg)`, height: '40%' }}></div>

            <div className="absolute w-3 h-3 bg-red-500 rounded-full z-20"></div>
        </div>
    );

    const MinimalFace = () => (
        <div className="w-full h-full bg-slate-900 rounded-full border-4 border-slate-700 flex items-center justify-center relative shadow-xl">
            <div className="absolute inset-0">
                {[0, 90, 180, 270].map(deg => (
                    <div key={deg} className="absolute top-1/2 left-1/2 w-full h-1 bg-slate-600 -translate-y-1/2 -translate-x-1/2" style={{ transform: `translate(-50%, -50%) rotate(${deg}deg)` }}>
                        <div className="w-2 h-full bg-slate-400 absolute right-1"></div>
                    </div>
                ))}
            </div>
            <div className="absolute w-1 h-12 bg-white origin-bottom bottom-1/2 left-1/2 -translate-x-1/2 rounded-full" style={{ transform: `translateX(-50%) rotate(${hourDeg}deg)`, height: '25%' }}></div>
            <div className="absolute w-0.5 h-16 bg-slate-300 origin-bottom bottom-1/2 left-1/2 -translate-x-1/2 rounded-full" style={{ transform: `translateX(-50%) rotate(${minDeg}deg)`, height: '38%' }}></div>
            <div className="absolute w-0.5 h-16 bg-orange-500 origin-bottom bottom-1/2 left-1/2 -translate-x-1/2 z-10" style={{ transform: `translateX(-50%) rotate(${secDeg}deg)`, height: '42%' }}></div>
            <div className="absolute w-2 h-2 bg-orange-500 rounded-full z-20"></div>
        </div>
    );

    const IndustrialFace = () => (
        <div className="w-full h-full bg-zinc-800 rounded-md border-4 border-zinc-600 shadow-inner flex items-center justify-center font-mono text-amber-500 relative">
            <div className="absolute inset-x-0 top-2 text-center text-[8px] tracking-widest text-zinc-500">SYS.TIME</div>
            <div className="text-2xl font-black tracking-widest drop-shadow-[0_0_5px_rgba(245,158,11,0.5)]">
                {time.toLocaleTimeString([], { hour12: false })}
            </div>
        </div>
    );

    const RetroFace = () => (
        <div className="w-full h-full bg-[#e0e0e0] rounded-xl shadow-[inset_4px_4px_10px_#bebebe,inset_-4px_-4px_10px_#ffffff] flex items-center justify-center relative">
            <div className="w-3/4 h-3/4 bg-slate-200 rounded-full shadow-inner flex items-center justify-center relative border border-slate-300">
                <div className="absolute w-1.5 h-10 bg-slate-700 origin-bottom bottom-1/2 left-1/2 -translate-x-1/2" style={{ transform: `translateX(-50%) rotate(${hourDeg}deg)` }}></div>
                <div className="absolute w-1 h-12 bg-slate-500 origin-bottom bottom-1/2 left-1/2 -translate-x-1/2" style={{ transform: `translateX(-50%) rotate(${minDeg}deg)` }}></div>
                <div className="absolute w-0.5 h-14 bg-red-500 origin-bottom bottom-1/2 left-1/2 -translate-x-1/2 transition-transform duration-75" style={{ transform: `translateX(-50%) rotate(${secDeg}deg)` }}></div>
                <div className="absolute w-2 h-2 bg-slate-800 rounded-full z-10"></div>
            </div>
        </div>
    );

    return (
        <div className="relative group w-28 h-28 md:w-32 md:h-32 shrink-0 select-none cursor-pointer" onClick={() => setShowConfig(!showConfig)}>
            {theme === 'mickey' && <MickeyFace />}
            {theme === 'minimal' && <MinimalFace />}
            {theme === 'industrial' && <IndustrialFace />}
            {theme === 'retro' && <RetroFace />}

            {/* Config Overlay (Hidden by default, shown on click) */}
            {showConfig && (
                <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 bg-white/90 backdrop-blur rounded-lg shadow-xl p-2 z-[60] flex gap-1 border border-slate-200 animate-in slide-in-from-top-2">
                    {['mickey', 'minimal', 'industrial', 'retro'].map(t => (
                        <button
                            key={t}
                            onClick={(e) => { e.stopPropagation(); setTheme(t); setShowConfig(false); }}
                            className={`w-6 h-6 rounded-full border-2 ${theme === t ? 'border-indigo-500 scale-110' : 'border-slate-300 hover:scale-105'} transition-all`}
                            style={{ backgroundColor: t === 'mickey' ? '#f1f5f9' : t === 'minimal' ? '#0f172a' : t === 'industrial' ? '#27272a' : '#e2e8f0' }}
                            title={t}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

export default ClockWidget;
