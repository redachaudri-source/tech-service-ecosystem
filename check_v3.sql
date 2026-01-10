-- CHECK V3 RPC
-- Run this. If it fails, the function does not exist.
SELECT * FROM get_analytics_v3(
    NOW() - INTERVAL '30 days',
    NOW()
);
