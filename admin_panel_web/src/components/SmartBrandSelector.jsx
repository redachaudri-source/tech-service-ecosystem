import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Check, ChevronsUpDown, Plus } from 'lucide-react';
import { Combobox } from '@headlessui/react'; // Ensure headlessui is installed, or build custom
// Wait, I need to check if @headlessui/react is in package.json.
// If not I will build a custom one to avoid install delays if not necessary.
// Let's build a robust custom one to be safe and independent.

const SmartBrandSelector = ({ value, onChange, label = "Marca del Aparato" }) => {
    const [query, setQuery] = useState('');
    const [brands, setBrands] = useState([]);
    const [loading, setLoading] = useState(false);
    const [isOpen, setIsOpen] = useState(false);
    const [selectedBrand, setSelectedBrand] = useState(null);

    // Initial Fetch or Sync
    useEffect(() => {
        if (value && !selectedBrand) {
            // If value is ID, fetch name? Or value is name?
            // The prop 'value' should be the Brand ID ideally, or Name if legacy.
            // Let's assume we want to pass back the ID, but for display we need the name.
            // For now, let's fetch all active brands.
        }
        fetchBrands();
    }, []);

    const fetchBrands = async () => {
        const { data } = await supabase.from('brands').select('*').eq('is_active', true).order('name');
        setBrands(data || []);
    };

    // Filtered Brands
    const filteredBrands =
        query === ''
            ? brands
            : brands.filter((brand) => {
                return brand.name.toLowerCase().includes(query.toLowerCase());
            });

    const handleSelect = (brand) => {
        setSelectedBrand(brand);
        onChange(brand); // Return FULL Object {id, name}
        setIsOpen(false);
        setQuery(brand.name);
    };

    const handleCreate = async () => {
        if (!query) return;
        setLoading(true);
        // Use the RPC to clean/create/return ID
        const { data: newId, error } = await supabase.rpc('manage_brand', { brand_name: query });

        if (!error && newId) {
            // Refresh list
            const { data: all } = await supabase.from('brands').select('*').eq('is_active', true).order('name');
            setBrands(all || []);

            const newlyCreated = all?.find(b => b.id === newId);
            if (newlyCreated) {
                handleSelect(newlyCreated);
            }
        }
        setLoading(false);
    };

    return (
        <div className="relative">
            <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
            <div className="relative">
                <input
                    type="text"
                    className="w-full rounded-lg border-slate-300 border py-2 pl-3 pr-10 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 sm:text-sm"
                    placeholder="Miele, Bosch, LG..."
                    value={query} // Control component
                    onChange={(e) => {
                        setQuery(e.target.value);
                        setIsOpen(true);
                        // If user clears, reset
                        if (e.target.value === '') {
                            setSelectedBrand(null);
                            onChange(null);
                        }
                    }}
                    onFocus={() => setIsOpen(true)}
                // onBlur={() => setTimeout(() => setIsOpen(false), 200)} // Delay for click
                />
                <div className="absolute inset-y-0 right-0 flex items-center pr-2">
                    <ChevronsUpDown className="h-4 w-4 text-slate-400" aria-hidden="true" />
                </div>
            </div>

            {/* Dropdown */}
            {isOpen && (
                <ul className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-md bg-white py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm">

                    {filteredBrands.length === 0 && query !== '' && (
                        <li
                            className="cursor-pointer select-none py-2 pl-3 pr-9 text-blue-600 hover:bg-blue-50 font-medium border-t border-slate-100"
                            onClick={handleCreate}
                        >
                            {loading ? 'Creando...' : (
                                <span className="flex items-center gap-2">
                                    <Plus size={14} />
                                    Añadir marca "{query}"
                                </span>
                            )}
                        </li>
                    )}

                    {filteredBrands.map((brand) => (
                        <li
                            key={brand.id}
                            className={`relative cursor-default select-none py-2 pl-3 pr-9 hover:bg-slate-100 ${selectedBrand?.id === brand.id ? 'bg-blue-50 text-blue-900' : 'text-slate-900'
                                }`}
                            onClick={() => handleSelect(brand)}
                        >
                            <span className={`block truncate ${selectedBrand?.id === brand.id ? 'font-semibold' : 'font-normal'}`}>
                                {brand.name}
                            </span>
                            {selectedBrand?.id === brand.id && (
                                <span className="absolute inset-y-0 right-0 flex items-center pr-4 text-blue-600">
                                    <Check className="h-5 w-5" aria-hidden="true" />
                                </span>
                            )}
                        </li>
                    ))}
                </ul>
            )}

            {/* Easy Close overlay (transparent) */}
            {isOpen && (
                <div className="fixed inset-0 z-40 bg-transparent" onClick={() => setIsOpen(false)}></div>
            )}
        </div>
    );
};

export default SmartBrandSelector;
