-- ============================================================
-- FIX ALL PRIORITY ISSUES — ABUJA PRECAST CONCRETE MANAGER
-- Run in Supabase SQL Editor
-- Covers: RLS policies, missing roles, report_history,
--         production_targets tables
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- FIX 1 + FIX 3: ENABLE RLS ON PREVIOUSLY DISABLED TABLES
-- ────────────────────────────────────────────────────────────

ALTER TABLE app_roles               ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles           ENABLE ROW LEVEL SECURITY;
ALTER TABLE opening_balances        ENABLE ROW LEVEL SECURITY;
ALTER TABLE opening_balance_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE financial_adjustments   ENABLE ROW LEVEL SECURITY;

-- ── HELPER: get current user's role from user_profiles ───────
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS TEXT
LANGUAGE SQL
SECURITY DEFINER
STABLE
AS $$
  SELECT role FROM public.user_profiles WHERE id = auth.uid()
$$;

GRANT EXECUTE ON FUNCTION get_user_role() TO anon, authenticated;

-- ────────────────────────────────────────────────────────────
-- APP_ROLES: everyone can read; only MD can modify
-- ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "app_roles_select" ON app_roles;
CREATE POLICY "app_roles_select" ON app_roles
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "app_roles_write" ON app_roles;
CREATE POLICY "app_roles_write" ON app_roles
  FOR ALL
  USING (get_user_role() = 'md')
  WITH CHECK (get_user_role() = 'md');

-- ────────────────────────────────────────────────────────────
-- USER_PROFILES: own row or MD sees all
-- ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "profiles_select" ON user_profiles;
CREATE POLICY "profiles_select" ON user_profiles
  FOR SELECT
  USING (id = auth.uid() OR get_user_role() = 'md');

DROP POLICY IF EXISTS "profiles_insert" ON user_profiles;
CREATE POLICY "profiles_insert" ON user_profiles
  FOR INSERT
  WITH CHECK (id = auth.uid() OR get_user_role() = 'md');

DROP POLICY IF EXISTS "profiles_update" ON user_profiles;
CREATE POLICY "profiles_update" ON user_profiles
  FOR UPDATE
  USING (id = auth.uid() OR get_user_role() = 'md')
  WITH CHECK (id = auth.uid() OR get_user_role() = 'md');

DROP POLICY IF EXISTS "profiles_delete" ON user_profiles;
CREATE POLICY "profiles_delete" ON user_profiles
  FOR DELETE
  USING (get_user_role() = 'md');

-- ────────────────────────────────────────────────────────────
-- OPENING_BALANCES: MD + Accountant write; ICO + Board read
-- ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "ob_select" ON opening_balances;
CREATE POLICY "ob_select" ON opening_balances
  FOR SELECT
  USING (get_user_role() IN ('md','accountant','ico','board_member'));

DROP POLICY IF EXISTS "ob_insert" ON opening_balances;
CREATE POLICY "ob_insert" ON opening_balances
  FOR INSERT
  WITH CHECK (get_user_role() IN ('md','accountant'));

DROP POLICY IF EXISTS "ob_update" ON opening_balances;
CREATE POLICY "ob_update" ON opening_balances
  FOR UPDATE
  USING (get_user_role() IN ('md','accountant'))
  WITH CHECK (get_user_role() IN ('md','accountant'));

DROP POLICY IF EXISTS "ob_delete" ON opening_balances;
CREATE POLICY "ob_delete" ON opening_balances
  FOR DELETE
  USING (get_user_role() IN ('md','accountant'));

-- ────────────────────────────────────────────────────────────
-- OPENING_BALANCE_HISTORY: financial roles read; system writes
-- ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "obh_select" ON opening_balance_history;
CREATE POLICY "obh_select" ON opening_balance_history
  FOR SELECT
  USING (get_user_role() IN ('md','accountant','ico','board_member'));

DROP POLICY IF EXISTS "obh_insert" ON opening_balance_history;
CREATE POLICY "obh_insert" ON opening_balance_history
  FOR INSERT
  WITH CHECK (get_user_role() IN ('md','accountant'));

-- ────────────────────────────────────────────────────────────
-- FINANCIAL_ADJUSTMENTS: MD + Accountant full; ICO + Board read
-- ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "fa_select" ON financial_adjustments;
CREATE POLICY "fa_select" ON financial_adjustments
  FOR SELECT
  USING (get_user_role() IN ('md','accountant','ico','board_member'));

DROP POLICY IF EXISTS "fa_insert" ON financial_adjustments;
CREATE POLICY "fa_insert" ON financial_adjustments
  FOR INSERT
  WITH CHECK (get_user_role() IN ('md','accountant'));

DROP POLICY IF EXISTS "fa_update" ON financial_adjustments;
CREATE POLICY "fa_update" ON financial_adjustments
  FOR UPDATE
  USING (get_user_role() IN ('md','accountant'))
  WITH CHECK (get_user_role() IN ('md','accountant'));

DROP POLICY IF EXISTS "fa_delete" ON financial_adjustments;
CREATE POLICY "fa_delete" ON financial_adjustments
  FOR DELETE
  USING (get_user_role() IN ('md','accountant'));

-- ────────────────────────────────────────────────────────────
-- EXPENSES: financial team + role-specific write access
-- ────────────────────────────────────────────────────────────
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "expenses_select" ON expenses;
CREATE POLICY "expenses_select" ON expenses
  FOR SELECT
  USING (get_user_role() IN ('md','accountant','ico','board_member'));

DROP POLICY IF EXISTS "expenses_insert" ON expenses;
CREATE POLICY "expenses_insert" ON expenses
  FOR INSERT
  WITH CHECK (
    get_user_role() IN ('md','accountant','production_manager',
                        'logistics_manager','hr_officer','store_officer')
  );

DROP POLICY IF EXISTS "expenses_update" ON expenses;
CREATE POLICY "expenses_update" ON expenses
  FOR UPDATE
  USING (get_user_role() IN ('md','accountant'))
  WITH CHECK (get_user_role() IN ('md','accountant'));

DROP POLICY IF EXISTS "expenses_delete" ON expenses;
CREATE POLICY "expenses_delete" ON expenses
  FOR DELETE
  USING (get_user_role() IN ('md','accountant'));

-- ────────────────────────────────────────────────────────────
-- CUSTOMERS: marketers see own; others see all
-- ────────────────────────────────────────────────────────────
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "customers_select" ON customers;
CREATE POLICY "customers_select" ON customers
  FOR SELECT
  USING (
    CASE WHEN get_user_role() = 'marketer'
    THEN added_by = auth.uid()
    ELSE true
    END
  );

DROP POLICY IF EXISTS "customers_write" ON customers;
CREATE POLICY "customers_write" ON customers
  FOR ALL
  USING (
    get_user_role() IN ('md','bdm','accountant','ico','marketer','logistics_manager')
  )
  WITH CHECK (
    get_user_role() IN ('md','bdm','accountant','ico','marketer','logistics_manager')
  );

-- ────────────────────────────────────────────────────────────
-- WAYBILLS: drivers see own; others see all
-- ────────────────────────────────────────────────────────────
ALTER TABLE waybills ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "waybills_select" ON waybills;
CREATE POLICY "waybills_select" ON waybills
  FOR SELECT
  USING (
    CASE WHEN get_user_role() = 'driver'
    THEN driver_id IN (SELECT id FROM staff WHERE user_id = auth.uid())
    ELSE true
    END
  );

DROP POLICY IF EXISTS "waybills_write" ON waybills;
CREATE POLICY "waybills_write" ON waybills
  FOR ALL
  USING (
    get_user_role() IN ('md','ico','store_officer','logistics_manager',
                        'production_manager','bdm')
  )
  WITH CHECK (
    get_user_role() IN ('md','ico','store_officer','logistics_manager',
                        'production_manager','bdm')
  );

-- ────────────────────────────────────────────────────────────
-- STAFF: HR + MD see all; others see own record only
-- ────────────────────────────────────────────────────────────
ALTER TABLE staff ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff_select" ON staff;
CREATE POLICY "staff_select" ON staff
  FOR SELECT
  USING (
    CASE WHEN get_user_role() IN ('md','hr_officer','accountant','ico','board_member')
    THEN true
    ELSE user_id = auth.uid()
    END
  );

DROP POLICY IF EXISTS "staff_write" ON staff;
CREATE POLICY "staff_write" ON staff
  FOR ALL
  USING (get_user_role() IN ('md','hr_officer'))
  WITH CHECK (get_user_role() IN ('md','hr_officer'));

-- ────────────────────────────────────────────────────────────
-- FIX 2: ADD MISSING APP ROLES (idempotent)
-- ────────────────────────────────────────────────────────────
INSERT INTO app_roles (id, display_name, description, is_system_role)
VALUES
  ('bdm',                'Business Development Manager', 'Manages customer relationships, orders and delivery scheduling', false),
  ('ico',                'Internal Control Officer',     'Reviews and approves schedules; read-only access to all modules', false),
  ('store_officer',      'Store Officer',                'Manages inventory, batches, waybills and approved schedules', false),
  ('logistics_manager',  'Logistics Manager',            'Manages deliveries, vehicles and waybills', false),
  ('marketer',           'Marketer',                     'Manages own customers and orders', false),
  ('driver',             'Driver',                       'Views assigned waybills only', false),
  ('hr_officer',         'HR Officer',                   'Manages staff, attendance and payroll', false),
  ('production_manager', 'Production Manager',           'Manages production log, inventory and batches', false)
ON CONFLICT (id) DO UPDATE
  SET display_name = EXCLUDED.display_name,
      description  = EXCLUDED.description;

-- Verify: SELECT id, display_name FROM app_roles ORDER BY id;

-- ────────────────────────────────────────────────────────────
-- FIX 8: REPORT HISTORY TABLE
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS report_history (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id         text,
  report_name       text        NOT NULL,
  report_category   text,
  period            text,
  period_from       date,
  period_to         date,
  generated_by      uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  generated_by_name text,
  generated_at      timestamptz NOT NULL DEFAULT now(),
  format            text        DEFAULT 'pdf',
  filters           jsonb       DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_report_history_user
  ON report_history (generated_by, generated_at DESC);

CREATE INDEX IF NOT EXISTS idx_report_history_at
  ON report_history (generated_at DESC);

ALTER TABLE report_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "report_history_select" ON report_history;
CREATE POLICY "report_history_select" ON report_history
  FOR SELECT
  USING (
    CASE WHEN get_user_role() IN ('md','ico')
    THEN true
    ELSE generated_by = auth.uid()
    END
  );

DROP POLICY IF EXISTS "report_history_insert" ON report_history;
CREATE POLICY "report_history_insert" ON report_history
  FOR INSERT
  WITH CHECK (true);

GRANT ALL ON TABLE report_history TO anon, authenticated;

-- ────────────────────────────────────────────────────────────
-- FIX 9: PRODUCTION TARGETS TABLE
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS production_targets (
  id              uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  target_date     date    NOT NULL,
  block_type      text    NOT NULL,
  target_quantity integer NOT NULL DEFAULT 0,
  set_by          uuid    REFERENCES auth.users(id) ON DELETE SET NULL,
  set_by_name     text,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (target_date, block_type)
);

CREATE INDEX IF NOT EXISTS idx_production_targets_date
  ON production_targets (target_date DESC);

ALTER TABLE production_targets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "prod_targets_select" ON production_targets;
CREATE POLICY "prod_targets_select" ON production_targets
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "prod_targets_write" ON production_targets;
CREATE POLICY "prod_targets_write" ON production_targets
  FOR ALL
  USING (get_user_role() IN ('md','production_manager','ico'))
  WITH CHECK (get_user_role() IN ('md','production_manager','ico'));

GRANT ALL ON TABLE production_targets TO anon, authenticated;

-- ────────────────────────────────────────────────────────────
-- GRANTS (ensure all authenticated users can access new tables)
-- ────────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION get_user_role() TO anon, authenticated;
