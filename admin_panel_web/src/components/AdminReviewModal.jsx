import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { X, Star, User, Calendar, MessageSquare } from 'lucide-react';

const AdminReviewModal = ({ technician, onClose }) => {
    const [reviews, setReviews] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchReviews = async () => {
            if (!technician) return;

            const { data, error } = await supabase
                .from('reviews')
                .select(`
                    *,
                    tickets ( ticket_number, appliance_info )
                `)
                .eq('technician_id', technician.id)
                .order('created_at', { ascending: false });

            if (data) setReviews(data);
            setLoading(false);
        };

        fetchReviews();
    }, [technician]);

    if (!technician) return null;

    return (
        <div className="fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 shrink-0">
                    <div>
                        <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                            <Star size={20} className="text-yellow-500" fill="currentColor" />
                            Reseñas de {technician.full_name}
                        </h2>
                        <p className="text-xs text-slate-500">
                            Puntuación media: <b>{technician.avg_rating || 0}</b> ({technician.total_reviews || 0} valoraciones)
                        </p>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
                        <X size={20} />
                    </button>
                </div>

                <div className="p-6 overflow-y-auto space-y-4 bg-slate-50/50 flex-1">
                    {loading ? (
                        <div className="text-center py-10">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                        </div>
                    ) : reviews.length === 0 ? (
                        <div className="text-center py-12 text-slate-400 bg-white rounded-xl border border-dashed border-slate-200">
                            <MessageSquare size={32} className="mx-auto mb-2 opacity-50" />
                            <p>Este técnico aún no tiene reseñas.</p>
                        </div>
                    ) : (
                        reviews.map(review => (
                            <div key={review.id} className="bg-white rounded-xl p-4 shadow-sm border border-slate-100 hover:shadow-md transition">
                                <div className="flex justify-between items-start mb-2">
                                    <div className="flex items-center gap-1">
                                        {[1, 2, 3, 4, 5].map(star => (
                                            <Star
                                                key={star}
                                                size={16}
                                                className={star <= review.rating ? "text-yellow-400" : "text-slate-200"}
                                                fill={star <= review.rating ? "currentColor" : "none"}
                                            />
                                        ))}
                                        <span className="font-bold text-slate-800 ml-2">{review.rating}.0</span>
                                    </div>
                                    <span className="text-xs text-slate-400 flex items-center gap-1">
                                        <Calendar size={12} />
                                        {new Date(review.created_at).toLocaleDateString()}
                                    </span>
                                </div>

                                {review.comment && (
                                    <p className="text-slate-700 text-sm italic mb-3">"{review.comment}"</p>
                                )}

                                <div className="flex flex-wrap gap-2 mb-3">
                                    {review.badges && review.badges.map((badge, idx) => (
                                        <span key={idx} className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded text-[10px] font-bold border border-blue-100">
                                            {badge}
                                        </span>
                                    ))}
                                </div>

                                <div className="flex items-center gap-2 pt-3 border-t border-slate-50 mt-2">
                                    <div className="text-xs text-slate-500 bg-slate-100 px-2 py-1 rounded">
                                        Ticket #{review.tickets?.ticket_number}
                                    </div>
                                    <span className="text-xs text-slate-400">
                                        {review.tickets?.appliance_info?.type} - {review.tickets?.appliance_info?.brand}
                                    </span>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
};

export default AdminReviewModal;
