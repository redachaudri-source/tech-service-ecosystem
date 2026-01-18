import React from 'react';
import ViabilityLabel from './ViabilityLabel';
import { Quote, Briefcase, Bot, CheckCircle } from 'lucide-react';

const MortifyVerdictModal = ({ assessment, onClose }) => {
    if (!assessment) return null;

    const { admin_note, ia_suggestion, total_score } = assessment;

    // Determine content source logic:
    // If admin_note exists, show it (Human Expert).
    // If not, show mapped ia_suggestion (AI).
    const hasAdminNote = !!(admin_note && admin_note.trim().length > 0);

    const getFallBackText = (suggestion) => {
        if (!suggestion) return "El análisis ha concluido con una puntuación basada en el valor de mercado actual y el coste estimado de reparación.";

        switch (suggestion) {
            case 'VIABLE': return "Excelente noticia. El algoritmo determina que su aparato conserva un alto valor y la reparación es una inversión totalmente recomendada.";
            case 'DOUBTFUL': return "Análisis complejo. El coste de reparación es considerable respecto al valor actual del equipo. Recomendamos proceder con cautela.";
            case 'OBSOLETE': return "Desaconsejado. El aparato ha superado su vida útil económica o el coste de reparación excede el límite de seguridad.";
            default: return suggestion; // Just in case
        }
    }

    const content = hasAdminNote ? admin_note : getFallBackText(ia_suggestion);

    const authorLabel = hasAdminNote ? "Opinión del Experto Técnico" : "Análisis Automático (IA)";
    const AuthorIcon = hasAdminNote ? Briefcase : Bot;
    const themeColor = hasAdminNote ? "text-blue-700 bg-blue-100" : "text-purple-700 bg-purple-100";

    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 animate-in fade-in backdrop-blur-sm">
            <div className="bg-white rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl relative flex flex-col max-h-[90vh]">

                {/* Close Button */}
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 bg-white/80 hover:bg-white text-slate-400 hover:text-slate-800 p-2 rounded-full transition z-10 backdrop-blur-sm border border-slate-100 shadow-sm"
                >
                    ✕
                </button>

                <div className="overflow-y-auto custom-scrollbar">
                    {/* Header / V-Label Area */}
                    <div className="bg-slate-50 p-8 pb-10 border-b border-slate-100 flex flex-col items-center text-center relative">
                        <h2 className="text-xl font-bold text-slate-800 mb-6 relative z-10">Dictamen de Viabilidad</h2>
                        <div className="w-full max-w-[320px] transform hover:scale-105 transition duration-500 relative z-10 shadow-2xl rounded-2xl">
                            <ViabilityLabel score={total_score} size="lg" />
                        </div>

                        {/* Background Decoration */}
                        <div className="absolute top-0 left-0 w-full h-full overflow-hidden opacity-30 pointer-events-none">
                            <div className="absolute top-[-50px] right-[-50px] w-[200px] h-[200px] bg-blue-200/50 rounded-full blur-[80px]"></div>
                            <div className="absolute bottom-[-50px] left-[-50px] w-[200px] h-[200px] bg-purple-200/50 rounded-full blur-[80px]"></div>
                        </div>
                    </div>

                    {/* Verdict Text Content */}
                    <div className="p-6 md:p-8 bg-white relative">

                        {/* Icon */}
                        <div className="absolute top-6 left-6 text-slate-100 -z-0 opacity-50">
                            <Quote size={80} />
                        </div>

                        <div className="relative z-10">
                            <div className="flex items-center gap-2 mb-4">
                                <div className={`p-1.5 rounded-lg ${themeColor}`}>
                                    <AuthorIcon size={16} />
                                </div>
                                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                                    {authorLabel}
                                </span>
                            </div>

                            <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 text-slate-700 leading-relaxed text-lg font-medium shadow-sm relative">
                                {/* Triangle pointer */}
                                <div className="absolute -top-2 left-6 w-4 h-4 bg-slate-50 border-t border-l border-slate-100 transform rotate-45"></div>
                                "{content}"
                            </div>

                            {!hasAdminNote && (
                                <p className="text-[10px] text-slate-400 mt-3 text-center italic">
                                    * Nota generada por algoritmos de Mortify Intelligence.
                                </p>
                            )}
                        </div>

                        <div className="mt-8">
                            <button
                                onClick={onClose}
                                className="w-full bg-slate-900 text-white py-3.5 rounded-xl font-bold hover:bg-slate-800 transition shadow-lg active:scale-95 flex items-center justify-center gap-2"
                            >
                                <CheckCircle size={18} /> Entendido
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default MortifyVerdictModal;
