-- NUCLEAR OPTION DEBUG RPC (V10 - SCORCHED EARTH DROPS)
-- Dynamically finds and drops ALL versions of the function to fix "not unique" errors.

DO $$ 
DECLARE 
    r RECORD;
BEGIN 
    FOR r IN 
        SELECT oid::regprocedure::text as func_signature 
        FROM pg_proc 
        WHERE proname = 'get_business_intelligence' 
    LOOP 
        EXECUTE 'DROP FUNCTION ' || r.func_signature || ' CASCADE'; 
    END LOOP; 
END $$;

CREATE OR REPLACE FUNCTION get_business_intelligence(
    p_start_date TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    p_end_date TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    p_tech_id UUID DEFAULT NULL,
    p_zone_cp TEXT DEFAULT NULL,
    p_appliance_type TEXT DEFAULT NULL,
    p_brand_id UUID DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
    result JSON;
    v_total_profiles_count INT;
    v_client_role_count INT;
    v_app_origin_count INT;
    v_visible_tickets INT;
    
    -- Set defaults
    v_start_date TIMESTAMP WITH TIME ZONE := COALESCE(p_start_date, '2000-01-01'::timestamptz);
    v_end_date TIMESTAMP WITH TIME ZONE := COALESCE(p_end_date, NOW());
BEGIN
    -- DIAGNOSTICS: Count what the function can actually SEE
    SELECT COUNT(*) INTO v_total_profiles_count FROM profiles;
    SELECT COUNT(*) INTO v_client_role_count FROM profiles WHERE role = 'client';
    SELECT COUNT(*) INTO v_app_origin_count FROM profiles WHERE role = 'client' AND created_via IS DISTINCT FROM 'admin';
    SELECT COUNT(*) INTO v_visible_tickets FROM tickets;

    WITH filtered_tickets AS (
        SELECT 
            t.id,
            t.created_at,
            t.total_amount,
            t.status,
            t.technician_id,
            t.brand_id,
            COALESCE(b.name, 'Otros') as brand_name,
            COALESCE(p_tech.full_name, 'Sin Asignar') as tech_name,
            COALESCE(p_client.postal_code, '00000') as client_cp,
            COALESCE(t.appliance_info->>'type', 'Otros') as appliance_type
        FROM tickets t
        LEFT JOIN brands b ON t.brand_id = b.id
        LEFT JOIN profiles p_tech ON t.technician_id = p_tech.id
        LEFT JOIN profiles p_client ON t.client_id = p_client.id
        WHERE 
            t.created_at BETWEEN v_start_date AND v_end_date
            AND (p_tech_id IS NULL OR t.technician_id = p_tech_id)
            AND (p_zone_cp IS NULL OR p_client.postal_code ILIKE p_zone_cp || '%')
            AND (p_appliance_type IS NULL OR t.appliance_info->>'type' = p_appliance_type)
            AND (p_brand_id IS NULL OR t.brand_id = p_brand_id)
    ),
    all_clients AS (
        SELECT 
            p.id,
            p.created_at,
            p.updated_at,
            (SELECT COUNT(*) FROM tickets t WHERE t.client_id = p.id) as ticket_count
        FROM profiles p
        WHERE 
            p.role = 'client'
            AND p.created_via IS DISTINCT FROM 'admin'
    )
    SELECT json_build_object(
        'debug_diagnostics', json_build_object(
            'raw_profile_count', v_total_profiles_count,
            'client_role_count', v_client_role_count,
            'app_origin_count', v_app_origin_count,
            'visible_tickets', v_visible_tickets,
            'msg', 'If these are 0, RLS is blocking the function even with SECURITY DEFINER.'
        ),
        'kpis', (
            SELECT COALESCE(json_build_object(
                'total_volume', COUNT(*), 
                'total_revenue', COALESCE(SUM(total_amount) FILTER (WHERE status IN ('finalizado', 'pagado')), 0), 
                'avg_ticket', COALESCE(ROUND(AVG(total_amount) FILTER (WHERE status IN ('finalizado', 'pagado')), 2), 0), 
                'completion_rate', CASE WHEN COUNT(*) = 0 THEN 0 ELSE ROUND((COUNT(*) FILTER (WHERE status IN ('finalizado', 'pagado'))::numeric / COUNT(*)::numeric) * 100, 1) END
            ), '{"total_volume": 0, "total_revenue": 0, "avg_ticket": 0, "completion_rate": 0}'::json) 
            FROM filtered_tickets
        ),
        'market_share', (SELECT COALESCE(json_agg(x), '[]'::json) FROM (SELECT brand_name as name, COUNT(*) as value FROM filtered_tickets GROUP BY brand_name ORDER BY value DESC LIMIT 8) x),
        'seasonality', (SELECT COALESCE(json_agg(x), '[]'::json) FROM (SELECT TO_CHAR(created_at, 'Mon') as month, TO_CHAR(created_at, 'MM') as month_num, COUNT(*) as tickets, COALESCE(SUM(total_amount), 0) as revenue FROM filtered_tickets GROUP BY month, month_num ORDER BY month_num) x),
        'tech_performance', (SELECT COALESCE(json_agg(x), '[]'::json) FROM (SELECT tech_name as name, COUNT(*) as jobs, COALESCE(SUM(total_amount) FILTER (WHERE status IN ('finalizado', 'pagado')), 0) as revenue FROM filtered_tickets WHERE technician_id IS NOT NULL GROUP BY tech_name ORDER BY revenue DESC LIMIT 10) x),
        'hot_zones', (SELECT COALESCE(json_agg(x), '[]'::json) FROM (SELECT client_cp as postal_code, COUNT(*) as value FROM filtered_tickets GROUP BY client_cp ORDER BY value DESC LIMIT 20) x),
        'top_fault', (SELECT COALESCE((SELECT appliance_type FROM filtered_tickets GROUP BY appliance_type ORDER BY COUNT(*) DESC LIMIT 1), 'N/A')),
        'status_breakdown', (SELECT COALESCE(json_agg(x), '[]'::json) FROM (SELECT status, COUNT(*) as count FROM filtered_tickets GROUP BY status ORDER BY count DESC) x),
        'client_adoption', (
            SELECT json_build_object(
                'total_users', (SELECT COUNT(*) FROM all_clients),
                'active_30d', (SELECT COUNT(*) FROM all_clients WHERE updated_at > NOW() - INTERVAL '30 days'),
                'conversion_rate', (SELECT CASE WHEN COUNT(*) = 0 THEN 0 ELSE ROUND((COUNT(*) FILTER (WHERE ticket_count > 0)::numeric / COUNT(*)::numeric) * 100, 1) END FROM all_clients),
                'growth_curve', (SELECT COALESCE(json_agg(gc), '[]'::json) FROM (SELECT TO_CHAR(created_at, 'YYYY-MM') as month, COUNT(*) as new_users FROM all_clients GROUP BY month ORDER BY month) gc)
            )
        )
    ) INTO result;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions;

-- Grant permissions explicitly
GRANT EXECUTE ON FUNCTION get_business_intelligence TO authenticated;
GRANT EXECUTE ON FUNCTION get_business_intelligence TO service_role;
