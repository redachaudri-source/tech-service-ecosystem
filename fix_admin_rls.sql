-- FIX RLS: Give Admins Superpowers to Edit Profiles

-- 1. Drop potentially conflicting/broken policies
DROP POLICY IF EXISTS "Admin Update All" ON public.profiles;
DROP POLICY IF EXISTS "Admin Con Permiso Ve Todo" ON public.profiles;

-- 2. Create the "Admin God Mode" Policy for Updates
-- Allow any user with role='admin' to UPDATE any row in 'profiles'
CREATE POLICY "Admin Update All"
ON public.profiles
FOR UPDATE
TO authenticated
USING (
  auth.uid() IN (
    SELECT id FROM public.profiles WHERE role = 'admin'
  )
);

-- 3. Create "Admin God Mode" Policy for Select (Viewing)
-- Re-creating this to be sure
CREATE POLICY "Admin Select All"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  auth.uid() IN (
    SELECT id FROM public.profiles WHERE role = 'admin'
  )
);

-- 4. Enable RLS (Make sure it's on)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
