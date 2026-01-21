-- Verify technician_locations table exists and check structure
SELECT 
    column_name, 
    data_type, 
    is_nullable
FROM information_schema.columns
WHERE table_name = 'technician_locations'
ORDER BY ordinal_position;

-- Check if there's any data
SELECT COUNT(*) as total_records FROM technician_locations;

-- Check RLS policies
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual
FROM pg_policies
WHERE tablename = 'technician_locations';
