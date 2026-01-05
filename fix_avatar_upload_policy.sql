-- Fix Avatars Bucket Permissions for Mobile Uploads

-- 1. Ensure bucket exists and is public
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- 2. Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "Public Access" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated Upload" ON storage.objects;
DROP POLICY IF EXISTS "Admin Update" ON storage.objects;
DROP POLICY IF EXISTS "Avatar Public Select" ON storage.objects;
DROP POLICY IF EXISTS "Avatar Auth Insert" ON storage.objects;
DROP POLICY IF EXISTS "Avatar Auth Update" ON storage.objects;

-- 3. Create permissive policies for 'avatars' bucket

-- Allow EVERYONE to view avatars (Public Read)
CREATE POLICY "Avatar Public Select"
ON storage.objects FOR SELECT
USING ( bucket_id = 'avatars' );

-- Allow Authenticated Users (Admins/Techs) to UPLOAD files
-- Note: 'authenticated' role includes signed-in admins
CREATE POLICY "Avatar Auth Insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK ( bucket_id = 'avatars' );

-- Allow Authenticated Users to UPDATE their files (or overwrite)
CREATE POLICY "Avatar Auth Update"
ON storage.objects FOR UPDATE
TO authenticated
USING ( bucket_id = 'avatars' );

-- Allow Authenticated to DELETE (optional, good for cleanup)
CREATE POLICY "Avatar Auth Delete"
ON storage.objects FOR DELETE
TO authenticated
USING ( bucket_id = 'avatars' );

