SELECT 
    event_object_table AS table_name, 
    trigger_name 
FROM information_schema.triggers 
WHERE event_object_table = 'tickets';
