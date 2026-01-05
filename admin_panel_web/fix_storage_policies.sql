-- FIX STORAGE PERMISSIONS FOR 'company-asset'
-- The error "new row violates row-level security policy" means we don't have permission to INSERT into the storage bucket.

-- 1. Ensure Bucket Exists (public)
INSERT INTO storage.buckets (id, name, public)
VALUES ('company-asset', 'company-asset', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- 2. Drop potential conflicting policies for this bucket
-- We use specific names to avoid deleting policies for other buckets
DROP POLICY IF EXISTS "Company Asset Public Read" ON storage.objects;
DROP POLICY IF EXISTS "Company Asset Auth Insert" ON storage.objects;
DROP POLICY IF EXISTS "Company Asset Auth Update" ON storage.objects;
DROP POLICY IF EXISTS "Company Asset Auth Delete" ON storage.objects;

-- 3. Create Allow Policies for 'company-asset'

-- READ: Everyone (Public - so the logo displays on login page)
CREATE POLICY "Company Asset Public Read"
ON storage.objects FOR SELECT
USING ( bucket_id = 'company-asset' );

-- INSERT: Authenticated Users Only (Admins/Techs)
CREATE POLICY "Company Asset Auth Insert"
ON storage.objects FOR INSERT
WITH CHECK ( bucket_id = 'company-asset' AND auth.role() = 'authenticated' );

-- UPDATE: Authenticated Users
CREATE POLICY "Company Asset Auth Update"
ON storage.objects FOR UPDATE
USING ( bucket_id = 'company-asset' AND auth.role() = 'authenticated' );

-- DELETE: Authenticated Users
CREATE POLICY "Company Asset Auth Delete"
ON storage.objects FOR DELETE
USING ( bucket_id = 'company-asset' AND auth.role() = 'authenticated' );
