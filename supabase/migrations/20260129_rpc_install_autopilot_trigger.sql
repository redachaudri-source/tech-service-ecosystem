-- RPC callable from scripts/install_trigger.js to install the autopilot trigger.
-- Requires pg_net extension enabled in Dashboard → Extensions.
CREATE OR REPLACE FUNCTION public.install_autopilot_trigger()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Recreate trigger function
  CREATE OR REPLACE FUNCTION public.trigger_ticket_autopilot()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
  AS $inner$
  DECLARE
    payload jsonb;
    edge_url text := 'https://zapjbtgnmxkhpfykxmnh.supabase.co/functions/v1/ticket-autopilot';
  BEGIN
    IF NEW.status IS DISTINCT FROM 'solicitado' THEN
      RETURN NEW;
    END IF;
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
  $inner$;

  DROP TRIGGER IF EXISTS trigger_ticket_autopilot_on_insert ON public.tickets;
  CREATE TRIGGER trigger_ticket_autopilot_on_insert
    AFTER INSERT ON public.tickets
    FOR EACH ROW
    EXECUTE FUNCTION public.trigger_ticket_autopilot();

  RETURN '{"ok": true, "message": "Trigger installed"}'::jsonb;
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.install_autopilot_trigger() TO service_role;
GRANT EXECUTE ON FUNCTION public.install_autopilot_trigger() TO authenticated;
