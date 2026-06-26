# APC MANAGER — UNIFIED MASTER STATE & PLAN
**Single source of truth. Supersedes all prior handoffs on points of conflict.**

Repo: `amaliyu/muktar24` (PRIVATE) · Prod branch: `main` · Stack: React 18 + Vite 5 + Supabase (PostgreSQL, RLS) + Vercel
App: APC Manager — internal ERP for Abuja Precast Concrete Limited
**Updated: 2026-06-26 (Session 7).** All DB state verified by live query, not memory.
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
| 4 | HR modules | 4a ✅, 4d ✅, 4b ✅ (DB+UI; Phase B deferred), 4c partial (self-service foundation ✅; disciplinary pending) |
| 5 | Payment-request (revenue) + ingestion engine (Phase 1+) | Parked; Phase 0 done; after #4 |

### Phase 4 sub-roadmap
- 4a lifecycle/onboarding — ✅ DONE.
- 4d ID + business cards + photo — ✅ DONE (merged). Visual polish: accepted as functional; minor header-size nit optional.
- 4b leave & salary-advance requests — ✅ DB+UI DONE (Session 7). Phase B (attendance auto-deduction, leave-balance tracking) deferred.
- 4c disciplinary/queries + staff self-service portal — **Self-service foundation ✅ (Session 7):** RLS, `current_staff_id()`, `MyHRPage`, `my_hr` page key, `meService`. Disciplinary/query module still pending.

---

## 4. KNOWN GAPS / FORWARD ITEMS
- ✅ **Latent-bug sweep — DONE (Session 6).** All six number generators (invoice/waybill/receipt/supplier/batch/employee) audited and given collision handling; no quote/proforma/PO generator exists. Two RLS leaks (staff-PII, invoices/payments) found and closed. Per-role RLS verified for each.
- ✅ **Silent Supabase client fallback — DONE (PR #18, Session 6/7).** `src/lib/supabase.js` now throws immediately on missing `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` instead of falling back to placeholder.
- ✅ **Staff payroll state machine — DONE (PR #20, Session 7).** `advance_staff_payroll` RPC + `trg_staff_payroll_guard` + `staff_payroll_audit`. Approval chain: accountant creates (draft) → ICO → MD → accountant/MD marks paid. Advance deductions integrated into `payroll_lines.deductions`; net-pay fix in `openRun`.
- **HR 4b Phase B (deferred).** Leave attendance auto-deduction (salary reduced for unpaid leave days) and leave-balance tracking (annual leave entitlement carry-over) not yet built. Requires schema additions and integration with `attendanceService.getCountsByRange`.
- **Disciplinary/query module (HR 4c).** Self-service foundation is live; the disciplinary notice / query-and-response flow is still pending.
- **Manager email migration (future).** Current manager logins use personal emails. Planned: replace 7 role accounts with official `@abujaprecast.com` addresses (MD/ICO/BDM/logistics/production/store/HR).
- **Orphaned staff photo files** in `staff-photos` bucket from deleted test staff — harmless; clear via Supabase dashboard (SQL delete blocked).
- **Ransom (APC-EMP-018)** in onboarding — HR to complete checklist + activate when ready.
- Original payroll trigger/RPC/audit objects not in tracked migration history (pre-discipline). Live & verified. Optional: capture as no-op migration.

---

## 5. DECISIONS / MILESTONES PENDING (MD)
- ✅ **Staff-payroll approval chain — DECIDED & BUILT (Session 7).** accountant creates (draft) → ICO approves → MD approves → accountant/MD marks paid + records per-line amounts.
- Go-live data re-entry milestone (parked) — clean opening balances; resolves dust kg→tons (~16.3t) gap & beta errors.
- Correction-as-adjustment-movement rule (LOCKED) — corrections are new logged offsetting entries, never silent edits.
- Attendance automation — design active (shared offline-first Android kiosk, face-as-token using enrolled ID-card photos, mandatory human confirmation before any pay sanction). Not built.

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
| HR 4b advances | ✅ DB+UI (S7, PR #21/#22) | Phase B (payroll deduction live; leave-balance tracking deferred) |
| HR 4b leave | ✅ DB+UI (S7, PR #23) | Phase B (attendance auto-deduction) deferred |
| HR 4c self-service foundation | ✅ Stages 1+3 (S7, PR #24) | Stage 4 (disciplinary/query module) pending |
| Invoice/logistics/waybill | ✅ fixed & live | — |
| Silent supabase fallback | ✅ fixed (PR #18) | — |
| Staff-payroll state machine | ✅ live (S7, PR #20) | — |
| Payment-request + ingestion (#5) | Phase 0 parked — **NEXT** | after #4 complete |
| Go-live re-entry / dust gap | parked | MD triggers |
