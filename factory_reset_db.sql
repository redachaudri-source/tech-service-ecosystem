-- ⚠️ PELIGRO: ESTE SCRIPT BORRA TODA LA BASE DE DATOS ⚠️
-- Úsalo solo para reiniciar la fase de pruebas.
-- Mantiene vivo SOLO al usuario que tú digas (Super Admin).

DO $$
DECLARE
  -- 👇👇👇 ESCRIBE AQUÍ TU EMAIL DE SUPER ADMIN EXACTO 👇👇👇
  protected_email TEXT := 'TU_EMAIL_AQUI@GMAIL.COM'; 
  
  protected_id UUID;
BEGIN
  -- 1. Buscamos el ID del Super Admin para protegerlo
  SELECT id INTO protected_id FROM auth.users WHERE email = protected_email;

  IF protected_id IS NULL THEN
    RAISE EXCEPTION '❌ DETENIDO: No he encontrado ningún usuario con el email: %. Por favor edita el script y pon tu email correcto.', protected_email;
  END IF;

  RAISE NOTICE '🛡️ Protegiendo al Super Admin: % (ID: %)', protected_email, protected_id;

  -- 2. BORRADO EN CASCADA (Desde lo más específico a lo general)
  
  -- Tablas de detalles (Presupuestos, Eventos, etc)
  RAISE NOTICE '🗑️ Borrando Presupuestos y Eventos...';
  -- Intenta borrar si existen las tablas, si no continua
  BEGIN DELETE FROM public.budget_items; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM public.budgets; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM public.ticket_events; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM public.ticket_payments; EXCEPTION WHEN OTHERS THEN NULL; END;

  -- Tablas Principales
  RAISE NOTICE '🗑️ Borrando Tickets...';
  DELETE FROM public.tickets;

  RAISE NOTICE '🗑️ Borrando Clientes...';
  DELETE FROM public.clients;

  -- 3. BORRADO DE USUARIOS (Técnicos y otros Admins)
  RAISE NOTICE '🗑️ Borrando Perfiles y Usuarios (Excepto Super Admin)...';
  
  -- Borramos primero perfiles (por si acaso no hay cascade)
  DELETE FROM public.profiles WHERE id != protected_id;
  
  -- Borramos los usuarios de autenticación (Esto libera los emails para volver a usarlos)
  DELETE FROM auth.users WHERE id != protected_id;

  RAISE NOTICE '✅ REINICIO COMPLETADO. Todo limpio excepto el Super Admin.';
END $$;
