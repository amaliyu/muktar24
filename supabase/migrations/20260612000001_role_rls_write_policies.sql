-- ============================================================
-- Migration: 20260612000001_role_rls_write_policies.sql
-- Scope:     EXACTLY the 14 tables reviewed and approved in
--            SESSION 1 — ROLE-LEVEL SECURITY (2026-06-12).
--            All other tables are NOT touched here; they retain
--            whatever policies are currently on the database
--            and will be addressed in a future reviewed session.
--
-- Performance note: (SELECT get_user_role()) evaluates ONCE per
-- statement, not once per row.  Always use this sub-select form.
--
-- DO NOT apply to the live database until the signed-URL code
-- change is deployed and this file has been reviewed.
-- DO NOT merge to main until explicitly instructed.
-- ============================================================


-- ============================================================
-- 1. bank_accounts
--    INSERT/UPDATE : md, accountant
--    DELETE        : md
-- ============================================================
DROP POLICY IF EXISTS "bank_accounts_insert" ON bank_accounts;
CREATE POLICY "bank_accounts_insert" ON bank_accounts
  FOR INSERT WITH CHECK (
    (SELECT get_user_role()) = ANY(ARRAY['md','accountant'])
  );
DROP POLICY IF EXISTS "bank_accounts_update" ON bank_accounts;
CREATE POLICY "bank_accounts_update" ON bank_accounts
  FOR UPDATE
  USING      ((SELECT get_user_role()) = ANY(ARRAY['md','accountant']))
  WITH CHECK ((SELECT get_user_role()) = ANY(ARRAY['md','accountant']));
DROP POLICY IF EXISTS "bank_accounts_delete" ON bank_accounts;
CREATE POLICY "bank_accounts_delete" ON bank_accounts
  FOR DELETE USING ((SELECT get_user_role()) = 'md');


-- ============================================================
-- 2. bank_transactions
--    INSERT/UPDATE : md, accountant
--    DELETE        : md
-- ============================================================
DROP POLICY IF EXISTS "bank_transactions_insert" ON bank_transactions;
CREATE POLICY "bank_transactions_insert" ON bank_transactions
  FOR INSERT WITH CHECK (
    (SELECT get_user_role()) = ANY(ARRAY['md','accountant'])
  );
DROP POLICY IF EXISTS "bank_transactions_update" ON bank_transactions;
CREATE POLICY "bank_transactions_update" ON bank_transactions
  FOR UPDATE
  USING      ((SELECT get_user_role()) = ANY(ARRAY['md','accountant']))
  WITH CHECK ((SELECT get_user_role()) = ANY(ARRAY['md','accountant']));
DROP POLICY IF EXISTS "bank_transactions_delete" ON bank_transactions;
CREATE POLICY "bank_transactions_delete" ON bank_transactions
  FOR DELETE USING ((SELECT get_user_role()) = 'md');


-- ============================================================
-- 3. bank_reconciliations
--    INSERT/UPDATE : md, accountant
--    DELETE        : md
-- ============================================================
DROP POLICY IF EXISTS "bank_reconciliations_insert" ON bank_reconciliations;
CREATE POLICY "bank_reconciliations_insert" ON bank_reconciliations
  FOR INSERT WITH CHECK (
    (SELECT get_user_role()) = ANY(ARRAY['md','accountant'])
  );
DROP POLICY IF EXISTS "bank_reconciliations_update" ON bank_reconciliations;
CREATE POLICY "bank_reconciliations_update" ON bank_reconciliations
  FOR UPDATE
  USING      ((SELECT get_user_role()) = ANY(ARRAY['md','accountant']))
  WITH CHECK ((SELECT get_user_role()) = ANY(ARRAY['md','accountant']));
DROP POLICY IF EXISTS "bank_reconciliations_delete" ON bank_reconciliations;
CREATE POLICY "bank_reconciliations_delete" ON bank_reconciliations
  FOR DELETE USING ((SELECT get_user_role()) = 'md');


-- ============================================================
-- 4. income_records
--    INSERT : md, accountant
--    UPDATE : NONE — income records are immutable after creation
--    DELETE : md, accountant
-- ============================================================
DROP POLICY IF EXISTS "income_records_insert" ON income_records;
CREATE POLICY "income_records_insert" ON income_records
  FOR INSERT WITH CHECK (
    (SELECT get_user_role()) = ANY(ARRAY['md','accountant'])
  );
DROP POLICY IF EXISTS "income_records_update" ON income_records;
-- UPDATE policy intentionally not recreated: income_records are immutable
DROP POLICY IF EXISTS "income_records_delete" ON income_records;
CREATE POLICY "income_records_delete" ON income_records
  FOR DELETE USING (
    (SELECT get_user_role()) = ANY(ARRAY['md','accountant'])
  );


-- ============================================================
-- 5. payroll_lines
--    INSERT/UPDATE : md, hr_officer  (accountant excluded)
--    DELETE        : md
-- ============================================================
DROP POLICY IF EXISTS "payroll_lines_insert" ON payroll_lines;
CREATE POLICY "payroll_lines_insert" ON payroll_lines
  FOR INSERT WITH CHECK (
    (SELECT get_user_role()) = ANY(ARRAY['md','hr_officer'])
  );
DROP POLICY IF EXISTS "payroll_lines_update" ON payroll_lines;
CREATE POLICY "payroll_lines_update" ON payroll_lines
  FOR UPDATE
  USING      ((SELECT get_user_role()) = ANY(ARRAY['md','hr_officer']))
  WITH CHECK ((SELECT get_user_role()) = ANY(ARRAY['md','hr_officer']));
DROP POLICY IF EXISTS "payroll_lines_delete" ON payroll_lines;
CREATE POLICY "payroll_lines_delete" ON payroll_lines
  FOR DELETE USING ((SELECT get_user_role()) = 'md');


-- ============================================================
-- 6. payroll_runs
--    INSERT/UPDATE : md, hr_officer  (accountant excluded)
--    DELETE        : md
-- ============================================================
DROP POLICY IF EXISTS "payroll_runs_insert" ON payroll_runs;
CREATE POLICY "payroll_runs_insert" ON payroll_runs
  FOR INSERT WITH CHECK (
    (SELECT get_user_role()) = ANY(ARRAY['md','hr_officer'])
  );
DROP POLICY IF EXISTS "payroll_runs_update" ON payroll_runs;
CREATE POLICY "payroll_runs_update" ON payroll_runs
  FOR UPDATE
  USING      ((SELECT get_user_role()) = ANY(ARRAY['md','hr_officer']))
  WITH CHECK ((SELECT get_user_role()) = ANY(ARRAY['md','hr_officer']));
DROP POLICY IF EXISTS "payroll_runs_delete" ON payroll_runs;
CREATE POLICY "payroll_runs_delete" ON payroll_runs
  FOR DELETE USING ((SELECT get_user_role()) = 'md');


-- ============================================================
-- 7. weekly_labour_payroll
--    INSERT/UPDATE : md, production_manager,
--                    assistant_production_manager,
--                    hr_officer, logistics_manager, ico
--    DELETE        : md
-- ============================================================
DROP POLICY IF EXISTS "weekly_labour_payroll_insert" ON weekly_labour_payroll;
CREATE POLICY "weekly_labour_payroll_insert" ON weekly_labour_payroll
  FOR INSERT WITH CHECK (
    (SELECT get_user_role()) = ANY(ARRAY[
      'md','production_manager','assistant_production_manager',
      'hr_officer','logistics_manager','ico'
    ])
  );
DROP POLICY IF EXISTS "weekly_labour_payroll_update" ON weekly_labour_payroll;
CREATE POLICY "weekly_labour_payroll_update" ON weekly_labour_payroll
  FOR UPDATE
  USING ((SELECT get_user_role()) = ANY(ARRAY[
    'md','production_manager','assistant_production_manager',
    'hr_officer','logistics_manager','ico'
  ]))
  WITH CHECK ((SELECT get_user_role()) = ANY(ARRAY[
    'md','production_manager','assistant_production_manager',
    'hr_officer','logistics_manager','ico'
  ]));
DROP POLICY IF EXISTS "weekly_labour_payroll_delete" ON weekly_labour_payroll;
CREATE POLICY "weekly_labour_payroll_delete" ON weekly_labour_payroll
  FOR DELETE USING ((SELECT get_user_role()) = 'md');


-- ============================================================
-- 8. expenses
--    INSERT : md, accountant, hr_officer
--    UPDATE : md, accountant
--    DELETE : md, accountant
-- ============================================================
DROP POLICY IF EXISTS "expenses_insert" ON expenses;
CREATE POLICY "expenses_insert" ON expenses
  FOR INSERT WITH CHECK (
    (SELECT get_user_role()) = ANY(ARRAY['md','accountant','hr_officer'])
  );
DROP POLICY IF EXISTS "expenses_update" ON expenses;
CREATE POLICY "expenses_update" ON expenses
  FOR UPDATE
  USING      ((SELECT get_user_role()) = ANY(ARRAY['md','accountant']))
  WITH CHECK ((SELECT get_user_role()) = ANY(ARRAY['md','accountant']));
DROP POLICY IF EXISTS "expenses_delete" ON expenses;
CREATE POLICY "expenses_delete" ON expenses
  FOR DELETE USING (
    (SELECT get_user_role()) = ANY(ARRAY['md','accountant'])
  );


-- ============================================================
-- 9. financial_adjustments
--    INSERT/UPDATE : md, accountant
--    DELETE        : md
-- ============================================================
DROP POLICY IF EXISTS "financial_adjustments_insert" ON financial_adjustments;
CREATE POLICY "financial_adjustments_insert" ON financial_adjustments
  FOR INSERT WITH CHECK (
    (SELECT get_user_role()) = ANY(ARRAY['md','accountant'])
  );
DROP POLICY IF EXISTS "financial_adjustments_update" ON financial_adjustments;
CREATE POLICY "financial_adjustments_update" ON financial_adjustments
  FOR UPDATE
  USING      ((SELECT get_user_role()) = ANY(ARRAY['md','accountant']))
  WITH CHECK ((SELECT get_user_role()) = ANY(ARRAY['md','accountant']));
DROP POLICY IF EXISTS "financial_adjustments_delete" ON financial_adjustments;
CREATE POLICY "financial_adjustments_delete" ON financial_adjustments
  FOR DELETE USING ((SELECT get_user_role()) = 'md');


-- ============================================================
-- 10. opening_balances
--     INSERT/UPDATE : md, accountant
--     DELETE        : md
-- ============================================================
DROP POLICY IF EXISTS "opening_balances_insert" ON opening_balances;
CREATE POLICY "opening_balances_insert" ON opening_balances
  FOR INSERT WITH CHECK (
    (SELECT get_user_role()) = ANY(ARRAY['md','accountant'])
  );
DROP POLICY IF EXISTS "opening_balances_update" ON opening_balances;
CREATE POLICY "opening_balances_update" ON opening_balances
  FOR UPDATE
  USING      ((SELECT get_user_role()) = ANY(ARRAY['md','accountant']))
  WITH CHECK ((SELECT get_user_role()) = ANY(ARRAY['md','accountant']));
DROP POLICY IF EXISTS "opening_balances_delete" ON opening_balances;
CREATE POLICY "opening_balances_delete" ON opening_balances
  FOR DELETE USING ((SELECT get_user_role()) = 'md');


-- ============================================================
-- 11. invoices
--     INSERT : md, bdm, accountant  (marketer excluded)
--     UPDATE : md, accountant
--     DELETE : md
-- ============================================================
DROP POLICY IF EXISTS "invoices_insert" ON invoices;
CREATE POLICY "invoices_insert" ON invoices
  FOR INSERT WITH CHECK (
    (SELECT get_user_role()) = ANY(ARRAY['md','bdm','accountant'])
  );
DROP POLICY IF EXISTS "invoices_update" ON invoices;
CREATE POLICY "invoices_update" ON invoices
  FOR UPDATE
  USING      ((SELECT get_user_role()) = ANY(ARRAY['md','accountant']))
  WITH CHECK ((SELECT get_user_role()) = ANY(ARRAY['md','accountant']));
DROP POLICY IF EXISTS "invoices_delete" ON invoices;
CREATE POLICY "invoices_delete" ON invoices
  FOR DELETE USING ((SELECT get_user_role()) = 'md');


-- ============================================================
-- 12. payments
--     INSERT : md, accountant  (marketer/bdm removed)
--     UPDATE : md, accountant
--     DELETE : md ONLY
-- ============================================================
DROP POLICY IF EXISTS "payments_insert" ON payments;
CREATE POLICY "payments_insert" ON payments
  FOR INSERT WITH CHECK (
    (SELECT get_user_role()) = ANY(ARRAY['md','accountant'])
  );
DROP POLICY IF EXISTS "payments_update" ON payments;
CREATE POLICY "payments_update" ON payments
  FOR UPDATE
  USING      ((SELECT get_user_role()) = ANY(ARRAY['md','accountant']))
  WITH CHECK ((SELECT get_user_role()) = ANY(ARRAY['md','accountant']));
DROP POLICY IF EXISTS "payments_delete" ON payments;
CREATE POLICY "payments_delete" ON payments
  FOR DELETE USING ((SELECT get_user_role()) = 'md');


-- ============================================================
-- 13. staff
--     INSERT/UPDATE : md, hr_officer
--     DELETE        : md
-- ============================================================
DROP POLICY IF EXISTS "staff_insert" ON staff;
CREATE POLICY "staff_insert" ON staff
  FOR INSERT WITH CHECK (
    (SELECT get_user_role()) = ANY(ARRAY['md','hr_officer'])
  );
DROP POLICY IF EXISTS "staff_update" ON staff;
CREATE POLICY "staff_update" ON staff
  FOR UPDATE
  USING      ((SELECT get_user_role()) = ANY(ARRAY['md','hr_officer']))
  WITH CHECK ((SELECT get_user_role()) = ANY(ARRAY['md','hr_officer']));
DROP POLICY IF EXISTS "staff_delete" ON staff;
CREATE POLICY "staff_delete" ON staff
  FOR DELETE USING ((SELECT get_user_role()) = 'md');


-- ============================================================
-- 14. staff_documents
--     INSERT : md, hr_officer (any staff record), OR self-upload
--              where user_profiles.staff_id matches the
--              staff_id value being inserted
--     UPDATE : NONE — documents are immutable after upload
--     DELETE : md, hr_officer  (no self-delete)
-- ============================================================
DROP POLICY IF EXISTS "staff_documents_insert" ON staff_documents;
CREATE POLICY "staff_documents_insert" ON staff_documents
  FOR INSERT WITH CHECK (
    (SELECT get_user_role()) = ANY(ARRAY['md','hr_officer'])
    OR (
      staff_documents.staff_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM user_profiles
        WHERE user_profiles.id = auth.uid()
          AND user_profiles.staff_id = staff_documents.staff_id
      )
    )
  );
DROP POLICY IF EXISTS "staff_documents_update" ON staff_documents;
-- UPDATE policy intentionally not recreated: documents are immutable
DROP POLICY IF EXISTS "staff_documents_delete" ON staff_documents;
CREATE POLICY "staff_documents_delete" ON staff_documents
  FOR DELETE USING (
    (SELECT get_user_role()) = ANY(ARRAY['md','hr_officer'])
  );
