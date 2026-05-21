-- ============================================================
-- PRODUCT NAME STANDARDIZATION MIGRATION
-- Paste the entire file into Supabase → SQL Editor → Run
-- ============================================================
-- Standard product names after this migration:
--   9 Inch 3 Hole Block  (was: 9-inch, 9 inch, 9 Inch Block)
--   6 Inch Block         (was: 6-inch, 6 inch)
--   4 Inch Block
--   Standard Interlock   (was: Interlock, interlock)
--   Standard Kerb Stone
--   Garden Kerb
-- ============================================================

-- ── STEP 1: Drop old check constraints ───────────────────────
ALTER TABLE production_log  DROP CONSTRAINT IF EXISTS production_log_block_type_check;
ALTER TABLE order_items     DROP CONSTRAINT IF EXISTS order_items_block_type_check;
ALTER TABLE damage_log      DROP CONSTRAINT IF EXISTS damage_log_block_type_check;
ALTER TABLE waybills        DROP CONSTRAINT IF EXISTS waybills_block_type_check;
ALTER TABLE deliveries      DROP CONSTRAINT IF EXISTS deliveries_block_type_check;

-- ── STEP 2: Rename 9-inch variants in all tables ─────────────
UPDATE production_log        SET block_type = '9 Inch 3 Hole Block' WHERE LOWER(TRIM(block_type)) IN ('9-inch','9 inch','9 inch block','9inch','9-inch block');
UPDATE order_items           SET block_type = '9 Inch 3 Hole Block' WHERE LOWER(TRIM(block_type)) IN ('9-inch','9 inch','9 inch block','9inch','9-inch block');
UPDATE damage_log            SET block_type = '9 Inch 3 Hole Block' WHERE LOWER(TRIM(block_type)) IN ('9-inch','9 inch','9 inch block','9inch','9-inch block');
UPDATE waybills              SET block_type = '9 Inch 3 Hole Block' WHERE LOWER(TRIM(block_type)) IN ('9-inch','9 inch','9 inch block','9inch','9-inch block');
UPDATE deliveries            SET block_type = '9 Inch 3 Hole Block' WHERE LOWER(TRIM(block_type)) IN ('9-inch','9 inch','9 inch block','9inch','9-inch block');
UPDATE batches               SET block_type = '9 Inch 3 Hole Block' WHERE LOWER(TRIM(block_type)) IN ('9-inch','9 inch','9 inch block','9inch','9-inch block');
UPDATE pending_delivery_register SET block_type = '9 Inch 3 Hole Block' WHERE LOWER(TRIM(block_type)) IN ('9-inch','9 inch','9 inch block','9inch','9-inch block');

-- ── STEP 3: Rename 6-inch variants in all tables ─────────────
UPDATE production_log        SET block_type = '6 Inch Block' WHERE LOWER(TRIM(block_type)) IN ('6-inch','6 inch','6 inch block','6inch','6-inch block');
UPDATE order_items           SET block_type = '6 Inch Block' WHERE LOWER(TRIM(block_type)) IN ('6-inch','6 inch','6 inch block','6inch','6-inch block');
UPDATE damage_log            SET block_type = '6 Inch Block' WHERE LOWER(TRIM(block_type)) IN ('6-inch','6 inch','6 inch block','6inch','6-inch block');
UPDATE waybills              SET block_type = '6 Inch Block' WHERE LOWER(TRIM(block_type)) IN ('6-inch','6 inch','6 inch block','6inch','6-inch block');
UPDATE deliveries            SET block_type = '6 Inch Block' WHERE LOWER(TRIM(block_type)) IN ('6-inch','6 inch','6 inch block','6inch','6-inch block');
UPDATE batches               SET block_type = '6 Inch Block' WHERE LOWER(TRIM(block_type)) IN ('6-inch','6 inch','6 inch block','6inch','6-inch block');
UPDATE pending_delivery_register SET block_type = '6 Inch Block' WHERE LOWER(TRIM(block_type)) IN ('6-inch','6 inch','6 inch block','6inch','6-inch block');

-- ── STEP 4: Rename Interlock variants in all tables ──────────
UPDATE production_log        SET block_type = 'Standard Interlock' WHERE LOWER(TRIM(block_type)) IN ('interlock','standard interlock');
UPDATE order_items           SET block_type = 'Standard Interlock' WHERE LOWER(TRIM(block_type)) IN ('interlock','standard interlock');
UPDATE damage_log            SET block_type = 'Standard Interlock' WHERE LOWER(TRIM(block_type)) IN ('interlock','standard interlock');
UPDATE waybills              SET block_type = 'Standard Interlock' WHERE LOWER(TRIM(block_type)) IN ('interlock','standard interlock');
UPDATE deliveries            SET block_type = 'Standard Interlock' WHERE LOWER(TRIM(block_type)) IN ('interlock','standard interlock');
UPDATE batches               SET block_type = 'Standard Interlock' WHERE LOWER(TRIM(block_type)) IN ('interlock','standard interlock');
UPDATE pending_delivery_register SET block_type = 'Standard Interlock' WHERE LOWER(TRIM(block_type)) IN ('interlock','standard interlock');

-- ── STEP 5: Fix finished_goods_stock — rename then merge ─────
-- 5a. Rename old names
UPDATE finished_goods_stock SET block_type = '9 Inch 3 Hole Block' WHERE LOWER(TRIM(block_type)) IN ('9-inch','9 inch','9 inch block','9inch');
UPDATE finished_goods_stock SET block_type = '6 Inch Block'         WHERE LOWER(TRIM(block_type)) IN ('6-inch','6 inch','6 inch block','6inch');
UPDATE finished_goods_stock SET block_type = 'Standard Interlock'   WHERE LOWER(TRIM(block_type)) IN ('interlock');
UPDATE finished_goods_stock SET block_type = '4 Inch Block'         WHERE LOWER(TRIM(block_type)) IN ('4-inch','4 inch','4 inch block','4inch');
UPDATE finished_goods_stock SET block_type = 'Standard Kerb Stone'  WHERE LOWER(TRIM(block_type)) IN ('kerb stone','kerb','kerbstone');
UPDATE finished_goods_stock SET block_type = 'Garden Kerb'          WHERE LOWER(TRIM(block_type)) IN ('garden kerb','garden');

-- 5b. Merge duplicate rows (same block_type) — sum quantities into the one with highest stock
WITH totals AS (
  SELECT block_type, SUM(quantity_in_yard) AS total_qty
  FROM finished_goods_stock
  GROUP BY block_type
),
keeper AS (
  SELECT DISTINCT ON (fgs.block_type) fgs.id, t.total_qty
  FROM finished_goods_stock fgs
  JOIN totals t ON t.block_type = fgs.block_type
  ORDER BY fgs.block_type, fgs.quantity_in_yard DESC, fgs.id
)
UPDATE finished_goods_stock fgs
SET quantity_in_yard = k.total_qty
FROM keeper k
WHERE fgs.id = k.id;

-- 5c. Delete duplicate rows (keep only the one with the highest stock per block_type)
DELETE FROM finished_goods_stock
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (PARTITION BY block_type ORDER BY quantity_in_yard DESC, id) AS rn
    FROM finished_goods_stock
  ) t WHERE rn > 1
);

-- ── STEP 6: Fix the products table ───────────────────────────
UPDATE products SET name = '9 Inch 3 Hole Block' WHERE LOWER(TRIM(name)) IN ('9-inch','9 inch','9 inch block','9inch');
UPDATE products SET name = '6 Inch Block'         WHERE LOWER(TRIM(name)) IN ('6-inch','6 inch','6 inch block','6inch');
UPDATE products SET name = 'Standard Interlock'   WHERE LOWER(TRIM(name)) IN ('interlock');
UPDATE products SET name = '4 Inch Block'         WHERE LOWER(TRIM(name)) IN ('4-inch','4 inch','4 inch block','4inch');
UPDATE products SET name = 'Standard Kerb Stone'  WHERE LOWER(TRIM(name)) IN ('kerb stone','kerb','kerbstone');
UPDATE products SET name = 'Garden Kerb'          WHERE LOWER(TRIM(name)) IN ('garden kerb','garden');

-- Remove duplicate products (keep the active one, or most recently updated)
DELETE FROM products
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY LOWER(TRIM(name))
             ORDER BY is_active DESC, updated_at DESC NULLS LAST, id
           ) AS rn
    FROM products
  ) t WHERE rn > 1
);

-- ── STEP 7: Re-add check constraints with new names ──────────
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

-- ── STEP 8: Also add any missing columns (safe to run again) ─
ALTER TABLE waybills ADD COLUMN IF NOT EXISTS vehicle_id UUID;
ALTER TABLE waybills ADD COLUMN IF NOT EXISTS diesel_given_litres NUMERIC;
ALTER TABLE waybills ADD COLUMN IF NOT EXISTS store_officer TEXT;
ALTER TABLE vehicle_maintenance ADD COLUMN IF NOT EXISTS linked_expense_id UUID;
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS supplier_id UUID;

-- ── STEP 9: Verify — should show ONE row per product ─────────
SELECT block_type, quantity_in_yard
FROM finished_goods_stock
ORDER BY block_type;

SELECT name, category, unit, is_active
FROM products
ORDER BY name;
