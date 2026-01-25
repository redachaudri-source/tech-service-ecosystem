import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { generateServiceReport, generateDepositReceipt, loadImage } from '../../utils/pdfGenerator';
import {
    ChevronLeft, MapPin, Phone, User,
    Navigation, PhoneCall, CheckCircle,
    Eye, Scan, AlertTriangle, ClipboardCopy, Clock, History, Package, ArrowRightCircle, Copy, FileText, Search, PackagePlus, Calendar, ChevronDown, Camera, Smartphone, Banknote, ShieldCheck, ShieldAlert, AlertCircle
} from 'lucide-react';
import Tesseract from 'tesseract.js';
import TechLocationMap from '../../components/TechLocationMap';
import ErrorBoundary from '../../components/ErrorBoundary';
import SignaturePad from '../../components/SignaturePad';
import ServiceCompletionModal from '../../components/ServiceCompletionModal'; // NEW ROBUST MODAL
import SendPdfModal from '../../components/SendPdfModal'; // PDF Delivery Modal
import { useAuth } from '../../context/AuthContext';
import { useGeolocation } from '../../hooks/useGeolocation';
import { useLocationTracking } from '../../hooks/useLocationTracking';



const TechTicketDetail = () => {
    const { id } = useParams();
    // Real-time Ticket Subscription
    useEffect(() => {
        if (!id) return;

        const channel = supabase
            .channel(`ticket-detail-${id}`)
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'tickets',
                    filter: `id=eq.${id}`
                },
                (payload) => {
                    console.log('Real-time update received:', payload);
                    setTicket((current) => {
                        // Protect against race conditions: if ticket isn't loaded yet, ignore update
                        // (it will be loaded by fetchTicket with full relations shortly)
                        if (!current) return current;

                        // Merge update while preserving existing joined relations (client, etc.)
                        return { ...current, ...payload.new };
                    });
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [id]);
    const { user } = useAuth();
    const navigate = useNavigate();
    const [ticket, setTicket] = useState(null);

    // GPS Tracking Hook - auto-starts when status is 'en_camino'
    const { isTracking, error: gpsError } = useLocationTracking(
        ticket?.status === 'en_camino',
        user?.id
    );

    // Debug: Log when isTracking changes
    useEffect(() => {
        console.log('🎯 TechTicketDetail - isTracking changed:', isTracking, 'status:', ticket?.status);
    }, [isTracking, ticket?.status]);
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
    const [budgetDecision, setBudgetDecision] = useState(null); // 'accepted', 'rejected'
    const [showSignaturePad, setShowSignaturePad] = useState(false);
    const [showSuccessModal, setShowSuccessModal] = useState(false); // NEW ROBUST SUCCESS
    const [completionType, setCompletionType] = useState('standard'); // 'standard' | 'warranty'
    const [signaturePurpose, setSignaturePurpose] = useState('budget'); // 'budget' | 'closing'

    // SendPdfModal State
    const [sendPdfModal, setSendPdfModal] = useState({
        isOpen: false,
        pdfUrl: '',
        pdfName: ''
    });

    // UI Helper State
    const [newPart, setNewPart] = useState({ name: '', price: '', qty: 1 });
    const [selectedLaborId, setSelectedLaborId] = useState('');
    const [diagnosisPrice, setDiagnosisPrice] = useState(30);
    const [diagnosisMethod, setDiagnosisMethod] = useState('CASH'); // CASH, CARD



    // OCR State
    const [showLabelModal, setShowLabelModal] = useState(false);
    const [scanningLabel, setScanningLabel] = useState(false);
    const [ocrText, setOcrText] = useState('');
    const [ocrConfidence, setOcrConfidence] = useState(0);

    // Bypass & Profile State
    const [techProfile, setTechProfile] = useState(null);
    // --- FINANCIAL LIMITS (MORTIFY "EL CHIVATO") ---
    const [financialLimit, setFinancialLimit] = useState(null);

    useEffect(() => {
        const fetchLimit = async () => {
            const appId = ticket?.appliance_id || ticket?.appliance_info?.id;
            if (!appId) return;

            const { data } = await supabase.rpc('fn_get_appliance_financial_limit', {
                p_appliance_id: appId
            });
            if (data && data.length > 0) {
                setFinancialLimit(data[0]);
            }
        };
        fetchLimit();
    }, [ticket?.appliance_id, ticket?.appliance_info]);


    // --- FINANCIAL LIMITS (MORTIFY "EL CHIVATO") ---
    // Moved up to avoid duplicates

    // --- WARRANTY CONFIGURATION ---
    const [warrantyLabor, setWarrantyLabor] = useState(3); // Months
    const [warrantyParts, setWarrantyParts] = useState(24); // Months

    useEffect(() => {
        const fetchProfile = async () => {
            if (!user) return;
            const { data } = await supabase.from('profiles').select('bypass_time_restrictions').eq('id', user.id).single();
            if (data) setTechProfile(data);
        };
        fetchProfile();
    }, [user]);

    const fetchTicket = async () => {
        try {
            const { data, error } = await supabase
                .from('tickets')
                .select(`
                    *,
                    client:profiles!client_id (
                        full_name,
                        address,
                        phone,
                        phone_2,
                        email,
                        user_id,
                        id,
                        has_mortify,
                        latitude,
                        longitude
                    )
                `)
                .eq('id', id)
                .single();

            if (error) throw error;
            setTicket(data);

            // Init State from DB
            // Init State from DB (Safe JSON Parse)
            const safeParse = (str) => {
                try {
                    return str ? (typeof str === 'string' ? JSON.parse(str) : str) : [];
                } catch (e) {
                    console.error("JSON Parse Error", e);
                    return [];
                }
            };

            setDiagnosis(data.tech_diagnosis || '');
            setSolution(data.tech_solution || '');
            setParts(safeParse(data.parts_list));
            setLabor(safeParse(data.labor_list));
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

    // --- REAL-TIME GPS BROADCASTING ---
    useEffect(() => {
        let watchId;
        const minimumDistance = 10; // Meters to trigger update (approx)
        let lastLat = 0;
        let lastLng = 0;
        let lastUpdate = 0;

        if (ticket && ticket.status === 'en_camino' && user) {
            if (!('geolocation' in navigator)) {
                console.warn('Geolocation not supported');
                return;
            }

            console.log('Starting GPS Tracking...');

            const updateLocation = async (lat, lng) => {
                const now = Date.now();
                // Throttle updates: max once every 5 seconds
                if (now - lastUpdate < 5000) return;

                console.log('Broadcasting Location:', lat, lng);
                try {
                    await supabase
                        .from('profiles')
                        .update({
                            current_lat: lat,
                            current_lng: lng,
                            last_location_update: new Date().toISOString()
                        })
                        .eq('user_id', user.id);

                    lastUpdate = now;
                    lastLat = lat;
                    lastLng = lng;
                } catch (err) {
                    console.error('Error updating location:', err);
                }
            };

            watchId = navigator.geolocation.watchPosition(
                (position) => {
                    const { latitude, longitude } = position.coords;
                    updateLocation(latitude, longitude);
                },
                (error) => {
                    console.error('GPS Error:', error);
                },
                {
                    enableHighAccuracy: true,
                    maximumAge: 10000,
                    timeout: 5000
                }
            );
        } else {
            // Stop watching if status changes or component unmounts
            if (watchId) {
                console.log('Stopping GPS Tracking');
                navigator.geolocation.clearWatch(watchId);
            }
        }

        return () => {
            if (watchId) navigator.geolocation.clearWatch(watchId);
        };
    }, [ticket?.status, user]); // Depend on status and user

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
            rejected: 'Rechazado',
            PENDING_PAYMENT: 'Pendiente de Cobro'
        };
        return map[s] || s;
    };

    const updateStatus = async (newStatus, extraFields = {}) => {
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

            // Calculate Final Price (Logic duplicated from render/PDF)
            const partsTotal = parts.reduce((sum, p) => sum + (Number(p.price) * (Number(p.qty) || 1)), 0);
            const laborTotal = labor.reduce((sum, l) => sum + (Number(l.price) * (Number(l.qty) || 1)), 0);
            const subtotal = partsTotal + laborTotal;
            const finalPrice = subtotal * 1.21;

            // Save current data state AND new status/history
            // Try updating WITH history first (assuming schema is up to date)
            const { error } = await supabase.from('tickets').update({
                status: newStatus,
                status_history: updatedHistory,
                updated_at: new Date().toISOString(),
                // Ensure data persistence
                tech_diagnosis: diagnosis,
                tech_solution: solution,
                parts_list: parts,
                labor_list: labor,
                final_price: finalPrice,
                ...extraFields
            }).eq('id', id);

            if (error) throw error;

            // Refresh local state
            setTicket(prev => ({ ...prev, status: newStatus, status_history: updatedHistory, ...extraFields }));

            // If finalized, maybe navigate or just show success
            if (newStatus === 'finalizado') {
                navigate('/tech/dashboard');
            }

        } catch (error) {
            console.error('Error updating status:', error);
            alert('Error actualizando estado: ' + error.message);
        } finally {
            setUpdating(false);
        }
    };



    const handleCancelService = async () => {
        const reason = window.prompt("⚠️ CANCELACIÓN DE SERVICIO\n\nPor favor, indica el motivo de la cancelación/visita fallida:\n(Ej: Cliente no está, rechaza reparación, etc.)");
        if (reason === null) return; // Cancelled
        if (!reason || reason.trim().length < 5) return alert("El motivo debe ser más detallado.");

        if (!window.confirm("¿Seguro que deseas CANCELAR este servicio?\n\nEsta acción registrará el motivo y cerrará el ticket.")) return;

        await updateStatus('cancelado', {
            client_feedback: reason || 'Cancelado por técnico',
            cancellation_reason: reason
        });
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
            const sealImg = settings?.company_signature_url ? await loadImage(settings.company_signature_url) : null;
            const currentData = getCurrentTicketData();
            const doc = generateServiceReport(currentData, logoImg, { isQuote: true, companySealImg: sealImg });
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

            // 6. Open SendPdfModal for delivery
            setSendPdfModal({
                isOpen: true,
                pdfUrl: publicUrl,
                pdfName: `Presupuesto ${ticket.ticket_number}`
            });

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

    const handleGeneratePDF = async (type = 'standard') => {
        if (!ticket) return;
        setGeneratingPdf(true);
        try {
            const logoImg = settings?.logo_url ? await loadImage(settings.logo_url) : null;
            const signatureImg = ticket.client_signature_url ? await loadImage(ticket.client_signature_url) : null;
            const sealImg = settings?.company_signature_url ? await loadImage(settings.company_signature_url) : null;
            const currentData = getCurrentTicketData(); // USE LOCAL STATE

            // 1. Generate PDF Blob
            const title = type === 'warranty' ? 'PARTE DE GARANTÍA' : undefined;
            const doc = generateServiceReport(currentData, logoImg, { signatureImg, title, companySealImg: sealImg });
            const pdfBlob = doc.output('blob');

            // 2. Upload to Supabase
            const prefix = type === 'warranty' ? 'warranty_' : 'report_';
            const fileName = `${prefix}${ticket.ticket_number}_${Date.now()}.pdf`;
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
            const updateFields = type === 'warranty'
                ? { warranty_pdf_url: publicUrl }
                : { pdf_url: publicUrl, pdf_generated_at: new Date().toISOString() };

            const { error: dbError } = await supabase
                .from('tickets')
                .update(updateFields)
                .eq('id', id);

            if (dbError) throw dbError;

            // 5. Update Local State
            if (type === 'warranty') {
                setTicket(prev => ({ ...prev, warranty_pdf_url: publicUrl }));
            } else {
                setTicket(prev => ({ ...prev, pdf_url: publicUrl }));
            }

            // 6. Open SendPdfModal for delivery
            const pdfTypeName = type === 'warranty' ? 'Garantía' : 'Parte de Trabajo';
            setSendPdfModal({
                isOpen: true,
                pdfUrl: publicUrl,
                pdfName: `${pdfTypeName} ${ticket.ticket_number}`
            });

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
            const sealImg = settings?.company_signature_url ? await loadImage(settings.company_signature_url) : null;

            // Use getCurrentTicketData() to ensure we use the LATEST deposit amount from the input field
            const currentData = getCurrentTicketData();

            // 1. Generate PDF
            const doc = generateDepositReceipt(currentData, logoImg, null, sealImg);
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

            // 5. Open SendPdfModal for delivery
            setSendPdfModal({
                isOpen: true,
                pdfUrl: publicUrl,
                pdfName: `Recibo Señal ${ticket.ticket_number}`
            });

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

    if (loading) return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50">
            <div className="flex flex-col items-center gap-4">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                <p className="text-slate-500 animate-pulse">Cargando servicio...</p>
            </div>
        </div>
    );

    if (!ticket) return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
            <div className="text-center max-w-md">
                <div className="bg-red-50 text-red-500 p-4 rounded-full inline-block mb-4">
                    <AlertTriangle size={32} />
                </div>
                <h2 className="text-xl font-bold text-slate-800 mb-2">Ticket no disponible</h2>
                <p className="text-slate-500 mb-6">
                    No se pudo cargar la información del servicio. Puede que haya sido eliminado o no tengas permisos para verlo.
                </p>
                <div className="flex gap-3 justify-center">
                    <button
                        onClick={() => navigate('/tech/dashboard')}
                        className="px-6 py-2 bg-slate-200 text-slate-700 rounded-lg font-bold"
                    >
                        Volver
                    </button>
                    <button
                        onClick={fetchTicket}
                        className="px-6 py-2 bg-blue-600 text-white rounded-lg font-bold"
                    >
                        Reintentar
                    </button>
                </div>
            </div>
        </div>
    );

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
        rejected: { label: 'RECHAZADO', color: 'bg-red-100 text-red-700', next: null },
        PENDING_PAYMENT: { label: 'PENDIENTE DE COBRO', color: 'bg-red-600 text-white shadow-red-200 animate-pulse', next: null }
    };

    const currentStatus = statusMap[ticket.status] || statusMap['solicitado'];
    const { subtotal, vat, total } = ticket ? calculateTotal() : { subtotal: 0, vat: 0, total: 0 };
    const remaining = total - deposit;
    const isOverLimit = (ticket.client?.has_mortify) && financialLimit && total > financialLimit.remaining_budget;
    const isEditingAllowed = ticket && (ticket.status === 'en_diagnostico' || ticket.status === 'en_reparacion' || ticket.status === 'presupuesto_pendiente' || ticket.status === 'presupuesto_aceptado');

    return (
        <div className="pb-24">
            {/* Header */}
            <div className={`flex items-center gap-4 mb-6 sticky top-0 py-4 z-10 transition-all ${ticket.is_warranty ? 'bg-purple-100 border-b border-purple-200 px-4 -mx-4' : 'bg-slate-50'}`}>
                <button onClick={() => navigate('/tech/dashboard')} className="p-2 bg-white rounded-full shadow-sm text-slate-600 hover:bg-slate-100 transition">
                    <ChevronLeft size={24} />
                </button>
                <div className="flex-1">
                    <h1 className={`text-xl font-bold leading-none flex items-center gap-2 ${ticket.is_warranty ? 'text-purple-800' : 'text-slate-800'}`}>
                        {ticket.is_warranty && <ShieldAlert size={20} className="text-purple-600" />}
                        {ticket.is_warranty ? `GARANTÍA #${ticket.ticket_number}` : `Servicio #${ticket.ticket_number}`}
                    </h1>
                    <span className={`text-sm ${ticket.is_warranty ? 'text-purple-600 font-medium' : 'text-slate-400'}`}>
                        {ticket.is_warranty ? 'Reclamación de Garantía' : 'Detalle Completo'}
                    </span>
                </div>
                {isEditingAllowed && (
                    <button onClick={saveChanges} className="p-2 bg-blue-600 text-white rounded-full shadow-lg active:scale-95 hover:bg-blue-700 transition">
                        <CheckCircle size={24} />
                    </button>
                )}
                {ticket.quote_pdf_url && (
                    <a href={ticket.quote_pdf_url} target="_blank" rel="noreferrer" className="p-2 bg-yellow-100 text-yellow-700 rounded-full shadow-lg active:scale-95 ml-2 border border-yellow-200 hover:bg-yellow-200 transition">
                        <FileText size={24} />
                    </a>
                )}
                {/* Material Deposit PDF Link */}
                {ticket.material_deposit_pdf_url && (
                    <a href={ticket.material_deposit_pdf_url} target="_blank" rel="noreferrer" className="p-2 bg-orange-100 text-orange-700 rounded-full shadow-lg active:scale-95 ml-2 border border-orange-200 hover:bg-orange-200 transition" title="Ver Recibo de Material">
                        <Package size={24} />
                    </a>
                )}
            </div>

            {/* Status Card */}
            <div className={`mb-6 p-6 rounded-2xl text-center border-2 ${currentStatus.color.replace('bg-', 'border-').replace('100', '200')} ${currentStatus.color} bg-opacity-30`}>
                <p className="text-xs font-bold opacity-70 mb-1 tracking-wider">ESTADO ACTUAL</p>
                <h2 className="text-3xl font-black tracking-tight">{currentStatus.label}</h2>

                {/* Cancellation Reason */}
                {
                    (ticket.status === 'cancelado' || ticket.status === 'rejected') && ticket.client_feedback && (
                        <div className="mt-4 text-sm bg-white/50 p-2 rounded-lg border border-red-200/50 inline-block">
                            <span className="font-bold block text-xs opacity-70 uppercase mb-1">Motivo de Cancelación</span>
                            <span className="italic">"{ticket.client_feedback}"</span>
                        </div>
                    )
                }
            </div >

            {/* GPS Tracking Indicator */}
            {ticket.status === 'en_camino' && isTracking && (
                <div className="mb-6 flex items-center justify-center gap-2 px-4 py-3 bg-green-50 border-2 border-green-200 rounded-xl">
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                    <span className="text-sm font-bold text-green-700">
                        📡 Ubicación compartida con el cliente
                    </span>
                </div>
            )}
            {gpsError && (
                <div className="mb-6 flex items-center justify-center gap-2 px-4 py-3 bg-red-50 border-2 border-red-200 rounded-xl">
                    <AlertCircle size={16} className="text-red-600" />
                    <span className="text-sm font-bold text-red-700">
                        {gpsError}
                    </span>
                </div>
            )}

            {/* BUDGET ORIGIN BANNER */}
            {
                (ticket.origin_source?.startsWith('Presupuesto') || ticket.quote_pdf_url) && (
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

                    </div>
                )
            }

            {/* Action Buttons (Workflow) */}
            {
                currentStatus.next && (
                    <div className="space-y-3 mb-6">
                        {(() => {
                            // Restriction Logic: Prevent Technician from starting service if > 1h before appointment
                            let restrictionMsg = null;
                            const isTechnician = true; // Assuming this view is only for techs or we check role
                            // Only restrict 'solicitado' -> 'en_camino' or any start action if scheduled
                            if ((currentStatus.next === 'en_camino' || currentStatus.next === 'en_diagnostico') && ticket.scheduled_at) {
                                // 1. Business Hours Check (08:00 - 20:00)
                                const now = new Date();
                                const currentHour = now.getHours();
                                const isOutsideHours = currentHour < 8 || currentHour >= 20;

                                // 2. Appointment Time Check (> 1h before)
                                let isTooEarly = false;
                                let apptTimeStr = '';

                                if (ticket.scheduled_at) {
                                    const apptTime = new Date(ticket.scheduled_at);
                                    const diffMs = apptTime - now;
                                    const diffHours = diffMs / (1000 * 60 * 60);
                                    if (diffHours > 1) {
                                        isTooEarly = true;
                                        apptTimeStr = apptTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                                    }
                                }

                                // 3. Bypass Logic
                                const hasBypass = techProfile?.bypass_time_restrictions === true;

                                if (!hasBypass) {
                                    if (isOutsideHours) {
                                        restrictionMsg = `Fuera de Horario Laboral (08:00 - 20:00)`;
                                    } else if (isTooEarly) {
                                        restrictionMsg = `Disponible 1h antes de la cita (${apptTimeStr})`;
                                    }
                                } else if (hasBypass && (isOutsideHours || isTooEarly)) {
                                    // Informational message only, no restriction
                                    restrictionMsg = null; // Unblocked
                                }
                            }

                            return (
                                <>
                                    {/* REPAIR ACTIONS */}
                                    <button
                                        onClick={async () => {
                                            if (currentStatus.next === 'finalizado') {
                                                // Direct Finalization (Bypassing Modal)
                                                // 1. Check if we have signature
                                                if (!ticket.client_signature_url) {
                                                    if (window.confirm("Se requiere la firma del cliente para finalizar. ¿Firmar ahora?")) {
                                                        setSignaturePurpose('closing');
                                                        setShowSignaturePad(true);
                                                    }
                                                    return;
                                                }

                                                // 2. If signed, proceed to generate PDF and finalize
                                                if (!ticket.pdf_url) {
                                                    // Generate PDF automatically validation
                                                    try {
                                                        const proceed = window.confirm("Se generará el Parte de Trabajo y finalizará el servicio. ¿Confirmar?");
                                                        if (!proceed) return;
                                                        await handleGeneratePDF();
                                                    } catch (e) {
                                                        console.error(e);
                                                        alert("Error generando PDF: " + e.message);
                                                        return; // Stop if PDF fails
                                                    }
                                                } else {
                                                    if (!window.confirm("¿Estás seguro de FINALIZAR el servicio?")) return;
                                                }
                                                await updateStatus('finalizado');
                                            } else {
                                                updateStatus(currentStatus.next);
                                            }
                                        }}
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
                                        <p className="text-center text-xs text-red-500 font-bold bg-red-50 py-2 rounded-lg border border-red-100 mb-2">
                                            🚫 {restrictionMsg} <br />
                                            <span className="opacity-70 font-normal">Contacta con soporte o activa modo test.</span>
                                        </p>
                                    )}
                                    {techProfile?.bypass_time_restrictions && (
                                        <div className="text-center mb-4">
                                            <span className="text-[10px] font-black bg-orange-500 text-white px-2 py-0.5 rounded uppercase tracking-wider">
                                                MODO TEST ACTIVO (Restricciones Anuladas)
                                            </span>
                                        </div>
                                    )}


                                </>
                            );
                        })()}



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

                        {/* CANCEL SERVICE BUTTON */}
                        {!['finalizado', 'cancelado', 'rechazado', 'pagado'].includes(ticket.status) && (
                            <button
                                onClick={handleCancelService}
                                className="w-full py-3 mt-4 bg-red-50 text-red-600 rounded-xl font-bold border border-red-100 hover:bg-red-100 flex items-center justify-center gap-2 active:scale-[0.98] transition-all opacity-80 hover:opacity-100"
                            >
                                <span className="text-xl">⛔</span>
                                Cancelar Servicio
                            </button>
                        )}
                    </div>
                )
            }

            {/* TIMELINE LOG */}
            {
                ticket.status_history && ticket.status_history.length > 0 && (
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
                )
            }



            {/* Client Card */}
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 mb-4">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                    <User size={14} /> Cliente
                </h3>

                <div className="mb-4">
                    <p className="font-bold text-lg text-slate-800">{ticket.client?.full_name}</p>
                    <p className="text-slate-500 text-sm">Cliente Particular</p>
                </div>

                <div className="space-y-3 mb-4">
                    <div className="flex gap-3">
                        <button
                            onClick={() => handleCall(ticket.client?.phone)}
                            className="flex-1 py-2.5 bg-green-50 text-green-700 rounded-lg flex items-center justify-center gap-2 font-medium text-sm border border-green-100 active:scale-95 transition"
                        >
                            <PhoneCall size={16} /> {ticket.client?.phone || 'Móvil'}
                        </button>
                        {ticket.client?.phone_2 && (
                            <button
                                onClick={() => handleCall(ticket.client?.phone_2)}
                                className="flex-1 py-2.5 bg-emerald-50 text-emerald-700 rounded-lg flex items-center justify-center gap-2 font-medium text-sm border border-emerald-100 active:scale-95 transition"
                            >
                                <Phone size={16} /> {ticket.client?.phone_2}
                            </button>
                        )}
                    </div>
                    <button
                        onClick={() => handleOpenMap(ticket.client?.address)}
                        className="w-full py-2.5 bg-blue-50 text-blue-700 rounded-lg flex items-center justify-center gap-2 font-medium text-sm border border-blue-100 active:scale-95 transition"
                    >
                        <Navigation size={16} /> Como llegar (Mapa)
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
            {
                (ticket.status === 'en_diagnostico' || ticket.status === 'en_reparacion' || ticket.status === 'finalizado') && (
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
                )
            }

            {/* Budget / Financial Section */}
            {
                (ticket.status === 'en_diagnostico' || ticket.status === 'en_reparacion' || ticket.status === 'finalizado') && (
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
                            {/* MORTIFY ALERT */}
                            {isOverLimit && (
                                <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-3 animate-pulse">
                                    <div className="flex items-start gap-2">
                                        <AlertTriangle className="text-red-600 shrink-0 mt-0.5" size={18} />
                                        <div>
                                            <p className="text-xs font-bold text-red-700 uppercase tracking-wider mb-1">
                                                ⚠️ Límite Financiero Excedido
                                            </p>
                                            <p className="text-sm text-red-800 font-medium leading-snug">
                                                El límite recomendado es <span className="font-black underline">{financialLimit.remaining_budget.toFixed(0)}€</span>.
                                                Estás presupuestando <span className="font-black">{total.toFixed(0)}€</span>.
                                            </p>
                                            <p className="text-[10px] text-red-600 mt-1 font-bold">
                                                * Habla con el cliente antes de proceder.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            )}
                            {/* SAFE LIMIT INFO (If not over, just show info) */}
                            {!isOverLimit && financialLimit && (
                                <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-2 mb-2 flex items-center justify-between">
                                    <span className="text-[10px] font-bold text-emerald-700 uppercase">Límite Seguro Inversión</span>
                                    <span className="text-xs font-bold text-emerald-700">{financialLimit.remaining_budget.toFixed(0)}€</span>
                                </div>
                            )}

                            <div className="flex justify-between text-sm text-slate-500">
                                <span>Subtotal Neto</span>
                                <span>{subtotal.toFixed(2)}€</span>
                            </div>
                            <div className="flex justify-between text-sm text-slate-500">
                                <span>IVA (21%)</span>
                                <span>{vat.toFixed(2)}€</span>
                            </div>
                            <div className="pt-2 border-t border-slate-200 space-y-2">
                                <div className={`flex justify-between items-center text-base font-bold ${isOverLimit ? 'text-red-600' : 'text-slate-800'}`}>
                                    <span>TOTAL PRESUPUESTO</span>
                                    <span className="text-lg">{total.toFixed(2)}€</span>
                                </div>
                                {ticket.deposit_amount > 0 && (
                                    <div className="flex justify-between items-center text-sm font-bold text-green-600">
                                        <span>✅ Pagado a Cuenta</span>
                                        <span>-{ticket.deposit_amount.toFixed(2)}€</span>
                                    </div>
                                )}
                                {(total > 0 || ticket.deposit_amount > 0) && (
                                    <div className="flex justify-between items-center text-sm font-bold text-orange-600 border-t border-dashed border-slate-200 pt-2">
                                        <span>⏳ PENDIENTE DE COBRO</span>
                                        <span className="text-base">{(total - (ticket.deposit_amount || 0)).toFixed(2)}€</span>
                                    </div>
                                )}
                            </div>


                        </div>
                    </div>
                )
            }

            {/* BUDGET DECISION UI - NEW */}
            {
                ticket.status === 'en_diagnostico' && (
                    <div className="mb-6 animate-in fade-in slide-in-from-bottom-4 bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
                        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                            <FileText size={14} /> Aceptación de Presupuesto
                        </h3>

                        <div className="flex gap-3 mb-4">
                            <button
                                onClick={() => {
                                    setBudgetDecision('accepted');
                                }}
                                className={`flex-1 py-4 rounded-xl font-bold border-2 transition-all flex flex-col items-center gap-1 ${budgetDecision === 'accepted' ? 'bg-green-50 text-green-700 border-green-200 ring-1 ring-green-500' : 'bg-slate-50 text-slate-500 border-slate-100 hover:bg-green-50 hover:text-green-600 hover:border-green-100'}`}
                            >
                                <CheckCircle size={24} className={budgetDecision === 'accepted' ? 'fill-green-200' : ''} />
                                <span>Aceptar</span>
                            </button>
                            <button
                                onClick={() => setBudgetDecision('rejected')}
                                className={`flex-1 py-4 rounded-xl font-bold border-2 transition-all flex flex-col items-center gap-1 ${budgetDecision === 'rejected' ? 'bg-red-50 text-red-700 border-red-200 ring-1 ring-red-500' : 'bg-slate-50 text-slate-500 border-slate-100 hover:bg-red-50 hover:text-red-600 hover:border-red-100'}`}
                            >
                                <AlertTriangle size={24} className={budgetDecision === 'rejected' ? 'fill-red-200' : ''} />
                                <span>Rechazar</span>
                            </button>
                        </div>

                        {/* Rejected Action */}
                        {budgetDecision === 'rejected' && (
                            <div className="bg-red-50 p-4 rounded-xl border border-red-100 animate-in zoom-in-95 space-y-4">
                                <div>
                                    <h4 className="text-sm font-bold text-red-800 flex items-center gap-2 mb-2">
                                        <Banknote size={16} />
                                        Cobrar Diagnóstico (Opcional)
                                    </h4>
                                    <div className="bg-white p-3 rounded-lg border border-red-100 space-y-3">
                                        <div>
                                            <label className="text-xs font-bold text-slate-400 block mb-1">Importe Diagnóstico</label>
                                            <div className="relative">
                                                <input
                                                    type="number"
                                                    value={diagnosisPrice}
                                                    onChange={e => setDiagnosisPrice(e.target.value)}
                                                    className="w-full pl-8 pr-3 py-2 border rounded-lg text-sm font-bold text-slate-700"
                                                />
                                                <span className="absolute left-3 top-2 text-slate-400">€</span>
                                            </div>
                                        </div>
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => setDiagnosisMethod('CASH')}
                                                className={`flex-1 py-2 text-xs font-bold rounded-lg border ${diagnosisMethod === 'CASH' ? 'bg-green-100 text-green-700 border-green-200' : 'bg-slate-50 text-slate-500'}`}
                                            >
                                                Efectivo
                                            </button>
                                            <button
                                                onClick={() => setDiagnosisMethod('CARD')}
                                                className={`flex-1 py-2 text-xs font-bold rounded-lg border ${diagnosisMethod === 'CARD' ? 'bg-blue-100 text-blue-700 border-blue-200' : 'bg-slate-50 text-slate-500'}`}
                                            >
                                                Tarjeta
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                <p className="text-xs text-red-700/80">
                                    Al cobrar, se generará el presupuesto marcando el diagnóstico como PAGADO. Si el cliente acepta antes de 15 días, se le descontará.
                                </p>

                                <button
                                    onClick={async () => {
                                        if (diagnosisPrice > 0) {
                                            if (!confirm(`¿Confirmas que has cobrado ${diagnosisPrice}€ en ${diagnosisMethod === 'CASH' ? 'EFECTIVO' : 'TARJETA'} por el diagnóstico?`)) return;

                                            // Save Diagnosis Payment
                                            try {
                                                setUpdating(true);
                                                await supabase.from('tickets').update({
                                                    diagnosis_paid: parseFloat(diagnosisPrice),
                                                    diagnosis_paid_at: new Date().toISOString()
                                                    // Note: we don't set is_paid=true for the full ticket, just this field.
                                                }).eq('id', ticket.id);

                                                // Update local state temporarily for PDF generation (re-fetch will sync)
                                                ticket.diagnosis_paid = parseFloat(diagnosisPrice);
                                            } catch (err) {
                                                console.error(err);
                                                alert("Error guardando cobro: " + err.message);
                                                setUpdating(false);
                                                return;
                                            }
                                            setUpdating(false);
                                        }
                                        handleGenerateQuote();
                                    }}
                                    disabled={updating || generatingPdf}
                                    className="w-full py-3 bg-red-600 text-white rounded-lg font-bold shadow-md shadow-red-200 hover:bg-red-700 transition-colors flex items-center justify-center gap-2"
                                >
                                    <FileText size={18} />
                                    {diagnosisPrice > 0 ? 'Cobrar y Generar Presupuesto' : 'Generar Rechazo (Sin Cobro)'}
                                </button>
                            </div>
                        )}
                    </div>
                )
            }

            {/* MOVED: PENDING MATERIAL WORKFLOW (Placed after Financials) - ONLY IF ACCEPTED */}
            {
                ticket.status === 'en_diagnostico' && budgetDecision === 'accepted' && (
                    <div className="bg-orange-50 rounded-2xl p-5 shadow-sm border border-orange-100 mb-4 animate-in fade-in slide-in-from-bottom-4">
                        <h3 className="text-xs font-bold text-orange-800 uppercase tracking-wider mb-4 flex items-center gap-2">
                            <Package size={14} /> Solicitar Repuesto / Material
                        </h3>
                        <p className="text-xs text-orange-700 mb-4">
                            Si necesitas pedir material y el cliente ha pagado a cuenta, usa esta sección para <strong>pausar el servicio</strong> hasta que llegue el repuesto.
                        </p>

                        <div className="space-y-4 mb-4">
                            <div>
                                <div className="flex items-center justify-between mb-1">
                                    <label className="block text-xs font-bold text-slate-500">Descripción del Repuesto *</label>
                                    <div className="group relative">
                                        <AlertCircle size={14} className="text-slate-400 cursor-help" />
                                        <div className="hidden group-hover:block absolute right-0 top-6 w-64 bg-slate-800 text-white text-xs p-3 rounded-lg shadow-xl z-10">
                                            💡 <strong>Importante:</strong> Este texto aparecerá en "Gestión de Materiales" para que la oficina sepa exactamente qué pedir. Sé específico.
                                        </div>
                                    </div>
                                </div>
                                <div className="relative">
                                    <input
                                        type="text"
                                        value={ticket.required_parts_description || ''}
                                        onChange={(e) => setTicket({ ...ticket, required_parts_description: e.target.value })}
                                        placeholder="Ej: Bomba de desagüe Samsung DC97-16350C, Condensador 2.2μF 450V..."
                                        className="w-full p-3 bg-white border border-orange-200 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 outline-none"
                                    />
                                    {parts.length > 0 && (
                                        <button
                                            onClick={() => setTicket({ ...ticket, required_parts_description: parts.map(p => `${p.name}${p.qty > 1 ? ` (x${p.qty})` : ''}`).join(', ') })}
                                            className="mt-2 w-full py-2 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg text-xs font-bold hover:bg-blue-100 transition flex items-center justify-center gap-2"
                                            title="Copiar repuestos del presupuesto"
                                        >
                                            <Copy size={14} />
                                            Auto-completar desde piezas del presupuesto ({parts.length})
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
                                if (!window.confirm('¿Confirmas que el cliente ha pagado esa cantidad y quieres proceder a la firma?')) return;

                                // Trigger Signature instead of immediate status update
                                setSignaturePurpose('material_deposit');
                                setShowSignaturePad(true);
                            }}
                            disabled={updating}
                            className="w-full py-4 bg-orange-600 text-white rounded-xl font-bold hover:bg-orange-700 shadow-lg shadow-orange-200 flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
                        >
                            <History size={18} />
                            Confirmar Pago, Firmar y Pedir Material
                        </button>
                    </div>
                )
            }

            {/* Payment Check & PDF - Only at End */}
            {/* HIDDEN IF FINALIZED per user request */}
            {
                (ticket.status === 'en_reparacion' && ticket.status !== 'finalizado') && (
                    <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 mb-4 animate-in fade-in slide-in-from-bottom-4">
                        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Cobro y Documentación</h3>

                        <div className="flex flex-col gap-3">

                            {/* WARRANTY CONFIGURATION */}
                            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 mb-2">
                                <h4 className="text-xs font-bold text-slate-500 uppercase mb-3 flex items-center gap-2">
                                    <ShieldCheck size={14} /> Configuración de Garantía
                                </h4>
                                <div className="flex gap-4">
                                    <div className="flex-1">
                                        <label className="text-[10px] font-bold text-slate-400 block mb-1">Mano de Obra</label>
                                        <select
                                            value={warrantyLabor}
                                            onChange={e => setWarrantyLabor(Number(e.target.value))}
                                            className="w-full text-sm font-bold p-2 rounded-lg border border-slate-200 bg-white"
                                        >
                                            <option value={0}>Sin Garantía</option>
                                            <option value={3}>3 Meses</option>
                                            <option value={6}>6 Meses</option>
                                            <option value={12}>1 Año</option>
                                        </select>
                                    </div>
                                    <div className="flex-1">
                                        <label className="text-[10px] font-bold text-slate-400 block mb-1">Piezas / Recambios</label>
                                        <select
                                            value={warrantyParts}
                                            onChange={e => setWarrantyParts(Number(e.target.value))}
                                            className="w-full text-sm font-bold p-2 rounded-lg border border-slate-200 bg-white"
                                        >
                                            <option value={0}>Sin Garantía</option>
                                            <option value={6}>6 Meses</option>
                                            <option value={12}>1 Año</option>
                                            <option value={24}>2 Años</option>
                                            <option value={36}>3 Años</option>
                                        </select>
                                    </div>
                                </div>
                            </div>
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
                                        {(ticket.client?.user_id || ticket.client?.id || ticket.origin_source?.toLowerCase().includes('app')) && <option value="APP_PAYMENT">Pago por App</option>}
                                        <option value="bizum">Bizum</option>
                                        <option value="transfer">Transferencia</option>
                                    </select>

                                    {/* INLINE APP PAYMENT ACTION */}
                                    {paymentMethod === 'APP_PAYMENT' && (
                                        <div className="mt-4 p-4 border rounded-xl bg-blue-50 border-blue-100">
                                            <div className="text-center mb-4">
                                                <div className="p-3 bg-white rounded-full inline-block shadow-sm">
                                                    <Smartphone className="text-blue-600" size={28} />
                                                </div>
                                                <h4 className="font-bold text-blue-900 mt-2">Cobro Digital</h4>
                                                <p className="text-xs text-blue-700">El cliente pagará desde su móvil</p>
                                            </div>

                                            {ticket.status === 'PENDING_PAYMENT' ? (
                                                <div className="flex flex-col items-center gap-2 animate-in fade-in">
                                                    <div className="relative">
                                                        <div className="absolute inset-0 animate-ping rounded-full bg-blue-400 opacity-25"></div>
                                                        <span className="relative flex h-3 w-3">
                                                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                                                            <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500"></span>
                                                        </span>
                                                    </div>
                                                    <span className="font-bold text-blue-600 animate-pulse">Esperando pago...</span>
                                                    <p className="text-xs text-slate-500 text-center max-w-[200px]">
                                                        El cliente tiene la pasarela de pago abierta en su App.
                                                    </p>
                                                </div>
                                            ) : (
                                                <button
                                                    onClick={async () => {
                                                        try {
                                                            const { error } = await supabase
                                                                .from('tickets')
                                                                .update({
                                                                    status: 'PENDING_PAYMENT',
                                                                    payment_method: 'APP_PAYMENT',
                                                                    final_price: total // Send the calculated total from state
                                                                })
                                                                .eq('id', ticket.id);

                                                            if (error) throw error;
                                                            // Optimistic Update handled by Realtime subscription
                                                        } catch (err) {
                                                            alert("Error: " + err.message);
                                                        }
                                                    }}
                                                    className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition shadow-lg shadow-blue-200"
                                                >
                                                    Enviar Solicitud de Cobro
                                                </button>
                                            )}
                                        </div>
                                    )}

                                    {/* PAYMENT PROOF UPLOAD (Manual Methods Only) */}
                                    {paymentMethod !== 'cash' && paymentMethod !== 'APP_PAYMENT' && (
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

                                {ticket.warranty_pdf_url && (
                                    <a
                                        href={ticket.warranty_pdf_url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="w-full py-3 bg-purple-50 text-purple-700 border border-purple-100 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-purple-100 transition"
                                    >
                                        <ShieldCheck size={20} />
                                        <span>Ver Parte Garantía (PDF)</span>
                                    </a>
                                )}

                                {ticket.material_deposit_pdf_url && (
                                    <a
                                        href={ticket.material_deposit_pdf_url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="w-full py-3 bg-orange-50 text-orange-700 border border-orange-100 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-orange-100 transition"
                                    >
                                        <FileText size={20} />
                                        <span>Ver Recibo de Abono (PDF)</span>
                                    </a>
                                )}

                                {/* REGENERATE WORK REPORT (If missing on finalized - e.g. after App Payment) */}
                                {ticket.status === 'finalizado' && !ticket.pdf_url && (
                                    <button
                                        onClick={() => {
                                            setSignaturePurpose('closing');
                                            setShowSignaturePad(true);
                                        }}
                                        className="w-full py-3 bg-red-100 text-red-700 border border-red-200 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-red-200 transition"
                                    >
                                        <AlertTriangle size={20} />
                                        <span>Generar Parte de Trabajo (Faltante)</span>
                                    </button>
                                )}

                                {/* REGENERATE WARRANTY PDF (If missing on finalized) */}
                                {ticket.status === 'finalizado' && ticket.is_warranty && !ticket.warranty_pdf_url && (
                                    <button
                                        onClick={async () => {
                                            if (!window.confirm('¿Generar Parte de Garantía faltante?')) return;
                                            await handleGeneratePDF('warranty');
                                        }}
                                        disabled={generatingPdf}
                                        className="w-full py-3 bg-purple-100 text-purple-700 border border-purple-200 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-purple-200 transition"
                                    >
                                        <ShieldAlert size={20} />
                                        <span>Regenerar Parte Garantía (Faltante)</span>
                                    </button>
                                )}


                            </div>

                            <button
                                onClick={() => {
                                    setSignaturePurpose('closing');
                                    setShowSignaturePad(true);
                                }}
                                disabled={uploadingProof}
                                className={`w-full py-4 mt-2 text-white rounded-xl font-bold shadow-lg flex items-center justify-center gap-2 active:scale-[0.98] transition-all ${isPaid ? 'bg-green-600 hover:bg-green-700 shadow-green-200' : 'bg-slate-700 hover:bg-slate-800 shadow-slate-300'
                                    }`}
                            >
                                <CheckCircle size={24} />
                                {isPaid ? 'Finalizar Reparación y Firmar' : 'Finalizar como PENDIENTE DE COBRO'}
                            </button>

                            {/* WARRANTY BUTTON */}
                            <button
                                onClick={() => {
                                    setSignaturePurpose('warranty_closing');
                                    setShowSignaturePad(true);
                                }}
                                disabled={uploadingProof}
                                className="w-full py-4 mt-2 bg-purple-600 text-white rounded-xl font-bold shadow-lg shadow-purple-200 flex items-center justify-center gap-2 active:scale-[0.98] transition-all hover:bg-purple-700"
                            >
                                <ShieldCheck size={24} />
                                Finalizar y Generar Parte de Garantía
                            </button>
                        </div>
                    </div>
                )
            }

            {
                isEditingAllowed && (
                    <div className="fixed bottom-0 left-0 right-0 p-4 bg-white/80 backdrop-blur-md border-t border-slate-200 flex justify-center z-40">
                        <button
                            onClick={saveChanges}
                            className="w-full max-w-md bg-blue-600 text-white font-bold py-3.5 rounded-xl shadow-lg active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                        >
                            <CheckCircle size={20} />
                            Guardar Cambios
                        </button>
                    </div>
                )
            }

            {/* LABEL OCR MODAL */}
            {
                showLabelModal && (
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
                )
            }
            {/* GPS Tracker Component - Only visible during EN CAMINO */}
            {/* GPS Tracker Component - REMOVED per user request (logic handled by hook) */}
            {/*
                ticket && user && ticket.status === 'en_camino' && (
                    <div className="mt-8 mb-4">
                        <ErrorBoundary>
                            <TechLocationMap
                                technicianId={user.id}
                                className="w-full h-64 rounded-xl shadow-lg"
                            />
                        </ErrorBoundary>
                    </div>
                )
            */}

            {/* SIGNATURE PAD */}
            {
                showSignaturePad && (
                    <SignaturePad
                        onSave={async (signatureDataUrl) => {
                            try {
                                setUpdating(true);
                                // 1. Upload Signature
                                const fileName = `sig_${ticket.ticket_number}_${Date.now()}.png`;
                                const { error: uploadError } = await supabase.storage
                                    .from('service-attachments')
                                    .upload(fileName, await (await fetch(signatureDataUrl)).blob(), { contentType: 'image/png' });

                                if (uploadError) throw uploadError;

                                const { data } = supabase.storage.from('service-attachments').getPublicUrl(fileName);
                                const publicUrl = data.publicUrl;

                                // 2. Update Ticket with Signature
                                await supabase.from('tickets').update({
                                    client_signature_url: publicUrl,
                                    signature_timestamp: new Date().toISOString()
                                }).eq('id', ticket.id);

                                // Update local state
                                setTicket(prev => ({ ...prev, client_signature_url: publicUrl }));

                                // 3. Branch Logic based on Purpose
                                if (signaturePurpose === 'budget') {
                                    setBudgetDecision('accepted');
                                    alert("Presupuesto aceptado y firmado.");
                                    setShowSignaturePad(false);
                                } else if (signaturePurpose === 'material_deposit') {
                                    // NEW: Handle Material Deposit Signature
                                    const logoImg = settings?.logo_url ? await loadImage(settings.logo_url) : null;
                                    // Use the local signature data directly (Base64) - faster and more reliable than fetching the just-uploaded URL
                                    const signatureImg = signatureDataUrl;

                                    // Ensure we use the latest input values (deposit, description) from local state/inputs
                                    // We need to bake them into a data object for the PDF generator
                                    const currentData = {
                                        ...getCurrentTicketData(),
                                        // Ensure these specific fields are exactly what the user just approved
                                        deposit_amount: deposit,
                                        required_parts_description: ticket.required_parts_description,
                                        client_signature_url: publicUrl // Keep this for DB record
                                    };

                                    // 1. Generate Receipt PDF
                                    const doc = generateDepositReceipt(currentData, logoImg, signatureImg);
                                    const pdfBlob = doc.output('blob');
                                    const pdfName = `recibo_senal_${ticket.ticket_number}_${Date.now()}.pdf`;

                                    // 2. Upload PDF
                                    const { error: pdfErr } = await supabase.storage
                                        .from('service-reports')
                                        .upload(pdfName, pdfBlob, { contentType: 'application/pdf' });

                                    if (pdfErr) throw pdfErr;

                                    const { data: pdfUrlData } = supabase.storage.from('service-reports').getPublicUrl(pdfName);
                                    const receiptUrl = pdfUrlData.publicUrl;

                                    // 3. Update DB with EVERYTHING (Data + PDF + Status)
                                    // We use updateStatus helper but we need to pass the extra fields
                                    // Actually updateStatus calls setTicket so we should use it to handle history

                                    // First update the specific columns manually to be safe before status change
                                    await supabase.from('tickets').update({
                                        deposit_amount: deposit,
                                        required_parts_description: ticket.required_parts_description,
                                        material_deposit_pdf_url: receiptUrl,
                                        material_status_at: new Date().toISOString()
                                    }).eq('id', ticket.id);

                                    // Then trigger status change (which appends history)
                                    await updateStatus('pendiente_material');

                                    alert('Pago confirmado, PDF generado y pieza solicitada correctamente.');
                                    setShowSignaturePad(false);
                                    navigate('/tech/dashboard');

                                } else if (signaturePurpose === 'closing' || signaturePurpose === 'warranty_closing') {
                                    const isWarranty = signaturePurpose === 'warranty_closing';

                                    // 4. CALCULATE WARRANTY DATES
                                    const now = new Date();
                                    const laborDate = new Date(now);
                                    laborDate.setMonth(laborDate.getMonth() + warrantyLabor);
                                    const partsDate = new Date(now);
                                    partsDate.setMonth(partsDate.getMonth() + warrantyParts);
                                    const maxDate = laborDate > partsDate ? laborDate : partsDate;

                                    const warrantyData = {
                                        warranty_labor_months: warrantyLabor,
                                        warranty_parts_months: warrantyParts,
                                        warranty_labor_until: laborDate.toISOString(),
                                        warranty_parts_until: partsDate.toISOString(),
                                        warranty_until: maxDate.toISOString()
                                    };

                                    // Quick fix: Temporarily mutate ticket object for this closure
                                    ticket.client_signature_url = publicUrl;

                                    // Generate PDF (Robust await)
                                    await handleGeneratePDF(isWarranty ? 'warranty' : 'standard');

                                    // Finalize
                                    await updateStatus('finalizado', warrantyData);

                                    // SUCCESS FEEDBACK -> MODAL (No Alert)
                                    setCompletionType(isWarranty ? 'warranty' : 'standard');
                                    setShowSignaturePad(false);
                                    setShowSuccessModal(true);
                                }
                            } catch (e) {
                                console.error(e);
                                alert("Error guardando firma: " + e.message);
                            } finally {
                                setUpdating(false);
                            }
                        }}
                        onCancel={() => setShowSignaturePad(false)}
                    />
                )
            }

            {/* ROBUST SUCCESS MODAL */}
            <ServiceCompletionModal
                isOpen={showSuccessModal}
                onClose={() => setShowSuccessModal(false)}
                ticketNumber={ticket?.ticket_number}
                type={completionType}
            />

            {/* SEND PDF MODAL - WhatsApp/Email Delivery */}
            <SendPdfModal
                isOpen={sendPdfModal.isOpen}
                onClose={() => setSendPdfModal({ isOpen: false, pdfUrl: '', pdfName: '' })}
                pdfUrl={sendPdfModal.pdfUrl}
                pdfName={sendPdfModal.pdfName}
                clientPhone={ticket?.client?.phone}
                clientEmail={ticket?.client?.email}
                ticketNumber={ticket?.ticket_number}
                onSuccess={(results) => {
                    console.log('[SendPdfModal] Delivery results:', results);
                }}
            />

        </div >
    );
};

export default TechTicketDetail;
