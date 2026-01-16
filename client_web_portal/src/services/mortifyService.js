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

        // B. AGE SCORE (Time Factor)
        let scoreAge = 0;
        const currentYear = new Date().getFullYear();
        // Use input year if provided (fresh data), else database year
        const purchaseYear = userInputs.input_year || appliance.purchase_year;

        if (purchaseYear) {
            const age = currentYear - parseInt(purchaseYear);
            if (age < 6) scoreAge = 1;
        }

        // C. INSTALLATION SCORE (Hassle Factor)
        let scoreInstallation = 0;

        if (defaults?.base_installation_difficulty === 1) {
            scoreInstallation = 0;
        } else {
            const floor = parseInt(userInputs.input_floor_level || 0);
            if (floor <= 2) {
                scoreInstallation = 1;
            } else {
                scoreInstallation = 0;
            }
        }

        // D. FINANCIAL SCORE (Money Factor)
        // Rule: Total Spent < 50% of Market Value
        let scoreFinancial = 0;

        // Use override passed from client (Strict Adherence)
        const totalSpent = (userInputs.total_spent_override !== undefined)
            ? parseFloat(userInputs.total_spent_override)
            : 0;

        // If no market price default found, we use 400 as fallback
        const marketPrice = parseFloat(defaults?.average_market_price || 400);
        const financialLimit = marketPrice * 0.5;

        // If spent is LESS than 50% of value, it's worth it (+1 point)
        // Otherwise 0 points.
        if (totalSpent < financialLimit) {
            scoreFinancial = 1;
        }

        // F. HISTORY PENALTY (Factor Ruina)
        // Rule 1: "Pozo sin Fondo" (Accumulated Spend)
        // Rule 2: "Paciente Crónico" (Repair Frequency)

        let penaltyHistory = 0;
        const repairCount = userInputs.repair_count || 0;
        // reuse totalSpent from Financial Score section

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
        // Start with base sum
        const rawScore = scoreBrand + scoreAge + scoreInstallation + scoreFinancial;
        // Apply penalty (ensure not negative)
        const totalScore = Math.max(0, rawScore - penaltyHistory);

        let iaSuggestion = 'DOUBTFUL';
        if (totalScore >= 5) iaSuggestion = 'VIABLE';
        else if (totalScore < 3) iaSuggestion = 'OBSOLETE';

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
            .select()
    .single();

if (insertError) throw insertError;

return { success: true, data: assessment };

    } catch (error) {
    console.error('MORTIFY ALGORITHM FAILED:', error);
    return { success: false, error: error.message };
}
};
