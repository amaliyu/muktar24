-- ============================================================
-- ABUJA PRECAST CONCRETE LIMITED — MASTER DEPLOYMENT SQL
-- Run this ENTIRE file in Supabase SQL Editor → New Query → Run
-- Designed to be safe to re-run (uses IF NOT EXISTS / ON CONFLICT)
-- ============================================================
-- Order of execution:
--   1. App roles seed
--   2. User profile enhancements
--   3. Block type canonical rename (all tables)
--   4. Labour management schema
--   5. Confirm unconfirmed auth users
-- ============================================================


-- ════════════════════════════════════════════════════════════
-- SECTION 1: APP ROLES SEED
-- ════════════════════════════════════════════════════════════

INSERT INTO app_roles (id, display_name, description, is_system_role)
VALUES
  ('md',                 'Managing Director',           'Full access to all modules',                                           true),
  ('ico',                'Internal Control Officer',    'Reviews and approves schedules; read-only access to all modules',      false),
  ('accountant',         'Accountant',                  'Manages accounting, payroll, reports and labour payments',             false),
  ('board_member',       'Board Member',                'Dashboard overview only',                                              false),
  ('bdm',                'Business Development Manager','Manages customer relationships, orders and delivery scheduling',       false),
  ('store_officer',      'Store Officer',               'Manages inventory, batches, waybills and approved schedules',          false),
  ('logistics_manager',  'Logistics Manager',           'Manages deliveries, vehicles, waybills and labour',                   false),
  ('marketer',           'Marketer',                    'Manages own customers and orders',                                     false),
  ('driver',             'Driver',                      'Views assigned waybills only',                                         false),
  ('hr_officer',         'HR Officer',                  'Manages staff, attendance, reports and labour',                        false),
  ('production_manager', 'Production Manager',          'Manages production, inventory, batches, reports and labour',           false)
ON CONFLICT (id) DO UPDATE
  SET display_name = EXCLUDED.display_name,
      description  = EXCLUDED.description;


-- ════════════════════════════════════════════════════════════
-- SECTION 2: USER PROFILE ENHANCEMENTS
-- ════════════════════════════════════════════════════════════

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS staff_id   uuid REFERENCES staff(id),
  ADD COLUMN IF NOT EXISTS last_login timestamptz;


-- ════════════════════════════════════════════════════════════
-- SECTION 3: BLOCK TYPE CANONICAL RENAME
-- Renames: 9-inch → 9 Inch 3 Hole Block
--          6-inch → 6 Inch Block
--          Interlock → Standard Interlock
-- ════════════════════════════════════════════════════════════

-- 3a. Drop old check constraints that would block the updates
ALTER TABLE production_log  DROP CONSTRAINT IF EXISTS production_log_block_type_check;
ALTER TABLE order_items     DROP CONSTRAINT IF EXISTS order_items_block_type_check;
ALTER TABLE damage_log      DROP CONSTRAINT IF EXISTS damage_log_block_type_check;
ALTER TABLE waybills        DROP CONSTRAINT IF EXISTS waybills_block_type_check;
ALTER TABLE deliveries      DROP CONSTRAINT IF EXISTS deliveries_block_type_check;

-- 3b. Rename 9-inch in every transactional table
UPDATE production_log            SET block_type = '9 Inch 3 Hole Block' WHERE block_type = '9-inch';
UPDATE order_items               SET block_type = '9 Inch 3 Hole Block' WHERE block_type = '9-inch';
UPDATE damage_log                SET block_type = '9 Inch 3 Hole Block' WHERE block_type = '9-inch';
UPDATE waybills                  SET block_type = '9 Inch 3 Hole Block' WHERE block_type = '9-inch';
UPDATE deliveries                SET block_type = '9 Inch 3 Hole Block' WHERE block_type = '9-inch';
UPDATE batches                   SET block_type = '9 Inch 3 Hole Block' WHERE block_type = '9-inch';
UPDATE pending_delivery_register SET block_type = '9 Inch 3 Hole Block' WHERE block_type = '9-inch';

-- delivery_schedule_items (block_type comes from pending_register join, but may have its own column)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'delivery_schedule_items' AND column_name = 'block_type'
  ) THEN
    EXECUTE 'UPDATE delivery_schedule_items SET block_type = ''9 Inch 3 Hole Block'' WHERE block_type = ''9-inch''';
    EXECUTE 'UPDATE delivery_schedule_items SET block_type = ''6 Inch Block'' WHERE block_type = ''6-inch''';
    EXECUTE 'UPDATE delivery_schedule_items SET block_type = ''Standard Interlock'' WHERE block_type = ''Interlock''';
  END IF;
END $$;

-- 3c. Rename 6-inch
UPDATE production_log            SET block_type = '6 Inch Block' WHERE block_type = '6-inch';
UPDATE order_items               SET block_type = '6 Inch Block' WHERE block_type = '6-inch';
UPDATE damage_log                SET block_type = '6 Inch Block' WHERE block_type = '6-inch';
UPDATE waybills                  SET block_type = '6 Inch Block' WHERE block_type = '6-inch';
UPDATE deliveries                SET block_type = '6 Inch Block' WHERE block_type = '6-inch';
UPDATE batches                   SET block_type = '6 Inch Block' WHERE block_type = '6-inch';
UPDATE pending_delivery_register SET block_type = '6 Inch Block' WHERE block_type = '6-inch';

-- 3d. Rename Interlock
UPDATE production_log            SET block_type = 'Standard Interlock' WHERE block_type = 'Interlock';
UPDATE order_items               SET block_type = 'Standard Interlock' WHERE block_type = 'Interlock';
UPDATE damage_log                SET block_type = 'Standard Interlock' WHERE block_type = 'Interlock';
UPDATE waybills                  SET block_type = 'Standard Interlock' WHERE block_type = 'Interlock';
UPDATE deliveries                SET block_type = 'Standard Interlock' WHERE block_type = 'Interlock';
UPDATE batches                   SET block_type = 'Standard Interlock' WHERE block_type = 'Interlock';
UPDATE pending_delivery_register SET block_type = 'Standard Interlock' WHERE block_type = 'Interlock';

-- 3e. Fix finished_goods_stock — rename and deduplicate
UPDATE finished_goods_stock SET block_type = '9 Inch 3 Hole Block' WHERE block_type = '9-inch';
UPDATE finished_goods_stock SET block_type = '6 Inch Block'         WHERE block_type = '6-inch';
UPDATE finished_goods_stock SET block_type = 'Standard Interlock'   WHERE block_type = 'Interlock';

-- Merge duplicates: sum quantities into one row per block_type
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
    SELECT id,
      ROW_NUMBER() OVER (
        PARTITION BY block_type
        ORDER BY quantity_in_yard DESC, id
      ) AS rn
    FROM finished_goods_stock
  ) sub WHERE rn > 1
);

-- 3f. Fix products table
UPDATE products SET name = '9 Inch 3 Hole Block' WHERE LOWER(TRIM(name)) IN ('9-inch','9 inch','9 inch block');
UPDATE products SET name = '6 Inch Block'         WHERE LOWER(TRIM(name)) IN ('6-inch','6 inch','6 inch block');
UPDATE products SET name = 'Standard Interlock'   WHERE LOWER(TRIM(name)) = 'interlock';

-- Deactivate duplicate product entries (keep one active per name)
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

-- 3g. Re-add check constraints with canonical names
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


-- ════════════════════════════════════════════════════════════
-- SECTION 4: LABOUR MANAGEMENT SCHEMA
-- ════════════════════════════════════════════════════════════

-- Labour Roles
CREATE TABLE IF NOT EXISTS labour_roles (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_name      text NOT NULL UNIQUE,
  payment_type   text NOT NULL CHECK (payment_type IN ('daily','monthly_fixed','piece_rate')),
  base_rate      numeric(12,2) NOT NULL,
  target_bonus   numeric(12,2) DEFAULT 0,
  bonus_type     text NOT NULL DEFAULT 'none' CHECK (bonus_type IN ('per_day','per_block','none')),
  is_active      boolean DEFAULT true,
  effective_date date DEFAULT CURRENT_DATE,
  approved_by    text,
  created_at     timestamptz DEFAULT now()
);

-- Labour Pool
CREATE TABLE IF NOT EXISTS labour_pool (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  labour_number       text UNIQUE,
  full_name           text NOT NULL,
  phone               text,
  bank_name           text,
  bank_account_number text,
  bank_account_name   text,
  category            text NOT NULL CHECK (category IN ('monthly_fixed','daily','piece_rate')),
  usual_role_id       uuid REFERENCES labour_roles(id),
  is_active           boolean DEFAULT true,
  date_registered     date DEFAULT CURRENT_DATE,
  notes               text,
  created_at          timestamptz DEFAULT now()
);

-- Auto-generate labour_number (APC-LAB-001 format)
CREATE SEQUENCE IF NOT EXISTS labour_number_seq START 1;
GRANT USAGE, SELECT ON SEQUENCE labour_number_seq TO anon, authenticated;

CREATE OR REPLACE FUNCTION generate_labour_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.labour_number IS NULL OR NEW.labour_number = '' THEN
    NEW.labour_number := 'APC-LAB-' || LPAD(nextval('labour_number_seq')::text, 3, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_labour_number ON labour_pool;
CREATE TRIGGER set_labour_number
  BEFORE INSERT ON labour_pool
  FOR EACH ROW EXECUTE FUNCTION generate_labour_number();

-- Labour Rate Change Requests (two-stage approval: ICO → MD)
CREATE TABLE IF NOT EXISTS labour_rate_change_requests (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id          uuid REFERENCES labour_roles(id),
  current_rate     numeric(12,2),
  proposed_rate    numeric(12,2),
  current_bonus    numeric(12,2),
  proposed_bonus   numeric(12,2),
  reason           text,
  requested_by     text,
  requested_date   date DEFAULT CURRENT_DATE,
  ico_reviewed_by  text,
  ico_review_date  date,
  ico_comments     text,
  ico_status       text DEFAULT 'pending' CHECK (ico_status IN ('pending','approved','rejected')),
  md_approved_by   text,
  md_approval_date date,
  md_comments      text,
  md_status        text DEFAULT 'pending' CHECK (md_status IN ('pending','approved','rejected')),
  overall_status   text DEFAULT 'pending' CHECK (overall_status IN ('pending','ico_review','md_review','approved','rejected')),
  effective_date   date,
  created_at       timestamptz DEFAULT now()
);

-- Daily Roster (ICO then MD approval)
CREATE TABLE IF NOT EXISTS daily_roster (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  roster_date           date NOT NULL UNIQUE,
  target_met            boolean DEFAULT false,
  total_daily_cost      numeric(12,2) DEFAULT 0,
  submitted_by          text,
  submitted_date        timestamptz,
  ico_approved_by       text,
  ico_approval_date     timestamptz,
  ico_status            text DEFAULT 'draft' CHECK (ico_status IN ('draft','submitted','ico_approved','ico_rejected')),
  md_approved_by        text,
  md_approval_date      timestamptz,
  md_status             text DEFAULT 'pending' CHECK (md_status IN ('pending','approved','rejected')),
  payment_week_ending   date,
  payment_status        text DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid','paid')),
  notes                 text,
  created_at            timestamptz DEFAULT now()
);

-- Daily Roster Entries (one row per worker per day)
CREATE TABLE IF NOT EXISTS daily_roster_entries (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  roster_id        uuid REFERENCES daily_roster(id) ON DELETE CASCADE,
  labour_id        uuid REFERENCES labour_pool(id),
  role_id          uuid REFERENCES labour_roles(id),
  base_rate        numeric(12,2),
  target_bonus     numeric(12,2) DEFAULT 0,
  bonus_applicable boolean DEFAULT false,
  total_pay        numeric(12,2),
  notes            text,
  created_at       timestamptz DEFAULT now()
);

-- Truck Loader Assignments (vehicle ↔ worker many-to-many)
CREATE TABLE IF NOT EXISTS truck_loader_assignments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id    uuid REFERENCES vehicles(id),
  labour_id     uuid REFERENCES labour_pool(id),
  assigned_date date DEFAULT CURRENT_DATE,
  removed_date  date,
  is_active     boolean DEFAULT true,
  created_at    timestamptz DEFAULT now()
);

-- Truck Loading Log (per-waybill loading record)
CREATE TABLE IF NOT EXISTS truck_loading_log (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  waybill_id          uuid REFERENCES waybills(id),
  blocks_loaded       integer,
  rate_per_block      numeric(10,2) DEFAULT 8,
  total_amount        numeric(12,2),
  split_per_loader    numeric(12,2),
  payment_week_ending date,
  payment_status      text DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid','paid')),
  submitted_by        text,
  ico_approved_by     text,
  md_approved_by      text,
  payment_date        date,
  created_at          timestamptz DEFAULT now()
);

-- Truck Loading Loaders junction (which workers loaded which truck)
CREATE TABLE IF NOT EXISTS truck_loading_loaders (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loading_log_id  uuid REFERENCES truck_loading_log(id) ON DELETE CASCADE,
  labour_id       uuid REFERENCES labour_pool(id),
  created_at      timestamptz DEFAULT now()
);

-- Weekly Labour Payroll (aggregated per week per type)
CREATE TABLE IF NOT EXISTS weekly_labour_payroll (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_ending     date NOT NULL,
  payroll_type    text NOT NULL CHECK (payroll_type IN ('production','loading','monthly_fixed')),
  total_amount    numeric(12,2),
  worker_count    integer,
  status          text DEFAULT 'draft' CHECK (status IN ('draft','ico_approved','md_approved','paid')),
  payment_date    date,
  prepared_by     text,
  ico_approved_by text,
  md_approved_by  text,
  created_at      timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS labour_pool_active      ON labour_pool(is_active);
CREATE INDEX IF NOT EXISTS daily_roster_date       ON daily_roster(roster_date);
CREATE INDEX IF NOT EXISTS roster_entries_roster   ON daily_roster_entries(roster_id);
CREATE INDEX IF NOT EXISTS loading_log_week        ON truck_loading_log(payment_week_ending);

-- RLS
ALTER TABLE labour_roles                ENABLE ROW LEVEL SECURITY;
ALTER TABLE labour_pool                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE labour_rate_change_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_roster               ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_roster_entries       ENABLE ROW LEVEL SECURITY;
ALTER TABLE truck_loader_assignments   ENABLE ROW LEVEL SECURITY;
ALTER TABLE truck_loading_log          ENABLE ROW LEVEL SECURITY;
ALTER TABLE truck_loading_loaders      ENABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_labour_payroll      ENABLE ROW LEVEL SECURITY;

-- Open policies (app enforces role-based access)
DO $$ BEGIN
  CREATE POLICY "allow_all" ON labour_roles                FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "allow_all" ON labour_pool                 FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "allow_all" ON labour_rate_change_requests FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "allow_all" ON daily_roster               FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "allow_all" ON daily_roster_entries       FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "allow_all" ON truck_loader_assignments   FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "allow_all" ON truck_loading_log          FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "allow_all" ON truck_loading_loaders      FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "allow_all" ON weekly_labour_payroll      FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Grants
GRANT ALL ON labour_roles                TO anon, authenticated;
GRANT ALL ON labour_pool                 TO anon, authenticated;
GRANT ALL ON labour_rate_change_requests TO anon, authenticated;
GRANT ALL ON daily_roster               TO anon, authenticated;
GRANT ALL ON daily_roster_entries       TO anon, authenticated;
GRANT ALL ON truck_loader_assignments   TO anon, authenticated;
GRANT ALL ON truck_loading_log          TO anon, authenticated;
GRANT ALL ON truck_loading_loaders      TO anon, authenticated;
GRANT ALL ON weekly_labour_payroll      TO anon, authenticated;

-- Seed: 11 Labour Roles
INSERT INTO labour_roles (role_name, payment_type, base_rate, target_bonus, bonus_type, effective_date, approved_by) VALUES
  ('Bunker',             'daily',         5000,    500, 'per_day',   CURRENT_DATE, 'System'),
  ('Mixer Operator',     'daily',         5500,    500, 'per_day',   CURRENT_DATE, 'System'),
  ('Machine Boy',        'daily',         5000,      0, 'none',      CURRENT_DATE, 'System'),
  ('Machine Operator',   'monthly_fixed', 200000,    0, 'none',      CURRENT_DATE, 'System'),
  ('Pallet Loader',      'daily',         5000,      0, 'none',      CURRENT_DATE, 'System'),
  ('Fresh Block Pusher', 'daily',         5000,    300, 'per_day',   CURRENT_DATE, 'System'),
  ('Stacker',            'daily',         5000,      0, 'none',      CURRENT_DATE, 'System'),
  ('Pallet Returner',    'daily',         5000,      0, 'none',      CURRENT_DATE, 'System'),
  ('Foreman',            'monthly_fixed', 200000,    0, 'none',      CURRENT_DATE, 'System'),
  ('Waterman',           'monthly_fixed', 150000,    0, 'none',      CURRENT_DATE, 'System'),
  ('Truck Loader',       'piece_rate',        8,     0, 'none',      CURRENT_DATE, 'System')
ON CONFLICT (role_name) DO NOTHING;


-- ════════════════════════════════════════════════════════════
-- SECTION 5: CONFIRM UNCONFIRMED AUTH USERS
-- (So all created staff can log in immediately)
-- ════════════════════════════════════════════════════════════

UPDATE auth.users
SET email_confirmed_at = NOW()
WHERE email_confirmed_at IS NULL;


-- ════════════════════════════════════════════════════════════
-- VERIFICATION QUERIES
-- ════════════════════════════════════════════════════════════

-- Check block types are clean
SELECT 'finished_goods_stock' AS tbl, block_type, quantity_in_yard FROM finished_goods_stock ORDER BY block_type;

-- Check labour tables exist and roles seeded
SELECT role_name, payment_type, base_rate, target_bonus, bonus_type
FROM labour_roles ORDER BY payment_type, role_name;

-- Check app roles
SELECT id, display_name FROM app_roles ORDER BY id;
