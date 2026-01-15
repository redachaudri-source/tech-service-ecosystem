import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Settings, X, Save, RotateCw, Loader2 } from 'lucide-react';

const MortifySettingsModal = ({ onClose }) => {
    const [categories, setCategories] = useState([]);
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

    const handleSave = async () => {
        setSaving(true);
        try {
            // Upsert all modified rows
            // Optimally we'd only send changes, but for small list, bulk upsert is fine

            // Clean payload
            const payload = categories.map(({ id, category_name, average_market_price, average_lifespan_years }) => ({
                id,
                category_name,
                average_market_price: parseFloat(average_market_price),
                average_lifespan_years: parseInt(average_lifespan_years)
            }));

            const { error } = await supabase
                .from('appliance_category_defaults')
                .upsert(payload);

            if (error) throw error;

            onClose();
            // Can trigger a global refresh or toast here
        } catch (err) {
            console.error(err);
            setError('Error al guardar cambios.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
            <div className="bg-white w-full max-w-2xl rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[90vh]">

                {/* Header */}
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                    <div>
                        <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                            <Settings className="text-indigo-600" />
                            Configuración Mortify
                        </h2>
                        <p className="text-sm text-slate-500">Define los valores base para el cálculo de viabilidad.</p>
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
                        <table className="w-full text-left text-sm">
                            <thead className="text-slate-500 font-semibold border-b border-slate-200 sticky top-0 bg-white">
                                <tr>
                                    <th className="py-3 pr-4">Categoría</th>
                                    <th className="py-3 px-2 w-32">Precio Medio (€)</th>
                                    <th className="py-3 px-2 w-32">Vida Útil (Años)</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {categories.map((cat) => (
                                    <tr key={cat.id} className="hover:bg-slate-50/50">
                                        <td className="py-3 pr-4 font-medium text-slate-700">
                                            {cat.category_name}
                                        </td>
                                        <td className="py-3 px-2">
                                            <input
                                                type="number"
                                                className="w-full p-2 border border-slate-200 rounded-lg text-center font-mono focus:ring-2 focus:ring-indigo-200 outline-none"
                                                value={cat.average_market_price}
                                                onChange={(e) => handleUpdate(cat.id, 'average_market_price', e.target.value)}
                                            />
                                        </td>
                                        <td className="py-3 px-2">
                                            <input
                                                type="number"
                                                className="w-full p-2 border border-slate-200 rounded-lg text-center font-mono focus:ring-2 focus:ring-indigo-200 outline-none"
                                                value={cat.average_lifespan_years}
                                                onChange={(e) => handleUpdate(cat.id, 'average_lifespan_years', e.target.value)}
                                            />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
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
