-- Add 'cita_rechazada' to ticket status allowed values
-- This status is used when the client rejects or times out on slot proposals
-- The bot will not reprocess tickets with this status until they are reset to 'solicitado'

-- If there's a check constraint on status, we need to drop and recreate it
-- First, check if status column is TEXT or ENUM

DO $$
BEGIN
    -- Try to add the new value to enum if it exists
    IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ticket_status_enum') THEN
        -- Add to enum type
        ALTER TYPE ticket_status_enum ADD VALUE IF NOT EXISTS 'cita_rechazada';
    END IF;
END $$;

-- If status is TEXT with a CHECK constraint, update it
DO $$
DECLARE
    constraint_name TEXT;
BEGIN
    -- Find and drop any check constraint on status column
    SELECT con.conname INTO constraint_name
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
    WHERE rel.relname = 'tickets'
      AND att.attname = 'status'
      AND con.contype = 'c';
    
    IF constraint_name IS NOT NULL THEN
        EXECUTE 'ALTER TABLE tickets DROP CONSTRAINT ' || constraint_name;
        
        -- Recreate with the new value included
        EXECUTE 'ALTER TABLE tickets ADD CONSTRAINT tickets_status_check CHECK (status IN (
            ''nuevo'', ''solicitado'', ''asignado'', ''en_diagnostico'', 
            ''presupuesto_pendiente'', ''presupuesto_revision'', ''presupuesto_aceptado'',
            ''en_proceso'', ''en_reparacion'', ''finalizado'', ''pagado'', ''cancelado'',
            ''cita_rechazada'', ''en_camino'', ''trabajando'', ''pendiente_material''
        ))';
    END IF;
END $$;
