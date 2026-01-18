-- EMERGENCY FIX: RESTORE VISIBILITY
-- Disables Row Level Security (RLS) to guarantee appliances are visible.
-- Use this if appliances have "disappeared" from the frontend.

-- 1. Disable RLS on Appliances
ALTER TABLE client_appliances DISABLE ROW LEVEL SECURITY;

-- 2. Disable RLS on Assessments
ALTER TABLE mortify_assessments DISABLE ROW LEVEL SECURITY;

-- 3. (Optional) Explicitly grant access just in case
GRANT ALL ON client_appliances TO authenticated;
GRANT ALL ON client_appliances TO service_role;
GRANT ALL ON mortify_assessments TO authenticated;
GRANT ALL ON mortify_assessments TO service_role;
