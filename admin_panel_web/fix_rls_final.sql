-- FINAL RLS FIX: SECURITY DEFINER APPROACH
-- This bypasses RLS recursion by checking role with system privileges.

-- 1. Create a Secure Function to check Admin status
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean AS $$
BEGIN
  -- This query runs as Superuser, ignoring RLS, so it won't loop.
  RETURN EXISTS (
    SELECT 1 
    FROM public.profiles 
    WHERE id = auth.uid() 
    AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Drop ALL confusing policies to start clean
DROP POLICY IF EXISTS "Admins allow all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins full access profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins JWT profiles" ON public.profiles;

DROP POLICY IF EXISTS "Admins manage tickets" ON public.tickets;
DROP POLICY IF EXISTS "Admins full access tickets" ON public.tickets;
DROP POLICY IF EXISTS "Admins JWT tickets" ON public.tickets;

DROP POLICY IF EXISTS "Admins manage inventory" ON public.inventory;
DROP POLICY IF EXISTS "Admins full access inventory" ON public.inventory;
DROP POLICY IF EXISTS "Admins JWT inventory" ON public.inventory;

-- 3. Apply the "Silver Bullet" Policies using the Secure Function

-- PROFILES
CREATE POLICY "Admins have power" ON public.profiles
  FOR ALL USING ( public.is_admin() );

CREATE POLICY "Users see own profile" ON public.profiles
  FOR SELECT USING ( auth.uid() = id );

-- TICKETS
CREATE POLICY "Admins have power on tickets" ON public.tickets
  FOR ALL USING ( public.is_admin() );

CREATE POLICY "Clients see own tickets" ON public.tickets
  FOR SELECT USING ( auth.uid() = client_id );

-- INVENTORY
CREATE POLICY "Admins have power on inventory" ON public.inventory
  FOR ALL USING ( public.is_admin() );

-- SERVICE PARTS
CREATE POLICY "Admins have power on parts" ON public.service_parts
  FOR ALL USING ( public.is_admin() );

-- 4. Verify Data Exists (Diagnostic)
-- This line won't affect policies but will show you in the results if you have clients.
SELECT count(*) as total_users, role FROM public.profiles GROUP BY role;
