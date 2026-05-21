-- ============================================================
-- PRODUCT NAME STANDARDIZATION MIGRATION
-- Run this in Supabase SQL Editor (Settings → SQL Editor)
-- ============================================================
-- Standard product names after this migration:
--   9 Inch 3 Hole Block  (was: 9-inch, 9 inch, 9 Inch Block, 9 inch block)
--   6 Inch Block         (was: 6-inch, 6 inch, 6 Inch Block, 6 inch block)
--   4 Inch Block         (new / leave as-is if already correct)
--   Standard Interlock   (was: Interlock, interlock)
--   Standard Kerb Stone  (new / leave as-is if already correct)
--   Garden Kerb          (new / leave as-is if already correct)
-- ============================================================

-- STEP 1 — Drop old check constraints so we can rename values
-- (constraint names may vary; run these and ignore errors for ones that don't exist)

ALTER TABLE production_log  DROP CONSTRAINT IF EXISTS production_log_block_type_check;
ALTER TABLE order_items     DROP CONSTRAINT IF EXISTS order_items_block_type_check;
ALTER TABLE damage_log      DROP CONSTRAINT IF EXISTS damage_log_block_type_check;
ALTER TABLE waybills        DROP CONSTRAINT IF EXISTS waybills_block_type_check;
ALTER TABLE deliveries      DROP CONSTRAINT IF EXISTS deliveries_block_type_check;

-- STEP 2 — Standardize 9-inch variants across all tables

UPDATE production_log  SET block_type = '9 Inch 3 Hole Block' WHERE LOWER(block_type) IN ('9-inch','9 inch','9 inch block','9inch');
UPDATE order_items     SET block_type = '9 Inch 3 Hole Block' WHERE LOWER(block_type) IN ('9-inch','9 inch','9 inch block','9inch');
UPDATE damage_log      SET block_type = '9 Inch 3 Hole Block' WHERE LOWER(block_type) IN ('9-inch','9 inch','9 inch block','9inch');
UPDATE waybills        SET block_type = '9 Inch 3 Hole Block' WHERE LOWER(block_type) IN ('9-inch','9 inch','9 inch block','9inch');
UPDATE deliveries      SET block_type = '9 Inch 3 Hole Block' WHERE LOWER(block_type) IN ('9-inch','9 inch','9 inch block','9inch');
UPDATE finished_goods  SET block_type = '9 Inch 3 Hole Block' WHERE LOWER(block_type) IN ('9-inch','9 inch','9 inch block','9inch');
UPDATE batches         SET block_type = '9 Inch 3 Hole Block' WHERE LOWER(block_type) IN ('9-inch','9 inch','9 inch block','9inch');
UPDATE pending_delivery_schedule SET block_type = '9 Inch 3 Hole Block' WHERE LOWER(block_type) IN ('9-inch','9 inch','9 inch block','9inch');

-- STEP 3 — Standardize 6-inch variants

UPDATE production_log  SET block_type = '6 Inch Block' WHERE LOWER(block_type) IN ('6-inch','6 inch','6 inch block','6inch');
UPDATE order_items     SET block_type = '6 Inch Block' WHERE LOWER(block_type) IN ('6-inch','6 inch','6 inch block','6inch');
UPDATE damage_log      SET block_type = '6 Inch Block' WHERE LOWER(block_type) IN ('6-inch','6 inch','6 inch block','6inch');
UPDATE waybills        SET block_type = '6 Inch Block' WHERE LOWER(block_type) IN ('6-inch','6 inch','6 inch block','6inch');
UPDATE deliveries      SET block_type = '6 Inch Block' WHERE LOWER(block_type) IN ('6-inch','6 inch','6 inch block','6inch');
UPDATE finished_goods  SET block_type = '6 Inch Block' WHERE LOWER(block_type) IN ('6-inch','6 inch','6 inch block','6inch');
UPDATE batches         SET block_type = '6 Inch Block' WHERE LOWER(block_type) IN ('6-inch','6 inch','6 inch block','6inch');
UPDATE pending_delivery_schedule SET block_type = '6 Inch Block' WHERE LOWER(block_type) IN ('6-inch','6 inch','6 inch block','6inch');

-- STEP 4 — Standardize Interlock variants

UPDATE production_log  SET block_type = 'Standard Interlock' WHERE LOWER(block_type) IN ('interlock','standard interlock');
UPDATE order_items     SET block_type = 'Standard Interlock' WHERE LOWER(block_type) IN ('interlock','standard interlock');
UPDATE damage_log      SET block_type = 'Standard Interlock' WHERE LOWER(block_type) IN ('interlock','standard interlock');
UPDATE waybills        SET block_type = 'Standard Interlock' WHERE LOWER(block_type) IN ('interlock','standard interlock');
UPDATE deliveries      SET block_type = 'Standard Interlock' WHERE LOWER(block_type) IN ('interlock','standard interlock');
UPDATE finished_goods  SET block_type = 'Standard Interlock' WHERE LOWER(block_type) IN ('interlock','standard interlock');
UPDATE batches         SET block_type = 'Standard Interlock' WHERE LOWER(block_type) IN ('interlock','standard interlock');
UPDATE pending_delivery_schedule SET block_type = 'Standard Interlock' WHERE LOWER(block_type) IN ('interlock','standard interlock');

-- STEP 5 — Merge duplicate finished_goods rows (same block_type → sum quantities)
-- This creates one consolidated row per block_type and deletes duplicates.

WITH ranked AS (
  SELECT id, block_type, quantity,
         ROW_NUMBER() OVER (PARTITION BY block_type ORDER BY updated_at DESC NULLS LAST, id) AS rn,
         SUM(quantity) OVER (PARTITION BY block_type) AS total_qty
  FROM finished_goods
),
keeper AS (SELECT id, block_type, total_qty FROM ranked WHERE rn = 1)
UPDATE finished_goods fg
SET quantity = k.total_qty
FROM keeper k
WHERE fg.id = k.id;

DELETE FROM finished_goods
WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY block_type ORDER BY updated_at DESC NULLS LAST, id) AS rn
    FROM finished_goods
  ) t WHERE rn > 1
);

-- STEP 6 — Update the products table to use standard names
-- (Merge duplicates by deleting the older row; update mismatches)

UPDATE products SET name = '9 Inch 3 Hole Block' WHERE LOWER(name) IN ('9-inch','9 inch','9 inch block','9inch');
UPDATE products SET name = '6 Inch Block'         WHERE LOWER(name) IN ('6-inch','6 inch','6 inch block','6inch');
UPDATE products SET name = 'Standard Interlock'   WHERE LOWER(name) IN ('interlock');

-- Remove duplicates in products (keep most recently updated)
DELETE FROM products
WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY LOWER(name) ORDER BY updated_at DESC NULLS LAST, id) AS rn
    FROM products
  ) t WHERE rn > 1
);

-- STEP 7 — Re-add check constraints with the new standard names
-- (Covers the 6 core product types plus any future additions — use a looser check)

ALTER TABLE production_log ADD CONSTRAINT production_log_block_type_check
  CHECK (block_type IN ('9 Inch 3 Hole Block','6 Inch Block','4 Inch Block','Standard Interlock','Standard Kerb Stone','Garden Kerb'));

ALTER TABLE order_items ADD CONSTRAINT order_items_block_type_check
  CHECK (block_type IN ('9 Inch 3 Hole Block','6 Inch Block','4 Inch Block','Standard Interlock','Standard Kerb Stone','Garden Kerb'));

ALTER TABLE damage_log ADD CONSTRAINT damage_log_block_type_check
  CHECK (block_type IN ('9 Inch 3 Hole Block','6 Inch Block','4 Inch Block','Standard Interlock','Standard Kerb Stone','Garden Kerb'));

ALTER TABLE waybills ADD CONSTRAINT waybills_block_type_check
  CHECK (block_type IN ('9 Inch 3 Hole Block','6 Inch Block','4 Inch Block','Standard Interlock','Standard Kerb Stone','Garden Kerb'));

ALTER TABLE deliveries ADD CONSTRAINT deliveries_block_type_check
  CHECK (block_type IN ('9 Inch 3 Hole Block','6 Inch Block','4 Inch Block','Standard Interlock','Standard Kerb Stone','Garden Kerb'));

-- STEP 8 — Verify: one row per product in finished_goods, one per product in products
SELECT 'finished_goods' AS tbl, block_type, quantity FROM finished_goods ORDER BY block_type;
SELECT 'products' AS tbl, name, category, unit FROM products ORDER BY name;

-- STEP 9 — Also run the pending column additions if not already done
ALTER TABLE waybills ADD COLUMN IF NOT EXISTS vehicle_id UUID;
ALTER TABLE waybills ADD COLUMN IF NOT EXISTS diesel_given_litres NUMERIC;
ALTER TABLE waybills ADD COLUMN IF NOT EXISTS store_officer TEXT;
ALTER TABLE vehicle_maintenance ADD COLUMN IF NOT EXISTS linked_expense_id UUID;
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS supplier_id UUID;
