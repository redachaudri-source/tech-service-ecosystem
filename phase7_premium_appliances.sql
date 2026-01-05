-- Add new photo columns to client_appliances
ALTER TABLE public.client_appliances
ADD COLUMN IF NOT EXISTS photo_model TEXT,
ADD COLUMN IF NOT EXISTS photo_location TEXT,
ADD COLUMN IF NOT EXISTS photo_overview TEXT;

-- We already have photo_url, we might migrate data if needed, 
-- but for now we'll keep photo_url as a fallback or alias for photo_overview if strictly needed, 
-- or just deprecate it in favor of the specific ones. 
-- For simplicity, we will use the new columns for the new detailed view.

-- Ensure RLS allows updates (covered by existing policies)
