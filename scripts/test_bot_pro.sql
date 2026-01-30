-- ═══════════════════════════════════════════════════════════════════════════
-- TEST SCRIPT: Bot PRO Autopilot
-- Ejecutar en SQL Editor para verificar instalación
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. VERIFICAR ESTRUCTURA DE TABLA
-- ═══════════════════════════════════════════════════════════════════════════
SELECT '=== VERIFICANDO COLUMNAS ===' as step;

SELECT 
    column_name,
    data_type,
    CASE 
        WHEN column_name IN ('pro_proposal', 'processing_started_at') THEN '✅ OK'
        ELSE '⚠️ Existente'
    END as status
FROM information_schema.columns 
WHERE table_name = 'tickets' 
AND column_name IN ('pro_proposal', 'processing_started_at', 'status', 'technician_id', 'scheduled_at');

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. VERIFICAR CONFIGURACIÓN
-- ═══════════════════════════════════════════════════════════════════════════
SELECT '=== VERIFICANDO CONFIGURACIÓN ===' as step;

SELECT 
    key,
    value,
    CASE 
        WHEN key = 'secretary_mode' AND value::text LIKE '%pro%' THEN '✅ PRO Activo'
        WHEN key = 'secretary_mode' THEN '⚠️ Modo Básico'
        ELSE '✅ Configurado'
    END as status
FROM business_config 
WHERE key IN ('secretary_mode', 'pro_selection_strategy', 'pro_config');

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. VERIFICAR TRIGGERS
-- ═══════════════════════════════════════════════════════════════════════════
SELECT '=== VERIFICANDO TRIGGERS ===' as step;

SELECT 
    tgname as trigger_name,
    CASE 
        WHEN tgname LIKE '%autopilot%' THEN '✅ Instalado'
        ELSE '⚠️'
    END as status
FROM pg_trigger 
WHERE tgname LIKE '%autopilot%';

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. VERIFICAR FUNCIONES
-- ═══════════════════════════════════════════════════════════════════════════
SELECT '=== VERIFICANDO FUNCIONES ===' as step;

SELECT 
    routine_name,
    '✅ Existe' as status
FROM information_schema.routines 
WHERE routine_schema = 'public' 
AND routine_name IN (
    'trigger_ticket_autopilot',
    'clean_stale_processing_locks',
    'mark_expired_proposals',
    'get_tech_availability'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. VERIFICAR TÉCNICOS ACTIVOS
-- ═══════════════════════════════════════════════════════════════════════════
SELECT '=== VERIFICANDO TÉCNICOS ===' as step;

SELECT 
    COUNT(*) as total_tecnicos,
    COUNT(*) FILTER (WHERE is_active = true) as activos,
    CASE 
        WHEN COUNT(*) FILTER (WHERE is_active = true) > 0 THEN '✅ Hay técnicos activos'
        ELSE '❌ Sin técnicos activos'
    END as status
FROM profiles 
WHERE role = 'tech' AND is_deleted = false;

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. VERIFICAR TICKETS PENDIENTES
-- ═══════════════════════════════════════════════════════════════════════════
SELECT '=== TICKETS PENDIENTES DE PROCESAR ===' as step;

SELECT 
    COUNT(*) as total,
    COUNT(*) FILTER (WHERE pro_proposal IS NULL AND processing_started_at IS NULL) as sin_procesar,
    COUNT(*) FILTER (WHERE pro_proposal IS NOT NULL) as con_propuesta,
    COUNT(*) FILTER (WHERE processing_started_at IS NOT NULL) as en_proceso
FROM tickets 
WHERE status = 'solicitado';

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. TEST: INSERTAR TICKET DE PRUEBA (Comentado por seguridad)
-- ═══════════════════════════════════════════════════════════════════════════
/*
-- Descomenta para probar:
INSERT INTO tickets (
    status, 
    postal_code, 
    client_name, 
    client_phone,
    origin_source
) VALUES (
    'solicitado', 
    '29013', 
    'TEST_BOT_PRO_' || to_char(now(), 'YYYYMMDD_HH24MI'),
    '+34600000000',
    'admin'
);

-- Verificar después de 2-5 segundos:
SELECT id, status, pro_proposal, processing_started_at, created_at
FROM tickets 
WHERE client_name LIKE 'TEST_BOT_PRO_%'
ORDER BY created_at DESC
LIMIT 5;
*/

-- ═══════════════════════════════════════════════════════════════════════════
-- 8. VERIFICAR DISPONIBILIDAD (RPC)
-- ═══════════════════════════════════════════════════════════════════════════
SELECT '=== TEST RPC get_tech_availability ===' as step;

SELECT * FROM get_tech_availability(
    CURRENT_DATE + 1,  -- mañana
    120,               -- 2 horas
    NULL               -- sin filtro CP
) LIMIT 5;

-- ═══════════════════════════════════════════════════════════════════════════
-- RESUMEN FINAL
-- ═══════════════════════════════════════════════════════════════════════════
SELECT '

╔═══════════════════════════════════════════════════════════════╗
║                  BOT PRO AUTOPILOT - STATUS                   ║
╠═══════════════════════════════════════════════════════════════╣
║  Si todos los checks muestran ✅, el sistema está listo.     ║
║                                                               ║
║  Próximos pasos:                                              ║
║  1. Activar modo PRO en Admin Panel                           ║
║  2. Verificar Cron Jobs en Dashboard                          ║
║  3. Insertar ticket de prueba                                 ║
╚═══════════════════════════════════════════════════════════════╝

' as instrucciones;
