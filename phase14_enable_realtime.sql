-- Enable Realtime for critical tables
-- This ensures that the 'supabase_realtime' publication includes these tables
-- so that clients can listen to changes.

-- 1. Add tables to publication
alter publication supabase_realtime add table tickets;
alter publication supabase_realtime add table profiles;

-- 2. Verify Replica Identity (required for UPDATE/DELETE changes)
-- Default is usually fine, but FULL creates more overhead. DEFAULT is ID-based.
alter table tickets replica identity default;
alter table profiles replica identity default;
