import { useState, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useNavigate, Link } from 'react-router-dom';
import {
    Mail, Lock, User, Phone, MapPin, ArrowRight, ArrowLeft,
    Loader2, CheckCircle, Home, Briefcase, AlertTriangle, Plus, Trash2, Star,
    AlertCircle, HelpCircle
} from 'lucide-react';
import { normalizePhone, formatPhoneDisplay } from '../../lib/utils';

// CLIENT TYPE CONSTANTS
const CLIENT_TYPES = {
    particular: {
        label: 'Particular',
        icon: Home,
        maxAddresses: 3,
        color: 'blue',
        description: 'Para uso doméstico: tu casa, oficina, segunda vivienda...'
    },
    professional: {
        label: 'Profesional',
        icon: Briefcase,
        maxAddresses: 15,
        color: 'purple',
        description: 'Para inmobiliarias, gestores de propiedades, empresas...'
    }
};

const Register = () => {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [step, setStep] = useState(1); // 1: Basic Info, 2: Client Type, 3: Addresses, 4: Password
    const [showTypeConfirmModal, setShowTypeConfirmModal] = useState(false);
    const [pendingType, setPendingType] = useState(null);

    // Phone duplicate detection
    const [checkingPhone, setCheckingPhone] = useState(false);
    const [existingClient, setExistingClient] = useState(null);
    const [showDuplicateModal, setShowDuplicateModal] = useState(false);

    // Form Data
    const [formData, setFormData] = useState({
        full_name: '',
        email: '',
        phone: '',
        client_type: null,
        password: '',
        confirmPassword: ''
    });

    // Multiple Addresses
    const [addresses, setAddresses] = useState([{
        label: 'Casa',
        address_line: '',
        is_primary: true
    }]);

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    // Type selection with confirmation
    const handleTypeSelect = (type) => {
        setPendingType(type);
        setShowTypeConfirmModal(true);
    };

    const confirmTypeSelection = () => {
        setFormData({ ...formData, client_type: pendingType });
        setShowTypeConfirmModal(false);
        setStep(3);
    };

    // Address management
    const maxAddresses = CLIENT_TYPES[formData.client_type]?.maxAddresses || 3;
    const canAddMore = addresses.length < maxAddresses;

    const addAddress = () => {
        if (!canAddMore) return;
        setAddresses(prev => [...prev, {
            label: `Dirección ${prev.length + 1}`,
            address_line: '',
            is_primary: false
        }]);
    };

    const removeAddress = (index) => {
        if (addresses.length <= 1) return;
        const wasPrimary = addresses[index].is_primary;
        const newAddresses = addresses.filter((_, i) => i !== index);
        if (wasPrimary) newAddresses[0].is_primary = true;
        setAddresses(newAddresses);
    };

    const updateAddress = (index, field, value) => {
        setAddresses(prev => prev.map((addr, i) =>
            i === index ? { ...addr, [field]: value } : addr
        ));
    };

    const setPrimaryAddress = (index) => {
        setAddresses(prev => prev.map((addr, i) => ({
            ...addr,
            is_primary: i === index
        })));
    };

    // Check if phone exists in database
    const checkPhoneExists = useCallback(async (phone) => {
        const normalized = normalizePhone(phone);
        if (!normalized || normalized.length < 9) return;

        setCheckingPhone(true);
        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('id, full_name, phone, address')
                .eq('phone', normalized)
                .eq('role', 'client')
                .limit(1)
                .maybeSingle();

            if (data && !error) {
                setExistingClient(data);
                setShowDuplicateModal(true);
            } else {
                setExistingClient(null);
            }
        } catch (err) {
            console.error('Phone check error:', err);
        } finally {
            setCheckingPhone(false);
        }
    }, []);

    // Handle going to next step with phone validation
    const handleStep1Next = async () => {
        if (!canProceed()) return;

        // Check if phone exists before proceeding
        const normalized = normalizePhone(formData.phone);
        console.log('🔍 Checking phone:', { original: formData.phone, normalized, length: normalized.length });

        if (normalized.length >= 9) {
            setCheckingPhone(true);
            const { data, error } = await supabase
                .from('profiles')
                .select('id, full_name, phone, address')
                .eq('phone', normalized)
                .eq('role', 'client')
                .limit(1);
            setCheckingPhone(false);

            console.log('🔍 Phone check result:', { data, error });

            // data is an array - check if it has any results
            if (data && data.length > 0) {
                console.log('✅ Found existing client:', data[0]);
                setExistingClient(data[0]);
                setShowDuplicateModal(true);
                return; // Don't proceed, show modal
            }
        }

        setStep(2); // Proceed to step 2
    };

    // Final registration
    const handleRegister = async (e) => {
        e.preventDefault();
        if (formData.password !== formData.confirmPassword) {
            alert("Las contraseñas no coinciden");
            return;
        }

        setLoading(true);
        try {
            // 1. SignUp in Auth
            const { data: authData, error: authError } = await supabase.auth.signUp({
                email: formData.email,
                password: formData.password,
                options: {
                    data: {
                        full_name: formData.full_name,
                        role: 'client'
                    }
                }
            });

            if (authError) throw authError;

            if (authData?.user) {
                const primaryAddress = addresses.find(a => a.is_primary) || addresses[0];

                // 2. Create Profile
                const { error: profileError } = await supabase
                    .from('profiles')
                    .insert([{
                        id: authData.user.id,
                        full_name: formData.full_name,
                        email: formData.email,
                        role: 'client',
                        phone: normalizePhone(formData.phone),
                        address: primaryAddress.address_line,
                        client_type: formData.client_type
                    }]);

                if (profileError) {
                    console.warn('Insert failed, trying update:', profileError);
                    await supabase.from('profiles')
                        .update({
                            full_name: formData.full_name,
                            role: 'client',
                            phone: normalizePhone(formData.phone),
                            address: primaryAddress.address_line,
                            client_type: formData.client_type
                        })
                        .eq('id', authData.user.id);
                }

                // 3. Create client_addresses
                for (let i = 0; i < addresses.length; i++) {
                    const addr = addresses[i];
                    if (addr.address_line) {
                        await supabase.from('client_addresses').insert({
                            client_id: authData.user.id,
                            label: addr.label || `Dirección ${i + 1}`,
                            address_line: addr.address_line,
                            is_primary: addr.is_primary,
                            address_order: i + 1
                        });
                    }
                }
            }

            alert('¡Registro completado! Bienvenido.');
            navigate('/dashboard');

        } catch (error) {
            console.error('Registration error:', error);
            alert('Error en el registro: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    // Validate step before proceeding
    const canProceed = () => {
        switch (step) {
            case 1:
                return formData.full_name && formData.email && formData.phone;
            case 2:
                return formData.client_type;
            case 3:
                return addresses.some(a => a.address_line);
            case 4:
                return formData.password && formData.password === formData.confirmPassword;
            default:
                return false;
        }
    };

    // Step indicator
    const StepIndicator = () => (
        <div className="flex items-center justify-center gap-2 mb-8">
            {[1, 2, 3, 4].map((s) => (
                <div key={s} className="flex items-center">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all ${s === step
                        ? 'bg-blue-600 text-white ring-4 ring-blue-100'
                        : s < step
                            ? 'bg-emerald-500 text-white'
                            : 'bg-slate-200 text-slate-500'
                        }`}>
                        {s < step ? <CheckCircle size={16} /> : s}
                    </div>
                    {s < 4 && (
                        <div className={`w-8 h-1 ${s < step ? 'bg-emerald-500' : 'bg-slate-200'}`} />
                    )}
                </div>
            ))}
        </div>
    );

    return (
        <div className="max-w-md mx-auto">
            <div className="mb-6">
                <h2 className="text-2xl font-bold text-slate-800">Crear Cuenta</h2>
                <p className="text-slate-500 mt-1 text-sm">
                    {step === 1 && 'Paso 1: Datos básicos'}
                    {step === 2 && 'Paso 2: Tipo de cliente'}
                    {step === 3 && 'Paso 3: Tus direcciones'}
                    {step === 4 && 'Paso 4: Contraseña'}
                </p>
            </div>

            <StepIndicator />

            {/* STEP 1: Basic Info */}
            {step === 1 && (
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Nombre Completo</label>
                        <div className="relative">
                            <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                            <input
                                type="text"
                                name="full_name"
                                required
                                className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition"
                                placeholder="Juan Pérez"
                                value={formData.full_name}
                                onChange={handleChange}
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                            <div className="relative">
                                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                <input
                                    type="email"
                                    name="email"
                                    required
                                    className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition"
                                    placeholder="tu@email.com"
                                    value={formData.email}
                                    onChange={handleChange}
                                />
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Teléfono</label>
                            <div className="relative">
                                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                <input
                                    type="tel"
                                    name="phone"
                                    required
                                    className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition"
                                    placeholder="600 000 000"
                                    value={formData.phone}
                                    onChange={handleChange}
                                />
                            </div>
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={handleStep1Next}
                        disabled={!canProceed() || checkingPhone}
                        className="w-full bg-blue-600 text-white py-3.5 rounded-xl font-bold hover:bg-blue-700 transition flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {checkingPhone ? (
                            <><Loader2 className="animate-spin" size={18} /> Verificando...</>
                        ) : (
                            <>Continuar <ArrowRight size={18} /></>
                        )}
                    </button>
                </div>
            )}

            {/* STEP 2: Client Type */}
            {step === 2 && (
                <div className="space-y-4">
                    <p className="text-sm text-slate-600 text-center mb-4">
                        Selecciona el tipo de cliente que mejor te describe:
                    </p>

                    <div className="grid gap-4">
                        {Object.entries(CLIENT_TYPES).map(([type, config]) => {
                            const Icon = config.icon;
                            return (
                                <button
                                    key={type}
                                    type="button"
                                    onClick={() => handleTypeSelect(type)}
                                    className={`p-5 rounded-2xl border-2 text-left transition-all hover:shadow-lg ${formData.client_type === type
                                        ? `border-${config.color}-500 bg-${config.color}-50`
                                        : 'border-slate-200 hover:border-slate-300'
                                        }`}
                                >
                                    <div className="flex items-start gap-4">
                                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${config.color === 'blue' ? 'bg-blue-500' : 'bg-purple-500'
                                            } text-white`}>
                                            <Icon size={24} />
                                        </div>
                                        <div>
                                            <p className="font-bold text-lg text-slate-800">{config.label}</p>
                                            <p className="text-sm text-slate-500">{config.description}</p>
                                            <p className="text-xs text-slate-400 mt-1">
                                                Hasta {config.maxAddresses} direcciones
                                            </p>
                                        </div>
                                    </div>
                                </button>
                            );
                        })}
                    </div>

                    <button
                        type="button"
                        onClick={() => setStep(1)}
                        className="w-full py-3 border border-slate-200 rounded-xl font-semibold text-slate-600 hover:bg-slate-50 flex items-center justify-center gap-2"
                    >
                        <ArrowLeft size={18} /> Atrás
                    </button>
                </div>
            )}

            {/* STEP 3: Addresses */}
            {step === 3 && (
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <p className="text-sm text-slate-600">
                            Añade las direcciones donde tienes electrodomésticos:
                        </p>
                        <span className="text-xs font-bold text-slate-400">
                            {addresses.length}/{maxAddresses}
                        </span>
                    </div>

                    <div className="space-y-3">
                        {addresses.map((addr, index) => (
                            <div key={index} className={`p-4 rounded-xl border ${addr.is_primary ? 'border-amber-400 bg-amber-50/50' : 'border-slate-200'}`}>
                                <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center gap-2">
                                        <input
                                            value={addr.label}
                                            onChange={e => updateAddress(index, 'label', e.target.value)}
                                            placeholder="Nombre"
                                            className="font-semibold text-slate-700 bg-transparent border-none p-0 focus:outline-none w-24"
                                        />
                                        {addr.is_primary && (
                                            <span className="px-2 py-0.5 bg-amber-500 text-white text-[10px] font-bold rounded-full flex items-center gap-1">
                                                <Star size={10} /> Principal
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-1">
                                        {!addr.is_primary && (
                                            <button
                                                type="button"
                                                onClick={() => setPrimaryAddress(index)}
                                                className="p-1.5 text-slate-400 hover:text-amber-500"
                                            >
                                                <Star size={14} />
                                            </button>
                                        )}
                                        {addresses.length > 1 && (
                                            <button
                                                type="button"
                                                onClick={() => removeAddress(index)}
                                                className="p-1.5 text-slate-400 hover:text-red-500"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        )}
                                    </div>
                                </div>
                                <div className="relative">
                                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                    <input
                                        value={addr.address_line}
                                        onChange={e => updateAddress(index, 'address_line', e.target.value)}
                                        placeholder="Calle Ejemplo 123, Málaga"
                                        className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                                    />
                                </div>
                            </div>
                        ))}
                    </div>

                    {canAddMore && (
                        <button
                            type="button"
                            onClick={addAddress}
                            className="w-full py-2.5 border-2 border-dashed border-blue-300 text-blue-600 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 hover:bg-blue-50"
                        >
                            <Plus size={18} /> Añadir otra dirección
                        </button>
                    )}

                    <div className="flex gap-3 pt-2">
                        <button
                            type="button"
                            onClick={() => setStep(2)}
                            className="flex-1 py-3 border border-slate-200 rounded-xl font-semibold text-slate-600 hover:bg-slate-50 flex items-center justify-center gap-2"
                        >
                            <ArrowLeft size={18} /> Atrás
                        </button>
                        <button
                            type="button"
                            onClick={() => setStep(4)}
                            disabled={!canProceed()}
                            className="flex-1 bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-700 flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                            Continuar <ArrowRight size={18} />
                        </button>
                    </div>
                </div>
            )}

            {/* STEP 4: Password */}
            {step === 4 && (
                <form onSubmit={handleRegister} className="space-y-4">
                    <p className="text-sm text-slate-600 text-center mb-4">
                        Por último, crea tu contraseña:
                    </p>

                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Contraseña</label>
                        <div className="relative">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                            <input
                                type="password"
                                name="password"
                                required
                                minLength={6}
                                className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition"
                                placeholder="••••••••"
                                value={formData.password}
                                onChange={handleChange}
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Confirmar Contraseña</label>
                        <div className="relative">
                            <CheckCircle className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                            <input
                                type="password"
                                name="confirmPassword"
                                required
                                minLength={6}
                                className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition"
                                placeholder="••••••••"
                                value={formData.confirmPassword}
                                onChange={handleChange}
                            />
                        </div>
                    </div>

                    <div className="flex gap-3 pt-2">
                        <button
                            type="button"
                            onClick={() => setStep(3)}
                            className="flex-1 py-3 border border-slate-200 rounded-xl font-semibold text-slate-600 hover:bg-slate-50 flex items-center justify-center gap-2"
                        >
                            <ArrowLeft size={18} /> Atrás
                        </button>
                        <button
                            type="submit"
                            disabled={loading || !canProceed()}
                            className="flex-1 bg-emerald-600 text-white py-3 rounded-xl font-bold hover:bg-emerald-700 flex items-center justify-center gap-2 shadow-lg disabled:opacity-50"
                        >
                            {loading ? (
                                <Loader2 className="animate-spin" size={20} />
                            ) : (
                                <>
                                    <CheckCircle size={18} /> Crear Cuenta
                                </>
                            )}
                        </button>
                    </div>
                </form>
            )}

            {/* TYPE CONFIRMATION MODAL */}
            {showTypeConfirmModal && pendingType && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl">
                        <div className="flex items-center gap-3 text-amber-600 mb-4">
                            <AlertTriangle size={24} />
                            <h3 className="font-bold text-lg">Confirmación Importante</h3>
                        </div>

                        <p className="text-slate-600 mb-4">
                            Has seleccionado <strong>{CLIENT_TYPES[pendingType].label}</strong>.
                        </p>

                        <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl mb-4">
                            <p className="text-sm text-amber-800">
                                ⚠️ <strong>Esta decisión es permanente.</strong> No podrás cambiar el tipo de cliente después del registro.
                            </p>
                        </div>

                        <div className="flex gap-3">
                            <button
                                onClick={() => setShowTypeConfirmModal(false)}
                                className="flex-1 py-2.5 border border-slate-200 rounded-xl font-semibold text-slate-600 hover:bg-slate-50"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={confirmTypeSelection}
                                className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700"
                            >
                                Confirmar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* DUPLICATE PHONE MODAL */}
            {showDuplicateModal && existingClient && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl">
                        <div className="flex items-center gap-3 text-amber-600 mb-4">
                            <AlertCircle size={24} />
                            <h3 className="font-bold text-lg">Teléfono ya registrado</h3>
                        </div>

                        <p className="text-slate-600 mb-4">
                            Este teléfono ya pertenece a una cuenta existente:
                        </p>

                        <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl mb-4">
                            <div className="flex items-center gap-2 mb-2">
                                <Phone size={16} className="text-blue-500" />
                                <span className="font-semibold">{formatPhoneDisplay(existingClient.phone)}</span>
                            </div>
                            <div className="flex items-center gap-2 mb-2">
                                <User size={16} className="text-slate-400" />
                                <span>{existingClient.full_name}</span>
                            </div>
                            {existingClient.address && (
                                <div className="flex items-center gap-2">
                                    <MapPin size={16} className="text-slate-400" />
                                    <span className="text-sm text-slate-500 truncate">{existingClient.address}</span>
                                </div>
                            )}
                        </div>

                        <p className="text-sm text-slate-500 mb-4">
                            ¿Eres tú?
                        </p>

                        <div className="space-y-3">
                            <button
                                onClick={() => {
                                    setShowDuplicateModal(false);
                                    navigate('/auth/login', { state: { prefillPhone: formData.phone } });
                                }}
                                className="w-full py-2.5 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 flex items-center justify-center gap-2"
                            >
                                <CheckCircle size={18} /> Sí, soy yo - Iniciar sesión
                            </button>

                            <button
                                onClick={() => {
                                    setShowDuplicateModal(false);
                                    alert('Por favor, contacta con soporte en +34 633 489 521.\n\nNo podemos tener el mismo teléfono en dos cuentas.');
                                }}
                                className="w-full py-2.5 border border-slate-200 rounded-xl font-semibold text-slate-600 hover:bg-slate-50 flex items-center justify-center gap-2"
                            >
                                <HelpCircle size={18} /> No, es otra persona
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <div className="mt-8 pt-6 border-t border-slate-100 text-center text-sm text-slate-500">
                ¿Ya tienes cuenta?{' '}
                <Link to="/auth/login" className="font-bold text-blue-600 hover:text-blue-800">
                    Inicia sesión
                </Link>
            </div>
        </div>
    );
};

export default Register;
