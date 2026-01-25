import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { Search, User, MapPin, Phone, X, ChevronDown } from 'lucide-react';

/**
 * ClientSearchInput - Autocomplete search for clients
 * 
 * Features:
 * - Real-time search as you type (debounced)
 * - Search by name, phone, or address
 * - Max 7 results shown
 * - Highlight matching text
 * - Keyboard navigation (arrows + Enter)
 * - Click to select
 */
const ClientSearchInput = ({
    value,
    onChange,
    onSelect,
    disabled = false,
    placeholder = "Buscar cliente por nombre, teléfono o dirección..."
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState(-1);
    const [selectedClient, setSelectedClient] = useState(null);

    const inputRef = useRef(null);
    const dropdownRef = useRef(null);
    const debounceRef = useRef(null);

    // Load selected client info when value changes externally
    useEffect(() => {
        if (value && !selectedClient) {
            loadClientById(value);
        }
        if (!value) {
            setSelectedClient(null);
            setSearchQuery('');
        }
    }, [value]);

    const loadClientById = async (id) => {
        const { data } = await supabase
            .from('profiles')
            .select('id, full_name, phone, address, city')
            .eq('id', id)
            .single();

        if (data) {
            setSelectedClient(data);
        }
    };

    // Debounced search
    useEffect(() => {
        if (debounceRef.current) {
            clearTimeout(debounceRef.current);
        }

        if (searchQuery.length < 2) {
            setResults([]);
            return;
        }

        debounceRef.current = setTimeout(async () => {
            setLoading(true);
            try {
                // Search by name, phone, or address
                const query = searchQuery.toLowerCase();
                const { data, error } = await supabase
                    .from('profiles')
                    .select('id, full_name, phone, address, city')
                    .eq('role', 'client')
                    .or(`full_name.ilike.%${query}%,phone.ilike.%${query}%,address.ilike.%${query}%`)
                    .limit(7);

                if (!error && data) {
                    setResults(data);
                }
            } catch (e) {
                console.error('Search error:', e);
            } finally {
                setLoading(false);
            }
        }, 300);

        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
        };
    }, [searchQuery]);

    // Close dropdown on outside click
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Highlight matching text
    const highlightMatch = (text, query) => {
        if (!text || !query || query.length < 2) return text;

        const regex = new RegExp(`(${query})`, 'gi');
        const parts = text.split(regex);

        return parts.map((part, i) =>
            regex.test(part) ? (
                <mark key={i} className="bg-yellow-200 text-yellow-900 rounded px-0.5">{part}</mark>
            ) : part
        );
    };

    // Handle keyboard navigation
    const handleKeyDown = (e) => {
        if (!isOpen || results.length === 0) return;

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                setSelectedIndex(prev => Math.min(prev + 1, results.length - 1));
                break;
            case 'ArrowUp':
                e.preventDefault();
                setSelectedIndex(prev => Math.max(prev - 1, 0));
                break;
            case 'Enter':
                e.preventDefault();
                if (selectedIndex >= 0 && results[selectedIndex]) {
                    handleSelectClient(results[selectedIndex]);
                }
                break;
            case 'Escape':
                setIsOpen(false);
                break;
        }
    };

    const handleSelectClient = (client) => {
        setSelectedClient(client);
        setSearchQuery('');
        setIsOpen(false);
        setResults([]);
        onChange(client.id);
        if (onSelect) onSelect(client);
    };

    const handleClear = () => {
        setSelectedClient(null);
        setSearchQuery('');
        onChange('');
        setIsOpen(false);
        inputRef.current?.focus();
    };

    // If a client is selected, show the selected state
    if (selectedClient) {
        return (
            <div className={`relative flex items-center gap-3 p-3 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}>
                <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white font-bold text-lg">
                    {selectedClient.full_name?.[0]?.toUpperCase() || 'C'}
                </div>
                <div className="flex-1 min-w-0">
                    <div className="font-bold text-slate-800 truncate">{selectedClient.full_name}</div>
                    <div className="text-xs text-slate-500 flex items-center gap-3 truncate">
                        {selectedClient.phone && (
                            <span className="flex items-center gap-1">
                                <Phone size={10} /> {selectedClient.phone}
                            </span>
                        )}
                        {selectedClient.address && (
                            <span className="flex items-center gap-1 truncate">
                                <MapPin size={10} /> {selectedClient.address}
                            </span>
                        )}
                    </div>
                </div>
                {!disabled && (
                    <button
                        type="button"
                        onClick={handleClear}
                        className="p-2 hover:bg-blue-100 rounded-lg text-slate-400 hover:text-red-500 transition-colors"
                        title="Cambiar cliente"
                    >
                        <X size={18} />
                    </button>
                )}
            </div>
        );
    }

    // Search mode
    return (
        <div ref={dropdownRef} className="relative">
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                    ref={inputRef}
                    type="text"
                    value={searchQuery}
                    onChange={(e) => {
                        setSearchQuery(e.target.value);
                        setIsOpen(true);
                        setSelectedIndex(-1);
                    }}
                    onFocus={() => setIsOpen(true)}
                    onKeyDown={handleKeyDown}
                    disabled={disabled}
                    placeholder={placeholder}
                    className="w-full pl-10 pr-10 py-3 bg-white border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all placeholder:text-slate-400"
                />
                {loading && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                    </div>
                )}
                {!loading && searchQuery && (
                    <button
                        type="button"
                        onClick={() => {
                            setSearchQuery('');
                            setResults([]);
                        }}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                        <X size={16} />
                    </button>
                )}
            </div>

            {/* Dropdown Results */}
            {isOpen && results.length > 0 && (
                <div className="absolute z-50 w-full mt-2 bg-white border border-slate-200 rounded-xl shadow-xl shadow-slate-200/50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="p-2 border-b border-slate-100 bg-slate-50">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                            {results.length} cliente{results.length !== 1 ? 's' : ''} encontrado{results.length !== 1 ? 's' : ''}
                        </span>
                    </div>
                    <div className="max-h-[280px] overflow-y-auto">
                        {results.map((client, index) => (
                            <button
                                key={client.id}
                                type="button"
                                onClick={() => handleSelectClient(client)}
                                onMouseEnter={() => setSelectedIndex(index)}
                                className={`w-full flex items-center gap-3 p-3 text-left transition-colors ${selectedIndex === index
                                        ? 'bg-blue-50 border-l-4 border-blue-500'
                                        : 'hover:bg-slate-50 border-l-4 border-transparent'
                                    }`}
                            >
                                <div className="w-9 h-9 bg-slate-200 rounded-lg flex items-center justify-center text-slate-600 font-bold text-sm flex-shrink-0">
                                    {client.full_name?.[0]?.toUpperCase() || 'C'}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="font-semibold text-slate-800 text-sm truncate">
                                        {highlightMatch(client.full_name, searchQuery)}
                                    </div>
                                    <div className="text-xs text-slate-500 flex items-center gap-2 mt-0.5">
                                        {client.phone && (
                                            <span className="flex items-center gap-1">
                                                <Phone size={10} />
                                                {highlightMatch(client.phone, searchQuery)}
                                            </span>
                                        )}
                                    </div>
                                    {client.address && (
                                        <div className="text-[11px] text-slate-400 truncate mt-0.5 flex items-center gap-1">
                                            <MapPin size={10} className="flex-shrink-0" />
                                            {highlightMatch(`${client.address}${client.city ? `, ${client.city}` : ''}`, searchQuery)}
                                        </div>
                                    )}
                                </div>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* No results message */}
            {isOpen && searchQuery.length >= 2 && results.length === 0 && !loading && (
                <div className="absolute z-50 w-full mt-2 bg-white border border-slate-200 rounded-xl shadow-lg p-4 text-center">
                    <User size={24} className="mx-auto text-slate-300 mb-2" />
                    <p className="text-sm text-slate-500">No se encontraron clientes</p>
                    <p className="text-xs text-slate-400 mt-1">Prueba con otro término de búsqueda</p>
                </div>
            )}
        </div>
    );
};

export default ClientSearchInput;
