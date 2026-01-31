-- ═══════════════════════════════════════════════════════════════════════════
-- FIX: Procesamiento INSTANTÁNEO del Bot PRO
-- Ejecuta COMPLETO en Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════════════

-- ╔═════════════════════════════════════════════════════════════════════════╗
-- ║  DIAGNÓSTICO                                                            ║
-- ╚═════════════════════════════════════════════════════════════════════════╝

-- 1. Verificar si pg_net está habilitado (REQUERIDO para webhook)
SELECT '1. pg_net habilitado:' as check, 
       CASE WHEN COUNT(*) > 0 THEN '✅ SÍ' ELSE '❌ NO - ACTIVAR EN DASHBOARD' END as status
FROM pg_extension WHERE extname = 'pg_net';

-- 2. Verificar si el trigger existe
SELECT '2. Trigger INSERT:' as check,
       CASE WHEN COUNT(*) > 0 THEN '✅ Existe' ELSE '❌ NO EXISTE' END as status
FROM pg_trigger WHERE tgname = 'trigger_ticket_autopilot_on_insert';

-- 3. Verificar cron jobs activos
SELECT '3. Cron Jobs:' as check, jobname, schedule, 
       CASE WHEN active THEN '✅ Activo' ELSE '❌ Inactivo' END as status
FROM cron.job 
WHERE jobname LIKE '%autopilot%';

-- ╔═════════════════════════════════════════════════════════════════════════╗
-- ║  FIX: REINSTALAR TRIGGER PARA DISPARO INSTANTÁNEO                       ║
-- ╚═════════════════════════════════════════════════════════════════════════╝

-- Función del trigger con logging
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
BEGIN
  -- Solo procesar si status = 'solicitado'
  IF NEW.status <> 'solicitado' THEN
    RETURN NEW;
  END IF;

  -- Verificar si el modo PRO está activo
  SELECT REPLACE(value::text, '"', '') INTO secretary_mode
  FROM business_config WHERE key = 'secretary_mode';
  
  IF secretary_mode IS DISTINCT FROM 'pro' THEN
    RETURN NEW;
  END IF;

  -- Construir payload simple con solo ticket_id
  payload := jsonb_build_object(
    'ticket_id', NEW.id::text,
    'type', 'INSERT',
    'table', 'tickets'
  );

  -- Llamar Edge Function de forma ASÍNCRONA (no bloquea el INSERT)
  PERFORM net.http_post(
    url := edge_url,
    body := payload,
    headers := '{"Content-Type": "application/json"}'::jsonb,
    timeout_milliseconds := 5000  -- 5 segundos timeout
  );

  RETURN NEW;
END;
$$;

-- Recrear trigger on INSERT
DROP TRIGGER IF EXISTS trigger_ticket_autopilot_on_insert ON public.tickets;
CREATE TRIGGER trigger_ticket_autopilot_on_insert
  AFTER INSERT ON public.tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_ticket_autopilot();

-- Recrear trigger on UPDATE (cuando vuelve a 'solicitado')
DROP TRIGGER IF EXISTS trigger_ticket_autopilot_on_update ON public.tickets;
CREATE TRIGGER trigger_ticket_autopilot_on_update
  AFTER UPDATE OF status ON public.tickets
  FOR EACH ROW
  WHEN (NEW.status = 'solicitado' AND OLD.status IS DISTINCT FROM 'solicitado' AND NEW.pro_proposal IS NULL)
  EXECUTE FUNCTION public.trigger_ticket_autopilot();

-- ╔═════════════════════════════════════════════════════════════════════════╗
-- ║  FIX: CRON JOB MÁS RÁPIDO (cada 30 segundos como BACKUP)               ║
-- ╚═════════════════════════════════════════════════════════════════════════╝

-- El cron de pg_cron solo soporta minutos como mínimo
-- Pero podemos tener 2 jobs: uno a los :00 y otro a los :30 de cada minuto
-- Para lograr esto usamos el truque de schedule con múltiples minutos

-- Cancelar jobs antiguos si existen
SELECT cron.unschedule('ticket-autopilot-processor') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'ticket-autopilot-processor'
);

-- Crear job principal (cada minuto)
SELECT cron.schedule(
  'ticket-autopilot-processor',
  '* * * * *',  -- Cada minuto (lo más frecuente que permite pg_cron)
  $$
  SELECT net.http_post(
    url := 'https://zapjbtgnmxkhpfykxmnh.supabase.co/functions/v1/ticket-autopilot-processor',
    body := '{"mode": "cron"}'::jsonb,
    headers := '{"Content-Type": "application/json"}'::jsonb,
    timeout_milliseconds := 15000
  );
  $$
);

-- ╔═════════════════════════════════════════════════════════════════════════╗
-- ║  VERIFICACIÓN FINAL                                                     ║
-- ╚═════════════════════════════════════════════════════════════════════════╝

SELECT '═══ VERIFICACIÓN FINAL ═══' as resultado;

SELECT 'Trigger INSERT:' as componente, 
       CASE WHEN COUNT(*) > 0 THEN '✅ INSTALADO' ELSE '❌ FALTA' END as status
FROM pg_trigger WHERE tgname = 'trigger_ticket_autopilot_on_insert';

SELECT 'Trigger UPDATE:' as componente, 
       CASE WHEN COUNT(*) > 0 THEN '✅ INSTALADO' ELSE '❌ FALTA' END as status
FROM pg_trigger WHERE tgname = 'trigger_ticket_autopilot_on_update';

SELECT 'pg_net:' as componente, 
       CASE WHEN COUNT(*) > 0 THEN '✅ HABILITADO' ELSE '❌ ACTIVAR EN DASHBOARD → Extensions' END as status
FROM pg_extension WHERE extname = 'pg_net';

SELECT 'Cron Job:' as componente, schedule as status
FROM cron.job WHERE jobname = 'ticket-autopilot-processor';

-- ═══════════════════════════════════════════════════════════════════════════
-- NOTA IMPORTANTE:
-- 
-- El trigger debería disparar INSTANTÁNEAMENTE cuando creas un ticket nuevo.
-- Si pg_net está habilitado y el trigger existe, el modal debería aparecer
-- en 1-3 segundos máximo.
--
-- Si sigue tardando, verifica en Supabase Dashboard → Logs → Edge Functions
-- para ver si la llamada desde el trigger está llegando.
-- ═══════════════════════════════════════════════════════════════════════════
