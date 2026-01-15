-- 🚑 SCRIPT DE RESCATE DE DATOS (MORTIFY)

-- 1. DESBLOQUEO CRÍTICO DEL CLIENTE
-- El cliente hace un "INSERT" y luego un "SELECT" para ver el resultado. 
-- Si no tiene permiso de "SELECT", la operación falla o da error silencioso.

CREATE POLICY "Enable read access for authenticated users" ON public.mortify_assessments
FOR SELECT
USING (auth.role() = 'authenticated');

-- 2. ASEGURAR TABLAS DE CONFIGURACIÓN (Lectura Pública/Auth)
-- Si el cliente no puede leer estas tablas, el algoritmo falla antes de empezar.

ALTER TABLE public.appliance_category_defaults ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read access for all users" ON public.appliance_category_defaults
FOR SELECT USING (true);


-- 3. REPASO FINAL DE ADMIN (Por si acaso)
-- Grant ALL to admins on mortify_assessments
DROP POLICY IF EXISTS "Admins have full control" ON public.mortify_assessments;
CREATE POLICY "Admins have full control" ON public.mortify_assessments
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'admin'
  )
);

-- NOTA: Si esto funciona, es porque el "SELECT" estaba bloqueando la confirmación de la inserción.
