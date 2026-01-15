import { supabase } from '../lib/supabase';

// TIER LIST (Hardcoded for "Knowledge of the World")
const BRAND_TIERS = {
    1: ['MIELE', 'GENERAL ELECTRIC', 'LIEBHERR', 'MITSUBISHI', 'DAIKIN', 'GAGGENAU', 'SUB-ZERO', 'WOLF'],
    2: ['BOSCH', 'BALAY', 'SIEMENS', 'LG', 'SAMSUNG', 'FUJITSU', 'CARRIER', 'PANASONIC', 'SONY', 'WHIRLPOOL', 'AEG', 'ELECTROLUX'],
    3: ['TEKA', 'FAGOR', 'BEKO', 'HAIER', 'HISENSE', 'ZANUSSI', 'INDESIT', 'CANDY', 'HOOVER'],
    4: [] // Everything else falls here
};

/**
 * MORTIFY: The Smart Amortization Algorithm
 * Calculates viability score based on 5 pillars.
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

        // 2. Fetch Category Defaults (for Market Price & Difficulty)
        // Note: matching by 'type' string. Ensure DB has defaults or handle fallback.
        const { data: defaults } = await supabase
            .from('appliance_category_defaults')
            .select('*')
            .ilike('category_name', appliance.type || '')
            .maybeSingle();

        // Defaults if not found
        const marketPrice = defaults?.average_market_price || 400; // Safe default
        const baseDifficulty = defaults?.base_installation_difficulty || 0;

        // --- THE ALGORITHM ---

        // A. BRAND SCORE (1-4 pts)
        let scoreBrand = 1; // Default Tier 4
        const brandUpper = (appliance.brand || '').toUpperCase().trim();

        if (BRAND_TIERS[1].includes(brandUpper)) scoreBrand = 4;
        else if (BRAND_TIERS[2].includes(brandUpper)) scoreBrand = 3;
        else if (BRAND_TIERS[3].includes(brandUpper)) scoreBrand = 2;
        // else 1

        // B. AGE SCORE (Time Factor)
        let scoreAge = 0;
        const currentYear = new Date().getFullYear();
        // Use input year if provided (fresh data), else database year
        const purchaseYear = userInputs.input_year || appliance.purchase_year;

        if (purchaseYear) {
            const age = currentYear - parseInt(purchaseYear);
            if (age < 6) scoreAge = 1; // Young appliance bonus
        } else {
            // Penalize unknown age? or Neutral? Let's say 0 if unknown.
            scoreAge = 0;
        }

        // C. INSTALLATION SCORE (Hassle Factor)
        let scoreInstallation = 0;
        const typeUpper = (appliance.type || '').toUpperCase();

        // Logical Rules
        if (defaults?.base_installation_difficulty === 1) {
            // Hard by default (e.g., Air Conditioning)
            scoreInstallation = 0;
        } else {
            // Easy by default, check logistics
            const floor = parseInt(userInputs.input_floor_level || 0); // 0 = Bajo/Casa
            if (floor <= 2) {
                scoreInstallation = 1; // Easy access
            } else {
                scoreInstallation = 0; // Hard access (Floor > 2)
            }
        }

        // D. FINANCIAL SCORE (Money Factor)
        // Rule: Total Spent < 50% of Market Value
        let scoreFinancial = 0;

        // Use override if provided (e.g. passed from client), otherwise strictly we need data.
        // For now, if no override, we might still fallback to repair_count heuristic or 0?
        // Let's support the override first for consistency.
        const totalSpent = (userInputs.total_spent_override !== undefined)
            ? parseFloat(userInputs.total_spent_override)
            : (appliance.repair_count || 0) * 100; // Rough fallback estimate if no override (100 per repair)

        const financialLimit = marketPrice * 0.5;

        if (totalSpent < financialLimit) {
            scoreFinancial = 1;
        }

        // E. TOTAL & VERDICT
        const totalScore = scoreBrand + scoreAge + scoreInstallation + scoreFinancial;

        let iaSuggestion = 'DOUBTFUL';
        if (totalScore >= 5) iaSuggestion = 'VIABLE';
        else if (totalScore < 3) iaSuggestion = 'OBSOLETE';

        // 3. SAVE ASSESSMENT (The Trial Record)
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

        return { success: true, data: assessment };

    } catch (error) {
        console.error('MORTIFY ALGORITHM FAILED:', error);
        return { success: false, error: error.message };
    }
};
