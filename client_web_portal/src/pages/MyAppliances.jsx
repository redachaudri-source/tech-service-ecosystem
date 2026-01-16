import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Plus, Trash2, MapPin, Camera, Wrench, ArrowLeft, Package, Edit2, Scan, Zap, Tv, Thermometer, Wind, Waves, Disc, Flame, Utensils, Smartphone, Refrigerator, History, FileText, TrendingUp, AlertTriangle, CheckCircle, PiggyBank, Loader2, X } from 'lucide-react';
import Tesseract from 'tesseract.js';
import MortifyWizard from '../components/MortifyWizard';
import ViabilityLabel from '../components/ViabilityLabel';

// AI Market Value Estimates (Mock Database)
const AI_ESTIMATES = {
    'lavadora': 450,
    'lavavajillas': 500,
    'frigorífico': 700,
    'secadora': 400,
    'horno': 350,
    'aire acondicionado': 600,
    'televisión': 500,
    'microondas': 150,
    'vitrocerámica': 300,
    'campana': 200,
    'calentador': 300
};

const MyAppliances = () => {
    const navigate = useNavigate();
    const [appliances, setAppliances] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editId, setEditId] = useState(null);

    // History Modal State
    const [showHistory, setShowHistory] = useState(false);
    const [historyAppliance, setHistoryAppliance] = useState(null);

    // Mortify State
    const [showMortify, setShowMortify] = useState(false);
    const [mortifyAppliance, setMortifyAppliance] = useState(null);

    // Gallery State
    const [showGallery, setShowGallery] = useState(false);
    const [galleryAppliance, setGalleryAppliance] = useState(null);

    // Form State
    const initialForm = {
        type: '',
        brand: '',
        model: '',
        location: '',
        purchase_date: '',
        photo_model: '',
        photo_location: '',
        photo_overview: ''
    };
    const [formData, setFormData] = useState(initialForm);
    const [uploading, setUploading] = useState(false);
    const [ocrScanning, setOcrScanning] = useState(false);
    const [applianceTypes, setApplianceTypes] = useState([]);

    useEffect(() => {
        fetchAppliances();
        const fetchTypes = async () => {
            const { data } = await supabase.from('appliance_types').select('name').order('name');
            if (data) setApplianceTypes(data.map(t => t.name));
        };
        fetchTypes();
    }, []);

    const fetchAppliances = async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            // Fetch appliances with their tickets history
            const { data, error } = await supabase
                .from('client_appliances')
                .select(`
                    *,
                    tickets (*),
                    mortify_assessments (*)
                `)
                .eq('client_id', user.id)
                .order('created_at', { ascending: false });

            if (error) throw error;

            // Process metrics
            const processed = (data || []).map(app => {
                const tickets = app.tickets || [];
                const repairCount = tickets.filter(t => ['finalizado', 'pagado'].includes(t.status)).length;

                // Check active mortify assessment (take the latest)
                const assessments = (app.mortify_assessments || []).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
                const mortifyStatus = assessments.length > 0 ? assessments[0] : null;

                // Calculate total spent
                const totalSpent = tickets
                    .filter(t => ['finalizado', 'pagado'].includes(t.status))
                    .reduce((sum, t) => {
                        // Calculate total from JSON lists if explicitly strictly needed, 
                        // but usually for simple view, maybe we rely on a stored total?
                        // Analytics.jsx calculates it on the fly. Let's do the same for accuracy.
                        const parts = Array.isArray(t.parts_list) ? t.parts_list : JSON.parse(t.parts_list || '[]');
                        const labor = Array.isArray(t.labor_list) ? t.labor_list : JSON.parse(t.labor_list || '[]');
                        const sub = parts.reduce((s, i) => s + (Number(i.price) * (Number(i.qty) || 1)), 0) +
                            labor.reduce((s, i) => s + (Number(i.price) * (Number(i.qty) || 1)), 0);
                        return sum + (sub * 1.21);
                    }, 0);

                return { ...app, repairCount, totalSpent, tickets, mortifyStatus };
            });

            setAppliances(processed);
        } catch (error) {
            console.error('Error fetching appliances:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleFileUpload = async (e, field) => {
        if (!e.target.files || e.target.files.length === 0) return;

        setUploading(true);
        const file = e.target.files[0];
        const fileExt = file.name.split('.').pop();
        const fileName = `${Math.random()}.${fileExt}`;
        const filePath = `${fileName}`;

        try {
            const { error: uploadError } = await supabase.storage
                .from('appliance-labels')
                .upload(filePath, file);

            if (uploadError) throw uploadError;

            const { data } = supabase.storage.from('appliance-labels').getPublicUrl(filePath);
            const publicUrl = data.publicUrl;

            setFormData(prev => ({ ...prev, [field]: publicUrl }));

            // Trigger OCR if it's the model photo
            if (field === 'photo_model') {
                runOCR(file);
            }

        } catch (error) {
            console.error('Error uploading image:', error);
            alert('Error al subir imagen');
        } finally {
            setUploading(false);
        }
    };

    const runOCR = async (file) => {
        setOcrScanning(true);
        try {
            const result = await Tesseract.recognize(file, 'eng', {
                logger: m => console.log(m)
            });
            const text = result.data.text;
            console.log("OCR Result:", text);

            // Simple heuristic to find something resembling a model number (uppercase alphanumeric)
            // This is basic; regex could be improved.
            const lines = text.split('\n');
            let foundModel = '';

            // Look for "E-Nr" or similar patterns common in appliances
            const enrMatch = text.match(/E-Nr\.?\s*([A-Z0-9/-]+)/i);
            if (enrMatch) {
                foundModel = enrMatch[1];
            } else {
                // Fallback: looking for long uppercase strings
                const potential = text.match(/\b[A-Z0-9]{5,}\b/);
                if (potential) foundModel = potential[0];
            }

            if (foundModel) {
                setFormData(prev => ({ ...prev, model: foundModel }));
                alert(`¡Modelo detectado! ${foundModel}`);
            }

        } catch (err) {
            console.error(err);
        } finally {
            setOcrScanning(false);
        }
    };

    const handleEdit = (appliance) => {
        setFormData({
            type: appliance.type,
            brand: appliance.brand,
            model: appliance.model || '',
            location: appliance.location || '',
            purchase_date: appliance.purchase_date || '',
            photo_model: appliance.photo_model || appliance.photo_url || '', // Fallback for old data
            photo_location: appliance.photo_location || '',
            photo_overview: appliance.photo_overview || ''
        });
        setEditId(appliance.id);
        setIsEditing(true);
        setShowModal(true);
    };

    const handleAddNew = () => {
        setFormData(initialForm);
        setIsEditing(false);
        setEditId(null);
        setShowModal(true);
    }


    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            const { data: { user } } = await supabase.auth.getUser();

            const submissionData = {
                client_id: user.id,
                ...formData,
                purchase_date: formData.purchase_date || null
                // Old photo_url kept for compatibility if needed, but we focus on new fields
            };

            if (isEditing) {
                const { error } = await supabase
                    .from('client_appliances')
                    .update(submissionData)
                    .eq('id', editId);
                if (error) throw error;
            } else {
                const { error } = await supabase
                    .from('client_appliances')
                    .insert(submissionData);
                if (error) throw error;
            }

            setShowModal(false);
            fetchAppliances();
            alert(isEditing ? 'Actualizado correctamente' : 'Guardado correctamente');
        } catch (error) {
            console.error(error);
            alert('Error al guardar');
        }
    };

    const handleDelete = async (id) => {
        if (!confirm('¿Estás seguro de eliminar este electrodoméstico?')) return;
        const { error } = await supabase.from('client_appliances').delete().eq('id', id);
        if (!error) fetchAppliances();
    };

    // Helper for icons based on type
    const getIconForType = (type) => {
        const t = (type || '').toLowerCase();
        const size = 32;
        const className = "text-blue-600";

        if (t.includes('lav')) return <Waves size={size} className={className} />;
        if (t.includes('secadora')) return <Wind size={size} className={className} />;
        if (t.includes('frigo') || t.includes('never') || t.includes('congel')) return <Refrigerator size={size} className={className} />;
        if (t.includes('horno') || t.includes('micro') || t.includes('vitro')) return <Flame size={size} className={className} />;
        if (t.includes('aire') || t.includes('clima') || t.includes('split')) return <Thermometer size={size} className={className} />;
        if (t.includes('tv') || t.includes('tele')) return <Tv size={size} className={className} />;
        if (t.includes('movil') || t.includes('phone')) return <Smartphone size={size} className={className} />;
        if (t.includes('plato') || t.includes('lavav')) return <Disc size={size} className={className} />;
        if (t.includes('campana')) return <Wind size={size} className={className} />;

        return <Zap size={size} className={className} />; // Default electronics
    };

    // --- HISTORY MODAL COMPONENT ---
    const HistoryModal = ({ appliance, onClose }) => {
        if (!appliance) return null;
        const history = appliance.tickets || [];

        return (
            <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 animate-in fade-in backdrop-blur-sm">
                <div className="bg-white rounded-2xl w-full max-w-lg max-h-[80vh] flex flex-col shadow-2xl">
                    <div className="p-4 border-b flex justify-between items-center bg-slate-50 rounded-t-2xl">
                        <h3 className="font-bold text-slate-800 flex items-center gap-2">
                            <History size={20} className="text-blue-600" /> Historial de Reparaciones
                        </h3>
                        <button onClick={onClose} className="p-1 hover:bg-slate-200 rounded-full transition"><XIcon /></button>
                    </div>

                    <div className="p-6 overflow-y-auto flex-1">
                        <div className="flex items-center gap-4 mb-6">
                            <div className="w-16 h-16 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600">
                                {getIconForType(appliance.type)}
                            </div>
                            <div>
                                <p className="text-sm text-slate-500 uppercase font-bold">{appliance.brand}</p>
                                <p className="font-bold text-xl text-slate-800">{appliance.model}</p>
                                <ViabilityAnalysis appliance={appliance} totalSpent={appliance.totalSpent} />
                            </div>
                        </div>

                        {history.length === 0 ? (
                            <div className="text-center py-8 text-slate-400 border-2 border-dashed rounded-xl">
                                No hay reparaciones registradas.
                            </div>
                        ) : (
                            <div className="relative pl-4 space-y-6 before:absolute before:left-[5px] before:top-2 before:bottom-2 before:w-[2px] before:bg-slate-100 before:content-['']">
                                {history.map((ticket, idx) => (
                                    <div key={idx} className="relative">
                                        <div className={`absolute -left-4 top-1 w-3 h-3 rounded-full border-2 ${['finalizado', 'pagado'].includes(ticket.status) ? 'bg-green-500 border-green-200' : 'bg-blue-500 border-blue-200'}`}></div>

                                        <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                                            <div className="flex justify-between items-start mb-2">
                                                <span className="text-xs font-bold text-slate-500 bg-white px-2 py-1 rounded border border-slate-200">
                                                    {new Date(ticket.created_at).toLocaleDateString()}
                                                </span>
                                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${ticket.status === 'pagado' ? 'bg-green-100 text-green-700' : 'bg-slate-200 text-slate-600'}`}>
                                                    {ticket.status}
                                                </span>
                                            </div>
                                            <p className="text-sm font-medium text-slate-800 mb-2">{ticket.description_failure}</p>

                                            {/* Financials & PDF */}
                                            {['finalizado', 'pagado'].includes(ticket.status) && (
                                                <div className="flex justify-between items-center pt-2 border-t border-slate-200/50">
                                                    <span className="font-mono font-bold text-slate-700">Coste: {(ticket.total || 0).toFixed(2)}€</span> {/* Assuming total is available or we calculate earlier? We didn't save calculated total in fetch... need to fix or use safe access */}
                                                    {ticket.pdf_url && (
                                                        <a href={ticket.pdf_url} target="_blank" className="text-xs bg-red-50 text-red-600 px-2 py-1 rounded font-bold hover:bg-red-100 flex items-center gap-1">
                                                            <FileText size={12} /> Factura
                                                        </a>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    // --- GALLERY MODAL ---
    const GalleryModal = ({ appliance, onClose }) => {
        if (!appliance) return null;

        const photos = [
            { url: appliance.photo_model || appliance.photo_url, label: 'Etiqueta Modelo' },
            { url: appliance.photo_location, label: 'Ubicación' },
            { url: appliance.photo_overview, label: 'Vista General' }
        ].filter(p => p.url);

        return (
            <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 animate-in fade-in backdrop-blur-sm">
                <div className="bg-black w-full max-w-4xl max-h-[90vh] rounded-2xl overflow-hidden relative flex flex-col">
                    <button onClick={onClose} className="absolute top-4 right-4 bg-white/20 hover:bg-white/40 text-white p-2 rounded-full transition z-10"><X size={24} /></button>

                    <div className="p-4 text-white font-bold text-lg text-center border-b border-white/10">
                        Galería: {appliance.brand} {appliance.model}
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 md:p-8">
                        {photos.length === 0 ? (
                            <div className="text-center text-slate-500 py-12 flex flex-col items-center">
                                <Camera size={48} className="mb-4 opacity-50" />
                                No hay fotos registradas de este aparato.
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {photos.map((photo, idx) => (
                                    <div key={idx} className="group relative aspect-square bg-slate-800 rounded-xl overflow-hidden">
                                        <img src={photo.url} alt={photo.label} className="w-full h-full object-cover group-hover:scale-105 transition duration-500" />
                                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-100">
                                            <div className="absolute bottom-3 left-3 text-white font-medium text-sm border-l-2 border-blue-500 pl-2">
                                                {photo.label}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    const XIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>;

    // --- AI VIABILITY COMPONENT (Enhanced for Mortify UX) ---
    const ViabilityAnalysis = ({ appliance }) => {
        // Only show "Analyzing..." badge. 
        if (appliance.mortifyStatus && appliance.mortifyStatus.status === 'PENDING_JUDGE') {
            return (
                <div className="flex items-center gap-1.5 px-2 py-1 rounded-md border text-[10px] font-bold bg-blue-50 text-blue-600 border-blue-100 animate-pulse">
                    <Loader2 size={12} className="animate-spin" />
                    <span>Analizando...</span>
                </div>
            );
        }

        // JUDGED: Show New V-Label
        if (appliance.mortifyStatus && appliance.mortifyStatus.status === 'JUDGED') {
            const score = appliance.mortifyStatus.total_score;
            // Use small size for the card view
            return <ViabilityLabel score={score} size="sm" />;
        }

        return null;
    };

    return (
        <div className="min-h-screen bg-slate-50 p-4 md:p-8">
            <div className="max-w-7xl mx-auto space-y-6">

                {/* Header */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => navigate('/dashboard')}
                            className="bg-white p-2 rounded-full shadow-sm border border-slate-200 text-slate-500 hover:text-slate-800 transition"
                        >
                            <ArrowLeft size={20} />
                        </button>
                        <div>
                            <h1 className="text-2xl font-bold text-slate-800">Mis Electrodomésticos</h1>
                            <p className="text-slate-500 text-sm">Gestiona tu equipamiento e información.</p>
                        </div>
                    </div>

                    <button
                        onClick={handleAddNew}
                        className="bg-blue-600 text-white px-5 py-2.5 rounded-xl font-bold hover:bg-blue-700 transition shadow-lg shadow-blue-600/20 active:scale-95 flex items-center gap-2"
                    >
                        <Plus size={20} /> Añadir Aparato
                    </button>
                </div>

                {/* Main Content + Sidebar Wrapper */}
                <div className="flex flex-col lg:flex-row gap-8 items-start">

                    {/* APPLIANCES GRID (Left/Main) */}
                    <div className="flex-1 w-full min-w-0">
                        {/* Premium Grid */}
                        {loading ? (
                            <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>
                        ) : appliances.length === 0 ? (
                            <div className="text-center py-12 text-slate-400">No tienes aparatos registrados.</div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                                {appliances.map(appliance => (
                                    <div key={appliance.id + '_v2'} className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden hover:shadow-xl hover:translate-y-[-2px] transition-all duration-300 group relative">
                                        {/* Premium Header Card */}
                                        <div className="p-6 flex items-start justify-between bg-gradient-to-br from-white to-slate-50 border-b border-slate-100">
                                            <div className="flex gap-4">
                                                <div className="w-14 h-14 bg-blue-50 rounded-2xl flex items-center justify-center shrink-0 shadow-inner">
                                                    {getIconForType(appliance.type)}
                                                </div>
                                                <div>
                                                    <h3 className="font-bold text-lg text-slate-800 leading-tight">{appliance.brand}</h3>
                                                    <p className="text-sm font-medium text-blue-600">{appliance.type}</p>
                                                </div>
                                            </div>
                                            {/* Action Dots / Edit + Viability Label */}
                                            <div className="flex items-start gap-3">
                                                <ViabilityAnalysis appliance={appliance} />
                                                <button
                                                    onClick={() => handleEdit(appliance)}
                                                    className="p-1 hover:bg-slate-100 rounded-lg text-slate-300 hover:text-blue-600 transition"
                                                >
                                                    <Edit2 size={16} />
                                                </button>
                                            </div>
                                        </div>

                                        {/* Info Body */}
                                        <div className="p-5 space-y-4">
                                            <div className="grid grid-cols-2 gap-3">
                                                <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100 text-center">
                                                    <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Reparaciones</p>
                                                    <p className="text-lg font-bold text-slate-700">{appliance.repairCount}</p>
                                                </div>
                                                <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100 text-center">
                                                    <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Gastado</p>
                                                    <p className="text-lg font-bold text-slate-700">{appliance.totalSpent.toFixed(0)}€</p>
                                                </div>
                                            </div>

                                            <div className="space-y-1.5 pt-2 border-t border-slate-50">
                                                <div className="flex justify-between text-xs">
                                                    <span className="text-slate-400">Modelo</span>
                                                    <span className="font-mono font-medium text-slate-600">{appliance.model || '---'}</span>
                                                </div>
                                                <div className="flex justify-between text-xs">
                                                    <span className="text-slate-400">Ubicación</span>
                                                    <span className="font-medium text-slate-600">{appliance.location || '---'}</span>
                                                </div>
                                            </div>

                                            {/* Action Footer - Organized Layout */}
                                            <div className="pt-2 flex flex-col gap-2">
                                                {/* Primary Action */}
                                                <button
                                                    onClick={() => navigate(`/new-service?from_appliance=${appliance.id}`)}
                                                    className="w-full bg-blue-600 text-white py-2.5 rounded-xl font-bold text-xs uppercase tracking-wide hover:bg-blue-700 transition flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20 active:scale-95"
                                                >
                                                    <Wrench size={16} /> Solicitar Servicio
                                                </button>

                                                {/* Secondary Actions Row */}
                                                <div className="flex items-center justify-between gap-2">
                                                    <button
                                                        onClick={() => {
                                                            setHistoryAppliance(appliance);
                                                            setShowHistory(true);
                                                        }}
                                                        className="flex-1 p-2 bg-slate-50 text-slate-500 rounded-lg hover:bg-slate-100 transition border border-slate-100 flex justify-center"
                                                        title="Ver Historial"
                                                    >
                                                        <History size={16} />
                                                    </button>
                                                    <button
                                                        onClick={() => {
                                                            setGalleryAppliance(appliance);
                                                            setShowGallery(true);
                                                        }}
                                                        className="flex-1 p-2 bg-slate-50 text-slate-500 rounded-lg hover:bg-slate-100 transition border border-slate-100 flex justify-center"
                                                        title="Ver Galería"
                                                    >
                                                        <Camera size={16} />
                                                    </button>

                                                    {/* MORTIFY LOGIC */}
                                                    {(!appliance.mortifyStatus || appliance.mortifyStatus.status !== 'PENDING_JUDGE') && (
                                                        <button
                                                            onClick={() => {
                                                                setMortifyAppliance(appliance);
                                                                setShowMortify(true);
                                                            }}
                                                            className="flex-1 p-2 bg-pink-50 text-pink-500 rounded-lg hover:bg-pink-100 transition border border-pink-100 flex justify-center"
                                                            title="Análisis de Viabilidad"
                                                        >
                                                            <PiggyBank size={16} />
                                                        </button>
                                                    )}

                                                    <button
                                                        onClick={() => handleDelete(appliance.id)}
                                                        className="flex-1 p-2 text-red-400 bg-red-50 hover:bg-red-100 hover:text-red-500 rounded-lg transition border border-red-100 flex justify-center"
                                                        title="Eliminar"
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* MORTIFY PROMO BANNER (Desktop Sidebar - Aggressive Commercial Copy) */}
                    <div className="w-full lg:w-80 shrink-0 mt-8 lg:mt-0">
                        <div className="sticky top-8 bg-gradient-to-br from-pink-600 to-rose-700 rounded-2xl p-6 text-white shadow-2xl overflow-hidden relative group transform hover:scale-[1.02] transition duration-500">
                            {/* Decor Balls */}
                            <div className="absolute -top-12 -right-12 w-40 h-40 bg-white/10 rounded-full blur-3xl group-hover:bg-white/20 transition duration-700"></div>
                            <div className="absolute bottom-[-20px] left-[-20px] w-32 h-32 bg-purple-600/40 rounded-full blur-2xl"></div>

                            <div className="relative z-10 flex flex-col items-center text-center">
                                <div className="bg-white p-3 rounded-full shadow-lg mb-4 animate-bounce-slow ring-4 ring-pink-500/30">
                                    <PiggyBank size={40} className="text-pink-600" />
                                </div>

                                <h3 className="text-xl font-black mb-1 leading-tight tracking-tight uppercase">
                                    ¿REPARAR O TIRAR?
                                </h3>
                                <p className="text-pink-100 text-xs font-medium mb-4 px-2 opacity-90">
                                    No tires tu dinero en reparaciones inútiles.
                                </p>

                                <div className="bg-black/20 backdrop-blur-sm rounded-lg p-3 w-full border border-white/10 mb-5 relative overflow-hidden">
                                    <div className="absolute top-0 right-0 bg-yellow-400 text-yellow-900 text-[9px] font-bold px-2 py-0.5 rounded-bl-lg">
                                        ÚNICO EN EL MERCADO
                                    </div>
                                    <p className="text-3xl font-black text-white tracking-tighter mt-2">4,99€</p>
                                    <p className="text-[9px] uppercase tracking-widest text-pink-200">Reembolsable*</p>
                                </div>

                                <ul className="text-left text-xs space-y-3 mb-6 w-full text-pink-50 font-medium">
                                    <li className="flex items-start gap-2.5">
                                        <div className="bg-white/20 p-1 rounded-full shrink-0 mt-0.5">
                                            <CheckCircle size={10} className="text-white" />
                                        </div>
                                        <span>Sistema exclusivo de <strong>Inteligencia Artificial</strong> + Verificación Humana.</span>
                                    </li>
                                    <li className="flex items-start gap-2.5">
                                        <div className="bg-white/20 p-1 rounded-full shrink-0 mt-0.5">
                                            <CheckCircle size={10} className="text-white" />
                                        </div>
                                        <span>Te descontamos el coste si decides realizar la reparación.</span>
                                    </li>
                                </ul>

                                <button
                                    onClick={() => {
                                        alert("¡Toma el control de tus electrodomésticos! Pulsa el cerdito en cualquier tarjeta para empezar.");
                                    }}
                                    className="w-full py-3 bg-white text-pink-700 rounded-lg font-black hover:bg-pink-50 transition shadow-xl active:scale-95 uppercase tracking-wide text-xs flex items-center justify-center gap-2 group-hover:shadow-pink-900/50"
                                >
                                    <Zap size={14} className="fill-current" />
                                    Analizar Viabilidad
                                </button>
                                <p className="text-[9px] text-pink-200 mt-3 opacity-60">*Se descuenta del precio final de la reparación.</p>
                            </div>
                        </div>
                    </div>
                </div>


                {/* Modal */}
                {
                    showModal && (
                        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 animate-in fade-in backdrop-blur-sm">
                            <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto relative shadow-2xl">
                                <button onClick={() => setShowModal(false)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 z-10 bg-white rounded-full p-1">✕</button>

                                <div className="p-6 md:p-8">
                                    <h2 className="text-2xl font-bold text-slate-800 mb-1">{isEditing ? 'Editar Electrodoméstico' : 'Nuevo Electrodoméstico'}</h2>
                                    <p className="text-slate-500 mb-6 text-sm">Completa la información para tener tu inventario al día.</p>

                                    <form onSubmit={handleSubmit} className="space-y-6">
                                        {/* Basic Info */}
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Tipo</label>
                                                <select
                                                    required
                                                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-100 outline-none"
                                                    value={formData.type}
                                                    onChange={e => setFormData({ ...formData, type: e.target.value })}
                                                >
                                                    <option value="">Seleccionar...</option>
                                                    {applianceTypes.map(t => <option key={t} value={t}>{t}</option>)}
                                                </select>
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Marca</label>
                                                <input
                                                    required
                                                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-100 outline-none"
                                                    placeholder="Ej. Samsung"
                                                    value={formData.brand}
                                                    onChange={e => setFormData({ ...formData, brand: e.target.value })}
                                                />
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-100 relative group">
                                                <label className="block text-xs font-bold text-blue-800 mb-1 uppercase flex justify-between">
                                                    <span>Modelo (OCR)</span>
                                                    {ocrScanning && <span className="animate-pulse">Escaneando...</span>}
                                                </label>
                                                <input
                                                    className="w-full p-3 bg-white border border-blue-200 rounded-xl mb-2 font-mono text-sm"
                                                    placeholder="E-Nr..."
                                                    value={formData.model}
                                                    onChange={e => setFormData({ ...formData, model: e.target.value })}
                                                />
                                                <p className="text-xs text-blue-500/80">Sube la "Foto Etiqueta" para detectar esto automáticamente.</p>
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Ubicación</label>
                                                <input
                                                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-100 outline-none"
                                                    placeholder="Ej. Cocina, Sótano..."
                                                    value={formData.location}
                                                    onChange={e => setFormData({ ...formData, location: e.target.value })}
                                                />
                                            </div>
                                        </div>

                                        {/* Purchase Date (Added) */}
                                        <div>
                                            <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Fecha de Compra Aprox.</label>
                                            <input
                                                type="date"
                                                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-100 outline-none"
                                                value={formData.purchase_date}
                                                onChange={e => setFormData({ ...formData, purchase_date: e.target.value })}
                                            />
                                            <p className="text-[10px] text-slate-400 mt-1">Si no recuerdas el día exacto, pon el día 1 de ese mes/año. Ayuda a calcular la antigüedad.</p>
                                        </div>

                                        {/* Photos Section */}
                                        <div>
                                            <label className="block text-xs font-bold text-slate-500 mb-3 uppercase">Fotografías del Equipo</label>
                                            <div className="grid grid-cols-3 gap-3">

                                                {/* Photo 1: Model/Label */}
                                                <div className="relative aspect-square">
                                                    <label className={`flex flex-col items-center justify-center w-full h-full border-2 border-dashed rounded-xl cursor-pointer hover:bg-slate-50 transition overflow-hidden bg-white
                                                ${formData.photo_model ? 'border-blue-400' : 'border-slate-200'}`}>
                                                        {formData.photo_model ? (
                                                            <img src={formData.photo_model} className="w-full h-full object-cover" />
                                                        ) : (
                                                            <>
                                                                <Scan className="text-slate-400 mb-1" size={20} />
                                                                <span className="text-[10px] text-slate-500 font-bold text-center leading-tight">ETIQUETA<br />(OCR)</span>
                                                            </>
                                                        )}
                                                        <input type="file" accept="image/*" className="hidden" onChange={(e) => handleFileUpload(e, 'photo_model')} disabled={uploading} />
                                                    </label>
                                                    {formData.photo_model && <div className="absolute top-1 right-1 bg-blue-600 text-white text-[10px] px-1.5 py-0.5 rounded shadow">Modelo</div>}
                                                </div>

                                                {/* Photo 2: Location */}
                                                <div className="relative aspect-square">
                                                    <label className={`flex flex-col items-center justify-center w-full h-full border-2 border-dashed rounded-xl cursor-pointer hover:bg-slate-50 transition overflow-hidden bg-white
                                                ${formData.photo_location ? 'border-green-400' : 'border-slate-200'}`}>
                                                        {formData.photo_location ? (
                                                            <img src={formData.photo_location} className="w-full h-full object-cover" />
                                                        ) : (
                                                            <>
                                                                <MapPin className="text-slate-400 mb-1" size={20} />
                                                                <span className="text-[10px] text-slate-500 font-bold text-center">UBICACIÓN</span>
                                                            </>
                                                        )}
                                                        <input type="file" accept="image/*" className="hidden" onChange={(e) => handleFileUpload(e, 'photo_location')} disabled={uploading} />
                                                    </label>
                                                </div>

                                                {/* Photo 3: Overview */}
                                                <div className="relative aspect-square">
                                                    <label className={`flex flex-col items-center justify-center w-full h-full border-2 border-dashed rounded-xl cursor-pointer hover:bg-slate-50 transition overflow-hidden bg-white
                                                ${formData.photo_overview ? 'border-purple-400' : 'border-slate-200'}`}>
                                                        {formData.photo_overview ? (
                                                            <img src={formData.photo_overview} className="w-full h-full object-cover" />
                                                        ) : (
                                                            <>
                                                                <Camera className="text-slate-400 mb-1" size={20} />
                                                                <span className="text-[10px] text-slate-500 font-bold text-center">GENERAL</span>
                                                            </>
                                                        )}
                                                        <input type="file" accept="image/*" className="hidden" onChange={(e) => handleFileUpload(e, 'photo_overview')} disabled={uploading} />
                                                    </label>
                                                </div>

                                            </div>
                                            <p className="text-[10px] text-slate-400 mt-2 text-center">*La foto de la etiqueta intentará leer el modelo automáticamente.</p>
                                        </div>


                                        <div className="pt-4 border-t border-slate-100 flex gap-3">
                                            <button
                                                type="button"
                                                onClick={() => setShowModal(false)}
                                                className="flex-1 py-3.5 rounded-xl font-bold text-slate-500 hover:bg-slate-100 transition"
                                            >
                                                Cancelar
                                            </button>
                                            <button
                                                type="submit"
                                                disabled={uploading || ocrScanning}
                                                className="flex-1 bg-blue-600 text-white py-3.5 rounded-xl font-bold hover:bg-blue-700 transition shadow-lg shadow-blue-600/20 active:scale-95 disabled:opacity-70 disabled:active:scale-100"
                                            >
                                                {uploading ? 'Subiendo...' : ocrScanning ? 'Escaneando...' : isEditing ? 'Guardar Cambios' : 'Registrar Aparato'}
                                            </button>
                                        </div>
                                    </form>
                                </div>
                            </div>
                        </div>
                    )
                }

                {/* History Modal */}
                {
                    showHistory && (
                        <HistoryModal
                            appliance={historyAppliance}
                            onClose={() => setShowHistory(false)}
                        />
                    )
                }

                {/* Gallery Modal */}
                {
                    showGallery && (
                        <GalleryModal
                            appliance={galleryAppliance}
                            onClose={() => setShowGallery(false)}
                        />
                    )
                }

                {/* Mortify Wizard */}
                {
                    showMortify && (
                        <MortifyWizard
                            appliance={mortifyAppliance}
                            onClose={() => setShowMortify(false)}
                            onSuccess={() => {
                                fetchAppliances(); // Refresh data to show badge
                            }}
                        />
                    )
                }
            </div >
        </div >
    );
};

export default MyAppliances;
