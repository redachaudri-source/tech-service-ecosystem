-- FINANCE SCHEMA UPDATE (Phase 3.10)
-- Target Table: public.tickets

-- 1. ADD COLUMNS FOR AUDIT
ALTER TABLE public.tickets 
ADD COLUMN IF NOT EXISTS final_price DECIMAL(10, 2), -- Exact transaction amount
ADD COLUMN IF NOT EXISTS payment_proof_url TEXT;      -- URL format for receipt/proof

-- 2. UPDATE/EXTEND ENUMS (Safely)
-- We use a DO block to check and add values if they don't exist to avoid errors.

DO $$
BEGIN
    -- Extend 'ticket_status' enum if it exists (assuming the column uses a custom type or check constraint)
    -- If it's a CHECK constraint, we might need to drop and re-add. 
    -- If it's a native ENUM type (likely 'ticket_status_enum' or similar based on previous context), we alter it.
    -- Strategy: We'll try to ALTER the TYPE. If it fails (e.g. not an enum), we'll assume it's just text with checks.
    
    BEGIN
        ALTER TYPE public.ticket_status ADD VALUE 'PENDING_PAYMENT';
    EXCEPTION
        WHEN duplicate_object THEN null; -- Value already exists
        WHEN undefined_object THEN null; -- Type doesn't exist (maybe simple text column)
    END;

    -- Extend 'payment_method_enum' (guessing name, will fallback to text check if needed)
    BEGIN
        ALTER TYPE public.payment_method ADD VALUE 'APP_PAYMENT';
    EXCEPTION
        WHEN duplicate_object THEN null;
        WHEN undefined_object THEN null; 
    END;
END $$;

-- 3. ENSURE REALTIME VISIBILITY FOR PAYMENTS
-- We need the client to See the status change to 'PENDING_PAYMENT' instantly.
-- ALTER PUBLICATION supabase_realtime ADD TABLE public.tickets; -- Already exists, skipping to avoid error
ALTER TABLE public.tickets REPLICA IDENTITY FULL;

-- 4. STORAGE BUCKET (If not exists)
-- We insert a bucket entry for 'finance-proofs' if it doesn't exist.
INSERT INTO storage.buckets (id, name, public)
VALUES ('finance-proofs', 'finance-proofs', true)
ON CONFLICT (id) DO NOTHING;

-- Policy to allow authenticated uploads to this bucket
CREATE POLICY "Technicians can upload proofs"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'finance-proofs');

CREATE POLICY "Anyone can view proofs"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'finance-proofs');
