-- PHASE 3.1.1: MORTIFY DATABASE SCHEMA
-- Objective: Create tables for Appliance Categories (Defaults) and Assessments (Scoring)

-- 1. TABLA DE BAREMOS (Configuración de IA)
CREATE TABLE IF NOT EXISTS public.appliance_category_defaults (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  category_name VARCHAR(50) UNIQUE NOT NULL, -- Ej: 'Washing Machine'
  average_market_price NUMERIC DEFAULT 0,    -- Precio medio nuevo (ej: 450)
  average_lifespan_years INTEGER DEFAULT 10, -- Vida útil estimada
  base_installation_difficulty INTEGER DEFAULT 0 -- 0=Fácil, 1=Difícil
);

-- 2. TABLA DE EXPEDIENTES MORTIFY (El Juicio)
CREATE TABLE IF NOT EXISTS public.mortify_assessments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  appliance_id UUID REFERENCES public.client_appliances(id) ON DELETE CASCADE,
  
  -- DATOS DE ENTRADA (Snapshot)
  input_year INTEGER,
  input_floor_level INTEGER, -- Piso detectado
  
  -- DESGLOSE DE PUNTUACIÓN (Algoritmo 0-8+ Puntos)
  score_brand INTEGER DEFAULT 0,       -- 1-4 puntos
  score_age INTEGER DEFAULT 0,         -- 0-1 punto
  score_installation INTEGER DEFAULT 0, -- 0-1 punto
  score_financial INTEGER DEFAULT 0,    -- 0-1 punto
  
  total_score INTEGER DEFAULT 0,
  ia_suggestion VARCHAR(50), -- 'VIABLE', 'DOUBTFUL', 'OBSOLETE'
  
  -- ESTADO DEL TRÁMITE
  status VARCHAR(20) DEFAULT 'PENDING_JUDGE', -- 'PENDING_JUDGE', 'COMPLETED'
  
  -- VEREDICTO DEL JUEZ (ADMIN)
  admin_verdict VARCHAR(50), -- 'CONFIRMED_VIABLE', 'CONFIRMED_OBSOLETE'
  admin_note TEXT,
  admin_decision_date TIMESTAMPTZ
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_mortify_appliance ON public.mortify_assessments(appliance_id);
CREATE INDEX IF NOT EXISTS idx_mortify_status ON public.mortify_assessments(status);

-- 3. SEED DATA (Datos Iniciales)
INSERT INTO public.appliance_category_defaults (category_name, average_market_price, average_lifespan_years, base_installation_difficulty)
VALUES 
('Washing Machine', 450, 10, 0),
('Air Conditioner', 600, 12, 1),
('Refrigerator', 700, 12, 0),
('Dishwasher', 500, 10, 0)
ON CONFLICT (category_name) DO NOTHING;
