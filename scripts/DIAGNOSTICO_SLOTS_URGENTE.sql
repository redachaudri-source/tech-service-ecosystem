-- ═══════════════════════════════════════════════════════════════════════════
-- DIAGNÓSTICO URGENTE: ¿Por qué no hay slots?
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Verificar que calc_travel_time existe y funciona
SELECT calc_travel_time('29651', '29730') as travel_time_test;

-- 2. Verificar horarios configurados
SELECT key, value FROM business_config WHERE key = 'working_hours';

-- 3. Verificar técnicos activos con CP
SELECT id, full_name, postal_code, is_active 
FROM profiles 
WHERE role = 'tech' AND is_active = true;

-- 4. Verificar tickets del día 1/2/2026 para el técnico
SELECT 
    id, 
    ticket_number,
    scheduled_at,
    scheduled_end_at,
    status,
    technician_id
FROM tickets 
WHERE DATE(scheduled_at AT TIME ZONE 'Europe/Madrid') = '2026-02-01'
  AND status NOT IN ('cancelado', 'rejected', 'finalizado')
ORDER BY scheduled_at;

-- 5. Probar el RPC directamente
SELECT * FROM get_tech_availability('2026-02-01'::date, 60, '29730') LIMIT 10;

-- 6. Si falla, probar SIN CP (para descartar problema de travel time)
SELECT * FROM get_tech_availability('2026-02-01'::date, 60, NULL) LIMIT 10;
