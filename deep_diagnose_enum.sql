-- DETECTIVE: Enum & Constraint Deep Dive

-- 1. Get the Exact Type Name of the 'role' column
SELECT column_name, udt_name, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'profiles' AND column_name = 'role';

-- 2. List all constraints on the 'profiles' table (Check for Check Constraints)
SELECT conname, pg_get_constraintdef(oid) 
FROM pg_constraint 
WHERE conrelid = 'public.profiles'::regclass;

-- 3. (Attempt 2) List Enum Values if we can guess the type name from step 1
-- Since we don't have the result yet, we try the most common names.
-- If these fail, we will rely on the output of Step 1 to write the next query.
SELECT t.typname, e.enumlabel
FROM pg_type t
JOIN pg_enum e ON t.oid = e.enumtypid
WHERE t.typname IN ('app_role', 'user_role', 'role_type', 'roles');

-- 4. Check 'friendly_id' nullability again
SELECT column_name, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'profiles' AND column_name = 'friendly_id';
