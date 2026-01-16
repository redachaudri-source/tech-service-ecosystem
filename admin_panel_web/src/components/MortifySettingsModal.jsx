import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { Settings, X, Save, Loader2, Trash2, Plus, Tag, Coins, Info, AlertTriangle } from 'lucide-react';

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

            if (brandError && brandError.code !== '42P01') throw brandError;

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

    // FIX: Add to TOP
    const addCategory = () => {
        const newItem = {
            id: `new_${Date.now()}`,
            category_name: '',
            average_market_price: 0,
            average_lifespan_years: 0,
            isNew: true
        };
        setCategories([newItem, ...categories]);
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

    // FIX: Add to TOP
    const addBrand = () => {
        const newItem = {
            id: `new_${Date.now()}`,
            brand_name: '',
            score_points: 1,
            isNew: true
        };
        setBrands([newItem, ...brands]);
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
                const { error: delErr } = await supabase.from('appliance_category_defaults').delete().in('id', deletedCategoryIds);
                if (delErr) throw new Error(`Error borrando categorías: ${delErr.message}`);
            }

            const validCats = categories.filter(c => c.category_name && c.category_name.trim() !== '');
            if (validCats.length > 0) {
                const catPayload = validCats.map(c => {
                    const row = {
                        category_name: c.category_name,
                        average_market_price: parseFloat(c.average_market_price),
                        average_lifespan_years: parseInt(c.average_lifespan_years)
                    };
                    // FIX: Generate ID client-side if new to satisfy DB constraints
                    if (c.isNew) {
                        row.id = crypto.randomUUID();
                    } else {
                        row.id = c.id;
                    }
                    return row;
                });

                const { error: catErr } = await supabase.from('appliance_category_defaults').upsert(catPayload, { onConflict: 'category_name' });
                if (catErr) throw new Error(`Error guardando categorías: ${catErr.message}`);
            }

            // === PROCESS BRANDS ===
            if (deletedBrandIds.length > 0) {
                const { error: delBrErr } = await supabase.from('mortify_brand_scores').delete().in('id', deletedBrandIds);
                if (delBrErr) throw new Error(`Error borrando marcas: ${delBrErr.message}`);
            }

            const validBrands = brands.filter(b => b.brand_name && b.brand_name.trim() !== '');
            if (validBrands.length > 0) {
                const brandPayload = validBrands.map(b => {
                    const row = {
                        brand_name: b.brand_name.toUpperCase().trim(),
                        score_points: parseInt(b.score_points)
                    };
                    // FIX: Generate ID client-side if new to satisfy DB constraints
                    if (b.isNew) {
                        row.id = crypto.randomUUID();
                    } else {
                        row.id = b.id;
                    }
                    return row;
                });

                const { error: brandErr } = await supabase.from('mortify_brand_scores').upsert(brandPayload, { onConflict: 'brand_name' });
                if (brandErr) throw new Error(`Error guardando marcas: ${brandErr.message}`);
            }

            // SUCCESS FEEDBACK -> Close
            onClose();
        } catch (err) {
            console.error(err);
            setError(err.message || 'Error desconocido al guardar.');
            // VISIBLE FEEDBACK
            alert(`⚠️ Error al guardar: ${err.message}`);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
            {/* FIX: Layout Structure for Fixed Headers */}
            <div className="bg-white w-full max-w-4xl rounded-2xl shadow-xl overflow-hidden flex flex-col h-[90vh]">

                {/* 1. FIXED HEADER */}
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50 shrink-0">
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

                {/* 2. FIXED TABS */}
                <div className="flex border-b border-slate-200 bg-white px-6 shrink-0">
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

                {/* 3. SCROLLABLE CONTENT AREA */}
                <div className="flex-1 overflow-hidden relative bg-slate-50/50">
                    {loading ? (
                        <div className="flex justify-center items-center h-full">
                            <Loader2 className="animate-spin text-indigo-600" size={32} />
                        </div>
                    ) : (
                        <div className="absolute inset-0 overflow-y-auto p-6 scrollbar-thin">

                            {/* Global Error */}
                            {error && <div className="mb-4 p-4 bg-red-50 text-red-600 rounded-lg flex items-center gap-2 text-sm font-bold border border-red-100">
                                <AlertTriangle size={18} /> {error}
                            </div>}

                            {/* TAB: PRICES */}
                            {activeTab === 'prices' && (
                                <div className="space-y-4">
                                    {/* EXPLANATION BOX */}
                                    <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-100 text-indigo-900 text-sm">
                                        <div className="flex items-center gap-2 font-bold mb-1 text-indigo-700">
                                            <Info size={16} /> ¿Cómo influye esto?
                                        </div>
                                        <p className="leading-relaxed opacity-90">
                                            Define el <strong>Precio de Mercado</strong> (valor nuevo) y la <strong>Vida Útil</strong> estimada para cada tipo de aparato.
                                            El algoritmo usa estos datos para calcular el <strong>Valor Residual</strong> del equipo en función de su antigüedad.
                                            <br />
                                            <span className="text-xs mt-1 block font-mono bg-indigo-100/50 p-1 rounded w-fit">
                                                Si Coste Reparación &gt; 50% del Valor Residual ➔ Se sugiere OBSOLETO.
                                            </span>
                                        </p>
                                    </div>

                                    {/* ADD BUTTON (TOP) */}
                                    <button onClick={addCategory} className="w-full py-3 bg-white border-2 border-dashed border-indigo-200 text-indigo-600 hover:bg-indigo-50 hover:border-indigo-300 rounded-xl font-bold transition flex items-center justify-center gap-2 shadow-sm">
                                        <Plus size={20} /> Añadir Nueva Categoría
                                    </button>

                                    {/* TABLE */}
                                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                                        <table className="w-full text-left text-sm">
                                            <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-100">
                                                <tr>
                                                    <th className="py-3 pl-4 pr-2">Categoría</th>
                                                    <th className="py-3 px-2 w-32 text-center">Precio (€)</th>
                                                    <th className="py-3 px-2 w-32 text-center">Vida (Años)</th>
                                                    <th className="py-3 w-10"></th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                {categories.map((cat) => (
                                                    <tr key={cat.id} className="hover:bg-slate-50 group transition-colors">
                                                        <td className="py-2 pl-4 pr-2">
                                                            <div className="flex items-center gap-2">
                                                                {cat.isNew && <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>}
                                                                <input
                                                                    autoFocus={cat.isNew}
                                                                    className="w-full bg-transparent outline-none font-medium text-slate-700 placeholder:text-slate-300 border-b border-transparent focus:border-indigo-300 px-1 py-1"
                                                                    placeholder="Ej: Lavadora"
                                                                    value={cat.category_name}
                                                                    onChange={(e) => updateCategory(cat.id, 'category_name', e.target.value)}
                                                                />
                                                            </div>
                                                        </td>
                                                        <td className="py-2 px-2">
                                                            <input type="number"
                                                                className="w-full p-2 border border-slate-200 rounded text-center font-mono focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none transition-all"
                                                                value={cat.average_market_price}
                                                                onChange={(e) => updateCategory(cat.id, 'average_market_price', e.target.value)}
                                                            />
                                                        </td>
                                                        <td className="py-2 px-2">
                                                            <input type="number"
                                                                className="w-full p-2 border border-slate-200 rounded text-center font-mono focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none transition-all"
                                                                value={cat.average_lifespan_years}
                                                                onChange={(e) => updateCategory(cat.id, 'average_lifespan_years', e.target.value)}
                                                            />
                                                        </td>
                                                        <td className="py-2 pr-2 text-right">
                                                            <button onClick={() => deleteCategory(cat.id)} className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition">
                                                                <Trash2 size={18} />
                                                            </button>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}

                            {/* TAB: BRANDS */}
                            {activeTab === 'brands' && (
                                <div className="space-y-4">
                                    {/* EXPLANATION BOX */}
                                    <div className="bg-purple-50 p-4 rounded-xl border border-purple-100 text-purple-900 text-sm grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <div className="flex items-center gap-2 font-bold mb-1 text-purple-700">
                                                <Info size={16} /> Impacto en el Algoritmo
                                            </div>
                                            <p className="leading-relaxed opacity-90 text-xs">
                                                La marca determina la <strong>Calidad de Construcción</strong>.
                                                Una marca Premium (4pts) conserva su valor mejor y justifica reparaciones más caras.
                                                <br />
                                                Si el modelo detecta una marca desconocida, le asigna <strong>1 punto (Genérica)</strong>.
                                            </p>
                                        </div>
                                        <div className="bg-white/50 rounded-lg p-2 text-xs border border-purple-100">
                                            <span className="block font-bold mb-1 text-purple-800">Guía de Puntuación:</span>
                                            <ul className="space-y-1">
                                                <li className="flex items-center gap-2"><span className="w-5 h-5 rounded bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-[10px]">4</span> Top (Miele, Daikin, Wolf)</li>
                                                <li className="flex items-center gap-2"><span className="w-5 h-5 rounded bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-[10px]">3</span> Alta (Bosch, Samsung, LG)</li>
                                                <li className="flex items-center gap-2"><span className="w-5 h-5 rounded bg-amber-100 text-amber-700 flex items-center justify-center font-bold text-[10px]">2</span> Media (Whirlpool, Teka)</li>
                                                <li className="flex items-center gap-2"><span className="w-5 h-5 rounded bg-slate-100 text-slate-600 flex items-center justify-center font-bold text-[10px]">1</span> Básica/Low Cost</li>
                                            </ul>
                                        </div>
                                    </div>

                                    {/* ADD BUTTON (TOP) */}
                                    <button onClick={addBrand} className="w-full py-3 bg-white border-2 border-dashed border-purple-200 text-purple-600 hover:bg-purple-50 hover:border-purple-300 rounded-xl font-bold transition flex items-center justify-center gap-2 shadow-sm">
                                        <Plus size={20} /> Añadir Nueva Marca
                                    </button>

                                    {/* TABLE */}
                                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                                        <table className="w-full text-left text-sm">
                                            <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-100 sticky top-0 z-10">
                                                <tr>
                                                    <th className="py-3 pl-4 pr-2">Marca</th>
                                                    <th className="py-3 px-2 w-48 text-center block md:table-cell">Puntuación</th>
                                                    <th className="py-3 w-10"></th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                {brands.map((brand) => (
                                                    <tr key={brand.id} className="hover:bg-slate-50 group transition-colors">
                                                        <td className="py-2 pl-4 pr-2">
                                                            <div className="flex items-center gap-2">
                                                                {brand.isNew && <span className="w-2 h-2 rounded-full bg-purple-500 animate-pulse"></span>}
                                                                <input
                                                                    autoFocus={brand.isNew}
                                                                    className="w-full bg-transparent outline-none font-medium text-slate-700 uppercase placeholder:normal-case placeholder:text-slate-300 border-b border-transparent focus:border-purple-300 px-1 py-1"
                                                                    placeholder="NOMBRE MARCA..."
                                                                    value={brand.brand_name}
                                                                    onChange={(e) => updateBrand(brand.id, 'brand_name', e.target.value)}
                                                                />
                                                            </div>
                                                        </td>
                                                        <td className="py-2 px-2">
                                                            <div className="flex items-center gap-3 bg-slate-50 rounded-lg p-1.5 border border-slate-100">
                                                                <input
                                                                    type="range" min="1" max="4" step="1"
                                                                    className="flex-1 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-purple-600"
                                                                    value={brand.score_points}
                                                                    onChange={(e) => updateBrand(brand.id, 'score_points', e.target.value)}
                                                                />
                                                                <span className={`font-bold w-8 h-8 rounded flex items-center justify-center text-sm shadow-sm ${brand.score_points == 4 ? 'bg-indigo-100 text-indigo-700' :
                                                                    brand.score_points == 3 ? 'bg-blue-100 text-blue-700' :
                                                                        brand.score_points == 2 ? 'bg-amber-100 text-amber-700' : 'bg-white text-slate-500 border'
                                                                    }`}>
                                                                    {brand.score_points}
                                                                </span>
                                                            </div>
                                                        </td>
                                                        <td className="py-2 pr-2 text-right">
                                                            <button onClick={() => deleteBrand(brand.id)} className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition">
                                                                <Trash2 size={18} />
                                                            </button>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}

                        </div>
                    )}
                </div>

                {/* 4. FIXED FOOTER */}
                <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-end gap-3 shrink-0">
                    <button onClick={onClose} className="px-4 py-2 text-slate-600 hover:bg-slate-200 rounded-lg font-medium transition">
                        Cancelar
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="px-6 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg font-bold hover:shadow-lg hover:from-indigo-700 hover:to-purple-700 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {saving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
                        Guardar Configuración
                    </button>
                </div>

            </div>
        </div>
    );
};

export default MortifySettingsModal;
