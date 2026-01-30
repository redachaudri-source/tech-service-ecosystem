-- ═══════════════════════════════════════════════════════════════════════════
-- RESET TICKET PARA NUEVO PROCESAMIENTO BOT PRO
-- Ejecutar en Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════════════

-- PASO 1: Ver estado actual del ticket #128
SELECT 
    id,
    ticket_number,
    status,
    pro_proposal,
    processing_started_at,
    technician_id,
    scheduled_at
FROM tickets 
WHERE ticket_number = 128;

-- PASO 2: Limpiar pro_proposal para permitir nuevo procesamiento
-- (Descomentar y ejecutar cuando estés listo)
/*
UPDATE tickets 
SET 
    pro_proposal = NULL,
    processing_started_at = NULL,
    technician_id = NULL,
    scheduled_at = NULL
WHERE ticket_number = 128
  AND status = 'solicitado';
*/

-- PASO 3: Aumentar timeout a 10 minutos (recomendado)
-- (Descomentar y ejecutar)
/*
UPDATE business_config 
SET value = jsonb_set(
    COALESCE(value, '{}'::jsonb),
    '{timeout_minutes}',
    '10'::jsonb
)
WHERE key = 'pro_config';
*/

-- PASO 4: Verificar configuración actual
SELECT key, value FROM business_config 
WHERE key IN ('secretary_mode', 'pro_config', 'pro_selection_strategy');

-- PASO 5: Verificar técnicos activos
SELECT id, full_name, role, is_active 
FROM profiles 
WHERE role = 'tech' AND is_active = true;

-- PASO 6: Simular llamada al bot (después de limpiar)
-- El bot se ejecuta automáticamente cada minuto via cron
-- O puedes invocarlo manualmente desde el Dashboard de Supabase:
-- Functions > ticket-autopilot-processor > Invoke con body: {"mode": "cron"}
