-- RPC: Clear Mortify History & Financials (Testing Tool) - NUCLEAR VERSION
-- Deletes ALL assessments AND ALL tickets to simulate "Brand New" state.
-- WARNING: This deletes financial history (tickets) which drives the Mortify score.

DROP FUNCTION IF EXISTS fn_clear_mortify_history();

CREATE OR REPLACE FUNCTION fn_clear_mortify_history()
RETURNS INTEGER AS $$
DECLARE
    v_total INTEGER := 0;
    v_rows INTEGER;
BEGIN
    -- 1. Delete ALL Assessments
    DELETE FROM mortify_assessments;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_total := v_total + v_rows;

    -- 2. Delete ALL Tickets (Reset Financial History)
    -- Using CASCADE logic implicitly if FKs exist, otherwise straightforward delete
    DELETE FROM tickets;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_total := v_total + v_rows;

    RETURN v_total;
END;
$$ LANGUAGE plpgsql;
