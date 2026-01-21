import React, { useState, useEffect } from 'react';
import { MapPin, Navigation, Clock, Phone, ChevronRight, Truck } from 'lucide-react';
import { calculateDistance, formatDistance, estimateTravelTime } from '../utils/geoUtils';

const ServiceCard = ({ ticket, userLocation, onStatusChange, onClick }) => {

    // Calculate distance if user location is available
    const distanceKm = (userLocation && ticket.profiles?.latitude && ticket.profiles?.longitude)
        ? calculateDistance(
            userLocation.latitude,
            userLocation.longitude,
            ticket.profiles.latitude,
            ticket.profiles.longitude
        )
        : null;

    const travelTime = distanceKm ? estimateTravelTime(distanceKm) : null;

    const handleStartTrip = (e) => {
        e.stopPropagation();
        if (onStatusChange) {
            onStatusChange(ticket.id, 'en_camino');
        }
    };

    return (
        <div
            onClick={() => onClick && onClick(ticket)}
            className="bg-white rounded-xl p-4 shadow-sm border border-slate-100 active:scale-[0.98] transition-all mb-4"
        >
            {/* Header: ID + Time */}
            <div className="flex justify-between items-start mb-3">
                <div>
                    <span className="text-xs font-bold text-slate-400">#{ticket.ticket_number}</span>
                    <h3 className="font-bold text-slate-800 text-lg leading-tight">
                        {ticket.appliance_info?.type} {ticket.appliance_info?.brand}
                    </h3>
                </div>
                {ticket.scheduled_at && (
                    <div className="text-right">
                        <div className="flex items-center gap-1 text-slate-500 text-xs bg-slate-50 px-2 py-1 rounded">
                            <Clock size={12} />
                            {new Date(ticket.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                    </div>
                )}
            </div>

            {/* Address & Distance */}
            <div className="flex items-start gap-2 mb-4">
                <MapPin size={16} className="text-blue-500 mt-0.5 shrink-0" />
                <div>
                    <p className="text-sm text-slate-600 font-medium line-clamp-2">
                        {ticket.profiles?.address || 'Dirección no disponible'}
                    </p>
                    {distanceKm && (
                        <p className="text-xs text-slate-400 mt-0.5">
                            A {formatDistance(distanceKm)} • ~{travelTime} min
                        </p>
                    )}
                </div>
            </div>

            {/* ACTION AREA - TRAVEL LOGIC */}
            <div className="mt-2 pt-3 border-t border-slate-50">
                {ticket.status === 'asignado' && (
                    <button
                        onClick={handleStartTrip}
                        className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-blue-200 hover:bg-blue-700 transition"
                    >
                        <Navigation size={18} />
                        INICIAR VIAJE
                    </button>
                )}

                {ticket.status === 'en_camino' && (
                    <div className="w-full">
                        <div className="flex justify-between text-xs font-bold text-blue-800 mb-1">
                            <span className="flex items-center gap-1"><Truck size={14} /> En Camino</span>
                            <span className="animate-pulse">Llegando...</span>
                        </div>
                        <div className="h-2 bg-blue-100 rounded-full overflow-hidden relative">
                            <div className="absolute top-0 left-0 h-full bg-blue-600 w-2/3 rounded-full animate-[shimmer_1.5s_infinite_linear] bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.5),transparent)]"></div>
                            <div className="h-full bg-blue-600 w-2/3 rounded-full"></div>
                        </div>
                        <p className="text-[10px] text-center text-blue-400 mt-1 font-medium">
                            Notificando al cliente de tu llegada
                        </p>
                    </div>
                )}

                {/* Other statuses can be handled generically or ignored as per prompt focus */}
                {ticket.status !== 'asignado' && ticket.status !== 'en_camino' && (
                    <div className="flex items-center justify-center text-xs font-bold text-slate-400 uppercase tracking-widest py-2">
                        {ticket.status.replace('_', ' ')}
                    </div>
                )}
            </div>
        </div>
    );
};

export default ServiceCard;
