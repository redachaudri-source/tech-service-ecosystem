
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Calendar, User, X, Plus, CheckCircle, Clock, MapPin, AlertTriangle, ShieldCheck } from 'lucide-react';

const SmartAssignmentModal = ({ ticket, onClose, onSuccess }) => {
    // Phase 14: Smart Scheduling "God Mode"
    const [serviceTypes, setServiceTypes] = useState([]);
    const [selectedServiceType, setSelectedServiceType] = useState(null);
    const [duration, setDuration] = useState(60); // Default 60 min

    const [selectedDate, setSelectedDate] = useState('');
    const [smartSlots, setSmartSlots] = useState([]); // Results from DB RPC
    const [loadingSlots, setLoadingSlots] = useState(false);
    const [businessConfig, setBusinessConfig] = useState(null); // 🕒 Business Hours

    // Manual Override Filter
    const [selectedTechFilter, setSelectedTechFilter] = useState('');

    // Selected Proposal (Just one for now to keep flow simple, or array if multiple)
    // We will stick to the "Builder" logic but powered by AI slots.
    const [proposals, setProposals] = useState([]);

    // Techs cache for name lookup if needed, though RPC returns names
    const [techs, setTechs] = useState([]);

    useEffect(() => {
        fetchInitialData();
    }, []);

    const fetchInitialData = async () => {
        // 0. Fetch Business Config (For Smart Filtering)
        const { data: bConfig } = await supabase
            .from('business_config')
            .select('*')
            .eq('key', 'working_hours')
            .single();
        if (bConfig) setBusinessConfig(bConfig);

        // 1. Fetch Service Types
        const { data: types } = await supabase.from('service_types').select('*').eq('is_active', true);
        if (types) {
            setServiceTypes(types);

            // 1. Try exact ID match first (God Mode Sync)
            if (ticket.service_type_id) {
                const exact = types.find(t => t.id === ticket.service_type_id);
                if (exact) {
                    setSelectedServiceType(exact);
                    setDuration(exact.estimated_duration_min);
                }
            }
            // 2. Fallback to name match
            else if (ticket.appliance_info?.type) {
                const match = types.find(t => t.name.toLowerCase().includes(ticket.appliance_info.type.toLowerCase()));
                if (match) {
                    setSelectedServiceType(match);
                    setDuration(match.estimated_duration_min);
                } else if (types.length > 0) {
                    setSelectedServiceType(types[0]);
                    setDuration(types[0].estimated_duration_min);
                }
            }
        }

        // 2. Fetch Techs (Active & Not Deleted)
        const { data: techData } = await supabase
            .from('profiles')
            .select('*')
            .eq('role', 'tech')
            .is('deleted_at', null)
            .eq('is_active', true);

        setTechs(techData || []);

        // 3. Pre-fill date if ticket has one?
        if (ticket.scheduled_at) {
            setSelectedDate(ticket.scheduled_at.split('T')[0]);
        }
    };

    // When Date or Duration changes -> Fetch Smart Slots from DB
    useEffect(() => {
        if (selectedDate && duration) {
            fetchSmartSlots();
        }
    }, [selectedDate, duration, selectedServiceType, businessConfig]); // Add businessConfig dep

    const fetchSmartSlots = async () => {
        setLoadingSlots(true);
        try {
            // Call the GOD MODE RPC
            // get_tech_availability(target_date, duration_minutes, target_cp)

            // Logic to extract CP:
            let targetCp = null;
            if (ticket.profiles?.postal_code) {
                targetCp = ticket.profiles.postal_code;
            } else if (ticket.profiles?.address) {
                // Try Regex for 5 digits (Spain CP)
                const match = ticket.profiles.address.match(/\b\d{5}\b/);
                if (match) targetCp = match[0];
            }

            const { data, error } = await supabase.rpc('get_tech_availability', {
                target_date: selectedDate,
                duration_minutes: duration,
                target_cp: targetCp
            });

            if (error) throw error;

            // Transform data for UI
            // Data shape: [{ technician_id, technician_name, slot_start, is_optimal_cp, efficiency_score }, ...]

            // 🛑 GOD MODE FILTER: Apply Per-Day Business Hours
            let filteredData = data || [];

            // 🕐 FIX: Filter out PAST slots for today's date
            const now = new Date();
            const todayStr = now.toISOString().split('T')[0];
            const isToday = selectedDate === todayStr;

            if (isToday) {
                const marginMinutes = 30; // Safety margin - don't show slots starting in less than 30 min
                const cutoffTime = new Date(now.getTime() + marginMinutes * 60000);

                const beforeCount = filteredData.length;
                filteredData = filteredData.filter(slot => {
                    const slotTime = new Date(slot.slot_start);
                    return slotTime > cutoffTime;
                });
                console.log(`[SmartAssistant] Filtered past slots for TODAY. Removed ${beforeCount - filteredData.length} past slots. Remaining: ${filteredData.length}`);
            }

            if (businessConfig && businessConfig.value) {
                // Determine Day Name
                const dateObj = new Date(selectedDate);
                const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
                const dayConfig = businessConfig.value[dayName]; // Access JSON directly

                if (!dayConfig) {
                    // If day is NULL/Undefined in config -> It's CLOSED (e.g. Saturday)
                    // We should filter OUT all slots.
                    filteredData = [];
                    console.log(`[SmartAssistant] Blocked all slots for ${dayName} (Closed Day)`);
                } else if (dayConfig.end) {
                    // Check Closing Time
                    // "15:00" -> 15
                    const closeHour = parseInt(dayConfig.end.split(':')[0]);

                    if (!isNaN(closeHour)) {
                        filteredData = filteredData.filter(slot => {
                            // Check if Slot End (Start + Duration) > Close Hour
                            const slotStart = new Date(slot.slot_start);
                            const slotEnd = new Date(slotStart.getTime() + duration * 60000);

                            // We only care if the END hour exceeds the limit
                            // Example: 14:00 (60min) -> Ends 15:00. Allowed? 
                            // If limit is 15:00. 15:00 <= 15:00 is OK.
                            // 14:30 (60min) -> Ends 15:30. 15.5 > 15. Blocked.

                            const endHourDecimal = slotEnd.getHours() + (slotEnd.getMinutes() / 60);
                            return endHourDecimal <= closeHour;
                        });
                        console.log(`[SmartAssistant] Filtered slots for ${dayName} (Close: ${closeHour}:00). Remaining: ${filteredData.length}`);
                    }
                }
            }

            // 🛡️ REGLA BASE: Margen mínimo entre servicios consecutivos
            // Un técnico NO puede tener un servicio que empiece antes de MARGEN_MINIMO después del anterior
            const MARGEN_MINIMO_MINUTOS = 30;

            if (filteredData.length > 0) {
                // Get all tech IDs from current slots
                const techIds = [...new Set(filteredData.map(s => s.technician_id))];

                console.log(`[SmartAssistant] 🔍 DEBUG: Fetching services for date=${selectedDate}, techIds=${techIds.length}`);

                // Fetch existing services for these techs on this day
                // Note: We filter status client-side to avoid complex query syntax issues
                const { data: existingServices, error: svcError } = await supabase
                    .from('tickets')
                    .select('id, technician_id, scheduled_at, estimated_duration, status')
                    .in('technician_id', techIds)
                    .gte('scheduled_at', `${selectedDate}T00:00:00`)
                    .lt('scheduled_at', `${selectedDate}T23:59:59`)
                    .order('scheduled_at', { ascending: true });

                if (svcError) {
                    console.error('[SmartAssistant] ❌ Error fetching existing services:', svcError?.message || svcError, svcError?.details, svcError?.hint);
                } else {
                    // Filter out cancelled/finished services client-side
                    const excludedStatuses = ['cancelado', 'rejected', 'finalizado', 'anulado'];
                    const activeServices = (existingServices || []).filter(svc =>
                        !excludedStatuses.includes((svc.status || '').toLowerCase())
                    );

                    console.log(`[SmartAssistant] 🛡️ Found ${existingServices?.length || 0} total, ${activeServices.length} active services for ${techIds.length} techs`);

                    // Debug: Show all active services
                    activeServices.forEach(svc => {
                        const svcStart = new Date(svc.scheduled_at);
                        const svcDuration = svc.estimated_duration || 60;
                        const svcEnd = new Date(svcStart.getTime() + svcDuration * 60000);
                        console.log(`[SmartAssistant] 🔍 Servicio existente: Tech ${svc.technician_id.substring(0, 8)}... | ${svcStart.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })} - ${svcEnd.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })} (${svcDuration}min) [${svc.status}]`);
                    });

                    // Group services by tech
                    const servicesByTech = {};
                    activeServices.forEach(svc => {
                        if (!servicesByTech[svc.technician_id]) {
                            servicesByTech[svc.technician_id] = [];
                        }
                        servicesByTech[svc.technician_id].push(svc);
                    });

                    // Filter slots based on minimum gap rule
                    const beforeGapFilter = filteredData.length;

                    filteredData = filteredData.filter(slot => {
                        const techServices = servicesByTech[slot.technician_id] || [];
                        const slotStart = new Date(slot.slot_start);
                        const slotEnd = new Date(slotStart.getTime() + duration * 60000);

                        // Check against ALL services of this tech
                        for (const svc of techServices) {
                            const svcStart = new Date(svc.scheduled_at);
                            const svcDuration = svc.estimated_duration || 60;
                            const svcEnd = new Date(svcStart.getTime() + svcDuration * 60000);

                            // Calculate minimum available time after this service
                            const minAvailableAfter = new Date(svcEnd.getTime() + MARGEN_MINIMO_MINUTOS * 60000);

                            // REGLA 1: El slot empieza DURANTE o DESPUÉS del servicio existente 
                            //          pero ANTES del tiempo mínimo permitido
                            // Ejemplo: Servicio 16:00-17:30, margen 30min
                            //          minAvailableAfter = 18:00
                            //          Slot 17:30 -> slotStart(17:30) >= svcStart(16:00) ✓
                            //                     -> slotStart(17:30) < minAvailableAfter(18:00) ✓
                            //          -> RECHAZADO
                            if (slotStart >= svcStart && slotStart < minAvailableAfter) {
                                console.log(`[SmartAssistant] ❌ RECHAZADO: Slot ${slotStart.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })} - Muy cerca del servicio que termina ${svcEnd.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })} (min disponible: ${minAvailableAfter.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })})`);
                                return false; // Slot inválido
                            }

                            // REGLA 2: El slot termina después del inicio de un servicio existente (overlap)
                            if (slotStart < svcStart && slotEnd > svcStart) {
                                console.log(`[SmartAssistant] ❌ RECHAZADO: Slot ${slotStart.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}-${slotEnd.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })} - Overlap con servicio ${svcStart.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`);
                                return false; // Overlap
                            }
                        }
                        return true; // Slot válido
                    });

                    console.log(`[SmartAssistant] 🛡️ Gap filter (${MARGEN_MINIMO_MINUTOS}min): Removed ${beforeGapFilter - filteredData.length} slots. Remaining: ${filteredData.length}`);
                }
            }

            setSmartSlots(filteredData);

        } catch (err) {
            console.error("Error fetching smart slots:", err);
        } finally {
            setLoadingSlots(false);
        }
    };

    const handleServiceTypeChange = (typeId) => {
        const type = serviceTypes.find(t => t.id === typeId);
        if (type) {
            setSelectedServiceType(type);
            setDuration(type.estimated_duration_min);
        }
    };

    const addProposal = (slot) => {
        // Logic: Allow 3 slots if Digital Origin OR (Digital User + Not Manual)
        const isDigitalHeading = (ticket.origin_source?.includes('client') || ticket.origin_source === 'tech_app') || (!!ticket.client?.user_id && ticket.created_via !== 'manual');
        const maxSlots = isDigitalHeading ? 3 : 1;

        if (proposals.length >= maxSlots) {
            // If Single Slot Mode (Non-App), replace the existing one automatically for better UX
            if (maxSlots === 1) {
                setProposals([{
                    technician_id: slot.technician_id,
                    technician_name: slot.technician_name,
                    date: selectedDate,
                    start: slot.slot_start,
                    duration: duration,
                    type_name: selectedServiceType?.name
                }]);
                return;
            }
            return alert(`Máximo ${maxSlots} opciones.`);
        }

        // Check dupe
        if (proposals.some(p => p.technician_id === slot.technician_id && p.start === slot.slot_start)) {
            return;
        }

        setProposals([...proposals, {
            technician_id: slot.technician_id,
            technician_name: slot.technician_name,
            date: selectedDate,
            start: slot.slot_start, // ISO String
            duration: duration,
            type_name: selectedServiceType?.name
        }]);
    };

    const removeProposal = (idx) => {
        setProposals(proposals.filter((_, i) => i !== idx));
    };

    const handleConfirmDirect = async () => {
        if (proposals.length === 0) return alert("Selecciona una opción.");
        try {
            const p = proposals[0]; // Take first

            const { error } = await supabase
                .from('tickets')
                .update({
                    status: 'asignado',
                    appointment_status: 'confirmed',
                    technician_id: p.technician_id,
                    scheduled_at: p.start,
                    estimated_duration: p.duration,
                    service_type_id: selectedServiceType?.id,
                    proposed_slots: []
                })
                .eq('id', ticket.id);

            if (error) throw error; // Trigger will catch overlaps!
            onSuccess();
            onClose();
        } catch (err) {
            alert("Error (Posible Solape): " + err.message);
        }
    };

    const handleSendProposals = async () => {
        if (proposals.length === 0) return alert("Selecciona opciones.");
        try {
            const { error } = await supabase
                .from('tickets')
                .update({
                    status: 'solicitado',
                    appointment_status: 'pending',
                    proposed_slots: proposals,
                    scheduled_at: null,
                    estimated_duration: duration,
                    service_type_id: selectedServiceType?.id
                })
                .eq('id', ticket.id);

            if (error) throw error;
            onSuccess();
            onClose();
        } catch (err) {
            alert("Error: " + err.message);
        }
    };

    // Group Slots by Tech for "Tetris" View
    // Structure: { techId: { techName, slots: [] } }
    // Group Slots by Tech for "Tetris" View
    // Structure: { techId: { techName, slots: [] } }
    let slotsByTech = {};

    // First, decide which techs to show
    const visibleTechs = selectedTechFilter
        ? techs.filter(t => t.id === selectedTechFilter)
        : techs;

    visibleTechs.forEach(t => {
        slotsByTech[t.id] = { name: t.full_name, slots: [] };
    });

    smartSlots.forEach(s => {
        // Only push if the tech is in our visible set
        if (slotsByTech[s.technician_id]) {
            slotsByTech[s.technician_id].slots.push(s);
        }
    });


    return (
        <div className="fixed inset-0 bg-slate-900/80 flex items-center justify-center z-50 p-4 backdrop-blur-sm transition-all">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl overflow-hidden flex flex-col max-h-[95vh] border border-slate-700">
                {/* Header */}
                <div className="p-5 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                    <div>
                        <h3 className="font-bold text-2xl text-slate-800 flex items-center gap-2">
                            <ShieldCheck className="text-blue-600" />
                            Asistente Inteligente v3.0
                            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full border border-blue-200 uppercase tracking-widest font-bold">God Mode</span>
                        </h3>
                        <p className="text-sm text-slate-500 mt-1">
                            Ticket #{ticket.ticket_number} • {ticket.appliance_info?.type} • <span className="font-mono">{ticket.profiles?.address}</span>
                        </p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white rounded-full text-slate-400 hover:text-red-500 transition shadow-sm border border-transparent hover:border-slate-200">
                        <X size={24} />
                    </button>
                </div>

                <div className="flex-1 flex overflow-hidden">
                    {/* LEFT PANEL: CONFIG */}
                    <div className="w-80 bg-white border-r border-slate-200 p-6 flex flex-col gap-6 overflow-y-auto">

                        {/* 1. Service Type */}
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">1. Tipo de Servicio</label>
                            <select
                                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-700 focus:ring-2 focus:ring-blue-500 outline-none transition"
                                onChange={(e) => handleServiceTypeChange(e.target.value)}
                                value={selectedServiceType?.id || ''}
                            >
                                <option value="" disabled>Seleccionar Tipo</option>
                                {serviceTypes.map(t => (
                                    <option key={t.id} value={t.id}>{t.name} ({t.estimated_duration_min} min)</option>
                                ))}
                            </select>
                        </div>

                        {/* 2. Duration Override */}
                        <div className="space-y-2">
                            <div className="flex justify-between items-center">
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Duración Real</label>
                                <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded">{duration} min</span>
                            </div>
                            <input
                                type="range"
                                min="30" max="480" step="15"
                                className="w-full accent-blue-600 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                                value={duration}
                                onChange={(e) => setDuration(parseInt(e.target.value))}
                            />
                            <div className="flex justify-between text-[10px] text-slate-400 font-mono">
                                <span>30m</span>
                                <span>4h</span>
                                <span>8h</span>
                            </div>
                        </div>

                        {/* 2.5 Technician Select (Manual Override) */}
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Técnico Preferente</label>
                            <select
                                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-700 focus:ring-2 focus:ring-blue-500 outline-none transition"
                                value={selectedTechFilter}
                                onChange={(e) => setSelectedTechFilter(e.target.value)}
                            >
                                <option value="">🤖 Cualquiera / Automático</option>
                                {techs.map(t => (
                                    <option key={t.id} value={t.id}>
                                        {t.is_active ? '🟢' : '🔴'} {t.full_name}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* 3. Date Selection */}
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">2. Fecha Objetivo</label>
                            <input
                                type="date"
                                className="w-full p-3 border border-slate-200 rounded-xl bg-white focus:ring-2 focus:ring-blue-500 outline-none font-bold text-slate-700 shadow-sm"
                                value={selectedDate}
                                onChange={(e) => setSelectedDate(e.target.value)}
                                min={new Date().toISOString().split('T')[0]}
                            />
                        </div>

                        {/* Divider */}
                        <div className="h-px bg-slate-100 my-2"></div>

                        {/* Selected Proposals Preview */}
                        <div className="flex-1">
                            <h4 className="font-bold text-slate-800 mb-4 flex items-center gap-2 text-sm">
                                <Calendar size={16} className="text-indigo-600" />
                                Propuestas ({proposals.length}/3)
                            </h4>
                            <div className="space-y-2">
                                {proposals.map((p, idx) => (
                                    <div key={idx} className="bg-indigo-50 border border-indigo-100 p-3 rounded-lg relative group">
                                        <button
                                            onClick={() => removeProposal(idx)}
                                            className="absolute top-1 right-1 text-indigo-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition p-1"
                                        >
                                            <X size={14} />
                                        </button>
                                        <div className="font-bold text-indigo-900 text-sm">{p.technician_name}</div>
                                        <div className="text-xs text-indigo-700 flex items-center gap-1 mt-1">
                                            <Clock size={10} />
                                            {new Date(p.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            <span className="opacity-50">•</span>
                                            {p.duration} min
                                        </div>
                                    </div>
                                ))}
                                {proposals.length === 0 && (
                                    <div className="text-xs text-slate-400 text-center italic py-4 border-2 border-dashed border-slate-100 rounded-lg">
                                        Selecciona huecos del gráfico...
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="space-y-2 mt-auto">
                            {/* Logic: Client has App/Web Origin OR (User ID exists AND Not Manual) */}
                            {((ticket.origin_source?.includes('client') || ticket.origin_source === 'tech_app') || (!!ticket.client?.user_id && ticket.created_via !== 'manual')) && (
                                <button
                                    onClick={handleSendProposals}
                                    disabled={proposals.length === 0}
                                    className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-indigo-200 transition text-sm flex items-center justify-center gap-2"
                                >
                                    <CheckCircle size={16} /> Enviar Propuestas
                                </button>
                            )}

                            <button
                                onClick={handleConfirmDirect}
                                disabled={proposals.length === 0}
                                className="w-full py-3 bg-emerald-500 text-white rounded-xl font-bold hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-emerald-200 transition text-sm flex items-center justify-center gap-2"
                            >
                                <CheckCircle size={16} /> Asignar Directo
                            </button>
                        </div>
                    </div>

                    {/* RIGHT PANEL: VISUAL TETRIS (Timeline) */}
                    <div className="flex-1 bg-slate-50 p-6 overflow-y-auto">
                        {!selectedDate ? (
                            <div className="h-full flex flex-col items-center justify-center text-slate-400">
                                <Calendar size={64} className="mb-4 opacity-20" />
                                <p className="text-lg font-medium">Selecciona una fecha para ver disponibilidad</p>
                            </div>
                        ) : loadingSlots ? (
                            <div className="h-full flex items-center justify-center">
                                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                            </div>
                        ) : (
                            <div className="space-y-6">
                                <div className="flex justify-between items-end mb-2">
                                    <h4 className="font-bold text-slate-700">Disponibilidad {new Date(selectedDate).toLocaleDateString()}</h4>
                                    <div className="flex gap-4 text-xs font-medium text-slate-500">
                                        <div className="flex items-center gap-1"><div className="w-3 h-3 bg-white border border-slate-300 rounded"></div> Libre</div>
                                        <div className="flex items-center gap-1"><div className="w-3 h-3 bg-green-100 border border-green-300 rounded"></div> Zona Óptima</div>
                                        <div className="flex items-center gap-1"><div className="w-3 h-3 bg-slate-200 rounded"></div> Ocupado / No Válido</div>
                                    </div>
                                </div>

                                {Object.values(slotsByTech).map(tech => (
                                    <div key={tech.name} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                                        <div className="flex items-center gap-3 mb-3">
                                            <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 font-bold">
                                                {tech.name.charAt(0)}
                                            </div>
                                            <div>
                                                <div className="font-bold text-slate-800">{tech.name}</div>
                                                {/* Logic for "En Zona" badge could go here if RPC returned aggregate efficiency */}
                                            </div>
                                        </div>

                                        {/* Timeline Bar Construction */}
                                        <div className="grid grid-cols-10 gap-2">
                                            {/* We map the found slots. 
                                                NOTE: The RPC returns *available* slots.
                                                A true timeline would show the whole day 9-19. 
                                                For MVP GOD MODE, let's render the AVAILABLE slots as clickable "Chips".
                                                Rendering a true gantt chart is complex logic for React without a library.
                                                Detailed Chips are cleaner for selection.
                                            */}
                                            {tech.slots.map((slot, idx) => {
                                                const start = new Date(slot.slot_start);
                                                const timeStr = start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                                                const isOptimal = slot.is_optimal_cp || false; // From RPC

                                                return (
                                                    <button
                                                        key={idx}
                                                        onClick={() => addProposal(slot)}
                                                        className={`
                                                            col-span-2 py-2 px-1 rounded-lg border text-center transition relative overflow-hidden group
                                                            ${proposals.some(p => p.technician_id === slot.technician_id && p.start === slot.slot_start)
                                                                ? 'bg-indigo-600 border-indigo-700 text-white shadow-md ring-2 ring-indigo-300 ring-offset-1 scale-105 z-10'
                                                                : isOptimal
                                                                    ? 'bg-green-50 border-green-200 text-green-700 hover:bg-green-100 hover:border-green-300 hover:shadow-md'
                                                                    : 'bg-white border-slate-200 text-slate-600 hover:border-blue-300 hover:text-blue-600 hover:bg-blue-50 hover:shadow-sm'
                                                            }
                                                        `}
                                                    >
                                                        <div className="font-bold text-sm">{timeStr}</div>
                                                        {isOptimal && !proposals.some(p => p.technician_id === slot.technician_id && p.start === slot.slot_start) && (
                                                            <div className="absolute top-0 right-0 w-2 h-2 bg-green-500 rounded-bl-lg"></div>
                                                        )}
                                                        <div className={`text-[10px] ${proposals.some(p => p.technician_id === slot.technician_id && p.start === slot.slot_start) ? 'text-indigo-200' : 'opacity-70'}`}>
                                                            +{duration}m
                                                        </div>
                                                    </button>
                                                )
                                            })}
                                            {tech.slots.length === 0 && (
                                                <div className="col-span-10 text-center py-2 text-xs text-slate-300 italic bg-slate-50 rounded-lg border border-dashed border-slate-200">
                                                    Sin huecos disponibles de {duration} min
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SmartAssignmentModal;
