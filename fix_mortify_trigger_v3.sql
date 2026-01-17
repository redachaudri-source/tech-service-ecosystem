-- FIX: Redefine Trigger Function to match ACTUAL Schema (No client_id, No is_premium_check)
CREATE OR REPLACE FUNCTION trigger_auto_mortify_on_close()
RETURNS TRIGGER AS $$
DECLARE
    existing_assessment RECORD;
    new_admin_note TEXT := 'Actualización automática tras reparación. Gasto acumulado incrementado.';
BEGIN
    -- Only trigger when status changes to 'finalizado' or 'pagado'
    -- AND the previous status was NOT 'finalizado' or 'pagado'
    -- Also checking 'finalizado' string just in case
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
                -- client_id removed (not in schema)
                total_score,
                status,
                -- is_premium_check removed (not in schema)
                admin_note,
                ia_suggestion,
                created_at
            ) VALUES (
                NEW.appliance_id,
                existing_assessment.total_score, 
                'PENDING_JUDGE', 
                new_admin_note,
                'Re-evaluación automática solicitada por cierre de reparación.',
                NOW()
            );
        END IF;

    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
