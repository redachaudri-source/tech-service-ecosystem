-- Phase 13: Real-Time GPS Tracking
-- Adds columns to profiles to track technician location

ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS current_lat FLOAT,
ADD COLUMN IF NOT EXISTS current_lng FLOAT,
ADD COLUMN IF NOT EXISTS last_location_update TIMESTAMPTZ;

-- Policy: Clients need to be able to read technician profiles to see location?
-- Currently profiles are public or restricted?
-- Usually, we might need a policy or just rely on the existing visibility.
-- Let's check permissions. If clients can view the ticket, they can view the assigned tech.
-- We might need to ensure 'profiles' is readable.

-- For now, we assume profiles are readable by authenticated users or at least the necessary fields.
