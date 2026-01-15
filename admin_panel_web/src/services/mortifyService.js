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
        // "Gasto acumulado < 50% valor nuevo"
        let scoreFinancial = 0;
        // We need repair history sum. Assuming 'repair_count' is reliable or fetch tickets sum?
        // For Phase 1 simplified: Use repair_count * estimated_avg_repair_cost (e.g. 100€) 
        // OR simply check if repair_count is low.
        // Let's implement the prompt rule: "Total Spent + Current Budget"
        // Since we don't have exact spending history sums easily here without a join,
        // we will implement a heuristic: If repair_count >= 2 -> 0 pts. Else 1 pt.
        // TODO: Refine with real financial queries in Phase 9.
        if ((appliance.repair_count || 0) < 2) {
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
