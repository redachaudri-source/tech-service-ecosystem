-- ═══════════════════════════════════════════════════════════════════════════
-- AUTOPILOT SCAN (cron cada minuto)
-- Requisitos:
-- 1) Activar pg_net en Dashboard → Database → Extensions
-- 2) Activar pg_cron en Dashboard → Database → Extensions
-- ═══════════════════════════════════════════════════════════════════════════

-- Crear job cron (cada minuto) que llama a ticket-autopilot en modo scan
SELECT cron.schedule(
  'autopilot-scan-every-minute',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://zapjbtgnmxkhpfykxmnh.supabase.co/functions/v1/ticket-autopilot',
    body := '{"mode": "scan"}'::jsonb,
    headers := '{"Content-Type": "application/json"}'::jsonb,
    timeout_milliseconds := 15000
  );
  $$
);

-- Ver jobs activos:
-- SELECT * FROM cron.job ORDER BY jobid DESC;
