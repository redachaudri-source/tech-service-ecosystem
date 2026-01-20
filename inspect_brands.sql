SELECT 
    column_name, 
    data_type, 
    is_nullable 
FROM information_schema.columns 
WHERE table_name = 'brands';

SELECT 
    conname as constraint_name, 
    pg_get_constraintdef(c.oid) as definition
FROM pg_constraint c 
JOIN pg_class t ON c.conrelid = t.oid 
WHERE t.relname = 'brands';
