-- ============================================================
-- Abuja Precast Manager — Auth, Roles & Financial Tables
-- Migration: auth_roles_financial_tables.sql
-- Run in Supabase SQL Editor
-- ============================================================

-- ============================================================
-- 1. APP ROLES
-- ============================================================

CREATE TABLE IF NOT EXISTS app_roles (
  id              text        PRIMARY KEY,
  display_name    text        NOT NULL,
  description     text,
  is_system_role  boolean     NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Seed roles (idempotent)
INSERT INTO app_roles (id, display_name, description, is_system_role) VALUES
  ('md',           'Managing Director', 'Full access to all modules and settings',           false),
  ('accountant',   'Accountant',        'Full accounting access including financial reports', false),
  ('board_member', 'Board Member',      'Read-only executive access to summaries',            true),
  ('operations',   'Operations',        'Operational access — production, deliveries, fleet', false),
  ('sales',        'Sales',             'Sales access — orders, customers, invoices',          false),
  ('staff',        'Staff',             'Limited access to assigned tasks only',               false)
ON CONFLICT (id) DO UPDATE
  SET display_name   = EXCLUDED.display_name,
      description    = EXCLUDED.description,
      is_system_role = EXCLUDED.is_system_role;

-- ============================================================
-- 2. USER PROFILES
-- ============================================================

CREATE TABLE IF NOT EXISTS user_profiles (
  id          uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email       text,
  full_name   text,
  role        text        NOT NULL DEFAULT 'staff' REFERENCES app_roles(id),
  is_active   boolean     NOT NULL DEFAULT true,
  created_by  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Trigger function: auto-create profile when a new auth user is inserted
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _full_name text;
BEGIN
  -- Derive a readable name from the email local part (before the @).
  -- Replace dots with spaces and title-case the result.
  _full_name := initcap(replace(split_part(NEW.email, '@', 1), '.', ' '));

  INSERT INTO public.user_profiles (id, email, full_name, role)
  VALUES (NEW.id, NEW.email, _full_name, 'staff')
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- Drop the trigger first so this script is safely re-runnable
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_auth_user();

-- ============================================================
-- 3. OPENING BALANCES
-- ============================================================

CREATE TABLE IF NOT EXISTS opening_balances (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  category            text        NOT NULL CHECK (category IN ('asset', 'liability', 'equity')),
  sub_category        text        NOT NULL CHECK (sub_category IN (
                                    'fixed_asset',
                                    'current_asset',
                                    'current_liability',
                                    'long_term_liability',
                                    'equity'
                                  )),
  account_name        text        NOT NULL,
  amount              numeric     NOT NULL DEFAULT 0,
  depreciation_amount numeric     NOT NULL DEFAULT 0,
  vehicle_id          uuid        REFERENCES vehicles(id) ON DELETE SET NULL,
  as_at_date          date        NOT NULL DEFAULT current_date,
  notes               text,
  metadata            jsonb       NOT NULL DEFAULT '{}',
  entered_by          text,
  last_edited_by      text,
  last_edited_at      timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_opening_balances_category
  ON opening_balances (category, sub_category);

CREATE INDEX IF NOT EXISTS idx_opening_balances_vehicle
  ON opening_balances (vehicle_id)
  WHERE vehicle_id IS NOT NULL;

-- ============================================================
-- 4. OPENING BALANCE HISTORY
-- ============================================================

CREATE TABLE IF NOT EXISTS opening_balance_history (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  opening_balance_id  uuid        NOT NULL REFERENCES opening_balances(id) ON DELETE CASCADE,
  old_amount          numeric,
  new_amount          numeric,
  old_depreciation    numeric,
  new_depreciation    numeric,
  changed_by          text,
  reason              text,
  changed_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ob_history_opening_balance
  ON opening_balance_history (opening_balance_id, changed_at DESC);

-- ============================================================
-- 5. FINANCIAL ADJUSTMENTS
-- ============================================================

CREATE TABLE IF NOT EXISTS financial_adjustments (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  statement_type  text        NOT NULL CHECK (statement_type IN ('balance_sheet', 'income', 'cashflow')),
  account_name    text        NOT NULL,
  amount          numeric     NOT NULL DEFAULT 0,
  period_from     date,
  period_to       date,
  adjustment_date date        NOT NULL DEFAULT current_date,
  reason          text,
  entered_by      text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_financial_adjustments_type
  ON financial_adjustments (statement_type, adjustment_date DESC);

-- ============================================================
-- ROW LEVEL SECURITY — disabled on all new tables
-- ============================================================

ALTER TABLE app_roles               DISABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles           DISABLE ROW LEVEL SECURITY;
ALTER TABLE opening_balances        DISABLE ROW LEVEL SECURITY;
ALTER TABLE opening_balance_history DISABLE ROW LEVEL SECURITY;
ALTER TABLE financial_adjustments   DISABLE ROW LEVEL SECURITY;

-- ============================================================
-- GRANTS
-- ============================================================

GRANT ALL ON TABLE app_roles               TO anon, authenticated;
GRANT ALL ON TABLE user_profiles           TO anon, authenticated;
GRANT ALL ON TABLE opening_balances        TO anon, authenticated;
GRANT ALL ON TABLE opening_balance_history TO anon, authenticated;
GRANT ALL ON TABLE financial_adjustments   TO anon, authenticated;
