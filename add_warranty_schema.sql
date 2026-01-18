ALTER TABLE tickets 
ADD COLUMN IF NOT EXISTS is_warranty BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS original_ticket_id UUID REFERENCES tickets(id),
ADD COLUMN IF NOT EXISTS warranty_until TIMESTAMPTZ, -- General expiration (max of both)
ADD COLUMN IF NOT EXISTS warranty_labor_until TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS warranty_parts_until TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS warranty_labor_months INT DEFAULT 3, -- Default setting
ADD COLUMN IF NOT EXISTS warranty_parts_months INT DEFAULT 24; -- Default setting (2 years per law usually)

-- Index for searching warranty claims
CREATE INDEX IF NOT EXISTS idx_tickets_original_ticket_id ON tickets(original_ticket_id);
CREATE INDEX IF NOT EXISTS idx_tickets_warranty_until ON tickets(warranty_until);

-- Comments
COMMENT ON COLUMN tickets.is_warranty IS 'If true, this ticket is a warranty claim';
COMMENT ON COLUMN tickets.warranty_labor_until IS 'Expiration of Labor Warranty';
COMMENT ON COLUMN tickets.warranty_parts_until IS 'Expiration of Parts Warranty';
