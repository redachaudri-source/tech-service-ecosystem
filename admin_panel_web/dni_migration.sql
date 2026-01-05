-- Add DNI and Friendly ID to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS dni text,
ADD COLUMN IF NOT EXISTS friendly_id serial;

-- Ensure DNI is unique (but be careful with soft deletes if we want to allow re-registration with same DNI? No, we restore).
-- So unique index should probably include deleted_at?
-- Actually, if we use soft delete, the row is still there. So a simple UNIQUE constraint prevents duplicates, which is what we want.
-- If they try to create a new one with same DNI, we find the deleted one and restore it.
ALTER TABLE public.profiles ADD CONSTRAINT profiles_dni_key UNIQUE (dni);
