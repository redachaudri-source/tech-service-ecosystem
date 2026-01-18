-- EXPOSE RPC TO API
GRANT EXECUTE ON FUNCTION fn_get_appliance_financial_limit(UUID) TO anon;
GRANT EXECUTE ON FUNCTION fn_get_appliance_financial_limit(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_get_appliance_financial_limit(UUID) TO service_role;

-- Reload Schema Cache (Force Supabase to see it)
NOTIFY pgrst, 'reload config';
