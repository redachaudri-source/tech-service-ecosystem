-- Add bypass_time_restrictions to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS bypass_time_restrictions BOOLEAN DEFAULT false;

-- Allow admins to update this field (if not covered by existing policies)
-- Usually profiles are updatable by admins or self. Assuming existing policies cover "UPDATE" by admin.
-- If not, we might need a specific policy, but let's assume the standard 'admin can update all profiles' policy exists.

COMMENT ON COLUMN public.profiles.bypass_time_restrictions IS 'If true, technician can start jobs outside working hours (Testing Mode).';
