import { Shield, Save, X, ToggleLeft, ToggleRight, Calendar, Activity, Users, Map, Wallet, Settings, AlertTriangle } from 'lucide-react';
import { useState, useEffect } from 'react';

const PermissionsModal = ({ admin, permissions, onToggle, onSave, onClose, saving }) => {
    if (!admin) return null;

    const modules = [
        { key: 'can_view_agenda', label: 'Agenda Global', icon: Calendar, desc: 'Ver y gestionar citas.' }, // Merging View/Edit as requested roughly
        { key: 'can_manage_tickets', label: 'Monitor de Servicios', icon: Activity, desc: 'Gestión de tickets y estados.' },
        { key: 'can_view_all_clients', label: 'Gestión de Clientes', icon: Users, desc: 'Base de datos de clientes.' },
        { key: 'can_manage_team', label: 'Gestión de Equipo', icon: Users, desc: 'Ver/Editar técnicos y admins.' }, // "Fleet / Techs" map
        { key: 'can_manage_billing', label: 'Facturación y Presupuestos', icon: Wallet, desc: 'Control financiero.' },
        { key: 'can_access_settings', label: 'Ajustes del Sistema', icon: Settings, desc: 'Configuración crítica.', isCritical: true },
    ];

    return (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">

                {/* Header */}
                <div className="px-6 py-5 border-b border-slate-100 bg-slate-50 flex justify-between items-center shrink-0">
                    <div>
                        <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                            <Shield className="text-blue-600" size={24} />
                            Permisos de Acceso
                        </h2>
                        <p className="text-sm text-slate-500">Editando a: <span className="font-semibold text-slate-700">{admin.full_name}</span></p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full text-slate-400 hover:text-slate-600 transition">
                        <X size={20} />
                    </button>
                </div>

                {/* Body */}
                <div className="p-6 overflow-y-auto space-y-4">

                    {admin.is_super_admin && (
                        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3 items-start">
                            <AlertTriangle className="text-amber-600 shrink-0 mt-0.5" size={20} />
                            <div>
                                <h4 className="font-bold text-amber-800 text-sm">Modo Super Admin</h4>
                                <p className="text-xs text-amber-700 mt-1">Este usuario tiene control total. Los permisos no se pueden restringir individualmente.</p>
                            </div>
                        </div>
                    )}

                    <div className="grid gap-3">
                        {modules.map(mod => {
                            const Icon = mod.icon;
                            let isActive = permissions[mod.key];
                            if (admin.is_super_admin) isActive = true;

                            return (
                                <div key={mod.key} className={`
                                    flex items-center justify-between p-4 rounded-xl border transition-all
                                    ${isActive
                                        ? 'bg-blue-50/50 border-blue-200 shadow-sm'
                                        : 'bg-white border-slate-200 opacity-70'}
                                    ${admin.is_super_admin ? 'opacity-50 pointer-events-none' : ''}
                                `}>
                                    <div className="flex items-center gap-4">
                                        <div className={`p-2.5 rounded-lg ${isActive ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-400'}`}>
                                            <Icon size={20} />
                                        </div>
                                        <div>
                                            <h3 className={`font-bold text-sm ${isActive ? 'text-slate-800' : 'text-slate-500'}`}>{mod.label}</h3>
                                            <p className="text-xs text-slate-400">{mod.desc}</p>
                                        </div>
                                    </div>

                                    <button
                                        onClick={() => onToggle(mod.key)}
                                        className={`text-2xl transition-colors focus:outline-none ${isActive ? 'text-blue-600' : 'text-slate-300 hover:text-slate-400'}`}
                                    >
                                        {isActive ? <ToggleRight size={32} fill="currentColor" className="opacity-100" /> : <ToggleLeft size={32} />}
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Footer */}
                <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-end gap-3 shrink-0">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-slate-600 font-medium hover:bg-white hover:shadow-sm rounded-lg transition border border-transparent hover:border-slate-200"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={onSave}
                        disabled={saving || admin.is_super_admin}
                        className="px-6 py-2 bg-slate-900 text-white font-bold rounded-lg hover:bg-slate-800 shadow-lg hover:shadow-xl transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                        {saving ? 'Guardando...' : 'Guardar Cambios'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default PermissionsModal;
