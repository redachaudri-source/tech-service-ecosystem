-- MANUAL CLEANUP SCRIPT (TESTING ONLY)
-- Copy and paste this into your Supabase SQL Editor to reset the system.
-- WARNING: This deletes ALL assessments and ALL tickets.

DELETE FROM mortify_assessments WHERE id IS NOT NULL;
DELETE FROM tickets WHERE id IS NOT NULL;

-- Optional: Reset function (removes it to keep schema clean)
DROP FUNCTION IF EXISTS fn_clear_mortify_history();
