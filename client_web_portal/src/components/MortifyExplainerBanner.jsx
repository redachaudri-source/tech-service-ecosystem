import { useNavigate } from 'react-router-dom';
import { Brain, FileText, Smartphone, ArrowRight, Zap, CheckCircle } from 'lucide-react';

const MortifyExplainerBanner = () => {
    return (
        <div className="w-full bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 rounded-3xl p-6 md:p-8 text-white shadow-xl relative overflow-hidden mb-8 border border-white/10 group">

            {/* Background Effects (Subtler) */}
            <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-pink-600/10 rounded-full blur-[80px] -translate-y-1/2 translate-x-1/3"></div>
            <div className="absolute bottom-0 left-0 w-[200px] h-[200px] bg-blue-600/10 rounded-full blur-[60px] translate-y-1/3 -translate-x-1/4"></div>

            <div className="relative z-10 flex flex-col md:flex-row items-center gap-8 md:gap-12">

                {/* LEFT: Header & CTA (Compact) */}
                <div className="flex-1 text-center md:text-left space-y-4 md:max-w-md">
                    <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-pink-500/20 border border-pink-500/30 text-pink-300 text-[10px] font-bold tracking-wider uppercase">
                        <Zap size={12} className="fill-current" /> Nueva Funcionalidad
                    </div>

                    <h2 className="text-2xl md:text-3xl font-black tracking-tight leading-tight">
                        ¿Dudas si reparar? <br />
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-pink-400 to-purple-400">
                            Analiza primero con IA.
                        </span>
                    </h2>

                    <p className="text-slate-300 text-sm leading-relaxed">
                        La decisión inteligente. Y si reparas con nosotros, <strong className="text-white font-bold bg-pink-600 px-1.5 py-0.5 rounded">te sale GRATIS</strong>.
                    </p>

                    <div className="pt-2 flex flex-col md:flex-row items-center gap-3 justify-center md:justify-start">
                        <button
                            onClick={() => {
                                const firstPiggy = document.querySelector('button[title="Análisis de Viabilidad"]');
                                if (firstPiggy) {
                                    firstPiggy.click();
                                    firstPiggy.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                } else {
                                    alert("Selecciona un electrodoméstico de la lista para analizarlo.");
                                }
                            }}
                            className="group relative inline-flex items-center gap-2 px-6 py-3 bg-white text-pink-700 rounded-xl font-black text-sm shadow-lg hover:bg-pink-50 hover:scale-105 transition-all duration-300"
                        >
                            <span className="relative z-10">PROBAR MORTIFY</span>
                            <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
                        </button>
                        <p className="text-[10px] text-slate-500 font-mono uppercase tracking-widest opacity-60">Simulación sin compromiso</p>
                    </div>
                </div>

                {/* RIGHT: Steps Grid (Horizontal & Mini) */}
                <div className="flex-1 w-full grid grid-cols-1 md:grid-cols-3 gap-4 relative">

                    {/* Step 1 */}
                    <div className="flex flex-col items-center text-center p-3 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 transition group/step">
                        <div className="w-10 h-10 bg-slate-800 rounded-lg flex items-center justify-center mb-3 shadow-lg border border-white/10 group-hover/step:border-pink-500/50">
                            <Brain size={20} className="text-pink-400" />
                        </div>
                        <h3 className="text-sm font-bold mb-1">1. Solicita Estudio</h3>
                        <p className="text-[10px] text-slate-400 leading-tight">
                            Nuestra IA evalúa la rentabilidad (9.99€).
                        </p>
                        {/* Arrow */}
                        <div className="hidden md:block absolute top-8 left-[30%] text-slate-700"><ArrowRight size={16} /></div>
                    </div>

                    {/* Step 2 */}
                    <div className="flex flex-col items-center text-center p-3 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 transition group/step">
                        <div className="w-10 h-10 bg-slate-800 rounded-lg flex items-center justify-center mb-3 shadow-lg border border-white/10 group-hover/step:border-amber-400/50">
                            <FileText size={20} className="text-amber-400" />
                        </div>
                        <h3 className="text-sm font-bold mb-1">2. Recibe Informe</h3>
                        <p className="text-[10px] text-slate-400 leading-tight">
                            Obtén tu etiqueta V-Label en 24h.
                        </p>
                        {/* Arrow */}
                        <div className="hidden md:block absolute top-8 right-[30%] text-slate-700"><ArrowRight size={16} /></div>
                    </div>

                    {/* Step 3 */}
                    <div className="flex flex-col items-center text-center p-3 rounded-xl bg-gradient-to-br from-green-900/40 to-emerald-900/40 border border-green-500/20 hover:border-green-500/40 transition group/step">
                        <div className="w-10 h-10 bg-gradient-to-br from-green-500 to-emerald-700 rounded-lg flex items-center justify-center mb-3 shadow-lg">
                            <Smartphone size={20} className="text-white" />
                        </div>
                        <h3 className="text-sm font-bold mb-1 text-green-100">3. Reembolso</h3>
                        <p className="text-[10px] text-green-200/70 leading-tight">
                            Te devolvemos el dinero en tu factura.
                        </p>
                    </div>

                </div>

            </div>
        </div>
    );
};

export default MortifyExplainerBanner;
