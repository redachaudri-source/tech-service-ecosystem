-- Allow Service Role and authenticated users to manage config
ALTER TABLE business_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access" 
ON business_config FOR SELECT 
USING (true);

CREATE POLICY "Allow full access for authenticated/anon for setup" 
ON business_config FOR ALL 
USING (true) 
WITH CHECK (true);
