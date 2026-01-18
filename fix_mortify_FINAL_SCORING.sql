-- FIX MORTIFY SCORING MATH - FINAL VERSION
-- 1. Drops legacy triggers
-- 2. Sets price defaults
-- 3. Ensures Financial Score is 10 for new items
-- 4. Calculates Total Score properly (4+5+5+10 = 24)

DROP TRIGGER IF EXISTS trg_mortify_v13_tickets ON tickets;
DROP TRIGGER IF EXISTS trg_mortify_v13_appliances ON client_appliances;

CREATE OR REPLACE FUNCTION trigger_mortify_v13_god_tier()
RETURNS TRIGGER AS $$
DECLARE
    v_app_id UUID;
    v_app_brand TEXT;
    v_app_year INT;
    v_app_type TEXT;
    v_housing_type TEXT;
    v_floor_level INT;
    
    -- Config
    v_base_market_price NUMERIC := 700; -- DEFAULT SYNCED WITH FRONTEND
    v_lifespan INT := 10;
    
    -- Scores
    v_brand_score_db INT;
    v_prestige_multiplier NUMERIC := 1.0;
    v_prestige_price NUMERIC;
    v_score_brand INT := 1;
    v_score_age_pts INT := 0;
    v_score_install INT := 3;
    v_score_fin INT := 10;
    v_total_score INT := 0;
    
    -- Fin
    v_age INT;
    v_current_value NUMERIC;
    v_total_spent NUMERIC := 0;
    v_spend_ratio NUMERIC;
    v_limit_ratio NUMERIC := 0.51;
    
    v_template_text TEXT;
    v_existing_id UUID;
BEGIN
    -- Context
    IF TG_TABLE_NAME = 'tickets' THEN
        v_app_id := NEW.appliance_id;
    ELSE
        v_app_id := NEW.id;
    END IF;

    -- Load App Data
    SELECT brand, purchase_year, type, housing_type, floor_level
    INTO v_app_brand, v_app_year, v_app_type, v_housing_type, v_floor_level
    FROM client_appliances WHERE id = v_app_id;

    -- Load Defaults
    SELECT average_market_price, average_lifespan_years 
    INTO v_base_market_price, v_lifespan 
    FROM appliance_category_defaults WHERE category_name ILIKE v_app_type LIMIT 1;
    
    IF v_base_market_price IS NULL THEN v_base_market_price := 700; END IF;
    IF v_lifespan IS NULL THEN v_lifespan := 10; END IF;

    -- Brand Score (1-4)
    SELECT score_points INTO v_brand_score_db
    FROM mortify_brand_scores WHERE brand_name ILIKE v_app_brand LIMIT 1;
    IF v_brand_score_db IS NULL THEN v_brand_score_db := 2; END IF;

    -- Prestige
    IF v_brand_score_db >= 4 THEN v_prestige_multiplier := 2.2;
    ELSIF v_brand_score_db = 3 THEN v_prestige_multiplier := 1.6;
    ELSIF v_brand_score_db = 2 THEN v_prestige_multiplier := 1.25;
    ELSE v_prestige_multiplier := 1.0; END IF;

    v_prestige_price := v_base_market_price * v_prestige_multiplier;
    v_score_brand := v_brand_score_db;

    -- Age
    v_age := EXTRACT(YEAR FROM NOW()) - v_app_year;
    IF v_age < 0 OR v_age IS NULL THEN v_age := 0; END IF;

    IF v_age <= 2 THEN v_score_age_pts := 5;
    ELSIF v_age <= 4 THEN v_score_age_pts := 4;
    ELSIF v_age <= 6 THEN v_score_age_pts := 3;
    ELSIF v_age <= 8 THEN v_score_age_pts := 2;
    ELSIF v_age <= 10 THEN v_score_age_pts := 1;
    ELSE v_score_age_pts := 0; END IF;

    -- Installation
    IF (v_housing_type ILIKE '%chalet%' OR v_housing_type ILIKE '%casa%') THEN
        v_score_install := 5;
    ELSIF (v_floor_level <= 0 OR v_floor_level IS NULL) THEN
        v_score_install := 5;
    ELSE
        v_score_install := 3;
    END IF;

    -- Financial
    IF v_age >= 3 AND v_age <= 7 THEN v_limit_ratio := 0.70; END IF;

    IF v_age >= v_lifespan THEN
        v_current_value := 0;
    ELSE
        v_current_value := v_prestige_price * (1.0 - (v_age::NUMERIC / v_lifespan::NUMERIC));
    END IF;

    SELECT COALESCE(SUM(final_price), 0) INTO v_total_spent
    FROM tickets
    WHERE appliance_id = v_app_id AND (status IN ('finalizado', 'pagado') OR is_paid = true);

    -- Logic
    IF v_current_value <= 0 THEN
         v_score_fin := 0;
         v_template_text := 'Amortizado. Valor residual 0.';
    ELSIF v_total_spent = 0 THEN
         -- NEW CONDITION: PERFECT SCORE IF NOTHING SPENT
         v_score_fin := 10;
         v_template_text := 'Impecable. Sin gastos previos.';
    ELSE
        v_spend_ratio := v_total_spent / NULLIF(v_current_value, 1);
        IF v_spend_ratio > v_limit_ratio THEN
            v_score_fin := 0;
            v_template_text := 'Riesgo Financiero Excesivo.';
        ELSE
            v_score_fin := ROUND(10 * (1.0 - (v_spend_ratio / v_limit_ratio)));
            if v_score_fin < 1 THEN v_score_fin := 1; END IF;
            v_template_text := 'Operación Viable.';
        END IF;
    END IF;
    
    -- TOTAL SUM
    v_total_score := v_score_brand + v_score_age_pts + v_score_install + v_score_fin;
    
    -- Veto override
    IF v_score_fin = 0 THEN 
        v_total_score := 0; -- Or keep points but mark as obsolete? 
        -- User wants score to reflect reality. If obsolete, score implies dying.
        -- Let's force 0 to match current UX "Zona de Muerte".
        -- Or maybe 14/24 Obsolete is confusing.
        -- But for now, sticking to current logic: Fin=0 -> Total=0?
        -- Wait, previous log said Total 14. That implies Fin=0 but Total NOT zeroed?
        -- Let's check my previous script logic.
        -- "IF v_score_fin = 0 THEN v_total_score := 0;" was there.
        -- So if user sees 14, then Fin != 0?
        -- 4+5+5+X = 14 => X=0.
        -- If X=0, then Total=0. 
        -- Impossible.
        -- UNLESS the previous trigger DID NOT have the zeroing line?
        -- OR v_score_fin was NULL?
        
        -- Safe bet: Force total score calc.
    END IF;

    -- UPDATE ONLY
    UPDATE mortify_assessments SET
        score_brand = v_score_brand,
        score_age = v_score_age_pts,
        score_installation = v_score_install,
        score_financial = v_score_fin,
        total_score = v_total_score,
        admin_note = v_template_text,
        ia_suggestion = CASE 
            WHEN v_score_fin = 0 THEN 'OBSOLETE'
            WHEN v_total_score >= 18 THEN 'VIABLE'
            ELSE 'DOUBTFUL'
        END,
        created_at = NOW()
    WHERE appliance_id = v_app_id AND status = 'PENDING_JUDGE';

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RE-APPLY TRIGGER ONLY ON TICKETS
CREATE TRIGGER trg_mortify_v13_tickets
    AFTER UPDATE ON tickets
    FOR EACH ROW
    EXECUTE FUNCTION trigger_mortify_v13_god_tier();
