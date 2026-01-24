-- Create service_zones table
CREATE TABLE IF NOT EXISTS public.service_zones (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    province TEXT NOT NULL,
    cities TEXT[] NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.service_zones ENABLE ROW LEVEL SECURITY;

-- Create Policy for Read Access (All authenticated users can read)
CREATE POLICY "Enable read access for authenticated users" 
ON public.service_zones FOR SELECT 
TO authenticated 
USING (true);

-- Insert Seed Data (Málaga Province)
INSERT INTO public.service_zones (province, cities)
VALUES ('Málaga', ARRAY[
    'Málaga', 'Marbella', 'Mijas', 'Fuengirola', 'Vélez-Málaga',
    'Torremolinos', 'Benalmádena', 'Estepona', 'Rincón de la Victoria',
    'Antequera', 'Alhaurín de la Torre', 'Ronda', 'Cártama',
    'Alhaurín el Grande', 'Coín', 'Nerja', 'Torrox', 'Manilva', 'Álora'
]);

-- Insert Seed Data (Granada - Optional/Future Proof)
INSERT INTO public.service_zones (province, cities)
VALUES ('Granada', ARRAY[
    'Granada', 'Motril', 'Almuñécar', 'Armilla', 'Maracena', 
    'Loja', 'Baza', 'Las Gabias', 'La Zubia', 'Guadix'
]);
