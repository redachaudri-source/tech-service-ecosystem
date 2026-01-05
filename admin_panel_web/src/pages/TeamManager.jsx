import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { createClient } from '@supabase/supabase-js'; // For creating users without killing session
import { Plus, User, MapPin, Trash2, Edit2, X, Shield, ShieldAlert, Lock, Unlock, Smartphone, Upload } from 'lucide-react';

import { useAuth } from '../context/AuthContext';

const TeamManager = () => {
    const { user } = useAuth();
    const [activeTab, setActiveTab] = useState('admins'); // 'admins' | 'techs'
    const [members, setMembers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [showEmailOverride, setShowEmailOverride] = useState(false); // Fix: Re-added missing state

    // Company Name for email generation
    const [companyName, setCompanyName] = useState('empresa');

    useEffect(() => {
        supabase.from('company_settings').select('company_name').single()
            .then(({ data }) => {
                if (data?.company_name) setCompanyName(data.company_name);
            });
    }, []);

    // Form State
    const [formData, setFormData] = useState({
        id: null,
        fullName: '',
        email: '',
        password: '',
        phone: '',
        address: '',
        avatarUrl: '',
        role: 'admin' // Default based on tab, but tracked here
    });

    const [creatingUser, setCreatingUser] = useState(false);
    const [uploadingAvatar, setUploadingAvatar] = useState(false);

    const handleAvatarUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setUploadingAvatar(true);
        try {
            const fileExt = file.name.split('.').pop();
            const fileName = `avatar-${Date.now()}.${fileExt}`;
            const filePath = `${fileName}`;

            const { error: uploadError } = await supabase.storage
                .from('avatars')
                .upload(filePath, file);

            if (uploadError) throw uploadError;

            const { data: { publicUrl } } = supabase.storage
                .from('avatars')
                .getPublicUrl(filePath);

            setFormData(prev => ({ ...prev, avatarUrl: publicUrl }));
        } catch (error) {
            alert('Error subiendo avatar: ' + error.message);
        } finally {
            setUploadingAvatar(false);
        }
    };

    // Permissions State
    const [showPermsModal, setShowPermsModal] = useState(false);
    const [targetAdmin, setTargetAdmin] = useState(null);
    const [perms, setPerms] = useState({});

    const handleOpenPermissions = (admin) => {
        setTargetAdmin(admin);
        // Default Permission Set if null
        const defaultPerms = {
            can_manage_team: false,
            can_manage_inventory: false,
            can_view_all_tickets: false,
            can_view_all_clients: false,
            can_delete_tickets: false
        };
        // Merge defaults with existing (ensure no simplified nulls)
        setPerms({ ...defaultPerms, ...(admin.permissions || {}) });
        setShowPermsModal(true);
    };

    const handleTogglePermission = (key) => {
        setPerms(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const handleSavePermissions = async () => {
        setLoading(true);
        const { error } = await supabase
            .from('profiles')
            .update({ permissions: perms })
            .eq('id', targetAdmin.id);

        if (error) alert('Error saving permissions: ' + error.message);
        else {
            setShowPermsModal(false);
            fetchMembers();
        }
        setLoading(false);
    };

    useEffect(() => {
        fetchMembers();
    }, [activeTab]);

    const fetchMembers = async () => {
        setLoading(true);
        const targetRole = activeTab === 'admins' ? 'admin' : 'tech';

        // Select logic differs slightly by role needs? Not really, just filtering.
        const { data, error } = await supabase
            .from('profiles')
            .select(`
                *,
                tickets:tickets!technician_id (status),
                is_super_admin
            `)
            .eq('role', targetRole)
            .is('deleted_at', null) // Only show non-deleted members
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error fetching members:', error);
            alert("DEBUG ERROR: " + error.message); // Visible error for debugging
        } else {
            // Process stats only for techs mainly, but useful for admins too?
            const processed = data.map(m => {
                const tickets = m.tickets || [];
                const stats = {
                    assigned: tickets.filter(t => ['solicitado', 'asignado', 'en_camino'].includes(t.status)).length,
                    in_process: tickets.filter(t => ['en_diagnostico', 'esperando_aprobacion', 'en_reparacion'].includes(t.status)).length,
                    closed: tickets.filter(t => ['finalizado', 'pagado'].includes(t.status)).length
                };
                return { ...m, stats };
            });
            setMembers(processed);
        }
        setLoading(false);
    };

    const handleToggleStatus = async (member) => {
        // Toggle is_active
        const newState = !member.is_active;
        const { error } = await supabase
            .from('profiles')
            .update({ is_active: newState })
            .eq('id', member.id);

        if (error) alert('Error: ' + error.message);
        else fetchMembers();
    };

    const handleOpenModal = (member = null) => {
        if (member) {
            setFormData({
                id: member.id,
                fullName: member.full_name,
                email: member.email || '',
                password: '', // Can't read password
                phone: member.phone || '',
                address: member.address || '',
                avatarUrl: member.avatar_url || '',
                role: member.role
            });
        } else {
            setFormData({
                id: null,
                fullName: '',
                username: '', // New field for simple login
                contactEmail: '', // New optional field for notifications
                password: '',
                phone: '',
                address: '',
                avatarUrl: '',
                role: activeTab === 'admins' ? 'admin' : 'tech',
                dni: ''
            });
            setShowEmailOverride(false);
        }
        setShowModal(true);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setCreatingUser(true);

        try {
            if (!formData.id) {
                // CREATE NEW USER
                // Critical: Use a secondary client to avoid logging out the current admin
                // We read env vars from import.meta.env for Vite
                const tempSupabase = createClient(
                    import.meta.env.VITE_SUPABASE_URL,
                    import.meta.env.VITE_SUPABASE_ANON_KEY,
                    {
                        auth: {
                            persistSession: false,
                            autoRefreshToken: false
                        }
                    }
                );

                // 1. Prepare Login Email (Internal Safe Domain)
                // Use @example.com to bypass strict MX validation while keeping unique usernames
                // If override is present (user manually fixed it), use that.
                let loginEmail = formData.loginEmail;

                if (!loginEmail) {
                    const rawUsername = formData.username || '';
                    const cleanUsername = rawUsername.toLowerCase().trim().replace(/[^a-z0-9._-]/g, '');
                    if (cleanUsername.length < 3) throw new Error("El usuario debe tener al menos 3 caracteres.");
                    // Default safe(r) domain, but if this fails, we let user edit it.
                    // Using 'gmail.com' is risky for verification but often passes syntax checks.
                    // We stick to example.com but handle the failure gracefully.
                    loginEmail = `${cleanUsername}@example.com`;
                }

                // 2. Validate Contact Email (Optional)
                let contactEmail = formData.contactEmail?.trim();

                console.log("Creating user with Login:", loginEmail);

                const { data: authData, error: authError } = await tempSupabase.auth.signUp({
                    email: loginEmail,
                    password: formData.password,
                    options: {
                        data: {
                            full_name: formData.fullName,
                            role: formData.role,
                            dni: formData.dni,
                            username: formData.username,
                            phone: formData.phone,
                            address: formData.address,
                            avatar_url: formData.avatarUrl,
                            contact_email: contactEmail
                        }
                    }
                });

                if (authError) throw authError;

                // 3. Update Profile with Contact Email
                if (authData.user) {
                    await supabase.from('profiles').update({
                        phone: formData.phone,
                        address: formData.address,
                        avatar_url: formData.avatarUrl,
                        email: contactEmail, // Store real contact email in profile 
                        is_active: true
                    }).eq('id', authData.user.id);
                }

                const displayLogin = loginEmail.endsWith('@example.com')
                    ? `USUARIO: ${loginEmail.split('@')[0]}`
                    : `EMAIL: ${loginEmail}`;

                alert(`Usuario creado correctamente.\n\n${displayLogin}`);
            } else {
                // UPDATE EXISTING PROFILE
                const { error } = await supabase.from('profiles').update({
                    full_name: formData.fullName,
                    // email: formData.email, // Email change is complex, skip for now
                    phone: formData.phone,
                    address: formData.address,
                    avatar_url: formData.avatarUrl
                }).eq('id', formData.id);

                if (error) throw error;
            }

            setShowModal(false);
            fetchMembers();

        } catch (err) {
            console.error(err);
            // Self-healing: If email is invalid, reveal the hidden field so user can fix it manually
            if (err.message && (err.message.includes("invalid") || err.message.includes("valid email"))) {
                setShowEmailOverride(true);
                // Pre-fill with what we tried to use so they see it
                if (!formData.loginEmail) {
                    const cleanUsername = formData.username?.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '') || 'usuario';
                    setFormData(prev => ({ ...prev, loginEmail: `${cleanUsername}@example.com` }));
                }
                alert(`⚠️ Error de Validación de Email\n\nEl sistema de seguridad ha rechazado el email automático.\n\nHe activado un campo "Email de Login" abajo. Por favor, introduce ahí un email REAL (ej: tu gmail) y vuelve a guardar.`);
            } else {
                alert('Error: ' + err.message);
            }
        } finally {
            setCreatingUser(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-slate-800">Gestión de Equipo <span className="text-sm text-slate-400 font-normal">(v3.1 Fix)</span></h1>
                    <p className="text-slate-500">Administra accesos y personal técnico</p>
                </div>

                <div className="flex bg-slate-200 p-1 rounded-lg">
                    <button
                        onClick={() => setActiveTab('admins')}
                        className={`px-4 py-2 rounded-md font-medium text-sm transition-all ${activeTab === 'admins'
                            ? 'bg-white text-blue-600 shadow-sm'
                            : 'text-slate-600 hover:text-slate-800'
                            }`}
                    >
                        <div className="flex items-center gap-2">
                            <Shield size={16} />
                            Administradores
                        </div>
                    </button>
                    <button
                        onClick={() => setActiveTab('techs')}
                        className={`px-4 py-2 rounded-md font-medium text-sm transition-all ${activeTab === 'techs'
                            ? 'bg-white text-blue-600 shadow-sm'
                            : 'text-slate-600 hover:text-slate-800'
                            }`}
                    >
                        <div className="flex items-center gap-2">
                            <Smartphone size={16} />
                            Técnicos
                        </div>
                    </button>
                </div>

                {/* Standard New Button v3.0 */}
                {user?.profile?.permissions?.can_manage_team && (
                    <button
                        onClick={() => {
                            // Direct inline logic to ensure no function mapping errors
                            setFormData({
                                id: null,
                                fullName: '',
                                username: '',
                                contactEmail: '',
                                password: '',
                                phone: '',
                                address: '',
                                avatarUrl: '',
                                role: activeTab === 'admins' ? 'admin' : 'tech',
                                dni: ''
                            });
                            // Reset override
                            if (typeof setShowEmailOverride === 'function') setShowEmailOverride(false);
                            setShowModal(true);
                        }}
                        className="flex items-center gap-2 bg-slate-900 text-white px-4 py-2 rounded-lg hover:bg-slate-700 transition shadow-lg hover:shadow-xl"
                    >
                        <Plus size={20} />
                        {activeTab === 'admins' ? 'Nuevo Admin' : 'Nuevo Técnico'}
                    </button>
                )}
            </div>

            {/* List */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {members.map(member => (
                    <div key={member.id} className={`relative bg-white rounded-xl shadow-sm border p-6 flex items-start gap-4 transition-all ${member.is_active ? 'border-slate-200' : 'border-red-200 bg-red-50/30'}`}>
                        {/* Status Indicator */}
                        <div className={`absolute top-4 right-4`}>
                            {/* Protection: Cannot block Super Admin. Only users with permission can block. */}
                            {user?.profile?.permissions?.can_manage_team && !member.is_super_admin && (
                                <button
                                    onClick={() => handleToggleStatus(member)}
                                    title={member.is_active ? "Cuenta Activa (Click para bloquear)" : "Cuenta Bloqueada (Click para activar)"}
                                    className={`p-2 rounded-full ${member.is_active ? 'text-green-600 bg-green-50 hover:bg-green-100' : 'text-red-600 bg-red-50 hover:bg-red-100'}`}
                                >
                                    {member.is_active ? <Unlock size={16} /> : <Lock size={16} />}
                                </button>
                            )}
                            {/* Super Admin Shield Indicator */}
                            {member.is_super_admin && (
                                <div title="Super Admin (Intocable)" className="p-2 text-amber-500 bg-amber-50 rounded-full">
                                    <Shield size={16} fill="currentColor" />
                                </div>
                            )}
                        </div>

                        <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center overflow-hidden shrink-0 border border-slate-100">
                            {member.avatar_url ? (
                                <img src={member.avatar_url} alt={member.full_name} className="w-full h-full object-cover" />
                            ) : (
                                <User className="text-slate-400" size={32} />
                            )}
                        </div>

                        <div className="flex-1 min-w-0 pr-8">
                            <h3 className="text-lg font-bold text-slate-800 truncate">{member.full_name}</h3>
                            <p className="text-sm text-slate-500 mb-1 truncate">{member.email || 'Sin email'}</p>
                            <p className="text-xs font-semibold text-blue-600 bg-blue-50 inline-block px-2 py-0.5 rounded uppercase mb-3">
                                {member.role === 'admin' ? 'Administrador' : 'Técnico'}
                            </p>

                            {/* Stats just for techs usually, but good to see if admins have tickets too? */}
                            {member.role === 'tech' && (
                                <div className="grid grid-cols-3 gap-1 mb-4 text-center">
                                    <div className="bg-slate-50 p-1 rounded">
                                        <div className="text-sm font-bold">{member.stats?.assigned}</div>
                                        <div className="text-[9px] text-slate-400 uppercase">Asig.</div>
                                    </div>
                                    <div className="bg-slate-50 p-1 rounded">
                                        <div className="text-sm font-bold">{member.stats?.in_process}</div>
                                        <div className="text-[9px] text-slate-400 uppercase">Proc.</div>
                                    </div>
                                    <div className="bg-slate-50 p-1 rounded">
                                        <div className="text-sm font-bold">{member.stats?.closed}</div>
                                        <div className="text-[9px] text-slate-400 uppercase">Fin.</div>
                                    </div>
                                </div>
                            )}

                            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                                {/* Actions Area */}
                                {user?.profile?.permissions?.can_manage_team && !member.is_super_admin && (
                                    <div className="flex gap-2 w-full">
                                        <button
                                            onClick={() => handleOpenModal(member)}
                                            className="flex-1 text-sm flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-slate-600 hover:bg-slate-50 hover:text-blue-600 transition"
                                            title="Editar"
                                        >
                                            <Edit2 size={16} /> <span className="font-medium">Editar</span>
                                        </button>

                                        <button
                                            onClick={async () => {
                                                // 1. Check for active tickets
                                                const activeTickets = member.tickets?.filter(t => !['finalizado', 'pagado', 'cancelado'].includes(t.status)) || [];

                                                if (activeTickets.length > 0) {
                                                    alert(`NO SE PUEDE BORRAR.\n\nEste técnico tiene ${activeTickets.length} servicio(s) activos.\nDebe reasignarlos o cerrarlos antes de borrar al técnico.`);
                                                    return;
                                                }

                                                // 2. Confirm Delete
                                                if (!confirm(`¿Estás seguro de que quieres BORRAR a ${member.full_name}?\n\nEsta acción es irreversible (Soft Delete). Desaparecerá de la lista activa, pero se mantendrá el historial.`)) {
                                                    return;
                                                }

                                                // 3. Perform Soft Delete
                                                const { error } = await supabase
                                                    .from('profiles')
                                                    .update({
                                                        deleted_at: new Date().toISOString(),
                                                        is_active: false // Also deactivate login
                                                    })
                                                    .eq('id', member.id);

                                                if (error) {
                                                    alert('Error al borrar: ' + error.message);
                                                } else {
                                                    fetchMembers(); // Refresh list (should disappear due to filter)
                                                }
                                            }}
                                            className="flex-1 text-sm flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-slate-600 hover:bg-red-50 hover:text-red-600 transition"
                                            title="Borrar (Solo si no tiene tickets activos)"
                                        >
                                            <Trash2 size={16} /> <span className="font-medium">Borrar</span>
                                        </button>
                                    </div>
                                )}

                                {member.role === 'admin' && !member.is_super_admin && user?.profile?.permissions?.can_manage_team && (
                                    <button
                                        onClick={() => handleOpenPermissions(member)}
                                        className="text-sm flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-slate-600 hover:bg-purple-50 hover:text-purple-600 transition ml-2 border border-slate-100"
                                        title="Gestionar Permisos"
                                    >
                                        <ShieldAlert size={16} />
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                ))}

                {members.length === 0 && !loading && (
                    <div className="col-span-full py-12 text-center text-slate-400 bg-slate-50 rounded-xl border border-dashed">
                        No hay {activeTab === 'admins' ? 'administradores' : 'técnicos'} encontrados.
                    </div>
                )}
            </div>

            {/* Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[9999] p-4">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden border-4 border-blue-500">
                        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 shrink-0">
                            <h2 className="text-lg font-bold text-slate-800">
                                {formData.id ? 'Editar Miembro' : `Nuevo ${activeTab === 'admins' ? 'Administrador' : 'Técnico'}`}
                            </h2>
                            <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600">
                                <X size={20} />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">DNI / NIE *</label>
                                    <input
                                        required
                                        type="text"
                                        className="w-full p-2 border border-slate-200 rounded-lg uppercase"
                                        value={formData.dni || ''}
                                        onChange={e => setFormData({ ...formData, dni: e.target.value.toUpperCase() })}
                                        onBlur={async (e) => {
                                            const dni = e.target.value;
                                            if (dni.length > 4 && !formData.id) {
                                                const { data: existing } = await supabase
                                                    .from('profiles')
                                                    .select('*')
                                                    .eq('dni', dni)
                                                    .maybeSingle();

                                                if (existing) {
                                                    if (existing.deleted_at) {
                                                        if (confirm(`Ya existe un usuario con este DNI en la PAPELERA (${existing.full_name}).\n\n¿Quieres RESTAURARLO y reactivar su cuenta?`)) {
                                                            await supabase.from('profiles').update({ deleted_at: null, is_active: true }).eq('id', existing.id);
                                                            alert('Usuario restaurado correctamente. Ahora puedes editarlo.');
                                                            handleOpenModal(existing);
                                                        } else {
                                                            setFormData({ ...formData, dni: '' });
                                                        }
                                                    } else {
                                                        alert(`Ya existe un usuario ACTIVO con este DNI: ${existing.full_name}`);
                                                        setFormData({ ...formData, dni: '' });
                                                    }
                                                }
                                            }
                                        }}
                                    />
                                </div>
                                {(activeTab === 'techs' || formData.role === 'tech') && (
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">ID Técnico</label>
                                        <input
                                            type="text"
                                            disabled
                                            className="w-full p-2 bg-slate-100 border border-slate-200 rounded-lg text-slate-500 font-mono"
                                            value={formData.friendly_id ? `#${formData.friendly_id}` : '(Auto)'}
                                        />
                                    </div>
                                )}
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Nombre Completo</label>
                                <input
                                    required
                                    type="text"
                                    className="w-full p-2 border border-slate-200 rounded-lg"
                                    value={formData.fullName}
                                    onChange={e => setFormData({ ...formData, fullName: e.target.value })}
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Usuario de Acceso</label>
                                <input
                                    required={!showEmailOverride} // Not required if using override
                                    type="text"
                                    className="w-full p-2 border border-slate-200 rounded-lg font-mono lowercase"
                                    value={formData.username || ''}
                                    onChange={e => setFormData({ ...formData, username: e.target.value.replace(/[^a-zA-Z0-9._-]/g, '') })}
                                    disabled={!!formData.id || showEmailOverride}
                                    placeholder="ej: nayke"
                                />
                                <p className="text-xs text-slate-400 mt-1">Nombre de usuario único para entrar al panel.</p>
                            </div>

                            {/* Self-Healing Email Override */}
                            {showEmailOverride && (
                                <div className="bg-amber-50 p-3 rounded-lg border border-amber-200 animate-in fade-in slide-in-from-top-2">
                                    <label className="block text-sm font-bold text-amber-800 mb-1 flex items-center gap-2">
                                        <ShieldAlert size={14} />
                                        Corrección Manual de Email
                                    </label>
                                    <p className="text-xs text-amber-700 mb-2">
                                        Supabase ha rechazado el email automático. Por favor, introduce un email real válido.
                                    </p>
                                    <input
                                        required
                                        type="email"
                                        className="w-full p-2 border border-amber-300 rounded-lg bg-white"
                                        value={formData.loginEmail || ''}
                                        onChange={e => setFormData({ ...formData, loginEmail: e.target.value })}
                                        placeholder="tucorreo@gmail.com"
                                    />
                                </div>
                            )}

                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Email de Contacto (Opcional)</label>
                                <input
                                    type="email"
                                    className="w-full p-2 border border-slate-200 rounded-lg"
                                    value={formData.contactEmail || ''}
                                    onChange={e => setFormData({ ...formData, contactEmail: e.target.value })}
                                    placeholder="ejemplo@gmail.com"
                                />
                                <p className="text-xs text-slate-400 mt-1">Para notificaciones y recuperar acceso.</p>
                            </div>

                            {!formData.id && (
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Contraseña Inicial</label>
                                    <input
                                        required
                                        type="password"
                                        className="w-full p-2 border border-slate-200 rounded-lg"
                                        value={formData.password}
                                        onChange={e => setFormData({ ...formData, password: e.target.value })}
                                        placeholder="******"
                                        minLength={6}
                                    />
                                    <p className="text-xs text-slate-500 mt-1">Mínimo 6 caracteres.</p>
                                </div>
                            )}

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Teléfono</label>
                                    <input
                                        type="text"
                                        className="w-full p-2 border border-slate-200 rounded-lg"
                                        value={formData.phone}
                                        onChange={e => setFormData({ ...formData, phone: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Rol</label>
                                    <input
                                        type="text"
                                        disabled
                                        className="w-full p-2 border border-slate-200 rounded-lg bg-slate-100 text-slate-500 capitalize"
                                        value={activeTab === 'admins' ? 'Administrador' : 'Técnico'}
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Dirección / Base</label>
                                <input
                                    type="text"
                                    className="w-full p-2 border border-slate-200 rounded-lg"
                                    value={formData.address}
                                    onChange={e => setFormData({ ...formData, address: e.target.value })}
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-2">Avatar / Foto de Perfil</label>
                                <div className="flex items-center gap-4">
                                    <div className="w-16 h-16 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center overflow-hidden relative group">
                                        {formData.avatarUrl ? (
                                            <img src={formData.avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                                        ) : (
                                            <User className="text-slate-400" />
                                        )}
                                        {uploadingAvatar && (
                                            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                                                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                            </div>
                                        )}
                                    </div>
                                    <label className="cursor-pointer bg-white border border-slate-200 px-3 py-2 rounded-lg hover:bg-slate-50 transition text-sm flex items-center gap-2 text-slate-600">
                                        <Upload size={16} />
                                        <span>Subir Imagen</span>
                                        <input type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} disabled={uploadingAvatar} />
                                    </label>
                                </div>
                            </div>

                            <button
                                type="submit"
                                disabled={creatingUser}
                                className="w-full py-3 bg-slate-900 text-white rounded-lg font-bold hover:bg-slate-800 transition disabled:opacity-50"
                            >
                                {creatingUser ? 'Procesando...' : 'Guardar Miembro'}
                            </button>
                        </form>
                    </div>
                </div >
            )}
            {/* PERMISSIONS MATRIX MODAL */}
            {
                showPermsModal && targetAdmin && (
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4 backdrop-blur-sm">
                        <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in duration-200">
                            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                                <div>
                                    <h2 className="text-lg font-bold text-slate-800">Matrix de Permisos</h2>
                                    <p className="text-xs text-slate-500">Configurando a: {targetAdmin.full_name}</p>
                                </div>
                                <button onClick={() => setShowPermsModal(false)} className="text-slate-400 hover:text-slate-600">
                                    <X size={20} />
                                </button>
                            </div>

                            <div className="p-6">
                                <div className="bg-yellow-50 text-yellow-800 p-3 rounded-lg text-xs mb-4 flex gap-2">
                                    <ShieldAlert size={16} className="shrink-0" />
                                    Estos permisos afectan lo que este administrador puede ver y borrar.
                                </div>

                                <div className="grid grid-cols-1 gap-2">
                                    {[
                                        { key: 'can_manage_team', label: 'Gestionar Equipo (Crear/Bloquear Usuarios)' },
                                        { key: 'can_manage_inventory', label: 'Gestión Total de Inventario' },
                                        { key: 'can_view_all_tickets', label: 'Ver TODOS los Tickets (No solo los asignados)' },
                                        { key: 'can_view_all_clients', label: 'Ver TODA la Cartera de Clientes' },
                                        { key: 'can_delete_tickets', label: 'Eliminar Tickets y Registros' },
                                    ].map(p => (
                                        <div key={p.key} className="flex items-center justify-between p-3 border border-slate-100 rounded-lg hover:bg-slate-50 transition">
                                            <span className="font-medium text-slate-700 text-sm">{p.label}</span>
                                            <button
                                                onClick={() => handleTogglePermission(p.key)}
                                                className={`w-12 h-6 flex items-center rounded-full px-1 transition-colors ${perms[p.key] ? 'bg-green-500 justify-end' : 'bg-slate-200 justify-start'}`}
                                            >
                                                <div className="w-4 h-4 bg-white rounded-full shadow-sm"></div>
                                            </button>
                                        </div>
                                    ))}
                                </div>

                                <div className="mt-6 flex justify-end gap-3">
                                    <button
                                        onClick={() => setShowPermsModal(false)}
                                        className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg"
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        onClick={handleSavePermissions}
                                        className="px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 font-medium"
                                    >
                                        Guardar Permisos
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )
            }
        </div >
    );
};

export default TeamManager;
