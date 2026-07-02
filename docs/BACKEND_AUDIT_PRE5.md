# BACKEND AUDIT (pre-#5) — FINDINGS REPORT

**Date:** 2026-07-02 · **Project:** kcijsspzteglqqnffokb · **Auditor:** Claude Code (Session 12)
**Scope:** the five categories defined in `UNIFIED_MASTER_STATE_AND_PLAN.md` §3 "Full backend audit (pre-#5)".
**Method:** findings collected here for MD decision, EXCEPT confirmed security exposures (unauthenticated access / data leak), which were fixed on discovery and are reported as such.
**Out of scope:** runtime/UI behavior (covered by the MD role-based smoke test).

DB facts verified by live query against production. Frontend facts verified by reading `main` at commit `dcd3e79`.

---

## 0. HEADLINE

- **1 confirmed unauthenticated exposure — FIXED ON DISCOVERY** (anon could read order line items). Applied via connector, verified closed.
- **3 new occurrences of the "missing scoping filter" bug class** (the PR #37 class) in My HR self-service — needs code PRs.
- **8 role-exemption gaps** (the ICO `my_hr` class) — mostly board_member and ICO export/nav buttons — needs code PRs.
- **2 RLS role-matrix defects** (one functional `'hr'` vs `'hr_officer'` typo; one over-permissive audit read).
- **Category 5 (state-machine guards): CLEAN.**
- **Hardening batch:** ~15 SECURITY DEFINER functions carry needless `anon EXECUTE` (all internally role-guarded, not exploitable).

---

## CATEGORY 2 — SECURITY DEFINER / grants  → 1 EXPOSURE (FIXED) + hardening

### ✅ FIXED ON DISCOVERY — anon read of `order_items_delivery`
- **What:** `public.order_items_delivery` is a postgres-owned view **without `security_invoker`**, so it runs with the owner's rights and **bypasses RLS** on `order_items`. `SELECT` was granted to the `anon` role, and the anon key is public (shipped in the frontend bundle).
- **Proof:** `SET LOCAL role anon; SELECT count(*) FROM order_items_delivery;` → **47 rows** (order_id, block_type, quantity). No money, PII, or customer names in the view.
- **Fix applied:** `REVOKE SELECT ON public.order_items_delivery FROM anon;` (+ same for `disciplinary_self`, see below). Verified: anon now gets "permission denied"; `authenticated` retains SELECT. SQL saved to `supabase/audit_s12_revoke_anon_view_select.sql`.

### ✅ FIXED (hardening, same statement) — anon grant on `disciplinary_self`
- `disciplinary_self` was anon-selectable and also bypasses RLS, but self-scopes via `current_staff_id()`, which is NULL for anon → returned 0 rows. No leak, but anon had no business holding the grant. Revoked alongside the above.

### ⚠ HARDENING (report-only, not exploitable) — `anon EXECUTE` on SECURITY DEFINER functions
- ~15 SECURITY DEFINER functions still grant `EXECUTE` to `anon`: `advance_leave_request`, `advance_salary_advance`, `advance_staff_payroll`, `advance_disciplinary`, `issue_disciplinary_case`, `run_annual_leave_rollover`, `expire_annual_carryover`, `seed_leave_balances_draft`, `set_leave_entitlement`, `set_leave_policy_active`, `current_staff_id`, `get_next_employee_number`, `apply_leave_balance_usage`, `realize_advance_repayments`.
- **Not exploitable:** every one guards internally on `get_user_role()` / `auth.uid()` / `user_profiles` lookup, all of which resolve to NULL for anon → the function raises before doing anything.
- **Recommendation:** `REVOKE EXECUTE ... FROM anon` as defense-in-depth. Low priority.
- **Note (good):** the sensitive kiosk/payroll functions already have `anon_exec = false` (`get_kiosk_pin_sync`, `set_my_kiosk_pin`, `set_staff_pin`, `submit_attendance_flag_response`, `reconcile_attendance_punches`, `advance_weekly_payroll`, `get_user_role`). `set_my_kiosk_pin`/`set_staff_pin` correctly carry `search_path = public, extensions` (the documented pgcrypto-schema requirement).

---

## CATEGORY 1 — RLS policies vs role matrix  → 2 DEFECTS

### ⚠ DEFECT (functional) — `staff_leave_balances` role typo `'hr'`
- `leave_balances_read` USING: `(staff_id = current_staff_id()) OR (get_user_role() = ANY (ARRAY['md','ico','accountant','hr']))`.
- The app's HR role is **`hr_officer`** everywhere else; `'hr'` matches no role. So `hr_officer` does **not** get global read here — the management all-staff leave-balance table (StaffHR `LeaveBalancesTab`, `leaveBalanceService.getBalances`) returns only the officer's own row (or nothing).
- **Not a leak** (under-permissive), but a real functional break for hr_officer. Fix: change `'hr'` → `'hr_officer'` in the policy. **DB change → MD/planning chat.**

### ⚠ DEFECT (minor over-permissive) — `weekly_payroll_audit` world-readable
- `wpa_select` USING `true` → readable by **every authenticated role** (driver, marketer, store_officer…). Columns: id, payroll_id, actor_id/name/role, action, old/new_status, reason, created_at. **No money columns**, but it leaks who-approved-what workflow history + actor names.
- Inconsistent with the three peer audit tables (`leave_request_audit`, `salary_advance_audit`, `staff_payroll_audit`), all restricted to management roles. Fix: restrict `wpa_select` to `['md','accountant','ico','board_member']` (match `staff_payroll_audit`). **DB change → MD/planning chat.**

### Notes (acceptable as-is)
- `leave_policy_settings.leave_settings_read` USING `true` — policy config (annual_days, caps, active flag), no personal data; My HR reads it. Acceptable.
- All 6 PUBLIC-applicable policies (attendance, attendance_punches, staff_pin_cache, staging_transactions) are auth-gated in their quals (`auth.uid()` / `get_user_role()`), so anon is blocked despite the default table grants — standard Supabase posture, correct.
- Money/PII safe-views (`staff_public`, `staff_payroll`, `invoices_safe`, `payments_safe`, `staff_directory`) all have `anon_select = false` and are correctly column-restricted / role-gated. Intact from Session 6.

---

## CATEGORY 3 — frontend missing scoping filters  → 3 NEW (PR #37 class)

All three are in `MyHRPage` (`src/App.jsx:7058`), reachable by any role with a linked `staff_id`. These roles already have legitimate management-side access to this data, so it is **not a privilege escalation** — it is the same scoping/correctness defect as PR #37 (which was handled as a normal reviewed PR, not an emergency). Recommend fixing the same way: add self-scoped service methods and call them from My HR after `getMyStaff()` resolves.

1. **`advancesService.list()` — `salary_advances`, no `staff_id` filter** (`src/services/advances.js:4`). My HR "My Advances" (rendered `App.jsx:7281`) shows **all staff advances** (amounts, installments, reasons, statuses) to md/ico/accountant/hr_officer.
2. **`leaveService.list()` — `leave_requests`, no `staff_id` filter** (`src/services/leave.js:4`). My HR "My Leave" (`App.jsx:7323`) shows **all staff leave** including reasons (sick/compassionate can be sensitive) to the same roles.
3. **`kioskService.getMyAttendance(from,to)` — `attendance`, no `staff_id` filter** (`src/services/kioskService.js:50`). My HR "My Attendance" (`App.jsx:7439`) shows **all staff attendance** (present/hours/flags/reasons) to md/hr_officer/production_manager/assistant_production_manager, and even renders the "Respond" action on other people's flagged rows.

**Verified clean (no regression):** `getMyStaff` (PR #30 fix intact), `getMyBalance` (PR #37 fix intact, caller passes `staff.id`), `disciplinaryService.getMine` (uses server-scoped `disciplinary_self`), `MyProfile` (filters by id/user_id), driver waybills (`.eq('driver_id')`), marketer orders/customers (`.eq('marketer_id')`/`.eq('added_by')`).

**One item to confirm with MD:** the Dashboard fetches `ordersService.getAll()` for the marketer role (`App.jsx:352`) while OrdersPage scopes marketers to `getAllForMarketer` — if `orders` RLS lets marketers read all rows, the dashboard shows all-company orders to marketers. Confirm intended.

---

## CATEGORY 4 — role-exemption lists vs pages  → 8 GAPS (ICO my_hr class)

The board mask (`[data-board-view]`) is applied on **every page with no exemption list at all** (`App.jsx:8418`); the ICO mask has an exemption set that has drifted from the ICO banner's set. All are functional (under-permissive) bugs — buttons a read-only role legitimately needs are hidden — needing `data-*-allow` attributes or exemption-list entries. None is a security issue.

| # | Page | Role | Hidden that shouldn't be | Fix location |
|---|---|---|---|---|
| 1 | dashboard | board_member | "Download Report" button | `BoardDashboard.jsx:513` add `data-board-allow` |
| 2 | my_profile | board_member | tabs, doc upload/delete, change-password (entire page unusable) | `App.jsx:6554,6593,6611,6629,6633,6636` add `data-board-allow` |
| 3 | my_hr | board_member | all self-service actions — **LATENT**: board account has no `staff_id` today, so unreachable now | board mask exemption list (`App.jsx:8418`) |
| 4 | accounting | ico + board_member | tab navigation (stuck on tab 1; the PDF buttons already allowed are unreachable) | `App.jsx:6374` add both allow attrs; add `accounting` to ICO mask set |
| 5 | reports | ico | Generate PDF / Excel / Generate (board already allowed) | `Reports.jsx:934,938,1036` add `data-ico-allow` |
| 6 | kpi_dashboard | ico + board_member | tabs, date presets, PDF | `KPIDashboard.jsx:464,466,474,488` add allow attrs |
| 7 | daily_schedule | ico | Print PDF (board already allowed) | `App.jsx:3717` add `data-ico-allow` |
| 8 | dashboard | ico | "This Month" date-reset (minor); ICO mask set omits `dashboard` while ICO banner exempts it | `App.jsx:479` allow attr, or add `dashboard` to ICO mask set |

**Structural recommendation:** key both the mask and the banner off the same `safePage` variable and a single shared exempt-set constant (the two ICO lists already diverge in content — `dashboard` is in the banner set but not the mask set — the same drift pattern that produced the original `my_hr` bug).

**Confirm with MD:** `LPOApprovals` has no internal role gating — the CSS mask is the only thing stopping ICO/board from clicking Approve/Reject, and it also hides the "Review" expand button so ICO can't inspect LPO details. View-only appears intended; whether ICO should at least be able to expand/review is an MD call.

---

## CATEGORY 5 — state-machine guard coverage  → CLEAN

Every money/HR state table has an **enabled** guard trigger:
`payroll_runs` (`trg_staff_payroll_guard` + `trg_realize_advance_repayments`), `salary_advances` (`trg_salary_advance_guard`), `leave_requests` (`trg_leave_request_guard` + `trg_apply_leave_balance_usage`), `disciplinary_cases` (`trg_disciplinary_status_guard`), `weekly_labour_payroll` (`trg_weekly_payroll_guard`), `staff` (`trg_staff_onboarding_gate`), plus eligibility gates on `attendance`/`payroll_lines`. Writes to disciplinary/leave/advance/payroll flow through SECURITY DEFINER RPCs with role + transition checks. No gaps.

---

## RECOMMENDED DISPOSITION (for MD)

1. **Done (this session):** anon view exposure — fixed + verified.
2. **DB changes (MD via planning chat):** (a) `staff_leave_balances` `'hr'`→`'hr_officer'`; (b) restrict `weekly_payroll_audit` read to management; (c) optional `REVOKE EXECUTE ... FROM anon` hardening batch.
3. **Code PRs (Claude Code writes, MD merges), one scope each:** (a) My HR scoping filters (3 findings, Category 3); (b) role-exemption gaps (Category 4) with the shared-exempt-set refactor.
4. **Confirm with MD:** marketer dashboard order visibility; ICO LPO review access.
5. **After audit close:** re-plan #5 (payment/accounting) per the roadmap.
