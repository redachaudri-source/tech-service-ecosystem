-- Phase 6: Client Power-Up Migration (FIXED)

-- 1. Create client_appliances table (Idempotent)
CREATE TABLE IF NOT EXISTS client_appliances (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    client_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    brand TEXT NOT NULL,
    model TEXT,
    serial_number TEXT,
    location TEXT,
    photo_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. RLS for client_appliances
ALTER TABLE client_appliances ENABLE ROW LEVEL SECURITY;

-- Safely create policies (drop first to avoid errors if re-running)
DROP POLICY IF EXISTS "Clients can view own appliances" ON client_appliances;
CREATE POLICY "Clients can view own appliances" 
    ON client_appliances FOR SELECT 
    USING (auth.uid() = client_id);

DROP POLICY IF EXISTS "Clients can insert own appliances" ON client_appliances;
CREATE POLICY "Clients can insert own appliances" 
    ON client_appliances FOR INSERT 
    WITH CHECK (auth.uid() = client_id);

DROP POLICY IF EXISTS "Clients can update own appliances" ON client_appliances;
CREATE POLICY "Clients can update own appliances" 
    ON client_appliances FOR UPDATE 
    USING (auth.uid() = client_id);

DROP POLICY IF EXISTS "Clients can delete own appliances" ON client_appliances;
CREATE POLICY "Clients can delete own appliances" 
    ON client_appliances FOR DELETE 
    USING (auth.uid() = client_id);

-- 3. Add 'presupuesto_aceptado' to ticket_status ENUM
-- We use a DO block to prevent errors if the value already exists
DO $$
BEGIN
    ALTER TYPE ticket_status ADD VALUE 'presupuesto_aceptado';
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Note: We are NOT touching table constraints because it's a native ENUM. 
-- The value addition above is sufficient.
