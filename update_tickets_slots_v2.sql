-- Add proposed_slots column to tickets table
ALTER TABLE tickets 
ADD COLUMN proposed_slots JSONB DEFAULT '[]'::jsonb;

-- Comment on column
COMMENT ON COLUMN tickets.proposed_slots IS 'Array of alternate appointment slots proposed by admin: [{date: "YYYY-MM-DD", time: "HH:MM"}]';
