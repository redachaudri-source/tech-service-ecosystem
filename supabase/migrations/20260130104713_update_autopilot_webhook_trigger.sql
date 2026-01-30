-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: Update Autopilot Webhook Trigger to use new processor
-- Points to ticket-autopilot-processor Edge Function
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Update trigger function to call new processor
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
  -- Only run for new tickets with status 'solicitado'
  IF NEW.status IS DISTINCT FROM 'solicitado' THEN
    RETURN NEW;
  END IF;

  -- Skip if already has proposal or is being processed
  IF NEW.pro_proposal IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Edge Function URL - use the new processor
  edge_url := 'https://zapjbtgnmxkhpfykxmnh.supabase.co/functions/v1/ticket-autopilot-processor';

  -- Formato simplificado: solo ticket_id
  -- El processor también soporta el formato completo con 'record'
  payload := jsonb_build_object(
    'ticket_id', NEW.id::text,
    'type', 'INSERT',
    'table', 'tickets'
  );

  -- Call via pg_net (async, non-blocking)
  PERFORM net.http_post(
    url := edge_url,
    body := payload,
    headers := '{"Content-Type": "application/json"}'::jsonb,
    timeout_milliseconds := 10000
  );

  RETURN NEW;
END;
$$;

-- 2. Recreate trigger
DROP TRIGGER IF EXISTS trigger_ticket_autopilot_on_insert ON public.tickets;
CREATE TRIGGER trigger_ticket_autopilot_on_insert
  AFTER INSERT ON public.tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_ticket_autopilot();

COMMENT ON FUNCTION public.trigger_ticket_autopilot() IS 
  'On INSERT tickets (solicitado), calls ticket-autopilot-processor Edge Function via pg_net for instant processing.';

-- 3. Also create trigger for UPDATE to 'solicitado' (re-process if status changes back)
DROP TRIGGER IF EXISTS trigger_ticket_autopilot_on_update ON public.tickets;
CREATE TRIGGER trigger_ticket_autopilot_on_update
  AFTER UPDATE OF status ON public.tickets
  FOR EACH ROW
  WHEN (NEW.status = 'solicitado' AND OLD.status IS DISTINCT FROM 'solicitado' AND NEW.pro_proposal IS NULL)
  EXECUTE FUNCTION public.trigger_ticket_autopilot();

-- 4. Function to manually reinstall trigger (for maintenance)
CREATE OR REPLACE FUNCTION public.install_autopilot_processor_trigger()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DROP TRIGGER IF EXISTS trigger_ticket_autopilot_on_insert ON public.tickets;
  DROP TRIGGER IF EXISTS trigger_ticket_autopilot_on_update ON public.tickets;
  
  CREATE TRIGGER trigger_ticket_autopilot_on_insert
    AFTER INSERT ON public.tickets
    FOR EACH ROW
    EXECUTE FUNCTION public.trigger_ticket_autopilot();

  CREATE TRIGGER trigger_ticket_autopilot_on_update
    AFTER UPDATE OF status ON public.tickets
    FOR EACH ROW
    WHEN (NEW.status = 'solicitado' AND OLD.status IS DISTINCT FROM 'solicitado' AND NEW.pro_proposal IS NULL)
    EXECUTE FUNCTION public.trigger_ticket_autopilot();

  RETURN jsonb_build_object('ok', true, 'message', 'Triggers ticket_autopilot installed for INSERT and UPDATE.');
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.install_autopilot_processor_trigger TO service_role;
