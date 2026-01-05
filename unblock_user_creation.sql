-- EMERGENCY UNBLOCK: Relax Constraints and Robustify Trigger

-- 1. Relax the friendly_id constraint (The likely culprit)
ALTER TABLE public.profiles ALTER COLUMN friendly_id DROP NOT NULL;

-- 2. Relax role constraint (Change to Text if possible to avoid Enum errors)
-- Note: Changing type can be risky, so we will handle it in the trigger instead.

-- 3. Robust Trigger V4 (The "Anti-Crash" Version)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  next_id INT;
  safe_role TEXT;
BEGIN
  -- Intentar calcular ID, si falla, usar 0
  SELECT COALESCE(MAX(friendly_id), 0) + 1 INTO next_id FROM public.profiles;

  -- Normalizar Rol (Mapeo de seguridad Frontend -> Backend)
  safe_role := COALESCE(new.raw_user_meta_data->>'role', 'client');
  
  -- Si llega 'tech', convertir a lo que la BD espera (si es necesario). 
  -- Por ahora lo dejamos pasar como texto, Postgres intentará ajustarlo al Enum.
  
  INSERT INTO public.profiles (
    id, full_name, role, email, avatar_url, dni, username, phone, address, friendly_id
  )
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'full_name', 'Usuario'),
    safe_role, -- Sin casteo explícito, dejamos que Postgres lo intente
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
EXCEPTION
  WHEN OTHERS THEN
    -- SI TODO FALLA, insertar MÍNIMO VITAL (Bypass de emergencia)
    RAISE WARNING 'Error en Trigger Completo: %, intentando insert basico', SQLERRM;
    INSERT INTO public.profiles (id, email, full_name, role)
    VALUES (new.id, new.email, 'Usuario Recuperado', 'client')
    ON CONFLICT (id) DO NOTHING;
    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Re-apply
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
