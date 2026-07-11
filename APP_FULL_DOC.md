# Abuja Precast Concrete Manager — Project Knowledge Document

> **Last updated:** 2026-07-11 (main tip `91641eeb`)
> **Stack:** React 18.3.1 · Vite 5.2.0 · Supabase (PostgreSQL + Auth + RLS + Storage)
> **Repo:** `amaliyu/muktar24`
> **Deployment:** Vercel auto-deploys from `main`
> **Primary files:** `src/App.jsx` (~9 500+ lines) · `src/components/Labour.jsx` (~2 300 lines)

---

## Table of Contents

1. [Tech Stack & Architecture](#1-tech-stack--architecture)
2. [Roles & Page Access](#2-roles--page-access)
3. [Access Control Mechanics](#3-access-control-mechanics)
4. [Navigation & Routing](#4-navigation--routing)
5. [Orders & Invoicing](#5-orders--invoicing)
6. [Labour Module](#6-labour-module)
7. [Payroll Approval Workflow](#7-payroll-approval-workflow)
8. [LPO Workflow](#8-lpo-workflow)
9. [Other Modules](#9-other-modules)
10. [Supabase Tables Reference](#10-supabase-tables-reference)
11. [Service Layer](#11-service-layer)
12. [SQL to Run Manually](#12-sql-to-run-manually)
13. [Known Limitations](#13-known-limitations)
14. [Feature Status Summary](#14-feature-status-summary)

---

## 1. Tech Stack & Architecture

| Layer | Technology |
|---|---|
| Frontend framework | React 18.3.1 (no router — page state is a `useState` string) |
| Build tool | Vite 5.2.0 |
| Database & Auth | Supabase (PostgreSQL + Auth + Row Level Security + Storage) |
| PDF generation | jsPDF 2.5.2 + jspdf-autotable |
| CSV/Excel import | PapaParse 5.5.3, xlsx 0.18.5 |
| PDF viewer | pdfjs-dist 5.7 |
| ZIP export | jszip 3.10 |
| Styling | Inline styles only — no CSS framework |
| Testing | Vitest + Testing Library (stubs only — no live tests) |

**Single-file architecture:** almost all page components live in `src/App.jsx`. Exceptions:

| File | Contents |
|---|---|
| `src/components/Labour.jsx` | Entire Labour module (~2 300 lines) |
| `src/components/Reports.jsx` | Reports engine |
| `src/components/StaffHR.jsx` | Staff/HR management |
| `src/components/LoginScreen.jsx` | Auth screen |
| `src/components/BoardDashboard.jsx` | Board member dashboard |
| `src/components/KPIDashboard.jsx` | KPI dashboard |
| `src/components/OpeningBalances.jsx` | Opening balances form |
| `src/components/FinancialStatements.jsx` | P&L, balance sheet, cash flow |
| `src/components/VehicleRegistry.jsx` | Fleet management |
| `src/components/SupplierRegistry.jsx` | Supplier management |
| `src/components/DataImport.jsx` | Bulk CSV/Excel import |

**Service layer:** all Supabase queries are in `src/services/*.js`. Components import from services; no raw Supabase calls in `App.jsx` (Labour.jsx calls Supabase directly in some places).

---

## 2. Roles & Page Access

### Role IDs (`APP_ROLES` — `src/App.jsx:102`)

| Role ID | Display Label | Notes |
|---|---|---|
| `md` | MD (Managing Director) | Full access (`'all'`) |
| `accountant` | Accountant | Finance + reports |
| `board_member` | Board Member | Read-only via `data-board-view` CSS |
| `bdm` | Business Development Manager | Orders, customers, LPO, reports |
| `ico` | Internal Control Officer | Wide read + approve payrolls; buttons hidden via `data-ico-view` CSS |
| `store_officer` | Store Officer | Inventory, waybills, reports |
| `logistics_manager` | Logistics Manager | Waybills, vehicles, loading payroll |
| `marketer` | Marketer | Own customers and orders only |
| `driver` | Driver | Own waybills only |
| `hr_officer` | HR Officer | Staff, labour, reports |
| `production_manager` | Production Manager | Production, inventory, labour |
| `assistant_production_manager` | Assistant Production Manager | Same pages as PM except no Propose Rate Change |

Legacy role IDs (kept for existing users): `operations`, `sales`, `staff`.

---

### ROLE_PAGES (`src/App.jsx:118`)

```js
const ROLE_PAGES = {
  md:                 'all',
  ico:                ['dashboard','production','inventory','batches','waybills','vehicles',
                       'staff','labour','pending_register','daily_schedule','customers',
                       'orders','lpo_approvals','schedule_approvals','reports',
                       'kpi_dashboard','accounting','suppliers','products','my_profile'],
  accountant:         ['dashboard','customers','orders','reports','kpi_dashboard',
                       'accounting','suppliers','products','my_profile','data_import'],
  board_member:       ['dashboard','production','inventory','batches','waybills','vehicles',
                       'staff','labour','pending_register','daily_schedule','customers',
                       'orders','lpo_approvals','schedule_approvals','reports',
                       'kpi_dashboard','accounting','suppliers','products','my_profile'],
  bdm:                ['dashboard','customers','orders','pending_register','daily_schedule',
                       'lpo_approvals','reports','kpi_dashboard','my_profile'],
  store_officer:      ['dashboard','inventory','batches','waybills','pending_register',
                       'daily_schedule','products','reports','my_profile'],
  logistics_manager:  ['dashboard','waybills','vehicles','labour','pending_register',
                       'daily_schedule','customers','my_profile'],
  marketer:           ['dashboard','customers','orders','products','my_profile'],
  driver:             ['dashboard','waybills','my_profile'],
  hr_officer:         ['dashboard','staff','reports','labour','my_profile'],
  production_manager:           ['dashboard','production','inventory','batches','reports',
                                 'products','labour','my_profile'],
  assistant_production_manager: ['dashboard','production','inventory','batches','reports',
                                 'products','labour','my_profile'],
}
```

`my_profile` is always accessible to every role (hardcoded in `canSee`).

---

## 3. Access Control Mechanics

### `canSee()` (`src/App.jsx:6906`)

```js
const canSee = (pageId) =>
  pageId === 'my_profile' ||
  allowedPages === 'all' ||
  allowedPages.includes(pageId)
```

Pages not in a role's list are filtered from the sidebar and redirect to `dashboard` if accessed directly.

---

### ICO Read-Only Mode

When the logged-in user is ICO **and** the current page is not `labour` or `schedule_approvals`, the `<main>` element receives:

```jsx
data-ico-view="true"
```

Global CSS rule (in `<style>` block in `App.jsx`):

```css
[data-ico-view] button:not([data-ico-allow]) { display: none !important; }
```

Buttons that ICO must be able to click (approve/recall payrolls) get `data-ico-allow` on the element.

The Labour page and Schedule Approvals page are **excluded** from `data-ico-view` so ICO sees full action buttons there.

---

### Board Member Read-Only Mode

`<main>` gets `data-board-view="true"` for board members. The CSS hides all action buttons. Board members see the same wide page list as ICO but can only read.

---

### Delete Order

**Only `md` role** can delete an order. Removed from all other roles to prevent FK constraint errors on invoices.

```jsx
{userProfile?.role === 'md' && (
  <button onClick={() => setConfirmDelete(o)}>Delete</button>
)}
```

---

## 4. Navigation & Routing

There is no React Router. Navigation is a `useState` string (`active`) in the root component. The sidebar renders links that call `setActive(pageId)`. `safePage` ensures the active page is always in the role's allowed list; falls back to `'dashboard'`.

```js
const safePage = canSee(active) ? active : 'dashboard'
```

---

## 5. Orders & Invoicing

### Order Status Flow

```
new → processing → invoiced → delivered → completed
```

### Key Behaviours

- **New Order** button is hidden for ICO (explicit `role !== 'ico'` check).
- **Edit Order** hidden for ICO.
- **Generate Invoice** hidden for ICO.
- **Delete Order** visible to MD only.
- **Invoice number** is computed client-side as `count of existing invoices + 1`. Not guaranteed unique under concurrency — it is a display label only (no DB unique constraint).
- **FK guard:** if `invoicesService.create` throws `invoices_order_id_fkey`, the UI auto-refreshes orders and shows a helpful message rather than a generic error.
- Invoice PDF is generated via `jsPDF` in `generateInvoicePDF()` and auto-downloaded in the browser.
- Orders with `is_lpo = true` are LPO orders; they appear in the LPO Approvals page.

### Marketer Scoping

Marketers only see customers and orders where `orders.marketer_id = userProfile.id`. Service functions `ordersService.getAllForMarketer` and `customersService.getAllForMarketer` add the filter.

---

## 6. Labour Module

**File:** `src/components/Labour.jsx`

### Tabs (current — `truck` tab removed)

| Tab key | Component | Who can access |
|---|---|---|
| `pool` | Worker pool management | PM, APM, HR, MD |
| `roster` | `DailyRosterTab` | PM, APM, HR, MD |
| `payroll` | `WeeklyPayrollTab` | PM, APM, HR, Logistics, ICO, MD |
| `monthly` | `MonthlyFixedTab` | PM, APM, HR, ICO, MD |
| `rates` | `LabourRatesTab` | All labour users |

**Note:** The `truck` tab key and `TruckLoadingTab` component still exist in Labour.jsx as unreachable dead code — they are not included in any TABS array and are never rendered. Truck loading is now handled by **TruckLoadingPage** in `App.jsx` (separate page accessible via the sidebar).

Logistics manager default tab: `payroll` (was `truck`; changed when the truck tab was removed).

### Worker Categories

```
daily | monthly_fixed | piece_rate
```

### TruckLoadingPage (App.jsx — the live truck loading UI)

Accessible via the sidebar as its own page (not a labour sub-tab).

**Role flags:**
```js
const canLog         = ['production_manager','assistant_production_manager','logistics_manager','md'].includes(role)
const canManageRates = ['logistics_manager','md'].includes(role)
const canDelete      = ['md','production_manager','assistant_production_manager','logistics_manager'].includes(role)
```

**Tabs:** Log Entry (canLog), Rates (canManageRates). Payroll tab was removed — it called dropped DB objects.

**Delete log entry:** canDelete roles see a Delete button per row. Clicking sets `deleteTarget`; a confirmation card appears. Confirmed deletion calls `truckLoadingService.deleteLog(id)` which does `DELETE FROM truck_loading_log WHERE id = $1`.

**Historical badge:** If `log.date < log.created_at.split('T')[0]` (log's entry date predates when it was created — it was backfilled), an amber "Historical" badge appears on the date cell.

### Loading Payroll Submit Flow (`LoadingWeeklySummary` inside WeeklyPayrollTab)

1. Truck loading log entries are recorded via TruckLoadingPage, stored in `truck_loading_log` with `payment_status = 'unpaid'`.
2. `LoadingWeeklySummary` (inside `WeeklyPayrollTab` in Labour.jsx) groups logs by `payment_week_ending` (Saturday date).
3. On mount / log change, it queries `weekly_labour_payroll` for any existing payroll record for those weeks.
4. If a payroll record exists for a week → shows a status badge.
5. If no payroll exists and there are unpaid logs → shows **Submit for Approval** button.
6. Submit creates a `weekly_labour_payroll` row with `status = 'draft'` and hides the button.

**Important:** `truck_loading_log.payment_status` DB CHECK only allows `'unpaid'` or `'paid'`. No intermediate submitted state in that table.

**WeeklyPayrollTab default date:** Opens on the most recent past Saturday (`getLastSaturday()` function), not the upcoming one. This ensures existing payroll records are found on load.

---

## 7. Payroll Approval Workflow

Applies to **Weekly Loading Payroll**, **Weekly Production Payroll**, and **Monthly Fixed Payroll**.

### Status Machine

```
draft → ico_approved → md_approved → paid
```

Recall is allowed from any non-`paid` state back to `draft`.

### Status Transitions & Who Can Trigger

| Action | Trigger | Role Required |
|---|---|---|
| Submit (create payroll) | Creates row with `status='draft'` | PM / APM / HR / Logistics / MD |
| ICO Approve | `status: 'ico_approved'`, sets `ico_approved_by` | ICO only |
| MD Approve | `status: 'md_approved'`, sets `md_approved_by` | MD only |
| Mark as Paid + Create Expense | `status: 'paid'` | Accountant only |
| **Recall to Draft** | `status: 'draft'`, clears `ico_approved_by` + `md_approved_by` | PM / APM / Logistics / HR / ICO / MD |

### `weekly_labour_payroll` Columns

```sql
id uuid, week_ending date, payroll_type text, total_amount numeric,
worker_count int, status text CHECK IN ('draft','ico_approved','md_approved','paid'),
prepared_by text, ico_approved_by text, md_approved_by text,
ico_approval_date timestamptz, md_approval_date timestamptz,
paid_at timestamptz, paid_by text, expense_id uuid
```

### Monthly Fixed (`weekly_labour_payroll` with `payroll_type = 'monthly_fixed'`)

- Create Payroll button restricted to: `production_manager`, `assistant_production_manager`, `hr_officer`, `md`.
- Recall button: PM / APM / Logistics / HR / ICO / MD (same as weekly).
- Accountant marks paid and auto-creates an expense entry.

---

## 8. LPO Workflow

LPO orders have `orders.is_lpo = true`. They appear in the **LPO Approvals** page.

### `lpo_orders` Table

```sql
id uuid, order_id uuid FK orders.id, submitted_at timestamptz,
md_decision text, md_note text, decided_at timestamptz, md_approved_by text
```

Service: `src/services/lpo.js`

| Method | Action |
|---|---|
| `getPending()` | `md_decision IS NULL` ordered by `submitted_at ASC` |
| `getAll()` | All LPO orders, newest first |
| `create(lpo)` | Insert new LPO order |
| `decide(id, decision, note, approvedBy)` | Set `md_decision`, `md_note`, `decided_at`, `md_approved_by` |
| `uploadDocument(file)` | Upload to `lpo-documents` Storage bucket, return public URL |

---

## 9. Other Modules

| Module | File | Key Tables / RPC |
|---|---|---|
| Production | `App.jsx` (Production component) | `production_log`, `damage_log`, `production_targets`, `batches` |
| Inventory | `App.jsx` | `finished_goods`, `inventory` |
| Waybills | `App.jsx` (Waybills component) | `waybills`, `deliveries` |
| Truck Loading | `App.jsx` (TruckLoadingPage) | `truck_loading_log`, `truck_loading_rates`, `truck_loader_assignments` |
| Customers | `App.jsx` (Customers component) | `customers` |
| Suppliers | `SupplierRegistry.jsx` | `suppliers` |
| Vehicles | `VehicleRegistry.jsx` | `vehicles`, `vehicle_rentals`, `vehicle_maintenance` |
| Staff/HR | `StaffHR.jsx` | `staff`, `attendance`, `staff_documents` |
| Reports | `Reports.jsx` | Reads from most tables |
| **Trading Margin Report** | `App.jsx` (TradingMarginReport) | `get_order_trading_margin()` RPC |
| **Payment Requests** | `App.jsx` | `payment_requests`, `payment_request_attachments` |
| **Bank Accounts & Reconciliation** | `App.jsx` | `bank_accounts`, `bank_transactions`, `bank_import_batches`, `bank_reconciliations` |
| **Receipts** | `App.jsx` | `receipts` (Storage bucket: `receipts`) |
| Accounting | `App.jsx` (Accounting component) | `expenses`, `expense_categories`, `opening_balances`, `financial_adjustments` |
| Financial Statements | `FinancialStatements.jsx` | Aggregates from expenses, payments, opening_balances |
| KPI Dashboard | `KPIDashboard.jsx` | Aggregates across all tables |
| Board Dashboard | `BoardDashboard.jsx` | Aggregates across all tables |
| Schedule Approvals | `App.jsx` | `daily_schedule`, `schedule_approvals` |
| Pending Register | `App.jsx` | `pending_register` |
| Data Import | `DataImport.jsx` | Bulk inserts into production_log, attendance, expenses |
| User Management | `App.jsx` | `user_profiles`, `app_roles` |

### TradingMarginReport — Important Notes

Calls the `get_order_trading_margin(p_order_id uuid DEFAULT NULL)` Supabase RPC.

**Actual RPC return columns:** `order_id`, `invoice_number`, `customer_name`, `order_date`, `resale_sale_amount`, `purchase_cost`, `attributed_fuel_cost`, `attributed_loading_cost`, `attributed_haulage_cost`

The RPC does **not** return computed margin columns. All derived fields are calculated at `setRows` and stored with stable names:

| Derived field | Formula |
|---|---|
| `sale_amount` | `resale_sale_amount` |
| `gross_margin` | `sale_amount − purchase_cost` |
| `fuel_cost` | `attributed_fuel_cost` |
| `loading_cost` | `attributed_loading_cost` |
| `haulage_cost` | `attributed_haulage_cost` |
| `landed_cost` | `purchase_cost + fuel_cost + loading_cost + haulage_cost` |
| `true_margin` | `sale_amount − landed_cost` |

Reference column: `r.invoice_number || (r.order_id ? r.order_id.slice(0,8) + ' (not invoiced)' : '—')`

---

## 10. Supabase Tables Reference

### Core Auth & Roles

| Table | Description |
|---|---|
| `app_roles` | Role definitions (id, display_name, is_system_role) |
| `user_profiles` | One row per auth.users row; columns: id, email, full_name, role, is_active, staff_id |

Auto-trigger: `on_auth_user_created` fires on `auth.users INSERT`, creates a `user_profiles` row with `role = 'staff'`.

---

### Orders & Finance

| Table | Key Columns |
|---|---|
| `customers` | id, name, location, phone, marketer_id |
| `orders` | id, customer_id, marketer_id, status, is_lpo, site_id, created_at |
| `order_items` | id, order_id, product_id, quantity, unit_price |
| `invoices` | id, order_id, invoice_number, issued_date, due_date, total_amount |
| `payments` | id, order_id, amount_paid, payment_date |
| `deliveries` | id, order_id, delivery_date, status |
| `waybills` | id, order_id, driver_id, vehicle_id, status |
| `lpo_orders` | id, order_id, md_decision, md_note, decided_at, md_approved_by |

---

### Production

| Table | Key Columns |
|---|---|
| `production_log` | id, date, block_type, quantity_produced, damage_count, set_by_name |
| `damage_log` | id, date, block_type, quantity |
| `production_targets` | id, target_date, block_type, target_quantity, set_by, set_by_name |
| `batches` | id, batch_number, date, status |
| `finished_goods` | id, block_type, quantity, location |
| `inventory` | id, item_name, quantity, unit |

---

### Labour

| Table | Key Columns |
|---|---|
| `labour_pool` | id, full_name, labour_number, usual_role_id, bank, account_number, status |
| `labour_roles` | id, role_name, base_rate, target_bonus, payment_type, bonus_type, effective_date, approved_by |
| `daily_labour_log` | id, worker_id, date, hours_worked, block_count, amount_earned |
| `daily_roster` | id, roster_date, prepared_by, notes |
| `daily_roster_entries` | id, roster_id, labour_id, role_id, hours_worked |
| `truck_loading_log` | id, vehicle_id, product_id, date, quantity_loaded, trip_number_for_day, computed_rate_used, total_amount, created_at |
| `truck_loading_rates` | id, product_id, rate_per_unit, effective_date |
| `truck_loader_assignments` | id, vehicle_id, labour_id, assigned_date, is_active, removed_date |
| `weekly_labour_payroll` | id, week_ending, payroll_type, total_amount, worker_count, status CHECK('draft','ico_approved','md_approved','paid'), prepared_by, ico_approved_by, md_approved_by |
| `monthly_fixed_payroll_items` | id, payroll_id, worker_id, base_amount, bonus_amount |
| `labour_rate_change_requests` | id, role_id, proposed_rate, proposed_bonus, effective_date, overall_status, ico_status, md_status |
| `labour_attendance` | id, worker_id, date, status |

**Dropped tables (no longer exist):** `truck_loading_payroll`, `truck_loading_payroll_audit`. Both RPCs `generate_truck_loading_payroll` and `advance_truck_loading_payroll` are also dropped. Any code referencing these will throw a runtime error — all such code was removed in PR#68.

---

### Staff & HR

| Table | Key Columns |
|---|---|
| `staff` | id, full_name, department, role_name, employment_date |
| `attendance` | id, staff_id, date, status |
| `staff_documents` | id, user_id, staff_id, document_name, file_url, uploaded_at |

---

### Finance & Accounting

| Table | Key Columns |
|---|---|
| `expenses` | id, date, category_id, amount, description, entered_by |
| `expense_categories` | id, name, is_active |
| `opening_balances` | id, category, sub_category, account_name, amount, depreciation_amount, vehicle_id, as_at_date |
| `opening_balance_history` | id, opening_balance_id, old_amount, new_amount, changed_by, changed_at |
| `financial_adjustments` | id, statement_type, account_name, amount, period_from, period_to, adjustment_date |
| `receipts` | id, receipt_number, expense_id, receipt_date, vendor_name, amount, file_url, receipt_type, uploaded_by, tax_category |

---

### Bank & Payment

| Table | Key Columns |
|---|---|
| `bank_accounts` | id, account_name, bank_name, account_number, created_at |
| `bank_transactions` | id, bank_account_id, transaction_date, value_date, description, debit, credit, balance, reference, match_status CHECK('unmatched','suggested','matched'), matched_to_type, matched_to_id, import_batch_id |
| `bank_import_batches` | id, bank_account_id, imported_at, row_count |
| `bank_reconciliations` | id, bank_account_id, reconciliation_date, status, reconciled_date |
| `payment_requests` | id, reference, requested_by, amount, purpose, expense_category_id, disbursement_method, supplier_id, payee_name, payee_bank_name, payee_account_number, payee_account_name, bank_account_id, status, order_item_id |
| `payment_request_attachments` | id, payment_request_id, file_path, uploaded_by, note |

**Payment request status flow:** `draft → ico_reviewed → md_approved → disbursed → closed`

**Bank transaction match_status:** `unmatched` (just imported) → `suggested` (match proposed by user/system, awaiting confirmation) → `matched` (confirmed)

**Supabase RPCs (bank & payments):**
- `suggest_bank_match(p_bank_transaction_id, p_matched_to_type, p_matched_to_id)` — proposes a match, sets `match_status = 'suggested'`
- `confirm_bank_match(p_bank_transaction_id, p_action, p_reason)` — accepts or rejects a suggested match
- `get_next_payment_request_reference()` — returns next sequential reference like `APC-PR-0042`
- `advance_payment_request(p_request_id, p_action, p_reason, p_bank_account_id)` — moves request through its approval/disbursement workflow
- `backfill_payment_request(p_requested_by, p_amount, p_purpose, p_transaction_date, ...)` — enters historical payment directly to `disbursed` status
- `approve_vendor(p_supplier_id)` — moves supplier from `pending_verification` to `active`
- `create_supplier_from_payment_request(p_company_name, ...)` — creates a new supplier from payment request payee details

---

### Fleet & Suppliers

| Table | Key Columns |
|---|---|
| `vehicles` | id, plate_number, make, model, status |
| `vehicle_rentals` | id, vehicle_id, start_date, end_date, rental_rate |
| `vehicle_maintenance` | id, vehicle_id, date, description, cost |
| `suppliers` | id, name, contact, category |
| `products` | id, name, unit, price |

---

## 11. Service Layer

Each service file exports a single object with async methods. All raw Supabase calls are in service files.

| Service file | Exported object | Main table(s) |
|---|---|---|
| `services/orders.js` | `ordersService` | orders, order_items |
| `services/invoices.js` (inline in App) | `invoicesService` | invoices |
| `services/payments.js` | `paymentsService` | payments |
| `services/deliveries.js` | `deliveriesService` | deliveries |
| `services/waybills.js` | (in service) | waybills |
| `services/customers.js` (inline App) | `customersService` | customers |
| `services/lpo.js` | `lpoService` | lpo_orders |
| `services/production.js` | `productionService` | production_log, damage_log, production_targets |
| `services/inventory.js` | `inventoryService` | finished_goods, inventory |
| `services/batches.js` | `batchesService` | batches |
| `services/labour.js` | `labourRolesService`, `labourPoolService`, `rateChangeService`, `rosterService`, `truckLoadingService`, `payrollService` | labour_pool, labour_roles, daily_roster, truck_loading_log, weekly_labour_payroll |
| `services/attendance.js` | `attendanceService` | attendance |
| `services/staff.js` | `staffService` | staff |
| `services/vehicles.js` | `vehiclesService` | vehicles |
| `services/suppliers.js` | `suppliersService` | suppliers |
| `services/products.js` | `productsService` | products |
| `services/expenses.js` (accounting.js) | `accountingService` | expenses, expense_categories |
| `services/financialService.js` | `financialService` | aggregates |
| `services/bank.js` | `bankAccountsService`, `bankTransactionsService`, `bankImportBatchesService`, `bankReconciliationsService`, `receiptsService` | bank_accounts, bank_transactions, bank_import_batches, bank_reconciliations, receipts |
| `services/paymentRequests.js` | `paymentRequestsService` | payment_requests, payment_request_attachments |
| `services/authService.js` | `authService` | user_profiles, app_roles |
| `services/hrService.js` | `hrService` | staff documents |

### `ordersService.create` — Known Gap

Two sequential INSERTs (no DB transaction):

```js
const order = await supabase.from('orders').insert(...)
await supabase.from('order_items').insert(items.map(...))
```

If the second insert fails, a zombie `orders` row is left behind. This is a known limitation with low frequency; would require a Postgres function with a transaction to fix properly.

---

## 12. SQL to Run Manually

**RULE: never execute SQL directly — paste into the Supabase SQL Editor.**

---

### A. Fix `prod_targets_write` — APM blocked from setting production targets

```sql
DROP POLICY IF EXISTS "prod_targets_write" ON production_targets;
CREATE POLICY "prod_targets_write" ON production_targets
  FOR ALL
  USING     (get_user_role() IN ('md','production_manager','assistant_production_manager','ico'))
  WITH CHECK (get_user_role() IN ('md','production_manager','assistant_production_manager','ico'));
```

---

### B. Seed `assistant_production_manager` role (deployment safety)

The role exists in the app but is missing from the SQL seed files. Run this once, and also add it manually to `supabase/add_all_roles.sql` and `supabase/MASTER_DEPLOYMENT.sql`:

```sql
INSERT INTO app_roles (id, display_name, description, is_system_role)
VALUES (
  'assistant_production_manager',
  'Asst. Production Manager',
  'Production access — targets, logs, schedule; no rate changes',
  false
)
ON CONFLICT (id) DO UPDATE
  SET display_name   = EXCLUDED.display_name,
      description    = EXCLUDED.description;
```

---

## 13. Known Limitations

| # | Description | Severity |
|---|-------------|----------|
| 1 | `ordersService.create` not transactional — zombie `orders` rows possible if `order_items` insert fails | Low |
| 2 | `invoice_number` computed client-side — duplicate possible under concurrent sessions | Low |
| 3 | `prod_targets_write` RLS missing `assistant_production_manager` — APM cannot set daily production targets | **Blocking for APM** |
| 4 | `assistant_production_manager` not in SQL seed files | Low — matters only on full DB rebuild |
| 5 | `TruckLoadingTab` and its `truck` tab key remain in Labour.jsx as unreachable dead code | Cleanup only — no user impact |

---

## 14. Feature Status Summary

### Fully Working

- Orders creation, invoicing, payment recording, PDF invoice download
- LPO workflow (submit → MD approve/reject)
- Deliveries and waybill management (driver scoping works)
- Customer management (marketer scoping works)
- Customer statement PDF (VAT-inclusive, invoice-based debits)
- Production logging, target setting, damage log
- Inventory and finished goods tracking
- Batch management
- Labour pool management
- Daily labour roster
- **TruckLoadingPage** — log entries, loading rates, delete log entry, Historical badge for backfilled entries
- Weekly payroll (loading and production) full approval chain: draft → ICO → MD → paid
- Monthly fixed payroll full approval chain: draft → ICO → MD → paid
- **Recall to Draft** for all payroll types (any non-paid state)
- Payroll XLSX downloads (Payment Schedule + Bulk Transfer) for accountant / ICO / MD when status is `md_approved` or `paid`
- Labour rate change request workflow (propose → ICO → MD → auto-apply to labour_roles)
- **Trading Margin Report** — per-order margin analysis with fuel, loading, haulage cost attribution
- **Payment Requests** — submit → ICO review → MD approve → disburse (with source bank account selection); backfill historical; attachment upload; vendor management with verification flow
- **Bank Accounts & Transactions** — import bank statement CSV/PDF, duplicate detection, whole-file reconciliation gate, reference matching (suggested → confirmed), bank-to-payment-request reconciliation
- **Receipts** — upload photo/PDF receipts, link to expense entries, signed URL viewing (private storage bucket)
- Staff management and attendance
- Vehicle registry, maintenance, rentals
- Supplier registry
- Expense tracking and categorisation
- Opening balances (asset/liability/equity with history)
- Financial statements (P&L, balance sheet, cash flow) with adjustments
- Reports engine (production, sales, finance, inventory by role)
- KPI dashboard
- Board dashboard (read-only aggregates)
- ICO read-only mode (CSS attribute-based button hiding)
- Board member read-only mode
- User management (MD only — create, assign role, activate/deactivate)
- Data import (CSV/Excel bulk upload for production, attendance, expenses)
- My Profile (view details, upload documents)
- Schedule approvals
- Pending register

### Requires SQL Action Before Working Fully

- Production target setting for `assistant_production_manager` role — run SQL block 1 in section 12

### Not Yet Built / Out of Scope

- Push notifications / email alerts for approval events
- Audit log / change history outside of `opening_balance_history`
- Multi-site stock transfer between locations
- Automated payroll journal entries to financial statements
