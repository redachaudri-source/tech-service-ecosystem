import { useState, useEffect } from 'react';
import { LayoutGrid, Monitor, User, Map, ChevronRight } from 'lucide-react';
import { supabase } from '../../lib/supabase';

const ConceptNavigator = ({ activeConcept, setActiveConcept, subSelection, setSubSelection }) => {

    // Dynamic Sub-menus
    const [applianceTypes, setApplianceTypes] = useState([]);
    const [techs, setTechs] = useState([]);

    useEffect(() => {
        fetchMetadata();
    }, []);

    const fetchMetadata = async () => {
        const { data: t } = await supabase.from('profiles').select('id, full_name').eq('role', 'technician');
        const { data: a } = await supabase.from('appliance_types').select('name');
        if (t) setTechs(t);
        if (a) setApplianceTypes(a);
    };

    const concepts = [
        { id: 'overview', label: 'Visión Global', icon: LayoutGrid },
        { id: 'appliance', label: 'Electrodoméstico', icon: Monitor },
        { id: 'tech', label: 'Técnico', icon: User },
        // { id: 'geo', label: 'Geográfico', icon: Map },
    ];

    return (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-2 sticky top-24">
            <nav className="space-y-1">
                {concepts.map((concept) => (
                    <div key={concept.id}>
                        <button
                            onClick={() => {
                                setActiveConcept(concept.id);
                                setSubSelection(null); // Reset sub-selection on main switch
                            }}
                            className={`w-full flex items-center justify-between px-3 py-3 text-sm font-medium rounded-xl transition-all
                                ${activeConcept === concept.id
                                    ? 'bg-slate-900 text-white shadow-md'
                                    : 'text-slate-600 hover:bg-slate-50'
                                }`}
                        >
                            <div className="flex items-center gap-3">
                                <concept.icon size={18} />
                                {concept.label}
                            </div>
                            {activeConcept === concept.id && <ChevronRight size={14} />}
                        </button>

                        {/* SUB-MENU (Animated Expansion) */}
                        {activeConcept === concept.id && concept.id === 'appliance' && (
                            <div className="mt-1 ml-4 border-l-2 border-slate-100 pl-2 space-y-1 animate-in slide-in-from-left-2 duration-300">
                                {applianceTypes.map(type => (
                                    <button
                                        key={type.name}
                                        onClick={() => setSubSelection(type.name)}
                                        className={`w-full text-left px-3 py-2 text-xs rounded-lg transition-colors truncate
                                            ${subSelection === type.name
                                                ? 'bg-blue-50 text-blue-600 font-bold'
                                                : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
                                            }`}
                                    >
                                        {type.name}
                                    </button>
                                ))}
                            </div>
                        )}

                        {activeConcept === concept.id && concept.id === 'tech' && (
                            <div className="mt-1 ml-4 border-l-2 border-slate-100 pl-2 space-y-1 animate-in slide-in-from-left-2 duration-300">
                                {techs.map(t => (
                                    <button
                                        key={t.id}
                                        onClick={() => setSubSelection(t.id)}
                                        className={`w-full text-left px-3 py-2 text-xs rounded-lg transition-colors truncate
                                            ${subSelection === t.id
                                                ? 'bg-purple-50 text-purple-600 font-bold'
                                                : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
                                            }`}
                                    >
                                        {t.full_name}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                ))}
            </nav>
        </div>
    );
};

export default ConceptNavigator;
