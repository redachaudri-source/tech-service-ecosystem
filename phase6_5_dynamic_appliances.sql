-- Create appliance_types table
CREATE TABLE IF NOT EXISTS public.appliance_types (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.appliance_types ENABLE ROW LEVEL SECURITY;

-- Policies
-- 1. Everyone can read (Clients need it for dropdowns, Admins for management)
CREATE POLICY "Everyone can read appliance types" 
ON public.appliance_types FOR SELECT 
USING (true);

-- 2. Only Admins/Techs can insert/update/delete
CREATE POLICY "Admins can manage appliance types" 
ON public.appliance_types FOR ALL 
USING (
  auth.uid() IN (
    SELECT id FROM public.profiles 
    WHERE role::text IN ('admin', 'super_admin', 'technician')
  )
);

-- Seed Initial Data
INSERT INTO public.appliance_types (name) VALUES 
('Lavadora'), 
('Secadora'), 
('Lavavajillas'), 
('Frigorífico'), 
('Congelador'), 
('Horno'), 
('Vitrocerámica'), 
('Campana'), 
('Microondas'), 
('Termo Eléctrico'), 
('Aire Acondicionado'), 
('Caldera'),
('Otro')
ON CONFLICT (name) DO NOTHING;
