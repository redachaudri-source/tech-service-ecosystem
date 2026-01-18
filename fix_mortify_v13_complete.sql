-- COMPREHENSIVE V13 FIX: GOD TIER MORTIFY + CLEANUP + DYNAMIC INSTALLATION
-- 1. Drop ALL potential conflicting triggers
-- 2. Define robust scoring function (Install, Prestige, Financial)
-- 3. Apply to BOTH tickets (Updates) and client_appliances (Creation/Updates)

-- === A. CLEANUP LEGACY TRIGGERS ===
DROP TRIGGER IF EXISTS auto_mortify_on_close ON tickets;
DROP TRIGGER IF EXISTS trigger_auto_mortify_initial ON client_appliances;
DROP TRIGGER IF EXISTS auto_mortify_insert ON client_appliances;
DROP TRIGGER IF EXISTS mortify_insert_trigger ON client_appliances;
DROP TRIGGER IF EXISTS ai_judge_insert ON client_appliances;
DROP TRIGGER IF EXISTS on_appliance_created ON client_appliances;

-- === B. THE GOD TIER FUNCTION ===
CREATE OR REPLACE FUNCTION trigger_mortify_v13_god_tier()
RETURNS TRIGGER AS $$
DECLARE
    -- Appliance Data
    v_app_id UUID;
    v_app_brand TEXT;
    v_app_year INT;
    v_app_type TEXT;
    v_housing_type TEXT;
    v_floor_level INT;
    
    -- Config Data
    v_base_market_price NUMERIC := 700; 
    v_lifespan INT := 10;
    
    -- Prestige Vars
    v_brand_score_db INT;
    v_prestige_multiplier NUMERIC := 1.0;
    v_prestige_price NUMERIC;
    
    -- Scoring Vars
    v_score_brand INT := 1;
    v_score_age_pts INT := 0;
    v_score_install INT := 3; -- Default Moderate
    v_score_fin INT := 10; -- Default Perfect (New)
    v_total_score INT := 0;
    
    -- Financial Calcs
    v_age INT;
    v_current_value NUMERIC;
    v_total_spent NUMERIC := 0;
    v_spend_ratio NUMERIC;
    v_limit_ratio NUMERIC := 0.51; -- Default "The 51% Rule"
    
    -- Text Generation
    new_admin_note TEXT;
    v_template_text TEXT;

    -- Existing Assessment
    v_existing_id UUID;
BEGIN
    -- 1. DETERMINE CONTEXT (Ticket vs Appliance)
    IF TG_TABLE_NAME = 'tickets' THEN
        v_app_id := NEW.appliance_id;
        -- Filter: Only run on paid/finalized tickets to save perf, OR if it's a generic update checking for re-calc
        IF NEW.status NOT IN ('finalizado', 'pagado') AND NEW.is_paid IS NOT TRUE THEN
            RETURN NEW; -- Skip if ticket is not closed
        END IF;
    ELSE
        v_app_id := NEW.id;
    END IF;

    -- 2. GET MASTER DATA
    SELECT brand, purchase_year, type, housing_type, floor_level
    INTO v_app_brand, v_app_year, v_app_type, v_housing_type, v_floor_level
    FROM client_appliances WHERE id = v_app_id;

    -- Check for existing PENDING assessment
    SELECT id INTO v_existing_id 
    FROM mortify_assessments 
    WHERE appliance_id = v_app_id 
    AND status = 'PENDING_JUDGE'
    LIMIT 1;

    -- 3. GET DEFAULTS & BRAND SCORE
    SELECT average_market_price, average_lifespan_years 
    INTO v_base_market_price, v_lifespan 
    FROM appliance_category_defaults WHERE category_name ILIKE v_app_type LIMIT 1;
    
    IF v_base_market_price IS NULL THEN v_base_market_price := 400; END IF;
    IF v_lifespan IS NULL THEN v_lifespan := 10; END IF;

    -- Get Brand Score (1-4)
    SELECT score_points INTO v_brand_score_db
    FROM mortify_brand_scores WHERE brand_name ILIKE v_app_brand LIMIT 1;
    
    IF v_brand_score_db IS NULL THEN v_brand_score_db := 2; END IF; -- Default to Standard (2)

    -- 4. PRESTIGE MULTIPLIER (V13 Scale)
    IF v_brand_score_db <= 1 THEN v_prestige_multiplier := 1.0;
    ELSIF v_brand_score_db = 2 THEN v_prestige_multiplier := 1.25;
    ELSIF v_brand_score_db = 3 THEN v_prestige_multiplier := 1.6;
    ELSIF v_brand_score_db >= 4 THEN v_prestige_multiplier := 2.2;
    ELSE v_prestige_multiplier := 1.0; 
    END IF;

    v_prestige_price := v_base_market_price * v_prestige_multiplier;
    v_score_brand := v_brand_score_db; 

    -- 5. AGE SCORE
    v_age := EXTRACT(YEAR FROM NOW()) - v_app_year;
    IF v_age < 0 OR v_age IS NULL THEN v_age := 0; END IF;

    IF v_age <= 2 THEN v_score_age_pts := 5;
    ELSIF v_age <= 4 THEN v_score_age_pts := 4;
    ELSIF v_age <= 6 THEN v_score_age_pts := 3;
    ELSIF v_age <= 8 THEN v_score_age_pts := 2;
    ELSIF v_age <= 10 THEN v_score_age_pts := 1;
    ELSE v_score_age_pts := 0; END IF;

    -- 6. INSTALLATION SCORE (Dynamic)
    -- Logic: Chalet/Ground Floor = 5. Upper floors = 3 (Assume elevator/stairs risk).
    IF (v_housing_type ILIKE '%chalet%' OR v_housing_type ILIKE '%casa%') THEN
        v_score_install := 5;
    ELSIF (v_floor_level <= 0 OR v_floor_level IS NULL) THEN
        v_score_install := 5;
    ELSE
        v_score_install := 3; -- Penalty for verticality
    END IF;

    -- 7. FINANCIAL AMNESTY (Bathtub Curve)
    IF v_age >= 3 AND v_age <= 7 THEN
        v_limit_ratio := 0.70;
    END IF;

    -- 8. FINANCIAL MATH
    IF v_age >= v_lifespan THEN
        v_current_value := 0;
    ELSE
        -- Linear depreciation
        v_current_value := v_prestige_price * (1.0 - (v_age::NUMERIC / v_lifespan::NUMERIC));
    END IF;

    -- Calc Total Spent
    SELECT COALESCE(SUM(final_price), 0) INTO v_total_spent
    FROM tickets
    WHERE appliance_id = v_app_id AND (status IN ('finalizado', 'pagado') OR is_paid = true);

    -- Cases
    IF v_age > (v_lifespan + 2) THEN
        v_score_fin := 0;
        v_template_text := 'Su ' || COALESCE(v_app_type, 'aparato') || ' ' || COALESCE(v_app_brand, '') || ' (' || v_age || ' años) ha superado la vida útil estimada. Desaconsejamos invertir.';
    ELSIF v_current_value <= 0 THEN
         v_score_fin := 0;
         v_template_text := 'Amortización completa. Su valor residual es nulo, cualquier gasto es pérdida.';
    ELSE
        v_spend_ratio := v_total_spent / NULLIF(v_current_value, 1);
        
        IF v_spend_ratio > v_limit_ratio THEN
            -- RUIN
            v_score_fin := 0;
            v_template_text := 'Riesgo Financiero: El gasto acumulado (' || ROUND(v_total_spent, 2) || '€) supera el límite de seguridad del ' || (v_limit_ratio * 100) || '% del valor.';
        ELSE
            -- VIABLE
            -- 0 spent = 1.0 margin = 10 pts.
            -- Limit spent = 0.0 margin = 0 pts -> Clamped to 1.
            v_score_fin := ROUND(10 * (1.0 - (v_spend_ratio / v_limit_ratio)));
            if v_score_fin < 1 THEN v_score_fin := 1; END IF;
            
            -- Text
            if v_total_spent = 0 THEN
                 v_template_text := 'Estado impecable. Sin gastos previos, conserva todo su potencial de inversión.';
            ELSIF v_score_fin >= 7 THEN
                 v_template_text := 'Salud financiera robusta. Inversión muy recomendable preserbando el valor del equipo.';
            ELSE
                 v_template_text := 'Operación viable dentro de márgenes aceptables.';
            END IF;
        END IF;
    END IF;

    -- 9. TOTAL & VETO
    v_total_score := v_score_brand + v_score_age_pts + v_score_install + v_score_fin;
    
    IF v_score_fin = 0 THEN
        v_total_score := 0; -- Veto
    END IF;

    -- 10. UPSERT
    IF v_existing_id IS NOT NULL THEN
        UPDATE mortify_assessments SET
            input_year = v_app_year,
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
        WHERE id = v_existing_id;
    ELSE
        INSERT INTO mortify_assessments (
            appliance_id,
            input_year,
            score_brand,
            score_age,
            score_installation,
            score_financial,
            total_score,
            status,
            admin_note,
            ia_suggestion,
            created_at
        ) VALUES (
            v_app_id,
            v_app_year,
            v_score_brand,
            v_score_age_pts,
            v_score_install,
            v_score_fin,
            v_total_score,
            'PENDING_JUDGE',
            v_template_text,
            CASE 
                WHEN v_score_fin = 0 THEN 'OBSOLETE'
                WHEN v_total_score >= 18 THEN 'VIABLE'
                ELSE 'DOUBTFUL'
            END,
            NOW()
        );
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- === C. APPLY TRIGGERS ===

-- 1. On Tickets (Update - e.g. Payment/Close)
DROP TRIGGER IF EXISTS trg_mortify_v13_tickets ON tickets;
CREATE TRIGGER trg_mortify_v13_tickets
    AFTER UPDATE ON tickets
    FOR EACH ROW
    EXECUTE FUNCTION trigger_mortify_v13_god_tier();

-- 2. On Client Appliances (Insert/Update - Initial Valuation)
DROP TRIGGER IF EXISTS trg_mortify_v13_appliances ON client_appliances;
CREATE TRIGGER trg_mortify_v13_appliances
    AFTER INSERT OR UPDATE ON client_appliances
    FOR EACH ROW
    EXECUTE FUNCTION trigger_mortify_v13_god_tier();
