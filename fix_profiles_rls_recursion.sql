-- ============================================================
-- FIX: Infinite Recursion in profiles RLS Policies
-- ============================================================
-- ERROR: "infinite recursion detected in policy for relation 'profiles'"
-- CAUSE: A policy or trigger on 'profiles' queries the same table,
--        causing an infinite loop when RLS evaluates access.
-- ============================================================

-- Step 1: Drop ALL existing policies on profiles to start fresh
DO $$ 
DECLARE
    pol RECORD;
BEGIN
    FOR pol IN 
        SELECT policyname FROM pg_policies WHERE tablename = 'profiles'
    LOOP
        EXECUTE 'DROP POLICY IF EXISTS "' || pol.policyname || '" ON profiles';
        RAISE NOTICE 'Dropped policy: %', pol.policyname;
    END LOOP;
END $$;

-- Step 2: Enable RLS (idempotent)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Step 3: Create SIMPLE policies that don't reference profiles table internally

-- SELECT: Allow all authenticated users to read all profiles
-- This is necessary for admin panel, tech lookups, etc.
CREATE POLICY "profiles_select_all"
ON profiles FOR SELECT
TO authenticated
USING (true);

-- INSERT: Allow authenticated users to insert their own profile
-- Uses auth.uid() which doesn't query profiles table
CREATE POLICY "profiles_insert_own"
ON profiles FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = id);

-- UPDATE: Allow users to update their own profile
CREATE POLICY "profiles_update_own"
ON profiles FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- DELETE: Only allow users to delete their own profile
CREATE POLICY "profiles_delete_own"
ON profiles FOR DELETE
TO authenticated
USING (auth.uid() = id);

-- Step 4: Allow service role to bypass RLS (for admin operations)
-- This ensures the admin panel can create/update any profile
ALTER TABLE profiles FORCE ROW LEVEL SECURITY;

-- Grant service role full access (bypasses RLS automatically)
-- Note: service_role already bypasses RLS by default in Supabase

-- Step 5: Verify policies are correct
SELECT 
    policyname,
    permissive,
    cmd,
    qual,
    with_check
FROM pg_policies 
WHERE tablename = 'profiles';
