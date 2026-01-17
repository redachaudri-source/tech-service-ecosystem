-- Add status column to profiles if it doesn't exist
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'status') THEN 
        ALTER TABLE public.profiles ADD COLUMN status TEXT DEFAULT 'active'; 
    END IF; 
END $$;

-- Update existing techs to active if null
UPDATE public.profiles SET status = 'active' WHERE role = 'tech' AND status IS NULL;

-- Enable Realtime done manually or already exists
-- ALTER PUBLICATION supabase_realtime ADD TABLE profiles;
