
-- Phase 14 Part 2: Route Optimization Logic (CP Clustering)
-- Update the RPC to actually check for Postal Code matches

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
    w_start TIME := '09:00';
    w_end TIME := '19:00';
    curr_time TIMESTAMPTZ;
    slot_end TIMESTAMPTZ;
    is_conflict BOOLEAN;
    cp_match BOOLEAN;
BEGIN
    FOR tech IN SELECT id, full_name FROM profiles WHERE role = 'tech' AND is_active = true LOOP
        
        -- Start at 9:00 of target date
        -- In a real app, we might check business_config for that specific day
        curr_time := (target_date || ' ' || w_start)::timestamptz;
        
        WHILE curr_time + (duration_minutes || ' minutes')::interval <= (target_date || ' ' || w_end)::timestamptz LOOP
            slot_end := curr_time + (duration_minutes || ' minutes')::interval;
            
            -- 1. Check Overlap (Anti-Collision)
            SELECT EXISTS (
                SELECT 1 FROM tickets t
                WHERE t.technician_id = tech.id
                AND t.status::text NOT IN ('cancelado', 'rejected', 'finalizado') 
                AND t.scheduled_at IS NOT NULL
                AND (t.scheduled_at, t.scheduled_end_at) OVERLAPS (curr_time, slot_end)
            ) INTO is_conflict;

            IF NOT is_conflict THEN
                -- 2. Check Route Optimization (CP Clustering)
                -- If target_cp is provided, check if tech has ANY other ticket in that CP on that day
                -- OR if the tech has NO tickets yet (clean slate is neutral/good, but maybe not "Green" per se. 
                -- Let's define "Optimal" as "Already in the area").
                
                cp_match := FALSE;
                
                IF target_cp IS NOT NULL THEN
                    SELECT EXISTS (
                        SELECT 1 
                        FROM tickets t
                        JOIN profiles p ON t.client_id = p.id
                        WHERE t.technician_id = tech.id 
                        AND date(t.scheduled_at) = target_date
                        AND t.status::text NOT IN ('cancelado', 'rejected', 'finalizado')
                        AND (
                            p.postal_code = target_cp
                            OR
                            p.address ILIKE '%' || target_cp || '%' -- Fallback regex-ish
                        )
                    ) INTO cp_match;
                END IF;

                technician_id := tech.id;
                technician_name := tech.full_name;
                slot_start := curr_time;
                is_optimal_cp := cp_match; 
                efficiency_score := CASE WHEN cp_match THEN 100 ELSE 50 END;
                
                RETURN NEXT;
            END IF;

            -- Increment by 30 mins
            curr_time := curr_time + '30 minutes'::interval;
        END LOOP;
    END LOOP;
END;
$$ LANGUAGE plpgsql;
