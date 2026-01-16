import { supabase } from '../lib/supabase';

/**
 * MORTIFY: The Smart Amortization Algorithm
 * Client-Side Version (mirrors Admin Logic for now)
 * 
 * @param {string} applianceId - UUID of client_appliance
 * @param {object} userInputs - snapshot inputs { input_year, input_floor_level }
 * @returns {object} { success, data, error }
 */
export const assessMortifyViability = async (applianceId, userInputs) => {
    try {
        if (!applianceId) throw new Error("Appliance ID required");

        // 1. Fetch Appliance Data & History
        const { data: appliance, error: appError } = await supabase
            .from('client_appliances')
            .select('*')
            .eq('id', applianceId)
            .single();

        if (appError || !appliance) throw new Error("Appliance not found");

        // 2. Fetch Category Defaults
        const { data: defaults } = await supabase
            .from('appliance_category_defaults')
            .select('*')
            .ilike('category_name', appliance.type || '')
            .maybeSingle();

        // Defaults if not found
        const baseDifficulty = defaults?.base_installation_difficulty || 0;

        // --- THE ALGORITHM ---

        // 2a. Fetch Brand Score Logic (Dynamic)
        // Try to find the brand in our database
        const brandQueryName = (appliance.brand || '').trim();
        let scoreBrand = 1; // Default Baseline (Generic/Unknown)

        if (brandQueryName) {
            const { data: brandData } = await supabase
                .from('mortify_brand_scores')
                .select('score_points')
                .ilike('brand_name', brandQueryName)
                .maybeSingle();

            if (brandData) {
                scoreBrand = brandData.score_points;
            }
        }

        // B. AGE SCORE (Time Factor) - GRANULAR 0-5
        let scoreAge = 0;
        const currentYear = new Date().getFullYear();
        // Use input year if provided (fresh data), else database year
        const purchaseYear = userInputs.input_year || appliance.purchase_year;

        if (purchaseYear) {
            const age = currentYear - parseInt(purchaseYear);
            // 0-2 años: 5 Puntos.
            // 3-4 años: 4 Puntos.
            // 5-6 años: 3 Puntos.
            // 7-8 años: 2 Puntos.
            // 9-10 años: 1 Punto.
            // > 10 años: 0 Puntos.
            if (age <= 2) scoreAge = 5;
            else if (age <= 4) scoreAge = 4;
            else if (age <= 6) scoreAge = 3;
            else if (age <= 8) scoreAge = 2;
            else if (age <= 10) scoreAge = 1;
            else scoreAge = 0;
        }

        // C. INSTALLATION SCORE (Hassle Factor) - GRANULAR 0-5
        let scoreInstallation = 5; // Default max (e.g. House/Chalet/Boat)

        const housingType = (userInputs.housing_type || appliance.housing_type || 'PISO');

        if (housingType === 'PISO') {
            const floor = parseInt(userInputs.input_floor_level || appliance.floor_level || 0);
            // Planta 0: 5 Puntos
            // Planta 1: 4 Puntos
            // Planta 2: 3 Puntos
            // Planta 3: 2 Puntos
            // Planta 4: 1 Punto
            // Planta >= 5: 0 Puntos
            if (floor === 0) scoreInstallation = 5;
            else if (floor === 1) scoreInstallation = 4;
            else if (floor === 2) scoreInstallation = 3;
            else if (floor === 3) scoreInstallation = 2;
            else if (floor === 4) scoreInstallation = 1;
            else scoreInstallation = 0;
        }

        // D. FINANCIAL SCORE (Money Factor) - REMOVING BINARY LOGIC?
        // Wait, user didn't specify granular logic for Financial in this task prompt. 
        // "C) PUNTUACIÓN MARCA (Max 4 Puntos) * Se mantiene la lógica actual"
        // But what about Financial? 
        // The prompt says "Max is 14 (5+5+4)". This implies Financial Score is REMOVED or MERGED into the others?
        // Or maybe Financial is just a penalty now ("Factor Ruina")?
        // "Rule 1: Pozo sin Fondo... Rule 2: Paciente Crónico" -> These are penalties.
        // The math: 5 (Age) + 5 (Install) + 4 (Brand) = 14. 
        // So YES, `scoreFinancial` (the +1 bonus for being cheap) seems to be REMOVED from the base sum. 
        // We will keep the penalties.

        let scoreFinancial = 0; // Deprecated as a base point

        // ... (Keep overrides logic just for future ref if needed, but it adds 0) ... 
        const totalSpent = (userInputs.total_spent_override !== undefined)
            ? parseFloat(userInputs.total_spent_override)
            : 0;
        const marketPrice = parseFloat(defaults?.average_market_price || 400);

        // F. HISTORY PENALTY (Factor Ruina)
        let penaltyHistory = 0;
        const repairCount = userInputs.repair_count || 0;

        // 1. Spend Penalty
        if (totalSpent > (marketPrice * 0.5)) {
            penaltyHistory += 2;
        } else if (totalSpent > (marketPrice * 0.3)) {
            penaltyHistory += 1;
        }

        // 2. Frequency Penalty
        if (repairCount >= 3) {
            penaltyHistory += 2;
        } else if (repairCount === 2) {
            penaltyHistory += 1;
        }

        // G. TOTAL & VERDICT
        // Max Possible = 14
        const rawScore = scoreBrand + scoreAge + scoreInstallation; // Financial removed from base
        // Apply penalty (ensure not negative)
        const totalScore = Math.max(0, rawScore - penaltyHistory);

        // Verdict Mapping (recalibrated V-Label handles visual, but we need text suggestion)
        // V6 (12-14) | V5 (10-11) | V4 (8-9) | V3 (6-7) | V2 (4-5) | V1 (0-3)
        let iaSuggestion = 'DOUBTFUL';
        if (totalScore >= 10) iaSuggestion = 'VIABLE';
        else if (totalScore <= 3) iaSuggestion = 'OBSOLETE';

        // 3. SAVE ASSESSMENT
        const { data: assessment, error: insertError } = await supabase
            .from('mortify_assessments')
            .insert({
                appliance_id: applianceId,
                input_year: purchaseYear ? parseInt(purchaseYear) : null,
                input_floor_level: userInputs.input_floor_level ? parseInt(userInputs.input_floor_level) : null,
                score_brand: scoreBrand,
                score_age: scoreAge,
                score_installation: scoreInstallation,
                score_financial: scoreFinancial,
                total_score: totalScore,
                ia_suggestion: iaSuggestion,
                status: 'PENDING_JUDGE'
            })
            .select()
            .single();

        if (insertError) throw insertError;

        // Return penalty info for UI warning
        return { success: true, data: { ...assessment, history_penalty: penaltyHistory, total_spent_ref: totalSpent } };

    } catch (error) {
        console.error('MORTIFY ALGORITHM FAILED:', error);
        return { success: false, error: error.message };
    }
};
