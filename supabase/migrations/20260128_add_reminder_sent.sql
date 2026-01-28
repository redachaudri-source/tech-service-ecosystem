-- Migration: Add reminder_sent column to tickets table
-- Purpose: Track whether 24h reminder has been sent to avoid duplicates

ALTER TABLE tickets 
ADD COLUMN IF NOT EXISTS reminder_sent BOOLEAN DEFAULT FALSE;

-- Create index for efficient querying of tickets needing reminders
CREATE INDEX IF NOT EXISTS idx_tickets_reminder_pending 
ON tickets (scheduled_at, reminder_sent) 
WHERE reminder_sent = FALSE OR reminder_sent IS NULL;

COMMENT ON COLUMN tickets.reminder_sent IS '24h reminder WhatsApp notification sent flag';
