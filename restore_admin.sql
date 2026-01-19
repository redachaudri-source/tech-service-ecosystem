-- Restore Admin Profile for reda@example.com
INSERT INTO public.profiles (
    id, 
    user_id, 
    email, 
    full_name, 
    role, 
    is_active, 
    is_super_admin, 
    permissions,
    created_via,
    status
) VALUES (
    '5b1417b1-8f3c-478e-a143-f09599ad6d76', -- UUID obtained from auth.users
    '5b1417b1-8f3c-478e-a143-f09599ad6d76', -- Same UUID
    'reda@example.com',
    'Reda Admin', -- Placeholder name
    'admin',
    true,
    true, -- Super Admin privileges
    '{"can_manage_team": true, "can_delete_tickets": true, "can_manage_inventory": true, "can_view_all_clients": true, "can_view_all_tickets": true}'::jsonb,
    'script',
    'active'
) ON CONFLICT (id) DO UPDATE SET 
    role = 'admin',
    is_super_admin = true,
    is_active = true,
    status = 'active';

SELECT * FROM profiles WHERE email = 'reda@example.com';
