-- PHASE 16: ANALYTICS & BI SCHEMA

-- 1. Create Brands Table
CREATE TABLE IF NOT EXISTS public.brands (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    tier TEXT DEFAULT 'standard', -- premium, standard, budget
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Add brand_id to Tickets
ALTER TABLE public.tickets 
ADD COLUMN IF NOT EXISTS brand_id UUID REFERENCES public.brands(id);

-- 3. Migration Script: Text -> Relation
-- This block scans tickets, creates missing brands, and links them.
DO $$ 
DECLARE
    r RECORD;
    b_id UUID;
    clean_name TEXT;
BEGIN
    FOR r IN SELECT id, appliance_brand FROM tickets WHERE brand_id IS NULL AND appliance_brand IS NOT NULL LOOP
        -- Simple Normalization: Trim and Proper Case (e.g., " SAMSUNG " -> "Samsung")
        clean_name := INITCAP(TRIM(r.appliance_brand));
        
        IF length(clean_name) > 1 THEN
            -- Insert or Get ID
            INSERT INTO brands (name) VALUES (clean_name)
            ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name -- Dummy update to get ID via returning? No, standard logic:
            RETURNING id INTO b_id;
            
            -- If it existed (on conflict), we need to select it
            IF b_id IS NULL THEN
                SELECT id INTO b_id FROM brands WHERE name = clean_name;
            END IF;

            -- Update Ticket
            UPDATE tickets SET brand_id = b_id WHERE id = r.id;
        END IF;
    END LOOP;
END $$;


-- 4. RPC: Manage Brand (Find or Create for Smart Selector)
CREATE OR REPLACE FUNCTION manage_brand(brand_name TEXT)
RETURNS UUID AS $$
DECLARE
    b_id UUID;
    clean_name TEXT;
BEGIN
    clean_name := INITCAP(TRIM(brand_name));
    
    SELECT id INTO b_id FROM brands WHERE name = clean_name;
    
    IF b_id IS NULL THEN
        INSERT INTO brands (name) VALUES (clean_name) RETURNING id INTO b_id;
    END IF;
    
    RETURN b_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 5. RPC: Get Analytics KPIs (The Backend Engine)
-- Returns multiple datasets in one JSON to minimize roundtrips
CREATE OR REPLACE FUNCTION get_analytics_kpis(
    start_date DATE DEFAULT (CURRENT_DATE - INTERVAL '30 days'),
    end_date DATE DEFAULT CURRENT_DATE
)
RETURNS JSON AS $$
DECLARE
    result JSON;
BEGIN
    SELECT json_build_object(
        -- A. Brand War (Top Brands by Volume)
        'top_brands', (
            SELECT json_agg(t) FROM (
                SELECT b.name, COUNT(*) as count, 
                       ROUND(AVG(ti.total_amount)::numeric, 2) as avg_ticket
                FROM tickets ti
                JOIN brands b ON ti.brand_id = b.id
                WHERE ti.created_at::DATE BETWEEN start_date AND end_date
                GROUP BY b.name
                ORDER BY count DESC
                LIMIT 10
            ) t
        ),
        
        -- B. Heatmap Data (Postal Code + Count)
        'heatmap', (
            SELECT json_agg(t) FROM (
                SELECT p.postal_code, COUNT(*) as count
                FROM tickets ti
                JOIN profiles p ON ti.client_id = p.id
                WHERE ti.created_at::DATE BETWEEN start_date AND end_date
                AND p.postal_code IS NOT NULL
                GROUP BY p.postal_code
            ) t
        ),

        -- C. Time Rhythm (Day of Week)
        'daily_rhythm', (
            SELECT json_agg(t) FROM (
                SELECT TO_CHAR(created_at, 'Day') as day_name, COUNT(*) as count
                FROM tickets 
                WHERE created_at::DATE BETWEEN start_date AND end_date
                GROUP BY day_name, EXTRACT(ISODOW FROM created_at)
                ORDER BY EXTRACT(ISODOW FROM created_at)
            ) t
        ),
        
        -- D. Tech Ranking (Facturación & Valoración)
        'tech_ranking', (
            SELECT json_agg(t) FROM (
                SELECT p.full_name, COUNT(*) as jobs, 
                       COALESCE(SUM(ti.total_amount), 0) as total_revenue
                FROM tickets ti
                JOIN profiles p ON ti.technician_id = p.id
                WHERE ti.status = 'finalizado'
                AND ti.finished_at::DATE BETWEEN start_date AND end_date
                GROUP BY p.full_name
                ORDER BY total_revenue DESC
                LIMIT 5
            ) t
        )
    ) INTO result;

    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
