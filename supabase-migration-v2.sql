-- ============================================================
-- Migration v2 — Handbook metadata + rule references
-- Run this in the Supabase SQL Editor (supabase.com → SQL Editor)
-- ============================================================

-- 1. Set all existing questions to NOT approved
UPDATE public.questions SET is_approved = false;

-- 2. Add handbook section field (e.g. "Section 4 – Types of Penalties")
ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS handbook_section TEXT NOT NULL DEFAULT '';

-- 3. Add situation ID field (e.g. "15A", "19H")
ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS situation_id TEXT NOT NULL DEFAULT '';

-- 4. Add rule references array (replaces single rule_number for multi-rule situations)
--    Format examples: "15.2", "15.1 ¶2", "1.10(iv)", "Table 14 Ex. G12"
ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS rule_references TEXT[] NOT NULL DEFAULT '{}';

-- 5. Seed rule_references from existing rule_number for all rows that don't have it yet
UPDATE public.questions
  SET rule_references = ARRAY[rule_number]
  WHERE rule_number != '' AND array_length(rule_references, 1) IS NULL;
