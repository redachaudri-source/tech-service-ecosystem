
-- Disable the automatic Mortify trigger on ticket close
DROP TRIGGER IF EXISTS trigger_mortify_on_ticket_close ON tickets;
DROP FUNCTION IF EXISTS trigger_auto_mortify_on_close();
