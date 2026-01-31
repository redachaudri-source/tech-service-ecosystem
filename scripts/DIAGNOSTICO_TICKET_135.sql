-- ═══════════════════════════════════════════════════════════════════════════
-- DIAGNÓSTICO: ¿Por qué el bot NO encuentra el ticket #135?
-- Ejecuta esto AHORA en Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Ver TODOS los campos del ticket #135
SELECT 
  ticket_number,
  status,
  CASE WHEN pro_proposal IS NULL THEN '✅ NULL' ELSE '❌ TIENE VALOR: ' || pro_proposal::text END as pro_proposal_check,
  CASE WHEN processing_started_at IS NULL THEN '✅ NULL' ELSE '❌ TIENE VALOR' END as processing_check,
  CASE WHEN technician_id IS NULL THEN '✅ NULL' ELSE '❌ TIENE VALOR' END as tech_check,
  CASE WHEN scheduled_at IS NULL THEN '✅ NULL' ELSE '❌ TIENE VALOR' END as scheduled_check,
  created_at
FROM tickets
WHERE ticket_number = 135;

-- 2. Query EXACTA que usa el bot (debería encontrar el ticket)
SELECT 
  ticket_number,
  'CUMPLE CRITERIOS BOT' as resultado
FROM tickets
WHERE status = 'solicitado'
  AND pro_proposal IS NULL
  AND processing_started_at IS NULL
  AND technician_id IS NULL
  AND scheduled_at IS NULL
ORDER BY created_at DESC
LIMIT 5;

-- 3. Si NO aparece arriba, ver qué campo está bloqueando
SELECT 
  ticket_number,
  status,
  pro_proposal IS NULL as "pro_proposal_null?",
  processing_started_at IS NULL as "processing_null?",
  technician_id IS NULL as "tech_null?",
  scheduled_at IS NULL as "scheduled_null?"
FROM tickets
WHERE ticket_number = 135;
