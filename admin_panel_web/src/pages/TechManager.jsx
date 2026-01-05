import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Plus, User, MapPin, Trash2, Edit2, X } from 'lucide-react';

const TechManager = () => {
    const [techs, setTechs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);

    // Form State
    const [id, setId] = useState(null); // For edit
    const [fullName, setFullName] = useState('');
    const [email, setEmail] = useState('');
    const [phone, setPhone] = useState('');
    const [address, setAddress] = useState('');
    const [avatarUrl, setAvatarUrl] = useState('');
    const [password, setPassword] = useState('');

    // Delete Confirmation State
    const [deleteId, setDeleteId] = useState(null);
    const [showDeleteModal, setShowDeleteModal] = useState(false);

    useEffect(() => {
        fetchTechs();
    }, []);

    const fetchTechs = async () => {
        // Fetch Techs with their Tickets (explicit FK to avoid ambiguity)
        const { data, error } = await supabase
            .from('profiles')
            .select(`
                *,
                tickets:tickets!technician_id (
                    status
                )
            `)
            .eq('role', 'tech')
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error fetching techs:', error);
            // alert('Error cargando técnicos: ' + error.message);
        }


        if (data) {
            // Process stats
            const techsWithStats = data.map(tech => {
                const tickets = tech.tickets || [];
                const stats = {
                    assigned: tickets.filter(t => ['solicitado', 'asignado', 'en_camino'].includes(t.status)).length,
                    in_process: tickets.filter(t => ['en_diagnostico', 'esperando_aprobacion', 'en_reparacion'].includes(t.status)).length,
                    closed: tickets.filter(t => ['finalizado', 'pagado'].includes(t.status)).length
                };
                return { ...tech, stats };
            });
            setTechs(techsWithStats);
        }
        setLoading(false);
    };

    const toggleActive = async (tech) => {
        const newState = !tech.is_active;
        const { error } = await supabase
            .from('profiles')
            .update({ is_active: newState })
            .eq('id', tech.id);

        if (error) alert('Error: ' + error.message);
        else fetchTechs();
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);

        const payload = {
            full_name: fullName,
            email: email,
            phone: phone,
            address: address,
            avatar_url: avatarUrl,
            role: 'tech',
            is_active: true
        };

        // NOTE: Real auth user creation requires Admin API.
        // For this demo, we just store profile. 
        // In production, we'd call an Edge Function to create auth.users entry.

        let result;
        if (id) {
            delete payload.email; // Don't update email blindly
            delete payload.is_active;
            result = await supabase.from('profiles').update(payload).eq('id', id);
        } else {
            result = await supabase.from('profiles').insert(payload);
        }

        if (result.error) {
            alert('Error: ' + result.error.message);
        } else {
            fetchTechs();
            handleClose();
        }
        setLoading(false);
    };

    const confirmDelete = (techId) => {
        setDeleteId(techId);
        setShowDeleteModal(true);
    };

    const handleDeletePayload = async () => {
        if (!deleteId) return;

        const { error } = await supabase.from('profiles').delete().eq('id', deleteId);

        if (error) {
            if (error.code === '23503') { // Foreign Key Violation
                alert('No se puede eliminar este técnico porque tiene tickets asignados. Primero reasigna o elimina sus tickets, o desactiva su cuenta.');
            } else {
                alert('Error al eliminar: ' + error.message);
            }
        } else {
            fetchTechs();
            setShowDeleteModal(false);
            setDeleteId(null);
        }
    };

    // UI Helpers remain...

    const handleEdit = (tech) => {
        setId(tech.id);
        setFullName(tech.full_name);
        setEmail(tech.email);
        setPhone(tech.phone);
        setAddress(tech.address || '');
        setAvatarUrl(tech.avatar_url || '');
        // Password logic is not for edit
        setShowModal(true);
    };

    const handleClose = () => {
        setShowModal(false);
        setId(null);
        setFullName('');
        setEmail('');
        setPhone('');
        setAddress('');
        setAvatarUrl('');
        setPassword('');
    };


    if (loading && !techs.length) return <div className="p-10 text-center">Cargando técnicos...</div>;

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold text-slate-800">Técnicos de Campo</h1>
                <button
                    onClick={() => setShowModal(true)}
                    className="flex items-center gap-2 bg-slate-900 text-white px-4 py-2 rounded-lg hover:bg-slate-700 transition"
                >
                    <Plus size={20} />
                    Alta Técnico
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {techs.map(tech => (
                    <div key={tech.id} className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex items-start gap-4">
                        <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center overflow-hidden shrink-0">
                            {tech.avatar_url ? (
                                <img src={tech.avatar_url} alt={tech.full_name} className="w-full h-full object-cover" />
                            ) : (
                                <User className="text-slate-400" size={32} />
                            )}
                        </div>
                        <div className="flex-1 min-w-0">
                            <h3 className="text-lg font-bold text-slate-800 truncate">{tech.full_name}</h3>
                            <p className="text-sm text-slate-500 mb-2 truncate">{tech.email || 'Sin email'}</p>

                            <div className="flex items-center gap-2 text-sm text-slate-600 mb-3">
                                <span className={`w-2 h-2 rounded-full ${tech.is_available ? 'bg-green-500' : 'bg-gray-300'}`}></span>
                                {tech.is_available ? 'En Turno' : 'Fuera de Turno'}
                            </div>

                            {/* Stats Grid */}
                            <div className="grid grid-cols-3 gap-2 mb-4 text-center">
                                <div className="bg-blue-50 p-2 rounded-lg">
                                    <div className="text-lg font-bold text-blue-700">{tech.stats?.assigned || 0}</div>
                                    <div className="text-[10px] text-blue-600 uppercase font-semibold">Asignados</div>
                                </div>
                                <div className="bg-orange-50 p-2 rounded-lg">
                                    <div className="text-lg font-bold text-orange-700">{tech.stats?.in_process || 0}</div>
                                    <div className="text-[10px] text-orange-600 uppercase font-semibold">En Proceso</div>
                                </div>
                                <div className="bg-green-50 p-2 rounded-lg">
                                    <div className="text-lg font-bold text-green-700">{tech.stats?.closed || 0}</div>
                                    <div className="text-[10px] text-green-600 uppercase font-semibold">Cerrados</div>
                                </div>
                            </div>

                            {/* Active Toggle */}
                            <div className="flex items-center justify-between border-t border-slate-100 pt-3 mt-2">
                                <span className="text-sm font-medium text-slate-600">Estado de Cuenta</span>
                                <button
                                    onClick={() => toggleActive(tech)}
                                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${tech.is_active !== false ? 'bg-slate-900' : 'bg-slate-300'}`}
                                >
                                    <span className={`${tech.is_active !== false ? 'translate-x-6' : 'translate-x-1'} inline-block h-4 w-4 transform rounded-full bg-white transition`} />
                                </button>
                            </div>

                            <div className="flex gap-2 mt-4">
                                <button onClick={() => handleEdit(tech)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded">
                                    <Edit2 size={16} />
                                </button>
                                <button onClick={() => confirmDelete(tech.id)} className="p-1.5 text-red-600 hover:bg-red-50 rounded">
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        </div>
                    </div>
                ))}

                {techs.length === 0 && (
                    <div className="col-span-full text-center py-10 text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-300">
                        No hay técnicos registrados.
                    </div>
                )}
            </div>

            {/* Modal Edit/Create */}
            {showModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
                        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                            <h2 className="text-lg font-bold text-slate-800">
                                {id ? 'Editar Técnico' : 'Nuevo Técnico'}
                            </h2>
                            <button onClick={handleClose} className="text-slate-400 hover:text-slate-600">
                                <X size={20} />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Nombre Completo</label>
                                <input
                                    required
                                    type="text"
                                    className="w-full p-2 border border-slate-200 rounded-lg"
                                    value={fullName}
                                    onChange={e => setFullName(e.target.value)}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Email <span className="text-red-500">*</span></label>
                                <input
                                    required
                                    type="email"
                                    placeholder="tecnico@empresa.com"
                                    className="w-full p-2 border border-slate-200 rounded-lg"
                                    value={email}
                                    onChange={e => setEmail(e.target.value)}
                                    disabled={!!id} // Cannot change email easily without auth migration
                                />
                            </div>
                            {!id && (
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Contraseña <span className="text-red-500">*</span></label>
                                    <input
                                        required
                                        type="password"
                                        placeholder="******"
                                        className="w-full p-2 border border-slate-200 rounded-lg"
                                        value={password}
                                        onChange={e => setPassword(e.target.value)}
                                    />
                                    <p className="text-xs text-orange-500 mt-1">
                                        * Se usará para el login en la App.
                                    </p>
                                </div>
                            )}
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Teléfono</label>
                                <input
                                    type="text"
                                    className="w-full p-2 border border-slate-200 rounded-lg"
                                    value={phone}
                                    onChange={e => setPhone(e.target.value)}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Foto URL</label>
                                <input
                                    type="text"
                                    placeholder="https://..."
                                    className="w-full p-2 border border-slate-200 rounded-lg"
                                    value={avatarUrl}
                                    onChange={e => setAvatarUrl(e.target.value)}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Dirección Base</label>
                                <input
                                    type="text"
                                    className="w-full p-2 border border-slate-200 rounded-lg"
                                    value={address}
                                    onChange={e => setAddress(e.target.value)}
                                />
                            </div>

                            <button
                                type="submit"
                                className="w-full py-2 bg-slate-900 text-white rounded-lg font-medium hover:bg-slate-800"
                            >
                                Guardar
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal Confirm Delete */}
            {showDeleteModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden p-6 text-center animate-in fade-in zoom-in duration-200">
                        <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
                            <Trash2 size={24} />
                        </div>
                        <h3 className="text-lg font-bold text-slate-800 mb-2">¿Eliminar Técnico?</h3>
                        <p className="text-slate-500 text-sm mb-6">
                            Esta acción no se puede deshacer. Si el técnico tiene tickets asignados, la operación fallará por seguridad.
                        </p>
                        <div className="flex gap-3 justify-center">
                            <button
                                onClick={() => setShowDeleteModal(false)}
                                className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleDeletePayload}
                                className="px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700"
                            >
                                Sí, Eliminar
                            </button>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
};

export default TechManager;
