import { useNavigate } from 'react-router-dom';
import { Brain, FileText, Smartphone, ArrowRight, Zap, CheckCircle } from 'lucide-react';

const MortifyExplainerBanner = () => {
    // We can use a trigger function passed as prop to open the wizard, 
    // but the prompt implies this is a general banner. 
    // Ideally it should trigger the wizard on a selected appliance or scroll to list.
    // For now, I'll make the button trigger an alert or focus on the list.

    return (
        <div className="w-full bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 rounded-3xl p-8 md:p-12 text-white shadow-2xl relative overflow-hidden mb-12 border border-white/10 group">

            {/* Background Effects */}
            <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-pink-600/20 rounded-full blur-[100px] -translate-y-1/2 translate-x-1/3"></div>
            <div className="absolute bottom-0 left-0 w-[300px] h-[300px] bg-blue-600/20 rounded-full blur-[80px] translate-y-1/3 -translate-x-1/4"></div>

            <div className="relative z-10 max-w-5xl mx-auto text-center">

                {/* Header */}
                <div className="mb-12 space-y-4">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-pink-500/20 border border-pink-500/30 text-pink-300 text-xs font-bold tracking-wider uppercase mb-2">
                        <Zap size={14} className="fill-current" /> Nueva Funcionalidad
                    </div>
                    <h2 className="text-3xl md:text-5xl font-black tracking-tight leading-tight">
                        ¿Dudas si reparar? <br className="hidden md:block" />
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-pink-400 to-purple-400">
                            Analiza primero con IA.
                        </span>
                    </h2>
                    <p className="text-slate-300 text-lg md:text-xl max-w-2xl mx-auto font-light">
                        La decisión inteligente. Y si reparas con nosotros, <strong className="text-white font-bold bg-pink-600 px-2 py-0.5 rounded-md">te sale GRATIS</strong>.
                    </p>
                </div>

                {/* Steps Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-4 items-start relative mb-12">

                    {/* Step 1 */}
                    <div className="flex flex-col items-center relative group/step">
                        <div className="w-20 h-20 bg-slate-800 rounded-2xl flex items-center justify-center mb-6 shadow-xl border border-white/5 group-hover/step:scale-110 transition duration-500 group-hover/step:border-pink-500/50">
                            <Brain size={40} className="text-pink-400" />
                        </div>
                        <h3 className="text-xl font-bold mb-2">1. Solicita Estudio <span className="text-pink-400">(9.99€)</span></h3>
                        <p className="text-sm text-slate-400 leading-relaxed max-w-xs">
                            Nuestra IA, cruzada con datos históricos, evalúa la rentabilidad real de tu aparato.
                        </p>

                        {/* Desktop Arrow */}
                        <div className="hidden md:block absolute top-8 -right-[50%] w-full h-px border-t-2 border-dashed border-white/10 flex items-center justify-center">
                            <ArrowRight className="text-slate-600 bg-slate-900 absolute left-1/2 -translate-x-1/2 -top-2.5 px-2" size={24} />
                        </div>
                    </div>

                    {/* Step 2 */}
                    <div className="flex flex-col items-center relative group/step">
                        <div className="w-20 h-20 bg-slate-800 rounded-2xl flex items-center justify-center mb-6 shadow-xl border border-white/5 group-hover/step:scale-110 transition duration-500 group-hover/step:border-amber-400/50">
                            <div className="relative">
                                <FileText size={40} className="text-amber-400" />
                                <div className="absolute -bottom-2 -right-2 bg-green-500 text-slate-900 text-[10px] font-black px-1.5 py-0.5 rounded shadow">V6</div>
                            </div>
                        </div>
                        <h3 className="text-xl font-bold mb-2">2. Recibe Informe V-Label</h3>
                        <p className="text-sm text-slate-400 leading-relaxed max-w-xs">
                            En 24-48h tendrás un grado claro (V1-V6) sobre si merece la pena invertir.
                        </p>

                        {/* Desktop Arrow */}
                        <div className="hidden md:block absolute top-8 -right-[50%] w-full h-px border-t-2 border-dashed border-white/10 flex items-center justify-center">
                            <ArrowRight className="text-slate-600 bg-slate-900 absolute left-1/2 -translate-x-1/2 -top-2.5 px-2" size={24} />
                        </div>
                    </div>

                    {/* Step 3 */}
                    <div className="flex flex-col items-center relative group/step">
                        <div className="w-20 h-20 bg-gradient-to-br from-green-500 to-emerald-700 rounded-2xl flex items-center justify-center mb-6 shadow-xl shadow-green-900/40 group-hover/step:scale-110 transition duration-500 ring-4 ring-green-400/20">
                            <Smartphone size={40} className="text-white" />
                        </div>
                        <h3 className="text-xl font-bold mb-2">3. Descuento Directo</h3>
                        <p className="text-sm text-green-200/80 leading-relaxed max-w-xs">
                            <strong className="text-white">¡Te devolvemos el dinero!</strong> Si aceptas el presupuesto, descontamos los 9.99€ de tu factura.
                        </p>
                    </div>

                </div>

                {/* CTA */}
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
                    className="group relative inline-flex items-center gap-3 px-8 py-4 bg-white text-pink-600 rounded-2xl font-black text-lg shadow-xl shadow-pink-900/20 hover:bg-pink-50 hover:scale-105 transition-all duration-300"
                >
                    <span className="relative z-10">PROBAR MORTIFY AHORA</span>
                    <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />

                    <div className="absolute -inset-1 bg-gradient-to-r from-pink-500 to-purple-500 rounded-2xl blur opacity-20 group-hover:opacity-40 transition duration-200"></div>
                </button>
                <p className="text-xs text-slate-500 mt-4 font-mono uppercase tracking-widest opacity-60">Simulación sin compromiso</p>

            </div>
        </div>
    );
};

export default MortifyExplainerBanner;
