-- Add columns using standard SQL (Postgres 9.6+)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS postal_code text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS city text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS province text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS street_type text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS street_name text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS street_number text;
