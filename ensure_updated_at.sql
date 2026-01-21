-- Ensure updated_at column and trigger exist on tickets table
-- This guarantees we can sort by "Last Activity"

-- 1. Ensure column exists
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- 2. Create flexible update function if moddatetime isn't available
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 3. Create Trigger (Drop first to avoid duplicates)
DROP TRIGGER IF EXISTS update_tickets_updated_at ON tickets;

CREATE TRIGGER update_tickets_updated_at
    BEFORE UPDATE ON tickets
    FOR EACH ROW
    EXECUTE PROCEDURE update_updated_at_column();
