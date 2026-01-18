import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { X, Save, User, Smartphone, Plus, Clock } from 'lucide-react';
import AgendaPicker from './AgendaPicker';
import SmartBrandSelector from './SmartBrandSelector';

const CreateTicketModal = ({ onClose, onSuccess, title = 'Nuevo Servicio', submitLabel = 'Crear Ticket', warrantyClaimFrom = null }) => {
    const [loading, setLoading] = useState(false);
    const [showAgenda, setShowAgenda] = useState(false);

    // Data Sources
    const [clients, setClients] = useState([]);
    const [techs, setTechs] = useState([]);
    const [serviceTypes, setServiceTypes] = useState([]); // New Data Source

    // Form State - Mode
    const [isNewClient, setIsNewClient] = useState(false);

    // Form State - Ticket
    const [clientId, setClientId] = useState('');
    const [techId, setTechId] = useState('');
    const [serviceTypeId, setServiceTypeId] = useState(''); // New State
    const [applianceType, setApplianceType] = useState('Lavadora');
    const [applianceBrand, setApplianceBrand] = useState('');
    const [applianceModel, setApplianceModel] = useState('');
    const [selectedBrandId, setSelectedBrandId] = useState(null); // New
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

    // PRE-FILL WARRANTY DATA
    useEffect(() => {
        if (warrantyClaimFrom) {
            setClientId(warrantyClaimFrom.client_id);
            setApplianceType(warrantyClaimFrom.appliance_info?.type || 'Lavadora');
            setApplianceBrand(warrantyClaimFrom.appliance_info?.brand || '');
            setApplianceModel(warrantyClaimFrom.appliance_info?.model || '');
            setDescription(`RECLAMACIÓN GARANTÍA (Ticket #${warrantyClaimFrom.ticket_number}): `);
            // Optionally set initial tech to previous tech
            // setTechId(warrantyClaimFrom.technician_id || ''); 
        }
    }, [warrantyClaimFrom]);

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
        const { data: typesData } = await supabase.from('service_types').select('*').eq('is_active', true);

        if (clientsData) setClients(clientsData);
        if (techsData) setTechs(techsData);
        if (typesData) setServiceTypes(typesData);
    };

    const handleServiceTypeChange = (e) => {
        const id = e.target.value;
        setServiceTypeId(id);
        const type = serviceTypes.find(t => t.id === id);
        if (type) {
            setDuration(type.estimated_duration_min);
        }
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
        let appointmentSt = 'pending';
        let ticketStatus = 'solicitado';
        let assignedTech = null;

        if (techId === 'smart') {
            // SMART MODE: No date/tech yet (handled by next modal)
            ticketStatus = 'solicitado';
            appointmentSt = 'pending';
            assignedTech = null;
        } else if (techId) {
            // MANUAL ASSIGNMENT (If manual section was kept or re-added in future)
            // But currently UI forces 'smart' or 'none'. 
            // In case we support direct assignment:
            if (appointmentDate) {
                const timePart = appointmentTime || '09:00';
                scheduledAt = new Date(`${appointmentDate}T${timePart}:00`).toISOString();
                appointmentSt = 'confirmed';
                ticketStatus = 'asignado';
                assignedTech = techId;
            } else {
                // Assign without date?
                ticketStatus = 'asignado';
                assignedTech = techId;
            }
        } else {
            // PLAIN SOLICITADO
            ticketStatus = 'solicitado';
            appointmentSt = 'pending';
            assignedTech = null;
        }


        // --- VALIDATION: DOUBLE BOOKING (Only if Manual Date Set) ---
        // Skip check if 'smart' is selected or no date
        if (assignedTech && scheduledAt && techId !== 'smart') {
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
                    .select('*')
                    .eq('technician_id', assignedTech)
                    .gte('scheduled_at', dayStart.toISOString())
                    .lte('scheduled_at', dayEnd.toISOString())
                    .neq('status', 'cancelado')
                    .neq('status', 'rejected');

                if (fetchError) throw fetchError;

                if (existingTickets) {
                    const hasConflict = existingTickets.some(ticket => {
                        const existStart = new Date(ticket.scheduled_at);
                        const existDuration = ticket.estimated_duration || 60;
                        const existEnd = new Date(existStart.getTime() + (existDuration + 30) * 60000);
                        return (newStart < existEnd && newEnd > existStart);
                    });

                    if (hasConflict) {
                        alert('⚠️ CONFLICTO DE AGENDA DETECTADO\n\nEl horario se solapa con otro servicio existente.');
                        setLoading(false);
                        return;
                    }
                }
            } catch (err) {
                console.error("Validation Check Failed:", err);
            }
        }

        // 3. Create Ticket
        const applianceInfo = {
            type: applianceType,
            brand: applianceBrand, // Keep legacy text for JSON views
            model: applianceModel
        };

        const { data: newTicket, error: ticketError } = await supabase
            .from('tickets')
            .insert({
                client_id: finalClientId,
                technician_id: assignedTech || null,
                service_type_id: serviceTypeId || null,
                brand_id: selectedBrandId || null, // NEW: Link to Brands Table
                appliance_info: applianceInfo,
                description_failure: description,
                ai_diagnosis: aiDiagnosis,
                scheduled_at: scheduledAt,
                estimated_duration: duration,
                appointment_status: appointmentSt,
                status: ticketStatus,
                created_by: (await supabase.auth.getUser()).data.user?.id,

                origin_source: 'direct',
                is_warranty: !!warrantyClaimFrom,
                link_ticket_id: warrantyClaimFrom ? warrantyClaimFrom.id : null
            })
            .select()
            .single();

        setLoading(false);

        if (ticketError) {
            alert('Error creando ticket: ' + ticketError.message);
        } else {
            // SUCCESS
            if (techId === 'smart' && newTicket) {
                // Pass ticket to parent to open Smart Scheduler
                onSuccess(newTicket, true); // (ticket, shouldOpenSmart)
            } else {
                onSuccess(newTicket, false);
            }
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
                            {!warrantyClaimFrom && (
                                <button
                                    type="button"
                                    onClick={() => setIsNewClient(!isNewClient)}
                                    className="text-sm text-blue-600 font-medium hover:underline"
                                >
                                    {isNewClient ? 'Seleccionar Existente' : '+ Registrar Nuevo'}
                                </button>
                            )}
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
                                    className={`w-full p-2 border border-slate-200 rounded-lg bg-white ${warrantyClaimFrom ? 'bg-slate-100 text-slate-500 cursor-not-allowed' : ''}`}
                                    value={clientId}
                                    onChange={e => setClientId(e.target.value)}
                                    disabled={!!warrantyClaimFrom}
                                >
                                    <option value="">-- Seleccionar Cliente --</option>
                                    {clients.map(c => (
                                        <option key={c.id} value={c.id}>{c.full_name} ({c.address})</option>
                                    ))}
                                </select>
                            </div>
                        )}
                    </div>

                    {/* SECTION: APPLIANCE & SERVICE */}
                    <div>
                        <h3 className="font-semibold text-slate-700 mb-3 flex items-center gap-2">
                            <Smartphone size={18} />
                            Detalles del Servicio
                        </h3>

                        {/* SERVICE TYPE SELECTOR */}
                        <div className="mb-4">
                            <label className="block text-sm font-bold text-slate-700 mb-1">Tipo de Servicio (Define Duración)</label>
                            <select
                                className="w-full p-2 border border-blue-200 bg-blue-50/50 rounded-lg font-medium text-slate-800"
                                value={serviceTypeId}
                                onChange={handleServiceTypeChange}
                            >
                                <option value="">-- Seleccionar Tipo (Estándar: 1h) --</option>
                                {serviceTypes.map(t => (
                                    <option key={t.id} value={t.id}>
                                        {t.name} ({t.estimated_duration_min} min)
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="grid grid-cols-2 gap-4 mb-4">
                            <div>
                                <label className="block text-sm text-slate-600 mb-1">Tipo Equipo</label>
                                <select
                                    className={`w-full p-2 border rounded-lg ${warrantyClaimFrom ? 'bg-slate-100 text-slate-500' : ''}`}
                                    value={applianceType}
                                    onChange={e => setApplianceType(e.target.value)}
                                    disabled={!!warrantyClaimFrom}
                                >
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
                                <div className={warrantyClaimFrom ? 'pointer-events-none opacity-70' : ''}>
                                    <SmartBrandSelector
                                        value={applianceBrand}
                                        onChange={(brandObj) => {
                                            if (brandObj && typeof brandObj === 'object') {
                                                setApplianceBrand(brandObj.name);
                                                setSelectedBrandId(brandObj.id);
                                            } else {
                                                setApplianceBrand(brandObj || '');
                                                setSelectedBrandId(null);
                                            }
                                        }}
                                    />
                                </div>
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

                    {/* SECTION: ASSIGNMENT MODE */}
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                        <h3 className="font-semibold text-slate-700 mb-3 flex items-center gap-2">
                            <Clock size={18} />
                            Asignación y Agenda
                        </h3>

                        <div className="space-y-4">
                            <label className="flex items-center gap-3 p-4 bg-white border border-slate-200 rounded-xl cursor-pointer hover:border-blue-300 transition group shadow-sm">
                                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${techId === 'smart' ? 'border-blue-500 bg-blue-500' : 'border-slate-300'}`}>
                                    {techId === 'smart' && <div className="w-2 h-2 bg-white rounded-full" />}
                                </div>
                                <input
                                    type="radio"
                                    name="assignMode"
                                    className="hidden"
                                    checked={techId === 'smart'}
                                    onChange={() => { setTechId('smart'); setDuration(60); }} // Reset to smart mode
                                />
                                <div className="flex-1">
                                    <div className="font-bold text-slate-800 flex items-center gap-2">
                                        ✨ Asistente Inteligente (God Mode)
                                    </div>
                                    <div className="text-xs text-slate-500 mt-0.5">
                                        El sistema buscará los mejores huecos y técnicos automáticamente.
                                    </div>
                                </div>
                            </label>

                            <label className="flex items-center gap-3 p-4 bg-white border border-slate-200 rounded-xl cursor-pointer hover:border-blue-300 transition group shadow-sm opacity-60 hover:opacity-100">
                                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${techId !== 'smart' ? 'border-blue-500 bg-blue-500' : 'border-slate-300'}`}>
                                    {techId !== 'smart' && <div className="w-2 h-2 bg-white rounded-full" />}
                                </div>
                                <input
                                    type="radio"
                                    name="assignMode"
                                    className="hidden"
                                    checked={techId !== 'smart'}
                                    onChange={() => setTechId('')} // Reset to no assign
                                />
                                <div className="flex-1">
                                    <div className="font-bold text-slate-800">
                                        Solo Crear (Pendiente de Asignar)
                                    </div>
                                    <div className="text-xs text-slate-500 mt-0.5">
                                        El ticket se guardará como "Solicitado". Podrás asignarlo después.
                                    </div>
                                </div>
                            </label>
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
