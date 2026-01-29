-- ═══════════════════════════════════════════════════════════════════════════
-- Ticket Autopilot: trigger on INSERT tickets (status = solicitado)
-- Calls Edge Function ticket-autopilot via pg_net (async HTTP POST).
-- Requires: Enable "pg_net" in Dashboard → Database → Extensions.
-- Edge Function ticket-autopilot is deployed with --no-verify-jwt (no auth).
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
  -- Only run for new tickets with status 'solicitado'
  IF NEW.status IS DISTINCT FROM 'solicitado' THEN
    RETURN NEW;
  END IF;

  -- Edge Function URL for this project
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

DROP TRIGGER IF EXISTS trigger_ticket_autopilot_on_insert ON public.tickets;
CREATE TRIGGER trigger_ticket_autopilot_on_insert
  AFTER INSERT ON public.tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_ticket_autopilot();

COMMENT ON FUNCTION public.trigger_ticket_autopilot() IS 'On INSERT tickets (solicitado), calls ticket-autopilot Edge Function via pg_net.';

-- ═══════════════════════════════════════════════════════════════════════════
-- RPC for script: install_trigger.js can call this to (re)install the trigger
-- Requires pg_net enabled. Run: node scripts/install_trigger.js
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.install_autopilot_trigger()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DROP TRIGGER IF EXISTS trigger_ticket_autopilot_on_insert ON public.tickets;
  CREATE TRIGGER trigger_ticket_autopilot_on_insert
    AFTER INSERT ON public.tickets
    FOR EACH ROW
    EXECUTE FUNCTION public.trigger_ticket_autopilot();
  RETURN jsonb_build_object('ok', true, 'message', 'Trigger ticket_autopilot_on_insert installed.');
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;
