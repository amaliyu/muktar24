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

### APP_ROLES (display labels, `src/App.jsx` lines 102–114)

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
  store_officer:      ['dashboard','inventory','batches','waybills','vehicles',
                       'pending_register','daily_schedule','products','my_profile'],
  logistics_manager:  ['dashboard','waybills','vehicles','labour','pending_register',
                       'daily_schedule','customers','my_profile'],
  marketer:           ['dashboard','customers','orders','products','my_profile'],
  driver:             ['dashboard','waybills','my_profile'],
  hr_officer:         ['dashboard','staff','reports','labour','my_profile'],
  production_manager: ['dashboard','production','inventory','batches','reports',
                       'products','labour','my_profile'],
  // Legacy roles — kept for existing users
  operations:         ['dashboard','production','inventory','batches','waybills','vehicles',
                       'staff','pending_register','daily_schedule','lpo_approvals','my_profile'],
  sales:              ['dashboard','customers','orders','my_profile'],
  staff:              ['dashboard','my_profile'],
};
```

### Page access matrix (key roles)

| Page | md | ico | board | accountant | bdm | store | logistics | marketer | driver | hr | prod_mgr |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| dashboard | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| production | ✓ | ✓ | ✓ | — | — | — | — | — | — | — | ✓ |
| inventory | ✓ | ✓ | ✓ | — | — | ✓ | — | — | — | — | ✓ |
| batches | ✓ | ✓ | ✓ | — | — | ✓ | — | — | — | — | ✓ |
| waybills | ✓ | ✓ | ✓ | — | — | ✓ | ✓ | — | ✓ | — | — |
| vehicles | ✓ | ✓ | ✓ | — | — | ✓ | ✓ | — | — | — | — |
| staff | ✓ | ✓ | ✓ | — | — | — | — | — | — | ✓ | — |
| labour | ✓ | ✓ | ✓ | — | — | — | ✓ | — | — | ✓ | ✓ |
| customers | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ | ✓ | — | — | — |
| orders | ✓ | ✓ | ✓ | ✓ | ✓ | — | — | ✓ | — | — | — |
| pending_register | ✓ | ✓ | ✓ | — | ✓ | ✓ | ✓ | — | — | — | — |
| daily_schedule | ✓ | ✓ | ✓ | — | ✓ | ✓ | ✓ | — | — | — | — |
| lpo_approvals | ✓ | ✓ | ✓ | — | ✓ | — | — | — | — | — | — |
| schedule_approvals | ✓ | ✓ | ✓ | — | — | — | — | — | — | — | — |
| reports | ✓ | ✓ | ✓ | ✓ | ✓ | — | — | — | — | ✓ | ✓ |
| kpi_dashboard | ✓ | ✓ | ✓ | ✓ | ✓ | — | — | — | — | — | — |
| accounting | ✓ | ✓ | ✓ | ✓ | — | — | — | — | — | — | — |
| suppliers | ✓ | ✓ | ✓ | ✓ | — | — | — | — | — | — | — |
| products | ✓ | ✓ | ✓ | ✓ | — | ✓ | — | ✓ | — | — | ✓ |
| data_import | ✓ | — | — | ✓ | — | — | — | — | — | — | — |
| user_management | ✓ | — | — | — | — | — | — | — | — | — | — |
| my_profile | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

> `my_profile` is always accessible — it bypasses the ROLE_PAGES check entirely (see canSee below).

---

## 2. canSee() Logic

**Location:** `src/App.jsx` lines 6890–6900

```js
const role = userProfile?.role || 'staff';
const isBoard = role === 'board_member';
const isICO   = role === 'ico';
const isMD    = role === 'md';

const allowedPages = ROLE_PAGES[role] || ['dashboard'];
const canSee = (pageId) =>
  pageId === 'my_profile' ||      // always allowed
  allowedPages === 'all' ||       // MD shortcut
  allowedPages.includes(pageId);  // explicit list check

const visibleNav = navItems
  .map(s => ({ ...s, items: s.items.filter(it => canSee(it.id)) }))
  .filter(s => s.items.length > 0);

const safePage = canSee(active) ? active : 'dashboard';
// If the user somehow lands on a page they can't see, fallback to dashboard
```

**Key behaviours:**
- `md` gets `allowedPages === 'all'` so every `canSee()` call returns true
- Any role whose ID is not in ROLE_PAGES defaults to `['dashboard']`
- Navigating directly to a forbidden page silently redirects to dashboard via `safePage`

---

## 3. Read-Only Enforcement (Board Member & ICO)

Two parallel systems enforce read-only views at the CSS level for Board and ICO.

### CSS injection (lines 7001–7021)

```jsx
{isBoard && (
  <style>{`
    [data-board-view] button:not([data-board-allow]) { display: none !important; }
    [data-board-view] input  { pointer-events: none; opacity: 0.8; }
    [data-board-view] select { pointer-events: none; opacity: 0.8; }
  `}</style>
)}

{isICO && (
  <style>{`
    [data-ico-view] button:not([data-ico-allow]) { display: none !important; }
  `}</style>
)}
```

The `<main>` element receives `data-board-view` when `isBoard` and `data-ico-view` when `isICO`. This CSS hides every button in the view unless it carries the relevant exemption attribute.

### Exemption attributes

| Attribute | Purpose | Where used |
|---|---|---|
| `data-board-allow` | Visible to Board Members | Session extend/dismiss buttons; ICO approve buttons in Labour |
| `data-ico-allow` | Visible to ICO despite read-only CSS | ICO Approve buttons in RosterDetail, WeeklyPayrollTab, MonthlyFixedTab |

> **Note:** The `data-ico-allow` CSS rule hides all buttons site-wide for ICO on pages wrapped with `data-ico-view`. Individual component role guards (e.g. `userProfile?.role !== 'ico'`) are a second, more targeted layer applied per-button in JSX.

### Banner messages (lines 7013–7022)

```jsx
{isBoard && active !== 'dashboard' && (
  <div>👁 View Only Mode — Board Member access</div>
)}
{isICO && active !== 'dashboard' && active !== 'schedule_approvals' && active !== 'labour' && (
  <div>🔒 Read-Only Mode — Internal Control Officer. Approvals available in Schedule Approvals and Labour modules.</div>
)}
```

The ICO banner is **suppressed** on `schedule_approvals` and `labour` because ICO has write actions on those pages.

---

## 4. Navigation & Routing

Pages are resolved at lines 6902–6925:

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

- `{pages[safePage]}` renders the active page
- Board Member gets `BoardDashboard` instead of the standard `Dashboard`
- Components receiving `userProfile` perform their own per-button role checks
- Components **not** receiving `userProfile` (Production, Inventory, Batches, etc.) rely entirely on page-level access control — no internal role checks

### Notification badges

```js
const getBadge = (id) => {
  if (id === "inventory"          && lowStockCount > 0)  return lowStockCount;
  if (id === "lpo_approvals"      && lpoCount > 0)       return lpoCount;
  if (id === "schedule_approvals" && scheduleCount > 0)  return scheduleCount;
  return 0;
};
```

---

## 5. Orders & Invoicing Component

**Location:** `src/App.jsx` line 829  
**Props:** `{ onNavigate, userProfile }`

### State

```js
const [orders, setOrders]               = useState([]);
const [staff, setStaff]                 = useState([]);
const [selected, setSelected]           = useState(null);       // active order in detail panel
const [loading, setLoading]             = useState(true);
const [saving, setSaving]               = useState(false);
const [invoicing, setInvoicing]         = useState(false);
const [showForm, setShowForm]           = useState(false);
const [showPayForm, setShowPayForm]     = useState(false);
const [editPayment, setEditPayment]     = useState(null);
const [alert, setAlert]                 = useState(null);
const [confirmDelete, setConfirmDelete] = useState(null);
const [invoiceEditor, setInvoiceEditor] = useState(null);
const [customerMode, setCustomerMode]   = useState("new");
const [allCustomers, setAllCustomers]   = useState([]);
const [custSearch, setCustSearch]       = useState("");
const [pickedCustomer, setPickedCustomer] = useState(null);
const [customerSites, setCustomerSites] = useState([]);
const [pickedSiteId, setPickedSiteId]   = useState("");
const [form, setForm]                   = useState(emptyForm);
const [lpoDocUrl, setLpoDocUrl]         = useState("");
const [lpoDocName, setLpoDocName]       = useState("");
const [lpoDocSize, setLpoDocSize]       = useState(0);
const [lpoDocUploading, setLpoDocUploading] = useState(false);
const [payForm, setPayForm]             = useState({ amount: "", date: "" });
const [orderEditMode, setOrderEditMode] = useState(false);
const [orderEditItems, setOrderEditItems] = useState([]);
const [orderEditMarketer, setOrderEditMarketer] = useState("");
```

### Data loading

Supabase tables queried on mount:
- `orders` — with nested `customer`, `site`, `order_items`, `invoices`, `payments`, `marketer` (staff join)
- `staff` — for marketer selector in edit mode

Marketer filter: `const isMarketerRole = userProfile?.role === 'marketer'` — Marketers see only orders where `marketer_id` matches their `staff_id`.

### Role checks — complete list

| Location | Condition | Effect |
|---|---|---|
| Order list (line 1142) | `userProfile?.role !== 'ico'` | Hides `+ New Order` button |
| Order list row (line 1312) | `userProfile?.role !== 'ico'` | Hides `Delete` button on every order card |
| Detail panel header (line 1333) | `!orderEditMode && userProfile?.role !== 'ico'` | Hides `Edit Order` button |
| Payment history row (line 1406) | `userProfile?.role !== 'ico'` | Hides `Edit` button on each payment |
| Payment history row (line 1407) | `userProfile?.role !== 'ico'` | Hides `Remove` button on each payment |
| Invoice actions (line 1417) | `userProfile?.role !== 'ico'` | Hides `Generate Invoice` when no invoice exists |
| Invoice actions (line 1424) | `userProfile?.role !== 'ico'` | Hides `+ Record Payment` when invoice exists |
| Data loading (line 859) | `isMarketerRole` | Marketers filtered to own orders only |

### Invoice detail render logic

The detail panel renders whenever `selected !== null` (set by clicking any order row — no role check gates this). All roles that can see the Orders page can view the full detail.

```jsx
<div style={styles.card}>
  {selected ? (() => {
    const total = orderTotal(selected);
    const paid  = orderPaid(selected);
    const qty   = orderQty(selected);
    return (
      <>
        {/* Header: customer name + Edit Order button (hidden for ICO) */}
        <div style={{ display:"flex", justifyContent:"space-between" }}>
          <div>Customer Statement — {selected.customer?.name}</div>
          {!orderEditMode && userProfile?.role !== 'ico' && (
            <button onClick={() => startOrderEdit(selected)}>Edit Order</button>
          )}
        </div>

        {/* Order items table — always visible */}
        {/* Summary: Total Value, Total Paid, Balance, Qty */}

        {/* Payment history — always visible to ICO */}
        {allPayments.map(p => (
          <div key={p.id}>
            <span>{p.payment_date}</span>
            <span>{naira(p.amount_paid)}</span>
            <span>{p.status}</span>
            <div>
              {p.status === "confirmed" && (
                <button>Receipt</button>   // always visible (read-only PDF)
              )}
              {userProfile?.role !== 'ico' && <button>Edit</button>}
              {userProfile?.role !== 'ico' && <button>Remove</button>}
            </div>
          </div>
        ))}

        {/* Invoice actions */}
        {(selected.invoices || []).length === 0 ? (
          // No invoice yet
          userProfile?.role !== 'ico' && (
            <button onClick={handleGenerateInvoice}>Generate Invoice</button>
          )
        ) : (
          <>
            {/* Invoice number — always visible */}
            <div>Invoice: {selected.invoices[0].invoice_number}</div>

            {/* Download Invoice PDF — visible to ALL including ICO */}
            <button onClick={handleGenerateInvoice}>Download Invoice PDF</button>

            {/* Record Payment — hidden from ICO */}
            {userProfile?.role !== 'ico' && (
              <button onClick={() => setShowPayForm(!showPayForm)}>+ Record Payment</button>
            )}
          </>
        )}

        {/* View Waybills navigation link — always visible */}
        <button onClick={() => onNavigate("waybills")}>View Waybills</button>
      </>
    );
  })() : (
    <div>Select an order to view details</div>
  )}
</div>
```

**What ICO can see in Orders:**
- Full order list with customer name, value, paid amount, LPO badge, status badge
- Full detail panel: customer statement, order items, quantities, total/paid/balance
- All payment history rows (date, amount, status, Receipt PDF button)
- Invoice number and Download Invoice PDF button

**What ICO cannot do:**
- Create new orders (`+ New Order` hidden)
- Delete orders (Delete button hidden on every row)
- Edit order items or marketer (Edit Order button hidden)
- Edit or remove payment records
- Generate invoice (only on orders with no invoice)
- Record new payments

### Supabase tables used

| Table | Operation |
|---|---|
| `orders` | SELECT (with joins to customer, site, order_items, invoices, payments, marketer) |
| `order_items` | SELECT (via join), INSERT / UPDATE on save |
| `invoices` | SELECT (via join), INSERT on generate |
| `payments` | SELECT (via join), INSERT on record, UPDATE on edit, DELETE on remove |
| `customers` | SELECT (for existing customer picker) |
| `customer_sites` | SELECT (for site picker) |
| `staff` | SELECT (for marketer dropdown) |
| `storage/invoices` | PUT (invoice PDF upload) |

---

## 6. Waybills Component

**Location:** `src/App.jsx` line 1462  
**Props:** `{ userProfile }`

### State

```js
const [waybills, setWaybills]           = useState([]);
const [staff, setStaff]                 = useState([]);
const [vehicles, setVehicles]           = useState([]);
const [activeBatches, setActiveBatches] = useState([]);
const [batchMap, setBatchMap]           = useState({});
const [activeOrders, setActiveOrders]   = useState([]);
const [scheduleItems, setScheduleItems] = useState([]);
const [loading, setLoading]             = useState(true);
const [saving, setSaving]               = useState(false);
const [showForm, setShowForm]           = useState(false);
const [alert, setAlert]                 = useState(null);
const [confirmDelete, setConfirmDelete] = useState(null);
const [editTarget, setEditTarget]       = useState(null);
const [selectedOrderId, setSelectedOrderId] = useState("");
const [form, setForm]                   = useState(emptyForm);
```

### Role checks

| Location | Condition | Effect |
|---|---|---|
| Line 1480 | `const isDriverRole = userProfile?.role === 'driver'` | All driver-specific logic branches from this |
| Line 1486–1490 | `if (isDriverRole)` | Drivers load only their own waybills via `waybillsService.getAllForDriver(driverStaffId)` |
| Line 1498 | `if (isDriverRole) { setLoading(false); return; }` | Drivers skip loading orders, batches, schedule items |
| Line 1675 | `if (isDriverRole && !driverStaffId)` | Shows error card if driver auth user is not linked to a staff record |
| Line 1709 | `{!isDriverRole && <button>+ Record Waybill</button>}` | Drivers cannot create waybills |
| Line 1712–1716 | `{isDriverRole && <banner>}` | Shows "Showing only waybills assigned to you" banner to drivers |

No ICO-specific guards inside Waybills — ICO sees all content via the CSS `data-ico-view` hide-all-buttons rule. The waybill list and all detail is visible to ICO, but all mutating buttons are suppressed by the CSS injection.

### Form fields

| Field | Type | Notes |
|---|---|---|
| Date | date input | Required |
| Vehicle | select | Options: `vehicles` table. Auto-fills Truck Number and Driver when selected |
| Driver | select | Options: `staff` table |
| Truck / Plate Number | text input | e.g. `ABC-123-AA` |
| Physical Waybill No. | text input | Manual reference from physical book |
| Block Type | ProductSelect | Synced to batch filter |
| Quantity Loaded | number | Required |
| Quantity Received | number | |
| Batch Number | select | Options: `active_batches` filtered by block type |
| Link to Schedule Item | select | Only shown when `scheduleItems.length > 0` — auto-fills block type and qty |
| Quantity Damaged in Transit | number | Triggers warning banner; creates damage log entry on save |
| Diesel Given to Driver (litres) | number | Only shown when `form.vehicleId` is set |
| Dispensed By (Store Officer) | text input | Only shown when vehicle selected and diesel > 0 |
| Receiver | select or read-only | On new: select from `activeOrders` (customers with active invoices). On edit: read-only display |
| Notes | text input | Optional |

### Supabase tables used

| Table | Operation |
|---|---|
| `waybills` | SELECT, INSERT, UPDATE, DELETE |
| `vehicles` | SELECT (for dropdown) |
| `staff` | SELECT (for driver dropdown) |
| `batches` | SELECT (for batch dropdown) |
| `finished_goods` | UPDATE (stock restored on delete, decremented on create) |
| `orders` | SELECT (for receiver dropdown — orders with active invoices) |
| `invoices` | SELECT (joined to orders) |
| `delivery_schedule_items` | SELECT (for today's approved schedule items) |
| `damage_log` | INSERT (when `quantityDamaged > 0`) |

---

## 7. Labour Module — All Tabs

**Location:** `src/components/Labour.jsx`  
**Props:** `{ userProfile }`

### Tab structure

```js
const isLogistics = userProfile?.role === 'logistics_manager'
const TABS = isLogistics
  ? [{ key: 'truck',   label: 'Truck Loading' }]
  : [
    { key: 'pool',    label: 'Labour Pool' },
    { key: 'roster',  label: 'Daily Roster' },
    { key: 'truck',   label: 'Truck Loading' },
    { key: 'payroll', label: 'Payroll' },
    { key: 'monthly', label: 'Monthly Fixed' },
    { key: 'rates',   label: 'Labour Rates' },
  ]
```

- **Logistics Manager** sees only the Truck Loading tab.
- All other roles who can access the Labour page see all six tabs.

Shared data loaded once on mount: `labour_roles`, `labour_pool`.

---

### Tab 1 — Labour Pool (`LabourPoolTab`)

No role checks inside the component. All roles who can reach the Labour page can view and (implicitly) edit worker records.

**Supabase tables:** `labour_pool`, `labour_roles`

---

### Tab 2 — Daily Roster (`DailyRosterTab`)

#### List view role checks

| Condition | Effect |
|---|---|
| `['production_manager', 'hr_officer'].includes(role)` | Shows `+ Create Roster` button |
| `canEdit = !isPaid && ((role === 'production_manager' && ['draft','submitted'].includes(icoSt)) \|\| role === 'md')` | Shows `Edit` button per row |
| `canDelete = !isPaid && ((role === 'production_manager' && ['draft','submitted'].includes(icoSt)) \|\| (role === 'md'))` | Shows `Delete` button per row |

The **View** button and all roster data are visible to every role that can see the Labour page.

#### RosterDetail — actions section

```jsx
{/* Comment input — shown to ico and md only */}
{(role === 'ico' || role === 'md') && (
  <input value={comment} onChange={...} placeholder="Optional rejection reason…" />
)}

{/* Submit for review — Production Manager only, on draft */}
{role === 'production_manager' && icoStatus === 'draft' && (
  <button onClick={() => doAction('submit')}>Submit for ICO Review</button>
)}

{/* ICO actions — ICO only, on submitted */}
{role === 'ico' && icoStatus === 'submitted' && (
  <>
    <button data-ico-allow onClick={() => doAction('ico_approve')}>Approve</button>
    <button data-ico-allow onClick={() => doAction('ico_reject')}>Reject</button>
  </>
)}

{/* MD actions — MD only, after ICO approval */}
{role === 'md' && icoStatus === 'ico_approved' && mdStatus !== 'approved' && (
  <>
    <button onClick={() => doAction('md_approve')}>MD Approve</button>
    <button onClick={() => doAction('md_reject')}>MD Reject</button>
  </>
)}

{/* Mark as paid — Accountant only, after MD approval */}
{role === 'accountant' && mdStatus === 'approved' && payStatus !== 'paid' && (
  <button onClick={() => doAction('mark_paid')}>Mark as Paid</button>
)}
```

#### Database writes per action (`handleAction`)

| Action | Update written to `daily_roster` |
|---|---|
| `submit` | `{ ico_status: 'submitted', submitted_by, submitted_date }` |
| `ico_approve` | `{ ico_status: 'ico_approved', ico_approved_by, ico_approval_date }` |
| `ico_reject` | `{ ico_status: 'ico_rejected', ico_approved_by, ico_approval_date, notes: comment }` |
| `md_approve` | `{ md_status: 'approved', md_approved_by, md_approval_date }` |
| `md_reject` | `{ md_status: 'rejected', md_approved_by, md_approval_date, notes: comment }` |
| `mark_paid` | `{ payment_status: 'paid' }` |

Deletion of an approved roster also writes to `audit_log`.

**Supabase tables:** `daily_roster`, `daily_roster_entries`, `audit_log`

---

### Tab 3 — Truck Loading (`TruckLoadingTab`)

Three sub-tabs: **Assignments**, **Loading Log**, **Weekly Summary**

#### Assignments sub-tab

- Shows all active loader-to-vehicle assignments
- `+ Assign Loader` button visible to all roles (no explicit guard inside `TruckLoadingTab`)
- `Remove` button on each assignment — no role guard

#### Loading Log sub-tab

- Shows all `truck_loading_log` entries in a table — no role guard on visibility
- `+ Record Loading` button — no role guard (all roles who see the tab can click it)

#### Weekly Summary sub-tab (`LoadingWeeklySummary`)

- Groups all logs by `payment_week_ending`
- `canSubmit` check controls "Submit for Approval" button:
  ```js
  const canSubmit = ['production_manager', 'hr_officer', 'accountant', 'logistics_manager', 'md']
    .includes(userProfile?.role)
  ```
  ICO is **not** in this list — ICO approves loading payroll in the Payroll tab, not here.
- Clicking "Submit for Approval" inserts a `weekly_labour_payroll` record with `payroll_type: 'loading'`, `status: 'draft'`

**Supabase tables:** `vehicles`, `truck_loader_assignments`, `truck_loading_log`, `truck_loading_loaders`, `waybills`

---

### Tab 4 — Payroll (`WeeklyPayrollTab`)

Shows production and loading payroll aggregated from roster entries and loading logs for a chosen week.

#### Role checks

```jsx
{/* Generate payroll — PM, HR Officer, MD */}
{!currentPayroll && workers.length > 0 &&
 ['production_manager','hr_officer','md'].includes(userProfile?.role) && (
  <button onClick={handleGeneratePayroll}>Generate Payroll</button>
)}

{/* ICO approve — ICO only, when status is 'draft' */}
{currentPayroll?.status === 'draft' && userProfile?.role === 'ico' && (
  <button data-ico-allow onClick={() => handlePayrollAction('ico_approve')}>ICO Approve</button>
)}

{/* MD approve — MD only, after ICO approval */}
{currentPayroll?.status === 'ico_approved' && userProfile?.role === 'md' && (
  <button onClick={() => handlePayrollAction('md_approve')}>MD Approve</button>
)}

{/* Mark paid + create expense — Accountant only, after MD approval */}
{currentPayroll?.status === 'md_approved' && userProfile?.role === 'accountant' && (
  <button onClick={() => handlePayrollAction('mark_paid')}>Mark as Paid + Create Expense</button>
)}

{/* Download PDF — all roles, when paid */}
{currentPayroll?.status === 'paid' && (
  <button onClick={() => generatePayrollPDF(...)}>Download PDF</button>
)}
```

#### Database writes per action (`handlePayrollAction`)

| Action | Update written to `weekly_labour_payroll` | Side effect |
|---|---|---|
| `ico_approve` | `{ status: 'ico_approved', ico_approved_by: userProfile?.full_name }` | — |
| `md_approve` | `{ status: 'md_approved', md_approved_by: userProfile?.full_name }` | — |
| `mark_paid` | `{ status: 'paid', payment_date: today }` | Inserts row into `expenses` via `getOrCreateCategory('Labour Wages')` |

**Supabase tables:** `daily_roster`, `daily_roster_entries`, `truck_loading_log`, `truck_loading_loaders`, `weekly_labour_payroll`, `expense_categories`, `expenses`

---

### Tab 5 — Monthly Fixed (`MonthlyFixedTab`)

Handles payroll for monthly-fixed workers (salary-based). Also displays rental vehicles as deferred payments.

#### Role checks

```jsx
{/* ICO approve */}
{existingPayroll?.status === 'draft' && userProfile?.role === 'ico' && (
  <button data-ico-allow onClick={() => handleAction('ico_approve')}>ICO Approve</button>
)}

{/* MD approve */}
{existingPayroll?.status === 'ico_approved' && userProfile?.role === 'md' && (
  <button onClick={() => handleAction('md_approve')}>MD Approve</button>
)}

{/* Mark paid + create expense — Accountant */}
{existingPayroll?.status === 'md_approved' && userProfile?.role === 'accountant' && (
  <button onClick={() => handleAction('mark_paid')}>Mark as Paid + Create Expense</button>
)}
```

**Supabase tables:** `labour_pool`, `weekly_labour_payroll`, `vehicles` (rental vehicles), `expense_categories`, `expenses`

---

### Tab 6 — Labour Rates (`LabourRatesTab`)

Shows current rates for all active labour roles. Supports rate-change proposals through an approval workflow.

#### Role checks

| Condition | Effect |
|---|---|
| `userProfile?.role === 'production_manager'` | Shows `Propose Rate Change` form |
| `userProfile?.role === 'ico' && req.overall_status === 'pending'` | Shows `ICO Approve` / `ICO Reject` buttons on pending requests |
| `userProfile?.role === 'md' && req.overall_status === 'md_review'` | Shows `MD Approve` / `MD Reject` buttons |

Rate change approval writes to `labour_rate_change_requests`. If `md_approve` is triggered, the `labour_roles` table is updated with the new `base_rate` and `target_bonus`.

**Supabase tables:** `labour_roles`, `labour_rate_change_requests`

---

## 8. Other Page-Level Components

Components that receive no `userProfile` prop have **no internal role checks** — access is controlled entirely by ROLE_PAGES. All actions are available to any role that can reach the page.

| Component | Receives userProfile | Internal role checks |
|---|---|---|
| `Dashboard` | ✓ | Minimal (rendering differs for board_member) |
| `BoardDashboard` | ✓ | Board-only component, no internal checks needed |
| `Production` | — | None |
| `Inventory` | — | None |
| `Batches` | — | None |
| `VehicleRegistry` | — | None |
| `Staff` | — | None |
| `Customers` | ✓ | Marketer sees only own customers |
| `PendingDeliveryRegister` | — | None |
| `DailySchedule` | — | None |
| `LPOApprovals` | — | None |
| `ScheduleApprovals` | — | None |
| `Reports` | ✓ | Passed through for report history tracking |
| `KPIDashboard` | — | None |
| `Products` | — | None |
| `SupplierRegistry` | — | None |
| `Accounting` | ✓ | Passed through; internal checks not documented |
| `DataImport` | — | None (access gated by ROLE_PAGES: only md + accountant) |
| `UserManagement` | ✓ | MD-only page (not in any other ROLE_PAGES array) |
| `MyProfile` | ✓ | Always accessible; user edits own profile |

---

## 9. Approval Workflows

### Daily Roster

```
Production Manager / HR Officer
  → Creates roster (status: draft)
  → Submits for ICO review (status: submitted)
ICO
  → Approves (status: ico_approved) or Rejects (status: ico_rejected → PM re-submits)
MD
  → Approves (md_status: approved) or Rejects (md_status: rejected)
Accountant
  → Marks as Paid (payment_status: paid)
```

Tables: `daily_roster`, `daily_roster_entries`

---

### Weekly Labour Payroll (Production & Loading)

```
Production Manager / HR Officer / MD
  → Generates payroll record (status: draft)
ICO
  → ICO Approve → sets ico_approved_by (status: ico_approved)
MD
  → MD Approve (status: md_approved)
Accountant
  → Mark as Paid + Create Expense
      → updates weekly_labour_payroll (status: paid, payment_date)
      → inserts into expenses (category: Labour Wages)
All roles (when paid)
  → Download PDF
```

Tables: `weekly_labour_payroll`, `expenses`, `expense_categories`

---

### Monthly Fixed Payroll

Same approval chain as Weekly Payroll:

```
System / HR
  → Generate (status: draft)
ICO → MD → Accountant (mark paid + expense)
```

Tables: `weekly_labour_payroll`, `expenses`, `expense_categories`

---

### Labour Rate Changes

```
Production Manager
  → Proposes rate change (overall_status: pending, ico_status: pending, md_status: pending)
ICO
  → ICO Approve → (ico_status: approved, overall_status: md_review)
  → ICO Reject  → (ico_status: rejected, overall_status: rejected)
MD
  → MD Approve → applies new rate to labour_roles (base_rate, target_bonus)
                  overall_status: approved
  → MD Reject  → overall_status: rejected
```

Tables: `labour_rate_change_requests`, `labour_roles`

---

### Orders / Invoice Workflow

```
BDM / MD / Marketer / Sales
  → Creates order
BDM / MD (LPO orders)
  → Attaches LPO document → MD approves
Accountant / MD / BDM / ICO (view-only)
  → Generates invoice → Downloads invoice PDF
Accountant / MD
  → Records payments → Confirms payment status
```

---

## 10. Supabase Tables by Feature

### Auth & Profiles

| Table | Used by | Key columns |
|---|---|---|
| `auth.users` | Supabase Auth | `id`, `email` |
| `user_profiles` | All components via `userProfile` | `id`, `email`, `full_name`, `role`, `staff_id`, `is_active` |
| `app_roles` | UserManagement | `id`, `display_name`, `description`, `is_system_role` |

### Orders & Invoicing

| Table | Used by | Key columns |
|---|---|---|
| `orders` | Orders | `id`, `customer_id`, `site_id`, `marketer_id`, `status`, `is_lpo`, `lpo_document_url` |
| `order_items` | Orders | `order_id`, `block_type`, `quantity`, `unit_price` |
| `invoices` | Orders | `order_id`, `invoice_number`, `generated_at` |
| `payments` | Orders | `order_id`, `invoice_id`, `amount_paid`, `payment_date`, `status` |
| `customers` | Orders, Customers | `id`, `name`, `phone`, `location`, `added_by` |
| `customer_sites` | Orders | `customer_id`, `site_name`, `site_location` |

### Waybills & Deliveries

| Table | Used by | Key columns |
|---|---|---|
| `waybills` | Waybills, TruckLoadingTab | `id`, `waybill_number`, `waybill_date`, `vehicle_id`, `driver_id`, `block_type`, `quantity_loaded`, `quantity_received`, `quantity_damaged`, `order_id`, `schedule_item_id` |
| `delivery_schedule_items` | Waybills | `id`, `block_type`, `qty_scheduled`, `customer_id` |
| `damage_log` | Waybills | `waybill_id`, `quantity_damaged`, `damage_type` |

### Vehicles

| Table | Used by | Key columns |
|---|---|---|
| `vehicles` | VehicleRegistry, Waybills, Labour | `id`, `vehicle_number`, `vehicle_name`, `vehicle_type`, `assigned_driver_id`, `monthly_rental_amount`, `owner_name`, `owner_phone` |
| `vehicle_maintenance` | VehicleRegistry | `vehicle_id`, `supplier_id` |

### Production & Inventory

| Table | Used by | Key columns |
|---|---|---|
| `production_log` | Production | `date`, `block_type`, `quantity_produced`, `shift`, `notes` |
| `production_targets` | Production | `target_date`, `block_type`, `target_quantity`, `set_by` |
| `batches` | Batches, Waybills | `id`, `batch_number`, `block_type`, `qty_remaining` |
| `finished_goods` | Waybills, Inventory | `block_type`, `quantity` |
| `inventory_log` | Inventory | `block_type`, `movement_type`, `quantity`, `reference` |

### Labour

| Table | Used by | Key columns |
|---|---|---|
| `labour_pool` | All Labour tabs | `id`, `full_name`, `labour_number`, `category`, `is_active`, `bank_name`, `bank_account_number` |
| `labour_roles` | Labour tabs, Rates | `id`, `role_name`, `base_rate`, `target_bonus`, `is_active` |
| `labour_rate_change_requests` | Rates tab | `role_id`, `proposed_rate`, `ico_status`, `md_status`, `overall_status` |
| `daily_roster` | Roster tab | `id`, `roster_date`, `ico_status`, `md_status`, `payment_status`, `ico_approved_by`, `payment_week_ending` |
| `daily_roster_entries` | Roster tab | `roster_id`, `labour_id`, `role_id`, `base_rate`, `attendance_type`, `bonus_amount`, `advance_amount`, `deduction_amount`, `net_pay` |
| `truck_loader_assignments` | Truck Loading | `vehicle_id`, `labour_id`, `assigned_date`, `is_active` |
| `truck_loading_log` | Truck Loading | `id`, `waybill_id`, `blocks_loaded`, `rate_per_block`, `total_amount`, `payment_week_ending`, `payment_status`, `ico_approved_by` |
| `truck_loading_loaders` | Truck Loading | `loading_log_id`, `labour_id` |
| `weekly_labour_payroll` | Payroll, Monthly tabs | `id`, `week_ending`, `payroll_type`, `total_amount`, `status`, `ico_approved_by`, `md_approved_by` |

### Financial

| Table | Used by | Key columns |
|---|---|---|
| `expenses` | Payroll (auto-create), Expenses page | `id`, `category_id`, `description`, `amount`, `expense_date`, `status`, `vendor`, `supplier_id` |
| `expense_categories` | Expenses, Payroll | `id`, `name` |
| `opening_balances` | Accounting | `category`, `sub_category`, `account_name`, `amount`, `depreciation_amount` |
| `opening_balance_history` | Accounting | `opening_balance_id`, `old_amount`, `new_amount`, `changed_by` |
| `financial_adjustments` | Accounting | `statement_type`, `account_name`, `amount`, `adjustment_date` |
| `income_records` | Accounting | — |

### Staff & HR

| Table | Used by | Key columns |
|---|---|---|
| `staff` | Staff, Waybills | `id`, `full_name`, `role`, `role_id` |
| `staff_roles` | Staff | `id`, `role_name` |

### Suppliers & LPO

| Table | Used by | Key columns |
|---|---|---|
| `suppliers` | SupplierRegistry, Expenses | `id`, `name`, `contact` |
| `lpo_requests` | LPOApprovals | `id`, `status`, `lpo_document_url` |

### System

| Table | Used by | Key columns |
|---|---|---|
| `import_batches` | DataImport | `id`, `import_type`, `status`, `record_count`, `imported_by` |
| `import_staging_rows` | DataImport | `batch_id`, `row_data`, `mapped_data`, `status`, `error_message` |
| `report_history` | Reports | `report_name`, `generated_by`, `generated_at`, `format`, `filters` |
| `audit_log` | Roster delete | `action`, `entity`, `entity_id`, `performed_by`, `reason` |
| `products` | Products | `id`, `name`, `unit`, `category` |

---

*Generated: 2026-06-05*
