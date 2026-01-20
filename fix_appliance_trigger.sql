-- Drop prompt
DROP FUNCTION IF EXISTS trigger_auto_harvest_brand() CASCADE;

-- Recreate Function with ROBUST handling
CREATE OR REPLACE FUNCTION trigger_auto_harvest_brand()
RETURNS TRIGGER AS $$
BEGIN
    -- Check if brand is present
    IF NEW.brand IS NOT NULL THEN
        -- Insert into brands table safely
        INSERT INTO brands (name)
        VALUES (NEW.brand)
        ON CONFLICT (name) DO NOTHING;
    END IF;

    -- CRITICAL: Always return NEW, otherwise Insert fails (406 in Supabase context)
    RETURN NEW;
EXCEPTION
    WHEN OTHERS THEN
        -- Failsafe: Log error but allow insert to proceed
        RAISE WARNING 'Auto-Harvest Brand Failed: %', SQLERRM;
        RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recreate Trigger (If dropped by CASCADE, we need to bind it again)
DROP TRIGGER IF EXISTS auto_harvest_brand ON client_appliances;

CREATE TRIGGER auto_harvest_brand
BEFORE INSERT OR UPDATE ON client_appliances
FOR EACH ROW
EXECUTE FUNCTION trigger_auto_harvest_brand();
