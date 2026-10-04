-- ============================================================
-- Fix Finished Goods Duplicates
-- Table: finished_goods_stock  |  qty column: quantity_in_yard
-- Run in Supabase SQL Editor
-- ============================================================

-- STEP 1: Check current state
SELECT block_type, quantity_in_yard
FROM finished_goods_stock
ORDER BY block_type;

-- Check all tables for legacy "9-inch" values
SELECT DISTINCT block_type FROM production_log WHERE block_type ILIKE '9%';
SELECT DISTINCT block_type FROM waybills      WHERE block_type ILIKE '9%';
SELECT DISTINCT block_type FROM batches       WHERE block_type ILIKE '9%';

-- ============================================================
-- STEP 2: Merge 9-inch → 9 Inch 3 Hole Block
-- ============================================================
UPDATE finished_goods_stock
SET quantity_in_yard = (
  SELECT COALESCE(SUM(quantity_in_yard), 0)
  FROM finished_goods_stock
  WHERE block_type IN ('9 Inch 3 Hole Block', '9-inch', '9 inch', '9inch')
)
WHERE block_type = '9 Inch 3 Hole Block';

DELETE FROM finished_goods_stock
WHERE block_type IN ('9-inch', '9 inch', '9inch');

-- ============================================================
-- STEP 3: Update all related tables (9-inch variants)
-- ============================================================
UPDATE production_log          SET block_type = '9 Inch 3 Hole Block' WHERE block_type IN ('9-inch', '9 inch', '9inch');
UPDATE waybills                SET block_type = '9 Inch 3 Hole Block' WHERE block_type IN ('9-inch', '9 inch', '9inch');
UPDATE batches                 SET block_type = '9 Inch 3 Hole Block' WHERE block_type IN ('9-inch', '9 inch', '9inch');
UPDATE order_items             SET block_type = '9 Inch 3 Hole Block' WHERE block_type IN ('9-inch', '9 inch', '9inch');
UPDATE damage_log              SET block_type = '9 Inch 3 Hole Block' WHERE block_type IN ('9-inch', '9 inch', '9inch');
UPDATE pending_delivery_register SET block_type = '9 Inch 3 Hole Block' WHERE block_type IN ('9-inch', '9 inch', '9inch');

UPDATE products SET is_active = false
WHERE name IN ('9-inch', '9 inch', '9inch')
  AND name != '9 Inch 3 Hole Block';

-- ============================================================
-- STEP 4: Merge 6-inch → 6 Inch Block (run only if needed)
-- ============================================================
-- First check:
-- SELECT block_type, quantity_in_yard FROM finished_goods_stock WHERE block_type ILIKE '6%';

UPDATE finished_goods_stock
SET quantity_in_yard = (
  SELECT COALESCE(SUM(quantity_in_yard), 0)
  FROM finished_goods_stock
  WHERE block_type IN ('6 Inch Block', '6-inch', '6 inch')
)
WHERE block_type = '6 Inch Block';

DELETE FROM finished_goods_stock WHERE block_type IN ('6-inch', '6 inch');

UPDATE production_log SET block_type = '6 Inch Block' WHERE block_type IN ('6-inch', '6 inch');
UPDATE waybills       SET block_type = '6 Inch Block' WHERE block_type IN ('6-inch', '6 inch');
UPDATE batches        SET block_type = '6 Inch Block' WHERE block_type IN ('6-inch', '6 inch');
UPDATE order_items    SET block_type = '6 Inch Block' WHERE block_type IN ('6-inch', '6 inch');
UPDATE damage_log     SET block_type = '6 Inch Block' WHERE block_type IN ('6-inch', '6 inch');

UPDATE products SET is_active = false
WHERE name IN ('6-inch', '6 inch')
  AND name != '6 Inch Block';

-- ============================================================
-- STEP 5: Add UNIQUE constraint to prevent future duplicates
-- ============================================================
ALTER TABLE finished_goods_stock
ADD CONSTRAINT finished_goods_stock_block_type_unique UNIQUE (block_type);

-- ============================================================
-- STEP 6: Verify final state
-- ============================================================
SELECT block_type, quantity_in_yard
FROM finished_goods_stock
ORDER BY block_type;
