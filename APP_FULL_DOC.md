# Abuja Precast Concrete Manager — Project Knowledge Document

> **Last updated:** 2026-06-09 (commit `a49950f`)
> **Stack:** React 18.3.1 · Vite 5.2.0 · Supabase (PostgreSQL + Auth + RLS + Storage)
> **Repo:** `amaliyu/muktar24` · **Dev branch:** `claude/analyze-test-coverage-irQFZ`
> **Deployment:** Vercel auto-deploys from `main`
> **Primary files:** `src/App.jsx` (~7 030 lines) · `src/components/Labour.jsx` (~2 100 lines)

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
| `src/components/Labour.jsx` | Entire Labour module (~2 100 lines) |
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

### Tabs

| Tab key | Component | Who can access |
|---|---|---|
| `roster` | `DailyRosterTab` | PM, APM, HR, MD |
| `truck` | `TruckLoadingTab` | PM, APM, Logistics, MD |
| `payroll` | `WeeklyPayrollTab` | PM, APM, HR, Logistics, ICO, MD |
| `monthly` | `MonthlyFixedTab` | PM, APM, HR, ICO, MD |
| `rates` | `LabourRatesTab` | All labour users |

### Worker Categories

```
daily | monthly_fixed | piece_rate
```

### Loading Payroll Submit Flow (`LoadingWeeklySummary`)

1. `TruckLoadingTab` records individual log entries in `truck_loading_log` with `payment_status = 'unpaid'`.
2. `LoadingWeeklySummary` groups logs by `payment_week_ending` (Saturday date).
3. On component mount / log change, it queries `weekly_labour_payroll` for any existing payroll record for those weeks.
4. If a payroll record exists for a week → shows a status badge.
5. If no payroll exists and there are unpaid logs → shows **Submit for Approval** button.
6. Submit creates a `weekly_labour_payroll` row with `status = 'draft'` and hides the button.

**Important:** `truck_loading_log.payment_status` DB CHECK constraint only allows `'unpaid'` or `'paid'`. There is no intermediate submitted state in that table.

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

| Module | File | Key Tables |
|---|---|---|
| Production | `App.jsx` (Production component) | `production_log`, `damage_log`, `production_targets`, `batches` |
| Inventory | `App.jsx` | `finished_goods`, `inventory` |
| Waybills | `App.jsx` (Waybills component) | `waybills`, `deliveries` |
| Customers | `App.jsx` (Customers component) | `customers` |
| Suppliers | `SupplierRegistry.jsx` | `suppliers` |
| Vehicles | `VehicleRegistry.jsx` | `vehicles`, `vehicle_rentals`, `vehicle_maintenance` |
| Staff/HR | `StaffHR.jsx` | `staff`, `attendance`, `staff_documents` |
| Reports | `Reports.jsx` | Reads from most tables |
| Accounting | `App.jsx` (Accounting component) | `expenses`, `expense_categories`, `opening_balances`, `financial_adjustments` |
| Financial Statements | `FinancialStatements.jsx` | Aggregates from expenses, payments, opening_balances |
| KPI Dashboard | `KPIDashboard.jsx` | Aggregates across all tables |
| Board Dashboard | `BoardDashboard.jsx` | Aggregates across all tables |
| Schedule Approvals | `App.jsx` | `daily_schedule`, `schedule_approvals` |
| Pending Register | `App.jsx` | `pending_register` |
| Data Import | `DataImport.jsx` | Bulk inserts into production_log, attendance, expenses |
| User Management | `App.jsx` | `user_profiles`, `app_roles` |

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
| `labour_pool` | id, name, category, role_id, bank, account_number, status |
| `labour_roles` | id, role_name, base_rate, target_bonus, bonus_type, effective_date |
| `daily_labour_log` | id, worker_id, date, hours_worked, block_count, amount_earned |
| `truck_loading_log` | id, worker_id, date, truck_count, total_amount, payment_week_ending, payment_status CHECK('unpaid','paid') |
| `weekly_labour_payroll` | id, week_ending, payroll_type, total_amount, worker_count, status CHECK('draft','ico_approved','md_approved','paid'), prepared_by, ico_approved_by, md_approved_by |
| `monthly_fixed_payroll_items` | id, payroll_id, worker_id, base_amount, bonus_amount |
| `labour_rate_change_requests` | id, role_id, proposed_rate, overall_status, ico_status, md_status |
| `labour_attendance` | id, worker_id, date, status |

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
| `services/labour.js` | `labourService` | labour_pool, labour_roles, logs |
| `services/attendance.js` | `attendanceService` | attendance |
| `services/staff.js` | `staffService` | staff |
| `services/vehicles.js` | `vehiclesService` | vehicles |
| `services/suppliers.js` | `suppliersService` | suppliers |
| `services/products.js` | `productsService` | products |
| `services/expenses.js` (accounting.js) | `accountingService` | expenses, expense_categories |
| `services/financialService.js` | `financialService` | aggregates |
| `services/bank.js` | `bankService` | bank transactions |
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
| 1 | `ordersService.create` is not transactional — zombie order rows possible if `order_items` insert fails | Low |
| 2 | `invoice_number` computed client-side from current order list — race condition possible under concurrent sessions | Low |
| 3 | `prod_targets_write` RLS policy missing `assistant_production_manager` — APM cannot set daily targets | **Blocking for APM** — fix with SQL A above |
| 4 | `assistant_production_manager` missing from SQL seed files | Low — only matters on full DB rebuild |

---

## 14. Feature Status Summary

### Fully Working

- Orders creation, invoicing, payment recording, PDF invoice download
- LPO workflow (submit → MD approve/reject)
- Deliveries and waybill management (driver scoping works)
- Customer management (marketer scoping works)
- Production logging, target setting, damage log
- Inventory and finished goods tracking
- Batch management
- Labour pool management
- Daily labour roster
- Truck loading log + weekly summary
- Weekly payroll (loading and production) full approval chain: draft → ICO → MD → paid
- Monthly fixed payroll full approval chain: draft → ICO → MD → paid
- **Recall to Draft** for all payroll types (any non-paid state)
- Labour rate change request workflow (propose → ICO → MD → auto-apply to labour_roles)
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

- Production target setting for `assistant_production_manager` role — run SQL A in section 12

### Not Yet Built / Out of Scope

- Push notifications / email alerts for approval events
- Audit log / change history outside of `opening_balance_history`
- Multi-site stock transfer between locations
- Automated payroll journal entries to financial statements
