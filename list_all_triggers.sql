-- DETECTIVE: List ALL Triggers
SELECT 
    event_object_schema as schema,
    event_object_table as table,
    trigger_name,
    action_timing,
    event_manipulation,
    action_statement
FROM information_schema.triggers
WHERE event_object_table IN ('users', 'profiles')
ORDER BY event_object_table, trigger_name;
