import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Plus, Trash2, Edit2, Save, Upload, Search, Image as ImageIcon, AlertCircle, X, Check } from 'lucide-react';

const BrandManager = () => {
    const [brands, setBrands] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');

    // New Brand State
    const [newBrandName, setNewBrandName] = useState('');
    const [adding, setAdding] = useState(false);

    // Edit State
    const [editingId, setEditingId] = useState(null);
    const [editName, setEditName] = useState('');

    useEffect(() => {
        fetchBrands();
    }, []);

    const fetchBrands = async () => {
        try {
            // Fetch all brands (including inactive if we want to restore, but for now let's just show active or all)
            // Let's generic select * and order by name
            const { data, error } = await supabase
                .from('brands')
                .select('*')
                .eq('is_active', true) // Assuming we only care about active ones for now
                .order('name');

            if (error) throw error;
            setBrands(data || []);
        } catch (error) {
            console.error('Error fetching brands:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleAdd = async (e) => {
        e.preventDefault();
        if (!newBrandName.trim()) return;

        setAdding(true);
        try {
            // Use RPC or direct insert. Direct insert is safer if we don't know the RPC details.
            // But SmartBrandSelector used 'manage_brand' RPC. Let's try direct insert first as it is standard.
            const { data, error } = await supabase
                .from('brands')
                .insert([{ name: newBrandName.trim(), is_active: true }])
                .select()
                .single();

            if (error) throw error;

            setBrands([...brands, data].sort((a, b) => a.name.localeCompare(b.name)));
            setNewBrandName('');
        } catch (error) {
            console.error(error);
            alert('Error al añadir marca: ' + error.message);
        } finally {
            setAdding(false);
        }
    };

    const handleDelete = async (id) => {
        if (!confirm('¿Eliminar esta marca? Se ocultará de los selectores, pero los históricos se mantendrán.')) return;

        try {
            // Soft delete
            const { error } = await supabase
                .from('brands')
                .update({ is_active: false })
                .eq('id', id);

            if (error) throw error;
            setBrands(brands.filter(b => b.id !== id));
        } catch (error) {
            alert('Error al eliminar: ' + error.message);
        }
    };

    const startEdit = (brand) => {
        setEditingId(brand.id);
        setEditName(brand.name);
    };

    const cancelEdit = () => {
        setEditingId(null);
        setEditName('');
    };

    const saveEdit = async (id) => {
        if (!editName.trim()) return;

        try {
            const { error } = await supabase
                .from('brands')
                .update({ name: editName.trim() })
                .eq('id', id);

            if (error) throw error;

            setBrands(brands.map(b => b.id === id ? { ...b, name: editName.trim() } : b));
            setEditingId(null);
        } catch (error) {
            alert('Error al actualizar: ' + error.message);
        }
    };

    const handleLogoUpload = async (e, brandId) => {
        const file = e.target.files[0];
        if (!file) return;

        if (file.size > 2 * 1024 * 1024) { // 2MB limit for logos
            alert('El logo debe pesar menos de 2MB');
            return;
        }

        try {
            const fileExt = file.name.split('.').pop();
            const fileName = `brands/${brandId}-${Date.now()}.${fileExt}`;

            // Upload to 'company-asset' bucket (reusing existing bucket)
            const { error: uploadError } = await supabase.storage
                .from('company-asset')
                .upload(fileName, file, { upsert: true });

            if (uploadError) throw uploadError;

            const { data: { publicUrl } } = supabase.storage
                .from('company-asset')
                .getPublicUrl(fileName);

            // Update database
            const { error: dbError } = await supabase
                .from('brands')
                .update({ logo_url: publicUrl })
                .eq('id', brandId);

            if (dbError) throw dbError;

            // Update UI
            setBrands(brands.map(b => b.id === brandId ? { ...b, logo_url: publicUrl } : b));

        } catch (error) {
            console.error('Upload failed:', error);
            alert('Error al subir logo. Asegúrate de que existe la columna "logo_url" en la tabla brands.');
        }
    };

    // Filter logic
    const filteredBrands = brands.filter(b =>
        b.name.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden h-full flex flex-col">
            <div className="p-6 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                <h2 className="font-bold text-lg text-slate-700 flex items-center gap-2">
                    <Check size={20} className="text-blue-600" />
                    Gestión de Marcas y Fabricantes
                </h2>
                <div className="text-xs text-slate-400 font-mono">
                    Total: {brands.length}
                </div>
            </div>

            <div className="p-4 border-b border-slate-100 bg-white grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Search */}
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input
                        type="text"
                        placeholder="Buscar marca..."
                        className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                </div>

                {/* Add New */}
                <form onSubmit={handleAdd} className="flex gap-2">
                    <input
                        type="text"
                        placeholder="Nueva marca..."
                        className="flex-1 px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                        value={newBrandName}
                        onChange={e => setNewBrandName(e.target.value)}
                    />
                    <button
                        type="submit"
                        disabled={adding || !newBrandName.trim()}
                        className="bg-slate-800 text-white px-4 py-2 rounded-lg hover:bg-slate-700 transition disabled:opacity-50 flex items-center gap-2 text-sm font-medium"
                    >
                        <Plus size={16} /> Añadir
                    </button>
                </form>
            </div>

            <div className="flex-1 overflow-y-auto p-4 max-h-[500px]">
                {loading ? (
                    <div className="text-center py-10 text-slate-400">Cargando marcas...</div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {filteredBrands.map(brand => (
                            <div key={brand.id} className="group relative border border-slate-200 rounded-lg p-3 hover:shadow-md transition bg-white flex items-center gap-3">
                                {/* Logo Uploader */}
                                <div className="shrink-0 relative w-12 h-12 bg-slate-50 rounded-md border border-slate-100 flex items-center justify-center overflow-hidden">
                                    {brand.logo_url ? (
                                        <img src={brand.logo_url} alt={brand.name} className="w-full h-full object-contain p-1" />
                                    ) : (
                                        <ImageIcon size={20} className="text-slate-300" />
                                    )}

                                    {/* Helper Overlay for Upload */}
                                    <label className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                                        <Upload size={16} className="text-white" />
                                        <input
                                            type="file"
                                            accept="image/*"
                                            className="hidden"
                                            onChange={(e) => handleLogoUpload(e, brand.id)}
                                        />
                                    </label>
                                </div>

                                {/* Content */}
                                <div className="flex-1 min-w-0">
                                    {editingId === brand.id ? (
                                        <div className="flex items-center gap-1">
                                            <input
                                                autoFocus
                                                type="text"
                                                className="w-full text-sm border border-blue-400 rounded px-1 py-0.5 outline-none"
                                                value={editName}
                                                onChange={e => setEditName(e.target.value)}
                                                onKeyDown={e => e.key === 'Enter' && saveEdit(brand.id)}
                                            />
                                            <button onClick={() => saveEdit(brand.id)} className="text-green-600 hover:bg-green-50 rounded p-1"><Check size={14} /></button>
                                            <button onClick={cancelEdit} className="text-red-500 hover:bg-red-50 rounded p-1"><X size={14} /></button>
                                        </div>
                                    ) : (
                                        <div className="flex justify-between items-center group/text">
                                            <h3 className="font-semibold text-slate-700 truncate text-sm" title={brand.name}>{brand.name}</h3>
                                            <button
                                                onClick={() => startEdit(brand)}
                                                className="opacity-0 group-hover/text:opacity-100 text-slate-400 hover:text-blue-500 transition p-1"
                                            >
                                                <Edit2 size={12} />
                                            </button>
                                        </div>
                                    )}
                                    <p className="text-[10px] text-slate-400 mt-0.5 truncate">
                                        ID: {brand.id.toString().slice(0, 8)}...
                                    </p>
                                </div>

                                {/* Delete Action */}
                                {editingId !== brand.id && (
                                    <button
                                        onClick={() => handleDelete(brand.id)}
                                        className="text-slate-300 hover:text-red-500 hover:bg-red-50 p-1.5 rounded transition opacity-0 group-hover:opacity-100"
                                        title="Eliminar Marca"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                )}

                {!loading && filteredBrands.length === 0 && (
                    <div className="text-center py-12 flex flex-col items-center">
                        <div className="bg-slate-100 p-4 rounded-full mb-3">
                            <Search size={24} className="text-slate-400" />
                        </div>
                        <p className="text-slate-500 font-medium">No se encontraron marcas.</p>
                        <p className="text-sm text-slate-400">Intenta buscar otro nombre o añade una nueva.</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default BrandManager;
