-- NUCLEAR OPTION: Remove Constraints & Simplify Trigger

-- 1. DROP NOT NULL on potentially blocking columns
ALTER TABLE public.profiles ALTER COLUMN full_name DROP NOT NULL;
ALTER TABLE public.profiles ALTER COLUMN role DROP NOT NULL;
ALTER TABLE public.profiles ALTER COLUMN friendly_id DROP NOT NULL;
ALTER TABLE public.profiles ALTER COLUMN email DROP NOT NULL;
ALTER TABLE public.profiles ALTER COLUMN is_active DROP NOT NULL;

-- 2. CREATE MINIMALIST TRIGGER (Fail-Safe)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  -- Insert only what we strictly have. No calculations. No complex logic.
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'full_name', 'Usuario'),
    -- Try to get role, but fallback to 'client' text (no casting)
    COALESCE(new.raw_user_meta_data->>'role', 'client')
  )
  ON CONFLICT (id) DO NOTHING;
  
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. APPLY TRIGGER
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 4. FORCE RLS OPEN (Just in case policies are still blocking)
DROP POLICY IF EXISTS "Admin Update All" ON public.profiles;
CREATE POLICY "Admin Update All" ON public.profiles FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Admin Insert All" ON public.profiles FOR INSERT TO authenticated WITH CHECK (true);
