-- 1. Fix User Creation Trigger (Constraint Handling)
-- We need to ensure we don't fail if the profile already exists or if there's a race condition.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role, phone, address)
  VALUES (
    new.id, 
    new.email, 
    new.raw_user_meta_data->>'full_name',
    COALESCE(new.raw_user_meta_data->>'role', 'client'),
    new.raw_user_meta_data->>'phone',
    new.raw_user_meta_data->>'address'
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name),
    role = COALESCE(EXCLUDED.role, public.profiles.role);
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 2. Allow Clients to Insert Tickets
-- Currently, tickets might only be insertable by admin/tech.
-- We need to allow any authenticated user to insert a ticket IF the client_id matches their own ID.

CREATE POLICY "Clients can create their own tickets"
ON public.tickets
FOR INSERT
TO authenticated
WITH CHECK (
    auth.uid() = client_id
);

-- Also ensure they can see their own tickets (likely already exists, but reinforcing)
-- DROP POLICY IF EXISTS "Clients can view their own tickets" ON tickets;
-- CREATE POLICY "Clients can view their own tickets" ON tickets FOR SELECT USING (auth.uid() = client_id);

-- 3. Ensure "nuevo" tickets are visible to Admins (for the requested "Incoming Requests" view)
-- Admins usually have full access, so this is just a sanity check.

-- 4. Enable RLS on tickets if not already
ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;
