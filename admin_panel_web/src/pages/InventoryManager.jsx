import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { AlertCircle, PackagePlus } from 'lucide-react';

const InventoryManager = () => {
    const [inventory, setInventory] = useState([]);

    useEffect(() => {
        fetchInventory();
    }, []);

    const fetchInventory = async () => {
        const { data } = await supabase.from('inventory').select('*').order('name');
        if (data) setInventory(data);
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold text-slate-800">Inventario</h1>
                <button className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors">
                    <PackagePlus size={20} />
                    Nuevo Repuesto
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {inventory.map(item => (
                    <div key={item.id} className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex flex-col justify-between relative overflow-hidden">
                        {item.stock_quantity < 5 && (
                            <div className="absolute top-0 right-0 bg-red-500 text-white text-xs font-bold px-3 py-1 rounded-bl-lg flex items-center gap-1">
                                <AlertCircle size={12} />
                                LOW STOCK
                            </div>
                        )}
                        <div>
                            <h3 className="text-lg font-bold text-slate-800">{item.name}</h3>
                            <p className="text-sm text-slate-500 mb-4">{item.sku}</p>

                            <div className="flex justify-between items-center p-3 bg-slate-50 rounded-lg">
                                <div className="text-center">
                                    <span className="block text-xs text-slate-400">STOCK</span>
                                    <span className={`text-xl font-bold ${item.stock_quantity < 5 ? 'text-red-500' : 'text-slate-800'}`}>
                                        {item.stock_quantity}
                                    </span>
                                </div>
                                <div className="text-center">
                                    <span className="block text-xs text-slate-400">PRECIO</span>
                                    <span className="text-xl font-bold text-slate-800">${item.sale_price}</span>
                                </div>
                            </div>
                        </div>

                        <div className="mt-4 pt-4 border-t border-slate-100 flex gap-2">
                            <button className="flex-1 text-sm font-medium text-blue-600 hover:bg-blue-50 py-2 rounded-lg transition-colors">
                                Editar
                            </button>
                            <button className="flex-1 text-sm font-medium text-slate-600 hover:bg-slate-100 py-2 rounded-lg transition-colors">
                                Historial
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default InventoryManager;
