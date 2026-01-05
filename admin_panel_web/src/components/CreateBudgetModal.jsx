import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { X, Save, User, Smartphone, Plus, Trash2, FileText, Calculator, DollarSign } from 'lucide-react';
import { generateServiceReport, loadImage } from '../utils/pdfGenerator';

const CreateBudgetModal = ({ onClose, onSuccess }) => {
    const [loading, setLoading] = useState(false);

    // Data Sources
    const [clients, setClients] = useState([]);

    // Form State - Mode
    const [isNewClient, setIsNewClient] = useState(false);

    // Form State - Client
    const [clientId, setClientId] = useState('');
    const [newClientName, setNewClientName] = useState('');
    const [newClientPhone, setNewClientPhone] = useState('');
    const [newClientAddress, setNewClientAddress] = useState('');
    const [newClientCity, setNewClientCity] = useState('');
    const [newClientPostalCode, setNewClientPostalCode] = useState('');

    // Appliance
    const [applianceType, setApplianceType] = useState('General');
    const [applianceBrand, setApplianceBrand] = useState('');
    const [applianceModel, setApplianceModel] = useState('');
    const [description, setDescription] = useState('');

    // Budget Items
    const [laborItems, setLaborItems] = useState([{ name: 'Diagnóstico y Presupuesto', price: 0, qty: 1 }]);
    const [partItems, setPartItems] = useState([]);

    // Payment Terms
    const [materialDeposit, setMaterialDeposit] = useState(100); // 100% default
    const [laborDeposit, setLaborDeposit] = useState(50); // 50% default
    const [paymentLegalText, setPaymentLegalText] = useState('');

    const calculateTotals = () => {
        const lTotal = laborItems.reduce((acc, i) => acc + (i.price * (i.qty || 1)), 0);
        const pTotal = partItems.reduce((acc, i) => acc + (i.price * (i.qty || 1)), 0);
        const subtotal = lTotal + pTotal;
        const total = subtotal * 1.21; // VAT 21%

        // Calculate Deposit (A cuenta)
        // (Materials * % + Labor * %) * 1.21 (VAT applied to deposit too usually, or treat as gross)
        // Let's assume percentages apply to the GROSS amount of that line type
        const matGross = pTotal * 1.21;
        const laborGross = lTotal * 1.21;

        const deposit = (matGross * (materialDeposit / 100)) + (laborGross * (laborDeposit / 100));

        return { lTotal, pTotal, total, deposit };
    };

    const [companySettings, setCompanySettings] = useState(null);

    useEffect(() => {
        const fetchResources = async () => {
            const { data: c } = await supabase.from('profiles').select('*').eq('role', 'client');
            if (c) setClients(c);

            const { data: s } = await supabase.from('company_settings').select('*').single();
            if (s) setCompanySettings(s);
        };
        fetchResources();
    }, []);

    // --- LINE ITEMS LOGIC ---
    const addLabor = () => setLaborItems([...laborItems, { name: '', price: 0, qty: 1 }]);
    const addPart = () => setPartItems([...partItems, { name: '', price: 0, qty: 1 }]);

    const removeLabor = (i) => setLaborItems(laborItems.filter((_, idx) => idx !== i));
    const removePart = (i) => setPartItems(partItems.filter((_, idx) => idx !== i));

    const updateLabor = (i, field, val) => {
        const newItems = [...laborItems];
        newItems[i][field] = field === 'name' ? val : Number(val);
        setLaborItems(newItems);
    };

    const updatePart = (i, field, val) => {
        const newItems = [...partItems];
        newItems[i][field] = field === 'name' ? val : Number(val);
        setPartItems(newItems);
    };

    const [isImproving, setIsImproving] = useState(false);

    // --- AI TEXT POLISHER (Locally Simulated) ---
    const handleAiImprove = async () => {
        if (!description) return;
        setIsImproving(true);

        // Simulate network delay for "AI feel"
        await new Promise(r => setTimeout(r, 600));

        let improved = description;

        // Dictionary of common terms to technical formalization
        const replacements = [
            // General Actions
            { k: /cambiar|sustituir|cambio de|reemplazar/gi, v: 'Sustitución y montaje de' },
            { k: /reparar|arreglo|arreglar/gi, v: 'Intervención técnica para la corrección de' },
            { k: /revisar|mirar|chequear/gi, v: 'Inspección técnica y diagnóstico de' },
            { k: /limpiar|limpieza/gi, v: 'mantenimiento higiénico y limpieza integral de' },
            { k: /instalar|montar/gi, v: 'instalación y puesta en marcha de' },

            // Components (General)
            { k: /motor/gi, v: 'motor principal de accionamiento' },
            { k: /placa|modulo|tarjeta/gi, v: 'módulo electrónico de control central' },
            { k: /cable|chispas/gi, v: 'cableado y conexiones eléctricas' },
            { k: /boton|tecla/gi, v: 'interfaz de pulsadores' },

            // Washing Machine / Dryer
            { k: /goma|escotilla/gi, v: 'junta elastomérica de estanqueidad (escotilla)' },
            { k: /bomba/gi, v: 'bomba de desagüe magnética' },
            { k: /filtro/gi, v: 'filtro de retención de partículas' },
            { k: /correa/gi, v: 'correa de transmisión poli-V' },
            { k: /puerta|cierre|blocapuerta/gi, v: 'dispositivo de retardo y bloqueo de seguridad' },
            { k: /tambor/gi, v: 'cesto de lavado (tambor)' },
            { k: /rodamientos|cojinetes/gi, v: 'kit de rodamientos y retenida' },
            { k: /carbones|escobillas/gi, v: 'escobillas de contacto del motor' },

            // Fridge / A/C
            { k: /no enfria/gi, v: 'insuficiencia de rendimiento termodinámico' },
            { k: /gas|carga/gi, v: 'carga de gas refrigerante R-600a/R-410a según normativa' },
            { k: /termostato/gi, v: 'controlador de temperatura (termostato)' },
            { k: /compresor/gi, v: 'motocompresor hermético' },
            { k: /ventilador/gi, v: 'forzador de ventilación' },
            { k: /hielo/gi, v: 'acumulación excesiva de escarcha (bloqueo)' },
            { k: /fuga|pierde/gi, v: 'pérdida de estanqueidad en circuito' },

            // Effects
            { k: /ruido/gi, v: 'emisión acústica fuera de rango operacional' },
            { k: /agua/gi, v: 'fugas de líquido' },
            { k: /error/gi, v: 'código de error digital' },
            { k: /olor/gi, v: 'olores por proliferación bacteriana' }
        ];

        replacements.forEach(r => {
            // Only replace if not already part of the target phrase (simple check)
            if (!improved.includes(r.v)) {
                improved = improved.replace(r.k, r.v);
            }
        });

        // Formatting cleanup
        improved = improved.trim();
        improved = improved.charAt(0).toUpperCase() + improved.slice(1);
        if (!improved.endsWith('.')) improved += '.';

        // Remove forced prefix as per user request

        setDescription(improved);
        setIsImproving(false);
    };

    // Old calculation removed in favor of calculateTotals()

    // --- SUBMIT LOGIC ---
    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!clientId && !isNewClient) return alert("Selecciona un cliente");
        setLoading(true);

        try {
            // 1. Handle Client
            let finalClientId = clientId;

            if (isNewClient) {
                const { data: existingClient } = await supabase
                    .from('profiles')
                    .select('id, full_name')
                    .eq('phone', newClientPhone)
                    .single();

                if (existingClient) {
                    if (window.confirm(`El cliente ${existingClient.full_name} ya existe. ¿Usarlo?`)) {
                        finalClientId = existingClient.id;
                    } else {
                        setLoading(false); return;
                    }
                } else {
                    const { data: newClient, error: clientError } = await supabase
                        .from('profiles')
                        .insert({
                            full_name: newClientName,
                            phone: newClientPhone,
                            address: newClientAddress,
                            city: newClientCity,
                            postal_code: newClientPostalCode,
                            role: 'client',
                            created_via: 'admin_budget'
                        })
                        .select()
                        .single();

                    if (clientError) throw clientError;
                    finalClientId = newClient.id;
                }
            }

            // 2. Create Budget Record (New Table)
            const totals = calculateTotals();

            const budgetData = {
                client_id: finalClientId,
                created_by: (await supabase.auth.getUser()).data.user?.id,
                status: 'pending', // Default status for new admin budgets
                created_via: 'admin_panel',

                // Content
                description: description,
                appliance_info: { type: applianceType, brand: applianceBrand, model: applianceModel },
                labor_items: laborItems,
                part_items: partItems,

                // Financials
                total_amount: totals.total,
                deposit_amount: totals.deposit,
                deposit_percentage_materials: materialDeposit,
                deposit_percentage_labor: laborDeposit,
                payment_terms: paymentLegalText
            };

            // Insert into 'budgets'
            const { data: budget, error: budgetError } = await supabase
                .from('budgets')
                .insert(budgetData)
                .select('*, client:profiles!client_id(*)')
                .single();

            if (budgetError) throw budgetError;

            // 3. Generate PDF
            if (totals.total > 0) {
                const logo = await loadImage('https://placehold.co/150x50/2563eb/white?text=TECH+SERVICE');

                // Normalize for PDF Generator
                // PDF expects ticket structure, so we map budget fields to ticket-like fields
                const pdfData = {
                    ...budget,
                    ticket_number: `P-${budget.budget_number}`, // Use P- prefix for Presupuestos
                    type: 'budget', // Flag for generator
                    labor_list: budget.labor_items,
                    parts_list: budget.part_items,
                    tech_diagnosis: budget.description, // Map description
                    payment_deposit: budget.deposit_amount,
                    // client is already attached
                };

                const doc = generateServiceReport(pdfData, logo, { isQuote: true });
                const pdfBlob = doc.output('blob');
                const fileName = `presupuesto_P-${budget.budget_number}_${Date.now()}.pdf`;

                const { error: uploadError } = await supabase.storage
                    .from('service-reports')
                    .upload(fileName, pdfBlob, { contentType: 'application/pdf', upsert: true });

                if (uploadError) throw uploadError;

                const { data: urlData } = supabase.storage.from('service-reports').getPublicUrl(fileName);

                // Update Budget with PDF URL
                await supabase.from('budgets').update({
                    pdf_url: urlData.publicUrl
                }).eq('id', budget.id);
            }

            // 4. Send Email (Simulated)
            const clientEmail = budget.client?.email || 'No registrado';
            alert(`✅ Presupuesto Creado (P-${budget.budget_number}).\nTotal: ${totals.total.toFixed(2)}€\nA cuenta: ${totals.deposit.toFixed(2)}€\n\n(Simulación) Enviando email a: ${clientEmail}`);

            onSuccess();
            onClose();

        } catch (error) {
            console.error(error);
            alert('Error: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    // --- AI PAYMENT LEGAL GENERATOR ---
    const generatePaymentLegal = () => {
        const { deposit: depositTotal, total } = calculateTotals();
        const percent = Math.round((depositTotal / total) * 100);

        const texts = [
            `El cliente abonará el ${percent}% (${depositTotal.toFixed(2)}€) a la aceptación del presente presupuesto en concepto de provisión de fondos y materiales. El resto a la finalización.`,
            `Se requiere un pago inicial de ${depositTotal.toFixed(2)}€ para el inicio de los trabajos y pedido de recambios. Liquidación restante a la entrega.`,
            `Forma de pago: ${percent}% por adelantado mediante transferencia o efectivo. Resto al finalizar la reparación.`
        ];

        // Pick random variation or just the first one
        setPaymentLegalText(texts[0]);
    };

    // --- RENDER SECTION 4 ---
    const renderPaymentSection = () => {
        const { deposit, total } = calculateTotals();

        return (
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm relative overflow-hidden mt-6">
                <div className="absolute top-0 left-0 w-1 h-full bg-amber-500"></div>
                <h3 className="font-bold text-slate-700 mb-4 flex items-center gap-2">
                    <DollarSign size={20} className="text-amber-500" /> Condiciones de Pago
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-6">
                    {/* Sliders */}
                    <div className="space-y-6">
                        <div>
                            <div className="flex justify-between text-sm font-medium text-slate-600 mb-2">
                                <span>Adelanto Materiales</span>
                                <span className="text-blue-600">{materialDeposit}%</span>
                            </div>
                            <input
                                type="range"
                                min="0" max="100" step="10"
                                className="w-full"
                                value={materialDeposit}
                                onChange={e => setMaterialDeposit(Number(e.target.value))}
                            />
                        </div>
                        <div>
                            <div className="flex justify-between text-sm font-medium text-slate-600 mb-2">
                                <span>Adelanto Mano de Obra</span>
                                <span className="text-blue-600">{laborDeposit}%</span>
                            </div>
                            <input
                                type="range"
                                min="0" max="100" step="10"
                                className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                                value={laborDeposit}
                                onChange={e => setLaborDeposit(Number(e.target.value))}
                            />
                        </div>
                    </div>

                    {/* Calculation Display */}
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col justify-center items-center text-center">
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">A CUENTA / SEÑAL</p>
                        <p className="text-3xl font-black text-amber-600 mb-2">{deposit.toFixed(2)}€</p>
                        <p className="text-xs text-slate-500">
                            (Corresponde al {Math.round((deposit / total) * 100 || 0)}% del total)
                        </p>

                        {companySettings?.company_iban && (
                            <div className="mt-4 pt-4 border-t border-slate-200 w-full">
                                <p className="text-[10px] uppercase font-bold text-slate-400 mb-1">Cuenta para ingreso</p>
                                <p className="font-mono text-xs text-slate-700 bg-white border border-slate-200 p-1.5 rounded select-all">
                                    {companySettings.company_iban}
                                </p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Legal Text Area */}
                <div className="relative">
                    <div className="flex justify-between items-center mb-2">
                        <label className="text-xs font-bold text-slate-500 uppercase">Texto Legal (Forma de Pago)</label>
                        <button
                            type="button"
                            onClick={generatePaymentLegal}
                            className="text-xs text-amber-600 font-bold hover:underline flex items-center gap-1"
                        >
                            ✨ Generar Texto
                        </button>
                    </div>
                    <textarea
                        className="w-full p-3 border rounded-lg text-sm bg-slate-50 focus:bg-white transition-colors"
                        rows={2}
                        placeholder="Ej: Se requiere el abono del 50% para aceptación..."
                        value={paymentLegalText}
                        onChange={e => setPaymentLegalText(e.target.value)}
                    />
                </div>
            </div>
        );
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl overflow-hidden max-h-[95vh] flex flex-col">
                {/* Header */}
                <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 sticky top-0">
                    <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                        <FileText className="text-blue-600" /> Crear Nuevo Presupuesto (Oficina)
                    </h2>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
                        <X size={20} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50">
                    <form id="budget-form" onSubmit={handleSubmit} className="space-y-6">

                        {/* 1. SECTION: CLIENT */}
                        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm relative overflow-hidden">
                            <div className="absolute top-0 left-0 w-1 h-full bg-blue-500"></div>
                            <h3 className="font-bold text-slate-700 mb-4 flex items-center gap-2">
                                <User size={20} className="text-blue-500" /> Cliente
                                <button
                                    type="button"
                                    onClick={() => setIsNewClient(!isNewClient)}
                                    className="ml-auto text-xs font-semibold text-blue-600 bg-blue-50 px-3 py-1 rounded-full hover:bg-blue-100 transition"
                                >
                                    {isNewClient ? 'Buscar Existente' : '+ Nuevo Cliente'}
                                </button>
                            </h3>

                            {isNewClient ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <input required type="text" placeholder="Nombre Completo" className="p-2 border rounded" onChange={e => setNewClientName(e.target.value)} />
                                    <input required type="tel" placeholder="Teléfono" className="p-2 border rounded" onChange={e => setNewClientPhone(e.target.value)} />
                                    <input type="text" placeholder="Dirección" className="p-2 border rounded" onChange={e => setNewClientAddress(e.target.value)} />
                                    <div className="flex gap-2">
                                        <input type="text" placeholder="Ciudad" className="flex-1 p-2 border rounded" onChange={e => setNewClientCity(e.target.value)} />
                                        <input type="text" placeholder="CP" className="w-24 p-2 border rounded" onChange={e => setNewClientPostalCode(e.target.value)} />
                                    </div>
                                </div>
                            ) : (
                                <select required className="w-full p-2 border rounded bg-slate-50 font-medium" onChange={e => setClientId(e.target.value)} value={clientId}>
                                    <option value="">-- Seleccionar Cliente --</option>
                                    {clients.map(c => <option key={c.id} value={c.id}>{c.full_name}</option>)}
                                </select>
                            )}
                        </div>

                        {/* 2. SECTION: DESCRIPTION & AI */}

                        {/* 2. SECTION: DESCRIPTION & AI */}
                        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm relative overflow-hidden">
                            <div className="absolute top-0 left-0 w-1 h-full bg-indigo-500"></div>
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="font-bold text-slate-700 flex items-center gap-2">
                                    <FileText size={20} className="text-indigo-500" /> Descripción del Trabajo
                                </h3>
                                <button
                                    type="button"
                                    onClick={handleAiImprove}
                                    className="text-xs bg-indigo-50 text-indigo-600 px-3 py-1.5 rounded-lg border border-indigo-100 font-bold hover:bg-indigo-100 flex items-center gap-1 transition group"
                                    title="Reescribir con lenguaje técnico formal"
                                >
                                    {isImproving ? (
                                        <>
                                            <span className="animate-spin">✨</span> Mejorando...
                                        </>
                                    ) : (
                                        <>
                                            <span className="text-lg">✨</span> Mejorar Redacción (IA)
                                        </>
                                    )}
                                </button>
                            </div>

                            <textarea
                                required
                                rows={4}
                                className="w-full p-4 border rounded-xl bg-slate-50 focus:bg-white transition-colors text-slate-700 leading-relaxed"
                                placeholder="Describe el trabajo a realizar (ej. 'cambio de motor y limpieza')..."
                                value={description}
                                onChange={e => setDescription(e.target.value)}
                            />
                            <p className="text-xs text-slate-400 mt-2 text-right">
                                * Escribe una nota rápida y pulsa "Mejorar Redacción" para formalizar.
                            </p>
                        </div>

                        {/* 3. SECTION: CONCEPTS / BUDGET */}
                        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm relative overflow-hidden">
                            <div className="absolute top-0 left-0 w-1 h-full bg-green-500"></div>
                            <h3 className="font-bold text-slate-700 mb-4 flex items-center gap-2">
                                <DollarSign size={20} className="text-green-500" /> Conceptos del Presupuesto
                            </h3>

                            {/* Labor */}
                            <div className="mb-6">
                                <div className="flex justify-between items-center mb-2">
                                    <label className="text-xs font-bold text-slate-500 uppercase">Mano de Obra / Servicios</label>
                                    <button type="button" onClick={addLabor} className="text-xs text-blue-600 font-bold hover:underline">+ Añadir Concepto</button>
                                </div>
                                <div className="space-y-2">
                                    {laborItems.map((item, idx) => (
                                        <div key={idx} className="flex gap-2">
                                            <input type="text" placeholder="Descripción (ej. Desplazamiento)" className="flex-1 p-2 border rounded text-sm" value={item.name} onChange={e => updateLabor(idx, 'name', e.target.value)} />
                                            <input type="number" placeholder="€" className="w-24 p-2 border rounded text-right font-mono" value={item.price} onChange={e => updateLabor(idx, 'price', e.target.value)} />
                                            <button type="button" onClick={() => removeLabor(idx)} className="text-slate-300 hover:text-red-500"><Trash2 size={16} /></button>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Parts */}
                            <div>
                                <div className="flex justify-between items-center mb-2">
                                    <label className="text-xs font-bold text-slate-500 uppercase">Repuestos / Materiales</label>
                                    <button type="button" onClick={addPart} className="text-xs text-blue-600 font-bold hover:underline">+ Añadir Repuesto</button>
                                </div>
                                <div className="space-y-2">
                                    {partItems.map((item, idx) => (
                                        <div key={idx} className="flex gap-2">
                                            <input type="text" placeholder="Referencia / Nombre Repuesto" className="flex-1 p-2 border rounded text-sm" value={item.name} onChange={e => updatePart(idx, 'name', e.target.value)} />
                                            <div className="flex items-center gap-1 w-20">
                                                <span className="text-xs text-slate-400">x</span>
                                                <input type="number" className="w-full p-2 border rounded text-center" value={item.qty} onChange={e => updatePart(idx, 'qty', e.target.value)} />
                                            </div>
                                            <input type="number" placeholder="€/ud" className="w-24 p-2 border rounded text-right font-mono" value={item.price} onChange={e => updatePart(idx, 'price', e.target.value)} />
                                            <button type="button" onClick={() => removePart(idx)} className="text-slate-300 hover:text-red-500"><Trash2 size={16} /></button>
                                        </div>
                                    ))}
                                    {partItems.length === 0 && <p className="text-sm text-slate-400 italic">No hay repuestos añadidos.</p>}
                                </div>
                            </div>
                        </div>

                        {/* 4. SECTION: PAYMENT TERMS */}
                        {renderPaymentSection()}

                    </form>
                </div>

                {/* Footer / Totals */}
                <div className="bg-white p-4 border-t border-slate-200 shadow-up flex justify-between items-center z-10">
                    <div className="text-right flex-1 mr-6">
                        <p className="text-xs text-slate-500 uppercase">Total Estimado (IVA Inc.)</p>
                        <p className="text-2xl font-black text-slate-800">{calculateTotals().total.toFixed(2)}€</p>
                    </div>
                    <div className="flex gap-3">
                        <button onClick={onClose} className="px-6 py-3 rounded-xl border border-slate-200 text-slate-600 font-bold hover:bg-slate-50 transition">
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            form="budget-form"
                            disabled={loading}
                            className="px-8 py-3 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-700 shadow-lg shadow-blue-500/20 active:scale-95 transition flex items-center gap-2"
                        >
                            {loading ? 'Procesando...' : (
                                <>
                                    <FileText size={20} /> Crear y Generar PDF
                                </>
                            )}
                        </button>
                    </div>
                </div>

            </div>
        </div>
    );
};

export default CreateBudgetModal;
