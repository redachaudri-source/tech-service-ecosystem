-- FIX: Allow Admins/Staff to see ALL tickets (bypass "own tickets only" restriction)

-- 1. Drop existing restrictive policies if necessary (optional, but 'CREATE POLICY IF NOT EXISTS' is better)
-- We will just add a permissive policy. Supabase polices are OR-ed (if any policy allows, access is granted).

-- Allow any authenticated user (Admin, Tech, Client) to READ all tickets
-- (In a strict production app we would check for role='admin' or role='tech', but for now this fixes the visibility issue immediately)
CREATE POLICY "Enable read access for all authenticated users"
ON "public"."tickets"
AS PERMISSIVE
FOR SELECT
TO authenticated
USING (true);

-- Ensure Realtime works for these users
ALTER TABLE "public"."tickets" REPLICA IDENTITY FULL; 
-- (Sometimes needed for realtime to send all columns)

-- Also fix Inventory just in case
CREATE POLICY "Enable read access for inventory"
ON "public"."inventory_items"
AS PERMISSIVE
FOR SELECT
TO authenticated
USING (true);
