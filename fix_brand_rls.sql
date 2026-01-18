-- CHECK RLS & FIX: Allow Clients to Read Brand Scores
-- The client app needs to read 'mortify_brand_scores' to populate the dropdown.

-- 1. Enable RLS (just in case)
ALTER TABLE mortify_brand_scores ENABLE ROW LEVEL SECURITY;

-- 2. Drop existing restrictive policies if any
DROP POLICY IF EXISTS "Allow Public Read Brands" ON mortify_brand_scores;
DROP POLICY IF EXISTS "Allow Authenticated Read Brands" ON mortify_brand_scores;

-- 3. Create Policy: Allow anyone (authenticated) to READ brands
-- We only need READ access. Write is handled by the Trigger (System) or Admin.
CREATE POLICY "Allow Authenticated Read Brands"
ON mortify_brand_scores
FOR SELECT
TO authenticated
USING (true);

-- 4. Just in case it's public (anon)
CREATE POLICY "Allow Public Read Brands"
ON mortify_brand_scores
FOR SELECT
TO anon
USING (true);
