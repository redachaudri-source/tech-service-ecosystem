-- 1. FIX RLS FUNCTION (ENUM CASTING)
-- The error "operator does not exist: user_role = text" happens because we are comparing a text input to an enum column.
-- We can fix this by casting the text input to user_role inside the function or creating a new one.

CREATE OR REPLACE FUNCTION public.am_i_role(val text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  -- Cast 'val' to user_role explicitly for the comparison
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
    AND role = val::public.user_role -- Explicit cast here
  );
EXCEPTION WHEN OTHERS THEN
  RETURN FALSE; -- If cast fails (invalid role name), return false
END;
$function$;

-- 2. EXTEND COMPANY SETTINGS TABLE
-- Add fields for PDF generation
ALTER TABLE public.company_settings
ADD COLUMN IF NOT EXISTS company_address text,
ADD COLUMN IF NOT EXISTS company_phone text,
ADD COLUMN IF NOT EXISTS company_email text,
ADD COLUMN IF NOT EXISTS company_tax_id text, -- CIF/NIF
ADD COLUMN IF NOT EXISTS legal_terms text DEFAULT 'Garantía de reparación de 3 meses según ley vigente.',
ADD COLUMN IF NOT EXISTS tax_rate numeric DEFAULT 21; -- IVA %

-- 3. RE-APPLY POLICIES (Just in case)
-- Ensure policies allow update of these new columns (the existing policy uses "FOR UPDATE" so it covers all columns automatically)
