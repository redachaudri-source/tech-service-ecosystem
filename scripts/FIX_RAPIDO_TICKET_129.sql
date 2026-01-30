-- ═══════════════════════════════════════════════════════════════════════════════════
-- FIX RÁPIDO - TICKET #129 - EJECUTAR TODO EN SUPABASE SQL EDITOR
-- ═══════════════════════════════════════════════════════════════════════════════════

-- PASO 1: Aumentar timeout a 15 minutos (más tiempo para elegir)
UPDATE business_config 
SET value = '{"slots_count": 3, "timeout_minutes": 15, "search_days": 7}'::jsonb
WHERE key = 'pro_config';

-- Verificar
SELECT key, value FROM business_config WHERE key = 'pro_config';

-- ═══════════════════════════════════════════════════════════════════════════════════

-- PASO 2: Limpiar ticket #129 para nuevo procesamiento
UPDATE tickets 
SET 
    pro_proposal = NULL,
    processing_started_at = NULL
WHERE ticket_number = 129
  AND status = 'solicitado'
RETURNING ticket_number, id, status, pro_proposal;

-- ═══════════════════════════════════════════════════════════════════════════════════

-- PASO 3: Verificar que el ticket está listo para el bot
SELECT 
    ticket_number,
    id,
    status,
    CASE WHEN pro_proposal IS NULL THEN '✅ LISTO' ELSE '❌ TIENE PROPOSAL' END as estado,
    processing_started_at,
    technician_id,
    scheduled_at
FROM tickets 
WHERE ticket_number = 129;

-- ═══════════════════════════════════════════════════════════════════════════════════
-- AHORA EL BOT PROCESARÁ EL TICKET EN EL PRÓXIMO CICLO (CADA 1 MINUTO)
-- 
-- Para forzar procesamiento inmediato:
-- 1. Ve a Supabase Dashboard > Edge Functions
-- 2. Selecciona "ticket-autopilot-processor"
-- 3. Click "Invoke" con body: {"mode": "cron"}
-- 4. Revisa los logs
-- ═══════════════════════════════════════════════════════════════════════════════════
