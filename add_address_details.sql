-- Add address details columns to profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS floor text,
ADD COLUMN IF NOT EXISTS apartment text;

-- Comment on columns for clarity
COMMENT ON COLUMN public.profiles.floor IS 'Planta o Piso (e.g., 2º, Bajo)';
COMMENT ON COLUMN public.profiles.apartment IS 'Puerta, Letra o Oficina (e.g., A, Izquierda)';
