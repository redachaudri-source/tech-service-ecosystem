-- ═══════════════════════════════════════════════════════════════════════════
-- EMERGENCY FIX: Remove broken trigger
-- ═══════════════════════════════════════════════════════════════════════════

-- Drop the problematic trigger
DROP TRIGGER IF EXISTS trigger_ticket_autopilot_on_insert ON tickets;
DROP FUNCTION IF EXISTS trigger_ticket_autopilot();

-- Verify trigger is gone
-- SELECT tgname FROM pg_trigger WHERE tgrelid = 'tickets'::regclass;
