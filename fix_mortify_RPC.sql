-- FIX MORTIFY RPC: ON-DEMAND RECALCULATION
-- Triggers are great, but sometimes we need to FORCE a recalculation from the UI
-- even if no tickets have changed (e.g. after changing a Brand's Score config).

CREATE OR REPLACE FUNCTION fn_calculate_mortify_score(p_appliance_id UUID)
RETURNS JSONB AS $$
DECLARE
    -- Appliance Data
    v_app_brand TEXT;
    v_app_year INT;
    v_app_type TEXT;
    v_housing_type TEXT;
    v_floor_level INT;

    -- Config Data
    v_base_market_price NUMERIC := 700;
    v_lifespan INT := 10;

    -- Scoring Consumer Vars
    v_brand_score_db INT := 1;
    v_score_brand INT;
    v_score_age_pts INT;
    v_score_install INT;
    v_score_fin INT;
    v_total_score INT;

    -- Financial Calcs
    v_age INT;
    v_current_value NUMERIC;
    v_total_spent NUMERIC;
    v_spend_ratio NUMERIC;
    v_limit_ratio NUMERIC := 0.51;

    -- Result
    v_ia_suggestion TEXT;
    v_admin_note TEXT;
BEGIN
    -- 1. GET APPLIANCE DETAILS
    SELECT brand, purchase_year, type, housing_type, floor_level
    INTO v_app_brand, v_app_year, v_app_type, v_housing_type, v_floor_level
    FROM client_appliances WHERE id = p_appliance_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Appliance not found');
    END IF;

    -- 2. GET DEFAULTS
    SELECT average_market_price, average_lifespan_years
    INTO v_base_market_price, v_lifespan
    FROM appliance_category_defaults WHERE category_name ILIKE v_app_type LIMIT 1;
    
    IF v_base_market_price IS NULL THEN v_base_market_price := 700; END IF;
    IF v_lifespan IS NULL THEN v_lifespan := 10; END IF;

    -- 3. GET BRAND SCORE (Live Lookup)
    SELECT score_points INTO v_brand_score_db
    FROM mortify_brand_scores WHERE brand_name ILIKE v_app_brand LIMIT 1;

    IF v_brand_score_db IS NULL THEN v_brand_score_db := 2; END IF;
    v_score_brand := v_brand_score_db;

    -- 4. CALCULATE AGE SCORE
    v_age := EXTRACT(YEAR FROM NOW()) - COALESCE(v_app_year, EXTRACT(YEAR FROM NOW())::INT);
    IF v_age < 0 THEN v_age := 0; END IF;

    IF v_age <= 2 THEN v_score_age_pts := 5;
    ELSIF v_age <= 4 THEN v_score_age_pts := 4;
    ELSIF v_age <= 6 THEN v_score_age_pts := 3;
    ELSIF v_age <= 8 THEN v_score_age_pts := 2;
    ELSIF v_age <= 10 THEN v_score_age_pts := 1;
    ELSE v_score_age_pts := 0; END IF;

    -- 5. CALCULATE INSTALLATION SCORE
    v_score_install := 5; -- Default
    IF COALESCE(v_housing_type, 'PISO') = 'PISO' THEN
        IF v_floor_level = 1 THEN v_score_install := 4;
        ELSIF v_floor_level = 2 THEN v_score_install := 3;
        ELSIF v_floor_level = 3 THEN v_score_install := 2;
        ELSIF v_floor_level = 4 THEN v_score_install := 1;
        ELSIF v_floor_level >= 5 THEN v_score_install := 0;
        END IF;
    END IF;

    -- 6. CALCULATE FINANCIAL SCORE (The "Zero Spend = 10" Fix)
    SELECT COALESCE(SUM(final_price), 0) INTO v_total_spent
    FROM tickets
    WHERE appliance_id = p_appliance_id AND status IN ('finalizado', 'pagado');

    IF v_total_spent = 0 THEN
        v_score_fin := 10; -- New/Clean Appliance
    ELSE
        -- Basic limits calc
        v_current_value := v_base_market_price * (1.0 - (LEAST(v_age, v_lifespan)::NUMERIC / v_lifespan::NUMERIC));
        IF v_current_value <= 0 THEN v_current_value := 1; END IF;
        
        v_spend_ratio := v_total_spent / v_current_value;
        IF v_spend_ratio > v_limit_ratio THEN
            v_score_fin := 0;
        ELSE
             v_score_fin := ROUND(10 * (1.0 - (v_spend_ratio / v_limit_ratio)));
             IF v_score_fin < 1 THEN v_score_fin := 1; END IF;
        END IF;
    END IF;

    -- 7. TOTAL SCORE
    v_total_score := v_score_brand + v_score_age_pts + v_score_install + v_score_fin;

    IF v_total_score >= 18 THEN v_ia_suggestion := 'VIABLE';
    ELSIF v_score_fin = 0 THEN v_ia_suggestion := 'OBSOLETE';
    ELSE v_ia_suggestion := 'DOUBTFUL';
    END IF;

    -- 8. UPSERT ASSESSMENT
    INSERT INTO mortify_assessments (
        appliance_id,
        input_year,
        score_brand,
        score_age,
        score_installation,
        score_financial,
        total_score,
        ia_suggestion,
        status,
        updated_at
    ) VALUES (
        p_appliance_id,
        v_app_year,
        v_score_brand,
        v_score_age_pts,
        v_score_install,
        v_score_fin,
        v_total_score,
        v_ia_suggestion,
        'PENDING_JUDGE',
        NOW()
    )
    ON CONFLICT (appliance_id) DO UPDATE SET
        score_brand = EXCLUDED.score_brand,
        score_age = EXCLUDED.score_age,
        score_installation = EXCLUDED.score_installation,
        score_financial = EXCLUDED.score_financial,
        total_score = EXCLUDED.total_score,
        ia_suggestion = EXCLUDED.ia_suggestion,
        updated_at = NOW();

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Score recalculated successfully',
        'new_total', v_total_score,
        'new_brand_score', v_score_brand
    );
END;
$$ LANGUAGE plpgsql;
