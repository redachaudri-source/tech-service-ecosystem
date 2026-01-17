-- FIX V5: Robust Trigger with Explicit Variable Selection
-- Replaces previous versions to ensure data is copied correctly.

CREATE OR REPLACE FUNCTION trigger_auto_mortify_on_close()
RETURNS TRIGGER AS $$
DECLARE
    -- Explicit variables for clarity and safety
    v_input_year INT;
    v_input_floor INT;
    v_score_brand INT;
    v_score_age INT;
    v_score_installation INT;
    v_score_financial INT;
    v_total_score INT;
    
    new_admin_note TEXT := 'Gasto acumulado incrementado. Financiación recalculada.';
BEGIN
    -- Only trigger when status changes to 'finalizado' or 'pagado'
    -- OR when is_paid becomes true
    IF (NEW.status IN ('finalizado', 'pagado') OR NEW.is_paid = true) AND 
       (OLD.status NOT IN ('finalizado', 'pagado') AND OLD.is_paid = false) THEN
        
        -- 1. Explicitly fetch the LATEST assessment data for this appliance
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

        -- 2. If valid data found (check if score_brand is not null to ensure it's a real record)
        IF v_score_brand IS NOT NULL THEN
            
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
                v_input_year,        -- Copied
                v_input_floor,       -- Copied
                v_score_brand,       -- Copied
                v_score_age,         -- Copied
                v_score_installation,-- Copied
                v_score_financial,   -- Copied (Admin Panel will update this specific one)
                v_total_score,       -- Copied
                'PENDING_JUDGE', 
                new_admin_note,
                'Re-evaluación (Datos Copiados)',
                NOW()
            );
        END IF;

    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
