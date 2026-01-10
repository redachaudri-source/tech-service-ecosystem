-- Debug Profiles Data
SELECT 
    role, 
    created_via, 
    COUNT(*) 
FROM profiles 
GROUP BY role, created_via;
