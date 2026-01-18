-- RPC: Clear Mortify History (Testing Tool) - FORCE VERSION
-- Deletes EVERYTHING that is not currently pending judgment.
-- Returns the number of deleted rows for confirmation.

CREATE OR REPLACE FUNCTION fn_clear_mortify_history()
RETURNS INTEGER AS $$
DECLARE
    v_count INTEGER;
BEGIN
    WITH deleted_rows AS (
        DELETE FROM mortify_assessments 
        WHERE status != 'PENDING_JUDGE'
        RETURNING *
    )
    SELECT count(*) INTO v_count FROM deleted_rows;

    RETURN v_count;
END;
$$ LANGUAGE plpgsql;
