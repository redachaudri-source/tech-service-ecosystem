-- 1. QUITAR PODERES A SOFIA (Reset)
-- El script anterior le dio poderes totales por error. Lo corregimos.
UPDATE public.profiles
SET permissions = jsonb_build_object(
  'can_manage_team', false, 
  'can_manage_inventory', false, 
  'can_view_all_tickets', false, 
  'can_view_all_clients', false, 
  'can_delete_tickets', false
)
WHERE email LIKE 'sofia%';

-- 2. ASEGURAR SUPER ADMIN
-- Nos aseguramos que TU usuario (admin original) tenga todo TRUE.
UPDATE public.profiles
SET permissions = jsonb_build_object(
  'can_manage_team', true, 
  'can_manage_inventory', true, 
  'can_view_all_tickets', true, 
  'can_view_all_clients', true, 
  'can_delete_tickets', true
)
WHERE email = 'admin@techservice.com' OR role = 'admin' AND email NOT LIKE 'sofia%';
