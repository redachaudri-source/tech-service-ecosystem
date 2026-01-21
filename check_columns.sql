DO $$
DECLARE
    col_name text;
BEGIN
    FOR col_name IN
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = 'tickets'
    LOOP
        RAISE NOTICE '%', col_name;
    END LOOP;
END $$;
