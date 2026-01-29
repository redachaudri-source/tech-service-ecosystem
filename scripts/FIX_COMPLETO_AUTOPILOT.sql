-- ═══════════════════════════════════════════════════════════════════════════
-- FIX COMPLETO AUTOPILOT - Ejecuta TODO esto en Supabase SQL Editor
-- Primero: Dashboard → Database → Extensions → Activa "pg_net"
-- ═══════════════════════════════════════════════════════════════════════════

-- PASO 1: Ver estado actual
SELECT '=== DIAGNÓSTICO ===' as info;

SELECT 'Trigger existe: ' || CASE WHEN COUNT(*) > 0 THEN 'SÍ' ELSE 'NO' END as resultado
FROM pg_trigger WHERE tgname = 'trigger_ticket_autopilot_on_insert';

SELECT 'pg_net habilitado: ' || CASE WHEN COUNT(*) > 0 THEN 'SÍ' ELSE 'NO' END as resultado
FROM pg_extension WHERE extname = 'pg_net';

SELECT 'secretary_mode: ' || COALESCE(value::text, 'NO CONFIGURADO') as resultado
FROM business_config WHERE key = 'secretary_mode';

-- PASO 2: Crear/Actualizar la función del trigger
CREATE OR REPLACE FUNCTION public.trigger_ticket_autopilot()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  payload jsonb;
  edge_url text := 'https://zapjbtgnmxkhpfykxmnh.supabase.co/functions/v1/ticket-autopilot';
BEGIN
  -- Solo disparar para tickets con status 'solicitado'
  IF NEW.status IS DISTINCT FROM 'solicitado' THEN
    RETURN NEW;
  END IF;

  -- Construir payload igual que un webhook de Supabase
  payload := jsonb_build_object(
    'type', 'INSERT',
    'table', 'tickets',
    'schema', 'public',
    'record', to_jsonb(NEW),
    'old_record', NULL
  );

  -- Llamar a la Edge Function de forma asíncrona
  PERFORM net.http_post(
    url := edge_url,
    body := payload,
    headers := '{"Content-Type": "application/json"}'::jsonb,
    timeout_milliseconds := 15000
  );

  RETURN NEW;
END;
$$;

-- PASO 3: Eliminar trigger antiguo y crear nuevo
DROP TRIGGER IF EXISTS trigger_ticket_autopilot_on_insert ON public.tickets;

CREATE TRIGGER trigger_ticket_autopilot_on_insert
  AFTER INSERT ON public.tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_ticket_autopilot();

-- PASO 4: Verificar que se creó
SELECT '=== VERIFICACIÓN ===' as info;

SELECT 'Trigger instalado: ' || CASE WHEN COUNT(*) > 0 THEN '✅ SÍ' ELSE '❌ NO' END as resultado
FROM pg_trigger WHERE tgname = 'trigger_ticket_autopilot_on_insert';

-- PASO 5: Ver últimos tickets para debug
SELECT '=== ÚLTIMOS 3 TICKETS ===' as info;
SELECT id, status, origin_source, 
       CASE WHEN pro_proposal IS NOT NULL THEN '✅ Tiene propuesta' ELSE '❌ Sin propuesta' END as propuesta,
       created_at
FROM tickets 
ORDER BY created_at DESC 
LIMIT 3;
