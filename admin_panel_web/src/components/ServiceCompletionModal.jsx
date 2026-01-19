import React from 'react';
import { CheckCircle, Home, FileText } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const ServiceCompletionModal = ({ isOpen, onClose, ticketNumber, type = 'standard' }) => {
    const navigate = useNavigate();

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/80 z-[100] backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in duration-300">
            <div className="bg-white rounded-3xl w-full max-w-sm shadow-2xl p-8 text-center animate-in zoom-in-95 duration-300">

                <div className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner">
                    <CheckCircle size={48} className="text-green-600 drop-shadow-sm" />
                </div>

                <h2 className="text-2xl font-black text-slate-800 mb-2">¡Servicio Completado!</h2>
                <p className="text-slate-500 mb-8 font-medium">
                    El ticket <span className="text-slate-800 font-bold">#{ticketNumber}</span> ha sido {type === 'warranty' ? 'cerrado con garantía' : 'finalizado'} correctamente.
                </p>

                <div className="space-y-3">
                    <button
                        onClick={() => { onClose(); navigate('/tech/dashboard'); }}
                        className="w-full py-4 bg-slate-900 text-white rounded-xl font-bold shadow-xl shadow-slate-200 hover:bg-slate-800 transition-all active:scale-95 flex items-center justify-center gap-2"
                    >
                        <Home size={20} />
                        Volver al Inicio
                    </button>

                    {/* Optional: Add View PDF button later? */}
                </div>
            </div>
        </div>
    );
};

export default ServiceCompletionModal;
