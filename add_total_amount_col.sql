ALTER TABLE tickets 
ADD COLUMN IF NOT EXISTS total_amount NUMERIC(10,2) DEFAULT 0;

COMMENT ON COLUMN tickets.total_amount IS 'Total cost of the service including VAT';
