import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Bot, MessageSquare, Settings, Save, CheckCircle, AlertTriangle, Clock, Send } from 'lucide-react';

const SecretarySettingsPage = () => {
    // Tab state
    const [activeTab, setActiveTab] = useState('bot');
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);

    // Bot WhatsApp Config
    const [botConfig, setBotConfig] = useState({
        company_name: 'Fixarr',
        company_phone: '',
        company_email: '',
        greeting_message: '',
        farewell_message: '',
        service_conditions: '',
        bot_active: true
    });

    // Operation Days (L-D) - NEW
    const [activeDays, setActiveDays] = useState({
        monday: true,
        tuesday: true,
        wednesday: true,
        thursday: true,
        friday: true,
        saturday: false,
        sunday: false
    });

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
        fetchConfig();
    }, []);

    const fetchConfig = async () => {
        try {
            // Fetch all relevant configs
            const { data: configs } = await supabase
                .from('business_config')
                .select('key, value')
                .in('key', ['bot_config', 'secretary_mode', 'bot_active_days', 'pro_config']);

            if (configs) {
                configs.forEach(c => {
                    if (c.key === 'bot_config' && c.value) {
                        setBotConfig(prev => ({ ...prev, ...c.value }));
                    }
                    if (c.key === 'secretary_mode') {
                        setSecretaryMode(c.value || 'basic');
                    }
                    if (c.key === 'bot_active_days' && c.value) {
                        // Convert array [1,2,3,4,5] to object
                        const daysArray = c.value;
                        setActiveDays({
                            monday: daysArray.includes(1),
                            tuesday: daysArray.includes(2),
                            wednesday: daysArray.includes(3),
                            thursday: daysArray.includes(4),
                            friday: daysArray.includes(5),
                            saturday: daysArray.includes(6),
                            sunday: daysArray.includes(0)
                        });
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

    const handleSave = async () => {
        setSaving(true);
        try {
            // Convert activeDays to array format
            const daysArray = [];
            if (activeDays.sunday) daysArray.push(0);
            if (activeDays.monday) daysArray.push(1);
            if (activeDays.tuesday) daysArray.push(2);
            if (activeDays.wednesday) daysArray.push(3);
            if (activeDays.thursday) daysArray.push(4);
            if (activeDays.friday) daysArray.push(5);
            if (activeDays.saturday) daysArray.push(6);

            // Upsert all configs
            const upserts = [
                { key: 'bot_config', value: botConfig },
                { key: 'secretary_mode', value: secretaryMode },
                { key: 'bot_active_days', value: daysArray },
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

    const dayLabels = {
        monday: 'Lunes',
        tuesday: 'Martes',
        wednesday: 'Miércoles',
        thursday: 'Jueves',
        friday: 'Viernes',
        saturday: 'Sábado',
        sunday: 'Domingo'
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
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
                {/* TAB 1: Bot WhatsApp */}
                {activeTab === 'bot' && (
                    <div className="space-y-6">
                        {/* Days of Operation - NEW */}
                        <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-xl p-5 border border-indigo-100">
                            <h3 className="font-bold text-slate-800 flex items-center gap-2 mb-4">
                                <Clock size={18} className="text-indigo-600" />
                                Días de Operación
                            </h3>
                            <p className="text-sm text-slate-500 mb-4">
                                El bot solo responderá en los días seleccionados (24 horas)
                            </p>
                            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
                                {Object.entries(dayLabels).map(([key, label]) => (
                                    <label
                                        key={key}
                                        className={`flex items-center justify-center gap-2 p-3 rounded-lg border cursor-pointer transition-all ${activeDays[key]
                                                ? 'bg-indigo-600 text-white border-indigo-600'
                                                : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'
                                            }`}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={activeDays[key]}
                                            onChange={(e) => setActiveDays(prev => ({ ...prev, [key]: e.target.checked }))}
                                            className="sr-only"
                                        />
                                        <span className="text-sm font-medium">{label.substring(0, 3)}</span>
                                    </label>
                                ))}
                            </div>
                        </div>

                        {/* Bot Active Toggle */}
                        <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border">
                            <div>
                                <h4 className="font-bold text-slate-800">Bot Activo</h4>
                                <p className="text-sm text-slate-500">Activa o desactiva el bot de WhatsApp</p>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={botConfig.bot_active}
                                    onChange={(e) => setBotConfig(prev => ({ ...prev, bot_active: e.target.checked }))}
                                    className="sr-only peer"
                                />
                                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                            </label>
                        </div>

                        {/* Company Info */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Nombre Empresa</label>
                                <input
                                    type="text"
                                    value={botConfig.company_name}
                                    onChange={(e) => setBotConfig(prev => ({ ...prev, company_name: e.target.value }))}
                                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Teléfono WhatsApp</label>
                                <input
                                    type="text"
                                    value={botConfig.company_phone}
                                    onChange={(e) => setBotConfig(prev => ({ ...prev, company_phone: e.target.value }))}
                                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                                />
                            </div>
                        </div>
                    </div>
                )}

                {/* TAB 2: Mode of Operation */}
                {activeTab === 'mode' && (
                    <div className="space-y-6">
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
                    </div>
                )}
            </div>

            {/* Save Button */}
            <div className="mt-6 flex justify-end">
                <button
                    onClick={handleSave}
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
                            Guardar Configuración
                        </>
                    )}
                </button>
            </div>
        </div>
    );
};

export default SecretarySettingsPage;
