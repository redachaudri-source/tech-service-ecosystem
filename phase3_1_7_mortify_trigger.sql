-- Trigger Function: Auto-Mortify on Ticket Close
CREATE OR REPLACE FUNCTION trigger_auto_mortify_on_close()
RETURNS TRIGGER AS $$
DECLARE
    existing_assessment RECORD;
    new_admin_note TEXT := 'Actualización automática tras reparación. Gasto acumulado incrementado.';
BEGIN
    -- Only trigger when status changes to 'finalizado' or 'pagado'
    -- AND the previous status was NOT 'finalizado' or 'pagado' (to avoid double triggers)
    IF (NEW.status IN ('finalizado', 'pagado')) AND (OLD.status NOT IN ('finalizado', 'pagado')) THEN
        
        -- Check if there is ANY existing Mortify assessment for this appliance
        -- We get the latest one to see if we should re-evaluate
        SELECT * INTO existing_assessment
        FROM mortify_assessments
        WHERE appliance_id = NEW.appliance_id
        ORDER BY created_at DESC
        LIMIT 1;

        -- If an assessment exists, we create a NEW one (Re-evaluation)
        IF FOUND THEN
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
                NEW.client_id,
                -- We default to 0 or keeping the old score, but mark as PENDING_JUDGE so Admin sets the real new score.
                -- Let's set it to the old score - 1 (simple penalty logic placeholder) or just 0 so it looks visually "needs review".
                -- Decision: Set to existing_assessment.total_score but ensure it's re-reviewed.
                -- Actually, setting to 0 might scare the client if they see it before admin.
                -- Setting to existing score.
                existing_assessment.total_score, 
                'PENDING_JUDGE', -- CRITICAL: Admin must approve
                FALSE, -- It's a system update, not a premium purchase
                new_admin_note,
                'Re-evaluación automática solicitada por cierre de reparación.',
                NOW()
            );
        END IF;

    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if exists to avoid duplication
DROP TRIGGER IF EXISTS on_ticket_close_mortify ON service_tickets;

-- Create Trigger
CREATE TRIGGER on_ticket_close_mortify
AFTER UPDATE ON service_tickets
FOR EACH ROW
EXECUTE FUNCTION trigger_auto_mortify_on_close();
