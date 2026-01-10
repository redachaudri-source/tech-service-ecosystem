-- PHASE 16 PART 2: ANALYTICS GOD MODE RPC (HARDENED V6 - PROFILE SOURCE FIX)
-- Updates: Switched client_metrics source from auth.users to profiles (public) to fix 0 count.

CREATE OR REPLACE FUNCTION get_business_intelligence(
    p_start_date TIMESTAMP WITH TIME ZONE,
    p_end_date TIMESTAMP WITH TIME ZONE,
    p_tech_id UUID DEFAULT NULL,
    p_zone_cp TEXT DEFAULT NULL,
    p_appliance_type TEXT DEFAULT NULL,
    p_brand_id UUID DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
    result JSON;
BEGIN
    WITH filtered_data AS (
        SELECT 
            t.id,
            t.created_at,
            t.finished_at,
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
            t.created_at BETWEEN p_start_date AND p_end_date
            AND (p_tech_id IS NULL OR t.technician_id = p_tech_id)
            AND (p_zone_cp IS NULL OR p_client.postal_code ILIKE p_zone_cp || '%')
            AND (p_appliance_type IS NULL OR t.appliance_info->>'type' = p_appliance_type)
            AND (p_brand_id IS NULL OR t.brand_id = p_brand_id)
    ),
    client_metrics AS (
        -- FIX: Source from PROFILES (Public) instead of auth.users
        -- This guarantees we see all users with role 'client'
        SELECT 
            p.id,
            p.created_at,
            p.updated_at as last_active, -- Proxy for activity
            (SELECT COUNT(*) FROM tickets t WHERE t.client_id = p.id) as ticket_count
        FROM profiles p
        WHERE p.role = 'client'
        -- NOTE: No date filter here. We want TOTAL historic users.
    )
    SELECT json_build_object(
        
        -- 1. HEADLINE KPIs
        'kpis', (
            SELECT COALESCE(
                json_build_object(
                    'total_volume', COUNT(*),
                    'total_revenue', COALESCE(SUM(total_amount) FILTER (WHERE status = 'finalizado'), 0),
                    'avg_ticket', COALESCE(ROUND(AVG(total_amount) FILTER (WHERE status = 'finalizado'), 2), 0),
                    'completion_rate', CASE 
                        WHEN COUNT(*) = 0 THEN 0 
                        ELSE ROUND((COUNT(*) FILTER (WHERE status = 'finalizado')::numeric / COUNT(*)::numeric) * 100, 1) 
                    END
                ),
                '{"total_volume": 0, "total_revenue": 0, "avg_ticket": 0, "completion_rate": 0}'::json
            )
            FROM filtered_data
        ),

        -- 2. MARKET SHARE
        'market_share', (
            SELECT COALESCE(
                json_agg(x), '[]'::json
            ) FROM (
                SELECT 
                    brand_name as name, 
                    COUNT(*) as value
                FROM filtered_data
                GROUP BY brand_name
                ORDER BY value DESC
                LIMIT 8
            ) x
        ),

        -- 3. SEASONALITY
        'seasonality', (
            SELECT COALESCE(
                json_agg(x), '[]'::json
            ) FROM (
                SELECT 
                    TO_CHAR(created_at, 'Mon') as month,
                    TO_CHAR(created_at, 'MM') as month_num,
                    COUNT(*) as tickets,
                    COALESCE(SUM(total_amount), 0) as revenue
                FROM filtered_data
                GROUP BY month, month_num
                ORDER BY month_num
            ) x
        ),

        -- 4. TECH PERFORMANCE
        'tech_performance', (
            SELECT COALESCE(
                json_agg(x), '[]'::json
            ) FROM (
                 SELECT 
                    tech_name as name,
                    COUNT(*) as jobs,
                    COALESCE(SUM(total_amount) FILTER (WHERE status = 'finalizado'), 0) as revenue
                 FROM filtered_data
                 WHERE technician_id IS NOT NULL
                 GROUP BY tech_name
                 ORDER BY revenue DESC
                 LIMIT 10
            ) x
        ),

        -- 5. HOT ZONES
        'hot_zones', (
            SELECT COALESCE(
                json_agg(x), '[]'::json
            ) FROM (
                SELECT 
                    client_cp as postal_code,
                    COUNT(*) as value
                FROM filtered_data
                GROUP BY client_cp
                ORDER BY value DESC
                LIMIT 20
            ) x
        ),

        -- 6. TOP FAULT
        'top_fault', (
             SELECT COALESCE(
                (SELECT appliance_type FROM filtered_data GROUP BY appliance_type ORDER BY COUNT(*) DESC LIMIT 1),
                'N/A'
             )
        ),

        -- 7. STATUS BREAKDOWN
        'status_breakdown', (
            SELECT COALESCE(
                json_agg(x), '[]'::json
            ) FROM (
                SELECT 
                    status,
                    COUNT(*) as count
                FROM filtered_data
                GROUP BY status
                ORDER BY count DESC
            ) x
        ),

        -- 8. CLIENT ADOPTION (PROFILES SOURCE)
        'client_adoption', (
            SELECT json_build_object(
                'total_users', (SELECT COUNT(*) FROM client_metrics),
                'active_30d', (SELECT COUNT(*) FROM client_metrics WHERE last_active > NOW() - INTERVAL '30 days'),
                'conversion_rate', (
                    SELECT CASE 
                        WHEN COUNT(*) = 0 THEN 0 
                        ELSE ROUND((COUNT(*) FILTER (WHERE ticket_count > 0)::numeric / COUNT(*)::numeric) * 100, 1) 
                    END 
                    FROM client_metrics
                ),
                'growth_curve', (
                    SELECT COALESCE(json_agg(gc), '[]'::json)
                    FROM (
                        SELECT 
                            TO_CHAR(created_at, 'YYYY-MM') as month,
                            COUNT(*) as new_users
                        FROM client_metrics
                        GROUP BY month
                        ORDER BY month
                    ) gc
                )
            )
        )

    ) INTO result;

    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
