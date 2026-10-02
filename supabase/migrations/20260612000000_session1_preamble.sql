-- ============================================================
-- Migration: 20260612000000_session1_preamble.sql
-- ALREADY APPLIED TO LIVE DATABASE on 2026-06-12.
-- DO NOT re-run.  This file exists solely so the repository's
-- migration history matches what was actually applied to the DB
-- during SESSION 1 — ROLE-LEVEL SECURITY.
--
-- Context: when 20260612000001_role_rls_write_policies.sql was
-- applied, several legacy policy artefacts on the live database
-- had to be cleaned up first.  Those operations are recorded
-- here in the order they were executed.
-- ============================================================


-- ============================================================
-- STEP 1: Drop legacy permissive policies that predated the
--         session-1 role-policy migration.
-- ============================================================

-- "allow_all" catch-all policies present on four tables
DROP POLICY IF EXISTS "allow_all" ON invoices;
DROP POLICY IF EXISTS "allow_all" ON payments;
DROP POLICY IF EXISTS "allow_all" ON staff;
DROP POLICY IF EXISTS "allow_all" ON weekly_labour_payroll;

-- Legacy "staff_write" policy on staff (superseded by staff_insert /
-- staff_update / staff_delete in the role-policy migration)
DROP POLICY IF EXISTS "staff_write" ON staff;

-- Duplicate short-prefix policy sets on financial_adjustments and
-- opening_balances that coexisted with the full-name policies
DROP POLICY IF EXISTS "fa_select" ON financial_adjustments;
DROP POLICY IF EXISTS "fa_insert" ON financial_adjustments;
DROP POLICY IF EXISTS "fa_update" ON financial_adjustments;
DROP POLICY IF EXISTS "fa_delete" ON financial_adjustments;

DROP POLICY IF EXISTS "ob_select" ON opening_balances;
DROP POLICY IF EXISTS "ob_insert" ON opening_balances;
DROP POLICY IF EXISTS "ob_update" ON opening_balances;
DROP POLICY IF EXISTS "ob_delete" ON opening_balances;


-- ============================================================
-- STEP 2: Normalize SELECT to all-authenticated on the four
--         tables whose SELECT policies had been masked by the
--         now-dropped "allow_all" policies.
-- ============================================================
DROP POLICY IF EXISTS "invoices_select" ON invoices;
CREATE POLICY "invoices_select" ON invoices
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "payments_select" ON payments;
CREATE POLICY "payments_select" ON payments
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "staff_select" ON staff;
CREATE POLICY "staff_select" ON staff
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "weekly_labour_payroll_select" ON weekly_labour_payroll;
CREATE POLICY "weekly_labour_payroll_select" ON weekly_labour_payroll
  FOR SELECT USING (auth.uid() IS NOT NULL);


-- ============================================================
-- STEP 3: Add own-document clause to staff_documents SELECT so
--         users can read their own documents regardless of role.
-- ============================================================
DROP POLICY IF EXISTS "staff_documents_select" ON staff_documents;
CREATE POLICY "staff_documents_select" ON staff_documents
  FOR SELECT USING (
    -- HR / admin roles see all documents
    (SELECT get_user_role()) = ANY(ARRAY[
      'md','hr_officer','ico','board_member',
      'production_manager','assistant_production_manager'
    ])
    -- Any user can see documents uploaded against their own user account
    OR user_id = auth.uid()
    -- Any user can see documents linked to their own staff record
    OR EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
        AND user_profiles.staff_id = staff_documents.staff_id
    )
  );
