-- ============================================================
-- Audit Fixes Migration
-- Run in Supabase SQL Editor
-- ============================================================

-- Fix 2: waybill → schedule item link
ALTER TABLE waybills
  ADD COLUMN IF NOT EXISTS schedule_item_id UUID
  REFERENCES delivery_schedule_items(id) ON DELETE SET NULL;

-- Fix 5: vehicle maintenance → supplier link
ALTER TABLE vehicle_maintenance
  ADD COLUMN IF NOT EXISTS supplier_id UUID
  REFERENCES suppliers(id) ON DELETE SET NULL;

-- Fix 7: expenses → supplier link
ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS supplier_id UUID
  REFERENCES suppliers(id) ON DELETE SET NULL;

-- Verify
SELECT column_name, table_name
FROM information_schema.columns
WHERE table_name IN ('waybills','vehicle_maintenance','expenses')
  AND column_name IN ('schedule_item_id','supplier_id')
ORDER BY table_name, column_name;
