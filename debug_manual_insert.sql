-- DIAGRNOSTIC: Manual Insert Test
-- Run this to see the EXACT error message that is hidden by the UI

DO $$
DECLARE
  next_id INT;
BEGIN
  -- 1. Get next ID
  SELECT COALESCE(MAX(friendly_id), 0) + 1 INTO next_id FROM public.profiles;
  RAISE NOTICE 'Calculated Next ID: %', next_id;

  -- 2. Attempt Manual Insert (Simulate the Trigger)
  -- We use a random UUID to avoid ID conflict, but real data types
  INSERT INTO public.profiles (
    id, 
    full_name, 
    role, 
    email, 
    dni, 
    username, 
    friendly_id
  )
  VALUES (
    gen_random_uuid(), -- Random ID
    'Test User Debug',
    'tech',             -- Try with 'tech' to check Enum/Text issue
    'test_debug@example.com',
    '12345678X',        -- Dummy DNI
    'test_user_debug',
    next_id
  );
  
  -- If we get here, it worked!
  RAISE NOTICE 'Success! Insert worked fine.';
  
  -- Rollback so we don't actually save this garbage
  RAISE EXCEPTION 'Test Complete (Please ignore this rollback error)';

EXCEPTION WHEN OTHERS THEN
  -- Capture the REAL error
  RAISE NOTICE '---------------------------------------------------';
  RAISE NOTICE '❌ REAL ERROR FOUND: %', SQLERRM;
  RAISE NOTICE '---------------------------------------------------';
END;
$$;
