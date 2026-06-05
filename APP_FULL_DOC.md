# Abuja Precast Concrete Manager — Full Application Documentation

> **Stack:** React 18.3.1 · Vite 5.2.0 · Supabase (PostgreSQL + Auth + RLS + Storage)
> **Deployment:** `abujaprecast.vercel.app` (auto-deploys from `main`)
> **Primary files:** `src/App.jsx` (~7 000 lines) · `src/components/Labour.jsx` (~2 100 lines)

---

## Table of Contents

1. [Roles & Page Access](#1-roles--page-access)
2. [canSee() Logic](#2-cansee-logic)
3. [Read-Only Enforcement (Board Member & ICO)](#3-read-only-enforcement-board-member--ico)
4. [Navigation & Routing](#4-navigation--routing)
5. [Orders & Invoicing Component](#5-orders--invoicing-component)
6. [Waybills Component](#6-waybills-component)
7. [Labour Module — All Tabs](#7-labour-module--all-tabs)
8. [Other Page-Level Components](#8-other-page-level-components)
9. [Approval Workflows](#9-approval-workflows)
10. [Supabase Tables by Feature](#10-supabase-tables-by-feature)

---

## 1. Roles & Page Access

### APP_ROLES (`src/App.jsx` lines 102–114)

| Role ID | Display Label |
|---|---|
| `md` | MD (Managing Director) |
| `accountant` | Accountant |
| `board_member` | Board Member |
| `bdm` | Business Development Manager |
| `ico` | Internal Control Officer |
| `store_officer` | Store Officer |
| `logistics_manager` | Logistics Manager |
| `marketer` | Marketer |
| `driver` | Driver |
| `hr_officer` | HR Officer |
| `production_manager` | Production Manager |

---

### ROLE_PAGES constant (`src/App.jsx` lines 117–133)

```js
const ROLE_PAGES = {
  md:                 'all',
  ico:                ['dashboard','production','inventory','batches','waybills','vehicles',
                       'staff','labour','pending_register','daily_schedule','customers',
                       'orders','lpo_approvals','schedule_approvals','reports','kpi_dashboard',
                       'accounting','suppliers','products','my_profile'],
  accountant:         ['dashboard','customers','orders','reports','kpi_dashboard','accounting',
                       'suppliers','products','my_profile','data_import'],
  board_member:       ['dashboard','production','inventory','batches','waybills','vehicles',
                       'staff','labour','pending_register','daily_schedule','customers',
                       'orders','lpo_approvals','schedule_approvals','reports','kpi_dashboard',
                       'accounting','suppliers','products','my_profile'],
  bdm:                ['dashboard','customers','orders','pending_register','daily_schedule',
                       'lpo_approvals','reports','kpi_dashboard','my_profile'],
  store_officer:      ['dashboard','inventory','batches','waybills','vehicles',
                       'pending_register','daily_schedule','products','my_profile'],
  logistics_manager:  ['dashboard','waybills','vehicles','labour','pending_register',
                       'daily_schedule','customers','my_profile'],
  marketer:           ['dashboard','customers','orders','products','my_profile'],
  driver:             ['dashboard','waybills','my_profile'],
  hr_officer:         ['dashboard','staff','reports','labour','my_profile'],
  production_manager: ['dashboard','production','inventory','batches','reports','products',
                       'labour','my_profile'],
  // legacy roles
  operations:         ['dashboard','production','inventory','batches','waybills','vehicles',
                       'staff','pending_register','daily_schedule','lpo_approvals','my_profile'],
  sales:              ['dashboard','customers','orders','my_profile'],
  staff:              ['dashboard','my_profile'],
};
```

**Special pages not in any ROLE_PAGES list:**
- `user_management` — MD only (granted separately outside ROLE_PAGES, via canSee fallback or direct nav item visibility)
- `data_import` — MD + accountant only

**Page count by role (approximate):**
- MD: all (unrestricted)
- ICO: 19 pages
- Board Member: 19 pages (same list as ICO)
- Accountant: 10 pages
- BDM: 9 pages
- Store Officer: 8 pages
- Logistics Manager: 8 pages
- HR Officer: 5 pages
- Production Manager: 7 pages
- Marketer: 5 pages
- Driver: 3 pages

---

## 2. canSee() Logic

**Source:** `src/App.jsx` lines 6895–6900

```js
const role = userProfile?.role || 'staff';
const isBoard = role === 'board_member';
const isICO   = role === 'ico';
const isMD    = role === 'md';

const allowedPages = ROLE_PAGES[role] || ['dashboard'];
const canSee = (pageId) => pageId === 'my_profile' || allowedPages === 'all' || allowedPages.includes(pageId);
const visibleNav = navItems
  .map(s => ({ ...s, items: s.items.filter(it => canSee(it.id)) }))
  .filter(s => s.items.length > 0);
const safePage = canSee(active) ? active : 'dashboard';
```

**Key points:**
- `my_profile` is universally accessible to all roles — the shortcut ensures it's never blocked even if somehow missing from ROLE_PAGES.
- `allowedPages === 'all'` handles MD (unrestricted).
- `visibleNav` filters sidebar nav items — roles only see nav links they can access.
- `safePage` is a safety net: if the URL or state somehow points to a page the current role can't access, it falls back to `dashboard`. This prevents blank or broken page renders.

---

## 3. Read-Only Enforcement (Board Member & ICO)

### Mechanism Overview

Two orthogonal systems enforce read-only behaviour:

1. **CSS blanket hide** (via HTML attributes on `<main>`) — hides all buttons globally for a role on covered pages.
2. **Explicit JSX role guards** (per-button conditions in component code) — belt-and-suspenders for critical buttons, and for pages where the CSS blanket is intentionally not applied.

---

### `<main>` element attribute logic (`src/App.jsx` line 6987)

```jsx
<main
  {...(isBoard ? { 'data-board-view': 'true' } : {})}
  {...(isICO && safePage !== 'labour' && safePage !== 'schedule_approvals'
    ? { 'data-ico-view': 'true' }
    : {})}
>
```

**Board Member:** `data-board-view` applied on every page.

**ICO:** `data-ico-view` applied on every page **except** `labour` and `schedule_approvals`.
- These two pages are intentionally interactive for ICO — they have approval buttons ICO must be able to click.
- Explicit JSX guards (not CSS blanket) control what ICO can/cannot do on those pages.

---

### CSS rules injected at runtime (`src/App.jsx` lines 7001–7011)

```jsx
{isBoard && (
  <style>{`
    [data-board-view] button:not([data-board-allow]) { display: none !important; }
    [data-board-view] input { pointer-events: none; opacity: 0.8; }
    [data-board-view] select { pointer-events: none; opacity: 0.8; }
  `}</style>
)}
{isICO && (
  <style>{`
    [data-ico-view] button:not([data-ico-allow]) { display: none !important; }
  `}</style>
)}
```

**Board Member CSS** hides all buttons AND makes inputs/selects non-interactive (pointer-events: none).
**ICO CSS** only hides buttons — inputs/selects remain interactive where needed.

---

### Opt-in exemptions: `data-board-allow` / `data-ico-allow`

Any button that a board member or ICO should still be able to click gets the corresponding attribute:

```jsx
<button data-board-allow data-ico-allow onClick={...}>☰</button>  {/* mobile hamburger */}
<button data-board-allow data-ico-allow onClick={handleExtendSession}>Extend Session</button>
<button data-board-allow data-ico-allow onClick={() => setSessionWarning(false)}>Dismiss</button>
```

In Labour and Schedule Approvals (where ICO has no CSS blanket), ICO approval buttons use `data-ico-allow` as a semantic marker only (they're already visible without the CSS blanket — `data-ico-allow` documents intent):

```jsx
<button data-ico-allow onClick={handleApprove}>Approve</button>
<button data-ico-allow onClick={handleReject}>Reject</button>
```

---

### ICO read-only banner (`src/App.jsx` lines 7018–7022)

```jsx
{isICO && active !== 'dashboard' && active !== 'schedule_approvals' && active !== 'labour' && (
  <div style={{ background: theme.blue+'22', border: `1px solid ${theme.blue}44`, ... }}>
    🔒 Read-Only Mode — Internal Control Officer. Approvals available in Schedule Approvals and Labour modules.
  </div>
)}
```

Banner is suppressed on `dashboard`, `schedule_approvals`, and `labour` — the pages where ICO is either viewing a summary or is actively expected to act.

---

### Board Member read-only banner (`src/App.jsx` line 7013–7016)

```jsx
{isBoard && active !== 'dashboard' && (
  <div>👁 View Only Mode — Board Member access</div>
)}
```

Banner appears on all Board pages except dashboard.

---

## 4. Navigation & Routing

`pages` object maps page IDs to component instances (`src/App.jsx` lines 6902–6925):

```js
const pages = {
  dashboard:          isBoard ? <BoardDashboard userProfile={userProfile} /> : <Dashboard onNavigate={setActive} userProfile={userProfile} />,
  production:         <Production />,
  inventory:          <Inventory onLowStockChange={setLowStockCount} />,
  batches:            <Batches />,
  waybills:           <Waybills userProfile={userProfile} />,
  vehicles:           <VehicleRegistry />,
  staff:              <Staff />,
  customers:          <Customers userProfile={userProfile} />,
  orders:             <Orders onNavigate={setActive} userProfile={userProfile} />,
  pending_register:   <PendingDeliveryRegister />,
  daily_schedule:     <DailySchedule />,
  lpo_approvals:      <LPOApprovals />,
  schedule_approvals: <ScheduleApprovals />,
  reports:            <Reports userProfile={userProfile} />,
  kpi_dashboard:      <KPIDashboard />,
  products:           <Products />,
  suppliers:          <SupplierRegistry />,
  accounting:         <Accounting userProfile={userProfile} />,
  data_import:        <DataImport />,
  user_management:    <UserManagement userProfile={userProfile} />,
  labour:             <Labour userProfile={userProfile} />,
  my_profile:         <MyProfile userProfile={userProfile} />,
};
```

Active page is rendered as `{pages[safePage]}`.

**Board Dashboard:** Board members see `<BoardDashboard>` instead of the standard `<Dashboard>` — a separate component with aggregated read-only KPIs.

**Nav badges:**
```js
const getBadge = (id) => {
  if (id === "inventory" && lowStockCount > 0) return lowStockCount;
  if (id === "lpo_approvals" && lpoCount > 0) return lpoCount;
  if (id === "schedule_approvals" && scheduleCount > 0) return scheduleCount;
  return 0;
};
```

---

## 5. Orders & Invoicing Component

**Source:** `src/App.jsx` — `Orders` function component

### What ICO can see (always visible)

- Full order list (all orders, all customers)
- Order detail panel — customer name, location, phone, site, marketer
- Order items table (block type, quantity, unit price)
- All payment history rows (date, amount, status badge)
- Payment receipt PDF button (if payment is `confirmed`) — always visible, no ICO guard
- Download Invoice PDF button — always visible, no ICO guard
- Invoice number display (once generated)
- View Waybills button — always visible, no ICO guard
- Status badges (LPO, order status)

### ICO-blocked buttons (JSX guards)

All seven guards use the pattern `userProfile?.role !== 'ico'`:

| Line | Button | Guard |
|---|---|---|
| 1142 | `+ New Order` | `userProfile?.role !== 'ico'` |
| 1312 | `Delete` (order row) | `userProfile?.role !== 'ico'` |
| 1333 | `Edit Order` (detail panel) | `userProfile?.role !== 'ico'` |
| 1406 | `Edit` (payment row) | `userProfile?.role !== 'ico'` |
| 1407 | `Remove` (payment row) | `userProfile?.role !== 'ico'` |
| 1417 | `Generate Invoice` (no invoice yet) | `userProfile?.role !== 'ico'` |
| 1424 | `+ Record Payment` | `userProfile?.role !== 'ico'` |

**Note on line 1417** — the Generate Invoice guard sits inside a ternary branch (not inside `{}`):
```jsx
{(selected.invoices || []).length === 0 ? (
  userProfile?.role !== 'ico' && <button onClick={handleGenerateInvoice}>Generate Invoice</button>
) : (
  <>
    <button onClick={handleGenerateInvoice}>Download Invoice PDF</button>
    {userProfile?.role !== 'ico' && <button>+ Record Payment</button>}
  </>
)}
```

### Invoice detail render logic

Invoices are stored in `selected.invoices` (array, usually one element). The detail panel:
1. Shows invoice number from `selected.invoices[0].invoice_number`
2. Flattens all invoice payments: `selected.invoices.flatMap(inv => inv.payments || [])`
3. Renders payment history table with date, amount, status badge
4. Shows Receipt PDF button per confirmed payment (visible to all roles)
5. Conditionally shows Generate Invoice or Download Invoice PDF based on `selected.invoices.length`

### InvoiceEditorModal

A modal for editing invoice line items. Fields: invoice number, issue date, due date, delivery cost, discount, VAT toggle, line items (description, quantity, unit price). The modal is opened by a separate Edit Invoice button (only rendered for roles with edit access).

---

## 6. Waybills Component

**Source:** `src/App.jsx` — `Waybills` function component

### Form fields

| Field | Notes |
|---|---|
| Customer | Select from customers list |
| Delivery Date | Date picker |
| Vehicle | Select from vehicles registry |
| Driver | Filtered by role — see below |
| Items | Block type, quantity |
| Destination | Free text |
| Notes | Optional |

### Driver field role guard

```jsx
{userProfile?.role === 'driver'
  ? <input value={userProfile.full_name} disabled />
  : <select>{drivers.map(d => <option>...)}</select>
}
```

Drivers see their own name pre-filled (non-editable). All other roles get a dropdown.

### Role access

- Waybills page is accessible to: md, ico, accountant (via orders nav), board_member, store_officer, logistics_manager, driver, bdm, staff

### ICO on Waybills

ICO has `data-ico-view` active on the waybills page, so all buttons are hidden by CSS blanket. ICO can view waybill list and details but cannot create, edit, or delete waybills.

---

## 7. Labour Module — All Tabs

**Source:** `src/components/Labour.jsx` (~2 100 lines)

### Tab Definitions (`Labour.jsx` lines 2057–2067)

```js
const isLogistics = userProfile?.role === 'logistics_manager'
const TABS = isLogistics
  ? [{ key: 'truck', label: 'Truck Loading' }]
  : [
    { key: 'pool',    label: 'Labour Pool' },
    { key: 'roster',  label: 'Daily Roster' },
    { key: 'truck',   label: 'Truck Loading' },
    { key: 'payroll', label: 'Payroll' },
    { key: 'monthly', label: 'Monthly Fixed' },
    { key: 'rates',   label: 'Labour Rates' },
  ]
```

**Logistics Manager** sees only the Truck Loading tab.
**All other roles** (including ICO) see all 6 tabs.

**ICO note:** ICO receives all 6 tabs because `labour` is excluded from `data-ico-view`, so the CSS blanket does not hide tab buttons. Tabs are rendered as plain buttons — without the CSS blanket they are visible.

---

### Tab 1: Labour Pool (`pool`)

Displays a list of registered labour workers.

**Roles with write access:** production_manager, hr_officer, md
**ICO access:** Read-only view. No `data-ico-view` CSS on labour, but no explicit create/edit buttons for ICO either — the Add Worker and Edit buttons are conditionally rendered for pm/hr/md only.

**Data:** `labour_workers` table

---

### Tab 2: Daily Roster (`roster`)

Shows daily attendance/assignment roster. Workers are assigned to production shifts.

#### RosterDetail action buttons (`Labour.jsx` lines 927–955)

```jsx
{role === 'production_manager' && icoStatus === 'draft' && (
  <button onClick={handleSubmitForICO}>Submit for ICO Review</button>
)}
{role === 'ico' && icoStatus === 'submitted' && (
  <>
    <button data-ico-allow onClick={handleICOApprove}>Approve</button>
    <button data-ico-allow onClick={handleICOReject}>Reject</button>
  </>
)}
{role === 'md' && icoStatus === 'ico_approved' && mdStatus !== 'approved' && (
  <>
    <button onClick={handleMDApprove}>MD Approve</button>
    <button onClick={handleMDReject}>MD Reject</button>
  </>
)}
{role === 'accountant' && mdStatus === 'approved' && payStatus !== 'paid' && (
  <button onClick={handleMarkPaid}>Mark as Paid</button>
)}
```

**Approval chain:** production_manager submits → ICO approves/rejects → MD approves/rejects → accountant marks paid.

**Data:** `daily_roster`, `roster_assignments` tables

---

### Tab 3: Truck Loading (`truck`)

Manages loader assignments to trucks and records actual loading logs.

#### ICO guards on Truck Loading (`Labour.jsx` lines 1054–1095)

```jsx
{/* + Assign Loader button — hidden from ICO */}
{userProfile?.role !== 'ico' && (
  <div style={{ textAlign: 'right', marginBottom: '14px' }}>
    <button style={styles.btn('primary')} onClick={() => setShowAssignForm(true)}>+ Assign Loader</button>
  </div>
)}

{/* Remove assignment — hidden from ICO */}
<td>
  {userProfile?.role !== 'ico' && (
    <button onClick={() => handleRemoveAssignment(a.id)}>Remove</button>
  )}
</td>

{/* + Record Loading button — hidden from ICO */}
{userProfile?.role !== 'ico' && (
  <div style={{ textAlign: 'right', marginBottom: '14px' }}>
    <button style={styles.btn('primary')} onClick={() => setShowLogForm(true)}>+ Record Loading</button>
  </div>
)}
```

ICO can view loader assignments and loading logs but cannot create assignments or log loading records.

#### Weekly Summary submit (`Labour.jsx` line 1303)

```js
const canSubmit = ['production_manager', 'hr_officer', 'accountant', 'logistics_manager', 'md'].includes(userProfile?.role)
// 'ico' deliberately excluded
```

**Data:** `truck_assignments`, `truck_loading_logs` tables

---

### Tab 4: Weekly Payroll (`payroll`)

Generates and approves weekly payroll for casual/daily labour.

#### WeeklyPayrollTab buttons (`Labour.jsx` lines 1603–1620)

```jsx
{!currentPayroll && workers.length > 0 && ['production_manager','hr_officer','md'].includes(userProfile?.role) && (
  <button onClick={handleGeneratePayroll}>Generate Payroll</button>
)}
{currentPayroll?.status === 'draft' && userProfile?.role === 'ico' && (
  <button data-ico-allow onClick={handleICOApprove}>ICO Approve</button>
)}
{currentPayroll?.status === 'ico_approved' && userProfile?.role === 'md' && (
  <button onClick={handleMDApprove}>MD Approve</button>
)}
{currentPayroll?.status === 'md_approved' && userProfile?.role === 'accountant' && (
  <button onClick={handleMarkPaid}>Mark as Paid + Create Expense</button>
)}
{currentPayroll?.status === 'paid' && (
  <button onClick={handleDownloadPDF}>Download PDF</button>
)}
```

**Approval chain:** production_manager/hr_officer/md generates → ICO approves → MD approves → accountant marks paid + creates expense entry → PDF available to all.

**Data:** `weekly_payrolls`, `weekly_payroll_items` tables

---

### Tab 5: Monthly Fixed (`monthly`)

Manages monthly fixed-salary staff payroll.

#### MonthlyFixedTab buttons (`Labour.jsx` lines 1775–1789)

```jsx
{!existingPayroll && (
  <button onClick={handleCreatePayroll}>Create Payroll for {month}</button>
)}
{existingPayroll?.status === 'draft' && userProfile?.role === 'ico' && (
  <button data-ico-allow onClick={handleICOApprove}>ICO Approve</button>
)}
{existingPayroll?.status === 'ico_approved' && userProfile?.role === 'md' && (
  <button onClick={handleMDApprove}>MD Approve</button>
)}
{existingPayroll?.status === 'md_approved' && userProfile?.role === 'accountant' && (
  <button onClick={handleMarkPaid}>Mark as Paid + Create Expense</button>
)}
{existingPayroll?.status === 'paid' && (
  <button onClick={handleDownloadPDF}>Download PDF</button>
)}
```

**Approval chain:** any authorized role creates → ICO approves → MD approves → accountant marks paid → PDF available.

**Data:** `monthly_payrolls`, `monthly_payroll_items` tables

---

### Tab 6: Labour Rates (`rates`)

Manages rate proposals for labour pay changes.

#### LabourRatesTab buttons (`Labour.jsx` lines 1891–1914)

```jsx
{userProfile?.role === 'production_manager' && (
  <button onClick={() => setShowProposeForm(true)}>+ Propose Rate Change</button>
)}
{userProfile?.role === 'ico' && req.overall_status === 'pending' && (
  <>
    <button data-ico-allow onClick={() => handleApprove(req.id)}>Approve</button>
    <button data-ico-allow onClick={() => handleReject(req.id)}>Reject</button>
  </>
)}
{userProfile?.role === 'md' && req.overall_status === 'md_review' && (
  <>
    <button onClick={() => handleMDApprove(req.id)}>MD Approve</button>
    <button onClick={() => handleMDReject(req.id)}>MD Reject</button>
  </>
)}
```

**Approval chain:** production_manager proposes → ICO approves/rejects → MD approves/rejects → rates updated.

**Data:** `labour_rate_requests`, `labour_rate_items` tables

---

## 8. Other Page-Level Components

### Dashboard / BoardDashboard

- Standard `<Dashboard>` is the default. Receives `onNavigate` and `userProfile`.
- Board members see `<BoardDashboard>` — a read-only KPI summary component.
- ICO sees standard `<Dashboard>` (no banner, no CSS blanket on dashboard).

### Production

Standard read/write for roles with access (md, ico, board_member, store_officer, production_manager).
ICO: `data-ico-view` active → all buttons hidden by CSS.

### Inventory

Tracks raw material stock. Badges low-stock count in nav.
ICO: read-only via `data-ico-view`.

### Batches

Concrete batch production records.
ICO: read-only via `data-ico-view`.

### Customers

Customer registry with contact details and site records.
ICO: read-only via `data-ico-view`.

### Schedule Approvals

Pending schedules submitted by production_manager for ICO review.
ICO: `data-ico-view` NOT applied — ICO must approve/reject schedules here.
Approve/Reject buttons use `data-ico-allow` as semantic markers.

### LPO Approvals

Local Purchase Order approval workflow.
ICO: read-only via `data-ico-view`.

### Reports

Aggregated financial and production reports.
ICO: read-only via `data-ico-view` (no write buttons in this component anyway).

### KPI Dashboard

Key Performance Indicators summary.
ICO: read-only via `data-ico-view`.

### Accounting

Financial records, expenses, bank reconciliation.
ICO: read-only via `data-ico-view`.
Only accountant and MD have write access.

### Suppliers

Supplier registry.
ICO: read-only via `data-ico-view`.

### Products

Product catalogue (block types and prices).
ICO: read-only via `data-ico-view`.

### Staff

Staff registry and profile management.
ICO: read-only via `data-ico-view`.

### Vehicles / VehicleRegistry

Vehicle fleet management.
ICO: read-only via `data-ico-view`.

### Pending Delivery Register

Delivery queue. Read-heavy page.
ICO: read-only via `data-ico-view`.

### Daily Schedule

Production schedule view.
ICO: read-only via `data-ico-view`.

### Data Import

Bulk CSV import tool.
Access: md, accountant only (not in ICO or board_member ROLE_PAGES).

### User Management

User account management (create users, assign roles).
Access: md only.

### My Profile / MyProfile

Password change and personal info.
Access: all roles (universally allowed via `canSee` shortcut).

---

## 9. Approval Workflows

### 1. Daily Roster Approval

```
production_manager  →  [Submit for ICO Review]
ICO                 →  [Approve] or [Reject]  (data-ico-allow)
MD                  →  [MD Approve] or [MD Reject]
accountant          →  [Mark as Paid]
```

Status field: `ico_status` (`draft` → `submitted` → `ico_approved`/`rejected`), `md_status` (`approved`/`rejected`), `pay_status` (`paid`)

---

### 2. Weekly Payroll Approval

```
production_manager / hr_officer / md  →  [Generate Payroll]
ICO                                   →  [ICO Approve]  (data-ico-allow)
MD                                    →  [MD Approve]
accountant                            →  [Mark as Paid + Create Expense]
all roles                             →  [Download PDF]  (after paid)
```

Status field: `status` (`draft` → `ico_approved` → `md_approved` → `paid`)

---

### 3. Monthly Fixed Payroll Approval

```
authorized role   →  [Create Payroll for {month}]
ICO               →  [ICO Approve]  (data-ico-allow)
MD                →  [MD Approve]
accountant        →  [Mark as Paid + Create Expense]
all roles         →  [Download PDF]  (after paid)
```

Status field: `status` (`draft` → `ico_approved` → `md_approved` → `paid`)

---

### 4. Labour Rate Change Approval

```
production_manager  →  [+ Propose Rate Change]
ICO                 →  [Approve] or [Reject]  (data-ico-allow, only on status = 'pending')
MD                  →  [MD Approve] or [MD Reject]  (only on status = 'md_review')
```

Status field: `overall_status` (`pending` → `md_review` → `approved`/`rejected`)

---

### 5. Schedule Approvals (separate page)

Handled by `<ScheduleApprovals>` component. Production managers submit daily schedules; ICO reviews and approves on the `schedule_approvals` page.
ICO has `data-ico-view` excluded on this page — full interactive access.

---

## 10. Supabase Tables by Feature

| Feature | Tables |
|---|---|
| Auth | `auth.users` (Supabase managed), `user_profiles` |
| Customers | `customers`, `customer_sites` |
| Orders | `orders`, `order_items`, `invoices`, `invoice_items`, `payments` |
| Waybills | `waybills`, `waybill_items` |
| Production | `production_records` |
| Inventory | `inventory_items`, `inventory_transactions` |
| Batches | `batches`, `batch_items` |
| Vehicles | `vehicles` |
| Staff | `staff_profiles` (or `user_profiles` with role filter) |
| LPO | `lpo_requests`, `lpo_items` |
| Schedule | `daily_schedules`, `schedule_items` |
| Schedule Approvals | `daily_schedules` (status field) |
| Labour Pool | `labour_workers` |
| Daily Roster | `daily_roster`, `roster_assignments` |
| Truck Loading | `truck_assignments`, `truck_loading_logs` |
| Weekly Payroll | `weekly_payrolls`, `weekly_payroll_items` |
| Monthly Payroll | `monthly_payrolls`, `monthly_payroll_items` |
| Labour Rates | `labour_rate_requests`, `labour_rate_items` |
| Accounting | `expense_records`, `bank_transactions` |
| Suppliers | `suppliers` |
| Products | `products` |
| Reports | (aggregation queries across multiple tables) |
| KPI Dashboard | (aggregation queries across multiple tables) |

---

## Appendix: Role Summary Table

| Role | CSS Blanket | Banner | Labour Tabs | Can Approve |
|---|---|---|---|---|
| `md` | None | None | All 6 | All stages |
| `board_member` | `data-board-view` (all pages) | "View Only" | All 6 (buttons hidden) | None |
| `ico` | `data-ico-view` (all pages except labour, schedule_approvals) | "Read-Only Mode" (all pages except dashboard, labour, schedule_approvals) | All 6 | Roster, Payroll, Monthly, Rates, Schedules |
| `production_manager` | None | None | All 6 | Submits roster/schedules, generates payroll |
| `hr_officer` | None | None | All 6 | Generates payroll |
| `accountant` | None | None | All 6 | Marks payroll paid |
| `logistics_manager` | None | None | Truck only | Weekly summary submit |
| `marketer` | None | None | No labour access | N/A |
| `store_officer` | None | None | No labour access | N/A |
| `driver` | None | None | No labour access | N/A |
| `bdm` | None | None | No labour access | N/A |

---

*Document reflects commit `58c314e` on branch `claude/analyze-test-coverage-irQFZ`. Last updated: 2026-06-05.*
