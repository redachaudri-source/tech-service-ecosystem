-- RPC: Clear Mortify History (Testing Tool)
-- Deletes all assessments that have been judged, effectively resetting them.
-- They will reappear as 'PENDING_JUDGE' only if a trigger fires or manual recalc is requested.

CREATE OR REPLACE FUNCTION fn_clear_mortify_history()
RETURNS VOID AS $$
BEGIN
    DELETE FROM mortify_assessments 
    WHERE status IN ('JUDGED', 'ARCHIVED', 'CONFIRMED_VIABLE', 'OBSOLETE');
END;
$$ LANGUAGE plpgsql;
