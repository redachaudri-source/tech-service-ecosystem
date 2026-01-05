-- Diagnostic: Check Enum Values and Latest Profiles

-- 1. Check permissible values for 'app_role'
SELECT enum_range(NULL::app_role) as allowed_roles;

-- 2. Check the last 5 registered users
SELECT id, full_name, email, role, created_at 
FROM public.profiles 
ORDER BY created_at DESC 
LIMIT 5;
