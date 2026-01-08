import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { X, Filter, User, MapPin, Monitor, Calendar } from 'lucide-react';

const AnalyticsSidebar = ({ isOpen, onClose, filters, onFilterChange }) => {
    const [techs, setTechs] = useState([]);
    const [applianceTypes, setApplianceTypes] = useState([]);

    useEffect(() => {
        if (isOpen) {
            fetchOptions();
        }
    }, [isOpen]);

    const fetchOptions = async () => {
        const { data: t } = await supabase.from('profiles').select('id, full_name').eq('role', 'technician');
        const { data: a } = await supabase.from('appliance_types').select('name');
        if (t) setTechs(t);
        if (a) setApplianceTypes(a);
    };

    const handleChange = (key, value) => {
        onFilterChange({ ...filters, [key]: value });
    };

    return (
        <>
            {/* Backdrop */}
            {isOpen && (
                <div
                    className="fixed inset-0 bg-black/20 backdrop-blur-sm z-30 transition-opacity"
                    onClick={onClose}
                />
            )}

            {/* Sidebar Panel */}
            <div className={`fixed inset-y-0 right-0 w-80 bg-white shadow-2xl z-40 transform transition-transform duration-300 ease-in-out border-l border-slate-100 ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}>
                <div className="h-full flex flex-col">

                    {/* Header */}
                    <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                        <h2 className="font-bold text-slate-800 flex items-center gap-2">
                            <Filter size={20} className="text-blue-600" />
                            Filtros Avanzados
                        </h2>
                        <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition text-slate-500">
                            <X size={20} />
                        </button>
                    </div>

                    {/* Content */}
                    <div className="flex-1 overflow-y-auto p-5 space-y-6">

                        {/* 1. Date Range (Preserved from Main but shown here for detail) */}
                        {/* Note: Main page handles quick range, here we could add custom dates later. For now just show active logic. */}

                        {/* 2. Technician Filter */}
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-slate-400 uppercase flex items-center gap-2">
                                <User size={14} /> Técnico
                            </label>
                            <select
                                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 text-sm"
                                value={filters.techId || ''}
                                onChange={(e) => handleChange('techId', e.target.value || null)}
                            >
                                <option value="">Todos los Técnicos</option>
                                {techs.map(t => (
                                    <option key={t.id} value={t.id}>{t.full_name}</option>
                                ))}
                            </select>
                        </div>

                        {/* 3. Zone (CP) Filter */}
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-slate-400 uppercase flex items-center gap-2">
                                <MapPin size={14} /> Zona (Código Postal)
                            </label>
                            <input
                                type="text"
                                placeholder="Ej: 290"
                                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 text-sm"
                                value={filters.zoneCp || ''}
                                onChange={(e) => handleChange('zoneCp', e.target.value || null)}
                            />
                            <p className="text-[10px] text-slate-400">Filtra por prefijo (ej: "29" para toda Málaga).</p>
                        </div>

                        {/* 4. Appliance Type */}
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-slate-400 uppercase flex items-center gap-2">
                                <Monitor size={14} /> Tipo de Electrodoméstico
                            </label>
                            <select
                                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 text-sm"
                                value={filters.applianceType || ''}
                                onChange={(e) => handleChange('applianceType', e.target.value || null)}
                            >
                                <option value="">Todos los Tipos</option>
                                {applianceTypes.map(a => (
                                    <option key={a.name} value={a.name}>{a.name}</option>
                                ))}
                            </select>
                        </div>

                    </div>

                    {/* Footer */}
                    <div className="p-5 border-t border-slate-100 bg-slate-50">
                        <button
                            onClick={() => onFilterChange({ techId: null, zoneCp: null, applianceType: null })}
                            className="w-full py-3 text-sm font-bold text-slate-500 hover:text-red-500 hover:bg-red-50 rounded-xl transition"
                        >
                            Limpiar Filtros
                        </button>
                    </div>
                </div>
            </div>
        </>
    );
};

export default AnalyticsSidebar;
