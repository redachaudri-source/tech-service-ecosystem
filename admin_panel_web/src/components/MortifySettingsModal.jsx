import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Settings, X, Save, Loader2, Trash2, Plus, Tag, Coins } from 'lucide-react';

const MortifySettingsModal = ({ onClose }) => {
    const [activeTab, setActiveTab] = useState('prices'); // 'prices' | 'brands'

    // DATA STATES
    const [categories, setCategories] = useState([]);
    const [brands, setBrands] = useState([]);

    // UI STATES
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);

    // TRACKING DELETIONS
    const [deletedCategoryIds, setDeletedCategoryIds] = useState([]);
    const [deletedBrandIds, setDeletedBrandIds] = useState([]);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        try {
            // 1. Fetch Categories
            const { data: catData, error: catError } = await supabase
                .from('appliance_category_defaults')
                .select('*')
                .order('category_name');
            if (catError) throw catError;

            // 2. Fetch Brands
            const { data: brandData, error: brandError } = await supabase
                .from('mortify_brand_scores')
                .select('*')
                .order('brand_name');
            // If table doesn't exist yet (SQL not run), this might error. We fail gracefully.
            if (brandError && brandError.code !== '42P01') throw brandError; // 42P01 is undefined_table

            setCategories(catData || []);
            setBrands(brandData || []);
        } catch (err) {
            console.error(err);
            setError('Error al cargar datos. Asegúrate de haber ejecutado el script SQL.');
        } finally {
            setLoading(false);
        }
    };

    // --- HANDLERS FOR CATEGORIES ---
    const updateCategory = (id, field, value) => {
        setCategories(prev => prev.map(c => c.id === id ? { ...c, [field]: value } : c));
    };
    const addCategory = () => {
        setCategories([...categories, {
            id: `new_${Date.now()}`, category_name: '', average_market_price: 0, average_lifespan_years: 0, isNew: true
        }]);
    };
    const deleteCategory = (id) => {
        if (id.toString().startsWith('new_')) {
            setCategories(prev => prev.filter(c => c.id !== id));
        } else {
            setCategories(prev => prev.filter(c => c.id !== id));
            setDeletedCategoryIds(prev => [...prev, id]);
        }
    };

    // --- HANDLERS FOR BRANDS ---
    const updateBrand = (id, field, value) => {
        setBrands(prev => prev.map(b => b.id === id ? { ...b, [field]: value } : b));
    };
    const addBrand = () => {
        setBrands([...brands, {
            id: `new_${Date.now()}`, brand_name: '', score_points: 1, isNew: true
        }]);
    };
    const deleteBrand = (id) => {
        if (id.toString().startsWith('new_')) {
            setBrands(prev => prev.filter(b => b.id !== id));
        } else {
            setBrands(prev => prev.filter(b => b.id !== id));
            setDeletedBrandIds(prev => [...prev, id]);
        }
    };

    // --- EXPORT / SAVE ---
    const handleSave = async () => {
        setSaving(true);
        setError(null);
        try {
            // === PROCESS CATEGORIES ===
            if (deletedCategoryIds.length > 0) {
                await supabase.from('appliance_category_defaults').delete().in('id', deletedCategoryIds);
            }
            const validCats = categories.filter(c => c.category_name && c.category_name.trim() !== '');
            if (validCats.length > 0) {
                const catPayload = validCats.map(c => {
                    const row = { category_name: c.category_name, average_market_price: parseFloat(c.average_market_price), average_lifespan_years: parseInt(c.average_lifespan_years) };
                    if (!c.isNew) row.id = c.id;
                    return row;
                });
                const { error: catErr } = await supabase.from('appliance_category_defaults').upsert(catPayload, { onConflict: 'category_name' });
                if (catErr) throw catErr;
            }

            // === PROCESS BRANDS ===
            if (deletedBrandIds.length > 0) {
                await supabase.from('mortify_brand_scores').delete().in('id', deletedBrandIds);
            }
            const validBrands = brands.filter(b => b.brand_name && b.brand_name.trim() !== '');
            if (validBrands.length > 0) {
                const brandPayload = validBrands.map(b => {
                    const row = {
                        brand_name: b.brand_name.toUpperCase().trim(),
                        score_points: parseInt(b.score_points)
                    };
                    if (!b.isNew) row.id = b.id;
                    return row;
                });
                const { error: brandErr } = await supabase.from('mortify_brand_scores').upsert(brandPayload, { onConflict: 'brand_name' });
                if (brandErr) throw brandErr;
            }

            onClose();
        } catch (err) {
            console.error(err);
            setError('Error al guardar. Revisa duplicados o conexión.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
            <div className="bg-white w-full max-w-4xl rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[90vh]">

                {/* Header */}
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                    <div>
                        <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                            <Settings className="text-indigo-600" />
                            Configuración Algoritmo Mortify
                        </h2>
                        <p className="text-sm text-slate-500">Ajusta los parámetros base del cerebro de la IA.</p>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition">
                        <X size={24} />
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-slate-200 bg-white px-6">
                    <button
                        onClick={() => setActiveTab('prices')}
                        className={`py-3 px-4 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'prices' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'
                            }`}
                    >
                        <Coins size={16} />
                        Precios de Referencia
                    </button>
                    <button
                        onClick={() => setActiveTab('brands')}
                        className={`py-3 px-4 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'brands' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'
                            }`}
                    >
                        <Tag size={16} />
                        Gestión de Marcas
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-6 scrollbar-thin bg-slate-50/50">
                    {loading ? (
                        <div className="flex justify-center py-12">
                            <Loader2 className="animate-spin text-indigo-600" size={32} />
                        </div>
                    ) : (
                        <>
                            {/* ERROR MESSAGE */}
                            {error && <p className="text-red-500 text-sm mb-4 p-3 bg-red-50 rounded-lg text-center">{error}</p>}

                            {/* TAB: PRICES */}
                            {activeTab === 'prices' && (
                                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                                    <table className="w-full text-left text-sm mb-4">
                                        <thead className="text-slate-500 font-semibold border-b border-slate-100">
                                            <tr>
                                                <th className="py-2 pr-4 pl-2">Categoría</th>
                                                <th className="py-2 px-2 w-32">Precio (€)</th>
                                                <th className="py-2 px-2 w-32">Vida (Años)</th>
                                                <th className="py-2 w-10"></th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {categories.map((cat) => (
                                                <tr key={cat.id} className="hover:bg-slate-50 group">
                                                    <td className="py-2 pr-4 pl-2">
                                                        <input
                                                            className="w-full bg-transparent outline-none font-medium text-slate-700 placeholder:text-slate-300"
                                                            placeholder="Nueva categoría..."
                                                            value={cat.category_name}
                                                            onChange={(e) => updateCategory(cat.id, 'category_name', e.target.value)}
                                                        />
                                                    </td>
                                                    <td className="py-2 px-2">
                                                        <input type="number"
                                                            className="w-full p-1.5 border border-slate-200 rounded text-center font-mono focus:border-indigo-500 outline-none"
                                                            value={cat.average_market_price}
                                                            onChange={(e) => updateCategory(cat.id, 'average_market_price', e.target.value)}
                                                        />
                                                    </td>
                                                    <td className="py-2 px-2">
                                                        <input type="number"
                                                            className="w-full p-1.5 border border-slate-200 rounded text-center font-mono focus:border-indigo-500 outline-none"
                                                            value={cat.average_lifespan_years}
                                                            onChange={(e) => updateCategory(cat.id, 'average_lifespan_years', e.target.value)}
                                                        />
                                                    </td>
                                                    <td className="py-2 text-right">
                                                        <button onClick={() => deleteCategory(cat.id)} className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded transition">
                                                            <Trash2 size={16} />
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                    <button onClick={addCategory} className="w-full py-2 border border-dashed border-slate-300 rounded-lg text-slate-500 hover:border-indigo-500 hover:text-indigo-600 text-sm font-medium flex justify-center gap-2">
                                        <Plus size={16} /> Añadir Categoría
                                    </button>
                                </div>
                            )}

                            {/* TAB: BRANDS */}
                            {activeTab === 'brands' && (
                                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                                    <div className="grid grid-cols-2 gap-4 mb-4">
                                        <div className="p-3 bg-indigo-50 rounded-lg border border-indigo-100">
                                            <div className="text-xs font-bold text-indigo-800 uppercase mb-1">Puntos Clave</div>
                                            <ul className="text-xs text-indigo-700 space-y-1">
                                                <li>4 pts = Excelencia (Miele, Daikin...)</li>
                                                <li>3 pts = Muy Buena (Bosch, Samsung...)</li>
                                                <li>2 pts = Estándar (Whirlpool, Teka...)</li>
                                                <li>1 pt = Básica (Beko, Low Cost...)</li>
                                            </ul>
                                        </div>
                                    </div>

                                    <div className="max-h-[50vh] overflow-y-auto pr-2">
                                        <table className="w-full text-left text-sm mb-4">
                                            <thead className="text-slate-500 font-semibold border-b border-slate-100 sticky top-0 bg-white z-10">
                                                <tr>
                                                    <th className="py-2 pr-4 pl-2">Marca</th>
                                                    <th className="py-2 px-2 w-48">Puntuación (1-4)</th>
                                                    <th className="py-2 w-10"></th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                {brands.map((brand) => (
                                                    <tr key={brand.id} className="hover:bg-slate-50 group">
                                                        <td className="py-2 pr-4 pl-2">
                                                            <input
                                                                className="w-full bg-transparent outline-none font-medium text-slate-700 uppercase placeholder:normal-case placeholder:text-slate-300"
                                                                placeholder="NOMBRE MARCA..."
                                                                value={brand.brand_name}
                                                                onChange={(e) => updateBrand(brand.id, 'brand_name', e.target.value)}
                                                            />
                                                        </td>
                                                        <td className="py-2 px-2">
                                                            <div className="flex items-center gap-2">
                                                                <input
                                                                    type="range" min="1" max="4" step="1"
                                                                    className="w-full accent-indigo-600 cursor-pointer"
                                                                    value={brand.score_points}
                                                                    onChange={(e) => updateBrand(brand.id, 'score_points', e.target.value)}
                                                                />
                                                                <span className={`font-bold w-6 text-center ${brand.score_points == 4 ? 'text-indigo-600' :
                                                                        brand.score_points == 3 ? 'text-blue-600' :
                                                                            brand.score_points == 2 ? 'text-amber-600' : 'text-slate-400'
                                                                    }`}>
                                                                    {brand.score_points}
                                                                </span>
                                                            </div>
                                                        </td>
                                                        <td className="py-2 text-right">
                                                            <button onClick={() => deleteBrand(brand.id)} className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded transition">
                                                                <Trash2 size={16} />
                                                            </button>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                    <button onClick={addBrand} className="w-full py-2 border border-dashed border-slate-300 rounded-lg text-slate-500 hover:border-indigo-500 hover:text-indigo-600 text-sm font-medium flex justify-center gap-2">
                                        <Plus size={16} /> Añadir Nueva Marca
                                    </button>
                                </div>
                            )}
                        </>
                    )}
                </div>

                {/* Footer */}
                <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
                    <button onClick={onClose} className="px-4 py-2 text-slate-600 hover:bg-slate-200 rounded-lg font-medium transition">
                        Cancelar
                    </button>
                    <button onClick={handleSave} disabled={saving} className="px-6 py-2 bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-700 transition shadow-lg shadow-indigo-200 flex items-center gap-2 disabled:opacity-50">
                        {saving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
                        Guardar Cambios
                    </button>
                </div>
            </div>
        </div>
    );
};

export default MortifySettingsModal;
