# APC MANAGER — UNIFIED MASTER STATE & PLAN
**Single source of truth. Supersedes all prior handoffs on points of conflict.**

Repo: `amaliyu/muktar24` (PRIVATE) · Prod branch: `main` · Stack: React 18 + Vite 5 + Supabase (PostgreSQL, RLS) + Vercel
App: APC Manager — internal ERP for Abuja Precast Concrete Limited
**Updated: 2026-07-07 (Session 14 — storage-policy cleanup).** All DB state verified by live query, not memory.
**Status: BETA. A physical/manual backup system runs in parallel — NO downtime pressure.**
**Operating mode: SLOW AND VERIFIED — fix on a branch → test on the branch's Vercel preview AS THE AFFECTED ROLE → confirm with own eyes → MD merges → re-verify production.**

---

## 0. HOW THIS DOCUMENT IS USED
- This is the master. On conflict: **live DB facts win**, then this doc.
- Repo is private → planning chats (Claude.ai) have NO GitHub access unless the repo is public. (Repo is currently PUBLIC as of Session 6 — planning chat could read it directly; revert to private when convenient and brief via this file.)
- Division of labour: **Claude Code writes code/SQL files & opens PRs; the MD merges. Migrations are applied from the planning chat via the Supabase connector using `apply_migration` (tracked), with before/after verification.**
- Preview = branch code against the PRODUCTION database (one Supabase project). So test data created on a preview is REAL data and must be cleaned.

---

## 1. SESSION HISTORY (most recent first)

### ✅ SESSION 14 (2026-07-07) — STORAGE-POLICY CLEANUP (planning-chat SQL, no code PR)
**Scope: storage-policy cleanup only. Phase 5 schema is the thread after this one — not started here.**

**Kiosk fix verified live (first check this session):** newest `attendance_punches` row (2026-07-06 05:11:06) has `photo_storage_path` populated (`has_photo = true`); the four rows immediately before it (2026-07-04, pre-fix) are null. Confirms the camera-capture fix from the attendance kiosk work is landing correctly in production, not a fluke.

**Storage RLS cleanup — replaced 4 permissive `public_*` policies + 3 receipts-specific leftovers with per-bucket role-scoped policies, one bucket at a time, additive-then-tighten (S6 pattern):**
- Bucket-level state checked first: all 5 target buckets (`receipts`, `lpo-documents`, `supplier-documents`, `vehicle-documents`, `attendance-photos`) were already `public: false` — no unauthenticated exposure at the bucket level. The gap was entirely at the `storage.objects` RLS layer: `public_insert` had **zero bucket restriction at all** (any authenticated user could write to any bucket, including `staff-documents`), and `public_select`/`update`/`delete` excluded only `staff-documents` — meaning any authenticated user (driver, marketer, etc.) could read/write/delete receipts, LPO docs, supplier docs, and vehicle docs directly via the storage API, bypassing the app UI entirely.
- Role scoping derived from actual app code (who reaches the page, who's blocked by an explicit role check vs. just CSS-masked): `receipts` → write md/accountant, view +ico/board_member; `lpo-documents` → write md/accountant/bdm/marketer, view +ico/board_member (no delete/update path exists in code, so none granted); `supplier-documents` → write md/accountant, view +ico/board_member; `vehicle-documents` → write md/logistics_manager, view +ico/board_member (covers both `vehicle_documents` table uploads and `vehicle_maintenance` receipts — same bucket); `attendance-photos` → write-only md/hr_officer (ALL, since `upsert:true` needs UPDATE too; no viewer role — nothing in the app displays these photos yet).
- **Side-effect finding:** dropping the four generic policies also closed two loopholes on buckets outside this scope — `staff-documents`' own folder-ownership INSERT policy and `staff-photos`' own role-scoped policies were both being silently bypassed by the generic `public_insert`/`select`/`update`/`delete` (the former excluded `staff-documents` for 3 of 4 ops but not INSERT; the latter never excluded `staff-photos` at all). Both buckets already had complete, correct dedicated policies — removing the generic override was sufficient, no new policies needed for them.
- **Verification method:** live DB, not a browser session (container has no Supabase credentials to log in as each role). Instead: (1) isolated the exact role-matching boolean logic per bucket and checked it against real `user_profiles` rows for all 8 app roles; (2) after dropping the generic policies, ran real `SELECT`/`INSERT` queries against `storage.objects` inside rolled-back transactions, switching to the `authenticated` Postgres role and setting `request.jwt.claim.sub` per simulated user (the same GUC `auth.uid()` reads) — confirmed the full 8-role × 7-bucket SELECT matrix matches design exactly (e.g. `driver` = 0 rows on every bucket; `bdm` = access to `lpo-documents` only; `hr_officer` = access to `attendance-photos`/`staff-photos`/`staff-documents` only), plus a positive INSERT (accountant → receipts, succeeds) and negative INSERT (driver → receipts, throws `new row violates row-level security policy`).
- Applied as tracked migration `storage_policy_cleanup_role_scoped_buckets` (20260707185124) via `apply_migration`, idempotent (`DROP POLICY IF EXISTS` + `CREATE POLICY` pairs) so the migration history matches the already-verified live state exactly.
- **Stale doc item closed:** the §7 "Receipts storage bucket PUBLIC" row (open since S13) is now fully resolved — bucket flipped private (PR #44), extended to the other 3 doc buckets (PR #45), and the RLS layer tightened this session. See updated §7 row.

### 🔵 SESSION 13 (2026-07-03) — PHASE 5 RE-PLAN (payment-request + ingestion) — DESIGN LOCKED
**No code/schema this session — design only. Full locked design in §8. Schema NOT started (blocked on §8 Pre-schema verification).**
- MD ratified 13 decisions + a 5-sub-phase map (5a–5e) for the EXPENDITURE-side payment-request + statement-ingestion engine. Revenue matching is committed as **5d** (not a deferral). Old §3 "(revenue)" label was stale — Phase 5 is expenditure-first.
- **WR#1 gate satisfied:** the audit Category-4 code PR (#41, role-exemption fixes) is **merged** — Phase 5 is unblocked to begin scheduling.
- **Pre-schema verification (WR#8):** items 1 & 2 discharged by Claude Code this session (live column shapes for `stock_movements`/`staging_transactions`; Phase 0 parser wiring in App.jsx — see §8). Items 3 (accountant posting-behaviour reconfirm) & 4 (real Moniepoint xlsx through SheetJS) remain open — need a human/the file. Schema session stays blocked until all four close.
- Live-DB re-verified this session (matches §8 claims exactly): `bank_accounts`=4 (dedupe pending), `bank_transactions`=1,277, `expenses`=43, `expense_categories`=13, `expenses` guard trigger=**0** (confirms it is a soft-status column, not a state machine).

### ✅ SESSION 12 (2026-07-02) — BACKEND AUDIT (pre-#5) + AUDIT CODE FIXES
**PRs merged: #39 (audit report + anon-view REVOKE), #40 (My HR scoping filters, Cat-3), #41 (role-exemption gaps, Cat-4). Audit stream CLOSED.**
- Executed the five-category backend audit (see §3 scope). Report: `docs/BACKEND_AUDIT_PRE5.md`.
- **1 confirmed unauthenticated exposure fixed on discovery:** `order_items_delivery` (postgres-owned view, bypassed RLS) was anon-selectable — REVOKEd (also `disciplinary_self`); recorded in migration `audit_s12_revoke_anon_order_items_delivery`.
- **DB fixes applied** (migration `audit_s12_disposition_db_fixes`): `staff_leave_balances` `'hr'`→`'hr_officer'`; `weekly_payroll_audit` read restricted to management; anon EXECUTE revoked across 15 SECURITY DEFINER funcs (now zero). **LPO approval MD-only** now DB-enforced via `trg_guard_lpo_md_decision` (migration `audit_s12_lpo_md_only_decision_guard`).
- **Code fixes:** Cat-3 My HR scoping (PR #40 — `advancesService.listMine`/`leaveService.listMine`/`getMyAttendance(staffId,…)`); Cat-4 role-exemption gaps (PR #41 — shared `ICO_EXEMPT_PAGES`/`BOARD_EXEMPT_PAGES` constants + 8 button/exemption fixes).
- **MD rulings recorded:** marketer dashboard all-orders visibility = INTENDED; LPO approval = MD-only (DB-enforced).

### ✅ SESSION 11 (2026-07-01/02) — LEAVE YEAR-END CONTROLS + ATTENDANCE KIOSK (Phase 4d) + FIXES
**PRs merged: #33 (year-end controls), #34 (docs revert), #35 (attendance kiosk), #37 (leave-balance scoping fix). #36 closed UNMERGED (stale base — see near-miss note below). Frontend only — DB is fully live.**

**Leave year-end controls (PR #33, merged):**
- `src/services/leaveBalance.js`: added `runRollover(fromYear)` → RPC `run_annual_leave_rollover(p_from_year)` and `expireCarryover(year)` → RPC `expire_annual_carryover(p_year)`.
- `src/components/StaffHR.jsx` (`LeaveBalancesTab`): MD-only "Year-end Controls" card — `runRollover` button (confirm-gate) + `expireCarryover` button (confirm-gate), same pattern as existing Activate/Deactivate.

**Attendance kiosk — Phase 4d (merged: PR #34 revert + PR #35 kiosk):**

**Scope:** Permanent/salaried staff only. Daily workers remain fully manual/analog — this system does not touch Labour.jsx or labour payroll in any way.

**DB (already live — no DB changes this session):**
- `attendance_punches` table: staff_id, punch_time, punch_type (IN/OUT), verification_method, photo_storage_path, device_source, recorded_by_user; deduplicated via `punch_minute` column (trigger-populated).
- `staff_pin_cache`: staff_id, pin_hash (SHA-256 hex), is_active. Partial unique index on `pin_hash WHERE is_active = true` prevents duplicate PINs across active staff — both set-PIN RPCs surface this as a clear error.
- `attendance` table: existing table extended with flagged, flag_reason, flag_response, flag_responded_at.
- RPCs:
  - `get_kiosk_pin_sync()` — returns staff_id, employee_number, pin_hash for all active staff (used by kiosk on startup/sync)
  - `reconcile_attendance_punches(date)` — **RESOLVED: pg_cron job `reconcile-attendance-punches-nightly` runs nightly at 20:00 UTC (21:00 WAT)**
  - `submit_attendance_flag_response(p_attendance_id, p_response)` — employee submits explanation
  - `set_staff_pin(p_staff_id, p_pin)` — HR-managed PIN assignment (md/hr_officer); validates 4–6 digits, hashes server-side
  - `set_my_kiosk_pin(p_pin)` — self-service PIN; resolves caller's own staff_id server-side; same validation
- `attendance-photos` storage bucket: live.
- **pgcrypto schema note:** On this project, pgcrypto lives in the `extensions` schema (not `public`). Any future SECURITY DEFINER function using `digest()` or `crypt()` must include `SET search_path = public, extensions` in its definition or it will throw "function digest() does not exist". Both set-PIN RPCs already handle this.

**Identification method:** The existing staff ID card barcode (CODE128, encodes `employee_number`) is the primary punch method — no new badges required. PIN is the fallback when the barcode is unavailable or the BarcodeDetector API is not supported.

**Frontend (this session):**
- `src/services/kioskService.js` (new): 7 methods — `syncPins`, `uploadPunches`, `uploadPhoto`, `getFlagged`, `resolveFlag`, `getMyAttendance`, `submitFlagResponse`.
- `src/components/AttendanceKiosk.jsx` (new): full offline-first kiosk component.
  - IndexedDB (`apc_kiosk_v1`): `staff_cache` (keyPath: staff_id) + `punch_queue` (autoIncrement local_id).
  - SHA-256 offline PIN verification via Web Crypto API (`crypto.subtle.digest`). `pin_hash` is confirmed stored as SHA-256 hex.
  - BarcodeDetector API (CODE128, `{ formats: ['code_128'] }`) in rAF scan loop. Falls back to PIN pad if API unavailable.
  - Front-camera (`facingMode: 'user'`), photo captured via canvas-toBlob (JPEG 75%) on each punch.
  - Photo stored in IDB with punch; uploaded to `attendance-photos/punches/{staff_id}/{punch_time}.jpg` on flush.
  - Sync: `online` event + `visibilitychange` + 5-min `setInterval` poll; IDB queue accumulates offline punches.
  - HR manual override (hr_officer/md): fetches live `staff_public`, submits directly online; `recorded_by_user = userProfile.id`, `verification_method = 'hr_manual_override'`.
  - Toast overlay (2.5s auto-dismiss, green/red).
  - Status bar: online/offline indicator, queue count, last-sync time, manual sync button.
  - Debounce: 3s between barcode detections (same physical scan).
  - PIN pad: 4–6 digit entry; dots display; SHA-256 checked at ≥4 digits; accepts up to 6 before clearing with error.
- `src/components/StaffHR.jsx`: "Set PIN" button added to Staff Directory Actions column (md/hr_officer only). Opens modal calling `set_staff_pin(p_staff_id, p_pin)` — numeric-only, 4–6 digits, Enter-key support, auto-close on success. Recovery path for staff who forget their PIN and cannot self-service a reset.
- `src/App.jsx`:
  - Imports: `kioskService`, `AttendanceKiosk`.
  - ROLE_PAGES: `attendance_kiosk` + `attendance_flags` added to `hr_officer`; `attendance_flags` added to `production_manager` + `assistant_production_manager`; `md` gets both via `'all'`.
  - Nav: two new items under Operations — "Attendance Kiosk" and "Attendance Flags".
  - `AttendanceFlagsPage` (inline): HR management view of flagged attendance (last 60 days); resolve with `hours_worked` + `present` fields; shows employee response if submitted. Flag resolution: staff explanation via self-service is optional — HR/MD can resolve regardless of whether a response was submitted. No new approval state machine.
  - `MyHRPage`: "My Attendance (Last 30 Days)" table (flagged-row response textarea → `submitFlagResponse`); "Kiosk PIN" card — self-service PIN set/reset via `set_my_kiosk_pin(p_pin)`, numeric input, 4–6 digits, hashed server-side. ICO users can fully use this page (leave, advance, Kiosk PIN — see ICO fix below).
  - Page routing: `attendance_kiosk` → `<AttendanceKiosk>`, `attendance_flags` → `<AttendanceFlagsPage>`.
  - **ICO read-only fix (pre-existing gap, surfaced during kiosk testing):** The `data-ico-view` CSS mask and the read-only banner never exempted `my_hr`, locking ICO out of their own leave/advance/self-service page. Fixed by adding `my_hr` to both exemption lists (same pattern already used for `advances` and `leave`). This is a pre-existing bug unrelated to the kiosk feature.

**Constraints honoured:** DO NOT touch Labour.jsx / payrollService labour.js. DO NOT touch disciplinary module. Frontend only — no DB changes applied. MD merges.

**My HR leave-balance scoping fix (PR #37, merged):**
- Bug: `getMyBalance(year)` in `src/services/leaveBalance.js` filtered only by `leave_year` — no `staff_id` filter. RLS correctly grants md/ico/accountant (plus hr) global read on `staff_leave_balances` (needed for the management-side all-staff balance table), so the app-level filter was the only guard — and it wasn't there. Result: My HR "My Leave Balance" showed EVERY staff member's balance rows in a repeated grid for those roles.
- Fix: `getMyBalance(staffId, year)` with `.eq('staff_id', staffId)`; call site in `MyHRPage.loadAll()` guards on `staff?.id` and passes it.
- **Bug class: missing scoping filter — second occurrence.** First: `getMyStaff()` `.limit(1)` bug (S9, PR #30). This class is now audit category (3) in the Full backend audit stream (§3).

**PR #36 — closed UNMERGED (near-miss, process lesson):**
- The same fix was first built on a stale branch base forked from main at `07df8b3` — before PRs #34/#35 merged. Merging it would have deleted the entire kiosk feature (946 deletions).
- Caught by diffing the PR against current main before merge. Rebuilt clean as PR #37 on a fresh branch off current main (2 files, 15 lines).
- **LESSON (now Working Rule #9):** every PR must be diffed against current main before MD review — branch base verified, not assumed.

**Data hygiene (live DB, S11):**
- `date_hired` gaps resolved: EMP-017 (Boniface) corrected to 2026-03-18; the other flagged records confirmed correct by MD.
- "Demo hr" test staff record deleted from live DB with all child rows (onboarding checklist, advance requests, leave requests, leave balances, user profile).

### ✅ SESSION 10 (2026-06-30) — HR 4c DISCIPLINARY / QUERY MODULE
**HR 4c declared COMPLETE. PR #32 merged (with fix-commit).**

**DB (migration `hr4c_disciplinary_module`, applied before PR):**
- Tables: `disciplinary_cases` (management-facing, includes `management_review_notes`) + `disciplinary_audit` (action, actor_role, note, created_at).
- View: `disciplinary_self` (employee-safe; hides `management_review_notes`; orders by `issued_at`).
- RPCs: `issue_disciplinary_case` (p_staff_id, p_type, p_title, p_allegation, p_incident_date, p_response_deadline) + `advance_disciplinary` (p_case_id, p_action, p_text, p_sanction).
- Status-guard trigger blocks invalid state transitions.
- RLS: md + hr_officer read/write `disciplinary_cases`; employee reads own cases via `disciplinary_self` only; no other role sees any row.

**Lifecycle:**
- `formal_query`: `issued → responded → reviewed → closed`. Respond = subject via My HR; Review = md/hr_officer; Close = MD-only with sanction selection.
- `verbal_warning_log` / `written_warning`: logged straight to `closed` (no response phase). Employee acknowledges in My HR.
- Sanctions (5): none / verbal_warning / written_warning / final_warning / termination. **Wall: sanction is RECORDED only — never changes `employment_status`, `is_active`, or payroll.** Proven live (closed case, written_warning sanction, subject remained active).

**Frontend (PR #32 + fix-commit):**
- `src/services/disciplinary.js`: listAll (staff_public join), getMine (disciplinary_self, ordered by issued_at), getAudit, issue, advance.
- `DisciplinaryPage`: issue form (response_deadline conditional on formal_query), case list with status badges, inline Review/Close action panels, expandable audit trail (actor_role · action · note · date).
- "Queries & Warnings" section added to `MyHRPage`: respond textarea for formal_query at `issued`; Acknowledge button for any case without `acknowledged_at`.
- Verified end-to-end in production preview.

**Open items (as of S10):** B-2 carry-over automation + future-hire pro-ration deferred. (`date_hired` gaps RESOLVED in S11 — see Session 11 data-hygiene note and §4.)

### ✅ SESSION 9 (2026-06-28) — HR BUG-FIX PACK + SELF-SERVICE ROLLOUT
**PRs #20–#25 all confirmed merged. HR 4b Phase B declared COMPLETE (B-2 activation live-proven).**

**HR bug-fix pack (PR #30, merged):**
- ICO read-only CSS mask (`[data-ico-view] button:not([data-ico-allow]) { display:none }`) now exempts `advances` and `leave` pages — ICO Approve/Reject buttons are no longer hidden there.
- `advancesService.list()` and `leaveService.list()`: replaced PostgREST `staff:staff_id(full_name)` embed with a separate `staff_public` query joined in JS — ico and accountant now see staff names on request lists.
- `meService.getMyStaff()`: replaced `.limit(1)` with a lookup via `auth.getUser()` → `user_profiles.staff_id` → `staff.id` — MD now sees their own profile in My HR, not a random colleague. Null guard added: accounts with no linked staff record see "No staff profile is linked to this account."

**Self-service rollout (PR #31, merged):**
- `canSee('my_hr')` decoupled from role — now gated on `!!userProfile.staff_id`. Any employee-linked account (any role: store_officer, driver, logistics_manager, production_manager, etc.) sees "My HR" in the sidebar and can file their own leave/advance requests.
- Unlinked accounts (board chairman intentionally unlinked) do not see My HR.
- `staff` role added to `APP_ROLES` dropdown for the add/edit-user modal. `ROLE_PAGES.staff` (`['my_hr','my_profile']`) was already present.
- `user_profiles.staff_id` link status: 10 of 11 accounts linked. MD → APC-EMP-001 and logistics_manager → APC-EMP-015 linked this session. Board chairman intentionally unlinked.

**Pending:**
- `date_hired` missing for APC-EMP-015, 016, 019, 006.
- Deferred B-2 items: carry-over automation (Jan boundary) + future-hire pro-ration.
- HR 4c — disciplinary/query module. Open decision: do employees see their own queries in My HR?

### ✅ SESSION 8 (2026-06-26) — HR 4b PHASE B: PAYROLL DEDUCTIONS + LEAVE-BALANCE UI
**Scope: B-1 (payroll deductions) complete; B-2 (leave-balance tracking) underway this session.**
- **Migration 1 (applied before PR-1):** Added `payroll_lines.advance_deduction numeric not null default 0`; backfilled from `deductions`.
- **Migration 2 (applied before PR-2):** Switched `realize_advance_repayments` to read `advance_deduction` — advance settlement ignores leave withholding.
- **PR-1 (PR #26, merged):** `handleCalculate` sets `advance_deduction = installment`; `handleApprove` persists it.
- **PR-2 (PR #27, merged):** Unpaid-leave deduction on calendar-day basis. `deductions = advance_deduction + leaveDeduction`; breakdown shown in step-2 review and payment table.
- **B-2 Migration (applied before PR-3):** Inert leave-balance ledger — `leave_policy_settings` (active=false), `staff_leave_balances`, RLS, `seed_leave_balances_draft`, `set_leave_entitlement`, `set_leave_policy_active` RPCs, `md_approved` trigger (no-ops while active=false).
- **PR-3 (this PR — `claude/b2-leave-balances`):** `src/services/leaveBalance.js` wraps the six DB objects. `LeaveBalancesTab` added to StaffHR: MD policy panel (status, Seed Draft, editable entitlement table, Activate/Deactivate confirm); manager read-only balance table (entitled/used/balance, overdraw ⚠ flag — visual only, never blocks). `MyHRPage` gains "My Leave Balance" card: annual + sick entitled/used/balance, or "Leave balances not yet activated" if inactive or no row. Payroll handleCalculate/handleApprove untouched.
- **MD activation complete:** `set_leave_policy_active(true)` triggered; 38 rows seeded (19 annual @15 days / 19 sick @12 days). End-to-end proven: an `md_approved` annual leave request decremented the ledger correctly.
- **Deferred — carry-over automation:** Year-boundary carry-over script and future-hire pro-ration not yet built.

### ✅ SESSION 7 (2026-06-26) — PAYROLL STATE MACHINE, ADVANCES, LEAVE, SELF-SERVICE FOUNDATION
- **Staff payroll (`payroll_runs`) state machine (PR #20).** draft → ico_approved → md_approved → paid (+recall) via `advance_staff_payroll` SECURITY DEFINER RPC + `trg_staff_payroll_guard` + `staff_payroll_audit`. UI gates per role: accountant creates (draft), ICO approves, MD approves, accountant/MD records payments. Net-pay default fixed (PR #22): `openRun` now pre-fills `amount_paid` as `max(0, amount_due − deductions)` so advance deductions are not double-counted; payment table shows read-only Deduction column.
- **Salary advances — HR 4b-i (PR #21).** `salary_advances` table: `requested → ico_approved → md_approved → disbursed → settled` + `rejected` / `cancelled`. State machine via `advance_salary_advance` RPC + guard trigger + audit table. Repayment: `payroll_lines.deductions` column + AFTER-paid trigger `realize_advance_repayments` auto-settles on `mark_paid`. One outstanding disbursed advance per staff enforced by guard. Chain: HR officer/accountant/MD records request → ICO approves → MD approves → accountant/MD disburses. `AdvancesPage` in App.jsx; `src/services/advances.js`.
- **Leave requests — HR 4b-ii (PR #23).** `leave_requests` table: `requested → ico_approved → md_approved` + `rejected` / `cancelled`. State machine via `advance_leave_request` RPC + guard + audit. Types: annual/sick/unpaid/compassionate/maternity; `is_paid` per request. Chain: HR/MD records → ICO approves → MD approves. `LeavePage` in App.jsx; `src/services/leave.js`. Attendance/payroll integration (Phase B — auto-deduct from salary on leave days, carry-over balance tracking) deferred.
- **Self-service foundation (PR #24).** `user_profiles.staff_id` is the employee link; `current_staff_id()` resolver. Self-scoped RLS on `salary_advances` / `leave_requests` / `staff` (own-row SELECT + self-INSERT) — verified: own rows visible, others blocked. `on_auth_user_created` defaults new logins to role `staff`. `MyHRPage` (self-service, no staff picker, no approve buttons): profile header with name/title/employee number, ID Card + Business Card download, Request Advance form, Request Leave form, own advances and leave lists (all RLS-scoped). `src/services/me.js` (`getMyStaff()` via RLS). Role `staff` now routes to `my_hr` as landing page. Scope: permanent/salaried staff; daily workers remain HR-mediated.
- **Also completed this session:** receipts UNIQUE + retry (PR #16), number-generator sweep (PR #15), `supabase.js` fail-loud on missing env vars (PR #18), LPO partial-state hardening (PR #17), invoices/payments amount leak (PR #14).
- **Decisions recorded:** self-service for permanent staff only; logins tied to employee via `user_profiles.staff_id`; FUTURE: replace the 7 working role logins with official `@abujaprecast.com` manager emails (MD/ICO/BDM/logistics/production/store).

### ✅ SESSION 6 (2026-06-25) — SECURITY LEAK CLOSURES + LATENT-BUG GENERATOR SWEEP
A focused hardening session executing the §4 latent-bug sweep and closing two RLS leaks the plan had not known about. All items per-role verified; DB changes applied via `apply_migration`.

**A. Staff-PII leak closed (PR #12 + earlier-session migrations).** A permissive `staff_select` exposed salary/bank/NIN/addresses to all 12 authenticated roles. Created definer views `staff_public` (safe columns, all authenticated) and `staff_payroll` (finance-only); repointed every non-HR staff read to `staff_public`; tightened `staff_select` to `md`/`hr_officer`. Verified per-role (hr_officer reads 19; accountant/logistics base 0, safe views full).

**B. LPO invoice number + ICO empty staff page (PR #13).** LPO auto-invoice used an in-memory `count+1` for a separate `APC-LPO-` series with no retry. Repointed to `invoicesService.getNextNumber()` + 23505 retry, unified to the `APC-INV-` series. Removed `'staff'` from `ico`/`operations` `ROLE_PAGES` (would render an empty Staff page after the staff RLS tighten).

**C. Invoices/payments amount leak closed (PR #14 + migrations).** `invoices_select`/`payments_select` were `USING(true)` — every role (incl. driver/marketer) saw revenue and payment amounts. Created money-free definer views `invoices_safe`/`payments_safe` (exclude `total_amount`/`amount_paid` AND `pdf_url`/`proof_url` — the documents carry the amount). UI-gated the Customers-screen money figures behind `canSeeAmounts` (md/accountant/ico/board_member/bdm/marketer), then tightened both policies to that set. Verified per-role: amount roles read 28/20; logistics/hr_officer read 0 but safe views still serve (Customers screen keeps working money-free).

**D. Number-generator collision sweep (PR #15).** waybill/batch/supplier/employee inserts used last-row-max on UNIQUE columns with no retry. Added regenerate-and-retry to all four (employee via the `get_next_employee_number` RPC at save).

**E. Receipts integrity (PR #16 + migration).** Added a 23505 retry to `receiptsService.upload()` FIRST, then added `receipts_receipt_number_key UNIQUE` (0 duplicates confirmed before applying).

**F. LPO partial-state hardening (PR #17).** `handleDecide` now creates the invoice BEFORE advancing the order to `in_progress`; a non-23505 invoice failure stops with an actionable message instead of leaving an approved-but-uninvoiced order.

**Sweep result — generator audit COMPLETE.** The only number generators in the app are invoice, waybill, receipt, supplier, batch, employee. No quote/proforma/PO generator exists. All now have collision handling.

**Process notes.** (i) The repo default branch was wrongly set to a stale `claude/*` branch, mis-basing PRs and producing phantom merge conflicts — switched default to `main`. (ii) Vercel occasionally does not auto-deploy a merge whose tree matches an already-built preview; a manual "Promote to Production" fixes it.

### ✅ SESSION 5 (2026-06-18) — PHASE 4D CARDS, INVOICE FIX, LOGISTICS ACCESS
A long, multi-workstream session. All items below tested and merged unless noted.

**A. Phase 4D — Staff ID cards, business cards, photo upload (PR #7, merged).**
- Photo upload to private `staff-photos` bucket; `staff.photo_path`; uploading marks the 'photo' checklist item complete.
- ID card (front+back) and business card (front+back) generated as PDFs from live staff data.
- Incomplete-profile flag (DERIVED, not stored): warns when job_title, photo_path, or phone is missing; self-clears.
- Bugs fixed during 4d: (i) staff INSERT was sending `is_active: true` to the GENERATED column — removed; (ii) `job_title` not saving — fixed + trimmed; (iii) ID card sidebar job_title not rendering — fixed with role fallback.

**B. Card visual polish (PR #10 / branch claude/card-design-polish).**
- Root-caused a BLANK-CARD regression: an async logo-crop helper (`fetchLogoIconAsDataUrl`) rejected on load failure and threw through the await, drawing only the card background. Fix: helper never rejects (returns null on error/timeout), logo placement guarded, content renders regardless.
- Replaced fragile runtime logo-cropping with a pre-made ICON-ONLY logo file (`public/logo-icon.png`, no text/RC number) — permanently ends the RC-text-bleed on cards.
- Iterated layout toward the reference samples (name colour dark-navy for readability, name larger than role on business card, grey→blue divider, header sizing). Cards are functional/professional; final pixel polish accepted as "close enough."

**C. Invoice numbering duplicate-key bug (PR #8, merged).**
- `invoice_number` is UNIQUE; the generator derived the next number from a row count, colliding with existing numbers (two inconsistent series existed: APC-INV-2026-0xx and -23xx).
- Fix: `invoicesService.getNextNumber()` queries the live DB, parses the NUMERIC max suffix across all APC-INV numbers, increments (4-digit suffix going forward), with a 23505 unique-violation retry. Verified live: generates APC-INV-2026-2362+ cleanly. Existing 22 numbers left untouched. (Session 6 added the same retry to the LPO path, which had been bypassing this service.)

**D. Logistics-manager delivery access + waybill loophole (PR #9, merged).**
- Bug: logistics_manager couldn't create waybills ("No customers with active invoices") because `ordersService.getAll()` joined raw `order_items(*)` and the role lacked SELECT on `orders`/`order_items`; the failing query was silently swallowed.
- Requirement: logistics sees DELIVERY details only (NO money), sees new orders/approved LPOs, customer records & statements; CANNOT write invoices or receipts; CANNOT approve LPOs (only views approved ones); generates waybills/statements.
- Fix (DB): created money-free view `order_items_delivery` (id, order_id, block_type, quantity, created_at — NO unit_price/subtotal); added logistics_manager + store_officer to `orders_select` (orders has no money columns); logistics NOT added to raw order_items (money stays hidden). Frontend routes logistics to the view.
- Waybill loophole closed: removed the broad `waybills_write` FOR ALL policy that OR'd ico/production_manager/bdm into write access. Waybill write is now md/logistics_manager/store_officer only (insert/update), md-only delete.
- Verified: truck/loading-labour functions (truck_loading_log, truck_loading_loaders, truck_loader_assignments, delivery_schedules, delivery_schedule_items) all confirmed INTACT for logistics_manager.

**E. Housekeeping.** Test staff repeatedly created during preview testing were cleaned (rows + cascaded checklist; photo files in storage must be cleared via Supabase dashboard — SQL delete is blocked). Staff settled at 19 (18 active + RANSOM ABANG OSANG APC-EMP-018 correctly in 'onboarding' pending activation).

**LESSONS (carried forward):**
- Multiple LATENT bugs surfaced this session (invoice numbering, orders_select auth.users from Session 4, logistics RLS gaps). The app has a backlog of these from earlier dev; expect more to surface. (Session 6 executed the recommended sweep — see §4.)
- When an error names a specific Postgres table, trust that over env/build theories.
- Claude Code's in-chat "test render" is NOT the real app — only the Vercel preview in a browser is proof.
- Several confident fix proposals this session rested on unverified DB assumptions that were FALSE; DB verification from the planning chat caught each. Keep verifying before applying.
- Per-role testing (Working Rule #7) is the cheapest catch for RLS bugs.

### ✅ SESSION 4 (2026-06-16) — PHASE 4A FRONTEND + PRODUCTION OUTAGE FIX
- Phase 4a frontend merged (onboarding defaults, OnboardingTab, status badges, eligibility-error handling).
- Production outage fixed: `orders_select` RLS referenced `auth.users` (unreadable by `authenticated`), throwing "permission denied for table users" across many screens. Rewrote to resolve staff id via `user_profiles`. Migration `fix_orders_select_auth_users_perm`. (Note: Session 5's logistics work later replaced orders_select again — current version includes logistics_manager + store_officer.)

### ✅ SESSION 3 (2026-06-15) — PHASE 4A DB LAYER
- `staff.employment_status` NOT NULL + CHECK (onboarding|active|suspended|terminated); `is_active` now GENERATED.
- `onboarding_checklist_templates` (now 7 items incl. 'photo') + `staff_onboarding_checklist`.
- Eligibility triggers on attendance + payroll_lines; onboarding gate trigger on staff.

### ✅ SESSION 2 (2026-06-15) — PAYROLL
- `advance_weekly_payroll` RPC cutover, live-proven (first ICO approval by Kayode Ojo). Dedupe + UNIQUE(week_ending,payroll_type). RLS sweep: dropped 26 `allow all` overrides.

### ✅ SESSION 1 (2026-06-11/12) — SECURITY BASELINE
- RLS to authenticated; storage locked; role write policies; staff-documents bucket private.

---

## 2. VERIFIED LIVE STATE (queried 2026-06-25)
- Staff: 19 (18 active, 1 onboarding — Ransom APC-EMP-018). Invoices: 28. Payments: 20. Receipts: 8.
- **0 policies reference auth.users. 0 allow-all overrides.**
- **Staff PII:** `staff_select` = md/hr_officer only. Definer views `staff_public` (all authenticated), `staff_payroll` (finance-only) live.
- **Invoice/payment money:** `invoices_select` / `payments_select` restricted to `md,accountant,ico,board_member,bdm,marketer`. Definer views `invoices_safe` / `payments_safe` (no amounts, no document URLs) serve all authenticated.
- **Number integrity:** UNIQUE on invoice_number, waybill_number, supplier_number, batch_number, employee_number, and NEW `receipts_receipt_number_key`. All generators have 23505 regenerate-and-retry.
- Money-free `order_items_delivery` view: live. Waybills: insert/update md+logistics+store, delete md. No `waybills_write` loophole.
- Payroll engine intact (trg_weekly_payroll_guard enabled, advance_weekly_payroll RPC, weekly_payroll_audit RPC-write-only).
- Card support: `staff.job_title`, `staff.photo_path`, private `staff-photos` bucket, `public/logo-icon.png` (icon-only logo).

### ⚠️ ARCHITECTURE NOTE
`weekly_labour_payroll` is a status header only (one row per week_ending+payroll_type). Worker lists/amounts come from daily tables joined by week+type: production `daily_roster_entries`; loading `truck_loading_log`/`truck_loading_loaders`. The `attendance` table is for STAFF attendance; daily-labour attendance lives in roster/loading tables.

### Migrations (tracked)
- **Session 6:** staff-PII views/policy (`staff_public`, `staff_payroll`, `staff_select` tighten); `add_money_free_invoice_payment_views` (`invoices_safe`, `payments_safe`); `restrict_invoices_payments_select_to_amount_roles`; `add_receipts_receipt_number_unique`.
- **Session 5:** `logistics_delivery_view_and_orders_read`, `waybills_remove_broad_write_loophole`.
- Plus Session 3 staff/onboarding migrations, Session 4 `fix_orders_select_auth_users_perm`, Session 2 dedupe/sweep, Session 1 baseline.

---

## 3. UNIFIED PRIORITY ORDER
| # | Work | State |
|---|---|---|
| 0 | Payroll RPC + state machine | ✅ COMPLETE & live-proven |
| 1 | G.1 quick-fixes | ✅ COMPLETE |
| 2 | Payroll client cutover | ✅ COMPLETE |
| 3 | RLS for remaining tables | ✅ baseline complete; **2 deeper leaks (staff-PII, invoices/payments) found & CLOSED in Session 6** |
| 4 | HR modules | ✅ **CLOSED** — 4a ✅ (S3/S4), 4b ✅ incl. B-1/B-2 (S7/S8), 4c ✅ (S10, PR #32), 4d ✅ cards (S5) + attendance kiosk (S11, PRs #34/#35). Remaining HR-adjacent deferrals are standalone line items in §4, not under this stream |
| 4.5 | **Full backend audit (pre-#5)** | ✅ **CLOSED (S12)** — executed, report `docs/BACKEND_AUDIT_PRE5.md`; all fixes applied (PRs #39/#40/#41 merged + DB migrations). See audit scope below. |
| 5 | **Payment-request (EXPENDITURE) + ingestion engine** | **RE-PLANNED (S13) — DESIGN LOCKED, see §8.** Old "(revenue)" label was stale; Phase 5 is expenditure-first, revenue matching committed as sub-phase 5d. Sub-phases 5a–5e. Schema NOT started (blocked on §8 pre-schema verification, items 3 & 4 open). |

### Phase 4 sub-roadmap — ✅ STREAM CLOSED (S11)
All four sub-phases shipped. HR-adjacent deferrals moved to standalone line items in §4 (carry-over automation, future-hire pro-ration, EMP-018 activation, orphaned photo cleanup, card header polish).
- 4a lifecycle/onboarding — ✅ DONE.
- 4d ID + business cards + photo — ✅ DONE (merged, S5). Attendance kiosk (barcode + PIN) — ✅ DONE (merged, S11, PRs #34/#35).
- 4b leave & salary-advance requests — ✅ **COMPLETE** (Session 7–8). B-1 unpaid-leave payroll deduction live. B-2 leave-balance ledger live (38 rows, activation proven end-to-end).
- 4c disciplinary/queries + staff self-service portal — ✅ **COMPLETE (Session 10, PR #32).** Self-service rollout (S9, PR #31) + disciplinary/query module (S10): issue_disciplinary_case RPC, advance_disciplinary RPC, guard trigger, disciplinary_self view, DisciplinaryPage (md/hr_officer), "Queries & Warnings" in My HR (employee responds/acknowledges). Decision resolved: employees see own cases via disciplinary_self (safe view, no management_review_notes).

### Full backend audit (pre-#5) — scope (S11)
Bounded audit, five categories:
1. **All RLS policies vs the role matrix** — every table's policies checked against who should read/write.
2. **All SECURITY DEFINER function grants** — check for anon/PUBLIC EXECUTE grants.
3. **Frontend queries for missing scoping filters** — the PR #37 bug class (query relies on RLS that is intentionally permissive for some roles; app-level filter absent).
4. **Role-exemption lists for missing pages** — the ICO `my_hr` bug class (page added but never added to a role's mask/banner exemption list).
5. **State-machine guard coverage on money/HR tables** — every table holding money or HR state has a guard trigger or RPC-only write path.

**Out of scope:** runtime/UI behavior — covered separately by the MD role-based smoke test.
**Method:** findings are collected into a single report for MD decision — EXCEPT confirmed security exposures (data leak / unauthenticated access), which are fixed on discovery **by the planning chat** (the discovering window reports the exposure; the planning chat executes the DB fix via `apply_migration`) and reported after. _Clarified after S12: the S12 `order_items_delivery` anon REVOKE was applied directly via the Supabase connector from the discovering window — this stays consistent with Working Rules #2/#4, which reserve DB changes for the planning chat. Discover-and-report in the window; planning chat applies._
**Position:** runs BEFORE #5 scoping. #5 and all downstream roadmap items get re-planned after audit close. **✅ Done — audit closed S12; #5 re-planned S13 (see §8).**

---

## 4. KNOWN GAPS / FORWARD ITEMS
- ✅ **Latent-bug sweep — DONE (Session 6).** All six number generators (invoice/waybill/receipt/supplier/batch/employee) audited and given collision handling; no quote/proforma/PO generator exists. Two RLS leaks (staff-PII, invoices/payments) found and closed. Per-role RLS verified for each.
- ✅ **Silent Supabase client fallback — DONE (PR #18, Session 6/7).** `src/lib/supabase.js` now throws immediately on missing `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` instead of falling back to placeholder.
- ✅ **Staff payroll state machine — DONE (PR #20, Session 7).** `advance_staff_payroll` RPC + `trg_staff_payroll_guard` + `staff_payroll_audit`. Approval chain: accountant creates (draft) → ICO → MD → accountant/MD marks paid. Advance deductions integrated into `payroll_lines.deductions`; net-pay fix in `openRun`.
- **HR 4b Phase B — COMPLETE.** B-1 (unpaid-leave deduction, `advance_deduction` column) and B-2 (leave-balance ledger, 38 rows, activation trigger proven) both live.
- **Carry-over automation (Jan year-boundary roll)** — deferred; standalone item (HR stream #4 is closed; formerly under 4b).
- **Future-hire leave pro-ration** — deferred; standalone item (formerly under 4b).
- **Card header polish** — optional visual nit; standalone item (formerly under 4d cards).
  - Deleted branch `claude/card-design-polish-hgb4r1` held commits debef70/7063d56; if revived, rebuild on fresh branch, cherry-pick cardGenerator.js visuals only, redo StaffHR.jsx by hand against current main.
- ✅ **`date_hired` gaps — RESOLVED (S11).** EMP-017 (Boniface) corrected to 2026-03-18; the other flagged records confirmed correct by MD. "Demo hr" test staff record and all child rows (onboarding checklist, advance/leave requests, balances, user profile) deleted from live DB.
- ✅ **Disciplinary/query module (HR 4c) — COMPLETE (S10, PR #32).** Full lifecycle live. Sanction wall enforced by convention (DB trigger does not auto-update employment_status; that step remains manual/HR-mediated).
- ✅ **Leave year-end controls — COMPLETE (S11, PR #33).** `run_annual_leave_rollover` and `expire_annual_carryover` RPCs wired to MD-only buttons in StaffHR LeaveBalancesTab.
- ✅ **Attendance kiosk — Phase 4d (S11, merged: PR #34 revert + PR #35 kiosk).** `src/services/kioskService.js` + `src/components/AttendanceKiosk.jsx` + App.jsx plumbing (flags page, My HR attendance+PIN sections, ICO exemption fix). DB fully live. pg_cron resolved: `reconcile-attendance-punches-nightly` runs at 20:00 UTC. `pin_hash` confirmed SHA-256 hex. No outstanding items.
- **Manager email migration (future).** Current manager logins use personal emails. Planned: replace 7 role accounts with official `@abujaprecast.com` addresses (MD/ICO/BDM/logistics/production/store/HR).
- **Orphaned staff photo files** in `staff-photos` bucket from deleted test staff — harmless; clear via Supabase dashboard (SQL delete blocked).
- **Ransom (APC-EMP-018)** in onboarding — HR to complete checklist + activate when ready.
- Original payroll trigger/RPC/audit objects not in tracked migration history (pre-discipline). Live & verified. Optional: capture as no-op migration.

---

## 5. DECISIONS / MILESTONES PENDING (MD)
- ✅ **Staff-payroll approval chain — DECIDED & BUILT (Session 7).** accountant creates (draft) → ICO approves → MD approves → accountant/MD marks paid + records per-line amounts.
- Go-live data re-entry milestone (parked) — clean opening balances; resolves dust kg→tons (~16.3t) gap & beta errors.
- Correction-as-adjustment-movement rule (LOCKED) — corrections are new logged offsetting entries, never silent edits.
- ✅ **Attendance kiosk — merged (PR #34 revert + PR #35 kiosk, S11).** Offline-first barcode + PIN kiosk with IDB queue, front-camera photo, sync triggers. pg_cron decision RESOLVED: `reconcile-attendance-punches-nightly` runs nightly at 20:00 UTC (21:00 WAT). Note: face-as-token (enrolled photo match) was descoped; ID-card barcode + PIN covers the MVP.
- ✅ **Leave year-end controls — BUILT (S11, PR #33).**

---

## 6. WORKING RULES (binding)
1. One session = one scope = one branch off `main`. Keep unrelated fixes on separate branches/PRs.
2. Claude Code writes code + SQL files; does NOT apply migrations.
3. Migrations applied from the planning chat via `apply_migration` (tracked), before/after verified.
4. No window changes bucket visibility / RLS / DB config except via the planning chat.
5. Test on preview before merge. **MD merges — no self-merge to main by Claude Code.** MD's live test counts as review.
6. End every session by updating THIS document.
7. After any RLS/policy change, smoke-test the app AS EACH affected role before promoting.
8. Verify fix proposals against the live DB before applying — several "confident" diagnoses have been wrong on the facts.
9. Every PR must be diffed against current main before MD review — branch base verified, not assumed. (Added after the PR #36 near-miss: a fix built on a stale pre-#34/#35 base would have deleted the entire kiosk feature — 946 deletions — if merged.)

---

## 7. STATUS BOARD
| Stream | State | Next |
|---|---|---|
| Payroll RPC (#0/#2) | ✅ live-proven | — |
| RLS sweep (#3) | ✅ complete + 2 leaks closed | — |
| Staff-PII leak | ✅ closed & verified (S6) | — |
| Invoices/payments money leak | ✅ closed & verified (S6) | — |
| Number-generator sweep | ✅ complete (S6) | — |
| Receipts integrity | ✅ retry + UNIQUE (S6) | — |
| LPO partial-state | ✅ hardened (S6) | — |
| HR 4a lifecycle | ✅ live | — |
| HR 4d cards/photo | ✅ merged | optional header-size polish |
| HR 4b advances | ✅ DB+UI (S7, PR #21/#22) | — |
| HR 4b leave | ✅ DB+UI (S7, PR #23) | — |
| HR 4b Phase B-1 (unpaid deduction) | ✅ live (S8, PR #26/#27) | — |
| HR 4b Phase B-2 (leave-balance ledger) | ✅ live + activated (S8, PR #29; 38 rows proven) | carry-over automation + future-hire pro-ration deferred |
| HR bug-fix pack | ✅ merged (S9, PR #30) | — |
| HR 4c self-service rollout | ✅ merged (S9, PR #31) — any linked employee gets My HR | — |
| HR 4c disciplinary/query module | ✅ COMPLETE (S10, PR #32) — full lifecycle, sanction wall proven | — |
| Leave year-end controls | ✅ COMPLETE (S11, PR #33) — rollover + expire-carryover MD buttons | — |
| Attendance kiosk (Phase 4d) | ✅ MERGED (S11, PR #34 revert + PR #35 kiosk) — barcode+PIN, IDB offline, photos, flags page, My HR attendance+PIN self-service, ICO exemption fix. pg_cron live (20:00 UTC nightly); pin_hash confirmed SHA-256 | — |
| My HR leave-balance scoping (PR #37) | ✅ MERGED (S11) — getMyBalance now staff_id-scoped; PR #36 predecessor closed unmerged (stale base near-miss → Working Rule #9) | — |
| **HR modules stream (#4)** | ✅ **CLOSED** — 4a, 4b (incl. B-1/B-2), 4c, 4d all shipped; deferrals moved to standalone §4 items | — |
| **Full backend audit (pre-#5)** | ✅ COMPLETE — DB fixes S12; Category-4 code fixes merged as PR #41 | — |
| Invoice/logistics/waybill | ✅ fixed & live | — |
| Silent supabase fallback | ✅ fixed (PR #18) | — |
| Staff-payroll state machine | ✅ live (S7, PR #20) | — |
| Payment-request + ingestion (#5) | **DESIGN LOCKED (S13, §8)** — expenditure-first, 5 sub-phases 5a–5e, revenue matching committed as 5d | close §8 pre-schema verification items 3 & 4 → then 5a schema session |
| Document storage buckets (receipts/lpo/supplier/vehicle) | ✅ **CLOSED** — signed URLs (PR #44 receipts, PR #45 lpo/supplier/vehicle), buckets flipped private, storage RLS role-scoped (S14, migration `storage_policy_cleanup_role_scoped_buckets`) | — |
| Storage policy cleanup (public_* removal, S14) | ✅ COMPLETE — 4 generic + 3 receipts-legacy permissive policies replaced with 9 per-bucket role-scoped policies across 5 buckets; verified via full 8-role × 7-bucket RLS simulation (SELECT+INSERT, positive+negative) | — |
| Go-live re-entry / dust gap | parked | MD triggers |

---

## 8. PHASE 5 RE-PLAN — PAYMENT-REQUEST + INGESTION (Session 13, 2026-07-03)

**Status: DESIGN LOCKED (13 decisions). Schema NOT started — blocked on §Pre-schema verification.**
**This section supersedes the §3 line "Payment-request (revenue) + ingestion" — label was stale; Phase 5 is EXPENDITURE-side. Revenue matching is committed as 5d.**

### SUB-PHASE MAP

| Sub | Scope | Depends on |
|---|---|---|
| **5a** | Payment-request lifecycle: request → ICO → MD → accountant disburses. Single reference `APC-PR-#####` as matching spine. States include `md_approved` (awaiting funds) → `funded` (5e hook; until 5e ships, funding approval stays on WhatsApp/paper and `funded` is set manually) → `disbursed` → `closed`. | audit Cat-4 PR merged/parked first (WR#1) |
| **5b** | Attachments (private bucket) + goods-receipt link = existing `stock_movements` row (three-way check: approved/paid/delivered). Evidence-gated closure with logged overrides. | 5a |
| **5c** | Statement ingestion (both accounts, both directions) + **outflow matching only**. Builds shared engine: statement-lines store, match-state machine (unmatched → suggested → confirmed/rejected), accountant confirm screen. Extends existing Phase 0 parser (`src/utils/parseBankStatement.js`). | 5a live |
| **5d** | **Revenue matching — COMMITTED**, starts after 5c live-proven. Matches credits banked by 5c against invoices; adds partial/lump-sum rules + payment-record creation from confirmed matches. Open 5d decision: non-block income (cement, dust, chippings, bags, scrap, asset disposal) has no invoice target — widen invoicing vs categorize-and-confirm. | 5c live-proven |
| **5e** | Treasury funding layer: monthly drawdown revenue→operations, chain accountant → ICO → MD → **board chairman**, against annual budget ceilings (data rows, not a budgeting module). Funding batch moves member requests to `funded`. Inter-account transfer pairs in 5c like top-ups. | 5a; independent of 5b–5d |

**Out of scope (all of Phase 5):** receipt OCR; bank alert email/SMS parsing; depreciation (no bank event — future accounting phase); payroll/labour/advance disbursements (own state machines — tables untouched).

### DECISION LOG (all MD-ratified this session)

1. **Relabel:** #5 = expenditure. Skeleton authoritative over old "(revenue)" label. Revenue = 5d, committed (not a deferral).
2. **Ingest both directions, match debits only (5c).** Credits stored + parked with category tag; matching screen defaults to debits.
3. **Sequencing:** 5c = shared engine + outflows; 5d immediately after 5c live-proven, launches against banked credit rows.
4. **Request boundary = any manually initiated outflow** (incl. supplier purchases, maintenance, tax/levies/fines, medical, capital, bought-in blocks, electricity, diesel). Excluded: state-machine-governed disbursements (staff payroll, labour payroll, advances). Unmatched debits from excluded flows are parked-categorized (payroll/advance/bank-charge/unknown), never anonymous. **Correction on record:** `lpo_orders` is CUSTOMER sales orders (verified in code) — supplier-purchase `source_type` links to `stock_movements`, not `lpo_orders`.
5. **Categories are data — REUSE `expense_categories` (exists, live, is_active + parent grouping; verified S13).** No new payment_categories table; extend for income direction. Both seed lists in §Seeds.
6. **Three-account ingestion (corrected S13):** **`bank_accounts` EXISTS (live: 4 rows = two duplicate pairs, revenue + operations; DEDUPE required; add Moniepoint row).** 5c ingests all three (same parser, no extra build); debit-matching runs on operations + Moniepoint only; revenue-account lines are parked (credits = 5d's dataset, banking from day one). Every statement line account-tagged; every disbursement records its account (the big-from-Taj/small-from-Moniepoint norm can be broken with approval — account is recorded per request, never inferred from amount). Revenue↔operations drawdowns and operations↔Moniepoint top-ups pair as internal transfers, excluded from vendor matching.
7. **Disbursement norm = bank transfer; cash = failsafe** (mechanic/roadside labour). Cash requests run the IDENTICAL approval chain, must reference a logged withdrawal, `disbursement_method='cash'`, close on accountant confirmation (no statement match). Running monthly cash total visible (drift control).
8. **WhatsApp cutoff = FLOATING:** 14 days after the first real request completes request→ICO→MD→disbursed on PRODUCTION. Calendar date announced the day 5a merges.
9. **Matching strategy per account/channel:** Taj = schedule-first (expected-disbursement list), narration secondary; Moniepoint = reference-first. Every disbursement records execution channel: `online_transfer` | `bank_letter` (letter ⇒ narration untrusted — bank clerk types it).
10. **Multi-beneficiary bank letters ⇒ disbursement batch** (one letter = one batch = N requests). Taj posts **one debit per beneficiary — EMPIRICALLY CONFIRMED (S13, real statement: 07-APR-26, three per-beneficiary debits from one instruction).** Line↔request matching primary; line↔batch-total fallback built regardless (posting behavior is bank-internal and can change silently).
11. **Initiator roles (RPC-enforced, not CSS):** logistics_manager, production_manager, store_officer, hr_officer, accountant, md. **ICO excluded** — gates, never originates (S7 control principle).
12. **Reference format:** canonical `APC-PR-#####` (server-side, collision-retry like the six existing generators; sequential, NO year segment). Narration convention `PR#####`, **typed at the START of the narration** ("PR00123 diesel") — Taj truncates the details field at fixed width (verified S13), so a trailing reference is destroyed. Matcher normalizes (case/hyphen/space-insensitive, embedded-anywhere, accepts full form). **Amount-agreement gate:** reference match + amount mismatch = flagged discrepancy, never auto-confirm.
13. **5b closure:** goods categories close on `stock_movements` link; service categories expect receipt attachment; nothing mandatory at initiation (roadside case). **Dual override (accountant OR MD)**, logged with actor; monthly override count split by actor so accountant-overrides-own-disbursement is its own visible line (self-review mitigation).

**Standing rules:** every match is a SUGGESTION until accountant-confirmed (both directions, forever). The payment request is the ONLY money-out truth; `stock_movements.total_cost` is inventory valuation, never "paid".

### EXISTING SUBSYSTEM MAP (S13 — Phase 0 is a full draft of 5c/5d, partly in production use)
Live-verified (code on main + live DB query 2026-07-03). Disposition per component — Phase 5 EXTENDS this; it does not greenfield:
- **`bank_accounts`** — REUSE. Live: 4 rows, two duplicate pairs (revenue ×2, ops ×2). ACTION: dedupe, add Moniepoint.
- **`bank_transactions`** — REUSE/EXTEND as the 5c statement-lines store. Live: 1,277 rows of real ingested history (keep-or-remigrate decision pending). Extend: `suggested`/`confirmed` match states, RPC-guarded confirm (current writes are client-side, unguarded), reconciliation gate at import, account-tagging already present via `bank_account_id`.
- **`expense_categories`** — REUSE (= Decision 5).
- **`expenses` (43 rows; dashboards KPI/Board/Reports read it; Labour.jsx inserts payroll costs)** — DO NOT convert or touch. New `payment_requests` table is workflow truth; disbursement writes a linked `expenses` row (accounting projection) so all reporting keeps working. Payroll continues writing expenses directly, outside requests (consistent with Decision 4 boundary).
- **`receipts` table + flow** — REUSE as 5b attachment store (add request linkage) after bucket fix below.
- **Parser `autoMatchTransactions`/`detectCategory`** — SUPERSEDED by 5c rules; DataImport UI is the base to extend.
- **`bank_import_batches`, `bank_reconciliations`** — reuse; reconciliation gate writes into the latter.

#### Live-DB findings (S13 planning-chat verification)
1. **EXPOSURE — `receipts` storage bucket is PUBLIC** (unauthenticated read of vendor receipts). **MD RULING (S13): coordinate flip with the code PR** — accepted interim risk (exploit requires a leaked URL: random path slugs, `file_url` behind finance-role RLS). BOUNDED: signed-URL PR is a standalone scope queued BEFORE any Phase 5 build session (it is on 5b's critical path regardless); bucket flip applied from the planning chat the same day the PR merges, verified by unauthenticated fetch before/after.
   - receipts bucket flipped private 2026-07-03 ✓ (PR #44); lpo-documents, supplier-documents, vehicle-documents also found PUBLIC — same bounded treatment, this PR + planning-chat flip.
   - **✅ FULLY CLOSED (S14, 2026-07-07):** all 4 buckets private + signed URLs live (PR #44/#45); storage.objects RLS layer also tightened — the generic `public_*` policies that persisted after the bucket flips (needed at the time so the app kept working) are now replaced with per-bucket role-scoped policies. See Session 14 entry above for the full verification.
2. **`expenses` has NO guard trigger** — status is a soft column, not a state machine; S12 audit Category 5's CLEAN claim did not cover this table. Accepted risk short-term; 5a replaces this approval path. _(Re-verified S13: `expenses` guard-trigger count = 0.)_
3. `bank_accounts` duplicates + 1,277 legacy `bank_transactions` rows — hygiene items gating 5c.

### STATEMENT EMPIRICS (S13 — verified against real Jan–Jun 2026 Taj PDFs, both accounts, + 12-month Moniepoint Excel)
- **Reconciliation gate confirmed buildable on all three sources.** Taj: identical layout both accounts; opening balance + per-row running balance + TRANS SUMMARY; arithmetic verified to the kobo on both. Moniepoint: opening/closing/total debit/credit header + Balance Before/After per row.
- **Fee legs:** every Taj transfer spawns companion debit rows (NIP fee 53.75/26.88/10.75, stamp duty 50, levy 50, monthly SMS) **carrying the parent's narration** — a charge-classification pass MUST run before any matching or fee rows keyword-match as phantom payments. Moniepoint pairs fee legs explicitly via Transaction Ref suffix (`_DEBIT_1/_2`); Taj needs keyword + known-amount heuristics.
- **Reversals:** observed live (06-MAY: 3,000,000 debit + `RevNIP…` credit same day). Match-state machine rule: a reversal credit voids its parent debit's match. Moniepoint exposes a Reversal Status column.
- **Moniepoint columns are rich:** Beneficiary name + institution, clean free-text narration, unique refs — Moniepoint matching = reference + beneficiary + amount, stronger than reference-alone.
- **Revenue account is not inflow-only:** loan in/repayment out (Bilaad ₦102.9M in, ₦92M out), Mudaraba investment flows. Moniepoint credits include non-block sales revenue (stone dust trips, plaster sand) — 5d's inflow dataset spans Moniepoint too.

### EXISTING ASSETS (verified in code this session)
- `src/utils/parseBankStatement.js` (Phase 0): TAJ PDF (pdfjs, DD-Mon-YY, meta-row filter) + CSV + Excel. 5c extends, does not rebuild. **Taj is PDF-ONLY for BOTH accounts (corrected S13 — no Excel option exists); Moniepoint offers Excel or PDF (use Excel).** The Taj parser is therefore a single point of failure for the majority of money out. Mitigation is a MANDATORY reconciliation gate in 5c ingestion: a statement file is accepted only if opening + credits − debits = closing (and per-row running balance validates where present); any mismatch rejects the ENTIRE file loudly — silent partial ingestion is forbidden. A Taj layout redesign = visible ingestion outage + parser patch, never quietly wrong data.
- `staging_transactions` table exists (per audit).
- Store's stock-in IS the goods receipt — no separate GRN table (two-records-one-truth guard, third occurrence).

### PRE-SCHEMA VERIFICATION (WR#8 — blocks schema session)
1. Live column shapes of `stock_movements` and `staging_transactions`. **✅ CLOSED (S13)** — `stock_movements` shape confirmed live (includes `supplier_id` + `reference` columns); `staging_transactions` verified 0 rows and unreferenced by code — legacy scaffolding from the abandoned OCR/alert design, leave in place, out of Phase 5 scope. See results below.
2. How Phase 0 parser output is wired in `App.jsx` (extend vs re-route). **✅ CLOSED (S13) — see results below.**
3. Reconfirm Decision 10 posting behavior with accountant. **OPEN — needs the accountant (human).**
4. ~~Taj PDF balance fields~~ **CLOSED S13** (see Statement Empirics). Moniepoint xlsx through the app's SheetJS parser: **✅ CLOSED (S13)** — SheetJS parses the real Moniepoint xlsx (2,995 rows, header detected at row 7, malformed styles tolerated).

#### Pre-schema verification results (Claude Code, S13)
- **Item 1 — column shapes (live DB, 2026-07-03):**
  - `stock_movements`: `id` uuid, `item_id` uuid, `movement_type` text NOT NULL, `quantity` numeric NOT NULL, `unit_cost` numeric, `total_cost` numeric, `supplier` text, `reference` text, `issued_to` text, `staff_name` text, `date` date NOT NULL, `notes` text, `created_at` timestamptz, `supplier_id` uuid. → 5b's supplier-purchase link (Decision 4) has `supplier`/`supplier_id`/`reference`/`total_cost` to key on; `total_cost` is the inventory-valuation column (never "paid" — standing rule).
  - `staging_transactions`: `id` uuid, `channel` text NN, `content_hash` text NN, `raw_payload` jsonb NN, `file_path` text, `extracted_amount` numeric, `extracted_date` date, `extracted_party` text, `extracted_ref` text, `direction` text, `proposed_target` text, `ocr_confidence` numeric, `status` text NN, `review_mode` text NN, `promoted_to_table` text, `promoted_to_id` uuid, `promoted_by` text, `promoted_at` timestamptz, `reviewed_by` text, `reviewed_at` timestamptz, `reject_reason` text, `created_at` timestamptz NN, `updated_at` timestamptz. → already a generic staging shape with a promote-to-target lifecycle; usable as a model for the 5c match-state machine.
- **Item 2 — Phase 0 parser wiring (code on main):** the ingest+match flow lives **inline in App.jsx** as an Accounting sub-tab, NOT in the standalone `DataImport` component. Flow: `buildPreview()` → `mapRowsToTransactions` → `bankTransactionsService.checkDuplicates` → `autoMatchTransactions(...)` (App.jsx ~L5242) → `confirmImport()` writes to `bank_transactions`; `detectCategory` used for unmatched debits (~L5896). The separate `DataImport` component (`data_import` route, accountant-only) is the `staging_transactions` OCR/promote path. → **5c extends the inline App.jsx `bank_transactions` reconciliation flow** (add suggested/confirmed states + RPC-guarded confirm + reconciliation gate); the `DataImport`/`staging_transactions` path is a separate lineage, not the 5c base.

### SEEDS
- **Expenditure:** machine maintenance, truck maintenance, production materials (cement/dust/diesel), delivery/diesel-trucks, electricity (prepaid grid), admin, commission, medical, tax/VAT, levies & fines, capital acquisition, bought-in finished blocks, float replenishment, loan/investment repayment, professional services (consultancy), staff welfare/support, bank charges (system category — fee legs auto-classified, never user-selected).
- **Income (5d):** block sales, cement sales, stone dust, chippings, empty cement bags, scrap metal, asset disposal, loans/investments received (funding, not revenue — flag for 5e/5d rules), reversals (system — voids parent debit).
