-- DIAGNOSIS: Why can't Reda see his tickets?

-- 1. Get Reda's ID
SELECT id, full_name, role, email FROM public.profiles WHERE full_name ILIKE '%Reda%';

-- 2. Check the latest tickets and their assignment
SELECT id, title, technician_id, status, created_at 
FROM public.tickets 
ORDER BY created_at DESC 
LIMIT 5;

-- 3. Check RLS Policies on Tickets table
SELECT policyname, cmd, roles, qual
FROM pg_policies 
WHERE tablename = 'tickets';
