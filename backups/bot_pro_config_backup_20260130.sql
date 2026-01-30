-- ═══════════════════════════════════════════════════════════════════════════════════
-- BACKUP CONFIGURACIÓN BOT PRO - 30/01/2026 22:42
-- SECRETARIA VIRTUAL PRO - ¡FUNCIONANDO! 🎉
-- ═══════════════════════════════════════════════════════════════════════════════════

-- PARA RESTAURAR: Ejecutar este SQL en Supabase SQL Editor

-- ═══════════════════════════════════════════════════════════════════════════════════
-- CONFIGURACIÓN BUSINESS_CONFIG (BOT PRO)
-- ═══════════════════════════════════════════════════════════════════════════════════

-- Modo Secretaria PRO
INSERT INTO business_config (key, value) 
VALUES ('secretary_mode', '"pro"'::jsonb)
ON CONFLICT (key) DO UPDATE SET value = '"pro"'::jsonb;

-- Configuración PRO (slots, timeout, días búsqueda)
INSERT INTO business_config (key, value) 
VALUES ('pro_config', '{"slots_count": 3, "timeout_minutes": 15, "search_days": 14}'::jsonb)
ON CONFLICT (key) DO UPDATE SET value = '{"slots_count": 3, "timeout_minutes": 15, "search_days": 14}'::jsonb;

-- Estrategia de selección
INSERT INTO business_config (key, value) 
VALUES ('pro_selection_strategy', '"balanced"'::jsonb)
ON CONFLICT (key) DO UPDATE SET value = '"balanced"'::jsonb;

-- ═══════════════════════════════════════════════════════════════════════════════════
-- CRON JOBS ACTIVOS
-- ═══════════════════════════════════════════════════════════════════════════════════

-- Job 1: Processor principal (cada minuto)
SELECT cron.schedule(
    'ticket-autopilot-processor',
    '* * * * *',
    $$SELECT net.http_post(
        url := 'https://zapjbtgnmxkhpfykxmnh.supabase.co/functions/v1/ticket-autopilot-processor',
        headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb,
        body := '{"mode": "cron"}'::jsonb
    )$$
);

-- Job 2: Timeout monitor (cada minuto)
SELECT cron.schedule(
    'ticket-autopilot-timeout',
    '* * * * *',
    $$SELECT net.http_post(
        url := 'https://zapjbtgnmxkhpfykxmnh.supabase.co/functions/v1/ticket-autopilot-timeout',
        headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb,
        body := '{"mode": "cron"}'::jsonb
    )$$
);

-- ═══════════════════════════════════════════════════════════════════════════════════
-- ESTRUCTURA REQUERIDA EN TICKETS
-- ═══════════════════════════════════════════════════════════════════════════════════

-- Columna pro_proposal (JSONB)
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS pro_proposal JSONB DEFAULT NULL;

-- Columna processing_started_at (Lock optimista)
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS processing_started_at TIMESTAMPTZ DEFAULT NULL;

-- Índices para rendimiento
CREATE INDEX IF NOT EXISTS idx_tickets_pending_pro_processing 
ON tickets(status, created_at) 
WHERE status = 'solicitado' AND pro_proposal IS NULL AND processing_started_at IS NULL;

-- ═══════════════════════════════════════════════════════════════════════════════════
-- FIN DEL BACKUP
-- ═══════════════════════════════════════════════════════════════════════════════════
