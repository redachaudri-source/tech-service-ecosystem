-- FIX SCHEMA: Add missing 'updated_at' column
ALTER TABLE mortify_assessments
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- FIX TRIGGER: Reopen cases when tickets are closed
CREATE OR REPLACE FUNCTION trigger_reopen_mortify_on_ticket()
RETURNS TRIGGER AS $$
DECLARE
    v_assessment_id UUID;
BEGIN
    -- Check if this appliance has a Mortify Assessment
    SELECT id INTO v_assessment_id 
    FROM mortify_assessments 
    WHERE appliance_id = NEW.appliance_id 
    LIMIT 1;

    -- If no assessment exists, do nothing
    IF v_assessment_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- If the ticket is being closed (finalizado/pagado)
    IF (NEW.status IN ('finalizado', 'pagado')) AND (OLD.status NOT IN ('finalizado', 'pagado')) THEN
        
        -- 1. Force Recalculate Score (Update financial score)
        PERFORM fn_calculate_mortify_score(NEW.appliance_id);

        -- 2. RESET Status to 'PENDING_JUDGE' to alert Admin
        UPDATE mortify_assessments
        SET 
            status = 'PENDING_JUDGE',
            admin_note = 'Actualización automática tras cierre de expediente #' || substring(NEW.id::text, 1, 8),
            updated_at = NOW()
        WHERE id = v_assessment_id;

    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Bind Trigger
DROP TRIGGER IF EXISTS trg_mortify_reopen_on_ticket ON tickets;

CREATE TRIGGER trg_mortify_reopen_on_ticket
AFTER UPDATE ON tickets
FOR EACH ROW
EXECUTE FUNCTION trigger_reopen_mortify_on_ticket();
