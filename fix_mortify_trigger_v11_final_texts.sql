-- FIX V11: FINAL MORTIFY ALGO (DYNAMIC + VETO + CLIENT TEXTS)
-- Objective:
-- 1. Full 24-point scale (Brand 4 + Age 5 + Install 5 + Financial 10).
-- 2. Financial Veto: If Financial is 0 (Ruin), Total becomes 0.
-- 3. Dynamic Client Explanations (Templates) in admin_note.

CREATE OR REPLACE FUNCTION trigger_auto_mortify_on_close()
RETURNS TRIGGER AS $$
DECLARE
    -- Appliance Data
    v_app_id UUID;
    v_app_brand TEXT;
    v_app_year INT;
    v_app_type TEXT;
    
    -- Config Data
    v_market_price NUMERIC := 700; 
    v_lifespan INT := 10;
    
    -- Scoring Vars
    v_score_brand INT := 1;
    v_score_age_pts INT := 0;
    v_score_install INT := 5; -- Optimistic default
    v_score_fin INT := 0;
    v_total_score INT := 0;
    
    -- Financial Calcs
    v_age INT;
    v_current_value NUMERIC;
    v_total_spent NUMERIC;
    v_spend_ratio NUMERIC;
    
    -- Text Generation
    new_admin_note TEXT;
    v_template_text TEXT;
BEGIN
    -- 1. STRICT CONDITION CHECK (Piggy Bank History Check)
    IF (NEW.status IN ('finalizado', 'pagado') OR NEW.is_paid = true) AND
       EXISTS (SELECT 1 FROM mortify_assessments WHERE appliance_id = NEW.appliance_id LIMIT 1) THEN
        
        v_app_id := NEW.appliance_id;

        -- 2. GET MASTER DATA
        SELECT brand, purchase_year, type 
        INTO v_app_brand, v_app_year, v_app_type
        FROM client_appliances WHERE id = v_app_id;

        -- 3. GET DEFAULTS & BRAND SCORE
        -- A. Defaults
        SELECT average_market_price, average_lifespan_years 
        INTO v_market_price, v_lifespan 
        FROM appliance_category_defaults WHERE category_name ILIKE v_app_type LIMIT 1;
        
        IF v_market_price IS NULL THEN v_market_price := 400; END IF;
        IF v_lifespan IS NULL THEN v_lifespan := 10; END IF;

        -- B. Brand Score
        SELECT score_points INTO v_score_brand
        FROM mortify_brand_scores WHERE brand_name ILIKE v_app_brand LIMIT 1;
        IF v_score_brand IS NULL THEN v_score_brand := 1; END IF;

        -- 4. CALCULATE AGE & AGE SCORE (0-5)
        v_age := EXTRACT(YEAR FROM NOW()) - v_app_year;
        IF v_age < 0 THEN v_age := 0; END IF;

        IF v_age <= 2 THEN v_score_age_pts := 5;
        ELSIF v_age <= 4 THEN v_score_age_pts := 4;
        ELSIF v_age <= 6 THEN v_score_age_pts := 3;
        ELSIF v_age <= 8 THEN v_score_age_pts := 2;
        ELSIF v_age <= 10 THEN v_score_age_pts := 1;
        ELSE v_score_age_pts := 0; END IF;

        -- 5. FINANCIAL SCORE (0-10)
        -- Depreciation Logic
        IF v_age >= v_lifespan THEN
            v_current_value := 0;
        ELSE
            v_current_value := v_market_price * (1.0 - (v_age::NUMERIC / v_lifespan::NUMERIC));
        END IF;

        SELECT COALESCE(SUM(final_price), 0) INTO v_total_spent
        FROM tickets
        WHERE appliance_id = v_app_id AND (status IN ('finalizado', 'pagado') OR is_paid = true);

        -- Cases
        IF v_age > (v_lifespan + 2) THEN
            -- Case: OBSOLETE BY AGE
            v_score_fin := 0;
            -- Template 2
            v_template_text := 'Su ' || COALESCE(v_app_type, 'aparato') || ' ' || COALESCE(v_app_brand, '') || ' tiene ' || v_age || ' años, superando la vida útil estimada de la industria (' || v_lifespan || ' años). Debido a su antigüedad, no podemos garantizar la rentabilidad a largo plazo de nuevas inversiones.';
        
        ELSIF v_current_value <= 0 THEN
             -- Case: ZERO VALUE
             v_score_fin := 0;
             v_template_text := 'Su ' || COALESCE(v_app_type, 'aparato') || ' ' || COALESCE(v_app_brand, '') || ' está completamente amortizado. Cualquier inversión adicional supera su valor residual.';

        ELSE
            v_spend_ratio := v_total_spent / NULLIF(v_current_value, 1); -- Avoid div zero
            
            IF v_spend_ratio > 0.51 THEN
                -- Case: FINANCIAL RUIN
                v_score_fin := 0;
                -- Template 1
                v_template_text := 'Analizando su ' || COALESCE(v_app_type, 'aparato') || ' ' || COALESCE(v_app_brand, '') || ' de ' || v_age || ' años, hemos detectado que el gasto acumulado en reparaciones (' || ROUND(v_total_spent, 2) || '€) supera el 51% de su valor residual actual. Financieramente, consideramos que este aparato ha dejado de ser rentable.';
            ELSE
                -- Case: VIABLE or DOUBTFUL
                v_score_fin := ROUND(10 * (1.0 - v_spend_ratio));
                
                IF v_score_fin >= 7 THEN
                    -- Template 3: VIABLE
                     v_template_text := 'Su ' || COALESCE(v_app_type, 'aparato') || ' ' || COALESCE(v_app_brand, '') || ' conserva un buen valor de mercado a pesar de tener ' || v_age || ' años. La reparación actual representa una inversión inteligente frente a la compra de un equipo nuevo.';
                ELSE
                    -- Template 4: DOUBTFUL
                     v_template_text := 'Su ' || COALESCE(v_app_type, 'aparato') || ' ' || COALESCE(v_app_brand, '') || ' se encuentra en una etapa avanzada de su ciclo de vida. Aunque técnicamente es reparable, le recomendamos valorar si desea seguir invirtiendo en este equipo.';
                END IF;
            END IF;
        END IF;

        -- 6. TOTAL CALC & VETO
        v_total_score := v_score_brand + v_score_age_pts + v_score_install + v_score_fin;
        
        -- OPTION B: FINANCIAL VETO
        IF v_score_fin = 0 THEN
            v_total_score := 0; -- Force Ruin
        END IF;

        new_admin_note := v_template_text;

        -- 7. INSERT
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

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- REFRESH TRIGGER
DROP TRIGGER IF EXISTS auto_mortify_on_close ON tickets;
CREATE TRIGGER auto_mortify_on_close
    AFTER UPDATE ON tickets
    FOR EACH ROW
    EXECUTE FUNCTION trigger_auto_mortify_on_close();
