-- Safely add columns if they don't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'business_config' AND column_name = 'opening_time') THEN
        ALTER TABLE business_config ADD COLUMN opening_time TEXT DEFAULT '09:00';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'business_config' AND column_name = 'closing_time') THEN
        ALTER TABLE business_config ADD COLUMN closing_time TEXT DEFAULT '19:00';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'business_config' AND column_name = 'working_hours') THEN
        ALTER TABLE business_config ADD COLUMN working_hours JSONB;
    END IF;
END $$;

-- Enable RLS just in case
ALTER TABLE business_config ENABLE ROW LEVEL SECURITY;

-- Re-apply Policy (Drop first to avoid error if exists)
DROP POLICY IF EXISTS "Allow read access to authenticated users" ON business_config;
CREATE POLICY "Allow read access to authenticated users" ON business_config FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow update access to authenticated users" ON business_config;
CREATE POLICY "Allow update access to authenticated users" ON business_config FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Ensure at least one row exists
INSERT INTO business_config (opening_time, closing_time)
SELECT '09:00', '19:00'
WHERE NOT EXISTS (SELECT 1 FROM business_config);
