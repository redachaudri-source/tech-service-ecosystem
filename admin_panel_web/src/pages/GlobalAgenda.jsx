import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Calendar, ChevronLeft, ChevronRight, User, Clock, MapPin } from 'lucide-react';

const GlobalAgenda = () => {
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [techs, setTechs] = useState([]);
    const [appointments, setAppointments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showRouteMode, setShowRouteMode] = useState(false);

    // Helper to generate consistent colors from CP strings
    const getCpColor = (cp) => {
        if (!cp) return 'bg-slate-100 border-slate-200 text-slate-500';
        // A simple hash to pick a color
        const colors = [
            'bg-red-100 border-red-300 text-red-800',
            'bg-orange-100 border-orange-300 text-orange-800',
            'bg-amber-100 border-amber-300 text-amber-800',
            'bg-green-100 border-green-300 text-green-800',
            'bg-emerald-100 border-emerald-300 text-emerald-800',
            'bg-teal-100 border-teal-300 text-teal-800',
            'bg-cyan-100 border-cyan-300 text-cyan-800',
            'bg-sky-100 border-sky-300 text-sky-800',
            'bg-blue-100 border-blue-300 text-blue-800',
            'bg-indigo-100 border-indigo-300 text-indigo-800',
            'bg-violet-100 border-violet-300 text-violet-800',
            'bg-purple-100 border-purple-300 text-purple-800',
            'bg-fuchsia-100 border-fuchsia-300 text-fuchsia-800',
            'bg-pink-100 border-pink-300 text-pink-800',
            'bg-rose-100 border-rose-300 text-rose-800'
        ];

        let hash = 0;
        for (let i = 0; i < cp.length; i++) {
            hash = cp.charCodeAt(i) + ((hash << 5) - hash);
        }

        return colors[Math.abs(hash) % colors.length];
    };

    // Helper for CP Extraction
    const getCpFromAppointment = (appt) => {
        // Ideally we have appt.client.postal_code, or parse address
        if (appt.client?.address) {
            const match = appt.client.address.match(/\b\d{5}\b/);
            return match ? match[0] : null;
        }
        return null;
    };


    return (
        <div className="h-[calc(100vh-100px)] flex flex-col">
            {/* Header / Controls */}
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                    <Calendar className="text-blue-600" />
                    Agenda Global
                </h1>

                <div className="flex items-center gap-4">
                    {/* Route Mode Toggle */}
                    <button
                        onClick={() => setShowRouteMode(!showRouteMode)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-sm transition border ${showRouteMode
                            ? 'bg-indigo-600 text-white border-indigo-700 shadow-md ring-2 ring-indigo-200'
                            : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                            }`}
                    >
                        <MapPin size={16} />
                        {showRouteMode ? 'Modo Rutas (Visualizando CPs)' : 'Ver Rutas'}
                    </button>

                    <div className="flex items-center gap-4 bg-white p-2 rounded-lg border border-slate-200 shadow-sm">
                        <button onClick={() => changeDate(-1)} className="p-2 hover:bg-slate-100 rounded-full"><ChevronLeft /></button>
                        <div className="font-bold text-lg w-48 text-center">
                            {selectedDate.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}
                        </div>
                        <button onClick={() => changeDate(1)} className="p-2 hover:bg-slate-100 rounded-full"><ChevronRight /></button>
                    </div>
                </div>
            </div>

            {/* Calendar Grid */}
            <div className="flex-1 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">

                {/* Header Row (Techs) */}
                <div className="flex border-b border-slate-200 bg-slate-50">
                    <div className="w-20 border-r border-slate-200 shrink-0"></div> {/* Time Col */}
                    {techs.map(tech => (
                        <div key={tech.id} className="flex-1 py-3 text-center border-r border-slate-200 last:border-0 font-semibold text-slate-700 truncate px-2">
                            {tech.full_name.split(' ')[0]} {/* First Name */}
                            <div className="text-xs text-slate-400 font-normal">{techAppointmentsCount(tech.id, appointments)} citas</div>
                        </div>
                    ))}
                </div>

                {/* Body (Timeline) */}
                <div className="flex-1 overflow-y-auto relative">
                    <div className="flex min-h-[1300px]"> {/* 13 hours * 100px */}

                        {/* Time Grid Lines Background */}
                        <div className="absolute inset-0 flex flex-col pointer-events-none w-full">
                            {hours.map(hour => (
                                <div key={hour} className="h-[100px] border-b border-slate-100 w-full flex items-start">
                                    {/* Line across */}
                                </div>
                            ))}
                        </div>

                        {/* Times Column */}
                        <div className="w-20 border-r border-slate-200 shrink-0 bg-white z-10">
                            {hours.map(hour => (
                                <div key={hour} className="h-[100px] text-xs text-slate-400 text-right pr-2 pt-2">
                                    {hour}:00
                                </div>
                            ))}
                        </div>

                        {/* Tech Columns */}
                        {techs.map(tech => (
                            <div key={tech.id} className="flex-1 border-r border-slate-100 relative group min-w-[150px]">
                                {appointments
                                    .filter(appt => appt.technician_id === tech.id)
                                    .map(appt => {
                                        const top = getPosition(appt.scheduled_at);
                                        const cp = getCpFromAppointment(appt);
                                        // Dynamic Style based on mode
                                        const styleClass = showRouteMode
                                            ? getCpColor(cp)
                                            : getStatusColor(appt.appointment_status);

                                        return (
                                            <div
                                                key={appt.id}
                                                className={`absolute left-1 right-1 p-2 rounded-lg border text-xs shadow-sm hover:shadow-md transition cursor-pointer overflow-hidden
                                                    ${styleClass}
                                                `}
                                                style={{ top: `${top}px`, height: '85px' }} // Slightly shorter to avoid exact overlap visual
                                                title={`${appt.client?.full_name} - ${appt.description_failure}`}
                                            >
                                                <div className="font-bold truncate">{appt.scheduled_at.split('T')[1].slice(0, 5)}</div>

                                                {showRouteMode && cp && (
                                                    <div className="text-[10px] uppercase font-black opacity-80 mb-0.5">
                                                        📍 CP: {cp}
                                                    </div>
                                                )}

                                                <div className="truncate font-medium">{appt.client?.full_name}</div>
                                                {!showRouteMode && (
                                                    <div className="truncate text-[10px] opacity-75">{appt.appliance_info?.type}</div>
                                                )}

                                                {/* Status Indicator */}
                                                <div className="absolute bottom-1 right-1">
                                                    {getParamStatusIcon(appt.appointment_status)}
                                                </div>
                                            </div>
                                        )
                                    })
                                }
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

// Helpers
const techAppointmentsCount = (techId, appointments) => appointments.filter(a => a.technician_id === techId).length;

const getStatusColor = (status) => {
    switch (status) {
        case 'confirmed': return 'bg-green-100 border-green-200 text-green-800';
        case 'rejected': return 'bg-red-100 border-red-200 text-red-800';
        case 'pending': return 'bg-amber-100 border-amber-200 text-amber-800'; // Waiting for client
        default: return 'bg-blue-100 border-blue-200 text-blue-800';
    }
};

const getParamStatusIcon = (status) => {
    // Return simple dots or icons
    if (status === 'confirmed') return '✅';
    if (status === 'rejected') return '❌';
    if (status === 'pending') return '⏳';
    return '';
};

export default GlobalAgenda;
