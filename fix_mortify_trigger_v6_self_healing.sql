-- FIX V6: Self-Healing Trigger (Fallbacks to Appliance Data)
-- Solves the "Zero Score" loop by looking up the original appliance data if the previous assessment was empty.

CREATE OR REPLACE FUNCTION trigger_auto_mortify_on_close()
RETURNS TRIGGER AS $$
DECLARE
    -- Assessment Data
    v_input_year INT;
    v_input_floor INT;
    v_score_brand INT;
    v_score_age INT;
    v_score_installation INT;
    v_score_financial INT;
    v_total_score INT;
    
    -- Fallback Data
    v_app_year INT;
    
    new_admin_note TEXT := 'Gasto acumulado incrementado. Financiación recalculada.';
BEGIN
    -- Only trigger when status changes to 'finalizado' or 'pagado'
    -- OR when is_paid becomes true
    IF (NEW.status IN ('finalizado', 'pagado') OR NEW.is_paid = true) AND 
       (OLD.status NOT IN ('finalizado', 'pagado') AND OLD.is_paid = false) THEN
        
        -- 1. Fetch Appliance Data (Fallback)
        SELECT purchase_year INTO v_app_year
        FROM client_appliances
        WHERE id = NEW.appliance_id;

        -- 2. Fetch Latest Assessment
        SELECT 
            input_year, 
            input_floor_level, 
            score_brand, 
            score_age, 
            score_installation, 
            score_financial, 
            total_score
        INTO 
            v_input_year, 
            v_input_floor, 
            v_score_brand, 
            v_score_age, 
            v_score_installation, 
            v_score_financial, 
            v_total_score
        FROM mortify_assessments
        WHERE appliance_id = NEW.appliance_id
        ORDER BY created_at DESC
        LIMIT 1;

        -- 3. LOGIC: Create New Assessment if previous exists OR if we want to auto-create (Optional, let's stick to update behavior for now)
        -- We proceed if we found a previous record (even if it was bad) to "heal" it
        IF FOUND THEN
            
            -- HEALING: If copied values are 0 or NULL, try to recover defaults
            -- Brand: If 0, set to 1 (Generic)
            IF v_score_brand IS NULL OR v_score_brand = 0 THEN v_score_brand := 1; END IF;
            
            -- Year: Use stored input OR appliance year
            IF v_input_year IS NULL OR v_input_year = 0 THEN 
                IF v_app_year IS NOT NULL THEN v_input_year := v_app_year; END IF;
            END IF;

            -- Age Score: Rough calc if missing (Current Year - Input Year)
            IF (v_score_age IS NULL OR v_score_age = 0) AND v_input_year IS NOT NULL THEN
                -- Simple heuristic: If < 6 years old, score 1. Else 0.
                IF (EXTRACT(YEAR FROM NOW()) - v_input_year) < 6 THEN v_score_age := 1; ELSE v_score_age := 0; END IF;
            END IF;
            
            -- Recalculate Total (Just to be safe)
            v_total_score := COALESCE(v_score_brand,0) + COALESCE(v_score_age,0) + COALESCE(v_score_installation,0) + COALESCE(v_score_financial,0);

            INSERT INTO mortify_assessments (
                appliance_id,
                input_year,
                input_floor_level,
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
                NEW.appliance_id,
                v_input_year,
                v_input_floor,
                v_score_brand,
                v_score_age,
                v_score_installation,
                v_score_financial, -- Keeps previous financial score until Admin recalculates, or could reset to 0? Keeping it safer.
                v_total_score,
                'PENDING_JUDGE', 
                new_admin_note,
                'Re-evaluación (Datos Recuperados)',
                NOW()
            );
        END IF;

    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
