-- ═══════════════════════════════════════════════════════════════════════════
-- BACKUP DE BASE DE DATOS - FIXARR v3.3.12_90
-- Fecha: 2026-01-31
-- Descripción: Bot PRO Secretaria Virtual 100% funcional
-- ═══════════════════════════════════════════════════════════════════════════

-- ╔═════════════════════════════════════════════════════════════════════════╗
-- ║  CONFIGURACIÓN DEL BOT PRO                                              ║
-- ╚═════════════════════════════════════════════════════════════════════════╝

-- Exportar configuración business_config
-- Ejecuta esto en Supabase SQL Editor para ver el estado actual:

SELECT 
  key,
  value,
  'INSERT INTO business_config (key, value) VALUES (''' || key || ''', ''' || value::text || ''') ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;' as restore_sql
FROM business_config
WHERE key IN ('secretary_mode', 'pro_config', 'pro_selection_strategy', 'working_hours');

-- ╔═════════════════════════════════════════════════════════════════════════╗
-- ║  ESTRUCTURA DE COLUMNAS CRÍTICAS                                        ║
-- ╚═════════════════════════════════════════════════════════════════════════╝

-- Columnas del Bot PRO en tabla tickets:
-- - pro_proposal (JSONB): Propuesta de citas generada por el bot
-- - processing_started_at (TIMESTAMPTZ): Lock optimista para evitar duplicados
-- - origin_source (VARCHAR): Origen del ticket (client_web, whatsapp, admin, etc.)

-- Verificar que existen:
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'tickets' 
AND column_name IN ('pro_proposal', 'processing_started_at', 'origin_source');

-- ╔═════════════════════════════════════════════════════════════════════════╗
-- ║  FUNCIONES Y TRIGGERS DEL BOT PRO                                       ║
-- ╚═════════════════════════════════════════════════════════════════════════╝

-- Función del trigger de disparo instantáneo
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
  IF NEW.status <> 'solicitado' THEN RETURN NEW; END IF;

  SELECT REPLACE(COALESCE(value::text, ''), '"', '') INTO secretary_mode
  FROM business_config WHERE key = 'secretary_mode';
  
  IF secretary_mode IS DISTINCT FROM 'pro' THEN RETURN NEW; END IF;

  payload := jsonb_build_object('ticket_id', NEW.id::text, 'type', TG_OP);

  PERFORM net.http_post(
    url := edge_url,
    body := payload,
    headers := '{"Content-Type": "application/json"}'::jsonb,
    timeout_milliseconds := 5000
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

-- Triggers
DROP TRIGGER IF EXISTS trigger_ticket_autopilot_on_insert ON public.tickets;
CREATE TRIGGER trigger_ticket_autopilot_on_insert
  AFTER INSERT ON public.tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_ticket_autopilot();

DROP TRIGGER IF EXISTS trigger_ticket_autopilot_on_update ON public.tickets;
CREATE TRIGGER trigger_ticket_autopilot_on_update
  AFTER UPDATE OF status ON public.tickets
  FOR EACH ROW
  WHEN (NEW.status = 'solicitado' AND OLD.status IS DISTINCT FROM 'solicitado' AND NEW.pro_proposal IS NULL)
  EXECUTE FUNCTION public.trigger_ticket_autopilot();

-- ╔═════════════════════════════════════════════════════════════════════════╗
-- ║  CRON JOBS                                                              ║
-- ╚═════════════════════════════════════════════════════════════════════════╝

-- Ver cron jobs activos:
SELECT jobid, jobname, schedule, active FROM cron.job WHERE jobname LIKE '%autopilot%';

-- Recrear cron job principal (si es necesario):
-- SELECT cron.schedule(
--   'ticket-autopilot-processor',
--   '* * * * *',
--   $$SELECT net.http_post(
--     url := 'https://zapjbtgnmxkhpfykxmnh.supabase.co/functions/v1/ticket-autopilot-processor',
--     body := '{"mode": "cron"}'::jsonb,
--     headers := '{"Content-Type": "application/json"}'::jsonb
--   );$$
-- );

-- ╔═════════════════════════════════════════════════════════════════════════╗
-- ║  CONFIGURACIÓN RECOMENDADA                                              ║
-- ╚═════════════════════════════════════════════════════════════════════════╝

-- Valores por defecto del Bot PRO:
INSERT INTO business_config (key, value) VALUES 
  ('secretary_mode', '"pro"'),
  ('pro_config', '{"slots_count": 3, "timeout_minutes": 3, "search_days": 7}'),
  ('pro_selection_strategy', '"balanced"')
ON CONFLICT (key) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- NOTAS DE LA VERSIÓN 3.3.12_90
-- ═══════════════════════════════════════════════════════════════════════════
-- 
-- ✅ Bot PRO Secretaria Virtual 100% funcional
-- ✅ Procesamiento automático de tickets nuevos
-- ✅ Modal de selección de citas en cliente web
-- ✅ Filtrado de slots pasados (hora España + 1h buffer)
-- ✅ Conversión UTC a hora España
-- ✅ Solo muestra hora de llegada del técnico (sin rango)
-- ✅ Protección contra doble clic en modal
-- ✅ Reintento automático de tickets con "no_slots"
-- 
-- Edge Functions desplegadas:
-- - ticket-autopilot-processor (motor principal)
-- - ticket-autopilot-timeout (monitor de expiración)
-- 
-- ═══════════════════════════════════════════════════════════════════════════
