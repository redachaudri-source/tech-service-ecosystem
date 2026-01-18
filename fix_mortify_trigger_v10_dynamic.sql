-- FIX V10: DYNAMIC MORTIFY ALGORITHM + STRICT CONDITION
-- Objective: 
-- 1. Apply the new "Dynamic Scoring" (Time vs Money, 0-10 Scale).
-- 2. RESTORE strict condition: Only run if the appliance has PRIOR Mortify history (Client App flow).

CREATE OR REPLACE FUNCTION trigger_auto_mortify_on_close()
RETURNS TRIGGER AS $$
DECLARE
    -- Appliance Data
    v_app_id UUID;
    v_app_year INT;
    v_app_type TEXT;
    
    -- Config Data
    v_market_price NUMERIC := 700; -- Default fallback
    v_lifespan INT := 10;
    
    -- Calculations
    v_age INT;
    v_current_value NUMERIC;
    v_total_spent NUMERIC;
    v_spend_ratio NUMERIC;
    v_final_score INT;
    
    new_admin_note TEXT;
BEGIN
    -- 1. STRICT CONDITION CHECK
    -- Must be Finalized/Paid AND have an existing Mortify Assessment (The "Piggy Bank" check)
    IF (NEW.status IN ('finalizado', 'pagado') OR NEW.is_paid = true) AND
       EXISTS (SELECT 1 FROM mortify_assessments WHERE appliance_id = NEW.appliance_id LIMIT 1) THEN
        
        v_app_id := NEW.appliance_id;

        -- 2. GET MASTER DATA
        SELECT purchase_year, type INTO v_app_year, v_app_type
        FROM client_appliances WHERE id = v_app_id;

        -- 3. GET CONFIG DEFAULTS
        SELECT average_market_price, average_lifespan_years INTO v_market_price, v_lifespan
        FROM appliance_category_defaults WHERE category_name ILIKE v_app_type LIMIT 1;
        
        -- Fallbacks
        IF v_market_price IS NULL THEN v_market_price := 400; END IF;
        IF v_lifespan IS NULL THEN v_lifespan := 10; END IF;

        -- 4. CALCULATE AGE
        v_age := EXTRACT(YEAR FROM NOW()) - v_app_year;
        IF v_age < 0 THEN v_age := 0; END IF;

        -- 5. CALCULATE CURRENT VALUE (Linear Depreciation)
        -- Value = Price * (1 - Age/Lifespan)
        -- If Age >= Lifespan, Value is technically 0 for calculation purposes (or strictly obsolete)
        IF v_age >= v_lifespan THEN
            v_current_value := 0;
        ELSE
            v_current_value := v_market_price * (1.0 - (v_age::NUMERIC / v_lifespan::NUMERIC));
        END IF;

        -- 6. GET TOTAL SPENT (Sum of all finalized tickets for this appliance)
        SELECT COALESCE(SUM(final_price), 0) INTO v_total_spent
        FROM tickets
        WHERE appliance_id = v_app_id
        AND (status IN ('finalizado', 'pagado') OR is_paid = true);

        -- 7. THE "DEATH" RULES (0 Points)
        IF v_age > (v_lifespan + 2) THEN
            -- Rule: Too old
            v_final_score := 0;
            new_admin_note := 'OBSOLETO: Aparato con ' || v_age || ' años. Supera vida útil (' || v_lifespan || ').';
        
        ELSIF v_current_value <= 0 THEN
             -- Rule: Mathematical Value is 0
             v_final_score := 0;
             new_admin_note := 'VALOR CERO: Amortización completa. No invertir más.';

        ELSE
            -- Rule: Financial Ruin (>51% of Current Value)
            v_spend_ratio := v_total_spent / v_current_value;
            
            IF v_spend_ratio > 0.51 THEN
                v_final_score := 0;
                new_admin_note := 'RUINA FINANCIERA: Gasto (' || ROUND(v_total_spent, 2) || '€) supera el 51% del Valor Actual (' || ROUND(v_current_value, 2) || '€).';
            ELSE
                -- 8. DYNAMIC SCORING (10 Pts scale based on Ratio)
                -- Score = 10 * (1 - Ratio)
                -- Example: Ratio 0.1 (10% spent) -> Score 9
                -- Example: Ratio 0.5 (50% spent) -> Score 5
                v_final_score := ROUND(10 * (1.0 - v_spend_ratio));
                new_admin_note := 'VIABLE: Gasto ' || ROUND(v_spend_ratio * 100, 1) || '% del Valor. (' || ROUND(v_total_spent, 2) || '€ / ' || ROUND(v_current_value, 2) || '€)';
            END IF;
        END IF;

        -- 9. RECORD ASSESSMENT
        INSERT INTO mortify_assessments (
            appliance_id,
            input_year,
            score_financial, -- We map final score here or to total? Mapping to total largely. Use Fin as 1/0 indicator maybe? Let's give full score to total.
            total_score,
            status,
            admin_note,
            ia_suggestion,
            created_at
        ) VALUES (
            v_app_id,
            v_app_year,
            CASE WHEN v_final_score > 0 THEN 1 ELSE 0 END, -- Simple indicator for internal logic if needed
            v_final_score, -- The REAL 0-10 Score
            'PENDING_JUDGE',
            new_admin_note,
            'Algoritmo V10 (Dinámico)',
            NOW()
        );

    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- REFRESH TRIGGER (No change needed to CREATE TRIGGER cmd if name is same, function update is enough, but safest to ensure)
DROP TRIGGER IF EXISTS auto_mortify_on_close ON tickets;
CREATE TRIGGER auto_mortify_on_close
    AFTER UPDATE ON tickets
    FOR EACH ROW
    EXECUTE FUNCTION trigger_auto_mortify_on_close();
