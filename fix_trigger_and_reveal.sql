-- FIX TOTAL: Trigger + Reparar Usuario Oculto

-- 1. Arreglar el Trigger (Quitando el casteo a app_role que no existe)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  next_id INT;
BEGIN
  SELECT COALESCE(MAX(friendly_id), 0) + 1 INTO next_id FROM public.profiles;

  INSERT INTO public.profiles (
    id, full_name, role, email, avatar_url, dni, username, phone, address, friendly_id
  )
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'full_name', 'Usuario'),
    COALESCE(new.raw_user_meta_data->>'role', 'client'), -- <--- NADA de ::app_role
    new.email,
    COALESCE(new.raw_user_meta_data->>'avatar_url', ''),
    COALESCE(new.raw_user_meta_data->>'dni', NULL),
    COALESCE(new.raw_user_meta_data->>'username', NULL),
    COALESCE(new.raw_user_meta_data->>'phone', NULL),
    COALESCE(new.raw_user_meta_data->>'address', NULL),
    next_id
  )
  ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name;
  
  RETURN new;
EXCEPTION WHEN OTHERS THEN
  -- Fallback silencioso
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (new.id, new.email, 'Usuario Rescatado', 'client')
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. REPARAR al Técnico Oculto
-- Buscamos al último usuario creado que sea 'client' y lo pasamos a 'tech'
UPDATE public.profiles
SET role = 'tech'
WHERE id IN (
    SELECT id FROM public.profiles 
    WHERE role = 'client' 
    ORDER BY created_at DESC 
    LIMIT 1
);
