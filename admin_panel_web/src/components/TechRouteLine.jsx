import React from 'react';
import { MapPin, Navigation, Clock } from 'lucide-react';

const TechRouteLine = ({ tickets }) => {
    // Sort tickets by scheduled_at
    const sortedTickets = [...tickets].sort((a, b) =>
        new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()
    );

    if (sortedTickets.length === 0) return null;

    return (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 mt-6">
            <div className="flex items-center gap-2 mb-4 text-slate-800">
                <Navigation size={18} className="text-blue-600" />
                <h3 className="font-bold">Ruta del Día</h3>
            </div>

            <div className="relative pl-2">
                {/* Vertical Line */}
                <div className="absolute left-[11px] top-2 bottom-4 w-0.5 bg-slate-200"></div>

                <div className="space-y-6">
                    {sortedTickets.map((ticket, index) => {
                        const date = ticket.scheduled_at ? new Date(ticket.scheduled_at) : null;
                        const time = date ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--';
                        const isDone = ['finalizado', 'pagado'].includes(ticket.status);
                        const isCurrent = ticket.status === 'en_camino' || ticket.status === 'en_reparacion';

                        return (
                            <div key={ticket.id} className="relative flex gap-4">
                                {/* Dot */}
                                <div className={`w-6 h-6 rounded-full border-2 z-10 shrink-0 flex items-center justify-center bg-white 
                                    ${isCurrent ? 'border-blue-500 text-blue-500 scale-110' :
                                        isDone ? 'border-green-500 text-green-500' : 'border-red-400 text-red-500'}`}>
                                    <div className={`w-2 h-2 rounded-full ${isCurrent ? 'bg-blue-500 animate-pulse' : isDone ? 'bg-green-500' : 'bg-red-400'}`}></div>
                                </div>

                                {/* Content */}
                                <div className="flex-1 -mt-1">
                                    <div className="flex justify-between items-start">
                                        <span className={`font-mono text-xs font-bold px-1.5 py-0.5 rounded ${isCurrent ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>
                                            {time}
                                        </span>
                                        <span className="text-[10px] text-slate-400 uppercase tracking-widest">{ticket.ticket_number ? `#${ticket.ticket_number}` : ''}</span>
                                    </div>
                                    <p className={`font-medium text-sm mt-1 ${isDone ? 'text-slate-400 line-through' : 'text-slate-800'}`}>
                                        {ticket.client?.full_name || 'Cliente'}
                                    </p>
                                    <p className="text-xs text-slate-500 truncate max-w-[200px]">
                                        {ticket.client?.address || ticket.client?.city || 'Sin dirección'}
                                    </p>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-100 flex justify-center">
                <button className="text-xs font-bold text-blue-600 flex items-center gap-1 hover:underline">
                    <MapPin size={14} />
                    Ver Mapa GPS
                </button>
            </div>
        </div>
    );
};

export default TechRouteLine;
