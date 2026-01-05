-- SOLUCIÓN DEFINITIVA: Usar el tipo 'user_role' correcto

-- 1. Trigger con el tipo de dato EXACTO (user_role)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  next_friendly_id INT;
BEGIN
  -- Calcular friendly_id (MAX + 1)
  SELECT COALESCE(MAX(friendly_id), 0) + 1 INTO next_friendly_id FROM public.profiles;

  INSERT INTO public.profiles (
    id, 
    full_name, 
    role, 
    email, 
    avatar_url, 
    dni, 
    username, 
    phone, 
    address, 
    friendly_id
  )
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'full_name', 'Nuevo Usuario'),
    -- AQUI ESTABA EL ERROR: Usar ::public.user_role
    COALESCE(new.raw_user_meta_data->>'role', 'client')::public.user_role,
    new.email,
    COALESCE(new.raw_user_meta_data->>'avatar_url', ''),
    COALESCE(new.raw_user_meta_data->>'dni', NULL),
    COALESCE(new.raw_user_meta_data->>'username', NULL),
    COALESCE(new.raw_user_meta_data->>'phone', NULL),
    COALESCE(new.raw_user_meta_data->>'address', NULL),
    next_friendly_id
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    role = EXCLUDED.role, -- Actualizar rol si ya existe
    email = EXCLUDED.email,
    avatar_url = EXCLUDED.avatar_url,
    dni = EXCLUDED.dni,
    username = EXCLUDED.username,
    phone = EXCLUDED.phone,
    address = EXCLUDED.address;

  RETURN new;
EXCEPTION
  WHEN OTHERS THEN
    -- Fallback de seguridad usando un valor válido ('client')
    RAISE WARNING 'Error en Trigger: %, usando fallback', SQLERRM;
    INSERT INTO public.profiles (id, full_name, role, email, friendly_id)
    VALUES (new.id, 'Usuario Fallback', 'client'::public.user_role, new.email, next_friendly_id)
    ON CONFLICT (id) DO NOTHING;
    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Re-aplicar el Trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 3. Corregir RLS (Permisos) usando el tipo correcto
DROP POLICY IF EXISTS "Admin Update All" ON public.profiles;
CREATE POLICY "Admin Update All"
ON public.profiles
FOR UPDATE
TO authenticated
USING (
  -- Casteo explícito a user_role para evitar errores de tipo
  (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'::public.user_role
);
