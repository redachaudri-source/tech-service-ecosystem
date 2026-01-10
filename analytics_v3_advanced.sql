-- ANALYTICS V3: Advanced Multi-Select & Full Tech Visibility
-- Drop dynamic overloads first to be clean
DO $$ 
DECLARE 
    r RECORD;
BEGIN 
    FOR r IN (SELECT oid::regprocedure as name FROM pg_proc WHERE proname = 'get_analytics_v3') LOOP 
        EXECUTE 'DROP FUNCTION ' || r.name; 
    END LOOP; 
END $$;

CREATE OR REPLACE FUNCTION get_analytics_v3(
    p_start_date TIMESTAMP WITH TIME ZONE,
    p_end_date TIMESTAMP WITH TIME ZONE,
    p_tech_ids UUID[] DEFAULT NULL, -- Array
    p_zone_cps TEXT[] DEFAULT NULL, -- Array (Future proofing)
    p_appliance_types TEXT[] DEFAULT NULL, -- Array
    p_brand_ids UUID[] DEFAULT NULL -- Array
)
RETURNS JSON AS $$
DECLARE
    result JSON;
BEGIN
    WITH filtered_tickets AS (
        SELECT 
            t.id,
            t.total_amount,
            t.status,
            t.created_at,
            t.technician_id,
            t.client_id,
            COALESCE(t.appliance_info->>'type', 'Otros') as appliance_type,
            b.name as brand_name,
            p.postal_code as client_cp,
            tech.full_name as tech_name
        FROM tickets t
        LEFT JOIN brands b ON t.brand_id = b.id
        LEFT JOIN profiles p ON t.client_id = p.id
        LEFT JOIN profiles tech ON t.technician_id = tech.id
        WHERE 
            t.created_at BETWEEN p_start_date AND p_end_date
            AND (p_tech_ids IS NULL OR t.technician_id = ANY(p_tech_ids))
            AND (p_brand_ids IS NULL OR t.brand_id = ANY(p_brand_ids))
            AND (p_appliance_types IS NULL OR COALESCE(t.appliance_info->>'type', 'Otros') = ANY(p_appliance_types))
            -- zone filter if needed later
    ),
    -- 1. Tech Performance (ALL Techs, not just active ones)
    all_techs AS (
        SELECT id, full_name FROM profiles WHERE role = 'tech' AND deleted_at IS NULL
    ),
    tech_stats AS (
        SELECT 
            at.full_name as name,
            COUNT(ft.id) as jobs,
            COALESCE(SUM(ft.total_amount) FILTER (WHERE ft.status IN ('finalizado', 'pagado')), 0) as revenue,
            CASE WHEN COUNT(ft.id) > 0 THEN 'Activo' ELSE 'Sin Actividad' END as status
        FROM all_techs at
        LEFT JOIN filtered_tickets ft ON at.id = ft.technician_id
        WHERE (p_tech_ids IS NULL OR at.id = ANY(p_tech_ids)) -- Apply filter to the list of techs too if specific ones requested
        GROUP BY at.id, at.full_name
        ORDER BY revenue DESC
    ),
    -- 2. Profitability by Type
    type_profitability AS (
        SELECT 
            appliance_type as name,
            COUNT(*) as volume,
            COALESCE(SUM(total_amount), 0) as revenue,
            CASE WHEN COUNT(*) = 0 THEN 0 ELSE ROUND(SUM(total_amount) / COUNT(*), 2) END as avg_ticket
        FROM filtered_tickets
        GROUP BY appliance_type
        ORDER BY revenue DESC
    )
    SELECT json_build_object(
        'debug_diagnostics', (SELECT json_build_object(
            'version', 'V3 MULTI-SELECT',
            'ticket_count', (SELECT COUNT(*) FROM filtered_tickets),
            'filters', json_build_object('brands', p_brand_ids, 'types', p_appliance_types)
        )),
        'kpis', (
            SELECT json_build_object(
                'total_volume', (SELECT COUNT(*) FROM filtered_tickets),
                'total_revenue', (SELECT COALESCE(SUM(total_amount), 0) FROM filtered_tickets),
                'avg_ticket', (SELECT CASE WHEN COUNT(*) = 0 THEN 0 ELSE ROUND(AVG(total_amount), 2) END FROM filtered_tickets),
                'completion_rate', (SELECT CASE WHEN COUNT(*) = 0 THEN 0 ELSE ROUND((COUNT(*) FILTER (WHERE status = 'finalizado')::numeric / COUNT(*)::numeric) * 100, 1) END FROM filtered_tickets)
            )
        ),
        'market_share', (
            SELECT COALESCE(json_agg(x), '[]'::json) 
            FROM (SELECT brand_name as name, COUNT(*) as value FROM filtered_tickets GROUP BY brand_name ORDER BY value DESC LIMIT 10) x
        ),
        'type_share', (
            SELECT COALESCE(json_agg(x), '[]'::json) 
            FROM (SELECT appliance_type as name, COUNT(*) as value FROM filtered_tickets GROUP BY appliance_type ORDER BY value DESC LIMIT 10) x
        ),
        'profitability_by_type', (
            SELECT COALESCE(json_agg(x), '[]'::json) FROM type_profitability x
        ),
        'tech_performance', (
            SELECT COALESCE(json_agg(x), '[]'::json) FROM tech_stats x
        ),
        'hot_zones', (
            SELECT COALESCE(json_agg(x), '[]'::json) 
            FROM (
                SELECT client_cp as postal_code, COUNT(*) as value, COALESCE(SUM(total_amount), 0) as revenue 
                FROM filtered_tickets 
                GROUP BY client_cp 
                ORDER BY value DESC LIMIT 50
            ) x
        ),
        'client_adoption', (
             -- Keep V2 Logic (Direct Profile Query, somewhat independent of ticket filters, or should it respect date?)
             -- Usually Client Adoption is "Total System Users", not filtered by ticket brands.
             -- We will respect DATE range for "Active" and "Growth", but Total is Total.
            SELECT json_build_object(
                'total_users', (SELECT COUNT(*) FROM profiles WHERE role = 'client' AND created_via IS DISTINCT FROM 'admin'),
                'active_30d', (SELECT COUNT(*) FROM profiles WHERE role = 'client' AND created_via IS DISTINCT FROM 'admin' AND created_at > NOW() - INTERVAL '30 days'), -- Fallback to created_at if updated_at is missing
                'conversion_rate', 50, -- Static for now or calc complex logic
                'growth_curve', (
                    SELECT COALESCE(json_agg(gc), '[]'::json) 
                    FROM (
                        SELECT TO_CHAR(created_at, 'YYYY-MM') as month, COUNT(*) as new_users 
                        FROM profiles 
                        WHERE role = 'client' AND created_via IS DISTINCT FROM 'admin' 
                        AND created_at BETWEEN p_start_date AND p_end_date 
                        GROUP BY month ORDER BY month
                    ) gc
                )
            )
        )
    ) INTO result;
    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
