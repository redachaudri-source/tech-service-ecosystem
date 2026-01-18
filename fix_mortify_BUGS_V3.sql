-- FIX MORTIFY V2 BUGS (V3)
-- 1. Fix Incorrect Initial Score: Force Auto-Calculation on Creation.
-- 2. Fix Disappearing Appliance: Ensure RLS policies allow viewing.

-- PART 1: AUTO-CALCULATE SCORE ON INSERT
-- When an assessment is created (via Wizard/Piggy Bank), immediately run the SQL calculation logic
-- to ensure the score matches the backend truth (Financial + History), overriding any Client JS estimates.

CREATE OR REPLACE FUNCTION trigger_mortify_insert_recalc()
RETURNS TRIGGER AS $$
BEGIN
    -- Force recalculate immediately after insertion
    PERFORM fn_calculate_mortify_score(NEW.appliance_id);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_mortify_insert_recalc ON mortify_assessments;

CREATE TRIGGER trg_mortify_insert_recalc
AFTER INSERT ON mortify_assessments
FOR EACH ROW
EXECUTE FUNCTION trigger_mortify_insert_recalc();


-- PART 2: SAFETY VISIBILITY (RLS)
-- Ensure appliances never disappear from the client view, even if status changes.
-- Note: Requires `ALTER TABLE client_appliances ENABLE ROW LEVEL SECURITY;` to be active.

-- Drop existing if conflict (generic name assumption, safe to ignore error if not exists)
DROP POLICY IF EXISTS "Users can view own appliances" ON client_appliances;

CREATE POLICY "Users can view own appliances"
ON client_appliances
FOR SELECT
USING (auth.uid() = client_id);

-- Also ensure Mortify Assessments are visible (for the V-Label)
DROP POLICY IF EXISTS "Users can view own assessments" ON mortify_assessments;

-- Since mortify_assessments links to appliance, we need a join or simpler check. 
-- For simplicity/safety, we assume if you can see the appliance, you can see the assessment.
-- (Performance note: This subquery is standard for Supabase RLS).
CREATE POLICY "Users can view own assessments"
ON mortify_assessments
FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM client_appliances
        WHERE client_appliances.id = mortify_assessments.appliance_id
        AND client_appliances.client_id = auth.uid()
    )
);
