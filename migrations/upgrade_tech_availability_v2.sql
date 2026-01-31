-- ============================================================================
-- UPGRADE: get_tech_availability v2.0 - Travel Time Algorithm
-- Replica la lógica del Optimizador de Rutas de la Agenda Global
-- ============================================================================

-- 1. HELPER FUNCTION: Calcular tiempo de viaje entre CPs (Heurística)
-- Misma lógica que getTravelTime() en GlobalAgenda.jsx
CREATE OR REPLACE FUNCTION calc_travel_time(cp_a TEXT, cp_b TEXT)
RETURNS INTEGER AS $$
DECLARE
    num_a INTEGER;
    num_b INTEGER;
    diff INTEGER;
BEGIN
    -- Si faltan datos, buffer seguro de 15 min
    IF cp_a IS NULL OR cp_b IS NULL OR cp_a = '' OR cp_b = '' THEN
        RETURN 15;
    END IF;
    
    -- Extraer solo números del CP
    num_a := COALESCE(NULLIF(regexp_replace(cp_a, '\D', '', 'g'), '')::INTEGER, 0);
    num_b := COALESCE(NULLIF(regexp_replace(cp_b, '\D', '', 'g'), '')::INTEGER, 0);
    
    -- Si alguno es 0, buffer seguro
    IF num_a = 0 OR num_b = 0 THEN
        RETURN 15;
    END IF;
    
    -- Fórmula: min(60, 15 + (diferencia × 2)) minutos
    diff := ABS(num_a - num_b);
    RETURN LEAST(60, 15 + (diff * 2));
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 2. HELPER FUNCTION: Calcular duración del servicio por tipo
-- Según especificaciones del usuario
CREATE OR REPLACE FUNCTION calc_service_duration(
    service_type TEXT,
    appliance_type TEXT
)
RETURNS INTEGER AS $$
BEGIN
    -- Normalizar a minúsculas
    service_type := LOWER(COALESCE(service_type, ''));
    appliance_type := LOWER(COALESCE(appliance_type, ''));
    
    -- DIAGNÓSTICO: 30 min
    IF service_type LIKE '%diagnos%' OR service_type LIKE '%diagn%' THEN
        RETURN 30;
    END IF;
    
    -- INSTALACIÓN
    IF service_type LIKE '%instalac%' THEN
        -- Aire Acondicionado: 240 min (4 horas)
        IF appliance_type LIKE '%aire%' OR appliance_type LIKE '%acondicionado%' OR appliance_type LIKE '%split%' THEN
            RETURN 240;
        END IF;
        -- Calentador: 120 min
        IF appliance_type LIKE '%calentador%' OR appliance_type LIKE '%termo%' OR appliance_type LIKE '%boiler%' THEN
            RETURN 120;
        END IF;
        -- Otros: 90 min por defecto
        RETURN 90;
    END IF;
    
    -- REPARACIÓN
    IF service_type LIKE '%reparac%' OR service_type LIKE '%repair%' THEN
        -- Frigorífico, Calentador, Termo, Aire Acondicionado: 90 min
        IF appliance_type LIKE '%frigo%' OR appliance_type LIKE '%nevera%' OR 
           appliance_type LIKE '%calentador%' OR appliance_type LIKE '%termo%' OR 
           appliance_type LIKE '%aire%' OR appliance_type LIKE '%acondicionado%' THEN
            RETURN 90;
        END IF;
        -- Lavadora, Lavavajillas: 60 min
        IF appliance_type LIKE '%lavadora%' OR appliance_type LIKE '%lavavajillas%' THEN
            RETURN 60;
        END IF;
        -- Otros: 60 min
        RETURN 60;
    END IF;
    
    -- MANTENIMIENTO: 90 min
    IF service_type LIKE '%mantenim%' THEN
        RETURN 90;
    END IF;
    
    -- DEFAULT: 60 min
    RETURN 60;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 3. MAIN RPC: get_tech_availability v2.0
-- Ahora calcula tiempo de viaje desde CP base del técnico o servicio anterior
CREATE OR REPLACE FUNCTION get_tech_availability(
    target_date DATE,
    duration_minutes INTEGER,
    target_cp TEXT DEFAULT NULL
)
RETURNS TABLE (
    technician_id UUID,
    technician_name TEXT,
    slot_start TIMESTAMPTZ,
    is_optimal_cp BOOLEAN, 
    efficiency_score INTEGER
) AS $$
DECLARE
    tech RECORD;
    
    -- Dynamic Schedule Variables
    day_key TEXT;
    config_json JSONB;
    day_config JSONB;
    
    w_start TIME;
    w_end TIME;
    
    curr_time TIMESTAMPTZ;
    slot_end TIMESTAMPTZ;
    is_conflict BOOLEAN;
    
    -- 🆕 TRAVEL TIME VARIABLES
    tech_base_cp TEXT;
    prev_service RECORD;
    origin_cp TEXT;
    travel_time_min INTEGER;
    adjusted_start TIMESTAMPTZ;
    
BEGIN
    -- 1. Determine Day Key (monday, tuesday...)
    CASE extract(dow from target_date)
        WHEN 1 THEN day_key := 'monday';
        WHEN 2 THEN day_key := 'tuesday';
        WHEN 3 THEN day_key := 'wednesday';
        WHEN 4 THEN day_key := 'thursday';
        WHEN 5 THEN day_key := 'friday';
        WHEN 6 THEN day_key := 'saturday';
        WHEN 0 THEN day_key := 'sunday';
    END CASE;

    -- 2. Fetch Config
    SELECT value INTO config_json FROM business_config WHERE key = 'working_hours';
    
    -- 3. Extract Start/End for that day
    IF config_json IS NOT NULL AND config_json ? day_key THEN
        day_config := config_json -> day_key;
        
        IF day_config IS NULL OR day_config = 'null'::jsonb THEN
            RETURN;
        END IF;

        w_start := COALESCE((day_config->>'start')::time, '09:00');
        w_end := COALESCE((day_config->>'end')::time, '19:00');
    ELSE
        w_start := '09:00';
        w_end := '19:00';
    END IF;

    -- 4. Iterate Techs & Slots
    FOR tech IN 
        SELECT p.id, p.full_name, p.postal_code 
        FROM profiles p 
        WHERE p.role = 'tech' AND p.is_active = true 
    LOOP
        
        -- 🆕 Get tech's base CP (Km0)
        tech_base_cp := tech.postal_code;
        
        -- 🆕 Find tech's LAST scheduled service BEFORE this slot on target_date
        -- This determines where they'll be coming from
        SELECT 
            t.scheduled_at,
            t.scheduled_end_at,
            COALESCE(
                -- First try client_addresses postal_code
                (SELECT ca.postal_code FROM client_addresses ca WHERE ca.id = t.address_id LIMIT 1),
                -- Then try ticket's service_address postal_code extraction
                CASE 
                    WHEN t.service_address IS NOT NULL AND t.service_address::text LIKE '%postal_code%' 
                    THEN t.service_address->>'postal_code'
                    ELSE NULL 
                END,
                -- Fallback to client's profile postal_code
                (SELECT c.postal_code FROM profiles c WHERE c.id = t.client_id LIMIT 1)
            ) as service_cp
        INTO prev_service
        FROM tickets t
        WHERE t.technician_id = tech.id
          AND t.status::text NOT IN ('cancelado', 'rejected', 'finalizado')
          AND t.scheduled_at IS NOT NULL
          AND DATE(t.scheduled_at AT TIME ZONE 'Europe/Madrid') = target_date
        ORDER BY t.scheduled_at DESC
        LIMIT 1;
        
        -- Start at w_start of target date
        curr_time := (target_date || ' ' || w_start)::timestamptz;
        
        -- Loop until w_end
        WHILE curr_time + (duration_minutes || ' minutes')::interval <= (target_date || ' ' || w_end)::timestamptz LOOP
            slot_end := curr_time + (duration_minutes || ' minutes')::interval;
            
            -- Check overlap with existing DB tickets
            SELECT EXISTS (
                SELECT 1 FROM tickets t
                WHERE t.technician_id = tech.id
                AND t.status::text NOT IN ('cancelado', 'rejected', 'finalizado') 
                AND t.scheduled_at IS NOT NULL
                AND (t.scheduled_at, t.scheduled_end_at) OVERLAPS (curr_time, slot_end)
            ) INTO is_conflict;

            IF NOT is_conflict THEN
                -- 🆕 TRAVEL TIME CALCULATION
                -- Find the service that ends just before this slot
                SELECT 
                    ts.scheduled_end_at,
                    COALESCE(
                        (SELECT ca.postal_code FROM client_addresses ca WHERE ca.id = ts.address_id LIMIT 1),
                        CASE 
                            WHEN ts.service_address IS NOT NULL AND ts.service_address::text LIKE '%postal_code%' 
                            THEN ts.service_address->>'postal_code'
                            ELSE NULL 
                        END,
                        (SELECT c.postal_code FROM profiles c WHERE c.id = ts.client_id LIMIT 1)
                    ) as service_cp
                INTO prev_service
                FROM tickets ts
                WHERE ts.technician_id = tech.id
                  AND ts.status::text NOT IN ('cancelado', 'rejected', 'finalizado')
                  AND ts.scheduled_at IS NOT NULL
                  AND DATE(ts.scheduled_at AT TIME ZONE 'Europe/Madrid') = target_date
                  AND ts.scheduled_end_at <= curr_time
                ORDER BY ts.scheduled_end_at DESC
                LIMIT 1;
                
                -- Determine origin CP
                IF prev_service.service_cp IS NOT NULL THEN
                    -- Coming from previous service
                    origin_cp := prev_service.service_cp;
                ELSE
                    -- First service of the day, coming from home base
                    origin_cp := tech_base_cp;
                END IF;
                
                -- Calculate travel time
                IF target_cp IS NOT NULL AND origin_cp IS NOT NULL THEN
                    travel_time_min := calc_travel_time(origin_cp, target_cp);
                ELSE
                    travel_time_min := 15; -- Default buffer
                END IF;
                
                -- 🆕 ADJUSTED START: slot_start + travel_time must fit in the window
                -- The slot is valid only if tech can ARRIVE at curr_time having left origin_cp
                -- So we check: prev_service.scheduled_end_at + travel_time <= curr_time
                IF prev_service.scheduled_end_at IS NOT NULL THEN
                    adjusted_start := prev_service.scheduled_end_at + (travel_time_min || ' minutes')::interval;
                    
                    -- If adjusted start is AFTER curr_time, this slot isn't truly available
                    IF adjusted_start > curr_time THEN
                        -- Skip this slot - tech can't arrive in time
                        curr_time := curr_time + '30 minutes'::interval;
                        CONTINUE;
                    END IF;
                END IF;
                
                -- Slot is valid!
                technician_id := tech.id;
                technician_name := tech.full_name;
                slot_start := curr_time;
                
                -- 🆕 CP Optimization scoring
                IF target_cp IS NOT NULL AND origin_cp IS NOT NULL THEN
                    -- Is this an optimal CP match? (same first 3 digits = same sector)
                    is_optimal_cp := LEFT(origin_cp, 3) = LEFT(target_cp, 3);
                    -- Efficiency score: 100 - travel_time (higher is better)
                    efficiency_score := GREATEST(0, 100 - travel_time_min);
                ELSE
                    is_optimal_cp := FALSE;
                    efficiency_score := 50; -- Neutral when no CP data
                END IF;
                
                RETURN NEXT;
            END IF;

            -- Increment by 30 mins
            curr_time := curr_time + '30 minutes'::interval;
        END LOOP;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- 4. GRANT PERMISSIONS
GRANT EXECUTE ON FUNCTION calc_travel_time(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION calc_travel_time(TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION calc_service_duration(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION calc_service_duration(TEXT, TEXT) TO anon;

-- 5. TEST QUERY (Uncomment to test)
-- SELECT * FROM get_tech_availability(CURRENT_DATE, 60, '29651') ORDER BY efficiency_score DESC;

-- ============================================================================
-- VERIFICACIÓN
-- ============================================================================
DO $$
BEGIN
    RAISE NOTICE '✅ calc_travel_time() creada';
    RAISE NOTICE '✅ calc_service_duration() creada';
    RAISE NOTICE '✅ get_tech_availability() actualizada con algoritmo de viaje';
    RAISE NOTICE '';
    RAISE NOTICE '📊 TEST calc_travel_time:';
    RAISE NOTICE '  29651 → 29651 = % min', calc_travel_time('29651', '29651');
    RAISE NOTICE '  29651 → 29660 = % min', calc_travel_time('29651', '29660');
    RAISE NOTICE '  29651 → 29730 = % min', calc_travel_time('29651', '29730');
    RAISE NOTICE '';
    RAISE NOTICE '📊 TEST calc_service_duration:';
    RAISE NOTICE '  Diagnóstico + Lavadora = % min', calc_service_duration('Diagnóstico', 'Lavadora');
    RAISE NOTICE '  Reparación + Frigorífico = % min', calc_service_duration('Reparación', 'Frigorífico');
    RAISE NOTICE '  Reparación + Lavadora = % min', calc_service_duration('Reparación', 'Lavadora');
    RAISE NOTICE '  Instalación + Aire Acondicionado = % min', calc_service_duration('Instalación', 'Aire Acondicionado');
    RAISE NOTICE '  Instalación + Calentador = % min', calc_service_duration('Instalación', 'Calentador');
    RAISE NOTICE '  Mantenimiento + Cualquiera = % min', calc_service_duration('Mantenimiento', 'Otros');
END $$;
