-- ═══════════════════════════════════════════════════════════════════════════
-- 🚀 ACTIVAR DISPARO INSTANTÁNEO DEL BOT PRO
-- 
-- Este script DEBE ejecutarse en Supabase SQL Editor para habilitar
-- el procesamiento INMEDIATO de tickets nuevos (en vez de esperar al cron).
--
-- REQUISITO PREVIO: 
--   Dashboard → Database → Extensions → Busca "pg_net" → ACTIVAR
-- ═══════════════════════════════════════════════════════════════════════════

-- ╔═════════════════════════════════════════════════════════════════════════╗
-- ║  PASO 1: DIAGNÓSTICO INICIAL                                            ║
-- ╚═════════════════════════════════════════════════════════════════════════╝

DO $$
DECLARE
  pg_net_enabled BOOLEAN;
  trigger_exists BOOLEAN;
BEGIN
  -- Check pg_net
  SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname = 'pg_net') INTO pg_net_enabled;
  
  -- Check trigger
  SELECT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname = 'trigger_ticket_autopilot_on_insert') INTO trigger_exists;
  
  RAISE NOTICE '═══════════════════════════════════════════════════════════════';
  RAISE NOTICE 'DIAGNÓSTICO INICIAL:';
  RAISE NOTICE '  pg_net habilitado: %', CASE WHEN pg_net_enabled THEN '✅ SÍ' ELSE '❌ NO' END;
  RAISE NOTICE '  Trigger INSERT existe: %', CASE WHEN trigger_exists THEN '✅ SÍ' ELSE '❌ NO' END;
  RAISE NOTICE '═══════════════════════════════════════════════════════════════';
  
  IF NOT pg_net_enabled THEN
    RAISE EXCEPTION 'pg_net NO ESTÁ HABILITADO. Ve a Dashboard → Database → Extensions → Busca "pg_net" → Actívalo';
  END IF;
END $$;

-- ╔═════════════════════════════════════════════════════════════════════════╗
-- ║  PASO 2: CREAR/ACTUALIZAR FUNCIÓN DEL TRIGGER                          ║
-- ╚═════════════════════════════════════════════════════════════════════════╝

CREATE OR REPLACE FUNCTION public.trigger_ticket_autopilot()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  edge_url TEXT := 'https://zapjbtgnmxkhpfykxmnh.supabase.co/functions/v1/ticket-autopilot-processor';
  payload JSONB;
  secretary_mode TEXT;
  result RECORD;
BEGIN
  -- Solo procesar si status = 'solicitado'
  IF NEW.status <> 'solicitado' THEN
    RAISE NOTICE '[TRIGGER] Ticket % ignorado - status no es solicitado (%)', NEW.id, NEW.status;
    RETURN NEW;
  END IF;

  -- Verificar si el modo PRO está activo
  SELECT REPLACE(COALESCE(value::text, ''), '"', '') INTO secretary_mode
  FROM business_config WHERE key = 'secretary_mode';
  
  IF secretary_mode IS DISTINCT FROM 'pro' THEN
    RAISE NOTICE '[TRIGGER] Modo PRO no activo (actual: %), saltando', secretary_mode;
    RETURN NEW;
  END IF;

  -- Construir payload con ticket_id
  payload := jsonb_build_object(
    'ticket_id', NEW.id::text,
    'type', TG_OP,
    'timestamp', NOW()::text
  );

  RAISE NOTICE '[TRIGGER] 🚀 Disparando Edge Function para ticket %', NEW.id;

  -- Llamar Edge Function de forma ASÍNCRONA (no bloquea el INSERT)
  PERFORM net.http_post(
    url := edge_url,
    body := payload,
    headers := '{"Content-Type": "application/json"}'::jsonb,
    timeout_milliseconds := 5000
  );

  RAISE NOTICE '[TRIGGER] ✅ Llamada enviada a ticket-autopilot-processor';

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- No fallar el INSERT si el trigger falla
  RAISE WARNING '[TRIGGER] ⚠️ Error en trigger_ticket_autopilot: %', SQLERRM;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.trigger_ticket_autopilot() IS 
  'Dispara procesamiento INSTANTÁNEO del Bot PRO cuando se crea un ticket con status=solicitado. Requiere pg_net.';

-- ╔═════════════════════════════════════════════════════════════════════════╗
-- ║  PASO 3: RECREAR TRIGGERS                                              ║
-- ╚═════════════════════════════════════════════════════════════════════════╝

-- Eliminar triggers existentes
DROP TRIGGER IF EXISTS trigger_ticket_autopilot_on_insert ON public.tickets;
DROP TRIGGER IF EXISTS trigger_ticket_autopilot_on_update ON public.tickets;

-- Crear trigger para INSERT
CREATE TRIGGER trigger_ticket_autopilot_on_insert
  AFTER INSERT ON public.tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_ticket_autopilot();

-- Crear trigger para UPDATE (cuando un ticket vuelve a 'solicitado')
CREATE TRIGGER trigger_ticket_autopilot_on_update
  AFTER UPDATE OF status ON public.tickets
  FOR EACH ROW
  WHEN (NEW.status = 'solicitado' AND OLD.status IS DISTINCT FROM 'solicitado' AND NEW.pro_proposal IS NULL)
  EXECUTE FUNCTION public.trigger_ticket_autopilot();

-- ╔═════════════════════════════════════════════════════════════════════════╗
-- ║  PASO 4: VERIFICACIÓN FINAL                                            ║
-- ╚═════════════════════════════════════════════════════════════════════════╝

SELECT '═══ VERIFICACIÓN FINAL ═══' as info;

SELECT 
  '✅ DISPARO INSTANTÁNEO CONFIGURADO' as resultado,
  COUNT(*) as triggers_activos
FROM pg_trigger 
WHERE tgname IN ('trigger_ticket_autopilot_on_insert', 'trigger_ticket_autopilot_on_update');

-- Mostrar estado de los triggers
SELECT 
  tgname as trigger_name,
  CASE WHEN tgenabled = 'O' THEN '✅ Activo' ELSE '❌ Desactivado' END as estado
FROM pg_trigger 
WHERE tgname LIKE 'trigger_ticket_autopilot%';

-- ╔═════════════════════════════════════════════════════════════════════════╗
-- ║  INSTRUCCIONES POST-EJECUCIÓN                                          ║
-- ╚═════════════════════════════════════════════════════════════════════════╝

/*
  ═══════════════════════════════════════════════════════════════════════════
  ¡LISTO! Ahora cuando crees un ticket nuevo:
  
  1. El INSERT se completa normalmente
  2. El trigger dispara INMEDIATAMENTE una llamada HTTP a ticket-autopilot-processor
  3. La Edge Function procesa el ticket y genera la propuesta
  4. El frontend detecta la propuesta (vía Realtime o polling) y muestra el modal
  
  TIEMPO TOTAL ESPERADO: 2-5 segundos máximo
  
  Si sigue tardando más de 10 segundos, verifica:
  - Dashboard → Logs → Edge Functions → Busca "ticket-autopilot-processor"
  - Dashboard → Database → Logs → Busca mensajes con [TRIGGER]
  ═══════════════════════════════════════════════════════════════════════════
*/
