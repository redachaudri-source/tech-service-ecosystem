-- MORTIFY V2: THE NECROMANCER UPDATE
-- 1. Adds 'admin_recovered_points' to allow Admin to resurrect financial points.
-- 2. Updates the Scoring Logic to include these points.

-- A. SCHEMA UPDATE
ALTER TABLE mortify_assessments 
ADD COLUMN IF NOT EXISTS admin_recovered_points INT DEFAULT 0;

-- B. UPDATE RPC FUNCTION (The Brain)
-- Now takes into account the recovered points.
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

    -- Scoring Vars
    v_brand_score_db INT := 1;
    v_score_brand INT;
    v_score_age_pts INT;
    v_score_install INT;
    v_score_fin INT;
    v_recovered_points INT := 0; -- New Variable
    v_total_score INT;
    v_max_possible_fin INT := 10; -- Max Financial Score is 10

    -- Financial Calcs
    v_age INT;
    v_current_value NUMERIC;
    v_total_spent NUMERIC;
    v_spend_ratio NUMERIC;
    v_limit_ratio NUMERIC := 0.51;

    -- Result
    v_ia_suggestion TEXT;
BEGIN
    -- 1. GET APPLIANCE & EXISTING RECOVERY DATA
    SELECT ca.brand, ca.purchase_year, ca.type, ca.housing_type, ca.floor_level, COALESCE(ma.admin_recovered_points, 0)
    INTO v_app_brand, v_app_year, v_app_type, v_housing_type, v_floor_level, v_recovered_points
    FROM client_appliances ca
    LEFT JOIN mortify_assessments ma ON ma.appliance_id = ca.id
    WHERE ca.id = p_appliance_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Appliance not found');
    END IF;

    -- 2. GET DEFAULTS & BRAND SCORE
    SELECT average_market_price, average_lifespan_years
    INTO v_base_market_price, v_lifespan
    FROM appliance_category_defaults WHERE category_name ILIKE v_app_type LIMIT 1;
    
    IF v_base_market_price IS NULL THEN v_base_market_price := 700; END IF;
    IF v_lifespan IS NULL THEN v_lifespan := 10; END IF;

    SELECT score_points INTO v_brand_score_db
    FROM mortify_brand_scores WHERE brand_name ILIKE v_app_brand LIMIT 1;
    IF v_brand_score_db IS NULL THEN v_brand_score_db := 2; END IF;
    v_score_brand := v_brand_score_db;

    -- 3. CALCULATE AGE SCORE
    v_age := EXTRACT(YEAR FROM NOW()) - COALESCE(v_app_year, EXTRACT(YEAR FROM NOW())::INT);
    IF v_age < 0 THEN v_age := 0; END IF;
    
    IF v_age <= 2 THEN v_score_age_pts := 5;
    ELSIF v_age <= 4 THEN v_score_age_pts := 4;
    ELSIF v_age <= 6 THEN v_score_age_pts := 3;
    ELSIF v_age <= 8 THEN v_score_age_pts := 2;
    ELSIF v_age <= 10 THEN v_score_age_pts := 1;
    ELSE v_score_age_pts := 0; END IF;

    -- 4. CALCULATE INSTALLATION SCORE
    v_score_install := 5;
    IF COALESCE(v_housing_type, 'PISO') = 'PISO' THEN
        IF v_floor_level = 1 THEN v_score_install := 4;
        ELSIF v_floor_level = 2 THEN v_score_install := 3;
        ELSIF v_floor_level = 3 THEN v_score_install := 2;
        ELSIF v_floor_level = 4 THEN v_score_install := 1;
        ELSIF v_floor_level >= 5 THEN v_score_install := 0;
        END IF;
    END IF;

    -- 5. CALCULATE FINANCIAL SCORE
    SELECT COALESCE(SUM(final_price), 0) INTO v_total_spent
    FROM tickets
    WHERE appliance_id = p_appliance_id AND status IN ('finalizado', 'pagado');

    IF v_total_spent = 0 THEN
        v_score_fin := 10;
    ELSE
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

    -- 6. APPLY RECOVERY MECHANIC (The Necromancer)
    -- Admin can recover points, but Total Score cannot exceed theoretical max (24) logically, 
    -- OR we treat recovered points as a bonus that offsets financial loss.
    -- Logic: Base Components + Financial + Recovered.
    -- Constraint: Financial + Recovered cannot exceed 10 (System Integrity)? 
    -- USER SAID: "recuperando... puntos perdidos por tema financiero".
    -- So (Financial + Recovered) should probably not exceed 10. Let's clamp it or allow "Overclocking"?
    -- Strict interpretation: "Recover lost points". lost = (10 - v_score_fin).
    -- We won't enforce clamp strictly in SQL to allow Admin flexibility, but UI should guide it.
    
    v_total_score := v_score_brand + v_score_age_pts + v_score_install + v_score_fin + v_recovered_points;

    -- 7. UPDATE VERDICT
    IF v_total_score >= 18 THEN v_ia_suggestion := 'VIABLE';
    ELSIF v_score_fin = 0 AND v_recovered_points = 0 THEN v_ia_suggestion := 'OBSOLETE'; -- Only ruin if no recovery
    ELSE v_ia_suggestion := 'DOUBTFUL';
    END IF;

    -- 8. UPSERT
    INSERT INTO mortify_assessments (
        appliance_id,
        input_year,
        score_brand,
        score_age,
        score_installation,
        score_financial,
        admin_recovered_points, -- Persist this
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
        v_recovered_points,
        v_total_score,
        v_ia_suggestion,
        'JUDGED', -- Auto-judge if recalculating? Or keep PENDING? 
                  -- If it's an auto-update loop, we might want to keep current status or default to JUDGED if it was already judged.
                  -- For V2, let's say updates keep it relevant.
        NOW()
    )
    ON CONFLICT (appliance_id) DO UPDATE SET
        score_brand = EXCLUDED.score_brand,
        score_age = EXCLUDED.score_age,
        score_installation = EXCLUDED.score_installation,
        score_financial = EXCLUDED.score_financial,
        -- admin_recovered_points = EXCLUDED.admin_recovered_points, -- DO NOT OVERWRITE WITH DEFAULT 0, KEEP EXISTING!
        -- Wait, the SELECT above retrieved the existing value into v_recovered_points.
        -- So putting v_recovered_points in the INSERT values is correct, effectively preserving it.
        admin_recovered_points = v_recovered_points, 
        total_score = EXCLUDED.total_score,
        ia_suggestion = EXCLUDED.ia_suggestion,
        updated_at = NOW();

    RETURN jsonb_build_object(
        'success', true,
        'new_total', v_total_score,
        'recovered', v_recovered_points,
        'financial', v_score_fin
    );
END;
$$ LANGUAGE plpgsql;
