-- FIX V13: "GOD TIER" PRESTIGE ALGORITHM
-- 1. Brand Prestige Multipliers (x1.0 to x2.2)
-- 2. Age Amnesty (70% limit for years 3-7)
-- 3. Consolidated Upsert Logic

CREATE OR REPLACE FUNCTION trigger_auto_mortify_on_close()
RETURNS TRIGGER AS $$
DECLARE
    -- Appliance Data
    v_app_id UUID;
    v_app_brand TEXT;
    v_app_year INT;
    v_app_type TEXT;
    
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
    v_score_install INT := 5; 
    v_score_fin INT := 0;
    v_total_score INT := 0;
    
    -- Financial Calcs
    v_age INT;
    v_current_value NUMERIC;
    v_total_spent NUMERIC;
    v_spend_ratio NUMERIC;
    v_limit_ratio NUMERIC := 0.51; -- Default "The 51% Rule"
    
    -- Text Generation
    new_admin_note TEXT;
    v_template_text TEXT;

    -- Existing Assessment
    v_existing_id UUID;
BEGIN
    -- 1. STRICT CONDITION CHECK (Piggy Bank History Check)
    IF (NEW.status IN ('finalizado', 'pagado') OR NEW.is_paid = true) AND
       EXISTS (SELECT 1 FROM mortify_assessments WHERE appliance_id = NEW.appliance_id LIMIT 1) THEN
        
        v_app_id := NEW.appliance_id;

        -- Check for existing PENDING assessment
        SELECT id INTO v_existing_id 
        FROM mortify_assessments 
        WHERE appliance_id = v_app_id 
        AND status = 'PENDING_JUDGE'
        LIMIT 1;

        -- 2. GET MASTER DATA
        SELECT brand, purchase_year, type 
        INTO v_app_brand, v_app_year, v_app_type
        FROM client_appliances WHERE id = v_app_id;

        -- 3. GET DEFAULTS & BRAND SCORE
        SELECT average_market_price, average_lifespan_years 
        INTO v_base_market_price, v_lifespan 
        FROM appliance_category_defaults WHERE category_name ILIKE v_app_type LIMIT 1;
        
        IF v_base_market_price IS NULL THEN v_base_market_price := 400; END IF;
        IF v_lifespan IS NULL THEN v_lifespan := 10; END IF;

        -- Get Brand Score (1-4)
        SELECT score_points INTO v_brand_score_db
        FROM mortify_brand_scores WHERE brand_name ILIKE v_app_brand LIMIT 1;
        
        IF v_brand_score_db IS NULL THEN v_brand_score_db := 2; END IF; -- Default to Standard (2) if unknown

        -- 4. APPLY PRESTIGE MULTIPLIER (V13 Positive Scale)
        -- Level 1 (Basic/White): x1.0
        -- Level 2 (Standard):    x1.25
        -- Level 3 (High):        x1.6
        -- Level 4 (Premium):     x2.2
        IF v_brand_score_db <= 1 THEN v_prestige_multiplier := 1.0;
        ELSIF v_brand_score_db = 2 THEN v_prestige_multiplier := 1.25;
        ELSIF v_brand_score_db = 3 THEN v_prestige_multiplier := 1.6;
        ELSIF v_brand_score_db >= 4 THEN v_prestige_multiplier := 2.2;
        ELSE v_prestige_multiplier := 1.0; 
        END IF;

        v_prestige_price := v_base_market_price * v_prestige_multiplier;
        v_score_brand := v_brand_score_db; -- Keep the raw score for the UI badge

        -- 5. CALCULATE AGE SCORE
        v_age := EXTRACT(YEAR FROM NOW()) - v_app_year;
        IF v_age < 0 THEN v_age := 0; END IF;

        IF v_age <= 2 THEN v_score_age_pts := 5;
        ELSIF v_age <= 4 THEN v_score_age_pts := 4;
        ELSIF v_age <= 6 THEN v_score_age_pts := 3;
        ELSIF v_age <= 8 THEN v_score_age_pts := 2;
        ELSIF v_age <= 10 THEN v_score_age_pts := 1;
        ELSE v_score_age_pts := 0; END IF;

        -- 6. FINANCIAL AMNESTY (The Bathtub Curve)
        -- If age is prime (3-7 years), be more lenient (70% limit instead of 51%)
        IF v_age >= 3 AND v_age <= 7 THEN
            v_limit_ratio := 0.70;
        END IF;

        -- 7. FINANCIAL MATH
        IF v_age >= v_lifespan THEN
            v_current_value := 0;
        ELSE
            -- Linear depreciation based on PRESTIGE PRICE
            v_current_value := v_prestige_price * (1.0 - (v_age::NUMERIC / v_lifespan::NUMERIC));
        END IF;

        SELECT COALESCE(SUM(final_price), 0) INTO v_total_spent
        FROM tickets
        WHERE appliance_id = v_app_id AND (status IN ('finalizado', 'pagado') OR is_paid = true);

        -- Cases
        IF v_age > (v_lifespan + 2) THEN
            v_score_fin := 0;
            v_template_text := 'Su ' || COALESCE(v_app_type, 'aparato') || ' ' || COALESCE(v_app_brand, '') || ' de gama ' || v_prestige_multiplier || 'x tiene ' || v_age || ' años, superando la vida útil estimada. Pese a su calidad, la obsolescencia técnica desaconseja más inversiones.';
        ELSIF v_current_value <= 0 THEN
             v_score_fin := 0;
             v_template_text := 'Su ' || COALESCE(v_app_type, 'aparato') || ' está contablemente amortizado según tablas de industria. Cualquier gasto adicional supera su valor residual.';
        ELSE
            v_spend_ratio := v_total_spent / NULLIF(v_current_value, 1);
            
            IF v_spend_ratio > v_limit_ratio THEN
                -- RUIN CASE
                v_score_fin := 0;
                v_template_text := 'El gasto acumulado (' || ROUND(v_total_spent, 2) || '€) supera el límite de seguridad del ' || (v_limit_ratio * 100) || '% de su valor actual (' || ROUND(v_current_value, 2) || '€). Incluso considerando el prestigio de la marca, la operación es financieramente arriesgada.';
            ELSE
                -- VIABLE CASE
                -- Map remaining margin to 0-10 score
                -- If spend ratio is 0 (new), score 10.
                -- If spend ratio is at limit, score 1.
                -- If spend ratio > limit, score 0 (handled above).
                
                v_score_fin := ROUND(10 * (1.0 - (v_spend_ratio / v_limit_ratio)));
                if v_score_fin < 1 THEN v_score_fin := 1; END IF; -- Give at least 1 point if under limit

                IF v_limit_ratio = 0.70 AND v_spend_ratio > 0.51 THEN
                     v_template_text := 'Atención: El gasto es alto, pero activamos el "Protocolo de Calidad" por ser una máquina en su edad de oro (' || v_age || ' años) y marca premium. Merece la pena salvarla.';
                ELSIF v_score_fin >= 7 THEN
                     v_template_text := 'Excelente salud financiera. Su ' || COALESCE(v_app_brand, '') || ' conserva un alto valor (' || ROUND(v_current_value, 2) || '€) y la reparación es una inversión muy rentable.';
                ELSE
                     v_template_text := 'Operación viable. El equipo mantiene valor suficiente para justificar esta intervención técnica.';
                END IF;
            END IF;
        END IF;

        -- 8. TOTAL CALC & VETO
        v_total_score := v_score_brand + v_score_age_pts + v_score_install + v_score_fin;
        
        IF v_score_fin = 0 THEN
            v_total_score := 0; -- Force Ruin
        END IF;

        new_admin_note := v_template_text;

        -- 9. UPSERT (Update existing PENDING or Insert NEW)
        IF v_existing_id IS NOT NULL THEN
            UPDATE mortify_assessments SET
                input_year = v_app_year,
                score_brand = v_score_brand,
                score_age = v_score_age_pts,
                score_installation = v_score_install,
                score_financial = v_score_fin,
                total_score = v_total_score,
                admin_note = new_admin_note,
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
                new_admin_note,
                CASE 
                    WHEN v_score_fin = 0 THEN 'OBSOLETE'
                    WHEN v_total_score >= 18 THEN 'VIABLE'
                    ELSE 'DOUBTFUL'
                END,
                NOW()
            );
        END IF;

    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- REFRESH TRIGGER
DROP TRIGGER IF EXISTS auto_mortify_on_close ON tickets;
CREATE TRIGGER auto_mortify_on_close
    AFTER UPDATE ON tickets
    FOR EACH ROW
    EXECUTE FUNCTION trigger_auto_mortify_on_close();
