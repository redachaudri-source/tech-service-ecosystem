-- Add payment_proof_url to tickets table
ALTER TABLE tickets 
ADD COLUMN IF NOT EXISTS payment_proof_url TEXT;

-- Create Storage Bucket for Payment Proofs (if not exists)
INSERT INTO storage.buckets (id, name, public)
VALUES ('payment-proofs', 'payment-proofs', true)
ON CONFLICT (id) DO NOTHING;

-- Storage Policies
-- 1. Allow authenticated users to upload
CREATE POLICY "Allow authenticated uploads"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'payment-proofs');

-- 2. Allow public read access (so we can display the image)
CREATE POLICY "Allow public read"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'payment-proofs');

-- 3. Allow users to update their own uploads (optional, but good)
CREATE POLICY "Allow individual updates"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'payment-proofs');
