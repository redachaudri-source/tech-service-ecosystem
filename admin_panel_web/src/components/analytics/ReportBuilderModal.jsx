import React, { useState } from 'react';
import { Download, X } from 'lucide-react';

const ReportBuilderModal = ({ isOpen, onClose, onGenerate, currentRange }) => {
    const [config, setConfig] = useState({
        includeFinancial: true,
        includeMarket: true,
        includeTechs: false,
        includeGeo: false,
        includeApp: false,
        customTitle: 'Informe Ejecutivo',
        overrideDate: false,
        startDate: currentRange.start.split('T')[0],
        endDate: currentRange.end.split('T')[0]
    });

    if (!isOpen) return null;

    const toggle = (key) => setConfig({ ...config, [key]: !config[key] });

    return (
        <div className="fixed inset-0 z-[1000] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-slate-200 overflow-hidden animate-in fade-in zoom-in duration-200">
                <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                    <h3 className="font-bold text-slate-800 flex items-center gap-2">
                        <Download size={18} className="text-blue-600" />
                        Configurar Informe Ejecutivo
                    </h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
                        <X size={20} />
                    </button>
                </div>

                <div className="p-6 space-y-6">
                    {/* Sections */}
                    <div className="space-y-3">
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Secciones a Incluir</p>

                        <label className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg border border-slate-100 hover:border-blue-200 transition cursor-pointer">
                            <input type="checkbox" checked={config.includeFinancial} onChange={() => toggle('includeFinancial')} className="rounded text-blue-600 focus:ring-blue-500" />
                            <span className="text-sm font-medium text-slate-700">Resumen Financiero (KPIs)</span>
                        </label>

                        <label className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg border border-slate-100 hover:border-blue-200 transition cursor-pointer">
                            <input type="checkbox" checked={config.includeMarket} onChange={() => toggle('includeMarket')} className="rounded text-blue-600 focus:ring-blue-500" />
                            <span className="text-sm font-medium text-slate-700">Desglose de Mercado</span>
                        </label>

                        <label className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg border border-slate-100 hover:border-blue-200 transition cursor-pointer">
                            <input type="checkbox" checked={config.includeTechs} onChange={() => toggle('includeTechs')} className="rounded text-blue-600 focus:ring-blue-500" />
                            <span className="text-sm font-medium text-slate-700">Rendimiento Técnico</span>
                        </label>

                        <label className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg border border-slate-100 hover:border-blue-200 transition cursor-pointer">
                            <input type="checkbox" checked={config.includeGeo} onChange={() => toggle('includeGeo')} className="rounded text-blue-600 focus:ring-blue-500" />
                            <span className="text-sm font-medium text-slate-700">Actividad Geográfica</span>
                        </label>

                        <label className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg border border-slate-100 hover:border-blue-200 transition cursor-pointer">
                            <input type="checkbox" checked={config.includeApp} onChange={() => toggle('includeApp')} className="rounded text-blue-600 focus:ring-blue-500" />
                            <span className="text-sm font-medium text-slate-700">Métricas App</span>
                        </label>
                    </div>

                    {/* Date Override */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Periodo del Reporte</p>
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input type="checkbox" checked={config.overrideDate} onChange={() => toggle('overrideDate')} className="rounded text-blue-600" />
                                <span className="text-xs font-bold text-blue-600">Sobrescribir Fechas</span>
                            </label>
                        </div>

                        <div className={`grid grid-cols-2 gap-2 transition-opacity ${config.overrideDate ? 'opacity-100' : 'opacity-50 pointer-events-none'}`}>
                            <input type="date" value={config.startDate} onChange={(e) => setConfig({ ...config, startDate: e.target.value })} className="p-2 border rounded text-xs" />
                            <input type="date" value={config.endDate} onChange={(e) => setConfig({ ...config, endDate: e.target.value })} className="p-2 border rounded text-xs" />
                        </div>
                    </div>
                </div>

                <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
                    <button onClick={onClose} className="px-4 py-2 text-sm font-bold text-slate-500 hover:bg-slate-100 rounded-lg">Cancelar</button>
                    <button onClick={() => onGenerate(config)} className="px-4 py-2 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg flex items-center gap-2 shadow-lg shadow-blue-200">
                        <Download size={16} /> Generar PDF
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ReportBuilderModal;
