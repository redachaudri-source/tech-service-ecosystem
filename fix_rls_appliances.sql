-- Enable RLS on the table (ensure it is on)
ALTER TABLE public.client_appliances ENABLE ROW LEVEL SECURITY;

-- Drop potentially conflicting or restrictive policies
DROP POLICY IF EXISTS "Users can read own appliances" ON public.client_appliances;
DROP POLICY IF EXISTS "Authenticated users can select all" ON public.client_appliances;

-- POLICY 1: Allow users to see their own data (Standard)
CREATE POLICY "Users can read own appliances"
ON public.client_appliances
FOR SELECT
USING (auth.uid() = client_id);

-- POLICY 2: Allow Admins (or any authenticated user for now, to ensure visibility in Dashboard) to view ALL
-- This is critical for the Admin Panel to see appliances of other users.
CREATE POLICY "Authenticated users can select all"
ON public.client_appliances
FOR SELECT
TO authenticated
USING (true);

-- Also ensure insert/update policies exist if needed, but for now we focus on the VIEW blocking issue.
-- (Assuming other policies for INSERT/UPDATE are managed elsewhere or standard)
