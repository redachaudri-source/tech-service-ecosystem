-- Enable RLS on profiles (idempotent)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Drop restricting policies if they exist (to avoid conflicts)
DROP POLICY IF EXISTS "Public profiles access" ON profiles;
DROP POLICY IF EXISTS "Authenticated profiles access" ON profiles;
DROP POLICY IF EXISTS "Techs can update own location" ON profiles;
DROP POLICY IF EXISTS "Read all profiles" ON profiles;

-- 1. GLOBAL READ ACCESS (Fixes the Admin Panel "Missing Clients" issue)
CREATE POLICY "Read all profiles"
ON profiles FOR SELECT
TO authenticated
USING (true);

-- 2. TECH UPDATE ACCESS (Allows GPS updates)
CREATE POLICY "Techs can update own location"
ON profiles FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- 3. INSERT (Registration)
CREATE POLICY "Users can insert their own profile"
ON profiles FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = id);
