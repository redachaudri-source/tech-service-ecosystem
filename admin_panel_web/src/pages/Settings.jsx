import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import {
    Save, Upload, Building, Palette, FileText, Briefcase, Plus, Trash2,
    Edit2, X, Check, Clock, ShieldCheck, Tag, AlertCircle, Settings as SettingsIcon
} from 'lucide-react';
import { useToast } from '../components/ToastProvider';
import BrandManager from '../components/BrandManager';

// --- SUB-COMPONENTS ---

const IdentitySection = () => {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [formData, setFormData] = useState({
        company_name: 'Tech Service',
        logo_url: null,
        primary_color: '#2563eb',
        company_address: '',
        company_phone: '',
        company_email: '',
        company_tax_id: '',
        legal_terms: 'Garantía de 3 meses sobre la reparación detallada.',
        tax_rate: 21,
        company_iban: ''
    });

    useEffect(() => {
        fetchSettings();
    }, []);

    const fetchSettings = async () => {
        try {
            const { data } = await supabase.from('company_settings').select('*').limit(1).single();
            if (data) {
                setFormData({
                    company_name: data.company_name || '',
                    logo_url: data.logo_url,
                    primary_color: data.primary_color || '#2563eb',
                    company_address: data.company_address || '',
                    company_phone: data.company_phone || '',
                    company_email: data.company_email || '',
                    company_tax_id: data.company_tax_id || '',
                    legal_terms: data.legal_terms || '',
                    tax_rate: data.tax_rate || 21,
                    company_iban: data.company_iban || ''
                });
            }
        } catch (err) {
            console.error('Error fetching settings:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleLogoUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (file.size > 5 * 1024 * 1024) {
            alert('El archivo es demasiado grande. El límite es de 5MB.');
            return;
        }

        setSaving(true);
        try {
            const fileExt = file.name.split('.').pop();
            const fileName = `logo-${Date.now()}.${fileExt}`;
            const filePath = `${fileName}`;
            const { error: uploadError } = await supabase.storage.from('company-asset').upload(filePath, file);
            if (uploadError) throw uploadError;
            const { data: { publicUrl } } = supabase.storage.from('company-asset').getPublicUrl(filePath);
            setFormData(prev => ({ ...prev, logo_url: publicUrl }));
        } catch (error) {
            alert('Error subiendo logo: ' + error.message);
        } finally {
            setSaving(false);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const { data: existing } = await supabase.from('company_settings').select('id').limit(1).single();
            const payload = { ...formData };
            let error;
            if (existing) {
                const { error: updateError } = await supabase.from('company_settings').update(payload).eq('id', existing.id);
                error = updateError;
            } else {
                const { error: insertError } = await supabase.from('company_settings').insert([payload]);
                error = insertError;
            }
            if (error) throw error;
            alert('Configuración guardada correctamente.');
        } catch (err) {
            alert('Error al guardar: ' + err.message);
        } finally {
            setSaving(false);
        }
    };

    const handlePreviewPDF = () => {
        const w = window.open('', '_blank');
        w.document.write(`
            <html>
            <head>
                <title>Vista Previa Parte de Trabajo</title>
                <style>
                    body { font-family: 'Helvetica', sans-serif; color: #333; padding: 40px; max-width: 800px; mx-auto; }
                    .header { display: flex; justify-content: space-between; border-bottom: 2px solid ${formData.primary_color}; padding-bottom: 20px; margin-bottom: 30px; }
                    .logo { max-height: 80px; max-width: 200px; }
                    .company-info { text-align: right; font-size: 14px; line-height: 1.5; }
                    .title { font-size: 24px; font-weight: bold; color: ${formData.primary_color}; margin-bottom: 5px; }
                    .section { margin-bottom: 30px; }
                    .section-title { font-size: 16px; font-weight: bold; border-bottom: 1px solid #ddd; padding-bottom: 5px; margin-bottom: 10px; text-transform: uppercase; color: #555; }
                    .row { display: flex; justify-content: space-between; margin-bottom: 10px; font-size: 14px; }
                    .label { font-weight: bold; color: #666; width: 150px; }
                    .value { flex: 1; }
                    .total-box { margin-top: 30px; border-top: 2px solid #333; padding-top: 10px; text-align: right; }
                    .total-row { font-size: 16px; margin-bottom: 5px; }
                    .total-final { font-size: 22px; font-weight: bold; color: ${formData.primary_color}; }
                    .footer { margin-top: 50px; font-size: 10px; color: #888; border-top: 1px solid #eee; padding-top: 20px; text-align: justify; }
                </style>
            </head>
            <body>
                <div class="header">
                    <div>
                        ${formData.logo_url ? `<img src="${formData.logo_url}" class="logo"/>` : `<h1 style="margin:0; color:${formData.primary_color}">${formData.company_name}</h1>`}
                    </div>
                    <div class="company-info">
                        <strong>${formData.company_name}</strong><br/>
                        ${formData.company_address}<br/>
                        ${formData.company_tax_id}<br/>
                        Tel: ${formData.company_phone}<br/>
                        Email: ${formData.company_email}
                    </div>
                </div>
                <div class="section">
                    <div class="title">PARTE DE TRABAJO #2024-001</div>
                    <p style="color: #666; font-size: 14px;">Fecha: ${new Date().toLocaleDateString()}</p>
                </div>
                <!-- ... (Simplified Preview for brevity, core data is synced) ... -->
                <div class="footer">
                    <strong>Garantía y Términos Legales:</strong><br/>
                    ${formData.legal_terms}
                </div>
            </body>
            </html>
        `);
        w.document.close();
    };

    if (loading) return <div className="p-10 text-center animate-pulse">Cargando identidad...</div>;

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Header */}
            <div className="flex justify-between items-start">
                <div>
                    <h2 className="text-2xl font-bold text-slate-800">Identidad de la Empresa</h2>
                    <p className="text-slate-500 text-sm">Personaliza cómo te ven tus clientes en documentos y facturas.</p>
                </div>
                <button onClick={handlePreviewPDF} className="flex items-center gap-2 bg-white border border-slate-200 text-slate-700 px-4 py-2 rounded-lg hover:bg-slate-50 transition shadow-sm font-medium text-sm">
                    <FileText size={16} /> Vista Previa PDF
                </button>
            </div>

            {/* Main Form */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 md:p-8 space-y-8">
                {/* Logo Section */}
                <div className="flex flex-col md:flex-row gap-8 pb-8 border-b border-slate-100">
                    <div className="w-full md:w-1/3">
                        <label className="block text-sm font-bold text-slate-700 mb-2">Logotipo Corporativo</label>
                        <div className="aspect-square bg-slate-50 border-2 border-dashed border-slate-300 rounded-xl flex flex-col items-center justify-center relative overflow-hidden group hover:border-blue-400 transition-colors">
                            {formData.logo_url ? (
                                <img src={formData.logo_url} alt="Logo" className="w-full h-full object-contain p-4" />
                            ) : (
                                <div className="text-center p-4">
                                    <Upload className="mx-auto text-slate-300 mb-2" size={32} />
                                    <span className="text-slate-400 text-xs">Subir imagen (PNG, JPG)</span>
                                </div>
                            )}
                            <label className="absolute inset-0 bg-slate-900/60 text-white flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-all cursor-pointer backdrop-blur-[1px]">
                                <Upload size={24} className="mb-1" />
                                <span className="text-xs font-bold">Cambiar Logo</span>
                                <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
                            </label>
                        </div>
                    </div>

                    <div className="w-full md:w-2/3 grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="md:col-span-2">
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Nombre Comercial</label>
                            <input name="company_name" type="text" className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition" value={formData.company_name} onChange={handleChange} />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">CIF / NIF</label>
                            <input name="company_tax_id" type="text" className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition" value={formData.company_tax_id} onChange={handleChange} />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">IVA Defect (%)</label>
                            <input name="tax_rate" type="number" className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition" value={formData.tax_rate} onChange={handleChange} />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Email</label>
                            <input name="company_email" type="email" className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition" value={formData.company_email} onChange={handleChange} />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Teléfono</label>
                            <input name="company_phone" type="text" className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition" value={formData.company_phone} onChange={handleChange} />
                        </div>
                        <div className="md:col-span-2">
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Dirección Completa</label>
                            <input name="company_address" type="text" className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition" value={formData.company_address} onChange={handleChange} />
                        </div>
                        <div className="md:col-span-2">
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">IBAN (Facturación)</label>
                            <input name="company_iban" type="text" className="w-full px-4 py-2 border border-slate-200 rounded-lg font-mono text-slate-600 bg-slate-50 focus:bg-white transition" value={formData.company_iban} onChange={handleChange} placeholder="ES00 0000 0000 0000" />
                        </div>
                    </div>
                </div>

                {/* Legal Terms */}
                <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Términos Legales (Pie de Factura)</label>
                    <textarea name="legal_terms" rows={4} className="w-full px-4 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none transition" value={formData.legal_terms} onChange={handleChange} />
                </div>
            </div>

            {/* Brand Manager */}
            <div className="pt-4 border-t border-slate-200">
                <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2"><Briefcase size={18} /> Gestión de Marcas</h3>
                <BrandManager />
            </div>

            {/* Sticky Action Footer */}
            <div className="sticky bottom-4 flex justify-end">
                <button onClick={handleSave} disabled={saving} className="bg-slate-900 text-white px-8 py-3 rounded-full font-bold shadow-xl hover:bg-slate-800 transition transform hover:-translate-y-1 active:translate-y-0 flex items-center gap-2 disabled:opacity-50">
                    <Save size={18} />
                    {saving ? 'Guardando...' : 'Guardar Cambios'}
                </button>
            </div>
        </div>
    );
};

const BusinessRulesSection = () => {
    const { addToast } = useToast();
    const [workingHours, setWorkingHours] = useState({});
    const [serviceTypes, setServiceTypes] = useState([]);
    const [weekdays] = useState(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']);
    const [catalog, setCatalog] = useState([]); // Service Catalog (Prices) from old Settings.jsx
    const [newItem, setNewItem] = useState({ name: '', base_price: '' });

    useEffect(() => {
        fetchBusinessData();
    }, []);

    const fetchBusinessData = async () => {
        // 1. Hours
        const { data: configData } = await supabase.from('business_config').select('value').eq('key', 'working_hours').single();
        if (configData) setWorkingHours(configData.value);
        // 2. Service Types (Durations)
        const { data: typesData } = await supabase.from('service_types').select('*').order('estimated_duration_min');
        setServiceTypes(typesData || []);
        // 3. Catalog (Prices)
        const { data: catalogData } = await supabase.from('service_catalog').select('*').order('name');
        setCatalog(catalogData || []);
    };

    // --- Hours Logic ---
    const handleSaveHours = async () => {
        const { error } = await supabase.from('business_config').update({ value: workingHours }).eq('key', 'working_hours');
        if (error) addToast('Error guardando horario', 'error');
        else addToast('Horario actualizado', 'success');
    };
    const toggleDay = (day) => {
        setWorkingHours(prev => ({ ...prev, [day]: prev[day] ? null : { start: '09:00', end: '19:00' } }));
    };
    const handleHourChange = (day, field, value) => {
        setWorkingHours(prev => ({ ...prev, [day]: { ...prev[day], [field]: value } }));
    };

    // --- Service Types (Duration) Logic ---
    const handleUpdateType = async (id, field, value) => {
        const { error } = await supabase.from('service_types').update({ [field]: value }).eq('id', id);
        if (!error) setServiceTypes(prev => prev.map(t => t.id === id ? { ...t, [field]: value } : t));
    };
    const handleAddType = async () => {
        const name = prompt("Nombre Tipo:");
        if (!name) return;
        const { data } = await supabase.from('service_types').insert({ name, estimated_duration_min: 60 }).select().single();
        if (data) setServiceTypes([...serviceTypes, data]);
    };

    // --- Catalog (Price) Logic ---
    const handleAddCatalogItem = async () => {
        if (!newItem.name || !newItem.base_price) return;
        const { error } = await supabase.from('service_catalog').insert([{ name: newItem.name, base_price: parseFloat(newItem.base_price), active: true }]);
        if (!error) {
            setNewItem({ name: '', base_price: '' });
            fetchBusinessData(); // Refresh
        }
    };
    const handleDeleteCatalogItem = async (id) => {
        if (confirm('¿Eliminar?')) {
            await supabase.from('service_catalog').delete().eq('id', id);
            fetchBusinessData();
        }
    };
    const handleUpdateCatalogItem = async (id, field, value) => {
        setCatalog(catalog.map(c => c.id === id ? { ...c, [field]: value } : c)); // Op
        await supabase.from('service_catalog').update({ [field]: value }).eq('id', id);
    };

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div>
                <h2 className="text-2xl font-bold text-slate-800">Reglas de Negocio</h2>
                <p className="text-slate-500 text-sm">Gestiona horarios, tarifas y tiempos de servicio.</p>
            </div>

            {/* 1. Working Hours */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                    <h3 className="font-bold text-slate-700 flex items-center gap-2"><Clock size={18} /> Horario Operativo</h3>
                    <button onClick={handleSaveHours} className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded font-bold hover:bg-blue-700">Guardar</button>
                </div>
                <div className="p-4 grid gap-3">
                    {weekdays.map(day => {
                        const isOpen = !!workingHours[day];
                        const labels = { monday: 'Lunes', tuesday: 'Martes', wednesday: 'Miércoles', thursday: 'Jueves', friday: 'Viernes', saturday: 'Sábado', sunday: 'Domingo' };
                        return (
                            <div key={day} className="flex items-center justify-between p-3 rounded border border-slate-100 bg-slate-50/50">
                                <div className="flex items-center gap-3">
                                    <input type="checkbox" checked={isOpen} onChange={() => toggleDay(day)} className="rounded text-blue-600 focus:ring-blue-500" />
                                    <span className="w-24 font-medium text-sm text-slate-700">{labels[day]}</span>
                                </div>
                                {isOpen ? (
                                    <div className="flex items-center gap-2">
                                        <input type="time" value={workingHours[day].start} onChange={e => handleHourChange(day, 'start', e.target.value)} className="text-xs border rounded p-1" />
                                        <span className="text-slate-400">-</span>
                                        <input type="time" value={workingHours[day].end} onChange={e => handleHourChange(day, 'end', e.target.value)} className="text-xs border rounded p-1" />
                                    </div>
                                ) : <span className="text-xs text-slate-400 italic">Cerrado</span>}
                            </div>
                        )
                    })}
                </div>
            </div>

            {/* 2. Service Prices (Catalog) */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="p-4 border-b border-slate-100 bg-slate-50">
                    <h3 className="font-bold text-slate-700 flex items-center gap-2"><Briefcase size={18} /> Tarifas Base & Materiales</h3>
                </div>
                <div className="p-4">
                    <div className="flex gap-2 mb-4">
                        <input type="text" placeholder="Concepto (ej. Desplazamiento)" className="flex-1 text-sm border rounded px-3 py-2" value={newItem.name} onChange={e => setNewItem({ ...newItem, name: e.target.value })} />
                        <input type="number" placeholder="€" className="w-24 text-sm border rounded px-3 py-2" value={newItem.base_price} onChange={e => setNewItem({ ...newItem, base_price: e.target.value })} />
                        <button onClick={handleAddCatalogItem} className="bg-slate-800 text-white p-2 rounded hover:bg-slate-700"><Plus size={18} /></button>
                    </div>
                    <div className="divide-y divide-slate-100">
                        {catalog.map(item => (
                            <div key={item.id} className="py-2 flex items-center gap-4 text-sm">
                                <input type="text" value={item.name} onChange={e => handleUpdateCatalogItem(item.id, 'name', e.target.value)} className="flex-1 bg-transparent border-none p-0 font-medium text-slate-700" />
                                <div className="w-24 text-right font-mono">{item.base_price} €</div>
                                <button onClick={() => handleDeleteCatalogItem(item.id)} className="text-slate-300 hover:text-red-500"><Trash2 size={14} /></button>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* 3. Service Types (Config) */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                    <h3 className="font-bold text-slate-700 flex items-center gap-2"><SettingsIcon size={18} /> Duraciones por Defecto</h3>
                    <button onClick={handleAddType} className="text-xs bg-slate-200 text-slate-700 px-2 py-1 rounded hover:bg-slate-300"><Plus size={14} /></button>
                </div>
                <div className="p-4 space-y-2">
                    {serviceTypes.map(t => (
                        <div key={t.id} className="flex justify-between items-center text-sm p-2 hover:bg-slate-50 rounded">
                            <span className="font-medium text-slate-700">{t.name}</span>
                            <div className="flex items-center gap-2">
                                <input type="number" value={t.estimated_duration_min} onChange={e => handleUpdateType(t.id, 'estimated_duration_min', e.target.value)} className="w-16 text-right border rounded p-1" />
                                <span className="text-slate-500 text-xs">min</span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

const ApplianceCatalogSection = () => {
    const [types, setTypes] = useState([]);
    const [newType, setNewType] = useState('');

    useEffect(() => { fetchTypes(); }, []);

    const fetchTypes = async () => {
        const { data } = await supabase.from('appliance_types').select('*').order('name');
        setTypes(data || []);
    };

    const handleAdd = async (e) => {
        e.preventDefault();
        if (!newType.trim()) return;
        const { error } = await supabase.from('appliance_types').insert({ name: newType.trim() });
        if (!error) { setNewType(''); fetchTypes(); }
    };

    const handleDelete = async (id) => {
        if (confirm('¿Eliminar?')) {
            await supabase.from('appliance_types').delete().eq('id', id);
            fetchTypes();
        }
    };

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div>
                <h2 className="text-2xl font-bold text-slate-800">Catálogo de Electrodomésticos</h2>
                <p className="text-slate-500 text-sm">Define los tipos de aparatos que reparas para los formularios.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 h-fit">
                    <h3 className="font-bold text-lg mb-4 text-slate-700">Añadir Nuevo Tipo</h3>
                    <form onSubmit={handleAdd} className="flex gap-2">
                        <input type="text" value={newType} onChange={e => setNewType(e.target.value)} className="flex-1 p-2 border border-slate-200 rounded-lg" placeholder="Ej. Horno Industrial" />
                        <button type="submit" disabled={!newType.trim()} className="bg-blue-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-blue-700 disabled:opacity-50"><Plus size={20} /></button>
                    </form>
                    <div className="mt-4 p-4 bg-blue-50 text-blue-800 rounded-lg text-xs flex gap-2">
                        <AlertCircle size={16} className="shrink-0" />
                        <p>Esto actualizará las opciones disponibles en la App del Técnico y Web de Clientes.</p>
                    </div>
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="p-4 border-b border-slate-200 bg-slate-50 font-bold text-slate-700">Listado ({types.length})</div>
                    <div className="divide-y divide-slate-100 max-h-[500px] overflow-y-auto">
                        {types.map(type => (
                            <div key={type.id} className="p-3 flex justify-between items-center hover:bg-slate-50">
                                <span className="font-medium text-slate-700">{type.name}</span>
                                <button onClick={() => handleDelete(type.id)} className="text-slate-300 hover:text-red-500"><Trash2 size={16} /></button>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

// --- MAIN SETTINGS PAGE ---

const Settings = () => {
    const [activeTab, setActiveTab] = useState('identity');

    const menuItems = [
        { id: 'identity', label: 'Identidad de Empresa', icon: Building, desc: 'Logo, Datos Fiscales, Documentos' },
        { id: 'business', label: 'Reglas de Negocio', icon: Briefcase, desc: 'Horarios, Tarifas, Tiempos' },
        { id: 'appliances', label: 'Catálogo Electro.', icon: Tag, desc: 'Tipos de Aparatos' },
    ];

    return (
        <div className="flex flex-col md:flex-row min-h-[calc(100vh-80px)] bg-slate-50/50 -m-6 md:-m-8">
            {/* Left Sidebar Navigation */}
            <div className="w-full md:w-72 bg-white border-r border-slate-200 shrink-0 md:min-h-screen">
                <div className="p-6 border-b border-slate-100">
                    <h1 className="text-xl font-black text-slate-800 flex items-center gap-2">
                        <SettingsIcon className="text-slate-900" />
                        Configuración
                    </h1>
                    <p className="text-xs text-slate-400 mt-1 font-medium">SYSTEM PREFERENCES v2.0</p>
                </div>
                <nav className="p-4 space-y-1">
                    {menuItems.map(item => {
                        const Icon = item.icon;
                        const isActive = activeTab === item.id;
                        return (
                            <button
                                key={item.id}
                                onClick={() => setActiveTab(item.id)}
                                className={`w-full text-left px-4 py-3 rounded-lg border transition-all duration-200 group relative overflow-hidden
                                    ${isActive
                                        ? 'bg-blue-50 border-blue-100 shadow-sm'
                                        : 'bg-transparent border-transparent hover:bg-slate-50 hover:border-slate-100'
                                    }`}
                            >
                                <div className="flex items-start gap-3 relative z-10">
                                    <div className={`mt-0.5 p-1.5 rounded-md ${isActive ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-400 group-hover:text-slate-600'}`}>
                                        <Icon size={16} />
                                    </div>
                                    <div>
                                        <span className={`block text-sm font-bold ${isActive ? 'text-blue-900' : 'text-slate-600 group-hover:text-slate-900'}`}>{item.label}</span>
                                        <span className={`block text-[10px] mt-0.5 ${isActive ? 'text-blue-400' : 'text-slate-400'}`}>{item.desc}</span>
                                    </div>
                                </div>
                                {isActive && <div className="absolute right-0 top-0 bottom-0 w-1 bg-blue-600 rounded-l"></div>}
                            </button>
                        );
                    })}
                </nav>
            </div>

            {/* Right Content Area */}
            <div className="flex-1 p-6 md:p-10 overflow-y-auto">
                <div className="max-w-4xl mx-auto">
                    {activeTab === 'identity' && <IdentitySection />}
                    {activeTab === 'business' && <BusinessRulesSection />}
                    {activeTab === 'appliances' && <ApplianceCatalogSection />}
                </div>
            </div>
        </div>
    );
};

export default Settings;
