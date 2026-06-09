# Abuja Precast Manager — Handoff Document

> **Date:** 2026-06-09
> **Repo:** `amaliyu/muktar24`
> **Live branch (Vercel):** `main`
> **Dev branch:** `claude/analyze-test-coverage-irQFZ`
> **Reference doc:** `APP_FULL_DOC.md` (full technical reference)

---

## What This Project Is

A full operations management ERP for Abuja Precast Concrete. It handles orders, invoicing, waybills, deliveries, production logging, inventory, labour payroll, staff management, vehicle fleet, expenses, and financial statements — all in a single React SPA backed by Supabase.

---

## Current Branch State

The dev branch (`claude/analyze-test-coverage-irQFZ`) is **2 commits ahead of `main`**:

| Commit | What it does |
|--------|-------------|
| `a49950f` | Guards payroll submit button edge cases; restricts Monthly Fixed "Create Payroll" to authorised roles |
| `10ee28f` | Updated `APP_FULL_DOC.md` to current state |

**These commits have not been merged to `main` yet.** Merge them before deploying or building on top.

---

## What Was Done in This Session (in order)

### 1. Invoice FK error fix (`9119c45`)

**Problem:** When the BDM tried to create an invoice, they sometimes got a raw Postgres error: `invoices_order_id_fkey`. Root cause: the Delete order button had no role restriction, so anyone could delete an order while another user had it selected.

**Fixes applied:**
- Delete order button now shows for **MD only** (`src/App.jsx:1322`)
- `handleSaveInvoice` catches the FK error and shows a helpful message + auto-refreshes the order list
- Guard added so invoice can't be saved if `selected` order is null

---

### 2. Labour payroll submit button fix + recall workflow (`ce003f4`)

**Problem:** The logistics manager's "Submit for Approval" button stayed visible after clicking. Root cause: the only way to detect a submission was to check `truck_loading_log.payment_status`, but the DB `CHECK` constraint only allows `'unpaid'` or `'paid'` — there is no intermediate "submitted" state. So the button condition never changed.

**Fix:** `LoadingWeeklySummary` now loads `weekly_labour_payroll` records directly and checks `existingPayrolls[week]`. Once a payroll row exists for a week, the button is replaced with a status badge.

**Recall workflow added:** A "Recall to Draft" button was added to all three payroll types (weekly loading, weekly production, monthly fixed). It resets `status → 'draft'` and clears `ico_approved_by` / `md_approved_by`. Available to: PM, APM, Logistics Manager, HR Officer, ICO, MD — for any payroll that hasn't been marked `paid`.

---

### 3. `assistant_production_manager` role (`f6cb287`)

**New role added end-to-end:**
- Added to `APP_ROLES` and `ROLE_PAGES` in `src/App.jsx`
- Added to `src/components/Labour.jsx` — can submit payrolls, use recall, access all labour tabs
- Added to `src/components/Reports.jsx` — sees production and inventory reports
- Added `ROLE_LABELS` entry in Reports
- Same page access as `production_manager`, **except** the Propose Rate Change button (intentionally excluded — PM-only)

**Outstanding SQL needed** — see section below.

---

### 4. Submit button edge case hardening (`a49950f`)

Two bugs found in `LoadingWeeklySummary` that could cause the Submit button to reappear after being clicked:

1. `useEffect` fetching existing payrolls used `.then(({ data }) => ...)` — silently ignored Supabase errors, leaving `existingPayrolls` empty on network failure.
2. Supabase `.single()` can return `null` for `inserted`, making `existingPayrolls[week]` falsy — button reappears.

Both fixed. Monthly Fixed "Create Payroll" button also restricted to authorised roles only (was open to any authenticated user).

---

## SQL That Must Be Run in the Supabase SQL Editor

**These have NOT been run. The app will not work fully without them.**

---

### 1. Fix production target permissions for APM (blocking)

APM users cannot set daily production targets because the RLS policy is missing their role:

```sql
DROP POLICY IF EXISTS "prod_targets_write" ON production_targets;
CREATE POLICY "prod_targets_write" ON production_targets
  FOR ALL
  USING     (get_user_role() IN ('md','production_manager','assistant_production_manager','ico'))
  WITH CHECK (get_user_role() IN ('md','production_manager','assistant_production_manager','ico'));
```

---

### 2. Seed the assistant_production_manager role (deployment safety)

The role exists in the app code but is not in the database seed files. If the DB is ever rebuilt from scratch, any user with this role will fail the FK constraint on `user_profiles.role`. Run once:

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

After running, also paste this row into `supabase/add_all_roles.sql` and `supabase/MASTER_DEPLOYMENT.sql` so it survives future full redeployments.

---

## Known Limitations to Be Aware Of

| Issue | Impact | Notes |
|-------|--------|-------|
| `ordersService.create` is not transactional | If `order_items` insert fails, a zombie `orders` row is left | Rare; fix requires a Supabase DB function with a transaction |
| `invoice_number` computed client-side | Two simultaneous sessions could generate the same number | Low risk — it's a display label, no DB uniqueness constraint |
| No audit log | Changes to orders, payrolls etc. are not tracked beyond the current state | Opening balances has a history table; nothing else does |

---

## Architecture in One Page

- **No router.** Page state is a single `useState` string (`active`). Sidebar calls `setActive(pageId)`.
- **Role access** is enforced by `canSee(pageId)` which checks `ROLE_PAGES[role]`. Pages outside the role's list are filtered from the sidebar and redirect to dashboard.
- **ICO read-only** is enforced via a CSS attribute: when `isICO` and the page is not `labour` or `schedule_approvals`, `<main>` gets `data-ico-view="true"`, which hides all buttons that don't have `data-ico-allow`. Buttons ICO must click (approve, recall) carry `data-ico-allow`.
- **Board member read-only** same pattern via `data-board-view`.
- **All Supabase calls** are in `src/services/*.js`. `Labour.jsx` calls Supabase directly in a few places (payroll queries inside components).
- **RLS is disabled** on most tables; access control is purely in the frontend. The exceptions where RLS is active: `production_targets` (has a write policy), Storage buckets.

---

## Files to Know

| File | Why it matters |
|------|---------------|
| `src/App.jsx` | ~7 030 lines — almost all page components live here |
| `src/components/Labour.jsx` | ~2 100 lines — entire labour module |
| `src/components/Reports.jsx` | Role-gated reporting engine |
| `src/components/StaffHR.jsx` | Staff and HR management |
| `supabase/fix_all_priority_issues.sql` | Most recent migration — contains current RLS policies |
| `supabase/labour_schema.sql` | Labour tables and constraints |
| `supabase/auth_roles_financial_tables.sql` | app_roles, user_profiles, financial tables |
| `APP_FULL_DOC.md` | Full technical reference — roles, tables, workflows |

---

## How to Continue Development

1. **Merge dev branch to main** before building new features:
   ```
   git checkout main
   git merge claude/analyze-test-coverage-irQFZ
   git push origin main
   ```

2. **Run the two SQL blocks** above in Supabase before testing with an APM user.

3. **Environment variables needed** (set in Vercel and in `.env.local` for local dev):
   ```
   VITE_SUPABASE_URL=<your project URL>
   VITE_SUPABASE_ANON_KEY=<your anon key>
   ```

4. **Local dev:**
   ```
   npm install
   npm run dev
   ```

5. **To add a new role:**
   - Add to `APP_ROLES` array (`src/App.jsx:102`)
   - Add to `ROLE_PAGES` constant (`src/App.jsx:118`)
   - Add to `supabase/add_all_roles.sql` and `supabase/MASTER_DEPLOYMENT.sql`
   - Insert into `app_roles` table in Supabase
   - Wire up any component-level role checks (ICO approve buttons, recall buttons, etc.)

6. **To add a new page:**
   - Add a component
   - Add the page ID to `ROLE_PAGES` for each role that should see it
   - Add a `pages` entry in the root component (`src/App.jsx:6912`)
   - Add a sidebar nav item in the `NAV_SECTIONS` array
