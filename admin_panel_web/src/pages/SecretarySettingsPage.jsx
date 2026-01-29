import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import {
    Bot, Settings, Save, CheckCircle, AlertTriangle, Zap, Users,
    Clock, Play, Pause, X, ChevronRight, Sparkles, Crown, Shield,
    Phone, MessageCircle, Calendar, Route, Timer, UserCheck
} from 'lucide-react';

/**
 * SecretarySettingsPage - PREMIUM GOD MODE REDESIGN v3.0
 * 
 * Design: Dark theme with matte gold accents
 * Features: Animated workflow previews, clear mode indicators, activation modals
 */

// Color palette - Premium Dark + Gold
const colors = {
    dark: {
        primary: '#0f172a',      // Slate 900
        secondary: '#1e293b',    // Slate 800
        tertiary: '#334155',     // Slate 700
        border: '#475569',       // Slate 600
    },
    gold: {
        primary: '#d4a853',      // Matte gold
        secondary: '#c9a227',    // Darker gold
        accent: '#f5d67b',       // Light gold
        glow: 'rgba(212, 168, 83, 0.3)',
    },
    basic: {
        primary: '#3b82f6',      // Blue 500
        secondary: '#1d4ed8',    // Blue 700
        bg: '#1e3a5f',           // Dark blue
        glow: 'rgba(59, 130, 246, 0.3)',
    },
    text: {
        primary: '#f8fafc',      // Slate 50
        secondary: '#cbd5e1',    // Slate 300
        muted: '#94a3b8',        // Slate 400
    }
};

const SecretarySettingsPage = () => {
    const [activeTab, setActiveTab] = useState('type');
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [loading, setLoading] = useState(true);
    const [showActivationModal, setShowActivationModal] = useState(false);
    const [pendingMode, setPendingMode] = useState(null);

    // Mode Config
    const [secretaryMode, setSecretaryMode] = useState('basic');
    const [proConfig, setProConfig] = useState({
        pro_enabled: true,
        slots_count: 3,
        timeout_minutes: 3,
        search_days: 7,
        channels: { whatsapp: true, app: true },
        operating_days: ['Lun', 'Mar', 'Mié', 'Jue', 'Vie'],
        working_hours_start: '09:00',
        working_hours_end: '19:00'
    });

    useEffect(() => {
        fetchModeConfig();
    }, []);

    const fetchModeConfig = async () => {
        setLoading(true);
        try {
            const { data: configs } = await supabase
                .from('business_config')
                .select('key, value')
                .in('key', ['secretary_mode', 'pro_config']);

            if (configs) {
                configs.forEach(c => {
                    if (c.key === 'secretary_mode') setSecretaryMode(c.value || 'basic');
                    if (c.key === 'pro_config' && c.value) setProConfig(prev => ({ ...prev, ...c.value }));
                });
            }
        } catch (err) {
            console.error('Error fetching secretary config:', err);
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
        await handleSave();
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const upserts = [
                { key: 'secretary_mode', value: secretaryMode },
                { key: 'pro_config', value: proConfig }
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
                { icon: Sparkles, label: 'IA propone 3 citas', delay: 1 },
                { icon: Timer, label: 'Cliente elige', delay: 2 },
                { icon: Route, label: 'Auto-asignación', delay: 3 }
            ];

        return (
            <div className="relative h-32 overflow-hidden rounded-xl" style={{
                background: `linear-gradient(135deg, ${type === 'pro' ? colors.dark.secondary : colors.basic.bg}, ${type === 'pro' ? colors.dark.primary : '#0c2d48'})`
            }}>
                {/* Animated dots connecting steps */}
                <div className="absolute inset-0 flex items-center justify-around px-4">
                    {steps.map((step, i) => (
                        <div
                            key={i}
                            className="flex flex-col items-center gap-2 animate-pulse"
                            style={{
                                animationDelay: `${step.delay * 0.3}s`,
                                animationDuration: '2s'
                            }}
                        >
                            <div
                                className="p-2 rounded-lg transition-all duration-500"
                                style={{
                                    background: isActive
                                        ? (type === 'pro' ? colors.gold.glow : colors.basic.glow)
                                        : 'rgba(255,255,255,0.1)',
                                    boxShadow: isActive
                                        ? `0 0 20px ${type === 'pro' ? colors.gold.glow : colors.basic.glow}`
                                        : 'none'
                                }}
                            >
                                <step.icon
                                    size={20}
                                    style={{
                                        color: isActive
                                            ? (type === 'pro' ? colors.gold.primary : colors.basic.primary)
                                            : colors.text.muted
                                    }}
                                />
                            </div>
                            <span
                                className="text-[10px] text-center font-medium max-w-16"
                                style={{ color: colors.text.muted }}
                            >
                                {step.label}
                            </span>
                        </div>
                    ))}
                </div>
                {/* Flow lines */}
                <svg className="absolute inset-0 w-full h-full pointer-events-none">
                    <defs>
                        <linearGradient id={`flow-${type}`} x1="0%" y1="0%" x2="100%" y2="0%">
                            <stop offset="0%" style={{ stopColor: type === 'pro' ? colors.gold.primary : colors.basic.primary, stopOpacity: 0.3 }} />
                            <stop offset="50%" style={{ stopColor: type === 'pro' ? colors.gold.accent : '#60a5fa', stopOpacity: 0.8 }} />
                            <stop offset="100%" style={{ stopColor: type === 'pro' ? colors.gold.primary : colors.basic.primary, stopOpacity: 0.3 }} />
                        </linearGradient>
                    </defs>
                    <line
                        x1="15%" y1="50%" x2="85%" y2="50%"
                        stroke={`url(#flow-${type})`}
                        strokeWidth="2"
                        strokeDasharray="8 4"
                        className="animate-[dash_2s_linear_infinite]"
                    />
                </svg>
            </div>
        );
    };

    // Mode Card Component
    const ModeCard = ({ mode, title, subtitle, features, icon: Icon, isActive, color }) => (
        <div
            onClick={() => handleModeChange(mode)}
            className="relative rounded-2xl p-6 cursor-pointer transition-all duration-300 overflow-hidden group"
            style={{
                background: isActive
                    ? `linear-gradient(135deg, ${color.bg || colors.dark.secondary}, ${colors.dark.primary})`
                    : colors.dark.secondary,
                border: `2px solid ${isActive ? color.primary : colors.dark.border}`,
                boxShadow: isActive ? `0 0 30px ${color.glow}` : 'none'
            }}
        >
            {/* Active glow effect */}
            {isActive && (
                <div
                    className="absolute inset-0 opacity-20 animate-pulse"
                    style={{ background: `radial-gradient(circle at 30% 30%, ${color.glow}, transparent 60%)` }}
                />
            )}

            <div className="relative z-10">
                {/* Header */}
                <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                        {/* Radio indicator */}
                        <div
                            className="w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all"
                            style={{
                                borderColor: isActive ? color.primary : colors.dark.border,
                                background: isActive ? color.primary : 'transparent'
                            }}
                        >
                            {isActive && <CheckCircle size={14} style={{ color: colors.dark.primary }} />}
                        </div>
                        <div className="flex items-center gap-2">
                            <Icon size={24} style={{ color: isActive ? color.primary : colors.text.muted }} />
                            <div>
                                <h3
                                    className="text-lg font-bold"
                                    style={{ color: isActive ? color.primary : colors.text.primary }}
                                >
                                    {title}
                                </h3>
                                <p className="text-xs" style={{ color: colors.text.muted }}>{subtitle}</p>
                            </div>
                        </div>
                    </div>

                    {/* Status badge */}
                    <div
                        className="px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 transition-all"
                        style={{
                            background: isActive ? color.primary : colors.dark.tertiary,
                            color: isActive ? colors.dark.primary : colors.text.muted
                        }}
                    >
                        {isActive && <span className="w-2 h-2 rounded-full bg-current animate-pulse" />}
                        {isActive ? 'ACTIVO' : 'INACTIVO'}
                    </div>
                </div>

                {/* Animated workflow preview */}
                <WorkflowAnimation type={mode} isActive={isActive} />

                {/* Features list */}
                <div className="mt-4 space-y-2">
                    {features.map((feature, i) => (
                        <div
                            key={i}
                            className="flex items-center gap-2 text-sm"
                            style={{ color: isActive ? colors.text.secondary : colors.text.muted }}
                        >
                            <ChevronRight size={14} style={{ color: isActive ? color.primary : colors.text.muted }} />
                            {feature}
                        </div>
                    ))}
                </div>

                {/* Activation hint */}
                {!isActive && (
                    <div
                        className="mt-4 text-center text-xs py-2 rounded-lg border border-dashed opacity-0 group-hover:opacity-100 transition-opacity"
                        style={{ borderColor: color.primary, color: color.primary }}
                    >
                        Haz clic para activar este modo
                    </div>
                )}
            </div>
        </div>
    );

    // Activation Modal
    const ActivationModal = () => {
        if (!showActivationModal || !pendingMode) return null;

        const modeInfo = pendingMode === 'pro'
            ? {
                title: 'Activar PRO - Autopilot',
                icon: Crown,
                color: colors.gold,
                description: 'El sistema propondrá citas automáticamente a tus clientes. Ellos elegirán y el sistema asignará técnicos optimizando rutas.'
            }
            : {
                title: 'Activar BÁSICO - Manual',
                icon: Users,
                color: colors.basic,
                description: 'Los clientes solicitarán servicio y un administrador coordinará manualmente las citas por teléfono.'
            };

        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fadeIn">
                <div
                    className="relative w-full max-w-lg mx-4 rounded-2xl p-8 animate-scaleIn"
                    style={{
                        background: `linear-gradient(135deg, ${colors.dark.secondary}, ${colors.dark.primary})`,
                        border: `2px solid ${modeInfo.color.primary}`,
                        boxShadow: `0 0 60px ${modeInfo.color.glow}`
                    }}
                >
                    {/* Close button */}
                    <button
                        onClick={() => setShowActivationModal(false)}
                        className="absolute top-4 right-4 p-2 rounded-lg hover:bg-white/10 transition-colors"
                    >
                        <X size={20} style={{ color: colors.text.muted }} />
                    </button>

                    {/* Icon */}
                    <div
                        className="w-20 h-20 mx-auto rounded-2xl flex items-center justify-center mb-6"
                        style={{
                            background: `linear-gradient(135deg, ${modeInfo.color.primary}, ${modeInfo.color.secondary})`,
                            boxShadow: `0 0 30px ${modeInfo.color.glow}`
                        }}
                    >
                        <modeInfo.icon size={40} style={{ color: colors.dark.primary }} />
                    </div>

                    {/* Title */}
                    <h2
                        className="text-2xl font-black text-center mb-4"
                        style={{ color: modeInfo.color.primary }}
                    >
                        {modeInfo.title}
                    </h2>

                    {/* Description */}
                    <p
                        className="text-center mb-6 leading-relaxed"
                        style={{ color: colors.text.secondary }}
                    >
                        {modeInfo.description}
                    </p>

                    {/* Animated workflow preview */}
                    <div className="mb-6">
                        <WorkflowAnimation type={pendingMode} isActive={true} />
                    </div>

                    {/* Warning */}
                    <div
                        className="flex items-start gap-3 p-4 rounded-xl mb-6"
                        style={{ background: 'rgba(234, 179, 8, 0.1)', border: '1px solid rgba(234, 179, 8, 0.3)' }}
                    >
                        <AlertTriangle size={20} style={{ color: '#eab308' }} className="shrink-0 mt-0.5" />
                        <p className="text-sm" style={{ color: '#fde047' }}>
                            Al cambiar de modo, el anterior se desactivará inmediatamente. Los tickets en curso no se verán afectados.
                        </p>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-4">
                        <button
                            onClick={() => setShowActivationModal(false)}
                            className="flex-1 py-3 rounded-xl font-bold transition-colors"
                            style={{
                                background: colors.dark.tertiary,
                                color: colors.text.secondary,
                                border: `1px solid ${colors.dark.border}`
                            }}
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={confirmModeChange}
                            className="flex-1 py-3 rounded-xl font-bold transition-all hover:scale-105"
                            style={{
                                background: `linear-gradient(135deg, ${modeInfo.color.primary}, ${modeInfo.color.secondary})`,
                                color: colors.dark.primary,
                                boxShadow: `0 0 20px ${modeInfo.color.glow}`
                            }}
                        >
                            Activar Ahora
                        </button>
                    </div>
                </div>
            </div>
        );
    };

    // Configuration Panel Component
    const ConfigPanel = () => (
        <div
            className="rounded-2xl p-6"
            style={{
                background: colors.dark.secondary,
                border: `1px solid ${colors.dark.border}`
            }}
        >
            {/* Header with mode indicator */}
            <div className="flex items-center justify-between mb-6 pb-4" style={{ borderBottom: `1px solid ${colors.dark.border}` }}>
                <div className="flex items-center gap-3">
                    {secretaryMode === 'pro' ? (
                        <Crown size={24} style={{ color: colors.gold.primary }} />
                    ) : (
                        <Users size={24} style={{ color: colors.basic.primary }} />
                    )}
                    <div>
                        <h3 className="font-bold" style={{ color: colors.text.primary }}>
                            Configuración {secretaryMode === 'pro' ? 'PRO' : 'BÁSICO'}
                        </h3>
                        <p className="text-xs" style={{ color: colors.text.muted }}>
                            Personaliza el comportamiento del modo activo
                        </p>
                    </div>
                </div>
                <div
                    className="px-3 py-1 rounded-full text-xs font-bold"
                    style={{
                        background: secretaryMode === 'pro' ? colors.gold.primary : colors.basic.primary,
                        color: colors.dark.primary
                    }}
                >
                    {secretaryMode === 'pro' ? '✨ PRO' : '📋 BÁSICO'}
                </div>
            </div>

            {/* PRO specific config */}
            {secretaryMode === 'pro' && (
                <div className="space-y-6">
                    {/* Slots, Timeout, Days */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                            <label className="block text-sm font-medium mb-2" style={{ color: colors.text.secondary }}>
                                📅 Citas a proponer
                            </label>
                            <select
                                value={proConfig.slots_count}
                                onChange={(e) => setProConfig(prev => ({ ...prev, slots_count: parseInt(e.target.value) }))}
                                className="w-full px-4 py-3 rounded-xl focus:outline-none focus:ring-2"
                                style={{
                                    background: colors.dark.tertiary,
                                    border: `1px solid ${colors.dark.border}`,
                                    color: colors.text.primary
                                }}
                            >
                                {[1, 2, 3, 4, 5].map(n => (
                                    <option key={n} value={n}>{n} {n === 1 ? 'cita' : 'citas'}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-2" style={{ color: colors.text.secondary }}>
                                ⏱️ Timeout respuesta
                            </label>
                            <select
                                value={proConfig.timeout_minutes}
                                onChange={(e) => setProConfig(prev => ({ ...prev, timeout_minutes: parseInt(e.target.value) }))}
                                className="w-full px-4 py-3 rounded-xl focus:outline-none focus:ring-2"
                                style={{
                                    background: colors.dark.tertiary,
                                    border: `1px solid ${colors.dark.border}`,
                                    color: colors.text.primary
                                }}
                            >
                                {[1, 2, 3, 5, 10].map(n => (
                                    <option key={n} value={n}>{n} min</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-2" style={{ color: colors.text.secondary }}>
                                🔮 Días a futuro
                            </label>
                            <select
                                value={proConfig.search_days}
                                onChange={(e) => setProConfig(prev => ({ ...prev, search_days: parseInt(e.target.value) }))}
                                className="w-full px-4 py-3 rounded-xl focus:outline-none focus:ring-2"
                                style={{
                                    background: colors.dark.tertiary,
                                    border: `1px solid ${colors.dark.border}`,
                                    color: colors.text.primary
                                }}
                            >
                                {[3, 5, 7, 10, 14].map(n => (
                                    <option key={n} value={n}>{n} días</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Operating Days */}
                    <div>
                        <label className="block text-sm font-medium mb-3" style={{ color: colors.text.secondary }}>
                            📅 Días de operación
                        </label>
                        <div className="flex flex-wrap gap-2">
                            {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map(day => (
                                <button
                                    key={day}
                                    type="button"
                                    onClick={() => {
                                        const days = proConfig.operating_days || [];
                                        if (days.includes(day)) {
                                            setProConfig(prev => ({ ...prev, operating_days: days.filter(d => d !== day) }));
                                        } else {
                                            setProConfig(prev => ({ ...prev, operating_days: [...days, day] }));
                                        }
                                    }}
                                    className="px-4 py-2 rounded-xl font-medium transition-all"
                                    style={{
                                        background: (proConfig.operating_days || []).includes(day)
                                            ? colors.gold.primary
                                            : colors.dark.tertiary,
                                        color: (proConfig.operating_days || []).includes(day)
                                            ? colors.dark.primary
                                            : colors.text.muted,
                                        border: `1px solid ${(proConfig.operating_days || []).includes(day) ? colors.gold.primary : colors.dark.border}`
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
                            <label className="block text-sm font-medium mb-2" style={{ color: colors.text.secondary }}>
                                🕐 Hora inicio
                            </label>
                            <input
                                type="time"
                                value={proConfig.working_hours_start || '09:00'}
                                onChange={(e) => setProConfig(prev => ({ ...prev, working_hours_start: e.target.value }))}
                                className="w-full px-4 py-3 rounded-xl focus:outline-none focus:ring-2"
                                style={{
                                    background: colors.dark.tertiary,
                                    border: `1px solid ${colors.dark.border}`,
                                    color: colors.text.primary
                                }}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-2" style={{ color: colors.text.secondary }}>
                                🕐 Hora fin
                            </label>
                            <input
                                type="time"
                                value={proConfig.working_hours_end || '19:00'}
                                onChange={(e) => setProConfig(prev => ({ ...prev, working_hours_end: e.target.value }))}
                                className="w-full px-4 py-3 rounded-xl focus:outline-none focus:ring-2"
                                style={{
                                    background: colors.dark.tertiary,
                                    border: `1px solid ${colors.dark.border}`,
                                    color: colors.text.primary
                                }}
                            />
                        </div>
                    </div>

                    {/* Channels */}
                    <div>
                        <label className="block text-sm font-medium mb-3" style={{ color: colors.text.secondary }}>
                            📱 Canales activos
                        </label>
                        <div className="flex gap-4">
                            {[
                                { key: 'whatsapp', label: 'WhatsApp' },
                                { key: 'app', label: 'App Cliente' }
                            ].map(channel => (
                                <label
                                    key={channel.key}
                                    className="flex items-center gap-3 cursor-pointer p-3 rounded-xl transition-all"
                                    style={{
                                        background: proConfig.channels[channel.key] ? colors.gold.glow : colors.dark.tertiary,
                                        border: `1px solid ${proConfig.channels[channel.key] ? colors.gold.primary : colors.dark.border}`
                                    }}
                                >
                                    <input
                                        type="checkbox"
                                        checked={proConfig.channels[channel.key]}
                                        onChange={(e) => setProConfig(prev => ({
                                            ...prev,
                                            channels: { ...prev.channels, [channel.key]: e.target.checked }
                                        }))}
                                        className="w-5 h-5 rounded"
                                        style={{ accentColor: colors.gold.primary }}
                                    />
                                    <span style={{ color: colors.text.primary }}>{channel.label}</span>
                                </label>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Basic mode info */}
            {secretaryMode === 'basic' && (
                <div
                    className="p-6 rounded-xl text-center"
                    style={{ background: colors.dark.tertiary }}
                >
                    <Shield size={48} className="mx-auto mb-4" style={{ color: colors.basic.primary }} />
                    <h4 className="font-bold mb-2" style={{ color: colors.text.primary }}>
                        Modo Manual Activo
                    </h4>
                    <p className="text-sm" style={{ color: colors.text.muted }}>
                        El bot recogerá los datos del cliente y creará un ticket para que un administrador coordine la cita manualmente.
                    </p>
                    <p className="text-xs mt-4" style={{ color: colors.text.muted }}>
                        Para configurar mensajes y datos de empresa, ve a la pestaña "Configuración Bot"
                    </p>
                </div>
            )}

            {/* Save Button */}
            <div className="flex justify-end mt-6 pt-4" style={{ borderTop: `1px solid ${colors.dark.border}` }}>
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="flex items-center gap-2 px-6 py-3 rounded-xl font-bold transition-all hover:scale-105 disabled:opacity-50"
                    style={{
                        background: saved
                            ? '#22c55e'
                            : `linear-gradient(135deg, ${secretaryMode === 'pro' ? colors.gold.primary : colors.basic.primary}, ${secretaryMode === 'pro' ? colors.gold.secondary : colors.basic.secondary})`,
                        color: colors.dark.primary,
                        boxShadow: `0 0 20px ${secretaryMode === 'pro' ? colors.gold.glow : colors.basic.glow}`
                    }}
                >
                    {saved ? (
                        <>
                            <CheckCircle size={18} />
                            ¡Guardado!
                        </>
                    ) : saving ? (
                        <>
                            <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                            Guardando...
                        </>
                    ) : (
                        <>
                            <Save size={18} />
                            Guardar Configuración
                        </>
                    )}
                </button>
            </div>
        </div>
    );

    if (loading) {
        return (
            <div
                className="min-h-screen flex items-center justify-center"
                style={{ background: colors.dark.primary }}
            >
                <div className="text-center">
                    <Bot size={48} className="mx-auto animate-pulse mb-4" style={{ color: colors.gold.primary }} />
                    <p style={{ color: colors.text.muted }}>Cargando configuración...</p>
                </div>
            </div>
        );
    }

    return (
        <div
            className="min-h-screen p-6"
            style={{ background: colors.dark.primary }}
        >
            <style>{`
                @keyframes dash {
                    to { stroke-dashoffset: -24; }
                }
                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                @keyframes scaleIn {
                    from { transform: scale(0.9); opacity: 0; }
                    to { transform: scale(1); opacity: 1; }
                }
                .animate-fadeIn { animation: fadeIn 0.3s ease-out; }
                .animate-scaleIn { animation: scaleIn 0.3s ease-out; }
            `}</style>

            {/* Activation Modal */}
            <ActivationModal />

            <div className="max-w-5xl mx-auto">
                {/* Header */}
                <div className="mb-8">
                    <div className="flex items-center gap-4">
                        <div
                            className="p-3 rounded-2xl"
                            style={{
                                background: `linear-gradient(135deg, ${colors.gold.primary}, ${colors.gold.secondary})`,
                                boxShadow: `0 0 30px ${colors.gold.glow}`
                            }}
                        >
                            <Bot size={32} style={{ color: colors.dark.primary }} />
                        </div>
                        <div>
                            <h1
                                className="text-3xl font-black"
                                style={{ color: colors.text.primary }}
                            >
                                Secretaria Virtual
                            </h1>
                            <p style={{ color: colors.text.muted }}>
                                Automatiza la gestión de citas con inteligencia artificial
                            </p>
                        </div>
                    </div>
                </div>

                {/* Tabs */}
                <div
                    className="flex gap-2 mb-6 p-1 rounded-xl"
                    style={{ background: colors.dark.secondary }}
                >
                    {[
                        { id: 'type', label: 'Tipo de Asistente', icon: Zap },
                        { id: 'config', label: 'Configuración', icon: Settings }
                    ].map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-lg font-medium transition-all"
                            style={{
                                background: activeTab === tab.id
                                    ? `linear-gradient(135deg, ${colors.gold.primary}, ${colors.gold.secondary})`
                                    : 'transparent',
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
                    <div className="space-y-6">
                        {/* Info banner */}
                        <div
                            className="flex items-start gap-4 p-4 rounded-xl"
                            style={{
                                background: colors.dark.secondary,
                                border: `1px solid ${colors.gold.primary}20`
                            }}
                        >
                            <Sparkles size={24} style={{ color: colors.gold.primary }} className="shrink-0" />
                            <div>
                                <p className="font-bold" style={{ color: colors.text.primary }}>
                                    Elige el tipo de asistente para tu negocio
                                </p>
                                <p className="text-sm" style={{ color: colors.text.muted }}>
                                    Solo un modo puede estar activo a la vez. Haz clic en cualquiera para cambiar.
                                </p>
                            </div>
                        </div>

                        {/* Mode cards */}
                        <div className="grid md:grid-cols-2 gap-6">
                            <ModeCard
                                mode="basic"
                                title="BÁSICO"
                                subtitle="Gestión Manual"
                                icon={Users}
                                isActive={secretaryMode === 'basic'}
                                color={colors.basic}
                                features={[
                                    'Bot recoge datos del cliente',
                                    'Crea ticket en estado "solicitado"',
                                    'Admin coordina cita por teléfono',
                                    'Asignación manual de técnico'
                                ]}
                            />
                            <ModeCard
                                mode="pro"
                                title="PRO"
                                subtitle="Autopilot con IA"
                                icon={Crown}
                                isActive={secretaryMode === 'pro'}
                                color={colors.gold}
                                features={[
                                    'IA propone citas disponibles',
                                    'Cliente elige en tiempo real',
                                    'Asignación automática de técnico',
                                    'Optimización inteligente de rutas'
                                ]}
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
