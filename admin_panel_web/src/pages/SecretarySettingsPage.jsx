import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Bot, Settings, Save, CheckCircle, AlertTriangle, Zap, Users, Building2, MessageCircle, FileText, Calendar } from 'lucide-react';
import WhatsAppBotSection from '../components/settings/WhatsAppBotSection';

/**
 * SecretarySettingsPage - Redesigned UI/UX v2.0
 * 
 * Tab 1: "Tipo de Secretaria Virtual" - Clear mode selection with active indicator
 * Tab 2: "Configuración y Ajustes" - Context-aware config based on selected mode
 */
const SecretarySettingsPage = () => {
    // Tab state - now starts with type selection
    const [activeTab, setActiveTab] = useState('type');
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [loading, setLoading] = useState(true);

    // Mode Config
    const [secretaryMode, setSecretaryMode] = useState('basic'); // 'basic' | 'pro'
    const [proConfig, setProConfig] = useState({
        slots_count: 3,
        timeout_minutes: 3,
        search_days: 7,
        channels: {
            whatsapp: true,
            app: true
        }
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
                    if (c.key === 'secretary_mode') {
                        setSecretaryMode(c.value || 'basic');
                    }
                    if (c.key === 'pro_config' && c.value) {
                        setProConfig(prev => ({ ...prev, ...c.value }));
                    }
                });
            }
        } catch (err) {
            console.error('Error fetching secretary config:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleSaveModeConfig = async () => {
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

    return (
        <div className="max-w-4xl mx-auto">
            {/* Header */}
            <div className="mb-6">
                <h1 className="text-2xl font-black text-slate-800 flex items-center gap-3">
                    <div className="p-2 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl text-white">
                        <Bot size={24} />
                    </div>
                    Secretaria Virtual
                    {/* Active Mode Badge */}
                    <span className={`ml-2 px-3 py-1 text-xs font-bold rounded-full ${secretaryMode === 'pro'
                            ? 'bg-purple-100 text-purple-700 border border-purple-200'
                            : 'bg-blue-100 text-blue-700 border border-blue-200'
                        }`}>
                        {secretaryMode === 'pro' ? '✨ PRO ACTIVO' : '📋 BÁSICO ACTIVO'}
                    </span>
                </h1>
                <p className="text-slate-500 mt-1">Elige el tipo de asistente y configúralo según tus necesidades</p>
            </div>

            {/* Tabs - NEW STRUCTURE */}
            <div className="flex gap-2 mb-6 border-b border-slate-200 pb-2">
                <button
                    onClick={() => setActiveTab('type')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-t-lg font-medium transition-all ${activeTab === 'type'
                        ? 'bg-indigo-100 text-indigo-700 border-b-2 border-indigo-500'
                        : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                        }`}
                >
                    <Zap size={16} />
                    Tipo de Secretaria
                </button>
                <button
                    onClick={() => setActiveTab('config')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-t-lg font-medium transition-all ${activeTab === 'config'
                        ? 'bg-indigo-100 text-indigo-700 border-b-2 border-indigo-500'
                        : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                        }`}
                >
                    <Settings size={16} />
                    Configuración y Ajustes
                </button>
            </div>

            {/* Tab Content */}
            <div>
                {/* ═══════════════════════════════════════════════════════════════════ */}
                {/* TAB 1: TIPO DE SECRETARIA VIRTUAL */}
                {/* ═══════════════════════════════════════════════════════════════════ */}
                {activeTab === 'type' && (
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-6">
                        {/* Warning Banner - CLEAR */}
                        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
                            <AlertTriangle className="text-amber-500 shrink-0 mt-0.5" size={20} />
                            <div>
                                <p className="font-bold text-amber-800">⚠️ Solo un modo puede estar activo a la vez</p>
                                <p className="text-sm text-amber-700">Al cambiar de tipo, el anterior se desactiva automáticamente.</p>
                            </div>
                        </div>

                        {/* Mode Selection - Clear Radio Cards */}
                        <div className="space-y-4">
                            {/* BASIC Mode */}
                            <label
                                className={`relative block p-6 rounded-xl border-2 cursor-pointer transition-all ${secretaryMode === 'basic'
                                    ? 'border-blue-500 bg-blue-50 shadow-lg shadow-blue-100'
                                    : 'border-slate-200 hover:border-slate-300 bg-white'
                                    }`}
                            >
                                <div className="flex items-start gap-4">
                                    <input
                                        type="radio"
                                        name="secretary_mode"
                                        value="basic"
                                        checked={secretaryMode === 'basic'}
                                        onChange={() => setSecretaryMode('basic')}
                                        className="mt-1 w-5 h-5 text-blue-600"
                                    />
                                    <div className="flex-1">
                                        <div className="flex items-center justify-between">
                                            <h4 className="font-bold text-slate-800 text-lg flex items-center gap-2">
                                                <Users size={20} className="text-blue-600" />
                                                BÁSICO - Gestión Manual
                                            </h4>
                                            {secretaryMode === 'basic' && (
                                                <span className="px-3 py-1 bg-blue-600 text-white text-xs font-bold rounded-full animate-pulse">
                                                    🟢 ACTIVO
                                                </span>
                                            )}
                                        </div>
                                        <ul className="mt-3 space-y-2 text-sm text-slate-600">
                                            <li className="flex items-center gap-2">
                                                <span className="w-1.5 h-1.5 rounded-full bg-blue-400"></span>
                                                Cliente solicita servicio vía WhatsApp
                                            </li>
                                            <li className="flex items-center gap-2">
                                                <span className="w-1.5 h-1.5 rounded-full bg-blue-400"></span>
                                                Sistema crea ticket en estado "solicitado"
                                            </li>
                                            <li className="flex items-center gap-2">
                                                <span className="w-1.5 h-1.5 rounded-full bg-blue-400"></span>
                                                Admin llama al cliente y coordina cita
                                            </li>
                                            <li className="flex items-center gap-2">
                                                <span className="w-1.5 h-1.5 rounded-full bg-blue-400"></span>
                                                Admin asigna técnico manualmente
                                            </li>
                                        </ul>
                                    </div>
                                </div>
                            </label>

                            {/* PRO Mode */}
                            <label
                                className={`relative block p-6 rounded-xl border-2 cursor-pointer transition-all ${secretaryMode === 'pro'
                                    ? 'border-purple-500 bg-gradient-to-br from-purple-50 to-indigo-50 shadow-lg shadow-purple-100'
                                    : 'border-slate-200 hover:border-slate-300 bg-white'
                                    }`}
                            >
                                <div className="flex items-start gap-4">
                                    <input
                                        type="radio"
                                        name="secretary_mode"
                                        value="pro"
                                        checked={secretaryMode === 'pro'}
                                        onChange={() => setSecretaryMode('pro')}
                                        className="mt-1 w-5 h-5 text-purple-600"
                                    />
                                    <div className="flex-1">
                                        <div className="flex items-center justify-between">
                                            <h4 className="font-bold text-slate-800 text-lg flex items-center gap-2">
                                                <Zap size={20} className="text-purple-600" />
                                                PRO - Autopilot
                                                <span className="px-2 py-0.5 bg-purple-600 text-white text-[10px] font-bold rounded-full">NUEVO</span>
                                            </h4>
                                            {secretaryMode === 'pro' && (
                                                <span className="px-3 py-1 bg-purple-600 text-white text-xs font-bold rounded-full animate-pulse">
                                                    🟢 ACTIVO
                                                </span>
                                            )}
                                        </div>
                                        <ul className="mt-3 space-y-2 text-sm text-slate-600">
                                            <li className="flex items-center gap-2">
                                                <span className="text-purple-500">✨</span>
                                                Sistema propone {proConfig.slots_count} citas disponibles automáticamente
                                            </li>
                                            <li className="flex items-center gap-2">
                                                <span className="text-purple-500">✨</span>
                                                Cliente elige en {proConfig.timeout_minutes} minutos (o timeout)
                                            </li>
                                            <li className="flex items-center gap-2">
                                                <span className="text-purple-500">✨</span>
                                                Sistema asigna técnico automáticamente
                                            </li>
                                            <li className="flex items-center gap-2">
                                                <span className="text-purple-500">✨</span>
                                                Optimiza rutas y agenda proactivamente
                                            </li>
                                        </ul>
                                    </div>
                                </div>
                            </label>
                        </div>

                        {/* Save Button */}
                        <div className="flex justify-end pt-4 border-t border-slate-100">
                            <button
                                onClick={handleSaveModeConfig}
                                disabled={saving}
                                className={`flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-white transition-all ${saved
                                    ? 'bg-green-500'
                                    : 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 shadow-lg hover:shadow-xl'
                                    } disabled:opacity-50`}
                            >
                                {saved ? (
                                    <>
                                        <CheckCircle size={18} />
                                        ¡Guardado!
                                    </>
                                ) : saving ? (
                                    <>
                                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                        Guardando...
                                    </>
                                ) : (
                                    <>
                                        <Save size={18} />
                                        Guardar Tipo
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                )}

                {/* ═══════════════════════════════════════════════════════════════════ */}
                {/* TAB 2: CONFIGURACIÓN Y AJUSTES (Contextual based on mode) */}
                {/* ═══════════════════════════════════════════════════════════════════ */}
                {activeTab === 'config' && (
                    <div className="space-y-6">
                        {/* Mode Indicator */}
                        <div className={`p-4 rounded-xl border ${secretaryMode === 'pro'
                                ? 'bg-purple-50 border-purple-200'
                                : 'bg-blue-50 border-blue-200'
                            }`}>
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    {secretaryMode === 'pro' ? (
                                        <Zap className="text-purple-600" size={24} />
                                    ) : (
                                        <Users className="text-blue-600" size={24} />
                                    )}
                                    <div>
                                        <p className={`font-bold ${secretaryMode === 'pro' ? 'text-purple-800' : 'text-blue-800'}`}>
                                            Configurando modo: {secretaryMode === 'pro' ? 'PRO - Autopilot' : 'BÁSICO - Manual'}
                                        </p>
                                        <p className={`text-sm ${secretaryMode === 'pro' ? 'text-purple-600' : 'text-blue-600'}`}>
                                            Los ajustes aplicarán al tipo de secretaria activo
                                        </p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setActiveTab('type')}
                                    className="text-sm font-medium text-slate-500 hover:text-slate-700 underline"
                                >
                                    Cambiar tipo →
                                </button>
                            </div>
                        </div>

                        {/* WhatsApp Bot Configuration (Common to both modes) */}
                        <WhatsAppBotSection hideActiveToggle={true} />

                        {/* PRO-Specific Configuration */}
                        {secretaryMode === 'pro' && (
                            <div className="bg-white rounded-xl border border-purple-200 shadow-sm overflow-hidden">
                                <div className="bg-gradient-to-r from-purple-600 to-indigo-600 p-4 flex items-center gap-3">
                                    <Zap className="text-white" size={22} />
                                    <h3 className="text-lg font-bold text-white">Configuración PRO</h3>
                                </div>
                                <div className="p-6 space-y-6">
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                        <div>
                                            <label className="block text-sm font-bold text-slate-700 mb-2">
                                                📅 Citas a proponer
                                            </label>
                                            <select
                                                value={proConfig.slots_count}
                                                onChange={(e) => setProConfig(prev => ({ ...prev, slots_count: parseInt(e.target.value) }))}
                                                className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 bg-slate-50"
                                            >
                                                {[1, 2, 3, 4, 5].map(n => (
                                                    <option key={n} value={n}>{n} {n === 1 ? 'cita' : 'citas'}</option>
                                                ))}
                                            </select>
                                            <p className="text-xs text-slate-500 mt-1">Opciones que verá el cliente</p>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-bold text-slate-700 mb-2">
                                                ⏱️ Timeout respuesta
                                            </label>
                                            <select
                                                value={proConfig.timeout_minutes}
                                                onChange={(e) => setProConfig(prev => ({ ...prev, timeout_minutes: parseInt(e.target.value) }))}
                                                className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 bg-slate-50"
                                            >
                                                {[1, 2, 3, 5, 10].map(n => (
                                                    <option key={n} value={n}>{n} minutos</option>
                                                ))}
                                            </select>
                                            <p className="text-xs text-slate-500 mt-1">Tiempo para elegir antes de cerrar</p>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-bold text-slate-700 mb-2">
                                                🔮 Días a futuro
                                            </label>
                                            <select
                                                value={proConfig.search_days}
                                                onChange={(e) => setProConfig(prev => ({ ...prev, search_days: parseInt(e.target.value) }))}
                                                className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 bg-slate-50"
                                            >
                                                {[3, 5, 7, 10, 14].map(n => (
                                                    <option key={n} value={n}>{n} días</option>
                                                ))}
                                            </select>
                                            <p className="text-xs text-slate-500 mt-1">Rango de búsqueda de disponibilidad</p>
                                        </div>
                                    </div>

                                    {/* Channels */}
                                    <div className="border-t border-slate-100 pt-6">
                                        <label className="block text-sm font-bold text-slate-700 mb-3">
                                            📱 Canales donde activar PRO
                                        </label>
                                        <div className="flex gap-6">
                                            <label className="flex items-center gap-3 cursor-pointer p-3 rounded-xl border border-slate-200 hover:border-purple-300 transition-colors">
                                                <input
                                                    type="checkbox"
                                                    checked={proConfig.channels.whatsapp}
                                                    onChange={(e) => setProConfig(prev => ({
                                                        ...prev,
                                                        channels: { ...prev.channels, whatsapp: e.target.checked }
                                                    }))}
                                                    className="w-5 h-5 text-purple-600 rounded"
                                                />
                                                <span className="font-medium text-slate-700">WhatsApp Bot</span>
                                            </label>
                                            <label className="flex items-center gap-3 cursor-pointer p-3 rounded-xl border border-slate-200 hover:border-purple-300 transition-colors">
                                                <input
                                                    type="checkbox"
                                                    checked={proConfig.channels.app}
                                                    onChange={(e) => setProConfig(prev => ({
                                                        ...prev,
                                                        channels: { ...prev.channels, app: e.target.checked }
                                                    }))}
                                                    className="w-5 h-5 text-purple-600 rounded"
                                                />
                                                <span className="font-medium text-slate-700">App Cliente</span>
                                            </label>
                                        </div>
                                    </div>

                                    {/* Save PRO Config */}
                                    <div className="flex justify-end pt-4 border-t border-slate-100">
                                        <button
                                            onClick={handleSaveModeConfig}
                                            disabled={saving}
                                            className={`flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-white transition-all ${saved
                                                ? 'bg-green-500'
                                                : 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 shadow-lg hover:shadow-xl'
                                                } disabled:opacity-50`}
                                        >
                                            {saved ? (
                                                <>
                                                    <CheckCircle size={18} />
                                                    ¡Guardado!
                                                </>
                                            ) : saving ? (
                                                <>
                                                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                                    Guardando...
                                                </>
                                            ) : (
                                                <>
                                                    <Save size={18} />
                                                    Guardar Config PRO
                                                </>
                                            )}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default SecretarySettingsPage;
