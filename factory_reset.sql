-- FACTORY RESET SCRIPT
-- WARNING: THIS DELETES ALL DATA EXCEPT THE SUPER ADMIN

BEGIN;

-- 1. Truncate Transactional Tables (Cascade deletes references)
-- We include 'RESTART IDENTITY' to reset auto-incrementing IDs (like friendly_id)
TRUNCATE TABLE 
    reviews, 
    technician_locations, 
    mortify_assessments, 
    warranties,
    budgets,
    tickets, 
    client_appliances, 
    inventory,
    service_parts,
    service_catalog
    RESTART IDENTITY CASCADE;

-- 2. Clean up Users (Profiles)
-- Preserve the specific Super Admin. 
-- Adjust the email if your admin email is different.
DELETE FROM profiles 
WHERE email NOT ILIKE 'admin@techservice.com' 
  AND role != 'admin'; 

-- 3. Reset Sequences Manually (Just in case TRUNCATE missed some unrelated sequences)
-- Assuming standard naming convention 'tablename_column_seq'
-- Use DO block to handle errors if sequences don't exist

DO $$ 
BEGIN 
    -- Reset Ticket Friendly ID
    IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'tickets_ticket_number_seq') THEN
        ALTER SEQUENCE tickets_ticket_number_seq RESTART WITH 1;
    END IF;
    
    -- Reset Client Friendly ID
    IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'profiles_friendly_id_seq') THEN
        -- We might need to set it to 2 if Admin is #1, but starting at 1 is fine if nextval handles collision or if admin is #8
        ALTER SEQUENCE profiles_friendly_id_seq RESTART WITH 100; -- Start clients at 100 for safety/cleanliness
    END IF;

     -- Reset Appliance Friendly ID
    IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'client_appliances_friendly_id_seq') THEN
        ALTER SEQUENCE client_appliances_friendly_id_seq RESTART WITH 1;
    END IF;
END $$;

COMMIT;

SELECT 'FACTORY RESET COMPLETE. Admin account preserved.' as status;
