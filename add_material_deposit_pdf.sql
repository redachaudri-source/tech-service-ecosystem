-- Add column for material deposit PDF URL
-- This PDF is generated when a technician requests material with an advance payment
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS material_deposit_pdf_url TEXT;

-- Verify column exists
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'tickets' AND column_name = 'material_deposit_pdf_url';
