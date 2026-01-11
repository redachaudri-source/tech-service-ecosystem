-- Migration: Add logo_url to brands table
-- Run this in Supabase SQL Editor

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'brands' AND column_name = 'logo_url') THEN
        ALTER TABLE public.brands ADD COLUMN logo_url text;
    END IF;
END $$;
