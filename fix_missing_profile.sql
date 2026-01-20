INSERT INTO public.profiles (id, email, full_name, role)
SELECT 
    id, 
    email, 
    -- Try full_name, then concat first/last, then fallback
    COALESCE(
        raw_user_meta_data->>'full_name', 
        CASE 
            WHEN raw_user_meta_data->>'first_name' IS NOT NULL THEN 
                (raw_user_meta_data->>'first_name' || ' ' || COALESCE(raw_user_meta_data->>'last_name', ''))
            ELSE 'Usuario Recuperado'
        END
    ), 
    'client'
FROM auth.users
WHERE id = '646fc4b0-aeb1-40bf-9309-100c07741dae'
ON CONFLICT (id) DO UPDATE
SET 
  full_name = EXCLUDED.full_name,
  email = EXCLUDED.email,
  role = 'client';
