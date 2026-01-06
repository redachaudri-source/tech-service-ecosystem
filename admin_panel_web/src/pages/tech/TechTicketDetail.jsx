import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { generateServiceReport, generateDepositReceipt, loadImage } from '../../utils/pdfGenerator';
import {
    ChevronLeft, MapPin, Phone, User,
    Navigation, PhoneCall, CheckCircle,
    ArrowRightCircle, Search, Copy, Camera, Upload, FileText,
    Eye, Scan, AlertTriangle, ClipboardCopy, Clock, History, PackagePlus
} from 'lucide-react';
import Tesseract from 'tesseract.js';
import TechLocationTracker from '../../components/TechLocationTracker';
import { useAuth } from '../../context/AuthContext';

const TechTicketDetail = () => {
    const { id } = useParams();
    const { user } = useAuth();
    const navigate = useNavigate();
    const [ticket, setTicket] = useState(null);
    const [loading, setLoading] = useState(true);
    const [updating, setUpdating] = useState(false);
    const [settings, setSettings] = useState(null);

    // New State for Diagnosis & Financials
    const [catalog, setCatalog] = useState([]);
    const [diagnosis, setDiagnosis] = useState('');
    const [solution, setSolution] = useState('');
    const [parts, setParts] = useState([]);
    const [labor, setLabor] = useState([]);
    const [deposit, setDeposit] = useState(0);
    const [isPaid, setIsPaid] = useState(false);
    const [paymentMethod, setPaymentMethod] = useState('cash');
    const [paymentProofUrl, setPaymentProofUrl] = useState('');
    const [uploadingProof, setUploadingProof] = useState(false);
    const [generatingPdf, setGeneratingPdf] = useState(false);
    const [generatingReceipt, setGeneratingReceipt] = useState(false);

    // UI Helper State
    const [newPart, setNewPart] = useState({ name: '', price: '', qty: 1 });
    const [selectedLaborId, setSelectedLaborId] = useState('');

    // OCR State
    const [showLabelModal, setShowLabelModal] = useState(false);
    const [scanningLabel, setScanningLabel] = useState(false);
    const [ocrText, setOcrText] = useState('');
    const [ocrConfidence, setOcrConfidence] = useState(0);

    const fetchTicket = async () => {
        try {
            const { data, error } = await supabase
                .from('tickets')
                .select(`
                    *,
                    client:profiles!client_id (
                        full_name,
                        address,
                        phone
                    )
                `)
                .eq('id', id)
                .single();

            if (error) throw error;
            setTicket(data);

            // Init State from DB
            setDiagnosis(data.tech_diagnosis || '');
            setSolution(data.tech_solution || '');
            setParts(data.parts_list ? (typeof data.parts_list === 'string' ? JSON.parse(data.parts_list) : data.parts_list) : []);
            setLabor(data.labor_list ? (typeof data.labor_list === 'string' ? JSON.parse(data.labor_list) : data.labor_list) : []);
            setDeposit(data.deposit_amount || 0);
            setIsPaid(data.is_paid || false);
            setPaymentMethod(data.payment_method || 'cash');
            setPaymentProofUrl(data.payment_proof_url || '');

        } catch (error) {
            console.error('Error fetching ticket:', error);
            navigate('/tech/dashboard');
        } finally {
            setLoading(false);
        }
    };

    const fetchCatalog = async () => {
        const { data } = await supabase.from('service_catalog').select('*').eq('active', true);
        if (data) setCatalog(data);
    };

    const fetchSettings = async () => {
        const { data } = await supabase.from('company_settings').select('*').single();
        if (data) setSettings(data);
    };

    useEffect(() => {
        fetchTicket();
        fetchCatalog();
        fetchSettings();
    }, [id]);

    const saveChanges = async () => {
        setUpdating(true);
        try {
            const { error } = await supabase
                .from('tickets')
                .update({
                    tech_diagnosis: diagnosis,
                    tech_solution: solution,
                    parts_list: parts,
                    labor_list: labor,
                    deposit_amount: deposit,
                    is_paid: isPaid,
                    payment_method: paymentMethod,
                    payment_proof_url: paymentProofUrl
                })
                .eq('id', id);

            if (error) throw error;
            alert('Datos guardados correctamente');
        } catch (error) {
            alert('Error guardando datos: ' + error.message);
        } finally {
            setUpdating(false);
        }
    };

    const getStatusLabel = (s) => {
        const map = {
            solicitado: 'Solicitado',
            asignado: 'Asignado',
            en_camino: 'En Camino',
            en_diagnostico: 'En Diagnóstico',
            presupuesto_pendiente: 'Pte. Aceptación',
            presupuesto_aceptado: 'Presupuesto Aceptado',
            en_reparacion: 'En Reparación',
            finalizado: 'Finalizado',
            cancelado: 'Cancelado',
            rejected: 'Rechazado'
        };
        return map[s] || s;
    };

    const updateStatus = async (newStatus) => {
        setUpdating(true);

        try {
            // Append to history
            const historyEntry = {
                status: newStatus,
                timestamp: new Date().toISOString(),
                label: getStatusLabel(newStatus)
            };

            const currentHistory = ticket.status_history || [];
            const updatedHistory = [...currentHistory, historyEntry];

            // Save current data state AND new status/history
            // Try updating WITH history first (assuming schema is up to date)
            const { error: historyError } = await supabase.from('tickets').update({
                tech_diagnosis: diagnosis,
                tech_solution: solution,
                parts_list: parts,
                labor_list: labor,
                deposit_amount: deposit,
                is_paid: isPaid,
                payment_method: paymentMethod,
                payment_proof_url: paymentProofUrl,
                status: newStatus,
                status_history: updatedHistory
            }).eq('id', id);

            if (historyError) {
                console.warn('History update failed, trying fallback without history layer...', historyError);

                // Fallback: Update WITHOUT status_history (older schema compatibility)
                const { error: fallbackError } = await supabase.from('tickets').update({
                    tech_diagnosis: diagnosis,
                    tech_solution: solution,
                    parts_list: parts,
                    labor_list: labor,
                    deposit_amount: deposit,
                    is_paid: isPaid,
                    payment_method: paymentMethod,
                    payment_proof_url: paymentProofUrl,
                    status: newStatus
                }).eq('id', id);

                if (fallbackError) throw fallbackError;
            }

            await fetchTicket();
        } catch (error) {
            console.error('Error updating status:', error);
            alert(`Error al actualizar estado (posible error de red o permisos): ${error.message}`);
        } finally {
            setUpdating(false);
        }
    };

    // Helper to get current ticket data with local edits
    const getCurrentTicketData = () => {
        return {
            ...ticket,
            tech_diagnosis: diagnosis,
            tech_solution: solution,
            parts_list: parts,
            labor_list: labor,
            deposit_amount: deposit,
            is_paid: isPaid,
            payment_method: paymentMethod
        };
    };

    const handleGenerateQuote = async () => {
        if (!window.confirm('¿Generar presupuesto y enviarlo al cliente? El estado cambiará a "Pendiente de Aceptación".')) return;

        setGeneratingPdf(true);
        setUpdating(true); // Lock UI

        try {
            // 1. Save current changes first to ensure we print what is on screen
            await supabase.from('tickets').update({
                tech_diagnosis: diagnosis,
                tech_solution: solution,
                parts_list: parts,
                labor_list: labor,
                deposit_amount: deposit
            }).eq('id', id);

            // 2. Generate PDF using LOCAL state (proven most reliable)
            const logoImg = settings?.logo_url ? await loadImage(settings.logo_url) : null;
            const currentData = getCurrentTicketData();
            const doc = generateServiceReport(currentData, logoImg, { isQuote: true });
            const pdfBlob = doc.output('blob');
            const fileName = `quote_${ticket.ticket_number}_${Date.now()}.pdf`;

            // 3. Upload PDF
            const { error: uploadError } = await supabase.storage
                .from('service-reports')
                .upload(fileName, pdfBlob, { contentType: 'application/pdf' });

            if (uploadError) throw uploadError;

            const { data } = supabase.storage.from('service-reports').getPublicUrl(fileName);
            const publicUrl = data.publicUrl;

            // 4. ATOMIC UPDATE: Status + URL + History
            // This prevents "Zombie" state where status is pending but PDF is missing
            const newStatus = 'presupuesto_pendiente';
            const historyEntry = {
                status: newStatus,
                timestamp: new Date().toISOString(),
                label: getStatusLabel(newStatus)
            };

            // Get current history from latest ticket state (or local if trusted, but let's fetch to be safe? 
            // actually we can just append to ticket.status_history)
            const updatedHistory = [...(ticket.status_history || []), historyEntry];

            const { error: dbError } = await supabase.from('tickets').update({
                status: newStatus,
                status_history: updatedHistory,
                quote_pdf_url: publicUrl,
                quote_generated_at: new Date().toISOString()
            }).eq('id', id);

            if (dbError) throw dbError;

            // 5. Success
            await fetchTicket(); // Refresh all
            alert('¡Presupuesto generado y enviado correctamente!');

        } catch (e) {
            console.error('Error in generation flow:', e);
            alert('Error generando presupuesto: ' + e.message);
        } finally {
            setGeneratingPdf(false);
            setUpdating(false);
        }
    };

    const handleFileUpload = async (event) => {
        try {
            const file = event.target.files[0];
            if (!file) return;

            setUploadingProof(true);
            const fileExt = file.name.split('.').pop();
            const fileName = `${id}_proof_${Date.now()}.${fileExt}`;
            const filePath = `${fileName}`;

            const { error: uploadError } = await supabase.storage
                .from('payment-proofs')
                .upload(filePath, file);

            if (uploadError) throw uploadError;

            // Get Public URL
            const { data } = supabase.storage.from('payment-proofs').getPublicUrl(filePath);
            const publicUrl = data.publicUrl;

            setPaymentProofUrl(publicUrl);
            alert('Justificante subido correctamente');
        } catch (error) {
            alert('Error subiendo justificante: ' + error.message);
        } finally {
            setUploadingProof(false);
        }
    };

    const handleGeneratePDF = async () => {
        if (!ticket) return;
        setGeneratingPdf(true);
        try {
            const logoImg = settings?.logo_url ? await loadImage(settings.logo_url) : null;
            const currentData = getCurrentTicketData(); // USE LOCAL STATE

            // 1. Generate PDF Blob
            const doc = generateServiceReport(currentData, logoImg);
            const pdfBlob = doc.output('blob');

            // 2. Upload to Supabase
            const fileName = `report_${ticket.ticket_number}_${Date.now()}.pdf`;
            const filePath = `${fileName}`;

            const { error: uploadError } = await supabase.storage
                .from('service-reports')
                .upload(filePath, pdfBlob, {
                    contentType: 'application/pdf'
                });

            if (uploadError) throw uploadError;

            // 3. Get Public URL
            const { data: urlData } = supabase.storage.from('service-reports').getPublicUrl(filePath);
            const publicUrl = urlData.publicUrl;

            // 4. Update Ticket
            const { error: dbError } = await supabase
                .from('tickets')
                .update({
                    pdf_url: publicUrl,
                    pdf_generated_at: new Date().toISOString()
                })
                .eq('id', id);

            if (dbError) throw dbError;

            // 5. Update Local State
            setTicket(prev => ({ ...prev, pdf_url: publicUrl }));
            alert('PDF generado y guardado correctamente.');

            // Open PDF
            window.open(publicUrl, '_blank');

        } catch (error) {
            console.error('Error creating PDF:', error);
            alert('Error generando el PDF: ' + error.message);
        } finally {
            setGeneratingPdf(false);
        }
    };

    const handleGenerateReceipt = async () => {
        if (!ticket || !deposit) {
            alert("No hay importe a cuenta para generar recibo.");
            return;
        }
        setGeneratingReceipt(true);
        try {
            const logoImg = settings?.logo_url ? await loadImage(settings.logo_url) : null;

            // Use getCurrentTicketData() to ensure we use the LATEST deposit amount from the input field
            const currentData = getCurrentTicketData();

            // 1. Generate PDF
            const doc = generateDepositReceipt(currentData, logoImg);
            const pdfBlob = doc.output('blob');
            const fileName = `recibo_senal_${ticket.ticket_number}_${Date.now()}.pdf`;

            // 2. Upload to Supabase
            const { error: uploadError } = await supabase.storage
                .from('service-reports')
                .upload(fileName, pdfBlob, { contentType: 'application/pdf' });

            if (uploadError) throw uploadError;

            // 3. Get Public URL
            const { data } = supabase.storage.from('service-reports').getPublicUrl(fileName);
            const publicUrl = data.publicUrl;

            // 4. Save URL to DB
            const { error: dbError } = await supabase
                .from('tickets')
                .update({ deposit_receipt_url: publicUrl })
                .eq('id', id);

            if (dbError) throw dbError;

            // 5. Open and Notify
            window.open(publicUrl, '_blank');
            alert('Recibo generado y guardado correctamente.');

        } catch (error) {
            console.error('Error receipt:', error);
            alert('Error generando recibo: ' + error.message);
        } finally {
            setGeneratingReceipt(false);
        }
    };

    // --- Helpers ---
    const addPart = () => {
        if (!newPart.name || !newPart.price) return;
        setParts([...parts, {
            id: Date.now(),
            name: newPart.name,
            price: parseFloat(newPart.price),
            qty: parseFloat(newPart.qty) || 1
        }]);
        setNewPart({ name: '', price: '', qty: 1 });
    };

    const removePart = (id) => {
        setParts(parts.filter(p => p.id !== id));
    };

    const addLabor = () => {
        if (!selectedLaborId) return;
        const item = catalog.find(c => c.id === selectedLaborId);
        if (item) {
            setLabor([...labor, { id: Date.now(), catalog_id: item.id, name: item.name, price: item.base_price, qty: 1 }]);
        }
        setSelectedLaborId('');
    };

    const removeLabor = (id) => {
        setLabor(labor.filter(l => l.id !== id));
    };

    const handlePartStatusChange = (partId, field, value) => {
        setParts(parts.map(p => {
            if (p.id === partId) {
                return { ...p, [field]: value };
            }
            return p;
        }));
    };

    const handleScanLabel = async () => {
        if (!ticket.appliance_info?.label_image_url) return;
        setScanningLabel(true);
        setOcrText('');
        try {
            const result = await Tesseract.recognize(
                ticket.appliance_info.label_image_url,
                'eng', // English is usually better for model numbers (alphanumeric)
                { logger: m => console.log(m) }
            );
            setOcrText(result.data.text);
            setOcrConfidence(result.data.confidence);
        } catch (error) {
            console.error('OCR Error:', error);
            alert('Error al escanear la imagen.');
        } finally {
            setScanningLabel(false);
        }
    };

    const calculateTotal = () => {
        const partsTotal = parts.reduce((sum, p) => sum + (p.price * p.qty), 0);
        const laborTotal = labor.reduce((sum, l) => sum + (l.price * l.qty), 0);
        const subtotal = partsTotal + laborTotal;
        const vat = subtotal * 0.21;
        const total = subtotal + vat;
        return { subtotal, vat, total };
    };

    const handleOpenMap = (address) => {
        if (!address) return;
        const query = encodeURIComponent(address);
        window.open(`https://www.google.com/maps/search/?api=1&query=${query}`, '_blank');
    };

    const handleCall = (phone) => {
        if (!phone) return;
        window.location.href = `tel:${phone}`;
    };

    const handleAswoSearch = async () => {
        const model = ticket?.appliance_info?.model;

        if (model) {
            try {
                await navigator.clipboard.writeText(model);
                alert(`Modelo "${model}" copiado al portapapeles.`);
            } catch (err) {
                console.error('Error copiando:', err);
            }
        } else {
            alert('No hay modelo registrado para copiar.');
        }

        window.open('https://shop.aswo.com/', '_blank');
    };

    // Helper for AI Logic
    const getSmartDiagnosis = (type, brand, text) => {
        if (!text) return null;
        const t = text.toLowerCase();
        let diag = "";

        // Common Patterns (Synced with Admin Panel)
        const patterns = {
            'Lavadora': [
                { k: ['agua', 'no saca', 'desagua'], d: 'Posible obstrucción en bomba de desagüe o filtro sucio.' },
                { k: ['centrifuga', 'gira', 'tambor'], d: 'Revisar escobillas del motor, condensador o correa de transmisión.' },
                { k: ['enciende', 'muerta'], d: 'Fallo en placa electrónica o fusible de entrada. Comprobar tensión.' },
                { k: ['ruido', 'golpes'], d: 'Rodamientos desgastados o amortiguadores vencidos.' },
                { k: ['puerta', 'cierra'], d: 'Blocapuertas defectuoso o maneta rota.' }
            ],
            'Aire Acondicionado': [
                { k: ['enfria', 'calienta', 'gas'], d: 'Posible fuga de refrigerante o fallo en compresor/condensador.' },
                { k: ['gotea', 'agua'], d: 'Drenaje obstruido o bandeja de condensados llena.' },
                { k: ['enciende', 'mando'], d: 'Revisar receptor IR o placa de control.' },
                { k: ['olor'], d: 'Filtros sucios o baterías con moho. Limpieza urgente.' },
                { k: ['error', 'parpadea'], d: 'Consultar código de error en manual de servicio. Fallo de sondas posible.' }
            ],
            'Refrigerador': [
                { k: ['enfria', 'calienta'], d: 'Compresor no arranca (clixon/relé) o falta de gas.' },
                { k: ['hielo', 'escarcha'], d: 'Fallo en sistema No-Frost (resistencia, bimetal o timer).' },
                { k: ['ruido'], d: 'Ventilador rozando o compresor cabeceando.' },
                { k: ['agua', 'charco'], d: 'Desagüe de deshielo obstruido.' }
            ],
            'Calentador de Gas': [
                { k: ['enciende', 'chispa'], d: 'Revisar pilas, membrana de agua o servoválvula de gas.' },
                { k: ['apaga'], d: 'Sensor de tiro o termopar defectuoso.' },
                { k: ['poca agua', 'presion'], d: 'Serpentín calcificado. Limpieza química necesaria.' }
            ]
        };

        const defaultDiags = {
            'Lavadora': 'Revisar ciclo de lavado y componentes mecánicos principales.',
            'Aire Acondicionado': 'Comprobar presiones, saltos térmicos y limpieza de filtros.',
            'Refrigerador': 'Verificar temperaturas y ciclo de compresor.',
            'Calentador de Gas': 'Revisar circuito de gas y evacuación de humos.',
            'default': 'Inspección general requerida para determinar origen del fallo.'
        };

        const typeRules = patterns[type] || [];
        const match = typeRules.find(r => r.k.some(key => t.includes(key)));

        if (match) {
            diag = match.d;
        } else {
            diag = defaultDiags[type] || defaultDiags['default'];
        }

        return `Diagnóstico: ${brand || ''} ${type || ''} - ${diag} Protocolo: Revisión estándar.`;
    };

    // Calculate Live Diagnosis if needed
    const liveDiagnosis = ticket ? getSmartDiagnosis(ticket.appliance_info?.type, ticket.appliance_info?.brand, ticket.description_failure || ticket.description) : null;
    const displayedDiagnosis = ticket?.ai_diagnosis || liveDiagnosis;
    const isLive = !ticket?.ai_diagnosis && liveDiagnosis;

    if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>;
    if (!ticket) return null;

    const statusMap = {
        solicitado: { label: 'SOLICITADO', color: 'bg-orange-100 text-orange-700', next: 'en_camino', nextLabel: 'INICIAR VIAJE' },
        asignado: { label: 'ASIGNADO', color: 'bg-blue-100 text-blue-700', next: 'en_camino', nextLabel: 'INICIAR VIAJE' },
        en_camino: { label: 'EN CAMINO', color: 'bg-indigo-100 text-indigo-700', next: 'en_diagnostico', nextLabel: 'LLEGADA / DIAGN.' },
        en_diagnostico: { label: 'DIAGNÓSTICO', color: 'bg-purple-100 text-purple-700', next: 'en_reparacion', nextLabel: 'INICIAR REPARACIÓN' },
        presupuesto_pendiente: { label: 'PTE. ACEPTACIÓN', color: 'bg-yellow-100 text-yellow-700', next: 'presupuesto_aceptado', nextLabel: 'FORZAR ACEPTACIÓN' },
        presupuesto_revision: { label: 'CADUCADO / REVISIÓN', color: 'bg-red-100 text-red-700', next: null },
        presupuesto_aceptado: { label: 'PRESUPUESTO ACEPTADO', color: 'bg-green-100 text-green-700', next: 'en_reparacion', nextLabel: 'INICIAR REPARACIÓN' },
        en_reparacion: { label: 'EN REPARACIÓN', color: 'bg-pink-100 text-pink-700', next: 'finalizado', nextLabel: 'FINALIZAR SERVICIO' },
        pendiente_material: { label: 'PENDIENTE DE PIEZA', color: 'bg-orange-100 text-orange-800 border-orange-200', next: null },
        finalizado: { label: 'FINALIZADO', color: 'bg-green-100 text-green-700', next: null },
        cancelado: { label: 'CANCELADO', color: 'bg-red-100 text-red-700', next: null },
        rejected: { label: 'RECHAZADO', color: 'bg-red-100 text-red-700', next: null }
    };

    const currentStatus = statusMap[ticket.status] || statusMap['solicitado'];
    const { subtotal, vat, total } = ticket ? calculateTotal() : { subtotal: 0, vat: 0, total: 0 };
    const remaining = total - deposit;
    const isEditingAllowed = ticket && (ticket.status === 'en_diagnostico' || ticket.status === 'en_reparacion' || ticket.status === 'presupuesto_pendiente' || ticket.status === 'presupuesto_aceptado');

    return (
        <div className="pb-24">
            {/* Header */}
            <div className="flex items-center gap-4 mb-6 sticky top-0 bg-slate-50 py-4 z-10 transition-all">
                <button onClick={() => navigate('/tech/dashboard')} className="p-2 bg-white rounded-full shadow-sm text-slate-600">
                    <ChevronLeft size={24} />
                </button>
                <div className="flex-1">
                    <h1 className="text-xl font-bold leading-none">Servicio #{ticket.ticket_number}</h1>
                    <span className="text-sm text-slate-400">Detalle Completo</span>
                </div>
                {isEditingAllowed && (
                    <button onClick={saveChanges} className="p-2 bg-blue-600 text-white rounded-full shadow-lg active:scale-95">
                        <CheckCircle size={24} />
                    </button>
                )}
                {ticket.quote_pdf_url && (
                    <a href={ticket.quote_pdf_url} target="_blank" className="p-2 bg-yellow-100 text-yellow-700 rounded-full shadow-lg active:scale-95 ml-2 border border-yellow-200">
                        <FileText size={24} />
                    </a>
                )}
            </div>

            {/* Status Card */}
            <div className={`mb-6 p-6 rounded-2xl text-center border-2 ${currentStatus.color.replace('bg-', 'border-').replace('100', '200')} ${currentStatus.color} bg-opacity-30`}>
                <p className="text-xs font-bold opacity-70 mb-1 tracking-wider">ESTADO ACTUAL</p>
                <h2 className="text-3xl font-black tracking-tight">{currentStatus.label}</h2>

                {/* Cancellation Reason */}
                {(ticket.status === 'cancelado' || ticket.status === 'rejected') && ticket.client_feedback && (
                    <div className="mt-4 text-sm bg-white/50 p-2 rounded-lg border border-red-200/50 inline-block">
                        <span className="font-bold block text-xs opacity-70 uppercase mb-1">Motivo de Cancelación</span>
                        <span className="italic">"{ticket.client_feedback}"</span>
                    </div>
                )}
            </div>

            {/* BUDGET ORIGIN BANNER */}
            {(ticket.origin_source?.startsWith('Presupuesto') || ticket.quote_pdf_url) && (
                <div className="mb-6 bg-blue-50 border border-blue-100 rounded-xl p-4 flex items-center justify-between shadow-sm">
                    <div>
                        <p className="text-xs font-bold text-blue-600 uppercase tracking-wider mb-0.5">Origen: Presupuesto</p>
                        <p className="text-sm text-blue-800 font-medium">Este servicio proviene de una aceptación previa.</p>
                    </div>
                    {ticket.quote_pdf_url && (
                        <a
                            href={ticket.quote_pdf_url}
                            target="_blank"
                            rel="noreferrer"
                            className="bg-white text-blue-600 px-4 py-2 rounded-lg text-xs font-bold shadow-sm border border-blue-100 flex items-center gap-2 hover:bg-blue-600 hover:text-white transition"
                        >
                            <FileText size={16} /> Ver PDF Original
                        </a>
                    )}

                    {/* ASWO Link for Technicians */}
                    <a
                        href="https://shop.aswo.com/aswoShop/startPage.faces?storeId=520"
                        target="_blank"
                        rel="noreferrer"
                        className="bg-white text-slate-700 px-4 py-2 rounded-lg text-xs font-bold shadow-sm border border-slate-200 flex items-center gap-2 hover:bg-slate-800 hover:text-white transition group"
                    >
                        <PackagePlus size={16} className="text-blue-500 group-hover:text-yellow-400" />
                        Acceso ASWO
                    </a>
                </div>
            )}

            {/* Action Buttons (Workflow) */}
            {currentStatus.next && (
                <div className="space-y-3 mb-6">
                    {(() => {
                        // Restriction Logic: Prevent Technician from starting service if > 1h before appointment
                        let restrictionMsg = null;
                        const isTechnician = true; // Assuming this view is only for techs or we check role
                        // Only restrict 'solicitado' -> 'en_camino' or any start action if scheduled
                        if ((currentStatus.next === 'en_camino' || currentStatus.next === 'en_diagnostico') && ticket.scheduled_at) {
                            const now = new Date();
                            const apptTime = new Date(ticket.scheduled_at);
                            const diffMs = apptTime - now;
                            const diffHours = diffMs / (1000 * 60 * 60);

                            if (diffHours > 1) {
                                restrictionMsg = `Disponible 1h antes de la cita (${apptTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`;
                            }
                        }

                        return (
                            <>
                                {/* REPAIR ACTIONS */}
                                <button
                                    onClick={() => updateStatus(currentStatus.next)}
                                    disabled={updating || !!restrictionMsg}
                                    className={`w-full py-4 rounded-xl font-bold shadow-lg flex items-center justify-center gap-2 active:scale-[0.98] transition-all
                                        ${updating || restrictionMsg ? 'bg-slate-300 text-slate-500 cursor-not-allowed' : 'bg-slate-900 text-white shadow-slate-900/20'}
                                    `}
                                >
                                    {updating ? 'Procesando...' : currentStatus.nextLabel}
                                    {!updating && !restrictionMsg && <ArrowRightCircle size={20} />}
                                    {restrictionMsg && <Clock size={20} />}
                                </button>
                                {restrictionMsg && (
                                    <p className="text-center text-xs text-red-500 font-bold bg-red-50 py-2 rounded-lg border border-red-100">
                                        🚫 {restrictionMsg}
                                    </p>
                                )}


                            </>
                        );
                    })()}

                    {/* Secondary Action: GENERATE QUOTE */}
                    {ticket.status === 'en_diagnostico' && (
                        <button
                            onClick={handleGenerateQuote}
                            disabled={updating || generatingPdf}
                            className="w-full py-3 bg-white text-slate-700 border-2 border-slate-200 rounded-xl font-bold hover:bg-slate-50 flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
                        >
                            <FileText size={20} />
                            Generar Presupuesto
                        </button>
                    )}

                    {/* REGENERATE QUOTE (Fallback) */}
                    {ticket.status === 'presupuesto_pendiente' && !ticket.quote_pdf_url && (
                        <button
                            onClick={() => {
                                if (window.confirm("El PDF parece faltar. ¿Deseas regenerarlo ahora?")) {
                                    handleGenerateQuote();
                                }
                            }}
                            disabled={updating || generatingPdf}
                            className="w-full py-3 bg-amber-50 text-amber-700 border-2 border-amber-200 rounded-xl font-bold hover:bg-amber-100 flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
                        >
                            <AlertTriangle size={20} />
                            Regenerar PDF Presupuesto (Faltante)
                        </button>
                    )}

                    {/* REVALIDATE ACTION */}
                    {ticket.status === 'presupuesto_revision' && (
                        <button
                            onClick={async () => {
                                if (!window.confirm('¿Revalidar presupuesto por otros 15 días?')) return;
                                setUpdating(true);
                                try {
                                    await supabase.from('tickets').update({
                                        status: 'presupuesto_pendiente',
                                        quote_generated_at: new Date().toISOString()
                                    }).eq('id', id);
                                    await fetchTicket();
                                    alert('Presupuesto reactivado correctamente.');
                                } catch (e) { console.error(e); alert('Error reactivando.'); }
                                finally { setUpdating(false); }
                            }}
                            disabled={updating}
                            className="w-full py-3 bg-green-600 text-white rounded-xl font-bold shadow-lg hover:bg-green-700 flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
                        >
                            <CheckCircle size={20} />
                            Revalidar y Enviar al Cliente
                        </button>
                    )}
                </div>
            )}

            {/* TIMELINE LOG */}
            {ticket.status_history && ticket.status_history.length > 0 && (
                <div className="mb-6 bg-slate-50 rounded-xl p-4 border border-slate-100">
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                        <History size={14} /> Historial de Servicio
                    </h3>
                    <div className="space-y-3 relative before:absolute before:left-[7px] before:top-2 before:bottom-2 before:w-[2px] before:bg-slate-200">
                        {ticket.status_history.map((entry, idx) => (
                            <div key={idx} className="relative pl-6">
                                <div className="absolute left-0 top-1.5 w-4 h-4 rounded-full bg-white border-2 border-blue-400 z-10"></div>
                                <p className="text-sm font-bold text-slate-700">{entry.label}</p>
                                <p className="text-xs text-slate-400 flex items-center gap-1">
                                    <Clock size={10} />
                                    {new Date(entry.timestamp).toLocaleString()}
                                </p>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* ASWO Button (Only in Repair) */}
            {(ticket.status === 'en_reparacion' || ticket.status === 'en_diagnostico' || ticket.status === 'presupuesto_pendiente' || ticket.status === 'presupuesto_aceptado') && (
                <button
                    onClick={handleAswoSearch}
                    className="w-full py-4 bg-white text-blue-800 border-2 border-blue-100 rounded-xl font-bold shadow-sm mb-6 flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
                >
                    <Search size={20} />
                    Buscar en ASWO
                    <span className="text-xs font-normal opacity-60 ml-1">(Copia Modelo)</span>
                </button>
            )}

            {/* Client Card */}
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 mb-4">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                    <User size={14} /> Cliente
                </h3>

                <div className="mb-4">
                    <p className="font-bold text-lg text-slate-800">{ticket.client?.full_name}</p>
                    <p className="text-slate-500 text-sm">Cliente Particular</p>
                </div>

                <div className="flex gap-3 mb-4">
                    <button
                        onClick={() => handleCall(ticket.client?.phone)}
                        className="flex-1 py-2.5 bg-green-50 text-green-700 rounded-lg flex items-center justify-center gap-2 font-medium text-sm border border-green-100"
                    >
                        <PhoneCall size={16} /> Llamar
                    </button>
                    <button
                        onClick={() => handleOpenMap(ticket.client?.address)}
                        className="flex-1 py-2.5 bg-blue-50 text-blue-700 rounded-lg flex items-center justify-center gap-2 font-medium text-sm border border-blue-100"
                    >
                        <Navigation size={16} /> Mapa
                    </button>
                </div>

                <div className="space-y-3 pt-3 border-t border-slate-50">
                    <div className="flex items-start gap-3">
                        <MapPin size={16} className="text-slate-400 mt-1" />
                        <span className="text-sm text-slate-600">{ticket.client?.address}</span>
                    </div>
                    {ticket.client?.phone && (
                        <div className="flex items-start gap-3">
                            <Phone size={16} className="text-slate-400 mt-1" />
                            <span className="text-sm text-slate-600">{ticket.client?.phone}</span>
                        </div>
                    )}
                </div>
            </div>

            {/* Appliance Card */}
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                    <CheckCircle size={14} /> Aparato
                </h3>

                <div className="grid grid-cols-2 gap-4 mb-4">
                    <div className="bg-slate-50 p-3 rounded-lg">
                        <p className="text-[10px] text-slate-400 font-bold uppercase">Tipo</p>
                        <p className="font-medium text-slate-700">
                            {(ticket.appliance_info?.type === 'General' || (ticket.appliance_info?.type === 'Lavadora' && !ticket.appliance_info?.brand))
                                ? 'Varios / General'
                                : (ticket.appliance_info?.type || '-')}
                        </p>
                    </div>
                    <div className="bg-slate-50 p-3 rounded-lg">
                        <p className="text-[10px] text-slate-400 font-bold uppercase">Marca</p>
                        <p className="font-medium text-slate-700">
                            {(ticket.appliance_info?.type === 'General' || (ticket.appliance_info?.type === 'Lavadora' && !ticket.appliance_info?.brand))
                                ? '-'
                                : (ticket.appliance_info?.brand || '-')}
                        </p>
                    </div>
                </div>

                <div className="bg-slate-50 p-3 rounded-lg mb-4 flex justify-between items-center group relative cursor-pointer"
                    onClick={() => {
                        const model = ticket.appliance_info?.model;
                        if (model) {
                            navigator.clipboard.writeText(model);
                            alert('Modelo copiado!');
                        }
                    }}
                >
                    <div>
                        <p className="text-[10px] text-slate-400 font-bold uppercase">Modelo</p>
                        <p className="font-medium text-slate-700 font-mono">{ticket.appliance_info?.model || 'No registrado'}</p>
                    </div>
                    <Copy size={16} className="text-slate-300 group-hover:text-blue-500" />
                </div>

                {/* LABEL PHOTO BUTTON */}
                {ticket.appliance_info?.label_image_url && (
                    <button
                        onClick={() => setShowLabelModal(true)}
                        className="w-full py-2 bg-slate-100 text-slate-700 rounded-lg flex items-center justify-center gap-2 font-bold text-sm mb-4 hover:bg-slate-200 transition"
                    >
                        <Scan size={16} />
                        Ver / Escanear Etiqueta
                    </button>
                )}

                <div>
                    <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">Síntoma / Avería</p>
                    <p className="text-sm text-slate-600 leading-relaxed bg-slate-50 p-3 rounded-lg border border-slate-100">
                        {ticket.description_failure || ticket.description || 'Sin descripción detallada.'}
                    </p>
                </div>

                {/* AI Diagnosis Section */}
                {displayedDiagnosis && (
                    <div className="mt-4 bg-indigo-50/50 p-4 rounded-xl border border-indigo-100 relative overflow-hidden animate-in fade-in slide-in-from-bottom-2">
                        <div className="flex items-center gap-2 mb-2">
                            <div className={`p-1.5 rounded-lg ${isLive ? 'bg-indigo-100 text-indigo-600' : 'bg-blue-100 text-blue-600'}`}>
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" x2="12" y1="19" y2="22" /></svg>
                            </div>
                            <span className={`text-xs font-bold uppercase tracking-wider ${isLive ? 'text-indigo-700' : 'text-blue-700'}`}>
                                {isLive ? 'Sugerencia IA (Live)' : 'Diagnóstico IA'}
                            </span>
                        </div>
                        <p className="text-sm text-slate-700 leading-relaxed italic">
                            {displayedDiagnosis}
                        </p>
                    </div>
                )}
            </div>

            {/* Diagnosis & Solution Section */}
            {(ticket.status === 'en_diagnostico' || ticket.status === 'en_reparacion' || ticket.status === 'finalizado') && (
                <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 mb-4 animate-in fade-in slide-in-from-bottom-4">
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                        <Search size={14} /> Diagnóstico Técnico
                    </h3>

                    <div className="space-y-4">
                        <div>
                            <label className="block text-xs font-bold text-slate-600 mb-1">Diagnóstico de Avería</label>
                            <textarea
                                disabled={!isEditingAllowed}
                                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                rows={3}
                                placeholder="Describa qué falla técnica ha encontrado..."
                                value={diagnosis}
                                onChange={e => setDiagnosis(e.target.value)}
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-600 mb-1">Solución Propuesta</label>
                            <textarea
                                disabled={!isEditingAllowed}
                                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                rows={3}
                                placeholder="Describa la reparación a realizar..."
                                value={solution}
                                onChange={e => setSolution(e.target.value)}
                            />
                        </div>
                    </div>
                </div>
            )}

            {/* Budget / Financial Section */}
            {(ticket.status === 'en_diagnostico' || ticket.status === 'en_reparacion' || ticket.status === 'finalizado') && (
                <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 mb-4 animate-in fade-in slide-in-from-bottom-4">
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                        <Copy size={14} /> Presupuesto / Artículos
                    </h3>

                    {/* Labor List */}
                    <div className="mb-6">
                        <label className="block text-xs font-bold text-slate-600 mb-2">Mano de Obra / Servicios</label>
                        {labor.map(item => (
                            <div key={item.id} className="flex justify-between items-center py-2 border-b border-slate-50">
                                <span className="text-sm text-slate-700">{item.name}</span>
                                <div className="flex items-center gap-3">
                                    <span className="font-mono font-bold text-slate-800">{item.price}€</span>
                                    {isEditingAllowed && (
                                        <button onClick={() => removeLabor(item.id)} className="text-red-400 hover:text-red-600">
                                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /></svg>
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}

                        {isEditingAllowed && (
                            <div className="mt-2 flex flex-col sm:flex-row gap-2">
                                <select
                                    className="w-full sm:flex-1 p-3 sm:p-2 bg-slate-50 border border-slate-200 rounded-lg text-sm"
                                    value={selectedLaborId}
                                    onChange={e => setSelectedLaborId(e.target.value)}
                                >
                                    <option value="">Seleccionar Servicio...</option>
                                    {catalog.map(c => (
                                        <option key={c.id} value={c.id}>{c.name} - {c.base_price}€</option>
                                    ))}
                                </select>
                                <button
                                    onClick={addLabor}
                                    className="w-full sm:w-auto px-6 py-3 sm:py-2 bg-blue-100 text-blue-700 rounded-lg font-bold flex items-center justify-center hover:bg-blue-200 transition"
                                >
                                    + Añadir
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Parts List */}
                    <div className="mb-6">
                        <label className="block text-xs font-bold text-slate-600 mb-2">Materiales / Repuestos</label>
                        {parts.map(item => (
                            <div key={item.id} className={`flex flex-col py-3 border-b border-slate-50 ${item.request_admin ? 'bg-orange-50/50 -mx-2 px-2 rounded-lg border border-orange-100' : ''}`}>
                                <div className="flex justify-between items-center gap-2">
                                    <div className="flex-1">
                                        <span className="text-sm text-slate-700 font-medium block">{item.name}</span>
                                        {item.request_admin && <span className="text-[10px] text-orange-600 font-bold">Solicitado a Oficina</span>}
                                    </div>

                                    {/* Qty & Price Controls */}
                                    <div className="flex items-center gap-2">
                                        <div className="flex items-center bg-slate-50 rounded-lg border border-slate-200">
                                            <span className="text-[10px] text-slate-400 pl-2 font-bold">x</span>
                                            <input
                                                type="number"
                                                min="1"
                                                disabled={!isEditingAllowed}
                                                className="w-10 p-1 bg-transparent text-center text-sm font-bold text-slate-700 focus:outline-none"
                                                value={item.qty || 1}
                                                onChange={(e) => handlePartStatusChange(item.id, 'qty', parseFloat(e.target.value) || 1)}
                                            />
                                        </div>
                                        <div className="w-16 text-right">
                                            <span className="font-mono font-bold text-slate-800">{(item.price * (item.qty || 1)).toFixed(2)}€</span>
                                            <span className="block text-[10px] text-slate-400">{(item.price).toFixed(2)}€/ud</span>
                                        </div>

                                        {isEditingAllowed && (
                                            <button onClick={() => removePart(item.id)} className="text-red-400 hover:text-red-600 p-1">
                                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /></svg>
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {/* PART REQUEST CONTROLS */}
                                {isEditingAllowed && ticket.status === 'en_diagnostico' && (
                                    <div className="mt-2 flex items-center justify-between pt-2 border-t border-dashed border-slate-200">
                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={item.request_admin || false}
                                                onChange={(e) => handlePartStatusChange(item.id, 'request_admin', e.target.checked)}
                                                className="rounded text-orange-500 focus:ring-orange-500"
                                            />
                                            <span className="text-xs font-bold text-slate-500">Solicitar a Oficina</span>
                                        </label>

                                        {item.request_admin && (
                                            <div className="flex bg-white rounded-lg border border-slate-200 p-0.5">
                                                <button
                                                    onClick={() => handlePartStatusChange(item.id, 'priority', 'normal')}
                                                    className={`px-2 py-1 text-[10px] font-bold rounded-md transition ${!item.priority || item.priority === 'normal' ? 'bg-slate-200 text-slate-700' : 'text-slate-400'}`}
                                                >
                                                    Normal
                                                </button>
                                                <button
                                                    onClick={() => handlePartStatusChange(item.id, 'priority', 'urgent')}
                                                    className={`px-2 py-1 text-[10px] font-bold rounded-md transition ${item.priority === 'urgent' ? 'bg-red-500 text-white' : 'text-slate-400'}`}
                                                >
                                                    Urgente
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        ))}

                        {isEditingAllowed && (
                            <div className="mt-2 flex flex-col sm:flex-row gap-2">
                                <input
                                    type="text"
                                    placeholder="Nombre pieza"
                                    className="w-full sm:flex-[2] p-2 bg-slate-50 border border-slate-200 rounded-lg text-sm"
                                    value={newPart.name}
                                    onChange={e => setNewPart({ ...newPart, name: e.target.value })}
                                />
                                <div className="flex gap-2">
                                    <div className="w-20 sm:w-16">
                                        <input
                                            type="number"
                                            min="1"
                                            placeholder="Cant."
                                            className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-center"
                                            value={newPart.qty}
                                            onChange={e => setNewPart({ ...newPart, qty: e.target.value })}
                                        />
                                    </div>
                                    <div className="flex-1 sm:w-24 relative">
                                        <input
                                            type="number"
                                            placeholder="€"
                                            className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-sm"
                                            value={newPart.price}
                                            onChange={e => setNewPart({ ...newPart, price: e.target.value })}
                                        />
                                    </div>
                                    <button
                                        onClick={addPart}
                                        className="w-12 sm:w-auto px-3 bg-blue-100 text-blue-700 rounded-lg font-bold flex items-center justify-center"
                                    >
                                        +
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Totals Calculation */}
                    <div className="bg-slate-50 p-4 rounded-xl space-y-2 border border-slate-200">
                        <div className="flex justify-between text-sm text-slate-500">
                            <span>Subtotal Neto</span>
                            <span>{subtotal.toFixed(2)}€</span>
                        </div>
                        <div className="flex justify-between text-sm text-slate-500">
                            <span>IVA (21%)</span>
                            <span>{vat.toFixed(2)}€</span>
                        </div>
                        <div className="flex justify-between items-center text-base font-bold text-slate-800 pt-2 border-t border-slate-200">
                            <span>TOTAL PRESUPUESTO</span>
                            <span className="text-lg">{total.toFixed(2)}€</span>
                        </div>
                    </div>

                    {/* Deposit & Payments (Hidden in Repair Phase) */}
                    {ticket.status !== 'en_reparacion' && (
                        <div className="mt-4 pt-4 border-t border-slate-100">
                            <label className="block text-xs font-bold text-slate-600 mb-2">Pagos a Cuenta / Señal</label>
                            <div className="flex gap-2 items-center mb-2">
                                <input
                                    type="number"
                                    disabled={!isEditingAllowed}
                                    className="w-full p-2 border border-slate-200 rounded-lg font-mono text-slate-800"
                                    value={deposit}
                                    onChange={e => setDeposit(parseFloat(e.target.value) || 0)}
                                />
                                <span className="text-sm font-bold text-slate-400">€</span>
                            </div>

                            {deposit > 0 && (
                                <div className="bg-green-50 text-green-800 p-3 rounded-lg text-sm border border-green-100 flex justify-between items-center font-bold">
                                    <div>
                                        <span className="block text-xs font-normal opacity-70">A cuenta</span>
                                        <span>-{deposit.toFixed(2)}€</span>
                                    </div>
                                    <div className="text-right">
                                        <span className="block text-xs font-normal opacity-70 text-slate-500">Restante</span>
                                        <span className="text-lg">{remaining > 0 ? remaining.toFixed(2) : '0.00'}€</span>
                                    </div>
                                </div>
                            )}

                            {/* DEPOSIT RECEIPT BUTTON */}
                            {deposit > 0 && (ticket.status === 'en_diagnostico' || ticket.status === 'en_reparacion') && (
                                <div className="mt-2 text-right">
                                    <button
                                        onClick={handleGenerateReceipt}
                                        disabled={generatingReceipt}
                                        className="inline-flex items-center gap-1 text-xs bg-slate-100 text-slate-600 px-3 py-1.5 rounded-lg font-bold hover:bg-slate-200 transition-colors"
                                    >
                                        {generatingReceipt ? (
                                            <div className="w-3 h-3 border-2 border-slate-400 border-t-transparent rounded-full animate-spin"></div>
                                        ) : (
                                            <FileText size={12} />
                                        )}
                                        Generar Recibo de Señal
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* MOVED: PENDING MATERIAL WORKFLOW (Placed after Financials) */}
            {ticket.status === 'en_diagnostico' && (
                <div className="bg-orange-50 rounded-2xl p-5 shadow-sm border border-orange-100 mb-4 animate-in fade-in slide-in-from-bottom-4">
                    <h3 className="text-xs font-bold text-orange-800 uppercase tracking-wider mb-4 flex items-center gap-2">
                        <PackagePlus size={14} /> Solicitar Repuesto / Material
                    </h3>
                    <p className="text-xs text-orange-700 mb-4">
                        Si necesitas pedir material y el cliente ha pagado a cuenta, usa esta sección para <strong>pausar el servicio</strong> hasta que llegue el repuesto.
                    </p>

                    <div className="space-y-4 mb-4">
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">Descripción del Repuesto *</label>
                            <div className="relative">
                                <input
                                    type="text"
                                    value={ticket.required_parts_description || ''}
                                    onChange={(e) => setTicket({ ...ticket, required_parts_description: e.target.value })}
                                    placeholder="Ej: Bomba de desagüe Samsung..."
                                    className="w-full p-3 bg-white border border-orange-200 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 outline-none pr-10"
                                />
                                {parts.length > 0 && !ticket.required_parts_description && (
                                    <button
                                        onClick={() => setTicket({ ...ticket, required_parts_description: parts.map(p => p.name).join(', ') })}
                                        className="absolute right-2 top-1/2 -translate-y-1/2 text-orange-500 hover:text-orange-700 p-1"
                                        title="Copiar repuestos añadidos"
                                    >
                                        <Copy size={16} />
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Note: Deposit logic is shared with the budget section above, keeping them synced in state 'deposit' */}
                        <div className="bg-white p-3 rounded-xl border border-orange-200">
                            <label className="block text-xs font-bold text-slate-500 mb-1">Total Pagado a Cuenta (€) *</label>
                            <div className="flex gap-2 items-center">
                                <input
                                    type="number"
                                    value={deposit}
                                    onChange={(e) => setDeposit(Number(e.target.value))}
                                    placeholder="0.00"
                                    className="w-full p-2 font-mono font-bold text-lg text-slate-800 border-none focus:ring-0"
                                />
                                <span className="text-slate-400 font-bold">€</span>
                            </div>
                            <p className="text-[10px] text-slate-400 mt-1">Asegúrate de que este importe coincide con lo cobrado.</p>
                        </div>
                    </div>

                    <button
                        onClick={async () => {
                            // AUTO-FILL: If description is empty but parts exist, auto-fill it before submitting
                            let finalDesc = ticket.required_parts_description;
                            if (!finalDesc && parts.length > 0) {
                                finalDesc = parts.map(p => p.name).join(', ');
                                setTicket(prev => ({ ...prev, required_parts_description: finalDesc }));
                            }

                            if (!finalDesc || !deposit) {
                                alert('Para solicitar material es obligatorio indicar la pieza y el importe pagado a cuenta.');
                                return;
                            }
                            if (!window.confirm('¿Confirmas que el cliente ha pagado esa cantidad y quieres dejar el servicio en espera de material?')) return;

                            setUpdating(true);
                            try {
                                // 1. Update data cols
                                await supabase.from('tickets').update({
                                    required_parts_description: ticket.required_parts_description,
                                    deposit_amount: deposit,
                                    material_status_at: new Date().toISOString()
                                }).eq('id', ticket.id);

                                // 2. Change status
                                await updateStatus('pendiente_material');
                                alert('Servicio pausado por material correctamente.');
                                navigate('/tech/dashboard');
                            } catch (e) {
                                console.error(e);
                                alert('Error: ' + e.message);
                                setUpdating(false);
                            }
                        }}
                        disabled={updating}
                        className="w-full py-4 bg-orange-600 text-white rounded-xl font-bold hover:bg-orange-700 shadow-lg shadow-orange-200 flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
                    >
                        <History size={18} />
                        Confirmar Pago y Pedir Material
                    </button>
                </div>
            )}

            {/* Payment Check & PDF - Only at End */}
            {(ticket.status === 'en_reparacion' || ticket.status === 'finalizado') && (
                <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 mb-4 animate-in fade-in slide-in-from-bottom-4">
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Cobro y Documentación</h3>

                    <div className="flex flex-col gap-3">
                        <label className="flex items-center gap-3 p-3 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50 transition-colors">
                            <input
                                type="checkbox"
                                checked={isPaid}
                                onChange={e => setIsPaid(e.target.checked)}
                                className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500"
                            />
                            <span className={`font-bold ${isPaid ? 'text-green-600' : 'text-slate-600'}`}>
                                {isPaid ? 'SERVICIO COBRADO' : 'PENDIENTE DE COBRO'}
                            </span>
                        </label>

                        {isPaid && (
                            <>
                                <select
                                    className="w-full p-2 border border-slate-200 rounded-lg text-sm bg-white"
                                    value={paymentMethod}
                                    onChange={e => setPaymentMethod(e.target.value)}
                                >
                                    <option value="cash">Efectivo</option>
                                    <option value="card">Tarjeta</option>
                                    <option value="bizum">Bizum</option>
                                    <option value="transfer">Transferencia</option>
                                </select>

                                {/* PAYMENT PROOF UPLOAD */}
                                {paymentMethod !== 'cash' && (
                                    <div className="mt-2 animate-in fade-in">
                                        <label className="block text-xs font-bold text-slate-600 mb-2">
                                            Justificante de Pago
                                        </label>
                                        {!paymentProofUrl ? (
                                            <div className="relative">
                                                <input
                                                    type="file"
                                                    accept="image/*"
                                                    capture="environment"
                                                    onChange={handleFileUpload}
                                                    disabled={uploadingProof}
                                                    className="hidden"
                                                    id="payment-proof-upload"
                                                />
                                                <label
                                                    htmlFor="payment-proof-upload"
                                                    className={`w-full py-4 border-2 border-dashed rounded-xl flex flex-col items-center justify-center gap-2 cursor-pointer transition-all ${uploadingProof
                                                        ? 'bg-slate-50 border-slate-200'
                                                        : 'bg-blue-50 border-blue-200 hover:bg-blue-100'
                                                        }`}
                                                >
                                                    {uploadingProof ? (
                                                        <span className="text-xs font-bold text-slate-500">Subiendo...</span>
                                                    ) : (
                                                        <>
                                                            <Camera className="text-blue-500" size={24} />
                                                            <span className="text-xs font-bold text-blue-700">Hacer Foto / Subir</span>
                                                        </>
                                                    )}
                                                </label>
                                            </div>
                                        ) : (
                                            <div className="flex items-center justify-between p-3 bg-green-50 rounded-xl border border-green-100">
                                                <div className="flex items-center gap-2">
                                                    <CheckCircle size={16} className="text-green-600" />
                                                    <span className="text-sm font-bold text-green-700">Justificante Guardado</span>
                                                </div>
                                                <button onClick={() => setPaymentProofUrl('')} className="text-xs text-red-500 font-bold underline">Eliminar</button>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </>
                        )}

                        {/* PDF GENERATION BUTTON */}
                        <div className="pt-4 mt-2 border-t border-slate-100 flex flex-col gap-3">
                            {ticket.pdf_url && (
                                <a
                                    href={ticket.pdf_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="w-full py-3 bg-red-50 text-red-700 border border-red-100 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-red-100 transition"
                                >
                                    <FileText size={20} />
                                    <span>Ver Parte Actual (PDF)</span>
                                </a>
                            )}

                            <button
                                onClick={handleGeneratePDF}
                                disabled={generatingPdf}
                                className={`w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2 shadow-sm active:scale-[0.98] transition-all ${ticket.pdf_url
                                    ? 'bg-white text-slate-700 border-2 border-slate-200 hover:bg-slate-50'
                                    : 'bg-slate-800 text-white hover:bg-slate-900'
                                    }`}
                            >
                                {generatingPdf ? (
                                    <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                ) : (
                                    <FileText size={20} />
                                )}
                                <span>{ticket.pdf_url ? 'Regenerar PDF (Actualizar Datos)' : 'Generar Parte de Trabajo'}</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {isEditingAllowed && (
                <div className="fixed bottom-0 left-0 right-0 p-4 bg-white/80 backdrop-blur-md border-t border-slate-200 flex justify-center z-40">
                    <button
                        onClick={saveChanges}
                        className="w-full max-w-md bg-blue-600 text-white font-bold py-3.5 rounded-xl shadow-lg active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                    >
                        <CheckCircle size={20} />
                        Guardar Cambios
                    </button>
                </div>
            )}

            {/* LABEL OCR MODAL */}
            {showLabelModal && (
                <div className="fixed inset-0 bg-black/90 z-50 flex flex-col animate-in fade-in">
                    {/* Header */}
                    <div className="flex justify-between items-center p-4 text-white">
                        <h3 className="font-bold">Etiqueta del Aparato</h3>
                        <button onClick={() => setShowLabelModal(false)} className="p-2 bg-white/10 rounded-full">
                            <span className="sr-only">Cerrar</span>
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                        </button>
                    </div>

                    {/* Image Area */}
                    <div className="flex-1 overflow-auto flex items-center justify-center bg-black p-4">
                        <img
                            src={ticket.appliance_info?.label_image_url}
                            alt="Etiqueta"
                            className="max-w-full max-h-[60vh] object-contain rounded-lg"
                        />
                    </div>

                    {/* OCR Controls */}
                    <div className="bg-slate-900 p-6 rounded-t-3xl border-t border-slate-800">
                        {/* ASWO Credentials Helper */}
                        <div className="mb-4 bg-slate-800 p-3 rounded-lg flex justify-between items-center border border-slate-700">
                            <div>
                                <p className="text-[10px] text-slate-400 font-bold uppercase">Credenciales ASWO</p>
                                <div className="flex gap-4 text-sm font-mono text-slate-200">
                                    <span>C: 57384-004</span>
                                    <span>P: reda1427</span>
                                </div>
                            </div>
                            <button
                                onClick={() => {
                                    navigator.clipboard.writeText("57384-004\nreda1427");
                                    alert("Credenciales copiadas!");
                                }}
                                className="p-2 bg-slate-700 rounded text-slate-300 hover:text-white"
                            >
                                <ClipboardCopy size={16} />
                            </button>
                        </div>

                        {!ocrText ? (
                            <button
                                onClick={handleScanLabel}
                                disabled={scanningLabel}
                                className="w-full py-4 bg-blue-600 text-white rounded-xl font-bold flex items-center justify-center gap-2"
                            >
                                {scanningLabel ? (
                                    <>
                                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                        Escaneando Texto...
                                    </>
                                ) : (
                                    <>
                                        <Scan size={20} />
                                        Detectar Texto (OCR)
                                    </>
                                )}
                            </button>
                        ) : (
                            <div className="animate-in slide-in-from-bottom-4">
                                <div className="flex justify-between items-center mb-2">
                                    <label className="text-xs font-bold text-slate-400 uppercase">Texto Detectado</label>
                                    <button onClick={() => setOcrText('')} className="text-xs text-blue-400">Re-escanear</button>
                                </div>
                                <textarea
                                    className="w-full h-24 bg-slate-800 rounded-lg border border-slate-700 text-white p-3 text-sm font-mono focus:ring-2 focus:ring-blue-500 outline-none mb-3"
                                    value={ocrText}
                                    onChange={(e) => setOcrText(e.target.value)}
                                ></textarea>
                                <button
                                    onClick={() => {
                                        navigator.clipboard.writeText(ocrText);
                                        alert("Texto copiado al portapapeles");
                                        setShowLabelModal(false);
                                    }}
                                    className="w-full py-3 bg-white text-slate-900 rounded-xl font-bold flex items-center justify-center gap-2"
                                >
                                    <Copy size={18} />
                                    Copiar y Salir
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}
            {/* GPS Tracker Component - Invisible unless status matches */}
            {ticket && user && (
                <TechLocationTracker
                    ticketStatus={ticket.status}
                    technicianId={user.id}
                />
            )}
        </div>
    );
};

export default TechTicketDetail;
