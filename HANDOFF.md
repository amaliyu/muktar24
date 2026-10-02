# Abuja Precast Manager — Handoff Document

> **Last updated:** 2026-08-07
> **Repo:** `amaliyu/muktar24`
> **Production branch:** `main` (Vercel auto-deploys from here)
> **Master doc:** `docs/UNIFIED_MASTER_STATE_AND_PLAN.md` — the single source of truth (full session log, priority queue, decisions, §10 bug-pattern catalogue). This handoff is the short version; on any conflict, the master doc and live DB win.
> **Reference doc:** `APP_FULL_DOC.md` (full technical reference)

---

## OPERATING RULES — Non-Negotiable

Restate at the start of every session; follow without exception.

1. **MD merges only.** Claude Code never merges its own PRs. Every branch goes through a PR the MD reviews and merges.
2. **No DB changes from the coding window.** Schema/RLS/migrations are applied from the planning chat via `apply_migration` (tracked, before/after verified). The coding window may *read/verify* the DB but does not change it.
3. **One scope, one branch, one PR.** Each distinct piece of work gets its own `claude/<short-name>` branch and its own PR. Never stack unrelated work.
4. **Slow and Verified.** fix on branch → Vercel preview → test as the affected role → confirm with own eyes → MD merges → re-verify on production. Never mark work done until it passes role-based testing. **Never trust a prior "done" — diff the code against main AND verify against the live DB** (master Working Rules #10/#11; Session 23 found several "done" features silently broken).
5. **Verify every column against `information_schema` before writing a query.** Assumed column names have caused real production bugs. See the trap catalogue in master §10.

**Verification-access reality (important):** the coding window's DB connector runs as the **service role** — it bypasses RLS and PostgREST parsing, so it cannot prove how a query behaves *as a specific role through the app*. There is no credentialed Vercel-preview login in the window and direct REST to Supabase is proxy-blocked. So end-to-end "as the affected role in the browser" testing is the MD's step; where a claim can only be proven that way, the coding window verifies as far as service-role round-trips allow and **discloses the residual gap in the PR** rather than overstating it.

---

## Current State of `main`

`main` tip: **`7069d6d`** — "Merge PR #110 (multi-role support)".

All of PRs **#92–#110** (Session 23) are merged. No known open feature branches carrying unmerged work. `main` is the deploy source.

---

## ⚠️ Live-State Warning — read before touching any financial/inventory figure

**A historical backfill to January 2026 is IN PROGRESS.** Inventory levels and every financial aggregate (expenses, P&L, balance sheet, cash flow, stock) are being back-populated and are **not a settled opening position.**

- **Do NOT** treat any inventory or financial total as final, reconcile it to zero, or raise a discrepancy alarm off it until the backfill is declared complete **and** a physical count has been taken.
- The financial reports rebuilt this session (P&L/balance-sheet/cash-flow/supplier/expense — PRs #104/#106/#107) are structurally correct but read data that is still moving.
- Snapshot figures (planning-chat, 2026-07-27): **99 tables · 325 RLS policies (234 multi-role-aware) · 456 expenses = ₦15,811,143** — all provisional.

---

## Recent Changes — Session 23 (PRs #92–#110)

Full detail in master §1 (Session 23). Compressed:

- **Phase 6A maintenance (PR #92/#93):** Maintenance page — per-asset PM checklists + downtime log (reason categories, resolver); staff-picker filtered to the asset's team via `reports_to_staff_id`. First real OEE data source.
- **Phase 6B curing sign-off (PR #94/#95/#96):** Batches gained a product dropdown (`product_id`), Batch Date, and an *advisory* Store-Officer curing sign-off; Edit/Delete role-gated to match RLS. (#95 re-landed as #96 after a branch-base slip.)
- **Data-integrity fixes:** production audit trail + duplicate warning (#97); dust/chippings auto-deduct that never fired now fires (#98); roster edit switched from delete-then-reinsert to `upsert` to stop duplicate accumulation (#99, + UUID-quoting follow-up `fbdad15`); production-delete now reverses stock (#101); inventory `editMovement` double-deduct fixed + role-gated (#105).
- **Accounting reports rebuilt:** `expenses.expense_date` fix + 13 fetchers stop swallowing errors (#104); P&L rebuilt as accrual income statement (#106); expense/supplier/cash-flow/balance-sheet rebuilt with every column re-verified vs `information_schema` (#107).
- **UX / access:** Messages re-added to affected roles + notification empty-states (#100); inventory kg/tonnes toggle + "Recorded By" (#102); payment-request attachment read-back (#103); roster/loading Edit/Delete gated on linked payroll status (#108); Truck Loading date-range filter + null-date toggle (#109).
- **Multi-role (#110):** effective roles (primary + active grants via `my_effective_roles()`), union nav, MD-only `RoleGrantsManager`, `src/lib/roles.js` (`hasRole`, `effectiveRolesOf`). MD-only authority and approval-chain gates intentionally left as primary-role checks.

The recurring bug shapes from this session (date-column traps, `expenses` category, `suppliers.company_name`, RLS delete-then-reinsert, swallowed errors, keyword inventory lookup, reverse-then-apply) are catalogued in **master §10** — read it before touching reports or stock code.

---

## Open Threads

### A. Needs a person / an MD decision (cannot be built until answered)
1. **Historical backfill to January + physical count** — finish the backfill, then take a real physical inventory count and reconcile. Everything below that depends on true stock is blocked on this.
2. **Confirm interlock & kerb curing days** — Phase 6B's sign-off stays advisory until the MD ratifies the minimum curing age per product. (NIS 87 gives a default; MD-configurable value must be confirmed.)
3. **DOXIX opening-balance reconciliation** — explain the ~₦147.8m gap (₦233m fixed assets recorded vs **zero** recorded debt) before opening balances can be trusted.
4. **Deactivate Peter Gomina's staff record** — deactivation only (not delete); awaiting MD go-ahead.
5. **Pending SQL from older handoffs — VERIFY, don't assume.** Earlier HANDOFF SQL blocks (`prod_targets_write` APM fix; seed `assistant_production_manager` into `app_roles`) were the kind of item master §4 notes were *found already applied*. Check live state before running anything; apply from the planning chat if genuinely outstanding.

### B. Ready to build (scoped, no decision blocking)
1. **Phase 6C — spare-parts register** (§9): critical-spares register (part, criticality tier, on-hand, reorder threshold, Turkish-parts lead time) + reorder alerts.
2. **Phase 6D — fleet status tracking** (§9): active/down per truck (extends `vehicles`), repair log + expected-return date; closes the "trucks down with no visible capacity impact" blind spot.
3. **Phase 6E — role-KPI dashboard + reminders** (§9): depends on 6A–6D data; folds in the parked Session-21 role-responsibility reminders.
4. **Multi-role button-level conversion** in Labour.jsx / Reports.jsx / Maintenance / FinancialStatements — convert *delegatable* action gates from primary-role to `hasRole()` (leave MD-only authority and approval-chain gates as primary-role). Itemised in PR #110.
5. **`truck_loading_log` auto-expense trigger** fires on `total_amount`/`blocks_loaded`, not `date` — correcting a loading row's date leaves its linked expense in the wrong period. Trigger fix (planning-chat), not app code.
6. **Waybill → order linkage** and **36 unvalued deliveries** — data-completeness stream alongside the backfill; margin/fulfilment-value totals understate until closed.

### C. Sequenced further out
- **Bank statement parser hardening** (Taj PDF is a single point of failure — master §8), then the full **Phase 5c ingestion engine**, which stays LAST behind the backfill/costing/reconciliation queue (master §3).
- **WAC costing → cost per 1,000 blocks** — blocked on the physical count (A.1).

---

## Architecture Quick Reference

- **No router.** A `useState` string drives navigation. `safePage` falls back to `'dashboard'` if the current page is outside the role's allowed list. With multi-role (PR #110), the visible nav is the UNION of every effective role's pages.
- **Role access:** `canSee(pageId)` checks `ROLE_PAGES[role]`; `'all'` = MD full access. **Effective roles:** `src/lib/roles.js` — `hasRole(profile, ...roles)` (primary OR active grant; for *delegatable* checks only) and `effectiveRolesOf(profile)`. For MD-only authority, check the PRIMARY role (`userProfile.role === 'md'`), never `hasRole`.
- **ICO / Board read-only:** `data-ico-view` / `data-board-view` CSS masks hide all buttons except `[data-ico-allow]`; masks are relaxed on `grantedPages` for multi-role.
- **Service layer:** Supabase calls live in `src/services/*.js` (exception: Labour.jsx makes some direct calls inline).
- **Inline styles only.** No CSS framework.

---

## Key Files

| File | Why it matters |
|------|----------------|
| `src/App.jsx` | ~11k lines — most page components inline (incl. TruckLoadingPage, TradingMarginReport, RoleGrantsManager, Maintenance), `ROLE_PAGES`, nav gating (`allowedPages`/`canSee`/`visibleNav`/`safePage`), ICO/Board masks |
| `src/lib/roles.js` | Effective-role helpers (`hasRole`, `effectiveRolesOf`) — the multi-role spine (PR #110) |
| `src/components/Labour.jsx` | Labour module (pool, roster, payroll, rates); exports `getLastSaturday`/`shiftWeek`/`shiftDays`; roster `upsert`; payroll range picker |
| `src/components/Reports.jsx` | Role-gated reporting engine; `buildPLStatement`/`buildBalanceSheet`/`buildCashFlowRows`/`supplierStatementRows` (rebuilt PRs #104/#106/#107) |
| `src/components/StaffHR.jsx` | Staff & HR management |
| `src/services/labour.js` | Labour service (pool, roster, truck loading `getLogs({from,to,includeNull})`/`getUndatedCount()`, payroll joins) |
| `src/services/inventory.js` | `editMovement` (reverse-then-apply), `autoDeductProduction` (dust/chippings) |
| `src/services/authService.js` | Multi-role grants: `listActiveGrants`/`checkRoleConflict`/`grantRole`/`revokeRole` |
| `docs/UNIFIED_MASTER_STATE_AND_PLAN.md` | Master session log + §10 bug-pattern catalogue — read before reports/stock work |
| `APP_FULL_DOC.md` | Full technical reference — roles, tables, workflows |

---

## How to Continue Development

1. **Start fresh:** `git fetch origin main && git checkout main && git pull`
2. **Branch:** `git checkout -b claude/<short-name>`
3. **Before writing queries:** confirm columns against `information_schema` (master §10) and read the backfill warning above.
4. **Env vars** (Vercel + `.env.local`): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
5. **Local dev:** `npm install && npm run dev` · **Build check:** `npm run build`.
6. **Diff every PR against current main before review** (Working Rule #9) and disclose any verification gap in the PR body.
