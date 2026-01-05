-- MASTER SCRIPT TO FIX CASTING ERROR AND RESTORE POLICIES
-- This script drops the problematic policies, fixes the function, and restores them.

-- 1. DROP DEPENDENT POLICIES
DROP POLICY IF EXISTS "Admin Con Permiso Ve Todo" ON public.profiles;
DROP POLICY IF EXISTS "Admin Gestiona Inventario" ON public.inventory;
DROP POLICY IF EXISTS "Tecnico Lee Inventario" ON public.inventory;
DROP POLICY IF EXISTS "Admins update settings" ON public.company_settings;
DROP POLICY IF EXISTS "Admins insert settings" ON public.company_settings;
DROP POLICY IF EXISTS "Public read settings" ON public.company_settings;

-- 2. DROP AND RECREATE FUNCTION (The Core Fix)
DROP FUNCTION IF EXISTS public.am_i_role(text);

CREATE OR REPLACE FUNCTION public.am_i_role(target_role_text text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  -- SAFETY CAST: We cast the text input to the user_role enum
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
    AND role = target_role_text::public.user_role 
  );
EXCEPTION WHEN OTHERS THEN
  RETURN FALSE; 
END;
$function$;

-- 3. ENSURE NEW FIELDS EXIST (Settings)
ALTER TABLE public.company_settings
ADD COLUMN IF NOT EXISTS company_address text,
ADD COLUMN IF NOT EXISTS company_phone text,
ADD COLUMN IF NOT EXISTS company_email text,
ADD COLUMN IF NOT EXISTS company_tax_id text,
ADD COLUMN IF NOT EXISTS legal_terms text DEFAULT 'Garantía de 3 meses sobre la reparación detallada.',
ADD COLUMN IF NOT EXISTS tax_rate numeric DEFAULT 21;

-- 4. RESTORE POLICIES

-- PROFILES (Restored with broad admin permissions)
CREATE POLICY "Admin Con Permiso Ve Todo" ON public.profiles
FOR ALL USING (
  am_i_role('admin') AND (
    have_permission('can_manage_team') OR have_permission('can_view_all_clients')
  )
);

-- INVENTORY (Admin)
CREATE POLICY "Admin Gestiona Inventario" ON public.inventory
FOR ALL USING (
  am_i_role('admin') AND have_permission('can_manage_inventory')
);

-- INVENTORY (Tech)
CREATE POLICY "Tecnico Lee Inventario" ON public.inventory
FOR SELECT USING (
  am_i_role('tech')
);

-- SETTINGS (Admin Update)
CREATE POLICY "Admins update settings" ON public.company_settings
FOR UPDATE USING (
  am_i_role('admin')
);

-- SETTINGS (Admin Insert)
CREATE POLICY "Admins insert settings" ON public.company_settings
FOR INSERT WITH CHECK (
  am_i_role('admin')
);

-- SETTINGS (Public Read)
CREATE POLICY "Public read settings" ON public.company_settings
FOR SELECT USING (true);

-- 5. RE-GRANT PERMISSIONS (Safety measure)
GRANT ALL ON public.company_settings TO authenticated;
GRANT ALL ON public.company_settings TO anon;
