-- 1. DROP EXISTING FUNCTION TO AVOID CONFLICTS
DROP FUNCTION IF EXISTS public.am_i_role(text);

-- 2. RECREATE FUNCTION WITH CORRECT CASTING
CREATE OR REPLACE FUNCTION public.am_i_role(target_role_text text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
    AND role = target_role_text::public.user_role 
  );
EXCEPTION WHEN OTHERS THEN
  RETURN FALSE; 
END;
$function$;

-- 3. ENSURE COLUMNS EXIST (Safe to run multiple times)
ALTER TABLE public.company_settings
ADD COLUMN IF NOT EXISTS company_address text,
ADD COLUMN IF NOT EXISTS company_phone text,
ADD COLUMN IF NOT EXISTS company_email text,
ADD COLUMN IF NOT EXISTS company_tax_id text, -- CIF/NIF
ADD COLUMN IF NOT EXISTS legal_terms text DEFAULT 'Garantía de reparación de 3 meses según ley vigente.',
ADD COLUMN IF NOT EXISTS tax_rate numeric DEFAULT 21;

-- 4. GRANT PERMISSIONS (Just in case RLS blocked something)
GRANT ALL ON public.company_settings TO authenticated;
GRANT ALL ON public.company_settings TO anon;
