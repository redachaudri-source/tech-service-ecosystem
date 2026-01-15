-- 1. LIMPIEZA PREVIA (Para evitar errores de "Policy already exists")
DROP POLICY IF EXISTS "Admins can view all client_appliances" ON public.client_appliances;
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;

-- 2. LLAVE MAESTRA PARA APARATOS (Para que veas qué máquina es)
CREATE POLICY "Admins can view all client_appliances" 
ON public.client_appliances
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'admin'
  )
);

-- 3. LLAVE MAESTRA PARA CLIENTES (Para que veas de quién es)
CREATE POLICY "Admins can view all profiles" 
ON public.profiles
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.profiles AS my_profile
    WHERE my_profile.id = auth.uid()
    AND my_profile.role = 'admin'
  )
);
