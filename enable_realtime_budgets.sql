-- Enable Realtime for Budgets table
-- This is required for the Admin Panel to update automatically when a client accepts a budget.

BEGIN;
  -- Check if publication exists, if not create it (standard setup)
  -- DO $$
  -- BEGIN
  --   IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
  --     CREATE PUBLICATION supabase_realtime;
  --   END IF;
  -- END
  -- $$;

  -- Add table to publication
  ALTER PUBLICATION supabase_realtime ADD TABLE budgets;
COMMIT;
