ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS has_mortify BOOLEAN DEFAULT FALSE;

-- Notify schema reload
NOTIFY pgrst, 'reload schema';
