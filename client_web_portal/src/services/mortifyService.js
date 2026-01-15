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

        // A. BRAND SCORE (1-4 pts)
        let scoreBrand = 1; // Default Tier 4
        const brandUpper = (appliance.brand || '').toUpperCase().trim();

        if (BRAND_TIERS[1].includes(brandUpper)) scoreBrand = 4;
        else if (BRAND_TIERS[2].includes(brandUpper)) scoreBrand = 3;
        else if (BRAND_TIERS[3].includes(brandUpper)) scoreBrand = 2;

        // B. AGE SCORE (Time Factor)
        let scoreAge = 0;
        const currentYear = new Date().getFullYear();
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
        // Heuristic: If repair_count < 2 => 1 pt
        let scoreFinancial = 0;
        // Ideally fetch repair_count from DB derived column if exists, or just use current known state?
        // In this context, 'appliance' fetched from DB might imply we have updated columns from Phase 3.1
        // Let's rely on what we have.
        if ((appliance.repair_count || 0) < 2) {
            scoreFinancial = 1;
        }

        // E. TOTAL & VERDICT
        const totalScore = scoreBrand + scoreAge + scoreInstallation + scoreFinancial;

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

        return { success: true, data: assessment };

    } catch (error) {
        console.error('MORTIFY ALGORITHM FAILED:', error);
        return { success: false, error: error.message };
    }
};
