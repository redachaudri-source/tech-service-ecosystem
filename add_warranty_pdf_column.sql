-- Add warranty_pdf_url column to tickets table
ALTER TABLE tickets 
ADD COLUMN IF NOT EXISTS warranty_pdf_url TEXT;

-- Reload schema cache
NOTIFY pgrst, 'reload schema';
