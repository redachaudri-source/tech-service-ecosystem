-- Add estimated_duration column to tickets table
ALTER TABLE tickets 
ADD COLUMN IF NOT EXISTS estimated_duration INTEGER DEFAULT 60; -- Duration in minutes, default 1 hour

COMMENT ON COLUMN tickets.estimated_duration IS 'Estimated service duration in minutes';
