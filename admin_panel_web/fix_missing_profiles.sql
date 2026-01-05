-- FIX: RECUPERAR USUARIOS "EN EL LIMBO"
-- Este script busca usuarios que se registraron cuando el trigger fallaba
-- y les crea su ficha de perfil manualmente.

INSERT INTO public.profiles (id, full_name, email, role, permissions)
SELECT 
  id, 
  COALESCE(raw_user_meta_data->>'full_name', email) as full_name, 
  email, 
  COALESCE(raw_user_meta_data->>'role', 'client') as role,
  -- Si es admin, le damos poderes por defecto
  CASE 
    WHEN (raw_user_meta_data->>'role') = 'admin' THEN 
      jsonb_build_object(
        'can_manage_team', true, 
        'can_manage_inventory', true, 
        'can_view_all_tickets', true, 
        'can_view_all_clients', true, 
        'can_delete_tickets', true
      )
    ELSE '{}'::jsonb 
  END as permissions
FROM auth.users
WHERE id NOT IN (SELECT id FROM public.profiles);

-- VERIFICACIÓN
SELECT * FROM public.profiles WHERE email LIKE '%sofia%';
