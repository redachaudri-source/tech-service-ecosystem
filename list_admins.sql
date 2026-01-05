-- FIND SUPER ADMIN
SELECT id, full_name, email, role, created_at 
FROM public.profiles 
WHERE role = 'admin' 
ORDER BY created_at ASC;
