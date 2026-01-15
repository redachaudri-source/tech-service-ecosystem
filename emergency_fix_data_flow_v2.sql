-- 🚑 SCRIPT DE RESCATE DE DATOS (MORTIFY) - VERSIÓN CORREGIDA (V2)
-- Este script limpia las políticas antes de crearlas para evitar errores.

-- 1. DESBLOQUEO CRÍTICO DEL CLIENTE (Permitir lectura tras inserción)
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON public.mortify_assessments;

CREATE POLICY "Enable read access for authenticated users" ON public.mortify_assessments
FOR SELECT
USING (auth.role() = 'authenticated');

-- 2. ASEGURAR TABLAS DE CONFIGURACIÓN
DROP POLICY IF EXISTS "Enable read access for all users" ON public.appliance_category_defaults;

CREATE POLICY "Enable read access for all users" ON public.appliance_category_defaults
FOR SELECT USING (true);


-- 3. REPASO FINAL DE ADMIN
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
