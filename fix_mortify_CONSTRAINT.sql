-- FIX CONSTRAINT: ON CONFLICT requires a unique index/constraint
-- 1. Clean up duplicates (Keep the latest one)
DELETE FROM mortify_assessments a
USING mortify_assessments b
WHERE a.id < b.id 
AND a.appliance_id = b.appliance_id;

-- 2. Add Unique Constraint
ALTER TABLE mortify_assessments
ADD CONSTRAINT mortify_assessments_appliance_id_key UNIQUE (appliance_id);

-- 3. Ensure 'updated_at' exists (Previous step check)
ALTER TABLE mortify_assessments
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- 4. Re-apply the Trigger (Just to be safe/atomic)
CREATE OR REPLACE FUNCTION trigger_reopen_mortify_on_ticket()
RETURNS TRIGGER AS $$
DECLARE
    v_assessment_id UUID;
BEGIN
    SELECT id INTO v_assessment_id FROM mortify_assessments WHERE appliance_id = NEW.appliance_id LIMIT 1;
    IF v_assessment_id IS NULL THEN RETURN NEW; END IF;

    IF (NEW.status IN ('finalizado', 'pagado')) AND (OLD.status NOT IN ('finalizado', 'pagado')) THEN
        PERFORM fn_calculate_mortify_score(NEW.appliance_id);
        UPDATE mortify_assessments
        SET status = 'PENDING_JUDGE',
            admin_note = 'Actualización automática tras cierre de expediente #' || substring(NEW.id::text, 1, 8),
            updated_at = NOW()
        WHERE id = v_assessment_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
