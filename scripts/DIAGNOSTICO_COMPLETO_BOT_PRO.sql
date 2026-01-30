-- ═══════════════════════════════════════════════════════════════════════════════════
-- DIAGNÓSTICO COMPLETO BOT PRO - EJECUTAR PASO A PASO EN SUPABASE SQL EDITOR
-- Fecha: 30/01/2026
-- ═══════════════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════════════
-- PASO 1: VERIFICAR CONFIGURACIÓN DEL BOT
-- ═══════════════════════════════════════════════════════════════════════════════════
SELECT '=== PASO 1: CONFIGURACIÓN ===' as paso;

SELECT 
    key,
    value,
    CASE 
        WHEN key = 'secretary_mode' AND value::text LIKE '%pro%' THEN '✅ MODO PRO ACTIVO'
        WHEN key = 'secretary_mode' THEN '❌ MODO PRO NO ACTIVO'
        ELSE '📋 Config'
    END as estado
FROM business_config 
WHERE key IN ('secretary_mode', 'pro_config', 'pro_selection_strategy', 'working_hours')
ORDER BY key;

-- ═══════════════════════════════════════════════════════════════════════════════════
-- PASO 2: VERIFICAR TÉCNICOS ACTIVOS
-- ═══════════════════════════════════════════════════════════════════════════════════
SELECT '=== PASO 2: TÉCNICOS ACTIVOS ===' as paso;

SELECT 
    id,
    full_name,
    role,
    is_active,
    CASE WHEN is_active THEN '✅ ACTIVO' ELSE '❌ INACTIVO' END as estado
FROM profiles 
WHERE role = 'tech';

-- ═══════════════════════════════════════════════════════════════════════════════════
-- PASO 3: VERIFICAR TICKETS EN ESTADO 'solicitado'
-- ═══════════════════════════════════════════════════════════════════════════════════
SELECT '=== PASO 3: TICKETS SOLICITADOS ===' as paso;

SELECT 
    ticket_number as "#",
    id,
    status,
    CASE 
        WHEN pro_proposal IS NULL THEN '✅ NULL (listo para bot)'
        WHEN pro_proposal->>'status' = 'waiting_selection' THEN '⏳ ESPERANDO SELECCIÓN'
        WHEN pro_proposal->>'status' = 'no_slots' THEN '❌ SIN SLOTS'
        WHEN pro_proposal->>'status' = 'selected' THEN '✅ SELECCIONADO'
        WHEN pro_proposal->>'status' = 'expired' THEN '⏰ EXPIRADO'
        ELSE '❓ ' || (pro_proposal->>'status')
    END as pro_proposal_status,
    pro_proposal->>'expires_at' as expira_en,
    CASE 
        WHEN pro_proposal->>'expires_at' IS NOT NULL 
             AND (pro_proposal->>'expires_at')::timestamptz < NOW() 
        THEN '⚠️ YA EXPIRÓ'
        ELSE ''
    END as expiracion_check,
    processing_started_at,
    technician_id,
    scheduled_at,
    created_at
FROM tickets 
WHERE status = 'solicitado'
ORDER BY created_at DESC
LIMIT 10;

-- ═══════════════════════════════════════════════════════════════════════════════════
-- PASO 4: VERIFICAR COLUMNA processing_started_at EXISTE
-- ═══════════════════════════════════════════════════════════════════════════════════
SELECT '=== PASO 4: SCHEMA DE TICKETS ===' as paso;

SELECT 
    column_name,
    data_type,
    CASE 
        WHEN column_name IN ('pro_proposal', 'processing_started_at') THEN '✅ REQUERIDO'
        ELSE ''
    END as requerido
FROM information_schema.columns 
WHERE table_name = 'tickets' 
  AND column_name IN ('pro_proposal', 'processing_started_at', 'status', 'technician_id', 'scheduled_at')
ORDER BY column_name;

-- ═══════════════════════════════════════════════════════════════════════════════════
-- PASO 5: VERIFICAR CRON JOBS ACTIVOS
-- ═══════════════════════════════════════════════════════════════════════════════════
SELECT '=== PASO 5: CRON JOBS ===' as paso;

SELECT 
    jobid,
    jobname,
    schedule,
    active,
    CASE WHEN active THEN '✅ ACTIVO' ELSE '❌ INACTIVO' END as estado
FROM cron.job
WHERE jobname LIKE '%autopilot%' OR jobname LIKE '%bot%' OR jobname LIKE '%processor%' OR jobname LIKE '%timeout%';

-- ═══════════════════════════════════════════════════════════════════════════════════
-- PASO 6: VERIFICAR DISPONIBILIDAD RPC (simular llamada del bot)
-- ═══════════════════════════════════════════════════════════════════════════════════
SELECT '=== PASO 6: DISPONIBILIDAD TÉCNICOS (Lunes próximo) ===' as paso;

SELECT * FROM get_tech_availability(
    (CURRENT_DATE + INTERVAL '1 day' * (8 - EXTRACT(DOW FROM CURRENT_DATE))::int)::date, -- Próximo lunes
    120,
    NULL
) LIMIT 5;

-- ═══════════════════════════════════════════════════════════════════════════════════
-- PASO 7: VER DETALLE DE pro_proposal DEL TICKET MÁS RECIENTE
-- ═══════════════════════════════════════════════════════════════════════════════════
SELECT '=== PASO 7: DETALLE PRO_PROPOSAL TICKET RECIENTE ===' as paso;

SELECT 
    ticket_number,
    pro_proposal
FROM tickets 
WHERE status = 'solicitado'
ORDER BY created_at DESC
LIMIT 1;

-- ═══════════════════════════════════════════════════════════════════════════════════
-- PASO 8: VERIFICAR TRIGGERS DE WEBHOOK
-- ═══════════════════════════════════════════════════════════════════════════════════
SELECT '=== PASO 8: TRIGGERS EN TICKETS ===' as paso;

SELECT 
    trigger_name,
    event_manipulation,
    action_timing,
    action_statement
FROM information_schema.triggers
WHERE event_object_table = 'tickets';

-- ═══════════════════════════════════════════════════════════════════════════════════
-- FIN DEL DIAGNÓSTICO - REVISAR RESULTADOS ARRIBA
-- ═══════════════════════════════════════════════════════════════════════════════════
