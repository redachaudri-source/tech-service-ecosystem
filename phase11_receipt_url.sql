-- Add column for Deposit Receipt PDF URL if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tickets' AND column_name = 'deposit_receipt_url') THEN
        ALTER TABLE tickets ADD COLUMN deposit_receipt_url TEXT;
    END IF;
END $$;
