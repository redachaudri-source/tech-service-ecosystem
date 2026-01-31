import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import {
    MapPin, Plus, Trash2, Edit2, Star, Search,
    Home, Briefcase, Loader2, Save, X, ChevronRight, CheckCircle
} from 'lucide-react';
import AddressAutocomplete from '../components/AddressAutocomplete';

const CLIENT_TYPES = {
    particular: { label: 'Particular', icon: Home, maxAddresses: 3 },
    professional: { label: 'Profesional', icon: Briefcase, maxAddresses: 15 }
};

const AddressesPage = () => {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [addresses, setAddresses] = useState([]);
    const [clientType, setClientType] = useState('particular');
    const [search, setSearch] = useState('');
    const [editingId, setEditingId] = useState(null);
    const [showAddModal, setShowAddModal] = useState(false);
    const [newAddress, setNewAddress] = useState({ 
        label: '', 
        address_line: '',
        postal_code: '',
        city: '',
        latitude: null,
        longitude: null
    });

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            // Get client type
            const { data: profile } = await supabase
                .from('profiles')
                .select('client_type')
                .eq('id', user.id)
                .single();

            setClientType(profile?.client_type || 'particular');

            // Get addresses
            const { data: addressData } = await supabase
                .from('client_addresses')
                .select('*')
                .eq('client_id', user.id)
                .order('address_order', { ascending: true });

            setAddresses(addressData || []);
        } catch (error) {
            console.error('Error loading addresses:', error);
        } finally {
            setLoading(false);
        }
    };

    const maxAddresses = CLIENT_TYPES[clientType]?.maxAddresses || 3;
    const canAddMore = addresses.length < maxAddresses;

    const filteredAddresses = search
        ? addresses.filter(a =>
            a.label?.toLowerCase().includes(search.toLowerCase()) ||
            a.address_line?.toLowerCase().includes(search.toLowerCase())
        )
        : addresses;

    const handleAdd = async () => {
        if (!newAddress.address_line) return;
        setSaving(true);

        try {
            const { data: { user } } = await supabase.auth.getUser();
            const { error } = await supabase.from('client_addresses').insert({
                client_id: user.id,
                label: newAddress.label || `Dirección ${addresses.length + 1}`,
                address_line: newAddress.address_line,
                postal_code: newAddress.postal_code || null,
                city: newAddress.city || null,
                latitude: newAddress.latitude,
                longitude: newAddress.longitude,
                is_primary: addresses.length === 0,
                address_order: addresses.length + 1
            });

            if (error) throw error;
            setShowAddModal(false);
            setNewAddress({ label: '', address_line: '', postal_code: '', city: '', latitude: null, longitude: null });
            loadData();
        } catch (error) {
            alert('Error al añadir dirección: ' + error.message);
        } finally {
            setSaving(false);
        }
    };

    // Handle Google Places selection for new address
    const handleNewAddressSelect = (placeData) => {
        setNewAddress(prev => ({
            ...prev,
            address_line: placeData.address,
            postal_code: placeData.postal_code,
            city: placeData.city,
            latitude: placeData.latitude,
            longitude: placeData.longitude
        }));
    };

    const handleUpdate = async (id, updates) => {
        setSaving(true);
        try {
            const { error } = await supabase
                .from('client_addresses')
                .update(updates)
                .eq('id', id);

            if (error) throw error;
            setEditingId(null);
            loadData();
        } catch (error) {
            alert('Error al actualizar: ' + error.message);
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id) => {
        if (!confirm('¿Eliminar esta dirección?')) return;

        try {
            const { error } = await supabase
                .from('client_addresses')
                .delete()
                .eq('id', id);

            if (error) throw error;
            loadData();
        } catch (error) {
            alert('Error al eliminar: ' + error.message);
        }
    };

    const handleSetPrimary = async (id) => {
        const { data: { user } } = await supabase.auth.getUser();

        // Set all to non-primary first
        await supabase
            .from('client_addresses')
            .update({ is_primary: false })
            .eq('client_id', user.id);

        // Set selected as primary
        await supabase
            .from('client_addresses')
            .update({ is_primary: true })
            .eq('id', id);

        loadData();
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
            </div>
        );
    }

    const TypeIcon = CLIENT_TYPES[clientType].icon;

    return (
        <div className="max-w-2xl mx-auto p-4 space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800">Mis Direcciones</h1>
                    <div className="flex items-center gap-2 mt-1">
                        <TypeIcon size={14} className="text-slate-400" />
                        <span className="text-sm text-slate-500">
                            {CLIENT_TYPES[clientType].label} · {addresses.length}/{maxAddresses}
                        </span>
                    </div>
                </div>
                {canAddMore && (
                    <button
                        onClick={() => setShowAddModal(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition"
                    >
                        <Plus size={18} /> Añadir
                    </button>
                )}
            </div>

            {/* Search (for professionals with many addresses) */}
            {clientType === 'professional' && addresses.length > 5 && (
                <div className="relative">
                    <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Buscar propiedad..."
                        className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    />
                </div>
            )}

            {/* Address List */}
            <div className="space-y-3">
                {filteredAddresses.length === 0 ? (
                    <div className="text-center py-12 text-slate-500">
                        <MapPin className="w-12 h-12 mx-auto mb-3 opacity-30" />
                        <p>No tienes direcciones registradas.</p>
                    </div>
                ) : (
                    filteredAddresses.map((addr) => (
                        <div
                            key={addr.id}
                            className={`p-4 rounded-xl border transition ${addr.is_primary
                                    ? 'border-amber-400 bg-amber-50/50'
                                    : 'border-slate-200 bg-white hover:border-slate-300'
                                }`}
                        >
                            {editingId === addr.id ? (
                                /* Edit Mode */
                                <div className="space-y-3">
                                    <input
                                        value={addr.label}
                                        onChange={e => setAddresses(prev =>
                                            prev.map(a => a.id === addr.id ? { ...a, label: e.target.value } : a)
                                        )}
                                        placeholder="Nombre"
                                        className="w-full p-2 border border-slate-200 rounded-lg text-sm font-semibold"
                                    />
                                    <input
                                        value={addr.address_line}
                                        onChange={e => setAddresses(prev =>
                                            prev.map(a => a.id === addr.id ? { ...a, address_line: e.target.value } : a)
                                        )}
                                        placeholder="Dirección"
                                        className="w-full p-2 border border-slate-200 rounded-lg text-sm"
                                    />
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => setEditingId(null)}
                                            className="flex-1 py-2 border border-slate-200 rounded-lg text-sm font-medium"
                                        >
                                            Cancelar
                                        </button>
                                        <button
                                            onClick={() => handleUpdate(addr.id, {
                                                label: addr.label,
                                                address_line: addr.address_line
                                            })}
                                            disabled={saving}
                                            className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold flex items-center justify-center gap-2"
                                        >
                                            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                                            Guardar
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                /* View Mode */
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${addr.is_primary ? 'bg-amber-500 text-white' : 'bg-slate-100 text-slate-500'
                                            }`}>
                                            <MapPin size={18} />
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <span className="font-semibold text-slate-700">
                                                    {addr.label || 'Sin nombre'}
                                                </span>
                                                {addr.is_primary && (
                                                    <span className="px-2 py-0.5 bg-amber-500 text-white text-[10px] font-bold rounded-full flex items-center gap-1">
                                                        <Star size={10} /> Principal
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-sm text-slate-500 truncate max-w-[250px]">
                                                {addr.address_line}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        {!addr.is_primary && (
                                            <button
                                                onClick={() => handleSetPrimary(addr.id)}
                                                className="p-2 text-slate-400 hover:text-amber-500 hover:bg-amber-50 rounded-lg"
                                                title="Marcar como principal"
                                            >
                                                <Star size={16} />
                                            </button>
                                        )}
                                        <button
                                            onClick={() => setEditingId(addr.id)}
                                            className="p-2 text-slate-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg"
                                        >
                                            <Edit2 size={16} />
                                        </button>
                                        {addresses.length > 1 && (
                                            <button
                                                onClick={() => handleDelete(addr.id)}
                                                className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    ))
                )}
            </div>

            {/* Limit Warning */}
            {!canAddMore && (
                <div className="p-4 bg-slate-100 rounded-xl text-center text-sm text-slate-600">
                    Has alcanzado el límite de {maxAddresses} direcciones para clientes {CLIENT_TYPES[clientType].label}.
                </div>
            )}

            {/* Add Address Modal */}
            {showAddModal && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="font-bold text-lg">Nueva Dirección</h3>
                            <button onClick={() => setShowAddModal(false)} className="p-1 hover:bg-slate-100 rounded">
                                <X size={20} />
                            </button>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="text-sm font-medium text-slate-700">Nombre / Alias</label>
                                <input
                                    value={newAddress.label}
                                    onChange={e => setNewAddress({ ...newAddress, label: e.target.value })}
                                    placeholder="Ej: Casa, Oficina..."
                                    className="w-full p-3 border border-slate-200 rounded-xl mt-1"
                                />
                            </div>
                            <div>
                                <label className="text-sm font-medium text-slate-700">Dirección Completa</label>
                                <div className="mt-1">
                                    <AddressAutocomplete
                                        value={newAddress.address_line}
                                        onChange={(val) => setNewAddress({ ...newAddress, address_line: val })}
                                        onSelect={handleNewAddressSelect}
                                        placeholder="Buscar dirección..."
                                    />
                                </div>
                                {newAddress.postal_code && (
                                    <div className="mt-2 flex items-center gap-2 text-xs text-emerald-600">
                                        <CheckCircle size={12} />
                                        <span>CP: {newAddress.postal_code} · {newAddress.city}</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="flex gap-3 mt-6">
                            <button
                                onClick={() => setShowAddModal(false)}
                                className="flex-1 py-3 border border-slate-200 rounded-xl font-semibold text-slate-600"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleAdd}
                                disabled={saving || !newAddress.address_line}
                                className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-bold flex items-center justify-center gap-2 disabled:opacity-50"
                            >
                                {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                                Añadir
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AddressesPage;
