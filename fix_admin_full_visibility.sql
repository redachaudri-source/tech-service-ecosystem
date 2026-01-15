-- PROBLEMA DETECTADO:
-- El Dashboard intenta leer también de "client_appliances" y "clients".
-- Si el Admin no tiene permiso explícito en ESEAS tablas, Supabase oculta toda la fila.

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

-- 2. Dar poder al Admin sobre "clients"
CREATE POLICY "Admins can view all clients" ON public.clients
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'admin'
  )
);

-- 3. Reforzar Mortify (por seguridad)
ALTER TABLE public.mortify_assessments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins have full control" ON public.mortify_assessments;
CREATE POLICY "Admins have full control" ON public.mortify_assessments
FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'admin'
  )
);
