-- FIX: Make get_tech_availability respect business_config
-- Previously hardcoded to 09:00 - 19:00

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
    cp_match BOOLEAN;
BEGIN
    -- 1. Determine Day Key (monday, tuesday...)
    -- dow: 0=Sunday, 1=Monday, ... 6=Saturday
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
        
        -- If day_config is null (closed), return empty immediately
        IF day_config IS NULL OR day_config = 'null'::jsonb THEN
            RETURN;
        END IF;

        -- Extract times (Default fallback if missing)
        w_start := COALESCE((day_config->>'start')::time, '09:00');
        w_end := COALESCE((day_config->>'end')::time, '19:00');
    ELSE
        -- Fallback if no config found
        w_start := '09:00';
        w_end := '19:00';
    END IF;

    -- 4. Iterate Techs & Slots (Existing Logic)
    FOR tech IN SELECT id, full_name FROM profiles WHERE role = 'tech' AND is_active = true LOOP
        
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
                technician_id := tech.id;
                technician_name := tech.full_name;
                slot_start := curr_time;
                is_optimal_cp := FALSE; 
                efficiency_score := 100;
                RETURN NEXT;
            END IF;

            -- Increment by 30 mins
            curr_time := curr_time + '30 minutes'::interval;
        END LOOP;
    END LOOP;
END;
$$ LANGUAGE plpgsql;
