-- ============================================================
-- Migration: 20260612000001_role_rls_write_policies.sql
-- Purpose:   Replace permissive authenticated write policies
--            (created by restrict_all_rls_policies_to_authenticated)
--            with role-specific INSERT / UPDATE / DELETE policies.
--
-- SELECT policies are intentionally NOT touched here.
--
-- Performance note: (SELECT get_user_role()) evaluates ONCE per
-- statement instead of once per row.  Always use this sub-select
-- form; never use bare get_user_role() in policy expressions.
--
-- DO NOT apply to the live database until the signed-URL code
-- change is deployed and the bucket-private migration has been
-- reviewed.  This file is for review and staging only.
-- ============================================================


-- ============================================================
-- 1. FINANCIAL: bank_accounts
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
-- 2. FINANCIAL: bank_transactions
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
-- 3. FINANCIAL: bank_reconciliations
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
-- 4. FINANCIAL: income_records
--    INSERT : md, accountant
--    UPDATE : NONE (income records are immutable after creation)
--    DELETE : md, accountant
-- ============================================================
DROP POLICY IF EXISTS "income_records_insert" ON income_records;
CREATE POLICY "income_records_insert" ON income_records
  FOR INSERT WITH CHECK (
    (SELECT get_user_role()) = ANY(ARRAY['md','accountant'])
  );
-- DROP update policy and do NOT recreate: income_records are immutable
DROP POLICY IF EXISTS "income_records_update" ON income_records;
DROP POLICY IF EXISTS "income_records_delete" ON income_records;
CREATE POLICY "income_records_delete" ON income_records
  FOR DELETE USING (
    (SELECT get_user_role()) = ANY(ARRAY['md','accountant'])
  );


-- ============================================================
-- 5. FINANCIAL: receipts
--    INSERT/UPDATE : md, accountant
--    DELETE        : md
-- ============================================================
DROP POLICY IF EXISTS "receipts_insert" ON receipts;
CREATE POLICY "receipts_insert" ON receipts
  FOR INSERT WITH CHECK (
    (SELECT get_user_role()) = ANY(ARRAY['md','accountant'])
  );
DROP POLICY IF EXISTS "receipts_update" ON receipts;
CREATE POLICY "receipts_update" ON receipts
  FOR UPDATE
  USING      ((SELECT get_user_role()) = ANY(ARRAY['md','accountant']))
  WITH CHECK ((SELECT get_user_role()) = ANY(ARRAY['md','accountant']));
DROP POLICY IF EXISTS "receipts_delete" ON receipts;
CREATE POLICY "receipts_delete" ON receipts
  FOR DELETE USING ((SELECT get_user_role()) = 'md');


-- ============================================================
-- 6. PAYROLL: payroll_lines
--    INSERT/UPDATE : md, hr_officer  (accountant excluded per matrix)
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
-- 7. PAYROLL: payroll_runs
--    INSERT/UPDATE : md, hr_officer  (accountant excluded per matrix)
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
-- 8. EXPENSES
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
-- 9. EXPENSES: financial_adjustments
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
-- 10. EXPENSES: opening_balances
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
-- 11. EXPENSES: opening_balance_history
--     INSERT/UPDATE : md, accountant
--     DELETE        : md
-- ============================================================
DROP POLICY IF EXISTS "opening_balance_history_insert" ON opening_balance_history;
CREATE POLICY "opening_balance_history_insert" ON opening_balance_history
  FOR INSERT WITH CHECK (
    (SELECT get_user_role()) = ANY(ARRAY['md','accountant'])
  );
DROP POLICY IF EXISTS "opening_balance_history_update" ON opening_balance_history;
CREATE POLICY "opening_balance_history_update" ON opening_balance_history
  FOR UPDATE
  USING      ((SELECT get_user_role()) = ANY(ARRAY['md','accountant']))
  WITH CHECK ((SELECT get_user_role()) = ANY(ARRAY['md','accountant']));
DROP POLICY IF EXISTS "opening_balance_history_delete" ON opening_balance_history;
CREATE POLICY "opening_balance_history_delete" ON opening_balance_history
  FOR DELETE USING ((SELECT get_user_role()) = 'md');


-- ============================================================
-- 12. HR: staff
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
-- 13. HR: staff_documents
--     INSERT : md, hr_officer (any staff), OR self-upload
--              (any user whose user_profiles.staff_id matches
--               the staff_id being inserted)
--     UPDATE : NONE (documents are not editable after upload)
--     DELETE : md, hr_officer  (no self-delete)
-- ============================================================
DROP POLICY IF EXISTS "staff_documents_insert" ON staff_documents;
CREATE POLICY "staff_documents_insert" ON staff_documents
  FOR INSERT WITH CHECK (
    (SELECT get_user_role()) = ANY(ARRAY['md','hr_officer'])
    OR (
      -- Self-upload: user's linked staff record matches the document's staff_id
      staff_documents.staff_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM user_profiles
        WHERE user_profiles.id = auth.uid()
          AND user_profiles.staff_id = staff_documents.staff_id
      )
    )
  );
-- DROP update policy and do NOT recreate: documents are immutable
DROP POLICY IF EXISTS "staff_documents_update" ON staff_documents;
DROP POLICY IF EXISTS "staff_documents_delete" ON staff_documents;
CREATE POLICY "staff_documents_delete" ON staff_documents
  FOR DELETE USING (
    (SELECT get_user_role()) = ANY(ARRAY['md','hr_officer'])
  );


-- ============================================================
-- 14. HR: attendance
--     INSERT/UPDATE : md, hr_officer
--     DELETE        : md
-- ============================================================
DROP POLICY IF EXISTS "attendance_insert" ON attendance;
CREATE POLICY "attendance_insert" ON attendance
  FOR INSERT WITH CHECK (
    (SELECT get_user_role()) = ANY(ARRAY['md','hr_officer'])
  );
DROP POLICY IF EXISTS "attendance_update" ON attendance;
CREATE POLICY "attendance_update" ON attendance
  FOR UPDATE
  USING      ((SELECT get_user_role()) = ANY(ARRAY['md','hr_officer']))
  WITH CHECK ((SELECT get_user_role()) = ANY(ARRAY['md','hr_officer']));
DROP POLICY IF EXISTS "attendance_delete" ON attendance;
CREATE POLICY "attendance_delete" ON attendance
  FOR DELETE USING ((SELECT get_user_role()) = 'md');


-- ============================================================
-- 15. ORDERS / INVOICING: orders
--     INSERT : md, bdm, accountant, marketer
--     UPDATE : md, bdm, accountant  (marketer cannot edit orders)
--     DELETE : md
-- ============================================================
DROP POLICY IF EXISTS "orders_insert" ON orders;
CREATE POLICY "orders_insert" ON orders
  FOR INSERT WITH CHECK (
    (SELECT get_user_role()) = ANY(ARRAY['md','bdm','accountant','marketer'])
  );
DROP POLICY IF EXISTS "orders_update" ON orders;
CREATE POLICY "orders_update" ON orders
  FOR UPDATE
  USING      ((SELECT get_user_role()) = ANY(ARRAY['md','bdm','accountant']))
  WITH CHECK ((SELECT get_user_role()) = ANY(ARRAY['md','bdm','accountant']));
DROP POLICY IF EXISTS "orders_delete" ON orders;
CREATE POLICY "orders_delete" ON orders
  FOR DELETE USING ((SELECT get_user_role()) = 'md');


-- ============================================================
-- 16. ORDERS / INVOICING: order_items
--     INSERT : md, bdm, accountant, marketer
--     UPDATE : md, bdm, accountant
--     DELETE : md
-- ============================================================
DROP POLICY IF EXISTS "order_items_insert" ON order_items;
CREATE POLICY "order_items_insert" ON order_items
  FOR INSERT WITH CHECK (
    (SELECT get_user_role()) = ANY(ARRAY['md','bdm','accountant','marketer'])
  );
DROP POLICY IF EXISTS "order_items_update" ON order_items;
CREATE POLICY "order_items_update" ON order_items
  FOR UPDATE
  USING      ((SELECT get_user_role()) = ANY(ARRAY['md','bdm','accountant']))
  WITH CHECK ((SELECT get_user_role()) = ANY(ARRAY['md','bdm','accountant']));
DROP POLICY IF EXISTS "order_items_delete" ON order_items;
CREATE POLICY "order_items_delete" ON order_items
  FOR DELETE USING ((SELECT get_user_role()) = 'md');


-- ============================================================
-- 17. ORDERS / INVOICING: invoices
--     INSERT : md, bdm, accountant  (marketer excluded per matrix)
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
-- 18. ORDERS / INVOICING: payments
--     INSERT : md, accountant  (marketer/bdm removed per matrix)
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
-- 19. VEHICLES: vehicles
--     INSERT/UPDATE : md, logistics_manager
--     DELETE        : md
-- ============================================================
DROP POLICY IF EXISTS "vehicles_insert" ON vehicles;
CREATE POLICY "vehicles_insert" ON vehicles
  FOR INSERT WITH CHECK (
    (SELECT get_user_role()) = ANY(ARRAY['md','logistics_manager'])
  );
DROP POLICY IF EXISTS "vehicles_update" ON vehicles;
CREATE POLICY "vehicles_update" ON vehicles
  FOR UPDATE
  USING      ((SELECT get_user_role()) = ANY(ARRAY['md','logistics_manager']))
  WITH CHECK ((SELECT get_user_role()) = ANY(ARRAY['md','logistics_manager']));
DROP POLICY IF EXISTS "vehicles_delete" ON vehicles;
CREATE POLICY "vehicles_delete" ON vehicles
  FOR DELETE USING ((SELECT get_user_role()) = 'md');


-- ============================================================
-- 20. VEHICLES: vehicle_documents
--     INSERT/UPDATE : md, logistics_manager
--     DELETE        : md
-- ============================================================
DROP POLICY IF EXISTS "vehicle_documents_insert" ON vehicle_documents;
CREATE POLICY "vehicle_documents_insert" ON vehicle_documents
  FOR INSERT WITH CHECK (
    (SELECT get_user_role()) = ANY(ARRAY['md','logistics_manager'])
  );
DROP POLICY IF EXISTS "vehicle_documents_update" ON vehicle_documents;
CREATE POLICY "vehicle_documents_update" ON vehicle_documents
  FOR UPDATE
  USING      ((SELECT get_user_role()) = ANY(ARRAY['md','logistics_manager']))
  WITH CHECK ((SELECT get_user_role()) = ANY(ARRAY['md','logistics_manager']));
DROP POLICY IF EXISTS "vehicle_documents_delete" ON vehicle_documents;
CREATE POLICY "vehicle_documents_delete" ON vehicle_documents
  FOR DELETE USING ((SELECT get_user_role()) = 'md');


-- ============================================================
-- 21. VEHICLES: vehicle_fuel_log
--     INSERT/UPDATE : md, logistics_manager
--     DELETE        : md
-- ============================================================
DROP POLICY IF EXISTS "vehicle_fuel_log_insert" ON vehicle_fuel_log;
CREATE POLICY "vehicle_fuel_log_insert" ON vehicle_fuel_log
  FOR INSERT WITH CHECK (
    (SELECT get_user_role()) = ANY(ARRAY['md','logistics_manager'])
  );
DROP POLICY IF EXISTS "vehicle_fuel_log_update" ON vehicle_fuel_log;
CREATE POLICY "vehicle_fuel_log_update" ON vehicle_fuel_log
  FOR UPDATE
  USING      ((SELECT get_user_role()) = ANY(ARRAY['md','logistics_manager']))
  WITH CHECK ((SELECT get_user_role()) = ANY(ARRAY['md','logistics_manager']));
DROP POLICY IF EXISTS "vehicle_fuel_log_delete" ON vehicle_fuel_log;
CREATE POLICY "vehicle_fuel_log_delete" ON vehicle_fuel_log
  FOR DELETE USING ((SELECT get_user_role()) = 'md');


-- ============================================================
-- 22. VEHICLES: vehicle_maintenance
--     INSERT/UPDATE : md, logistics_manager
--     DELETE        : md
-- ============================================================
DROP POLICY IF EXISTS "vehicle_maintenance_insert" ON vehicle_maintenance;
CREATE POLICY "vehicle_maintenance_insert" ON vehicle_maintenance
  FOR INSERT WITH CHECK (
    (SELECT get_user_role()) = ANY(ARRAY['md','logistics_manager'])
  );
DROP POLICY IF EXISTS "vehicle_maintenance_update" ON vehicle_maintenance;
CREATE POLICY "vehicle_maintenance_update" ON vehicle_maintenance
  FOR UPDATE
  USING      ((SELECT get_user_role()) = ANY(ARRAY['md','logistics_manager']))
  WITH CHECK ((SELECT get_user_role()) = ANY(ARRAY['md','logistics_manager']));
DROP POLICY IF EXISTS "vehicle_maintenance_delete" ON vehicle_maintenance;
CREATE POLICY "vehicle_maintenance_delete" ON vehicle_maintenance
  FOR DELETE USING ((SELECT get_user_role()) = 'md');


-- ============================================================
-- 23. SUPPLIERS: suppliers
--     INSERT/UPDATE : md, accountant
--     DELETE        : md
-- ============================================================
DROP POLICY IF EXISTS "suppliers_insert" ON suppliers;
CREATE POLICY "suppliers_insert" ON suppliers
  FOR INSERT WITH CHECK (
    (SELECT get_user_role()) = ANY(ARRAY['md','accountant'])
  );
DROP POLICY IF EXISTS "suppliers_update" ON suppliers;
CREATE POLICY "suppliers_update" ON suppliers
  FOR UPDATE
  USING      ((SELECT get_user_role()) = ANY(ARRAY['md','accountant']))
  WITH CHECK ((SELECT get_user_role()) = ANY(ARRAY['md','accountant']));
DROP POLICY IF EXISTS "suppliers_delete" ON suppliers;
CREATE POLICY "suppliers_delete" ON suppliers
  FOR DELETE USING ((SELECT get_user_role()) = 'md');


-- ============================================================
-- 24. SUPPLIERS: supplier_documents
--     INSERT/UPDATE : md, accountant
--     DELETE        : md
-- ============================================================
DROP POLICY IF EXISTS "supplier_documents_insert" ON supplier_documents;
CREATE POLICY "supplier_documents_insert" ON supplier_documents
  FOR INSERT WITH CHECK (
    (SELECT get_user_role()) = ANY(ARRAY['md','accountant'])
  );
DROP POLICY IF EXISTS "supplier_documents_update" ON supplier_documents;
CREATE POLICY "supplier_documents_update" ON supplier_documents
  FOR UPDATE
  USING      ((SELECT get_user_role()) = ANY(ARRAY['md','accountant']))
  WITH CHECK ((SELECT get_user_role()) = ANY(ARRAY['md','accountant']));
DROP POLICY IF EXISTS "supplier_documents_delete" ON supplier_documents;
CREATE POLICY "supplier_documents_delete" ON supplier_documents
  FOR DELETE USING ((SELECT get_user_role()) = 'md');


-- ============================================================
-- 25. SUPPLIERS: supplier_transactions
--     INSERT/UPDATE : md, accountant
--     DELETE        : md
-- ============================================================
DROP POLICY IF EXISTS "supplier_transactions_insert" ON supplier_transactions;
CREATE POLICY "supplier_transactions_insert" ON supplier_transactions
  FOR INSERT WITH CHECK (
    (SELECT get_user_role()) = ANY(ARRAY['md','accountant'])
  );
DROP POLICY IF EXISTS "supplier_transactions_update" ON supplier_transactions;
CREATE POLICY "supplier_transactions_update" ON supplier_transactions
  FOR UPDATE
  USING      ((SELECT get_user_role()) = ANY(ARRAY['md','accountant']))
  WITH CHECK ((SELECT get_user_role()) = ANY(ARRAY['md','accountant']));
DROP POLICY IF EXISTS "supplier_transactions_delete" ON supplier_transactions;
CREATE POLICY "supplier_transactions_delete" ON supplier_transactions
  FOR DELETE USING ((SELECT get_user_role()) = 'md');


-- ============================================================
-- 26. WAYBILLS
--     INSERT/UPDATE : md, logistics_manager, store_officer
--     DELETE        : md
-- ============================================================
DROP POLICY IF EXISTS "waybills_insert" ON waybills;
CREATE POLICY "waybills_insert" ON waybills
  FOR INSERT WITH CHECK (
    (SELECT get_user_role()) = ANY(ARRAY['md','logistics_manager','store_officer'])
  );
DROP POLICY IF EXISTS "waybills_update" ON waybills;
CREATE POLICY "waybills_update" ON waybills
  FOR UPDATE
  USING      ((SELECT get_user_role()) = ANY(ARRAY['md','logistics_manager','store_officer']))
  WITH CHECK ((SELECT get_user_role()) = ANY(ARRAY['md','logistics_manager','store_officer']));
DROP POLICY IF EXISTS "waybills_delete" ON waybills;
CREATE POLICY "waybills_delete" ON waybills
  FOR DELETE USING ((SELECT get_user_role()) = 'md');


-- ============================================================
-- 27-35. LABOUR TABLES
--     INSERT/UPDATE : md, production_manager,
--                     assistant_production_manager,
--                     hr_officer, logistics_manager, ico
--     DELETE        : md
-- ============================================================
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'labour_pool','labour_roles','labour_rate_change_requests',
    'weekly_labour_payroll','daily_roster','daily_roster_entries',
    'truck_loading_log','truck_loading_loaders','truck_loader_assignments'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_insert', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR INSERT WITH CHECK (
        (SELECT get_user_role()) = ANY(ARRAY[''md'',''production_manager'',
          ''assistant_production_manager'',''hr_officer'',
          ''logistics_manager'',''ico''])
      )', t || '_insert', t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_update', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR UPDATE
        USING      ((SELECT get_user_role()) = ANY(ARRAY[''md'',''production_manager'',
          ''assistant_production_manager'',''hr_officer'',
          ''logistics_manager'',''ico'']))
        WITH CHECK ((SELECT get_user_role()) = ANY(ARRAY[''md'',''production_manager'',
          ''assistant_production_manager'',''hr_officer'',
          ''logistics_manager'',''ico'']))',
      t || '_update', t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_delete', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR DELETE USING ((SELECT get_user_role()) = ''md'')',
      t || '_delete', t);
  END LOOP;
END;
$$;


-- ============================================================
-- 36-44. PRODUCTION / INVENTORY TABLES
--     INSERT/UPDATE : md, production_manager,
--                     assistant_production_manager, store_officer
--     DELETE        : md
-- ============================================================
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'production_log','batches','batch_production_links',
    'inventory_items','inventory_log','stock_movements',
    'finished_goods_stock','damage_log','production_targets'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_insert', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR INSERT WITH CHECK (
        (SELECT get_user_role()) = ANY(ARRAY[''md'',''production_manager'',
          ''assistant_production_manager'',''store_officer''])
      )', t || '_insert', t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_update', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR UPDATE
        USING      ((SELECT get_user_role()) = ANY(ARRAY[''md'',''production_manager'',
          ''assistant_production_manager'',''store_officer'']))
        WITH CHECK ((SELECT get_user_role()) = ANY(ARRAY[''md'',''production_manager'',
          ''assistant_production_manager'',''store_officer'']))',
      t || '_update', t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_delete', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR DELETE USING ((SELECT get_user_role()) = ''md'')',
      t || '_delete', t);
  END LOOP;
END;
$$;


-- ============================================================
-- 45-50. CUSTOMERS / DELIVERY TABLES
--     INSERT/UPDATE : md, bdm, marketer, logistics_manager
--     DELETE        : md
-- ============================================================
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'customers','customer_sites','deliveries',
    'delivery_schedules','delivery_schedule_items',
    'pending_delivery_register'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_insert', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR INSERT WITH CHECK (
        (SELECT get_user_role()) = ANY(ARRAY[''md'',''bdm'',''marketer'',''logistics_manager''])
      )', t || '_insert', t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_update', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR UPDATE
        USING      ((SELECT get_user_role()) = ANY(ARRAY[''md'',''bdm'',''marketer'',''logistics_manager'']))
        WITH CHECK ((SELECT get_user_role()) = ANY(ARRAY[''md'',''bdm'',''marketer'',''logistics_manager'']))',
      t || '_update', t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_delete', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR DELETE USING ((SELECT get_user_role()) = ''md'')',
      t || '_delete', t);
  END LOOP;
END;
$$;


-- ============================================================
-- 51. LPO: lpo_orders
--     INSERT/UPDATE : md, bdm
--     DELETE        : md
-- ============================================================
DROP POLICY IF EXISTS "lpo_orders_insert" ON lpo_orders;
CREATE POLICY "lpo_orders_insert" ON lpo_orders
  FOR INSERT WITH CHECK (
    (SELECT get_user_role()) = ANY(ARRAY['md','bdm'])
  );
DROP POLICY IF EXISTS "lpo_orders_update" ON lpo_orders;
CREATE POLICY "lpo_orders_update" ON lpo_orders
  FOR UPDATE
  USING      ((SELECT get_user_role()) = ANY(ARRAY['md','bdm']))
  WITH CHECK ((SELECT get_user_role()) = ANY(ARRAY['md','bdm']));
DROP POLICY IF EXISTS "lpo_orders_delete" ON lpo_orders;
CREATE POLICY "lpo_orders_delete" ON lpo_orders
  FOR DELETE USING ((SELECT get_user_role()) = 'md');


-- ============================================================
-- 52-54. REFERENCE / LOOKUP: app_roles, products,
--         expense_categories
--     INSERT/UPDATE/DELETE : md
-- ============================================================
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['app_roles','products','expense_categories'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_insert', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR INSERT WITH CHECK ((SELECT get_user_role()) = ''md'')',
      t || '_insert', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_update', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR UPDATE
        USING      ((SELECT get_user_role()) = ''md'')
        WITH CHECK ((SELECT get_user_role()) = ''md'')',
      t || '_update', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_delete', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR DELETE USING ((SELECT get_user_role()) = ''md'')',
      t || '_delete', t);
  END LOOP;
END;
$$;


-- ============================================================
-- 55. REFERENCE: staff_roles
--     INSERT/UPDATE : md, hr_officer
--     DELETE        : md
-- ============================================================
DROP POLICY IF EXISTS "staff_roles_insert" ON staff_roles;
CREATE POLICY "staff_roles_insert" ON staff_roles
  FOR INSERT WITH CHECK (
    (SELECT get_user_role()) = ANY(ARRAY['md','hr_officer'])
  );
DROP POLICY IF EXISTS "staff_roles_update" ON staff_roles;
CREATE POLICY "staff_roles_update" ON staff_roles
  FOR UPDATE
  USING      ((SELECT get_user_role()) = ANY(ARRAY['md','hr_officer']))
  WITH CHECK ((SELECT get_user_role()) = ANY(ARRAY['md','hr_officer']));
DROP POLICY IF EXISTS "staff_roles_delete" ON staff_roles;
CREATE POLICY "staff_roles_delete" ON staff_roles
  FOR DELETE USING ((SELECT get_user_role()) = 'md');


-- ============================================================
-- 56. REPORTING: report_history
--     INSERT : any authenticated user (audit trail)
--     UPDATE : md
--     DELETE : md
-- ============================================================
DROP POLICY IF EXISTS "report_history_insert" ON report_history;
CREATE POLICY "report_history_insert" ON report_history
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "report_history_update" ON report_history;
CREATE POLICY "report_history_update" ON report_history
  FOR UPDATE
  USING      ((SELECT get_user_role()) = 'md')
  WITH CHECK ((SELECT get_user_role()) = 'md');
DROP POLICY IF EXISTS "report_history_delete" ON report_history;
CREATE POLICY "report_history_delete" ON report_history
  FOR DELETE USING ((SELECT get_user_role()) = 'md');


-- ============================================================
-- 57. USER PROFILES: user_profiles
--     INSERT : md (trigger handle_new_auth_user uses SECURITY
--              DEFINER and bypasses RLS — this policy is for
--              manual admin inserts only)
--     UPDATE : own row, OR md
--     DELETE : md
-- ============================================================
DROP POLICY IF EXISTS "user_profiles_insert" ON user_profiles;
CREATE POLICY "user_profiles_insert" ON user_profiles
  FOR INSERT WITH CHECK ((SELECT get_user_role()) = 'md');
DROP POLICY IF EXISTS "user_profiles_update" ON user_profiles;
CREATE POLICY "user_profiles_update" ON user_profiles
  FOR UPDATE
  USING      (id = auth.uid() OR (SELECT get_user_role()) = 'md')
  WITH CHECK (id = auth.uid() OR (SELECT get_user_role()) = 'md');
DROP POLICY IF EXISTS "user_profiles_delete" ON user_profiles;
CREATE POLICY "user_profiles_delete" ON user_profiles
  FOR DELETE USING ((SELECT get_user_role()) = 'md');


-- ============================================================
-- 58-62. IMPORT TABLES
--     INSERT/UPDATE/DELETE : md, accountant
-- ============================================================
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'import_batches','import_staging_rows','bank_import_batches',
    'historical_payments_import','historical_payroll_import'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_insert', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR INSERT WITH CHECK (
        (SELECT get_user_role()) = ANY(ARRAY[''md'',''accountant''])
      )', t || '_insert', t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_update', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR UPDATE
        USING      ((SELECT get_user_role()) = ANY(ARRAY[''md'',''accountant'']))
        WITH CHECK ((SELECT get_user_role()) = ANY(ARRAY[''md'',''accountant'']))',
      t || '_update', t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_delete', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR DELETE USING (
        (SELECT get_user_role()) = ANY(ARRAY[''md'',''accountant''])
      )', t || '_delete', t);
  END LOOP;
END;
$$;
