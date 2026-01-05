-- Phase 9: Financial Workflow Enhancements
-- 1. Add `presupuesto_revision` to enum
ALTER TYPE ticket_status ADD VALUE IF NOT EXISTS 'presupuesto_revision';

-- 2. Add `quote_generated_at` to track validity duration
ALTER TABLE tickets 
ADD COLUMN IF NOT EXISTS quote_generated_at TIMESTAMP WITH TIME ZONE;
