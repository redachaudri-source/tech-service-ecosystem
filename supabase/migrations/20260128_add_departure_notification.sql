-- 3.3.7: Add departure notification tracking
-- Prevents duplicate notifications when technician changes to "en_camino"

ALTER TABLE tickets 
ADD COLUMN IF NOT EXISTS departure_notification_sent BOOLEAN DEFAULT FALSE;

-- Add comment for documentation
COMMENT ON COLUMN tickets.departure_notification_sent IS 'Flag to prevent duplicate ON_DEPARTURE notifications when status changes to en_camino';
