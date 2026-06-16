# APC MANAGER — UNIFIED MASTER STATE & PLAN
**Single source of truth. Supersedes all prior handoffs on points of conflict.**

Repo: `amaliyu/muktar24` (PRIVATE) · Prod branch: `main` · Stack: React 18 + Vite 5 + Supabase (PostgreSQL, RLS)
App: APC Manager — internal ERP for Abuja Precast Concrete Limited
**Updated: 2026-06-16 (Session 4).** All state below verified by live DB query, not memory.
**Status: app is in BETA. A physical/manual backup system runs in parallel — there is no downtime pressure. Operating mode for this phase: SLOW AND VERIFIED (fix on branch → test on preview → confirm → promote).**

---

## 0. HOW THIS DOCUMENT IS USED
- This is the **master**. On any conflict, **live DB facts win**, then this doc.
- Repo is private → planning chats have no GitHub read access. Brief new chats by **pasting this file**.
- Working rule: **Claude Code writes code/SQL FILES; it does NOT apply migrations.** Migrations are
  applied via the Supabase connector in the planning chat, using **`apply_migration` (tracked)** with
  before/after verification.

---

## 1. SESSION HISTORY (most recent first)

### ✅ SESSION 4 (2026-06-16) — PHASE 4A FRONTEND SHIPPED + PRODUCTION OUTAGE FIXED
1. **Phase 4a frontend merged to main (PR #5).** Add Staff now defaults new hires to
   `employment_status='onboarding'`; `is_active: true` write removed from create; OnboardingTab
   (checklist + activate); status badges; attendance/payroll pickers filter to active; eligibility-
   trigger errors caught on BOTH attendance and payroll_lines inserts with plain messages.
2. **`is_active` staff-create bug fixed.** Production frontend was sending `is_active: true` to the
   now-GENERATED column → "cannot insert a non-DEFAULT value into column is_active". Removed in the
   PR #5 / hotfix work. Live-tested on production: staff create works.
3. **PRODUCTION OUTAGE — diagnosed and fixed.** Symptom: "permission denied for table users" across
   register, schedules, customers, orders, LPO, dashboard (all metrics zero). **Root cause was NOT
   env vars and NOT Phase 4a** (both were investigated and ruled out — env vars confirmed present in
   Vercel, DB confirmed healthy). Actual cause: the `orders_select` RLS policy contained a subquery
   reading `auth.users` (`SELECT users.email FROM auth.users WHERE id = auth.uid()`). The
   `authenticated` role cannot read `auth.users`, so evaluating the policy threw permission-denied,
   breaking orders and every screen that joins/embeds orders. **Fix:** rewrote `orders_select` to
   resolve the current user's staff id via `public.user_profiles.staff_id` instead. Migration
   `fix_orders_select_auth_users_perm`. Verified: 0 policies reference auth.users; app + dashboard
   confirmed working by MD.
4. **Test data cleaned.** Removed 4 test staff created during live testing (2 earlier + 2 in prod).
   Staff back to 17 real records. Checklist rows cascaded cleanly; no orphans.

**LESSONS (process):**
- Two production problems this session were **latent** bugs exposed by a redeploy / new access path,
  not new breakage. DB changes going live ahead of matching frontend, and policies not tested per-role,
  are the underlying causes.
- **When an error names a specific Postgres table, trust that over build/env theories.** Time was lost
  chasing env vars when the error string ("permission denied for table users") pointed straight at the DB.
- **Test the app as EACH role** (md, accountant, ico, bdm, store_officer, etc.) after any RLS change —
  this would have caught `orders_select` immediately. Cheap given the physical backup + no downtime.

### ✅ SESSION 3 (2026-06-15) — PHASE 4A DB LAYER
1. `staff.employment_status`: NOT NULL, CHECK (onboarding|active|suspended|terminated), default 'active'.
2. `staff.is_active`: converted to GENERATED column (= employment_status = 'active'). Read-only.
3. `onboarding_checklist_templates` (6 seeded items) + `staff_onboarding_checklist` (per-staff, RLS:
   md/hr_officer write). 17 active staff backfilled as fully checklisted.
4. Eligibility triggers: BEFORE INSERT on `attendance` + `payroll_lines` reject non-active staff.
5. Onboarding gate trigger: BEFORE UPDATE on `staff` blocks transition into 'active' unless all
   required checklist items complete. (NOTE: only gates the onboarding→active transition; the INSERT
   default + Add Staff form is what routes new hires through onboarding — now handled in Session 4.)

### ✅ SESSION 2 (2026-06-15)
1. **Payroll RPC cutover (#0/#2) — COMPLETE & LIVE-PROVEN.** Handlers cut over to
   `advance_weekly_payroll` RPC. Real ICO approval by KAYODE OJO 2026-06-15 wrote the first
   `weekly_payroll_audit` row (draft→ico_approved). Removed a buggy post-RPC payment_date write.
2. **Payroll duplication FIXED.** Deduped 26 duplicate status rows; added UNIQUE(week_ending,
   payroll_type). Migration `..064205`.
3. **Create/"Load Week" idempotent.** All 4 INSERT sites → upsert(onConflict week_ending,payroll_type).
4. **RLS sweep (#3) — COMPLETE.** Dropped 26 permissive `allow all` overrides; widened `attendance`
   writes to production_manager/assistant_production_manager. Migration `..104254`.

### ✅ SESSION 1 (2026-06-11/12)
RLS restricted to authenticated; storage policies + definer function access locked; legacy policies
dropped/normalized; role RLS write policies on 14 tables; `staff-documents` bucket made private.

---

## 2. VERIFIED LIVE STATE (queried 2026-06-16)
### Payroll engine
- `trg_weekly_payroll_guard`: ENABLED. Blocks direct status writes; md_approved/paid immutable. Only
  `advance_weekly_payroll` (SECURITY DEFINER) transitions.
- `advance_weekly_payroll(p_payroll_id, p_action, p_reason)`: live. Actions ico_approve | md_approve |
  mark_paid | recall. Resolves actor role+name from user_profiles WHERE id=auth.uid(). mark_paid sets
  payment_date server-side. recall requires reason, NULLs approver fields (history kept in audit).
- `weekly_payroll_audit`: live (1+ rows). Read policy only, no write policy (RPC-only, tamper-resistant).
- `weekly_labour_payroll`: 6 rows, UNIQUE(week_ending,payroll_type) enforced.

### Staff lifecycle
- `staff.employment_status`: NOT NULL, default 'active', CHECK (onboarding|active|suspended|terminated).
  17 staff, all 'active'.
- `staff.is_active`: GENERATED (= employment_status='active'). Read-only — never write it.
- `onboarding_checklist_templates`: 6 required items. `staff_onboarding_checklist`: per-staff,
  UNIQUE(staff_id,item_key), ON DELETE CASCADE from staff.
- `check_staff_active_for_insert()` (INVOKER): trigger on attendance + payroll_lines BEFORE INSERT.
- `check_onboarding_complete_for_active()` (INVOKER): trigger on staff BEFORE UPDATE (onboarding gate).

### ⚠️ ARCHITECTURE NOTE
`weekly_labour_payroll` is only a status header, one row per (week_ending, payroll_type). The worker
list and money come from daily operational tables joined by week+type, NOT by FK: production from
`daily_roster_entries`, loading from `truck_loading_log`/`truck_loading_loaders`. Status and displayed
amounts are decoupled. The `attendance` table is for STAFF attendance; daily-labour attendance lives in
the roster/loading tables. (This is why `attendance` can show 0 rows while payroll data exists.)

### Security / RLS posture
- 63 tables enforce role-based writes via `get_user_role()` helper (intact, verified: `SELECT role
  FROM user_profiles WHERE id = auth.uid()`, STABLE SECURITY DEFINER).
- **0 `allow all` overrides remain. 0 policies reference `auth.users`** (fixed Session 4).
- 11 user_profiles, all with valid non-null roles (incl. md). Anon access closed. `staff-documents`
  bucket private (signed URLs).
- Supabase anon key confirmed active (not rotated/disabled), valid through 2034.
- Staff-id-referencing tables (only 5): attendance, payroll_lines, staff_documents,
  staff_onboarding_checklist, user_profiles.

### Ingestion engine — Phase 0 (APPLIED, parked)
`staging_transactions` quarantine + ingestion_source/updated_at on the 4 money tables. Unused,
non-destructive, waiting (see §4 item #5).

### Migrations (tracked) — full history
session1 (x4, 2026-06-11/12) · phase0_ingestion (06-14) · dedupe_weekly_labour_payroll (06-15) ·
session2_widen_attendance_and_drop_allow_all_overrides (06-15) · staff_lifecycle_status ·
onboarding_checklist_tables · staff_eligibility_triggers · fix_eligibility_function_security ·
staff_onboarding_gate_trigger (all 06-15) · **fix_orders_select_auth_users_perm (06-16)**.

---

## 3. UNIFIED PRIORITY ORDER
| # | Work | State |
|---|---|---|
| 0 | Payroll RPC cutover + state machine | ✅ COMPLETE & live-proven |
| 1 | G.1 quick-fixes | ✅ COMPLETE (rls_policies.sql removed via PR #4) |
| 2 | Payroll state machine client cutover | ✅ COMPLETE (folded into #0) |
| 3 | RLS for remaining tables | ✅ COMPLETE (26 overrides dropped; orders_select auth.users fixed) |
| 4 | HR modules / unified staff table | 4a (lifecycle/onboarding) ✅ COMPLETE (DB + frontend live). 4b/4c/4d pending |
| 5 | Payment-request (revenue) workflow + ingestion engine (Phase 1+) | Parked; Phase 0 done; after #4 |

### Phase 4 sub-roadmap (HR)
- **4a Employee lifecycle / onboarding** — ✅ DONE (DB + frontend).
- **4b Leave & salary-advance requests** — pending. Depends on payroll approval-workflow decision
  (staff payroll has no state machine yet) + attendance integration.
- **4c Disciplinary / queries + staff self-service portal** — pending. Depends on auth/access decision
  (most staff have no login; user_profiles.staff_id mostly null).
- **4d Staff ID card + complimentary (business) card generation** — NEW, requested Session 4. Generate
  + download from staff profile after activation/approval (hr or md). NOT YET SCOPED. Design decisions
  outstanding: card fields, branding, and a likely schema gap (staff photo storage — not currently a
  staff column). Scope fresh before any build.

---

## 4. KNOWN GAPS / FORWARD ITEMS
- **Staff payroll (`payroll_runs`/`payroll_lines`) has role-scoped RLS but NO server-side status
  enforcement / state machine.** If given an approval workflow, needs the SAME trigger+RPC+audit
  pattern as Labour. Blocks 4b salary-advance deduction. MD decision pending.
- **Silent Supabase client fallback (latent landmine).** `src/lib/supabase.js` falls back to
  placeholder URL/key if env vars are absent, failing silently as anonymous instead of erroring loudly.
  Did not cause the Session 4 outage but is a real hazard on any future build with a missing var.
  FORWARD FIX (own branch, not urgent): make the client fail fast/visibly if env vars are missing.
- **Per-role testing not yet systematic.** Adopt: after any RLS/policy change, smoke-test the app as
  each role before promoting.
- **Original payroll trigger/RPC/audit objects are NOT in tracked migration history** (applied via raw
  SQL pre-Session-2). Live + verified, but no migration artifact. Optional: capture as no-op migration.
- **`updated_at` auto-update trigger** on the 4 money tables — deliberately deferred.

---

## 5. DECISIONS / MILESTONES PENDING (MD)
- **Go-live data re-entry milestone (parked).** Resolves dust kg→tons gap (~16.3-ton discrepancy) and
  beta entry errors via clean opening balances. Trigger when ready.
- **Correction-as-adjustment-movement rule (LOCKED).** Corrections = new logged offsetting entry, never
  a silent edit/delete. Full controlled-correction feature at go-live (trigger+RPC+audit pattern).
- **Attendance automation (future, #4 era).** Replace manual attendance with biometric/fingerprint.
- **Dust kg→tons conversion** — only after stock gap closed (defer to go-live re-entry).

---

## 6. WORKING RULES (binding on all windows)
1. One session = one scope = one branch off `main`. Prefix commits with the workstream.
2. Claude Code writes code + SQL FILES; does NOT apply migrations.
3. Migrations reviewed + applied through the planning chat via `apply_migration` (tracked),
   before/after verified.
4. No window changes bucket visibility / RLS / DB config except via the planning chat.
5. Test on preview before merge. **MD reviews before merge — no self-merge to `main` by Claude Code.**
6. End every session by updating THIS document.
7. **(NEW) After any RLS/policy change, smoke-test the app as each affected role before promoting.**

---

## 7. STATUS BOARD
| Stream | State | Next |
|---|---|---|
| Payroll RPC cutover (#0/#2) | ✅ live-proven | none — closed |
| Payroll duplication + constraint | ✅ fixed | none |
| RLS sweep (#3) | ✅ complete (0 overrides, 0 auth.users refs) | none |
| G.1 quick-fixes (#1) | ✅ complete | none — closed |
| HR 4a lifecycle/onboarding | ✅ DB + frontend live | none — closed |
| HR 4b leave/advances | pending | needs staff-payroll state-machine decision |
| HR 4c disciplinary/self-service | pending | needs auth/access decision |
| HR 4d ID + complimentary cards | requested, not scoped | scope design first |
| Production outage (orders_select) | ✅ fixed & verified | none — closed |
| Supabase client silent fallback | latent hazard | forward fix, own branch |
| Payment-request + ingestion (#5) | Phase 0 parked | after #4 |
| Go-live re-entry / dust gap | parked | MD triggers |
