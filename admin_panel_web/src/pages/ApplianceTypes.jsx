import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Plus, Trash2, Tag, AlertCircle } from 'lucide-react';

const ApplianceTypes = () => {
    const [types, setTypes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [newType, setNewType] = useState('');
    const [adding, setAdding] = useState(false);

    useEffect(() => {
        fetchTypes();
    }, []);

    const fetchTypes = async () => {
        try {
            const { data, error } = await supabase
                .from('appliance_types')
                .select('*')
                .order('name');

            if (error) throw error;
            setTypes(data || []);
        } catch (error) {
            console.error('Error fetching types:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleAdd = async (e) => {
        e.preventDefault();
        if (!newType.trim()) return;

        setAdding(true);
        try {
            const { error } = await supabase
                .from('appliance_types')
                .insert({ name: newType.trim() });

            if (error) throw error;

            setNewType('');
            fetchTypes();
        } catch (error) {
            console.error(error);
            alert('Error al añadir tipo (quizás ya existe).');
        } finally {
            setAdding(false);
        }
    };

    const handleDelete = async (id) => {
        if (!confirm('¿Seguro que quieres eliminar este tipo? Desaparecerá de las listas de selección, pero los tickets antiguos conservarán el texto.')) return;

        try {
            const { error } = await supabase
                .from('appliance_types')
                .delete()
                .eq('id', id);

            if (error) throw error;
            fetchTypes();
        } catch (error) {
            console.error(error);
            alert('Error al eliminar.');
        }
    };

    return (
        <div className="p-6">
            <h1 className="text-2xl font-bold text-slate-800 mb-6 flex items-center gap-2">
                <Tag /> Gestión de Tipos de Electrodomésticos
            </h1>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Form */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 h-fit">
                    <h2 className="font-bold text-lg mb-4">Añadir Nuevo Tipo</h2>
                    <form onSubmit={handleAdd} className="flex gap-2">
                        <input
                            type="text"
                            value={newType}
                            onChange={(e) => setNewType(e.target.value)}
                            placeholder="Ej. Robot Aspirador..."
                            className="flex-1 p-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <button
                            type="submit"
                            disabled={adding || !newType.trim()}
                            className="bg-blue-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-blue-700 transition disabled:opacity-50 flex items-center gap-2"
                        >
                            <Plus size={20} /> Añadir
                        </button>
                    </form>
                    <div className="mt-4 p-4 bg-blue-50 text-blue-800 rounded-lg text-sm flex gap-2 items-start">
                        <AlertCircle size={16} className="mt-0.5 shrink-0" />
                        <p>Los tipos que añadas aquí aparecerán automáticamente en el formulario de solicitud de servicio del cliente y en el registro de inventario.</p>
                    </div>
                </div>

                {/* List */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="p-4 border-b border-slate-200 bg-slate-50 font-bold text-slate-700">
                        Listado Actual ({types.length})
                    </div>
                    {loading ? (
                        <div className="p-8 text-center text-slate-400">Cargando...</div>
                    ) : (
                        <div className="divide-y divide-slate-100 max-h-[500px] overflow-y-auto">
                            {types.map(type => (
                                <div key={type.id} className="p-3 flex justify-between items-center hover:bg-slate-50 transition">
                                    <span className="font-medium text-slate-700">{type.name}</span>
                                    <button
                                        onClick={() => handleDelete(type.id)}
                                        className="p-2 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition"
                                        title="Eliminar"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            ))}
                            {types.length === 0 && (
                                <div className="p-8 text-center text-slate-400 italic">No hay tipos definidos.</div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ApplianceTypes;
