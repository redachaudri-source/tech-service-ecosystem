import { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { Calendar, ChevronLeft, ChevronRight, CheckSquare, Square, Map as MapIcon, X, MapPin, Phone, Navigation, Clock, AlertTriangle, Zap, ArrowRight, LayoutList } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup, Polyline, Tooltip as MapTooltip } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useToast } from '../components/ToastProvider';
import ClockWidget from '../components/ClockWidget'; // Premium Clock
import ServiceDetailsModal from '../components/ServiceDetailsModal'; // Replica of ServiceTable logic

// Fix Leaflet Icon
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Custom Icons
const createTechIcon = (color) => new L.DivIcon({
    className: 'custom-div-icon',
    html: `<div style="background-color: ${color}; width: 14px; height: 14px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 4px rgba(0,0,0,0.5);"></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7]
});

// --- CONSTANTS ---
// Default range if config fails
const START_HOUR = 8;
const END_HOUR = 20;

const APPLIANCE_COLORS = {
    wash: 'bg-blue-500 border border-blue-600 text-white',      // Lavado (Blue-500)
    cold: 'bg-amber-500 border border-amber-600 text-white',    // Frío (Amber-500)
    climate: 'bg-emerald-500 border border-emerald-600 text-white', // Clima (Emerald-500)
    heat: 'bg-rose-600 border border-rose-700 text-white',      // Calefacción (Rose-600)
    cooking: 'bg-violet-500 border border-violet-600 text-white', // Cocción (Violet-500)
    default: 'bg-slate-500 border border-slate-600 text-white'  // Otros (Slate-500)
};

const getApplianceCategory = (type) => {
    if (!type) return 'default';
    const t = type.toLowerCase();

    // Lavado
    if (t.includes('lavadora') || t.includes('secadora') || t.includes('lavavajillas')) return 'wash';

    // Frío (Neveras) - User Request: Amber
    if (t.includes('frigor') || t.includes('congelador') || t.includes('never') || t.includes('vino')) return 'cold';

    // Clima (Aire) - User Request: Emerald
    if (t.includes('aire') || t.includes('split') || t.includes('conductos')) return 'climate';

    // Calefacción (Termos, Calderas) - User Request: Rose
    if (t.includes('caldera') || t.includes('termo') || t.includes('calentador') || t.includes('radiador')) return 'heat';

    // Cocción (Hornos, Vitros) - User Request: Violet
    if (t.includes('horno') || t.includes('vitro') || t.includes('micro') || t.includes('fuego') || t.includes('campana') || t.includes('encimera')) return 'cooking';

    return 'default';
};

const getStartOfWeek = (d) => {
    const date = new Date(d);
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
    return new Date(date.setDate(diff));
};

// Helper for Month View Grid Start
const getStartOfMonthGrid = (d) => {
    const date = new Date(d);
    date.setDate(1); // 1st of month
    const day = date.getDay(); // 0=Sun, 1=Mon
    // We want Mon as col 1.
    // If 1st is Mon (1), diff 0.
    // If 1st is Sun (0), diff -6.
    const diff = day === 0 ? -6 : 1 - day;
    const startObj = new Date(date);
    startObj.setDate(date.getDate() + diff);
    return startObj;
};

const GlobalAgenda = () => {
    // 💨 MOTION BLUR STYLE INJECTION
    useEffect(() => {
        const styleId = 'mrcp-motion-blur';
        if (!document.getElementById(styleId)) {
            const style = document.createElement('style');
            style.id = styleId;
            style.innerHTML = `
                .teleport-blur {
                    transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
                    filter: blur(4px) opacity(0.7);
                    transform: scale(0.95) translateY(10px);
                }
            `;
            document.head.appendChild(style);
        }
    }, []);
    const { addToast } = useToast();
    const navigate = useNavigate(); // Not needed for detail modal
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [techs, setTechs] = useState([]);
    const [selectedTechs, setSelectedTechs] = useState([]);
    const [appointments, setAppointments] = useState([]);
    const [businessConfig, setBusinessConfig] = useState(null);
    const [loading, setLoading] = useState(true);

    // 🕒 DIGITAL CLOCK STATE
    const [currentTime, setCurrentTime] = useState(new Date());

    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000); // Update every second
        return () => clearInterval(timer);
    }, []);

    // 📱 MOBILE DETECTION
    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // 🔍 ZOOM STATE (Pixel Density)
    // 0-33: Month | 34-66: Fortnight | 67-100: Week
    const [zoomLevel, setZoomLevel] = useState(100);

    // Derived States
    const viewMode = useMemo(() => {
        if (isMobile) return 'day'; // 📱 Force Day View
        if (zoomLevel <= 33) return 'month';
        if (zoomLevel <= 66) return 'fortnight';
        return 'week';
    }, [zoomLevel, isMobile]);

    const pixelsPerHour = useMemo(() => {
        // Only affect pixel density in Week/Fortnight mode
        // Map 67-100 to 60px-120px
        if (viewMode === 'day') return 80; // Fixed height for day view mobile
        if (viewMode === 'month') return 30; // Min for month
        if (viewMode === 'fortnight') return 60; // Compact
        // Linear map 67->60, 100->100
        return Math.max(50, zoomLevel);
    }, [zoomLevel, viewMode]);

    // --- DYNAMIC TIME CONFIGURATION ---
    // Reads from Business Settings (e.g. 09:00 - 19:00) and adds padding (-1 / +1)
    const openH = businessConfig?.opening_time ? parseInt(businessConfig.opening_time.split(':')[0]) : 8;
    const closeH = businessConfig?.closing_time ? parseInt(businessConfig.closing_time.split(':')[0]) : 20;

    // DYNAMIC MODE: Adjust to Business Hours + Padding
    const startHour = Math.max(0, (isNaN(openH) ? 8 : openH) - 1);
    const endHour = Math.min(23, (isNaN(closeH) ? 20 : closeH) + 1);

    const hoursCount = Math.max(1, endHour - startHour + 1);
    const gridHeight = hoursCount * pixelsPerHour;
    // Explicitly define hours array based on DYNAMIC limits to ensure sync
    const dynamicHours = Array.from({ length: hoursCount }, (_, i) => startHour + i);

    // UI States
    const [showMapModal, setShowMapModal] = useState(false);
    const [showRoutePanel, setShowRoutePanel] = useState(false);
    const [selectedAppt, setSelectedAppt] = useState(null); // For Popover
    const [detailTicket, setDetailTicket] = useState(null); // For Full Modal

    // --- AI ROUTE OPTIMIZER STATE ---
    const [showOptimizer, setShowOptimizer] = useState(false);
    const [isOptimizing, setIsOptimizing] = useState(false);
    const [optimizingDay, setOptimizingDay] = useState(null);

    // MRCP v2.0 State
    const [optimizerStep, setOptimizerStep] = useState('ANALYSIS'); // 'ANALYSIS' | 'PROPOSAL'
    const [optimizationStrategy, setOptimizationStrategy] = useState(null); // 'BOOMERANG' | 'EXPANSIVE' | null
    const [proposedMoves, setProposedMoves] = useState([]); // { appt, newStart }
    const [calledIds, setCalledIds] = useState([]); // To track calls made

    // 🆕 P.R.O.C. WEEK STATE
    const [optimizerMode, setOptimizerMode] = useState('DAY'); // 'DAY' | 'WEEK'
    const [weekRange, setWeekRange] = useState({ start: '', end: '' }); // ISO Date Strings YYYY-MM-DD

    // Helper: Estimate Travel Time (Heuristic)
    const getTravelTime = (cpA, cpB) => {
        if (!cpA || !cpB) return 15; // Default safe buffer
        const dist = Math.abs(cpA - cpB);
        // Base 15 mins + 2 mins per CP unit diff (simplified heuristic)
        // Clamped to max 60 to avoid absurdity
        return Math.min(60, 15 + (dist * 2));
    };

    const getCP = (t) => parseInt(t.client?.postal_code?.replace(/\D/g, '') || '99999');

    // 3. 🧠 P.R.O.C. SYSTEM CORE (Postal Route Optimization Core)
    // Refactored to be a pure helper for both Day and Week modes
    const calculateDayMoves = (targetDate, jobs, strategy, startCP) => {
        const getHierarchicalCost = (homeCP, targetCP) => {
            const sHome = String(homeCP).padStart(5, '0');
            const sTarget = String(targetCP).padStart(5, '0');

            // Level 1: Province (Digits 1-2)
            if (sHome.slice(0, 2) !== sTarget.slice(0, 2)) return 2000; // Different Province

            // Level 2: Sector (Digit 3)
            const sectorHome = sHome[2];
            const sectorTarget = sTarget[2];
            if (sectorHome !== sectorTarget) {
                // Calculate Sector distance (e.g. Sector 6 vs Sector 0)
                return 100 + (Math.abs(parseInt(sectorHome) - parseInt(sectorTarget)) * 10);
            }

            // Level 3: District (Digits 4-5) - Local street travel
            return Math.abs(homeCP - targetCP); // Simple numeric diff for neighborhoods
        };

        const getSector = (cp) => String(cp).padStart(5, '0')[2];
        // getCP is already defined above, no need to redefine here.

        let pool = [...jobs];
        const idealSequence = [];

        if (strategy === 'CENTRIFUGA') {
            // --- ESTRATEGIA A: CENTRÍFUGA (Star Fast / Expansive) ---
            pool.sort((a, b) => getHierarchicalCost(startCP, getCP(a)) - getHierarchicalCost(startCP, getCP(b)));
            idealSequence.push(...pool);

        } else if (strategy === 'SANDWICH') {
            // --- ESTRATEGIA C: SANDWICH (Mixed) ---
            const homeSector = getSector(startCP);
            const sameSectorJobs = pool.filter(j => getSector(getCP(j)) === homeSector);
            const otherSectorJobs = pool.filter(j => getSector(getCP(j)) !== homeSector);

            // Appetizer
            let appetizer = null;
            if (sameSectorJobs.length > 0) {
                sameSectorJobs.sort((a, b) => Math.abs(getCP(a) - startCP) - Math.abs(getCP(b) - startCP));
                appetizer = sameSectorJobs.shift();
                idealSequence.push(appetizer);
            }

            // Main Course + Dessert
            let mainPool = [...otherSectorJobs, ...sameSectorJobs];
            const sectors = {};
            mainPool.forEach(j => {
                const s = getSector(getCP(j));
                if (!sectors[s]) sectors[s] = [];
                sectors[s].push(j);
            });

            // Sort Sectors by Distance from Home (Descending)
            const sortedSectorKeys = Object.keys(sectors).sort((sa, sb) =>
                Math.abs(parseInt(sa) - parseInt(getSector(startCP))) - Math.abs(parseInt(sb) - parseInt(getSector(startCP)))
            ).reverse();

            sortedSectorKeys.forEach(sectorKey => {
                const jobsInSector = sectors[sectorKey];
                jobsInSector.sort((a, b) => getCP(b) - getCP(a)); // CP Descending
                idealSequence.push(...jobsInSector);
            });

        } else {
            // --- ESTRATEGIA B: BOOMERANG REAL (Default) ---
            const sectors = {};
            pool.forEach(j => {
                const s = getSector(getCP(j));
                if (!sectors[s]) sectors[s] = [];
                sectors[s].push(j);
            });

            const homeSectorVal = parseInt(getSector(startCP));
            const sectorKeys = Object.keys(sectors).sort((a, b) => {
                const distA = Math.abs(parseInt(a) - homeSectorVal);
                const distB = Math.abs(parseInt(b) - homeSectorVal);
                return distB - distA;
            });

            sectorKeys.forEach(sectorKey => {
                const jobs = sectors[sectorKey];
                jobs.sort((a, b) => getCP(b) - getCP(a)); // CP Descending
                idealSequence.push(...jobs);
            });
        }

        // 4. SMART STACKING (Timeline Reconstruction)
        const workDayStart = new Date(targetDate);
        workDayStart.setHours(9, 0, 0, 0);

        let currentTime = new Date(workDayStart);
        let lastCP = startCP;
        const moves = [];

        idealSequence.forEach((job, i) => {
            const displayCP = getCP(job);
            const travelTime = getTravelTime(lastCP, displayCP);

            // Calculate Start Time: If first job, start at 9:00. Else, prev end + travel.
            // Wait, currentTime tracks the "Available Pointer".
            // So Start = currentTime + Travel.

            // Correction: First job travel is also FROM home.
            // So Start = 9:00 + TravelFromHome.

            // Add Travel Time
            const travelMs = travelTime * 60000;
            let proposedStartMs = currentTime.getTime() + travelMs;

            // Round to 5 mins
            const remainder = proposedStartMs % (5 * 60000);
            if (remainder !== 0) proposedStartMs += ((5 * 60000) - remainder);

            const newStartDate = new Date(proposedStartMs);
            const originalStart = new Date(job.start);

            // Diff Check
            const isDifferent = Math.abs(newStartDate - originalStart) > 60000;

            if (isDifferent) {
                moves.push({
                    type: 'RESCHEDULE',
                    appt: job,
                    newStart: newStartDate,
                    travelMin: travelTime
                });
            }

            // Advance Timer: Start + Duration
            currentTime = new Date(proposedStartMs + ((job.duration || 60) * 60000));
            lastCP = displayCP;
        });

        return moves;
    };

    // --- AI LOGIC (v3.0 - SANDWICH + STACKING) ---
    // Update signature to accept optional customJobPool (Array of objects) for P.R.O.C. WEEK
    const runOptimizerAnalysis = async (day, activeStrategy = 'BOOMERANG', customJobPool = null) => {
        // setOptimizingDay(day); // Loop prevention
        setIsOptimizing(true);
        setOptimizerStep('ANALYSIS');
        // Only reset moves if running standalone day optimization. In Week mode, we aggregate.
        if (!customJobPool) setProposedMoves([]);

        // 1. Get Events: Use Custom Pool OR Fetch from State
        let dayEvents = [];
        if (customJobPool) {
            dayEvents = customJobPool;
        } else {
            const dayLocalStr = day.toDateString();
            dayEvents = appointments.filter(a => a.start.toDateString() === dayLocalStr && selectedTechs.includes(a.technician_id));
        }

        if (dayEvents.length < 2) {
            if (!customJobPool) addToast('Mínimo 2 tickets para optimizar.', 'info');
            // Return empty for orchestrator to handle
            if (customJobPool) return [];
            setIsOptimizing(false);
            return;
        }

        // 2. Identify "Km0" (Tech Home or Office) - STRICT MODE
        const techId = selectedTechs[0];
        const tech = techs.find(t => t.id === techId);

        // 🔒 GATEKEEPER: Strict CP Check
        if (!tech?.postal_code) {
            addToast(`⚠️ Imposible optimizar: El técnico ${tech?.full_name || 'seleccionado'} no tiene Código Postal (Km0) configurado.`, 'error', 5000);
            setIsOptimizing(false);
            return;
        }

        const startCP = parseInt(tech.postal_code.replace(/\D/g, '') || '0');
        if (startCP === 0) {
            addToast(`⚠️ Error en CP del técnico: Formato inválido (${tech.postal_code}).`, 'error');
            setIsOptimizing(false);
            return;
        }

        console.log('🏁 Algoritmo Sandwich Iniciado. Origen STRICT:', startCP);

        // CALL THE SOLVER
        const proposals = calculateDayMoves(day, dayEvents, activeStrategy, startCP);

        // Update State (or Return Results)
        if (customJobPool) {
            return proposals; // Week Mode: Return for aggregation
        } else {
            console.log('🏁 Single Day Optimization Completed. Moves:', proposals.length);
            setProposedMoves(proposals); // Day Mode: Update State directly
            setOptimizerStep('PROPOSAL');
            setIsOptimizing(false);
        }
    };

    // Actually, usually Tech travels implies arrival time. 
    // We set 'Start' = Arrival.
    // But we must respect 'currentTime' is when the PREVIOUS job led to availability.
    // First job starts at 9:00 (travel from home happening before).


    // ⚡ APPLY BATCH OPTIMIZATION
    const applyOptimizationBatch = async () => {
        // ⚠️ CONFIRMATION (Mirroring Manual Logic)
        const isConfirmed = window.confirm(
            `🚀 ¿CONFIRMAR OPTIMIZACIÓN?\n\n` +
            `Se van a reprogramar ${proposedMoves.length} citas para reducir tiempos de viaje.`
        );

        if (!isConfirmed) return;

        setIsOptimizing(true);

        try {
            // Optimistic Updates (UI First)
            const movesMap = new Map();
            proposedMoves.forEach(m => movesMap.set(m.appt.id, m.newStart));

            setAppointments(prev => prev.map(p => {
                if (movesMap.has(p.id)) {
                    const newStart = movesMap.get(p.id);
                    return { ...p, start: newStart, scheduled_at: newStart.toISOString() };
                }
                return p;
            }));

            // 🛡️ PARKING LOT STRATEGY (2-PHASE COMMIT)
            // Phase 1: Move to Temporary Safe Zone (Year + 20) to clear collisions
            // We keep the relative order to avoid collisions in the future too.
            for (const m of proposedMoves) {
                const tempDate = new Date(m.appt.start);
                tempDate.setFullYear(tempDate.getFullYear() + 20); // Into the Future 🚀

                const { error } = await supabase.from('tickets')
                    .update({
                        scheduled_at: tempDate.toISOString(),
                        technician_id: m.appt.technician_id
                    })
                    .eq('id', m.appt.id);

                if (error) {
                    console.error("Error in Phase 1 (Parking):", error);
                    throw new Error(`Fallo Fase 1 (Despeje): ${error.message}`);
                }
            }

            // Phase 2: Move to Final Destination
            for (const m of proposedMoves) {
                const { error } = await supabase.from('tickets')
                    .update({
                        scheduled_at: m.newStart.toISOString(),
                        technician_id: m.appt.technician_id
                    })
                    .eq('id', m.appt.id);

                if (error) {
                    console.error("Error in Phase 2 (Ranking):", error);
                    throw new Error(`Fallo Fase 2 (Reorden): ${error.message}`);
                }
            }

            addToast(`Ruta optimizada con éxito (${proposedMoves.length} tickets actualizados)`, 'success');

            // Refetch to ensure truth
            await fetchAgendaData();

        } catch (error) {
            console.error("Error applying optimization:", error);
            // Rollback UI with Specific Error
            addToast(`Error al guardar: ${error.message || 'Desconocido'}`, "error");
            await fetchAgendaData(); // Revert to DB state
        } finally {
            setProposedMoves([]);
            setIsOptimizing(false);
            setOptimizerStep('ANALYSIS');
        }
    };

    const discardOptimizationMove = (id) => {
        // In Stacking, removing one move breaks the chain. 
        // But for flexibility, we allow removing it (it stays at old time, others move).
        // This might cause overlaps, but user logic prevails.
        setProposedMoves(prev => prev.filter(m => m.appt.id !== id));
    };

    // --- AI LOGIC ---




    // Date Calculations
    const gridStart = useMemo(() => {
        if (viewMode === 'day') {
            const d = new Date(selectedDate);
            d.setHours(0, 0, 0, 0); // Start of selected day
            return d;
        }
        if (viewMode === 'month') return getStartOfMonthGrid(selectedDate);
        return getStartOfWeek(selectedDate);
    }, [selectedDate, viewMode]);

    const gridDates = useMemo(() => {
        const days = viewMode === 'day' ? 1 : (viewMode === 'week' ? 7 : (viewMode === 'fortnight' ? 14 : 42)); // 6 weeks for month
        return Array.from({ length: days }, (_, i) => {
            const d = new Date(gridStart);
            d.setDate(d.getDate() + i);
            return d;
        });
    }, [gridStart, viewMode]);

    // Data Fetching
    useEffect(() => {
        fetchAgendaData();
        fetchBusinessConfig();
    }, [gridStart, gridDates.length]); // Refetch when grid changes

    const fetchBusinessConfig = async () => {
        // Explicitly fetch the 'working_hours' configuration row to avoid ambiguity
        const { data } = await supabase
            .from('business_config')
            .select('*')
            .eq('key', 'working_hours')
            .single();

        if (data) setBusinessConfig(data);
    };

    const fetchAgendaData = async () => {
        setLoading(true);
        try {
            // Fetch range: Based on Grid Start and Grid Length
            // Fetch range: Based on Grid Start and Grid Length
            // 🛡️ BUFFER: Fetch -1 Day and +1 Day to handle Timezone spills (UTC vs Local)
            const startStr = new Date(gridStart.getTime() - 86400000).toISOString().split('T')[0];
            const endDate = new Date(gridStart);
            endDate.setDate(endDate.getDate() + gridDates.length + 1);
            const endStr = endDate.toISOString().split('T')[0];

            // 1. Fetch Techs
            const { data: techData } = await supabase
                .from('profiles')
                .select('*')
                .eq('role', 'tech')
                .eq('is_active', true)
                .is('deleted_at', null)
                .order('full_name');
            setTechs(techData || []);
            if (techData && selectedTechs.length === 0) {
                setSelectedTechs(techData.map(t => t.id));
            }

            // 1.5 Fetch Brands
            const { data: brandsData } = await supabase.from('brands').select('name, logo_url');

            // 2. Fetch Appointments (SAFE MODE - "TRINITY" LOGIC)
            // Reverting query to avoid ambiguous relationship errors, but relying on 'appliance_info' JSON for rich data
            const { data: apptData, error } = await supabase
                .from('tickets')
                .select(`
                    *, 
                    client:profiles!client_id(*),
                    client_appliances(*)
                `)
                .gte('scheduled_at', `${startStr}T00:00:00`)
                .lt('scheduled_at', `${endStr}T23:59:59`)
                .order('scheduled_at', { ascending: true });

            if (error) {
                console.error("Error fetching tickets:", error);
            }

            const processed = (apptData || [])
                .filter(a => {
                    const s = a.status?.toLowerCase() || '';
                    return !['cancelado', 'rechazado', 'anulado', 'finalizado'].includes(s) && a.technician_id;
                })
                .map(a => {
                    // RESOLVE "THE TRINITY": JSON vs DB
                    // ServiceMonitor uses 'appliance_info' JSON column. We prioritize it.
                    let dbAppliance = a.client_appliances;
                    if (Array.isArray(dbAppliance)) dbAppliance = dbAppliance[0];
                    const jsonAppliance = a.appliance_info;

                    // Priority: JSON (Service Snapshot) > DB Relation (Live Data) > Empty
                    const bestAppliance = (jsonAppliance?.type || jsonAppliance?.brand) ? jsonAppliance : (dbAppliance || {});

                    // Brand & Logo
                    const brandName = bestAppliance?.brand || 'Generico';
                    const brandInfo = brandsData?.find(b => b.name?.toLowerCase() === brandName?.toLowerCase());

                    // Debug
                    console.log('Processed Agenda Item:', { id: a.id, appliance: bestAppliance, title: a.title });

                    return {
                        ...a,
                        start: new Date(a.scheduled_at),
                        duration: a.estimated_duration || 60,
                        profiles: a.client || {},
                        appliance_info: bestAppliance, // The Truth
                        brand_logo: brandInfo?.logo_url || null
                    };
                });

            if (processed.length > 0) console.log('Agenda Data Loaded:', processed.length, 'items.');

            setAppointments(processed || []);
        } catch (error) {
            console.error("Fatal Error in fetchAgendaData:", error);
        } finally {
            setLoading(false);
        }
    };

    // 🆕 FETCH RANGE DATA (P.R.O.C. WEEK Helper)
    const fetchRangeData = async (startStr, endStr) => {
        if (!startStr || !endStr) return [];
        console.log(`📡 Fetching Range: ${startStr} to ${endStr}`);

        const { data, error } = await supabase
            .from('tickets')
            .select(`*, client:profiles!client_id(*), client_appliances(*)`)
            .gte('scheduled_at', `${startStr}T00:00:00`)
            .lt('scheduled_at', `${endStr}T23:59:59`)
            .order('scheduled_at', { ascending: true });

        if (error) {
            console.error("Error fetching range data:", error);
            return [];
        }

        return (data || [])
            .filter(a => {
                const s = a.status?.toLowerCase() || '';
                return !['cancelado', 'rechazado', 'anulado', 'finalizado'].includes(s) && a.technician_id;
            })
            .map(a => {
                let dbAppliance = Array.isArray(a.client_appliances) ? a.client_appliances[0] : a.client_appliances;
                const jsonAppliance = a.appliance_info;
                const bestAppliance = (jsonAppliance?.type || jsonAppliance?.brand) ? jsonAppliance : (dbAppliance || {});

                return {
                    ...a,
                    start: new Date(a.scheduled_at),
                    duration: a.estimated_duration || 60,
                    profiles: a.client || {},
                    appliance_info: bestAppliance
                };
            });
    };

    // 🆕 OPTIMIZER WEEK (Orchestrator)
    // 🆕 OPTIMIZER WEEK (Orchestrator)
    const runOptimizerWeek = async () => {
        if (!weekRange.start || !weekRange.end || !optimizationStrategy) {
            addToast('Selecciona Rango + Estrategia', 'error');
            return;
        }

        const dStart = new Date(weekRange.start);
        const dEnd = new Date(weekRange.end);

        if (dStart > dEnd) {
            addToast('Fecha fin debe ser posterior a inicio.', 'error');
            return;
        }

        setIsOptimizing(true);
        setOptimizerStep('ANALYSIS');
        setProposedMoves([]);

        try {
            const pool = await fetchRangeData(weekRange.start, weekRange.end);

            if (pool.length === 0) {
                addToast('No hay trabajos en el rango.', 'info');
                setIsOptimizing(false);
                return;
            }

            console.log(`WEEK OPTIMIZER: Found ${pool.length} jobs. Start Strategy: ${optimizationStrategy}`);

            // 1. CLUSTERING: Group by Sector (Dynamic Precision)
            // Goal: Find enough distinct clusters to fill the days.
            // Start with 3 digits. If not enough clusters, drill down to 4, then 5.

            const targetClusterCount = Math.max(2, Math.ceil((dEnd - dStart) / (1000 * 60 * 60 * 24))); // Roughly days count

            const performClustering = (jobs, precision) => {
                const clusters = {};
                jobs.forEach(job => {
                    const cp = job.client?.zip_code || '00000';
                    const sectorCode = cp.substring(0, precision);
                    if (!clusters[sectorCode]) clusters[sectorCode] = [];
                    clusters[sectorCode].push(job);
                });
                return clusters;
            };

            let currentPrecision = 3;
            let sectors = performClustering(pool, currentPrecision);
            let sectorKeys = Object.keys(sectors);

            // AUTO-ZOOM: If we have fewer sectors than days, and precision is low, drill down!
            // Or if we have one HUGE sector that dominates > 50% of work.
            console.log(`📡 Initial Clustering (Precision ${currentPrecision}): ${sectorKeys.length} sectors`);

            // Heuristic: If we have very few clusters (e.g. 1 big blob), try to split it.
            // Only split if we have enough jobs to justify it.
            if (sectorKeys.length < targetClusterCount && currentPrecision < 5) {
                console.log('🔍 Not enough sectors for Week Mode. Increasing precision...');

                // Strategy: Keep small sectors as is, but EXPLODE big sectors.
                // Actually, simplest implies just re-clustering logic globally first.
                // Let's try Global Increase first.
                const nextLevelSectors = performClustering(pool, currentPrecision + 1);
                if (Object.keys(nextLevelSectors).length > sectorKeys.length) {
                    sectors = nextLevelSectors;
                    currentPrecision++;
                    console.log(`🔍 Zoomed to Precision ${currentPrecision}. Now ${Object.keys(sectors).length} sectors.`);
                }

                // One more level check if still monoblock
                if (Object.keys(sectors).length === 1 && currentPrecision < 5) {
                    const deepSectors = performClustering(pool, currentPrecision + 1);
                    if (Object.keys(deepSectors).length > 1) {
                        sectors = deepSectors;
                        currentPrecision++;
                        console.log(`🔍 Zoomed to Precision ${currentPrecision} (Deep Dive).`);
                    }
                }
            }

            // 2. SORTING: Sort Sectors by Density (Highest Count First)
            const sortedSectors = Object.entries(sectors)
                .sort(([, a], [, b]) => b.length - a.length);

            console.log('📡 Final Sectors identified:', sortedSectors.map(([k, v]) => `${k} (${v.length})`));

            // 3. DISTRIBUTION: Assign 1 Sector -> 1 Day (Simple Greedy V1)
            // Get valid working days in range (skip Sundays if needed, but for now allow all)
            const workingDays = [];
            let curr = new Date(dStart);
            while (curr <= dEnd) {
                // Optional: Skip Sunday (0) if business rule requires. For now, include all.
                // if (curr.getDay() !== 0) 
                workingDays.push(new Date(curr));
                curr.setDate(curr.getDate() + 1);
            }

            const dateAssignments = {}; // { 'YYYY-MM-DD': [Job1, Job2] }
            workingDays.forEach(d => dateAssignments[d.toDateString()] = []);

            // Greedy Assignment: Round Robin or Fill-First?
            // Let's do: Assign Top Sector to Day 1, Second to Day 2... Loop if more sectors than days.
            // 3. DISTRIBUTION: Assign 1 Sector -> 1 Day (Round Robin)
            sortedSectors.forEach(([sectorCode, jobs], index) => {
                // Use Modulo to cycle through days
                const dayIndex = index % workingDays.length;
                const targetDate = workingDays[dayIndex];
                dateAssignments[targetDate.toDateString()].push(...jobs);
            });

            // 3.5. REBALANCE: (Minimal - Only if day is empty)
            // The smart clustering above should handle most "Mono-Zone" requirements naturally
            // by splitting big zones into smaller sub-zones (precision 3->4->5).
            // So we can remove the complex "Spillover" logic and rely on the clustering.


            // 4. DELEGATION - AGGREGATION LOOP
            let aggregatedMoves = [];


            // 2. Identify "Km0" (Tech Home or Office) - STRICT MODE
            const techId = selectedTechs[0];
            const tech = techs.find(t => t.id === techId);

            // 🔒 GATEKEEPER: Strict CP Check
            if (!tech?.postal_code) {
                addToast(`⚠️ Imposible optimizar: El técnico ${tech?.full_name || 'seleccionado'} no tiene Código Postal (Km0) configurado.`, 'error', 5000);
                setIsOptimizing(false);
                return;
            }

            const startCP = parseInt(tech.postal_code.replace(/\D/g, '') || '0');
            if (startCP === 0) {
                addToast(`⚠️ Error en CP del técnico: Formato inválido (${tech.postal_code}).`, 'error');
                setIsOptimizing(false);
                return;
            }

            for (const [dateStr, dayJobs] of Object.entries(dateAssignments)) {
                if (dayJobs.length === 0) continue;
                const targetDateObj = new Date(dateStr);

                // CASCADE: Week Distributor -> Day Optimizer
                // Zone Clustering determined the DAY. Now we let P.R.O.C. DAY determine the TIME.
                const dayMoves = calculateDayMoves(targetDateObj, dayJobs, optimizationStrategy, startCP);

                // Add to aggregate list
                aggregatedMoves.push(...dayMoves.map(m => ({
                    type: 'RESCHEDULE',
                    appt: m.appt,
                    newStart: m.newStart, 
                    travelMin: 0,
                    reason: 'Zone + Route Optimization'
                })));
            }

            console.log(`WEEK OPTIMIZER: Generated ${aggregatedMoves.length} moves.`);
            setProposedMoves(aggregatedMoves);
            setOptimizerStep('PROPOSAL');

        } catch (e) {
            console.error("Week Optimizer Error:", e);
            addToast('Error en optimización semanal', 'error');
        } finally {
            setIsOptimizing(false);
        }
    };

    // --- BUSINESS LOGIC ---
    // --- BUSINESS LOGIC DEPRECATED (Replaced by getDayConfig) ---
    // const isDayClosed = useMemo(...) -> No longer used for Drag. 
    // Kept only if needed for UI Alerts (which we might want to refactor later)
    const isDayClosed = false; // Disable global block to allow per-day logic

    const handleUpdateAppointment = async (apptId, newTechId, newDate) => {
        if (isDayClosed) {
            alert("⛔ El negocio está CERRADO este día. No se pueden agendar citas.");
            return;
        }

        // 1. Snapshot for Rollback
        const previousAppointments = [...appointments];
        const iso = newDate.toISOString();

        // 2. Optimistic Update (Immediate Feedback)
        setAppointments(prev => prev.map(a =>
            a.id === apptId ? { ...a, technician_id: newTechId, scheduled_at: iso, start: newDate } : a
        ));

        try {
            const { error } = await supabase
                .from('tickets')
                .update({
                    scheduled_at: iso,
                    technician_id: newTechId
                })
                .eq('id', apptId);

            if (error) throw error;
            // Success: Silent

        } catch (error) {
            console.error("Error moving appointment:", error);
            // 3. Rollback on Critical Fail
            setAppointments(previousAppointments);
            alert("⚠️ No se pudo mover la cita. Se ha revertido el cambio.");
        }
    };

    // 🕒 HANDLE DURATION CHANGE (Resize)
    const handleUpdateDuration = async (apptId, newDuration) => {
        // 1. Snapshot
        const previousAppointments = [...appointments];

        // 2. Optimistic Update
        setAppointments(prev => prev.map(a =>
            a.id === apptId ? { ...a, duration: newDuration } : a
        ));

        try {
            const { error } = await supabase
                .from('tickets')
                .update({ estimated_duration: newDuration })
                .eq('id', apptId);

            if (error) throw error;

            addToast(`⏱️ Duración actualizada a ${newDuration} minutos`, 'success');

        } catch (err) {
            console.error(err);
            setAppointments(previousAppointments);
            addToast('Error al actualizar duración', 'error');
        }
    };

    const toggleTech = (id) => {
        if (selectedTechs.includes(id)) setSelectedTechs(selectedTechs.filter(t => t !== id));
        else setSelectedTechs([...selectedTechs, id]);
    };

    const toggleAllTechs = () => {
        if (selectedTechs.length === techs.length) setSelectedTechs([]);
        else setSelectedTechs(techs.map(t => t.id));
    };

    // --- GRID LAYOUT LOGIC (BY DAY) ---
    const getPositionedEvents = (dayDate) => {
        // Filter: Must be on 'dayDate' AND assigned to 'selectedTechs'
        // FIX: Use toDateString() for LOCAL DAY comparison to avoid UTC shifts
        const dayLocalStr = dayDate.toDateString();

        const events = appointments
            .filter(a => {
                const aDateStr = a.start.toDateString();
                return aDateStr === dayLocalStr && selectedTechs.includes(a.technician_id);
            })
            .map(a => {
                const startH = a.start.getHours();
                const startM = a.start.getMinutes();
                const startMs = startH * 60 + startM;
                const duration = a.duration;
                return { ...a, startMs, endMs: startMs + duration };
            });

        // Grouping/Column logic within the day...
        const expandedEvents = events.map(e => ({ ...e, col: 0, totalCols: 1 }));
        for (let i = 0; i < expandedEvents.length; i++) {
            let current = expandedEvents[i];
            const overlapping = expandedEvents.filter((other, idx) =>
                idx !== i &&
                ((current.startMs >= other.startMs && current.startMs < other.endMs) ||
                    (current.endMs > other.startMs && current.endMs <= other.endMs) ||
                    (current.startMs <= other.startMs && current.endMs >= other.endMs))
            );

            if (overlapping.length > 0) {
                current.totalCols = overlapping.length + 1;
                const group = [current, ...overlapping].sort((a, b) => a.startMs - b.startMs || a.id.localeCompare(b.id));
                current.col = group.indexOf(current);
            }
        }
        return expandedEvents;
    };


    // --- DND HANDLERS ---
    const [dragState, setDragState] = useState({ id: null, offset: 0 });
    const [ghostState, setGhostState] = useState(null);

    // 🛡️ INTERACTION SEMAPHORE (Prevents Ghost Clicks)
    const isInteractionBusy = useRef(false);

    // 📏 RESIZE STATE
    const [resizingState, setResizingState] = useState(null); // { id, startY, startHeight, appt }

    // GLOBAL MOUSE LISTENERS (For Resize)
    useEffect(() => {
        const handleGlobalMove = (e) => {
            if (!resizingState) return;
            e.preventDefault(); // Prevent text selection
            isInteractionBusy.current = true; // Ensure busy during move

            const deltaY = e.clientY - resizingState.startY;
            // Calculate new height based on delta
            // Snap to 15 mins (which is 15/60 * pixelsPerHour)
            const snapPixels = pixelsPerHour * (15 / 60);

            const rawHeight = resizingState.startHeight + deltaY;
            const snappedHeight = Math.max(snapPixels, Math.round(rawHeight / snapPixels) * snapPixels);

            // Calculate Duration in Minutes
            const newDuration = Math.round((snappedHeight / pixelsPerHour) * 60);

            // Update Ghost State
            const ghostTime = new Date(resizingState.appt.start);
            const ghostEnd = new Date(ghostTime.getTime() + newDuration * 60000);
            const timeStr = `${ghostTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${ghostEnd.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

            setGhostState({
                top: ((resizingState.appt.start.getHours() - startHour) + resizingState.appt.start.getMinutes() / 60) * pixelsPerHour,
                height: snappedHeight,
                targetDate: resizingState.appt.start.toISOString().split('T')[0] + 'T00:00:00.000Z', // Fake date string match for renderer
                timeStr: timeStr,
                isResizing: true // Flag to render differently if needed
            });
        };

        const handleGlobalUp = (e) => {
            if (!resizingState) return;

            // Get final duration from Ghost
            const finalDuration = Math.round((parseFloat(ghostState?.height || resizingState.startHeight) / pixelsPerHour) * 60);

            setResizingState(null);
            setGhostState(null);

            // 🛡️ COOLDOWN: Release lock after 200ms
            setTimeout(() => { isInteractionBusy.current = false; }, 200);

            if (finalDuration === resizingState.appt.duration) return; // No change

            // ⚠️ CONFIRMATION
            const newEnd = new Date(resizingState.appt.start.getTime() + finalDuration * 60000);
            const confirmMsg = `⏱️ CAMBIO DE DURACIÓN\n\n` +
                `¿Confirmas el nuevo horario para "${resizingState.appt.client?.full_name || 'Servicio'}"?\n` +
                `⏳ Ahora será: ${resizingState.appt.start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${newEnd.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} (${finalDuration} min)`;

            if (window.confirm(confirmMsg)) {
                handleUpdateDuration(resizingState.id, finalDuration);
            }
        };

        if (resizingState) {
            window.addEventListener('mousemove', handleGlobalMove);
            window.addEventListener('mouseup', handleGlobalUp);
        }

        return () => {
            window.removeEventListener('mousemove', handleGlobalMove);
            window.removeEventListener('mouseup', handleGlobalUp);
        };
    }, [resizingState, ghostState, pixelsPerHour]);

    const handleResizeStart = (e, appt) => {
        e.preventDefault();
        e.stopPropagation(); // Stop Drag Start
        isInteractionBusy.current = true; // 🔒 LOCK

        const rect = e.currentTarget.parentElement.getBoundingClientRect(); // Parent is the Card
        setResizingState({
            id: appt.id,
            startY: e.clientY,
            startHeight: rect.height,
            appt: appt
        });
    };

    const handleDragStart = (e, appt) => {
        if (isDayClosed) { e.preventDefault(); return; }
        // Calculate offset relative to the CARD, not the column
        const rect = e.currentTarget.getBoundingClientRect();
        const offset = e.clientY - rect.top;

        setDragState({ id: appt.id, offset, duration: appt.duration });
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", appt.id);

        // Transparent Ghost
        const emptyImg = new Image();
        emptyImg.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
        e.dataTransfer.setDragImage(emptyImg, 0, 0);
    };

    // --- AUTO SCROLL REF ---
    const scrollContainerRef = useRef(null);

    // --- HELPER: PER-DAY CONFIG ---
    const getDayConfig = (date) => {
        const defaultClose = 20;

        // Safety: If no config explicitly loaded, assume Open (Fallback)
        if (!businessConfig?.value && !businessConfig?.working_hours) return { isOpen: true, closeHour: defaultClose };

        const dayName = date.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
        // FIX: The row from DB has the JSON in the 'value' column. 
        // We also check 'working_hours' property just in case of migration, but 'value' is primary.
        const config = businessConfig?.value?.[dayName] || businessConfig?.working_hours?.[dayName];

        // LOGIC FIX: In BusinessSettings, null/undefined means CLOSED (unchecked).
        // Previous logic assumed missing = open (default), which caused Saturday (null) to be open.
        if (!config) return { isOpen: false, closeHour: defaultClose };

        // Extract Close Hour from "19:00" string in 'end' property
        let closeHour = defaultClose;
        if (config.end) {
            const h = parseInt(config.end.split(':')[0]);
            if (!isNaN(h)) closeHour = h;
        }

        return { isOpen: true, closeHour };
    };

    const handleDragOver = (e, targetDate) => {
        e.preventDefault();
        e.stopPropagation();

        // 1. 🔒 PER-DATE CONSTRAINT: Check if THAT day is closed
        const dayConfig = getDayConfig(targetDate);
        if (!dayConfig.isOpen) return;

        // Auto Scroll (Premium Tuned - Freno de Mano)
        const container = scrollContainerRef.current;
        if (container) {
            const { top, bottom } = container.getBoundingClientRect();
            const threshold = 30;
            const scrollSpeed = 10;

            if (e.clientY > bottom - threshold) {
                container.scrollTop += scrollSpeed;
            } else if (e.clientY < top + threshold) {
                container.scrollTop -= scrollSpeed;
            }
        }

        const rect = e.currentTarget.getBoundingClientRect();
        const y = e.clientY - rect.top;

        // "Buttery Smooth" Physics
        const snapMinutes = 15;
        const snapPixels = pixelsPerHour * (snapMinutes / 60);

        const rawTop = y - dragState.offset;
        const snappedTop = Math.round(rawTop / snapPixels) * snapPixels;

        const hoursToAdd = snappedTop / pixelsPerHour;

        // 2. 🔒 PER-DATE CONSTRAINT: Check Hours Limit
        // Use the specific closeHour for THIS day
        const dayLimitHour = dayConfig.closeHour;

        const totalMinutes = hoursToAdd * 60;
        const maxMinutes = (dayLimitHour - startHour) * 60;

        // 🔒 CLAMPING LOGIC (Visual Wall)
        // Instead of returning/hiding, we CLAMP the visual ghost to the bounds.
        // This creates the "hit the wall" effect requested.
        let clampedMinutes = totalMinutes;

        // Clamp Min (Start of Day)
        if (clampedMinutes < 0) clampedMinutes = 0;

        // Clamp Max (End of Day Limit - Duration)
        const maxAllowedStart = maxMinutes - dragState.duration;
        if (clampedMinutes > maxAllowedStart) clampedMinutes = maxAllowedStart;

        // Recalculate Snapped Visuals based on CLAMPED value
        const clampedHours = clampedMinutes / 60;
        const clampedTop = clampedHours * pixelsPerHour;

        // Calculate Ghost Time for UI
        const ghostTime = new Date(targetDate);
        ghostTime.setHours(startHour + Math.floor(clampedHours), (clampedHours % 1) * 60);

        // Calculate End Time for Range
        const ghostEndTime = new Date(ghostTime.getTime() + dragState.duration * 60000);
        const timeRangeStr = `${ghostTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${ghostEndTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

        setGhostState({
            top: clampedTop, // Use Clamped Top
            height: (dragState.duration / 60) * pixelsPerHour,
            targetDate: targetDate.toISOString(),
            timeStr: timeRangeStr
        });
    };

    const handleDrop = (e, targetDate) => {
        e.preventDefault();
        e.stopPropagation();
        setGhostState(null);

        // 🔒 PER-DATE CHECK (Strict)
        const dayConfig = getDayConfig(targetDate);
        if (!dayConfig.isOpen) {
            addToast('El negocio está cerrado este día.', 'error', 3000);
            return;
        }

        const apptId = e.dataTransfer.getData("text/plain");
        const appt = appointments.find(a => a.id === apptId);
        if (!appt) return;

        // 🔒 PER-DATE DROP LIMIT CHECK (With Notification)
        const rect = e.currentTarget.getBoundingClientRect();
        const y = e.clientY - rect.top;
        const snapMinutes = 15;
        const snapPixels = pixelsPerHour * (snapMinutes / 60);
        // Correct position
        const rawTop = y - dragState.offset;
        const snappedTop = Math.round(rawTop / snapPixels) * snapPixels;
        const hoursToAdd = snappedTop / pixelsPerHour;

        const totalMinutes = hoursToAdd * 60;
        const maxMinutes = (dayConfig.closeHour - startHour) * 60;

        // Check if attempted drop is Out of Bounds
        if (totalMinutes < 0 || (totalMinutes + (appt.duration || 60)) > maxMinutes) {
            // 🕒 FEEDBACK: Toast Notification
            addToast(
                `Fuera de Horario Laboral. Hoy cerramos a las ${dayConfig.closeHour}:00.`,
                'error',
                4000
            );
            return; // Reject Drop
        }

        // 🛡️ FIX: Construct Date explicitly using Local Year/Month/Day from targetDate
        // This prevents day jumping or UTC shifts.
        const newDate = new Date(
            targetDate.getFullYear(),
            targetDate.getMonth(),
            targetDate.getDate(),
            startHour + Math.floor(hoursToAdd),
            (hoursToAdd % 1) * 60
        );

        // Calculate End Date for Confirmation
        const newEndDate = new Date(newDate.getTime() + (appt.duration || 60) * 60000);

        // 🛡️ DROP GUARD: Security Confirmation
        const timeStr = `${newDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${newEndDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
        const dateStr = newDate.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' });

        const isConfirmed = window.confirm(
            `⚠️ CONFIRMACIÓN DE CAMBIO\n\n` +
            `¿Mover ticket a ${dateStr}?\n` +
            `Horario: ${timeStr}`
        );

        if (!isConfirmed) {
            addToast('Cambio cancelado por el usuario.', 'info', 2000);
            return; // ⛔ Revert (Do nothing, React state remains unchanged)
        }

        handleUpdateAppointment(apptId, appt.technician_id, newDate);
    };

    // --- UTILS ---
    const visibleTechs = useMemo(() => techs.filter(t => selectedTechs.includes(t.id)), [techs, selectedTechs]);
    const hours = Array.from({ length: hoursCount }, (_, i) => i + startHour);

    // Optimized Suggestions
    const optimizedSuggestions = useMemo(() => {
        if (!showRoutePanel) return [];
        const all = [...appointments].filter(a => selectedTechs.includes(a.technician_id));
        return [...all].sort((a, b) => (a.client?.postal_code || '').localeCompare(b.client?.postal_code || ''));
    }, [showRoutePanel, appointments, selectedTechs]);


    return (
        <div className="h-[calc(100vh-80px)] flex flex-col bg-slate-50 relative overflow-hidden font-sans">
            {/* --- HEADER --- */}
            <div className="bg-white border-b border-slate-200 px-4 py-2 z-30 shadow-sm shrink-0 flex flex-col gap-2">
                <div className="flex flex-col md:flex-row justify-between items-center gap-2 relative">
                    {/* Left: Title & Buttons */}
                    <div className="flex items-center gap-4 text-slate-800 w-1/3">
                        <div className="flex items-center gap-2">
                            <Calendar className="text-indigo-600" size={24} />
                            <div>
                                <h1 className="font-bold text-lg leading-tight">Agenda Semanal</h1>
                                <p className="text-[10px] text-slate-400 font-bold tracking-wider uppercase">Vista Global</p>
                            </div>
                        </div>
                        <button onClick={() => setSelectedDate(new Date())} className="text-xs font-bold px-2 py-1 bg-indigo-50 text-indigo-700 rounded hover:bg-indigo-100 transition">
                            Hoy
                        </button>
                    </div>

                    {/* CENTER: Date Navigation */}
                    <div className="flex items-center gap-2">
                        <button onClick={() => { const d = new Date(selectedDate); d.setDate(d.getDate() - 7); setSelectedDate(d); }} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 text-slate-600 transition">
                            <ChevronLeft size={20} />
                        </button>
                        <div className="text-center w-40">
                            <div className="text-sm font-bold text-slate-800 capitalize">
                                {gridStart.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })}
                            </div>
                            <div className="text-[10px] text-slate-400 font-mono tracking-wide">
                                Semana {Math.ceil((((new Date(selectedDate) - new Date(new Date(selectedDate).getFullYear(), 0, 1)) / 86400000) + 1) / 7)}
                            </div>
                        </div>
                        <button onClick={() => { const d = new Date(selectedDate); d.setDate(d.getDate() + 7); setSelectedDate(d); }} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 text-slate-600 transition">
                            <ChevronRight size={20} />
                        </button>

                        {/* 🔘 SEGMENTED CONTROL ZOOM */}
                        <div className="flex items-center p-1 bg-slate-100 rounded-lg border border-slate-200 ml-2">
                            {[
                                { label: 'Semanal', val: 100, icon: <LayoutList size={12} /> },
                                { label: 'Quincenal', val: 50, icon: <LayoutList size={12} className="rotate-90" /> },
                                { label: 'Mensual', val: 0, icon: <Calendar size={12} /> }
                            ].map(opt => {
                                const isActive = (viewMode === 'week' && opt.val === 100) ||
                                    (viewMode === 'fortnight' && opt.val === 50) ||
                                    (viewMode === 'month' && opt.val === 0);
                                return (
                                    <button
                                        key={opt.label}
                                        onClick={() => setZoomLevel(opt.val)}
                                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wide transition-all ${isActive
                                            ? 'bg-white text-indigo-600 shadow-sm ring-1 ring-black/5'
                                            : 'text-slate-400 hover:text-slate-600 hover:bg-slate-200/50'
                                            }`}
                                    >
                                        {opt.icon}
                                        {opt.label}
                                    </button>
                                )
                            })}
                        </div>
                    </div>

                    <div className="flex gap-2">
                        {/* ⚡ AI OPTIMIZER BUTTON */}
                        <button
                            onClick={() => setShowOptimizer(!showOptimizer)}
                            className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider transition-all border
                            ${showOptimizer ? 'bg-amber-100 text-amber-700 border-amber-300 shadow-inner' : 'bg-gradient-to-r from-amber-500 to-orange-500 text-white border-transparent shadow-md hover:shadow-lg hover:scale-105 active:scale-95'}`}
                        >
                            <Zap size={14} className={showOptimizer ? 'animate-pulse' : 'fill-white'} />
                            <span>Optimizar Ruta IA</span>
                        </button>
                        {/* 🕰️ Header ClocK (Replaces Legend) */}
                        <div className="flex items-center justify-center mr-6 select-none bg-white/40 px-4 py-1 rounded-xl border border-white/50 shadow-sm backdrop-blur-sm">
                            <span className="text-3xl font-black text-slate-800 tracking-tighter tabular-nums leading-none">
                                {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Tech Filter */}
                <div className="flex flex-wrap gap-2 items-center">
                    <button onClick={toggleAllTechs} className={`text-[10px] font-bold px-2 py-1 rounded border flex items-center gap-1 transition-all ${selectedTechs.length === techs.length ? 'bg-indigo-600 text-white border-indigo-600 shadow-md' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'}`}>
                        {selectedTechs.length === techs.length ? <CheckSquare size={12} /> : <Square size={12} />} EQUIPO FILTRO
                    </button>
                    <div className="w-px h-4 bg-slate-200 mx-1"></div>
                    {techs.map(t => (
                        <button key={t.id} onClick={() => toggleTech(t.id)} className={`text-[10px] font-bold px-3 py-1 rounded-full border transition-all ${selectedTechs.includes(t.id) ? 'bg-indigo-50 text-indigo-700 border-indigo-200 shadow-sm scale-105' : 'bg-white text-slate-400 border-slate-100 grayscale opacity-70'}`}>
                            {t.full_name.split(' ')[0]}
                        </button>
                    ))}
                </div>
            </div>

            {/* --- BODY (WEEK GRID) --- */}
            <div ref={scrollContainerRef} className="flex-1 overflow-auto bg-slate-50 relative flex custom-scrollbar">
                {isDayClosed && (
                    <div className="absolute inset-0 z-50 bg-slate-100/80 backdrop-blur-sm flex items-center justify-center">
                        <div className="bg-white p-6 rounded-2xl shadow-2xl border border-red-100 text-center max-w-md transform rotate-2">
                            <div className="bg-red-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                                <Clock size={32} className="text-red-500" />
                            </div>
                            <h2 className="text-2xl font-black text-slate-800 mb-2">NEGOCIO CERRADO</h2>
                        </div>
                    </div>
                )}

                {/* --- AI OPTIMIZER DRAWER (SIDEBAR PRO) --- */}
                {showOptimizer && (
                    <div className="fixed top-0 right-0 h-screen w-96 bg-white z-[9999] shadow-2xl border-l border-slate-200 flex flex-col font-sans animate-slide-in-right">
                        {/* HEADER */}
                        <div className="bg-gradient-to-r from-slate-900 to-slate-800 p-6 text-white shrink-0 flex justify-between items-start relative overflow-hidden">
                            <div className="relative z-10">
                                <div className="flex items-center gap-2 mb-1 opacity-80">
                                    <Zap className="text-amber-400" size={16} />
                                    <span className="text-xs font-bold tracking-widest">P.R.O.C. SYSTEM v1.0</span>
                                </div>
                                <h2 className="text-2xl font-black tracking-tight">Optimizar Rutas</h2>
                                <p className="text-slate-400 text-xs mt-1">Algoritmo de agrupación por Código Postal Jerárquico.</p>
                            </div>
                            {/* CLOSE BUTTON FIXED */}
                            <button
                                onClick={() => setShowOptimizer(false)}
                                className="relative z-50 bg-white/10 hover:bg-white/20 p-2 rounded-lg transition-colors cursor-pointer"
                            >
                                <X size={20} />
                            </button>
                            {/* Decor */}
                            <Zap size={120} className="absolute -bottom-8 -right-8 text-white/5 rotate-12" />
                        </div>

                        {/* BODY */}
                        <div className="flex-1 overflow-y-auto bg-slate-50 p-6 relative">

                            {/* VIEW A: ANALYSIS DASHBOARD */}
                            {optimizerStep === 'ANALYSIS' && (
                                <div className="space-y-6 animate-fade-in">
                                    {/* 0. MODE TOGGLE */}
                                    <div className="flex bg-slate-100 p-1 rounded-xl mb-6 border border-slate-200">
                                        <button
                                            onClick={() => setOptimizerMode('DAY')}
                                            className={`flex-1 py-1.5 text-[10px] font-bold rounded-lg transition-all ${optimizerMode === 'DAY' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                                        >
                                            MODO DÍA
                                        </button>
                                        <button
                                            onClick={() => setOptimizerMode('WEEK')}
                                            className={`flex-1 py-1.5 text-[10px] font-bold rounded-lg transition-all ${optimizerMode === 'WEEK' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                                        >
                                            MODO SEM (P.R.O.C)
                                        </button>
                                    </div>

                                    {/* 1. SELECTION (Conditional) */}
                                    <section className="mb-4">
                                        <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1">
                                            <Calendar size={12} /> {optimizerMode === 'DAY' ? '1. SELECCIONA DÍA' : '1. RANGO DE FECHAS'}
                                        </h3>

                                        {optimizerMode === 'WEEK' ? (
                                            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-3">
                                                <div className="flex flex-col gap-1">
                                                    <label className="text-[10px] font-bold text-slate-400 uppercase">Inicio</label>
                                                    <input
                                                        type="date"
                                                        className="w-full text-xs font-bold p-2 rounded border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                                                        value={weekRange.start}
                                                        onChange={(e) => setWeekRange({ ...weekRange, start: e.target.value })}
                                                    />
                                                </div>
                                                <div className="flex flex-col gap-1">
                                                    <label className="text-[10px] font-bold text-slate-400 uppercase">Fin</label>
                                                    <input
                                                        type="date"
                                                        className="w-full text-xs font-bold p-2 rounded border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                                                        value={weekRange.end}
                                                        onChange={(e) => setWeekRange({ ...weekRange, end: e.target.value })}
                                                    />
                                                </div>
                                            </div>
                                        ) : (
                                            /* EXISTING DAY SELECTOR */
                                            <div className="grid grid-cols-4 gap-2">
                                                {gridDates.map(d => {
                                                    const isSelected = optimizingDay && optimizingDay.toDateString() === d.toDateString();
                                                    return (
                                                        <button
                                                            key={d.toISOString()}
                                                            onClick={() => setOptimizingDay(d)}
                                                            disabled={isOptimizing}
                                                            className={`flex flex-col items-center justify-center p-3 rounded-xl border-2 transition-all duration-200 ${isSelected ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg transform -translate-y-1' : 'bg-white border-slate-200 text-slate-400 hover:border-indigo-300 hover:text-indigo-500'}`}
                                                        >
                                                            <span className="text-[10px] uppercase font-bold">{d.toLocaleDateString('es-ES', { weekday: 'short' })}</span>
                                                            <span className="text-lg font-black">{d.getDate()}</span>
                                                        </button>
                                                    )
                                                })}
                                            </div>
                                        )}
                                    </section>

                                    {/* 2. Strategy Selector */}
                                    <section className={`bg-white p-3 rounded-xl border border-slate-200 transition-opacity duration-300 ${!optimizingDay && optimizerMode === 'DAY' || (optimizerMode === 'WEEK' && (!weekRange.start || !weekRange.end)) ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
                                        <div className="flex items-center justify-between mb-2">
                                            <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                                                <Navigation size={12} /> 2. ESTRATEGIA
                                            </h3>
                                            <span className="text-[9px] bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded font-mono font-bold">CORE v1.0</span>
                                        </div>

                                        <div className="flex bg-slate-100 rounded-lg p-1 border border-slate-200">
                                            <button
                                                onClick={() => setOptimizationStrategy('CENTRIFUGA')}
                                                className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-1 rounded-md text-[9px] font-bold transition-all ${optimizationStrategy === 'CENTRIFUGA' ? 'bg-white text-indigo-600 shadow-sm ring-1 ring-black/5' : 'text-slate-400 hover:text-slate-600'}`}
                                            >
                                                <span>🌀</span> CENTRÍFUGA
                                            </button>
                                            <button
                                                onClick={() => setOptimizationStrategy('SANDWICH')}
                                                className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-1 rounded-md text-[9px] font-bold transition-all ${optimizationStrategy === 'SANDWICH' ? 'bg-white text-indigo-600 shadow-sm ring-1 ring-black/5' : 'text-slate-400 hover:text-slate-600'}`}
                                            >
                                                <span>🥪</span> SANDWICH
                                            </button>
                                            <button
                                                onClick={() => setOptimizationStrategy('BOOMERANG')}
                                                className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-1 rounded-md text-[9px] font-bold transition-all ${optimizationStrategy === 'BOOMERANG' ? 'bg-white text-indigo-600 shadow-sm ring-1 ring-black/5' : 'text-slate-400 hover:text-slate-600'}`}
                                            >
                                                <span>🪃</span> BOOMERANG
                                            </button>
                                        </div>
                                        <p className="text-[10px] text-slate-500 mt-2 px-1 text-center leading-tight">
                                            {optimizationStrategy === 'CENTRIFUGA' && "Prioridad: Eliminar rápido trabajos cercanos y expandir."}
                                            {optimizationStrategy === 'SANDWICH' && "Prioridad: Mix equilibrado. Empieza y acaba cerca."}
                                            {optimizationStrategy === 'BOOMERANG' && "Prioridad: Asegurar retorno. Empieza lejos, acaba en casa."}
                                        </p>
                                    </section>

                                    {/* 3. Action Button */}
                                    <section className={`transition-all duration-300 ${(optimizerMode === 'DAY' && !optimizingDay) || (optimizerMode === 'WEEK' && (!weekRange.start || !weekRange.end)) ? 'opacity-50 pointer-events-none grayscale' : 'opacity-100'}`}>
                                        <button
                                            onClick={() => optimizerMode === 'WEEK' ? runOptimizerWeek() : runOptimizerAnalysis(optimizingDay, optimizationStrategy)}
                                            disabled={optimizerMode === 'WEEK' ? (!weekRange.start || !weekRange.end || !optimizationStrategy) : (!optimizingDay || !optimizationStrategy)}
                                            className={`w-full py-4 font-black rounded-xl shadow-xl transition-all flex items-center justify-center gap-2 transform active:scale-95 mb-4 ${(optimizerMode === 'WEEK' ? (!weekRange.start || !weekRange.end || !optimizationStrategy) : (!optimizingDay || !optimizationStrategy)) ? 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none' : 'bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white shadow-indigo-200'}`}
                                        >
                                            {!optimizationStrategy ? (
                                                <span>2. SELECCIONA ESTRATEGIA ARRIBA 👆</span>
                                            ) : (
                                                <>
                                                    <Zap size={18} className="fill-white animate-pulse" />
                                                    <span>
                                                        {proposedMoves.length > 0 ? `RECALCULAR (${optimizationStrategy})` :
                                                            (optimizerMode === 'WEEK' ? 'ANALIZAR SEMANA' : `ANALIZAR RUTA (${optimizingDay ? optimizingDay.toLocaleDateString() : '...'})`)
                                                        }
                                                    </span>
                                                </>
                                            )}
                                        </button>

                                        {/* 4. Results Section (Conditional) */}
                                        {!isOptimizing && proposedMoves.length > 0 && (
                                            <div className="bg-white rounded-2xl p-5 shadow-sm border border-emerald-100 animate-fade-in-up">
                                                <div className="flex items-center justify-between mb-4">
                                                    <h4 className="font-bold text-emerald-800 flex items-center gap-2"><CheckSquare size={16} /> ANÁLISIS COMPLETADO</h4>
                                                    <button onClick={() => { setProposedMoves([]); setOptimizingDay(null); setOptimizationStrategy(null); }} className="text-[10px] text-slate-400 hover:text-red-500 font-bold border rounded px-1">RESET TOTAL</button>
                                                </div>

                                                <div className="flex gap-4 mb-6">
                                                    <div className="flex-1 bg-red-50 rounded-xl p-3 border border-red-100 text-center opacity-50 grayscale">
                                                        <div className="text-2xl mb-1">🔴</div>
                                                        <div className="text-[10px] uppercase font-bold text-red-800">Ruta Actual</div>
                                                    </div>
                                                    <div className="flex items-center text-slate-300"><ArrowRight /></div>
                                                    <div className="flex-1 bg-emerald-50 rounded-xl p-3 border border-emerald-100 text-center shadow-md transform scale-110">
                                                        <div className="text-2xl mb-1">🟢</div>
                                                        <div className="text-[10px] uppercase font-bold text-emerald-800">Propuesta IA</div>
                                                    </div>
                                                </div>

                                                <p className="text-sm text-slate-600 mb-4 text-center">Se han encontrado <strong className="text-emerald-600">{proposedMoves.length} mejoras</strong> con {optimizationStrategy}.</p>
                                                <button
                                                    onClick={() => setOptimizerStep('PROPOSAL')}
                                                    className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-lg shadow-emerald-200 transition-all flex items-center justify-center gap-2"
                                                >
                                                    <span>VER PROPUESTA</span> <ArrowRight size={16} />
                                                </button>
                                            </div>
                                        )}
                                    </section>
                                </div>
                            )}

                            {/* VIEW B: OPTIMIZATION TIMELINE PREVIEW (v3.0) */}
                            {optimizerStep === 'PROPOSAL' && (
                                <div className="animate-slide-in-right">
                                    <button onClick={() => setOptimizerStep('ANALYSIS')} className="mb-4 text-xs font-bold text-slate-500 hover:text-slate-800 flex items-center gap-1">
                                        <ChevronLeft size={14} /> CANCELAR
                                    </button>

                                    <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                                        <span className="bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full text-xs">{proposedMoves.length}</span>
                                        Cambios Propuestos
                                    </h3>

                                    <div className="space-y-3 pb-24">
                                        {proposedMoves.map((move, idx) => (
                                            <div key={idx} className={`bg-white p-3 rounded-xl border relative ${move.warning ? 'border-amber-200 bg-amber-50/50' : 'border-slate-200'}`}>

                                                {/* Warning Banner */}
                                                {move.warning && (
                                                    <div className="absolute top-0 right-0 bg-amber-100 text-amber-700 text-[9px] font-bold px-2 py-0.5 rounded-bl-lg">
                                                        {move.warning}
                                                    </div>
                                                )}

                                                <div className="flex items-center justify-between mb-2">
                                                    <div className="font-bold text-xs text-slate-700 truncate max-w-[70%]">
                                                        {move.appt.client?.full_name}
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        {move.appt.client?.phone && (
                                                            <a
                                                                href={`tel:${move.appt.client.phone}`}
                                                                onClick={(e) => e.stopPropagation()}
                                                                className="w-5 h-5 bg-green-100 text-green-600 rounded-full flex items-center justify-center hover:bg-green-500 hover:text-white transition-all shadow-sm"
                                                                title="Llamar Cliente"
                                                            >
                                                                <Phone size={10} />
                                                            </a>
                                                        )}
                                                        <div className="text-[10px] text-slate-400 font-mono">
                                                            CP: {move.appt.client?.postal_code}
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-3">
                                                    {/* Old Time */}
                                                    <div className="flex flex-col items-center">
                                                        <span className="text-[10px] text-slate-400 line-through">
                                                            {new Date(move.appt.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                        </span>
                                                    </div>

                                                    <ArrowRight size={12} className="text-indigo-400" />

                                                    {/* New Time */}
                                                    <div className="flex flex-col items-center">
                                                        <span className="text-sm font-bold text-indigo-700">
                                                            {move.newStart.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                        </span>
                                                    </div>
                                                </div>

                                                {/* Action: Exclude single logic if needed */}
                                                {/* <button onClick={() => discardOptimizationMove(move.appt.id)} className="absolute bottom-2 right-2 text-slate-300 hover:text-red-500"><X size={14}/></button> */}
                                            </div>
                                        ))}

                                        {/* BATCH ACTION BUTTON */}
                                        <div className="fixed bottom-4 right-4 left-[calc(100%-350px)] p-4 bg-gradient-to-t from-white via-white to-transparent pointer-events-none">
                                            <button
                                                onClick={applyOptimizationBatch}
                                                className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-xl shadow-indigo-200 hover:scale-105 active:scale-95 transition-all pointer-events-auto flex items-center justify-center gap-2"
                                            >
                                                <Zap size={18} className="fill-white" />
                                                APLICAR NUEVA RUTA
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}

                        </div>
                    </div>
                )}



                {/* Time Axis (Hidden in Month) */}
                {viewMode !== 'month' && (
                    <div className="w-12 shrink-0 bg-white border-r border-slate-200 sticky left-0 z-20 select-none shadow-[4px_0_10px_rgba(0,0,0,0.02)]">
                        <div className="h-8 border-b border-slate-200 bg-slate-50 sticky top-0 z-50"></div>
                        {dynamicHours.map(h => (
                            <div key={h} className="text-right pr-2 text-[10px] text-slate-400 font-bold relative -top-2 font-mono" style={{ height: pixelsPerHour }}>{h}:00</div>
                        ))}
                    </div>
                )}

                {/* Day Columns */}
                <div className={`flex-1 min-w-[800px] relative ${viewMode === 'month' ? 'grid grid-cols-7 border-t border-l border-slate-200' : 'flex'}`}>

                    {/* MONTH HEADER (Static Row) */}
                    {viewMode === 'month' && (
                        ['LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB', 'DOM'].map(d => (
                            <div key={d} className="text-center text-[10px] font-bold text-slate-400 py-1.5 border-b border-r border-slate-200 bg-slate-50 uppercase tracking-widest">{d}</div>
                        ))
                    )}

                    {/* BACKGROUND LINES (Only for Week/Fortnight) */}
                    {viewMode !== 'month' && (
                        <div className="absolute top-0 left-0 w-full mt-8 pointer-events-none z-0" style={{ height: gridHeight }}>
                            {dynamicHours.map(h => (<div key={h} className="border-b border-slate-200/50 w-full" style={{ height: pixelsPerHour }}></div>))}
                        </div>
                    )}

                    {gridDates.map(dayDate => {
                        const isToday = dayDate.toDateString() === new Date().toDateString();

                        return (
                            <div key={dayDate.toISOString()}
                                className={`${viewMode === 'month'
                                    ? `border-b border-r border-slate-200 min-h-[120px] relative flex flex-col ${isToday ? 'bg-indigo-50/30' : 'bg-white'}`
                                    : `flex-1 border-r border-slate-100 relative transition-colors duration-300 flex flex-col ${isToday ? 'bg-white' : 'bg-slate-50/30'}`}`}
                            >

                                {/* Header: Day Name */}
                                <div className={`${viewMode === 'month' ? 'p-2 flex justify-end items-start' : 'h-8 border-b border-slate-100 sticky top-0 z-40 flex items-center justify-center shadow-sm shrink-0 gap-1'} ${isToday ? 'bg-indigo-50 text-indigo-700' : 'bg-white text-slate-600'}`}>
                                    {/* Weekday Name (Week/Fortnight only) */}
                                    {viewMode !== 'month' && (
                                        <span className="font-bold text-[10px] uppercase">{dayDate.toLocaleDateString('es-ES', { weekday: 'short' })}</span>
                                    )}
                                    <span className={`font-black text-xs ${isToday ? 'bg-indigo-600 text-white px-1.5 py-0.5 rounded-full' : (viewMode === 'month' ? 'text-slate-400' : '')}`}>
                                        {dayDate.getDate()}
                                    </span>
                                </div>

                                {/* DROP ZONE CONTAINER */}
                                <div
                                    className="relative w-full shrink-0"
                                    style={viewMode === 'month' ? { height: '100%' } : { height: gridHeight, minHeight: gridHeight }}
                                    onDragOver={(e) => handleDragOver(e, dayDate)}
                                    onDrop={(e) => handleDrop(e, dayDate)}
                                >

                                    {/* 🚨 GHOST DE RESCATE: ELÁSTICO Y VISIBLE (Flexbox + Loose Matching) */}
                                    {ghostState?.targetDate?.split('T')[0] === dayDate.toISOString().split('T')[0] && (
                                        <div
                                            className="absolute left-1 right-1 flex items-center justify-center rounded-lg pointer-events-none"
                                            style={{
                                                top: `${ghostState.top}px`,
                                                height: `${ghostState.height}px`, // El tamaño lo dicta el Drag/Resize
                                                zIndex: 9999,

                                                // ESTILOS VISUALES (Rescue Palette)
                                                backgroundColor: 'rgba(37, 99, 235, 0.6)', // Azul intenso (blue-600)
                                                border: '2px dashed #1e40af',            // Borde visible
                                                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                                                boxSizing: 'border-box'
                                            }}
                                        >
                                            {/* Etiqueta flotante centrada */}
                                            <span className="text-white font-bold text-xs bg-blue-800/90 px-2 py-1 rounded shadow-sm whitespace-nowrap z-10">
                                                {ghostState.timeStr}
                                            </span>
                                        </div>
                                    )}

                                    {/* Events (Conditional Render) */}
                                    {viewMode === 'month' ? (
                                        <div className="flex flex-col gap-1 p-1 h-full overflow-hidden">
                                            {getPositionedEvents(dayDate).map(appt => {
                                                const dbAppliance = Array.isArray(appt.client_appliances) ? appt.client_appliances[0] : appt.client_appliances;
                                                const jsonAppliance = appt.appliance_info;
                                                const bestAppliance = jsonAppliance?.type ? jsonAppliance : (dbAppliance || {});
                                                const category = getApplianceCategory(bestAppliance.type || bestAppliance.name);
                                                const colorClass = APPLIANCE_COLORS[category] || APPLIANCE_COLORS.default;

                                                return (
                                                    <div key={appt.id} data-event-id={appt.id} onClick={(e) => {
                                                        e.stopPropagation();
                                                        if (isInteractionBusy.current) return; // 🛡️ GUARD 
                                                        setSelectedAppt(appt);
                                                    }}
                                                        className={`w-full px-1 py-0.5 rounded overflow-hidden mb-1 text-[10px] font-bold text-white truncate shadow-sm cursor-pointer hover:brightness-110 transition-all ${colorClass}`}
                                                    >
                                                        <span className="mr-1">{appt.start.getHours()}:{String(appt.start.getMinutes()).padStart(2, '0')}</span>
                                                        <span className="opacity-90">{appt.ticket_id ? `#${appt.ticket_id}` : (appt.appliance_info?.type || 'Servicio')}</span>
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    ) : (
                                        getPositionedEvents(dayDate).map(appt => {
                                            const startH = appt.start.getHours();
                                            const startM = appt.start.getMinutes();
                                            const top = ((startH - startHour) + startM / 60) * pixelsPerHour;
                                            const height = (appt.duration / 60) * pixelsPerHour;
                                            const width = 100 / appt.totalCols;
                                            const left = width * appt.col;

                                            // Robust Appliance Resolver
                                            const dbAppliance = Array.isArray(appt.client_appliances) ? appt.client_appliances[0] : appt.client_appliances;
                                            const jsonAppliance = appt.appliance_info; // This is what Service Monitor uses!
                                            const bestAppliance = jsonAppliance?.type ? jsonAppliance : (dbAppliance || {});

                                            // COLOR BY APPLIANCE TYPE
                                            // Use the Resolved Appliance Type for color, fallback to default
                                            const category = getApplianceCategory(bestAppliance.type || bestAppliance.name);
                                            const colorClass = APPLIANCE_COLORS[category] || APPLIANCE_COLORS.default;
                                            const techName = techs.find(t => t.id === appt.technician_id)?.full_name.split(' ')[0] || '???';

                                            // "The Trinity" Display Data
                                            const displayType = bestAppliance.type || bestAppliance.name || 'SIN EQUIPO ASIGNADO';
                                            const displayBrand = bestAppliance.brand;
                                            const displayConcept = appt.title || appt.description || 'Sin concepto';

                                            // Calculate End Time for Badge
                                            const endD = new Date(appt.start.getTime() + appt.duration * 60000);
                                            const endTimeStr = endD.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

                                            // Debug for User
                                            console.log('Agenda Item Full:', appt);

                                            return (
                                                <div
                                                    key={appt.id}
                                                    draggable
                                                    onDragStart={(e) => handleDragStart(e, appt)}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        if (isInteractionBusy.current) return; // 🛡️ GUARD
                                                        setSelectedAppt(appt);
                                                    }}
                                                    // FLAT PRO STYLING
                                                    data-event-id={appt.id}
                                                    className={`absolute rounded-md cursor-grab active:cursor-grabbing hover:brightness-110 transition-all shadow-sm overflow-hidden flex flex-col font-sans px-2 py-1
                                                         ${colorClass} ${selectedAppt?.id === appt.id ? 'ring-2 ring-indigo-600 z-40' : 'z-10'}`}
                                                    style={{ top: `${top}px`, height: `${height - 2}px`, left: `${left}%`, width: `${width}%` }}
                                                >
                                                    {/* --- HEADER: TIME & DURATION --- */}
                                                    <div className="flex justify-between items-start text-[10px] font-bold opacity-90 mb-1 leading-none border-b border-white/20 pb-1">
                                                        <span className="tracking-tight">{appt.start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - {endTimeStr}</span>
                                                        <span className='opacity-70 text-[9px]'>{appt.duration}m</span>
                                                    </div>

                                                    {/* --- BODY: CLIENT & INFO --- */}
                                                    <div className="flex-1 flex flex-col gap-0.5 overflow-hidden text-left relative z-10">
                                                        {/* Client Name (Priority) & Phone Shortcut */}
                                                        <div className="flex justify-between items-start gap-1">
                                                            <div className="font-extrabold text-[11px] leading-tight truncate drop-shadow-sm flex-1">
                                                                {appt.client?.full_name || 'Cliente Desconocido'}
                                                            </div>
                                                            {appt.client?.phone && (
                                                                <a
                                                                    href={`tel:${appt.client.phone}`}
                                                                    onClick={(e) => e.stopPropagation()}
                                                                    className="shrink-0 bg-green-500/90 text-white p-1 rounded-full hover:bg-green-600 hover:scale-110 transition-all shadow-sm flex items-center justify-center group/phone"
                                                                    title={`Llamar: ${appt.client.phone}`}
                                                                >
                                                                    <Phone size={10} className="group-hover/phone:animate-pulse" />
                                                                </a>
                                                            )}
                                                        </div>

                                                        {/* Address/Location (Context) */}
                                                        <div className="flex items-center gap-1 text-[9px] opacity-90 truncate font-medium">
                                                            <span className="truncate">{appt.client?.address || appt.client?.city || 'Sin dirección'}</span>
                                                        </div>

                                                        {/* Ticket/Concept Badge */}
                                                        <div className="mt-auto pt-1 flex items-center justify-between gap-1">
                                                            <div className="px-1.5 py-0.5 bg-white/20 rounded text-[9px] font-bold backdrop-blur-sm truncate max-w-[70%]">
                                                                {displayType}
                                                            </div>
                                                            {appt.ticket_id && (
                                                                <span className="text-[8px] font-mono opacity-80">#{appt.ticket_id}</span>
                                                            )}
                                                        </div>
                                                    </div>

                                                    {/* Watermark Logo (Background) */}
                                                    {appt.brand_logo && (
                                                        <img src={appt.brand_logo} className="absolute bottom-6 right-1 w-12 h-12 object-contain opacity-10 pointer-events-none mix-blend-multiply grayscale" />
                                                    )}

                                                    {/* --- FOOTER: TECH & CP --- */}
                                                    <div className="mt-1 shrink-0 flex items-center justify-between text-[9px] border-t border-white/10 pt-1">
                                                        <div className="flex items-center gap-1 font-bold opacity-90">
                                                            <span>🛠️ {techName}</span>
                                                        </div>
                                                        <div className="font-mono font-black opacity-75 text-[8px] bg-black/10 px-1 rounded">
                                                            {appt.client?.postal_code || '---'}
                                                        </div>
                                                    </div>

                                                    {/* 📏 RESIZE HANDLE */}
                                                    <div
                                                        className="absolute bottom-0 left-0 w-full h-1.5 cursor-ns-resize z-50 hover:bg-white/20 flex justify-center items-end"
                                                        onMouseDown={(e) => handleResizeStart(e, appt)}
                                                    >
                                                        <div className="w-6 h-0.5 bg-white/40 rounded-full mb-0.5"></div>
                                                    </div>
                                                </div>
                                            );
                                        })
                                    )} {/* End Ternary */}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Magic Route Panel */}
            <div className={`fixed inset-y-0 right-0 w-80 bg-white shadow-2xl z-[60] transform transition-transform duration-300 flex flex-col border-l border-slate-200 ${showRoutePanel ? 'translate-x-0' : 'translate-x-full'}`}>
                <div className="p-4 bg-slate-900 text-white flex justify-between items-center shrink-0">
                    <div className="flex items-center gap-2 font-bold text-amber-400">
                        <Zap className="fill-current" size={18} /> <span>Optimizador</span>
                    </div>
                    <button onClick={() => setShowRoutePanel(false)} className="text-slate-400 hover:text-white"><X size={20} /></button>
                </div>
                <div className="flex-1 overflow-auto p-2">
                    {optimizedSuggestions.length === 0 ? (<div className="p-4 text-center text-slate-400 text-xs italic">Vacío</div>) : (
                        <div className="space-y-4">
                            {Object.entries(optimizedSuggestions.reduce((acc, curr) => {
                                const cp = curr.client?.postal_code || 'SIN CP';
                                if (!acc[cp]) acc[cp] = [];
                                acc[cp].push(curr);
                                return acc;
                            }, {})).map(([cp, list]) => (
                                <div key={cp} className="bg-slate-50 rounded border border-slate-100 overflow-hidden">
                                    <div className="bg-slate-200/50 px-3 py-1 text-xs font-bold text-slate-600 flex justify-between"><span>CP {cp}</span><span>{list.length}</span></div>
                                    <div className="divide-y divide-slate-100">
                                        {list.map(item => (
                                            <div key={item.id} className="p-2 flex justify-between items-center group cursor-grab" draggable onDragStart={(e) => handleDragStart(e, item)}>
                                                <div className="text-xs">{item.client?.full_name}</div>
                                                <ArrowRight size={14} className="text-slate-300" />
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* POPOVER Details */}
            {
                selectedAppt && (
                    <div className="fixed inset-0 bg-black/40 z-[70] flex items-center justify-center p-4 backdrop-blur-[1px]" onClick={() => setSelectedAppt(null)}>
                        <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200 border border-slate-200 ring-4 ring-black/5" onClick={e => e.stopPropagation()}>
                            <div className="p-4 border-b flex justify-between items-start bg-slate-50">
                                <div><div className="text-[10px] font-bold uppercase tracking-wider text-indigo-500 mb-1">Detalle</div><h3 className="font-bold text-slate-800 text-lg">{selectedAppt.client?.full_name}</h3></div>
                                <button onClick={() => setSelectedAppt(null)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
                            </div>
                            <div className="p-5 space-y-5">
                                {selectedAppt.appliance && (
                                    <div className="flex gap-3 bg-indigo-50/50 p-3 rounded-lg border border-indigo-100/50 items-center">
                                        <div className="bg-white p-2 rounded shadow-sm text-indigo-600"><CheckSquare size={18} /></div>
                                        <div><div className="text-[10px] font-bold text-slate-500 uppercase">Equipo</div><div className="font-bold text-slate-800 text-sm">{selectedAppt.appliance.type} {selectedAppt.appliance.brand}</div></div>
                                    </div>
                                )}
                                <div className="space-y-3">
                                    <div className="flex items-start gap-3 text-sm text-slate-600"><MapPin size={18} className="text-red-400 mt-0.5" /> <div><div className="font-medium text-slate-700">{selectedAppt.client?.address}</div><div className="text-xs text-slate-400">CP {selectedAppt.client?.postal_code || 'N/A'}</div></div></div>
                                    <div className="flex items-center gap-3 text-sm text-slate-600"><Phone size={18} className="text-emerald-400" /><a href={`tel:${selectedAppt.client?.phone}`} className="font-mono font-bold text-slate-700 underline decoration-slate-300">{selectedAppt.client?.phone}</a></div>
                                </div>
                                <div className="pt-2">
                                    <button
                                        onClick={() => {
                                            setDetailTicket(selectedAppt);
                                            setSelectedAppt(null); // Close popover
                                        }}
                                        className="w-full bg-slate-900 text-white py-3 rounded-lg font-bold text-sm shadow hover:bg-black transition flex items-center justify-center gap-2"
                                    >
                                        <LayoutList size={16} /> Ver Ficha Completa
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* FULL DETAIL MODAL (Replica of ServiceTable) */}
            {
                detailTicket && (
                    <ServiceDetailsModal
                        ticket={detailTicket}
                        onClose={() => setDetailTicket(null)}
                    />
                )
            }

            {/* Map Modal */}
            {
                showMapModal && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-10 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
                        <div className="bg-white w-full h-full md:max-w-6xl rounded-2xl shadow-2xl flex flex-col overflow-hidden relative">
                            <div className="px-5 py-4 border-b flex justify-between items-center bg-white z-10 shrink-0">
                                <h2 className="font-bold text-lg flex items-center gap-3"><MapIcon className="text-emerald-500" /> Rutas</h2>
                                <button onClick={() => setShowMapModal(false)} className="bg-slate-100 hover:bg-slate-200 p-2 rounded-full"><X size={20} /></button>
                            </div>
                            <div className="flex-1 bg-slate-100 relative">
                                <MapContainer center={[36.7213, -4.4214]} zoom={11} style={{ height: '100%', width: '100%' }} attributionControl={false}>
                                    <TileLayer url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png" />
                                    {/* Map items ... */}
                                </MapContainer>
                            </div>
                        </div>
                    </div>
                )
            }
        </div >
    );
};

export default GlobalAgenda;
