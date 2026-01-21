-- Create the storage bucket 'ticket-documents' if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('ticket-documents', 'ticket-documents', true)
ON CONFLICT (id) DO NOTHING;

-- 1. Permits Public Access (Read)
-- Drop if exists to avoid collision
DROP POLICY IF EXISTS "Public Access ticket-documents" ON storage.objects;
CREATE POLICY "Public Access ticket-documents"
ON storage.objects FOR SELECT
USING ( bucket_id = 'ticket-documents' );

-- 2. Permits Authenticated Uploads
DROP POLICY IF EXISTS "Authenticated users upload ticket-documents" ON storage.objects;
CREATE POLICY "Authenticated users upload ticket-documents"
ON storage.objects FOR INSERT
WITH CHECK ( bucket_id = 'ticket-documents' AND auth.role() = 'authenticated' );

-- 3. Permits Authenticated Updates
DROP POLICY IF EXISTS "Authenticated users update ticket-documents" ON storage.objects;
CREATE POLICY "Authenticated users update ticket-documents"
ON storage.objects FOR UPDATE
USING ( bucket_id = 'ticket-documents' AND auth.role() = 'authenticated' );
