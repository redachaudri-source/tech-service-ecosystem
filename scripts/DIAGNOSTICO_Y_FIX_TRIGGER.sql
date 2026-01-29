-- ═══════════════════════════════════════════════════════════════════════════
-- PASO 1: DIAGNÓSTICO - Ejecuta esto PRIMERO y mira los resultados
-- ═══════════════════════════════════════════════════════════════════════════

-- 1A. ¿Existe el trigger?
SELECT tgname, tgrelid::regclass, tgenabled 
FROM pg_trigger 
WHERE tgname = 'trigger_ticket_autopilot_on_insert';

-- 1B. ¿Está pg_net habilitado?
SELECT * FROM pg_extension WHERE extname = 'pg_net';

-- 1C. ¿Qué valor tiene secretary_mode?
SELECT key, value FROM business_config WHERE key = 'secretary_mode';

-- 1D. ¿El último ticket tiene pro_proposal?
SELECT id, status, origin_source, pro_proposal, created_at 
FROM tickets 
ORDER BY created_at DESC 
LIMIT 3;

-- ═══════════════════════════════════════════════════════════════════════════
-- PASO 2: SI EL TRIGGER NO EXISTE o pg_net no está habilitado:
-- Primero ve a Database → Extensions → Busca "pg_net" → Actívalo
-- Luego ejecuta todo lo de abajo:
-- ═══════════════════════════════════════════════════════════════════════════

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
  -- Solo para tickets con status 'solicitado'
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

  -- Llamada asíncrona a la Edge Function
  PERFORM net.http_post(
    url := edge_url,
    body := payload,
    headers := '{"Content-Type": "application/json"}'::jsonb,
    timeout_milliseconds := 10000
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_ticket_autopilot_on_insert ON public.tickets;
CREATE TRIGGER trigger_ticket_autopilot_on_insert
  AFTER INSERT ON public.tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_ticket_autopilot();

-- ═══════════════════════════════════════════════════════════════════════════
-- PASO 3: VERIFICAR QUE FUNCIONÓ
-- ═══════════════════════════════════════════════════════════════════════════

SELECT tgname, tgrelid::regclass, tgenabled 
FROM pg_trigger 
WHERE tgname = 'trigger_ticket_autopilot_on_insert';
-- Debe mostrar una fila con tgenabled = 'O' (enabled)
