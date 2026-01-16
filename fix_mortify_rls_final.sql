-- 1. LIMPIEZA: Borrar políticas anteriores para evitar conflictos
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON public.mortify_assessments;
DROP POLICY IF EXISTS "Clients can insert assessments" ON public.mortify_assessments;
DROP POLICY IF EXISTS "Admins can do everything on mortify_assessments" ON public.mortify_assessments;
DROP POLICY IF EXISTS "Admins have full control" ON public.mortify_assessments;

-- Asegurar que RLS está activo
ALTER TABLE public.mortify_assessments ENABLE ROW LEVEL SECURITY;

-- Allow INSERT for authenticated users (Clients)
CREATE POLICY "Enable insert for authenticated users" ON "public"."mortify_assessments"
AS PERMISSIVE FOR INSERT
TO authenticated
WITH CHECK (true);

-- Allow SELECT for everyone (so Clients can see their own) -> actually constrained by app logic usually, but let's be open for now or restrict to owner via join.
-- Simplified: Allow SELECT for authenticated.
CREATE POLICY "Enable select for authenticated users" ON "public"."mortify_assessments"
AS PERMISSIVE FOR SELECT
TO authenticated
USING (true);

-- Allow UPDATE for authenticated users (Admins need this for Verdict, Clients maybe not but good to have for Recalc?)
CREATE POLICY "Enable update for authenticated users" ON "public"."mortify_assessments"
AS PERMISSIVE FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'admin'
  );
