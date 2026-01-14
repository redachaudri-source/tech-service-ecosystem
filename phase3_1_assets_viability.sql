-- Phase 3.1 Part A: Assets Viability Engineering
-- Target Table: client_appliances (Real name of client_assets)
-- Objective: Add columns for Rule-Based Viability Engine

-- 1. Add new columns to client_appliances
ALTER TABLE public.client_appliances
ADD COLUMN IF NOT EXISTS purchase_year INTEGER,        -- Año de compra (ej: 2018)
ADD COLUMN IF NOT EXISTS initial_value_estimate NUMERIC, -- Precio nuevo estimado (valor base)
ADD COLUMN IF NOT EXISTS repair_count INTEGER DEFAULT 0, -- Histórico de averías (contador)
ADD COLUMN IF NOT EXISTS expert_override BOOLEAN DEFAULT FALSE, -- Interruptor de Dios (Experto anula IA)
ADD COLUMN IF NOT EXISTS expert_note TEXT;             -- Justificación del experto

-- 2. Add comment for documentation
COMMENT ON COLUMN public.client_appliances.purchase_year IS 'Year the appliance was purchased. Used for age calculation.';
COMMENT ON COLUMN public.client_appliances.initial_value_estimate IS 'Estimated value when new. Used for viability threshold.';
COMMENT ON COLUMN public.client_appliances.expert_override IS 'If true, ignores calculated viability and forces "Repairable".';
