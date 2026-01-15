-- 1. LIMPIEZA: Borrar políticas anteriores para evitar conflictos
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON public.mortify_assessments;
DROP POLICY IF EXISTS "Clients can insert assessments" ON public.mortify_assessments;
DROP POLICY IF EXISTS "Admins can do everything on mortify_assessments" ON public.mortify_assessments;
DROP POLICY IF EXISTS "Admins have full control" ON public.mortify_assessments;

-- Asegurar que RLS está activo
ALTER TABLE public.mortify_assessments ENABLE ROW LEVEL SECURITY;

-- 2. CLIENTES (Usuario Autenticado): Permiso para INSERTAR
CREATE POLICY "Clients can submit assessments" ON public.mortify_assessments
FOR INSERT
WITH CHECK (auth.role() = 'authenticated');

-- 3. ADMINS (Superpoderes): Permiso TOTAL (Ver, Editar, Borrar)
CREATE POLICY "Admins have full control" ON public.mortify_assessments
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'admin'
  )
);
