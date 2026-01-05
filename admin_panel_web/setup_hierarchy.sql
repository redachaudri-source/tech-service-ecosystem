-- 1. COLUMNA DE JERARQUÍA (is_super_admin)
-- Esto distingue al "Dueño" de los "Empleados Admin".
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS is_super_admin boolean DEFAULT false;

-- 2. NOMBRAR AL JEFE (Tú)
-- Asumimos que tu email es el del super admin.
UPDATE public.profiles 
SET is_super_admin = true,
    permissions = jsonb_build_object(
      'can_manage_team', true, 'can_manage_inventory', true, 
      'can_view_all_tickets', true, 'can_view_all_clients', true, 
      'can_delete_tickets', true, 'can_edit_locked_tickets', true
    )
WHERE email = 'admin@techservice.com';

-- 3. ELIMINAR PODERES A LOS DEMÁS (Sofía y futuros)
-- Todos los que NO son super admin se quedan a cero.
UPDATE public.profiles 
SET permissions = jsonb_build_object(
      'can_manage_team', false, 'can_manage_inventory', false, 
      'can_view_all_tickets', false, 'can_view_all_clients', false, 
      'can_delete_tickets', false
)
WHERE is_super_admin = false AND role = 'admin';

-- 4. ACTUALIZAR EL ROBOT (TRIGGER) PARA QUE SEA TACAÑO
-- Nuevos admins nacen SIN PERMISOS. El jefe debe dárselos manualmente.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, role, permissions, is_super_admin)
  VALUES (
    new.id,
    new.raw_user_meta_data->>'full_name',
    new.email,
    COALESCE(new.raw_user_meta_data->>'role', 'client')::public.user_role,
    -- PERMISOS POR DEFECTO: VACÍOS (FALSE)
    -- Solo si se especifica explícitamente en metadata (raro) se usaría, si no, todo false.
    '{"can_manage_team": false, "can_manage_inventory": false, "can_view_all_tickets": false, "can_view_all_clients": false}'::jsonb,
    false -- Nunca nace un super admin automáticamente
  ) ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$;

-- 5. BLINDAJE RLS (Nadie toca al Super Admin)
-- Política para evitar que un Sub-Admin bloquee o edite al Super Admin.
-- Primero, eliminamos políticas de escritura genéricas si existen "Admins Update Profiles"
-- Ojo: Supabase por defecto no tiene policy de UPDATE para profiles salvo owner. 
-- Crearemos una regla: "Super Admin puede editar todo. Sub-Admin puede editar NO-SuperAdmins".

DROP POLICY IF EXISTS "Admin Update Profiles" ON public.profiles;

CREATE POLICY "Super Admin Edita Todo" ON public.profiles
  FOR UPDATE USING (
    public.am_i_role('admin') AND (SELECT is_super_admin FROM public.profiles WHERE id = auth.uid()) = true
  );

CREATE POLICY "Sub Admin Edita Equipo (Menos Jefes)" ON public.profiles
  FOR UPDATE USING (
    public.am_i_role('admin') 
    AND public.have_permission('can_manage_team')
    AND is_super_admin = false -- No puede tocar a un super admin
    AND id != auth.uid() -- No puede auto-bloquearse (opcional)
  );
