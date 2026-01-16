-- Create mortify_brand_scores table
CREATE TABLE IF NOT EXISTS public.mortify_brand_scores (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    brand_name TEXT NOT NULL UNIQUE,
    score_points INTEGER DEFAULT 1, -- 1 to 4 scale
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.mortify_brand_scores ENABLE ROW LEVEL SECURITY;

-- Create Policy: Public Read Access
CREATE POLICY "Public can view brand scores" 
ON public.mortify_brand_scores FOR SELECT 
USING (true);

-- Insert Common Brands with Scores
INSERT INTO public.mortify_brand_scores (brand_name, score_points) VALUES
-- TIER 1 (4 Puntos): Premium / Durabilidad Alta
('Miele', 4),
('Liebherr', 4),
('Gaggenau', 4),
('Neff', 4),
('Sub-Zero', 4),
('Wolf', 4),
('Bosch', 3), -- High Tier 2
('Siemens', 3),
('Balay', 3),
('AEG', 3),
('Electrolux', 3),
('Zanussi', 3),
('Samsung', 3),
('LG', 3),
('Whirlpool', 2),
('Beko', 2),
('Indesit', 2),
('Candy', 2),
('Haier', 2),
('Hisense', 2),
('Teka', 2),
('Fagor', 2),
('Edesa', 2),
('Aspes', 2),
('Generic', 1),
('White Label', 1)
ON CONFLICT (brand_name) DO UPDATE 
SET score_points = EXCLUDED.score_points;
