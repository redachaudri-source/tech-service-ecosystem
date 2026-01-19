-- DELETE EVERYONE EXCEPT REDA
DELETE FROM profiles 
WHERE email NOT ILIKE 'reda@example.com'; 

-- Ensure Reda is Super Admin
UPDATE profiles
SET is_super_admin = true, role = 'admin', status = 'active'
WHERE email = 'reda@example.com';
