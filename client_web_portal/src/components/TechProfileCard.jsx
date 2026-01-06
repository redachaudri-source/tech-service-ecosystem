import React from 'react';
import { Star, Award, ShieldCheck, CheckCircle2 } from 'lucide-react';

const TechProfileCard = ({ technician, compact = false }) => {
    if (!technician) return null;

    const rating = technician.avg_rating || 0;
    const reviewCount = technician.total_reviews || 0;
    const completed = technician.completed_services || 0;
    const badges = ['Puntual', 'Pro', 'Amable']; // Mock badges for now, or fetch from DB if we store them per tech

    if (compact) {
        return (
            <div className="flex items-center gap-3 bg-white p-3 rounded-xl border border-slate-200 shadow-sm animate-in fade-in slide-in-from-left-4">
                <div className="relative">
                    <img
                        src={technician.avatar_url || `https://ui-avatars.com/api/?name=${technician.full_name}&background=0D8ABC&color=fff`}
                        alt={technician.full_name}
                        className="w-10 h-10 rounded-full object-cover border-2 border-slate-100"
                    />
                    {rating >= 4.8 && (
                        <div className="absolute -bottom-1 -right-1 bg-yellow-400 text-white p-0.5 rounded-full border border-white" title="Top Pro">
                            <Star size={8} fill="currentColor" />
                        </div>
                    )}
                </div>
                <div>
                    <h4 className="text-sm font-bold text-slate-800 leading-tight flex items-center gap-1">
                        {technician.full_name}
                        {rating >= 4.8 && <ShieldCheck size={12} className="text-blue-500" />}
                    </h4>
                    <div className="flex items-center gap-2 text-xs">
                        <div className="flex items-center text-yellow-500 font-bold">
                            <Star size={10} fill="currentColor" className="mr-0.5" />
                            {rating > 0 ? rating.toFixed(1) : 'Nuevo'}
                        </div>
                        <span className="text-slate-300">|</span>
                        <span className="text-slate-500">{completed} servicios</span>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-lg text-center relative overflow-hidden group hover:border-blue-200 transition-all">
            {rating >= 4.8 && (
                <div className="absolute top-0 right-0 bg-gradient-to-bl from-yellow-400 to-amber-500 text-white text-[10px] font-bold px-3 py-1 rounded-bl-xl shadow-sm z-10">
                    TOP PRO
                </div>
            )}

            <div className="w-20 h-20 mx-auto rounded-full p-1 bg-gradient-to-tr from-blue-500 to-cyan-400 mb-3 shadow-blue-200 shadow-lg">
                <img
                    src={technician.avatar_url || `https://ui-avatars.com/api/?name=${technician.full_name}&background=0D8ABC&color=fff`}
                    alt={technician.full_name}
                    className="w-full h-full rounded-full object-cover border-4 border-white"
                />
            </div>

            <h3 className="font-bold text-lg text-slate-800 mb-1">{technician.full_name}</h3>
            <p className="text-xs text-slate-500 uppercase tracking-wider font-bold mb-3">Técnico Certificado</p>

            <div className="flex justify-center items-center gap-4 mb-4 bg-slate-50 p-2 rounded-xl border border-slate-100">
                <div className="text-center">
                    <div className="flex items-center justify-center gap-1 font-black text-slate-800 text-lg">
                        <Star size={18} className="text-yellow-400" fill="currentColor" />
                        {rating > 0 ? rating.toFixed(1) : '-'}
                    </div>
                    <p className="text-[10px] text-slate-400 font-bold">VALORACIÓN</p>
                </div>
                <div className="w-px h-8 bg-slate-200"></div>
                <div className="text-center">
                    <div className="flex items-center justify-center gap-1 font-black text-slate-800 text-lg">
                        <CheckCircle2 size={18} className="text-green-500" />
                        {completed}
                    </div>
                    <p className="text-[10px] text-slate-400 font-bold">ÉXITOS</p>
                </div>
            </div>

            {/* Badges */}
            <div className="flex flex-wrap gap-2 justify-center">
                {rating >= 4.5 && (
                    <span className="px-2 py-1 bg-blue-50 text-blue-700 rounded-lg text-[10px] font-bold flex items-center gap-1 border border-blue-100">
                        <Award size={12} /> Excelencia
                    </span>
                )}
                {completed > 50 && (
                    <span className="px-2 py-1 bg-purple-50 text-purple-700 rounded-lg text-[10px] font-bold flex items-center gap-1 border border-purple-100">
                        <ShieldCheck size={12} /> Veterano
                    </span>
                )}
                <span className="px-2 py-1 bg-green-50 text-green-700 rounded-lg text-[10px] font-bold flex items-center gap-1 border border-green-100">
                    <CheckCircle2 size={12} /> Verificado
                </span>
            </div>
        </div>
    );
};

export default TechProfileCard;
