-- FIX: Expand column size and use shorter text in trigger
-- 1. Alter table to allow longer strings (Safety first)
ALTER TABLE public.mortify_assessments 
ALTER COLUMN ia_suggestion TYPE TEXT;

-- 2. Redefine Trigger Function with shorter text (Double safety)
CREATE OR REPLACE FUNCTION trigger_auto_mortify_on_close()
RETURNS TRIGGER AS $$
DECLARE
    existing_assessment RECORD;
    new_admin_note TEXT := 'Gasto acumulado incrementado.';
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
                total_score,
                status,
                admin_note,
                ia_suggestion,
                created_at
            ) VALUES (
                NEW.appliance_id,
                existing_assessment.total_score, 
                'PENDING_JUDGE', 
                new_admin_note,
                'Re-evaluación (Reparado)', -- Shortened string (<25 chars)
                NOW()
            );
        END IF;

    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
