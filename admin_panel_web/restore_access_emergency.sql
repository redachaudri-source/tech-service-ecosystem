-- EMERGENCY FIX: RESTORE PROFILES ACCESS

-- 1. Enable RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- 2. DROP ALL POSSIBLE POLICIES (Clean Slate)
DROP POLICY IF EXISTS "Public profiles access" ON profiles;
DROP POLICY IF EXISTS "Authenticated profiles access" ON profiles;
DROP POLICY IF EXISTS "Techs can update own location" ON profiles;
DROP POLICY IF EXISTS "Read all profiles" ON profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Allow individual update" ON profiles;
DROP POLICY IF EXISTS "Enable read access for all authenticated users" ON profiles;

-- 3. APPLY CORRECT POLICIES

-- A. READ: Allow ALL Authenticated users to read ALL profiles (Needed for Admin Panel + Tech App)
CREATE POLICY "Read all profiles"
ON profiles FOR SELECT
TO authenticated
USING (true);

-- B. UPDATE: Users can only update THEIR OWN profile (GPS, Avatar, etc)
CREATE POLICY "Users can update own profile"
ON profiles FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- C. INSERT: Users can insert their own profile (Signup)
CREATE POLICY "Users can insert their own profile"
ON profiles FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = id);

-- D. SERVICE ROLE: Full Access (Implicit usually, but good to be safe if policies conflict)
-- (No specific policy needed for service role as it bypasses RLS, but we ensure policies don't block)
