SELECT pg_get_functiondef(oid) 
FROM pg_proc 
WHERE proname = 'trigger_auto_harvest_brand';
