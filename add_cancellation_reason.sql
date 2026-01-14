-- Add cancellation_reason to tickets table
ALTER TABLE tickets 
ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;

-- Refresh schema cache check (optional comment)
COMMENT ON COLUMN tickets.cancellation_reason IS 'Reason provided by client when cancelling service';
