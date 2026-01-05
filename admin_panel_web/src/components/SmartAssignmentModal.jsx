import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Calendar, User, X, Plus, CheckCircle, Clock } from 'lucide-react';

const SmartAssignmentModal = ({ ticket, onClose, onSuccess }) => {
    const [techs, setTechs] = useState([]);
    const [date, setDate] = useState('');
    const [time, setTime] = useState('');
    const [selectedTechForSlot, setSelectedTechForSlot] = useState('');
    const [slots, setSlots] = useState([]); // Array of {date, time, technician_id, technician_name}

    // Tech availability state for the CURRENTLY selected date/time
    const [techWorkloads, setTechWorkloads] = useState({});
    const [dateConflicts, setDateConflicts] = useState({});

    useEffect(() => {
        fetchTechs();
    }, []);

    // Recalculate availability whenever Date or Time changes (for the "Builder" section)
    useEffect(() => {
        if (date && time && techs.length > 0) {
            checkAvailabilityForSlot(date, time);
            setSelectedTechForSlot(''); // Reset selection when time changes
        } else {
            setTechWorkloads({});
            setDateConflicts({});
        }
    }, [date, time, techs]);

    const fetchTechs = async () => {
        const { data } = await supabase.from('profiles').select('*').eq('role', 'tech');
        setTechs(data || []);
    };

    const checkAvailabilityForSlot = async (slotDate, slotTime) => {
        // Fetch tickets for this day
        const { data } = await supabase
            .from('tickets')
            .select('technician_id, scheduled_at')
            .not('technician_id', 'is', null)
            .neq('status', 'finalizado')
            .gte('scheduled_at', `${slotDate}T00:00:00`)
            .lte('scheduled_at', `${slotDate}T23:59:59`);

        const dailyLoad = {};
        const conflicts = {};

        // Initialize
        techs.forEach(t => {
            dailyLoad[t.id] = 0;
            conflicts[t.id] = false;
        });

        data.forEach(t => {
            if (!t.scheduled_at) return;
            // dailyLoad[t.technician_id] = (dailyLoad[t.technician_id] || 0) + 1; // Count all tickets that day?
            // Actually, let's just count them.
            dailyLoad[t.technician_id] = (dailyLoad[t.technician_id] || 0) + 1;

            // Normalize time to HH:MM for comparison
            const dateObj = new Date(t.scheduled_at);
            const hours = dateObj.getHours().toString().padStart(2, '0');
            const minutes = dateObj.getMinutes().toString().padStart(2, '0');
            const tTime = `${hours}:${minutes}`;

            if (tTime === slotTime) {
                conflicts[t.technician_id] = true;
            }
        });

        setTechWorkloads(dailyLoad);
        setDateConflicts(conflicts);
    };

    const addSlot = () => {
        if (!date || !time) return alert("Selecciona fecha y hora.");
        if (!selectedTechForSlot) return alert("Selecciona un técnico para esta hora.");
        if (slots.length >= 3) return alert("Máximo 3 opciones.");

        // Check duplicates
        const isDuplicate = slots.some(s => s.date === date && s.time === time);
        if (isDuplicate) return alert("Ya existe una propuesta para esta hora.");

        const tech = techs.find(t => t.id === selectedTechForSlot);

        setSlots([...slots, {
            date,
            time,
            technician_id: selectedTechForSlot,
            technician_name: tech.full_name
        }]);

        // Clear for next input
        setDate('');
        setTime('');
        setSelectedTechForSlot('');
    };

    const removeSlot = (index) => {
        setSlots(slots.filter((_, i) => i !== index));
    };

    const handleConfirm = async (isDirect = false) => {
        if (slots.length === 0) return alert("Debes añadir al menos una opción.");

        try {
            const primarySlot = slots[0];

            let updatePayload;

            if (isDirect) {
                // Direct Assignment (Admin Override)
                // Set scheduled_at immediately and status confirmed
                const scheduledDate = new Date(`${primarySlot.date}T${primarySlot.time}:00`).toISOString();

                updatePayload = {
                    status: 'asignado',
                    appointment_status: 'confirmed', // Direct confirmation
                    technician_id: primarySlot.technician_id,
                    scheduled_at: scheduledDate,
                    proposed_slots: [] // Clear proposals as it's confirmed
                };
            } else {
                // Proposal Mode (Standard)
                updatePayload = {
                    status: 'asignado',
                    appointment_status: 'pending',
                    technician_id: primarySlot.technician_id, // Default to first option
                    proposed_slots: slots,
                    scheduled_at: null // Clear specific schedule until confirmed
                };
            }

            const { error } = await supabase
                .from('tickets')
                .update(updatePayload)
                .eq('id', ticket.id);

            if (error) throw error;
            onSuccess();
        } catch (error) {
            alert('Error: ' + error.message);
        }
    };

    const sortedTechs = [...techs].sort((a, b) => {
        // Sort by availability for CURRENT slot input
        const conflictA = dateConflicts[a.id] ? 1 : 0;
        const conflictB = dateConflicts[b.id] ? 1 : 0;
        if (conflictA !== conflictB) return conflictA - conflictB;
        return (techWorkloads[a.id] || 0) - (techWorkloads[b.id] || 0);
    });

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[90vh]">
                {/* Header */}
                <div className="p-5 border-b border-slate-100 bg-white flex justify-between items-center">
                    <div>
                        <h3 className="font-bold text-xl text-slate-800">Nueva Propuesta de Cita</h3>
                        <p className="text-sm text-slate-500">Crea hasta 3 opciones para el cliente.</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition">
                        <X size={24} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6">
                    <div className="flex flex-col lg:flex-row gap-8">

                        {/* LEFT: Builder Column */}
                        <div className="flex-1 space-y-6">
                            <div className="bg-blue-50/50 p-5 rounded-xl border border-blue-100 space-y-4">
                                <h4 className="font-bold text-blue-900 flex items-center gap-2">
                                    <div className="bg-blue-600 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs">1</div>
                                    Definir Fecha y Hora
                                </h4>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Fecha</label>
                                        <input
                                            type="date"
                                            className="w-full p-3 border border-slate-200 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 outline-none transition"
                                            value={date}
                                            onChange={(e) => setDate(e.target.value)}
                                            min={new Date().toISOString().split('T')[0]}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Hora</label>
                                        <input
                                            type="time"
                                            className="w-full p-3 border border-slate-200 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 outline-none transition"
                                            value={time}
                                            onChange={(e) => setTime(e.target.value)}
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className={`space-y-3 transition-opacity duration-200 ${(!date || !time) ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
                                <h4 className="font-bold text-slate-700 flex items-center gap-2">
                                    <div className="bg-slate-700 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs">2</div>
                                    Seleccionar Técnico Disponible
                                </h4>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-60 overflow-y-auto pr-2">
                                    {sortedTechs.map(tech => {
                                        const isConflict = dateConflicts[tech.id];
                                        const load = techWorkloads[tech.id] || 0;

                                        return (
                                            <div
                                                key={tech.id}
                                                onClick={() => !isConflict && setSelectedTechForSlot(tech.id)}
                                                className={`
                                                    p-3 rounded-xl border cursor-pointer transition relative overflow-hidden group
                                                    ${selectedTechForSlot === tech.id
                                                        ? 'border-blue-600 bg-blue-50 ring-1 ring-blue-600 shadow-md'
                                                        : isConflict
                                                            ? 'border-slate-100 bg-slate-50 opacity-60 cursor-not-allowed'
                                                            : 'border-slate-200 hover:border-blue-400 hover:shadow-sm bg-white'}
                                                `}
                                            >
                                                <div className="flex justify-between items-start">
                                                    <div>
                                                        <div className="font-bold text-slate-700">{tech.full_name}</div>
                                                        <div className="text-xs mt-1 font-medium text-slate-500">
                                                            {load} servicios hoy
                                                        </div>
                                                    </div>
                                                    {isConflict ? (
                                                        <span className="bg-red-100 text-red-700 text-[10px] font-bold px-2 py-1 rounded-full flex items-center gap-1">
                                                            <X size={10} /> OCUPADO
                                                        </span>
                                                    ) : (
                                                        <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${load === 0 ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'}`}>
                                                            {load === 0 ? 'LIBRE' : 'DISPONIBLE'}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            <button
                                onClick={addSlot}
                                disabled={!date || !time || !selectedTechForSlot || slots.length >= 3}
                                className="w-full py-4 bg-blue-600 text-white rounded-xl font-bold text-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-blue-600/20 active:scale-[0.98] transition flex items-center justify-center gap-2"
                            >
                                <Plus size={24} />
                                Registrar Opción
                            </button>
                        </div>

                        {/* RIGHT: List Column */}
                        <div className="lg:w-80 border-l border-slate-100 lg:pl-8 flex flex-col">
                            <h4 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                                <Calendar size={20} className="text-blue-600" />
                                Opciones Registradas
                                <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full text-xs">{slots.length}/3</span>
                            </h4>

                            <div className="flex-1 space-y-3 overflow-y-auto">
                                {slots.length === 0 ? (
                                    <div className="h-40 border-2 border-dashed border-slate-200 rounded-xl flex flex-col items-center justify-center text-slate-400 p-4 text-center">
                                        <Clock size={32} className="mb-2 opacity-50" />
                                        <p className="text-sm">Añade al menos una opción para continuar.</p>
                                    </div>
                                ) : (
                                    slots.map((slot, idx) => (
                                        <div key={idx} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm hover:shadow-md transition group relative">
                                            <button
                                                onClick={() => removeSlot(idx)}
                                                className="absolute top-2 right-2 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition"
                                            >
                                                <X size={18} />
                                            </button>
                                            <div className="flex items-center gap-3 mb-2">
                                                <div className="bg-blue-100 text-blue-700 font-bold w-6 h-6 rounded-full flex items-center justify-center text-xs">
                                                    {idx + 1}
                                                </div>
                                                <div className="font-bold text-slate-700">
                                                    {new Date(slot.date).toLocaleDateString()}
                                                </div>
                                            </div>
                                            <div className="pl-9 space-y-1">
                                                <div className="text-sm font-medium text-slate-800 flex items-center gap-2">
                                                    <Clock size={14} className="text-slate-400" />
                                                    {slot.time} hrs
                                                </div>
                                                <div className="text-xs text-slate-500 flex items-center gap-2">
                                                    <User size={14} className="text-slate-400" />
                                                    {slot.technician_name}
                                                </div>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="p-5 border-t border-slate-100 bg-slate-50 flex justify-end gap-3 z-10">
                    <button onClick={onClose} className="px-6 py-2.5 text-slate-600 hover:bg-slate-100 rounded-xl font-medium transition">
                        Cancelar
                    </button>
                    <button
                        onClick={() => handleConfirm(false)}
                        disabled={slots.length === 0}
                        className="px-6 py-2.5 bg-green-600 text-white rounded-xl font-bold hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-green-600/20 active:scale-[0.98] transition flex items-center gap-2"
                    >
                        <CheckCircle size={20} />
                        Confirmar y Enviar ({slots.length})
                    </button>
                    {slots.length === 1 && (
                        <button
                            onClick={() => handleConfirm(true)}
                            className="px-8 py-2.5 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 shadow-lg shadow-blue-600/20 active:scale-[0.98] transition flex items-center gap-2"
                        >
                            <CheckCircle size={20} />
                            Fijar Cita (Directo)
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default SmartAssignmentModal;
