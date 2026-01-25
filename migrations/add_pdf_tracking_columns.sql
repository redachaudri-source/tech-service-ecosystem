-- Migration: Add PDF sending tracking columns to tickets table
-- Run this in Supabase SQL Editor

-- Add column for when PDF was sent
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS pdf_sent_at TIMESTAMPTZ;

-- Add column for which channel was used ('whatsapp', 'email', 'both')
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS pdf_sent_via TEXT;

-- Add column for the phone/email used (in case alternative number was used)
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS pdf_sent_to TEXT;

-- Create index for faster queries on sent status
CREATE INDEX IF NOT EXISTS idx_tickets_pdf_sent_at ON tickets(pdf_sent_at);

-- Verify columns were added
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'tickets' 
AND column_name IN ('pdf_sent_at', 'pdf_sent_via', 'pdf_sent_to');
