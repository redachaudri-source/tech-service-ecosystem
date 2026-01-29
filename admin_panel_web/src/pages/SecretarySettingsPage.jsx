import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Bot, MessageSquare, Settings, Save, CheckCircle, AlertTriangle } from 'lucide-react';
import WhatsAppBotSection from '../components/settings/WhatsAppBotSection';

const SecretarySettingsPage = () => {
    // Tab state
    const [activeTab, setActiveTab] = useState('bot');
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);

    // Mode Config (Tab 2)
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
        }
    };

    const handleSaveModeConfig = async () => {
        setSaving(true);
        try {
            // Upsert mode configs
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
                </h1>
                <p className="text-slate-500 mt-1">Configura el bot de WhatsApp y el modo de operación</p>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 mb-6 border-b border-slate-200 pb-2">
                <button
                    onClick={() => setActiveTab('bot')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-t-lg font-medium transition-all ${activeTab === 'bot'
                        ? 'bg-indigo-100 text-indigo-700 border-b-2 border-indigo-500'
                        : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                        }`}
                >
                    <MessageSquare size={16} />
                    Bot WhatsApp
                </button>
                <button
                    onClick={() => setActiveTab('mode')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-t-lg font-medium transition-all ${activeTab === 'mode'
                        ? 'bg-indigo-100 text-indigo-700 border-b-2 border-indigo-500'
                        : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                        }`}
                >
                    <Settings size={16} />
                    Modo de Operación
                </button>
            </div>

            {/* Tab Content */}
            <div>
                {/* TAB 1: Bot WhatsApp - Uses existing complete component */}
                {activeTab === 'bot' && (
                    <WhatsAppBotSection />
                )}

                {/* TAB 2: Mode of Operation */}
                {activeTab === 'mode' && (
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-6">
                        {/* Warning Banner */}
                        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
                            <AlertTriangle className="text-amber-500 shrink-0 mt-0.5" size={20} />
                            <div>
                                <p className="font-bold text-amber-800">Solo un modo puede estar activo a la vez</p>
                                <p className="text-sm text-amber-700">Al activar PRO, el modo BÁSICO se desactiva automáticamente y viceversa.</p>
                            </div>
                        </div>

                        {/* Mode Selection - Radio Buttons */}
                        <div className="space-y-4">
                            {/* BASIC Mode */}
                            <label
                                className={`block p-5 rounded-xl border-2 cursor-pointer transition-all ${secretaryMode === 'basic'
                                    ? 'border-blue-500 bg-blue-50'
                                    : 'border-slate-200 hover:border-slate-300'
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
                                    <div>
                                        <h4 className="font-bold text-slate-800 text-lg">BÁSICO - Gestión Manual</h4>
                                        <ul className="mt-2 space-y-1 text-sm text-slate-600">
                                            <li>• Cliente solicita servicio</li>
                                            <li>• Sistema crea ticket "solicitado"</li>
                                            <li>• Admin llama y coordina</li>
                                            <li>• Admin asigna manualmente</li>
                                        </ul>
                                    </div>
                                </div>
                            </label>

                            {/* PRO Mode */}
                            <label
                                className={`block p-5 rounded-xl border-2 cursor-pointer transition-all ${secretaryMode === 'pro'
                                    ? 'border-purple-500 bg-purple-50'
                                    : 'border-slate-200 hover:border-slate-300'
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
                                        <div className="flex items-center gap-2">
                                            <h4 className="font-bold text-slate-800 text-lg">PRO - Autopilot</h4>
                                            <span className="px-2 py-0.5 bg-purple-600 text-white text-xs font-bold rounded-full">NUEVO</span>
                                        </div>
                                        <ul className="mt-2 space-y-1 text-sm text-slate-600">
                                            <li>✨ Sistema propone 3 citas disponibles</li>
                                            <li>✨ Cliente elige en 3 minutos</li>
                                            <li>✨ Sistema asigna automáticamente</li>
                                            <li>✨ Optimiza rutas proactivamente</li>
                                        </ul>
                                    </div>
                                </div>
                            </label>
                        </div>

                        {/* PRO Configuration */}
                        {secretaryMode === 'pro' && (
                            <div className="bg-purple-50 rounded-xl p-5 border border-purple-100 space-y-4 mt-6">
                                <h4 className="font-bold text-purple-800 flex items-center gap-2">
                                    <Settings size={18} />
                                    Configuración PRO
                                </h4>

                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Citas a proponer</label>
                                        <select
                                            value={proConfig.slots_count}
                                            onChange={(e) => setProConfig(prev => ({ ...prev, slots_count: parseInt(e.target.value) }))}
                                            className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-purple-500"
                                        >
                                            {[1, 2, 3, 4, 5].map(n => (
                                                <option key={n} value={n}>{n}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Timeout respuesta</label>
                                        <select
                                            value={proConfig.timeout_minutes}
                                            onChange={(e) => setProConfig(prev => ({ ...prev, timeout_minutes: parseInt(e.target.value) }))}
                                            className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-purple-500"
                                        >
                                            {[1, 2, 3, 5, 10].map(n => (
                                                <option key={n} value={n}>{n} minutos</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Días a futuro</label>
                                        <select
                                            value={proConfig.search_days}
                                            onChange={(e) => setProConfig(prev => ({ ...prev, search_days: parseInt(e.target.value) }))}
                                            className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-purple-500"
                                        >
                                            {[3, 5, 7, 10, 14].map(n => (
                                                <option key={n} value={n}>{n} días</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                {/* Channels */}
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-2">Canales activos</label>
                                    <div className="flex gap-4">
                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={proConfig.channels.whatsapp}
                                                onChange={(e) => setProConfig(prev => ({
                                                    ...prev,
                                                    channels: { ...prev.channels, whatsapp: e.target.checked }
                                                }))}
                                                className="w-4 h-4 text-purple-600 rounded"
                                            />
                                            <span className="text-sm text-slate-700">WhatsApp</span>
                                        </label>
                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={proConfig.channels.app}
                                                onChange={(e) => setProConfig(prev => ({
                                                    ...prev,
                                                    channels: { ...prev.channels, app: e.target.checked }
                                                }))}
                                                className="w-4 h-4 text-purple-600 rounded"
                                            />
                                            <span className="text-sm text-slate-700">App Cliente</span>
                                        </label>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Save Button - Only for Mode tab */}
                        <div className="flex justify-end pt-4">
                            <button
                                onClick={handleSaveModeConfig}
                                disabled={saving}
                                className={`flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-white transition-all ${saved
                                    ? 'bg-green-500'
                                    : 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700'
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
                                        Guardar Modo
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default SecretarySettingsPage;
