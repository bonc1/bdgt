-- Migration: Add smart merchant_rules JSONB to households for Bank Import auto-categorization
ALTER TABLE public.households
  ADD COLUMN IF NOT EXISTS merchant_rules JSONB NOT NULL DEFAULT '[]'::jsonb;
