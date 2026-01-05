ALTER TABLE tickets 
ADD COLUMN IF NOT EXISTS origin_source TEXT DEFAULT 'direct';

COMMENT ON COLUMN tickets.origin_source IS 'Source of the ticket: direct, admin_budget, web_form, etc.';
