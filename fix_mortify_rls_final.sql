-- 1. LIMPIEZA: Borrar políticas anteriores para evitar conflictos y errores "already exists"
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON public.mortify_assessments;
DROP POLICY IF EXISTS "Clients can submit assessments" ON public.mortify_assessments;
DROP POLICY IF EXISTS "Clients can insert assessments" ON public.mortify_assessments;
DROP POLICY IF EXISTS "Admins have full control" ON public.mortify_assessments;
DROP POLICY IF EXISTS "Enable select for authenticated users" ON public.mortify_assessments;
DROP POLICY IF EXISTS "Enable update for authenticated users" ON public.mortify_assessments;

-- 2. ASEGURAR RLS ACTIVADO
ALTER TABLE public.mortify_assessments ENABLE ROW LEVEL SECURITY;

-- 3. CREAR NUEVAS POLÍTICAS (Permisivas para desbloquearte)

-- Permitir INSERTAR (Clientes y Admins)
CREATE POLICY "Enable insert for authenticated users" ON "public"."mortify_assessments"
AS PERMISSIVE FOR INSERT
TO authenticated
WITH CHECK (true);

-- Permitir VER (SELECT)
CREATE POLICY "Enable select for authenticated users" ON "public"."mortify_assessments"
AS PERMISSIVE FOR SELECT
TO authenticated
USING (true);

-- Permitir EDITAR (Admins - Confirmar Viabilidad / Recalcular)
CREATE POLICY "Enable update for authenticated users" ON "public"."mortify_assessments"
AS PERMISSIVE FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);
