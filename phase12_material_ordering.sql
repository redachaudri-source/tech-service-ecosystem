-- Phase 12: Material Ordering Tracking
-- Adds columns to track if material has been ordered by admin and from which supplier

ALTER TABLE tickets 
ADD COLUMN IF NOT EXISTS material_ordered BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS material_supplier TEXT;

-- Trigger to log history if needed? Not strictly necessary for this simple flag, 
-- but good to know when it changed. We can just rely on the UI updating the row.
