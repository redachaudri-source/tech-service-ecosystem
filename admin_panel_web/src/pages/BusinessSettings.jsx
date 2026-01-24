
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Save, Clock, Plus, Trash2, ShieldCheck, Briefcase } from 'lucide-react';
import { useToast } from '../components/ToastProvider';

const BusinessSettings = () => {
    const { addToast } = useToast();
    const [loading, setLoading] = useState(true);
    const [workingHours, setWorkingHours] = useState({});
    const [serviceTypes, setServiceTypes] = useState([]);

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
        </div>
    );
};

export default BusinessSettings;
