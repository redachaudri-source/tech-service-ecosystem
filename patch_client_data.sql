-- DATA PATCH: FIX CLIENT ORIGINS FOR ANALYTICS
-- Run this in Supabase SQL Editor

BEGIN;

-- 1. Normalize 'client' role casing (just in case)
UPDATE profiles 
SET role = 'client' 
WHERE role ILIKE 'client';

-- 2. Tag existing NULL/Empty clients as 'app'
-- This includes all clients currently showing "APP" badge in frontend (because they were != 'admin')
UPDATE profiles
SET created_via = 'app'
WHERE 
    role = 'client'
    AND (created_via IS NULL OR created_via = '' OR created_via != 'admin');

-- Verification Output
SELECT count(*) as updated_app_users FROM profiles WHERE created_via = 'app';

COMMIT;
