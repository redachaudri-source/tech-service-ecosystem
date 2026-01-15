-- 1. Create Table (if not exists)
CREATE TABLE IF NOT EXISTS public.mortify_brand_scores (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    brand_name TEXT NOT NULL,
    score_points INT NOT NULL CHECK (score_points BETWEEN 1 AND 4),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Unique Constraint independently
ALTER TABLE public.mortify_brand_scores 
ADD CONSTRAINT mortify_brand_scores_brand_name_key UNIQUE (brand_name);

-- 3. Enable RLS
ALTER TABLE public.mortify_brand_scores ENABLE ROW LEVEL SECURITY;

-- 4. Policies
-- Policy: Everyone can read (Public/Client need it for algorithm)
CREATE POLICY "Enable read access for all users" ON public.mortify_brand_scores
FOR SELECT USING (true);

-- Policy: Admins can do everything
CREATE POLICY "Admins can do everything on brands" ON public.mortify_brand_scores
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'admin'
  )
);

-- 5. Seed Data (Upsert to avoid duplicates if run multiple times)
INSERT INTO public.mortify_brand_scores (brand_name, score_points)
VALUES 
    -- 4 PUNTOS (Excelencia/Industrial)
    ('MIELE', 4), ('DAIKIN', 4), ('MITSUBISHI', 4), ('FUJITSU', 4), 
    ('TOSHIBA', 4), ('PANASONIC', 4), ('HITACHI', 4), ('LIEBHERR', 4), 
    ('SUB-ZERO', 4), ('WOLF', 4),

    -- 3 PUNTOS (Alta/Robusta)
    ('BOSCH', 3), ('SIEMENS', 3), ('BALAY', 3), ('NEFF', 3), 
    ('GAGGENAU', 3), ('SAMSUNG', 3), ('LG', 3), ('GENERAL ELECTRIC', 3), 
    ('GE', 3), ('CARRIER', 3),

    -- 2 PUNTOS (Media/Estándar) (Note: User requested 2 points for these now, previously some were lower/higher in hardcode)
    ('AEG', 2), ('ELECTROLUX', 2), ('ZANUSSI', 2), ('WHIRLPOOL', 2), 
    ('INDESIT', 2), ('HOTPOINT', 2), ('KITCHENAID', 2), ('IGNIS', 2), 
    ('TEKA', 2), ('KUPPERSBUSCH', 2), ('FAGOR', 2), ('EDESA', 2), 
    ('ASPES', 2),

    -- 1 PUNTO (Baja/Consumo)
    ('HAIER', 1), ('CANDY', 1), ('HOOVER', 1), ('BEKO', 1), 
    ('GRUNDIG', 1), ('HISENSE', 1), ('GORENJE', 1)

ON CONFLICT (brand_name) 
DO UPDATE SET score_points = EXCLUDED.score_points;
