import { useState, useEffect } from 'react';
import { ArrowLeft, Bell, Moon, Smartphone, Volume2, Save, CheckCircle, AlertCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const TechSettings = () => {
    const navigate = useNavigate();

    // Simple state for demo settings (would normally be saved to localStorage or DB)
    const [settings, setSettings] = useState({
        notifications: true,
        sound: true,
        darkMode: document.documentElement.classList.contains('dark'), // Read initial state from DOM
        preAlertMinutes: 30
    });

    const [saved, setSaved] = useState(false);

    useEffect(() => {
        // Load from localStorage if exists
        const stored = localStorage.getItem('tech_app_settings');
        if (stored) {
            const parsed = JSON.parse(stored);
            setSettings(parsed);
            // Apply Dark Mode on load
            if (parsed.darkMode) {
                document.documentElement.classList.add('dark');
            } else {
                document.documentElement.classList.remove('dark');
            }
        }
    }, []);

    const handleSave = () => {
        // Persist to localStorage
        localStorage.setItem('tech_app_settings', JSON.stringify(settings));

        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
    };

    const handleChange = (key, value) => {
        const newSettings = { ...settings, [key]: value };
        setSettings(newSettings);

        // Instant visual feedback for Dark Mode
        if (key === 'darkMode') {
            if (value) {
                document.documentElement.classList.add('dark');
            } else {
                document.documentElement.classList.remove('dark');
            }
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-900 transition-colors duration-300 pb-24">
            {/* Header */}
            <div className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-4 py-4 sticky top-0 z-10 flex items-center justify-between shadow-sm transition-colors duration-300">
                <div className="flex items-center gap-3">
                    <button onClick={() => navigate(-1)} className="text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white">
                        <ArrowLeft size={24} />
                    </button>
                    <h1 className="text-xl font-bold text-slate-800 dark:text-white">Ajustes</h1>
                </div>
            </div>

            <div className="p-4 space-y-6 max-w-lg mx-auto">

                {/* Section: General */}
                <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 overflow-hidden transition-colors duration-300">
                    <div className="p-4 space-y-6">
                        {/* Dark Mode */}
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-slate-100 dark:bg-slate-700 rounded-lg text-slate-600 dark:text-slate-300 transition-colors">
                                    <Moon size={20} />
                                </div>
                                <span className="font-medium text-slate-700 dark:text-slate-200">Modo Oscuro</span>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={settings.darkMode}
                                    onChange={(e) => handleChange('darkMode', e.target.checked)}
                                    className="sr-only peer"
                                />
                                <div className="w-11 h-6 bg-slate-200 dark:bg-slate-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 dark:after:border-gray-600 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
                            </label>
                        </div>
                    </div>
                </div>

                {/* Section: Notificaciones */}
                <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 overflow-hidden transition-colors duration-300">
                    <div className="px-4 py-3 bg-slate-50 dark:bg-slate-700/50 border-b border-slate-100 dark:border-slate-700 flex items-center gap-2">
                        <Bell size={18} className="text-blue-500" />
                        <h2 className="font-semibold text-slate-700 dark:text-slate-200">Notificaciones</h2>
                    </div>

                    <div className="p-4 space-y-6">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-blue-50 dark:bg-blue-900/30 rounded-lg text-blue-600 dark:text-blue-400">
                                    <Smartphone size={20} />
                                </div>
                                <div>
                                    <span className="block font-medium text-slate-700 dark:text-slate-200">Alertas de Servicio</span>
                                    <span className="text-xs text-slate-400">Avisar antes de cada cita</span>
                                </div>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={settings.notifications}
                                    onChange={(e) => handleChange('notifications', e.target.checked)}
                                    className="sr-only peer"
                                />
                                <div className="w-11 h-6 bg-slate-200 dark:bg-slate-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 dark:after:border-gray-600 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                            </label>
                        </div>

                        {settings.notifications && (
                            <div className="animate-in fade-in slide-in-from-top-2 bg-slate-50 dark:bg-slate-700/30 p-4 rounded-lg border border-slate-200 dark:border-slate-600">
                                <label className="block text-sm font-bold text-slate-700 dark:text-slate-200 mb-2">Tiempo de Antelación</label>
                                <select
                                    value={settings.preAlertMinutes}
                                    onChange={(e) => handleChange('preAlertMinutes', parseInt(e.target.value))}
                                    className="w-full p-3 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-medium text-slate-700 dark:text-slate-200"
                                >
                                    <option value="15">15 minutos antes</option>
                                    <option value="30">30 minutos antes</option>
                                    <option value="60">1 hora antes</option>
                                </select>
                            </div>
                        )}

                        <div className="flex items-center justify-between border-t border-slate-100 dark:border-slate-700 pt-4">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-emerald-50 dark:bg-emerald-900/30 rounded-lg text-emerald-600 dark:text-emerald-400">
                                    <Volume2 size={20} />
                                </div>
                                <span className="font-medium text-slate-700 dark:text-slate-200">Sonido de Alerta</span>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={settings.sound}
                                    onChange={(e) => handleChange('sound', e.target.checked)}
                                    className="sr-only peer"
                                />
                                <div className="w-11 h-6 bg-slate-200 dark:bg-slate-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 dark:after:border-gray-600 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                            </label>
                        </div>
                    </div>
                </div>

                {/* Save Button - Standard Size */}
                <div className="pt-4">
                    <button
                        onClick={handleSave}
                        disabled={saved}
                        className={`w-full md:w-auto px-8 py-3 rounded-lg font-bold text-base flex items-center justify-center gap-2 transition-all transform active:scale-95 ${saved
                                ? 'bg-green-500 text-white'
                                : 'bg-slate-900 dark:bg-white dark:text-slate-900 text-white hover:bg-slate-800'
                            }`}
                    >
                        {saved ? (
                            <>
                                <CheckCircle size={20} />
                                ¡Guardado!
                            </>
                        ) : (
                            <>
                                <Save size={20} />
                                Guardar Cambios
                            </>
                        )}
                    </button>
                </div>

                <div className="text-center pt-8 pb-4">
                    <p className="text-xs text-slate-400">Versión 1.2.1</p>
                </div>
            </div>
        </div>
    );
};

export default TechSettings;
