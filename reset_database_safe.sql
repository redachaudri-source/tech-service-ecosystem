-- 🛡️ SCRIPT DE REINICIO SEGURO v2.0 🛡️
-- Misión: Borrar TODO excepto al Super Admin (admin@techservice.com)

DO $$
DECLARE
  -- EL INTOCABLE
  protected_email TEXT := 'admin@techservice.com';
  protected_id UUID;
BEGIN
  -- 1. IDENTIFICAR AL JEFE
  SELECT id INTO protected_id FROM auth.users WHERE email = protected_email;

  IF protected_id IS NULL THEN
    RAISE EXCEPTION '❌ ERROR CRÍTICO: No encuentro al usuario %', protected_email;
  END IF;

  RAISE NOTICE '🫡 Oído cocina. Protegiendo al usuario: % (ID: %)', protected_email, protected_id;

  -- 2. LIMPIEZA PROFUNDA (Orden correcto para no romper foreign keys)
  
  -- A. Tablas Satélite (Tickets)
  RAISE NOTICE '🧹 Borrando Detalle de Tickets (Pagos, Eventos)...';
  DELETE FROM public.ticket_payments;
  DELETE FROM public.ticket_events;
  
  -- B. Tablas Satélite (Presupuestos)
  RAISE NOTICE '🧹 Borrando Presupuestos...';
  DELETE FROM public.budget_items;
  DELETE FROM public.budgets;

  -- C. Tablas Nucleares
  RAISE NOTICE '🔥 Borrando TODOS los Tickets...';
  DELETE FROM public.tickets;

  RAISE NOTICE '🔥 Borrando TODOS los Clientes...';
  DELETE FROM public.clients;

  -- 3. PURGA DE PERSONAL
  RAISE NOTICE '👻 Borrando Perfiles de Técnicos y otros Admins...';
  DELETE FROM public.profiles WHERE id != protected_id;

  RAISE NOTICE '👻 Borrando Cuentas de Acceso (Auth Users)...';
  DELETE FROM auth.users WHERE id != protected_id;

  RAISE NOTICE '✨ ¡FABRICA RESTAURADA! Solo queda vivo: %', protected_email;
END $$;
