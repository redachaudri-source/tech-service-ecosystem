-- FIX BRAND SYNC: Auto-harvest brands from Client Input
-- 1. Ensure Brand Name is Unique in scores table
-- 2. Trigger to insert new brands automatically

-- A. Safety: Remove duplicates if any (keep highest score)
DELETE FROM mortify_brand_scores a USING mortify_brand_scores b
WHERE a.id < b.id AND UPPER(TRIM(a.brand_name)) = UPPER(TRIM(b.brand_name));

-- B. Constraint
ALTER TABLE mortify_brand_scores DROP CONSTRAINT IF EXISTS unique_brand_name;
ALTER TABLE mortify_brand_scores ADD CONSTRAINT unique_brand_name UNIQUE (brand_name);

-- C. The Trigger Function
CREATE OR REPLACE FUNCTION trigger_auto_harvest_brand()
RETURNS TRIGGER AS $$
DECLARE
    v_clean_brand TEXT;
BEGIN
    IF NEW.brand IS NOT NULL AND LENGTH(TRIM(NEW.brand)) > 0 THEN
        v_clean_brand := UPPER(TRIM(NEW.brand));
        
        -- Try Insert (Ignore if exists due to unique constraint)
        INSERT INTO mortify_brand_scores (brand_name, score_points, created_at, updated_at)
        VALUES (v_clean_brand, 2, NOW(), NOW())
        ON CONFLICT (brand_name) DO NOTHING;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- D. Apply Trigger
DROP TRIGGER IF EXISTS auto_harvest_brand ON client_appliances;
CREATE TRIGGER auto_harvest_brand
    AFTER INSERT OR UPDATE OF brand ON client_appliances
    FOR EACH ROW
    EXECUTE FUNCTION trigger_auto_harvest_brand();

-- E. Historical Backfill (Harvest current brands)
INSERT INTO mortify_brand_scores (brand_name, score_points, created_at, updated_at)
SELECT DISTINCT UPPER(TRIM(brand)), 2, NOW(), NOW()
FROM client_appliances
WHERE brand IS NOT NULL AND LENGTH(TRIM(brand)) > 0
ON CONFLICT (brand_name) DO NOTHING;
