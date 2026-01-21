import React from 'react';
import { MapPin, Phone, Clock, ChevronRight, ShieldAlert, FileText } from 'lucide-react';
import { calculateDistance, formatDistance, estimateTravelTime } from '../utils/geoUtils';

const ServiceCard = ({ ticket, userLocation, onClick, isNextHeader }) => {

    // Formatting Helpers
    const timeStr = ticket.scheduled_at
        ? new Date(ticket.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : '--:--';

    // Status Badge Logic
    const getStatusLabel = (status) => {
        const map = {
            'solicitado': 'PENDIENTE',
            'asignado': 'ASIGNADO',
            'en_camino': 'EN CAMINO',
            'en_diagnostico': 'DIAGNÓSTICO',
            'finalizado': 'FINALIZADO'
        };
        return map[status] || status.toUpperCase();
    };

    return (
        <div
            onClick={() => onClick && onClick(ticket)}
            className={`bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden mb-4 active:scale-[0.98] transition-all relative ${isNextHeader ? 'border-blue-500 ring-2 ring-blue-100' : ''}`}
        >
            {/* BLUE HEADER (Only if isNextHeader prop is true) */}
            {isNextHeader && (
                <div className="bg-blue-600 text-white text-[10px] font-bold text-center py-1.5 uppercase tracking-widest">
                    SIGUIENTE PARADA
                </div>
            )}

            <div className="p-4">
                {/* HEADLINE: Badge + Time */}
                <div className="flex justify-between items-start mb-2">
                    <span className="bg-slate-100 text-slate-500 px-2 py-0.5 rounded text-[10px] font-black tracking-wider uppercase">
                        {getStatusLabel(ticket.status)}
                    </span>
                    <span className="font-mono text-xl font-black text-slate-800 leading-none">
                        {timeStr}
                    </span>
                </div>

                {/* MAIN CONTENT: Name + Address */}
                <div className="mb-4">
                    <h3 className="text-lg font-bold text-slate-900 leading-tight mb-1">
                        {ticket.client?.full_name || 'Cliente Desconocido'}
                    </h3>
                    <div className="flex items-start gap-2 text-slate-500 text-sm">
                        <MapPin size={16} className="mt-0.5 shrink-0 text-blue-400" />
                        <span className="line-clamp-2 font-medium">
                            {ticket.client?.address || 'Dirección no disponible'}
                            {ticket.client?.city ? `, ${ticket.client.city}` : ''}
                        </span>
                    </div>
                </div>

                {/* ISSUE BOX (Gray Box) */}
                <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 relative">
                    <div className="flex justify-between items-center mb-1">
                        <span className="text-[10px] font-bold text-slate-400 uppercase">Avería Reportada</span>
                        {/* Ticket Tag */}
                        <span className={`text-[10px] font-bold px-1.5 rounded flex items-center gap-1 ${ticket.is_warranty ? 'text-purple-600 bg-purple-100' : 'text-yellow-600 bg-yellow-100'}`}>
                            #{ticket.ticket_number}
                        </span>
                    </div>

                    <p className="text-sm font-medium text-slate-700 line-clamp-2 italic">
                        {ticket.description || ticket.description_failure || 'Sin descripción del problema.'}
                    </p>

                    <div className="mt-2 text-xs font-bold text-slate-500 border-t border-slate-100 pt-2 flex items-center justify-between">
                        <span>{ticket.appliance_info?.type || 'Electrodoméstico'}</span>
                        {/* Optional: Distance if avail */}
                        {/* userLocation logic if needed */}
                    </div>
                </div>
            </div>

            {/* FOOTER ACTIONS */}
            <div className="bg-slate-50 p-3 flex justify-between items-center border-t border-slate-100">
                <button className="text-xs font-bold text-blue-600 flex items-center gap-1 hover:underline">
                    VER DETALLES <ChevronRight size={14} />
                </button>
                <a href={`tel:${ticket.client?.phone}`} onClick={(e) => e.stopPropagation()} className="p-2 bg-white border border-slate-200 rounded-full text-slate-400 hover:text-blue-600 hover:border-blue-200 transition shadow-sm">
                    <Phone size={18} />
                </a>
            </div>
        </div>
    );
};

export default ServiceCard;
