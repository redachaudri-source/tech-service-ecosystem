-- VERIFY AND FIX HANDLE NEW USER TRIGGER
-- This ensures that when a new user signs up, a profile is created.

-- 1. Create the Function (if it doesn't exist or is broken)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, role)
  VALUES (
    new.id,
    new.raw_user_meta_data->>'full_name',
    new.email,
    COALESCE(new.raw_user_meta_data->>'role', 'client') -- Default to client if no role provided
  )
  ON CONFLICT (id) DO UPDATE
  SET full_name = EXCLUDED.full_name,
      role = COALESCE(new.raw_user_meta_data->>'role', profiles.role); -- Keep existing role if not provided in update
  RETURN new;
END;
$$;

-- 2. Drop the Trigger (to ensure clean slate)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- 3. Re-create the Trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- 4. DIAGNOSTIC: Check if "sofia" exists in auth.users
SELECT id, email, created_at FROM auth.users WHERE email LIKE '%sofia%';
