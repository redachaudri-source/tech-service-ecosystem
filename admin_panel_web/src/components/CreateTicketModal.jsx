import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { X, Save, User, Smartphone, Plus, Clock } from 'lucide-react';
import AgendaPicker from './AgendaPicker';

const CreateTicketModal = ({ onClose, onSuccess, title = 'Nuevo Servicio', submitLabel = 'Crear Ticket' }) => {
    const [loading, setLoading] = useState(false);
    const [showAgenda, setShowAgenda] = useState(false);

    // Data Sources
    const [clients, setClients] = useState([]);
    const [techs, setTechs] = useState([]);

    // Form State - Mode
    const [isNewClient, setIsNewClient] = useState(false);

    // Form State - Ticket
    const [clientId, setClientId] = useState('');
    const [techId, setTechId] = useState('');
    const [applianceType, setApplianceType] = useState('Lavadora');
    const [applianceBrand, setApplianceBrand] = useState('');
    const [applianceModel, setApplianceModel] = useState('');
    const [description, setDescription] = useState('');
    const [aiDiagnosis, setAiDiagnosis] = useState('');

    // Form State - Schedule
    const [appointmentDate, setAppointmentDate] = useState('');
    const [appointmentTime, setAppointmentTime] = useState('');
    const [duration, setDuration] = useState(60); // Default 1h

    // Form State - New Client
    const [newClientName, setNewClientName] = useState('');
    const [newClientPhone, setNewClientPhone] = useState('');
    const [newClientAddress, setNewClientAddress] = useState('');
    const [newClientCity, setNewClientCity] = useState(''); // Default could be Málaga
    const [newClientPostalCode, setNewClientPostalCode] = useState('');
    const [isLookingUpCP, setIsLookingUpCP] = useState(false);

    // Duplicate Detection State
    const [duplicateSuggestion, setDuplicateSuggestion] = useState(null);

    // --- AUTO POSTAL CODE LOGIC ---
    // Nominatim Lookup Logic (Copied from ClientManager)
    const lookupPostalCode = async (addr, cit) => {
        if (!addr || !cit) return;
        setIsLookingUpCP(true);
        try {
            const query = `${addr}, ${cit}, Málaga, Spain`; // Assume Province Málaga for now
            const resp = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1&addressdetails=1`);
            const data = await resp.json();

            if (data && data.length > 0 && data[0].address) {
                const foundPostcode = data[0].address.postcode;
                if (foundPostcode) {
                    setNewClientPostalCode(foundPostcode);
                }
            }
        } catch (error) {
            console.error("CP Lookup failed", error);
        } finally {
            setIsLookingUpCP(false);
        }
    };

    useEffect(() => {
        const timer = setTimeout(() => {
            if (newClientAddress.length > 5 && newClientCity.length > 2) {
                lookupPostalCode(newClientAddress, newClientCity);
            }
        }, 1500);
        return () => clearTimeout(timer);
    }, [newClientAddress, newClientCity]);

    // --- INSTANT PHONE CHECK LOGIC ---
    useEffect(() => {
        if (newClientPhone.length > 6) { // Only check if reasonable length
            checkDuplicatePhone(newClientPhone);
        } else {
            setDuplicateSuggestion(null);
        }
    }, [newClientPhone]);

    const checkDuplicatePhone = async (phone) => {
        const { data } = await supabase
            .from('profiles')
            .select('id, full_name, address, city')
            .ilike('phone', `%${phone}%`) // Partial match or exact? User said "instant", lenient is better
            .limit(1)
            .maybeSingle();

        if (data) {
            setDuplicateSuggestion(data);
        } else {
            setDuplicateSuggestion(null);
        }
    };

    const applySuggestion = () => {
        if (!duplicateSuggestion) return;

        // Ensure the suggested client is in our list (in case it's newor missing)
        setClients(prev => {
            if (!prev.find(c => c.id === duplicateSuggestion.id)) {
                return [...prev, duplicateSuggestion];
            }
            return prev;
        });

        setIsNewClient(false);
        setClientId(duplicateSuggestion.id);
        setDuplicateSuggestion(null);
        // Clear New Client Fields
        setNewClientName('');
        setNewClientPhone('');
        setNewClientAddress('');
    };

    // Helper for Required Label
    const Label = ({ text }) => (
        <label className="block text-xs font-bold text-slate-500 uppercase mb-1 flex items-center gap-1">
            {text} <span className="text-amber-500 text-lg leading-none">*</span>
        </label>
    );

    useEffect(() => {
        fetchData();
    }, []);

    // "Smart" Diagnosis Logic (Simulated Local AI)
    const getSmartDiagnosis = (type, brand, text) => {
        const t = text.toLowerCase();
        let diag = "";

        // Common Patterns
        const patterns = {
            'Lavadora': [
                { k: ['agua', 'no saca', 'desagua'], d: 'Posible obstrucción en bomba de desagüe o filtro sucio.' },
                { k: ['centrifuga', 'gira', 'tambor'], d: 'Revisar escobillas del motor, condensador o correa de transmisión.' },
                { k: ['enciende', 'muerta'], d: 'Fallo en placa electrónica o fusible de entrada. Comprobar tensión.' },
                { k: ['ruido', 'golpes'], d: 'Rodamientos desgastados o amortiguadores vencidos.' },
                { k: ['puerta', 'cierra'], d: 'Blocapuertas defectuoso o maneta rota.' }
            ],
            'Aire Acondicionado': [
                { k: ['enfria', 'calienta', 'gas'], d: 'Posible fuga de refrigerante o fallo en compresor/condensador.' },
                { k: ['gotea', 'agua'], d: 'Drenaje obstruido o bandeja de condensados llena.' },
                { k: ['enciende', 'mando'], d: 'Revisar receptor IR o placa de control.' },
                { k: ['olor'], d: 'Filtros sucios o baterías con moho. Limpieza urgente.' },
                { k: ['error', 'parpadea'], d: 'Consultar código de error en manual de servicio. Fallo de sondas posible.' }
            ],
            'Refrigerador': [
                { k: ['enfria', 'calienta'], d: 'Compresor no arranca (clixon/relé) o falta de gas.' },
                { k: ['hielo', 'escarcha'], d: 'Fallo en sistema No-Frost (resistencia, bimetal o timer).' },
                { k: ['ruido'], d: 'Ventilador rozando o compresor cabeceando.' },
                { k: ['agua', 'charco'], d: 'Desagüe de deshielo obstruido.' }
            ],
            'Calentador de Gas': [
                { k: ['enciende', 'chispa'], d: 'Revisar pilas, membrana de agua o servoválvula de gas.' },
                { k: ['apaga'], d: 'Sensor de tiro o termopar defectuoso.' },
                { k: ['poca agua', 'presion'], d: 'Serpentín calcificado. Limpieza química necesaria.' }
            ]
        };

        const defaultDiags = {
            'Lavadora': 'Revisar ciclo de lavado y componentes mecánicos principales.',
            'Aire Acondicionado': 'Comprobar presiones, saltos térmicos y limpieza de filtros.',
            'Refrigerador': 'Verificar temperaturas y ciclo de compresor.',
            'Calentador de Gas': 'Revisar circuito de gas y evacuación de humos.',
            'default': 'Inspección general requerida para determinar origen del fallo.'
        };

        const typeRules = patterns[type] || [];
        const match = typeRules.find(r => r.k.some(key => t.includes(key)));

        if (match) {
            diag = match.d;
        } else {
            diag = defaultDiags[type] || defaultDiags['default'];
        }

        return `Diagnóstico: ${brand} ${type} - ${diag} Protocolo: Revisión estándar.`;
    };

    const handleDescriptionChange = (e) => {
        const val = e.target.value;
        setDescription(val);

        if (val.length > 8) {
            // Debounce could be good here, but direct is fine for demo
            setAiDiagnosis(getSmartDiagnosis(applianceType, applianceBrand, val));
        } else {
            setAiDiagnosis('');
        }
    };

    const fetchData = async () => {
        const { data: clientsData } = await supabase.from('profiles').select('*').eq('role', 'client');
        const { data: techsData } = await supabase
            .from('profiles')
            .select('*')
            .eq('role', 'tech')
            .eq('is_active', true)
            .is('deleted_at', null);

        if (clientsData) setClients(clientsData);
        if (techsData) setTechs(techsData);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);

        // 1. Handle Client (Existing vs New)
        let finalClientId = clientId;

        if (isNewClient) {
            // DUPLICATE CHECK
            const { data: existingClient } = await supabase
                .from('profiles')
                .select('id, full_name')
                .eq('phone', newClientPhone)
                .single();

            if (existingClient) {
                const confirmUse = window.confirm(`¡Atención! Ya existe un cliente con el teléfono ${newClientPhone}: ${existingClient.full_name}.\n¿Deseas usar este cliente existente en lugar de crear uno nuevo?`);
                if (confirmUse) {
                    finalClientId = existingClient.id;
                } else {
                    setLoading(false);
                    return; // Stop to let user fix
                }
            } else {
                // CREATE NEW
                const { data: newClient, error: clientError } = await supabase
                    .from('profiles')
                    .insert({
                        full_name: newClientName,
                        phone: newClientPhone,
                        address: newClientAddress,
                        city: newClientCity,
                        postal_code: newClientPostalCode,
                        role: 'client',
                        created_via: 'admin' // Attribution
                    })
                    .select()
                    .single();

                if (clientError) {
                    alert('Error creando cliente: ' + clientError.message);
                    setLoading(false);
                    return;
                }
                finalClientId = newClient.id;
            }
        }

        // 2. Schedule Logic
        let scheduledAt = null;
        if (appointmentDate) {
            // Default to 9:00 AM if no time set but date is set
            const timePart = appointmentTime || '09:00';
            scheduledAt = new Date(`${appointmentDate}T${timePart}:00`).toISOString();
        }

        // --- VALIDATION: CHECK DOUBLE BOOKING (RANGE OVERLAP) ---
        if (techId && scheduledAt) {
            // New Ticket Range
            const newStart = new Date(scheduledAt);
            const newEnd = new Date(newStart.getTime() + (duration * 60000)); // duration is in minutes

            // Get Technician's tickets for that day
            const dayStart = new Date(newStart);
            dayStart.setHours(0, 0, 0, 0);
            const dayEnd = new Date(newStart);
            dayEnd.setHours(23, 59, 59, 999);

            try {
                const { data: existingTickets, error: fetchError } = await supabase
                    .from('tickets')
                    .select('scheduled_at, estimated_duration')
                    .eq('technician_id', techId)
                    .gte('scheduled_at', dayStart.toISOString())
                    .lte('scheduled_at', dayEnd.toISOString())
                    .not('status', 'in', '("cancelado","rejected")');

                if (fetchError) throw fetchError;

                if (existingTickets) {
                    const hasConflict = existingTickets.some(ticket => {
                        const existStart = new Date(ticket.scheduled_at);
                        const existDuration = ticket.estimated_duration || 60;
                        // Add 30m buffer to existing ticket end
                        const existEnd = new Date(existStart.getTime() + (existDuration + 30) * 60000);

                        // Check Overlap: (StartA < EndB) and (EndA > StartB)
                        return (newStart < existEnd && newEnd > existStart);
                    });

                    if (hasConflict) {
                        alert('⚠️ CONFLICTO DE AGENDA DETECTADO\n\nEl horario se solapa con otro servicio existente.\nPor favor usa el botón "Abrir Agenda" para ver los huecos libres.');
                        setLoading(false);
                        return;
                    }
                }
            } catch (err) {
                console.error("Validation Error:", err);
                // Fail safe: If error is about missing column 'estimated_duration', warn user but maybe allow?
                // No, better to be safe.
                if (err.message?.includes('estimated_duration')) {
                    alert('⚠️ ERROR DE BASE DE DATOS\n\nFalta la columna "estimated_duration".\nPor favor ejecuta el script de migración SQL en Supabase.');
                    setLoading(false);
                    return;
                }
                alert('⚠️ ERROR DE VALIDACIÓN\n\nOcurrió un error al verificar la disponibilidad del técnico. Por favor, inténtalo de nuevo.');
                setLoading(false);
                return;
            }
        }

        // 3. Create Ticket
        const applianceInfo = {
            type: applianceType,
            brand: applianceBrand,
            model: applianceModel
        };

        const { error: ticketError } = await supabase
            .from('tickets')
            .insert({
                client_id: finalClientId,
                technician_id: techId || null, // Optional assignment
                appliance_info: applianceInfo,
                description_failure: description,
                ai_diagnosis: aiDiagnosis,
                scheduled_at: scheduledAt,
                estimated_duration: duration,
                // If created by Admin and has a date, assume it's confirmed (otherwise why set a date?)
                appointment_status: scheduledAt ? 'confirmed' : 'pending',
                status: techId ? 'asignado' : 'solicitado', // logic can change if assigned immediately
                created_by: (await supabase.auth.getUser()).data.user?.id, // Capture creator ID
                origin_source: 'direct' // Mark as Office/Manual creation
            });

        setLoading(false);

        if (ticketError) {
            alert('Error creando ticket: ' + ticketError.message);
        } else {
            onSuccess();
            onClose();
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl overflow-hidden max-h-[90vh] overflow-y-auto">
                <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 sticky top-0">
                    <h2 className="text-lg font-bold text-slate-800">{title}</h2>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
                        <X size={20} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-6">
                    {/* SECTION: CLIENT */}
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                        <div className="flex justify-between items-center mb-3">
                            <h3 className="font-semibold text-slate-700 flex items-center gap-2">
                                <User size={18} />
                                Información del Cliente
                            </h3>
                            <button
                                type="button"
                                onClick={() => setIsNewClient(!isNewClient)}
                                className="text-sm text-blue-600 font-medium hover:underline"
                            >
                                {isNewClient ? 'Seleccionar Existente' : '+ Registrar Nuevo'}
                            </button>
                        </div>

                        {isNewClient ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-2 duration-300">
                                <div className="md:col-span-2">
                                    <Label text="Nombre Completo" />
                                    <input required type="text" className="w-full p-2 border rounded-lg" onChange={e => setNewClientName(e.target.value)} />
                                </div>
                                <div>
                                    <Label text="Teléfono" />
                                    <div className="relative">
                                        <input
                                            required
                                            type="text"
                                            className={`w-full p-2 border rounded-lg ${duplicateSuggestion ? 'border-amber-400 bg-amber-50' : ''}`}
                                            value={newClientPhone}
                                            onChange={e => setNewClientPhone(e.target.value)}
                                        />
                                        {duplicateSuggestion && (
                                            <div className="absolute top-full left-0 w-full bg-white border border-amber-200 shadow-lg rounded-lg mt-1 p-3 z-10 animate-in slide-in-from-top-2">
                                                <div className="flex items-start gap-3">
                                                    <div className="bg-amber-100 text-amber-600 p-2 rounded-full shrink-0">
                                                        <User size={16} />
                                                    </div>
                                                    <div>
                                                        <p className="text-sm font-bold text-slate-700">¡Cliente Encontrado!</p>
                                                        <p className="text-xs text-slate-500">{duplicateSuggestion.full_name}</p>
                                                        <p className="text-xs text-slate-400">{duplicateSuggestion.address}</p>
                                                        <button
                                                            type="button"
                                                            onClick={applySuggestion}
                                                            className="mt-2 text-xs bg-blue-600 text-white px-3 py-1.5 rounded-md font-medium hover:bg-blue-700 w-full"
                                                        >
                                                            Usar este Cliente
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <div>
                                    <Label text="Dirección" />
                                    <input required type="text" className="w-full p-2 border rounded-lg" value={newClientAddress} onChange={e => setNewClientAddress(e.target.value)} />
                                </div>
                                <div>
                                    <Label text="Ciudad" />
                                    <input required type="text" className="w-full p-2 border rounded-lg" placeholder="Ej. Málaga" value={newClientCity} onChange={e => setNewClientCity(e.target.value)} />
                                </div>
                                <div>
                                    <Label text="Código Postal" />
                                    <div className="relative">
                                        <input type="text" className="w-full p-2 border rounded-lg" placeholder="29000" value={newClientPostalCode} onChange={e => setNewClientPostalCode(e.target.value)} />
                                        {isLookingUpCP && (
                                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-blue-500 animate-pulse font-bold">
                                                AUTO
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div>
                                <select
                                    required
                                    className="w-full p-2 border border-slate-200 rounded-lg bg-white"
                                    value={clientId}
                                    onChange={e => setClientId(e.target.value)}
                                >
                                    <option value="">-- Seleccionar Cliente --</option>
                                    {clients.map(c => (
                                        <option key={c.id} value={c.id}>{c.full_name} ({c.address})</option>
                                    ))}
                                </select>
                            </div>
                        )}
                    </div>

                    {/* SECTION: APPLIANCE */}
                    <div>
                        <h3 className="font-semibold text-slate-700 mb-3 flex items-center gap-2">
                            <Smartphone size={18} />
                            Equipo y Falla
                        </h3>
                        <div className="grid grid-cols-2 gap-4 mb-4">
                            <div>
                                <label className="block text-sm text-slate-600 mb-1">Tipo Equipo</label>
                                <select className="w-full p-2 border rounded-lg" value={applianceType} onChange={e => setApplianceType(e.target.value)}>
                                    <option>Lavadora</option>
                                    <option>Secadora</option>
                                    <option>Lavasecadora</option>
                                    <option>Refrigerador</option>
                                    <option>Congelador</option>
                                    <option>Lavavajillas</option>
                                    <option>Horno</option>
                                    <option>Estufa / Cocina</option>
                                    <option>Campana Extractora</option>
                                    <option>Microondas</option>
                                    <option>Calentador de Gas</option>
                                    <option>Termo Eléctrico</option>
                                    <option>Caldera</option>
                                    <option>Aire Acondicionado</option>
                                    <option>Otro</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm text-slate-600 mb-1">Marca <span className="text-amber-500">*</span></label>
                                <input required type="text" className="w-full p-2 border rounded-lg" placeholder="Ej. Samsung" value={applianceBrand} onChange={e => setApplianceBrand(e.target.value)} />
                            </div>
                        </div>
                        <div className="mb-4">
                            <label className="block text-sm text-slate-600 mb-1">Descripción del Problema (Cliente) <span className="text-amber-500">*</span></label>
                            <textarea
                                required
                                rows={2}
                                className="w-full p-2 border rounded-lg"
                                placeholder="Detalles de la falla..."
                                value={description}
                                onChange={handleDescriptionChange}
                            />
                        </div>

                        {/* AI Diagnosis Section */}
                        <div className="mb-4 bg-blue-50 p-3 rounded-lg border border-blue-100">
                            <div className="flex justify-between items-center mb-1">
                                <label className="block text-xs font-bold text-blue-700 uppercase">Diagnóstico IA (Solo Técnico)</label>
                                <span className="text-[10px] px-2 py-0.5 bg-blue-200 text-blue-800 rounded-full">Automático</span>
                            </div>
                            <textarea
                                rows={2}
                                className="w-full p-2 border border-blue-200 rounded-lg bg-white text-sm text-slate-700"
                                value={aiDiagnosis}
                                onChange={e => setAiDiagnosis(e.target.value)}
                            />
                            <p className="text-[10px] text-blue-500 mt-1">
                                * Este texto es visible solo para el técnico y administradores.
                            </p>
                        </div>
                    </div>

                    {/* SECTION: ASSIGNMENT & SCHEDULE */}
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                        <h3 className="font-semibold text-slate-700 mb-3 flex items-center gap-2">
                            <Clock size={18} />
                            Agenda y Asignación
                        </h3>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                            {/* Column 1: Tech & Duration */}
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Técnico</label>
                                    <select
                                        className="w-full p-2.5 border border-slate-200 rounded-lg bg-white focus:ring-2 focus:ring-blue-500/20 outline-none"
                                        value={techId}
                                        onChange={e => setTechId(e.target.value)}
                                    >
                                        <option value="">-- Pendiente de Asignar --</option>
                                        {techs.map(t => (
                                            <option key={t.id} value={t.id}>{t.full_name}</option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Duración Estimada</label>
                                    <select
                                        className="w-full p-2.5 border border-slate-200 rounded-lg bg-white focus:ring-2 focus:ring-blue-500/20 outline-none"
                                        value={duration}
                                        onChange={e => setDuration(Number(e.target.value))}
                                    >
                                        <option value={30}>30 min (Rápido)</option>
                                        <option value={60}>1h (Estándar)</option>
                                        <option value={90}>1h 30m</option>
                                        <option value={120}>2h (Complejo)</option>
                                        <option value={180}>3h (Muy Largo)</option>
                                        <option value={240}>4h (Medio Día)</option>
                                    </select>
                                </div>
                            </div>

                            {/* Column 2: Date & Time Picker */}
                            <div className="flex flex-col justify-end">
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Horario de Visita</label>
                                <div className="p-3 bg-white border border-slate-200 rounded-lg">
                                    {!appointmentTime ? (
                                        <div className="text-center py-2">
                                            <p className="text-sm text-slate-400 mb-2">Sin fecha seleccionada</p>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    if (!techId) {
                                                        alert('Primero selecciona un Técnico.');
                                                    } else {
                                                        // Default to today (Local) if empty
                                                        if (!appointmentDate) {
                                                            const today = new Date();
                                                            const localIso = new Date(today.getTime() - (today.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
                                                            setAppointmentDate(localIso);
                                                        }
                                                        setShowAgenda(true);
                                                    }
                                                }}
                                                className="w-full py-2 bg-indigo-50 text-indigo-600 rounded-lg font-semibold text-sm hover:bg-indigo-100 transition flex items-center justify-center gap-2"
                                            >
                                                <Clock size={16} />
                                                Abrir Agenda
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="text-center">
                                            <p className="text-xs text-slate-400 mb-1">Cita Programada para:</p>
                                            <div className="font-bold text-lg text-indigo-700 flex items-center justify-center gap-2">
                                                <span>{new Date(appointmentDate).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric' })}</span>
                                                <span>•</span>
                                                <span>{appointmentTime}</span>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => setShowAgenda(true)}
                                                className="mt-2 text-xs text-indigo-500 hover:text-indigo-700 underline"
                                            >
                                                Cambiar Hora
                                            </button>
                                        </div>
                                    )}
                                </div>
                                {/* Hidden inputs for logic compatibility */}
                                <input type="hidden" value={appointmentDate} />
                                <input type="hidden" value={appointmentTime} />
                            </div>
                        </div>
                    </div>

                    <div className="pt-4 flex justify-end gap-3 border-t border-slate-100">
                        <button type="button" onClick={onClose} className="px-5 py-2.5 text-slate-500 hover:bg-slate-100 rounded-xl font-medium transition">Cancelar</button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="px-6 py-2.5 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 shadow-lg shadow-blue-600/20 hover:-translate-y-0.5 transition flex items-center gap-2"
                        >
                            {loading ? (
                                <>
                                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    Guardando...
                                </>
                            ) : (
                                <>
                                    <Save size={20} />
                                    {submitLabel}
                                </>
                            )}
                        </button>
                    </div>
                </form>

                {/* VISUAL AGENDA OVERLAY */}
                {showAgenda && (
                    <AgendaPicker
                        techId={techId}
                        techName={techs.find(t => t.id === techId)?.full_name || 'Técnico'}
                        date={appointmentDate}
                        duration={duration}
                        onTimeSelect={(time) => setAppointmentTime(time)}
                        onClose={() => setShowAgenda(false)}
                    />
                )}
            </div>
        </div>
    );
};

export default CreateTicketModal;
