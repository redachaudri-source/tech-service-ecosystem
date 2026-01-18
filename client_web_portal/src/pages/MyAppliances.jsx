import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Plus, Trash2, MapPin, Camera, Wrench, ArrowLeft, Package, Edit2, Scan, Zap, Tv, Thermometer, Wind, Waves, Disc, Flame, Utensils, Smartphone, Refrigerator, History, FileText, TrendingUp, AlertTriangle, CheckCircle, PiggyBank, Loader2, X, ChevronDown } from 'lucide-react';
import Tesseract from 'tesseract.js';
import MortifyWizard from '../components/MortifyWizard';
import ViabilityLabel from '../components/ViabilityLabel';
import MortifyExplainerBanner from '../components/MortifyExplainerBanner';
import MortifyVerdictModal from '../components/MortifyVerdictModal';

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

// --- BRAND AUTOCOMPLETE COMPONENT ---
// --- BRAND AUTOCOMPLETE COMPONENT ---
const BrandAutocomplete = ({ value, onChange }) => {
    const [brands, setBrands] = useState([]);
    const [suggestions, setSuggestions] = useState([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [error, setError] = useState(false);

    useEffect(() => {
        // Fetch brands from DB (mortify_brand_scores)
        const fetchBrands = async () => {
            const { data, error } = await supabase
                .from('mortify_brand_scores')
                .select('brand_name')
                .order('brand_name');

            if (error) {
                console.error("Error loading brands:", error);
                setError(true);
            }
            if (data) {
                const list = data.map(b => b.brand_name);
                setBrands(list);
                setSuggestions(list); // Init suggestions
            }
        };
        fetchBrands();
    }, []);

    const handleChange = (e) => {
        const val = e.target.value;
        onChange(val);

        if (val.length > 0) {
            const filtered = brands.filter(b => b.toLowerCase().includes(val.toLowerCase()));
            setSuggestions(filtered);
            setShowSuggestions(true); // Always show if typing
        } else {
            setSuggestions(brands); // Reset to full list
            setShowSuggestions(true); // Keep showing list even if empty
        }
    };

    const handleSelect = (brand) => {
        onChange(brand);
        setShowSuggestions(false);
    };

    return (
        <div className="relative group">
            <div className="relative">
                <input
                    required
                    className={`w-full p-3 bg-slate-50 border ${error ? 'border-red-300' : 'border-slate-200'} rounded-xl focus:ring-2 focus:ring-blue-100 outline-none pr-10`}
                    placeholder={error ? "Error cargando lista" : "Escribe o selecciona..."}
                    value={value}
                    onChange={handleChange}
                    onFocus={() => {
                        // Always show list on focus, resetting filter if needed
                        if (!value) setSuggestions(brands);
                        setShowSuggestions(true);
                    }}
                    onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                    autoComplete="off"
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                    <ChevronDown size={16} />
                </div>
            </div>
            {showSuggestions && (
                <ul className="absolute z-50 w-full bg-white border border-slate-200 rounded-xl mt-1 max-h-48 overflow-y-auto shadow-lg animate-in fade-in zoom-in-95 duration-100">
                    {suggestions.length === 0 ? (
                        <li className="p-3 text-slate-400 text-sm italic text-center">
                            No se encontraron marcas. <br />
                            <span className="text-xs">Escribe para añadir una nueva.</span>
                        </li>
                    ) : (
                        suggestions.map((brand, idx) => (
                            <li
                                key={idx}
                                className="p-3 hover:bg-blue-50 cursor-pointer text-slate-700 text-sm border-b border-slate-50 last:border-0"
                                onClick={() => handleSelect(brand)}
                            >
                                {brand}
                            </li>
                        ))
                    )}
                </ul>
            )}
        </div>
    );
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

    // Verdict Modal State
    const [showVerdictModal, setShowVerdictModal] = useState(false);
    const [verdictAssessment, setVerdictAssessment] = useState(null);

    // Form State
    const initialForm = {
        type: '',
        brand: '',
        model: '',
        location: '',
        purchase_date: '',
        photo_model: '',
        photo_location: '',
        photo_overview: '',
        housing_type: 'PISO',
        floor_level: 0,
        purchase_year: ''
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

        // Realtime Subscription
        const channel = supabase
            .channel('client-appliances-realtime')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'mortify_assessments' },
                () => {
                    console.log('Mortify update detected, refreshing...');
                    fetchAppliances();
                }
            )
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'client_appliances' },
                () => {
                    console.log('Appliance update detected, refreshing...');
                    fetchAppliances();
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
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

                // Check active mortify assessment (Safe handle for One-to-One vs One-to-Many)
                let rawMA = app.mortify_assessments;
                if (!Array.isArray(rawMA)) {
                    rawMA = rawMA ? [rawMA] : [];
                }
                const assessments = rawMA.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
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
            // Alert removed after debugging
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
            photo_overview: appliance.photo_overview || '',
            housing_type: appliance.housing_type || 'PISO',
            floor_level: appliance.floor_level || 0,
            purchase_year: appliance.purchase_year || (appliance.purchase_date ? new Date(appliance.purchase_date).getFullYear() : '')
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
                purchase_date: formData.purchase_date || null,
                purchase_year: formData.purchase_year ? parseInt(formData.purchase_year) : null,
                floor_level: parseInt(formData.floor_level || 0)
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

        // SHOW RESULT (For any status that is not PENDING_JUDGE)
        if (appliance.mortifyStatus) {
            // Calculate Final Score (Algo + Necromancer Bonus)
            const rawScore = appliance.mortifyStatus.total_score || 0;
            const bonus = appliance.mortifyStatus.admin_recovered_points || 0;
            const finalScore = rawScore + bonus;

            return (
                <div className="flex flex-col items-end gap-1">
                    <div
                        onClick={(e) => {
                            e.stopPropagation();
                            setVerdictAssessment({ ...appliance.mortifyStatus, total_score: finalScore }); // Pass summed score
                            setShowVerdictModal(true);
                        }}
                        className="cursor-pointer hover:scale-105 transition-transform"
                        title="Ver Dictamen Detallado"
                    >
                        <ViabilityLabel score={finalScore} size="sm" />
                    </div>
                    <span className="text-[9px] text-slate-400 font-medium">
                        {new Date(appliance.mortifyStatus.created_at).toLocaleDateString()}
                    </span>
                    {bonus > 0 && (
                        <span className="text-[8px] font-bold text-purple-500 bg-purple-50 px-1 rounded border border-purple-100">
                            +{bonus} pts extra
                        </span>
                    )}
                </div>
            );
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
                            <h1 className="text-2xl font-bold text-slate-800">Mis Electrodomésticos <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full">v3.0</span></h1>
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

                {/* HERO BANNER: MORTIFY VALUE PROP */}
                <MortifyExplainerBanner />

                {/* Appliances Grid Container */}
                <div className="flex flex-col gap-8">
                    <div className="w-full">
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
                                            <div className="flex flex-col items-end gap-2">
                                                <button
                                                    onClick={() => handleEdit(appliance)}
                                                    className="p-1.5 hover:bg-slate-100 rounded-full text-slate-400 hover:text-blue-600 transition"
                                                    title="Editar"
                                                >
                                                    <Edit2 size={16} />
                                                </button>
                                                <ViabilityAnalysis appliance={appliance} />
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
                                                <BrandAutocomplete
                                                    value={formData.brand}
                                                    onChange={val => setFormData({ ...formData, brand: val })}
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
                                                onChange={e => {
                                                    const date = e.target.value;
                                                    // Auto-calc year
                                                    const year = date ? new Date(date).getFullYear() : '';
                                                    setFormData({ ...formData, purchase_date: date, purchase_year: year });
                                                }}
                                            />
                                            <p className="text-[10px] text-slate-400 mt-1">Si no recuerdas el día exacto, pon el día 1 de ese mes/año.</p>
                                        </div>

                                        {/* SMART DATA: Housing & Floor */}
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100">
                                            <div>
                                                <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Tipo de Vivienda</label>
                                                <select
                                                    className="w-full p-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-100 outline-none mb-1"
                                                    value={formData.housing_type || 'PISO'}
                                                    onChange={e => {
                                                        const type = e.target.value;
                                                        const isFlat = type === 'PISO';
                                                        setFormData({
                                                            ...formData,
                                                            housing_type: type,
                                                            floor_level: isFlat ? formData.floor_level : 0
                                                        });
                                                    }}
                                                >
                                                    <option value="PISO">Piso / Apartamento</option>
                                                    <option value="CASA_MATA">Casa Mata / Baja</option>
                                                    <option value="CHALET">Chalet / Adosado</option>
                                                    <option value="BARCO">Barco / Caravana</option>
                                                </select>
                                                <p className="text-[10px] text-slate-400">Factor logístico para Mortify.</p>
                                            </div>

                                            {(!formData.housing_type || formData.housing_type === 'PISO') && (
                                                <div>
                                                    <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Planta / Altura</label>
                                                    <select
                                                        className="w-full p-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-100 outline-none"
                                                        value={formData.floor_level || 0}
                                                        onChange={e => setFormData({ ...formData, floor_level: parseInt(e.target.value) })}
                                                    >
                                                        <option value="0">Bajo / Con Ascensor</option>
                                                        <option value="1">1ª Planta (Sin Ascensor)</option>
                                                        <option value="2">2ª Planta (Sin Ascensor)</option>
                                                        <option value="3">3ª Planta (Sin Ascensor)</option>
                                                        <option value="4">4ª o superior (Sin Ascensor)</option>
                                                    </select>
                                                    <p className="text-[10px] text-slate-400">Si tiene ascensor grande, pon "Bajo".</p>
                                                </div>
                                            )}
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
                                                        <input type="file" className="hidden" accept="image/*" onChange={(e) => handleFileUpload(e, 'photo_model')} disabled={uploading} />
                                                    </label>
                                                </div>

                                                {/* Photo 2: Location */}
                                                <div className="relative aspect-square">
                                                    <label className={`flex flex-col items-center justify-center w-full h-full border-2 border-dashed rounded-xl cursor-pointer hover:bg-slate-50 transition overflow-hidden bg-white
                                                ${formData.photo_location ? 'border-blue-400' : 'border-slate-200'}`}>
                                                        {formData.photo_location ? (
                                                            <img src={formData.photo_location} className="w-full h-full object-cover" />
                                                        ) : (
                                                            <>
                                                                <MapPin className="text-slate-400 mb-1" size={20} />
                                                                <span className="text-[10px] text-slate-500 font-bold text-center leading-tight">UBICACIÓN</span>
                                                            </>
                                                        )}
                                                        <input type="file" className="hidden" accept="image/*" onChange={(e) => handleFileUpload(e, 'photo_location')} disabled={uploading} />
                                                    </label>
                                                </div>

                                                {/* Photo 3: Overview */}
                                                <div className="relative aspect-square">
                                                    <label className={`flex flex-col items-center justify-center w-full h-full border-2 border-dashed rounded-xl cursor-pointer hover:bg-slate-50 transition overflow-hidden bg-white
                                                ${formData.photo_overview ? 'border-blue-400' : 'border-slate-200'}`}>
                                                        {formData.photo_overview ? (
                                                            <img src={formData.photo_overview} className="w-full h-full object-cover" />
                                                        ) : (
                                                            <>
                                                                <Camera className="text-slate-400 mb-1" size={20} />
                                                                <span className="text-[10px] text-slate-500 font-bold text-center leading-tight">GENERAL</span>
                                                            </>
                                                        )}
                                                        <input type="file" className="hidden" accept="image/*" onChange={(e) => handleFileUpload(e, 'photo_overview')} disabled={uploading} />
                                                    </label>
                                                </div>
                                            </div>
                                        </div>

                                        <button
                                            type="submit"
                                            disabled={uploading}
                                            className="w-full bg-blue-600 text-white py-4 rounded-xl font-bold text-lg hover:bg-blue-700 transition shadow-lg shadow-blue-600/20 active:scale-95 disabled:opacity-50"
                                        >
                                            {uploading ? 'Subiendo fotos...' : (isEditing ? 'Guardar Cambios' : 'Registrar Aparato')}
                                        </button>
                                    </form>
                                </div>
                            </div>
                        </div>
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

                {/* Verdict Modal */}
                {
                    showVerdictModal && (
                        <MortifyVerdictModal
                            assessment={verdictAssessment}
                            onClose={() => setShowVerdictModal(false)}
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
                                setShowMortify(false);
                                fetchAppliances(); // Refresh to see badge
                            }}
                        />
                    )
                }
            </div>
        </div>
    );
};

export default MyAppliances;
