-- Add material_received column to track if the part has physically arrived
ALTER TABLE tickets 
ADD COLUMN IF NOT EXISTS material_received BOOLEAN DEFAULT FALSE;

-- Ensure it's false by default for existing records
UPDATE tickets SET material_received = FALSE WHERE material_received IS NULL;
