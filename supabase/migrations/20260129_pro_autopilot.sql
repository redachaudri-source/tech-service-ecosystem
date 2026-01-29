-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: PRO Autopilot System
-- Adds pro_proposal column and database webhook for ticket autopilot
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Add pro_proposal column to tickets for storing slot proposals
ALTER TABLE tickets
ADD COLUMN IF NOT EXISTS pro_proposal JSONB DEFAULT NULL;

COMMENT ON COLUMN tickets.pro_proposal IS 'PRO mode slot proposals: {proposed_slots: [], proposed_at, timeout_at, status, selected_slot_index}';

-- 2. Create index for fast lookup of pending proposals
CREATE INDEX IF NOT EXISTS idx_tickets_pro_proposal_status 
ON tickets ((pro_proposal->>'status'))
WHERE pro_proposal IS NOT NULL;

-- 3. Add origin_source column if not exists (to track ticket origin)
ALTER TABLE tickets
ADD COLUMN IF NOT EXISTS origin_source VARCHAR(50) DEFAULT 'admin';

COMMENT ON COLUMN tickets.origin_source IS 'Origin of ticket: admin, client_web, client_app, whatsapp, phone';

-- Autopilot trigger: see 20260129_ticket_autopilot_webhook_trigger.sql (pg_net).

-- 4. Function to check and process pending PRO proposals (for cron job cleanup)
CREATE OR REPLACE FUNCTION check_expired_pro_proposals()
RETURNS INTEGER AS $$
DECLARE
    expired_count INTEGER := 0;
BEGIN
    -- Find proposals that have timed out
    UPDATE tickets
    SET 
        pro_proposal = pro_proposal || jsonb_build_object('status', 'expired'),
        updated_at = NOW()
    WHERE 
        pro_proposal IS NOT NULL
        AND pro_proposal->>'status' = 'waiting_selection'
        AND (pro_proposal->>'timeout_at')::timestamptz < NOW();
    
    GET DIAGNOSTICS expired_count = ROW_COUNT;
    
    RETURN expired_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Grant access
GRANT EXECUTE ON FUNCTION check_expired_pro_proposals TO authenticated;
GRANT EXECUTE ON FUNCTION check_expired_pro_proposals TO service_role;
