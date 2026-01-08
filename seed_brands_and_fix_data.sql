-- 1. SEED COMMON BRANDS
-- We insert them if they don't exist (ignoring case is tricky with unique constraint unless we normalize first, 
-- but our table has unique constraint on 'name'. We'll use ON CONFLICT DO NOTHING).

INSERT INTO public.brands (name, tier) VALUES 
('Samsung', 'standard'),
('LG', 'standard'),
('Bosch', 'premium'),
('Balay', 'standard'),
('Siemens', 'premium'),
('Whirlpool', 'standard'),
('Indesit', 'budget'),
('Tekame', 'budget'), -- Maybe Teka?
('Teka', 'standard'),
('Fagor', 'standard'),
('Edesa', 'budget'),
('Zanussi', 'standard'),
('Electrolux', 'premium'),
('AEG', 'premium'),
('Miele', 'premium'),
('Beko', 'budget'),
('Hisense', 'budget'),
('Haier', 'standard'),
('Candy', 'budget'),
('Daikin', 'premium'),
('Fujitsu', 'standard'),
('Mitsubishi', 'premium'),
('Carrier', 'standard'),
('Liebherr', 'premium'),
('Smeg', 'premium')
ON CONFLICT (name) DO NOTHING;

-- 2. FIX TICKETS LINKS (MIGRATION RETRY)
-- We try to match appliance_info->>'brand' with the new brands table.
-- We use ILIKE for case-insensitive matching.

DO $$ 
DECLARE
    r RECORD;
    target_brand_id UUID;
    brand_text TEXT;
BEGIN
    FOR r IN SELECT id, appliance_info FROM tickets WHERE brand_id IS NULL LOOP
        
        -- Extract brand text from JSON
        brand_text := TRIM(r.appliance_info->>'brand');
        
        IF brand_text IS NOT NULL AND brand_text != '' THEN
            -- Try to find matching brand (Case Insensitive)
            SELECT id INTO target_brand_id 
            FROM brands 
            WHERE name ILIKE brand_text 
            LIMIT 1;

            -- If found, update ticket
            IF target_brand_id IS NOT NULL THEN
                UPDATE tickets 
                SET brand_id = target_brand_id 
                WHERE id = r.id;
            ELSE
                -- OPTIONAL: If not found, should we create it? 
                -- Let's create it to ensure NO data is left behind, normalized.
                INSERT INTO brands (name) VALUES (INITCAP(brand_text))
                ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name -- Just to get ID if race condition
                RETURNING id INTO target_brand_id;

                -- If it failed to return valid ID (e.g. conflict without update), select it again
                IF target_brand_id IS NULL THEN
                     SELECT id INTO target_brand_id FROM brands WHERE name ILIKE brand_text LIMIT 1;
                END IF;

                IF target_brand_id IS NOT NULL THEN
                    UPDATE tickets SET brand_id = target_brand_id WHERE id = r.id;
                END IF;
            END IF;
        END IF;
    END LOOP;
END $$;

-- 3. VERIFY ANALYTICS DATA
-- This query is just for you to check in the SQL Editor if there are results now.
SELECT COUNT(*) as detailed_tickets_with_brand FROM tickets WHERE brand_id IS NOT NULL;
