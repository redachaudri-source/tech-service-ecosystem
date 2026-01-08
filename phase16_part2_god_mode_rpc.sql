-- PHASE 16 PART 2: ANALYTICS GOD MODE RPC

CREATE OR REPLACE FUNCTION get_business_intelligence(
    p_start_date TIMESTAMP WITH TIME ZONE,
    p_end_date TIMESTAMP WITH TIME ZONE,
    p_tech_id UUID DEFAULT NULL,
    p_zone_cp TEXT DEFAULT NULL,
    p_appliance_type TEXT DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
    result JSON;
BEGIN
    -- We use a CTE to filter the tickets once, then aggregate multiple ways.
    -- This is efficient and keeps code clean.
    
    WITH filtered_data AS (
        SELECT 
            t.id,
            t.created_at,
            t.finished_at,
            t.total_amount,
            t.status,
            t.technician_id,
            t.brand_id,
            b.name as brand_name,
            p_tech.full_name as tech_name,
            p_client.postal_code as client_cp,
            t.appliance_info->>'type' as appliance_type
        FROM tickets t
        LEFT JOIN brands b ON t.brand_id = b.id
        LEFT JOIN profiles p_tech ON t.technician_id = p_tech.id
        LEFT JOIN profiles p_client ON t.client_id = p_client.id
        WHERE 
            -- Date Range (Created for volume, or Finished for revenue? usually Created for volume)
            t.created_at BETWEEN p_start_date AND p_end_date
            
            -- Dynamic Filters
            AND (p_tech_id IS NULL OR t.technician_id = p_tech_id)
            AND (p_zone_cp IS NULL OR p_client.postal_code ILIKE p_zone_cp || '%')
            AND (p_appliance_type IS NULL OR t.appliance_info->>'type' = p_appliance_type)
    )
    SELECT json_build_object(
        
        -- 1. HEADLINE KPIs
        'kpis', (
            SELECT json_build_object(
                'total_volume', COUNT(*),
                'total_revenue', COALESCE(SUM(total_amount) FILTER (WHERE status = 'finalizado'), 0),
                'avg_ticket', COALESCE(ROUND(AVG(total_amount) FILTER (WHERE status = 'finalizado'), 2), 0),
                'completion_rate', CASE 
                    WHEN COUNT(*) = 0 THEN 0 
                    ELSE ROUND((COUNT(*) FILTER (WHERE status = 'finalizado')::numeric / COUNT(*)::numeric) * 100, 1) 
                END
            )
            FROM filtered_data
        ),

        -- 2. MARKET SHARE (DONUT)
        'market_share', (
            SELECT json_agg(x) FROM (
                SELECT 
                    COALESCE(brand_name, 'Desconocido') as name, 
                    COUNT(*) as value
                FROM filtered_data
                GROUP BY brand_name
                ORDER BY value DESC
                LIMIT 8 -- Top 8 brands + others maybe? For now simple top 8
            ) x
        ),

        -- 3. SEASONALITY (AREA CHART) - Monthly Breakdown by Type (or total if filtered)
        'seasonality', (
            SELECT json_agg(x) FROM (
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

        -- 4. TECH PERFORMANCE (BAR CHART) - ROI
        'tech_performance', (
            SELECT json_agg(x) FROM (
                 SELECT 
                    COALESCE(tech_name, 'Sin Asignar') as name,
                    COUNT(*) as jobs,
                    COALESCE(SUM(total_amount) FILTER (WHERE status = 'finalizado'), 0) as revenue
                 FROM filtered_data
                 WHERE technician_id IS NOT NULL
                 GROUP BY tech_name
                 ORDER BY revenue DESC
                 LIMIT 10
            ) x
        ),

        -- 5. GEO HOTSPOTS (HEATMAP)
        'hot_zones', (
            SELECT json_agg(x) FROM (
                SELECT 
                    client_cp as id, -- for heatmap key
                    client_cp as postal_code,
                    COUNT(*) as value
                FROM filtered_data
                WHERE client_cp IS NOT NULL
                GROUP BY client_cp
                ORDER BY value DESC
                LIMIT 20
            ) x
        ),
        
        -- 6. APPLIANCE TYPES BREAKDOWN (For seasonality context)
        'appliance_stats', (
             SELECT json_agg(x) FROM (
                SELECT 
                    COALESCE(appliance_type, 'Otros') as name,
                    COUNT(*) as value
                FROM filtered_data
                GROUP BY appliance_type
                ORDER BY value DESC
             ) x
        )

    ) INTO result;

    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
