-- FIX TIPO DE DATOS: TEXT vs USER_ROLE
-- El error "column role is of type user_role but expression is of type text"
-- ocurre porque PostgreSQL es estricto con los tipos. Hay que convertir (castear) el texto.

-- 1. CORREGIR LA FUNCIÓN ROBOT (TRIGGER)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, role)
  VALUES (
    new.id,
    new.raw_user_meta_data->>'full_name',
    new.email,
    -- AQUÍ ESTÁ EL CAMBIO: ::public.user_role
    COALESCE(new.raw_user_meta_data->>'role', 'client')::public.user_role
  ) ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$;

-- 2. RECUPERAR USUARIOS (Con el cast correcto)
INSERT INTO public.profiles (id, full_name, email, role, permissions)
SELECT 
  id, 
  COALESCE(raw_user_meta_data->>'full_name', email), 
  email, 
  -- AQUÍ TAMBIÉN: ::public.user_role
  COALESCE(raw_user_meta_data->>'role', 'client')::public.user_role,
  CASE 
    WHEN (raw_user_meta_data->>'role') = 'admin' THEN 
      jsonb_build_object(
        'can_manage_team', true, 'can_manage_inventory', true, 
        'can_view_all_tickets', true, 'can_view_all_clients', true, 'can_delete_tickets', true
      )
    ELSE '{}'::jsonb 
  END
FROM auth.users
WHERE id NOT IN (SELECT id FROM public.profiles);
