-- Add company_iban to company_settings
ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS company_iban TEXT;

-- Verify
SELECT * FROM company_settings LIMIT 1;
