-- Add link_ticket_id for warranty chains
ALTER TABLE tickets 
ADD COLUMN IF NOT EXISTS link_ticket_id UUID REFERENCES tickets(id);

-- Reload schema
NOTIFY pgrst, 'reload schema';
