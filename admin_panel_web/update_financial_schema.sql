-- Create Service Catalog for pre-defined labor items
CREATE TABLE IF NOT EXISTS service_catalog (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name TEXT NOT NULL,
    base_price NUMERIC DEFAULT 0,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert Default Services (checks for duplicates by name if possible, but simplified here)
INSERT INTO service_catalog (name, base_price) VALUES 
('Desplazamiento Zona A', 30.00),
('Desplazamiento Zona B', 45.00),
('Mano de Obra (1 Hora)', 40.00),
('Mano de Obra (Fracción 30min)', 25.00),
('Diagnóstico / Presupuesto (Si no repara)', 20.00);

-- Add Financial Columns to Tickets
ALTER TABLE tickets 
ADD COLUMN IF NOT EXISTS tech_diagnosis TEXT,
ADD COLUMN IF NOT EXISTS tech_solution TEXT,
ADD COLUMN IF NOT EXISTS parts_list JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS labor_list JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS deposit_amount NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS is_paid BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS payment_method TEXT;

-- Enable RLS on service_catalog (Public read, Admin write)
ALTER TABLE service_catalog ENABLE ROW LEVEL SECURITY;

-- Policy to allow everyone to read (Client, Tech, Admin)
DROP POLICY IF EXISTS "Enable read access for all users" ON service_catalog;
CREATE POLICY "Enable read access for all users" ON service_catalog
    FOR SELECT USING (true);

-- Policy to allow only admins to modify (fixed role enum error)
DROP POLICY IF EXISTS "Enable write access for admins only" ON service_catalog;
CREATE POLICY "Enable write access for admins only" ON service_catalog
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'admin' 
        )
    );
