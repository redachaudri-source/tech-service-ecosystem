-- Add deleted_at column to profiles for Soft Delete functionality
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS deleted_at timestamp with time zone DEFAULT NULL;

-- Update RLS policies (optional, but good practice if you want to hide deleted users from general queries)
-- However, for now we will filter them in the frontend to avoid breaking existing queries.
