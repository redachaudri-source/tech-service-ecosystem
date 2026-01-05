-- Add payment columns to tickets
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS payment_deposit NUMERIC(10,2) DEFAULT 0;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS payment_terms TEXT;

-- Verify
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'tickets';
