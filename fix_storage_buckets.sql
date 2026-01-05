-- Create 'appliance-labels' bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('appliance-labels', 'appliance-labels', true)
ON CONFLICT (id) DO NOTHING;

-- RLS Policies for 'appliance-labels'
-- 1. Public Read Access
CREATE POLICY "Public Access to Appliance Labels"
ON storage.objects FOR SELECT
USING ( bucket_id = 'appliance-labels' );

-- 2. Authenticated Upload Access
CREATE POLICY "Authenticated Users can upload Appliance Labels"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'appliance-labels' 
  AND auth.role() = 'authenticated'
);

-- 3. Users can delete their own uploads (Optional, but good practice)
CREATE POLICY "Users can delete own Appliance Labels"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'appliance-labels'
  AND auth.uid() = owner
);
