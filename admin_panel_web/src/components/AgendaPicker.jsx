import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { X, Clock, AlertCircle, CheckCircle } from 'lucide-react';

const AgendaPicker = ({ techId, techName, date, duration, onTimeSelect, onClose }) => {
    const [loading, setLoading] = useState(true);
    const [busySlots, setBusySlots] = useState([]);

    // Generate 30-minute slots from 8:00 to 19:00
    const timeSlots = [];
    for (let h = 8; h < 19; h++) {
        timeSlots.push(`${h.toString().padStart(2, '0')}:00`);
        timeSlots.push(`${h.toString().padStart(2, '0')}:30`);
    }

    useEffect(() => {
        if (techId && date) {
            checkAvailability();
        }
    }, [techId, date]);

    const checkAvailability = async () => {
        setLoading(true);

        // Ensure accurate full day range in Local Time -> UTC
        // When user picks "2026-06-01", we want 00:00 to 23:59 of that LOCAL day.
        const searchDate = new Date(date);
        const startOfDay = new Date(searchDate.setHours(0, 0, 0, 0)).toISOString();
        const endOfDay = new Date(searchDate.setHours(23, 59, 59, 999)).toISOString();

        const { data } = await supabase
            .from('tickets')
            .select('*')
            .eq('technician_id', techId)
            .gte('scheduled_at', startOfDay)
            .lte('scheduled_at', endOfDay)
            .neq('status', 'cancelado')
            .neq('status', 'rejected');

        const blocked = new Set();

        if (data) {
            data.forEach(ticket => {
                const ticketStart = new Date(ticket.scheduled_at);
                const dur = ticket.estimated_duration || 60; // Default 1h if null

                // Block Duration + 30m Buffer
                // If ticket is 11:00 (2h), it blocks 11:00-13:00. Plus 30m buffer = 11:00-13:30.
                // So slots blocked: 11:00, 11:30, 12:00, 12:30, 13:00.
                // 13:30 is FREE.

                // Calculate slots to block
                const buffer = 30; // 30 min buffer
                const totalBlockMinutes = dur + buffer;

                // We iterate in 30m chunks
                for (let i = 0; i < totalBlockMinutes; i += 30) {
                    // Create a new date object for each slot to avoid mutation issues
                    const slotTime = new Date(ticketStart.getTime() + i * 60000);
                    const h = slotTime.getHours().toString().padStart(2, '0');
                    const m = slotTime.getMinutes().toString().padStart(2, '0');
                    blocked.add(`${h}:${m}`);
                }
            });
        }

        // Also block future slots if "New Service" fits? 
        // OPTIONAL: If I select 11:00 for a 4h job, I should checking if I overlap others.
        // For now, let's just show RED what is already taken.
        // Conflict validation in Modal handles the "Am I stepping on someone?" check.

        setBusySlots(Array.from(blocked));
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
