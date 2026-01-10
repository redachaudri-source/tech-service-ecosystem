-- DIAGNOSIS V3 ZEROS
-- 1. Check Raw Data
SELECT COUNT(*) as raw_ticket_count FROM tickets;

-- 2. Run RPC with NULLs (Official)
-- Using a wide date range to catch everything
SELECT jsonb_pretty(get_analytics_v3(
    '2000-01-01'::timestamptz,
    '2030-01-01'::timestamptz,
    NULL, NULL, NULL, NULL
)::jsonb) as rpc_null_result;

-- 3. Run RPC with Empty Arrays (Edge Case check)
SELECT jsonb_pretty(get_analytics_v3(
    '2000-01-01'::timestamptz,
    '2030-01-01'::timestamptz,
    '{}'::uuid[], -- Empty UUID array
    NULL,
    '{}'::text[], -- Empty text array
    '{}'::uuid[]
)::jsonb) as rpc_empty_array_result;
