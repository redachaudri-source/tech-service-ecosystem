import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Check, ChevronsUpDown, Plus, Search } from 'lucide-react';

// Simplified version for Client Portal (tailored to client styles if needed, but keeping consistent)
const SmartBrandSelector = ({ value, onChange, label = "Marca" }) => {
    const [query, setQuery] = useState('');
    const [brands, setBrands] = useState([]);
    const [loading, setLoading] = useState(false);
    const [isOpen, setIsOpen] = useState(false);
    const [selectedBrand, setSelectedBrand] = useState(null);

    useEffect(() => {
        fetchBrands();
    }, []);

    const fetchBrands = async () => {
        const { data } = await supabase.from('brands').select('*').eq('is_active', true).order('name');
        setBrands(data || []);
    };

    const filteredBrands =
        query === ''
            ? brands
            : brands.filter((brand) => brand.name.toLowerCase().includes(query.toLowerCase()));

    const handleSelect = (brand) => {
        setSelectedBrand(brand);
        onChange(brand); // Return Object
        setIsOpen(false);
        setQuery(brand.name);
    };

    const handleCreate = async () => {
        if (!query) return;
        setLoading(true);
        const { data: newId, error } = await supabase.rpc('manage_brand', { brand_name: query });

        if (!error && newId) {
            const { data: all } = await supabase.from('brands').select('*').eq('is_active', true).order('name');
            setBrands(all || []);
            const newlyCreated = all?.find(b => b.id === newId);
            if (newlyCreated) handleSelect(newlyCreated);
        }
        setLoading(false);
    };

    return (
        <div className="relative">
            <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
            <div className="relative">
                <input
                    type="text"
                    className="w-full p-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none pl-10"
                    placeholder="Buscar marca (ej. Samsung)..."
                    value={query}
                    onChange={(e) => {
                        setQuery(e.target.value);
                        setIsOpen(true);
                        if (e.target.value === '') { setSelectedBrand(null); onChange(null); }
                    }}
                    onFocus={() => setIsOpen(true)}
                />
                <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                    <Search className="h-5 w-5 text-slate-400" />
                </div>
            </div>

            {isOpen && (
                <ul className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-xl bg-white py-1 text-base shadow-xl ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm">
                    {filteredBrands.length === 0 && query !== '' && (
                        <li
                            className="cursor-pointer select-none py-3 pl-3 pr-9 text-blue-600 hover:bg-blue-50 font-medium border-t border-slate-100 flex items-center gap-2"
                            onClick={handleCreate}
                        >
                            {loading ? 'Guardando...' : <><Plus size={16} /> Añadir "{query}"</>}
                        </li>
                    )}
                    {filteredBrands.map((brand) => (
                        <li
                            key={brand.id}
                            className={`relative cursor-pointer select-none py-3 pl-3 pr-9 hover:bg-slate-50 border-b border-slate-50 last:border-0 ${selectedBrand?.id === brand.id ? 'bg-blue-50/50 text-blue-900' : 'text-slate-900'
                                }`}
                            onClick={() => handleSelect(brand)}
                        >
                            <span className={`block truncate ${selectedBrand?.id === brand.id ? 'font-bold' : 'font-normal'}`}>
                                {brand.name}
                            </span>
                        </li>
                    ))}
                </ul>
            )}
            {isOpen && <div className="fixed inset-0 z-40 bg-transparent" onClick={() => setIsOpen(false)}></div>}
        </div>
    );
};

export default SmartBrandSelector;
