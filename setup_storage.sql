-- Create a new private bucket 'service-attachments' if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('service-attachments', 'service-attachments', true)
ON CONFLICT (id) DO NOTHING;

-- Policy to allow authenticated users to upload files
CREATE POLICY "Allow authenticated uploads"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'service-attachments');

-- Policy to allow public to view files (since we made it public, but strict RLS might block)
CREATE POLICY "Allow public select"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'service-attachments');
