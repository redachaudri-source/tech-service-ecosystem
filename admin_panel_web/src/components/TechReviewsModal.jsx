import React, { useEffect, useState } from 'react';
import { X, Star, User, Calendar } from 'lucide-react';
import { supabase } from '../lib/supabase';

const TechReviewsModal = ({ isOpen, onClose, userId }) => {
    const [reviews, setReviews] = useState([]);
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState({ avg: 0, total: 0 });

    useEffect(() => {
        if (isOpen && userId) {
            fetchReviews();
        }
    }, [isOpen, userId]);

    const fetchReviews = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('reviews')
                .select(`
                    *,
                    client:client_id (full_name, city)
                `)
                .eq('technician_id', userId)
                .order('created_at', { ascending: false });

            if (data) {
                setReviews(data);
                const avg = data.reduce((acc, curr) => acc + curr.rating, 0) / (data.length || 1);
                setStats({ avg: avg.toFixed(1), total: data.length });
            }
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/60 z-[80] backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">

                {/* Header */}
                <div className="bg-slate-900 text-white p-6 relative overflow-hidden shrink-0">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/20 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none"></div>

                    <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-white">
                        <X size={24} />
                    </button>

                    <div className="flex flex-col items-center justify-center text-center mt-2">
                        <div className="text-4xl font-black text-yellow-400 flex items-center gap-1 mb-1">
                            {stats.avg} <Star size={28} fill="currentColor" />
                        </div>
                        <p className="text-blue-200 text-sm font-medium uppercase tracking-wider">{stats.total} Reseñas Totales</p>
                    </div>
                </div>

                {/* List */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50">
                    {loading ? (
                        <div className="text-center py-10 text-slate-400">Cargando reseñas...</div>
                    ) : reviews.length === 0 ? (
                        <div className="text-center py-10">
                            <Star size={48} className="mx-auto text-slate-200 mb-2" />
                            <p className="text-slate-500 font-medium">Aún no tienes reseñas.</p>
                            <p className="text-xs text-slate-400 mt-1">¡Haz un buen trabajo y llegarán solas!</p>
                        </div>
                    ) : (
                        reviews.map(review => (
                            <div key={review.id} className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
                                <div className="flex justify-between items-start mb-2">
                                    <h4 className="font-bold text-slate-800 text-sm">{review.client?.full_name || 'Cliente'}</h4>
                                    <div className="flex items-center gap-0.5">
                                        {[1, 2, 3, 4, 5].map(st => (
                                            <Star key={st} size={12} className={st <= review.rating ? "fill-yellow-400 text-yellow-400" : "text-slate-200"} />
                                        ))}
                                    </div>
                                </div>
                                <p className="text-slate-600 text-sm italic mb-3">"{review.comment || 'Sin comentario'}"</p>
                                <div className="flex items-center justify-between text-xs text-slate-400 border-t border-slate-50 pt-2">
                                    <span className="flex items-center gap-1"><MapPinIcon size={12} /> {review.client?.city || 'Ciudad'}</span>
                                    <span className="flex items-center gap-1"><Calendar size={12} /> {new Date(review.created_at).toLocaleDateString()}</span>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
};

// Helper for icon if not imported
const MapPinIcon = ({ size, className }) => <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" /></svg>;

export default TechReviewsModal;
