-- 1. TRACKING DE PDFS EN TICKETS
-- Añadimos campos para gestionar el PDF del servicio
ALTER TABLE public.tickets 
ADD COLUMN IF NOT EXISTS pdf_url text,
ADD COLUMN IF NOT EXISTS pdf_sent_to_client boolean DEFAULT false;

-- 2. TABLA DE CONFIGURACIÓN GLOBAL (SETTINGS)
-- Solo tendrá una fila, usada para el branding (Logo, Nombre)
CREATE TABLE IF NOT EXISTS public.company_settings (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  company_name text DEFAULT 'Tech Service',
  logo_url text, -- URL del logo en Supabase Storage
  primary_color text DEFAULT '#2563eb', -- Azul por defecto
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Habilitar RLS
ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;

-- POLÍTICAS DE SETTINGS
-- Todos pueden ver la configuración (para mostrar el logo en el login/dashboard)
CREATE POLICY "Public read settings" ON public.company_settings
  FOR SELECT USING (true);

-- Solo Admins pueden editar
CREATE POLICY "Admins update settings" ON public.company_settings
  FOR UPDATE USING (public.am_i_role('admin'));

CREATE POLICY "Admins insert settings" ON public.company_settings
  FOR INSERT WITH CHECK (public.am_i_role('admin'));

-- 3. INICIALIZAR CONFIGURACIÓN POR DEFECTO
INSERT INTO public.company_settings (company_name)
SELECT 'Tech Service'
WHERE NOT EXISTS (SELECT 1 FROM public.company_settings);

-- 4. STORAGE BUCKETS (Nota: Esto normalmente se hace en el dashboard, pero intentaremos crear policies)
-- Asumimos que el bucket 'company-assets' y 'avatars' existen o se crearán.
-- Aquí definimos políticas por si acaso el bucket ya existe.

-- Política para AVATARS (Público lectura, Auth escritura)
-- (No se puede crear buckets por SQL estándar de Supabase sin extensiones específicas, 
--  el usuario deberá crear los buckets "avatars" y "company-assets" o validaremos en el frontend).
