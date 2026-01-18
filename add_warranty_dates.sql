ALTER TABLE tickets 
ADD COLUMN IF NOT EXISTS warranty_until TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS warranty_labor_until TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS warranty_parts_until TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS warranty_labor_months INTEGER,
ADD COLUMN IF NOT EXISTS warranty_parts_months INTEGER;

-- Reload schema cache
NOTIFY pgrst, 'reload schema';
