SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'tickets' 
AND column_name LIKE 'warranty%';
