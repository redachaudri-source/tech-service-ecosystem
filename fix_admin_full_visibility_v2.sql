-- CORRECCIÓN: La tabla de clientes se llama "profiles", no "clients".
-- Este script da permiso al admin para ver los perfiles y los aparatos, desbloqueando el Dashboard.

-- 1. Dar poder al Admin sobre "client_appliances"
CREATE POLICY "Admins can view all client_appliances" ON public.client_appliances
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'admin'
  )
);

-- 2. Dar poder al Admin sobre "profiles" (que son los clientes)
CREATE POLICY "Admins can view all profiles" ON public.profiles
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.profiles AS my_profile
    WHERE my_profile.id = auth.uid()
    AND my_profile.role = 'admin'
  )
);

-- 3. (Opcional) Asegurar permisos en mortify_assessments por si acaso
DROP POLICY IF EXISTS "Admins have full control" ON public.mortify_assessments;
CREATE POLICY "Admins have full control" ON public.mortify_assessments
FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'admin'
  )
);
