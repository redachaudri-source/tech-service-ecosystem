-- ═══════════════════════════════════════════════════════════════════════════
-- Database Trigger to call ticket-autopilot Edge Function
-- Uses pg_net extension for HTTP calls
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Enable pg_net extension if not exists
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 2. Create function to call the Edge Function
CREATE OR REPLACE FUNCTION trigger_ticket_autopilot()
RETURNS TRIGGER AS $$
DECLARE
    edge_function_url TEXT;
    service_role_key TEXT;
    request_id BIGINT;
BEGIN
    -- Only trigger for new tickets with status 'solicitado'
    IF NEW.status = 'solicitado' AND NEW.assigned_technician_id IS NULL THEN
        
        -- Get the Edge Function URL (your Supabase project)
        edge_function_url := 'https://zapjbtgnmxkhpfykxmnh.supabase.co/functions/v1/ticket-autopilot';
        
        -- Get service role key from vault (or use direct key)
        -- Note: For security, you should store this in Supabase Vault
        -- For now we use the service role key directly (replace with your key)
        service_role_key := current_setting('app.settings.service_role_key', true);
        
        -- If no key in settings, use a placeholder (you'll need to update this)
        IF service_role_key IS NULL OR service_role_key = '' THEN
            -- Fallback: Use anon key (less secure but works for testing)
            service_role_key := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InphcGpidGdubXhraHBmeWt4bW5oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzUyMjA4ODUsImV4cCI6MjA1MDc5Njg4NX0.fPw4TLdoMasjSqm3hKQ8T8a_7ynMPGC1yZjAAbGBBRg';
        END IF;
        
        -- Make HTTP POST request to Edge Function
        SELECT net.http_post(
            url := edge_function_url,
            headers := jsonb_build_object(
                'Content-Type', 'application/json',
                'Authorization', 'Bearer ' || service_role_key
            ),
            body := jsonb_build_object(
                'type', 'INSERT',
                'table', 'tickets',
                'record', row_to_json(NEW)
            )
        ) INTO request_id;
        
        RAISE NOTICE '[Autopilot Trigger] Sent request % for ticket #%', request_id, NEW.id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Create the trigger
DROP TRIGGER IF EXISTS trigger_ticket_autopilot_on_insert ON tickets;

CREATE TRIGGER trigger_ticket_autopilot_on_insert
    AFTER INSERT ON tickets
    FOR EACH ROW
    EXECUTE FUNCTION trigger_ticket_autopilot();

-- 4. Grant permissions
GRANT EXECUTE ON FUNCTION trigger_ticket_autopilot TO authenticated;
GRANT EXECUTE ON FUNCTION trigger_ticket_autopilot TO service_role;

-- 5. Test: You can manually test by inserting a ticket
-- INSERT INTO tickets (client_id, status, origin_source) VALUES ('some-uuid', 'solicitado', 'client_web');
