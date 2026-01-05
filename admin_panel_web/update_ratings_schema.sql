-- Add rating and feedback to tickets table
ALTER TABLE tickets 
ADD COLUMN IF NOT EXISTS rating INTEGER CHECK (rating >= 1 AND rating <= 5),
ADD COLUMN IF NOT EXISTS client_feedback TEXT;

COMMENT ON COLUMN tickets.rating IS 'Customer rating (1-5 stars)';
COMMENT ON COLUMN tickets.client_feedback IS 'Text feedback from the customer';
