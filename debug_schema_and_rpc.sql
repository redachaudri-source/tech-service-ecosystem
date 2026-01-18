-- Check columns in tickets table
SELECT column_name 
FROM information_schema.columns 
WHERE table_name = 'tickets' 
AND column_name LIKE '%appliance%';

-- Check if RPC exists and permissions
SELECT proname, proacl 
FROM pg_proc 
WHERE proname = 'fn_get_appliance_financial_limit';
