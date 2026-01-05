import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { X, Clock, AlertCircle, CheckCircle } from 'lucide-react';

const AgendaPicker = ({ techId, techName, date, onTimeSelect, onClose }) => {
    const [loading, setLoading] = useState(true);
    const [busySlots, setBusySlots] = useState([]);

    // Generar horas de 8:00 a 19:00
    const timeSlots = Array.from({ length: 12 }, (_, i) => {
        const hour = i + 8;
        return `${hour.toString().padStart(2, '0')}:00`;
    });

    useEffect(() => {
        if (techId && date) {
            checkAvailability();
        }
    }, [techId, date]);

    const checkAvailability = async () => {
        setLoading(true);
        // Rango del día completo
        const startOfDay = new Date(`${date}T00:00:00`).toISOString();
        const endOfDay = new Date(`${date}T23:59:59`).toISOString();

        const { data, error } = await supabase
            .from('tickets')
            .select('scheduled_at')
            .eq('technician_id', techId)
            .gte('scheduled_at', startOfDay)
            .lte('scheduled_at', endOfDay)
            .not('status', 'in', '("cancelado","rejected")');

        if (data) {
            // Extraer solo la hora "HH:00" de las citas
            const slots = data.map(ticket => {
                const d = new Date(ticket.scheduled_at);
                const h = d.getHours().toString().padStart(2, '0');
                const m = d.getMinutes().toString().padStart(2, '0');
                return `${h}:${m}`;
            });
            setBusySlots(slots);
        }
        setLoading(false);
    };

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="px-5 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                    <div>
                        <h3 className="font-bold text-slate-800 flex items-center gap-2">
                            <Clock size={18} className="text-blue-600" />
                            Agenda: {techName}
                        </h3>
                        <p className="text-xs text-slate-500 capitalize">{new Date(date).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 hover:bg-slate-200 rounded-full transition">
                        <X size={20} />
                    </button>
                </div>

                <div className="p-5">
                    {loading ? (
                        <div className="flex justify-center py-8">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                        </div>
                    ) : (
                        <div className="grid grid-cols-3 gap-3">
                            {timeSlots.map(time => {
                                const isBusy = busySlots.includes(time);
                                return (
                                    <button
                                        key={time}
                                        disabled={isBusy}
                                        onClick={() => {
                                            onTimeSelect(time);
                                            onClose();
                                        }}
                                        className={`
                                            relative py-3 rounded-lg text-sm font-semibold border transition-all
                                            ${isBusy
                                                ? 'bg-red-50 border-red-100 text-red-400 cursor-not-allowed opacity-80'
                                                : 'bg-white border-slate-200 text-slate-700 hover:border-emerald-500 hover:bg-emerald-50 hover:text-emerald-700 shadow-sm hover:shadow-md'
                                            }
                                        `}
                                    >
                                        {time}
                                        {isBusy ? (
                                            <AlertCircle size={14} className="absolute top-1 right-1 text-red-300" />
                                        ) : (
                                            <div className="absolute top-1 right-1 w-2 h-2 rounded-full bg-emerald-400 opacity-0 hover:opacity-100 transition-opacity"></div>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    )}

                    <div className="mt-4 flex justify-center gap-4 text-xs text-slate-500">
                        <div className="flex items-center gap-1">
                            <div className="w-3 h-3 rounded-full bg-white border border-slate-300"></div>
                            <span>Libre</span>
                        </div>
                        <div className="flex items-center gap-1">
                            <div className="w-3 h-3 rounded-full bg-red-50 border border-red-200"></div>
                            <span>Ocupado</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AgendaPicker;
