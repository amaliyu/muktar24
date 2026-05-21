-- ============================================================
-- DEFINITIVE PRODUCT NAME FIX
-- Paste ALL of this into Supabase → SQL Editor → Run
-- ============================================================
-- IMPORTANT: The check constraints BLOCK the updates.
-- They MUST be dropped first. That is why previous attempts failed.
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- PART 1: DROP CHECK CONSTRAINTS (required before any renaming)
-- ─────────────────────────────────────────────────────────────
ALTER TABLE production_log  DROP CONSTRAINT IF EXISTS production_log_block_type_check;
ALTER TABLE order_items     DROP CONSTRAINT IF EXISTS order_items_block_type_check;
ALTER TABLE damage_log      DROP CONSTRAINT IF EXISTS damage_log_block_type_check;
ALTER TABLE waybills        DROP CONSTRAINT IF EXISTS waybills_block_type_check;
ALTER TABLE deliveries      DROP CONSTRAINT IF EXISTS deliveries_block_type_check;

-- ─────────────────────────────────────────────────────────────
-- PART 2: RENAME block_type in every transactional table
-- ─────────────────────────────────────────────────────────────

-- 9-inch → 9 Inch 3 Hole Block
UPDATE production_log        SET block_type='9 Inch 3 Hole Block' WHERE block_type='9-inch';
UPDATE order_items           SET block_type='9 Inch 3 Hole Block' WHERE block_type='9-inch';
UPDATE damage_log            SET block_type='9 Inch 3 Hole Block' WHERE block_type='9-inch';
UPDATE waybills              SET block_type='9 Inch 3 Hole Block' WHERE block_type='9-inch';
UPDATE deliveries            SET block_type='9 Inch 3 Hole Block' WHERE block_type='9-inch';
UPDATE batches               SET block_type='9 Inch 3 Hole Block' WHERE block_type='9-inch';
UPDATE pending_delivery_register SET block_type='9 Inch 3 Hole Block' WHERE block_type='9-inch';

-- 6-inch → 6 Inch Block
UPDATE production_log        SET block_type='6 Inch Block' WHERE block_type='6-inch';
UPDATE order_items           SET block_type='6 Inch Block' WHERE block_type='6-inch';
UPDATE damage_log            SET block_type='6 Inch Block' WHERE block_type='6-inch';
UPDATE waybills              SET block_type='6 Inch Block' WHERE block_type='6-inch';
UPDATE deliveries            SET block_type='6 Inch Block' WHERE block_type='6-inch';
UPDATE batches               SET block_type='6 Inch Block' WHERE block_type='6-inch';
UPDATE pending_delivery_register SET block_type='6 Inch Block' WHERE block_type='6-inch';

-- Interlock → Standard Interlock
UPDATE production_log        SET block_type='Standard Interlock' WHERE block_type='Interlock';
UPDATE order_items           SET block_type='Standard Interlock' WHERE block_type='Interlock';
UPDATE damage_log            SET block_type='Standard Interlock' WHERE block_type='Interlock';
UPDATE waybills              SET block_type='Standard Interlock' WHERE block_type='Interlock';
UPDATE deliveries            SET block_type='Standard Interlock' WHERE block_type='Interlock';
UPDATE batches               SET block_type='Standard Interlock' WHERE block_type='Interlock';
UPDATE pending_delivery_register SET block_type='Standard Interlock' WHERE block_type='Interlock';

-- ─────────────────────────────────────────────────────────────
-- PART 3: FIX finished_goods_stock (the table the dashboard reads)
-- ─────────────────────────────────────────────────────────────

-- Rename old values
UPDATE finished_goods_stock SET block_type='9 Inch 3 Hole Block' WHERE block_type='9-inch';
UPDATE finished_goods_stock SET block_type='6 Inch Block'         WHERE block_type='6-inch';
UPDATE finished_goods_stock SET block_type='Standard Interlock'   WHERE block_type='Interlock';

-- Merge: if both '6 Inch Block' and '6-inch' rows exist (after rename they both become '6 Inch Block'),
-- consolidate to one row with the total quantity_in_yard
WITH totals AS (
  SELECT block_type, SUM(quantity_in_yard) AS total
  FROM finished_goods_stock
  GROUP BY block_type
  HAVING COUNT(*) > 1
),
keepers AS (
  SELECT DISTINCT ON (fgs.block_type) fgs.id
  FROM finished_goods_stock fgs
  JOIN totals t ON t.block_type = fgs.block_type
  ORDER BY fgs.block_type, fgs.quantity_in_yard DESC, fgs.id
)
UPDATE finished_goods_stock fgs
SET quantity_in_yard = t.total
FROM totals t, keepers k
WHERE fgs.id = k.id AND fgs.block_type = t.block_type;

DELETE FROM finished_goods_stock
WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (
      PARTITION BY block_type
      ORDER BY quantity_in_yard DESC, id
    ) AS rn
    FROM finished_goods_stock
  ) sub WHERE rn > 1
);

-- ─────────────────────────────────────────────────────────────
-- PART 4: FIX finished_goods table (if it exists separately)
-- Wrapped in DO block so it won't error if table doesn't exist
-- ─────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'finished_goods') THEN
    UPDATE finished_goods SET block_type='9 Inch 3 Hole Block' WHERE block_type='9-inch';
    UPDATE finished_goods SET block_type='6 Inch Block'         WHERE block_type='6-inch';
    UPDATE finished_goods SET block_type='Standard Interlock'   WHERE block_type='Interlock';
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────
-- PART 5: FIX products table
-- ─────────────────────────────────────────────────────────────
UPDATE products SET name='9 Inch 3 Hole Block' WHERE LOWER(TRIM(name)) IN ('9-inch','9 inch','9 inch block');
UPDATE products SET name='6 Inch Block'         WHERE LOWER(TRIM(name)) IN ('6-inch','6 inch','6 inch block');
UPDATE products SET name='Standard Interlock'   WHERE LOWER(TRIM(name)) = 'interlock';

-- Deactivate any remaining duplicates (keep one active per name)
UPDATE products SET is_active = false
WHERE id IN (
  SELECT id FROM (
    SELECT id,
      ROW_NUMBER() OVER (
        PARTITION BY LOWER(TRIM(name))
        ORDER BY is_active DESC, updated_at DESC NULLS LAST, id
      ) AS rn
    FROM products
  ) sub WHERE rn > 1
);

-- ─────────────────────────────────────────────────────────────
-- PART 6: RE-ADD constraints with the new names
-- ─────────────────────────────────────────────────────────────
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

-- ─────────────────────────────────────────────────────────────
-- PART 7: VERIFY — paste the output back here
-- ─────────────────────────────────────────────────────────────
SELECT block_type, quantity_in_yard
FROM finished_goods_stock
ORDER BY block_type;
