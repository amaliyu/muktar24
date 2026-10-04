-- ============================================================
-- STEP B: Run this AFTER step_a confirms constraint names
-- Paste this entire file into Supabase SQL Editor → Run
-- ============================================================

-- 1. Drop constraints by their ACTUAL names from step_a output
--    (These are the standard Postgres auto-generated names)
ALTER TABLE production_log  DROP CONSTRAINT IF EXISTS production_log_block_type_check;
ALTER TABLE order_items     DROP CONSTRAINT IF EXISTS order_items_block_type_check;
ALTER TABLE damage_log      DROP CONSTRAINT IF EXISTS damage_log_block_type_check;
ALTER TABLE waybills        DROP CONSTRAINT IF EXISTS waybills_block_type_check;
ALTER TABLE deliveries      DROP CONSTRAINT IF EXISTS deliveries_block_type_check;

-- If step_a showed DIFFERENT constraint names, replace above with:
-- ALTER TABLE production_log DROP CONSTRAINT IF EXISTS "your_actual_name_here";

-- 2. Now rename 9-inch everywhere
UPDATE production_log        SET block_type='9 Inch 3 Hole Block' WHERE block_type='9-inch';
UPDATE order_items           SET block_type='9 Inch 3 Hole Block' WHERE block_type='9-inch';
UPDATE damage_log            SET block_type='9 Inch 3 Hole Block' WHERE block_type='9-inch';
UPDATE waybills              SET block_type='9 Inch 3 Hole Block' WHERE block_type='9-inch';
UPDATE deliveries            SET block_type='9 Inch 3 Hole Block' WHERE block_type='9-inch';
UPDATE batches               SET block_type='9 Inch 3 Hole Block' WHERE block_type='9-inch';
UPDATE pending_delivery_register SET block_type='9 Inch 3 Hole Block' WHERE block_type='9-inch';

-- 3. Rename 6-inch everywhere
UPDATE production_log        SET block_type='6 Inch Block' WHERE block_type='6-inch';
UPDATE order_items           SET block_type='6 Inch Block' WHERE block_type='6-inch';
UPDATE damage_log            SET block_type='6 Inch Block' WHERE block_type='6-inch';
UPDATE waybills              SET block_type='6 Inch Block' WHERE block_type='6-inch';
UPDATE deliveries            SET block_type='6 Inch Block' WHERE block_type='6-inch';
UPDATE batches               SET block_type='6 Inch Block' WHERE block_type='6-inch';
UPDATE pending_delivery_register SET block_type='6 Inch Block' WHERE block_type='6-inch';

-- 4. Rename Interlock everywhere
UPDATE production_log        SET block_type='Standard Interlock' WHERE block_type='Interlock';
UPDATE order_items           SET block_type='Standard Interlock' WHERE block_type='Interlock';
UPDATE damage_log            SET block_type='Standard Interlock' WHERE block_type='Interlock';
UPDATE waybills              SET block_type='Standard Interlock' WHERE block_type='Interlock';
UPDATE deliveries            SET block_type='Standard Interlock' WHERE block_type='Interlock';
UPDATE batches               SET block_type='Standard Interlock' WHERE block_type='Interlock';
UPDATE pending_delivery_register SET block_type='Standard Interlock' WHERE block_type='Interlock';

-- 5. Fix finished_goods_stock (what the dashboard reads)
UPDATE finished_goods_stock SET block_type='9 Inch 3 Hole Block' WHERE block_type='9-inch';
UPDATE finished_goods_stock SET block_type='6 Inch Block'         WHERE block_type='6-inch';
UPDATE finished_goods_stock SET block_type='Standard Interlock'   WHERE block_type='Interlock';

-- Merge any duplicate rows (sum the quantities, keep one row)
UPDATE finished_goods_stock a
SET quantity_in_yard = (
  SELECT SUM(quantity_in_yard) FROM finished_goods_stock b
  WHERE b.block_type = a.block_type
)
WHERE a.id = (
  SELECT id FROM finished_goods_stock
  WHERE block_type = a.block_type
  ORDER BY quantity_in_yard DESC, id
  LIMIT 1
);

DELETE FROM finished_goods_stock
WHERE id NOT IN (
  SELECT DISTINCT ON (block_type) id
  FROM finished_goods_stock
  ORDER BY block_type, quantity_in_yard DESC, id
);

-- 6. Fix products table
UPDATE products SET name='9 Inch 3 Hole Block' WHERE LOWER(TRIM(name)) IN ('9-inch','9 inch','9 inch block');
UPDATE products SET name='6 Inch Block'         WHERE LOWER(TRIM(name)) IN ('6-inch','6 inch','6 inch block');
UPDATE products SET name='Standard Interlock'   WHERE LOWER(TRIM(name)) = 'interlock';

UPDATE products SET is_active=false
WHERE id NOT IN (
  SELECT DISTINCT ON (LOWER(TRIM(name))) id FROM products
  ORDER BY LOWER(TRIM(name)), is_active DESC, id
);

-- 7. Re-add constraints with new names
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

-- 8. VERIFY — should show one row per product
SELECT block_type, quantity_in_yard
FROM finished_goods_stock
ORDER BY block_type;
