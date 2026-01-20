
-- Check table info
SELECT 
    column_name, 
    data_type, 
    is_nullable 
FROM information_schema.columns 
WHERE table_name = 'client_appliances';

-- Check Constraints
SELECT 
    conname as constraint_name, 
    contype as constraint_type, 
    pg_get_constraintdef(c.oid) as definition
FROM pg_constraint c 
JOIN pg_class t ON c.conrelid = t.oid 
WHERE t.relname = 'client_appliances';

-- Check Triggers
SELECT 
    trigger_name, 
    event_manipulation, 
    event_object_table, 
    action_statement
FROM information_schema.triggers
WHERE event_object_table = 'client_appliances';
