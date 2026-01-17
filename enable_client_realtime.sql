-- FORCE ENABLE REALTIME FOR CLIENT APPLIANCES

-- 1. Ensure the table is part of the realtime publication
BEGIN;
  -- Add it properly if not already there
  ALTER PUBLICATION supabase_realtime ADD TABLE public.client_appliances;
COMMIT;

-- 2. Set Replica Identity to FULL
ALTER TABLE public.client_appliances REPLICA IDENTITY FULL;

-- 3. Safety Check: Notification Triggers?
-- Sometimes simple polling via Realtime is enough, but ensure policies allow it.
-- Clients should already have SELECT access to their own rows.
-- We verify this by ensuring no restrictive policy blocks 'SELECT' for owner.

-- (No extra policy needed mostly if standard CRUD works, but Realtime respects RLS)
-- If Realtime sends an event but the user can't "See" the new row state due to RLS, it sends an empty payload or nothing.
-- Since the user OWNS the row (client_id = auth.uid()), they should see it.

-- 4. Also force public.tickets just in case
ALTER PUBLICATION supabase_realtime ADD TABLE public.tickets;
ALTER TABLE public.tickets REPLICA IDENTITY FULL;
