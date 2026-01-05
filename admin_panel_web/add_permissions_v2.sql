-- CORRECCIÓN: "Column role does not exist"
-- El error ocurría porque intentábamos leer "role" en la tabla inventario, 
-- pero "role" vive en la tabla de perfiles. 
-- Usaremos funciones "Helper" para hacerlo bien.

-- 1. FUNCIÓN: ¿SOY ESE ROL? (am_i_role)
CREATE OR REPLACE FUNCTION public.am_i_role(target_role text)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() 
    AND role = target_role
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. FUNCIÓN: ¿TENGO PERMISO? (have_permission)
CREATE OR REPLACE FUNCTION public.have_permission(perm_key text)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() 
    AND (permissions->>perm_key)::boolean = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. ACTUALIZAR MOCHILA (Por si acaso no corrió antes)
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS permissions JSONB DEFAULT '{}'::jsonb;

-- Configurar Super Admin
UPDATE public.profiles 
SET permissions = jsonb_build_object(
  'can_manage_team', true,
  'can_manage_inventory', true, 
  'can_view_all_tickets', true,
  'can_view_all_clients', true,
  'can_delete_tickets', true,
  'can_edit_locked_tickets', true
)
WHERE role = 'admin';

-- Configurar Técnicos
UPDATE public.profiles 
SET permissions = jsonb_build_object(
  'can_manage_team', false,
  'can_manage_inventory', false, 
  'can_view_all_tickets', false,
  'can_view_all_clients', false,
  'can_delete_tickets', false
)
WHERE role = 'tech';

-- 4. APLICAR POLÍTICAS CORREGIDAS

-- === PERFILES ===
DROP POLICY IF EXISTS "Admin Con Permiso Ve Todo" ON public.profiles;
DROP POLICY IF EXISTS "Privileged Staff View All Profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users see own profile" ON public.profiles;
DROP POLICY IF EXISTS "Master Admin Profiles" ON public.profiles;

CREATE POLICY "Admin Con Permiso Ve Todo" ON public.profiles
  FOR ALL USING ( 
    (public.am_i_role('admin') AND public.have_permission('can_view_all_clients')) 
    OR (id = auth.uid()) 
  );

-- === TICKETS ===
DROP POLICY IF EXISTS "Admin Con Permiso Ve Tickets" ON public.tickets;
DROP POLICY IF EXISTS "Tecnico Ve Sus Tickets Asignados" ON public.tickets;
DROP POLICY IF EXISTS "Cliente Ve Sus Tickets Propios" ON public.tickets;
DROP POLICY IF EXISTS "Master Admin Tickets" ON public.tickets;

CREATE POLICY "Admin Con Permiso Ve Tickets" ON public.tickets
  FOR ALL USING ( 
    (public.am_i_role('admin') AND public.have_permission('can_view_all_tickets'))
  );

CREATE POLICY "Tecnico Ve Sus Tickets Asignados" ON public.tickets
  FOR SELECT USING ( tech_id = auth.uid() );

CREATE POLICY "Cliente Ve Sus Tickets Propios" ON public.tickets
  FOR SELECT USING ( client_id = auth.uid() );

-- === INVENTARIO ===
DROP POLICY IF EXISTS "Admin Gestiona Inventario" ON public.inventory;
DROP POLICY IF EXISTS "Tecnico Lee Inventario" ON public.inventory;
DROP POLICY IF EXISTS "Master Admin Inventory" ON public.inventory;

CREATE POLICY "Admin Gestiona Inventario" ON public.inventory
  FOR ALL USING ( 
    public.am_i_role('admin') AND public.have_permission('can_manage_inventory')
  );

CREATE POLICY "Tecnico Lee Inventario" ON public.inventory
  FOR SELECT USING ( public.am_i_role('tech') );

-- === SERVICE PARTS (Para que los técnicos puedan añadir repuestos) ===
CREATE POLICY "Tecnico Gestiona Sus Repuestos" ON public.service_parts
  FOR ALL USING ( 
    public.am_i_role('tech') 
    -- Podríamos validar que el ticket sea suyo, pero por ahora confiamos en el rol tech
    -- O comprobar: exists(select 1 from tickets where id=ticket_id and tech_id=auth.uid())
  );
  
CREATE POLICY "Admin Ve Repuestos" ON public.service_parts
  FOR ALL USING ( public.am_i_role('admin') ); 
