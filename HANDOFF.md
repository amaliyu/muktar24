# Abuja Precast Manager — Handoff Document

> **Last updated:** 2026-07-11
> **Repo:** `amaliyu/muktar24`
> **Production branch:** `main` (Vercel auto-deploys from here)
> **Reference doc:** `APP_FULL_DOC.md` (full technical reference)

---

## OPERATING RULES — Non-Negotiable

These rules govern every Claude Code session on this project. They must be restated at the start of any new session and followed without exception.

1. **MD merges only.** Claude Code never merges its own PRs. All branches go through a GitHub PR that Muktar (MD) reviews and merges.
2. **No DB changes.** Claude Code does not touch the Supabase database directly — no SQL execution, no migration tools, no schema edits. SQL that needs to run is written here in the handoff for Muktar to paste into the Supabase SQL Editor manually.
3. **One feature, one branch, one PR.** Each distinct piece of work gets its own branch (`claude/<short-name>`) and its own PR. Never stack unrelated work on the same branch.
4. **Slow and Verified.** The sequence is: fix on branch → Vercel preview deployed → test as the affected role in the preview → confirm with own eyes → MD merges → re-verify on production. Never mark work done until it passes role-based preview testing.

---

## Current State of `main`

`main` tip: **`91641eeb`** — "Merge PR#68: Truck loading consolidation"

Both PRs from the current work session are merged:
- **PR#67** (`claude/trading-margin-report`) — TradingMarginReport fixes — ✅ merged
- **PR#68** (`claude/truck-loading-consolidation`) — Truck loading consolidation — ✅ merged

There are no open feature branches. `main` is clean.

---

## What This Project Is

A full-stack operations ERP for Abuja Precast Concrete. It handles orders, invoicing, waybills, deliveries, production logging, inventory, labour payroll, staff management, vehicle fleet, expenses, and financial statements — all in a single React SPA backed by Supabase. No router; page state is a single `useState` string.

---

## All Work Done Across Sessions (Cumulative)

### Session 1 — Core ERP Setup
Initial build: orders, invoicing, payroll, production, inventory, waybills, roles, ICO read-only mode.

### Session 2 — Bug Fixes & Role Hardening (2026-06-09)
- **Invoice FK error fix:** Delete order restricted to MD only. `handleSaveInvoice` catches FK errors and auto-refreshes.
- **Labour payroll submit button fix:** `LoadingWeeklySummary` now checks `weekly_labour_payroll` table instead of `truck_loading_log.payment_status` (DB CHECK constraint only allows `unpaid`/`paid` — no intermediate state).
- **Recall to Draft workflow:** Added to all three payroll types. Resets `status → 'draft'`, clears approver fields. Roles: PM, APM, HR, Logistics, ICO, MD.
- **`assistant_production_manager` role added end-to-end:** `APP_ROLES`, `ROLE_PAGES`, Labour.jsx, Reports.jsx. Same pages as PM except no Propose Rate Change.
- **Submit button edge cases fixed:** `LoadingWeeklySummary` no longer silently swallows Supabase errors; Monthly Fixed "Create Payroll" restricted to authorised roles.

### Session 3 — Download Buttons & Statement PDF (2026-06-11)
- **Payroll download buttons (root cause):** `WeeklyPayrollTab` defaulted to *upcoming* Saturday. If today is Wednesday, it picked next Saturday, found no payroll → buttons never rendered. Fixed by adding `getLastSaturday()` so tab opens on the most recent past Saturday.
- **Customer statement PDF:** `buildRows()` rewrote to use `invoice.total_amount` (VAT-inclusive) instead of waybill qty × unit price.
- **Bulk Transfer XLSX + Payment Schedule XLSX:** Added to WeeklyPayrollTab and MonthlyFixedTab, visible to `['accountant', 'ico', 'md']` when status is `md_approved` or `paid`.
- **Dashboard zero stats:** Guard added for `if (!userProfile) return`; re-fetches on `userProfile` change.
- **Accountant page access:** `labour` and `waybills` added to `ROLE_PAGES.accountant`.

### Session 3.5 — Bank Reconciliation + Payment Requests (PRs #62–#66, between sessions)

These PRs were merged between sessions. Documented here for completeness.

#### PR#62: TruckLoadingPage (standalone page)
Extracted truck loading out of Labour.jsx into a dedicated page in App.jsx. This was the prerequisite that made PR#68's consolidation possible.

#### PR#63: Bank Statement Reconciliation
Added whole-file reconciliation gate to bank statement import. Before importing a new statement batch, the system checks if the prior batch was reconciled; if not, the user must confirm before proceeding. Reconciliation check cannot run without a previous reconciliation record — the UI shows an explicit confirmation dialog rather than silently passing. Service: `bankReconciliationsService` in `services/bank.js`.

#### PR#64: Payment Request Bank Reference Matching
Added reference-based matching between bank transactions and payment requests. Two RPCs: `suggest_bank_match(p_bank_transaction_id, p_matched_to_type, p_matched_to_id)` and `confirm_bank_match(p_bank_transaction_id, p_action, p_reason)`. Adds a suggested-match review UI where the accountant can confirm or reject each match. Match statuses: `unmatched`, `suggested`, `matched`. Service: `bankTransactionsService.suggestMatch()` and `.confirmMatch()`.

#### PR#65: Disbursement Source Account
Payment request disbursement flow now requires selecting which bank account the payment will go out from. The `advance_payment_request` RPC now takes `p_bank_account_id`. UI shows a bank account picker on the disbursement modal.

#### PR#66: Backfill Payment Requests
Added a backfill entry form for entering historical payment requests after the fact. Uses the `backfill_payment_request` RPC which sets `status` to `disbursed` and links to a bank transaction directly. The on-behalf-of user picker uses `user_profiles_directory` (the RLS-safe view). Service: `paymentRequestsService.backfill()`.

---

### Session 4 (Current) — Trading Margin Report + Truck Loading Consolidation (2026-07-11)

#### PR#67: TradingMarginReport fixes

**What was broken:**
- Reference column showed `order_reference` or `reference` fields that don't exist on the RPC response.
- RPC (`get_order_trading_margin`) returns raw cost columns — it does NOT return computed margin columns (`gross_margin`, `landed_cost`, `true_margin`). These were being read directly, producing all-zero values.

**What was fixed:**
1. Reference column changed to: `r.invoice_number || (r.order_id ? r.order_id.slice(0, 8) + ' (not invoiced)' : '—')`
2. RPC response normalised at `setRows` — all derived fields computed once at source, stable names used everywhere downstream:

```js
const normalized = (data || []).map(r => {
  const sale     = Number(r.resale_sale_amount)      || 0
  const purchase = Number(r.purchase_cost)           || 0
  const fuel     = Number(r.attributed_fuel_cost)    || 0
  const loading  = Number(r.attributed_loading_cost) || 0
  const haulage  = Number(r.attributed_haulage_cost) || 0
  const landed   = purchase + fuel + loading + haulage
  return {
    ...r,
    sale_amount: sale, purchase_cost: purchase,
    gross_margin: sale - purchase,
    fuel_cost: fuel, loading_cost: loading, haulage_cost: haulage,
    landed_cost: landed,
    true_margin: sale - landed,
  }
})
setRows(normalized)
```

**RPC actual return columns:**
`order_id`, `invoice_number`, `customer_name`, `order_date`, `resale_sale_amount`, `purchase_cost`, `attributed_fuel_cost`, `attributed_loading_cost`, `attributed_haulage_cost`

#### PR#68: Truck Loading Consolidation

**Background:** The `truck_loading_payroll` table, its audit table, and both payroll RPCs (`generate_truck_loading_payroll`, `advance_truck_loading_payroll`) were dropped from the DB by Muktar before this session. This left the TruckLoadingPage Payroll tab calling dead DB objects — a live runtime error on production.

**What was changed:**

`src/components/Labour.jsx`:
- Removed `{ key: 'truck', label: 'Truck Loading' }` from all TABS arrays (PM, APM, HR, Logistics, MD)
- Logistics manager default tab changed from `'truck'` to `'payroll'`
- The `TruckLoadingTab` component and its `truck` conditional render remain in the file as unreachable dead code (harmless)

`src/App.jsx` — TruckLoadingPage component:
- Removed entire **Payroll** tab: all state variables (11), all handler functions (`loadPayrolls`, `handleGenerate`, `handlePayrollAction`, etc.), all payroll UI (~120 lines)
- Remaining tabs: **Log Entry** (`canLog` roles) and **Rates** (`canManageRates` roles)
- Role flags:
  ```js
  const canLog         = ['production_manager','assistant_production_manager','logistics_manager','md'].includes(role)
  const canManageRates = ['logistics_manager','md'].includes(role)
  const canDelete      = ['md','production_manager','assistant_production_manager','logistics_manager'].includes(role)
  ```
- **Delete action added:** each log row shows a Delete button (for `canDelete` roles); clicking sets `deleteTarget`; a confirmation card appears before calling `truckLoadingService.deleteLog(id)`
- **Historical badge added:** if `log.date < log.created_at.split('T')[0]`, the date cell shows an amber badge labelled "Historical"

`src/services/labour.js` — `truckLoadingService`:
- Removed: `getPayrolls()`, `generatePayroll()`, `advancePayroll()`, `getPayrollLogs()`
- Added:
  ```js
  async deleteLog(id) {
    const { error } = await supabase.from('truck_loading_log').delete().eq('id', id)
    if (error) throw error
  },
  ```

#### PR#67 Conflict Resolution
PR#67 was created targeting the wrong base branch (`claude/analyze-test-coverage-irQFZ`). Fixed by retargeting via GitHub API to `main`, then rebasing `claude/trading-margin-report` onto current `main` and force-pushing. PR merged cleanly.

---

## SQL That Must Be Run in the Supabase SQL Editor

**These have NOT been run by Claude Code. Paste each block manually.**

---

### 1. Fix `prod_targets_write` — APM cannot set production targets (BLOCKING for APM role)

```sql
DROP POLICY IF EXISTS "prod_targets_write" ON production_targets;
CREATE POLICY "prod_targets_write" ON production_targets
  FOR ALL
  USING     (get_user_role() IN ('md','production_manager','assistant_production_manager','ico'))
  WITH CHECK (get_user_role() IN ('md','production_manager','assistant_production_manager','ico'));
```

---

### 2. Seed `assistant_production_manager` role (deployment safety)

The role exists in app code but is missing from DB seed files. Run once; also add to `supabase/add_all_roles.sql` and `supabase/MASTER_DEPLOYMENT.sql` for future full rebuilds:

```sql
INSERT INTO app_roles (id, display_name, description, is_system_role)
VALUES (
  'assistant_production_manager',
  'Asst. Production Manager',
  'Production access — targets, logs, schedule; no rate changes',
  false
)
ON CONFLICT (id) DO UPDATE
  SET display_name = EXCLUDED.display_name,
      description  = EXCLUDED.description;
```

---

## Known Limitations

| # | Issue | Severity |
|---|-------|----------|
| 1 | `ordersService.create` not transactional — zombie `orders` rows possible if `order_items` insert fails | Low |
| 2 | `invoice_number` computed client-side — duplicate possible under concurrent sessions | Low |
| 3 | `prod_targets_write` RLS missing APM — APM cannot set daily production targets | **Blocking for APM** |
| 4 | `assistant_production_manager` not in SQL seed files | Low — matters only on full DB rebuild |
| 5 | `TruckLoadingTab` in Labour.jsx is unreachable dead code | Cleanup only — no user impact |

---

## Architecture Quick Reference

- **No router.** `useState` string drives navigation. `safePage` falls back to `'dashboard'` if current page is outside the role's allowed list.
- **Role access:** `canSee(pageId)` checks `ROLE_PAGES[role]`. `'all'` means MD full access.
- **ICO read-only:** `data-ico-view="true"` on `<main>` hides all buttons except `[data-ico-allow]`. Excluded pages: `labour`, `schedule_approvals`.
- **Board member read-only:** same pattern via `data-board-view`.
- **Service layer:** all Supabase calls in `src/services/*.js`. Exception: Labour.jsx makes some direct Supabase calls inside components.
- **Inline styles only.** No CSS framework.

---

## Key Files

| File | Why it matters |
|------|----------------|
| `src/App.jsx` | ~9 500+ lines — almost all page components including TruckLoadingPage, TradingMarginReport |
| `src/components/Labour.jsx` | ~2 300 lines — entire labour module (pool, roster, payroll, rates tabs) |
| `src/components/Reports.jsx` | Role-gated reporting engine |
| `src/components/StaffHR.jsx` | Staff and HR management |
| `src/services/labour.js` | Labour service layer (pool, roles, rate change, roster, truck loading, payroll) |
| `APP_FULL_DOC.md` | Full technical reference — roles, tables, workflows |

---

## How to Continue Development

1. **Always start fresh:** `git fetch origin main && git checkout main && git pull`
2. **Create a feature branch:** `git checkout -b claude/<short-name>`
3. **Run the pending SQL blocks above** if testing with an APM user or after a DB rebuild.
4. **Environment variables** (Vercel + `.env.local`):
   ```
   VITE_SUPABASE_URL=<project URL>
   VITE_SUPABASE_ANON_KEY=<anon key>
   ```
5. **Local dev:** `npm install && npm run dev`
6. **To add a new role:**
   - Add to `APP_ROLES` (App.jsx ~line 102) and `ROLE_PAGES` (~line 118)
   - Add to `supabase/add_all_roles.sql` and `supabase/MASTER_DEPLOYMENT.sql`
   - Insert into `app_roles` table in Supabase
   - Wire component-level role checks (approve buttons, recall, etc.)
7. **To add a new page:**
   - Add component, add page ID to `ROLE_PAGES`, add `pages` entry (~App.jsx line 6912), add sidebar nav item in `NAV_SECTIONS`
