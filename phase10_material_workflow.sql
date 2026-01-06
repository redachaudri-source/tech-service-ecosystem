-- Phase 10: Material & Down Payment Workflow

-- 1. Add 'pendiente_material' to ticket_status enum
-- Safe addition (Supabase/Postgres specific)
ALTER TYPE ticket_status ADD VALUE IF NOT EXISTS 'pendiente_material';

-- 2. Add columns to tickets table
-- We already have deposit_amount from previous phases (checked in create_budgets_table, but verify it exists on tickets too. 
-- In TechTicketDetail, we saw 'deposit_amount' being used. 
-- If it's missing from table definition, we add it. If it exists, this is harmless.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tickets' AND column_name = 'deposit_amount') THEN
        ALTER TABLE tickets ADD COLUMN deposit_amount NUMERIC(10,2) DEFAULT 0;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tickets' AND column_name = 'required_parts_description') THEN
        ALTER TABLE tickets ADD COLUMN required_parts_description TEXT;
    END IF;

    -- Add a timestamp for when it entered pending material status to sort/track
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tickets' AND column_name = 'material_status_at') THEN
        ALTER TABLE tickets ADD COLUMN material_status_at TIMESTAMPTZ;
    END IF;
END $$;
