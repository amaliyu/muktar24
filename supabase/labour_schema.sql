-- ============================================================
-- Labour Management Schema
-- Run in Supabase SQL Editor
-- ============================================================

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

-- Auto-generate labour_number
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

-- Labour Rate Change Requests
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

-- Daily Roster
CREATE TABLE IF NOT EXISTS daily_roster (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  roster_date           date NOT NULL UNIQUE,
  target_met            boolean DEFAULT false,
  total_daily_cost      numeric(12,2) DEFAULT 0,
  worker_count          integer DEFAULT 0,
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

-- Daily Roster Entries
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

-- Truck Loader Assignments
CREATE TABLE IF NOT EXISTS truck_loader_assignments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id    uuid REFERENCES vehicles(id),
  labour_id     uuid REFERENCES labour_pool(id),
  assigned_date date DEFAULT CURRENT_DATE,
  removed_date  date,
  is_active     boolean DEFAULT true,
  created_at    timestamptz DEFAULT now()
);

-- Truck Loading Log
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

-- Truck Loading Loaders (junction)
CREATE TABLE IF NOT EXISTS truck_loading_loaders (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loading_log_id  uuid REFERENCES truck_loading_log(id) ON DELETE CASCADE,
  labour_id       uuid REFERENCES labour_pool(id),
  created_at      timestamptz DEFAULT now()
);

-- Weekly Labour Payroll
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
CREATE INDEX IF NOT EXISTS labour_pool_active ON labour_pool(is_active);
CREATE INDEX IF NOT EXISTS daily_roster_date  ON daily_roster(roster_date);
CREATE INDEX IF NOT EXISTS roster_entries_roster ON daily_roster_entries(roster_id);
CREATE INDEX IF NOT EXISTS loading_log_week   ON truck_loading_log(payment_week_ending);

-- RLS
ALTER TABLE labour_roles                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE labour_pool                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE labour_rate_change_requests   ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_roster                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_roster_entries          ENABLE ROW LEVEL SECURITY;
ALTER TABLE truck_loader_assignments      ENABLE ROW LEVEL SECURITY;
ALTER TABLE truck_loading_log             ENABLE ROW LEVEL SECURITY;
ALTER TABLE truck_loading_loaders         ENABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_labour_payroll         ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_all" ON labour_roles                FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON labour_pool                 FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON labour_rate_change_requests FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON daily_roster                FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON daily_roster_entries        FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON truck_loader_assignments    FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON truck_loading_log           FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON truck_loading_loaders       FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON weekly_labour_payroll       FOR ALL USING (true) WITH CHECK (true);

GRANT ALL ON labour_roles                TO anon, authenticated;
GRANT ALL ON labour_pool                 TO anon, authenticated;
GRANT ALL ON labour_rate_change_requests TO anon, authenticated;
GRANT ALL ON daily_roster                TO anon, authenticated;
GRANT ALL ON daily_roster_entries        TO anon, authenticated;
GRANT ALL ON truck_loader_assignments    TO anon, authenticated;
GRANT ALL ON truck_loading_log           TO anon, authenticated;
GRANT ALL ON truck_loading_loaders       TO anon, authenticated;
GRANT ALL ON weekly_labour_payroll       TO anon, authenticated;

-- ============================================================
-- Pre-populate Labour Roles
-- ============================================================
INSERT INTO labour_roles (role_name, payment_type, base_rate, target_bonus, bonus_type, effective_date, approved_by) VALUES
  ('Bunker',             'daily',         5000,    500, 'per_day', CURRENT_DATE, 'System'),
  ('Mixer Operator',     'daily',         5500,    500, 'per_day', CURRENT_DATE, 'System'),
  ('Machine Boy',        'daily',         5000,      0, 'none',    CURRENT_DATE, 'System'),
  ('Machine Operator',   'monthly_fixed', 200000,    0, 'none',    CURRENT_DATE, 'System'),
  ('Pallet Loader',      'daily',         5000,      0, 'none',    CURRENT_DATE, 'System'),
  ('Fresh Block Pusher', 'daily',         5000,    300, 'per_day', CURRENT_DATE, 'System'),
  ('Stacker',            'daily',         5000,      0, 'none',    CURRENT_DATE, 'System'),
  ('Pallet Returner',    'daily',         5000,      0, 'none',    CURRENT_DATE, 'System'),
  ('Foreman',            'monthly_fixed', 200000,    0, 'none',    CURRENT_DATE, 'System'),
  ('Waterman',           'monthly_fixed', 150000,    0, 'none',    CURRENT_DATE, 'System'),
  ('Truck Loader',       'piece_rate',        8,     0, 'none',    CURRENT_DATE, 'System')
ON CONFLICT (role_name) DO NOTHING;

-- Verify
SELECT role_name, payment_type, base_rate, target_bonus, bonus_type FROM labour_roles ORDER BY role_name;
