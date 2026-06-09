-- ============================================================
-- Abuja Precast Manager — Row Level Security Policies
-- File: supabase/rls_policies.sql
--
-- Run in Supabase SQL Editor (read-only until you paste and execute).
-- All policies use get_user_role() which reads user_profiles for the
-- current auth.uid() — no SECURITY DEFINER needed on policies.
--
-- Pattern used throughout:
--   SELECT  → USING (get_user_role() = ANY(ARRAY[...]))
--   INSERT  → WITH CHECK (get_user_role() = ANY(ARRAY[...]))
--   UPDATE  → USING (...) WITH CHECK (...)   (same expression for both)
--   DELETE  → USING (get_user_role() = ANY(ARRAY[...]))
-- ============================================================


-- ============================================================
-- 1. FINANCIAL TABLES
--    bank_accounts, bank_transactions, bank_reconciliations,
--    income_records, receipts
--    SELECT : md, accountant, board_member, ico
--    INSERT/UPDATE : md, accountant
--    DELETE : md only
-- ============================================================

-- TABLE: bank_accounts
ALTER TABLE bank_accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "bank_accounts_select" ON bank_accounts;
CREATE POLICY "bank_accounts_select" ON bank_accounts
  FOR SELECT USING (get_user_role() = ANY(ARRAY['md','accountant','board_member','ico']));
DROP POLICY IF EXISTS "bank_accounts_insert" ON bank_accounts;
CREATE POLICY "bank_accounts_insert" ON bank_accounts
  FOR INSERT WITH CHECK (get_user_role() = ANY(ARRAY['md','accountant']));
DROP POLICY IF EXISTS "bank_accounts_update" ON bank_accounts;
CREATE POLICY "bank_accounts_update" ON bank_accounts
  FOR UPDATE USING (get_user_role() = ANY(ARRAY['md','accountant']))
             WITH CHECK (get_user_role() = ANY(ARRAY['md','accountant']));
DROP POLICY IF EXISTS "bank_accounts_delete" ON bank_accounts;
CREATE POLICY "bank_accounts_delete" ON bank_accounts
  FOR DELETE USING (get_user_role() = ANY(ARRAY['md']));

-- TABLE: bank_transactions
ALTER TABLE bank_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "bank_transactions_select" ON bank_transactions;
CREATE POLICY "bank_transactions_select" ON bank_transactions
  FOR SELECT USING (get_user_role() = ANY(ARRAY['md','accountant','board_member','ico']));
DROP POLICY IF EXISTS "bank_transactions_insert" ON bank_transactions;
CREATE POLICY "bank_transactions_insert" ON bank_transactions
  FOR INSERT WITH CHECK (get_user_role() = ANY(ARRAY['md','accountant']));
DROP POLICY IF EXISTS "bank_transactions_update" ON bank_transactions;
CREATE POLICY "bank_transactions_update" ON bank_transactions
  FOR UPDATE USING (get_user_role() = ANY(ARRAY['md','accountant']))
             WITH CHECK (get_user_role() = ANY(ARRAY['md','accountant']));
DROP POLICY IF EXISTS "bank_transactions_delete" ON bank_transactions;
CREATE POLICY "bank_transactions_delete" ON bank_transactions
  FOR DELETE USING (get_user_role() = ANY(ARRAY['md']));

-- TABLE: bank_reconciliations
ALTER TABLE bank_reconciliations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "bank_reconciliations_select" ON bank_reconciliations;
CREATE POLICY "bank_reconciliations_select" ON bank_reconciliations
  FOR SELECT USING (get_user_role() = ANY(ARRAY['md','accountant','board_member','ico']));
DROP POLICY IF EXISTS "bank_reconciliations_insert" ON bank_reconciliations;
CREATE POLICY "bank_reconciliations_insert" ON bank_reconciliations
  FOR INSERT WITH CHECK (get_user_role() = ANY(ARRAY['md','accountant']));
DROP POLICY IF EXISTS "bank_reconciliations_update" ON bank_reconciliations;
CREATE POLICY "bank_reconciliations_update" ON bank_reconciliations
  FOR UPDATE USING (get_user_role() = ANY(ARRAY['md','accountant']))
             WITH CHECK (get_user_role() = ANY(ARRAY['md','accountant']));
DROP POLICY IF EXISTS "bank_reconciliations_delete" ON bank_reconciliations;
CREATE POLICY "bank_reconciliations_delete" ON bank_reconciliations
  FOR DELETE USING (get_user_role() = ANY(ARRAY['md']));

-- TABLE: income_records
ALTER TABLE income_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "income_records_select" ON income_records;
CREATE POLICY "income_records_select" ON income_records
  FOR SELECT USING (get_user_role() = ANY(ARRAY['md','accountant','board_member','ico']));
DROP POLICY IF EXISTS "income_records_insert" ON income_records;
CREATE POLICY "income_records_insert" ON income_records
  FOR INSERT WITH CHECK (get_user_role() = ANY(ARRAY['md','accountant']));
DROP POLICY IF EXISTS "income_records_update" ON income_records;
CREATE POLICY "income_records_update" ON income_records
  FOR UPDATE USING (get_user_role() = ANY(ARRAY['md','accountant']))
             WITH CHECK (get_user_role() = ANY(ARRAY['md','accountant']));
DROP POLICY IF EXISTS "income_records_delete" ON income_records;
CREATE POLICY "income_records_delete" ON income_records
  FOR DELETE USING (get_user_role() = ANY(ARRAY['md']));

-- TABLE: receipts
ALTER TABLE receipts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "receipts_select" ON receipts;
CREATE POLICY "receipts_select" ON receipts
  FOR SELECT USING (get_user_role() = ANY(ARRAY['md','accountant','board_member','ico']));
DROP POLICY IF EXISTS "receipts_insert" ON receipts;
CREATE POLICY "receipts_insert" ON receipts
  FOR INSERT WITH CHECK (get_user_role() = ANY(ARRAY['md','accountant']));
DROP POLICY IF EXISTS "receipts_update" ON receipts;
CREATE POLICY "receipts_update" ON receipts
  FOR UPDATE USING (get_user_role() = ANY(ARRAY['md','accountant']))
             WITH CHECK (get_user_role() = ANY(ARRAY['md','accountant']));
DROP POLICY IF EXISTS "receipts_delete" ON receipts;
CREATE POLICY "receipts_delete" ON receipts
  FOR DELETE USING (get_user_role() = ANY(ARRAY['md']));


-- ============================================================
-- 2. PAYROLL TABLES
--    payroll_lines, payroll_runs
--    SELECT : md, accountant, board_member, ico, hr_officer
--    INSERT/UPDATE : md, accountant, hr_officer
--    DELETE : md only
-- ============================================================

-- TABLE: payroll_lines
ALTER TABLE payroll_lines ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "payroll_lines_select" ON payroll_lines;
CREATE POLICY "payroll_lines_select" ON payroll_lines
  FOR SELECT USING (get_user_role() = ANY(ARRAY['md','accountant','board_member','ico','hr_officer']));
DROP POLICY IF EXISTS "payroll_lines_insert" ON payroll_lines;
CREATE POLICY "payroll_lines_insert" ON payroll_lines
  FOR INSERT WITH CHECK (get_user_role() = ANY(ARRAY['md','accountant','hr_officer']));
DROP POLICY IF EXISTS "payroll_lines_update" ON payroll_lines;
CREATE POLICY "payroll_lines_update" ON payroll_lines
  FOR UPDATE USING (get_user_role() = ANY(ARRAY['md','accountant','hr_officer']))
             WITH CHECK (get_user_role() = ANY(ARRAY['md','accountant','hr_officer']));
DROP POLICY IF EXISTS "payroll_lines_delete" ON payroll_lines;
CREATE POLICY "payroll_lines_delete" ON payroll_lines
  FOR DELETE USING (get_user_role() = ANY(ARRAY['md']));

-- TABLE: payroll_runs
ALTER TABLE payroll_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "payroll_runs_select" ON payroll_runs;
CREATE POLICY "payroll_runs_select" ON payroll_runs
  FOR SELECT USING (get_user_role() = ANY(ARRAY['md','accountant','board_member','ico','hr_officer']));
DROP POLICY IF EXISTS "payroll_runs_insert" ON payroll_runs;
CREATE POLICY "payroll_runs_insert" ON payroll_runs
  FOR INSERT WITH CHECK (get_user_role() = ANY(ARRAY['md','accountant','hr_officer']));
DROP POLICY IF EXISTS "payroll_runs_update" ON payroll_runs;
CREATE POLICY "payroll_runs_update" ON payroll_runs
  FOR UPDATE USING (get_user_role() = ANY(ARRAY['md','accountant','hr_officer']))
             WITH CHECK (get_user_role() = ANY(ARRAY['md','accountant','hr_officer']));
DROP POLICY IF EXISTS "payroll_runs_delete" ON payroll_runs;
CREATE POLICY "payroll_runs_delete" ON payroll_runs
  FOR DELETE USING (get_user_role() = ANY(ARRAY['md']));


-- ============================================================
-- 3. EXPENSES
--    expenses, financial_adjustments, opening_balances,
--    opening_balance_history
--    SELECT : md, accountant, board_member, ico
--    INSERT/UPDATE : md, accountant
--    DELETE : md only
-- ============================================================

-- TABLE: expenses
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "expenses_select" ON expenses;
CREATE POLICY "expenses_select" ON expenses
  FOR SELECT USING (get_user_role() = ANY(ARRAY['md','accountant','board_member','ico']));
DROP POLICY IF EXISTS "expenses_insert" ON expenses;
CREATE POLICY "expenses_insert" ON expenses
  FOR INSERT WITH CHECK (get_user_role() = ANY(ARRAY['md','accountant']));
DROP POLICY IF EXISTS "expenses_update" ON expenses;
CREATE POLICY "expenses_update" ON expenses
  FOR UPDATE USING (get_user_role() = ANY(ARRAY['md','accountant']))
             WITH CHECK (get_user_role() = ANY(ARRAY['md','accountant']));
DROP POLICY IF EXISTS "expenses_delete" ON expenses;
CREATE POLICY "expenses_delete" ON expenses
  FOR DELETE USING (get_user_role() = ANY(ARRAY['md']));

-- TABLE: financial_adjustments
ALTER TABLE financial_adjustments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "financial_adjustments_select" ON financial_adjustments;
CREATE POLICY "financial_adjustments_select" ON financial_adjustments
  FOR SELECT USING (get_user_role() = ANY(ARRAY['md','accountant','board_member','ico']));
DROP POLICY IF EXISTS "financial_adjustments_insert" ON financial_adjustments;
CREATE POLICY "financial_adjustments_insert" ON financial_adjustments
  FOR INSERT WITH CHECK (get_user_role() = ANY(ARRAY['md','accountant']));
DROP POLICY IF EXISTS "financial_adjustments_update" ON financial_adjustments;
CREATE POLICY "financial_adjustments_update" ON financial_adjustments
  FOR UPDATE USING (get_user_role() = ANY(ARRAY['md','accountant']))
             WITH CHECK (get_user_role() = ANY(ARRAY['md','accountant']));
DROP POLICY IF EXISTS "financial_adjustments_delete" ON financial_adjustments;
CREATE POLICY "financial_adjustments_delete" ON financial_adjustments
  FOR DELETE USING (get_user_role() = ANY(ARRAY['md']));

-- TABLE: opening_balances
ALTER TABLE opening_balances ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "opening_balances_select" ON opening_balances;
CREATE POLICY "opening_balances_select" ON opening_balances
  FOR SELECT USING (get_user_role() = ANY(ARRAY['md','accountant','board_member','ico']));
DROP POLICY IF EXISTS "opening_balances_insert" ON opening_balances;
CREATE POLICY "opening_balances_insert" ON opening_balances
  FOR INSERT WITH CHECK (get_user_role() = ANY(ARRAY['md','accountant']));
DROP POLICY IF EXISTS "opening_balances_update" ON opening_balances;
CREATE POLICY "opening_balances_update" ON opening_balances
  FOR UPDATE USING (get_user_role() = ANY(ARRAY['md','accountant']))
             WITH CHECK (get_user_role() = ANY(ARRAY['md','accountant']));
DROP POLICY IF EXISTS "opening_balances_delete" ON opening_balances;
CREATE POLICY "opening_balances_delete" ON opening_balances
  FOR DELETE USING (get_user_role() = ANY(ARRAY['md']));

-- TABLE: opening_balance_history
ALTER TABLE opening_balance_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "opening_balance_history_select" ON opening_balance_history;
CREATE POLICY "opening_balance_history_select" ON opening_balance_history
  FOR SELECT USING (get_user_role() = ANY(ARRAY['md','accountant','board_member','ico']));
DROP POLICY IF EXISTS "opening_balance_history_insert" ON opening_balance_history;
CREATE POLICY "opening_balance_history_insert" ON opening_balance_history
  FOR INSERT WITH CHECK (get_user_role() = ANY(ARRAY['md','accountant']));
DROP POLICY IF EXISTS "opening_balance_history_update" ON opening_balance_history;
CREATE POLICY "opening_balance_history_update" ON opening_balance_history
  FOR UPDATE USING (get_user_role() = ANY(ARRAY['md','accountant']))
             WITH CHECK (get_user_role() = ANY(ARRAY['md','accountant']));
DROP POLICY IF EXISTS "opening_balance_history_delete" ON opening_balance_history;
CREATE POLICY "opening_balance_history_delete" ON opening_balance_history
  FOR DELETE USING (get_user_role() = ANY(ARRAY['md']));


-- ============================================================
-- 4. STAFF / HR TABLES
--    staff, staff_documents, attendance
--    SELECT : md, hr_officer, ico, board_member,
--             production_manager, assistant_production_manager
--    INSERT/UPDATE : md, hr_officer
--    DELETE : md only
--    (staff_roles is in section 13 — Reference/Lookup)
-- ============================================================

-- TABLE: staff
ALTER TABLE staff ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "staff_select" ON staff;
CREATE POLICY "staff_select" ON staff
  FOR SELECT USING (get_user_role() = ANY(ARRAY['md','hr_officer','ico','board_member','production_manager','assistant_production_manager']));
DROP POLICY IF EXISTS "staff_insert" ON staff;
CREATE POLICY "staff_insert" ON staff
  FOR INSERT WITH CHECK (get_user_role() = ANY(ARRAY['md','hr_officer']));
DROP POLICY IF EXISTS "staff_update" ON staff;
CREATE POLICY "staff_update" ON staff
  FOR UPDATE USING (get_user_role() = ANY(ARRAY['md','hr_officer']))
             WITH CHECK (get_user_role() = ANY(ARRAY['md','hr_officer']));
DROP POLICY IF EXISTS "staff_delete" ON staff;
CREATE POLICY "staff_delete" ON staff
  FOR DELETE USING (get_user_role() = ANY(ARRAY['md']));

-- TABLE: staff_documents
ALTER TABLE staff_documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "staff_documents_select" ON staff_documents;
CREATE POLICY "staff_documents_select" ON staff_documents
  FOR SELECT USING (get_user_role() = ANY(ARRAY['md','hr_officer','ico','board_member','production_manager','assistant_production_manager']));
DROP POLICY IF EXISTS "staff_documents_insert" ON staff_documents;
CREATE POLICY "staff_documents_insert" ON staff_documents
  FOR INSERT WITH CHECK (get_user_role() = ANY(ARRAY['md','hr_officer']));
DROP POLICY IF EXISTS "staff_documents_update" ON staff_documents;
CREATE POLICY "staff_documents_update" ON staff_documents
  FOR UPDATE USING (get_user_role() = ANY(ARRAY['md','hr_officer']))
             WITH CHECK (get_user_role() = ANY(ARRAY['md','hr_officer']));
DROP POLICY IF EXISTS "staff_documents_delete" ON staff_documents;
CREATE POLICY "staff_documents_delete" ON staff_documents
  FOR DELETE USING (get_user_role() = ANY(ARRAY['md']));

-- TABLE: attendance
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "attendance_select" ON attendance;
CREATE POLICY "attendance_select" ON attendance
  FOR SELECT USING (get_user_role() = ANY(ARRAY['md','hr_officer','ico','board_member','production_manager','assistant_production_manager']));
DROP POLICY IF EXISTS "attendance_insert" ON attendance;
CREATE POLICY "attendance_insert" ON attendance
  FOR INSERT WITH CHECK (get_user_role() = ANY(ARRAY['md','hr_officer']));
DROP POLICY IF EXISTS "attendance_update" ON attendance;
CREATE POLICY "attendance_update" ON attendance
  FOR UPDATE USING (get_user_role() = ANY(ARRAY['md','hr_officer']))
             WITH CHECK (get_user_role() = ANY(ARRAY['md','hr_officer']));
DROP POLICY IF EXISTS "attendance_delete" ON attendance;
CREATE POLICY "attendance_delete" ON attendance
  FOR DELETE USING (get_user_role() = ANY(ARRAY['md']));


-- ============================================================
-- 5. ORDERS / INVOICING
--    orders, order_items, invoices, payments
--    SELECT : md, accountant, board_member, ico, bdm, marketer
--    INSERT/UPDATE : md, accountant, bdm, marketer
--    DELETE : md only
-- ============================================================

-- TABLE: orders
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "orders_select" ON orders;
CREATE POLICY "orders_select" ON orders
  FOR SELECT USING (
    get_user_role() = ANY(ARRAY['md','accountant','board_member','ico','bdm'])
    OR (
      get_user_role() = 'marketer'
      AND marketer_id = (SELECT id FROM staff WHERE email = (SELECT email FROM auth.users WHERE id = auth.uid()))
    )
  );
DROP POLICY IF EXISTS "orders_insert" ON orders;
CREATE POLICY "orders_insert" ON orders
  FOR INSERT WITH CHECK (get_user_role() = ANY(ARRAY['md','accountant','bdm','marketer']));
DROP POLICY IF EXISTS "orders_update" ON orders;
CREATE POLICY "orders_update" ON orders
  FOR UPDATE USING (get_user_role() = ANY(ARRAY['md','accountant','bdm','marketer']))
             WITH CHECK (get_user_role() = ANY(ARRAY['md','accountant','bdm','marketer']));
DROP POLICY IF EXISTS "orders_delete" ON orders;
CREATE POLICY "orders_delete" ON orders
  FOR DELETE USING (get_user_role() = ANY(ARRAY['md']));

-- TABLE: order_items
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "order_items_select" ON order_items;
CREATE POLICY "order_items_select" ON order_items
  FOR SELECT USING (get_user_role() = ANY(ARRAY['md','accountant','board_member','ico','bdm','marketer']));
DROP POLICY IF EXISTS "order_items_insert" ON order_items;
CREATE POLICY "order_items_insert" ON order_items
  FOR INSERT WITH CHECK (get_user_role() = ANY(ARRAY['md','accountant','bdm','marketer']));
DROP POLICY IF EXISTS "order_items_update" ON order_items;
CREATE POLICY "order_items_update" ON order_items
  FOR UPDATE USING (get_user_role() = ANY(ARRAY['md','accountant','bdm','marketer']))
             WITH CHECK (get_user_role() = ANY(ARRAY['md','accountant','bdm','marketer']));
DROP POLICY IF EXISTS "order_items_delete" ON order_items;
CREATE POLICY "order_items_delete" ON order_items
  FOR DELETE USING (get_user_role() = ANY(ARRAY['md']));

-- TABLE: invoices
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "invoices_select" ON invoices;
CREATE POLICY "invoices_select" ON invoices
  FOR SELECT USING (get_user_role() = ANY(ARRAY['md','accountant','board_member','ico','bdm','marketer']));
DROP POLICY IF EXISTS "invoices_insert" ON invoices;
CREATE POLICY "invoices_insert" ON invoices
  FOR INSERT WITH CHECK (get_user_role() = ANY(ARRAY['md','accountant','bdm','marketer']));
DROP POLICY IF EXISTS "invoices_update" ON invoices;
CREATE POLICY "invoices_update" ON invoices
  FOR UPDATE USING (get_user_role() = ANY(ARRAY['md','accountant','bdm','marketer']))
             WITH CHECK (get_user_role() = ANY(ARRAY['md','accountant','bdm','marketer']));
DROP POLICY IF EXISTS "invoices_delete" ON invoices;
CREATE POLICY "invoices_delete" ON invoices
  FOR DELETE USING (get_user_role() = ANY(ARRAY['md']));

-- TABLE: payments
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "payments_select" ON payments;
CREATE POLICY "payments_select" ON payments
  FOR SELECT USING (get_user_role() = ANY(ARRAY['md','accountant','board_member','ico','bdm','marketer']));
DROP POLICY IF EXISTS "payments_insert" ON payments;
CREATE POLICY "payments_insert" ON payments
  FOR INSERT WITH CHECK (get_user_role() = ANY(ARRAY['md','accountant','bdm','marketer']));
DROP POLICY IF EXISTS "payments_update" ON payments;
CREATE POLICY "payments_update" ON payments
  FOR UPDATE USING (get_user_role() = ANY(ARRAY['md','accountant','bdm','marketer']))
             WITH CHECK (get_user_role() = ANY(ARRAY['md','accountant','bdm','marketer']));
DROP POLICY IF EXISTS "payments_delete" ON payments;
CREATE POLICY "payments_delete" ON payments
  FOR DELETE USING (get_user_role() = ANY(ARRAY['md']));


-- ============================================================
-- 6. VEHICLES / FLEET
--    vehicles, vehicle_documents, vehicle_fuel_log,
--    vehicle_maintenance
--    SELECT : md, board_member, ico, logistics_manager,
--             store_officer, driver
--    INSERT/UPDATE : md, logistics_manager
--    DELETE : md only
-- ============================================================

-- TABLE: vehicles
ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "vehicles_select" ON vehicles;
CREATE POLICY "vehicles_select" ON vehicles
  FOR SELECT USING (get_user_role() = ANY(ARRAY['md','board_member','ico','logistics_manager','store_officer','driver']));
DROP POLICY IF EXISTS "vehicles_insert" ON vehicles;
CREATE POLICY "vehicles_insert" ON vehicles
  FOR INSERT WITH CHECK (get_user_role() = ANY(ARRAY['md','logistics_manager']));
DROP POLICY IF EXISTS "vehicles_update" ON vehicles;
CREATE POLICY "vehicles_update" ON vehicles
  FOR UPDATE USING (get_user_role() = ANY(ARRAY['md','logistics_manager']))
             WITH CHECK (get_user_role() = ANY(ARRAY['md','logistics_manager']));
DROP POLICY IF EXISTS "vehicles_delete" ON vehicles;
CREATE POLICY "vehicles_delete" ON vehicles
  FOR DELETE USING (get_user_role() = ANY(ARRAY['md']));

-- TABLE: vehicle_documents
ALTER TABLE vehicle_documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "vehicle_documents_select" ON vehicle_documents;
CREATE POLICY "vehicle_documents_select" ON vehicle_documents
  FOR SELECT USING (get_user_role() = ANY(ARRAY['md','board_member','ico','logistics_manager','store_officer','driver']));
DROP POLICY IF EXISTS "vehicle_documents_insert" ON vehicle_documents;
CREATE POLICY "vehicle_documents_insert" ON vehicle_documents
  FOR INSERT WITH CHECK (get_user_role() = ANY(ARRAY['md','logistics_manager']));
DROP POLICY IF EXISTS "vehicle_documents_update" ON vehicle_documents;
CREATE POLICY "vehicle_documents_update" ON vehicle_documents
  FOR UPDATE USING (get_user_role() = ANY(ARRAY['md','logistics_manager']))
             WITH CHECK (get_user_role() = ANY(ARRAY['md','logistics_manager']));
DROP POLICY IF EXISTS "vehicle_documents_delete" ON vehicle_documents;
CREATE POLICY "vehicle_documents_delete" ON vehicle_documents
  FOR DELETE USING (get_user_role() = ANY(ARRAY['md']));

-- TABLE: vehicle_fuel_log
ALTER TABLE vehicle_fuel_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "vehicle_fuel_log_select" ON vehicle_fuel_log;
CREATE POLICY "vehicle_fuel_log_select" ON vehicle_fuel_log
  FOR SELECT USING (get_user_role() = ANY(ARRAY['md','board_member','ico','logistics_manager','store_officer','driver']));
DROP POLICY IF EXISTS "vehicle_fuel_log_insert" ON vehicle_fuel_log;
CREATE POLICY "vehicle_fuel_log_insert" ON vehicle_fuel_log
  FOR INSERT WITH CHECK (get_user_role() = ANY(ARRAY['md','logistics_manager']));
DROP POLICY IF EXISTS "vehicle_fuel_log_update" ON vehicle_fuel_log;
CREATE POLICY "vehicle_fuel_log_update" ON vehicle_fuel_log
  FOR UPDATE USING (get_user_role() = ANY(ARRAY['md','logistics_manager']))
             WITH CHECK (get_user_role() = ANY(ARRAY['md','logistics_manager']));
DROP POLICY IF EXISTS "vehicle_fuel_log_delete" ON vehicle_fuel_log;
CREATE POLICY "vehicle_fuel_log_delete" ON vehicle_fuel_log
  FOR DELETE USING (get_user_role() = ANY(ARRAY['md']));

-- TABLE: vehicle_maintenance
ALTER TABLE vehicle_maintenance ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "vehicle_maintenance_select" ON vehicle_maintenance;
CREATE POLICY "vehicle_maintenance_select" ON vehicle_maintenance
  FOR SELECT USING (get_user_role() = ANY(ARRAY['md','board_member','ico','logistics_manager','store_officer','driver']));
DROP POLICY IF EXISTS "vehicle_maintenance_insert" ON vehicle_maintenance;
CREATE POLICY "vehicle_maintenance_insert" ON vehicle_maintenance
  FOR INSERT WITH CHECK (get_user_role() = ANY(ARRAY['md','logistics_manager']));
DROP POLICY IF EXISTS "vehicle_maintenance_update" ON vehicle_maintenance;
CREATE POLICY "vehicle_maintenance_update" ON vehicle_maintenance
  FOR UPDATE USING (get_user_role() = ANY(ARRAY['md','logistics_manager']))
             WITH CHECK (get_user_role() = ANY(ARRAY['md','logistics_manager']));
DROP POLICY IF EXISTS "vehicle_maintenance_delete" ON vehicle_maintenance;
CREATE POLICY "vehicle_maintenance_delete" ON vehicle_maintenance
  FOR DELETE USING (get_user_role() = ANY(ARRAY['md']));


-- ============================================================
-- 7. SUPPLIERS
--    suppliers, supplier_documents, supplier_transactions
--    SELECT : md, accountant, board_member, ico
--    INSERT/UPDATE : md, accountant
--    DELETE : md only
-- ============================================================

-- TABLE: suppliers
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "suppliers_select" ON suppliers;
CREATE POLICY "suppliers_select" ON suppliers
  FOR SELECT USING (get_user_role() = ANY(ARRAY['md','accountant','board_member','ico']));
DROP POLICY IF EXISTS "suppliers_insert" ON suppliers;
CREATE POLICY "suppliers_insert" ON suppliers
  FOR INSERT WITH CHECK (get_user_role() = ANY(ARRAY['md','accountant']));
DROP POLICY IF EXISTS "suppliers_update" ON suppliers;
CREATE POLICY "suppliers_update" ON suppliers
  FOR UPDATE USING (get_user_role() = ANY(ARRAY['md','accountant']))
             WITH CHECK (get_user_role() = ANY(ARRAY['md','accountant']));
DROP POLICY IF EXISTS "suppliers_delete" ON suppliers;
CREATE POLICY "suppliers_delete" ON suppliers
  FOR DELETE USING (get_user_role() = ANY(ARRAY['md']));

-- TABLE: supplier_documents
ALTER TABLE supplier_documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "supplier_documents_select" ON supplier_documents;
CREATE POLICY "supplier_documents_select" ON supplier_documents
  FOR SELECT USING (get_user_role() = ANY(ARRAY['md','accountant','board_member','ico']));
DROP POLICY IF EXISTS "supplier_documents_insert" ON supplier_documents;
CREATE POLICY "supplier_documents_insert" ON supplier_documents
  FOR INSERT WITH CHECK (get_user_role() = ANY(ARRAY['md','accountant']));
DROP POLICY IF EXISTS "supplier_documents_update" ON supplier_documents;
CREATE POLICY "supplier_documents_update" ON supplier_documents
  FOR UPDATE USING (get_user_role() = ANY(ARRAY['md','accountant']))
             WITH CHECK (get_user_role() = ANY(ARRAY['md','accountant']));
DROP POLICY IF EXISTS "supplier_documents_delete" ON supplier_documents;
CREATE POLICY "supplier_documents_delete" ON supplier_documents
  FOR DELETE USING (get_user_role() = ANY(ARRAY['md']));

-- TABLE: supplier_transactions
ALTER TABLE supplier_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "supplier_transactions_select" ON supplier_transactions;
CREATE POLICY "supplier_transactions_select" ON supplier_transactions
  FOR SELECT USING (get_user_role() = ANY(ARRAY['md','accountant','board_member','ico']));
DROP POLICY IF EXISTS "supplier_transactions_insert" ON supplier_transactions;
CREATE POLICY "supplier_transactions_insert" ON supplier_transactions
  FOR INSERT WITH CHECK (get_user_role() = ANY(ARRAY['md','accountant']));
DROP POLICY IF EXISTS "supplier_transactions_update" ON supplier_transactions;
CREATE POLICY "supplier_transactions_update" ON supplier_transactions
  FOR UPDATE USING (get_user_role() = ANY(ARRAY['md','accountant']))
             WITH CHECK (get_user_role() = ANY(ARRAY['md','accountant']));
DROP POLICY IF EXISTS "supplier_transactions_delete" ON supplier_transactions;
CREATE POLICY "supplier_transactions_delete" ON supplier_transactions
  FOR DELETE USING (get_user_role() = ANY(ARRAY['md']));


-- ============================================================
-- 8. WAYBILLS
--    SELECT : md, board_member, ico, logistics_manager,
--             store_officer, driver, production_manager,
--             assistant_production_manager
--    INSERT/UPDATE : md, logistics_manager, store_officer
--    DELETE : md only
-- ============================================================

-- TABLE: waybills
ALTER TABLE waybills ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "waybills_select" ON waybills;
CREATE POLICY "waybills_select" ON waybills
  FOR SELECT USING (get_user_role() = ANY(ARRAY['md','board_member','ico','logistics_manager','store_officer','driver','production_manager','assistant_production_manager']));
DROP POLICY IF EXISTS "waybills_insert" ON waybills;
CREATE POLICY "waybills_insert" ON waybills
  FOR INSERT WITH CHECK (get_user_role() = ANY(ARRAY['md','logistics_manager','store_officer']));
DROP POLICY IF EXISTS "waybills_update" ON waybills;
CREATE POLICY "waybills_update" ON waybills
  FOR UPDATE USING (get_user_role() = ANY(ARRAY['md','logistics_manager','store_officer']))
             WITH CHECK (get_user_role() = ANY(ARRAY['md','logistics_manager','store_officer']));
DROP POLICY IF EXISTS "waybills_delete" ON waybills;
CREATE POLICY "waybills_delete" ON waybills
  FOR DELETE USING (get_user_role() = ANY(ARRAY['md']));


-- ============================================================
-- 9. LABOUR
--    labour_pool, labour_roles, labour_rate_change_requests,
--    weekly_labour_payroll, daily_roster, daily_roster_entries,
--    truck_loading_log, truck_loading_loaders,
--    truck_loader_assignments
--    SELECT : md, board_member, ico, production_manager,
--             assistant_production_manager, hr_officer,
--             logistics_manager
--    INSERT/UPDATE : md, production_manager,
--                    assistant_production_manager, hr_officer,
--                    logistics_manager, ico
--    DELETE : md only
-- ============================================================

-- TABLE: labour_pool
ALTER TABLE labour_pool ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "labour_pool_select" ON labour_pool;
CREATE POLICY "labour_pool_select" ON labour_pool
  FOR SELECT USING (get_user_role() = ANY(ARRAY['md','board_member','ico','production_manager','assistant_production_manager','hr_officer','logistics_manager']));
DROP POLICY IF EXISTS "labour_pool_insert" ON labour_pool;
CREATE POLICY "labour_pool_insert" ON labour_pool
  FOR INSERT WITH CHECK (get_user_role() = ANY(ARRAY['md','production_manager','assistant_production_manager','hr_officer','logistics_manager','ico']));
DROP POLICY IF EXISTS "labour_pool_update" ON labour_pool;
CREATE POLICY "labour_pool_update" ON labour_pool
  FOR UPDATE USING (get_user_role() = ANY(ARRAY['md','production_manager','assistant_production_manager','hr_officer','logistics_manager','ico']))
             WITH CHECK (get_user_role() = ANY(ARRAY['md','production_manager','assistant_production_manager','hr_officer','logistics_manager','ico']));
DROP POLICY IF EXISTS "labour_pool_delete" ON labour_pool;
CREATE POLICY "labour_pool_delete" ON labour_pool
  FOR DELETE USING (get_user_role() = ANY(ARRAY['md']));

-- TABLE: labour_roles
ALTER TABLE labour_roles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "labour_roles_select" ON labour_roles;
CREATE POLICY "labour_roles_select" ON labour_roles
  FOR SELECT USING (get_user_role() = ANY(ARRAY['md','board_member','ico','production_manager','assistant_production_manager','hr_officer','logistics_manager']));
DROP POLICY IF EXISTS "labour_roles_insert" ON labour_roles;
CREATE POLICY "labour_roles_insert" ON labour_roles
  FOR INSERT WITH CHECK (get_user_role() = ANY(ARRAY['md','production_manager','assistant_production_manager','hr_officer','logistics_manager','ico']));
DROP POLICY IF EXISTS "labour_roles_update" ON labour_roles;
CREATE POLICY "labour_roles_update" ON labour_roles
  FOR UPDATE USING (get_user_role() = ANY(ARRAY['md','production_manager','assistant_production_manager','hr_officer','logistics_manager','ico']))
             WITH CHECK (get_user_role() = ANY(ARRAY['md','production_manager','assistant_production_manager','hr_officer','logistics_manager','ico']));
DROP POLICY IF EXISTS "labour_roles_delete" ON labour_roles;
CREATE POLICY "labour_roles_delete" ON labour_roles
  FOR DELETE USING (get_user_role() = ANY(ARRAY['md']));

-- TABLE: labour_rate_change_requests
ALTER TABLE labour_rate_change_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "labour_rate_change_requests_select" ON labour_rate_change_requests;
CREATE POLICY "labour_rate_change_requests_select" ON labour_rate_change_requests
  FOR SELECT USING (get_user_role() = ANY(ARRAY['md','board_member','ico','production_manager','assistant_production_manager','hr_officer','logistics_manager']));
DROP POLICY IF EXISTS "labour_rate_change_requests_insert" ON labour_rate_change_requests;
CREATE POLICY "labour_rate_change_requests_insert" ON labour_rate_change_requests
  FOR INSERT WITH CHECK (get_user_role() = ANY(ARRAY['md','production_manager','assistant_production_manager','hr_officer','logistics_manager','ico']));
DROP POLICY IF EXISTS "labour_rate_change_requests_update" ON labour_rate_change_requests;
CREATE POLICY "labour_rate_change_requests_update" ON labour_rate_change_requests
  FOR UPDATE USING (get_user_role() = ANY(ARRAY['md','production_manager','assistant_production_manager','hr_officer','logistics_manager','ico']))
             WITH CHECK (get_user_role() = ANY(ARRAY['md','production_manager','assistant_production_manager','hr_officer','logistics_manager','ico']));
DROP POLICY IF EXISTS "labour_rate_change_requests_delete" ON labour_rate_change_requests;
CREATE POLICY "labour_rate_change_requests_delete" ON labour_rate_change_requests
  FOR DELETE USING (get_user_role() = ANY(ARRAY['md']));

-- TABLE: weekly_labour_payroll
ALTER TABLE weekly_labour_payroll ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "weekly_labour_payroll_select" ON weekly_labour_payroll;
CREATE POLICY "weekly_labour_payroll_select" ON weekly_labour_payroll
  FOR SELECT USING (get_user_role() = ANY(ARRAY['md','board_member','ico','production_manager','assistant_production_manager','hr_officer','logistics_manager']));
DROP POLICY IF EXISTS "weekly_labour_payroll_insert" ON weekly_labour_payroll;
CREATE POLICY "weekly_labour_payroll_insert" ON weekly_labour_payroll
  FOR INSERT WITH CHECK (get_user_role() = ANY(ARRAY['md','production_manager','assistant_production_manager','hr_officer','logistics_manager','ico']));
DROP POLICY IF EXISTS "weekly_labour_payroll_update" ON weekly_labour_payroll;
CREATE POLICY "weekly_labour_payroll_update" ON weekly_labour_payroll
  FOR UPDATE USING (get_user_role() = ANY(ARRAY['md','production_manager','assistant_production_manager','hr_officer','logistics_manager','ico']))
             WITH CHECK (get_user_role() = ANY(ARRAY['md','production_manager','assistant_production_manager','hr_officer','logistics_manager','ico']));
DROP POLICY IF EXISTS "weekly_labour_payroll_delete" ON weekly_labour_payroll;
CREATE POLICY "weekly_labour_payroll_delete" ON weekly_labour_payroll
  FOR DELETE USING (get_user_role() = ANY(ARRAY['md']));

-- TABLE: daily_roster
ALTER TABLE daily_roster ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "daily_roster_select" ON daily_roster;
CREATE POLICY "daily_roster_select" ON daily_roster
  FOR SELECT USING (get_user_role() = ANY(ARRAY['md','board_member','ico','production_manager','assistant_production_manager','hr_officer','logistics_manager']));
DROP POLICY IF EXISTS "daily_roster_insert" ON daily_roster;
CREATE POLICY "daily_roster_insert" ON daily_roster
  FOR INSERT WITH CHECK (get_user_role() = ANY(ARRAY['md','production_manager','assistant_production_manager','hr_officer','logistics_manager','ico']));
DROP POLICY IF EXISTS "daily_roster_update" ON daily_roster;
CREATE POLICY "daily_roster_update" ON daily_roster
  FOR UPDATE USING (get_user_role() = ANY(ARRAY['md','production_manager','assistant_production_manager','hr_officer','logistics_manager','ico']))
             WITH CHECK (get_user_role() = ANY(ARRAY['md','production_manager','assistant_production_manager','hr_officer','logistics_manager','ico']));
DROP POLICY IF EXISTS "daily_roster_delete" ON daily_roster;
CREATE POLICY "daily_roster_delete" ON daily_roster
  FOR DELETE USING (get_user_role() = ANY(ARRAY['md']));

-- TABLE: daily_roster_entries
ALTER TABLE daily_roster_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "daily_roster_entries_select" ON daily_roster_entries;
CREATE POLICY "daily_roster_entries_select" ON daily_roster_entries
  FOR SELECT USING (get_user_role() = ANY(ARRAY['md','board_member','ico','production_manager','assistant_production_manager','hr_officer','logistics_manager']));
DROP POLICY IF EXISTS "daily_roster_entries_insert" ON daily_roster_entries;
CREATE POLICY "daily_roster_entries_insert" ON daily_roster_entries
  FOR INSERT WITH CHECK (get_user_role() = ANY(ARRAY['md','production_manager','assistant_production_manager','hr_officer','logistics_manager','ico']));
DROP POLICY IF EXISTS "daily_roster_entries_update" ON daily_roster_entries;
CREATE POLICY "daily_roster_entries_update" ON daily_roster_entries
  FOR UPDATE USING (get_user_role() = ANY(ARRAY['md','production_manager','assistant_production_manager','hr_officer','logistics_manager','ico']))
             WITH CHECK (get_user_role() = ANY(ARRAY['md','production_manager','assistant_production_manager','hr_officer','logistics_manager','ico']));
DROP POLICY IF EXISTS "daily_roster_entries_delete" ON daily_roster_entries;
CREATE POLICY "daily_roster_entries_delete" ON daily_roster_entries
  FOR DELETE USING (get_user_role() = ANY(ARRAY['md']));

-- TABLE: truck_loading_log
ALTER TABLE truck_loading_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "truck_loading_log_select" ON truck_loading_log;
CREATE POLICY "truck_loading_log_select" ON truck_loading_log
  FOR SELECT USING (get_user_role() = ANY(ARRAY['md','board_member','ico','production_manager','assistant_production_manager','hr_officer','logistics_manager']));
DROP POLICY IF EXISTS "truck_loading_log_insert" ON truck_loading_log;
CREATE POLICY "truck_loading_log_insert" ON truck_loading_log
  FOR INSERT WITH CHECK (get_user_role() = ANY(ARRAY['md','production_manager','assistant_production_manager','hr_officer','logistics_manager','ico']));
DROP POLICY IF EXISTS "truck_loading_log_update" ON truck_loading_log;
CREATE POLICY "truck_loading_log_update" ON truck_loading_log
  FOR UPDATE USING (get_user_role() = ANY(ARRAY['md','production_manager','assistant_production_manager','hr_officer','logistics_manager','ico']))
             WITH CHECK (get_user_role() = ANY(ARRAY['md','production_manager','assistant_production_manager','hr_officer','logistics_manager','ico']));
DROP POLICY IF EXISTS "truck_loading_log_delete" ON truck_loading_log;
CREATE POLICY "truck_loading_log_delete" ON truck_loading_log
  FOR DELETE USING (get_user_role() = ANY(ARRAY['md']));

-- TABLE: truck_loading_loaders
ALTER TABLE truck_loading_loaders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "truck_loading_loaders_select" ON truck_loading_loaders;
CREATE POLICY "truck_loading_loaders_select" ON truck_loading_loaders
  FOR SELECT USING (get_user_role() = ANY(ARRAY['md','board_member','ico','production_manager','assistant_production_manager','hr_officer','logistics_manager']));
DROP POLICY IF EXISTS "truck_loading_loaders_insert" ON truck_loading_loaders;
CREATE POLICY "truck_loading_loaders_insert" ON truck_loading_loaders
  FOR INSERT WITH CHECK (get_user_role() = ANY(ARRAY['md','production_manager','assistant_production_manager','hr_officer','logistics_manager','ico']));
DROP POLICY IF EXISTS "truck_loading_loaders_update" ON truck_loading_loaders;
CREATE POLICY "truck_loading_loaders_update" ON truck_loading_loaders
  FOR UPDATE USING (get_user_role() = ANY(ARRAY['md','production_manager','assistant_production_manager','hr_officer','logistics_manager','ico']))
             WITH CHECK (get_user_role() = ANY(ARRAY['md','production_manager','assistant_production_manager','hr_officer','logistics_manager','ico']));
DROP POLICY IF EXISTS "truck_loading_loaders_delete" ON truck_loading_loaders;
CREATE POLICY "truck_loading_loaders_delete" ON truck_loading_loaders
  FOR DELETE USING (get_user_role() = ANY(ARRAY['md']));

-- TABLE: truck_loader_assignments
ALTER TABLE truck_loader_assignments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "truck_loader_assignments_select" ON truck_loader_assignments;
CREATE POLICY "truck_loader_assignments_select" ON truck_loader_assignments
  FOR SELECT USING (get_user_role() = ANY(ARRAY['md','board_member','ico','production_manager','assistant_production_manager','hr_officer','logistics_manager']));
DROP POLICY IF EXISTS "truck_loader_assignments_insert" ON truck_loader_assignments;
CREATE POLICY "truck_loader_assignments_insert" ON truck_loader_assignments
  FOR INSERT WITH CHECK (get_user_role() = ANY(ARRAY['md','production_manager','assistant_production_manager','hr_officer','logistics_manager','ico']));
DROP POLICY IF EXISTS "truck_loader_assignments_update" ON truck_loader_assignments;
CREATE POLICY "truck_loader_assignments_update" ON truck_loader_assignments
  FOR UPDATE USING (get_user_role() = ANY(ARRAY['md','production_manager','assistant_production_manager','hr_officer','logistics_manager','ico']))
             WITH CHECK (get_user_role() = ANY(ARRAY['md','production_manager','assistant_production_manager','hr_officer','logistics_manager','ico']));
DROP POLICY IF EXISTS "truck_loader_assignments_delete" ON truck_loader_assignments;
CREATE POLICY "truck_loader_assignments_delete" ON truck_loader_assignments
  FOR DELETE USING (get_user_role() = ANY(ARRAY['md']));


-- ============================================================
-- 10. PRODUCTION / INVENTORY
--     production_log, batches, batch_production_links,
--     inventory_items, inventory_log, stock_movements,
--     finished_goods_stock, damage_log, production_targets
--     SELECT : md, board_member, ico, production_manager,
--              assistant_production_manager, store_officer,
--              logistics_manager
--     INSERT/UPDATE : md, production_manager,
--                     assistant_production_manager, store_officer
--     DELETE : md only
-- ============================================================

-- TABLE: production_log
ALTER TABLE production_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "production_log_select" ON production_log;
CREATE POLICY "production_log_select" ON production_log
  FOR SELECT USING (get_user_role() = ANY(ARRAY['md','board_member','ico','production_manager','assistant_production_manager','store_officer','logistics_manager']));
DROP POLICY IF EXISTS "production_log_insert" ON production_log;
CREATE POLICY "production_log_insert" ON production_log
  FOR INSERT WITH CHECK (get_user_role() = ANY(ARRAY['md','production_manager','assistant_production_manager','store_officer']));
DROP POLICY IF EXISTS "production_log_update" ON production_log;
CREATE POLICY "production_log_update" ON production_log
  FOR UPDATE USING (get_user_role() = ANY(ARRAY['md','production_manager','assistant_production_manager','store_officer']))
             WITH CHECK (get_user_role() = ANY(ARRAY['md','production_manager','assistant_production_manager','store_officer']));
DROP POLICY IF EXISTS "production_log_delete" ON production_log;
CREATE POLICY "production_log_delete" ON production_log
  FOR DELETE USING (get_user_role() = ANY(ARRAY['md']));

-- TABLE: batches
ALTER TABLE batches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "batches_select" ON batches;
CREATE POLICY "batches_select" ON batches
  FOR SELECT USING (get_user_role() = ANY(ARRAY['md','board_member','ico','production_manager','assistant_production_manager','store_officer','logistics_manager']));
DROP POLICY IF EXISTS "batches_insert" ON batches;
CREATE POLICY "batches_insert" ON batches
  FOR INSERT WITH CHECK (get_user_role() = ANY(ARRAY['md','production_manager','assistant_production_manager','store_officer']));
DROP POLICY IF EXISTS "batches_update" ON batches;
CREATE POLICY "batches_update" ON batches
  FOR UPDATE USING (get_user_role() = ANY(ARRAY['md','production_manager','assistant_production_manager','store_officer']))
             WITH CHECK (get_user_role() = ANY(ARRAY['md','production_manager','assistant_production_manager','store_officer']));
DROP POLICY IF EXISTS "batches_delete" ON batches;
CREATE POLICY "batches_delete" ON batches
  FOR DELETE USING (get_user_role() = ANY(ARRAY['md']));

-- TABLE: batch_production_links
ALTER TABLE batch_production_links ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "batch_production_links_select" ON batch_production_links;
CREATE POLICY "batch_production_links_select" ON batch_production_links
  FOR SELECT USING (get_user_role() = ANY(ARRAY['md','board_member','ico','production_manager','assistant_production_manager','store_officer','logistics_manager']));
DROP POLICY IF EXISTS "batch_production_links_insert" ON batch_production_links;
CREATE POLICY "batch_production_links_insert" ON batch_production_links
  FOR INSERT WITH CHECK (get_user_role() = ANY(ARRAY['md','production_manager','assistant_production_manager','store_officer']));
DROP POLICY IF EXISTS "batch_production_links_update" ON batch_production_links;
CREATE POLICY "batch_production_links_update" ON batch_production_links
  FOR UPDATE USING (get_user_role() = ANY(ARRAY['md','production_manager','assistant_production_manager','store_officer']))
             WITH CHECK (get_user_role() = ANY(ARRAY['md','production_manager','assistant_production_manager','store_officer']));
DROP POLICY IF EXISTS "batch_production_links_delete" ON batch_production_links;
CREATE POLICY "batch_production_links_delete" ON batch_production_links
  FOR DELETE USING (get_user_role() = ANY(ARRAY['md']));

-- TABLE: inventory_items
ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "inventory_items_select" ON inventory_items;
CREATE POLICY "inventory_items_select" ON inventory_items
  FOR SELECT USING (get_user_role() = ANY(ARRAY['md','board_member','ico','production_manager','assistant_production_manager','store_officer','logistics_manager']));
DROP POLICY IF EXISTS "inventory_items_insert" ON inventory_items;
CREATE POLICY "inventory_items_insert" ON inventory_items
  FOR INSERT WITH CHECK (get_user_role() = ANY(ARRAY['md','production_manager','assistant_production_manager','store_officer']));
DROP POLICY IF EXISTS "inventory_items_update" ON inventory_items;
CREATE POLICY "inventory_items_update" ON inventory_items
  FOR UPDATE USING (get_user_role() = ANY(ARRAY['md','production_manager','assistant_production_manager','store_officer']))
             WITH CHECK (get_user_role() = ANY(ARRAY['md','production_manager','assistant_production_manager','store_officer']));
DROP POLICY IF EXISTS "inventory_items_delete" ON inventory_items;
CREATE POLICY "inventory_items_delete" ON inventory_items
  FOR DELETE USING (get_user_role() = ANY(ARRAY['md']));

-- TABLE: inventory_log
ALTER TABLE inventory_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "inventory_log_select" ON inventory_log;
CREATE POLICY "inventory_log_select" ON inventory_log
  FOR SELECT USING (get_user_role() = ANY(ARRAY['md','board_member','ico','production_manager','assistant_production_manager','store_officer','logistics_manager']));
DROP POLICY IF EXISTS "inventory_log_insert" ON inventory_log;
CREATE POLICY "inventory_log_insert" ON inventory_log
  FOR INSERT WITH CHECK (get_user_role() = ANY(ARRAY['md','production_manager','assistant_production_manager','store_officer']));
DROP POLICY IF EXISTS "inventory_log_update" ON inventory_log;
CREATE POLICY "inventory_log_update" ON inventory_log
  FOR UPDATE USING (get_user_role() = ANY(ARRAY['md','production_manager','assistant_production_manager','store_officer']))
             WITH CHECK (get_user_role() = ANY(ARRAY['md','production_manager','assistant_production_manager','store_officer']));
DROP POLICY IF EXISTS "inventory_log_delete" ON inventory_log;
CREATE POLICY "inventory_log_delete" ON inventory_log
  FOR DELETE USING (get_user_role() = ANY(ARRAY['md']));

-- TABLE: stock_movements
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "stock_movements_select" ON stock_movements;
CREATE POLICY "stock_movements_select" ON stock_movements
  FOR SELECT USING (get_user_role() = ANY(ARRAY['md','board_member','ico','production_manager','assistant_production_manager','store_officer','logistics_manager']));
DROP POLICY IF EXISTS "stock_movements_insert" ON stock_movements;
CREATE POLICY "stock_movements_insert" ON stock_movements
  FOR INSERT WITH CHECK (get_user_role() = ANY(ARRAY['md','production_manager','assistant_production_manager','store_officer']));
DROP POLICY IF EXISTS "stock_movements_update" ON stock_movements;
CREATE POLICY "stock_movements_update" ON stock_movements
  FOR UPDATE USING (get_user_role() = ANY(ARRAY['md','production_manager','assistant_production_manager','store_officer']))
             WITH CHECK (get_user_role() = ANY(ARRAY['md','production_manager','assistant_production_manager','store_officer']));
DROP POLICY IF EXISTS "stock_movements_delete" ON stock_movements;
CREATE POLICY "stock_movements_delete" ON stock_movements
  FOR DELETE USING (get_user_role() = ANY(ARRAY['md']));

-- TABLE: finished_goods_stock
ALTER TABLE finished_goods_stock ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "finished_goods_stock_select" ON finished_goods_stock;
CREATE POLICY "finished_goods_stock_select" ON finished_goods_stock
  FOR SELECT USING (get_user_role() = ANY(ARRAY['md','board_member','ico','production_manager','assistant_production_manager','store_officer','logistics_manager']));
DROP POLICY IF EXISTS "finished_goods_stock_insert" ON finished_goods_stock;
CREATE POLICY "finished_goods_stock_insert" ON finished_goods_stock
  FOR INSERT WITH CHECK (get_user_role() = ANY(ARRAY['md','production_manager','assistant_production_manager','store_officer']));
DROP POLICY IF EXISTS "finished_goods_stock_update" ON finished_goods_stock;
CREATE POLICY "finished_goods_stock_update" ON finished_goods_stock
  FOR UPDATE USING (get_user_role() = ANY(ARRAY['md','production_manager','assistant_production_manager','store_officer']))
             WITH CHECK (get_user_role() = ANY(ARRAY['md','production_manager','assistant_production_manager','store_officer']));
DROP POLICY IF EXISTS "finished_goods_stock_delete" ON finished_goods_stock;
CREATE POLICY "finished_goods_stock_delete" ON finished_goods_stock
  FOR DELETE USING (get_user_role() = ANY(ARRAY['md']));

-- TABLE: damage_log
ALTER TABLE damage_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "damage_log_select" ON damage_log;
CREATE POLICY "damage_log_select" ON damage_log
  FOR SELECT USING (get_user_role() = ANY(ARRAY['md','board_member','ico','production_manager','assistant_production_manager','store_officer','logistics_manager']));
DROP POLICY IF EXISTS "damage_log_insert" ON damage_log;
CREATE POLICY "damage_log_insert" ON damage_log
  FOR INSERT WITH CHECK (get_user_role() = ANY(ARRAY['md','production_manager','assistant_production_manager','store_officer']));
DROP POLICY IF EXISTS "damage_log_update" ON damage_log;
CREATE POLICY "damage_log_update" ON damage_log
  FOR UPDATE USING (get_user_role() = ANY(ARRAY['md','production_manager','assistant_production_manager','store_officer']))
             WITH CHECK (get_user_role() = ANY(ARRAY['md','production_manager','assistant_production_manager','store_officer']));
DROP POLICY IF EXISTS "damage_log_delete" ON damage_log;
CREATE POLICY "damage_log_delete" ON damage_log
  FOR DELETE USING (get_user_role() = ANY(ARRAY['md']));

-- TABLE: production_targets
-- (replaces existing policy from fix_all_priority_issues.sql)
ALTER TABLE production_targets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "prod_targets_select" ON production_targets;
DROP POLICY IF EXISTS "prod_targets_write"  ON production_targets;
DROP POLICY IF EXISTS "production_targets_select" ON production_targets;
DROP POLICY IF EXISTS "production_targets_insert" ON production_targets;
DROP POLICY IF EXISTS "production_targets_update" ON production_targets;
DROP POLICY IF EXISTS "production_targets_delete" ON production_targets;
CREATE POLICY "production_targets_select" ON production_targets
  FOR SELECT USING (get_user_role() = ANY(ARRAY['md','board_member','ico','production_manager','assistant_production_manager','store_officer','logistics_manager']));
CREATE POLICY "production_targets_insert" ON production_targets
  FOR INSERT WITH CHECK (get_user_role() = ANY(ARRAY['md','production_manager','assistant_production_manager','store_officer']));
CREATE POLICY "production_targets_update" ON production_targets
  FOR UPDATE USING (get_user_role() = ANY(ARRAY['md','production_manager','assistant_production_manager','store_officer']))
             WITH CHECK (get_user_role() = ANY(ARRAY['md','production_manager','assistant_production_manager','store_officer']));
CREATE POLICY "production_targets_delete" ON production_targets
  FOR DELETE USING (get_user_role() = ANY(ARRAY['md']));


-- ============================================================
-- 11. CUSTOMERS / DELIVERY
--     customers, customer_sites, deliveries,
--     delivery_schedules, delivery_schedule_items,
--     pending_delivery_register
--     SELECT : md, board_member, ico, bdm, marketer,
--              logistics_manager, store_officer,
--              production_manager, assistant_production_manager
--     INSERT/UPDATE : md, bdm, marketer, logistics_manager
--     DELETE : md only
-- ============================================================

-- TABLE: customers
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "customers_select" ON customers;
CREATE POLICY "customers_select" ON customers
  FOR SELECT USING (get_user_role() = ANY(ARRAY['md','board_member','ico','bdm','marketer','logistics_manager','store_officer','production_manager','assistant_production_manager']));
DROP POLICY IF EXISTS "customers_insert" ON customers;
CREATE POLICY "customers_insert" ON customers
  FOR INSERT WITH CHECK (get_user_role() = ANY(ARRAY['md','bdm','marketer','logistics_manager']));
DROP POLICY IF EXISTS "customers_update" ON customers;
CREATE POLICY "customers_update" ON customers
  FOR UPDATE USING (get_user_role() = ANY(ARRAY['md','bdm','marketer','logistics_manager']))
             WITH CHECK (get_user_role() = ANY(ARRAY['md','bdm','marketer','logistics_manager']));
DROP POLICY IF EXISTS "customers_delete" ON customers;
CREATE POLICY "customers_delete" ON customers
  FOR DELETE USING (get_user_role() = ANY(ARRAY['md']));

-- TABLE: customer_sites
ALTER TABLE customer_sites ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "customer_sites_select" ON customer_sites;
CREATE POLICY "customer_sites_select" ON customer_sites
  FOR SELECT USING (get_user_role() = ANY(ARRAY['md','board_member','ico','bdm','marketer','logistics_manager','store_officer','production_manager','assistant_production_manager']));
DROP POLICY IF EXISTS "customer_sites_insert" ON customer_sites;
CREATE POLICY "customer_sites_insert" ON customer_sites
  FOR INSERT WITH CHECK (get_user_role() = ANY(ARRAY['md','bdm','marketer','logistics_manager']));
DROP POLICY IF EXISTS "customer_sites_update" ON customer_sites;
CREATE POLICY "customer_sites_update" ON customer_sites
  FOR UPDATE USING (get_user_role() = ANY(ARRAY['md','bdm','marketer','logistics_manager']))
             WITH CHECK (get_user_role() = ANY(ARRAY['md','bdm','marketer','logistics_manager']));
DROP POLICY IF EXISTS "customer_sites_delete" ON customer_sites;
CREATE POLICY "customer_sites_delete" ON customer_sites
  FOR DELETE USING (get_user_role() = ANY(ARRAY['md']));

-- TABLE: deliveries
ALTER TABLE deliveries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "deliveries_select" ON deliveries;
CREATE POLICY "deliveries_select" ON deliveries
  FOR SELECT USING (get_user_role() = ANY(ARRAY['md','board_member','ico','bdm','marketer','logistics_manager','store_officer','production_manager','assistant_production_manager']));
DROP POLICY IF EXISTS "deliveries_insert" ON deliveries;
CREATE POLICY "deliveries_insert" ON deliveries
  FOR INSERT WITH CHECK (get_user_role() = ANY(ARRAY['md','bdm','marketer','logistics_manager']));
DROP POLICY IF EXISTS "deliveries_update" ON deliveries;
CREATE POLICY "deliveries_update" ON deliveries
  FOR UPDATE USING (get_user_role() = ANY(ARRAY['md','bdm','marketer','logistics_manager']))
             WITH CHECK (get_user_role() = ANY(ARRAY['md','bdm','marketer','logistics_manager']));
DROP POLICY IF EXISTS "deliveries_delete" ON deliveries;
CREATE POLICY "deliveries_delete" ON deliveries
  FOR DELETE USING (get_user_role() = ANY(ARRAY['md']));

-- TABLE: delivery_schedules
ALTER TABLE delivery_schedules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "delivery_schedules_select" ON delivery_schedules;
CREATE POLICY "delivery_schedules_select" ON delivery_schedules
  FOR SELECT USING (get_user_role() = ANY(ARRAY['md','board_member','ico','bdm','marketer','logistics_manager','store_officer','production_manager','assistant_production_manager']));
DROP POLICY IF EXISTS "delivery_schedules_insert" ON delivery_schedules;
CREATE POLICY "delivery_schedules_insert" ON delivery_schedules
  FOR INSERT WITH CHECK (get_user_role() = ANY(ARRAY['md','bdm','marketer','logistics_manager']));
DROP POLICY IF EXISTS "delivery_schedules_update" ON delivery_schedules;
CREATE POLICY "delivery_schedules_update" ON delivery_schedules
  FOR UPDATE USING (get_user_role() = ANY(ARRAY['md','bdm','marketer','logistics_manager']))
             WITH CHECK (get_user_role() = ANY(ARRAY['md','bdm','marketer','logistics_manager']));
DROP POLICY IF EXISTS "delivery_schedules_delete" ON delivery_schedules;
CREATE POLICY "delivery_schedules_delete" ON delivery_schedules
  FOR DELETE USING (get_user_role() = ANY(ARRAY['md']));

-- TABLE: delivery_schedule_items
ALTER TABLE delivery_schedule_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "delivery_schedule_items_select" ON delivery_schedule_items;
CREATE POLICY "delivery_schedule_items_select" ON delivery_schedule_items
  FOR SELECT USING (get_user_role() = ANY(ARRAY['md','board_member','ico','bdm','marketer','logistics_manager','store_officer','production_manager','assistant_production_manager']));
DROP POLICY IF EXISTS "delivery_schedule_items_insert" ON delivery_schedule_items;
CREATE POLICY "delivery_schedule_items_insert" ON delivery_schedule_items
  FOR INSERT WITH CHECK (get_user_role() = ANY(ARRAY['md','bdm','marketer','logistics_manager']));
DROP POLICY IF EXISTS "delivery_schedule_items_update" ON delivery_schedule_items;
CREATE POLICY "delivery_schedule_items_update" ON delivery_schedule_items
  FOR UPDATE USING (get_user_role() = ANY(ARRAY['md','bdm','marketer','logistics_manager']))
             WITH CHECK (get_user_role() = ANY(ARRAY['md','bdm','marketer','logistics_manager']));
DROP POLICY IF EXISTS "delivery_schedule_items_delete" ON delivery_schedule_items;
CREATE POLICY "delivery_schedule_items_delete" ON delivery_schedule_items
  FOR DELETE USING (get_user_role() = ANY(ARRAY['md']));

-- TABLE: pending_delivery_register
ALTER TABLE pending_delivery_register ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pending_delivery_register_select" ON pending_delivery_register;
CREATE POLICY "pending_delivery_register_select" ON pending_delivery_register
  FOR SELECT USING (get_user_role() = ANY(ARRAY['md','board_member','ico','bdm','marketer','logistics_manager','store_officer','production_manager','assistant_production_manager']));
DROP POLICY IF EXISTS "pending_delivery_register_insert" ON pending_delivery_register;
CREATE POLICY "pending_delivery_register_insert" ON pending_delivery_register
  FOR INSERT WITH CHECK (get_user_role() = ANY(ARRAY['md','bdm','marketer','logistics_manager']));
DROP POLICY IF EXISTS "pending_delivery_register_update" ON pending_delivery_register;
CREATE POLICY "pending_delivery_register_update" ON pending_delivery_register
  FOR UPDATE USING (get_user_role() = ANY(ARRAY['md','bdm','marketer','logistics_manager']))
             WITH CHECK (get_user_role() = ANY(ARRAY['md','bdm','marketer','logistics_manager']));
DROP POLICY IF EXISTS "pending_delivery_register_delete" ON pending_delivery_register;
CREATE POLICY "pending_delivery_register_delete" ON pending_delivery_register
  FOR DELETE USING (get_user_role() = ANY(ARRAY['md']));


-- ============================================================
-- 12. LPO
--     lpo_orders
--     SELECT : md, board_member, ico, bdm, accountant
--     INSERT/UPDATE : md, bdm
--     DELETE : md only
-- ============================================================

-- TABLE: lpo_orders
ALTER TABLE lpo_orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "lpo_orders_select" ON lpo_orders;
CREATE POLICY "lpo_orders_select" ON lpo_orders
  FOR SELECT USING (get_user_role() = ANY(ARRAY['md','board_member','ico','bdm','accountant']));
DROP POLICY IF EXISTS "lpo_orders_insert" ON lpo_orders;
CREATE POLICY "lpo_orders_insert" ON lpo_orders
  FOR INSERT WITH CHECK (get_user_role() = ANY(ARRAY['md','bdm']));
DROP POLICY IF EXISTS "lpo_orders_update" ON lpo_orders;
CREATE POLICY "lpo_orders_update" ON lpo_orders
  FOR UPDATE USING (get_user_role() = ANY(ARRAY['md','bdm']))
             WITH CHECK (get_user_role() = ANY(ARRAY['md','bdm']));
DROP POLICY IF EXISTS "lpo_orders_delete" ON lpo_orders;
CREATE POLICY "lpo_orders_delete" ON lpo_orders
  FOR DELETE USING (get_user_role() = ANY(ARRAY['md']));


-- ============================================================
-- 13. REFERENCE / LOOKUP TABLES
--     app_roles, products, expense_categories, staff_roles
--     SELECT : all authenticated users (USING true)
--     INSERT/UPDATE/DELETE : md only
-- ============================================================

-- TABLE: app_roles
ALTER TABLE app_roles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "app_roles_select" ON app_roles;
CREATE POLICY "app_roles_select" ON app_roles
  FOR SELECT USING (true);
DROP POLICY IF EXISTS "app_roles_insert" ON app_roles;
CREATE POLICY "app_roles_insert" ON app_roles
  FOR INSERT WITH CHECK (get_user_role() = ANY(ARRAY['md']));
DROP POLICY IF EXISTS "app_roles_update" ON app_roles;
CREATE POLICY "app_roles_update" ON app_roles
  FOR UPDATE USING (get_user_role() = ANY(ARRAY['md']))
             WITH CHECK (get_user_role() = ANY(ARRAY['md']));
DROP POLICY IF EXISTS "app_roles_delete" ON app_roles;
CREATE POLICY "app_roles_delete" ON app_roles
  FOR DELETE USING (get_user_role() = ANY(ARRAY['md']));

-- TABLE: products
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "products_select" ON products;
CREATE POLICY "products_select" ON products
  FOR SELECT USING (true);
DROP POLICY IF EXISTS "products_insert" ON products;
CREATE POLICY "products_insert" ON products
  FOR INSERT WITH CHECK (get_user_role() = ANY(ARRAY['md']));
DROP POLICY IF EXISTS "products_update" ON products;
CREATE POLICY "products_update" ON products
  FOR UPDATE USING (get_user_role() = ANY(ARRAY['md']))
             WITH CHECK (get_user_role() = ANY(ARRAY['md']));
DROP POLICY IF EXISTS "products_delete" ON products;
CREATE POLICY "products_delete" ON products
  FOR DELETE USING (get_user_role() = ANY(ARRAY['md']));

-- TABLE: expense_categories
ALTER TABLE expense_categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "expense_categories_select" ON expense_categories;
CREATE POLICY "expense_categories_select" ON expense_categories
  FOR SELECT USING (true);
DROP POLICY IF EXISTS "expense_categories_insert" ON expense_categories;
CREATE POLICY "expense_categories_insert" ON expense_categories
  FOR INSERT WITH CHECK (get_user_role() = ANY(ARRAY['md']));
DROP POLICY IF EXISTS "expense_categories_update" ON expense_categories;
CREATE POLICY "expense_categories_update" ON expense_categories
  FOR UPDATE USING (get_user_role() = ANY(ARRAY['md']))
             WITH CHECK (get_user_role() = ANY(ARRAY['md']));
DROP POLICY IF EXISTS "expense_categories_delete" ON expense_categories;
CREATE POLICY "expense_categories_delete" ON expense_categories
  FOR DELETE USING (get_user_role() = ANY(ARRAY['md']));

-- TABLE: staff_roles
ALTER TABLE staff_roles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "staff_roles_select" ON staff_roles;
CREATE POLICY "staff_roles_select" ON staff_roles
  FOR SELECT USING (true);
DROP POLICY IF EXISTS "staff_roles_insert" ON staff_roles;
CREATE POLICY "staff_roles_insert" ON staff_roles
  FOR INSERT WITH CHECK (get_user_role() = ANY(ARRAY['md','hr_officer']));
DROP POLICY IF EXISTS "staff_roles_update" ON staff_roles;
CREATE POLICY "staff_roles_update" ON staff_roles
  FOR UPDATE USING (get_user_role() = ANY(ARRAY['md','hr_officer']))
             WITH CHECK (get_user_role() = ANY(ARRAY['md','hr_officer']));
DROP POLICY IF EXISTS "staff_roles_delete" ON staff_roles;
CREATE POLICY "staff_roles_delete" ON staff_roles
  FOR DELETE USING (get_user_role() = ANY(ARRAY['md']));


-- ============================================================
-- 14. REPORTING
--     report_history
--     SELECT : md, board_member, ico, accountant,
--              production_manager, assistant_production_manager,
--              hr_officer
--     INSERT : all authenticated users
--     UPDATE/DELETE : md only
-- ============================================================

-- TABLE: report_history
ALTER TABLE report_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "report_history_select" ON report_history;
CREATE POLICY "report_history_select" ON report_history
  FOR SELECT USING (get_user_role() = ANY(ARRAY['md','board_member','ico','accountant','production_manager','assistant_production_manager','hr_officer']));
DROP POLICY IF EXISTS "report_history_insert" ON report_history;
CREATE POLICY "report_history_insert" ON report_history
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "report_history_update" ON report_history;
CREATE POLICY "report_history_update" ON report_history
  FOR UPDATE USING (get_user_role() = ANY(ARRAY['md']))
             WITH CHECK (get_user_role() = ANY(ARRAY['md']));
DROP POLICY IF EXISTS "report_history_delete" ON report_history;
CREATE POLICY "report_history_delete" ON report_history
  FOR DELETE USING (get_user_role() = ANY(ARRAY['md']));


-- ============================================================
-- 15. USER PROFILES
--     user_profiles
--     SELECT : own row always; md sees all rows
--     UPDATE : own row always; md updates all rows
--     INSERT : md only (trigger handle_new_auth_user bypasses
--              RLS via SECURITY DEFINER and still works)
--     DELETE : md only
-- ============================================================

-- TABLE: user_profiles
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_profiles_select" ON user_profiles;
CREATE POLICY "user_profiles_select" ON user_profiles
  FOR SELECT USING (id = auth.uid() OR get_user_role() = ANY(ARRAY['md']));
DROP POLICY IF EXISTS "user_profiles_insert" ON user_profiles;
CREATE POLICY "user_profiles_insert" ON user_profiles
  FOR INSERT WITH CHECK (get_user_role() = ANY(ARRAY['md']));
DROP POLICY IF EXISTS "user_profiles_update" ON user_profiles;
CREATE POLICY "user_profiles_update" ON user_profiles
  FOR UPDATE USING (id = auth.uid() OR get_user_role() = ANY(ARRAY['md']))
             WITH CHECK (id = auth.uid() OR get_user_role() = ANY(ARRAY['md']));
DROP POLICY IF EXISTS "user_profiles_delete" ON user_profiles;
CREATE POLICY "user_profiles_delete" ON user_profiles
  FOR DELETE USING (get_user_role() = ANY(ARRAY['md']));


-- ============================================================
-- 16. IMPORT TABLES
--     import_batches, import_staging_rows, bank_import_batches,
--     historical_payments_import, historical_payroll_import
--     SELECT : md, accountant
--     INSERT/UPDATE/DELETE : md, accountant
-- ============================================================

-- TABLE: import_batches
ALTER TABLE import_batches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "import_batches_select" ON import_batches;
CREATE POLICY "import_batches_select" ON import_batches
  FOR SELECT USING (get_user_role() = ANY(ARRAY['md','accountant']));
DROP POLICY IF EXISTS "import_batches_insert" ON import_batches;
CREATE POLICY "import_batches_insert" ON import_batches
  FOR INSERT WITH CHECK (get_user_role() = ANY(ARRAY['md','accountant']));
DROP POLICY IF EXISTS "import_batches_update" ON import_batches;
CREATE POLICY "import_batches_update" ON import_batches
  FOR UPDATE USING (get_user_role() = ANY(ARRAY['md','accountant']))
             WITH CHECK (get_user_role() = ANY(ARRAY['md','accountant']));
DROP POLICY IF EXISTS "import_batches_delete" ON import_batches;
CREATE POLICY "import_batches_delete" ON import_batches
  FOR DELETE USING (get_user_role() = ANY(ARRAY['md','accountant']));

-- TABLE: import_staging_rows
ALTER TABLE import_staging_rows ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "import_staging_rows_select" ON import_staging_rows;
CREATE POLICY "import_staging_rows_select" ON import_staging_rows
  FOR SELECT USING (get_user_role() = ANY(ARRAY['md','accountant']));
DROP POLICY IF EXISTS "import_staging_rows_insert" ON import_staging_rows;
CREATE POLICY "import_staging_rows_insert" ON import_staging_rows
  FOR INSERT WITH CHECK (get_user_role() = ANY(ARRAY['md','accountant']));
DROP POLICY IF EXISTS "import_staging_rows_update" ON import_staging_rows;
CREATE POLICY "import_staging_rows_update" ON import_staging_rows
  FOR UPDATE USING (get_user_role() = ANY(ARRAY['md','accountant']))
             WITH CHECK (get_user_role() = ANY(ARRAY['md','accountant']));
DROP POLICY IF EXISTS "import_staging_rows_delete" ON import_staging_rows;
CREATE POLICY "import_staging_rows_delete" ON import_staging_rows
  FOR DELETE USING (get_user_role() = ANY(ARRAY['md','accountant']));

-- TABLE: bank_import_batches
ALTER TABLE bank_import_batches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "bank_import_batches_select" ON bank_import_batches;
CREATE POLICY "bank_import_batches_select" ON bank_import_batches
  FOR SELECT USING (get_user_role() = ANY(ARRAY['md','accountant']));
DROP POLICY IF EXISTS "bank_import_batches_insert" ON bank_import_batches;
CREATE POLICY "bank_import_batches_insert" ON bank_import_batches
  FOR INSERT WITH CHECK (get_user_role() = ANY(ARRAY['md','accountant']));
DROP POLICY IF EXISTS "bank_import_batches_update" ON bank_import_batches;
CREATE POLICY "bank_import_batches_update" ON bank_import_batches
  FOR UPDATE USING (get_user_role() = ANY(ARRAY['md','accountant']))
             WITH CHECK (get_user_role() = ANY(ARRAY['md','accountant']));
DROP POLICY IF EXISTS "bank_import_batches_delete" ON bank_import_batches;
CREATE POLICY "bank_import_batches_delete" ON bank_import_batches
  FOR DELETE USING (get_user_role() = ANY(ARRAY['md','accountant']));

-- TABLE: historical_payments_import
ALTER TABLE historical_payments_import ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "historical_payments_import_select" ON historical_payments_import;
CREATE POLICY "historical_payments_import_select" ON historical_payments_import
  FOR SELECT USING (get_user_role() = ANY(ARRAY['md','accountant']));
DROP POLICY IF EXISTS "historical_payments_import_insert" ON historical_payments_import;
CREATE POLICY "historical_payments_import_insert" ON historical_payments_import
  FOR INSERT WITH CHECK (get_user_role() = ANY(ARRAY['md','accountant']));
DROP POLICY IF EXISTS "historical_payments_import_update" ON historical_payments_import;
CREATE POLICY "historical_payments_import_update" ON historical_payments_import
  FOR UPDATE USING (get_user_role() = ANY(ARRAY['md','accountant']))
             WITH CHECK (get_user_role() = ANY(ARRAY['md','accountant']));
DROP POLICY IF EXISTS "historical_payments_import_delete" ON historical_payments_import;
CREATE POLICY "historical_payments_import_delete" ON historical_payments_import
  FOR DELETE USING (get_user_role() = ANY(ARRAY['md','accountant']));

-- TABLE: historical_payroll_import
ALTER TABLE historical_payroll_import ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "historical_payroll_import_select" ON historical_payroll_import;
CREATE POLICY "historical_payroll_import_select" ON historical_payroll_import
  FOR SELECT USING (get_user_role() = ANY(ARRAY['md','accountant']));
DROP POLICY IF EXISTS "historical_payroll_import_insert" ON historical_payroll_import;
CREATE POLICY "historical_payroll_import_insert" ON historical_payroll_import
  FOR INSERT WITH CHECK (get_user_role() = ANY(ARRAY['md','accountant']));
DROP POLICY IF EXISTS "historical_payroll_import_update" ON historical_payroll_import;
CREATE POLICY "historical_payroll_import_update" ON historical_payroll_import
  FOR UPDATE USING (get_user_role() = ANY(ARRAY['md','accountant']))
             WITH CHECK (get_user_role() = ANY(ARRAY['md','accountant']));
DROP POLICY IF EXISTS "historical_payroll_import_delete" ON historical_payroll_import;
CREATE POLICY "historical_payroll_import_delete" ON historical_payroll_import
  FOR DELETE USING (get_user_role() = ANY(ARRAY['md','accountant']));
