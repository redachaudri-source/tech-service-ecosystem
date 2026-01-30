-- ═══════════════════════════════════════════════════════════════════════════
-- CRON JOBS - Bot PRO Autopilot
-- Configurar en: Dashboard → Database → Extensions → pg_cron (Enable)
-- Luego ejecutar este script en SQL Editor
-- ═══════════════════════════════════════════════════════════════════════════

-- Primero habilitar pg_cron si no está
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ═══════════════════════════════════════════════════════════════════════════
-- CRON 1: Motor Principal (cada 30 segundos simulado con 2 jobs)
-- pg_cron solo soporta minutos, así que creamos 2 jobs offset 30s
-- ═══════════════════════════════════════════════════════════════════════════

-- Job A: En el minuto exacto (XX:00)
SELECT cron.unschedule('ticket-autopilot-main-a');
SELECT cron.schedule(
  'ticket-autopilot-main-a',
  '* * * * *',  -- Cada minuto
  $$
  SELECT net.http_post(
    url := 'https://zapjbtgnmxkhpfykxmnh.supabase.co/functions/v1/ticket-autopilot-processor',
    body := '{"mode": "cron"}'::jsonb,
    headers := '{"Content-Type": "application/json"}'::jsonb
  );
  $$
);

-- NOTA: Para verdaderos 30 segundos, necesitas pg_cron avanzado o usar
-- Supabase Dashboard → Edge Functions → Schedules

-- ═══════════════════════════════════════════════════════════════════════════
-- CRON 2: Timeout Monitor (cada 1 minuto)
-- ═══════════════════════════════════════════════════════════════════════════

SELECT cron.unschedule('ticket-autopilot-timeout');
SELECT cron.schedule(
  'ticket-autopilot-timeout',
  '* * * * *',  -- Cada minuto
  $$
  SELECT net.http_post(
    url := 'https://zapjbtgnmxkhpfykxmnh.supabase.co/functions/v1/ticket-autopilot-timeout',
    body := '{}'::jsonb,
    headers := '{"Content-Type": "application/json"}'::jsonb
  );
  $$
);

-- ═══════════════════════════════════════════════════════════════════════════
-- Ver jobs programados
-- ═══════════════════════════════════════════════════════════════════════════
SELECT * FROM cron.job;

-- ═══════════════════════════════════════════════════════════════════════════
-- Ver historial de ejecuciones
-- ═══════════════════════════════════════════════════════════════════════════
SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 20;
