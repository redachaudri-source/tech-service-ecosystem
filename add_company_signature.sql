-- Add company_signature_url to company_settings
ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS company_signature_url TEXT;

-- Verify
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'company_settings' AND column_name = 'company_signature_url';
