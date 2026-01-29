import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import {
    Bot, Settings, Save, CheckCircle, AlertTriangle, Zap, Users,
    Clock, X, ChevronRight, Sparkles, Crown, Shield,
    Phone, MessageCircle, Calendar, Route, Timer, UserCheck,
    Building2, FileText, ChevronDown, ChevronUp
} from 'lucide-react';

/**
 * SecretarySettingsPage - PREMIUM GOD MODE v4.0
 * 
 * Full config for both modes, messages, company info, full dark background
 */

// Color palette
const colors = {
    dark: {
        primary: '#0f172a',
        secondary: '#1e293b',
        tertiary: '#334155',
        border: '#475569',
    },
    gold: {
        primary: '#d4a853',
        secondary: '#c9a227',
        accent: '#f5d67b',
        bg: '#2a2518',
        glow: 'rgba(212, 168, 83, 0.3)',
    },
    basic: {
        primary: '#3b82f6',
        secondary: '#1d4ed8',
        bg: '#1e3a5f',
        glow: 'rgba(59, 130, 246, 0.3)',
    },
    text: {
        primary: '#f8fafc',
        secondary: '#cbd5e1',
        muted: '#94a3b8',
    }
};

// Default messages config
const DEFAULT_MESSAGES = {
    greeting: "¡Hola! 👋 Bienvenido a {company_name}. Soy tu asistente virtual.",
    ask_appliance: "¿Qué electrodoméstico necesita reparación?",
    ask_brand: "¿Cuál es la marca del {appliance}?",
    ask_model: "¿Conoces el modelo? (puedes escribir 'no sé')",
    ask_problem: "Describe brevemente el problema que presenta",
    ask_address: "¿Cuál es la dirección donde realizaremos el servicio?",
    ask_name: "¿A nombre de quién agendamos la cita?",
    ticket_created: "✅ *¡Registrado!*\n\nTu solicitud *#{ticket_id}* está en proceso.",
    propose_slots: "Perfecto! Te propongo estas fechas disponibles:",
    slot_confirmed: "¡Cita confirmada! 📅 Te esperamos el {date} a las {time}.",
    goodbye: "Gracias por confiar en {company_name}. ¡Hasta pronto!"
};

const SecretarySettingsPage = () => {
    const [activeTab, setActiveTab] = useState('type');
    const [configSubTab, setConfigSubTab] = useState('general');
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [loading, setLoading] = useState(true);
    const [showActivationModal, setShowActivationModal] = useState(false);
    const [pendingMode, setPendingMode] = useState(null);
    const [expandedSection, setExpandedSection] = useState('general');

    // Mode Config
    const [secretaryMode, setSecretaryMode] = useState('basic');

    // Shared config (used by both modes)
    const [sharedConfig, setSharedConfig] = useState({
        operating_days: ['Lun', 'Mar', 'Mié', 'Jue', 'Vie'],
        working_hours_start: '09:00',
        working_hours_end: '19:00',
        response_delay_seconds: 2
    });

    // PRO-specific config
    const [proConfig, setProConfig] = useState({
        slots_count: 3,
        timeout_minutes: 3,
        search_days: 7,
        channels: { whatsapp: true, app: true }
    });

    // Messages config
    const [messages, setMessages] = useState(DEFAULT_MESSAGES);

    // Company info (loaded from business_config)
    const [companyInfo, setCompanyInfo] = useState({
        name: 'Fixarr Servicio Técnico',
        phone: '+34633489521',
        email: 'info@fixarr.es'
    });

    useEffect(() => {
        fetchAllConfig();
    }, []);

    const fetchAllConfig = async () => {
        setLoading(true);
        try {
            const { data: configs } = await supabase
                .from('business_config')
                .select('key, value')
                .in('key', ['secretary_mode', 'pro_config', 'shared_config', 'whatsapp_bot_config', 'company_identity']);

            if (configs) {
                configs.forEach(c => {
                    if (c.key === 'secretary_mode') setSecretaryMode(c.value || 'basic');
                    if (c.key === 'pro_config' && c.value) setProConfig(prev => ({ ...prev, ...c.value }));
                    if (c.key === 'shared_config' && c.value) setSharedConfig(prev => ({ ...prev, ...c.value }));
                    if (c.key === 'whatsapp_bot_config' && c.value) {
                        if (c.value.messages) setMessages(prev => ({ ...prev, ...c.value.messages }));
                        if (c.value.settings) setSharedConfig(prev => ({ ...prev, ...c.value.settings }));
                    }
                    if (c.key === 'company_identity' && c.value) {
                        setCompanyInfo(prev => ({ ...prev, ...c.value }));
                    }
                });
            }
        } catch (err) {
            console.error('Error fetching config:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleModeChange = (mode) => {
        if (mode !== secretaryMode) {
            setPendingMode(mode);
            setShowActivationModal(true);
        }
    };

    const confirmModeChange = async () => {
        setSecretaryMode(pendingMode);
        setShowActivationModal(false);
        setPendingMode(null);
        await handleSave(pendingMode); // Persists to Supabase business_config
    };

    const handleSave = async (modeOverride) => {
        setSaving(true);
        try {
            const modeValue = (modeOverride ?? secretaryMode) === 'pro' ? 'pro' : 'basic';
            const upserts = [
                { key: 'secretary_mode', value: modeValue },
                { key: 'pro_config', value: proConfig },
                { key: 'shared_config', value: sharedConfig },
                {
                    key: 'whatsapp_bot_config', value: {
                        messages,
                        company: companyInfo,
                        settings: sharedConfig
                    }
                }
            ];

            for (const config of upserts) {
                await supabase
                    .from('business_config')
                    .upsert({ key: config.key, value: config.value }, { onConflict: 'key' });
            }

            setSaved(true);
            setTimeout(() => setSaved(false), 2000);
        } catch (err) {
            console.error('Error saving config:', err);
            alert('Error al guardar: ' + err.message);
        } finally {
            setSaving(false);
        }
    };

    // Animated workflow component
    const WorkflowAnimation = ({ type, isActive }) => {
        const steps = type === 'basic'
            ? [
                { icon: Phone, label: 'Cliente llama', delay: 0 },
                { icon: MessageCircle, label: 'Bot recoge datos', delay: 1 },
                { icon: UserCheck, label: 'Admin coordina', delay: 2 },
                { icon: Calendar, label: 'Cita manual', delay: 3 }
            ]
            : [
                { icon: MessageCircle, label: 'Cliente escribe', delay: 0 },
                { icon: Sparkles, label: 'IA propone citas', delay: 1 },
                { icon: Timer, label: 'Cliente elige', delay: 2 },
                { icon: Route, label: 'Auto-asigna', delay: 3 }
            ];

        return (
            <div className="relative h-28 overflow-hidden rounded-xl" style={{
                background: `linear-gradient(135deg, ${type === 'pro' ? colors.gold.bg : colors.basic.bg}, ${colors.dark.primary})`
            }}>
                <div className="absolute inset-0 flex items-center justify-around px-4">
                    {steps.map((step, i) => (
                        <div
                            key={i}
                            className="flex flex-col items-center gap-2 animate-pulse"
                            style={{ animationDelay: `${step.delay * 0.3}s`, animationDuration: '2s' }}
                        >
                            <div
                                className="p-2 rounded-lg transition-all duration-500"
                                style={{
                                    background: isActive ? (type === 'pro' ? colors.gold.glow : colors.basic.glow) : 'rgba(255,255,255,0.1)',
                                    boxShadow: isActive ? `0 0 20px ${type === 'pro' ? colors.gold.glow : colors.basic.glow}` : 'none'
                                }}
                            >
                                <step.icon size={18} style={{ color: isActive ? (type === 'pro' ? colors.gold.primary : colors.basic.primary) : colors.text.muted }} />
                            </div>
                            <span className="text-[10px] text-center font-medium max-w-14" style={{ color: colors.text.muted }}>
                                {step.label}
                            </span>
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    // Mode Card Component
    const ModeCard = ({ mode, title, subtitle, features, icon: Icon, isActive, color }) => (
        <div
            onClick={() => handleModeChange(mode)}
            className="relative rounded-2xl p-5 cursor-pointer transition-all duration-300 overflow-hidden group"
            style={{
                background: isActive ? `linear-gradient(135deg, ${color.bg || colors.dark.secondary}, ${colors.dark.primary})` : colors.dark.secondary,
                border: `2px solid ${isActive ? color.primary : colors.dark.border}`,
                boxShadow: isActive ? `0 0 30px ${color.glow}` : 'none'
            }}
        >
            {isActive && (
                <div className="absolute inset-0 opacity-20 animate-pulse" style={{ background: `radial-gradient(circle at 30% 30%, ${color.glow}, transparent 60%)` }} />
            )}

            <div className="relative z-10">
                <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                        <div
                            className="w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all"
                            style={{ borderColor: isActive ? color.primary : colors.dark.border, background: isActive ? color.primary : 'transparent' }}
                        >
                            {isActive && <CheckCircle size={12} style={{ color: colors.dark.primary }} />}
                        </div>
                        <div className="flex items-center gap-2">
                            <Icon size={22} style={{ color: isActive ? color.primary : colors.text.muted }} />
                            <div>
                                <h3 className="text-base font-bold" style={{ color: isActive ? color.primary : colors.text.primary }}>{title}</h3>
                                <p className="text-xs" style={{ color: colors.text.muted }}>{subtitle}</p>
                            </div>
                        </div>
                    </div>
                    <div
                        className="px-2 py-1 rounded-full text-xs font-bold flex items-center gap-1"
                        style={{ background: isActive ? color.primary : colors.dark.tertiary, color: isActive ? colors.dark.primary : colors.text.muted }}
                    >
                        {isActive && <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />}
                        {isActive ? 'ACTIVO' : 'INACTIVO'}
                    </div>
                </div>

                <WorkflowAnimation type={mode} isActive={isActive} />

                <div className="mt-3 space-y-1">
                    {features.map((feature, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs" style={{ color: isActive ? colors.text.secondary : colors.text.muted }}>
                            <ChevronRight size={12} style={{ color: isActive ? color.primary : colors.text.muted }} />
                            {feature}
                        </div>
                    ))}
                </div>

                {!isActive && (
                    <div className="mt-3 text-center text-xs py-1.5 rounded-lg border border-dashed opacity-0 group-hover:opacity-100 transition-opacity" style={{ borderColor: color.primary, color: color.primary }}>
                        Clic para activar
                    </div>
                )}
            </div>
        </div>
    );

    // Collapsible Section Component
    const Section = ({ id, title, icon: Icon, children, color }) => {
        const isExpanded = expandedSection === id;
        return (
            <div className="rounded-xl overflow-hidden" style={{ background: colors.dark.secondary, border: `1px solid ${colors.dark.border}` }}>
                <button
                    onClick={() => setExpandedSection(isExpanded ? null : id)}
                    className="w-full flex items-center justify-between p-4 transition-colors hover:bg-white/5"
                >
                    <div className="flex items-center gap-3">
                        <Icon size={20} style={{ color: color || colors.gold.primary }} />
                        <span className="font-bold" style={{ color: colors.text.primary }}>{title}</span>
                    </div>
                    {isExpanded ? <ChevronUp size={20} style={{ color: colors.text.muted }} /> : <ChevronDown size={20} style={{ color: colors.text.muted }} />}
                </button>
                {isExpanded && (
                    <div className="p-4 pt-0 animate-in slide-in-from-top-2 duration-200">
                        {children}
                    </div>
                )}
            </div>
        );
    };

    // Activation Modal
    const ActivationModal = () => {
        if (!showActivationModal || !pendingMode) return null;

        const modeInfo = pendingMode === 'pro'
            ? { title: 'Activar PRO - Autopilot', icon: Crown, color: colors.gold, description: 'El sistema propondrá citas automáticamente.' }
            : { title: 'Activar BÁSICO - Manual', icon: Users, color: colors.basic, description: 'Un administrador coordinará las citas manualmente.' };

        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fadeIn">
                <div className="relative w-full max-w-md mx-4 rounded-2xl p-6" style={{ background: colors.dark.secondary, border: `2px solid ${modeInfo.color.primary}`, boxShadow: `0 0 60px ${modeInfo.color.glow}` }}>
                    <button onClick={() => setShowActivationModal(false)} className="absolute top-4 right-4 p-2 rounded-lg hover:bg-white/10">
                        <X size={20} style={{ color: colors.text.muted }} />
                    </button>

                    <div className="w-16 h-16 mx-auto rounded-2xl flex items-center justify-center mb-4" style={{ background: `linear-gradient(135deg, ${modeInfo.color.primary}, ${modeInfo.color.secondary})` }}>
                        <modeInfo.icon size={32} style={{ color: colors.dark.primary }} />
                    </div>

                    <h2 className="text-xl font-black text-center mb-2" style={{ color: modeInfo.color.primary }}>{modeInfo.title}</h2>
                    <p className="text-center mb-4 text-sm" style={{ color: colors.text.secondary }}>{modeInfo.description}</p>

                    <WorkflowAnimation type={pendingMode} isActive={true} />

                    <div className="flex items-start gap-2 p-3 rounded-xl my-4" style={{ background: 'rgba(234, 179, 8, 0.1)', border: '1px solid rgba(234, 179, 8, 0.3)' }}>
                        <AlertTriangle size={16} style={{ color: '#eab308' }} className="shrink-0 mt-0.5" />
                        <p className="text-xs" style={{ color: '#fde047' }}>Al cambiar de modo, el anterior se desactivará.</p>
                    </div>

                    <div className="flex gap-3">
                        <button onClick={() => setShowActivationModal(false)} className="flex-1 py-2.5 rounded-xl font-bold" style={{ background: colors.dark.tertiary, color: colors.text.secondary }}>Cancelar</button>
                        <button onClick={confirmModeChange} className="flex-1 py-2.5 rounded-xl font-bold" style={{ background: `linear-gradient(135deg, ${modeInfo.color.primary}, ${modeInfo.color.secondary})`, color: colors.dark.primary }}>Activar</button>
                    </div>
                </div>
            </div>
        );
    };

    // Configuration Panel
    const ConfigPanel = () => {
        const modeColor = secretaryMode === 'pro' ? colors.gold : colors.basic;

        return (
            <div className="space-y-4">
                {/* Mode indicator */}
                <div className="flex items-center justify-between p-4 rounded-xl" style={{ background: colors.dark.secondary, border: `1px solid ${modeColor.primary}40` }}>
                    <div className="flex items-center gap-3">
                        {secretaryMode === 'pro' ? <Crown size={22} style={{ color: modeColor.primary }} /> : <Users size={22} style={{ color: modeColor.primary }} />}
                        <div>
                            <p className="font-bold" style={{ color: colors.text.primary }}>Configurando: {secretaryMode === 'pro' ? 'PRO - Autopilot' : 'BÁSICO - Manual'}</p>
                            <p className="text-xs" style={{ color: colors.text.muted }}>Personaliza el comportamiento del asistente</p>
                        </div>
                    </div>
                    <div className="px-3 py-1 rounded-full text-xs font-bold" style={{ background: modeColor.primary, color: colors.dark.primary }}>
                        {secretaryMode === 'pro' ? '✨ PRO' : '📋 BÁSICO'}
                    </div>
                </div>

                {/* General Settings - Both modes */}
                <Section id="general" title="⚙️ Configuración General" icon={Settings} color={modeColor.primary}>
                    <div className="space-y-4 mt-4">
                        {/* Operating Days */}
                        <div>
                            <label className="block text-sm font-medium mb-2" style={{ color: colors.text.secondary }}>📅 Días de operación</label>
                            <div className="flex flex-wrap gap-2">
                                {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map(day => (
                                    <button
                                        key={day}
                                        type="button"
                                        onClick={() => {
                                            const days = sharedConfig.operating_days || [];
                                            setSharedConfig(prev => ({
                                                ...prev,
                                                operating_days: days.includes(day) ? days.filter(d => d !== day) : [...days, day]
                                            }));
                                        }}
                                        className="px-3 py-1.5 rounded-lg text-sm font-medium transition-all"
                                        style={{
                                            background: (sharedConfig.operating_days || []).includes(day) ? modeColor.primary : colors.dark.tertiary,
                                            color: (sharedConfig.operating_days || []).includes(day) ? colors.dark.primary : colors.text.muted
                                        }}
                                    >
                                        {day}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Working Hours */}
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-medium mb-1" style={{ color: colors.text.muted }}>🕐 Hora inicio</label>
                                <input
                                    type="time"
                                    value={sharedConfig.working_hours_start || '09:00'}
                                    onChange={(e) => setSharedConfig(prev => ({ ...prev, working_hours_start: e.target.value }))}
                                    className="w-full px-3 py-2 rounded-lg"
                                    style={{ background: colors.dark.tertiary, border: `1px solid ${colors.dark.border}`, color: colors.text.primary }}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium mb-1" style={{ color: colors.text.muted }}>🕐 Hora fin</label>
                                <input
                                    type="time"
                                    value={sharedConfig.working_hours_end || '19:00'}
                                    onChange={(e) => setSharedConfig(prev => ({ ...prev, working_hours_end: e.target.value }))}
                                    className="w-full px-3 py-2 rounded-lg"
                                    style={{ background: colors.dark.tertiary, border: `1px solid ${colors.dark.border}`, color: colors.text.primary }}
                                />
                            </div>
                        </div>

                        {/* Response delay */}
                        <div>
                            <label className="block text-xs font-medium mb-1" style={{ color: colors.text.muted }}>⏱️ Retraso de respuesta (segundos)</label>
                            <input
                                type="number"
                                min="0"
                                max="10"
                                value={sharedConfig.response_delay_seconds || 2}
                                onChange={(e) => setSharedConfig(prev => ({ ...prev, response_delay_seconds: parseInt(e.target.value) }))}
                                className="w-full px-3 py-2 rounded-lg"
                                style={{ background: colors.dark.tertiary, border: `1px solid ${colors.dark.border}`, color: colors.text.primary }}
                            />
                            <p className="text-xs mt-1" style={{ color: colors.text.muted }}>Simula tiempo de escritura para parecer más humano</p>
                        </div>
                    </div>
                </Section>

                {/* PRO-specific settings */}
                {secretaryMode === 'pro' && (
                    <Section id="pro" title="✨ Configuración PRO" icon={Crown} color={colors.gold.primary}>
                        <div className="space-y-4 mt-4">
                            <div className="grid grid-cols-3 gap-3">
                                <div>
                                    <label className="block text-xs font-medium mb-1" style={{ color: colors.text.muted }}>📅 Citas a proponer</label>
                                    <select
                                        value={proConfig.slots_count}
                                        onChange={(e) => setProConfig(prev => ({ ...prev, slots_count: parseInt(e.target.value) }))}
                                        className="w-full px-3 py-2 rounded-lg"
                                        style={{ background: colors.dark.tertiary, border: `1px solid ${colors.dark.border}`, color: colors.text.primary }}
                                    >
                                        {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-medium mb-1" style={{ color: colors.text.muted }}>⏱️ Timeout (min)</label>
                                    <select
                                        value={proConfig.timeout_minutes}
                                        onChange={(e) => setProConfig(prev => ({ ...prev, timeout_minutes: parseInt(e.target.value) }))}
                                        className="w-full px-3 py-2 rounded-lg"
                                        style={{ background: colors.dark.tertiary, border: `1px solid ${colors.dark.border}`, color: colors.text.primary }}
                                    >
                                        {[1, 2, 3, 5, 10].map(n => <option key={n} value={n}>{n}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-medium mb-1" style={{ color: colors.text.muted }}>🔮 Días a futuro</label>
                                    <select
                                        value={proConfig.search_days}
                                        onChange={(e) => setProConfig(prev => ({ ...prev, search_days: parseInt(e.target.value) }))}
                                        className="w-full px-3 py-2 rounded-lg"
                                        style={{ background: colors.dark.tertiary, border: `1px solid ${colors.dark.border}`, color: colors.text.primary }}
                                    >
                                        {[3, 5, 7, 10, 14].map(n => <option key={n} value={n}>{n}</option>)}
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-medium mb-2" style={{ color: colors.text.muted }}>📱 Canales activos</label>
                                <div className="flex gap-3">
                                    {[{ key: 'whatsapp', label: 'WhatsApp' }, { key: 'app', label: 'App Cliente' }].map(ch => (
                                        <label key={ch.key} className="flex items-center gap-2 cursor-pointer p-2 rounded-lg" style={{ background: proConfig.channels[ch.key] ? colors.gold.glow : colors.dark.tertiary }}>
                                            <input
                                                type="checkbox"
                                                checked={proConfig.channels[ch.key]}
                                                onChange={(e) => setProConfig(prev => ({ ...prev, channels: { ...prev.channels, [ch.key]: e.target.checked } }))}
                                                className="w-4 h-4"
                                                style={{ accentColor: colors.gold.primary }}
                                            />
                                            <span className="text-sm" style={{ color: colors.text.primary }}>{ch.label}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </Section>
                )}

                {/* Company Info */}
                <Section id="company" title="🏢 Datos de Empresa" icon={Building2} color={modeColor.primary}>
                    <div className="space-y-3 mt-4">
                        <p className="text-xs p-2 rounded-lg" style={{ background: colors.dark.tertiary, color: colors.text.muted }}>
                            ℹ️ Esta información se usa en los mensajes del bot. Edítala en Configuración → Identidad de Empresa.
                        </p>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <div>
                                <label className="block text-xs font-medium mb-1" style={{ color: colors.text.muted }}>Nombre</label>
                                <div className="px-3 py-2 rounded-lg" style={{ background: colors.dark.tertiary, color: colors.text.primary }}>
                                    {companyInfo.name || 'Sin configurar'}
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-medium mb-1" style={{ color: colors.text.muted }}>Teléfono</label>
                                <div className="px-3 py-2 rounded-lg" style={{ background: colors.dark.tertiary, color: colors.text.primary }}>
                                    {companyInfo.phone || 'Sin configurar'}
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-medium mb-1" style={{ color: colors.text.muted }}>Email</label>
                                <div className="px-3 py-2 rounded-lg" style={{ background: colors.dark.tertiary, color: colors.text.primary }}>
                                    {companyInfo.email || 'Sin configurar'}
                                </div>
                            </div>
                        </div>
                    </div>
                </Section>

                {/* Messages */}
                <Section id="messages" title="💬 Mensajes del Bot" icon={MessageCircle} color={modeColor.primary}>
                    <div className="space-y-3 mt-4">
                        <p className="text-xs" style={{ color: colors.text.muted }}>
                            Personaliza los mensajes que envía el bot. Usa <code style={{ color: modeColor.primary }}>{'{company_name}'}</code>, <code style={{ color: modeColor.primary }}>{'{appliance}'}</code>, etc.
                        </p>
                        {[
                            { key: 'greeting', label: '👋 Saludo inicial' },
                            { key: 'ask_appliance', label: '🔧 Preguntar electrodoméstico' },
                            { key: 'ask_problem', label: '❓ Preguntar problema' },
                            { key: 'ask_address', label: '📍 Preguntar dirección' },
                            { key: 'ask_name', label: '👤 Preguntar nombre' },
                            { key: 'ticket_created', label: '✅ Ticket creado (básico)' },
                            ...(secretaryMode === 'pro' ? [
                                { key: 'propose_slots', label: '📅 Proponer citas (PRO)' },
                                { key: 'slot_confirmed', label: '✨ Cita confirmada (PRO)' }
                            ] : []),
                            { key: 'goodbye', label: '👋 Despedida' }
                        ].map(msg => (
                            <div key={msg.key}>
                                <label className="block text-xs font-medium mb-1" style={{ color: colors.text.muted }}>{msg.label}</label>
                                <textarea
                                    value={messages[msg.key] || ''}
                                    onChange={(e) => setMessages(prev => ({ ...prev, [msg.key]: e.target.value }))}
                                    rows={2}
                                    className="w-full px-3 py-2 rounded-lg resize-none text-sm"
                                    style={{ background: colors.dark.tertiary, border: `1px solid ${colors.dark.border}`, color: colors.text.primary }}
                                />
                            </div>
                        ))}
                    </div>
                </Section>

                {/* Save Button */}
                <div className="flex justify-end pt-2">
                    <button
                        onClick={() => handleSave()}
                        disabled={saving}
                        className="flex items-center gap-2 px-6 py-3 rounded-xl font-bold transition-all hover:scale-105 disabled:opacity-50"
                        style={{
                            background: saved ? '#22c55e' : `linear-gradient(135deg, ${modeColor.primary}, ${modeColor.secondary})`,
                            color: colors.dark.primary,
                            boxShadow: `0 0 20px ${modeColor.glow}`
                        }}
                    >
                        {saved ? <><CheckCircle size={18} /> ¡Guardado!</> : saving ? <><div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" /> Guardando...</> : <><Save size={18} /> Guardar Todo</>}
                    </button>
                </div>
            </div>
        );
    };

    if (loading) {
        return (
            <div className="fixed inset-0 flex items-center justify-center" style={{ background: colors.dark.primary }}>
                <div className="text-center">
                    <Bot size={48} className="mx-auto animate-pulse mb-4" style={{ color: colors.gold.primary }} />
                    <p style={{ color: colors.text.muted }}>Cargando...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen w-full" style={{ background: colors.dark.primary }}>
            <style>{`
                @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
                .animate-fadeIn { animation: fadeIn 0.3s ease-out; }
            `}</style>

            <ActivationModal />

            <div className="max-w-4xl mx-auto p-6 pb-24">
                {/* Header */}
                <div className="mb-6">
                    <div className="flex items-center gap-4">
                        <div className="p-3 rounded-2xl" style={{ background: `linear-gradient(135deg, ${colors.gold.primary}, ${colors.gold.secondary})`, boxShadow: `0 0 30px ${colors.gold.glow}` }}>
                            <Bot size={28} style={{ color: colors.dark.primary }} />
                        </div>
                        <div>
                            <h1 className="text-2xl font-black" style={{ color: colors.text.primary }}>Secretaria Virtual</h1>
                            <p className="text-sm" style={{ color: colors.text.muted }}>Automatiza la gestión de citas con inteligencia artificial</p>
                        </div>
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex gap-2 mb-6 p-1 rounded-xl" style={{ background: colors.dark.secondary }}>
                    {[{ id: 'type', label: 'Tipo de Asistente', icon: Zap }, { id: 'config', label: 'Configuración', icon: Settings }].map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-lg font-medium transition-all"
                            style={{
                                background: activeTab === tab.id ? `linear-gradient(135deg, ${colors.gold.primary}, ${colors.gold.secondary})` : 'transparent',
                                color: activeTab === tab.id ? colors.dark.primary : colors.text.muted
                            }}
                        >
                            <tab.icon size={18} />
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Tab Content */}
                {activeTab === 'type' && (
                    <div className="space-y-4">
                        <div className="flex items-start gap-3 p-4 rounded-xl" style={{ background: colors.dark.secondary, border: `1px solid ${colors.gold.primary}20` }}>
                            <Sparkles size={20} style={{ color: colors.gold.primary }} className="shrink-0" />
                            <div>
                                <p className="font-bold text-sm" style={{ color: colors.text.primary }}>Elige el tipo de asistente para tu negocio</p>
                                <p className="text-xs" style={{ color: colors.text.muted }}>Solo un modo puede estar activo. Haz clic para cambiar.</p>
                            </div>
                        </div>

                        <div className="grid md:grid-cols-2 gap-4">
                            <ModeCard
                                mode="basic"
                                title="BÁSICO"
                                subtitle="Gestión Manual"
                                icon={Users}
                                isActive={secretaryMode === 'basic'}
                                color={colors.basic}
                                features={['Bot recoge datos del cliente', 'Crea ticket "solicitado"', 'Admin coordina cita', 'Asignación manual']}
                            />
                            <ModeCard
                                mode="pro"
                                title="PRO"
                                subtitle="Autopilot con IA"
                                icon={Crown}
                                isActive={secretaryMode === 'pro'}
                                color={colors.gold}
                                features={['IA propone citas disponibles', 'Cliente elige en tiempo real', 'Asignación automática', 'Optimización de rutas']}
                            />
                        </div>
                    </div>
                )}

                {activeTab === 'config' && <ConfigPanel />}
            </div>
        </div>
    );
};

export default SecretarySettingsPage;
