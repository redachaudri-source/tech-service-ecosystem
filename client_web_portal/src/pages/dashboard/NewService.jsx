import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronLeft, Save, MapPin, Phone, AlertCircle, Wrench, Camera, HelpCircle, X, Image as ImageIcon, Star, ChevronDown } from 'lucide-react';
import SmartBrandSelector from '../../components/SmartBrandSelector';
import AppointmentSelectorModal from '../../components/AppointmentSelectorModal';

const NewService = () => {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [profile, setProfile] = useState(null);
    const [showHelp, setShowHelp] = useState(false);

    // Address selection state
    const [addresses, setAddresses] = useState([]);
    const [selectedAddressId, setSelectedAddressId] = useState(null);
    const [showAddressSelector, setShowAddressSelector] = useState(false);

    // PRO Mode - Appointment Selector
    const [showAppointmentModal, setShowAppointmentModal] = useState(false);
    const [pendingSlots, setPendingSlots] = useState([]);
    const [createdTicketId, setCreatedTicketId] = useState(null);
    const [ticketInfoForModal, setTicketInfoForModal] = useState({});
    const [appointmentTimeoutMinutes, setAppointmentTimeoutMinutes] = useState(3);

    const [formData, setFormData] = useState({
        type: 'Lavadora',
        brand: '',
        brand_id: null,
        model: '',
        description_failure: '',
        address: '',
        phone: '',
        label_image_url: ''
    });

    const [applianceTypes, setApplianceTypes] = useState([]);
    const [serviceTypes, setServiceTypes] = useState([]);
    const [selectedServiceTypeId, setSelectedServiceTypeId] = useState('');

    useEffect(() => {
        const fetchTypes = async () => {
            const { data: appTypes } = await supabase.from('appliance_types').select('name').order('name');
            const { data: servTypes } = await supabase.from('service_types').select('id, name').eq('is_active', true);

            if (appTypes) setApplianceTypes(appTypes.map(t => t.name));
            if (servTypes) {
                setServiceTypes(servTypes);
                const defaultType = servTypes.find(t => t.name.toLowerCase().includes('reparación') || t.name.toLowerCase().includes('estándar'));
                if (defaultType) setSelectedServiceTypeId(defaultType.id);
            }
        };
        fetchTypes();
    }, []);

    const [searchParams] = useSearchParams();
    const applianceId = searchParams.get('from_appliance');

    useEffect(() => {
        fetchProfile();
        if (applianceId) fetchApplianceData(applianceId);
    }, [applianceId]);

    const fetchApplianceData = async (id) => {
        try {
            const { data, error } = await supabase
                .from('client_appliances')
                .select('*')
                .eq('id', id)
                .single();

            if (error) throw error;
            if (data) {
                setFormData(prev => ({
                    ...prev,
                    type: data.type || prev.type,
                    brand: data.brand || '',
                    model: data.model || '',
                    label_image_url: data.photo_url || ''
                }));
                // If appliance has address_id, pre-select it
                if (data.address_id) setSelectedAddressId(data.address_id);
            }
        } catch (err) {
            console.error('Error fetching appliance:', err);
        }
    };

    const fetchProfile = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single();
            if (data) {
                setProfile(data);
                setFormData(prev => ({
                    ...prev,
                    address: data.address || '',
                    phone: data.phone || ''
                }));
            }

            // Load client addresses
            const { data: addressData } = await supabase
                .from('client_addresses')
                .select('*')
                .eq('client_id', user.id)
                .order('address_order', { ascending: true });

            if (addressData && addressData.length > 0) {
                setAddresses(addressData);
                // Auto-select primary or first
                const primary = addressData.find(a => a.is_primary) || addressData[0];
                setSelectedAddressId(primary.id);
                setFormData(prev => ({ ...prev, address: primary.address_line }));
            }
        }
    };

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleAddressSelect = (addr) => {
        setSelectedAddressId(addr.id);
        setFormData(prev => ({ ...prev, address: addr.address_line }));
        setShowAddressSelector(false);
    };

    const handleImageUpload = async (e) => {
        try {
            setUploading(true);
            const file = e.target.files[0];
            if (!file) return;

            const fileExt = file.name.split('.').pop();
            const fileName = `${Math.random()}.${fileExt}`;
            const filePath = `labels/${fileName}`;

            // Upload to Supabase
            const { error: uploadError } = await supabase.storage
                .from('service-attachments')
                .upload(filePath, file);

            if (uploadError) throw uploadError;

            // Get Public URL
            const { data: { publicUrl } } = supabase.storage
                .from('service-attachments')
                .getPublicUrl(filePath);

            setFormData(prev => ({ ...prev, label_image_url: publicUrl }));

        } catch (error) {
            alert('Error subiendo imagen: ' + error.message);
        } finally {
            setUploading(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error('Usuario no autenticado');

            // Create ticket
            const { data: ticketData, error } = await supabase
                .from('tickets')
                .insert([
                    {
                        client_id: user.id,
                        status: 'solicitado',
                        description_failure: formData.description_failure,
                        appliance_id: applianceId || null,
                        address_id: selectedAddressId || null,
                        appliance_info: {
                            type: formData.type,
                            brand: formData.brand,
                            model: formData.model,
                            label_image_url: formData.label_image_url
                        },
                        brand_id: formData.brand_id || null,
                        service_type_id: selectedServiceTypeId || null,
                        origin_source: 'client_web'
                    }
                ])
                .select('id')
                .single();

            if (error) throw error;

            const ticketId = ticketData.id;
            console.log('[NewService] Ticket created:', ticketId);

            // Check if PRO mode is enabled
            const { data: secretaryModeConfig } = await supabase
                .from('business_config')
                .select('value')
                .eq('key', 'secretary_mode')
                .single();

            const { data: proConfigData } = await supabase
                .from('business_config')
                .select('value')
                .eq('key', 'pro_config')
                .single();

            const secretaryMode = secretaryModeConfig?.value || 'basic';
            const proConfig = proConfigData?.value || { channels: { app: false } };

            // PRO mode: no bloquear la creación, el bot propondrá citas en segundo plano
            if ((secretaryMode ?? '').toString().toLowerCase() === 'pro' && proConfig.channels?.app) {
                console.log('[NewService] PRO mode active. Ticket created; proposal will be generated asynchronously.');
            }

            // BASIC mode or no slots available - navigate normally
            alert('¡Solicitud enviada! Ref: #' + ticketId + '\n\nTe contactaremos pronto para coordinar la cita.');
            navigate('/dashboard');

        } catch (error) {
            console.error('Error creating ticket:', error);
            alert('Error al crear la solicitud: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    // Fetch available slots for PRO mode
    const fetchAvailableSlots = async (addressId, proConfig) => {
        try {
            // Get postal code from selected address
            let postalCode = null;
            if (addressId) {
                const selectedAddr = addresses.find(a => a.id === addressId);
                postalCode = selectedAddr?.postal_code || null;
            }

            const slotsCount = proConfig.slots_count || 3;
            const searchDays = proConfig.search_days || 7;

            // Get active technicians from profiles table
            const { data: technicians, error: techError } = await supabase
                .from('profiles')
                .select('id, full_name, is_active')
                .eq('role', 'tech')
                .eq('is_deleted', false);

            console.log('[PRO] Technicians query result:', technicians?.length, techError);

            if (techError) {
                console.error('[PRO] Error fetching technicians:', techError);
                return [];
            }

            if (!technicians || technicians.length === 0) {
                console.log('[PRO] No technicians found');
                return [];
            }

            // Filter only active technicians
            const activeTechs = technicians.filter(t => t.is_active !== false);

            console.log('[PRO] Active technicians:', activeTechs.length);

            if (activeTechs.length === 0) {
                console.log('[PRO] No active technicians');
                return [];
            }

            // For now, use all active techs (postal code filtering can be added later with proper column)
            const validTechs = activeTechs;

            if (validTechs.length === 0) return [];

            // Get busy slots
            const startDate = new Date();
            const endDate = new Date();
            endDate.setDate(endDate.getDate() + searchDays);

            const { data: busySlots } = await supabase
                .from('tickets')
                .select('technician_id, scheduled_at')
                .in('technician_id', validTechs.map(t => t.id))
                .not('scheduled_at', 'is', null)
                .gte('scheduled_at', startDate.toISOString())
                .lte('scheduled_at', endDate.toISOString())
                .in('status', ['asignado', 'en_camino', 'en_proceso']);

            // Build busy map (scheduled_at is timestamptz)
            const busyMap = new Map();
            if (busySlots) {
                for (const slot of busySlots) {
                    const slotDate = new Date(slot.scheduled_at);
                    const dateStr = slotDate.toISOString().split('T')[0];
                    const timeStr = `${slotDate.getUTCHours().toString().padStart(2, '0')}:00`;
                    const key = `${slot.technician_id}_${dateStr}`;
                    if (!busyMap.has(key)) busyMap.set(key, new Set());
                    busyMap.get(key).add(timeStr);
                }
            }

            // Generate available slots
            const timeSlots = ['09:00', '11:00', '13:00', '16:00', '18:00'];
            const slots = [];

            for (let d = 1; d <= searchDays && slots.length < slotsCount; d++) {
                const checkDate = new Date();
                checkDate.setDate(checkDate.getDate() + d);
                const dayOfWeek = checkDate.getDay();

                // Skip weekends
                if (dayOfWeek === 0 || dayOfWeek === 6) continue;

                const dateStr = checkDate.toISOString().split('T')[0];

                for (const tech of validTechs) {
                    if (slots.length >= slotsCount) break;

                    const busyKey = `${tech.id}_${dateStr}`;
                    const busyTimes = busyMap.get(busyKey) || new Set();

                    for (const time of timeSlots) {
                        if (slots.length >= slotsCount) break;
                        if (busyTimes.has(time)) continue;

                        const startHour = parseInt(time.split(':')[0]);
                        const endHour = startHour + 2;
                        const endTime = `${endHour.toString().padStart(2, '0')}:00`;

                        slots.push({
                            date: dateStr,
                            time_start: time,
                            time_end: endTime,
                            technician_id: tech.id,
                            technician_name: tech.full_name
                        });

                        busyTimes.add(time);
                        busyMap.set(busyKey, busyTimes);
                        break;
                    }
                }
            }

            return slots;
        } catch (e) {
            console.error('Error fetching slots:', e);
            return [];
        }
    };

    // Handle slot confirmation (DB columns: technician_id, scheduled_at)
    const handleSlotConfirm = async (selectedIndex) => {
        const slot = pendingSlots[selectedIndex];
        if (!slot || !createdTicketId) return;

        try {
            const scheduledAt = `${slot.date}T${slot.time_start}:00.000Z`;
            const { error } = await supabase
                .from('tickets')
                .update({
                    status: 'asignado',
                    technician_id: slot.technician_id,
                    scheduled_at: scheduledAt
                })
                .eq('id', createdTicketId);

            if (error) throw error;

            setShowAppointmentModal(false);
            alert(`✅ ¡Cita confirmada!\n\n📅 ${slot.date}\n🕐 ${slot.time_start} - ${slot.time_end}\n👤 Técnico: ${slot.technician_name}`);
            navigate('/dashboard');
        } catch (e) {
            console.error('Error confirming slot:', e);
            alert('Error al confirmar la cita. Te llamaremos para coordinar.');
            navigate('/dashboard');
        }
    };

    // Handle slot skip
    const handleSlotSkip = () => {
        setShowAppointmentModal(false);
        alert('📞 Entendido, te llamaremos para coordinar un horario que te venga mejor.\n\nReferencia: #' + createdTicketId);
        navigate('/dashboard');
    };

    // Handle timeout
    const handleSlotTimeout = () => {
        // Modal will show timeout screen, then user can acknowledge
        setTimeout(() => {
            setShowAppointmentModal(false);
            navigate('/dashboard');
        }, 3000);
    };

    return (
        <div className="min-h-screen bg-slate-50 pb-12">
            {/* Header */}
            <div className="bg-white border-b border-slate-200 sticky top-0 z-10 px-4 py-4">
                <div className="max-w-3xl mx-auto flex items-center justify-between">
                    <button
                        onClick={() => navigate('/dashboard')}
                        className="flex items-center gap-1 text-slate-600 hover:text-blue-600 font-medium"
                    >
                        <ChevronLeft size={20} /> Volver
                    </button>
                    <h1 className="font-bold text-slate-800">Nueva Reparación</h1>
                    <div className="w-8"></div> {/* Spacer */}
                </div>
            </div>

            <div className="max-w-3xl mx-auto px-4 mt-8">
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden relative">

                    <div className="p-6 border-b border-slate-100 bg-slate-50">
                        <div className="flex items-start gap-4">
                            <div className="bg-blue-100 p-3 rounded-xl text-blue-600">
                                <Wrench size={24} />
                            </div>
                            <div>
                                <h2 className="font-bold text-lg text-slate-800">Detalles de la Avería</h2>
                                <p className="text-slate-500 text-sm">Describe el problema para que los técnicos vayan preparados.</p>
                            </div>
                        </div>
                    </div>

                    <form onSubmit={handleSubmit} className="p-6 space-y-6">

                        {/* Service Type Selector */}
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">¿Qué necesitas?</label>
                            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                                {serviceTypes.map(t => (
                                    <button
                                        key={t.id}
                                        type="button"
                                        onClick={() => setSelectedServiceTypeId(t.id)}
                                        className={`p-3 text-sm font-medium rounded-xl border text-left transition
                                            ${selectedServiceTypeId === t.id
                                                ? 'bg-blue-50 border-blue-500 text-blue-700 ring-1 ring-blue-500'
                                                : 'bg-white border-slate-200 text-slate-600 hover:border-blue-300'}`}
                                    >
                                        {t.name}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Appliance Info - LOCKED IF PRE-FILLED */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Tipo de Aparato</label>
                                <select
                                    name="type"
                                    className={`w-full p-3 border rounded-xl outline-none transition-colors ${applianceId
                                        ? 'bg-slate-100 border-slate-200 text-slate-500 cursor-not-allowed'
                                        : 'bg-white border-slate-200 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500'}`}
                                    value={formData.type}
                                    onChange={handleChange}
                                    disabled={!!applianceId}
                                >
                                    {applianceTypes.map(t => <option key={t} value={t}>{t}</option>)}
                                </select>
                            </div>
                            <div>
                                <SmartBrandSelector
                                    label="Marca"
                                    value={formData.brand}
                                    disabled={!!applianceId}
                                    onChange={(brandObj) => {
                                        if (brandObj && typeof brandObj === 'object') {
                                            setFormData(prev => ({ ...prev, brand: brandObj.name, brand_id: brandObj.id }));
                                        } else {
                                            setFormData(prev => ({ ...prev, brand: '', brand_id: null }));
                                        }
                                    }}
                                />
                            </div>
                        </div>

                        {/* Model & Label Photo */}
                        <div>
                            <div className="flex justify-between items-center mb-1">
                                <label className="block text-sm font-medium text-slate-700">Modelo</label>
                                <button
                                    type="button"
                                    onClick={() => setShowHelp(true)}
                                    className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1 font-medium bg-blue-50 px-2 py-1 rounded-full transition"
                                >
                                    <HelpCircle size={14} /> ¿Dónde está la etiqueta?
                                </button>
                            </div>

                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    name="model"
                                    placeholder="Ej: WW90T534DTW (Opcional)"
                                    className={`flex-1 p-3 border rounded-xl outline-none transition-colors ${applianceId && formData.model
                                        ? 'bg-slate-100 border-slate-200 text-slate-500 cursor-not-allowed'
                                        : 'bg-white border-slate-200 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500'}`}
                                    value={formData.model}
                                    onChange={handleChange}
                                    readOnly={!!applianceId && !!formData.model}
                                />
                                <div className="relative">
                                    <input
                                        type="file"
                                        id="label-upload"
                                        accept="image/*"
                                        className="hidden"
                                        onChange={handleImageUpload}
                                        disabled={uploading}
                                    />
                                    <label
                                        htmlFor="label-upload"
                                        className={`h-full px-4 rounded-xl border flex items-center gap-2 cursor-pointer transition font-medium
                                            ${formData.label_image_url
                                                ? 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100'
                                                : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100 hover:border-slate-300'
                                            }`}
                                    >
                                        {uploading ? (
                                            <div className="animate-spin w-5 h-5 border-2 border-slate-400 border-t-blue-600 rounded-full"></div>
                                        ) : formData.label_image_url ? (
                                            <>
                                                <ImageIcon size={20} />
                                                <span className="hidden sm:inline">Foto Subida</span>
                                            </>
                                        ) : (
                                            <>
                                                <Camera size={20} />
                                                <span className="hidden sm:inline">Foto Etiqueta</span>
                                            </>
                                        )}
                                    </label>
                                </div>
                            </div>
                            {formData.label_image_url && (
                                <div className="mt-2 text-xs text-green-600 flex items-center gap-1">
                                    <ImageIcon size={12} /> Imagen adjuntada correctamente. Ayudará al técnico a identificar las piezas.
                                </div>
                            )}
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Descripción del Problema</label>
                            <textarea
                                name="description_failure"
                                required
                                rows={4}
                                placeholder="Ej: No desagua, hace un ruido extraño, no enciende..."
                                className="w-full p-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none resize-none"
                                value={formData.description_failure}
                                onChange={handleChange}
                            />
                        </div>

                        {/* Address Selection */}
                        <div className="space-y-2">
                            <label className="block text-sm font-medium text-slate-700">
                                <MapPin size={14} className="inline mr-1" /> Dirección del Servicio
                            </label>
                            {addresses.length > 1 ? (
                                <div className="relative">
                                    <button
                                        type="button"
                                        onClick={() => setShowAddressSelector(!showAddressSelector)}
                                        className="w-full p-3 border border-slate-200 rounded-xl bg-white text-left flex items-center justify-between hover:border-blue-300 transition"
                                    >
                                        <div className="flex items-center gap-2">
                                            <MapPin size={16} className="text-blue-500" />
                                            <span className="font-medium text-slate-700">
                                                {addresses.find(a => a.id === selectedAddressId)?.label || 'Seleccionar'}
                                            </span>
                                            {addresses.find(a => a.id === selectedAddressId)?.is_primary && (
                                                <Star size={12} className="text-amber-500" />
                                            )}
                                        </div>
                                        <ChevronDown size={18} className={`text-slate-400 transition ${showAddressSelector ? 'rotate-180' : ''}`} />
                                    </button>
                                    <p className="text-xs text-slate-500 mt-1 pl-1">
                                        {addresses.find(a => a.id === selectedAddressId)?.address_line}
                                    </p>

                                    {showAddressSelector && (
                                        <div className="absolute z-20 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden">
                                            {addresses.map(addr => (
                                                <button
                                                    key={addr.id}
                                                    type="button"
                                                    onClick={() => handleAddressSelect(addr)}
                                                    className={`w-full p-3 text-left flex items-center gap-3 hover:bg-blue-50 border-b border-slate-100 last:border-0 ${addr.id === selectedAddressId ? 'bg-blue-50' : ''
                                                        }`}
                                                >
                                                    <div className={`w-4 h-4 rounded-full border-2 ${addr.id === selectedAddressId
                                                        ? 'border-blue-500 bg-blue-500'
                                                        : 'border-slate-300'
                                                        }`}>
                                                        {addr.id === selectedAddressId && (
                                                            <div className="w-2 h-2 bg-white rounded-full mx-auto mt-0.5" />
                                                        )}
                                                    </div>
                                                    <div>
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-medium text-slate-700">{addr.label}</span>
                                                            {addr.is_primary && (
                                                                <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 text-[10px] font-bold rounded">Principal</span>
                                                            )}
                                                        </div>
                                                        <p className="text-xs text-slate-500">{addr.address_line}</p>
                                                    </div>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                                    <p className="text-sm text-slate-600">{formData.address || 'No hay dirección registrada'}</p>
                                </div>
                            )}
                        </div>

                        {/* Contact Info */}
                        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex gap-3 text-sm text-blue-700">
                            <Phone size={18} className="shrink-0" />
                            <p>Contactarán al: <strong>{formData.phone || 'Tu teléfono'}</strong></p>
                        </div>

                        <button
                            type="submit"
                            disabled={loading || uploading}
                            className="w-full bg-blue-600 text-white py-4 rounded-xl font-bold hover:bg-blue-700 transition flex items-center justify-center gap-2 shadow-xl shadow-blue-600/20"
                        >
                            {loading ? 'Enviando...' : 'Solicitar Reparación'}
                        </button>

                    </form>
                </div>
            </div>

            {/* Help Modal */}
            {showHelp && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
                    <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] flex flex-col overflow-hidden">
                        <div className="p-4 border-b flex justify-between items-center bg-slate-50 shrink-0">
                            <h3 className="font-bold text-lg text-slate-800">¿Dónde encuentro la etiqueta?</h3>
                            <button onClick={() => setShowHelp(false)} className="p-1 hover:bg-slate-200 rounded-full transition">
                                <X size={20} className="text-slate-500" />
                            </button>
                        </div>
                        <div className="p-6 overflow-y-auto flex-1 flex flex-col items-center">
                            <img
                                src="/appliance_guide.png"
                                alt="Guía ubicación etiquetas"
                                className="w-full h-auto max-h-[50vh] object-contain rounded-lg border border-slate-100 mb-4"
                            />
                            <p className="text-sm text-slate-500 text-center">
                                La etiqueta suele contener el <strong>Modelo (Model No.)</strong> y el número de serie.
                                Normalmente es una pegatina plateada o blanca.
                            </p>
                        </div>
                        <div className="p-4 border-t bg-slate-50 shrink-0">
                            <button
                                onClick={() => setShowHelp(false)}
                                className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition"
                            >
                                Entendido
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* PRO Mode - Appointment Selector Modal (timer from pro_config.timeout_minutes) */}
            <AppointmentSelectorModal
                isOpen={showAppointmentModal}
                slots={pendingSlots}
                ticketId={createdTicketId}
                ticketInfo={ticketInfoForModal}
                timeoutMinutes={appointmentTimeoutMinutes}
                onConfirm={handleSlotConfirm}
                onSkip={handleSlotSkip}
                onTimeout={handleSlotTimeout}
            />
        </div>
    );
};

export default NewService;
