# APC MANAGER — UNIFIED MASTER STATE & PLAN
**Single source of truth. Supersedes all prior handoffs on points of conflict.**

Repo: `amaliyu/muktar24` (PRIVATE) · Prod branch: `main` · Stack: React 18 + Vite 5 + Supabase (PostgreSQL, RLS)
App: APC Manager — internal ERP for Abuja Precast Concrete Limited
**Updated: 2026-06-15 (Session 3).** All state below verified by live DB query, not memory.

---

## 0. HOW THIS DOCUMENT IS USED
- This is the **master**. On any conflict, **live DB facts win**, then this doc.
- Repo is private → planning chats have no GitHub read access. Brief new chats by **pasting this file**.
- Working rule: **Claude Code writes code/SQL FILES; it does NOT apply migrations.** Migrations are
  applied via the Supabase connector in the planning chat, using **`apply_migration` (tracked)** with
  before/after verification.

---

## 1. ✅ SESSION 2 (2026-06-15) — WHAT WAS COMPLETED & PROVEN
1. **Payroll RPC cutover (#0/#2) — COMPLETE & LIVE-PROVEN.**
   - Frontend handlers (`WeeklyPayrollTab`, `MonthlyFixedTab`) cut over from direct `.update({status})`
     to `supabase.rpc('advance_weekly_payroll', …)`. Merged to `main`.
   - Proven end-to-end in production: a real ICO approval by KAYODE OJO on 2026-06-15 10:58 UTC wrote
     the first `weekly_payroll_audit` row (draft → ico_approved). The deployed button → RPC → audit
     path works. **Audit table is live (1 row), no longer empty.**
   - Removed a redundant/​buggy post-RPC `payment_date` write that would have thrown on paid rows.
2. **Payroll duplication FIXED.** `weekly_labour_payroll` had 26 real duplicate status rows across
   slots (one week+type had 19). Deduped (kept most-advanced status per slot), added
   **UNIQUE (week_ending, payroll_type)**. Migration `20260615064205`.
3. **Create/"Load Week" path made idempotent.** All 4 INSERT sites → `upsert(..., {onConflict:
   'week_ending,payroll_type', ignoreDuplicates:true})` + read-back. Prevents new duplicates and the
   post-constraint unique-violation error. Merged to `main`.
4. **RLS sweep (#3) — COMPLETE.** Dropped **26 permissive `allow all` overrides** that were shadowing
   role-scoped write policies (tables looked hardened but were wide-open to any logged-in user).
   Widened `attendance` writes to add `production_manager`/`assistant_production_manager` (they log
   daily-paid-labour attendance; hr/md log staff attendance). Migration `20260615104254`.

---

## 1B. ✅ SESSION 3 (2026-06-15) — PHASE 4A DB LAYER COMPLETE
1. **Staff lifecycle formalized.** `staff.employment_status` now NOT NULL with
   CHECK (onboarding|active|suspended|terminated), default 'active'.
   `staff.is_active` converted to a GENERATED column derived from
   employment_status — the two fields can no longer disagree.
2. **Onboarding checklist tables live.** `onboarding_checklist_templates`
   (6 seeded items) + `staff_onboarding_checklist` (per-staff progress,
   RLS: md/hr_officer write). Backfilled all 17 existing active staff as
   fully checklisted.
3. **Eligibility triggers live.** BEFORE INSERT on `attendance` and
   `payroll_lines` reject rows for any staff whose employment_status != 'active'.
4. **Onboarding gate trigger live.** BEFORE UPDATE on `staff` blocks the
   transition into employment_status='active' unless all required checklist
   items are complete.
5. Migrations applied (tracked): `staff_lifecycle_status`,
   `onboarding_checklist_tables`, `staff_eligibility_triggers`,
   `fix_eligibility_function_security`, `staff_onboarding_gate_trigger`.

---

## 2. VERIFIED LIVE STATE (queried 2026-06-15)
### Payroll engine
- `trg_weekly_payroll_guard` trigger: **ENABLED**. Blocks all direct status writes; makes
  `md_approved`/`paid` rows immutable. Only `advance_weekly_payroll` (SECURITY DEFINER) can transition.
- `advance_weekly_payroll(p_payroll_id, p_action, p_reason)`: live. Actions `ico_approve | md_approve |
  mark_paid | recall`. Resolves actor role+name from `user_profiles WHERE id = auth.uid()`. `mark_paid`
  sets `payment_date = current_date` server-side. `recall` requires a reason and NULLs both approver
  fields (history preserved in audit — NOT data loss). Returns the updated row.
- `weekly_payroll_audit`: **1 live row** (the real ICO approval). Columns: payroll_id, actor_id,
  actor_name, actor_role, action, old_status, new_status, reason.
- `weekly_labour_payroll`: 6 rows, no duplicate slots, UNIQUE(week_ending,payroll_type) enforced.
  Live spread: draft 3, ico_approved 1, md_approved 2, paid 0.

### Staff lifecycle (Session 3)
- `staff.employment_status`: NOT NULL, default 'active', CHECK IN
  ('onboarding','active','suspended','terminated'). 17 staff, all currently 'active'.
- `staff.is_active`: GENERATED column (= employment_status = 'active'). Read-only — do not write.
- `onboarding_checklist_templates`: 6 required items (bank_details, next_of_kin, emergency_contact,
  guarantor, nin, signed_contract).
- `staff_onboarding_checklist`: per-staff progress, UNIQUE(staff_id, item_key). 17 staff backfilled
  as fully complete (102 rows, completed_by='system_backfill').
- `check_staff_active_for_insert()` (SECURITY INVOKER): trigger on `attendance` + `payroll_lines`
  BEFORE INSERT — rejects rows for non-active staff.
- `check_onboarding_complete_for_active()` (SECURITY INVOKER): trigger on `staff` BEFORE UPDATE —
  blocks transition into 'active' unless all required checklist items complete.

### ⚠️ ARCHITECTURE NOTE (was missing from prior doc — caused confusion in Session 2)
`weekly_labour_payroll` is **only a status header**, one row per (week_ending, payroll_type). The
worker list and money shown in the UI come from **daily operational tables**, joined by week+type, NOT
by FK: production from `daily_roster_entries`, loading from `truck_loading_log`/`truck_loading_loaders`.
**Status and displayed amounts are decoupled.** A header with no daily data shows ₦0 workers; a header
sitting over real daily data drives that data's approval. Do not treat the header's own
`total_amount`/`worker_count` as the payroll figure.

### Security / RLS posture
- **63 tables enforce role-based writes** via the `get_user_role()` helper (NOT literal user_profiles
  refs). **0 `allow all` overrides remain.**
- `weekly_payroll_audit`: read policy only, no write policy — correct (RPC-only writes, tamper-resistant).
- Anon/logged-out access closed (Session 1). `staff-documents` bucket PRIVATE (signed URLs).
- Role helper enforced; money/staff tables (payments, invoices, expenses, staff, etc.) properly scoped.

### Ingestion engine — Phase 0 (APPLIED, parked)
- `staging_transactions` quarantine + `ingestion_source`/`updated_at` columns on the 4 money tables.
  Unused, non-destructive, correctly waiting (see §4 item #5).

### Migrations (tracked)
Through Session 3. Session 2 added `..064205` (dedupe + unique constraint), `..104254` (attendance
widen + drop 26 overrides). Session 3 added: `staff_lifecycle_status`, `onboarding_checklist_tables`,
`staff_eligibility_triggers`, `fix_eligibility_function_security`, `staff_onboarding_gate_trigger`.
All via `apply_migration`.

---

## 3. UNIFIED PRIORITY ORDER — UPDATED
| # | Work | State |
|---|---|---|
| 0 | Payroll RPC cutover + state machine | ✅ COMPLETE & live-proven |
| 1 | G.1 quick-fixes | ✅ COMPLETE — Add-Item fix + `rls_policies.sql` removed via PR #4 (merged to main) |
| 2 | Payroll state machine client cutover | ✅ COMPLETE (folded into #0) |
| 3 | RLS for remaining tables | ✅ COMPLETE (26 overrides dropped, attendance widened) |
| 4 | HR modules / unified staff table | DB layer (4a) ✅ COMPLETE — frontend next |
| 5 | Payment-request (revenue) workflow + ingestion engine (Phase 1+) | Parked; Phase 0 done; after #4 |

---

## 4. KNOWN GAPS / FORWARD ITEMS
- **Add Staff form still defaults new hires to 'active'** with an empty
  checklist (DB column default not yet overridden by frontend). Onboarding
  gate has no effect until this is fixed — next Claude Code session (4a frontend).
- **One existing staff record's `is_active` changed from false→true** as a
  side effect of the is_active→generated-column conversion (their
  employment_status was already 'active', so the fields were inconsistent
  before this session). MD to confirm whether that person's
  employment_status should actually be 'suspended'/'terminated'.
- **Staff payroll (`payroll_runs`/`payroll_lines`) has role-scoped RLS but NO server-side status
  enforcement.** If it ever gets an approval workflow, it needs the SAME trigger + RPC + audit pattern
  proven for Labour. Currently no state machine. MD decision whether/when.
- **Original payroll trigger/RPC/audit objects are NOT in tracked migration history** (applied via raw
  connector SQL pre-Session-2, before the apply_migration discipline). They exist live and verified, but
  have no migration artifact to diff against. Optional clean-up: capture them as a no-op tracked migration.
- **`updated_at` on the 4 money tables has no auto-update trigger** (deliberate; separate signed-off step).
- The 24 non-attendance tables in the #3 sweep were enforced on review of their INSERT role lists.
  If any UPDATE/DELETE role list proves too narrow in practice, it surfaces as a clear permission error
  (not data loss) — a one-line widen fix.

---

## 5. DECISIONS / MILESTONES PENDING (MD)
- **Go-live data re-entry milestone (parked).** Resolves the dust kg→tons gap (~16.3-ton stock
  discrepancy) and all beta entry errors by starting from clean opening balances. Trigger when ready.
- **Correction-as-adjustment-movement rule (LOCKED principle).** Corrections are always a new, logged
  offsetting entry — never a silent edit/delete of the original. Applies to stock/inventory and ledgers.
  Full controlled-correction feature to be built at go-live using the trigger+RPC+audit pattern.
- **Attendance automation (future, #4 era).** Intent: replace human attendance entry with
  biometric/fingerprint or similar objective capture. Today's role-widening keeps manual entry working
  until then.
- **Dust kg→tons conversion** — convert only after the stock gap is closed (defer to go-live re-entry).

---

## 6. WORKING RULES (binding on all windows)
1. One session = one scope = one branch off `main`. Prefix commits with the workstream.
2. Claude Code writes code + SQL **files**; does NOT apply migrations.
3. Migrations reviewed + applied through the planning chat via **`apply_migration` (tracked)**,
   before/after verified. (Raw `execute_sql` for schema = untracked-migration gap; avoid.)
4. No window changes bucket visibility / RLS / DB config except via the planning chat.
5. Test on preview before merge. MD reviews before merge — no self-merge to `main`.
6. End every session by updating THIS document.

---

## 7. STATUS BOARD
| Stream | State | Next |
|---|---|---|
| Payroll RPC cutover (#0/#2) | ✅ live-proven (audit row landed) | none — closed |
| Payroll duplication + constraint | ✅ fixed & enforced | none |
| Create/Load-Week upsert | ✅ merged | none |
| RLS sweep (#3) | ✅ complete (0 overrides) | none |
| G.1 quick-fixes (#1) | ✅ complete | none — closed |
| HR / unified staff (#4) | DB layer (4a) done | frontend: Add Staff defaults + checklist UI |
| Payment-request + ingestion (#5) | Phase 0 parked | after #4 |
| Staff payroll protection | role-scoped RLS only, no state machine | MD decision |
| Go-live re-entry / dust gap | parked | MD triggers |
