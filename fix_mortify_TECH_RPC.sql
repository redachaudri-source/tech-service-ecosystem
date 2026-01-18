-- ==========================================
-- MORTIFY TECHNICIAN HELPER RPC
-- Returns financial limits for a given appliance
-- ==========================================

CREATE OR REPLACE FUNCTION fn_get_appliance_financial_limit(p_appliance_id UUID)
RETURNS TABLE (
    market_price NUMERIC,
    prestige_multiplier NUMERIC,
    current_value NUMERIC,
    total_spent NUMERIC,
    ruin_limit NUMERIC,
    remaining_budget NUMERIC,
    recommendation TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_type TEXT;
    v_brand TEXT;
    v_purchase_year INT;
    v_input_year INT;
    v_current_year INT := EXTRACT(YEAR FROM CURRENT_DATE);
    v_age INT;
    
    v_market_price NUMERIC := 700; -- Default fallback
    v_lifespan INT := 10;
    v_brand_score INT;
    v_multiplier NUMERIC := 1.0;
    
    v_total_spent NUMERIC := 0;
    v_limit_ratio NUMERIC := 0.51; -- 51% limit by default
    v_calc_value NUMERIC := 0;
    v_ruin_limit NUMERIC := 0;
    v_remaining NUMERIC := 0;
BEGIN
    -- 1. Get Appliance Basic Info
    SELECT type, brand, purchase_year
    INTO v_type, v_brand, v_purchase_year
    FROM client_appliances
    WHERE id = p_appliance_id;

    -- 2. Try to get Input Year from assessments if exists (more accurate)
    SELECT input_year
    INTO v_input_year
    FROM mortify_assessments
    WHERE appliance_id = p_appliance_id
    ORDER BY created_at DESC
    LIMIT 1;

    -- Calculate Age
    v_age := COALESCE(v_input_year, v_purchase_year);
    IF v_age IS NOT NULL THEN
        v_age := v_current_year - v_age;
    ELSE
        v_age := 5; -- Default avg age if unknown
    END IF;
    IF v_age < 0 THEN v_age := 0; END IF;

    -- 3. Get Market Defaults
    SELECT average_market_price, average_lifespan_years
    INTO v_market_price, v_lifespan
    FROM appliance_category_defaults
    WHERE category_name ILIKE v_type;
    
    -- Fallbacks
    IF v_market_price IS NULL THEN v_market_price := 600; END IF;
    IF v_lifespan IS NULL THEN v_lifespan := 10; END IF;

    -- 4. Get Brand Score (Hardcoded Fallback for Reliability)
    -- We match common brands to prestige levels directly to avoid missing table errors
    CASE 
        WHEN v_brand ILIKE '%Miele%' OR v_brand ILIKE '%Liebherr%' OR v_brand ILIKE '%Gaggenau%' THEN
            v_brand_score := 4;
            v_multiplier := 2.2;
        WHEN v_brand ILIKE '%Bosch%' OR v_brand ILIKE '%Balay%' OR v_brand ILIKE '%Siemens%' OR v_brand ILIKE '%Samsung%' THEN
            v_brand_score := 3;
            v_multiplier := 1.6;
        WHEN v_brand ILIKE '%Beko%' OR v_brand ILIKE '%Indesit%' OR v_brand ILIKE '%Teka%' THEN
            v_brand_score := 2;
            v_multiplier := 1.25;
        ELSE
            v_brand_score := 1;
            v_multiplier := 1.0;
    END CASE;

    -- 5. Calculate Current Value (The "Miele Formula")
    -- Base * Multiplier * Depreciation
    v_calc_value := (v_market_price * v_multiplier);
    
    -- Linear Depreciation
    IF v_age < v_lifespan THEN
        v_calc_value := v_calc_value * (1.0 - (v_age::NUMERIC / v_lifespan::NUMERIC));
    ELSE
        v_calc_value := 50; -- Scrap value
    END IF;

    -- 6. Calculate Total Spent (Finalized/Paid only)
    SELECT COALESCE(SUM(final_price), 0)
    INTO v_total_spent
    FROM tickets
    WHERE appliance_id = p_appliance_id
    AND status IN ('finalizado', 'pagado');

    -- 7. Calculate Limits
    -- Amnesty Logic: Between 3 and 7 years, we allow spending up to 70% of value
    IF v_age >= 3 AND v_age <= 7 THEN
        v_limit_ratio := 0.70;
    ELSE
        v_limit_ratio := 0.51;
    END IF;

    v_ruin_limit := v_calc_value * v_limit_ratio;
    v_remaining := GREATEST(0, v_ruin_limit - v_total_spent);

    -- 8. Return
    RETURN QUERY SELECT 
        v_market_price,
        v_multiplier,
        v_calc_value,
        v_total_spent,
        v_ruin_limit,
        v_remaining,
        CASE 
            WHEN v_remaining <= 0 THEN 'RUINA_TOTAL'
            WHEN v_remaining < 100 THEN 'ALTO_RIESGO'
            ELSE 'VIABLE'
        END;
END;
$$;
