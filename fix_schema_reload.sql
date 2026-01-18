-- Ensure updated_at exists
ALTER TABLE tickets 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
