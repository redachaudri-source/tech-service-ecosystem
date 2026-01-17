-- Add status_reason column to profiles if it doesn't exist
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'status_reason') THEN 
        ALTER TABLE public.profiles ADD COLUMN status_reason TEXT; 
    END IF; 
END $$;
