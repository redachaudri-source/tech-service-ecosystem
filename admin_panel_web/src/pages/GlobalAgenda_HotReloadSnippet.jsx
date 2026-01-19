// --- AI LOGIC (v3.0 - SANDWICH + STACKING) ---
const runOptimizerAnalysis = async (day, activeStrategy = 'BOOMERANG') => {
    // Only set loading if not already loading to prevent flicker loops if called rapidly
    if (!isOptimizing) setIsOptimizing(true);

    setProposedMoves([]);

    // 🚀 Speed Up: No artificial delay
    // await new Promise(r => setTimeout(r, 800));

    // 1. Get Events for the day & Tech (Local Date Fix)
    const dayLocalStr = day.toDateString();
    const dayEvents = appointments.filter(a => a.start.toDateString() === dayLocalStr && selectedTechs.includes(a.technician_id));

    if (dayEvents.length < 2) {
        addToast('Mínimo 2 tickets para optimizar.', 'info');
        setIsOptimizing(false);
        return;
    }

    // 2. Identify "Km0" (Tech Home or Office) - STRICT MODE
    // ... rest of logic
};

// HOT RELOAD TRIGGER 
// Automatically re-run analysis when Day or Strategy changes.
useEffect(() => {
    if (optimizingDay) {
        runOptimizerAnalysis(optimizingDay, optimizationStrategy);
    }
}, [optimizingDay, optimizationStrategy]);
