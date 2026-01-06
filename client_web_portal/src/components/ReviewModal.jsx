import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Star, Check } from 'lucide-react';
import { supabase } from '../lib/supabase';

const BADGES = [
    { id: 'puntual', label: 'Puntual', icon: '⏱️' },
    { id: 'limpio', label: 'Muy Limpio', icon: '✨' },
    { id: 'amable', label: 'Amable', icon: '😊' },
    { id: 'experto', label: 'Experto', icon: '🧠' },
    { id: 'rapido', label: 'Rápido', icon: '⚡' },
];

const ReviewModal = ({ ticketId, technicianId, onClose, onSuccess }) => {
    const [rating, setRating] = useState(0);
    const [hoverRating, setHoverRating] = useState(0);
    const [comment, setComment] = useState('');
    const [selectedBadges, setSelectedBadges] = useState([]);
    const [submitting, setSubmitting] = useState(false);

    const toggleBadge = (badgeId) => {
        if (selectedBadges.includes(badgeId)) {
            setSelectedBadges(prev => prev.filter(id => id !== badgeId));
        } else {
            setSelectedBadges(prev => [...prev, badgeId]);
        }
    };

    const handleSubmit = async () => {
        if (rating === 0) {
            alert('Por favor, selecciona una valoración de 1 a 5 estrellas.');
            return;
        }

        setSubmitting(true);
        try {
            const user = (await supabase.auth.getUser()).data.user;

            const badgesLabels = BADGES.filter(b => selectedBadges.includes(b.id)).map(b => b.label);

            const { error } = await supabase.from('reviews').insert({
                ticket_id: ticketId,
                technician_id: technicianId,
                client_id: user?.id,
                rating,
                comment,
                badges: badgesLabels
            });

            if (error) throw error;

            if (onSuccess) onSuccess();
            onClose();
            alert('¡Gracias por tu valoración!');

        } catch (error) {
            console.error('Error submitting review:', error);
            alert('Error al enviar la reseña: ' + error.message);
        } finally {
            setSubmitting(false);
        }
    };

    return createPortal(
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 animate-in fade-in duration-300">
            <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden border-4 border-blue-500 animate-in zoom-in-95 duration-300">
                <div className="p-6 text-center">
                    <button
                        onClick={onClose}
                        className="absolute right-4 top-4 text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-100 transition-colors"
                    >
                        <X size={24} />
                    </button>

                    <h2 className="text-2xl font-bold text-slate-800 mb-2">¡Servicio Finalizado!</h2>
                    <p className="text-slate-500 mb-6">Ayúdanos a mejorar valorando el trabajo del técnico.</p>

                    {/* Star Rating */}
                    <div className="flex justify-center gap-2 mb-6" onMouseLeave={() => setHoverRating(0)}>
                        {[1, 2, 3, 4, 5].map((star) => (
                            <button
                                key={star}
                                onMouseEnter={() => setHoverRating(star)}
                                onClick={() => setRating(star)}
                                className={`transition-all duration-200 hover:scale-110 focus:outline-none ${star <= (hoverRating || rating)
                                        ? 'text-yellow-400 drop-shadow-sm'
                                        : 'text-slate-200'
                                    }`}
                            >
                                <Star size={40} fill="currentColor" />
                            </button>
                        ))}
                    </div>

                    {/* Badge Selection */}
                    <div className="mb-6">
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">¿Qué destacas?</p>
                        <div className="flex flex-wrap justify-center gap-2">
                            {BADGES.map(badge => (
                                <button
                                    key={badge.id}
                                    onClick={() => toggleBadge(badge.id)}
                                    className={`px-3 py-2 rounded-xl text-sm font-bold flex items-center gap-1.5 transition-all border-2 ${selectedBadges.includes(badge.id)
                                            ? 'bg-blue-100 text-blue-700 border-blue-200 shadow-sm scale-105'
                                            : 'bg-slate-50 text-slate-600 border-slate-100 hover:bg-slate-100'
                                        }`}
                                >
                                    <span>{badge.icon}</span>
                                    {badge.label}
                                    {selectedBadges.includes(badge.id) && <Check size={12} />}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Comment Area */}
                    <textarea
                        className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl p-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-500/10 mb-6 transition-all"
                        placeholder="Escribe un comentario breve..."
                        rows={3}
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                    />

                    <button
                        onClick={handleSubmit}
                        disabled={submitting || rating === 0}
                        className={`w-full py-4 rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-xl active:scale-95 ${rating > 0
                                ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:shadow-blue-500/25'
                                : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                            }`}
                    >
                        {submitting ? 'Enviando...' : `Enviar Valoración ${rating > 0 ? `(${rating}/5)` : ''}`}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};

export default ReviewModal;
