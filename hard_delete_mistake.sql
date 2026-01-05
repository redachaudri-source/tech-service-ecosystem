-- CLEANUP: Hard Delete 'Usuario Rescatado'
-- WARNING: This deletes the user PERMANENTLY. Only for fixing created mistakes.

-- 1. Get the ID of the 'Rescue Mode' user
DO $$
DECLARE
  target_id UUID;
BEGIN
  -- Search for the user by the default rescue name
  SELECT id INTO target_id FROM public.profiles 
  WHERE full_name = 'Usuario Rescatado' 
  OR full_name = 'Usuario' -- In case it was the other default
  ORDER BY created_at DESC LIMIT 1;

  IF target_id IS NOT NULL THEN
    -- 2. Delete from Profiles (Hard Delete)
    DELETE FROM public.profiles WHERE id = target_id;
    
    -- 3. Delete from Auth (To free up the email)
    DELETE FROM auth.users WHERE id = target_id;
    
    RAISE NOTICE 'Deleted user % successfully.', target_id;
  ELSE
    RAISE NOTICE 'No user found with that name.';
  END IF;
END $$;
