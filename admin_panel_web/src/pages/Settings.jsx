import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Save, Upload, Building, Palette, FileText, Briefcase, Plus, Trash2, Edit2, X, Check } from 'lucide-react';

const Settings = () => {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    // Settings State
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
        fetchCatalog();
    }, []);

    // --- CATALOG LOGIC ---
    const [catalog, setCatalog] = useState([]);
    const [newItem, setNewItem] = useState({ name: '', base_price: '' });
    const [editingItem, setEditingItem] = useState(null);

    const fetchCatalog = async () => {
        const { data } = await supabase.from('service_catalog').select('*').order('name');
        if (data) setCatalog(data);
    };

    const handleAddItem = async () => {
        if (!newItem.name || !newItem.base_price) return alert('Nombre y Precio requeridos');

        try {
            const { error } = await supabase.from('service_catalog').insert([{
                name: newItem.name,
                base_price: parseFloat(newItem.base_price),
                active: true
            }]);

            if (error) throw error;

            setNewItem({ name: '', base_price: '' });
            fetchCatalog();
        } catch (error) {
            alert('Error al añadir: ' + error.message);
        }
    };

    const handleDeleteItem = async (id) => {
        if (!window.confirm('¿Seguro que deseas eliminar este concepto?')) return;

        try {
            const { error } = await supabase.from('service_catalog').delete().eq('id', id);
            if (error) throw error;
            fetchCatalog();
        } catch (error) {
            alert('Error eliminando: ' + error.message);
        }
    };

    const handleUpdateItem = async (id, field, value) => {
        // Optimistic update for UI smoothness
        setCatalog(catalog.map(c => c.id === id ? { ...c, [field]: value } : c));

        try {
            const { error } = await supabase.from('service_catalog').update({ [field]: value }).eq('id', id);
            if (error) throw error;
        } catch (error) {
            console.error('Update failed:', error);
            fetchCatalog(); // Revert on error
        }
    };

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

        // Increased limit to 5MB
        if (file.size > 5 * 1024 * 1024) {
            alert('El archivo es demasiado grande. El límite es de 5MB.');
            return;
        }

        setSaving(true);
        try {
            const fileExt = file.name.split('.').pop();
            const fileName = `logo-${Date.now()}.${fileExt}`;
            const filePath = `${fileName}`;

            const { error: uploadError } = await supabase.storage
                .from('company-asset')
                .upload(filePath, file);

            if (uploadError) throw uploadError;

            const { data: { publicUrl } } = supabase.storage
                .from('company-asset')
                .getPublicUrl(filePath);

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

            const payload = { ...formData }; // Spread current state

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
            window.location.reload();

        } catch (err) {
            alert('Error al guardar: ' + err.message);
        } finally {
            setSaving(false);
        }
    };

    // MOCK PDF PREVIEW GENERATOR
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

                <div class="section">
                    <div class="section-title">Datos del Cliente</div>
                    <div class="row"><span class="label">Cliente:</span> <span class="value">Juan Pérez Ejemplo</span></div>
                    <div class="row"><span class="label">Dirección:</span> <span class="value">C/ Larios 5, Málaga</span></div>
                    <div class="row"><span class="label">Teléfono:</span> <span class="value">600 123 456</span></div>
                </div>

                <div class="section">
                    <div class="section-title">Detalle del Servicio</div>
                    <div class="row"><span class="label">Aparato:</span> <span class="value">Lavadora Samsung EcoBubble</span></div>
                    <div class="row"><span class="label">Avería:</span> <span class="value">No desagua / Error 5E. Se sustituye bomba de desagüe.</span></div>
                </div>

                <div class="section">
                    <div class="section-title">Repuestos y Mano de Obra</div>
                    <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                        <tr style="background: #f9f9f9; text-align: left;">
                            <th style="padding: 8px;">Concepto</th>
                            <th style="padding: 8px; text-align: right;">Precio</th>
                        </tr>
                        <tr>
                            <td style="padding: 8px; border-bottom: 1px solid #eee;">Bomba Desagüe Original</td>
                            <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">45.00 €</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px; border-bottom: 1px solid #eee;">Mano de Obra (1h)</td>
                            <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">40.00 €</td>
                        </tr>
                         <tr>
                            <td style="padding: 8px; border-bottom: 1px solid #eee;">Desplazamiento</td>
                            <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">20.00 €</td>
                        </tr>
                    </table>
                </div>

                <div class="total-box">
                    <div class="total-row">Base Imponible: 105.00 €</div>
                    <div class="total-row">IVA (${formData.tax_rate}%): ${(105 * formData.tax_rate / 100).toFixed(2)} €</div>
                    <div class="total-final">TOTAL: ${(105 * (1 + formData.tax_rate / 100)).toFixed(2)} €</div>
                </div>

                <div class="footer">
                    <strong>Garantía y Términos Legales:</strong><br/>
                    ${formData.legal_terms}
                    <br/><br/>
                    Con la firma del presente documento, el cliente acepta la reparación efectuada y renuncia a la devolución de las piezas sustituidas salvo solicitud expresa.
                </div>
            </body>
            </html>
        `);
        w.document.close();
    };

    if (loading) return <div className="p-10">Cargando configuración...</div>;

    return (
        <div className="max-w-4xl mx-auto space-y-6 pb-20">
            <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold text-slate-800">Ajustes del Sistema</h1>
                <button
                    onClick={handlePreviewPDF}
                    className="flex items-center gap-2 bg-slate-800 text-white px-4 py-2 rounded-lg hover:bg-slate-700 transition shadow-sm"
                >
                    <FileText size={18} /> Ver Ejemplo PDF
                </button>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="p-6 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                    <h2 className="font-bold text-lg text-slate-700 flex items-center gap-2">
                        <Building size={20} />
                        Identidad de la Empresa
                    </h2>
                </div>

                <div className="p-6 space-y-6">
                    {/* Logo Section */}
                    <div className="flex flex-col md:flex-row items-start gap-6">
                        <div className="shrink-0">
                            <label className="block text-sm font-medium text-slate-700 mb-2">Logotipo</label>
                            <div className="w-40 h-40 bg-slate-100 border-2 border-dashed border-slate-300 rounded-lg flex items-center justify-center relative overflow-hidden group">
                                {formData.logo_url ? (
                                    <img src={formData.logo_url} alt="Logo" className="w-full h-full object-contain p-2" />
                                ) : (
                                    <span className="text-slate-400 text-xs text-center px-2">Sin Logo</span>
                                )}
                                <label className="absolute inset-0 bg-black/50 text-white flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                                    <Upload size={24} />
                                    <span className="text-xs mt-1">Cambiar</span>
                                    <input
                                        type="file"
                                        accept="image/png, image/jpeg, image/jpg, image/webp"
                                        className="hidden"
                                        onChange={handleLogoUpload}
                                    />
                                </label>
                            </div>
                            <p className="text-xs text-slate-500 mt-2 max-w-[160px]">
                                Formatos: PNG, JPG, JPEG, WEBP (Máx 5MB).
                            </p>
                        </div>

                        <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
                            <div className="md:col-span-2">
                                <label className="block text-sm font-medium text-slate-700 mb-1">Nombre Fiscal / Comercial</label>
                                <input name="company_name" type="text" className="w-full p-2 border border-slate-200 rounded-lg" value={formData.company_name} onChange={handleChange} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">CIF / NIF</label>
                                <input name="company_tax_id" type="text" className="w-full p-2 border border-slate-200 rounded-lg" value={formData.company_tax_id} onChange={handleChange} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Email de Contacto</label>
                                <input name="company_email" type="email" className="w-full p-2 border border-slate-200 rounded-lg" value={formData.company_email} onChange={handleChange} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Teléfono</label>
                                <input name="company_phone" type="text" className="w-full p-2 border border-slate-200 rounded-lg" value={formData.company_phone} onChange={handleChange} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">IVA por defecto (%)</label>
                                <input name="tax_rate" type="number" className="w-full p-2 border border-slate-200 rounded-lg" value={formData.tax_rate} onChange={handleChange} />
                            </div>
                            <div className="md:col-span-2">
                                <label className="block text-sm font-medium text-slate-700 mb-1">Dirección Completa</label>
                                <input name="company_address" type="text" className="w-full p-2 border border-slate-200 rounded-lg" value={formData.company_address} onChange={handleChange} />
                            </div>
                            <div className="md:col-span-2">
                                <label className="block text-sm font-medium text-slate-700 mb-1">Cuenta Bancaria (IBAN) para Transferencias</label>
                                <input
                                    name="company_iban"
                                    type="text"
                                    placeholder="ES00 0000 0000 0000 0000 0000"
                                    className="w-full p-2 border border-slate-200 rounded-lg font-mono text-slate-600 bg-slate-50"
                                    value={formData.company_iban || ''}
                                    onChange={handleChange}
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="p-6 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                    <h2 className="font-bold text-lg text-slate-700 flex items-center gap-2">
                        <FileText size={20} />
                        Configuración de Documentos (Garantías y Legal)
                    </h2>
                </div>
                <div className="p-6">
                    <label className="block text-sm font-medium text-slate-700 mb-1">Términos y Condiciones (Pie de página PDF)</label>
                    <textarea
                        name="legal_terms"
                        rows={4}
                        className="w-full p-2 border border-slate-200 rounded-lg text-sm"
                        value={formData.legal_terms}
                        onChange={handleChange}
                    />
                    <p className="text-xs text-slate-500 mt-1">Este texto aparecerá en la parte inferior de todos los partes y facturas.</p>
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="p-6 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                    <h2 className="font-bold text-lg text-slate-700 flex items-center gap-2">
                        <Briefcase size={20} />
                        Catálogo de Servicios / Mano de Obra
                    </h2>
                </div>
                <div className="p-6">
                    {/* Add New */}
                    <div className="flex gap-4 mb-6 bg-slate-50 p-4 rounded-lg border border-slate-200 items-end">
                        <div className="flex-1">
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Concepto / Servicio</label>
                            <input
                                type="text"
                                placeholder="Ej: Mano de Obra (1 Hora)"
                                className="w-full p-2 border border-slate-200 rounded-lg text-sm"
                                value={newItem.name}
                                onChange={e => setNewItem({ ...newItem, name: e.target.value })}
                            />
                        </div>
                        <div className="w-32">
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Precio (€)</label>
                            <input
                                type="number"
                                placeholder="0.00"
                                className="w-full p-2 border border-slate-200 rounded-lg text-sm"
                                value={newItem.base_price}
                                onChange={e => setNewItem({ ...newItem, base_price: e.target.value })}
                            />
                        </div>
                        <button
                            onClick={handleAddItem}
                            className="bg-slate-800 text-white p-2.5 rounded-lg hover:bg-slate-700 transition"
                        >
                            <Plus size={20} />
                        </button>
                    </div>

                    {/* List */}
                    <div className="space-y-2">
                        {catalog.map(item => (
                            <div key={item.id} className="flex items-center gap-4 p-3 border border-slate-100 rounded-lg hover:bg-slate-50 transition">
                                <div className="flex-1">
                                    <input
                                        type="text"
                                        className="w-full bg-transparent border-none p-0 text-slate-700 font-medium focus:ring-0"
                                        value={item.name}
                                        onChange={(e) => handleUpdateItem(item.id, 'name', e.target.value)}
                                    />
                                </div>
                                <div className="w-24">
                                    <div className="relative">
                                        <input
                                            type="number"
                                            className="w-full bg-transparent border-none p-0 text-right font-mono text-slate-700 focus:ring-0"
                                            value={item.base_price}
                                            onChange={(e) => handleUpdateItem(item.id, 'base_price', e.target.value)}
                                        />
                                        <span className="absolute right-full top-1/2 -translate-y-1/2 text-slate-400 mr-1 text-xs">€</span>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => handleUpdateItem(item.id, 'active', !item.active)}
                                        className={`p-1.5 rounded-md transition ${item.active ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-400'}`}
                                        title={item.active ? 'Activo' : 'Inactivo'}
                                    >
                                        <Check size={16} />
                                    </button>
                                    <button
                                        onClick={() => handleDeleteItem(item.id)}
                                        className="p-1.5 rounded-md hover:bg-red-50 text-slate-400 hover:text-red-600 transition"
                                        title="Eliminar"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            </div>
                        ))}
                        {catalog.length === 0 && (
                            <p className="text-center text-slate-400 py-4 italic">No hay servicios registrados.</p>
                        )}
                    </div>
                </div>
            </div>

            <div className="flex justify-end gap-4 bg-white p-4 rounded-xl shadow-sm border border-slate-100 sticky bottom-4">
                <button
                    onClick={handlePreviewPDF}
                    className="px-4 py-2 text-slate-600 hover:text-slate-800 font-medium"
                >
                    Vista Previa
                </button>
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="flex items-center gap-2 bg-blue-600 text-white px-8 py-3 rounded-lg font-bold hover:bg-blue-700 transition disabled:opacity-50 shadow-md transform hover:-translate-y-0.5"
                >
                    <Save size={20} />
                    {saving ? 'Guardando...' : 'Guardar Configuración'}
                </button>
            </div>
        </div>
    );
};

export default Settings;
