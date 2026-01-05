-- Add status_history to track timeline
ALTER TABLE tickets 
ADD COLUMN IF NOT EXISTS status_history JSONB DEFAULT '[]'::jsonb;

-- Add quote_pdf_url to store the generated quote
ALTER TABLE tickets 
ADD COLUMN IF NOT EXISTS quote_pdf_url TEXT;

-- Update status check constraint to include 'presupuesto_pendiente'
-- dependent on how constraint was defined. If it's a text check:
ALTER TABLE tickets DROP CONSTRAINT IF EXISTS tickets_status_check;
ALTER TABLE tickets ADD CONSTRAINT tickets_status_check 
CHECK (status IN ('solicitado', 'asignado', 'en_camino', 'en_diagnostico', 'presupuesto_pendiente', 'en_reparacion', 'finalizado', 'cancelado', 'rejected'));

-- Update existing rows to have initial history (optional, to avoid nulls)
UPDATE tickets SET status_history = jsonb_build_array(
    jsonb_build_object(
        'status', status, 
        'timestamp', created_at, 
        'label', 'Creación del Ticket'
    )
) WHERE status_history IS NULL OR status_history = '[]'::jsonb;
