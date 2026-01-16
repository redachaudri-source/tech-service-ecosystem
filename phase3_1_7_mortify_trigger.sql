-- Trigger Function: Auto-Mortify on Ticket Close
CREATE OR REPLACE FUNCTION trigger_auto_mortify_on_close()
RETURNS TRIGGER AS $$
DECLARE
    existing_assessment RECORD;
    v_client_id UUID;
    new_admin_note TEXT := 'Actualización automática tras reparación. Gasto acumulado incrementado.';
BEGIN
    -- Only trigger when status changes to 'finalizado' or 'pagado'
    -- AND the previous status was NOT 'finalizado' or 'pagado'
    IF (NEW.status IN ('finalizado', 'pagado')) AND (OLD.status NOT IN ('finalizado', 'pagado')) THEN
        
        -- Check if there is ANY existing Mortify assessment for this appliance
        SELECT * INTO existing_assessment
        FROM mortify_assessments
        WHERE appliance_id = NEW.appliance_id
        ORDER BY created_at DESC
        LIMIT 1;

        -- If an assessment exists, we create a NEW one (Re-evaluation)
        IF FOUND THEN
            -- Get client_id safely from the appliance just in case tickets doesn't have it or it's named differently
            SELECT client_id INTO v_client_id FROM client_appliances WHERE id = NEW.appliance_id;

            INSERT INTO mortify_assessments (
                appliance_id,
                client_id,
                total_score,
                status,
                is_premium_check,
                admin_note,
                ia_suggestion,
                created_at
            ) VALUES (
                NEW.appliance_id,
                v_client_id, -- Use fetched client_id
                existing_assessment.total_score, 
                'PENDING_JUDGE', 
                FALSE, 
                new_admin_note,
                'Re-evaluación automática solicitada por cierre de reparación.',
                NOW()
            );
        END IF;

    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if exists (using correct table name 'tickets')
DROP TRIGGER IF EXISTS on_ticket_close_mortify ON tickets;

-- Create Trigger on 'tickets'
CREATE TRIGGER on_ticket_close_mortify
AFTER UPDATE ON tickets
FOR EACH ROW
EXECUTE FUNCTION trigger_auto_mortify_on_close();
