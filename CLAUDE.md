# CLAUDE.md — Abuja Precast Concrete Operations Dashboard

## Project Overview

**APC Manager** is an internal operations management dashboard for **Abuja Precast Concrete Limited** (RC: 1838184). It covers production, sales, logistics, finance, HR, and reporting for a precast concrete block factory in Abuja, Nigeria.

- **Framework**: React 18 + Vite 5
- **Backend**: Supabase (PostgreSQL + Auth)
- **Deployment**: Vercel (SPA)
- **Currency**: Nigerian Naira (₦)

---

## Development Commands

```bash
npm run dev          # Vite dev server at http://localhost:5173
npm run build        # Production build (outputs to dist/)
npm run preview      # Preview production build locally
npm test             # Vitest (watch mode)
npm run test:ui      # Vitest browser UI
npm run test:coverage # V8 coverage report
```

---

## Environment Variables

Copy `.env.example` to `.env` and fill in Supabase credentials:

```
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

If these are absent the app starts in offline/demo mode (`src/lib/supabase.js` falls back to placeholder values and logs a console warning).

---

## Repository Structure

```
src/
├── App.jsx                   # Root component — routing, shared state, page rendering
├── main.jsx                  # React entry point
├── lib/
│   └── supabase.js           # Supabase client singleton
├── components/               # Extracted page-level components
│   ├── LoginScreen.jsx
│   ├── BoardDashboard.jsx
│   ├── FinancialStatements.jsx
│   ├── KPIDashboard.jsx
│   ├── Labour.jsx
│   ├── OpeningBalances.jsx
│   ├── Reports.jsx           # 33-report engine (PDF + Excel)
│   ├── StaffHR.jsx
│   ├── SupplierRegistry.jsx
│   └── VehicleRegistry.jsx
├── services/                 # Supabase data-access layer (one file per domain)
│   ├── authService.js
│   ├── accounting.js
│   ├── attendance.js
│   ├── bank.js
│   ├── batches.js
│   ├── deliveries.js
│   ├── financialService.js
│   ├── finishedGoods.js
│   ├── hrService.js
│   ├── inventory.js
│   ├── labour.js
│   ├── lpo.js
│   ├── orders.js
│   ├── payments.js
│   ├── pendingDelivery.js
│   ├── production.js
│   ├── products.js
│   ├── schedules.js
│   ├── staff.js
│   ├── suppliers.js
│   └── vehicles.js
├── utils/                    # PDF generation (one file per document type)
│   ├── generateInvoicePDF.js
│   ├── generateWaybillPDF.js
│   ├── generateStatementPDF.js
│   ├── generateReceivablesPDF.js
│   ├── generatePLStatementPDF.js
│   ├── generatePayrollPDF.js
│   ├── generatePaymentReceiptPDF.js
│   ├── generateManagementAccountsPDF.js
│   ├── generateInventoryReportPDF.js
│   ├── generateCustomerWaybillsPDF.js
│   ├── generateCostAnalysisPDF.js
│   ├── generateReconciliationPDF.js
│   └── parseBankStatement.js
└── test/
    └── setup.js              # Imports @testing-library/jest-dom

supabase/                     # SQL migration files (run manually in Supabase SQL editor)
├── schema.sql                # Base schema
├── MASTER_DEPLOYMENT.sql     # Idempotent deployment script (run this first)
└── *.sql                     # Incremental migrations
```

---

## Architecture Patterns

### App.jsx — Monolith Root

`App.jsx` is intentionally large. It owns:
- All shared React state (auth session, loaded data arrays, modal state)
- The `theme` and `styles` objects used by every inline-styled element
- Application constants: `BLOCK_TYPES`, `ABUJA_AREAS`, `ROLES`, `APP_ROLES`, `ROLE_PAGES`
- Helper components: `Spinner`, `Alert`, `InvoiceEditorModal`
- Navigation logic and page dispatch

When adding a new top-level page, register it here: add a nav entry, update `ROLE_PAGES`, and render the component inside the main content area.

### Service Layer Pattern

Every service module exports one or more named service objects with async methods. **All methods throw on error — never return `{ data, error }` to callers.**

```js
// Correct pattern (every service follows this)
export const ordersService = {
  async getAll() {
    const { data, error } = await supabase.from('orders').select('...')
    if (error) throw error
    return data        // callers get clean data or a thrown error
  },
}
```

Supabase joins use PostgREST syntax (`select('*, customer:customer_id(*)')`). Always chain `.select()` after `.insert()` / `.upsert()` when you need the returned row.

### Theming and Styling

All styling is inline. The `theme` object holds colour tokens; `styles` holds reusable style factories. There is no CSS file or CSS-in-JS library.

```js
const theme = {
  bg: "#0f1117", surface: "#1a1d27", card: "#21263a", border: "#2e3452",
  accent: "#f5a623",   // orange — primary action
  green: "#2dd4a0", red: "#f06b6b", blue: "#5b8dee",
  text: "#e8eaf0", textMuted: "#7c839e", textDim: "#4a5175",
}
```

Each extracted component defines its own local copy of `theme` and `styles` — do not import them from `App.jsx`.

### Currency and Number Formatting

```js
const fmt   = (n) => (n || 0).toLocaleString()           // "1,234,567"
const naira = (n) => `₦${fmt(n)}`                        // "₦1,234,567"
```

`Reports.jsx` uses a stricter variant: `toLocaleString('en-NG', { minimumFractionDigits: 2 })`.

---

## Role-Based Access Control

Roles are defined in `APP_ROLES` and their page permissions in `ROLE_PAGES` (both in `App.jsx`):

| Role | Access |
|---|---|
| `md` | All pages |
| `ico` | All pages |
| `accountant` | dashboard, reports, kpi_dashboard, accounting, opening_balances, labour |
| `board_member` | dashboard only |
| `bdm` | dashboard, customers, orders, pending_register, daily_schedule, reports, kpi_dashboard |
| `store_officer` | dashboard, inventory, batches, waybills, vehicles, daily_schedule, products |
| `logistics_manager` | dashboard, waybills, vehicles, pending_register, daily_schedule, customers, labour |
| `marketer` | dashboard, customers, orders, products |
| `driver` | dashboard, waybills |
| `hr_officer` | dashboard, staff, reports, labour |
| `production_manager` | dashboard, production, inventory, batches, reports, products, labour |

When adding a new page, add its key to every relevant role's array in `ROLE_PAGES`.

User sessions are managed by Supabase Auth. The profile row in `user_profiles` holds `role` and `is_active`. `authService.createUser()` uses a separate temporary Supabase client (no `persistSession`) so creating a new user does not log the MD out.

---

## Database Schema (Key Tables)

| Table | Purpose |
|---|---|
| `staff` | Permanent and daily staff; holds `staff_type`, `role`, `daily_rate`, `monthly_salary` |
| `attendance` | Daily attendance; unique on `(staff_id, date)` |
| `production_log` | Daily block production; tracks material usage per batch |
| `customers` | Customer master; may have multiple `customer_sites` |
| `orders` | Sales orders; status enum: pending → invoiced → in_progress → completed / cancelled |
| `order_items` | Line items with computed `subtotal` column |
| `invoices` | One per order; `invoice_number` is unique |
| `payments` | Payments against an invoice |
| `waybills` | Delivery notes; one per trip |
| `deliveries` | Delivery events linked to orders |
| `damage_log` | Damaged/broken block records |
| `inventory` | Raw material stock (cement, granite dust, diesel, sand) |
| `batches` | Production batch records |
| `finished_goods` | Blocks ready for sale, by type and location |
| `bank_accounts` | Company bank accounts |
| `bank_transactions` | Imported bank statement lines |
| `bank_reconciliations` | Reconciliation sessions |
| `expense_categories` | Chart of accounts for expenses |
| `expenses` | Expense records |
| `income_records` | Non-order income (misc) |
| `opening_balances` | Balance sheet opening entries (asset/liability/equity) |
| `vehicles` | Company vehicles |
| `fuel_log` | Fuel usage per vehicle |
| `suppliers` | Supplier master |
| `supplier_transactions` | LPO and payments to suppliers |
| `user_profiles` | App users — links `auth.users` → `role` → `app_roles` |
| `app_roles` | Role registry seeded from `MASTER_DEPLOYMENT.sql` |

**Block types** (canonical names post-migration):
- `9 Inch 3 Hole Block`
- `6 Inch Block`
- `4 Inch Block`
- `Standard Interlock`
- `Standard Kerb Stone`
- `Garden Kerb`

---

## PDF Generation

All PDF utilities in `src/utils/` use **jsPDF** (A4 portrait, mm units) + **jspdf-autotable** for tables. Each generator is an async function: `generateXxxPDF(data, ...) => void` — it calls `doc.save()` internally.

The company header block is standardised across all PDFs:
- Logo from `/logo.png` (public directory); gracefully skipped if fetch fails
- Company name: **Abuja Precast Concrete Limited**
- Address: 1, Dutse Alhaji, Behind Tipper Garage, Off Bwari Expressway, Abuja
- Phone: +234 905 554 4433
- Email: abujaprecastconcreteltd@gmail.com
- RC: 1838184

When adding a new document type, follow the existing pattern: create `src/utils/generateXxxPDF.js`, import it in the caller, and register the report in `Reports.jsx`'s `CATALOG` array if it should appear in the Reports engine.

---

## Reports Engine (`src/components/Reports.jsx`)

Contains 33 reports across 8 categories: production, sales, customer, delivery, staff, inventory, vehicle, financial.

Each catalog entry defines:
```js
{ id, name, category, description, formats: ['pdf','excel'], roles: [...], periodType: 'date'|'week'|'month'|'range' }
```

Role filtering hides reports the current user's role is not listed in. Period type controls which date picker is shown.

---

## Bank Statement Import (`src/utils/parseBankStatement.js`)

Supports **CSV** (PapaParse), **Excel/XLSX**, and **PDF** (pdfjs-dist) bank statement formats. Handles Nigerian date formats (DD/MM/YYYY, DD-Mon-YYYY, Excel serials). Key exports:

- `parseFile(file)` — returns `{ headers, rows }`
- `autoMapColumns(headers)` — guesses date/debit/credit/description columns
- `mapRowsToTransactions(rows, mapping)` — normalises to `{ transaction_date, debit, credit, description }`
- `autoMatchTransactions(txs, invoices, payments)` — fuzzy-matches bank lines to existing records
- `detectCategory(description)` — categorises a transaction from its description
- `extractCustomerFromDesc(description, customers)` — looks up a customer from a bank line

---

## Testing

**Framework**: Vitest + React Testing Library + jsdom  
**Setup file**: `src/test/setup.js` (imports `@testing-library/jest-dom`)

Test files should be co-located with the code they test or placed in a `__tests__` subdirectory. The coverage report excludes `node_modules/` and `src/test/`.

Current test coverage is 0% — the codebase is primarily tested manually. `TEST_COVERAGE_ANALYSIS.md` documents the recommended approach to adding tests incrementally.

When mocking Supabase in tests, mock `src/lib/supabase.js`:
```js
vi.mock('../lib/supabase', () => ({
  supabase: { from: vi.fn(() => ({ select: vi.fn(), ... })) }
}))
```

---

## Deployment

Hosted on **Vercel**. `vercel.json` rewrites all routes to `/index.html` for SPA routing:
```json
{ "rewrites": [{ "source": "/(.*)", "destination": "/" }] }
```

Build: `npm run build` → `dist/` directory. No server-side rendering.

### Database Migrations

SQL scripts in `supabase/` are run manually in the Supabase SQL Editor. `MASTER_DEPLOYMENT.sql` is the idempotent master script (safe to re-run). Run it when setting up a new project. Incremental migrations are in the other `.sql` files and should be applied in chronological order.

---

## Key Conventions

1. **Service errors bubble up** — services throw, components catch and `setError(e.message)`.
2. **No CSS files** — all styling is inline using the local `theme`/`styles` objects.
3. **Each component defines its own theme copy** — do not import theme from App.
4. **Supabase queries always chain `.select()` after mutations** when the returned row is needed.
5. **UUIDs everywhere** — all primary keys are `uuid` generated by `gen_random_uuid()`.
6. **Nigerian locale** — dates display as `DD Mon YYYY` (en-GB locale), currency as `₦1,234,567`.
7. **Block types are strings** — use the exact canonical names listed above; check constraints enforce them.
8. **`prop-types` is disabled** in ESLint — no need to add PropTypes declarations.
9. **`type: "module"`** — the project uses ES modules throughout; avoid `require()`.
10. **Git branch**: feature work goes to `claude/claude-md-docs-DuPky`; push to `origin` with `-u`.
