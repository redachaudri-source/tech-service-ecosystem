-- Add missing columns to client_appliances
ALTER TABLE public.client_appliances 
ADD COLUMN IF NOT EXISTS purchase_date DATE,
ADD COLUMN IF NOT EXISTS warranty_expiry DATE;

-- Ensure RLS allows insert/update on these columns (Implicit in 'FOR ALL' or 'FOR INSERT')
-- The existing policies cover the whole table, so no new policy needed.
