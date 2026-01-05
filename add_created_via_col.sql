ALTER TABLE tickets 
ADD COLUMN IF NOT EXISTS created_via TEXT DEFAULT 'manual';

COMMENT ON COLUMN tickets.created_via IS 'Technical source: manual, web_form, budget_conversion, admin_panel';
