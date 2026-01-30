-- ═══════════════════════════════════════════════════════════════════════════
-- FIX INFRASTRUCTURE - Secretaría Virtual (Básico + PRO)
-- Ejecutar en Supabase Dashboard → SQL Editor (o con psql contra la BD remota).
-- Proyecto: zapjbtgnmxkhpfykxmnh
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Extensiones (vitales para Bot y Autopilot)
CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 2. Eliminar trigger si existe (evitar duplicados)
DROP TRIGGER IF EXISTS trigger_ticket_autopilot_on_insert ON public.tickets;

-- 3. Función del trigger (llama a ticket-autopilot Edge Function vía pg_net)
CREATE OR REPLACE FUNCTION public.trigger_ticket_autopilot()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  payload jsonb;
  edge_url text;
BEGIN
  IF NEW.status IS DISTINCT FROM 'solicitado' THEN
    RETURN NEW;
  END IF;

  edge_url := 'https://zapjbtgnmxkhpfykxmnh.supabase.co/functions/v1/ticket-autopilot';

  payload := jsonb_build_object(
    'type', 'INSERT',
    'table', 'tickets',
    'schema', 'public',
    'record', to_jsonb(NEW),
    'old_record', NULL
  );

  PERFORM net.http_post(
    url := edge_url,
    body := payload,
    headers := '{"Content-Type": "application/json"}'::jsonb,
    timeout_milliseconds := 10000
  );

  RETURN NEW;
END;
$$;

-- 4. Recrear el trigger
CREATE TRIGGER trigger_ticket_autopilot_on_insert
  AFTER INSERT ON public.tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_ticket_autopilot();

COMMENT ON FUNCTION public.trigger_ticket_autopilot() IS 'On INSERT tickets (solicitado), calls ticket-autopilot Edge Function via pg_net.';

-- Listo. Verificar con:
-- SELECT tgname FROM pg_trigger WHERE tgrelid = 'public.tickets'::regclass;
