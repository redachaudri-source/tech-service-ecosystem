-- FIX V4: Copy ALL input fields and component scores to prevent "Reset" to 0
CREATE OR REPLACE FUNCTION trigger_auto_mortify_on_close()
RETURNS TRIGGER AS $$
DECLARE
    existing_assessment RECORD;
    new_admin_note TEXT := 'Gasto acumulado incrementado. Revisar viabilidad financiera.';
BEGIN
    -- Only trigger when status changes to 'finalizado' or 'pagado'
    -- AND the previous status was NOT 'finalizado' or 'pagado'
    IF (NEW.status IN ('finalizado', 'pagado') OR NEW.is_paid = true) AND (OLD.status NOT IN ('finalizado', 'pagado') AND OLD.is_paid = false) THEN
        
        -- Check if there is ANY existing Mortify assessment for this appliance
        SELECT * INTO existing_assessment
        FROM mortify_assessments
        WHERE appliance_id = NEW.appliance_id
        ORDER BY created_at DESC
        LIMIT 1;

        -- If an assessment exists, we create a NEW one (Re-evaluation)
        IF FOUND THEN
            INSERT INTO mortify_assessments (
                appliance_id,
                -- Copy Inputs
                input_year,
                input_floor_level,
                -- Copy Component Scores (So they don't reset to 0)
                score_brand,
                score_age,
                score_installation,
                score_financial, -- Copy old one initially; Admin Panel will recalculate if needed
                total_score,
                -- Meta
                status,
                admin_note,
                ia_suggestion,
                created_at
            ) VALUES (
                NEW.appliance_id,
                -- Inputs
                existing_assessment.input_year,
                existing_assessment.input_floor_level,
                -- Scores
                existing_assessment.score_brand,
                existing_assessment.score_age,
                existing_assessment.score_installation,
                existing_assessment.score_financial,
                existing_assessment.total_score,
                -- Meta
                'PENDING_JUDGE', 
                new_admin_note,
                'Re-evaluación (Reparado)',
                NOW()
            );
        END IF;

    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
