-- SET REPLICA IDENTITY ONLY
-- Since ADD TABLE failed (already exists), we just ensure this part is done.
ALTER TABLE public.client_appliances REPLICA IDENTITY FULL;

-- Also ensure RLS is enabled but allows the user to read their own data (Standard)
ALTER TABLE public.client_appliances ENABLE ROW LEVEL SECURITY;
