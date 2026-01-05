-- Definitive Fix for User Creation: Handle friendly_id
-- Problem: 'friendly_id' column is NOT NULL but was missing in previous inserts.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  next_friendly_id INT;
BEGIN
  -- 1. Calculate the next friendly_id (Auto-increment logic)
  SELECT COALESCE(MAX(friendly_id), 0) + 1 INTO next_friendly_id FROM public.profiles;

  -- 2. Insert with ALL required fields
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
      friendly_id -- <--- The Missing Piece!
  )
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'full_name', 'Nuevo Usuario'),
    COALESCE(new.raw_user_meta_data->>'role', 'client')::public.app_role, -- Casting to be safe, assuming app_role
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
    role = EXCLUDED.role,
    email = EXCLUDED.email,
    avatar_url = EXCLUDED.avatar_url,
    dni = EXCLUDED.dni,
    username = EXCLUDED.username,
    phone = EXCLUDED.phone,
    address = EXCLUDED.address;
    
  RETURN new;
EXCEPTION
  WHEN OTHERS THEN
    -- Fallback in case of ENUM casting error, try inserting as text or default
    -- This is a safety net
    INSERT INTO public.profiles (id, full_name, role, email, friendly_id)
    VALUES (new.id, 'Error User', 'client', new.email, (SELECT COALESCE(MAX(friendly_id), 0) + 1 FROM public.profiles))
    ON CONFLICT (id) DO NOTHING;
    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Re-apply trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
