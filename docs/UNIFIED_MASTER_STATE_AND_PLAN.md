# APC MANAGER — UNIFIED MASTER STATE & PLAN
**Single source of truth. Supersedes all prior handoffs on points of conflict.**

Repo: `amaliyu/muktar24` (PRIVATE) · Prod branch: `main` · Stack: React 18 + Vite 5 + Supabase (PostgreSQL, RLS) + Vercel
App: APC Manager — internal ERP for Abuja Precast Concrete Limited
**Updated: 2026-07-02 (Session 11 close-out).** All DB state verified by live query, not memory.
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
| 4.5 | **Full backend audit (pre-#5)** | Scoped (S11) — runs BEFORE #5; see audit scope below. Next: execute |
| 5 | Payment-request (revenue) + ingestion engine (Phase 1+) | Parked; Phase 0 done; **re-plan after audit close** — MD has identified payment/accounting manual processes as the primary operational bottleneck to address from #5 onward |

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
**Method:** findings are collected into a single report for MD decision — EXCEPT confirmed security exposures (data leak / unauthenticated access), which are fixed on discovery and reported after.
**Position:** runs BEFORE #5 scoping. #5 and all downstream roadmap items get re-planned after audit close.

---

## 4. KNOWN GAPS / FORWARD ITEMS
- ✅ **Latent-bug sweep — DONE (Session 6).** All six number generators (invoice/waybill/receipt/supplier/batch/employee) audited and given collision handling; no quote/proforma/PO generator exists. Two RLS leaks (staff-PII, invoices/payments) found and closed. Per-role RLS verified for each.
- ✅ **Silent Supabase client fallback — DONE (PR #18, Session 6/7).** `src/lib/supabase.js` now throws immediately on missing `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` instead of falling back to placeholder.
- ✅ **Staff payroll state machine — DONE (PR #20, Session 7).** `advance_staff_payroll` RPC + `trg_staff_payroll_guard` + `staff_payroll_audit`. Approval chain: accountant creates (draft) → ICO → MD → accountant/MD marks paid. Advance deductions integrated into `payroll_lines.deductions`; net-pay fix in `openRun`.
- **HR 4b Phase B — COMPLETE.** B-1 (unpaid-leave deduction, `advance_deduction` column) and B-2 (leave-balance ledger, 38 rows, activation trigger proven) both live.
- **Carry-over automation (Jan year-boundary roll)** — deferred; standalone item (HR stream #4 is closed; formerly under 4b).
- **Future-hire leave pro-ration** — deferred; standalone item (formerly under 4b).
- **Card header polish** — optional visual nit; standalone item (formerly under 4d cards).
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
| **Full backend audit (pre-#5)** | Scoped (S11) — 5 categories: RLS vs role matrix, SECURITY DEFINER grants, missing scoping filters, role-exemption lists, state-machine guard coverage | **execute** |
| Invoice/logistics/waybill | ✅ fixed & live | — |
| Silent supabase fallback | ✅ fixed (PR #18) | — |
| Staff-payroll state machine | ✅ live (S7, PR #20) | — |
| Payment-request + ingestion (#5) | Phase 0 parked | **re-plan after audit close** — payment/accounting manual processes are the primary target |
| Go-live re-entry / dust gap | parked | MD triggers |
