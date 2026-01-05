-- MASTER FIX SCRIPT
-- Executes all necessary schema updates for the recent changes.
-- Run this ENTIRE block in the Supabase SQL Editor.

-- 1. Fix Budget Deletion (Foreign Key Constraint)
-- Allows deleting a ticket even if a budget refers to it (sets reference to NULL)
ALTER TABLE budgets
DROP CONSTRAINT IF EXISTS budgets_converted_ticket_id_fkey;

ALTER TABLE budgets
ADD CONSTRAINT budgets_converted_ticket_id_fkey
FOREIGN KEY (converted_ticket_id)
REFERENCES tickets(id)
ON DELETE SET NULL;

-- 2. Ensure Ticket Columns for PDF & Payments exist
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS quote_pdf_url TEXT;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS payment_deposit NUMERIC(10,2) DEFAULT 0;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS total_amount NUMERIC(10,2) DEFAULT 0;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS payment_terms TEXT;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS origin_source TEXT DEFAULT 'direct';
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS created_via TEXT DEFAULT 'manual';

-- 3. Ensure Company Settings for IBAN
ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS company_iban TEXT;

-- 4. Clean up "Phantom Lavadoras" in existing Tickets (Optional data cleanup)
-- Updates tickets that are generic but labeled as Lavadora with no brand
UPDATE tickets 
SET appliance_info = '{"type": "General"}'::jsonb
WHERE 
    appliance_info->>'type' = 'Lavadora' 
    AND (appliance_info->>'brand' IS NULL OR appliance_info->>'brand' = '')
    AND origin_source LIKE 'Presupuesto%';

