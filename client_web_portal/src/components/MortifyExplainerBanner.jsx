import React from 'react';
import { ShieldCheck, Star, Zap, Infinity, Crown } from 'lucide-react';

const MortifyExplainerBanner = () => {
    return (
        <div className="w-full bg-slate-900 rounded-3xl p-6 md:p-8 text-white shadow-2xl relative overflow-hidden mb-8 border border-amber-500/20 group">

            {/* Background Effects (Premium Gold) */}
            <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-amber-500/10 rounded-full blur-[80px] -translate-y-1/2 translate-x-1/3"></div>
            <div className="absolute bottom-0 left-0 w-[200px] h-[200px] bg-purple-900/20 rounded-full blur-[60px] translate-y-1/3 -translate-x-1/4"></div>

            {/* Pattern Overlay */}
            <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '24px 24px' }}></div>

            <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-8 md:gap-12">

                {/* LEFT: Identity Card */}
                <div className="flex-1 text-center md:text-left space-y-4">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-[10px] font-bold tracking-wider uppercase shadow-[0_0_15px_rgba(251,191,36,0.2)]">
                        <Crown size={12} className="fill-current" /> Status: Activo
                    </div>

                    <h2 className="text-3xl md:text-4xl font-black tracking-tight leading-none text-white">
                        MORTIFY <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-200 via-amber-400 to-amber-200">PRIVILEGE</span>
                    </h2>

                    <p className="text-slate-400 text-sm leading-relaxed max-w-lg">
                        Has desbloqueado la protección vitalicia. Tu cartera de electrodomésticos está siendo monitorizada en tiempo real por nuestra Inteligencia Artificial para maximizar tu ahorro.
                    </p>
                </div>

                {/* RIGHT: Benefits Grid (Premium Cards) */}
                <div className="flex-1 w-full grid grid-cols-1 md:grid-cols-2 gap-4">

                    {/* Benefit 1 */}
                    <div className="flex items-center gap-4 p-4 rounded-xl bg-white/5 border border-white/5 hover:border-amber-500/30 hover:bg-white/10 transition-all group/card">
                        <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center border border-slate-700 shadow-lg group-hover/card:scale-110 transition-transform">
                            <ShieldCheck size={24} className="text-amber-400" />
                        </div>
                        <div>
                            <h3 className="text-white font-bold text-sm">Garantía Total</h3>
                            <p className="text-slate-500 text-[10px] leading-tight mt-0.5">Si reparamos, es gratis.</p>
                        </div>
                    </div>

                    {/* Benefit 2 */}
                    <div className="flex items-center gap-4 p-4 rounded-xl bg-white/5 border border-white/5 hover:border-purple-500/30 hover:bg-white/10 transition-all group/card">
                        <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center border border-slate-700 shadow-lg group-hover/card:scale-110 transition-transform">
                            <Infinity size={24} className="text-purple-400" />
                        </div>
                        <div>
                            <h3 className="text-white font-bold text-sm">Análisis Ilimitados</h3>
                            <p className="text-slate-500 text-[10px] leading-tight mt-0.5">Consultas de por vida.</p>
                        </div>
                    </div>

                </div>

            </div>
        </div>
    );
};

export default MortifyExplainerBanner;
