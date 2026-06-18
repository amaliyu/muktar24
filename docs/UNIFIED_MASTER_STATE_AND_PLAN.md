# APC MANAGER — UNIFIED MASTER STATE & PLAN
**Single source of truth. Supersedes all prior handoffs on points of conflict.**

Repo: `amaliyu/muktar24` (PRIVATE) · Prod branch: `main` · Stack: React 18 + Vite 5 + Supabase (PostgreSQL, RLS) + Vercel
App: APC Manager — internal ERP for Abuja Precast Concrete Limited
**Updated: 2026-06-18 (Session 5).** All DB state verified by live query, not memory.
**Status: BETA. A physical/manual backup system runs in parallel — NO downtime pressure.**
**Operating mode: SLOW AND VERIFIED — fix on a branch → test on the branch's Vercel preview AS THE AFFECTED ROLE → confirm with own eyes → MD merges → re-verify production.**

---

## 0. HOW THIS DOCUMENT IS USED
- This is the master. On conflict: **live DB facts win**, then this doc.
- Repo is private → planning chats (Claude.ai) have NO GitHub access. Brief new chats by pasting this file.
- Division of labour: **Claude Code writes code/SQL files & opens PRs; the MD merges. Migrations are applied from the planning chat via the Supabase connector using `apply_migration` (tracked), with before/after verification.**
- Preview = branch code against the PRODUCTION database (one Supabase project). So test data created on a preview is REAL data and must be cleaned.

---

## 1. SESSION HISTORY (most recent first)

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
- Fix: `invoicesService.getNextNumber()` queries the live DB, parses the NUMERIC max suffix across all APC-INV numbers, increments (4-digit suffix going forward), with a 23505 unique-violation retry. Verified live: generates APC-INV-2026-2362+ cleanly. Existing 22 numbers left untouched.

**D. Logistics-manager delivery access + waybill loophole (PR #9, merged).**
- Bug: logistics_manager couldn't create waybills ("No customers with active invoices") because `ordersService.getAll()` joined raw `order_items(*)` and the role lacked SELECT on `orders`/`order_items`; the failing query was silently swallowed.
- Requirement: logistics sees DELIVERY details only (NO money), sees new orders/approved LPOs, customer records & statements; CANNOT write invoices or receipts; CANNOT approve LPOs (only views approved ones); generates waybills/statements.
- Fix (DB): created money-free view `order_items_delivery` (id, order_id, block_type, quantity, created_at — NO unit_price/subtotal); added logistics_manager + store_officer to `orders_select` (orders has no money columns); logistics NOT added to raw order_items (money stays hidden). Frontend routes logistics to the view.
- Waybill loophole closed: removed the broad `waybills_write` FOR ALL policy that OR'd ico/production_manager/bdm into write access. Waybill write is now md/logistics_manager/store_officer only (insert/update), md-only delete.
- Verified: truck/loading-labour functions (truck_loading_log, truck_loading_loaders, truck_loader_assignments, delivery_schedules, delivery_schedule_items) all confirmed INTACT for logistics_manager.

**E. Housekeeping.** Test staff repeatedly created during preview testing were cleaned (rows + cascaded checklist; photo files in storage must be cleared via Supabase dashboard — SQL delete is blocked). Staff settled at 19 (18 active + RANSOM ABANG OSANG APC-EMP-018 correctly in 'onboarding' pending activation).

**LESSONS (carried forward):**
- Multiple LATENT bugs surfaced this session (invoice numbering, orders_select auth.users from Session 4, logistics RLS gaps). The app has a backlog of these from earlier dev; expect more to surface. Consider a deliberate sweep (see §4).
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

## 2. VERIFIED LIVE STATE (queried 2026-06-18)
- Staff: 19 (18 active, 1 onboarding — Ransom APC-EMP-018). Invoices: 25.
- **0 policies reference auth.users. 0 allow-all overrides.**
- Money-free `order_items_delivery` view: live. Waybills: 4 policies (insert/update md+logistics+store, delete md, select broad). No `waybills_write` loophole.
- Payroll engine intact (trg_weekly_payroll_guard enabled, advance_weekly_payroll RPC, weekly_payroll_audit RPC-write-only).
- Card support: `staff.job_title`, `staff.photo_path`, private `staff-photos` bucket, `public/logo-icon.png` (icon-only logo).
- Invoice generation: `getNextNumber()` numeric-max + 23505 retry; 4-digit suffix going forward.

### ⚠️ ARCHITECTURE NOTE
`weekly_labour_payroll` is a status header only (one row per week_ending+payroll_type). Worker lists/amounts come from daily tables joined by week+type: production `daily_roster_entries`; loading `truck_loading_log`/`truck_loading_loaders`. The `attendance` table is for STAFF attendance; daily-labour attendance lives in roster/loading tables.

### Migrations (tracked) — Session 5 additions
`logistics_delivery_view_and_orders_read`, `waybills_remove_broad_write_loophole`
(plus Session 3 staff/onboarding migrations, Session 4 `fix_orders_select_auth_users_perm`, Session 2 dedupe/sweep, Session 1 baseline.)

---

## 3. UNIFIED PRIORITY ORDER
| # | Work | State |
|---|---|---|
| 0 | Payroll RPC + state machine | ✅ COMPLETE & live-proven |
| 1 | G.1 quick-fixes | ✅ COMPLETE |
| 2 | Payroll client cutover | ✅ COMPLETE |
| 3 | RLS for remaining tables | ✅ COMPLETE (0 overrides, 0 auth.users refs) |
| 4 | HR modules | 4a ✅ (DB+frontend). 4d ✅ (cards/photo, merged; visual polish near-final). 4b/4c pending |
| 5 | Payment-request (revenue) + ingestion engine (Phase 1+) | Parked; Phase 0 done; after #4 |

### Phase 4 sub-roadmap
- 4a lifecycle/onboarding — ✅ DONE.
- 4d ID + business cards + photo — ✅ DONE (merged). Visual polish: accepted as functional; minor header-size nit optional.
- 4b leave & salary-advance requests — PENDING (needs staff-payroll state-machine decision; payroll deduction + attendance integration).
- 4c disciplinary/queries + staff self-service portal — PENDING (needs auth/access decision; most staff lack logins).

---

## 3B. ▶ RECOMMENDED NEXT SESSION (start here)
Phase 4b and 4c are both BLOCKED on decisions, so do NOT start either cold:
- 4b (leave/advances) is blocked on the **staff-payroll state machine** (no approval
  workflow exists on payroll_runs/payroll_lines yet — advance deduction needs it).
- 4c (disciplinary/self-service) is blocked on the **staff login/access model** (most
  staff have no account; user_profiles.staff_id mostly null).

Two unblocked, high-value options to pick from first:
1. **LATENT-BUG SWEEP** (recommended, no blocker, prevents fire-drills). Three pre-existing
   bugs surfaced by accident this session (invoice numbering, orders_select auth.users,
   logistics RLS gaps). Proactively audit: all number generators (LPO, quote, receipt,
   waybill — same row-count-vs-numeric-max trap as invoices), and per-role RLS on every
   role (the orders_select / order_items exclusions were only found because logistics broke).
   Method that worked: query pg_policies for excluded roles; test the app AS each role.
2. **DECIDE THE STAFF-PAYROLL WORKFLOW** (unblocks 4b). Define statuses/roles/approval
   order for staff payroll, then build the trigger+RPC+audit pattern mirroring the proven
   labour-payroll engine (advance_weekly_payroll). Only after this can 4b's advance
   deduction be built.

Quick housekeeping that can happen anytime: activate Ransom (APC-EMP-018) after HR
completes his checklist; clear orphaned test photo files via the Supabase dashboard.

---

## 4. KNOWN GAPS / FORWARD ITEMS
- **Latent-bug sweep (recommended).** Payroll, invoices, and logistics each had a pre-existing generation/RLS bug surface this session. Proactively audit other number generators (LPO/quote/receipt/waybill) and per-role RLS rather than waiting for breakage.
- **Silent Supabase client fallback.** `src/lib/supabase.js` falls back to placeholder URL/key if env vars are missing, failing silently as anon. FORWARD FIX (own branch): make it fail loudly.
- **Staff payroll (`payroll_runs`/`payroll_lines`)** has role-scoped RLS but no state machine; needs the trigger+RPC+audit pattern if/when it gets an approval workflow. Blocks 4b advance deduction.
- **Orphaned staff photo files** in `staff-photos` bucket from deleted test staff — harmless; clear via Supabase dashboard (SQL delete blocked).
- **Ransom (APC-EMP-018)** in onboarding — HR to complete checklist + activate when ready.
- Original payroll trigger/RPC/audit objects not in tracked migration history (pre-discipline). Live & verified. Optional: capture as no-op migration.

---

## 5. DECISIONS / MILESTONES PENDING (MD)
- Go-live data re-entry milestone (parked) — clean opening balances; resolves dust kg→tons (~16.3t) gap & beta errors.
- Correction-as-adjustment-movement rule (LOCKED) — corrections are new logged offsetting entries, never silent edits.
- Attendance automation (future) — biometric/fingerprint capture.

---

## 6. WORKING RULES (binding)
1. One session = one scope = one branch off `main`. Keep unrelated fixes on separate branches/PRs.
2. Claude Code writes code + SQL files; does NOT apply migrations.
3. Migrations applied from the planning chat via `apply_migration` (tracked), before/after verified.
4. No window changes bucket visibility / RLS / DB config except via the planning chat.
5. Test on preview before merge. **MD merges — no self-merge to main by Claude Code.** MD's live test counts as review.
6. End every session by updating THIS document.
7. After any RLS/policy change, smoke-test the app AS EACH affected role before promoting.
8. Verify fix proposals against the live DB before applying — several "confident" diagnoses this session were wrong on the facts.

---

## 7. STATUS BOARD
| Stream | State | Next |
|---|---|---|
| Payroll RPC (#0/#2) | ✅ live-proven | — |
| RLS sweep (#3) | ✅ complete | — |
| HR 4a lifecycle | ✅ live | — |
| HR 4d cards/photo | ✅ merged | optional header-size polish |
| HR 4b leave/advances | pending | staff-payroll state-machine decision |
| HR 4c disciplinary/self-service | pending | auth/access decision |
| Invoice numbering | ✅ fixed & live | — |
| Logistics delivery access | ✅ fixed & live | — |
| Waybill write loophole | ✅ closed | — |
| Silent supabase fallback | latent hazard | forward fix, own branch |
| Latent-bug sweep | recommended | audit other generators/RLS |
| Payment-request + ingestion (#5) | Phase 0 parked | after #4 |
| Go-live re-entry / dust gap | parked | MD triggers |
