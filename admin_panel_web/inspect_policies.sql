SELECT schemaname, tablename, policyname, cmd, qual, with_check
FROM pg_policies
WHERE qual LIKE '%am_i_role%' OR with_check LIKE '%am_i_role%';
