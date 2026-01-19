// Fixed imports
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { createClient } from '@supabase/supabase-js'; // For creating users without killing session
import { Plus, User, MapPin, Trash2, Edit2, X, Shield, ShieldAlert, Lock, Unlock, Smartphone, Upload, RotateCcw, Star, MessageSquare, ChevronDown } from 'lucide-react';
import AdminReviewModal from '../components/AdminReviewModal';
import PermissionsModal from '../components/PermissionsModal';

import { useToast } from '../components/ToastProvider';
import { useAuth } from '../context/AuthContext';

const TeamManager = () => {
    const { user } = useAuth();
    const { addToast } = useToast();
    const [activeTab, setActiveTab] = useState('techs'); // 'admins' | 'techs'
    const [members, setMembers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [showEmailOverride, setShowEmailOverride] = useState(false); // Fix: Re-added missing state
    const [showDeleted, setShowDeleted] = useState(false); // New Recycle Bin Toggle

    // Company Name for email generation
    const [companyName, setCompanyName] = useState('empresa');

    const [showReasonModal, setShowReasonModal] = useState(false);
    const [pendingStatusChange, setPendingStatusChange] = useState(null); // { member, status }
    const [statusReason, setStatusReason] = useState('');

    useEffect(() => {
        supabase.from('company_settings').select('company_name').single()
            .then(({ data }) => {
                if (data?.company_name) setCompanyName(data.company_name);
            });

        // Realtime for Profiles (Status Changes)
        const channel = supabase.channel('team_manager_profiles')
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles' }, (payload) => {
                fetchMembers();
                if (payload.new.is_active !== payload.old.is_active) {
                    addToast(`Estado de técnico actualizado: ${payload.new.full_name}`, 'info', false);
                }
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
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
        role: 'admin',
        // Geo-Ready Fields
        streetType: 'Calle',
        streetName: '',
        streetNumber: '',
        postalCode: '',
        city: '',
        province: '',
        // Bypass
        bypassTimeRestrictions: false
    });

    const [creatingUser, setCreatingUser] = useState(false);
    const [uploadingAvatar, setUploadingAvatar] = useState(false);

    const handleAvatarUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setUploadingAvatar(true);
        try {
            const fileExt = file.name.split('.').pop();
            // CLEAN SYNTAX: No spaces inside template literal
            const fileName = `avatar-${Date.now()}.${fileExt}`;
            const filePath = fileName;

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
    const [viewingReviews, setViewingReviews] = useState(null); // For Review Modal
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
        setMembers([]); // Clear list to prevent stale render during switch
        fetchMembers();
    }, [activeTab, showDeleted]);

    const fetchMembers = async () => {
        setLoading(true);
        try {
            const targetRole = activeTab === 'admins' ? 'admin' : 'tech';
            let query = supabase
                .from('profiles')
                .select(`
                    *,
                    tickets:tickets!technician_id(status),
                    is_super_admin
                `)
                .eq('role', targetRole)
                .order('created_at', { ascending: false });

            if (showDeleted) {
                query = query.not('deleted_at', 'is', null);
            } else {
                query = query.is('deleted_at', null);
            }

            const { data, error } = await query;

            if (error) {
                console.error('Error fetching members:', error);
                // Don't alert detailed error to user, just log it
            } else {
                const processed = (data || []).map(m => {
                    // SAFEGUARD: Ensure tickets is an array
                    const tickets = Array.isArray(m.tickets) ? m.tickets : [];
                    const stats = {
                        assigned: tickets.filter(t => t && ['solicitado', 'asignado', 'en_camino'].includes(t.status)).length,
                        in_process: tickets.filter(t => t && ['en_diagnostico', 'esperando_aprobacion', 'en_reparacion'].includes(t.status)).length,
                        closed: tickets.filter(t => t && ['finalizado', 'pagado'].includes(t.status)).length
                    };
                    return { ...m, tickets, stats };
                });
                setMembers(processed);
            }
        } catch (e) {
            console.error("CRITICAL: Error processing members:", e);
        } finally {
            setLoading(false);
        }
    };

    const handleRestoreMember = async (member) => {
        if (!confirm(`¿Restaurar a ${member.full_name}?\nVolverá a estar visible y activo.`)) return;

        const { error } = await supabase
            .from('profiles')
            .update({ deleted_at: null, is_active: true })
            .eq('id', member.id);

        if (error) alert('Error: ' + error.message);
        else fetchMembers();
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

    const initiateStatusChange = (member, newStatus) => {
        if (newStatus === 'active') {
            updateStatus(member, newStatus, null);
        } else {
            setPendingStatusChange({ member, status: newStatus });
            setStatusReason('');
            setShowReasonModal(true);
        }
    };

    const confirmStatusChange = () => {
        if (!pendingStatusChange) return;
        if (!statusReason.trim()) {
            alert("Por favor, escribe una causa/razón para este cambio de estado.");
            return;
        }
        updateStatus(pendingStatusChange.member, pendingStatusChange.status, statusReason);
        setShowReasonModal(false);
        setPendingStatusChange(null);
    };

    const updateStatus = async (member, newStatus, reason) => {
        let updatePayload = { status: newStatus, status_reason: reason };
        if (newStatus === 'suspended') {
            updatePayload.is_active = false; // Legacy lock
        } else {
            updatePayload.is_active = true;
        }

        const { error } = await supabase
            .from('profiles')
            .update(updatePayload)
            .eq('id', member.id);

        if (error) alert('Error: ' + error.message);
        else {
            addToast(`Estado actualizado a: ${newStatus.toUpperCase()}`, 'success');
            fetchMembers();
        }
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
                role: member.role,
                dni: member.dni || '',
                username: member.username || '',
                contactEmail: member.contact_email || '',
                loginEmail: member.email || '',
                // Geo-Ready
                streetType: member.street_type || 'Calle',
                streetName: member.street_name || '',
                streetNumber: member.street_number || '',
                postalCode: member.postal_code || '',
                city: member.city || '',
                province: member.province || '',
                bypassTimeRestrictions: member.bypass_time_restrictions || false
            });
        } else {
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
                dni: '',
                loginEmail: '',
                // Geo-Ready
                streetType: 'Calle',
                streetName: '',
                streetNumber: '',
                postalCode: '',
                city: '',
                province: '',
                bypassTimeRestrictions: false
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
                let loginEmail = formData.loginEmail;

                if (!loginEmail) {
                    const rawUsername = formData.username || '';
                    const cleanUsername = rawUsername.toLowerCase().trim().replace(/[^a-z0-9._-]/g, '');
                    if (cleanUsername.length < 3) throw new Error("El usuario debe tener al menos 3 caracteres.");
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
                            contact_email: contactEmail,
                            bypass_time_restrictions: formData.bypassTimeRestrictions
                        }
                    }
                });

                if (authError) throw authError;

                // 3. Update Profile with Contact Email & Geo Data
                if (authData.user) {
                    const fullAddress = `${formData.streetType} ${formData.streetName}, ${formData.streetNumber}, ${formData.postalCode} ${formData.city}`;
                    await supabase.from('profiles').update({
                        phone: formData.phone,
                        address: fullAddress,
                        avatar_url: formData.avatarUrl,
                        email: contactEmail,
                        is_active: true,
                        status: 'active', // Default status
                        // Geo-Ready
                        street_type: formData.streetType,
                        street_name: formData.streetName,
                        street_number: formData.streetNumber,
                        postal_code: formData.postalCode,
                        city: formData.city,
                        province: formData.province,
                        bypass_time_restrictions: formData.bypassTimeRestrictions
                    }).eq('id', authData.user.id);
                }

                const displayLogin = loginEmail.endsWith('@example.com')
                    ? `USUARIO: ${loginEmail.split('@')[0]}`
                    : `EMAIL: ${loginEmail}`;

                alert(`Usuario creado correctamente.\n\n${displayLogin}`);
            } else {
                // UPDATE EXISTING PROFILE
                const fullAddress = `${formData.streetType} ${formData.streetName}, ${formData.streetNumber}, ${formData.postalCode} ${formData.city}`;
                const { error } = await supabase.from('profiles').update({
                    full_name: formData.fullName,
                    phone: formData.phone,
                    address: fullAddress,
                    avatar_url: formData.avatarUrl,
                    dni: formData.dni,
                    username: formData.username,
                    contact_email: formData.contactEmail,
                    // Geo-Ready
                    street_type: formData.streetType,
                    street_name: formData.streetName,
                    street_number: formData.streetNumber,
                    postal_code: formData.postalCode,
                    city: formData.city,
                    province: formData.province,
                    bypass_time_restrictions: formData.bypassTimeRestrictions
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
                alert(`⚠️ Error de Validación de Email\n\nEl sistema de seguridad ha rechazado el email automático.\n\nHe activado un campo "Email de Login" abajo.Por favor, introduce ahí un email REAL(ej: tu gmail) y vuelve a guardar.`);
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
                    <h1 className="text-3xl font-bold text-slate-800">Gestión de Equipo <span className="text-sm text-green-600 font-bold bg-green-100 px-2 rounded ml-2">v4.7 FIXED</span></h1>
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
                {(user?.profile?.permissions?.can_manage_team || user?.profile?.is_super_admin) && (
                    <button
                        onClick={() => {
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
                                dni: '',
                                loginEmail: '',
                                streetType: 'Calle',
                                streetName: '',
                                streetNumber: '',
                                postalCode: '',
                                city: '',
                                province: ''
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

            {/* RECYCLE BIN TOGGLE */}
            <div className="flex justify-end mb-2">
                <button
                    onClick={() => setShowDeleted(!showDeleted)}
                    className={`text-xs font-bold flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all ${showDeleted ? 'bg-amber-100 text-amber-700' : 'text-slate-400 hover:text-slate-600'}`}
                >
                    <RotateCcw size={14} />
                    {showDeleted ? 'Viendo Papelera (Click para salir)' : 'Ver Eliminados / Papelera'}
                </button>
            </div>

            {/* List */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {loading ? (
                    <div className="col-span-full py-12 text-center text-slate-400 bg-slate-50 rounded-xl border border-dashed">
                        Cargando miembros...
                    </div>
                ) : members.length === 0 ? (
                    <div className="col-span-full py-12 text-center text-slate-400 bg-slate-50 rounded-xl border border-dashed">
                        {showDeleted ? 'La papelera está vacía.' : `No hay ${activeTab === 'admins' ? 'administradores' : 'técnicos'} encontrados.`}
                    </div>
                ) : (
                    members.map(member => (
                        <div key={member.id} className={`group relative bg-white rounded-2xl shadow-sm hover:shadow-xl transition-all duration-300 border overflow-hidden flex flex-col ${member.is_active ? 'border-slate-100' : 'border-red-200 bg-red-50/10'}`}>

                            {/* TOP STATUS BAR */}
                            <div className={`h-1.5 w-full ${member.is_super_admin ? 'bg-gradient-to-r from-amber-400 to-orange-500' : member.role === 'tech' ? 'bg-gradient-to-r from-blue-500 to-indigo-600' : 'bg-slate-800'}`}></div>

                            <div className="p-5 flex-1 flex flex-col">
                                <div className="flex items-start justify-between mb-4">
                                    {/* INFO + AVATAR */}
                                    <div className="flex items-center gap-4">
                                        <div className="relative shrink-0">
                                            <div className="w-14 h-14 rounded-2xl bg-slate-50 flex items-center justify-center overflow-hidden border-2 border-white shadow-md">
                                                {member.avatar_url ? (
                                                    <img src={member.avatar_url} alt={member.full_name} className="w-full h-full object-cover" />
                                                ) : (
                                                    <User size={24} className="text-slate-300" />
                                                )}
                                            </div>
                                            {/* ONLINE/OFFLINE DOT */}
                                            <div className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-white shadow-sm flex items-center justify-center ${member.is_active ? 'bg-emerald-500' : 'bg-red-500'}`}>
                                                {member.is_super_admin && <Star size={8} className="text-white" fill="currentColor" />}
                                            </div>
                                        </div>

                                        <div className="min-w-0">
                                            <h3 className="font-bold text-lg text-slate-800 leading-tight truncate pr-2">{member.full_name}</h3>
                                            <p className="text-xs text-slate-500 font-mono truncate opacity-80">{member.email?.endsWith('@example.com') ? member.username : member.email}</p>

                                            {/* ROLE BADGE */}
                                            <div className="flex items-center gap-2 mt-1">
                                                <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${member.role === 'tech' ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-700'}`}>
                                                    {member.role === 'tech' ? 'Técnico' : 'Admin'}
                                                </span>
                                                {member.is_super_admin && <span className="text-[10px] font-bold text-amber-500 flex items-center gap-1"><Shield size={10} fill="currentColor" /> SUPER</span>}
                                            </div>
                                        </div>
                                    </div>

                                    {/* STATUS SWITCHER (Top Right) */}
                                    <div>
                                        {member.is_super_admin ? (
                                            <div title="Super Admin Protegido" className="p-2 bg-amber-50 rounded-lg text-amber-500">
                                                <Shield size={20} fill="currentColor" />
                                            </div>
                                        ) : member.role === 'tech' ? (
                                            <div className="flex bg-slate-50 rounded-lg p-1 gap-1 border border-slate-100">
                                                <button onClick={() => initiateStatusChange(member, 'active')} className={`w-7 h-7 rounded-md flex items-center justify-center transition-all ${(member.status || 'active') === 'active' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-300 hover:text-emerald-500'}`} title="Activo">
                                                    <div className={`w-2 h-2 rounded-full bg-emerald-500 ${(member.status || 'active') === 'active' ? 'animate-pulse' : ''}`}></div>
                                                </button>
                                                <button onClick={() => initiateStatusChange(member, 'paused')} className={`w-7 h-7 rounded-md flex items-center justify-center transition-all ${member.status === 'paused' ? 'bg-white text-yellow-600 shadow-sm' : 'text-slate-300 hover:text-yellow-500'}`} title="Pausado">
                                                    <div className="w-2 h-2 rounded-full bg-yellow-500"></div>
                                                </button>
                                                <button onClick={() => initiateStatusChange(member, 'suspended')} className={`w-7 h-7 rounded-md flex items-center justify-center transition-all ${member.status === 'suspended' ? 'bg-white text-red-600 shadow-sm' : 'text-slate-300 hover:text-red-500'}`} title="Suspendido">
                                                    <div className="w-2 h-2 rounded-full bg-red-500"></div>
                                                </button>
                                            </div>
                                        ) : (
                                            <button onClick={() => handleToggleStatus(member)} className={`p-2 rounded-lg transition-all ${member.is_active ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100' : 'bg-red-50 text-red-500 hover:bg-red-100'}`} title={member.is_active ? "Cuenta Activa" : "Cuenta Bloqueada"}>
                                                {member.is_active ? <Unlock size={18} /> : <Lock size={18} />}
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {/* TECH STATS & REVIEWS */}
                                {activeTab === 'techs' && (
                                    <div className="mt-2 space-y-4">
                                        {/* Reviews */}
                                        <div className="flex items-center justify-between bg-slate-50 p-3 rounded-xl border border-slate-100">
                                            <div className="flex items-center gap-2">
                                                {member.avg_rating > 0 ? (
                                                    <div className="flex gap-0.5">
                                                        {[...Array(5)].map((_, i) => (
                                                            <Star key={i} size={14} className={i < Math.round(member.avg_rating) ? "text-amber-400 fill-amber-400" : "text-slate-200 fill-slate-200"} />
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <span className="text-xs text-slate-400 italic">Sin valoraciones</span>
                                                )}
                                            </div>
                                            <div className="text-xs font-bold text-slate-600">
                                                {member.avg_rating || '0.0'} <span className="font-normal text-slate-400">({member.total_reviews || 0})</span>
                                            </div>
                                        </div>

                                        {/* Stats Grid */}
                                        <div className="grid grid-cols-3 gap-2">
                                            <div className="bg-blue-50/50 p-2 rounded-xl text-center border border-blue-100/50">
                                                <div className="text-lg font-black text-blue-600 leading-none mb-1">{member.stats?.assigned || 0}</div>
                                                <div className="text-[9px] font-bold text-blue-400 uppercase tracking-wide">Asignados</div>
                                            </div>
                                            <div className="bg-indigo-50/50 p-2 rounded-xl text-center border border-indigo-100/50">
                                                <div className="text-lg font-black text-indigo-600 leading-none mb-1">{member.stats?.in_process || 0}</div>
                                                <div className="text-[9px] font-bold text-indigo-400 uppercase tracking-wide">En Proceso</div>
                                            </div>
                                            <div className="bg-emerald-50/50 p-2 rounded-xl text-center border border-emerald-100/50">
                                                <div className="text-lg font-black text-emerald-600 leading-none mb-1">{member.stats?.closed || 0}</div>
                                                <div className="text-[9px] font-bold text-emerald-400 uppercase tracking-wide">Hechos</div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* ACTIONS FOOTER */}
                            {user?.profile?.permissions?.can_manage_team && !showDeleted && (
                                <div className="bg-white p-3 border-t border-slate-100 flex items-center justify-between gap-2 mt-auto">
                                    {!member.is_super_admin && (
                                        <>
                                            <button onClick={() => handleOpenModal(member)} className="flex-1 py-2 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-50 hover:text-blue-600 transition flex items-center justify-center gap-2 border border-transparent hover:border-slate-200">
                                                <Edit2 size={14} /> Editar
                                            </button>

                                            {activeTab === 'techs' && (
                                                <button onClick={() => setViewingReviews(member)} className="flex-1 py-2 rounded-lg text-xs font-bold text-slate-600 hover:bg-yellow-50 hover:text-yellow-600 transition flex items-center justify-center gap-2 border border-transparent hover:border-yellow-200">
                                                    <MessageSquare size={14} /> Opiniones
                                                </button>
                                            )}

                                            <button
                                                onClick={() => {
                                                    if (confirm(`¿Mover a ${member.full_name} a la papelera?`)) {
                                                        supabase.from('profiles').update({ deleted_at: new Date().toISOString(), is_active: false }).eq('id', member.id).then(({ error }) => {
                                                            if (error) alert(error.message); else fetchMembers();
                                                        });
                                                    }
                                                }}
                                                className="flex-1 py-2 rounded-lg text-xs font-bold text-slate-400 hover:bg-red-50 hover:text-red-600 transition flex items-center justify-center gap-2 border border-transparent hover:border-red-200"
                                            >
                                                <Trash2 size={14} />
                                            </button>

                                            {member.role !== 'tech' && (
                                                <button onClick={() => handleOpenPermissions(member)} className="p-2 text-slate-300 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition" title="Permisos">
                                                    <Shield size={16} />
                                                </button>
                                            )}
                                        </>
                                    )}
                                </div>
                            )}

                            {showDeleted && (
                                <div className="p-4 bg-red-50/50 border-t border-red-100">
                                    <button onClick={() => handleRestoreMember(member)} className="w-full py-2 bg-white border border-green-200 text-green-700 rounded-xl text-sm font-bold shadow-sm hover:shadow-md transition flex items-center justify-center gap-2">
                                        <RotateCcw size={16} /> Restaurar Acceso
                                    </button>
                                </div>
                            )}
                        </div>
                    ))
                )}
            </div>

            {/* Modal Reason for Status Change */}
            {showReasonModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999] p-4 animation-fadeIn">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden p-6 animate-in zoom-in duration-200">
                        <div className="flex flex-col items-center text-center mb-4">
                            <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-3 ${pendingStatusChange?.status === 'suspended' ? 'bg-red-100 text-red-600' : 'bg-yellow-100 text-yellow-600'}`}>
                                <ShieldAlert size={28} />
                            </div>
                            <h3 className="text-lg font-bold text-slate-800">
                                {pendingStatusChange?.status === 'suspended' ? 'Suspender Técnico' : 'Pausar Técnico'}
                            </h3>
                            <p className="text-sm text-slate-500">
                                {pendingStatusChange?.status === 'suspended'
                                    ? 'El técnico perderá acceso inmediato a la App.'
                                    : 'El técnico podrá entrar pero NO podrá realizar servicios.'}
                            </p>
                        </div>

                        <div className="mb-4">
                            <label className="block text-sm font-bold text-slate-700 mb-1">Motivo / Causa *</label>
                            <textarea
                                autoFocus
                                className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none"
                                rows={3}
                                placeholder="Ej: Baja médica, Vacaciones, Incidencia..."
                                value={statusReason}
                                onChange={e => setStatusReason(e.target.value)}
                            />
                        </div>

                        <div className="flex gap-2">
                            <button
                                onClick={() => { setShowReasonModal(false); setPendingStatusChange(null); }}
                                className="flex-1 py-2 text-slate-600 font-medium hover:bg-slate-50 rounded-lg transition"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={confirmStatusChange}
                                disabled={!statusReason.trim()}
                                className={`flex-1 py-2 text-white font-bold rounded-lg transition shadow-md hover:shadow-lg ${pendingStatusChange?.status === 'suspended' ? 'bg-red-600 hover:bg-red-700' : 'bg-yellow-500 hover:bg-yellow-600'
                                    } ${!statusReason.trim() ? 'opacity-50 cursor-not-allowed' : ''}`}
                            >
                                Confirmar
                            </button>
                        </div>
                    </div>
                </div>
            )}

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
                                    <select
                                        className="w-full p-2 border border-slate-200 rounded-lg"
                                        value={formData.role}
                                        onChange={e => setFormData({ ...formData, role: e.target.value })}
                                    >
                                        <option value="tech">Técnico de Campo</option>
                                        <option value="admin">Administrador (Oficina)</option>
                                    </select>
                                </div>
                            </div>

                            {/* BYPASS TOGGLE (Only for Techs) */}
                            {(activeTab === 'techs' || formData.role === 'tech') && (
                                <div className="bg-amber-50 p-4 rounded-xl border border-amber-200">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <h4 className="font-bold text-amber-900 flex items-center gap-2">
                                                <Unlock size={16} /> Modo Test (Saltar Horarios)
                                            </h4>
                                            <p className="text-xs text-amber-700 mt-1">Permite iniciar trabajos fuera del horario laboral (08:00 - 20:00).</p>
                                        </div>
                                        <label className="relative inline-flex items-center cursor-pointer">
                                            <input
                                                type="checkbox"
                                                className="sr-only peer"
                                                checked={formData.bypassTimeRestrictions}
                                                onChange={e => setFormData({ ...formData, bypassTimeRestrictions: e.target.checked })}
                                            />
                                            <div className="w-11 h-6 bg-amber-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-600"></div>
                                        </label>
                                    </div>
                                </div>
                            )}

                            {/* Separator */}
                            <div className="border-t border-slate-100 my-4 pt-4"></div>

                            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                                <div className="flex justify-between items-center mb-3">
                                    <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                                        <MapPin size={16} className="text-indigo-600" /> Base de Operaciones
                                    </label>
                                    <button
                                        type="button"
                                        onClick={() => setFormData({
                                            ...formData,
                                            // Mock default (could be fetched from config)
                                            streetType: 'Calle',
                                            streetName: 'Central',
                                            streetNumber: '1',
                                            postalCode: '29000',
                                            city: 'Málaga',
                                            province: 'Málaga'
                                        })}
                                        className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 bg-indigo-50 px-2 py-1 rounded cursor-pointer"
                                    >
                                        ✅ Usar Central
                                    </button>
                                </div>
                                <p className="text-xs text-slate-500 mb-3 block">Ubicación de partida para el cálculo de rutas (MRCP).</p>

                                <div className="grid grid-cols-6 gap-2 mb-2">
                                    <div className="col-span-2">
                                        <select
                                            className="w-full p-2 border border-slate-200 rounded-lg text-sm bg-white"
                                            value={formData.streetType}
                                            onChange={e => setFormData({ ...formData, streetType: e.target.value })}
                                        >
                                            <option value="Calle">Calle</option>
                                            <option value="Avenida">Avenida</option>
                                            <option value="Plaza">Plaza</option>
                                            <option value="Camino">Camino</option>
                                            <option value="Carretera">Ctra.</option>
                                            <option value="Poligono">Polígono</option>
                                        </select>
                                    </div>
                                    <div className="col-span-4">
                                        <input
                                            type="text"
                                            placeholder="Nombre de la vía (Ej: Larios)"
                                            className="w-full p-2 border border-slate-200 rounded-lg text-sm"
                                            value={formData.streetName}
                                            onChange={e => setFormData({ ...formData, streetName: e.target.value })}
                                        />
                                    </div>
                                </div>
                                <div className="grid grid-cols-6 gap-2">
                                    <div className="col-span-2">
                                        <input
                                            type="text"
                                            placeholder="Nº"
                                            className="w-full p-2 border border-slate-200 rounded-lg text-sm"
                                            value={formData.streetNumber}
                                            onChange={e => setFormData({ ...formData, streetNumber: e.target.value })}
                                        />
                                    </div>
                                    <div className="col-span-2">
                                        <input
                                            type="text"
                                            placeholder="CP (5 dig)"
                                            maxLength={5}
                                            className={`w-full p-2 border rounded-lg text-sm ${formData.postalCode.length === 5 ? 'border-green-200 bg-green-50' : 'border-slate-200'}`}
                                            value={formData.postalCode}
                                            onChange={e => {
                                                const val = e.target.value.replace(/\D/g, '');
                                                setFormData({ ...formData, postalCode: val });
                                            }}
                                        />
                                    </div>
                                    <div className="col-span-2">
                                        <input
                                            type="text"
                                            placeholder="Ciudad"
                                            className="w-full p-2 border border-slate-200 rounded-lg text-sm"
                                            value={formData.city}
                                            onChange={e => setFormData({ ...formData, city: e.target.value })}
                                        />
                                    </div>
                                </div>
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
                </div>
            )}

            {/* PERMISSIONS MODAL */}
            {showPermsModal && targetAdmin && (
                <PermissionsModal
                    admin={targetAdmin}
                    permissions={perms}
                    onToggle={handleTogglePermission}
                    onSave={handleSavePermissions}
                    onClose={() => setShowPermsModal(false)}
                    saving={loading}
                />
            )}

            {/* REVIEWS MODAL */}
            {viewingReviews && (
                <AdminReviewModal
                    technician={viewingReviews}
                    onClose={() => setViewingReviews(null)}
                />
            )}
        </div>
    );
};


export default TeamManager;
