-- 1. Ensure Columns Exist
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS avg_rating NUMERIC(3,1) DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_reviews INTEGER DEFAULT 0;

-- 2. Create/Replace Function to Calculate Stats
CREATE OR REPLACE FUNCTION update_technician_stats()
RETURNS TRIGGER AS $$
DECLARE
    target_tech_id UUID;
    new_avg NUMERIC(3,1);
    new_count INTEGER;
BEGIN
    -- Determine tech id
    IF (TG_OP = 'DELETE') THEN
        target_tech_id := OLD.technician_id;
    ELSE
        target_tech_id := NEW.technician_id;
    END IF;

    -- Calculate
    SELECT 
        COALESCE(AVG(rating), 0), 
        COUNT(*) 
    INTO 
        new_avg, 
        new_count 
    FROM reviews 
    WHERE technician_id = target_tech_id;

    -- Update Profile
    UPDATE profiles 
    SET 
        avg_rating = ROUND(new_avg, 1),
        total_reviews = new_count
    WHERE id = target_tech_id;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- 3. Create Trigger
DROP TRIGGER IF EXISTS trigger_update_tech_stats ON reviews;

CREATE TRIGGER trigger_update_tech_stats
AFTER INSERT OR UPDATE OR DELETE ON reviews
FOR EACH ROW
EXECUTE FUNCTION update_technician_stats();

-- 4. Recalculate Initial Stats for ALL Techs
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN SELECT id FROM profiles WHERE role = 'tech' LOOP
        PERFORM 1 FROM reviews WHERE technician_id = r.id; -- just to verify access
        
        UPDATE profiles p
        SET 
            avg_rating = COALESCE((SELECT ROUND(AVG(rating), 1) FROM reviews WHERE technician_id = p.id), 0),
            total_reviews = COALESCE((SELECT COUNT(*) FROM reviews WHERE technician_id = p.id), 0)
        WHERE id = r.id;
    END LOOP;
END $$;
