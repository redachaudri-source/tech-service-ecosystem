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

    // 🔍 ZOOM STATE (Pixel Density)
    // 0-33: Month | 34-66: Fortnight | 67-100: Week
    const [zoomLevel, setZoomLevel] = useState(100);

    // Derived States
    const viewMode = useMemo(() => {
        if (zoomLevel <= 33) return 'month';
        if (zoomLevel <= 66) return 'fortnight';
        return 'week';
    }, [zoomLevel]);

    const pixelsPerHour = useMemo(() => {
        // Only affect pixel density in Week/Fortnight mode
        // Map 67-100 to 60px-120px
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
    const [proposedMoves, setProposedMoves] = useState([]); // { appt, newStart }
    const [calledIds, setCalledIds] = useState([]); // To track calls made

    // --- AI LOGIC (v2.1 - KM0 + SWAP) ---
    const runOptimizerAnalysis = async (day) => {
        setOptimizingDay(day);
        setIsOptimizing(true);
        setOptimizerStep('ANALYSIS');
        setProposedMoves([]);

        // 🤖 AI/Algorithm Simulation
        await new Promise(r => setTimeout(r, 800));

        const dayStartStr = day.toISOString().split('T')[0];
        // 1. Get Events for the day & Tech
        const dayEvents = appointments.filter(a => a.start.toISOString().split('T')[0] === dayStartStr && selectedTechs.includes(a.technician_id));

        if (dayEvents.length < 2) {
            addToast('Mínimo 2 tickets para optimizar (Swap).', 'info');
            setIsOptimizing(false);
            return;
        }

        // 2. Identify "Km0" (Tech Home or Office)
        // Assuming selectedTechs[0] is the target. 
        const tech = techs.find(t => t.id === selectedTechs[0]);
        // Fallback to first event CP if no tech CP (should be fixed by previous step)
        const startCP = parseInt(tech?.postal_code?.replace(/\D/g, '') || dayEvents[0]?.client?.postal_code?.replace(/\D/g, '') || '29000');

        console.log('🏁 Algoritmo Km0 Iniciado. Origen:', startCP);

        // 3. Current State (Time Order)
        const currentOrder = [...dayEvents].sort((a, b) => a.start - b.start);

        // 4. Ideal State (Nearest Neighbor Heuristic)
        let ptrCP = startCP;
        const pool = [...dayEvents];
        const idealOrder = [];

        while (pool.length > 0) {
            // Find closest to ptrCP
            pool.sort((a, b) => {
                const cpA = parseInt(a.client?.postal_code?.replace(/\D/g, '') || '99999');
                const cpB = parseInt(b.client?.postal_code?.replace(/\D/g, '') || '99999');
                return Math.abs(cpA - ptrCP) - Math.abs(cpB - ptrCP);
            });

            const next = pool.shift();
            idealOrder.push(next);
            // Update pointer to this event's CP (Chain reaction)
            ptrCP = parseInt(next.client?.postal_code?.replace(/\D/g, '') || '29000');
        }

        // 5. Detect Deviations & Generate SWAPS
        const moves = [];
        // We iterate and match pairs. 
        // If currentOrder[i] is NOT idealOrder[i], it means idealOrder[i] is "misplaced" somewhere later.
        // We propose swapping currentOrder[i] (The intruder) with idealOrder[i] (The rightful owner of this slot).

        for (let i = 0; i < currentOrder.length; i++) {
            const actual = currentOrder[i];
            const ideal = idealOrder[i];

            if (actual.id !== ideal.id) {
                // Check if we already have a pending swap for these two (atomic pair)
                const alreadyPlanned = moves.find(m =>
                    (m.apptA.id === actual.id && m.apptB.id === ideal.id) ||
                    (m.apptA.id === ideal.id && m.apptB.id === actual.id)
                );

                if (!alreadyPlanned) {
                    // Calculate Saving (Mock or Real Diff)
                    const timeDiff = Math.abs((actual.start - ideal.start) / 60000); // Minutes apart
                    // HEURISTIC: Swap is valuable if they are far apart in time (meaning high displacement)
                    if (timeDiff > 30) {
                        moves.push({
                            type: 'SWAP',
                            apptA: actual, // "The Far Client" (currently at early slot)
                            apptB: ideal,  // "The Near Client" (currently at late slot)
                            slotTime: actual.start, // The slot we are optimizing
                            saving: Math.round(timeDiff * 0.3) // Synthetic saving calc
                        });
                    }
                }
            }
        }

        setProposedMoves(moves);
        setIsOptimizing(false);
    };

    // ⚡ TELEPORT SWAP (Atomic + Animation)
    const handleTeleportSwap = async (move) => {
        const { apptA, apptB } = move;

        // 1. 🎞️ Capture DOM Elements & Apply Blur
        const domA = document.querySelector(`[data-event-id="${apptA.id}"]`);
        const domB = document.querySelector(`[data-event-id="${apptB.id}"]`);

        if (domA) domA.classList.add('teleport-blur');
        if (domB) domB.classList.add('teleport-blur');

        // 2. ⏳ Sleep (Cinematic Feel)
        await new Promise(r => setTimeout(r, 450));

        // 3. 🔄 ATOMIC DATA SWAP
        // Swap Time Slots
        const timeA_start = new Date(apptA.start);
        const timeA_end = new Date(timeA_start.getTime() + apptA.duration * 60000);

        const timeB_start = new Date(apptB.start);
        const timeB_end = new Date(timeB_start.getTime() + apptB.duration * 60000); // Use own duration

        // We want A to take B's place, and B to take A's place.
        // WAIT: The algorithm identifies 'apptA' is at 'slotTime' (Pos 1), and 'apptB' is at Pos X.
        // We want 'apptB' (The Ideal one) to come to 'slotTime' (Pos 1).
        // So: B -> A.start, A -> B.start.

        const newStartA = timeB_start; // A goes to B's slot
        const newStartB = timeA_start; // B comes to A's slot (Optimization)

        // Optimistic State Update
        setAppointments(prev => prev.map(p => {
            if (p.id === apptA.id) return { ...p, start: newStartA, scheduled_at: newStartA.toISOString() };
            if (p.id === apptB.id) return { ...p, start: newStartB, scheduled_at: newStartB.toISOString() };
            return p;
        }));

        // Remove Move from List
        setProposedMoves(prev => prev.filter(m => m.apptA.id !== apptA.id));

        // 4. 🚀 DATABASE UPDATE (Parallel)
        try {
            await Promise.all([
                supabase.from('tickets').update({ scheduled_at: newStartA.toISOString() }).eq('id', apptA.id),
                supabase.from('tickets').update({ scheduled_at: newStartB.toISOString() }).eq('id', apptB.id)
            ]);
            addToast('⚡ Intercambio completado', 'success', 2000);
        } catch (err) {
            console.error(err);
            addToast('Error guardando intercambio', 'error');
            // Revert would go here
        }

        // 5. 🧹 Cleanup Styles (React render will clear, but manual cleanup ensures no flicker)
        if (domA) domA.classList.remove('teleport-blur');
        if (domB) domB.classList.remove('teleport-blur');
    };

    const discardOptimizationMove = (idA) => {
        setProposedMoves(prev => prev.filter(m => m.apptA.id !== idA));
    };

    // --- AI LOGIC ---




    // Date Calculations
    const gridStart = useMemo(() => {
        if (viewMode === 'month') return getStartOfMonthGrid(selectedDate);
        return getStartOfWeek(selectedDate);
    }, [selectedDate, viewMode]);

    const gridDates = useMemo(() => {
        const days = viewMode === 'week' ? 7 : (viewMode === 'fortnight' ? 14 : 42); // 6 weeks for month
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
            const startStr = gridStart.toISOString().split('T')[0];
            const endDate = new Date(gridStart);
            endDate.setDate(endDate.getDate() + gridDates.length);
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
        const dayStartStr = dayDate.toISOString().split('T')[0];

        const events = appointments
            .filter(a => {
                const aDate = a.start.toISOString().split('T')[0];
                return aDate === dayStartStr && selectedTechs.includes(a.technician_id);
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

        const newDate = new Date(targetDate);
        newDate.setHours(startHour + Math.floor(hoursToAdd), (hoursToAdd % 1) * 60);

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
                                    <span className="text-xs font-bold tracking-widest">MRCP SYSTEM v2.0</span>
                                </div>
                                <h2 className="text-2xl font-black tracking-tight">Optimizar Rutas</h2>
                                <p className="text-slate-400 text-xs mt-1">Algoritmo de agrupación por Código Postal.</p>
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
                                    {/* 1. Selector */}
                                    <section>
                                        <h3 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2"><Calendar size={14} /> SELECCIONAR DÍA</h3>
                                        <div className="grid grid-cols-4 gap-2">
                                            {gridDates.slice(0, 7).map(d => {
                                                const isSelected = optimizingDay?.toDateString() === d.toDateString();
                                                return (
                                                    <button
                                                        key={d.toISOString()}
                                                        onClick={() => runOptimizerAnalysis(d)}
                                                        disabled={isOptimizing}
                                                        className={`flex flex-col items-center justify-center p-3 rounded-xl border-2 transition-all duration-200 ${isSelected ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg transform -translate-y-1' : 'bg-white border-slate-200 text-slate-400 hover:border-indigo-300 hover:text-indigo-500'}`}
                                                    >
                                                        <span className="text-[10px] uppercase font-bold">{d.toLocaleDateString('es-ES', { weekday: 'short' })}</span>
                                                        <span className="text-lg font-black">{d.getDate()}</span>
                                                    </button>
                                                )
                                            })}
                                        </div>
                                    </section>

                                    {/* 2. Stats & CTA */}
                                    {optimizingDay && (
                                        <section className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200">
                                            <div className="flex items-center justify-between mb-6">
                                                <h4 className="font-bold text-slate-700">Análisis: {optimizingDay.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric' })}</h4>
                                                {isOptimizing ? <span className="text-xs text-amber-500 font-bold animate-pulse">ANALIZANDO...</span> : <span className="text-xs text-emerald-600 font-bold bg-emerald-50 px-2 py-1 rounded-full">COMPLETADO</span>}
                                            </div>

                                            {/* Chaos vs Order Visual */}
                                            <div className="flex gap-4 mb-6">
                                                <div className="flex-1 bg-red-50 rounded-xl p-3 border border-red-100 text-center opacity-50 grayscale">
                                                    <div className="text-2xl mb-1">🔴</div>
                                                    <div className="text-[10px] uppercase font-bold text-red-800">Ruta Actual</div>
                                                    <div className="text-xs text-red-600 font-medium">Alta Dispersión</div>
                                                </div>
                                                <div className="flex items-center text-slate-300"><ArrowRight /></div>
                                                <div className="flex-1 bg-emerald-50 rounded-xl p-3 border border-emerald-100 text-center shadow-md transform scale-110">
                                                    <div className="text-2xl mb-1">🟢</div>
                                                    <div className="text-[10px] uppercase font-bold text-emerald-800">Propuesta IA</div>
                                                    <div className="text-xs text-emerald-600 font-bold">Agrupada por CP</div>
                                                </div>
                                            </div>

                                            {/* Results Summary */}
                                            {!isOptimizing && proposedMoves.length > 0 ? (
                                                <div className="text-center">
                                                    <p className="text-sm text-slate-600 mb-4">Se han encontrado <strong className="text-indigo-600">{proposedMoves.length} mejoras</strong> significativas.</p>
                                                    <button
                                                        onClick={() => setOptimizerStep('PROPOSAL')}
                                                        className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-lg shadow-indigo-200 transition-all flex items-center justify-center gap-2"
                                                    >
                                                        <Zap size={16} className="fill-white" />
                                                        <span>VER PROPUESTA DETALLADA</span>
                                                    </button>
                                                </div>
                                            ) : (
                                                !isOptimizing && <div className="text-center text-xs text-slate-400 italic">Selecciona un día para analizar.</div>
                                            )}
                                        </section>
                                    )}
                                </div>
                            )}

                            {/* VIEW B: SWAP PROPOSAL DETAIL (v2.1) */}
                            {optimizerStep === 'PROPOSAL' && (
                                <div className="animate-slide-in-right">
                                    <button onClick={() => setOptimizerStep('ANALYSIS')} className="mb-4 text-xs font-bold text-slate-500 hover:text-slate-800 flex items-center gap-1">
                                        <ChevronLeft size={14} /> VOLVER AL RESUMEN
                                    </button>

                                    <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                                        <span className="bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full text-xs">{proposedMoves.length}</span>
                                        Pares Ineficientes (Swaps)
                                    </h3>

                                    <div className="space-y-4 pb-20">
                                        {proposedMoves.map((move, idx) => (
                                            <div key={idx} className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm relative overflow-hidden">

                                                {/* Header: Saving */}
                                                <div className="flex justify-between items-center mb-3">
                                                    <span className="text-[10px] uppercase font-bold text-slate-400">Intercambio Sugerido</span>
                                                    <span className="bg-green-100 text-green-700 text-xs font-bold px-2 py-0.5 rounded-full">-{move.saving} min trayecto</span>
                                                </div>

                                                {/* VERSUS CARDS (With Phone Links) */}
                                                <div className="flex flex-col gap-2 mb-4 relative">
                                                    {/* CARD A (Current Bad) */}
                                                    <div className="flex items-center gap-3 p-2 bg-red-50/50 border border-red-100 rounded-lg opacity-70">
                                                        <div className="text-xs font-bold text-slate-500 w-10">{move.apptA.start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex items-center justify-between">
                                                                <div className="text-xs font-bold text-slate-700 truncate">{move.apptA.client?.full_name}</div>
                                                                <a href={`tel:${move.apptA.client?.phone}`} className="w-6 h-6 flex items-center justify-center bg-white rounded-full text-slate-400 hover:text-green-600 shadow-sm border border-slate-100">
                                                                    <Phone size={12} />
                                                                </a>
                                                            </div>
                                                            <div className="text-[10px] text-slate-500 truncate">CP: {move.apptA.client?.postal_code} (Lejano)</div>
                                                        </div>
                                                    </div>

                                                    {/* Swap Icon */}
                                                    <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10 bg-white border rounded-full p-1 shadow-sm">
                                                        <div className="animate-spin-slow"><Zap size={14} className="fill-amber-400 text-amber-500" /></div>
                                                    </div>

                                                    {/* CARD B (Ideal) */}
                                                    <div className="flex items-center gap-3 p-2 bg-emerald-50/50 border border-emerald-100 rounded-lg">
                                                        <div className="text-xs font-bold text-slate-500 w-10">{move.apptB.start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex items-center justify-between">
                                                                <div className="text-xs font-bold text-slate-700 truncate">{move.apptB.client?.full_name}</div>
                                                                <a href={`tel:${move.apptB.client?.phone}`} className="w-6 h-6 flex items-center justify-center bg-white rounded-full text-slate-400 hover:text-green-600 shadow-sm border border-slate-100">
                                                                    <Phone size={12} />
                                                                </a>
                                                            </div>
                                                            <div className="text-[10px] text-slate-500 truncate">CP: {move.apptB.client?.postal_code} (Cercano)</div>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Actions */}
                                                <div className="flex gap-2">
                                                    <button // Spacer/Aux (Removed Clipboard)
                                                        className="hidden"
                                                    ></button>
                                                    <button
                                                        onClick={() => discardOptimizationMove(move.apptA.id)}
                                                        className="flex-1 py-2 text-xs font-bold text-slate-500 bg-slate-50 hover:bg-slate-100 rounded-lg"
                                                    >
                                                        DESCARTAR
                                                    </button>
                                                    <button
                                                        onClick={() => handleTeleportSwap(move)}
                                                        className="flex-1 py-2 text-xs font-bold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 shadow-lg shadow-indigo-200 active:scale-95 transition-all"
                                                    >
                                                        🔀 ACEPTAR
                                                    </button>
                                                </div>

                                            </div>
                                        ))}
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
                                            {getPositionedEvents(dayDate).map(appt => (
                                                <div key={appt.id} data-event-id={appt.id} onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (isInteractionBusy.current) return; // 🛡️ GUARD 
                                                    setSelectedAppt(appt);
                                                }}
                                                    className="h-5 min-h-[20px] bg-indigo-100/80 border border-indigo-200/50 hover:bg-white hover:border-indigo-400 rounded-md text-[9px] flex items-center px-1.5 shadow-sm cursor-pointer transition-all group"
                                                >
                                                    <div className={`w-1.5 h-1.5 rounded-full mr-1.5 shrink-0 bg-white/60`}></div>
                                                    <span className="font-bold mr-1 text-white">{appt.start.getHours()}:{String(appt.start.getMinutes()).padStart(2, '0')}</span>
                                                    <span className="truncate text-white/90 font-medium">{appt.appliance_info?.type || 'Servicio'}</span>
                                                </div>
                                            ))}
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
                                                    {/* 🏷️ TIME BADGE HEADER */}
                                                    <div className="flex justify-between items-center text-[10px] font-bold opacity-90 mb-0.5 leading-none">
                                                        <span>{appt.start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - {endTimeStr}</span>
                                                        <span className='opacity-50 text-[8px]'>{appt.duration}m</span>
                                                    </div>

                                                    {/* --- BODY: LOGO, TYPE, CONCEPT --- */}
                                                    <div className="relative flex-1 flex flex-col items-center justify-center p-1 overflow-hidden text-center">

                                                        {/* A) Watermark Logo (Brand) */}
                                                        {appt.brand_logo && (
                                                            <img src={appt.brand_logo} className="absolute inset-0 w-full h-full object-contain opacity-15 p-2 pointer-events-none mix-blend-multiply" />
                                                        )}

                                                        <div className="relative z-10 w-full">
                                                            {/* B) APPLIANCE TYPE (Equipo) - Pop Text */}
                                                            <div className="font-black text-[11px] uppercase tracking-tight leading-none text-slate-900 drop-shadow-sm mb-0.5 truncate">
                                                                {displayType}
                                                            </div>

                                                            {/* C) CONCEPT (Avería) - Sticker Label */}
                                                            <div className="text-[9px] font-bold leading-tight text-slate-800/90 line-clamp-2 bg-white/30 rounded px-1.5 py-0.5 backdrop-blur-[2px] mt-0.5 inline-block">
                                                                {appt.ticket_id ? `#${appt.ticket_id}` : (displayConcept || 'Sin concepto')}
                                                            </div>

                                                            {/* Brand Text if No Logo */}
                                                            {!appt.brand_logo && displayBrand && (
                                                                <div className="text-[8px] font-bold text-slate-600 uppercase mt-0.5 tracking-wider opacity-80">{displayBrand}</div>
                                                            )}
                                                        </div>
                                                    </div>

                                                    {/* --- FOOTER: MATRÍCULA (Tech & CP) --- */}
                                                    <div className="shrink-0 h-5 bg-black/10 flex items-center justify-between px-2 backdrop-blur-sm">
                                                        <div className="flex items-center gap-1 max-w-[60%]">
                                                            <span className="text-[9px] font-black text-slate-900 truncate">👤 {techName}</span>
                                                        </div>
                                                        <div className="flex items-center">
                                                            <span className="text-[9px] font-mono font-black text-slate-800 opacity-90 tracking-wide">
                                                                {appt.profiles?.postal_code || '---'}
                                                            </span>
                                                        </div>
                                                    </div>

                                                    {/* 📏 RESIZE HANDLE */}
                                                    <div
                                                        className="absolute bottom-0 left-0 w-full h-2 cursor-ns-resize z-50 hover:bg-black/10 flex justify-center items-end pb-0.5 group-hover:bg-black/5"
                                                        onMouseDown={(e) => handleResizeStart(e, appt)}
                                                    >
                                                        <div className="w-8 h-1 bg-slate-400/50 rounded-full"></div>
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
