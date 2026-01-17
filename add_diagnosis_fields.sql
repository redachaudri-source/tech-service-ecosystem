
-- Add columns to track diagnosis payment specifically
ALTER TABLE tickets 
ADD COLUMN IF NOT EXISTS diagnosis_paid NUMERIC(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS diagnosis_paid_at TIMESTAMPTZ;

-- Ensure status_history is a JSONB column (it should be already, but ensuring for Timeline feature)
-- (No action needed if it exists, assuming it does from previous context)
