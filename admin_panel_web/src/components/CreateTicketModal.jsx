import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { X, Save, User, Smartphone, Plus, Clock, Sparkles, AlertCircle, Zap, MapPin } from 'lucide-react';
import AgendaPicker from './AgendaPicker';
import SmartBrandSelector from './SmartBrandSelector';
import ClientSearchInput from './ClientSearchInput';
import ClientFormModal from './ClientFormModal';

// ════════════════════════════════════════════════════════════════════════════
// 🧠 SMART DIAGNOSIS ENGINE - Claude-Ready Architecture
// ════════════════════════════════════════════════════════════════════════════

/**
 * AI Diagnosis with fallback to local rules
 * Structure: if (API_KEY) -> Claude API else -> Local Rules
 */
const getAIDiagnosis = async (type, brand, text) => {
    const ANTHROPIC_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY;

    // 🔮 CLAUDE API PATH (Future-ready)
    if (ANTHROPIC_KEY) {
        try {
            const response = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': ANTHROPIC_KEY,
                    'anthropic-version': '2023-06-01'
                },
                body: JSON.stringify({
                    model: 'claude-3-haiku-20240307',
                    max_tokens: 300,
                    messages: [{
                        role: 'user',
                        content: `Eres un técnico experto en reparación de electrodomésticos en España. 
                        
Equipo: ${type}
Marca: ${brand}
Problema reportado: "${text}"

Proporciona un diagnóstico técnico breve (máximo 3 líneas) con:
1. Posible causa del problema
2. Componentes a revisar
3. Si detectas un código de error (ej: F28, E01), explica su significado específico para esta marca.

Responde solo con el diagnóstico, sin introducciones.`
                    }]
                })
            });

            if (response.ok) {
                const data = await response.json();
                return data.content[0].text;
            }
        } catch (error) {
            console.warn('Claude API error, falling back to local rules:', error);
        }
    }

    // 📚 LOCAL RULES ENGINE (Always available)
    return getLocalDiagnosis(type, brand, text);
};

/**
 * Enhanced Local Diagnosis with real error codes from Spanish brands
 */
const getLocalDiagnosis = (type, brand, text) => {
    const t = text.toLowerCase();
    const b = brand?.toLowerCase() || '';

    // ═══════════════════════════════════════════════════════════════════
    // 🔥 CALDERAS Y CALENTADORES - Real Error Codes
    // ═══════════════════════════════════════════════════════════════════
    const boilerErrorCodes = {
        // VAILLANT
        'f28': { brands: ['vaillant'], diagnosis: 'Error F28 Vaillant: Fallo de encendido. Causas: electrodo de ionización sucio, válvula de gas defectuosa, presión de gas insuficiente, o placa electrónica fallando. Revisar presión de gas (≥18mbar) y limpiar electrodo.' },
        'f29': { brands: ['vaillant'], diagnosis: 'Error F29 Vaillant: Llama perdida durante funcionamiento. Verificar suministro de gas, presión constante, y electrodo de ionización. Comprobar ventilador y salida de humos.' },
        'f75': { brands: ['vaillant'], diagnosis: 'Error F75 Vaillant: Fallo sensor de presión. El sensor no detecta cambio al arrancar bomba. Revisar bomba circuladora, sensor de presión, aire en el circuito o presión baja (<0.8bar).' },
        'f22': { brands: ['vaillant'], diagnosis: 'Error F22 Vaillant: Presión de agua insuficiente (<0.5bar). Rellenar circuito hasta 1.2-1.5bar, revisar fugas en radiadores, válvulas y vaso de expansión.' },

        // JUNKERS / BOSCH
        'ea': { brands: ['junkers', 'bosch'], diagnosis: 'Error EA Junkers/Bosch: Fallo de ionización. No detecta llama. Revisar electrodo de encendido, cable de ionización, válvula de gas y presión de suministro.' },
        'er': { brands: ['junkers', 'bosch'], diagnosis: 'Error ER Junkers/Bosch: Fallo en evacuación de humos. Revisar ventilador, presostato de humos, conducto de evacuación obstruido.' },
        'e9': { brands: ['junkers', 'bosch'], diagnosis: 'Error E9 Junkers/Bosch: Termostato de seguridad activado. Posible falta de agua, bomba bloqueada, aire en el circuito o intercambiador obstruido.' },
        'c6': { brands: ['junkers', 'bosch'], diagnosis: 'Error C6 Junkers/Bosch: Ventilador no alcanza velocidad. Revisar ventilador, conexiones eléctricas y placa electrónica.' },

        // BAXI / ROCA
        'e01': { brands: ['baxi', 'roca'], diagnosis: 'Error E01 Baxi/Roca: Bloqueo por falta de encendido. Revisar electrodo, presión de gas, válvula de gas y placa de control.' },
        'e02': { brands: ['baxi', 'roca'], diagnosis: 'Error E02 Baxi/Roca: Termostato de seguridad activado. Verificar circulación de agua, bomba, y posible aire en el sistema.' },
        'e03': { brands: ['baxi', 'roca'], diagnosis: 'Error E03 Baxi/Roca: Problema de evacuación de humos. Revisar presostato, ventilador y conducto de salida.' },
        'e10': { brands: ['baxi', 'roca'], diagnosis: 'Error E10 Baxi/Roca: Presión de agua baja (<0.5bar). Rellenar circuito, revisar vaso expansión y posibles fugas.' },
        'e25': { brands: ['baxi', 'roca'], diagnosis: 'Error E25 Baxi/Roca: Falta circulación de agua. Bomba bloqueada, aire en el circuito, o válvulas cerradas.' },

        // SAUNIER DUVAL
        'f1': { brands: ['saunier duval', 'saunier'], diagnosis: 'Error F1 Saunier Duval: Fallo de presión de agua. Verificar presión del circuito (mín 0.8bar), rellenar si es necesario.' },
        'f2': { brands: ['saunier duval', 'saunier'], diagnosis: 'Error F2 Saunier Duval: Sonda NTC defectuosa. Revisar conexiones y resistencia de la sonda.' },
        'f28': { brands: ['saunier duval', 'saunier'], diagnosis: 'Error F28 Saunier Duval: Bloqueo de encendido. Similar a Vaillant: revisar electrodo, gas y válvula.' },

        // FERROLI
        'a01': { brands: ['ferroli'], diagnosis: 'Error A01 Ferroli: Bloqueo por fallo de encendido. Revisar electrodo de detección, transformador de encendido, válvula de gas.' },
        'a03': { brands: ['ferroli'], diagnosis: 'Error A03 Ferroli: Termostato de humos activado. Revisar conducto de evacuación, ventilador y presostato.' },
        'f04': { brands: ['ferroli'], diagnosis: 'Error F04 Ferroli: Sobrecalentamiento. Falta circulación, bomba defectuosa o aire en el sistema.' },

        // ARISTON
        '501': { brands: ['ariston'], diagnosis: 'Error 501 Ariston: Falta de encendido. Revisar electrodo, presión de gas, y válvula de gas.' },
        '504': { brands: ['ariston'], diagnosis: 'Error 504 Ariston: Falta de llama. Problema de ionización o suministro de gas.' },
        '108': { brands: ['ariston'], diagnosis: 'Error 108 Ariston: Presión baja. Rellenar circuito y revisar vaso de expansión.' },

        // COINTRA
        'e0': { brands: ['cointra'], diagnosis: 'Error E0 Cointra: Fallo de encendido. Revisar pilas (si corresponde), electrodo, membrana y presión de agua.' },
        'e1': { brands: ['cointra'], diagnosis: 'Error E1 Cointra: Sobrecalentamiento. Verificar caudal de agua, calcificación y sensor.' },
    };

    // ═══════════════════════════════════════════════════════════════════
    // 🌀 LAVADORAS - Real Error Codes
    // ═══════════════════════════════════════════════════════════════════
    const washerErrorCodes = {
        // BOSCH / SIEMENS
        'e18': { brands: ['bosch', 'siemens'], diagnosis: 'Error E18 Bosch/Siemens: Bomba de desagüe bloqueada. Limpiar filtro de bomba, revisar manguera de desagüe y aspas de la bomba.' },
        'f21': { brands: ['bosch', 'siemens'], diagnosis: 'Error F21 Bosch/Siemens: Motor no gira. Posible fallo de escobillas, motor o módulo de control.' },
        'e17': { brands: ['bosch', 'siemens'], diagnosis: 'Error E17 Bosch/Siemens: No detecta entrada de agua. Revisar electroválvula, grifo abierto, presión de agua.' },

        // LG
        'oe': { brands: ['lg'], diagnosis: 'Error OE LG: Problema de desagüe. Filtro obstruido, manguera doblada o bomba defectuosa.' },
        'ue': { brands: ['lg'], diagnosis: 'Error UE LG: Carga desequilibrada. Redistribuir ropa. Si persiste, revisar amortiguadores y rodamientos.' },
        'de': { brands: ['lg'], diagnosis: 'Error dE LG: Puerta no cerrada correctamente. Revisar blocapuerta, bisagras y sensor.' },
        'le': { brands: ['lg'], diagnosis: 'Error LE LG: Motor bloqueado o rotor defectuoso. Revisar motor de inversión directa y sensores.' },

        // SAMSUNG
        'dc': { brands: ['samsung'], diagnosis: 'Error dC Samsung: Puerta abierta durante ciclo. Verificar blocapuerta y sensor de puerta.' },
        'nd': { brands: ['samsung'], diagnosis: 'Error nd Samsung: No desagua. Revisar filtro, bomba y manguera de desagüe.' },
        '4e': { brands: ['samsung'], diagnosis: 'Error 4E Samsung: No entra agua. Revisar grifos, electroválvula y presión de agua.' },

        // WHIRLPOOL / INDESIT
        'f08': { brands: ['whirlpool', 'indesit'], diagnosis: 'Error F08 Whirlpool/Indesit: Fallo de calentamiento. Revisar resistencia, termostato y conexiones.' },
        'f05': { brands: ['whirlpool', 'indesit'], diagnosis: 'Error F05 Whirlpool/Indesit: Sonda NTC defectuosa. Comprobar resistencia del sensor.' },
        'f06': { brands: ['whirlpool', 'indesit'], diagnosis: 'Error F06 Whirlpool/Indesit: Problema de tacómetro. Revisar sensor de motor y escobillas.' },

        // ELECTROLUX / AEG / ZANUSSI
        'e20': { brands: ['electrolux', 'aeg', 'zanussi'], diagnosis: 'Error E20 Electrolux/AEG: Problema de desagüe. Filtro, bomba o manguera obstruidos.' },
        'e10': { brands: ['electrolux', 'aeg', 'zanussi'], diagnosis: 'Error E10 Electrolux/AEG: No entra agua. Electroválvula, grifo o filtro de entrada.' },
        'e40': { brands: ['electrolux', 'aeg', 'zanussi'], diagnosis: 'Error E40 Electrolux/AEG: Puerta no cierra. Blocapuerta defectuoso o bisagra rota.' },
    };

    // ═══════════════════════════════════════════════════════════════════
    // ❄️ AIRES ACONDICIONADOS - Common Error Codes
    // ═══════════════════════════════════════════════════════════════════
    const acErrorCodes = {
        'e1': { brands: ['daikin', 'mitsubishi', 'fujitsu'], diagnosis: 'Error E1: Fallo de comunicación entre unidades. Revisar cableado, conexiones y placas electrónicas.' },
        'e6': { brands: ['daikin', 'mitsubishi'], diagnosis: 'Error E6: Fallo de compresor. Revisar presiones de gas, condensador y alimentación eléctrica.' },
        'p1': { brands: ['samsung', 'lg'], diagnosis: 'Error P1: Protección de sobrecarga. Revisar voltaje, compresor y ventilador.' },
    };

    // Search for error codes in text
    const errorCodePattern = /([a-z]?\d{1,3}|[a-z]{1,2}\d{1,2})/gi;
    const foundCodes = text.match(errorCodePattern) || [];

    for (const code of foundCodes) {
        const lowerCode = code.toLowerCase();

        // Check boiler codes
        if (['Calentador de Gas', 'Caldera', 'Termo Eléctrico'].includes(type)) {
            const boilerMatch = boilerErrorCodes[lowerCode];
            if (boilerMatch) {
                const brandMatch = boilerMatch.brands.some(brand => b.includes(brand));
                if (brandMatch || boilerMatch.brands.length === 0) {
                    return boilerMatch.diagnosis;
                }
            }
        }

        // Check washer codes
        if (['Lavadora', 'Lavasecadora', 'Secadora'].includes(type)) {
            const washerMatch = washerErrorCodes[lowerCode];
            if (washerMatch) {
                const brandMatch = washerMatch.brands.some(brand => b.includes(brand));
                if (brandMatch || washerMatch.brands.length === 0) {
                    return washerMatch.diagnosis;
                }
            }
        }

        // Check AC codes
        if (type === 'Aire Acondicionado') {
            const acMatch = acErrorCodes[lowerCode];
            if (acMatch) {
                return acMatch.diagnosis;
            }
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    // 🔧 GENERIC SYMPTOM-BASED DIAGNOSIS (Fallback)
    // ═══════════════════════════════════════════════════════════════════
    const patterns = {
        'Lavadora': [
            { k: ['agua', 'no saca', 'desagua', 'desague'], d: 'Posible obstrucción en bomba de desagüe o filtro sucio. Revisar manguera y aspas de bomba.' },
            { k: ['centrifuga', 'gira', 'tambor', 'rueda'], d: 'Revisar escobillas del motor, condensador o correa de transmisión. Comprobar tacómetro.' },
            { k: ['enciende', 'muerta', 'no arranca'], d: 'Fallo en placa electrónica o fusible de entrada. Comprobar tensión y blocapuerta.' },
            { k: ['ruido', 'golpes', 'vibra'], d: 'Rodamientos desgastados, amortiguadores vencidos o contrapesos sueltos.' },
            { k: ['puerta', 'cierra', 'bloqueada'], d: 'Blocapuertas defectuoso, maneta rota o bisagra desalineada.' },
            { k: ['huele', 'olor', 'moho'], d: 'Limpieza de goma de puerta, filtro y ciclo de limpieza a 90°C con vinagre.' }
        ],
        'Aire Acondicionado': [
            { k: ['enfria', 'calienta', 'gas', 'frio'], d: 'Posible fuga de refrigerante o fallo en compresor. Verificar presiones y carga de gas.' },
            { k: ['gotea', 'agua', 'charco'], d: 'Drenaje obstruido o bandeja de condensados llena. Limpiar desagüe y verificar inclinación.' },
            { k: ['enciende', 'mando', 'control'], d: 'Revisar pilas del mando, receptor IR en unidad interior y placa de control.' },
            { k: ['olor', 'huele'], d: 'Filtros sucios o baterías con moho. Limpieza profesional de evaporador urgente.' },
            { k: ['ruido', 'vibra'], d: 'Ventilador rozando, compresor defectuoso o tornillería suelta en unidad exterior.' }
        ],
        'Refrigerador': [
            { k: ['enfria', 'calienta', 'temperatura'], d: 'Compresor no arranca (clixon/relé) o falta de gas refrigerante. Revisar ventilador evaporador.' },
            { k: ['hielo', 'escarcha', 'congela'], d: 'Fallo en sistema No-Frost: resistencia de descarche, bimetal o timer.' },
            { k: ['ruido', 'hace ruido'], d: 'Ventilador rozando o compresor con problema mecánico.' },
            { k: ['agua', 'charco', 'gotea'], d: 'Desagüe de deshielo obstruido. Limpiar canal y orificio de drenaje.' }
        ],
        'Calentador de Gas': [
            { k: ['enciende', 'chispa', 'no arranca'], d: 'Revisar pilas (si aplica), membrana de agua, electrodo y servoválvula de gas.' },
            { k: ['apaga', 'se para', 'corta'], d: 'Sensor de tiro, termopar defectuoso o sonda de temperatura fallando.' },
            { k: ['poca agua', 'presion', 'caudal'], d: 'Serpentín calcificado. Requiere limpieza química con desincrustante.' },
            { k: ['huele', 'gas', 'olor'], d: '⚠️ URGENTE: Posible fuga de gas. Cortar suministro y ventilar. Revisión inmediata.' }
        ],
        'Lavavajillas': [
            { k: ['limpia', 'sucio', 'manchas'], d: 'Revisar aspersores obstruidos, dosificador de detergente y temperatura de agua.' },
            { k: ['agua', 'queda', 'desagua'], d: 'Bomba de desagüe, filtros o válvula antirretorno obstruidos.' },
            { k: ['ruido', 'golpes'], d: 'Aspersores rozando, bomba de circulación o rodamientos desgastados.' }
        ]
    };

    const typeRules = patterns[type] || [];
    const match = typeRules.find(r => r.k.some(key => t.includes(key)));

    if (match) {
        return `${brand ? brand + ': ' : ''}${match.d}`;
    }

    // Default fallback
    const defaults = {
        'Lavadora': 'Inspección general: motor, placa electrónica y sistema hidráulico.',
        'Aire Acondicionado': 'Verificar presiones, saltos térmicos y limpieza de componentes.',
        'Refrigerador': 'Comprobar temperaturas, ciclo de compresor y sistema de descarche.',
        'Calentador de Gas': 'Revisar circuito de gas, evacuación de humos y seguridades.',
        'Caldera': 'Inspección completa: circulador, vaso expansión, presostato y sondas.',
        'default': 'Diagnóstico pendiente. Inspección general requerida.'
    };

    return defaults[type] || defaults['default'];
};

// ════════════════════════════════════════════════════════════════════════════
// 📝 MAIN COMPONENT
// ════════════════════════════════════════════════════════════════════════════

const CreateTicketModal = ({ onClose, onSuccess, title = 'Nuevo Servicio', submitLabel = 'Crear Ticket', warrantyClaimFrom = null }) => {
    const [loading, setLoading] = useState(false);
    const [showAgenda, setShowAgenda] = useState(false);
    const [showClientModal, setShowClientModal] = useState(false);

    // Data Sources
    const [clients, setClients] = useState([]);
    const [techs, setTechs] = useState([]);
    const [serviceTypes, setServiceTypes] = useState([]);

    // Form State - Ticket
    const [clientId, setClientId] = useState('');
    const [techId, setTechId] = useState('smart');
    const [serviceTypeId, setServiceTypeId] = useState('');
    const [applianceType, setApplianceType] = useState('Lavadora');
    const [applianceBrand, setApplianceBrand] = useState('');
    const [applianceModel, setApplianceModel] = useState('');
    const [selectedBrandId, setSelectedBrandId] = useState(null);
    const [description, setDescription] = useState('');
    const [aiDiagnosis, setAiDiagnosis] = useState('');
    const [isAnalyzing, setIsAnalyzing] = useState(false);

    // Client Addresses
    const [clientAddresses, setClientAddresses] = useState([]);
    const [selectedAddressId, setSelectedAddressId] = useState('');
    const [loadingAddresses, setLoadingAddresses] = useState(false);

    // Form State - Schedule
    const [appointmentDate, setAppointmentDate] = useState('');
    const [appointmentTime, setAppointmentTime] = useState('');
    const [duration, setDuration] = useState(60);

    // Helper for Required Label
    const Label = ({ text, required = false }) => (
        <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5 flex items-center gap-1">
            {text} {required && <span className="text-amber-500 text-base leading-none">*</span>}
        </label>
    );

    useEffect(() => {
        fetchData();
    }, []);

    // PRE-FILL WARRANTY DATA
    useEffect(() => {
        if (warrantyClaimFrom) {
            setClientId(warrantyClaimFrom.client_id);
            setApplianceType(warrantyClaimFrom.appliance_info?.type || 'Lavadora');
            setApplianceBrand(warrantyClaimFrom.appliance_info?.brand || '');
            setApplianceModel(warrantyClaimFrom.appliance_info?.model || '');
            setDescription(`RECLAMACIÓN GARANTÍA (Ticket #${warrantyClaimFrom.ticket_number}): `);
        }
    }, [warrantyClaimFrom]);

    // Smart AI Diagnosis with debounce
    useEffect(() => {
        if (description.length < 10) {
            setAiDiagnosis('');
            return;
        }

        const timer = setTimeout(async () => {
            setIsAnalyzing(true);
            try {
                const diagnosis = await getAIDiagnosis(applianceType, applianceBrand, description);
                setAiDiagnosis(diagnosis);
            } catch (error) {
                console.error('Diagnosis error:', error);
            } finally {
                setIsAnalyzing(false);
            }
        }, 800);

        return () => clearTimeout(timer);
    }, [description, applianceType, applianceBrand]);

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

    // Fetch client addresses when client is selected
    useEffect(() => {
        if (!clientId) {
            setClientAddresses([]);
            setSelectedAddressId('');
            return;
        }

        const fetchClientAddresses = async () => {
            setLoadingAddresses(true);
            try {
                const { data, error } = await supabase
                    .from('client_addresses')
                    .select('*')
                    .eq('client_id', clientId)
                    .order('is_primary', { ascending: false })
                    .order('label');

                if (!error && data) {
                    setClientAddresses(data);
                    // Auto-select primary address
                    const primary = data.find(a => a.is_primary);
                    if (primary) {
                        setSelectedAddressId(primary.id);
                    } else if (data.length > 0) {
                        setSelectedAddressId(data[0].id);
                    }
                }
            } catch (err) {
                console.error('Error fetching addresses:', err);
            } finally {
                setLoadingAddresses(false);
            }
        };

        fetchClientAddresses();
    }, [clientId]);

    const handleServiceTypeChange = (e) => {
        const id = e.target.value;
        setServiceTypeId(id);
        const type = serviceTypes.find(t => t.id === id);
        if (type) {
            setDuration(type.estimated_duration_min);
        }
    };

    // Handle new client created from modal
    const handleClientCreated = (newClient) => {
        // Add to clients list
        setClients(prev => [newClient, ...prev]);
        // Auto-select
        setClientId(newClient.id);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);

        let finalClientId = clientId;

        // Schedule Logic
        let scheduledAt = null;
        let appointmentSt = 'pending';
        let ticketStatus = 'solicitado';
        let assignedTech = null;

        if (techId === 'smart') {
            ticketStatus = 'solicitado';
            appointmentSt = 'pending';
            assignedTech = null;
        } else if (techId) {
            if (appointmentDate) {
                const timePart = appointmentTime || '09:00';
                scheduledAt = new Date(`${appointmentDate}T${timePart}:00`).toISOString();
                appointmentSt = 'confirmed';
                ticketStatus = 'asignado';
                assignedTech = techId;
            } else {
                ticketStatus = 'asignado';
                assignedTech = techId;
            }
        } else {
            ticketStatus = 'solicitado';
            appointmentSt = 'pending';
            assignedTech = null;
        }

        // Validation for double booking (if manual assignment)
        if (assignedTech && scheduledAt && techId !== 'smart') {
            const newStart = new Date(scheduledAt);
            const newEnd = new Date(newStart.getTime() + (duration * 60000));
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

        // Create Ticket
        const applianceInfo = {
            type: applianceType,
            brand: applianceBrand,
            model: applianceModel
        };

        const { data: newTicket, error: ticketError } = await supabase
            .from('tickets')
            .insert({
                client_id: finalClientId,
                address_id: selectedAddressId || null,
                technician_id: assignedTech || null,
                service_type_id: serviceTypeId || null,
                brand_id: selectedBrandId || null,
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
            if (techId === 'smart' && newTicket) {
                onSuccess(newTicket, true);
            } else {
                onSuccess(newTicket, false);
            }
            onClose();
        }
    };

    return (
        <>
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-40 p-4">
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden max-h-[90vh] overflow-y-auto">
                    {/* Header */}
                    <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-gradient-to-r from-slate-50 to-blue-50 sticky top-0 z-10">
                        <div>
                            <h2 className="text-lg font-bold text-slate-800">{title}</h2>
                            <p className="text-xs text-slate-500">Complete la información del servicio</p>
                        </div>
                        <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-white rounded-lg transition-colors">
                            <X size={20} />
                        </button>
                    </div>

                    <form onSubmit={handleSubmit} className="p-6 space-y-6">

                        {/* ═══════════════════════════════════════════════════════════════ */}
                        {/* SECTION 1: CLIENT */}
                        {/* ═══════════════════════════════════════════════════════════════ */}
                        <div className="bg-gradient-to-br from-slate-50 to-blue-50/30 p-5 rounded-2xl border border-slate-200">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="font-bold text-slate-700 flex items-center gap-2">
                                    <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white">
                                        <User size={16} />
                                    </div>
                                    Cliente
                                </h3>
                                {!warrantyClaimFrom && (
                                    <button
                                        type="button"
                                        onClick={() => setShowClientModal(true)}
                                        className="flex items-center gap-1.5 text-sm text-blue-600 font-bold hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-colors"
                                    >
                                        <Plus size={14} />
                                        Nuevo Cliente
                                    </button>
                                )}
                            </div>

                            <ClientSearchInput
                                value={clientId}
                                onChange={setClientId}
                                disabled={!!warrantyClaimFrom}
                                placeholder="Buscar por nombre, teléfono o dirección..."
                            />

                            {/* Address Selector - Shows when client has addresses */}
                            {clientId && clientAddresses.length > 0 && (
                                <div className="mt-4 animate-in slide-in-from-top-2">
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5 flex items-center gap-1">
                                        <MapPin size={12} className="text-blue-500" />
                                        Dirección del Servicio
                                        <span className="text-amber-500 text-base leading-none">*</span>
                                    </label>
                                    <select
                                        value={selectedAddressId}
                                        onChange={e => setSelectedAddressId(e.target.value)}
                                        className="w-full p-3 border border-slate-200 rounded-xl bg-white focus:ring-2 focus:ring-blue-500 transition-all"
                                        required
                                    >
                                        {clientAddresses.map(addr => (
                                            <option key={addr.id} value={addr.id}>
                                                {addr.is_primary && '⭐ '}
                                                {addr.label || 'Sin etiqueta'}: {addr.address_line}
                                            </option>
                                        ))}
                                    </select>
                                    <p className="text-[10px] text-slate-500 mt-1">
                                        {clientAddresses.length} dirección(es) registrada(s) para este cliente
                                    </p>
                                </div>
                            )}

                            {/* No addresses warning */}
                            {clientId && !loadingAddresses && clientAddresses.length === 0 && (
                                <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800 flex items-center gap-2 animate-in fade-in">
                                    <AlertCircle size={16} />
                                    Este cliente no tiene direcciones registradas. Se usará la dirección del perfil.
                                </div>
                            )}
                        </div>

                        {/* ═══════════════════════════════════════════════════════════════ */}
                        {/* SECTION 2: SERVICE DETAILS */}
                        {/* ═══════════════════════════════════════════════════════════════ */}
                        <div className="space-y-4">
                            <h3 className="font-bold text-slate-700 flex items-center gap-2">
                                <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white">
                                    <Smartphone size={16} />
                                </div>
                                Detalles del Servicio
                            </h3>

                            {/* Service Type */}
                            <div>
                                <Label text="Tipo de Servicio" />
                                <select
                                    className="w-full p-3 border border-blue-200 bg-blue-50/50 rounded-xl font-medium text-slate-800 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
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

                            {/* Appliance Type & Brand */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <Label text="Tipo de Equipo" />
                                    <select
                                        className={`w-full p-3 border border-slate-200 rounded-xl ${warrantyClaimFrom ? 'bg-slate-100 text-slate-500' : 'bg-white'} focus:ring-2 focus:ring-blue-500 transition-all`}
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

                            {/* Problem Description */}
                            <div>
                                <Label text="Descripción del Problema" required />
                                <textarea
                                    required
                                    rows={3}
                                    className="w-full p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all resize-none"
                                    placeholder="Describe el problema... (incluye códigos de error si los hay, ej: F28, E01)"
                                    value={description}
                                    onChange={e => setDescription(e.target.value)}
                                />
                            </div>

                            {/* AI Diagnosis Section */}
                            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 p-4 rounded-xl border border-blue-200 relative overflow-hidden">
                                {/* Decorative gradient */}
                                <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-blue-400/10 to-indigo-400/10 rounded-full -mr-16 -mt-16" />

                                <div className="flex justify-between items-center mb-2 relative z-10">
                                    <label className="text-xs font-bold text-blue-700 uppercase flex items-center gap-2">
                                        <Sparkles size={14} className="text-blue-500" />
                                        Diagnóstico Inteligente
                                    </label>
                                    <div className="flex items-center gap-2">
                                        {isAnalyzing && (
                                            <span className="text-[10px] text-blue-500 flex items-center gap-1">
                                                <div className="w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                                                Analizando...
                                            </span>
                                        )}
                                        <span className="text-[10px] px-2 py-0.5 bg-blue-200/50 text-blue-800 rounded-full font-bold">
                                            Auto-detecta códigos de error
                                        </span>
                                    </div>
                                </div>
                                <textarea
                                    rows={2}
                                    className="w-full p-3 border border-blue-200 rounded-xl bg-white text-sm text-slate-700 focus:ring-2 focus:ring-blue-500 transition-all"
                                    value={aiDiagnosis}
                                    onChange={e => setAiDiagnosis(e.target.value)}
                                    placeholder="El diagnóstico aparecerá automáticamente al escribir el problema..."
                                />
                                <p className="text-[10px] text-blue-600/70 mt-2 flex items-center gap-1">
                                    <AlertCircle size={10} />
                                    Visible solo para técnicos y administradores
                                </p>
                            </div>
                        </div>

                        {/* ═══════════════════════════════════════════════════════════════ */}
                        {/* SECTION 3: ASSIGNMENT MODE */}
                        {/* ═══════════════════════════════════════════════════════════════ */}
                        <div className="bg-gradient-to-br from-slate-50 to-purple-50/30 p-5 rounded-2xl border border-slate-200">
                            <h3 className="font-bold text-slate-700 mb-4 flex items-center gap-2">
                                <div className="w-8 h-8 bg-purple-600 rounded-lg flex items-center justify-center text-white">
                                    <Clock size={16} />
                                </div>
                                Asignación
                            </h3>

                            <div className="space-y-3">
                                {/* Smart Mode */}
                                <label className={`flex items-center gap-4 p-4 bg-white border-2 rounded-xl cursor-pointer transition-all ${techId === 'smart' ? 'border-blue-500 shadow-lg shadow-blue-500/10' : 'border-slate-200 hover:border-slate-300'}`}>
                                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${techId === 'smart' ? 'border-blue-500 bg-blue-500' : 'border-slate-300'}`}>
                                        {techId === 'smart' && <div className="w-2 h-2 bg-white rounded-full" />}
                                    </div>
                                    <input
                                        type="radio"
                                        name="assignMode"
                                        className="hidden"
                                        checked={techId === 'smart'}
                                        onChange={() => { setTechId('smart'); setDuration(60); }}
                                    />
                                    <div className="flex-1">
                                        <div className="font-bold text-slate-800 flex items-center gap-2">
                                            <Zap size={16} className="text-amber-500" />
                                            Asistente Inteligente (Recomendado)
                                        </div>
                                        <div className="text-xs text-slate-500 mt-0.5">
                                            El sistema encontrará los mejores huecos y técnicos automáticamente.
                                        </div>
                                    </div>
                                </label>

                                {/* Manual/Pending Mode */}
                                <label className={`flex items-center gap-4 p-4 bg-white border-2 rounded-xl cursor-pointer transition-all ${techId !== 'smart' ? 'border-blue-500 shadow-lg shadow-blue-500/10' : 'border-slate-200 hover:border-slate-300 opacity-70 hover:opacity-100'}`}>
                                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${techId !== 'smart' ? 'border-blue-500 bg-blue-500' : 'border-slate-300'}`}>
                                        {techId !== 'smart' && <div className="w-2 h-2 bg-white rounded-full" />}
                                    </div>
                                    <input
                                        type="radio"
                                        name="assignMode"
                                        className="hidden"
                                        checked={techId !== 'smart'}
                                        onChange={() => setTechId('')}
                                    />
                                    <div className="flex-1">
                                        <div className="font-bold text-slate-800">
                                            Solo Crear (Pendiente)
                                        </div>
                                        <div className="text-xs text-slate-500 mt-0.5">
                                            Se guardará como "Solicitado". Asignar después manualmente.
                                        </div>
                                    </div>
                                </label>
                            </div>
                        </div>

                        {/* ═══════════════════════════════════════════════════════════════ */}
                        {/* ACTION BUTTONS */}
                        {/* ═══════════════════════════════════════════════════════════════ */}
                        <div className="pt-4 flex justify-end gap-3 border-t border-slate-100">
                            <button
                                type="button"
                                onClick={onClose}
                                className="px-5 py-2.5 text-slate-500 hover:bg-slate-100 rounded-xl font-medium transition"
                            >
                                Cancelar
                            </button>
                            <button
                                type="submit"
                                disabled={loading || !clientId}
                                className="px-6 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl font-bold hover:from-blue-700 hover:to-indigo-700 shadow-lg shadow-blue-600/20 hover:-translate-y-0.5 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
                            >
                                {loading ? (
                                    <>
                                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                        Guardando...
                                    </>
                                ) : (
                                    <>
                                        <Save size={18} />
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

            {/* CLIENT FORM MODAL (Google Maps) */}
            <ClientFormModal
                isOpen={showClientModal}
                onClose={() => setShowClientModal(false)}
                onSuccess={handleClientCreated}
                context="service-creation"
                onSelectExisting={(existingClient) => {
                    // Auto-select existing client for the ticket
                    setClientId(existingClient.id);
                    setClients(prev => {
                        // Add to list if not already there
                        if (!prev.find(c => c.id === existingClient.id)) {
                            return [existingClient, ...prev];
                        }
                        return prev;
                    });
                    setShowClientModal(false);
                }}
            />
        </>
    );
};

export default CreateTicketModal;
