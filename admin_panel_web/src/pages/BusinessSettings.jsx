
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Save, Clock, Plus, Trash2, ShieldCheck, Briefcase, Timer, Wrench } from 'lucide-react';
import { useToast } from '../components/ToastProvider';

const BusinessSettings = () => {
    const { addToast } = useToast();
    const [loading, setLoading] = useState(true);
    const [workingHours, setWorkingHours] = useState({});
    const [serviceTypes, setServiceTypes] = useState([]);
    const [durationRules, setDurationRules] = useState({ default_duration: 60, rules: [] });

    // Temporary basic state for weekdays
    const weekdays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    const weekdayLabels = { monday: 'Lunes', tuesday: 'Martes', wednesday: 'Miércoles', thursday: 'Jueves', friday: 'Viernes', saturday: 'Sábado', sunday: 'Domingo' };

    useEffect(() => {
        fetchSettings();
    }, []);

    const fetchSettings = async () => {
        try {
            // 1. Fetch Working Hours
            const { data: configData } = await supabase.from('business_config').select('value').eq('key', 'working_hours').single();
            if (configData) setWorkingHours(configData.value);

            // 2. Fetch Service Types
            const { data: typesData } = await supabase.from('service_types').select('*').order('estimated_duration_min');
            setServiceTypes(typesData || []);
            
            // 3. Fetch Duration Rules
            const { data: rulesData } = await supabase.from('business_config').select('value').eq('key', 'service_duration_rules').single();
            if (rulesData?.value) setDurationRules(rulesData.value);
        } catch (error) {
            console.error('Error fetching settings:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleSaveHours = async () => {
        // 🕵️ RASTREO: ¿QUÉ ESTAMOS GUARDANDO Y DÓNDE?
        console.group("🚨 AUDITORÍA DE GUARDADO DE HORARIO");
        console.log("📦 Payload (Datos Crudos):", workingHours);
        console.log("🗄️ Tabla Objetivo (Hardcoded en código):", "business_config");
        console.log("📝 Estructura enviada:", JSON.stringify(workingHours, null, 2));
        console.groupEnd();

        try {
            const { error } = await supabase
                .from('business_config')
                .upsert({
                    key: 'working_hours',
                    value: workingHours
                }, { onConflict: 'key' });

            if (error) throw error;
            addToast('Horario actualizado correctamente', 'success');
        } catch (error) {
            addToast('Error al guardar horario: ' + error.message, 'error');
        }
    };

    const handleHourChange = (day, field, value) => {
        setWorkingHours(prev => ({
            ...prev,
            [day]: {
                ...prev[day],
                [field]: value
            }
        }));
    };

    const toggleDay = (day) => {
        setWorkingHours(prev => {
            const current = prev[day];
            return {
                ...prev,
                [day]: current ? null : { start: '09:00', end: '19:00', breaks: [] }
            };
        });
    };

    // Service Types Handlers
    const handleUpdateServiceType = async (id, field, value) => {
        const { error } = await supabase.from('service_types').update({ [field]: value }).eq('id', id);
        if (!error) {
            setServiceTypes(prev => prev.map(t => t.id === id ? { ...t, [field]: value } : t));
        }
    };

    const handleCreateServiceType = async () => {
        const name = prompt("Nombre del nuevo servicio:");
        if (!name) return;
        const { data, error } = await supabase.from('service_types').insert({ name, estimated_duration_min: 60 }).select().single();
        if (data) setServiceTypes([...serviceTypes, data]);
    };

    // Duration Rules Handlers
    const handleUpdateDurationRule = (index, field, value) => {
        setDurationRules(prev => {
            const newRules = [...prev.rules];
            newRules[index] = { ...newRules[index], [field]: field === 'duration_min' ? parseInt(value) || 0 : value };
            return { ...prev, rules: newRules };
        });
    };

    const handleAddDurationRule = () => {
        setDurationRules(prev => ({
            ...prev,
            rules: [...prev.rules, { service_pattern: '', appliance_pattern: '*', duration_min: 60, label: 'Nueva Regla' }]
        }));
    };

    const handleDeleteDurationRule = (index) => {
        if (!window.confirm('¿Eliminar esta regla de duración?')) return;
        setDurationRules(prev => ({
            ...prev,
            rules: prev.rules.filter((_, i) => i !== index)
        }));
    };

    const handleSaveDurationRules = async () => {
        try {
            const { error } = await supabase
                .from('business_config')
                .upsert({ key: 'service_duration_rules', value: durationRules }, { onConflict: 'key' });
            
            if (error) throw error;
            addToast('Reglas de duración guardadas correctamente', 'success');
        } catch (error) {
            addToast('Error al guardar reglas: ' + error.message, 'error');
        }
    };

    if (loading) return <div className="p-10 text-center">Cargando configuración...</div>;

    return (
        <div className="max-w-5xl mx-auto space-y-8 pb-20">
            <h1 className="text-3xl font-bold text-slate-800 flex items-center gap-3">
                <Briefcase className="text-blue-600" />
                Configuración del Negocio
            </h1>

            {/* SECCION 1: HORARIO LABORAL */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="p-6 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                    <div>
                        <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                            <Clock className="text-slate-500" /> Horario Laboral & Operativo
                        </h2>
                        <p className="text-sm text-slate-500">Define los días y horas hábiles para el motor de agendado inteligente.</p>
                    </div>
                    <button onClick={handleSaveHours} className="flex items-center gap-2 bg-blue-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-blue-700 transition shadow-lg shadow-blue-900/10">
                        <Save size={18} /> Guardar Horario
                    </button>
                </div>

                <div className="p-6 grid gap-4">
                    {weekdays.map(day => {
                        const config = workingHours[day];
                        const isOpen = !!config;

                        return (
                            <div key={day} className={`flex items-center gap-4 p-4 rounded-lg border ${isOpen ? 'bg-white border-slate-200' : 'bg-slate-50 border-slate-100 opacity-60'}`}>
                                <div className="w-32 flex items-center gap-3">
                                    <input
                                        type="checkbox"
                                        checked={isOpen}
                                        onChange={() => toggleDay(day)}
                                        className="w-5 h-5 accent-blue-600 rounded"
                                    />
                                    <span className="font-bold capitalize text-slate-700">{weekdayLabels[day]}</span>
                                </div>

                                {isOpen ? (
                                    <div className="flex items-center gap-4 flex-1">
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs font-bold text-slate-400 uppercase">Abre</span>
                                            <input
                                                type="time"
                                                value={config.start}
                                                onChange={(e) => handleHourChange(day, 'start', e.target.value)}
                                                className="border rounded px-2 py-1 font-mono"
                                            />
                                        </div>
                                        <div className="w-4 h-px bg-slate-300"></div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs font-bold text-slate-400 uppercase">Cierra</span>
                                            <input
                                                type="time"
                                                value={config.end}
                                                onChange={(e) => handleHourChange(day, 'end', e.target.value)}
                                                className="border rounded px-2 py-1 font-mono"
                                            />
                                        </div>
                                        {/* Break implementation pending visual UI, assumed generic for now */}
                                    </div>
                                ) : (
                                    <span className="text-sm text-slate-400 italic font-medium">Cerrado</span>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* SECCION 2: TIPOS DE SERVICIO */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="p-6 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                    <div>
                        <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                            <ShieldCheck className="text-slate-500" /> Catálogo de Servicios & Duraciones
                        </h2>
                        <p className="text-sm text-slate-500">El sistema calculará los huecos automáticamente basándose en estas duraciones.</p>
                    </div>
                    <button onClick={handleCreateServiceType} className="flex items-center gap-2 bg-slate-800 text-white px-4 py-2 rounded-lg font-bold hover:bg-slate-900 transition text-sm">
                        <Plus size={18} /> Nuevo Tipo
                    </button>
                </div>

                <table className="w-full text-left">
                    <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-bold">
                        <tr>
                            <th className="px-6 py-3">Nombre del Servicio</th>
                            <th className="px-6 py-3">Duración Estimada (min)</th>
                            <th className="px-6 py-3">Margen Seguridad (min)</th>
                            <th className="px-6 py-3 text-right">Acciones</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {serviceTypes.map(type => (
                            <tr key={type.id} className="hover:bg-slate-50 group">
                                <td className="px-6 py-3">
                                    <input
                                        type="text"
                                        value={type.name}
                                        onChange={(e) => handleUpdateServiceType(type.id, 'name', e.target.value)}
                                        className="bg-transparent font-bold text-slate-700 outline-none w-full focus:underline"
                                    />
                                </td>
                                <td className="px-6 py-3">
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="number"
                                            value={type.estimated_duration_min}
                                            onChange={(e) => handleUpdateServiceType(type.id, 'estimated_duration_min', parseInt(e.target.value))}
                                            className="w-20 border rounded px-2 py-1 font-mono text-center"
                                        />
                                        <span className="text-xs text-slate-400">min</span>
                                        {/* Visual Bar */}
                                        <div className="h-1 bg-blue-200 rounded-full w-24 overflow-hidden ml-2">
                                            <div className="h-full bg-blue-600" style={{ width: `${Math.min(type.estimated_duration_min / 480 * 100, 100)}%` }}></div>
                                        </div>
                                    </div>
                                </td>
                                <td className="px-6 py-3">
                                    <input
                                        type="number"
                                        value={type.buffer_time_min}
                                        onChange={(e) => handleUpdateServiceType(type.id, 'buffer_time_min', parseInt(e.target.value))}
                                        className="w-16 border rounded px-2 py-1 font-mono text-center text-slate-500"
                                    />
                                </td>
                                <td className="px-6 py-3 text-right">
                                    <button className="text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition"><Trash2 size={18} /></button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* SECCION 3: REGLAS DE DURACIÓN POR ELECTRODOMÉSTICO */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="p-6 border-b border-slate-100 bg-gradient-to-r from-amber-50 to-orange-50 flex justify-between items-center">
                    <div>
                        <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                            <Timer className="text-amber-600" /> Reglas de Duración Avanzadas
                        </h2>
                        <p className="text-sm text-slate-500">
                            Configura duraciones específicas según <strong>tipo de servicio + electrodoméstico</strong>.
                            <br />
                            <span className="text-amber-600">Estas reglas tienen prioridad sobre los tipos básicos.</span>
                        </p>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={handleAddDurationRule} className="flex items-center gap-2 bg-amber-500 text-white px-4 py-2 rounded-lg font-bold hover:bg-amber-600 transition text-sm">
                            <Plus size={18} /> Nueva Regla
                        </button>
                        <button onClick={handleSaveDurationRules} className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-blue-700 transition text-sm shadow-lg shadow-blue-900/10">
                            <Save size={18} /> Guardar Reglas
                        </button>
                    </div>
                </div>

                {/* Default Duration */}
                <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex items-center gap-4">
                    <span className="text-sm font-bold text-slate-600">Duración por defecto (si no coincide ninguna regla):</span>
                    <input
                        type="number"
                        value={durationRules.default_duration || 60}
                        onChange={(e) => setDurationRules(prev => ({ ...prev, default_duration: parseInt(e.target.value) || 60 }))}
                        className="w-20 border rounded px-2 py-1 font-mono text-center"
                    />
                    <span className="text-xs text-slate-400">min</span>
                </div>

                <div className="p-6 space-y-3">
                    {durationRules.rules?.length === 0 && (
                        <div className="text-center py-8 text-slate-400">
                            <Wrench size={32} className="mx-auto mb-2 opacity-50" />
                            <p>No hay reglas configuradas. Añade una para personalizar duraciones.</p>
                        </div>
                    )}
                    
                    {durationRules.rules?.map((rule, index) => (
                        <div key={index} className="flex items-center gap-3 p-4 bg-slate-50 rounded-xl border border-slate-200 hover:border-amber-300 transition group">
                            {/* Label */}
                            <div className="flex-1">
                                <input
                                    type="text"
                                    value={rule.label || ''}
                                    onChange={(e) => handleUpdateDurationRule(index, 'label', e.target.value)}
                                    placeholder="Nombre de la regla"
                                    className="w-full bg-white border border-slate-200 rounded px-3 py-1.5 text-sm font-bold text-slate-700 focus:border-amber-400 focus:outline-none"
                                />
                            </div>
                            
                            {/* Service Pattern */}
                            <div className="w-36">
                                <label className="text-[10px] text-slate-400 uppercase font-bold">Servicio</label>
                                <select
                                    value={rule.service_pattern || ''}
                                    onChange={(e) => handleUpdateDurationRule(index, 'service_pattern', e.target.value)}
                                    className="w-full bg-white border border-slate-200 rounded px-2 py-1.5 text-xs"
                                >
                                    <option value="">Cualquiera</option>
                                    <option value="diagnos|revision">Diagnóstico</option>
                                    <option value="reparac">Reparación</option>
                                    <option value="instalac">Instalación</option>
                                    <option value="mantenim">Mantenimiento</option>
                                </select>
                            </div>
                            
                            {/* Appliance Pattern */}
                            <div className="w-44">
                                <label className="text-[10px] text-slate-400 uppercase font-bold">Electrodoméstico</label>
                                <select
                                    value={rule.appliance_pattern || '*'}
                                    onChange={(e) => handleUpdateDurationRule(index, 'appliance_pattern', e.target.value)}
                                    className="w-full bg-white border border-slate-200 rounded px-2 py-1.5 text-xs"
                                >
                                    <option value="*">Cualquiera</option>
                                    <option value="frigo|nevera|refrigerador">Frigorífico/Nevera</option>
                                    <option value="lavadora">Lavadora</option>
                                    <option value="lavavajillas">Lavavajillas</option>
                                    <option value="secadora">Secadora</option>
                                    <option value="horno|microondas">Horno/Microondas</option>
                                    <option value="calentador|termo|boiler">Calentador/Termo</option>
                                    <option value="aire|acondicionado|split">Aire Acondicionado</option>
                                    <option value="caldera">Caldera</option>
                                </select>
                            </div>
                            
                            {/* Duration */}
                            <div className="w-24">
                                <label className="text-[10px] text-slate-400 uppercase font-bold">Duración</label>
                                <div className="flex items-center gap-1">
                                    <input
                                        type="number"
                                        value={rule.duration_min || 60}
                                        onChange={(e) => handleUpdateDurationRule(index, 'duration_min', e.target.value)}
                                        className="w-16 bg-white border border-slate-200 rounded px-2 py-1.5 text-center font-mono text-sm"
                                    />
                                    <span className="text-xs text-slate-400">min</span>
                                </div>
                            </div>
                            
                            {/* Delete */}
                            <button 
                                onClick={() => handleDeleteDurationRule(index)}
                                className="text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition p-2"
                            >
                                <Trash2 size={18} />
                            </button>
                        </div>
                    ))}
                </div>
                
                {/* Help */}
                <div className="px-6 py-4 bg-amber-50 border-t border-amber-100 text-xs text-amber-700">
                    <strong>Ejemplo:</strong> Si configuras "Reparación + Frigorífico = 90 min", cuando se cree un ticket de reparación de frigorífico, 
                    el sistema usará 90 minutos automáticamente en lugar de la duración genérica.
                </div>
            </div>
        </div>
    );
};

export default BusinessSettings;
