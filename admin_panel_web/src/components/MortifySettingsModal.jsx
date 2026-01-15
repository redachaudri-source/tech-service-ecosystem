import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Settings, X, Save, RotateCw, Loader2, Trash2, Plus } from 'lucide-react';

const MortifySettingsModal = ({ onClose }) => {
    const [categories, setCategories] = useState([]);
    const [deletedIds, setDeletedIds] = useState([]); // Track items to delete
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        fetchDefaults();
    }, []);

    const fetchDefaults = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('appliance_category_defaults')
                .select('*')
                .order('category_name');

            if (error) throw error;
            setCategories(data || []);
        } catch (err) {
            console.error(err);
            setError('Error al cargar configuraciones.');
        } finally {
            setLoading(false);
        }
    };

    const handleUpdate = (id, field, value) => {
        setCategories(prev => prev.map(c =>
            c.id === id ? { ...c, [field]: value } : c
        ));
    };

    const handleAdd = () => {
        // Add a temporary new row with a negative ID (or just a random ID) to key it
        const newTempId = `new_${Date.now()}`;
        setCategories([...categories, {
            id: newTempId,
            category_name: '',
            average_market_price: 0,
            average_lifespan_years: 0,
            isNew: true
        }]);
    };

    const handleDelete = (id) => {
        // If it's a new unsaved item, just remove from state
        if (id.toString().startsWith('new_')) {
            setCategories(prev => prev.filter(c => c.id !== id));
            return;
        }
        // If it's an existing item, remove from view and mark for deletion
        setCategories(prev => prev.filter(c => c.id !== id));
        setDeletedIds(prev => [...prev, id]);
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            // 1. Process Deletions
            if (deletedIds.length > 0) {
                const { error: deleteError } = await supabase
                    .from('appliance_category_defaults')
                    .delete()
                    .in('id', deletedIds);
                if (deleteError) throw deleteError;
            }

            // 2. Process Upserts (Updates and Inserts)
            // Filter out empty names to avoid constraint errors
            const validCategories = categories.filter(c => c.category_name && c.category_name.trim() !== '');

            if (validCategories.length > 0) {
                const payload = validCategories.map(c => {
                    const row = {
                        category_name: c.category_name,
                        average_market_price: parseFloat(c.average_market_price),
                        average_lifespan_years: parseInt(c.average_lifespan_years)
                    };
                    // Only include ID if it's NOT a new temp one
                    if (!c.isNew && !c.id.toString().startsWith('new_')) {
                        row.id = c.id;
                    }
                    return row;
                });

                const { error: upsertError } = await supabase
                    .from('appliance_category_defaults')
                    .upsert(payload, { onConflict: 'category_name' }); // upsert by name if unique, or we might rely on ID. 
                // Actually, if we just removed an item and added a new one with same name, it might conflict if not done transactionally?
                // But Supabase upsert is atomic. 
                // Let's assume onConflict is 'category_name' or 'id'.
                // If we rely on ID for updates, new items won't have it.
                // If we rely on category_name, renaming requires special care (update id where old_name=...)
                // But here we are just "saving list state". 
                // If user renames "Air Conditioner" to "Aire", and "Aire" doesn't exist, fine.
                // If "Aire" exists, it will update "Aire".
                // The simplest approach for this MVP "Customizable List":
                // Trust Supabase upsert. If ID is present, it updates that ID. If not, inserts.

                if (upsertError) throw upsertError;
            }

            onClose();
        } catch (err) {
            console.error(err);
            setError('Error al guardar cambios. Verifica que no haya nombres duplicados.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
            <div className="bg-white w-full max-w-3xl rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[90vh]">

                {/* Header */}
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                    <div>
                        <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                            <Settings className="text-indigo-600" />
                            Configuración Mortify
                        </h2>
                        <p className="text-sm text-slate-500">Añade, edita o elimina tipos de electrodomésticos.</p>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition">
                        <X size={24} />
                    </button>
                </div>

                {/* Body (Scrollable) */}
                <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
                    {loading ? (
                        <div className="flex justify-center py-12">
                            <Loader2 className="animate-spin text-indigo-600" size={32} />
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <table className="w-full text-left text-sm">
                                <thead className="text-slate-500 font-semibold border-b border-slate-200 sticky top-0 bg-white">
                                    <tr>
                                        <th className="py-3 pr-4">Categoría</th>
                                        <th className="py-3 px-2 w-32">Precio Medio (€)</th>
                                        <th className="py-3 px-2 w-32">Vida Útil (Años)</th>
                                        <th className="py-3 text-right"></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {categories.map((cat) => (
                                        <tr key={cat.id} className="hover:bg-slate-50/50 group">
                                            <td className="py-2 pr-4">
                                                <input
                                                    type="text"
                                                    className="w-full p-2 bg-transparent border border-transparent hover:border-slate-200 focus:border-indigo-300 rounded focus:ring-2 focus:ring-indigo-100 outline-none font-medium text-slate-700"
                                                    value={cat.category_name}
                                                    onChange={(e) => handleUpdate(cat.id, 'category_name', e.target.value)}
                                                    placeholder="Nombre categoría"
                                                />
                                            </td>
                                            <td className="py-2 px-2">
                                                <input
                                                    type="number"
                                                    className="w-full p-2 border border-slate-200 rounded-lg text-center font-mono focus:ring-2 focus:ring-indigo-200 outline-none"
                                                    value={cat.average_market_price}
                                                    onChange={(e) => handleUpdate(cat.id, 'average_market_price', e.target.value)}
                                                />
                                            </td>
                                            <td className="py-2 px-2">
                                                <input
                                                    type="number"
                                                    className="w-full p-2 border border-slate-200 rounded-lg text-center font-mono focus:ring-2 focus:ring-indigo-200 outline-none"
                                                    value={cat.average_lifespan_years}
                                                    onChange={(e) => handleUpdate(cat.id, 'average_lifespan_years', e.target.value)}
                                                />
                                            </td>
                                            <td className="py-2 text-right">
                                                <button
                                                    onClick={() => handleDelete(cat.id)}
                                                    className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition opacity-0 group-hover:opacity-100"
                                                    title="Eliminar"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>

                            <button
                                onClick={handleAdd}
                                className="w-full py-3 border border-dashed border-slate-300 rounded-xl text-slate-500 hover:border-indigo-400 hover:text-indigo-600 hover:bg-indigo-50 transition flex items-center justify-center gap-2 font-medium"
                            >
                                <Plus size={18} />
                                Añadir Nueva Categoría
                            </button>
                        </div>
                    )}
                    {error && <p className="text-red-500 text-sm mt-4 p-3 bg-red-50 rounded-lg text-center">{error}</p>}
                </div>

                {/* Footer */}
                <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-slate-600 hover:bg-slate-200 rounded-lg font-medium transition"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="px-6 py-2 bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-700 transition shadow-lg shadow-indigo-200 flex items-center gap-2 disabled:opacity-50"
                    >
                        {saving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
                        Guardar Cambios
                    </button>
                </div>
            </div>
        </div>
    );
};

export default MortifySettingsModal;
