-- Add Smart Data columns to client_appliances table
ALTER TABLE client_appliances
ADD COLUMN IF NOT EXISTS housing_type text, -- 'PISO', 'CASA_MATA', 'CHALET', 'BARCO'
ADD COLUMN IF NOT EXISTS floor_level integer DEFAULT 0, -- Only for PISO
ADD COLUMN IF NOT EXISTS purchase_year integer; -- Explicit year for easier processing

-- Optional: Update purchase_year from existing purchase_date if available
UPDATE client_appliances 
SET purchase_year = CAST(EXTRACT(YEAR FROM CAST(purchase_date AS DATE)) AS INTEGER)
WHERE purchase_date IS NOT NULL AND purchase_year IS NULL;
