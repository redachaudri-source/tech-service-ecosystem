-- Create Technician Locations Table for Real-time GPS
CREATE TABLE IF NOT EXISTS technician_locations (
    technician_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    heading DOUBLE PRECISION DEFAULT 0, -- Direction (0-360)
    speed DOUBLE PRECISION DEFAULT 0, -- Speed in m/s or km/h
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE technician_locations ENABLE ROW LEVEL SECURITY;

-- Policies

-- 1. Technicians can INSERT/UPDATE their own location
CREATE POLICY "Technicians update own location" ON technician_locations
    FOR ALL
    USING (auth.uid() = technician_id)
    WITH CHECK (auth.uid() = technician_id);

-- 2. Everyone authenticated (Admins & Clients with active tickets) can READ
-- Ideally we would restrict clients to only see their assigned tech, 
-- but for performance/simplicity in MVP, authenticated read is acceptable.
CREATE POLICY "Authenticated users view locations" ON technician_locations
    FOR SELECT
    TO authenticated
    USING (true);

-- Enable Realtime
-- DO $$
-- BEGIN
--   IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
--     CREATE PUBLICATION supabase_realtime;
--   END IF;
-- END
-- $$;

ALTER PUBLICATION supabase_realtime ADD TABLE technician_locations;
