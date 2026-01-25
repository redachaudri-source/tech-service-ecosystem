import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import {
    Save, Building2, MessageCircle, FileText, Settings,
    ToggleLeft, ToggleRight, Clock, Zap, Eye, EyeOff,
    Phone, Mail, Bot
} from 'lucide-react';
import { useToast } from '../ToastProvider';

// Default config structure
const DEFAULT_CONFIG = {
    company: {
        name: "Fixarr Servicio Técnico",
        phone: "+34633489521",
        email: "info@fixarr.es"
    },
    messages: {
        greeting: "¡Hola! 👋 Bienvenido a {company_name}. Soy tu asistente virtual.",
        ask_appliance: "¿Qué electrodoméstico necesita reparación?",
        ask_brand: "¿Cuál es la marca del {appliance}?",
        ask_model: "¿Conoces el modelo? (puedes escribir 'no sé')",
        ask_problem: "Describe brevemente el problema que presenta",
        ask_address: "¿Cuál es la dirección donde realizaremos el servicio?",
        ask_name: "¿A nombre de quién agendamos la cita?",
        ask_phone: "¿Un teléfono de contacto?",
        confirm_appointment: "Perfecto! Te propongo estas fechas disponibles:",
        appointment_confirmed: "¡Cita confirmada! 📅 Te esperamos el {date} a las {time}.",
        goodbye: "Gracias por confiar en {company_name}. ¡Hasta pronto!"
    },
    legal: {
        service_conditions: "",
        privacy_notice: ""
    },
    settings: {
        bot_enabled: true,
        working_hours_start: "09:00",
        working_hours_end: "19:00",
        response_delay_seconds: 2
    }
};

const WhatsAppBotSection = () => {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [activeTab, setActiveTab] = useState('company');
    const [config, setConfig] = useState(DEFAULT_CONFIG);
    const [showPreview, setShowPreview] = useState(false);
    const { addToast } = useToast();

    // Tabs definition
    const tabs = [
        { id: 'company', label: 'Empresa', icon: Building2, emoji: '🏢' },
        { id: 'messages', label: 'Mensajes', icon: MessageCircle, emoji: '💬' },
        { id: 'legal', label: 'Legal', icon: FileText, emoji: '📋' },
        { id: 'settings', label: 'Ajustes', icon: Settings, emoji: '⚙️' }
    ];

    // Load config
    useEffect(() => {
        fetchConfig();
    }, []);

    const fetchConfig = async () => {
        try {
            const { data, error } = await supabase
                .from('business_config')
                .select('value')
                .eq('key', 'whatsapp_bot_config')
                .single();

            if (data?.value) {
                // Merge with defaults to ensure all keys exist
                setConfig({
                    ...DEFAULT_CONFIG,
                    ...data.value,
                    company: { ...DEFAULT_CONFIG.company, ...data.value.company },
                    messages: { ...DEFAULT_CONFIG.messages, ...data.value.messages },
                    legal: { ...DEFAULT_CONFIG.legal, ...data.value.legal },
                    settings: { ...DEFAULT_CONFIG.settings, ...data.value.settings }
                });
            }
        } catch (err) {
            console.log('No existing config, using defaults');
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const { data: existing } = await supabase
                .from('business_config')
                .select('key')
                .eq('key', 'whatsapp_bot_config')
                .single();

            let saveError;
            if (existing) {
                const { error } = await supabase
                    .from('business_config')
                    .update({ value: config })
                    .eq('key', 'whatsapp_bot_config');
                saveError = error;
            } else {
                const { error } = await supabase
                    .from('business_config')
                    .insert({ key: 'whatsapp_bot_config', value: config });
                saveError = error;
            }

            if (saveError) {
                addToast('Error al guardar: ' + saveError.message, 'error');
            } else {
                addToast('Configuración del bot guardada', 'success');
            }
        } catch (err) {
            addToast('Error al guardar: ' + err.message, 'error');
        } finally {
            setSaving(false);
        }
    };

    // Helper to replace variables in preview
    const replaceVariables = (text) => {
        return text
            .replace(/{company_name}/g, config.company.name)
            .replace(/{appliance}/g, 'lavadora')
            .replace(/{date}/g, 'Lunes 27')
            .replace(/{time}/g, '10:00');
    };

    // Update nested config
    const updateCompany = (field, value) => {
        setConfig(prev => ({
            ...prev,
            company: { ...prev.company, [field]: value }
        }));
    };

    const updateMessages = (field, value) => {
        setConfig(prev => ({
            ...prev,
            messages: { ...prev.messages, [field]: value }
        }));
    };

    const updateLegal = (field, value) => {
        setConfig(prev => ({
            ...prev,
            legal: { ...prev.legal, [field]: value }
        }));
    };

    const updateSettings = (field, value) => {
        setConfig(prev => ({
            ...prev,
            settings: { ...prev.settings, [field]: value }
        }));
    };

    if (loading) {
        return (
            <div className="p-10 text-center animate-pulse">
                <Bot size={40} className="mx-auto text-green-500 mb-4" />
                <p className="text-slate-500">Cargando configuración del bot...</p>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
            {/* Header */}
            <div className="flex justify-between items-start">
                <div>
                    <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-3">
                        <div className="w-10 h-10 bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl flex items-center justify-center text-white shadow-lg">
                            <Bot size={22} />
                        </div>
                        Bot de WhatsApp
                    </h2>
                    <p className="text-slate-500 text-sm mt-1">Configura los mensajes y comportamiento del asistente virtual.</p>
                </div>
                <div className="flex items-center gap-3">
                    {/* Bot Status Badge */}
                    <div className={`px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-2 ${config.settings.bot_enabled
                        ? 'bg-green-100 text-green-700 border border-green-200'
                        : 'bg-slate-100 text-slate-500 border border-slate-200'
                        }`}>
                        <div className={`w-2 h-2 rounded-full ${config.settings.bot_enabled ? 'bg-green-500 animate-pulse' : 'bg-slate-400'}`} />
                        {config.settings.bot_enabled ? 'Bot Activo' : 'Bot Desactivado'}
                    </div>
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="bg-gradient-to-r from-green-600 to-emerald-600 text-white px-5 py-2.5 rounded-xl font-bold shadow-lg hover:from-green-700 hover:to-emerald-700 disabled:opacity-50 transition flex items-center gap-2"
                    >
                        <Save size={18} />
                        {saving ? 'Guardando...' : 'Guardar'}
                    </button>
                </div>
            </div>

            {/* Sub-tabs */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="flex border-b border-slate-200">
                    {tabs.map(tab => {
                        const Icon = tab.icon;
                        const isActive = activeTab === tab.id;
                        return (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`flex-1 px-4 py-3 text-sm font-medium transition-all flex items-center justify-center gap-2 ${isActive
                                    ? 'bg-green-50 text-green-700 border-b-2 border-green-500'
                                    : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
                                    }`}
                            >
                                <span>{tab.emoji}</span>
                                <span className="hidden sm:inline">{tab.label}</span>
                            </button>
                        );
                    })}
                </div>

                <div className="p-6">
                    {/* EMPRESA TAB */}
                    {activeTab === 'company' && (
                        <div className="space-y-4 animate-in fade-in duration-200">
                            <p className="text-xs text-slate-400 uppercase font-bold tracking-wider mb-4">Datos de la Empresa (aparecen en mensajes)</p>

                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Nombre de Empresa</label>
                                <input
                                    value={config.company.name}
                                    onChange={e => updateCompany('name', e.target.value)}
                                    className="w-full p-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500 transition"
                                    placeholder="Tu Servicio Técnico S.L."
                                />
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1 flex items-center gap-1">
                                        <Phone size={12} /> Teléfono WhatsApp
                                    </label>
                                    <input
                                        value={config.company.phone}
                                        onChange={e => updateCompany('phone', e.target.value)}
                                        className="w-full p-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500 transition"
                                        placeholder="+34600000000"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1 flex items-center gap-1">
                                        <Mail size={12} /> Email de Contacto
                                    </label>
                                    <input
                                        value={config.company.email}
                                        onChange={e => updateCompany('email', e.target.value)}
                                        className="w-full p-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500 transition"
                                        placeholder="info@empresa.es"
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* MENSAJES TAB */}
                    {activeTab === 'messages' && (
                        <div className="space-y-4 animate-in fade-in duration-200">
                            <div className="flex justify-between items-center mb-4">
                                <p className="text-xs text-slate-400 uppercase font-bold tracking-wider">Mensajes del Bot</p>
                                <button
                                    onClick={() => setShowPreview(!showPreview)}
                                    className="text-xs flex items-center gap-1 text-green-600 hover:text-green-700 font-medium"
                                >
                                    {showPreview ? <EyeOff size={14} /> : <Eye size={14} />}
                                    {showPreview ? 'Ocultar Preview' : 'Ver Preview'}
                                </button>
                            </div>

                            <p className="text-xs text-slate-400 bg-slate-50 p-2 rounded-lg border border-slate-100">
                                💡 Usa variables: <code className="bg-white px-1 rounded">{'{company_name}'}</code>, <code className="bg-white px-1 rounded">{'{appliance}'}</code>, <code className="bg-white px-1 rounded">{'{date}'}</code>, <code className="bg-white px-1 rounded">{'{time}'}</code>
                            </p>

                            {Object.entries(config.messages).map(([key, value]) => (
                                <div key={key} className="group">
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                                        {key.replace(/_/g, ' ')}
                                    </label>
                                    <textarea
                                        value={value}
                                        onChange={e => updateMessages(key, e.target.value)}
                                        rows={2}
                                        className="w-full p-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500 transition resize-none"
                                    />
                                    {showPreview && (
                                        <div className="mt-1 p-2 bg-green-50 border border-green-100 rounded-lg text-xs text-green-700">
                                            <span className="font-bold">Preview:</span> {replaceVariables(value)}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}

                    {/* LEGAL TAB */}
                    {activeTab === 'legal' && (
                        <div className="space-y-6 animate-in fade-in duration-200">
                            <p className="text-xs text-slate-400 uppercase font-bold tracking-wider mb-4">Textos Legales</p>

                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Condiciones del Servicio</label>
                                <textarea
                                    value={config.legal.service_conditions}
                                    onChange={e => updateLegal('service_conditions', e.target.value)}
                                    rows={8}
                                    className="w-full p-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500 transition resize-none font-mono"
                                    placeholder="Escribe aquí las condiciones del servicio que se enviarán al cliente..."
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Aviso de Privacidad</label>
                                <textarea
                                    value={config.legal.privacy_notice}
                                    onChange={e => updateLegal('privacy_notice', e.target.value)}
                                    rows={8}
                                    className="w-full p-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500 transition resize-none font-mono"
                                    placeholder="Escribe aquí el aviso de privacidad RGPD..."
                                />
                            </div>
                        </div>
                    )}

                    {/* AJUSTES TAB */}
                    {activeTab === 'settings' && (
                        <div className="space-y-6 animate-in fade-in duration-200">
                            <p className="text-xs text-slate-400 uppercase font-bold tracking-wider mb-4">Configuración del Bot</p>

                            {/* Bot Toggle */}
                            <div
                                onClick={() => updateSettings('bot_enabled', !config.settings.bot_enabled)}
                                className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${config.settings.bot_enabled
                                    ? 'bg-green-50 border-green-300'
                                    : 'bg-slate-50 border-slate-200'
                                    }`}
                            >
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        {config.settings.bot_enabled
                                            ? <ToggleRight size={32} className="text-green-600" />
                                            : <ToggleLeft size={32} className="text-slate-400" />
                                        }
                                        <div>
                                            <p className="font-bold text-slate-800">Bot Activo</p>
                                            <p className="text-xs text-slate-500">
                                                {config.settings.bot_enabled
                                                    ? 'El bot responderá automáticamente a los mensajes'
                                                    : 'El bot está desactivado, los mensajes no se responderán'
                                                }
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Working Hours */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1 flex items-center gap-1">
                                        <Clock size={12} /> Hora Inicio
                                    </label>
                                    <input
                                        type="time"
                                        value={config.settings.working_hours_start}
                                        onChange={e => updateSettings('working_hours_start', e.target.value)}
                                        className="w-full p-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500 transition"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1 flex items-center gap-1">
                                        <Clock size={12} /> Hora Fin
                                    </label>
                                    <input
                                        type="time"
                                        value={config.settings.working_hours_end}
                                        onChange={e => updateSettings('working_hours_end', e.target.value)}
                                        className="w-full p-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500 transition"
                                    />
                                </div>
                            </div>

                            {/* Response Delay */}
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1 flex items-center gap-1">
                                    <Zap size={12} /> Retraso de Respuesta (segundos)
                                </label>
                                <input
                                    type="number"
                                    min="0"
                                    max="30"
                                    value={config.settings.response_delay_seconds}
                                    onChange={e => updateSettings('response_delay_seconds', parseInt(e.target.value) || 0)}
                                    className="w-full p-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500 transition"
                                />
                                <p className="text-xs text-slate-400 mt-1">
                                    Simula tiempo de escritura para parecer más humano. Recomendado: 1-3 segundos.
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default WhatsAppBotSection;
