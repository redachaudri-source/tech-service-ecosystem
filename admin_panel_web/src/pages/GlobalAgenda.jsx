import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Calendar, ChevronLeft, ChevronRight, User, Clock, MapPin } from 'lucide-react';

const GlobalAgenda = () => {
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [techs, setTechs] = useState([]);
    const [appointments, setAppointments] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchAgendaData();
    }, [selectedDate]);

    const fetchAgendaData = async () => {
        setLoading(true);
        try {
            const dateStr = selectedDate.toISOString().split('T')[0];

            // 1. Fetch Techs
            const { data: techData } = await supabase
                .from('profiles')
                .select('*')
                .eq('role', 'tech')
                .order('full_name');
            setTechs(techData || []);

            // 2. Fetch Appointments for Date
            const { data: apptData } = await supabase
                .from('tickets')
                .select(`*, client:profiles!client_id(full_name, address)`)
                .gte('scheduled_at', `${dateStr}T00:00:00`)
                .lte('scheduled_at', `${dateStr}T23:59:59`)
                .not('technician_id', 'is', null) // Only assigned
                .neq('status', 'finalizado'); // Show active

            setAppointments(apptData || []);

        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const changeDate = (days) => {
        const newDate = new Date(selectedDate);
        newDate.setDate(selectedDate.getDate() + days);
        setSelectedDate(newDate);
    };

    // Helper to position items on a timeline (8am to 8pm)
    const getPosition = (dateStr) => {
        const date = new Date(dateStr);
        const startHour = 8; // 8 AM
        const pixelsPerHour = 100; // Height of hour block
        const hour = date.getHours();
        const minutes = date.getMinutes();

        if (hour < startHour) return 0;
        return ((hour - startHour) + (minutes / 60)) * pixelsPerHour;
    };

    const hours = Array.from({ length: 13 }, (_, i) => i + 8); // 8 to 20

    if (loading) return <div className="p-8 text-center text-slate-500">Cargando agenda...</div>;

    return (
        <div className="h-[calc(100vh-100px)] flex flex-col">
            {/* Header / Controls */}
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                    <Calendar className="text-blue-600" />
                    Agenda Global
                </h1>

                <div className="flex items-center gap-4 bg-white p-2 rounded-lg border border-slate-200 shadow-sm">
                    <button onClick={() => changeDate(-1)} className="p-2 hover:bg-slate-100 rounded-full"><ChevronLeft /></button>
                    <div className="font-bold text-lg w-48 text-center">
                        {selectedDate.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}
                    </div>
                    <button onClick={() => changeDate(1)} className="p-2 hover:bg-slate-100 rounded-full"><ChevronRight /></button>
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
                                        return (
                                            <div
                                                key={appt.id}
                                                className={`absolute left-1 right-1 p-2 rounded-lg border text-xs shadow-sm hover:shadow-md transition cursor-pointer
                                                    ${getStatusColor(appt.appointment_status)}
                                                `}
                                                style={{ top: `${top}px`, height: '90px' }} // Fixed height or calculated duration
                                                title={`${appt.client?.full_name} - ${appt.description_failure}`}
                                            >
                                                <div className="font-bold truncate">{appt.scheduled_at.split('T')[1].slice(0, 5)}</div>
                                                <div className="truncate font-medium">{appt.client?.full_name}</div>
                                                <div className="truncate text-[10px] opacity-75">{appt.appliance_info?.type}</div>

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
