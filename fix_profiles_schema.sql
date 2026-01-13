-- Fix for missing columns in 'profiles' table

-- 1. Add contact_email if it doesn't exist
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS contact_email text;

-- 2. Add Geo-Ready address columns (Just in case they are also missing)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS postal_code text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS city text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS province text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS street_type text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS street_name text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS street_number text;

-- 3. Add username if it doesn't exist (referenced in code)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS username text;

-- 4. Add dni if it doesn't exist (referenced in code)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS dni text;
