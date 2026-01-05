import { X, Phone, MapPin, User, FileText, Calendar, Clock, Image as ImageIcon } from 'lucide-react';

const ServiceDetailsModal = ({ ticket, onClose }) => {
    if (!ticket) return null;

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-in fade-in">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">

                {/* Header */}
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50 shrink-0">
                    <div>
                        <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                            Ticket #{ticket.ticket_number}
                            <span className={`text-xs px-2 py-1 rounded-full border ${ticket.status === 'solicitado' ? 'bg-yellow-100 text-yellow-800 border-yellow-200' :
                                ticket.status === 'asignado' ? 'bg-blue-100 text-blue-800 border-blue-200' :
                                    ticket.status === 'presupuesto_pendiente' ? 'bg-amber-100 text-amber-800 border-amber-200' :
                                        ticket.status === 'presupuesto_aceptado' ? 'bg-green-100 text-green-800 border-green-200' :
                                            ticket.status === 'en_diagnostico' ? 'bg-purple-100 text-purple-800 border-purple-200' :
                                                ticket.status === 'en_reparacion' ? 'bg-pink-100 text-pink-800 border-pink-200' :
                                                    ticket.status === 'finalizado' ? 'bg-green-100 text-green-800 border-green-200' :
                                                        'bg-gray-100 text-gray-800 border-gray-200'
                                }`}>
                                {ticket.status.toUpperCase().replace('_', ' ')}
                            </span>
                        </h2>
                        <p className="text-sm text-slate-500 mt-1">Detalles completos del servicio</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white rounded-full transition shadow-sm border border-transparent hover:border-slate-200">
                        <X size={20} className="text-slate-500" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">

                    {/* Client Info Card */}
                    <div className="bg-blue-50/50 rounded-xl p-5 border border-blue-100">
                        <h3 className="font-bold text-blue-900 mb-3 flex items-center gap-2">
                            <User size={18} /> Información del Cliente
                        </h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <span className="text-xs text-blue-600 font-bold uppercase tracking-wider">Nombre</span>
                                <p className="font-medium text-slate-800">{ticket.profiles?.full_name || 'Sin nombre'}</p>
                            </div>
                            <div>
                                <span className="text-xs text-blue-600 font-bold uppercase tracking-wider">Dirección</span>
                                <div className="flex items-start gap-1">
                                    <MapPin size={14} className="mt-0.5 text-blue-400 shrink-0" />
                                    <p className="font-medium text-slate-800 text-sm">{ticket.profiles?.address || 'Sin dirección'}</p>
                                </div>
                            </div>
                            <div className="sm:col-span-2">
                                <span className="text-xs text-blue-600 font-bold uppercase tracking-wider">Contacto</span>
                                <div className="flex items-center gap-3 mt-1">
                                    <p className="font-medium text-slate-800">{ticket.profiles?.phone || 'Sin teléfono'}</p>
                                    {ticket.profiles?.phone && (
                                        <a
                                            href={`tel:${ticket.profiles.phone}`}
                                            className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-blue-700 transition flex items-center gap-1 shadow-sm"
                                        >
                                            <Phone size={12} /> LLAMAR
                                        </a>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Appliance & Failure */}
                    <div className="space-y-4">
                        <h3 className="font-bold text-slate-800 flex items-center gap-2 text-lg border-b pb-2">
                            <FileText size={20} className="text-slate-400" />
                            Detalles de la Avería
                        </h3>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                                <span className="text-xs text-slate-400 uppercase font-bold">Aparato</span>
                                <p className="font-semibold text-slate-700">{ticket.appliance_info?.type || '-'}</p>
                            </div>
                            <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                                <span className="text-xs text-slate-400 uppercase font-bold">Marca</span>
                                <p className="font-semibold text-slate-700">{ticket.appliance_info?.brand || '-'}</p>
                            </div>
                            <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 col-span-2">
                                <span className="text-xs text-slate-400 uppercase font-bold">Modelo</span>
                                <p className="font-semibold text-slate-700">{ticket.appliance_info?.model || 'No especificado'}</p>
                            </div>
                        </div>

                        <div className="bg-yellow-50 p-4 rounded-xl border border-yellow-100">
                            <span className="text-xs text-yellow-700 uppercase font-bold mb-1 block">Descripción del Problema</span>
                            <p className="text-slate-800 text-sm leading-relaxed whitespace-pre-wrap">
                                {ticket.description_failure || "Sin descripción proporcionada."}
                            </p>
                        </div>
                    </div>

                    {/* Label/Photo */}
                    {ticket.appliance_info?.label_image_url && (
                        <div>
                            <h3 className="font-bold text-slate-800 flex items-center gap-2 mb-3">
                                <ImageIcon size={20} className="text-slate-400" />
                                Foto de la Etiqueta/Avería
                            </h3>
                            <div className="rounded-xl overflow-hidden border border-slate-200 bg-slate-50 p-2">
                                <a
                                    href={ticket.appliance_info.label_image_url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="block group relative"
                                >
                                    <img
                                        src={ticket.appliance_info.label_image_url}
                                        alt="Foto etiqueta"
                                        className="w-full h-auto max-h-[300px] object-contain rounded-lg"
                                    />
                                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition flex items-center justify-center">
                                        <span className="opacity-0 group-hover:opacity-100 bg-black/75 text-white text-xs px-3 py-1.5 rounded-full font-bold transition transform translate-y-2 group-hover:translate-y-0">
                                            Abrir Imagen Original
                                        </span>
                                    </div>
                                </a>
                            </div>
                        </div>
                    )}

                    {/* HISTORY TIMELINE */}
                    {ticket.status_history && ticket.status_history.length > 0 && (
                        <div className="pt-6 border-t border-slate-200">
                            <h3 className="font-bold text-slate-800 flex items-center gap-2 mb-4">
                                <Clock size={20} className="text-slate-400" />
                                Historial de Eventos
                            </h3>
                            <div className="relative pl-6 space-y-6 before:absolute before:left-[9px] before:top-2 before:bottom-2 before:w-[2px] before:bg-slate-200 before:content-['']">
                                {ticket.status_history.map((entry, idx) => (
                                    <div key={idx} className="relative">
                                        <div className="absolute -left-[1.35rem] top-1.5 w-3.5 h-3.5 rounded-full bg-white border-2 border-blue-500 z-10"></div>
                                        <div>
                                            <p className="font-bold text-sm text-slate-800">{entry.label}</p>
                                            <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                                                <Calendar size={12} />
                                                {new Date(entry.timestamp).toLocaleDateString()}
                                                <span className="mx-1">•</span>
                                                <Clock size={12} />
                                                {new Date(entry.timestamp).toLocaleTimeString()}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer Actions */}
                <div className="p-4 border-t bg-slate-50 shrink-0 flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="px-5 py-2.5 bg-white border border-slate-300 text-slate-700 font-bold rounded-xl hover:bg-slate-50 transition"
                    >
                        Cerrar
                    </button>
                    {/* Could add specific actions like 'Edit' or 'Assign' here too if needed, but keeping it as View Details for now */}
                </div>
            </div>
        </div >
    );
};

export default ServiceDetailsModal;
