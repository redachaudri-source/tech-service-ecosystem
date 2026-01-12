-- Create business_config table if it doesn't exist
CREATE TABLE IF NOT EXISTS business_config (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    opening_time TEXT DEFAULT '08:00',
    closing_time TEXT DEFAULT '20:00',
    working_hours JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE business_config ENABLE ROW LEVEL SECURITY;

-- Policy: Allow read access to authenticated users
CREATE POLICY "Allow read access to authenticated users" ON business_config
    FOR SELECT
    TO authenticated
    USING (true);

-- Policy: Allow update access to admins (assuming logic handled by app, or allow all auth for now)
CREATE POLICY "Allow update access to authenticated users" ON business_config
    FOR UPDATE
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- Insert default config if empty
INSERT INTO business_config (opening_time, closing_time)
SELECT '09:00', '19:00'
WHERE NOT EXISTS (SELECT 1 FROM business_config);
