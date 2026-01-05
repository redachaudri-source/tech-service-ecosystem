-- Add status_history column to tickets table to track state changes
ALTER TABLE tickets 
ADD COLUMN IF NOT EXISTS status_history JSONB DEFAULT '[]'::jsonb;

-- Update existing tickets to have an initial history entry based on created_at
UPDATE tickets 
SET status_history = jsonb_build_array(
    jsonb_build_object(
        'status', 'solicitado', 
        'label', 'Creado Inicialmente', 
        'timestamp', created_at
    )
)
WHERE status_history IS NULL OR status_history = '[]'::jsonb;
