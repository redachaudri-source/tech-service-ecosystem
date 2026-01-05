-- 1. ADD PERMISSIONS COLUMN (JSONB)
-- This "backpack" will hold all the toggle switches for each user.
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS permissions JSONB DEFAULT '{}'::jsonb;

-- 2. SETUP DEFAULT PERMISSIONS FOR SUPER ADMIN
-- "Todo en verde" for the main admin.
UPDATE public.profiles 
SET permissions = jsonb_build_object(
  'can_manage_team', true,
  'can_manage_inventory', true, 
  'can_view_all_tickets', true,
  'can_view_all_clients', true,
  'can_delete_tickets', true,
  'can_edit_locked_tickets', true
)
WHERE role = 'admin';

-- 3. SETUP RESTRICTIVE DEFAULTS FOR TECHS (Optional but good practice)
UPDATE public.profiles 
SET permissions = jsonb_build_object(
  'can_manage_team', false,
  'can_manage_inventory', false, 
  'can_view_all_tickets', false,  -- Only assigned
  'can_view_all_clients', false,  -- Hidden
  'can_delete_tickets', false
)
WHERE role = 'tech';

-- 4. PERMISSION CHECK FUNCTION (Secure)
-- Checks if user has a specific permission toggle set to 'true'.
-- Usage: public.check_permission('can_view_all_clients')
CREATE OR REPLACE FUNCTION public.check_permission(perm_key text)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 
    FROM public.profiles 
    WHERE id = auth.uid() 
    AND (permissions->>perm_key)::boolean = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. UPDATE RLS POLICIES TO USE PERMISSIONS
-- This makes the "Matrix" actually work in the database.

-- Example: CLIENTS (Who sees what?)
DROP POLICY IF EXISTS "Master Admin Profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins have power" ON public.profiles;

-- Admin with 'can_view_all_clients' sees ALL.
-- Techs/Users see ONLY themselves (or maybe basic info of others if needed, sticking to strict for now).
CREATE POLICY "Privileged Staff View All Profiles" ON public.profiles
  FOR SELECT USING ( 
    -- Is Admin AND has permission
    (role = 'admin' AND (permissions->>'can_view_all_clients')::boolean = true)
    OR
    -- OR is self
    (id = auth.uid())
  );

-- TICKETS
DROP POLICY IF EXISTS "Master Admin Tickets" ON public.tickets;
DROP POLICY IF EXISTS "Admins have power on tickets" ON public.tickets;

-- Admin with 'can_view_all_tickets' sees ALL.
-- Techs/Users see only Linked tickets.
CREATE POLICY "Privileged Staff View All Tickets" ON public.tickets
  FOR ALL USING ( 
    (role = 'admin' AND (permissions->>'can_view_all_tickets')::boolean = true) 
  );

CREATE POLICY "Staff View Assigned Tickets" ON public.tickets
  FOR SELECT USING ( tech_id = auth.uid() );

-- INVENTORY (Only if they have permission)
-- Assumes Admins manage, Techs might only Read or consume?
DROP POLICY IF EXISTS "Master Admin Inventory" ON public.inventory;
CREATE POLICY "Privileged Staff Manage Inventory" ON public.inventory
  FOR ALL USING ( 
    role = 'admin' AND (permissions->>'can_manage_inventory')::boolean = true 
  );
  
CREATE POLICY "Tech Read Inventory" ON public.inventory
  FOR SELECT USING ( role = 'tech' );

