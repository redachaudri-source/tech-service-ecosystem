-- FIX TRIGGER PERMISSIONS: Add SECURITY DEFINER
-- Problem: Client users can't INSERT into 'mortify_brand_scores', so the trigger fails.
-- Solution: Run the trigger function with Owner privileges (SECURITY DEFINER).

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
$$ LANGUAGE plpgsql SECURITY DEFINER;
