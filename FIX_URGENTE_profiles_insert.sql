-- ============================================================
-- EMERGENCY FIX: Allow admins to create client profiles
-- ============================================================
-- ERROR: "new row violates row-level security policy"
-- CAUSE: INSERT policy requires auth.uid() = id, but admin creates
--        profiles for OTHER users (where auth.uid() ≠ new profile id)
-- ============================================================

-- Drop the restrictive INSERT policy
DROP POLICY IF EXISTS "profiles_insert_own" ON profiles;

-- Create permissive INSERT policy
-- Allow ANY authenticated user to insert profiles
-- This is necessary because:
-- 1. Admin panel creates profiles for new clients
-- 2. Self-registration also needs to work
CREATE POLICY "profiles_insert_any"
ON profiles FOR INSERT
TO authenticated
WITH CHECK (true);

-- Verify the fix
SELECT 
    policyname,
    cmd,
    with_check
FROM pg_policies 
WHERE tablename = 'profiles' AND cmd = 'INSERT';
