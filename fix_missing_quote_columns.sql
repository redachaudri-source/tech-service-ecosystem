-- Add missing columns for Quote PDF management
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS quote_pdf_url TEXT;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS quote_generated_at TIMESTAMP WITH TIME ZONE;

-- Optional: Add a comment or verify
COMMENT ON COLUMN tickets.quote_pdf_url IS 'URL of the generated quote PDF';
