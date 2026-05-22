-- Fix sub_category CHECK constraint to allow fixed_asset_vehicle and fixed_asset_other
-- Run this in Supabase SQL Editor

-- Drop existing constraint
ALTER TABLE opening_balances
  DROP CONSTRAINT IF EXISTS opening_balances_sub_category_check;

-- Re-add with full list of allowed values
ALTER TABLE opening_balances
  ADD CONSTRAINT opening_balances_sub_category_check
  CHECK (sub_category IN (
    'fixed_asset',
    'fixed_asset_vehicle',
    'fixed_asset_other',
    'current_asset',
    'current_liability',
    'long_term_liability',
    'equity'
  ));
