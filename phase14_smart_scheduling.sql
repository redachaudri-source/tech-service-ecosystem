
-- Phase 14: Smart Scheduling Engine & Logistics Core
-- "The God Mode Upgrade"

-- 1. Enable btree_gist extension for standard scalar types in GiST indices (needed for EXCLUDE with int/uuid)
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- 2. Business Hours Configuration (Global Settings)
CREATE TABLE IF NOT EXISTS business_config (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    key TEXT UNIQUE NOT NULL, -- e.g., 'working_hours', 'holidays'
    value JSONB NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    updated_by UUID REFERENCES auth.users(id)
);

-- Initial Seed for Business Hours (L-V, 9-19)
INSERT INTO business_config (key, value) VALUES 
('working_hours', '{
    "monday": {"start": "09:00", "end": "19:00", "breaks": [{"start": "14:00", "end": "15:00"}]},
    "tuesday": {"start": "09:00", "end": "19:00", "breaks": [{"start": "14:00", "end": "15:00"}]},
    "wednesday": {"start": "09:00", "end": "19:00", "breaks": [{"start": "14:00", "end": "15:00"}]},
    "thursday": {"start": "09:00", "end": "19:00", "breaks": [{"start": "14:00", "end": "15:00"}]},
    "friday": {"start": "09:00", "end": "19:00", "breaks": [{"start": "14:00", "end": "15:00"}]},
    "saturday": null,
    "sunday": null
}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- 3. Dynamic Service Types Catalog
CREATE TABLE IF NOT EXISTS service_types (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL UNIQUE, -- e.g., 'Revisión Estándar', 'Instalación Aire'
    estimated_duration_min INTEGER NOT NULL DEFAULT 60,
    buffer_time_min INTEGER NOT NULL DEFAULT 30,
    color_code TEXT, -- specific color for calendar
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed Initial Service Types
INSERT INTO service_types (name, estimated_duration_min, buffer_time_min, color_code) VALUES
('Diagnóstico / Revisión', 60, 30, '#3B82F6'), -- 1h + 30m buffer
('Reparación Estándar', 90, 30, '#10B981'),   -- 1.5h + 30m
('Instalación Aire Acondicionado', 240, 45, '#8B5CF6'), -- 4h + 45m
('Instalación Caldera', 180, 45, '#F59E0B'), -- 3h + 45m
('Mantenimiento Preventivo', 60, 15, '#6366F1')
ON CONFLICT (name) DO NOTHING;

-- 4. Update Tickets Table for Logistics
ALTER TABLE tickets 
ADD COLUMN IF NOT EXISTS service_type_id UUID REFERENCES service_types(id),
ADD COLUMN IF NOT EXISTS estimated_duration INTEGER DEFAULT 60, -- Copied from service_type at creation, but editable
ADD COLUMN IF NOT EXISTS scheduled_end_at TIMESTAMPTZ;

-- Trigger to Calculate scheduled_end_at automatically (Deterministic / Immutable workaround)
CREATE OR REPLACE FUNCTION calculate_ticket_end_time()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.scheduled_at IS NOT NULL THEN
        -- Safely calculate end time based on duration
        NEW.scheduled_end_at := NEW.scheduled_at + (NEW.estimated_duration || ' minutes')::interval;
    ELSE
        NEW.scheduled_end_at := NULL;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_calculate_end_time ON tickets;
CREATE TRIGGER trg_calculate_end_time
BEFORE INSERT OR UPDATE OF scheduled_at, estimated_duration ON tickets
FOR EACH ROW
EXECUTE FUNCTION calculate_ticket_end_time();


-- 5. THE SHIELD: EXCLUDE CONSTRAINT (Anti-Overlap)
-- Ensure no technician has overlapping 'assigned' or 'confirmed' tickets.
-- We exclude status 'cancelado' or 'rejected'.
-- Note: We only constrain if technician_id IS NOT NULL and scheduled_at IS NOT NULL.

-- Function to check for overlaps (Soft constraint via Trigger is safer for complex logic, 
-- but EXCLUDE is "God Mode". Let's try EXCLUDE first, if it fails due to existing data, we might need to clean up first).

-- IMPORTANT: Supabase/Postgres EXCLUDE requires the btree_gist extension (enabled above).
-- Constraint:
-- WITH && checks for overlap in tstzrange.
-- We assume ticket is 'active' if status NOT IN ('cancelado', 'rejected').
-- Since partial indexes in EXCLUDE are tricky, we use a filtered index logic or a function.
-- Let's go with a cleaner Functional Index approach or just a Trigger for flexibility if data is messy.
-- Given "God Mode" request, I will implement a STRICT TRIGGER instead of EXCLUDE for now 
-- because EXCLUDE with specific status filters can be finicky in some postgres versions without strict immutability.
-- Actually, a trigger allows us to return a nice error message "Técnico Ocupado" instead of "23P01".

CREATE OR REPLACE FUNCTION check_tech_overlap()
RETURNS TRIGGER AS $$
BEGIN
    -- Only check if tech and date are set and status is active
    IF NEW.technician_id IS NOT NULL AND NEW.scheduled_at IS NOT NULL AND NEW.status NOT IN ('cancelado', 'rejected', 'finalizado') THEN
        IF EXISTS (
            SELECT 1 FROM tickets
            WHERE technician_id = NEW.technician_id
            AND id != NEW.id -- exclude self
            AND status NOT IN ('cancelado', 'rejected', 'finalizado') -- only active tickets
            AND scheduled_at IS NOT NULL
            -- Check Overlap: (StartA < EndB) and (EndA > StartB)
            AND scheduled_at < (NEW.scheduled_at + (NEW.estimated_duration || ' minutes')::interval)
            AND (scheduled_at + (estimated_duration || ' minutes')::interval) > NEW.scheduled_at
        ) THEN
            RAISE EXCEPTION 'CONFLICTO_AGENDA: El técnico ya tiene un servicio asignado en ese horario.';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_check_tech_overlap ON tickets;
CREATE TRIGGER trg_check_tech_overlap
BEFORE INSERT OR UPDATE ON tickets
FOR EACH ROW
EXECUTE FUNCTION check_tech_overlap();


-- 6. RPC: Smart Slot Finder (The "Algorithm")
-- This function calculates available slots for a specific date and duration
CREATE OR REPLACE FUNCTION get_tech_availability(
    target_date DATE,
    duration_minutes INTEGER,
    target_cp TEXT DEFAULT NULL
)
RETURNS TABLE (
    technician_id UUID,
    technician_name TEXT,
    slot_start TIMESTAMPTZ,
    is_optimal_cp BOOLEAN, -- True if matches CP of adjacent tickets
    efficiency_score INTEGER -- 0-100 logic
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
    -- For MVP of this function, we iterate strict 30 min slots for all techs
    -- Real production might want more complex logic, but this is a solid start.
    
    FOR tech IN SELECT id, full_name FROM profiles WHERE role = 'tech' AND is_active = true LOOP
        
        -- Start at 9:00 of target date
        curr_time := (target_date || ' ' || w_start)::timestamptz;
        
        WHILE curr_time + (duration_minutes || ' minutes')::interval <= (target_date || ' ' || w_end)::timestamptz LOOP
            slot_end := curr_time + (duration_minutes || ' minutes')::interval;
            
            -- Check overlap with existing DB tickets
            SELECT EXISTS (
                SELECT 1 FROM tickets t
                WHERE t.technician_id = tech.id
                AND t.status NOT IN ('cancelado', 'rejected', 'finalizado')
                AND t.scheduled_at IS NOT NULL
                AND (t.scheduled_at, t.scheduled_end_at) OVERLAPS (curr_time, slot_end)
            ) INTO is_conflict;

            IF NOT is_conflict THEN
                -- Check CP Logic (Bonus)
                -- Simple heuristic: check if any ticket same day has same CP
                SELECT EXISTS (
                    SELECT 1 FROM tickets t 
                    WHERE t.technician_id = tech.id 
                    AND date(t.scheduled_at) = target_date
                    -- Assume we join profiles to get address/cp, or parse it. 
                    -- For now, returning false as generic, can be improved.
                ) INTO cp_match;

                technician_id := tech.id;
                technician_name := tech.full_name;
                slot_start := curr_time;
                is_optimal_cp := FALSE; -- Pending deeper CP logic
                efficiency_score := 100;
                RETURN NEXT;
            END IF;

            -- Increment by 30 mins
            curr_time := curr_time + '30 minutes'::interval;
        END LOOP;
    END LOOP;
END;
$$ LANGUAGE plpgsql;
