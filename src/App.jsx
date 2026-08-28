import { useState, useEffect, Component } from "react";
import { supabase } from './lib/supabase';
import { authService } from './services/authService';
import { hasRole, effectiveRolesOf } from './lib/roles';
import LoginScreen from './components/LoginScreen';
import BoardDashboard from './components/BoardDashboard';
import FinancialStatements from './components/FinancialStatements';
import OpeningBalances from './components/OpeningBalances';
import { productionService } from './services/production';
import { staffService } from './services/staff';
import Staff from './components/StaffHR';
import { ordersService, customersService, customerSitesService } from './services/orders';
import { waybillsService } from './services/deliveries';
import { invoicesService, paymentsService, orderPaymentsService } from './services/payments';
import { inventoryService } from './services/inventory';
import { lpoService } from './services/lpo';
import { pendingDeliveryService } from './services/pendingDelivery';
import { schedulesService } from './services/schedules';
import { batchesService } from './services/batches';
import { finishedGoodsService } from './services/finishedGoods';
import { generateInvoicePDF } from './utils/generateInvoicePDF';
import ReportsEngine from './components/Reports';
import { generateStatementPDF } from './utils/generateStatementPDF';
import { generateInventoryReportPDF } from './utils/generateInventoryReportPDF';
import { generateWaybillPDF } from './utils/generateWaybillPDF';
import { generateCustomerWaybillsPDF } from './utils/generateCustomerWaybillsPDF';
import { productsService } from './services/products'
import { expenseCategoriesService, expensesService, incomeRecordsService, accountingService } from './services/accounting'
import { generatePLStatementPDF } from './utils/generatePLStatementPDF'
import { generateReceivablesPDF } from './utils/generateReceivablesPDF'
import { generateCostAnalysisPDF } from './utils/generateCostAnalysisPDF'
import { generateManagementAccountsPDF } from './utils/generateManagementAccountsPDF'
import { bankAccountsService, bankTransactionsService, bankImportBatchesService, bankReconciliationsService, receiptsService } from './services/bank'
import { generateReconciliationPDF } from './utils/generateReconciliationPDF'
import { generatePaymentReceiptPDF } from './utils/generatePaymentReceiptPDF'
import { parseFile, autoMapColumns, mapRowsToTransactions, autoMatchTransactions, detectCategory, extractCustomerFromDesc, extractStatementSummary, extractPRReference } from './utils/parseBankStatement';
import VehicleRegistry from './components/VehicleRegistry'
import KPIDashboard from './components/KPIDashboard'
import DataImport from './components/DataImport'
import { vehiclesService, fuelLogService } from './services/vehicles'
import SupplierRegistry from './components/SupplierRegistry'
import { suppliersService, supplierTransactionsService } from './services/suppliers'
import Labour, { getLastSaturday, shiftWeek, shiftDays } from './components/Labour'
import Maintenance from './components/Maintenance'
import Messages from './components/Messages'
import { messagesService } from './services/messages'
import NotificationBell from './components/NotificationBell'
import MessagesBell from './components/MessagesBell'
import { advancesService } from './services/advances'
import { paymentRequestsService } from './services/paymentRequests'
import { truckLoadingService, labourPoolService } from './services/labour'
import { leaveService } from './services/leave'
import { leaveBalanceService } from './services/leaveBalance'
import { meService } from './services/me'
import { disciplinaryService } from './services/disciplinary'
import { kioskService } from './services/kioskService'
import AttendanceKiosk from './components/AttendanceKiosk'
import { photoService } from './services/hrService'
import { generateIDCardPDF, generateBusinessCardPDF } from './utils/cardGenerator'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

const theme = {
  bg: "#0f1117", surface: "#1a1d27", card: "#21263a", border: "#2e3452",
  accent: "#f5a623", accentDim: "#c47d0e", green: "#2dd4a0", red: "#f06b6b",
  blue: "#5b8dee", text: "#e8eaf0", textMuted: "#7c839e", textDim: "#4a5175",
};

const styles = {
  app: { minHeight: "100vh", background: theme.bg, color: theme.text, fontFamily: "'DM Sans','Segoe UI',sans-serif", display: "flex" },
  sidebar: { width: "240px", minHeight: "100vh", background: theme.surface, borderRight: `1px solid ${theme.border}`, display: "flex", flexDirection: "column", position: "fixed", top: 0, left: 0, bottom: 0 },
  logo: { padding: "20px 20px 16px", borderBottom: `1px solid ${theme.border}` },
  logoTitle: { fontSize: "12px", fontWeight: "700", color: theme.accent, letterSpacing: "0.06em", textTransform: "uppercase", lineHeight: "1.3" },
  logoSub: { fontSize: "10.5px", color: theme.textMuted, marginTop: "3px", lineHeight: "1.4" },
  nav: { padding: "12px 0", flex: 1, overflowY: "auto" },
  navSection: { padding: "8px 20px 4px", fontSize: "10px", fontWeight: "700", color: theme.textDim, letterSpacing: "0.12em", textTransform: "uppercase" },
  navItem: (active) => ({ display: "flex", alignItems: "center", gap: "10px", padding: "9px 20px", fontSize: "13.5px", fontWeight: active ? "600" : "400", color: active ? theme.accent : theme.textMuted, background: active ? "rgba(245,166,35,0.08)" : "transparent", borderLeft: active ? `3px solid ${theme.accent}` : "3px solid transparent", cursor: "pointer", transition: "all 0.15s" }),
  main: { marginLeft: "240px", flex: 1, padding: "28px 32px", minHeight: "100vh" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "28px" },
  pageTitle: { fontSize: "22px", fontWeight: "700", color: theme.text },
  pageSubtitle: { fontSize: "13px", color: theme.textMuted, marginTop: "3px" },
  badge: (color) => ({ display: "inline-block", padding: "3px 10px", borderRadius: "20px", fontSize: "11px", fontWeight: "600", background: color + "22", color, border: `1px solid ${color}44` }),
  grid: (cols) => ({ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: "16px", marginBottom: "24px" }),
  card: { background: theme.card, border: `1px solid ${theme.border}`, borderRadius: "12px", padding: "20px" },
  statCard: (accent) => ({ background: theme.card, border: `1px solid ${theme.border}`, borderRadius: "12px", padding: "20px", borderTop: `3px solid ${accent}` }),
  statLabel: { fontSize: "11px", fontWeight: "700", color: theme.textMuted, letterSpacing: "0.08em", textTransform: "uppercase" },
  statValue: { fontSize: "26px", fontWeight: "700", color: theme.text, marginTop: "6px" },
  statSub: { fontSize: "12px", color: theme.textMuted, marginTop: "4px" },
  table: { width: "100%", borderCollapse: "collapse", fontSize: "13px" },
  th: { textAlign: "left", padding: "10px 14px", fontSize: "11px", fontWeight: "700", color: theme.textMuted, letterSpacing: "0.06em", textTransform: "uppercase", borderBottom: `1px solid ${theme.border}` },
  td: { padding: "12px 14px", borderBottom: `1px solid ${theme.border}22`, color: theme.text },
  sectionTitle: { fontSize: "14px", fontWeight: "700", color: theme.text, marginBottom: "14px" },
  btn: (variant) => ({ padding: "8px 18px", borderRadius: "8px", fontSize: "13px", fontWeight: "600", cursor: "pointer", border: variant === "secondary" ? `1px solid ${theme.border}` : "none", background: variant === "primary" ? theme.accent : variant === "danger" ? theme.red : theme.surface, color: variant === "primary" ? "#000" : variant === "danger" ? "#fff" : theme.textMuted }),
  input: { background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: "8px", padding: "9px 12px", fontSize: "13px", color: theme.text, width: "100%", outline: "none" },
  label: { fontSize: "12px", fontWeight: "600", color: theme.textMuted, marginBottom: "5px", display: "block" },
  formGroup: { marginBottom: "14px" },
  row: { display: "flex", gap: "12px" },
  progressBar: () => ({ height: "6px", background: theme.border, borderRadius: "3px", overflow: "hidden", marginTop: "8px" }),
  progressFill: (pct, color) => ({ height: "100%", width: `${Math.min(pct, 100)}%`, background: color, borderRadius: "3px", transition: "width 0.4s ease" }),
  alert: (type) => ({ padding: "10px 14px", borderRadius: "8px", marginBottom: "16px", background: (type === "success" ? theme.green : theme.red) + "22", border: `1px solid ${(type === "success" ? theme.green : theme.red)}44`, color: type === "success" ? theme.green : theme.red, fontSize: "13px", display: "flex", justifyContent: "space-between", alignItems: "center" }),
};

const BLOCK_TYPES = ["9 Inch 3 Hole Block", "6 Inch Block", "4 Inch Block", "Standard Interlock", "Standard Kerb Stone", "Garden Kerb"];
const ABUJA_AREAS = [
  "Katampe","Maitama","Gwarinpa","Kubwa","Karsana","Lugbe","Jahi",
  "Lifecamp","Galadimawa","Apo","Wuse","Wuse 2","Asokoro","Garki",
  "Central Area","Dutse","Bwari","Gwagwalada","Kuje","Abaji","Kwali",
];
const ROLES = ["Driver", "Labourer", "Marketer", "Supervisor", "Other"];
const HOW_HEARD = [
  { value: "referral", label: "Referral" },
  { value: "social_media", label: "Social Media" },
  { value: "drive_by", label: "Drive-By" },
  { value: "marketer", label: "Brought by Marketer" },
];
const fmt = (n) => (n || 0).toLocaleString();
const naira = (n) => `₦${fmt(n)}`;

const APP_ROLES = [
  { id: 'md',                 label: 'MD (Managing Director)' },
  { id: 'accountant',         label: 'Accountant' },
  { id: 'board_member',       label: 'Board Member' },
  { id: 'bdm',                label: 'Business Development Manager' },
  { id: 'ico',                label: 'Internal Control Officer' },
  { id: 'store_officer',      label: 'Store Officer' },
  { id: 'logistics_manager',  label: 'Logistics Manager' },
  { id: 'marketer',           label: 'Marketer' },
  { id: 'driver',             label: 'Driver' },
  { id: 'hr_officer',         label: 'HR Officer' },
  { id: 'production_manager',           label: 'Production Manager' },
  { id: 'assistant_production_manager', label: 'Assistant Production Manager' },
  { id: 'staff',                        label: 'Staff (Employee — Self-Service Only)' },
];

// Pages each role is allowed to access. 'all' = unrestricted.
const ROLE_PAGES = {
  md:                 'all',
  ico:                ['dashboard','production','inventory','batches','maintenance','waybills','vehicles','labour','truck_loading','pending_register','daily_schedule','customers','orders','lpo_approvals','schedule_approvals','reports','kpi_dashboard','accounting','suppliers','products','my_profile','advances','leave','payment_requests','messages'],
  accountant:         ['dashboard','customers','orders','reports','kpi_dashboard','accounting','suppliers','products','my_profile','data_import','labour','waybills','advances','leave','payment_requests','truck_loading','trading_margin','messages'],
  board_member:       ['dashboard','production','inventory','batches','maintenance','waybills','vehicles','labour','pending_register','daily_schedule','customers','orders','lpo_approvals','schedule_approvals','reports','kpi_dashboard','accounting','suppliers','products','my_profile','trading_margin','messages'],
  bdm:                ['dashboard','customers','orders','pending_register','daily_schedule','lpo_approvals','reports','kpi_dashboard','my_profile','payment_requests','trading_margin','messages'],
  store_officer:      ['dashboard','inventory','batches','maintenance','waybills','pending_register','daily_schedule','products','reports','my_profile','messages'],
  logistics_manager:  ['dashboard','waybills','vehicles','labour','truck_loading','maintenance','pending_register','daily_schedule','customers','my_profile','payment_requests','messages'],
  marketer:           ['dashboard','customers','orders','products','my_profile','messages'],
  driver:             ['dashboard','waybills','my_profile','messages'],
  hr_officer:         ['dashboard','staff','reports','labour','my_profile','advances','leave','disciplinary','attendance_kiosk','attendance_flags','payment_requests','messages'],
  kiosk_device:       ['attendance_kiosk'],
  production_manager:           ['dashboard','production','inventory','batches','maintenance','reports','products','labour','truck_loading','my_profile','attendance_flags','payment_requests','messages'],
  assistant_production_manager: ['dashboard','production','inventory','batches','maintenance','reports','products','labour','truck_loading','my_profile','attendance_flags','messages'],
  // legacy roles — kept for any existing users
  operations:         ['dashboard','production','inventory','batches','waybills','vehicles','pending_register','daily_schedule','lpo_approvals','my_profile'],
  sales:              ['dashboard','customers','orders','my_profile'],
  staff:              ['my_hr','my_profile','messages'],
};

// Pages where the read-only CSS mask does NOT apply — the role can fully
// interact (its landing page + self-service + the modules it approves in).
// SINGLE SOURCE for both the mask and the read-only banner. Add new fully-
// interactive pages here, in ONE place — the old inline &&-chains are how
// my_hr got missed (see BACKEND_AUDIT_PRE5.md, Category 4).
// NOTE: read-only pages where only export/nav buttons should work
// (accounting, reports, kpi_dashboard, daily_schedule) are NOT listed here —
// those buttons carry per-element data-ico-allow / data-board-allow instead,
// so write actions stay hidden.
const ICO_EXEMPT_PAGES   = ['dashboard', 'labour', 'truck_loading', 'schedule_approvals', 'advances', 'leave', 'my_hr', 'payment_requests', 'maintenance'];
const BOARD_EXEMPT_PAGES = ['dashboard', 'my_profile', 'my_hr', 'maintenance'];

// ── UI HELPERS ───────────────────────────────────────────────
const Spinner = () => (
  <div style={{ padding: "40px", textAlign: "center", color: theme.textMuted, fontSize: "13px" }}>Loading…</div>
);

const Alert = ({ msg, type = "error", onClose }) => (
  <div style={styles.alert(type)}>
    <span>{msg}</span>
    <span style={{ cursor: "pointer", marginLeft: "12px", fontWeight: "700" }} onClick={onClose}>✕</span>
  </div>
);

// Surface the invoice DB guard messages ("content is locked", "line items can
// only be changed while it is a draft") cleanly rather than a raw Postgres blob.
const cleanInvoiceError = (e) => {
  const m = e?.message || String(e || '');
  if (/content is locked/i.test(m) || /line items can only be changed/i.test(m)) {
    return m.replace(/^.*?(Invoice.*)$/s, '$1').trim() || m;
  }
  return 'Could not save the invoice. ' + m;
};

const STATUS_BADGE = {
  draft:     { label: 'Draft',     color: '#7c839e' },
  issued:    { label: 'Issued',    color: '#5b8dee' },
  paid:      { label: 'Paid',      color: '#2dd4a0' },
  cancelled: { label: 'Cancelled', color: '#f06b6b' },
};

// Invoices that count toward an order's / customer's value, paid and receivable
// figures — a draft is a quotation and a cancelled invoice is void, so both are
// excluded. Pass the invoices array (e.g. liveInvoices(order.invoices)).
const liveInvoices = (invoices) => (invoices || []).filter(inv => inv.status !== 'draft' && inv.status !== 'cancelled');

const InvoiceEditorModal = ({ editor, setEditor, onSave, saving }) => {
  // Active products power the line-item datalist (pick-or-type) and the
  // optional unit-price default. Hooks must run before the early return below.
  const [products, setProducts] = useState([]);
  useEffect(() => { productsService.getActive().then(setProducts).catch(() => {}); }, []);
  if (!editor) return null;
  const { items, delivery_cost, include_vat, discount } = editor;
  const itemSubtotal = items.reduce((s, i) => s + (Number(i.quantity) || 0) * (Number(i.unit_price) || 0), 0);
  const delivN = Number(delivery_cost) || 0;
  const discN  = Number(discount) || 0;
  const sub    = itemSubtotal + delivN;
  const afterDisc = sub - discN;
  const vat    = include_vat ? afterDisc * 0.075 : 0;
  const grand  = afterDisc + vat;
  const N = n => `₦${Math.round(Number(n) || 0).toLocaleString()}`;
  const upd = (field, val) => setEditor(e => ({ ...e, [field]: val }));
  const updItem = (idx, field, val) => setEditor(e => { const it = [...e.items]; it[idx] = { ...it[idx], [field]: val }; return { ...e, items: it }; });
  // addItem starts with an empty description — no hardcoded product default, so
  // the datalist picker below opens blank rather than pre-selecting a product.
  const addItem = () => setEditor(e => ({ ...e, items: [...e.items, { description: '', quantity: '', unit_price: '' }] }));
  const removeItem = idx => setEditor(e => ({ ...e, items: e.items.filter((_, i) => i !== idx) }));
  // Line-item product field: pick from the list OR type custom wording (native
  // datalist combobox — the same "Select or type…" pattern the product form
  // uses). The value stays in `description`, which saveItems maps to
  // invoice_items.block_type. When it matches a product with a non-zero price
  // and no price is set yet, offer that price as an editable default (prices are
  // negotiated per order; almost all products are 0, so this rarely pre-fills).
  const onDescriptionChange = (idx, val) => setEditor(e => {
    const it = [...e.items];
    const cur = it[idx];
    const prod = products.find(p => p.name === val);
    const nextPrice = (prod && Number(prod.unit_price) > 0 && !cur.unit_price) ? String(prod.unit_price) : cur.unit_price;
    it[idx] = { ...cur, description: val, unit_price: nextPrice };
    return { ...e, items: it };
  });

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 1000, overflowY: 'auto', padding: '24px 16px' }}>
      <div style={{ background: theme.card, border: `1px solid ${theme.border}`, borderRadius: '12px', width: '100%', maxWidth: '720px' }}>
        <div style={{ padding: '20px 24px', borderBottom: `1px solid ${theme.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: '16px', fontWeight: '700', color: theme.text }}>Draft Invoice Editor</div>
            <div style={{ fontSize: '11px', color: theme.textMuted, marginTop: '2px' }}>Saves as a draft (proforma). It becomes a receivable only when issued.</div>
          </div>
          <button style={{ ...styles.btn('secondary'), padding: '4px 10px' }} onClick={() => setEditor(null)}>✕ Close</button>
        </div>

        <div style={{ padding: '20px 24px' }}>
          {/* Invoice meta */}
          <div style={styles.grid(3)}>
            <div style={styles.formGroup}>
              <label style={styles.label}>Invoice Number</label>
              <input style={styles.input} value={editor.invoice_number} onChange={e => upd('invoice_number', e.target.value)} />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Issue Date</label>
              <input style={styles.input} type="date" value={editor.issued_date} onChange={e => upd('issued_date', e.target.value)} />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Due Date</label>
              <input style={styles.input} type="date" value={editor.due_date} onChange={e => upd('due_date', e.target.value)} />
            </div>
          </div>

          {/* Line items */}
          <div style={{ fontSize: '11px', fontWeight: '700', color: theme.textMuted, marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: '8px' }}>Line Items</div>
          <datalist id="invoice-line-products">
            {products.map(p => <option key={p.id} value={p.name} />)}
          </datalist>
          {items.map((item, idx) => (
            <div key={idx} style={{ display: 'flex', gap: '8px', marginBottom: '8px', alignItems: 'center' }}>
              <input list="invoice-line-products" style={{ ...styles.input, flex: 2 }} placeholder="Select or type product…" value={item.description} onChange={e => onDescriptionChange(idx, e.target.value)} />
              <input style={{ ...styles.input, flex: 1 }} type="number" placeholder="Qty" value={item.quantity} onChange={e => updItem(idx, 'quantity', e.target.value)} />
              <input style={{ ...styles.input, flex: 1 }} type="number" placeholder="Unit Price" value={item.unit_price} onChange={e => updItem(idx, 'unit_price', e.target.value)} />
              <div style={{ ...styles.input, flex: 1, background: 'transparent', color: theme.accent, fontWeight: '700', fontSize: '12px' }}>
                {item.quantity && item.unit_price ? N((Number(item.quantity) || 0) * (Number(item.unit_price) || 0)) : '—'}
              </div>
              {items.length > 1 && <button style={{ ...styles.btn('danger'), padding: '8px 10px' }} onClick={() => removeItem(idx)}>✕</button>}
            </div>
          ))}
          <button style={{ ...styles.btn('secondary'), fontSize: '12px', marginBottom: '16px' }} onClick={addItem}>+ Add Line Item</button>

          {/* Extra charges */}
          <div style={styles.grid(3)}>
            <div style={styles.formGroup}>
              <label style={styles.label}>Delivery Cost (₦)</label>
              <input style={styles.input} type="number" placeholder="0" value={editor.delivery_cost} onChange={e => upd('delivery_cost', e.target.value)} />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Discount (₦)</label>
              <input style={styles.input} type="number" placeholder="0" value={editor.discount} onChange={e => upd('discount', e.target.value)} />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>VAT</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', paddingTop: '6px' }}>
                <input type="checkbox" id="vat_toggle" checked={editor.include_vat} onChange={e => upd('include_vat', e.target.checked)} style={{ width: '16px', height: '16px', cursor: 'pointer' }} />
                <label htmlFor="vat_toggle" style={{ ...styles.label, marginBottom: 0, cursor: 'pointer' }}>Include VAT (7.5%)</label>
              </div>
            </div>
          </div>

          {/* Totals summary */}
          <div style={{ background: theme.surface, borderRadius: '8px', padding: '14px', marginTop: '8px', marginBottom: '16px' }}>
            {[
              ['Item Subtotal', N(itemSubtotal), theme.text],
              ...(delivN > 0 ? [['Delivery Cost', N(delivN), theme.text]] : []),
              ...(discN  > 0 ? [['Discount',      `-${N(discN)}`, theme.red]] : []),
              ...(include_vat ? [['VAT (7.5%)', N(vat), theme.textMuted]] : []),
            ].map(([label, val, color]) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '6px' }}>
                <span style={{ color: theme.textMuted }}>{label}</span>
                <span style={{ color }}>{val}</span>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: '700', fontSize: '15px', borderTop: `1px solid ${theme.border}`, paddingTop: '8px', marginTop: '4px' }}>
              <span>Grand Total</span>
              <span style={{ color: theme.accent }}>{N(grand)}</span>
            </div>
          </div>

          <div style={styles.row}>
            <button style={styles.btn('primary')} onClick={onSave} disabled={saving}>{saving ? 'Saving…' : 'Save Draft & Download Proforma'}</button>
            <button style={styles.btn('secondary')} onClick={() => setEditor(null)}>Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
};

const ConfirmModal = ({ msg, onConfirm, onCancel }) => (
  <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
    <div style={{ background: theme.card, border: `1px solid ${theme.border}`, borderRadius: "12px", padding: "28px 32px", maxWidth: "380px", width: "90%" }}>
      <div style={{ fontWeight: "700", fontSize: "15px", marginBottom: "10px", color: theme.text }}>Confirm Delete</div>
      <div style={{ fontSize: "13px", color: theme.textMuted, marginBottom: "24px", lineHeight: "1.5" }}>{msg}</div>
      <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
        <button style={styles.btn("secondary")} onClick={onCancel}>Cancel</button>
        <button style={styles.btn("danger")} onClick={onConfirm}>Delete</button>
      </div>
    </div>
  </div>
);

const Icon = ({ name, size = 16 }) => {
  const icons = { dashboard: "⊞", production: "🏭", orders: "📋", staff: "👥", waybill: "📄", reports: "📊", inventory: "📦", batches: "🗂", pending: "⏳", schedule: "📅", lpo: "📝", approve: "✓", settings: "⚙", products: "🧱", truck: "🚛", supplier: "🏢", maintenance: "🔧", logout: "→" };
  return <span style={{ fontSize: size }}>{icons[name] || "•"}</span>;
};

const ProductSelect = ({ value, onChange, style, showEmpty = false }) => {
  const [products, setProducts] = useState([]);
  useEffect(() => {
    productsService.getActive().then(setProducts).catch(() => {});
  }, []);
  const categories = [...new Set(products.map(p => p.category))];
  return (
    <select style={style || styles.input} value={value} onChange={e => {
      const p = products.find(pr => pr.name === e.target.value);
      onChange(e.target.value, p?.unit || "pieces");
    }}>
      {showEmpty && <option value="">— Select product —</option>}
      {value && !products.find(p => p.name === value) && <option value={value}>{value}</option>}
      {categories.length === 0 && !value && <option value="9 Inch 3 Hole Block">9 Inch 3 Hole Block</option>}
      {categories.map(cat => (
        <optgroup key={cat} label={cat}>
          {products.filter(p => p.category === cat).map(p => (
            <option key={p.id} value={p.name}>{p.name}</option>
          ))}
        </optgroup>
      ))}
    </select>
  );
};

const StatCard = ({ label, value, sub, accent, pct }) => (
  <div style={styles.statCard(accent)}>
    <div style={styles.statLabel}>{label}</div>
    <div style={styles.statValue}>{value}</div>
    {sub && <div style={styles.statSub}>{sub}</div>}
    {pct !== undefined && (
      <div style={styles.progressBar()}>
        <div style={styles.progressFill(pct, accent)} />
      </div>
    )}
  </div>
);

// ── DASHBOARD ─────────────────────────────────────────────────
const Dashboard = ({ onNavigate, userProfile }) => {
  const role = userProfile?.role || 'staff';
  const can = (...roles) => roles.includes(role);
  const isDriver = role === 'driver';

  const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
  const todayIso = new Date().toISOString().split('T')[0];
  const weekStart = (() => { const d = new Date(); d.setDate(d.getDate() - d.getDay()); return d.toISOString().split('T')[0]; })();
  const [dateRange, setDateRange] = useState({ from: firstOfMonth, to: todayIso });

  const [stats, setStats] = useState({ staff: 0, produced: 0, orders: 0, revenue: 0, pending: 0, waybills: 0, damages: 0, lpoQueue: 0, scheduleQueue: 0, pendingRegister: 0, blocksLoadedWeek: 0, activeLoadersToday: 0, pendingPayroll: 0, rosterHeadcountToday: 0 });
  const [finishedGoods, setFinishedGoods] = useState([]);
  const [recent, setRecent] = useState([]);
  const [vehicleAlerts, setVehicleAlerts] = useState([]);
  const [rentalVehicles, setRentalVehicles] = useState([]);
  const [myWaybillsToday, setMyWaybillsToday] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userProfile) return;
    const load = async () => {
      if (isDriver) {
        const staffId = userProfile?.staff_id;
        if (staffId) {
          const today = new Date().toISOString().split('T')[0];
          const waybills = await waybillsService.getAllForDriver(staffId).catch(() => []);
          setMyWaybillsToday(waybills.filter(w => w.waybill_date === today).length);
        }
        setLoading(false);
        return;
      }

      const needsStaff    = can('md', 'board_member', 'ico', 'hr_officer');
      const needsOrders   = can('md', 'board_member', 'ico', 'accountant', 'bdm', 'marketer');
      const needsWaybills = can('md', 'board_member', 'ico', 'store_officer', 'logistics_manager');

      try {
        const [staffList, productions, orders, waybills] = await Promise.all([
          needsStaff    ? staffService.getPublicList()                        : Promise.resolve([]),
          productionService.getAll({ from: dateRange.from, to: dateRange.to }),
          needsOrders   ? ordersService.getAll({ from: dateRange.from, to: dateRange.to })   : Promise.resolve([]),
          needsWaybills ? waybillsService.getAll({ from: dateRange.from, to: dateRange.to }) : Promise.resolve([]),
        ]);
        const produced = productions.reduce((s, p) => s + (p.quantity_produced || 0), 0);
        const damages  = waybills.reduce((s, w) => s + (w.quantity_damaged || 0), 0);
        const revenue  = orders.reduce((s, o) =>
          s + liveInvoices(o.invoices).flatMap(inv => inv.payments || []).filter(p => p.status === "confirmed").reduce((a, p) => a + p.amount_paid, 0), 0);
        const pending  = orders.filter(o => o.status === "pending").length;
        setStats({ staff: staffList.length, produced, orders: orders.length, revenue, pending, waybills: waybills.length, damages, lpoQueue: 0, scheduleQueue: 0, pendingRegister: 0 });
        setRecent(orders.slice(0, 5));
      } catch {
        // show zeros on error
      }

      const needsFG            = can('md', 'board_member', 'ico', 'store_officer', 'logistics_manager', 'production_manager', 'assistant_production_manager');
      const needsVehicleAlerts = can('md', 'board_member', 'ico', 'logistics_manager');
      const needsRentals       = can('md', 'ico', 'accountant', 'logistics_manager');

      try {
        const [lpos, scheds, pendReg, fg, prods, expiring, rentals] = await Promise.all([
          lpoService.getPending(),
          schedulesService.getSubmitted(),
          pendingDeliveryService.getAll(),
          needsFG            ? finishedGoodsService.getAll()                                                                                                                                                       : Promise.resolve([]),
          needsFG            ? productsService.getActive().catch(() => [])                                                                                                                                         : Promise.resolve([]),
          needsVehicleAlerts ? vehiclesService.getExpiringOrExpired(30).catch(() => [])                                                                                                                            : Promise.resolve([]),
          needsRentals       ? supabase.from('vehicles').select('id, vehicle_name, vehicle_number, monthly_rental_amount, owner_name').eq('vehicle_type', 'Rental').then(r => r.data || []).catch(() => [])        : Promise.resolve([]),
        ]);
        const productUnitMap = Object.fromEntries(prods.map(p => [p.name, p.unit]));
        setStats(s => ({ ...s, lpoQueue: lpos.length, scheduleQueue: scheds.length, pendingRegister: pendReg.length }));
        // Group by block_type in case duplicate rows exist
        const grouped = Object.values(fg.reduce((acc, f) => {
          const k = f.block_type;
          if (!acc[k]) acc[k] = { ...f, quantity_in_yard: 0 };
          acc[k].quantity_in_yard += Number(f.quantity_in_yard || 0);
          return acc;
        }, {}));
        setFinishedGoods(grouped.map(f => ({ ...f, unit: productUnitMap[f.block_type] || 'pieces' })));
        setVehicleAlerts(expiring);
        setRentalVehicles(rentals);

        const needsLabour = can('production_manager', 'assistant_production_manager', 'logistics_manager', 'hr_officer', 'ico', 'md', 'board_member');
        if (needsLabour) {
          const [labourLoadLogs, labourPayroll, labourRoster] = await Promise.all([
            supabase.from('truck_loading_log').select('quantity_loaded, date, loaders:truck_loading_loaders(labour_id)').gte('date', weekStart).lte('date', todayIso).then(r => r.data || []).catch(() => []),
            supabase.from('weekly_labour_payroll').select('id', { count: 'exact', head: true }).in('status', ['draft', 'ico_approved', 'md_approved']).then(r => r.count || 0).catch(() => 0),
            supabase.from('daily_roster').select('entries:daily_roster_entries(id)').eq('roster_date', todayIso).maybeSingle().then(r => r.data?.entries?.length || 0).catch(() => 0),
          ]);
          const blocksLoadedWeek = labourLoadLogs.reduce((s, r) => s + (r.quantity_loaded || 0), 0);
          const activeLoaderSet = new Set(labourLoadLogs.filter(r => r.date === todayIso).flatMap(r => (r.loaders || []).map(l => l.labour_id)));
          setStats(s => ({ ...s, blocksLoadedWeek, activeLoadersToday: activeLoaderSet.size, pendingPayroll: labourPayroll, rosterHeadcountToday: labourRoster }));
        }
      } catch { /* workflow tables may not exist yet */ } finally {
        setLoading(false);
      }
    };
    load();
  }, [userProfile, dateRange]);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const firstName = userProfile?.full_name?.split(' ')[0] || 'there';

  if (isDriver) {
    return (
      <div>
        <div style={styles.header}>
          <div>
            <div style={styles.pageTitle}>{greeting}, {firstName} 👋</div>
            <div style={styles.pageSubtitle}>Business overview — Abuja Precast Concrete Limited</div>
          </div>
          <span style={styles.badge(theme.green)}>Operations Active</span>
        </div>
        {loading ? <Spinner /> : (
          <>
            <div style={styles.grid(1)}>
              <StatCard label="My Waybills Today" value={myWaybillsToday} sub="Deliveries assigned today" accent={theme.blue} />
            </div>
            <div style={{ ...styles.card, color: theme.textMuted, fontSize: '14px' }}>
              Welcome, {firstName}. Check the Waybills page to view your delivery records.
            </div>
          </>
        )}
      </div>
    );
  }

  const row1 = [
    can('md', 'board_member', 'ico', 'hr_officer') &&
      <StatCard key="staff" label="Total Staff" value={stats.staff} sub="Active employees" accent={theme.blue} />,
    can('md', 'board_member', 'ico', 'store_officer', 'production_manager', 'assistant_production_manager') &&
      <StatCard key="blocks" label="Blocks Produced" value={fmt(stats.produced)} sub="All time" accent={theme.accent} />,
    can('md', 'board_member', 'ico', 'accountant', 'bdm', 'marketer') &&
      <StatCard key="orders" label="Total Orders" value={stats.orders} sub={`${stats.pending} pending`} accent={theme.blue} />,
    can('md', 'board_member', 'ico', 'store_officer', 'logistics_manager') &&
      <StatCard key="waybills" label="Waybills Issued" value={stats.waybills} sub="All deliveries" accent={theme.accentDim} />,
  ].filter(Boolean);

  const row2 = [
    can('md', 'board_member', 'ico', 'accountant') &&
      <StatCard key="revenue" label="Revenue Collected" value={naira(stats.revenue)} sub="Confirmed payments" accent={theme.green} />,
    can('md', 'board_member', 'ico', 'accountant', 'bdm', 'marketer') &&
      <StatCard key="pending" label="Pending Orders" value={stats.pending} sub="Awaiting processing" accent={theme.accent} />,
    can('md', 'board_member', 'ico', 'logistics_manager', 'production_manager', 'assistant_production_manager') &&
      <StatCard key="damages" label="Transit Damages" value={fmt(stats.damages)} sub="Blocks damaged in delivery" accent={theme.red} />,
  ].filter(Boolean);

  const row3 = can('production_manager', 'assistant_production_manager', 'logistics_manager', 'hr_officer', 'ico', 'md', 'board_member') ? [
    <StatCard key="blocksLoaded" label="Blocks Loaded This Week" value={fmt(stats.blocksLoadedWeek)} sub="Qty dispatched this week" accent={theme.blue} />,
    <StatCard key="activeLoaders" label="Active Loaders Today" value={stats.activeLoadersToday} sub="Workers on today's loads" accent={theme.accent} />,
    <div key="pendingPayroll" style={{ cursor: 'pointer' }} onClick={() => onNavigate('labour')}>
      <StatCard label="Pending Payroll" value={stats.pendingPayroll} sub="Payrolls awaiting approval" accent={theme.accent} />
    </div>,
    <StatCard key="rosterHeadcount" label="Roster Headcount Today" value={stats.rosterHeadcountToday} sub="Workers on today's roster" accent={theme.green} />,
  ] : [];

  const showLpo      = can('md', 'ico', 'bdm') && stats.lpoQueue > 0;
  const showSchedule = can('md', 'ico') && stats.scheduleQueue > 0;
  const showPending  = can('md', 'board_member', 'ico', 'bdm', 'store_officer', 'logistics_manager') && stats.pendingRegister > 0;

  return (
    <div>
      <div style={styles.header}>
        <div>
          <div style={styles.pageTitle}>{greeting}, {firstName} 👋</div>
          <div style={styles.pageSubtitle}>Business overview — Abuja Precast Concrete Limited</div>
        </div>
        <span style={styles.badge(theme.green)}>Operations Active</span>
      </div>
      {!isDriver && (
        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', marginBottom: '16px', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: '11px', color: theme.textMuted, fontWeight: '700', textTransform: 'uppercase', marginBottom: '4px' }}>From</div>
            <input type="date" value={dateRange.from} onChange={e => setDateRange(r => ({ ...r, from: e.target.value }))}
              style={{ background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: '6px', color: theme.text, padding: '6px 10px', fontSize: '13px' }} />
          </div>
          <div>
            <div style={{ fontSize: '11px', color: theme.textMuted, fontWeight: '700', textTransform: 'uppercase', marginBottom: '4px' }}>To</div>
            <input type="date" value={dateRange.to} onChange={e => setDateRange(r => ({ ...r, to: e.target.value }))}
              style={{ background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: '6px', color: theme.text, padding: '6px 10px', fontSize: '13px' }} />
          </div>
          <button onClick={() => setDateRange({ from: firstOfMonth, to: todayIso })}
            style={{ background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: '6px', color: theme.textMuted, padding: '6px 12px', fontSize: '12px', cursor: 'pointer' }}>
            This Month
          </button>
        </div>
      )}
      {loading ? <Spinner /> : (
        <>
          {row1.length > 0 && <div style={styles.grid(row1.length)}>{row1}</div>}
          {row2.length > 0 && <div style={styles.grid(row2.length)}>{row2}</div>}
          {row3.length > 0 && (
            <>
              <div style={{ fontSize: '11px', fontWeight: '700', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.07em', marginTop: '8px', marginBottom: '8px' }}>Labour &amp; Loading</div>
              <div style={styles.grid(row3.length)}>{row3}</div>
            </>
          )}
          {(showLpo || showSchedule || showPending) && (
            <div style={{ display: "flex", gap: "12px", marginBottom: "16px", flexWrap: "wrap" }}>
              {showLpo && (
                <div style={{ background: "rgba(245,166,35,0.12)", border: `1px solid ${theme.accent}55`, borderRadius: "10px", padding: "12px 18px", flex: 1, minWidth: "200px" }}>
                  <div style={{ fontSize: "11px", fontWeight: "700", color: theme.accent, textTransform: "uppercase", letterSpacing: "0.05em" }}>LPO Approvals Pending</div>
                  <div style={{ fontSize: "28px", fontWeight: "700", color: theme.text, marginTop: "4px" }}>{stats.lpoQueue}</div>
                  <div style={{ fontSize: "12px", color: theme.textMuted }}>Orders awaiting MD approval</div>
                </div>
              )}
              {showSchedule && (
                <div style={{ background: "rgba(91,141,238,0.12)", border: `1px solid ${theme.blue}55`, borderRadius: "10px", padding: "12px 18px", flex: 1, minWidth: "200px" }}>
                  <div style={{ fontSize: "11px", fontWeight: "700", color: theme.blue, textTransform: "uppercase", letterSpacing: "0.05em" }}>Schedules Awaiting ICO</div>
                  <div style={{ fontSize: "28px", fontWeight: "700", color: theme.text, marginTop: "4px" }}>{stats.scheduleQueue}</div>
                  <div style={{ fontSize: "12px", color: theme.textMuted }}>Delivery schedules submitted</div>
                </div>
              )}
              {showPending && (
                <div style={{ background: "rgba(45,212,160,0.10)", border: `1px solid ${theme.green}55`, borderRadius: "10px", padding: "12px 18px", flex: 1, minWidth: "200px" }}>
                  <div style={{ fontSize: "11px", fontWeight: "700", color: theme.green, textTransform: "uppercase", letterSpacing: "0.05em" }}>Pending Deliveries</div>
                  <div style={{ fontSize: "28px", fontWeight: "700", color: theme.text, marginTop: "4px" }}>{stats.pendingRegister}</div>
                  <div style={{ fontSize: "12px", color: theme.textMuted }}>Customers awaiting delivery</div>
                </div>
              )}
            </div>
          )}
          {can('md', 'board_member', 'ico', 'logistics_manager') && vehicleAlerts.length > 0 && (
            <div style={{ ...styles.card, marginBottom: "16px", borderColor: theme.red + "55", borderLeft: `4px solid ${theme.red}` }}>
              <div style={{ fontSize: "13px", fontWeight: "700", color: theme.red, marginBottom: "10px" }}>🚛 Vehicle Document Alerts ({vehicleAlerts.length})</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {vehicleAlerts.map(v => {
                  const todayStr = new Date().toISOString().split('T')[0];
                  const in14 = new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0];
                  const insExpired  = v.insurance_expiry_date && v.insurance_expiry_date < todayStr;
                  const rwExpired   = v.road_worthiness_expiry_date && v.road_worthiness_expiry_date < todayStr;
                  const insWarning  = !insExpired && v.insurance_expiry_date && v.insurance_expiry_date <= in14;
                  const rwWarning   = !rwExpired && v.road_worthiness_expiry_date && v.road_worthiness_expiry_date <= in14;
                  const insDue      = !insExpired && !insWarning && v.insurance_expiry_date;
                  const rwDue       = !rwExpired && !rwWarning && v.road_worthiness_expiry_date;
                  const anyExpired  = insExpired || rwExpired;
                  return (
                    <div key={v.id} style={{ background: theme.surface, borderRadius: "8px", padding: "10px 12px", border: anyExpired ? `1px solid ${theme.red}44` : `1px solid ${theme.border}` }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
                        <span style={{ fontWeight: "700", color: theme.text, minWidth: "120px" }}>{v.vehicle_number}</span>
                        <span style={{ color: theme.textMuted, fontSize: "12px", flex: 1 }}>{v.vehicle_name || ""}</span>
                        {insExpired  && <span style={{ fontSize: "11px", background: theme.red + "22", color: theme.red, padding: "2px 8px", borderRadius: "12px", fontWeight: "700" }}>Insurance EXPIRED {v.insurance_expiry_date}</span>}
                        {insWarning  && <span style={{ fontSize: "11px", background: "#e67e2222", color: "#e67e22", padding: "2px 8px", borderRadius: "12px", fontWeight: "700" }}>Insurance WARNING — due {v.insurance_expiry_date}</span>}
                        {insDue      && <span style={{ fontSize: "11px", background: theme.accent + "22", color: theme.accent, padding: "2px 8px", borderRadius: "12px", fontWeight: "600" }}>Insurance due {v.insurance_expiry_date}</span>}
                        {rwExpired   && <span style={{ fontSize: "11px", background: theme.red + "22", color: theme.red, padding: "2px 8px", borderRadius: "12px", fontWeight: "700" }}>Road Worthiness EXPIRED {v.road_worthiness_expiry_date}</span>}
                        {rwWarning   && <span style={{ fontSize: "11px", background: "#e67e2222", color: "#e67e22", padding: "2px 8px", borderRadius: "12px", fontWeight: "700" }}>Road Worthiness WARNING — due {v.road_worthiness_expiry_date}</span>}
                        {rwDue       && <span style={{ fontSize: "11px", background: theme.accent + "22", color: theme.accent, padding: "2px 8px", borderRadius: "12px", fontWeight: "600" }}>Road Worthiness due {v.road_worthiness_expiry_date}</span>}
                        {onNavigate  && <button onClick={() => onNavigate("vehicles")} style={{ fontSize: "11px", padding: "2px 10px", borderRadius: "12px", background: theme.blue + "22", color: theme.blue, border: `1px solid ${theme.blue}44`, cursor: "pointer", fontWeight: "600", marginLeft: "auto" }}>Update Documents →</button>}
                      </div>
                      {anyExpired && (
                        <div style={{ marginTop: "8px", fontSize: "12px", color: theme.red, fontWeight: "600", display: "flex", alignItems: "center", gap: "6px" }}>
                          ⚠️ This vehicle should not be dispatched until documents are renewed.
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {can('md', 'ico', 'accountant', 'logistics_manager') && rentalVehicles.length > 0 && (
            <div style={{ ...styles.card, marginBottom: "16px", borderLeft: `4px solid ${theme.accent}` }}>
              <div style={{ fontSize: "13px", fontWeight: "700", color: theme.accent, marginBottom: "10px" }}>🚐 Monthly Rental Payment Reminder</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {rentalVehicles.map(v => (
                  <div key={v.id} style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap", background: theme.surface, borderRadius: "8px", padding: "10px 12px" }}>
                    <span style={{ fontWeight: "700" }}>{v.vehicle_name || v.vehicle_number}</span>
                    <span style={{ color: theme.textMuted, fontSize: "12px" }}>{v.vehicle_number}</span>
                    <span style={{ fontWeight: "700", color: theme.accent }}>{naira(Number(v.monthly_rental_amount) || 0)}</span>
                    {v.owner_name && <span style={{ fontSize: "12px", color: theme.textMuted }}>→ {v.owner_name}</span>}
                    <span style={{ fontSize: "11px", color: theme.textMuted, marginLeft: "auto" }}>Monthly rental — see Labour → Monthly tab</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {can('md', 'board_member', 'ico', 'store_officer', 'logistics_manager', 'production_manager', 'assistant_production_manager') && finishedGoods.length > 0 && (
            <div style={{ ...styles.card, marginBottom: "16px" }}>
              <div style={styles.sectionTitle}>Finished Goods in Yard</div>
              <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
                {finishedGoods.map(fg => (
                  <div key={fg.id} style={{ background: theme.surface, borderRadius: "8px", padding: "12px 18px", flex: 1, minWidth: "120px", textAlign: "center" }}>
                    <div style={{ fontSize: "11px", color: theme.textMuted, marginBottom: "4px" }}>{fg.block_type}</div>
                    <div style={{ fontSize: "24px", fontWeight: "700", color: theme.accent }}>{Number(fg.quantity_in_yard || 0).toLocaleString()}</div>
                    <div style={{ fontSize: "11px", color: theme.textMuted }}>{fg.unit || 'pieces'}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {can('md', 'board_member', 'ico', 'accountant', 'bdm', 'marketer') && recent.length > 0 && (
            <div style={styles.card}>
              <div style={styles.sectionTitle}>Recent Orders</div>
              <table style={styles.table}>
                <thead>
                  <tr>{["Customer", "Location", "Status", "Value"].map(h => <th key={h} style={styles.th}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {recent.map(o => {
                    const total = (o.order_items || []).reduce((s, i) => s + (i.subtotal || i.quantity * i.unit_price), 0);
                    const statusColor = o.status === "completed" ? theme.green : o.status === "invoiced" ? theme.blue : o.status === "cancelled" ? theme.red : theme.accent;
                    return (
                      <tr key={o.id}>
                        <td style={styles.td}><strong>{o.customer?.name || "—"}</strong></td>
                        <td style={styles.td}>{o.customer?.location || "—"}</td>
                        <td style={styles.td}><span style={styles.badge(statusColor)}>{o.status}</span></td>
                        <td style={styles.td}><strong style={{ color: theme.accent }}>{naira(total)}</strong></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
};

// ── PRODUCTION ────────────────────────────────────────────────
// Compact relative-time formatter for the "edited" indicator.
const fmtRelativeTime = (iso) => {
  if (!iso) return "";
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
};

const Production = ({ userProfile }) => {
  const [showForm, setShowForm] = useState(false);
  const [dupWarning, setDupWarning] = useState(null);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [alert, setAlert] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [editTarget, setEditTarget] = useState(null);
  const [showTargetForm, setShowTargetForm] = useState(false);
  const [targets, setTargets] = useState([]);
  const [targetForm, setTargetForm] = useState({ date: new Date().toISOString().split('T')[0], blockType: "9 Inch 3 Hole Block", quantity: "" });
  const [savingTarget, setSavingTarget] = useState(false);
  const emptyForm = { date: "", blockType: "9 Inch 3 Hole Block", produced: "", cement: "", granite: "", chippings: "", diesel: "", dmgProd: "0", dmgStack: "0" };
  const [form, setForm] = useState(emptyForm);

  const load = async () => {
    setLoading(true);
    try {
      const [prods, damages] = await Promise.all([
        productionService.getAll(),
        productionService.getDamages(),
      ]);
      const dmgMap = {};
      damages.forEach(d => {
        if (d.production_log_id) {
          if (!dmgMap[d.production_log_id]) dmgMap[d.production_log_id] = {};
          dmgMap[d.production_log_id][d.stage] = (dmgMap[d.production_log_id][d.stage] || 0) + d.quantity_damaged;
        }
      });
      setRecords(prods.map(p => ({ ...p, damaged: { production: dmgMap[p.id]?.production || 0, stacking: dmgMap[p.id]?.stacking || 0 } })));
    } catch {
      setAlert({ type: "error", msg: "Could not load production records. Check database connection." });
    } finally {
      setLoading(false);
    }
  };

  const loadTargets = async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const { data } = await supabase.from('production_targets').select('*').eq('target_date', today);
      setTargets(data || []);
    } catch { /* table may not exist yet */ }
  };

  const handleSaveTarget = async () => {
    if (!targetForm.quantity) return setAlert({ type: "error", msg: "Enter a target quantity." });
    setSavingTarget(true);
    try {
      await supabase.from('production_targets').upsert({
        target_date: targetForm.date,
        block_type: targetForm.blockType,
        target_quantity: parseInt(targetForm.quantity) || 0,
      }, { onConflict: 'target_date,block_type' });
      setAlert({ type: "success", msg: "Daily target saved." });
      setShowTargetForm(false);
      setTargetForm({ date: new Date().toISOString().split('T')[0], blockType: "9 Inch 3 Hole Block", quantity: "" });
      await loadTargets();
    } catch (e) { setAlert({ type: "error", msg: "Could not save target: " + e.message }); }
    finally { setSavingTarget(false); }
  };

  useEffect(() => { load(); loadTargets(); }, []);

  const startEdit = (record) => {
    setEditTarget(record);
    setForm({
      date: record.date, blockType: record.block_type,
      produced: String(record.quantity_produced || ""),
      cement: String(record.cement_bags || ""),
      granite: String(record.granite_dust_kg || ""),
      chippings: String(record.chippings_kg || ""),
      diesel: String(record.diesel_litres || ""),
      dmgProd: String(record.damaged?.production || 0),
      dmgStack: String(record.damaged?.stacking || 0),
    });
    setShowForm(true);
  };

  const handleSave = async (skipDupCheck = false) => {
    if (!form.date || !form.produced) return setAlert({ type: "error", msg: "Date and quantity produced are required." });
    // Create path only: warn (non-blocking) if a same-date + block-type entry
    // already exists. Fail open — a check error must never block a valid save.
    if (!editTarget && !skipDupCheck) {
      try {
        const dup = records.find(r => r.date === form.date && r.block_type === form.blockType);
        if (dup) { setDupWarning(dup); return; }
      } catch (e) { console.error("Duplicate-entry check failed, proceeding:", e); }
    }
    setSaving(true);
    setAlert(null);
    try {
      const dmgProd = parseInt(form.dmgProd) || 0;
      const dmgStack = parseInt(form.dmgStack) || 0;
      const entryData = {
        date: form.date, block_type: form.blockType,
        quantity_produced: parseInt(form.produced) || 0,
        cement_bags: parseFloat(form.cement) || 0,
        granite_dust_kg: parseFloat(form.granite) || 0,
        chippings_kg: parseFloat(form.chippings) || 0,
        diesel_litres: parseFloat(form.diesel) || 0,
      };
      if (editTarget) {
        await productionService.update(editTarget.id, entryData, userProfile?.id);
        await productionService.clearDamages(editTarget.id);
        if (dmgProd > 0) await productionService.logDamage({ date: form.date, block_type: form.blockType, stage: "production", quantity_damaged: dmgProd, production_log_id: editTarget.id });
        if (dmgStack > 0) await productionService.logDamage({ date: form.date, block_type: form.blockType, stage: "stacking", quantity_damaged: dmgStack, production_log_id: editTarget.id });
        try {
          const ref = `PROD-${editTarget.id.slice(0, 8)}`;
          await inventoryService.reverseProductionMovements(ref);
          await inventoryService.autoDeductProduction({
            cementBags: entryData.cement_bags,
            graniteDustKg: entryData.granite_dust_kg,
            chippingsKg: entryData.chippings_kg,
            dieselLitres: entryData.diesel_litres,
            date: entryData.date,
            reference: ref,
          });
        } catch { /* don't block save if inventory tables missing */ }
        await load();
        setAlert({ type: "success", msg: "Production entry updated and movement log adjusted." });
      } else {
        const entry = await productionService.create(entryData);
        if (dmgProd > 0) await productionService.logDamage({ date: form.date, block_type: form.blockType, stage: "production", quantity_damaged: dmgProd, production_log_id: entry.id });
        if (dmgStack > 0) await productionService.logDamage({ date: form.date, block_type: form.blockType, stage: "stacking", quantity_damaged: dmgStack, production_log_id: entry.id });
        try {
          await inventoryService.autoDeductProduction({
            cementBags: entryData.cement_bags,
            graniteDustKg: entryData.granite_dust_kg,
            chippingsKg: entryData.chippings_kg,
            dieselLitres: entryData.diesel_litres,
            date: entryData.date,
            reference: `PROD-${entry.id.slice(0, 8)}`,
          });
        } catch { /* inventory tables may not exist yet — don't block production save */ }
        setRecords(prev => [{ ...entry, damaged: { production: dmgProd, stacking: dmgStack } }, ...prev]);
        setAlert({ type: "success", msg: "Production entry saved and inventory updated!" });
      }
      setForm(emptyForm);
      setShowForm(false);
      setEditTarget(null);
    } catch (e) {
      setAlert({ type: "error", msg: "Failed to save. " + e.message });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (record) => {
    try {
      // deleteEntry reverses this entry's raw-material stock movements before
      // removing the row (and cascades damage_log + batch_production_links).
      await productionService.deleteEntry(record.id);
      setRecords(prev => prev.filter(r => r.id !== record.id));
      setAlert({ type: "success", msg: "Production entry deleted and raw material stock restored." });
    } catch (e) {
      setAlert({ type: "error", msg: "Failed to delete. " + e.message });
    } finally {
      setConfirmDelete(null);
    }
  };

  const totalProduced = records.reduce((s, r) => s + (r.quantity_produced || 0), 0);
  const totalCement = records.reduce((s, r) => s + (r.cement_bags || 0), 0);
  const totalDiesel = records.reduce((s, r) => s + (r.diesel_litres || 0), 0);
  const totalDamages = records.reduce((s, r) => s + (r.damaged?.production || 0) + (r.damaged?.stacking || 0), 0);

  return (
    <div>
      {confirmDelete && <ConfirmModal
        msg={<div>
          <div style={{ fontWeight: "700", marginBottom: "8px" }}>Delete production entry for {confirmDelete.date}?</div>
          <div style={{ fontSize: "12px", color: theme.textMuted, marginBottom: "10px" }}>This will:</div>
          <ul style={{ fontSize: "12px", color: theme.textMuted, paddingLeft: "18px", lineHeight: "1.9", margin: 0 }}>
            {(confirmDelete.cement_bags > 0) && <li>Restore <strong style={{ color: theme.text }}>{confirmDelete.cement_bags}</strong> bags of cement to inventory</li>}
            {(confirmDelete.granite_dust_kg > 0) && <li>Restore <strong style={{ color: theme.text }}>{confirmDelete.granite_dust_kg} kg</strong> of granite dust to inventory</li>}
            {(confirmDelete.diesel_litres > 0) && <li>Restore <strong style={{ color: theme.text }}>{confirmDelete.diesel_litres} L</strong> of diesel to inventory</li>}
            {((confirmDelete.damaged?.production || 0) + (confirmDelete.damaged?.stacking || 0) > 0) && <li>Reverse <strong style={{ color: theme.red }}>{(confirmDelete.damaged?.production || 0) + (confirmDelete.damaged?.stacking || 0)}</strong> damage records</li>}
          </ul>
          <div style={{ fontSize: "11px", color: theme.red, marginTop: "10px" }}>This action cannot be undone.</div>
        </div>}
        onConfirm={() => handleDelete(confirmDelete)}
        onCancel={() => setConfirmDelete(null)}
      />}
      {dupWarning && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
          <div style={{ background: theme.card, border: `1px solid ${theme.border}`, borderRadius: "12px", padding: "28px 32px", maxWidth: "440px", width: "90%" }}>
            <div style={{ fontWeight: "700", fontSize: "15px", marginBottom: "10px", color: theme.text }}>Possible duplicate entry</div>
            <div style={{ fontSize: "13px", color: theme.textMuted, marginBottom: "24px", lineHeight: "1.5" }}>
              An entry for <strong style={{ color: theme.text }}>{dupWarning.date}</strong> — <strong style={{ color: theme.text }}>{dupWarning.block_type}</strong> already exists ({fmt(dupWarning.quantity_produced)} produced). Do you want to edit that entry instead, or continue creating a new one?
            </div>
            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <button style={styles.btn("secondary")} onClick={() => { const m = dupWarning; setDupWarning(null); startEdit(m); }}>Edit existing</button>
              <button style={styles.btn("primary")} onClick={() => { setDupWarning(null); handleSave(true); }}>Create anyway</button>
            </div>
          </div>
        </div>
      )}
      <div style={styles.header}>
        <div>
          <div style={styles.pageTitle}>Production Log</div>
          <div style={styles.pageSubtitle}>Daily block production, material usage, and damage tracking</div>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <button style={styles.btn("secondary")} onClick={() => setShowTargetForm(!showTargetForm)}>Set Daily Target</button>
          <button style={styles.btn("primary")} onClick={() => setShowForm(!showForm)}>+ Log Today's Production</button>
        </div>
      </div>

      {alert && <Alert msg={alert.msg} type={alert.type} onClose={() => setAlert(null)} />}

      {showTargetForm && (
        <div style={{ ...styles.card, marginBottom: "20px", borderColor: theme.blue + "44" }}>
          <div style={styles.sectionTitle}>Set Daily Production Target</div>
          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginBottom: "14px" }}>
            <div style={styles.formGroup}><label style={styles.label}>Date</label><input style={{ ...styles.input, width: "160px" }} type="date" value={targetForm.date} onChange={e => setTargetForm({ ...targetForm, date: e.target.value })} /></div>
            <div style={styles.formGroup}><label style={styles.label}>Block Type</label><ProductSelect value={targetForm.blockType} onChange={v => setTargetForm({ ...targetForm, blockType: v })} style={{ ...styles.input, width: "240px" }} /></div>
            <div style={styles.formGroup}><label style={styles.label}>Target Quantity</label><input style={{ ...styles.input, width: "140px" }} type="number" placeholder="e.g. 1000" value={targetForm.quantity} onChange={e => setTargetForm({ ...targetForm, quantity: e.target.value })} /></div>
          </div>
          <div style={styles.row}>
            <button style={styles.btn("primary")} onClick={handleSaveTarget} disabled={savingTarget}>{savingTarget ? "Saving…" : "Save Target"}</button>
            <button style={styles.btn("secondary")} onClick={() => setShowTargetForm(false)}>Cancel</button>
          </div>
        </div>
      )}

      {targets.length > 0 && (
        <div style={{ ...styles.card, marginBottom: "20px", borderLeft: `4px solid ${theme.blue}` }}>
          <div style={{ fontSize: "12px", fontWeight: "700", color: theme.blue, marginBottom: "10px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Today's Targets vs Actual</div>
          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
            {targets.map(t => {
              const today = new Date().toISOString().split('T')[0];
              const actualQty = records.filter(r => r.date === t.target_date && r.block_type === t.block_type).reduce((s, r) => s + (r.quantity_produced || 0), 0);
              const pct = t.target_quantity > 0 ? Math.min(Math.round((actualQty / t.target_quantity) * 100), 100) : 0;
              const barColor = pct >= 100 ? theme.green : pct >= 70 ? theme.accent : theme.red;
              return (
                <div key={t.id} style={{ background: theme.surface, borderRadius: "8px", padding: "12px 16px", flex: 1, minWidth: "200px", border: `1px solid ${theme.border}` }}>
                  <div style={{ fontSize: "11px", color: theme.textMuted, marginBottom: "4px" }}>{t.block_type}</div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                    <span style={{ fontSize: "20px", fontWeight: "700", color: barColor }}>{actualQty.toLocaleString()}</span>
                    <span style={{ fontSize: "12px", color: theme.textMuted }}>of {t.target_quantity.toLocaleString()}</span>
                  </div>
                  <div style={styles.progressBar()}><div style={styles.progressFill(pct, barColor)} /></div>
                  <div style={{ fontSize: "11px", color: barColor, marginTop: "4px", fontWeight: "600" }}>{pct}% — {actualQty >= t.target_quantity ? "TARGET MET ✓" : `${(t.target_quantity - actualQty).toLocaleString()} remaining`}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {showForm && (
        <div style={{ ...styles.card, marginBottom: "24px", borderColor: theme.accent + "44" }}>
          <div style={styles.sectionTitle}>{editTarget ? "Edit Production Entry" : "New Production Entry"}</div>
          <div style={styles.grid(3)}>
            {[
              { label: "Date", key: "date", type: "date" },
            ].map(f => (
              <div key={f.key} style={styles.formGroup}>
                <label style={styles.label}>{f.label}</label>
                <input style={styles.input} type={f.type} value={form[f.key]} onChange={e => setForm({ ...form, [f.key]: e.target.value })} />
              </div>
            ))}
            <div style={styles.formGroup}>
              <label style={styles.label}>Block Type</label>
              <ProductSelect value={form.blockType} onChange={(name) => setForm({ ...form, blockType: name })} style={styles.input} />
            </div>
            {[
              { label: "Quantity Produced", key: "produced", placeholder: "e.g. 850" },
              { label: "Cement Bags Used", key: "cement", placeholder: "bags" },
              { label: "Granite Dust (kg)", key: "granite", placeholder: "kg" },
              { label: "Chippings (kg)", key: "chippings", placeholder: "kg" },
              { label: "Diesel Used (litres)", key: "diesel", placeholder: "litres" },
              { label: "Damaged During Production", key: "dmgProd", placeholder: "0" },
              { label: "Damaged During Stacking", key: "dmgStack", placeholder: "0" },
            ].map(f => (
              <div key={f.key} style={styles.formGroup}>
                <label style={styles.label}>{f.label}</label>
                <input style={styles.input} type="number" placeholder={f.placeholder} value={form[f.key]} onChange={e => setForm({ ...form, [f.key]: e.target.value })} />
              </div>
            ))}
          </div>
          <div style={styles.row}>
            <button style={styles.btn("primary")} onClick={() => handleSave()} disabled={saving}>{saving ? "Saving…" : editTarget ? "Update Entry" : "Save Entry"}</button>
            <button style={styles.btn("secondary")} onClick={() => { setShowForm(false); setForm(emptyForm); setEditTarget(null); }}>Cancel</button>
          </div>
        </div>
      )}

      <div style={styles.grid(4)}>
        <StatCard label="Total Produced" value={fmt(totalProduced)} sub={`${records.length} entries`} accent={theme.accent} />
        <StatCard label="Cement Used" value={`${fmt(totalCement)} bags`} sub="All records" accent={theme.blue} />
        <StatCard label="Diesel Used" value={`${fmt(totalDiesel)} L`} sub="All records" accent={theme.accentDim} />
        <StatCard label="Total Damages" value={fmt(totalDamages)} sub="Production + stacking" accent={theme.red} />
      </div>

      <div style={styles.card}>
        <div style={styles.sectionTitle}>Production Records</div>
        {loading ? <Spinner /> : records.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px", color: theme.textMuted, fontSize: "13px" }}>No records yet. Log today's production to get started.</div>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>{["Date", "Block Type", "Produced", "Cement (bags)", "Granite (kg)", "Chippings (kg)", "Diesel (L)", "Dmg Production", "Dmg Stacking", "Net Output", ""].map(h => <th key={h} style={styles.th}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {records.map((p) => {
                const net = (p.quantity_produced || 0) - (p.damaged?.production || 0) - (p.damaged?.stacking || 0);
                return (
                  <tr key={p.id}>
                    <td style={styles.td}>
                      {p.date}
                      {p.updated_at && (
                        <div style={{ fontSize: "10px", color: theme.textMuted, marginTop: "2px", fontStyle: "italic" }} title={`Edited ${new Date(p.updated_at).toLocaleString()}`}>
                          (edited {fmtRelativeTime(p.updated_at)})
                        </div>
                      )}
                    </td>
                    <td style={styles.td}><span style={styles.badge(theme.blue)}>{p.block_type}</span></td>
                    <td style={styles.td}>{fmt(p.quantity_produced)}</td>
                    <td style={styles.td}>{p.cement_bags}</td>
                    <td style={styles.td}>{fmt(p.granite_dust_kg)}</td>
                    <td style={styles.td}>{fmt(p.chippings_kg)}</td>
                    <td style={styles.td}>{p.diesel_litres}</td>
                    <td style={styles.td}><span style={styles.badge(p.damaged?.production > 0 ? theme.red : theme.green)}>{p.damaged?.production || 0}</span></td>
                    <td style={styles.td}><span style={styles.badge(p.damaged?.stacking > 0 ? theme.red : theme.green)}>{p.damaged?.stacking || 0}</span></td>
                    <td style={styles.td}><strong style={{ color: theme.green }}>{fmt(net)}</strong></td>
                    <td style={styles.td}>
                      <div style={{ display: "flex", gap: "6px" }}>
                        <button style={{ ...styles.btn("secondary"), padding: "4px 10px", fontSize: "11px" }} onClick={() => startEdit(p)}>Edit</button>
                        <button style={{ ...styles.btn("danger"), padding: "4px 10px", fontSize: "11px" }} onClick={() => setConfirmDelete(p)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

// ── ORDERS ────────────────────────────────────────────────────
const emptyItem = () => ({ blockType: "9 Inch 3 Hole Block", quantity: "", unitPrice: "", unit: "pieces", sourceType: "manufactured", costBasis: "" });

const Orders = ({ onNavigate, userProfile }) => {
  const [orders, setOrders] = useState([]);
  const [staff, setStaff] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [invoicing, setInvoicing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [showPayForm, setShowPayForm] = useState(false);
  const [editPayment, setEditPayment] = useState(null);
  const [alert, setAlert] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [invoiceEditor, setInvoiceEditor] = useState(null);
  const [customerMode, setCustomerMode] = useState("new");
  const [allCustomers, setAllCustomers] = useState([]);
  const [custSearch, setCustSearch] = useState("");
  const [pickedCustomer, setPickedCustomer] = useState(null);
  const [customerSites, setCustomerSites] = useState([]);
  const [pickedSiteId, setPickedSiteId] = useState("");
  const emptyForm = { customerName: "", customerPhone: "", customerLocation: "", marketerId: "", items: [emptyItem()], isLpo: false, lpoSubmittedBy: "" };
  const [form, setForm] = useState(emptyForm);
  const [lpoDocUrl, setLpoDocUrl] = useState("");
  const [lpoDocSignedUrl, setLpoDocSignedUrl] = useState("");
  const [lpoDocName, setLpoDocName] = useState("");
  const [lpoDocSize, setLpoDocSize] = useState(0);
  const [lpoDocUploading, setLpoDocUploading] = useState(false);
  const [payForm, setPayForm] = useState({ amount: "", date: "" });
  const [orderEditMode, setOrderEditMode] = useState(false);
  const [orderEditItems, setOrderEditItems] = useState([]);
  const [orderEditMarketer, setOrderEditMarketer] = useState("");
  const [confirmDeleteInvoice, setConfirmDeleteInvoice] = useState(null);
  const [invDeleting, setInvDeleting] = useState(false);
  const [invDeleteMsg, setInvDeleteMsg] = useState(null);
  const [orderDeleteMsg, setOrderDeleteMsg] = useState(null);
  const [issueTarget, setIssueTarget] = useState(null);
  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelReason, setCancelReason] = useState('');
  const [invActioning, setInvActioning] = useState(false);

  const isMarketerRole = userProfile?.role === 'marketer';
  // Roles that may create/edit orders. md/accountant/bdm are checked via
  // hasRole() because orders_insert/update use has_any_role and orders_select
  // admits them through its has_any_role branch. 'marketer' is deliberately
  // PRIMARY-only: orders_select admits marketer solely via get_user_role(), so
  // a *granted* marketer could insert a row it cannot then select. Marketer is
  // not grantable.
  const ORDER_WRITE_ROLES_GRANTABLE = ['md', 'accountant', 'bdm'];
  const canWriteOrder = hasRole(userProfile, ...ORDER_WRITE_ROLES_GRANTABLE)
                        || userProfile?.role === 'marketer';

  const load = async () => {
    setLoading(true);
    try {
      const fetchOrders = isMarketerRole
        ? ordersService.getAllForMarketer(userProfile.id)
        : ordersService.getAll();
      const fetchCustomers = isMarketerRole
        ? customersService.getAllForMarketer(userProfile.id)
        : customersService.getAll();
      const [o, s, c] = await Promise.all([fetchOrders, staffService.getPublicActive(), fetchCustomers]);
      setOrders(o);
      setStaff(s);
      setAllCustomers(c);
      return o;
    } catch (e) {
      setAlert({ type: "error", msg: "Could not load orders: " + (e?.message || String(e)) });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!pickedCustomer) { setCustomerSites([]); setPickedSiteId(""); return; }
    customerSitesService.getByCustomer(pickedCustomer.id).then(ss => {
      setCustomerSites(ss);
      if (ss.length === 1) setPickedSiteId(ss[0].id);
      else setPickedSiteId("");
    }).catch(() => { setCustomerSites([]); setPickedSiteId(""); });
  }, [pickedCustomer?.id]);

  const orderTotal = (order) => {
    const invoiced = liveInvoices(order.invoices).reduce((s, inv) => s + Number(inv.total_amount ?? 0), 0);
    const itemTotal = (order.order_items || []).reduce((s, i) => s + (i.subtotal || i.quantity * i.unit_price), 0);
    return invoiced !== 0 ? invoiced : itemTotal;
  };
  const orderPaid = (order) => liveInvoices(order.invoices).flatMap(inv => inv.payments || []).filter(p => p.status === "confirmed").reduce((s, p) => s + p.amount_paid, 0);
  const orderQty = (order) => (order.order_items || []).reduce((s, i) => s + i.quantity, 0);

  const updateItem = (idx, field, val) => {
    const items = [...form.items];
    items[idx] = { ...items[idx], [field]: val };
    setForm({ ...form, items });
  };

  const handleLpoFileSelect = async (file) => {
    if (!file) return;
    setLpoDocUploading(true);
    try {
      const path = await lpoService.uploadDocument(file);
      setLpoDocUrl(path);
      setLpoDocSignedUrl(await lpoService.getSignedUrl(path).catch(() => ""));
      setLpoDocName(file.name);
      setLpoDocSize(file.size);
    } catch (e) {
      setAlert({ type: "error", msg: "LPO document upload failed: " + e.message });
    } finally {
      setLpoDocUploading(false);
    }
  };

  const handleSave = async () => {
    if (customerMode === "existing" && !pickedCustomer) return setAlert({ type: "error", msg: "Please select a customer." });
    if (customerMode === "new" && !form.customerName) return setAlert({ type: "error", msg: "Customer name is required." });
    if (form.items.some(i => !i.quantity || !i.unitPrice)) return setAlert({ type: "error", msg: "All items need quantity and unit price." });
    if (form.isLpo && !lpoDocUrl) return setAlert({ type: "error", msg: "Please upload the LPO document before submitting." });
    setSaving(true);
    setAlert(null);
    try {
      let customerId;
      let siteId = pickedSiteId || null;
      if (customerMode === "existing") {
        customerId = pickedCustomer.id;
      } else {
        const customer = await customersService.create({ name: form.customerName, phone: form.customerPhone || null, location: form.customerLocation || null });
        customerId = customer.id;
        try {
          const site = await customerSitesService.create({ customer_id: customerId, site_name: 'Main Site', site_address: form.customerLocation || null, is_active: true });
          siteId = site.id;
        } catch { /* site creation optional */ }
      }
      const newOrder = await ordersService.create({
        order: { customer_id: customerId, marketer_id: form.marketerId || null, status: "pending", is_lpo: form.isLpo || false, site_id: siteId },
        items: form.items.map(i => ({ block_type: i.blockType, quantity: parseInt(i.quantity), unit_price: parseFloat(i.unitPrice), source_type: i.sourceType || 'manufactured', cost_basis: (i.sourceType === 'resale' && i.costBasis) ? parseFloat(i.costBasis) : null })),
      });
      if (form.isLpo) {
        try {
          await lpoService.create({ order_id: newOrder.id, submitted_by: form.lpoSubmittedBy || "BDM", document_url: lpoDocUrl || null });
        } catch { /* LPO table may not exist yet */ }
      }
      await load();
      setForm(emptyForm);
      setLpoDocUrl(""); setLpoDocSignedUrl(""); setLpoDocName(""); setLpoDocSize(0);
      setPickedCustomer(null);
      setPickedSiteId("");
      setCustomerSites([]);
      setCustSearch("");
      setCustomerMode("new");
      setShowForm(false);
      setAlert({ type: "success", msg: form.isLpo ? "LPO order submitted for MD approval!" : "Order created successfully!" });
    } catch (e) {
      setAlert({ type: "error", msg: "Failed to create order. " + e.message });
    } finally {
      setSaving(false);
    }
  };

  // Map product name → unit for editor/PDF line labels.
  const loadProductUnits = async () => {
    const productMap = {};
    try {
      const prods = await productsService.getActive();
      prods.forEach(p => { productMap[p.name] = p.unit; });
    } catch {}
    return productMap;
  };

  // Open the line-item editor. For a NEW invoice this creates a draft on save;
  // for an EXISTING (draft) invoice it loads the saved line items, falling back
  // to the order's own items when the invoice predates invoice_items.
  const handleGenerateInvoice = async () => {
    if (!selected) return;
    setInvoicing(true);
    try {
      const today = new Date().toISOString().split("T")[0];
      const due = new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0];
      const productMap = await loadProductUnits();
      const fromOrderItems = (orderItems) => orderItems.map(i => ({
        description: i.block_type || i.description || "",
        quantity: i.quantity,
        unit_price: i.unit_price,
        unit: productMap[i.block_type] || "",
      }));
      const existingInvoice = (selected.invoices || [])[0];
      if (existingInvoice) {
        // Read saved line items; fall back to order_items if none exist yet
        // (existing invoices have no invoice_items rows).
        let savedItems = [];
        try { savedItems = await invoicesService.getItems(existingInvoice.id); } catch {}
        const editorItems = savedItems.length > 0
          ? savedItems.map(it => ({ description: it.block_type || "", quantity: it.quantity, unit_price: it.unit_price, unit: productMap[it.block_type] || "" }))
          : fromOrderItems(selected.order_items || []);
        setInvoiceEditor({
          invoice_number: existingInvoice.invoice_number,
          issued_date: existingInvoice.issued_date || today,
          due_date: existingInvoice.due_date || due,
          items: editorItems.length > 0 ? editorItems : [{ description: "", quantity: "", unit_price: "", unit: "" }],
          delivery_cost: existingInvoice.delivery_cost != null ? String(existingInvoice.delivery_cost) : "",
          include_vat: existingInvoice.include_vat != null ? existingInvoice.include_vat : true,
          discount: existingInvoice.discount != null ? String(existingInvoice.discount) : "",
          status: existingInvoice.status || 'draft',
          _existingId: existingInvoice.id,
        });
      } else {
        const invoiceNumber = await invoicesService.getNextNumber();
        const editorItems = fromOrderItems(selected.order_items || []);
        setInvoiceEditor({
          invoice_number: invoiceNumber,
          issued_date: today,
          due_date: due,
          items: editorItems.length > 0 ? editorItems : [{ description: "", quantity: "", unit_price: "", unit: "" }],
          delivery_cost: "",
          include_vat: true,
          discount: "",
          status: 'draft',
          _existingId: null,
        });
      }
    } catch (e) {
      setAlert({ type: "error", msg: "Could not open the invoice editor. " + (e?.message || String(e)) });
    } finally {
      setInvoicing(false);
    }
  };

  // Download a PDF for an already-saved invoice without opening the editor.
  // A draft renders as a PROFORMA INVOICE; issued/paid as an INVOICE.
  const handleDownloadInvoicePDF = async (invoice) => {
    if (!invoice) return;
    setInvoicing(true);
    try {
      const productMap = await loadProductUnits();
      let items = [];
      try { items = await invoicesService.getItems(invoice.id); } catch {}
      const pdfItems = items.length > 0
        ? items.map(it => ({ description: it.block_type || "", quantity: it.quantity, unit_price: it.unit_price, unit: productMap[it.block_type] || "" }))
        : (selected?.order_items || []).map(i => ({ description: i.block_type || "", quantity: i.quantity, unit_price: i.unit_price, unit: productMap[i.block_type] || "" }));
      const customer = selected?.customer || { name: selected?.customerName, location: selected?.customerLocation, phone: selected?.customerPhone };
      await generateInvoicePDF({
        invoice_number: invoice.invoice_number,
        issued_date: invoice.issued_date,
        due_date: invoice.due_date,
        items: pdfItems,
        delivery_cost: Number(invoice.delivery_cost) || 0,
        include_vat: invoice.include_vat != null ? invoice.include_vat : true,
        discount: Number(invoice.discount) || 0,
        status: invoice.status || 'issued',
      }, customer);
    } catch (e) {
      setAlert({ type: "error", msg: "Could not generate the PDF. " + (e?.message || String(e)) });
    } finally {
      setInvoicing(false);
    }
  };

  const doIssueInvoice = async (invoice) => {
    setInvActioning(true);
    try {
      await invoicesService.issue(invoice.id);
      // Issuing a draft is the point the order becomes a firm sale — advance it
      // to 'invoiced' now (a draft/quotation left it untouched).
      if (selected?.id) { try { await ordersService.updateStatus(selected.id, "invoiced"); } catch {} }
      setIssueTarget(null);
      const newOrders = await load();
      if (newOrders) setSelected(newOrders.find(o => o.id === selected?.id) || null);
      setAlert({ type: "success", msg: `Invoice ${invoice.invoice_number} issued — it is now a receivable.` });
    } catch (e) {
      setIssueTarget(null);
      setAlert({ type: "error", msg: cleanInvoiceError(e) });
    } finally {
      setInvActioning(false);
    }
  };

  const doCancelInvoice = async () => {
    if (!cancelTarget || !cancelReason.trim()) return;
    setInvActioning(true);
    try {
      await invoicesService.cancel(cancelTarget.id, { cancelled_by_name: userProfile?.full_name, cancellation_reason: cancelReason.trim() });
      const target = cancelTarget;
      setCancelTarget(null);
      setCancelReason('');
      const newOrders = await load();
      if (newOrders) setSelected(newOrders.find(o => o.id === selected?.id) || null);
      setAlert({ type: "success", msg: `Invoice ${target.invoice_number} cancelled.` });
    } catch (e) {
      setAlert({ type: "error", msg: cleanInvoiceError(e) });
    } finally {
      setInvActioning(false);
    }
  };

  const handleSaveInvoice = async () => {
    if (!invoiceEditor || !selected) return;
    setInvoicing(true);
    try {
      const { _existingId, invoice_number, issued_date, due_date, items, delivery_cost, include_vat, discount } = invoiceEditor;
      let invNum = invoice_number;
      const itemSubtotal = items.reduce((s, i) => s + (Number(i.quantity) || 0) * (Number(i.unit_price) || 0), 0);
      const delivN = Number(delivery_cost) || 0;
      const discN = Number(discount) || 0;
      const sub = itemSubtotal + delivN;
      const afterDisc = sub - discN;
      const vat = include_vat ? afterDisc * 0.075 : 0;
      const total = afterDisc + vat;

      // Persist the full editor state — line items, delivery, discount and VAT
      // toggle — not just the total (the old bug silently dropped everything but
      // number/dates/total).
      const contentFields = { invoice_number, issued_date, due_date, total_amount: total, delivery_cost: delivN, discount: discN, include_vat };
      const orderId = selected.id;
      let invoiceId = _existingId;
      if (_existingId) {
        await invoicesService.update(_existingId, contentFields);
      } else {
        let newInvoice;
        const draftFields = { order_id: orderId, status: 'draft', created_by: userProfile?.id || null, created_by_name: userProfile?.full_name || null, ...contentFields };
        try {
          newInvoice = await invoicesService.create({ ...draftFields, invoice_number: invNum });
        } catch (createErr) {
          if (createErr.code === '23505') {
            invNum = await invoicesService.getNextNumber();
            newInvoice = await invoicesService.create({ ...draftFields, invoice_number: invNum });
          } else {
            throw createErr;
          }
        }
        invoiceId = newInvoice.id;
        // NOTE: the order is NOT advanced to 'invoiced' here — a draft is a
        // quotation and must leave the order status untouched. The order
        // advances to 'invoiced' when the invoice is ISSUED (see doIssueInvoice).
      }

      // Write the line items (replace-all, only when changed; DB blocks this on
      // non-drafts, which the editor is only ever opened on).
      await invoicesService.saveItems(invoiceId, items);

      const customer = selected.customer || { name: selected.customerName, location: selected.customerLocation, phone: selected.customerPhone };
      await generateInvoicePDF({ invoice_number: invNum, issued_date, due_date, items, delivery_cost: delivN, include_vat, discount: discN, status: 'draft' }, customer);

      setInvoiceEditor(null);
      const newOrders = await load();
      if (newOrders) setSelected(newOrders.find(o => o.id === orderId) || null);
      setAlert({ type: "success", msg: `Draft invoice ${invNum} saved. Proforma downloaded.` });
    } catch (e) {
      if (e.message?.includes('invoices_order_id_fkey')) {
        setInvoiceEditor(null);
        const newOrders = await load().catch(() => null);
        setSelected(newOrders?.find(o => o.id === selected?.id) || null);
        setAlert({ type: "error", msg: "This order no longer exists in the system. The list has been refreshed." });
      } else {
        setAlert({ type: "error", msg: cleanInvoiceError(e) });
      }
    } finally {
      setInvoicing(false);
    }
  };

  const handleRecordPayment = async () => {
    if (!payForm.amount || !payForm.date) return setAlert({ type: "error", msg: "Amount and date are required." });
    try {
      if (editPayment) {
        await paymentsService.updatePayment(editPayment.id, { amount_paid: parseFloat(payForm.amount), payment_date: payForm.date });
        setAlert({ type: "success", msg: "Payment updated." });
      } else {
        const invoice = selected?.invoices?.[0];
        if (!invoice) return setAlert({ type: "error", msg: "Generate an invoice first." });
        await paymentsService.recordPayment({ invoice_id: invoice.id, amount_paid: parseFloat(payForm.amount), payment_date: payForm.date, status: "confirmed" });
        // Check if order is now fully paid → add to pending delivery register
        try {
          const totalInvoiced = liveInvoices(selected.invoices).reduce((s, inv) => s + Number(inv.total_amount || 0), 0);
          const alreadyPaid = liveInvoices(selected.invoices).flatMap(inv => (inv.payments || []).filter(p => p.status === "confirmed")).reduce((s, p) => s + Number(p.amount_paid), 0);
          const newTotal = alreadyPaid + parseFloat(payForm.amount);
          if (newTotal >= totalInvoiced && totalInvoiced > 0) {
            const fullOrder = await ordersService.getById(selected.id);
            await pendingDeliveryService.addFromOrder(fullOrder);
            setAlert({ type: "success", msg: "Payment confirmed! Customer added to Pending Delivery Register." });
          } else {
            setAlert({ type: "success", msg: "Payment recorded successfully!" });
          }
        } catch { setAlert({ type: "success", msg: "Payment recorded successfully!" }); }
      }
      const newOrders = await load();
      if (newOrders) setSelected(newOrders.find(o => o.id === selected?.id) || null);
      setPayForm({ amount: "", date: "" });
      setShowPayForm(false);
      setEditPayment(null);
    } catch (e) {
      setAlert({ type: "error", msg: "Failed to save payment. " + e.message });
    }
  };

  const handleDeleteOrder = async (id) => {
    try {
      await ordersService.delete(id);
      if (selected?.id === id) setSelected(null);
      await load();
      setAlert({ type: "success", msg: "Order deleted." });
    } catch (e) {
      setAlert({ type: "error", msg: "Failed to delete order. " + e.message });
    } finally {
      setConfirmDelete(null);
    }
  };

  const handleDeletePayment = async (paymentId) => {
    try {
      await paymentsService.deletePayment(paymentId);
      const newOrders = await load();
      if (newOrders) setSelected(newOrders.find(o => o.id === selected?.id) || null);
      setAlert({ type: "success", msg: "Payment removed." });
    } catch (e) {
      setAlert({ type: "error", msg: "Failed to delete payment. " + e.message });
    } finally {
      setConfirmDelete(null);
    }
  };

  const handleDeleteOrderClick = async (order) => {
    setOrderDeleteMsg(null);
    try {
      const invoiceIds = (order.invoices || []).map(i => i.id);
      const payments = await orderPaymentsService.getByOrderInvoices(invoiceIds);
      if (payments.length > 0) {
        setOrderDeleteMsg(`${payments.length} payment${payments.length > 1 ? 's are' : ' is'} recorded against this order's invoice(s) and must be removed first.`);
        return;
      }
      setConfirmDelete(order);
    } catch (e) {
      setAlert({ type: 'error', msg: 'Could not check order payments: ' + (e?.message || String(e)) });
    }
  };

  const handleDeleteInvoice = async (invoice) => {
    setInvDeleteMsg(null);
    try {
      const payments = await paymentsService.getByInvoice(invoice.id);
      if (payments.length > 0) {
        setInvDeleteMsg(`${payments.length} payment${payments.length > 1 ? 's are' : ' is'} recorded against this invoice and must be handled first.`);
        return;
      }
      setConfirmDeleteInvoice(invoice);
    } catch (e) {
      setAlert({ type: 'error', msg: 'Could not check invoice payments: ' + (e?.message || String(e)) });
    }
  };

  const doDeleteInvoice = async (invoice) => {
    setInvDeleting(true);
    try {
      await invoicesService.delete(invoice.id);
      setConfirmDeleteInvoice(null);
      const newOrders = await load();
      if (newOrders) setSelected(newOrders.find(o => o.id === selected?.id) || null);
      setAlert({ type: 'success', msg: `Invoice ${invoice.invoice_number} deleted.` });
    } catch (e) {
      setConfirmDeleteInvoice(null);
      if (e?.code === '23503' || e?.message?.includes('foreign key')) {
        setInvDeleteMsg('This invoice has payments recorded against it and cannot be deleted.');
      } else {
        setAlert({ type: 'error', msg: e?.message || 'Delete failed.' });
      }
    } finally {
      setInvDeleting(false);
    }
  };

  const startOrderEdit = (order) => {
    setOrderEditItems((order.order_items || []).map(i => ({ blockType: i.block_type, quantity: String(i.quantity), unitPrice: String(i.unit_price), sourceType: i.source_type || 'manufactured', costBasis: i.cost_basis != null ? String(i.cost_basis) : '' })));
    setOrderEditMarketer(order.marketer_id || "");
    setOrderEditMode(true);
  };

  const handleUpdateOrder = async () => {
    if (orderEditItems.some(i => !i.quantity || !i.unitPrice)) return setAlert({ type: "error", msg: "All items need quantity and unit price." });
    try {
      await ordersService.updateOrder(selected.id, {
        marketerId: orderEditMarketer || null,
        items: orderEditItems.map(i => ({ block_type: i.blockType, quantity: parseInt(i.quantity), unit_price: parseFloat(i.unitPrice), source_type: i.sourceType || 'manufactured', cost_basis: (i.sourceType === 'resale' && i.costBasis) ? parseFloat(i.costBasis) : null })),
      });
      const newOrders = await load();
      if (newOrders) setSelected(newOrders.find(o => o.id === selected.id) || null);
      setOrderEditMode(false);
      setAlert({ type: "success", msg: "Order updated." });
    } catch (e) {
      setAlert({ type: "error", msg: "Failed to update order. " + e.message });
    }
  };

  const statusColor = (s) => s === "completed" ? theme.green : s === "invoiced" ? theme.blue : s === "cancelled" ? theme.red : theme.accent;

  const totalValue = orders.reduce((s, o) => s + orderTotal(o), 0);
  const totalPaid = orders.reduce((s, o) => s + orderPaid(o), 0);

  return (
    <div>
      {confirmDelete && <ConfirmModal msg={confirmDelete.type === "payment" ? `Remove payment of ${naira(confirmDelete.amount_paid)} recorded on ${confirmDelete.payment_date}? This cannot be undone.` : `Delete order for ${confirmDelete.customer?.name}? This will also delete all invoices. This cannot be undone.`} onConfirm={() => confirmDelete.type === "payment" ? handleDeletePayment(confirmDelete.id) : handleDeleteOrder(confirmDelete.id)} onCancel={() => setConfirmDelete(null)} />}
      {confirmDeleteInvoice && <ConfirmModal msg={`Delete invoice ${confirmDeleteInvoice.invoice_number}? This cannot be undone.`} onConfirm={() => doDeleteInvoice(confirmDeleteInvoice)} onCancel={() => setConfirmDeleteInvoice(null)} />}
      {issueTarget && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: "16px" }}>
          <div style={{ background: theme.card, border: `1px solid ${theme.border}`, borderRadius: "12px", padding: "28px 32px", maxWidth: "440px", width: "100%" }}>
            <div style={{ fontWeight: "700", fontSize: "15px", marginBottom: "10px", color: theme.text }}>Issue invoice {issueTarget.invoice_number}?</div>
            <div style={{ fontSize: "13px", color: theme.textMuted, marginBottom: "24px", lineHeight: "1.55" }}>
              Issuing <strong style={{ color: theme.text }}>locks</strong> the invoice — its line items, amounts and number can no longer be changed — and it becomes a firm <strong style={{ color: theme.text }}>receivable</strong> counting toward revenue and outstanding balances. To correct it later you would cancel and reissue.
            </div>
            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <button style={styles.btn("secondary")} onClick={() => setIssueTarget(null)} disabled={invActioning}>Not yet</button>
              <button style={{ ...styles.btn("primary"), background: theme.green }} onClick={() => doIssueInvoice(issueTarget)} disabled={invActioning}>{invActioning ? "Issuing…" : "Issue Invoice"}</button>
            </div>
          </div>
        </div>
      )}
      {cancelTarget && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: "16px" }}>
          <div style={{ background: theme.card, border: `1px solid ${theme.border}`, borderRadius: "12px", padding: "28px 32px", maxWidth: "440px", width: "100%" }}>
            <div style={{ fontWeight: "700", fontSize: "15px", marginBottom: "10px", color: theme.text }}>Cancel invoice {cancelTarget.invoice_number}</div>
            <div style={{ fontSize: "13px", color: theme.textMuted, marginBottom: "14px", lineHeight: "1.55" }}>
              A cancelled invoice is voided and stops counting as a receivable. This cannot be undone. Please give a reason.
            </div>
            <textarea style={{ ...styles.input, minHeight: "72px", resize: "vertical", marginBottom: "18px" }} placeholder="Reason for cancellation (required)…" value={cancelReason} onChange={e => setCancelReason(e.target.value)} autoFocus />
            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <button style={styles.btn("secondary")} onClick={() => { setCancelTarget(null); setCancelReason(''); }} disabled={invActioning}>Close</button>
              <button style={{ ...styles.btn("danger"), opacity: cancelReason.trim() ? 1 : 0.5 }} onClick={doCancelInvoice} disabled={invActioning || !cancelReason.trim()}>{invActioning ? "Cancelling…" : "Confirm Cancellation"}</button>
            </div>
          </div>
        </div>
      )}
      <InvoiceEditorModal editor={invoiceEditor} setEditor={setInvoiceEditor} onSave={handleSaveInvoice} saving={invoicing} />
      <div style={styles.header}>
        <div>
          <div style={styles.pageTitle}>Orders & Invoicing</div>
          <div style={styles.pageSubtitle}>Customer orders, payment tracking, and delivery status</div>
        </div>
        {canWriteOrder && <button style={styles.btn("primary")} onClick={() => setShowForm(!showForm)}>+ New Order</button>}
      </div>

      {alert && <Alert msg={alert.msg} type={alert.type} onClose={() => setAlert(null)} />}
      {orderDeleteMsg && (
        <div style={{ margin: "0 0 12px", padding: "10px 14px", background: theme.red + '18', border: `1px solid ${theme.red}44`, borderRadius: "6px", fontSize: "13px", color: theme.red, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>{orderDeleteMsg}</span>
          <button style={{ background: "none", border: "none", color: theme.red, cursor: "pointer", fontWeight: "700", fontSize: "14px", padding: "0 4px" }} onClick={() => setOrderDeleteMsg(null)}>×</button>
        </div>
      )}

      {showForm && (
        <div style={{ ...styles.card, marginBottom: "24px", borderColor: theme.accent + "44" }}>
          <div style={styles.sectionTitle}>New Order Request</div>
          <div style={{ marginBottom: "16px", paddingBottom: "16px", borderBottom: `1px solid ${theme.border}` }}>
            <div style={{ fontSize: "12px", fontWeight: "700", color: theme.textMuted, marginBottom: "10px", textTransform: "uppercase", letterSpacing: "0.06em" }}>Customer</div>
            <div style={{ display: "flex", gap: "8px", marginBottom: "14px" }}>
              {["new", "existing"].map(m => (
                <button key={m} style={{ ...styles.btn(customerMode === m ? "primary" : "secondary"), textTransform: "capitalize" }} onClick={() => { setCustomerMode(m); setPickedCustomer(null); setCustSearch(""); }}>{m === "new" ? "New Customer" : "Existing Customer"}</button>
              ))}
            </div>
            {customerMode === "existing" ? (
              <div>
                <input style={{ ...styles.input, marginBottom: "10px" }} placeholder="Search by name or phone…" value={custSearch} onChange={e => setCustSearch(e.target.value)} />
                {custSearch.length > 0 && (
                  <div style={{ background: theme.surface, borderRadius: "8px", border: `1px solid ${theme.border}`, maxHeight: "160px", overflowY: "auto", marginBottom: "10px" }}>
                    {allCustomers.filter(c => [c.name, c.phone, c.company_name].some(f => f?.toLowerCase().includes(custSearch.toLowerCase()))).map(c => (
                      <div key={c.id} onClick={() => { setPickedCustomer(c); setCustSearch(""); }} style={{ padding: "10px 14px", cursor: "pointer", borderBottom: `1px solid ${theme.border}22`, background: pickedCustomer?.id === c.id ? "rgba(245,166,35,0.08)" : "transparent" }}>
                        <div style={{ fontWeight: "600", fontSize: "13px" }}>{c.name}{c.company_name ? ` — ${c.company_name}` : ""}</div>
                        <div style={{ fontSize: "11px", color: theme.textMuted }}>{c.phone}{c.location ? ` · ${c.location}` : ""}</div>
                      </div>
                    ))}
                    {allCustomers.filter(c => [c.name, c.phone].some(f => f?.toLowerCase().includes(custSearch.toLowerCase()))).length === 0 && (
                      <div style={{ padding: "14px", fontSize: "13px", color: theme.textMuted }}>No customers found</div>
                    )}
                  </div>
                )}
                {pickedCustomer && (
                  <div style={{ padding: "12px 14px", background: "rgba(245,166,35,0.08)", borderRadius: "8px", border: `1px solid ${theme.accent}44`, fontSize: "13px" }}>
                    <strong>{pickedCustomer.name}</strong>{pickedCustomer.company_name ? ` · ${pickedCustomer.company_name}` : ""}
                    <div style={{ fontSize: "11px", color: theme.textMuted, marginTop: "2px" }}>{pickedCustomer.phone} · {pickedCustomer.location}</div>
                  </div>
                )}
                {pickedCustomer && customerSites.length > 0 && (
                  <div style={{ marginTop: "10px" }}>
                    <label style={styles.label}>Delivery Site</label>
                    <select style={styles.input} value={pickedSiteId} onChange={e => setPickedSiteId(e.target.value)}>
                      <option value="">— Select site —</option>
                      {customerSites.map(s => (
                        <option key={s.id} value={s.id}>{s.site_name}{s.site_address ? ` · ${s.site_address}` : ""}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            ) : (
              <>
                <div style={styles.grid(3)}>
                  <div style={styles.formGroup}>
                    <label style={styles.label}>Customer Name *</label>
                    <input style={styles.input} placeholder="e.g. Metama Housing" value={form.customerName} onChange={e => setForm({ ...form, customerName: e.target.value })} />
                  </div>
                  <div style={styles.formGroup}>
                    <label style={styles.label}>Phone</label>
                    <input style={styles.input} placeholder="+234…" value={form.customerPhone} onChange={e => setForm({ ...form, customerPhone: e.target.value })} />
                  </div>
                  <div style={styles.formGroup}>
                    <label style={styles.label}>Location</label>
                    <input style={styles.input} placeholder="e.g. Gwarinpa, Abuja" value={form.customerLocation} onChange={e => setForm({ ...form, customerLocation: e.target.value })} />
                  </div>
                </div>
              </>
            )}
            <div style={styles.formGroup}>
              <label style={styles.label}>Marketer (optional)</label>
              <select style={{ ...styles.input, maxWidth: "260px" }} value={form.marketerId} onChange={e => setForm({ ...form, marketerId: e.target.value })}>
                <option value="">— Select marketer —</option>
                {staff.map(s => <option key={s.id} value={s.id}>{s.full_name} ({s.role})</option>)}
              </select>
            </div>
          </div>
          <div style={{ marginBottom: "16px" }}>
            <div style={{ fontSize: "12px", fontWeight: "700", color: theme.textMuted, marginBottom: "10px", textTransform: "uppercase", letterSpacing: "0.06em" }}>Order Items</div>
            {form.items.map((item, idx) => (
              <div key={idx} style={{ marginBottom: "12px", padding: item.sourceType === 'resale' ? "10px" : "0", background: item.sourceType === 'resale' ? theme.accent + "08" : "transparent", borderRadius: "6px", border: item.sourceType === 'resale' ? `1px solid ${theme.accent}33` : "1px solid transparent" }}>
                <div style={{ display: "flex", gap: "10px", marginBottom: item.sourceType === 'resale' ? "8px" : "0", alignItems: "flex-end" }}>
                  <div style={{ flex: 1 }}>
                    {idx === 0 && <label style={styles.label}>Block Type</label>}
                    <ProductSelect value={item.blockType} onChange={(name, unit) => { const its = [...form.items]; its[idx] = { ...its[idx], blockType: name, unit }; setForm({ ...form, items: its }); }} style={styles.input} />
                  </div>
                  <div style={{ flex: 1 }}>
                    {idx === 0 && <label style={styles.label}>Quantity</label>}
                    <input style={styles.input} type="number" placeholder="e.g. 10000" value={item.quantity} onChange={e => updateItem(idx, "quantity", e.target.value)} />
                  </div>
                  <div style={{ flex: 1 }}>
                    {idx === 0 && <label style={styles.label}>Unit Price (₦)</label>}
                    <input style={styles.input} type="number" placeholder="e.g. 250" value={item.unitPrice} onChange={e => updateItem(idx, "unitPrice", e.target.value)} />
                  </div>
                  <div style={{ flex: 1 }}>
                    {idx === 0 && <label style={styles.label}>Subtotal</label>}
                    <div style={{ ...styles.input, background: "transparent", color: theme.accent, fontWeight: "700" }}>
                      {item.quantity && item.unitPrice ? naira(parseInt(item.quantity) * parseFloat(item.unitPrice)) : "—"}
                    </div>
                  </div>
                  <div style={{ flex: "0 0 auto" }}>
                    {idx === 0 && <label style={styles.label}>Source</label>}
                    <div style={{ display: "flex", gap: "3px" }}>
                      {["manufactured", "resale"].map(t => (
                        <button key={t} type="button" style={{ ...styles.btn(item.sourceType === t ? "primary" : "secondary"), padding: "6px 9px", fontSize: "11px" }} onClick={() => updateItem(idx, "sourceType", t)}>
                          {t === "manufactured" ? "Mfg" : "Resale"}
                        </button>
                      ))}
                    </div>
                  </div>
                  {form.items.length > 1 && (
                    <button style={{ ...styles.btn("danger"), padding: "9px 12px", alignSelf: "flex-end" }} onClick={() => setForm({ ...form, items: form.items.filter((_, i) => i !== idx) })}>✕</button>
                  )}
                </div>
                {item.sourceType === 'resale' && (
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <label style={{ ...styles.label, marginBottom: 0, fontSize: "12px", whiteSpace: "nowrap" }}>Partner cost (₦):</label>
                    <input style={{ ...styles.input, maxWidth: "200px" }} type="number" min="0" placeholder="Cost basis (optional)" value={item.costBasis} onChange={e => updateItem(idx, "costBasis", e.target.value)} />
                  </div>
                )}
              </div>
            ))}
            {form.items.length < 5 && (
              <button style={styles.btn("secondary")} onClick={() => setForm({ ...form, items: [...form.items, emptyItem()] })}>+ Add Item</button>
            )}
          </div>
          <div style={{ padding: "12px 0", borderTop: `1px solid ${theme.border}22`, marginBottom: "4px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <input type="checkbox" id="lpo_flag" checked={form.isLpo} onChange={e => setForm({ ...form, isLpo: e.target.checked })} style={{ width: "16px", height: "16px", cursor: "pointer", accentColor: theme.accent }} />
              <label htmlFor="lpo_flag" style={{ ...styles.label, marginBottom: 0, cursor: "pointer", color: form.isLpo ? theme.accent : theme.textMuted, fontWeight: form.isLpo ? "700" : "400" }}>
                This is an LPO order (requires MD approval before delivery)
              </label>
              {form.isLpo && (
                <input style={{ ...styles.input, maxWidth: "220px", marginLeft: "8px" }} placeholder="Submitted by (BDM name)" value={form.lpoSubmittedBy} onChange={e => setForm({ ...form, lpoSubmittedBy: e.target.value })} />
              )}
            </div>
            {form.isLpo && (
              <div style={{ marginTop: "14px", padding: "14px", background: theme.surface, borderRadius: "8px", border: `1px dashed ${lpoDocUrl ? theme.green : theme.accent}` }}>
                <div style={{ fontSize: "11px", fontWeight: "700", color: theme.textMuted, marginBottom: "10px", textTransform: "uppercase", letterSpacing: "0.06em" }}>Upload LPO Document <span style={{ color: theme.red }}>*</span></div>
                {lpoDocUrl ? (
                  <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
                    <span style={{ fontSize: "12px", color: theme.green }}>✓ {lpoDocName}</span>
                    <span style={{ fontSize: "11px", color: theme.textMuted }}>({(lpoDocSize / 1024).toFixed(1)} KB)</span>
                    {lpoDocSignedUrl && <a href={lpoDocSignedUrl} target="_blank" rel="noreferrer" style={{ fontSize: "11px", color: theme.blue, textDecoration: "underline" }}>Preview</a>}
                    <button style={{ ...styles.btn("danger"), padding: "2px 8px", fontSize: "11px" }} onClick={() => { setLpoDocUrl(""); setLpoDocSignedUrl(""); setLpoDocName(""); setLpoDocSize(0); }}>Remove</button>
                  </div>
                ) : (
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <label style={{ cursor: "pointer", display: "inline-block" }}>
                      <span style={{ ...styles.btn("secondary"), display: "inline-block", cursor: "pointer" }}>{lpoDocUploading ? "Uploading…" : "Choose File (PDF / JPG / PNG)"}</span>
                      <input type="file" accept=".pdf,.jpg,.jpeg,.png" style={{ display: "none" }} disabled={lpoDocUploading} onChange={e => e.target.files[0] && handleLpoFileSelect(e.target.files[0])} />
                    </label>
                    <span style={{ fontSize: "11px", color: theme.textMuted }}>Required — MD must see this document before approving</span>
                  </div>
                )}
              </div>
            )}
          </div>
          <div style={styles.row}>
            <button style={styles.btn(form.isLpo ? "secondary" : "primary")} onClick={handleSave} disabled={saving || lpoDocUploading}>{saving ? "Saving…" : form.isLpo ? "Submit LPO for MD Approval" : "Create Order"}</button>
            <button style={styles.btn("secondary")} onClick={() => { setShowForm(false); setForm(emptyForm); setLpoDocUrl(""); setLpoDocSignedUrl(""); setLpoDocName(""); setLpoDocSize(0); }}>Cancel</button>
          </div>
        </div>
      )}

      <div style={styles.grid(3)}>
        <StatCard label="Total Orders" value={orders.length} sub="All time" accent={theme.blue} />
        <StatCard label="Total Order Value" value={naira(totalValue)} sub="All orders" accent={theme.accent} />
        <StatCard label="Total Paid" value={naira(totalPaid)} sub="Confirmed payments" accent={theme.green} />
      </div>

      {loading ? <Spinner /> : (
        <div style={styles.grid(2)}>
          <div style={styles.card}>
            <div style={styles.sectionTitle}>All Orders</div>
            {orders.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px", color: theme.textMuted, fontSize: "13px" }}>No orders yet. Create your first order above.</div>
            ) : orders.map(o => {
              const total = orderTotal(o);
              const paid = orderPaid(o);
              return (
                <div key={o.id} onClick={() => setSelected(o)} style={{ padding: "14px", borderRadius: "8px", marginBottom: "8px", background: selected?.id === o.id ? "rgba(245,166,35,0.08)" : "transparent", border: `1px solid ${selected?.id === o.id ? theme.accent + "44" : theme.border}`, cursor: "pointer", transition: "all 0.15s" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontWeight: "600", fontSize: "14px" }}>{o.customer?.name || "—"}</div>
                      <div style={{ fontSize: "12px", color: theme.textMuted }}>{o.site?.site_name || o.customer?.location || "—"} · {o.marketer?.full_name || "No marketer"}</div>
                    </div>
                    <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                      {o.is_lpo && <span style={styles.badge(theme.blue)}>LPO</span>}
                      <span style={styles.badge(statusColor(o.status))}>{o.status}</span>
                      {userProfile?.role === 'md' && <button style={{ ...styles.btn("danger"), padding: "3px 9px", fontSize: "11px" }} onClick={e => { e.stopPropagation(); handleDeleteOrderClick(o); }}>Delete</button>}
                    </div>
                  </div>
                  <div style={{ marginTop: "8px", display: "flex", gap: "20px", fontSize: "12px", color: theme.textMuted }}>
                    <span>Value: <strong style={{ color: theme.text }}>{naira(total)}</strong></span>
                    <span>Paid: <strong style={{ color: theme.green }}>{naira(paid)}</strong></span>
                  </div>
                </div>
              );
            })}
          </div>

          <div style={styles.card}>
            {selected ? (() => {
              const total = orderTotal(selected);
              const paid = orderPaid(selected);
              const qty = orderQty(selected);
              return (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                    <div style={styles.sectionTitle}>Customer Statement — {selected.customer?.name}</div>
                    {!orderEditMode && canWriteOrder && <button style={{ ...styles.btn("secondary"), padding: "4px 12px", fontSize: "12px" }} onClick={() => startOrderEdit(selected)}>Edit Order</button>}
                  </div>
                  <div style={{ marginBottom: "12px", fontSize: "13px", color: theme.textMuted }}>{selected.customer?.location} · {selected.customer?.phone}</div>
                  {orderEditMode ? (
                    <div style={{ marginBottom: "16px", padding: "14px", background: theme.surface, borderRadius: "8px", border: `1px solid ${theme.accent}44` }}>
                      <div style={{ fontSize: "12px", fontWeight: "700", color: theme.textMuted, marginBottom: "10px", textTransform: "uppercase", letterSpacing: "0.06em" }}>Edit Order Items</div>
                      <div style={{ marginBottom: "10px" }}>
                        <label style={styles.label}>Marketer</label>
                        <select style={{ ...styles.input, maxWidth: "240px" }} value={orderEditMarketer} onChange={e => setOrderEditMarketer(e.target.value)}>
                          <option value="">— No marketer —</option>
                          {staff.map(s => <option key={s.id} value={s.id}>{s.full_name} ({s.role})</option>)}
                        </select>
                      </div>
                      {orderEditItems.map((item, idx) => (
                        <div key={idx} style={{ marginBottom: "10px", padding: item.sourceType === 'resale' ? "8px" : "0", background: item.sourceType === 'resale' ? theme.accent + "08" : "transparent", borderRadius: "6px", border: item.sourceType === 'resale' ? `1px solid ${theme.accent}33` : "1px solid transparent" }}>
                          <div style={{ display: "flex", gap: "8px", marginBottom: item.sourceType === 'resale' ? "6px" : "0", alignItems: "center" }}>
                            <ProductSelect value={item.blockType} onChange={(name, unit) => { const it = [...orderEditItems]; it[idx] = { ...it[idx], blockType: name, unit }; setOrderEditItems(it); }} style={{ ...styles.input, flex: 1 }} />
                            <input style={{ ...styles.input, flex: 1 }} type="number" placeholder="Qty" value={item.quantity} onChange={e => { const it = [...orderEditItems]; it[idx] = { ...it[idx], quantity: e.target.value }; setOrderEditItems(it); }} />
                            <input style={{ ...styles.input, flex: 1 }} type="number" placeholder="Unit Price" value={item.unitPrice} onChange={e => { const it = [...orderEditItems]; it[idx] = { ...it[idx], unitPrice: e.target.value }; setOrderEditItems(it); }} />
                            <div style={{ ...styles.input, flex: 1, background: "transparent", color: theme.accent, fontWeight: "700" }}>{item.quantity && item.unitPrice ? naira(parseInt(item.quantity) * parseFloat(item.unitPrice)) : "—"}</div>
                            <div style={{ display: "flex", gap: "3px", flexShrink: 0 }}>
                              {["manufactured", "resale"].map(t => (
                                <button key={t} type="button" style={{ ...styles.btn(item.sourceType === t ? "primary" : "secondary"), padding: "5px 8px", fontSize: "11px" }} onClick={() => { const it = [...orderEditItems]; it[idx] = { ...it[idx], sourceType: t }; setOrderEditItems(it); }}>
                                  {t === "manufactured" ? "Mfg" : "Resale"}
                                </button>
                              ))}
                            </div>
                            {orderEditItems.length > 1 && <button style={{ ...styles.btn("danger"), padding: "8px 10px" }} onClick={() => setOrderEditItems(orderEditItems.filter((_, i) => i !== idx))}>✕</button>}
                          </div>
                          {item.sourceType === 'resale' && (
                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                              <label style={{ ...styles.label, marginBottom: 0, fontSize: "12px", whiteSpace: "nowrap" }}>Partner cost (₦):</label>
                              <input style={{ ...styles.input, maxWidth: "180px" }} type="number" min="0" placeholder="Cost basis (optional)" value={item.costBasis} onChange={e => { const it = [...orderEditItems]; it[idx] = { ...it[idx], costBasis: e.target.value }; setOrderEditItems(it); }} />
                            </div>
                          )}
                        </div>
                      ))}
                      {orderEditItems.length < 5 && <button style={{ ...styles.btn("secondary"), fontSize: "12px", marginBottom: "10px" }} onClick={() => setOrderEditItems([...orderEditItems, emptyItem()])}>+ Add Item</button>}
                      <div style={styles.row}>
                        <button style={styles.btn("primary")} onClick={handleUpdateOrder}>Save Changes</button>
                        <button style={styles.btn("secondary")} onClick={() => setOrderEditMode(false)}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                  <div style={{ marginBottom: "16px" }}>
                    <div style={styles.sectionTitle}>Order Items</div>
                    {(selected.order_items || []).map((item, i) => (
                      <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${theme.border}22`, fontSize: "13px" }}>
                        <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          {item.block_type} × {fmt(item.quantity)}
                          {item.source_type === 'resale' && <span style={styles.badge(theme.blue)}>Resale{item.cost_basis != null ? ` · cost ${naira(item.cost_basis)}` : ''}</span>}
                        </span>
                        <span>{naira(item.subtotal || item.quantity * item.unit_price)}</span>
                      </div>
                    ))}
                    <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", fontWeight: "700" }}>
                      <span>Total Value</span>
                      <span style={{ color: theme.accent }}>{naira(total)}</span>
                    </div>
                  </div>
                  )}
                  <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    {[
                      { label: "Amount Paid", value: naira(paid), color: theme.green, pct: total ? (paid / total) * 100 : 0 },
                      { label: "Balance Outstanding", value: naira(total - paid), color: theme.red, pct: total ? ((total - paid) / total) * 100 : 0 },
                      { label: "Total Blocks Ordered", value: fmt(qty) + " blocks", color: theme.blue, pct: 100 },
                    ].map(row => (
                      <div key={row.label}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px" }}>
                          <span style={{ color: theme.textMuted }}>{row.label}</span>
                          <span style={{ color: row.color, fontWeight: "600" }}>{row.value}</span>
                        </div>
                        <div style={styles.progressBar()}><div style={styles.progressFill(row.pct, row.color)} /></div>
                      </div>
                    ))}
                  </div>
                  {(() => {
                    const allPayments = (selected.invoices || []).flatMap(inv => (inv.payments || []).map(p => ({ ...p, _invoiceTotal: inv.total_amount, _invoiceNumber: inv.invoice_number })));
                    const totalConfirmed = allPayments.filter(pp => pp.status === "confirmed").reduce((s, pp) => s + Number(pp.amount_paid), 0);
                    return allPayments.length > 0 ? (
                      <div style={{ marginTop: "16px", marginBottom: "4px" }}>
                        <div style={{ fontSize: "11px", fontWeight: "700", color: theme.textMuted, marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.06em" }}>Payment History</div>
                        {allPayments.map(p => (
                          <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${theme.border}22`, fontSize: "13px" }}>
                            <span style={{ color: theme.textMuted }}>{p.payment_date}</span>
                            <span style={{ color: theme.green, fontWeight: "600" }}>{naira(p.amount_paid)}</span>
                            <span style={styles.badge(p.status === "confirmed" ? theme.green : theme.accent)}>{p.status}</span>
                            <div style={{ display: "flex", gap: "6px" }}>
                              {p.status === "confirmed" && (
                                <button style={{ ...styles.btn("primary"), padding: "3px 8px", fontSize: "11px" }} onClick={() => generatePaymentReceiptPDF({ payment: p, customer: selected.customer, invoiceNumber: p._invoiceNumber, invoiceTotal: p._invoiceTotal || null, totalPaidSoFar: totalConfirmed })}>Receipt</button>
                              )}
                              {hasRole(userProfile, 'md', 'accountant') && <button style={{ ...styles.btn("secondary"), padding: "3px 8px", fontSize: "11px" }} onClick={() => { setEditPayment(p); setPayForm({ amount: String(p.amount_paid), date: p.payment_date }); setShowPayForm(true); }}>Edit</button>}
                              {userProfile?.role === 'md' && <button style={{ ...styles.btn("danger"), padding: "3px 8px", fontSize: "11px" }} onClick={() => setConfirmDelete({ ...p, type: "payment" })}>Remove</button>}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : null;
                  })()}
                  <div style={{ marginTop: "16px" }}>
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                      {(selected.invoices || []).length === 0 ? (
                        hasRole(userProfile, 'md', 'accountant', 'bdm') && <button style={styles.btn("primary")} onClick={handleGenerateInvoice} disabled={invoicing}>{invoicing ? "Opening…" : "Create Invoice (Draft)"}</button>
                      ) : (() => {
                        const inv = selected.invoices[0];
                        const status = inv.status || 'issued';
                        const badge = STATUS_BADGE[status] || STATUS_BADGE.issued;
                        const isDraft = status === 'draft';
                        const hasPayments = (inv.payments || []).length > 0;
                        const isMD = userProfile?.role === 'md';
                        // invoice_items / draft-content writers per RLS
                        const canEditContent = isDraft && hasRole(userProfile, 'md', 'accountant', 'bdm');
                        // Cancel: md/accountant, on a draft or issued invoice, never on paid
                        const canCancel = (isDraft || status === 'issued') && hasRole(userProfile, 'md', 'accountant');
                        // Delete matches RLS exactly: md unconditional; bdm only a draft with no payments
                        const canDelete = isMD || (userProfile?.role === 'bdm' && isDraft && !hasPayments);
                        return (
                        <>
                          <div style={{ width: "100%", display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", marginBottom: "6px" }}>
                            <span style={{ fontSize: "12px", color: theme.textMuted }}>Invoice: <strong style={{ color: theme.accent }}>{inv.invoice_number}</strong></span>
                            <span style={{ fontSize: "11px", fontWeight: "700", padding: "2px 8px", borderRadius: "10px", background: badge.color + '22', color: badge.color, textTransform: "uppercase", letterSpacing: "0.04em" }}>{badge.label}</span>
                            {status === 'cancelled' && inv.cancellation_reason && <span style={{ fontSize: "11px", color: theme.textMuted }}>· {inv.cancellation_reason}</span>}
                          </div>
                          <button style={styles.btn("primary")} onClick={() => handleDownloadInvoicePDF(inv)} disabled={invoicing}>{invoicing ? "Downloading…" : (isDraft ? "Download Proforma PDF" : "Download Invoice PDF")}</button>
                          {canEditContent && <button style={styles.btn("secondary")} onClick={handleGenerateInvoice} disabled={invoicing}>Edit Line Items</button>}
                          {canEditContent && <button style={{ ...styles.btn("primary"), background: theme.green }} onClick={() => setIssueTarget(inv)} disabled={invActioning}>Issue Invoice</button>}
                          {!isDraft && status !== 'cancelled' && hasRole(userProfile, 'md', 'accountant') && <button style={styles.btn("secondary")} onClick={() => setShowPayForm(!showPayForm)}>+ Record Payment</button>}
                          {canCancel && <button style={styles.btn("secondary")} onClick={() => { setCancelTarget(inv); setCancelReason(''); }} disabled={invActioning}>Cancel Invoice</button>}
                          {canDelete && <button style={{ ...styles.btn("danger"), opacity: invDeleting ? 0.6 : 1 }} disabled={invDeleting} onClick={() => handleDeleteInvoice(inv)}>Delete Invoice</button>}
                        </>
                        );
                      })()}
                      <button style={styles.btn("secondary")} onClick={() => onNavigate("waybills")}>View Waybills</button>
                    </div>
                    {invDeleteMsg && (
                      <div style={{ marginTop: "10px", padding: "10px 14px", background: theme.red + '18', border: `1px solid ${theme.red}44`, borderRadius: "6px", fontSize: "13px", color: theme.red, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span>{invDeleteMsg}</span>
                        <button style={{ background: "none", border: "none", color: theme.red, cursor: "pointer", fontWeight: "700", fontSize: "14px", padding: "0 4px" }} onClick={() => setInvDeleteMsg(null)}>×</button>
                      </div>
                    )}
                    {showPayForm && (
                      <div style={{ marginTop: "12px", padding: "14px", background: theme.surface, borderRadius: "8px", border: `1px solid ${theme.border}` }}>
                        <div style={{ fontSize: "11px", fontWeight: "700", color: theme.textMuted, marginBottom: "10px", textTransform: "uppercase", letterSpacing: "0.06em" }}>{editPayment ? "Edit Payment" : "Record Payment"}</div>
                        <div style={styles.row}>
                          <div style={{ flex: 1 }}>
                            <label style={styles.label}>Amount (₦)</label>
                            <input style={styles.input} type="number" placeholder="e.g. 500000" value={payForm.amount} onChange={e => setPayForm({ ...payForm, amount: e.target.value })} />
                          </div>
                          <div style={{ flex: 1 }}>
                            <label style={styles.label}>Payment Date</label>
                            <input style={styles.input} type="date" value={payForm.date} onChange={e => setPayForm({ ...payForm, date: e.target.value })} />
                          </div>
                        </div>
                        <div style={{ ...styles.row, marginTop: "10px" }}>
                          <button style={styles.btn("primary")} onClick={handleRecordPayment}>{editPayment ? "Update Payment" : "Confirm Payment"}</button>
                          <button style={styles.btn("secondary")} onClick={() => { setShowPayForm(false); setEditPayment(null); setPayForm({ amount: "", date: "" }); }}>Cancel</button>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              );
            })() : (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "200px", color: theme.textMuted, fontSize: "13px" }}>← Select an order to view details</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// ── WAYBILLS ──────────────────────────────────────────────────
const Waybills = ({ userProfile }) => {
  const [waybills, setWaybills] = useState([]);
  const [staff, setStaff] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [activeBatches, setActiveBatches] = useState([]);
  const [batchMap, setBatchMap] = useState({});
  const [activeOrders, setActiveOrders] = useState([]);
  const [scheduleItems, setScheduleItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [alert, setAlert] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [editTarget, setEditTarget] = useState(null);
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const emptyForm = { waybillDate: "", vehicleId: "", driverId: "", truckNumber: "", physicalWaybillNumber: "", blockType: "9 Inch 3 Hole Block", quantityLoaded: "", quantityReceived: "", quantityDamaged: "0", batchId: "", scheduleItemId: "", dieselLitres: "", storeOfficerId: "", signedByName: "", notes: "" };
  const [form, setForm] = useState(emptyForm);
  const [loaderAssignments, setLoaderAssignments] = useState([]);
  const [wbPool, setWbPool] = useState([]);
  const [waybillLoaders, setWaybillLoaders] = useState(null);
  const [loaderSearch, setLoaderSearch] = useState('');

  const isDriverRole = userProfile?.role === 'driver';
  const driverStaffId = userProfile?.staff_id;

  const load = async () => {
    setLoading(true);
    try {
      const fetchWaybills = isDriverRole && driverStaffId
        ? waybillsService.getAllForDriver(driverStaffId)
        : isDriverRole && !driverStaffId
          ? Promise.resolve([])
          : waybillsService.getAll();
      const [w, s, v, a, pool] = await Promise.all([
        fetchWaybills, staffService.getPublicActive(), vehiclesService.getActive().catch(() => []),
        truckLoadingService.getAssignments().catch(() => []),
        labourPoolService.getAll().catch(() => []),
      ]);
      setWaybills(w);
      setStaff(s);
      setVehicles(v);
      setLoaderAssignments(a);
      setWbPool(pool);
    } catch {
      setAlert({ type: "error", msg: "Could not load waybills." });
    }
    if (isDriverRole) { setLoading(false); return; } // drivers don't need orders/batches/schedules
    try {
      const [orders, activeBatches, allBatches, approvedScheds] = await Promise.all([
        ordersService.getForDelivery().catch(() => []),
        batchesService.getActive().catch(() => []),
        batchesService.getAll().catch(() => []),
        schedulesService.getApproved().catch(() => []),
      ]);
      setActiveOrders(orders.filter(o => ["invoiced", "in_progress", "lpo_approved"].includes(o.status)));
      setActiveBatches(activeBatches);
      setBatchMap(Object.fromEntries(allBatches.map(b => [b.id, b.batch_number])));
      const today = new Date().toISOString().split("T")[0];
      const items = approvedScheds.filter(s => s.schedule_date === today).flatMap(s => (s.items || []).map(it => ({ ...it, scheduleDate: s.schedule_date, scheduleId: s.id })));
      setScheduleItems(items);
    } catch {
      // silently fail — waybills still display, dropdown will be empty
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const selectedOrder = activeOrders.find(o => o.id === selectedOrderId) || null;

  const startEditWaybill = (w) => {
    setEditTarget(w);
    setForm({
      waybillDate: w.waybill_date, vehicleId: w.vehicle_id || "", driverId: w.driver_id || "",
      truckNumber: w.truck_number || "", physicalWaybillNumber: w.physical_waybill_number || "",
      blockType: w.block_type || "9 Inch 3 Hole Block",
      quantityLoaded: String(w.quantity_loaded || ""),
      quantityReceived: String(w.quantity_received || ""),
      quantityDamaged: String(w.quantity_damaged || 0),
      batchId: w.batch_id || "",
      scheduleItemId: w.schedule_item_id || "",
      dieselLitres: String(w.diesel_given_litres || ""),
      storeOfficerId: w.store_officer_id || "",
      signedByName: w.signed_by_name || "",
      notes: w.notes || "",
    });
    setWaybillLoaders(null);
    setLoaderSearch('');
    setSelectedOrderId("");
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!editTarget && !selectedOrderId) return setAlert({ type: "error", msg: "Select a customer with an active invoice before recording a waybill." });
    if (!form.waybillDate || !form.quantityLoaded) return setAlert({ type: "error", msg: "Date and quantity loaded are required." });
    // batch is optional — blocks dispatched from yard stock without a specific batch
    setSaving(true);
    setAlert(null);
    try {
      const damaged = parseInt(form.quantityDamaged) || 0;
      const dieselLitres = parseFloat(form.dieselLitres) || 0;
      const soName = staff.find(s => s.id === form.storeOfficerId)?.full_name || '';
      const waybillData = {
        vehicle_id: form.vehicleId || null,
        driver_id: form.driverId || null,
        truck_number: form.truckNumber || null,
        physical_waybill_number: form.physicalWaybillNumber || null,
        block_type: form.blockType,
        quantity_loaded: parseInt(form.quantityLoaded) || 0,
        quantity_received: parseInt(form.quantityReceived) || 0,
        quantity_damaged: damaged,
        waybill_date: form.waybillDate,
        schedule_item_id: form.scheduleItemId || null,
        diesel_given_litres: dieselLitres || null,
        store_officer_id: form.storeOfficerId || null,
        signed_by_name: form.signedByName || null,
        notes: form.notes || null,
      };

      if (editTarget) {
        const oldLoaded = Number(editTarget.quantity_loaded) || 0;
        const newLoaded = parseInt(form.quantityLoaded) || 0;
        // Reverse old effects
        try {
          await finishedGoodsService.increase(editTarget.block_type, oldLoaded);
          if (editTarget.batch_id) await batchesService.restoreStock(editTarget.batch_id, oldLoaded);
          await productionService.deleteTransitDamage(editTarget.waybill_number);
        } catch { /* non-blocking */ }
        // Save updated waybill
        await waybillsService.update(editTarget.id, { ...waybillData, batch_id: form.batchId || editTarget.batch_id || null });
        // Sync fuel log for this waybill
        try {
          if (form.vehicleId || editTarget.vehicle_id) {
            await fuelLogService.upsertForWaybill(form.vehicleId || editTarget.vehicle_id, editTarget.id, form.waybillDate, dieselLitres, soName);
          }
        } catch { /* non-blocking */ }
        // Sync loaders if user explicitly set them
        if (waybillLoaders !== null) {
          try {
            const logRow = await truckLoadingService.getLogByWaybill(editTarget.id);
            if (logRow) await truckLoadingService.syncLoaders(logRow.id, waybillLoaders);
          } catch { /* non-blocking */ }
        }
        // Apply new effects
        try {
          await finishedGoodsService.decrease(form.blockType, newLoaded);
          if (form.batchId) await batchesService.reduceStock(form.batchId, newLoaded);
          if (damaged > 0) {
            await productionService.logDamage({ date: form.waybillDate, block_type: form.blockType, stage: "delivery", quantity_damaged: damaged, notes: `Transit damage on waybill ${editTarget.waybill_number}` });
          }
          if (editTarget.order_id) {
            const pending = await pendingDeliveryService.getByOrder(editTarget.order_id);
            for (const entry of pending) {
              if (entry.block_type === form.blockType) await pendingDeliveryService.resyncFromWaybills(entry);
            }
          }
        } catch { /* non-blocking */ }
        await load();
        setAlert({ type: "success", msg: `Waybill ${editTarget.waybill_number} updated and stock adjusted.` });
      } else {
        let waybillNumber = `APC-WB-${String(await waybillsService.getNextNumber()).padStart(3, "0")}`;
        const qtyLoaded = parseInt(form.quantityLoaded) || 0;
        const qtyReceived = parseInt(form.quantityReceived) || 0;
        let created;
        try {
          created = await waybillsService.create({ ...waybillData, batch_id: form.batchId || null, waybill_number: waybillNumber, receiver_name: selectedOrder?.customer?.name || null, order_id: selectedOrder?.id || null });
        } catch (createErr) {
          if (createErr.code === '23505') {
            waybillNumber = `APC-WB-${String(await waybillsService.getNextNumber()).padStart(3, "0")}`;
            created = await waybillsService.create({ ...waybillData, batch_id: form.batchId || null, waybill_number: waybillNumber, receiver_name: selectedOrder?.customer?.name || null, order_id: selectedOrder?.id || null });
          } else {
            throw createErr;
          }
        }
        if (damaged > 0) {
          await productionService.logDamage({ date: form.waybillDate, block_type: form.blockType, stage: "delivery", quantity_damaged: damaged, notes: `Transit damage on waybill ${waybillNumber}` });
        }
        // Auto-create fuel log entry if diesel was given
        try {
          if (form.vehicleId && dieselLitres > 0) {
            await fuelLogService.upsertForWaybill(form.vehicleId, created.id, form.waybillDate, dieselLitres, soName);
          }
        } catch { /* non-blocking */ }
        // Sync loaders if user explicitly set them (trigger may have already populated from standing crew)
        if (waybillLoaders !== null) {
          try {
            const logRow = await truckLoadingService.getLogByWaybill(created.id);
            if (logRow) await truckLoadingService.syncLoaders(logRow.id, waybillLoaders);
          } catch { /* non-blocking */ }
        }
        // Side effects (non-blocking)
        try {
          if (qtyLoaded > 0) await finishedGoodsService.decrease(form.blockType, qtyLoaded);
          if (form.batchId && qtyLoaded > 0) await batchesService.reduceStock(form.batchId, qtyLoaded);
          if (qtyReceived > 0 && selectedOrder) {
            const pending = await pendingDeliveryService.getByOrder(selectedOrder.id);
            const match = pending.find(p => p.block_type === form.blockType);
            if (match) {
              const synced = await pendingDeliveryService.resyncFromWaybills(match);
              if (!synced) await pendingDeliveryService.updateDelivered(match.id, qtyReceived);
            }
          }
        } catch { /* side effects optional */ }
        await load();
        setAlert({ type: "success", msg: `Waybill ${waybillNumber} recorded for ${selectedOrder?.customer?.name}${damaged > 0 ? " — transit damage logged automatically." : ""}${form.vehicleId && dieselLitres > 0 ? ` · ${dieselLitres}L fuel logged to vehicle.` : "."}` });
      }
      setForm(emptyForm);
      setSelectedOrderId("");
      setShowForm(false);
      setEditTarget(null);
      setWaybillLoaders(null);
      setLoaderSearch('');
    } catch (e) {
      setAlert({ type: "error", msg: "Failed to save waybill. " + e.message });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteWaybill = async (waybill) => {
    try {
      // Step 1 — Restore finished goods stock
      try { await finishedGoodsService.increase(waybill.block_type, waybill.quantity_loaded); } catch {}
      // Step 2 — Restore batch stock
      try { if (waybill.batch_id) await batchesService.restoreStock(waybill.batch_id, waybill.quantity_loaded); } catch {}
      // Step 3 — Reverse transit damage log entry
      try { await productionService.deleteTransitDamage(waybill.waybill_number); } catch {}
      // Step 3b — Delete linked fuel log entry
      try { await fuelLogService.deleteByWaybill(waybill.id); } catch {}
      // Step 4 — Delete the waybill record
      await waybillsService.delete(waybill.id);
      // Step 5 — Resync pending delivery register (waybill is now gone so recount is accurate)
      try {
        if (waybill.order_id) {
          const pending = await pendingDeliveryService.getByOrder(waybill.order_id);
          for (const entry of pending) {
            if (entry.block_type === waybill.block_type) await pendingDeliveryService.resyncFromWaybills(entry);
          }
        }
      } catch {}
      await load();
      setAlert({ type: "success", msg: `Waybill ${waybill.waybill_number} deleted — finished goods, batch and pending delivery register all reversed.` });
    } catch (e) {
      setAlert({ type: "error", msg: "Failed to delete waybill. " + e.message });
    } finally {
      setConfirmDelete(null);
    }
  };

  const totalLoaded = waybills.reduce((s, w) => s + (w.quantity_loaded || 0), 0);
  const totalDamaged = waybills.reduce((s, w) => s + (w.quantity_damaged || 0), 0);
  const damageRate = totalLoaded > 0 ? ((totalDamaged / totalLoaded) * 100).toFixed(2) : "0.00";

  if (isDriverRole && !driverStaffId) {
    return (
      <div style={{ ...styles.card, textAlign: "center", padding: "48px 32px", maxWidth: "480px", margin: "40px auto" }}>
        <div style={{ fontSize: "48px", marginBottom: "16px" }}>🚛</div>
        <div style={{ fontWeight: "700", fontSize: "16px", color: theme.text, marginBottom: "10px" }}>Driver Record Not Linked</div>
        <div style={{ fontSize: "13px", color: theme.textMuted, lineHeight: "1.6" }}>
          Your account is not linked to a driver record yet. Please contact HR or the MD to link your account to your staff record so your waybills appear here.
        </div>
      </div>
    );
  }

  return (
    <div>
      {confirmDelete && <ConfirmModal
        msg={<div>
          <div style={{ fontWeight: "700", marginBottom: "8px" }}>Delete Waybill {confirmDelete.waybill_number}?</div>
          <div style={{ fontSize: "12px", color: theme.textMuted, marginBottom: "10px" }}>This will:</div>
          <ul style={{ fontSize: "12px", color: theme.textMuted, paddingLeft: "18px", lineHeight: "1.9", margin: 0 }}>
            <li>Restore <strong style={{ color: theme.text }}>{Number(confirmDelete.quantity_loaded).toLocaleString()} {confirmDelete.block_type}</strong> blocks to finished goods stock</li>
            {confirmDelete.batch_id && <li>Restore <strong style={{ color: theme.text }}>{Number(confirmDelete.quantity_loaded).toLocaleString()}</strong> blocks to batch <strong style={{ color: theme.text }}>{batchMap[confirmDelete.batch_id] || "—"}</strong></li>}
            <li>Remove <strong style={{ color: theme.text }}>{Number(confirmDelete.quantity_received).toLocaleString()}</strong> blocks from {confirmDelete.receiver_name || "customer"}'s delivered count</li>
            {(confirmDelete.quantity_damaged > 0) && <li>Reverse <strong style={{ color: theme.red }}>{confirmDelete.quantity_damaged}</strong> transit damage record</li>}
          </ul>
          <div style={{ fontSize: "11px", color: theme.red, marginTop: "10px" }}>This action cannot be undone.</div>
        </div>}
        onConfirm={() => handleDeleteWaybill(confirmDelete)}
        onCancel={() => setConfirmDelete(null)}
      />}
      <div style={styles.header}>
        <div>
          <div style={styles.pageTitle}>Waybill Records</div>
          <div style={styles.pageSubtitle}>Track every delivery trip — loaded, received, and damaged quantities</div>
        </div>
        {!isDriverRole && <button style={styles.btn("primary")} onClick={() => setShowForm(!showForm)}>+ Record Waybill</button>}
      </div>

      {isDriverRole && (
        <div style={{ background: theme.blue+'11', border: `1px solid ${theme.blue}33`, borderRadius: '8px', padding: '10px 16px', marginBottom: '16px', fontSize: '12px', color: theme.blue }}>
          👁 Showing only waybills assigned to you.
        </div>
      )}

      {alert && <Alert msg={alert.msg} type={alert.type} onClose={() => setAlert(null)} />}

      {showForm && (
        <div style={{ ...styles.card, marginBottom: "24px", borderColor: theme.accent + "44" }}>
          <div style={styles.sectionTitle}>{editTarget ? `Edit Waybill — ${editTarget.waybill_number}` : "New Waybill Entry"}</div>
          <div style={styles.grid(3)}>
            <div style={styles.formGroup}>
              <label style={styles.label}>Date *</label>
              <input style={styles.input} type="date" value={form.waybillDate} onChange={e => setForm({ ...form, waybillDate: e.target.value })} />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Vehicle</label>
              <select style={styles.input} value={form.vehicleId} onChange={e => {
                const v = vehicles.find(v => v.id === e.target.value);
                const crew = loaderAssignments.filter(a => a.vehicle_id === e.target.value).map(a => a.labour_id);
                setWaybillLoaders(crew);
                setLoaderSearch('');
                setForm({ ...form, vehicleId: e.target.value, truckNumber: v?.vehicle_number || form.truckNumber, driverId: v?.assigned_driver_id || form.driverId });
              }}>
                <option value="">— Select vehicle (optional) —</option>
                {vehicles.map(v => <option key={v.id} value={v.id}>{v.vehicle_number}{v.vehicle_name ? ` — ${v.vehicle_name}` : ""}</option>)}
              </select>
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Driver</label>
              <select style={styles.input} value={form.driverId} onChange={e => setForm({ ...form, driverId: e.target.value })}>
                <option value="">— Select driver —</option>
                {staff.filter(s => s.role?.trim().toLowerCase() === 'driver').map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}
              </select>
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Truck / Plate Number</label>
              <input style={styles.input} placeholder="e.g. ABC-123-AA" value={form.truckNumber} onChange={e => setForm({ ...form, truckNumber: e.target.value })} />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Physical Waybill No. (Manual)</label>
              <input style={styles.input} placeholder="e.g. WB-0042 (from physical book)" value={form.physicalWaybillNumber} onChange={e => setForm({ ...form, physicalWaybillNumber: e.target.value })} />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Block Type</label>
              <ProductSelect value={form.blockType} onChange={(name) => setForm({ ...form, blockType: name })} style={styles.input} />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Quantity Loaded *</label>
              <input style={styles.input} type="number" placeholder="e.g. 500" value={form.quantityLoaded} onChange={e => setForm({ ...form, quantityLoaded: e.target.value })} />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Quantity Received</label>
              <input style={styles.input} type="number" placeholder="e.g. 498" value={form.quantityReceived} onChange={e => setForm({ ...form, quantityReceived: e.target.value })} />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Batch Number</label>
              <select style={styles.input} value={form.batchId} onChange={e => setForm({ ...form, batchId: e.target.value })}>
                <option value="">— Select batch (optional) —</option>
                {activeBatches.filter(b => !form.blockType || b.block_type === form.blockType).map(b => (
                  <option key={b.id} value={b.id}>{b.batch_number} — {b.block_type} ({Number(b.qty_remaining).toLocaleString()} remaining)</option>
                ))}
              </select>
            </div>
            {scheduleItems.length > 0 && (
              <div style={styles.formGroup}>
                <label style={styles.label}>Link to Schedule Item (today)</label>
                <select style={styles.input} value={form.scheduleItemId} onChange={e => {
                  const item = scheduleItems.find(i => i.id === e.target.value);
                  setForm(f => ({ ...f, scheduleItemId: e.target.value, ...(item ? { blockType: item.block_type, quantityLoaded: String(item.qty_scheduled) } : {}) }));
                }}>
                  <option value="">— Optional: link to today's approved schedule —</option>
                  {scheduleItems.map(i => <option key={i.id} value={i.id}>{i.customer?.name || "Customer"} · {i.block_type} · {Number(i.qty_scheduled).toLocaleString()} blocks</option>)}
                </select>
              </div>
            )}
            <div style={styles.formGroup}>
              <label style={styles.label}>Quantity Damaged in Transit</label>
              <input style={styles.input} type="number" placeholder="0" value={form.quantityDamaged} onChange={e => setForm({ ...form, quantityDamaged: e.target.value })} />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Store Officer</label>
              <select style={styles.input} value={form.storeOfficerId} onChange={e => setForm({ ...form, storeOfficerId: e.target.value })}>
                <option value="">— Select store officer —</option>
                {staff.filter(s => s.role?.trim().toLowerCase() === 'store officer').map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}
              </select>
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Receiver's Signature (Name)</label>
              <input style={styles.input} placeholder="Name of person who received and signed for the delivery" value={form.signedByName} onChange={e => setForm({ ...form, signedByName: e.target.value })} />
            </div>
            {form.vehicleId && (
              <div style={styles.formGroup}>
                <label style={styles.label}>Diesel Given to Driver (litres)</label>
                <input style={styles.input} type="number" placeholder="e.g. 80" value={form.dieselLitres} onChange={e => setForm({ ...form, dieselLitres: e.target.value })} />
              </div>
            )}
            {editTarget ? (
              <div style={styles.formGroup}>
                <label style={styles.label}>Receiver</label>
                <input style={{ ...styles.input, color: theme.textMuted }} value={editTarget.receiver_name || "—"} readOnly />
              </div>
            ) : (
              <div style={styles.formGroup}>
                <label style={styles.label}>Receiver (Customer with Active Invoice) *</label>
                <select style={{ ...styles.input, borderColor: !selectedOrderId ? theme.red + "88" : theme.border }} value={selectedOrderId} onChange={e => setSelectedOrderId(e.target.value)}>
                  <option value="">— Select customer —</option>
                  {activeOrders.map(o => (
                    <option key={o.id} value={o.id}>
                      {o.customer?.name}{o.customer?.location ? ` · ${o.customer.location}` : ""} — {o.invoices?.[0]?.invoice_number || "Invoice"}
                    </option>
                  ))}
                </select>
                {activeOrders.length === 0 && <div style={{ fontSize: "11px", color: theme.red, marginTop: "4px" }}>No invoiced orders found. Contact your administrator if an order should appear here.</div>}
              </div>
            )}
            <div style={styles.formGroup}>
              <label style={styles.label}>Notes</label>
              <input style={styles.input} placeholder="Optional notes" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
          {form.vehicleId && wbPool.length > 0 && (
            <div style={{ marginBottom: '14px' }}>
              <label style={styles.label}>Loaders (optional)</label>
              {waybillLoaders !== null ? (
                <div>
                  {waybillLoaders.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '6px' }}>
                      {waybillLoaders.map(lid => {
                        const worker = wbPool.find(p => p.id === lid);
                        return (
                          <span key={lid} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: theme.accent + '22', border: `1px solid ${theme.accent}44`, borderRadius: '4px', padding: '3px 8px', fontSize: '12px', color: theme.text }}>
                            {worker?.full_name || lid}
                            <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: theme.red, padding: 0, fontSize: '13px', lineHeight: 1 }}
                              onClick={() => setWaybillLoaders(l => l.filter(x => x !== lid))}>×</button>
                          </span>
                        );
                      })}
                    </div>
                  )}
                  <div style={{ position: 'relative' }}>
                    <input
                      style={{ ...styles.input, marginBottom: '2px' }}
                      placeholder="Search to add a loader…"
                      value={loaderSearch}
                      onChange={e => setLoaderSearch(e.target.value)}
                    />
                    {loaderSearch.trim() && (
                      <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: theme.card, border: `1px solid ${theme.border}`, borderRadius: '6px', zIndex: 10, maxHeight: '180px', overflowY: 'auto' }}>
                        {wbPool
                          .filter(p => !waybillLoaders.includes(p.id) && p.full_name.toLowerCase().includes(loaderSearch.toLowerCase()))
                          .slice(0, 8)
                          .map(p => (
                            <div key={p.id}
                              style={{ padding: '8px 12px', cursor: 'pointer', fontSize: '13px', color: theme.text }}
                              onClick={() => { setWaybillLoaders(l => [...l, p.id]); setLoaderSearch(''); }}
                              onMouseEnter={e => e.currentTarget.style.background = theme.surface}
                              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                            >
                              {p.full_name}
                            </div>
                          ))
                        }
                        {wbPool.filter(p => !waybillLoaders.includes(p.id) && p.full_name.toLowerCase().includes(loaderSearch.toLowerCase())).length === 0 && (
                          <div style={{ padding: '8px 12px', fontSize: '12px', color: theme.textMuted }}>No matches</div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '12px', color: theme.textMuted }}>
                    {editTarget ? 'Loaders set by trigger.' : 'Standing crew will be auto-assigned.'}
                  </span>
                  <button style={{ ...styles.btn('secondary'), fontSize: '12px' }}
                    onClick={() => {
                      const crew = loaderAssignments.filter(a => a.vehicle_id === form.vehicleId).map(a => a.labour_id);
                      setWaybillLoaders(crew);
                    }}>
                    Override
                  </button>
                </div>
              )}
            </div>
          )}
          {parseInt(form.quantityDamaged) > 0 && (
            <div style={{ ...styles.alert("error"), marginBottom: "14px" }}>
              <span>⚠️ {form.quantityDamaged} damaged blocks will be automatically logged to the damage register as transit damage.</span>
            </div>
          )}
          <div style={styles.row}>
            <button style={styles.btn("primary")} onClick={handleSave} disabled={saving}>{saving ? "Saving…" : editTarget ? "Update Waybill" : "Record Waybill"}</button>
            <button style={styles.btn("secondary")} onClick={() => { setShowForm(false); setForm(emptyForm); setSelectedOrderId(""); setEditTarget(null); setWaybillLoaders(null); setLoaderSearch(''); }}>Cancel</button>
          </div>
        </div>
      )}

      <div style={styles.grid(3)}>
        <StatCard label="Total Waybills" value={waybills.length} sub="All trips" accent={theme.blue} />
        <StatCard label="Total Loaded" value={fmt(totalLoaded)} sub="Blocks dispatched" accent={theme.accent} />
        <StatCard label="Transit Damage" value={fmt(totalDamaged)} sub={`${damageRate}% damage rate`} accent={theme.red} />
      </div>

      <div style={styles.card}>
        <div style={styles.sectionTitle}>Waybill Log</div>
        {loading ? <Spinner /> : waybills.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px", color: theme.textMuted, fontSize: "13px" }}>No waybills recorded yet.</div>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>{["APC Waybill No.", "Physical WB No.", "Date", "Driver", "Truck", "Block Type", "Loaded", "Received", "Damaged", "Receiver", ""].map(h => <th key={h} style={styles.th}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {waybills.map(w => (
                <tr key={w.id}>
                  <td style={styles.td}><span style={{ color: theme.accent, fontWeight: "600" }}>{w.waybill_number}</span></td>
                  <td style={styles.td}>{w.physical_waybill_number ? <span style={{ color: theme.textMuted, fontSize: "12px" }}>{w.physical_waybill_number}</span> : <span style={{ color: theme.textDim, fontSize: "11px" }}>—</span>}</td>
                  <td style={styles.td}>{w.waybill_date}</td>
                  <td style={styles.td}>{w.driver?.full_name || "—"}</td>
                  <td style={styles.td}>{w.truck_number || "—"}</td>
                  <td style={styles.td}><span style={styles.badge(theme.blue)}>{w.block_type}</span></td>
                  <td style={styles.td}>{fmt(w.quantity_loaded)}</td>
                  <td style={styles.td}><strong style={{ color: theme.green }}>{fmt(w.quantity_received)}</strong></td>
                  <td style={styles.td}><span style={styles.badge(w.quantity_damaged > 0 ? theme.red : theme.green)}>{w.quantity_damaged}</span></td>
                  <td style={styles.td}>{w.receiver_name || "—"}{w.schedule_item_id && <div style={{ fontSize: "10px", color: theme.green, marginTop: "2px" }}>✓ Scheduled</div>}</td>
                  <td style={styles.td}>
                    <div style={{ display: "flex", gap: "6px" }}>
                      <button style={{ ...styles.btn("secondary"), padding: "4px 10px", fontSize: "11px" }} onClick={() => {
                        const driver = staff.find(s => s.id === w.driver_id);
                        generateWaybillPDF({ waybill_number: w.waybill_number, physical_waybill_number: w.physical_waybill_number || "", date: w.waybill_date, customer_name: w.receiver_name, customer_location: w.order?.customer?.location || "", block_type: w.block_type, quantity_loaded: w.quantity_loaded, batch_number: batchMap[w.batch_id] || "", driver_name: driver?.full_name || "", truck_number: w.truck_number || "", notes: w.notes || "" });
                      }}>PDF</button>
                      <button style={{ ...styles.btn("secondary"), padding: "4px 10px", fontSize: "11px" }} onClick={() => startEditWaybill(w)}>Edit</button>
                      <button style={{ ...styles.btn("danger"), padding: "4px 10px", fontSize: "11px" }} onClick={() => setConfirmDelete(w)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

// ── SITE ADDRESS SELECT ───────────────────────────────────────
const SiteAddressSelect = ({ value, onChange, inputStyle }) => {
  const isCustom = value !== '' && !ABUJA_AREAS.includes(value);
  const selectVal = isCustom ? '__other__' : (value || '');
  return (
    <div>
      <select
        style={inputStyle}
        value={selectVal}
        onChange={e => {
          if (e.target.value === '__other__') onChange('__other__');
          else onChange(e.target.value);
        }}
      >
        <option value="">— Select area —</option>
        {ABUJA_AREAS.map(a => <option key={a} value={a}>{a}, Abuja</option>)}
        <option value="__other__">Other (type manually)</option>
      </select>
      {(selectVal === '__other__' || isCustom) && (
        <input
          style={{ ...inputStyle, marginTop: '6px' }}
          placeholder="Type full delivery address…"
          value={value === '__other__' ? '' : value}
          onChange={e => onChange(e.target.value)}
        />
      )}
    </div>
  );
};

// ── CUSTOMER FORM (top-level to avoid focus loss on re-render) ────
const CustomerForm = ({ form, setForm, staff, saving, onSubmit, onCancel, submitLabel }) => (
  <div style={{ ...styles.card, marginBottom: "24px", borderColor: theme.accent + "44" }}>
    <div style={styles.sectionTitle}>{submitLabel === "Register" ? "Register New Customer" : "Edit Customer"}</div>

    <div style={{ fontSize: "11px", fontWeight: "700", color: theme.textMuted, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "10px" }}>Company Details</div>
    <div style={styles.grid(3)}>
      <div style={styles.formGroup}>
        <label style={styles.label}>Contact Name *</label>
        <input style={styles.input} placeholder="e.g. Emeka Okafor" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
      </div>
      <div style={styles.formGroup}>
        <label style={styles.label}>Company Name</label>
        <input style={styles.input} placeholder="e.g. MACC Projects Limited" value={form.company_name} onChange={e => setForm({ ...form, company_name: e.target.value })} />
      </div>
      <div style={styles.formGroup}>
        <label style={styles.label}>Phone *</label>
        <input style={styles.input} placeholder="+234…" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
      </div>
      <div style={styles.formGroup}>
        <label style={styles.label}>Email</label>
        <input style={styles.input} placeholder="Optional" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
      </div>
      <div style={styles.formGroup}>
        <label style={styles.label}>How They Heard About Us</label>
        <select style={styles.input} value={form.how_heard} onChange={e => setForm({ ...form, how_heard: e.target.value })}>
          <option value="">— Select —</option>
          {HOW_HEARD.map(h => <option key={h.value} value={h.value}>{h.label}</option>)}
        </select>
      </div>
      <div style={styles.formGroup}>
        <label style={styles.label}>Marketer</label>
        <select style={styles.input} value={form.added_by} onChange={e => setForm({ ...form, added_by: e.target.value })}>
          <option value="">— None —</option>
          {staff.map(s => <option key={s.id} value={s.id}>{s.full_name} ({s.role})</option>)}
        </select>
      </div>
      <div style={styles.formGroup}>
        <label style={styles.label}>Date Registered</label>
        <input style={styles.input} type="date" value={form.date_registered} onChange={e => setForm({ ...form, date_registered: e.target.value })} />
      </div>
    </div>

    {submitLabel === "Register" && (
      <>
        <div style={{ borderTop: `1px solid ${theme.border}`, margin: "16px 0 12px" }} />
        <div style={{ fontSize: "11px", fontWeight: "700", color: theme.textMuted, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "10px" }}>First Delivery Site</div>
        <div style={styles.grid(2)}>
          <div style={styles.formGroup}>
            <label style={styles.label}>Site Name</label>
            <input style={styles.input} placeholder="e.g. Katampe Site" value={form.site_name} onChange={e => setForm({ ...form, site_name: e.target.value })} />
          </div>
          <div style={styles.formGroup}>
            <label style={styles.label}>Delivery Address</label>
            <SiteAddressSelect value={form.site_address} onChange={v => setForm({ ...form, site_address: v })} inputStyle={styles.input} />
          </div>
          <div style={styles.formGroup}>
            <label style={styles.label}>Site Contact Name</label>
            <input style={styles.input} placeholder="Person at this site" value={form.site_contact_name} onChange={e => setForm({ ...form, site_contact_name: e.target.value })} />
          </div>
          <div style={styles.formGroup}>
            <label style={styles.label}>Site Contact Phone</label>
            <input style={styles.input} placeholder="+234…" value={form.site_contact_phone} onChange={e => setForm({ ...form, site_contact_phone: e.target.value })} />
          </div>
        </div>
      </>
    )}

    <div style={styles.row}>
      <button style={styles.btn("primary")} onClick={onSubmit} disabled={saving}>{saving ? "Saving…" : submitLabel}</button>
      <button style={styles.btn("secondary")} onClick={onCancel}>Cancel</button>
    </div>
  </div>
);

// ── CUSTOMERS ─────────────────────────────────────────────────
const Customers = ({ userProfile }) => {
  const [customers, setCustomers] = useState([]);
  const [staff, setStaff] = useState([]);
  const [selected, setSelected] = useState(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [alert, setAlert] = useState(null);
  const today = new Date().toISOString().split("T")[0];
  const emptyForm = { name: "", company_name: "", phone: "", email: "", location: "", how_heard: "", added_by: "", date_registered: today, site_name: "Main Site", site_address: "", site_contact_name: "", site_contact_phone: "" };
  const [form, setForm] = useState(emptyForm);
  const [stmtFrom, setStmtFrom] = useState("");
  const [stmtTo, setStmtTo] = useState("");
  const [stmtLoading, setStmtLoading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [custWaybills, setCustWaybills] = useState([]);
  const [waybillsLoading, setWaybillsLoading] = useState(false);
  const [waybillFrom, setWaybillFrom] = useState("");
  const [waybillTo, setWaybillTo] = useState("");
  const [waybillPdfLoading, setWaybillPdfLoading] = useState(false);
  const [sites, setSites] = useState([]);
  const [sitesLoading, setSitesLoading] = useState(false);
  const [showAddSite, setShowAddSite] = useState(false);
  const [siteForm, setSiteForm] = useState({ site_name: "", site_address: "", site_contact_name: "", site_contact_phone: "" });
  const [savingSite, setSavingSite] = useState(false);
  const [stmtSiteId, setStmtSiteId] = useState("");

  const isMarketer = userProfile?.role === 'marketer';
  const AMOUNT_ROLES = ['md','accountant','ico','board_member','bdm','marketer'];
  const canSeeAmounts = hasRole(userProfile, ...AMOUNT_ROLES);

  const load = async () => {
    setLoading(true);
    try {
      const fetchCustomers = isMarketer
        ? customersService.getAllWithStatsForMarketer(userProfile.id)
        : customersService.getAllWithStats();
      const [c, s] = await Promise.all([fetchCustomers, staffService.getPublicList()]);
      setCustomers(c);
      setStaff(s);
      return c;
    } catch {
      setAlert({ type: "error", msg: "Could not load customers." });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!selected) { setCustWaybills([]); return; }
    setWaybillsLoading(true);
    Promise.all([
      waybillsService.getByReceiverName(selected.name),
      batchesService.getAll().catch(() => []),
    ]).then(([wbs, batches]) => {
      const batchMap = Object.fromEntries(batches.map(b => [b.id, b.batch_number]));
      setCustWaybills(wbs.map(w => ({ ...w, batch_number: batchMap[w.batch_id] || null })));
    }).catch(() => setCustWaybills([]))
      .finally(() => setWaybillsLoading(false));
  }, [selected?.id]);

  useEffect(() => {
    if (!selected) { setSites([]); setShowAddSite(false); setStmtSiteId(""); return; }
    setSitesLoading(true);
    customerSitesService.getByCustomer(selected.id)
      .then(setSites)
      .catch(() => setSites([]))
      .finally(() => setSitesLoading(false));
  }, [selected?.id]);

  const filtered = customers.filter(c => {
    const q = search.toLowerCase();
    return !q || [c.name, c.phone, c.location, c.company_name].some(f => f?.toLowerCase().includes(q));
  });

  const getStats = (c) => {
    const orders = c.orders || [];
    // A draft is a quotation and a cancelled invoice is void — neither counts
    // toward what a customer owes (liveInvoices). Fall back to order line items
    // only when the order has no live invoice (same as before for un-invoiced).
    const totalValue = orders.reduce((s, o) => {
      const invoiced = liveInvoices(o.invoices).reduce((si, inv) => si + Number(inv.total_amount ?? 0), 0);
      const itemTotal = (o.order_items || []).reduce((si, i) => si + Number(i.subtotal ?? i.quantity * i.unit_price), 0);
      return s + (invoiced !== 0 ? invoiced : itemTotal);
    }, 0);
    const totalPaid = orders.reduce((s, o) => s + liveInvoices(o.invoices).flatMap(inv => inv.payments || []).filter(p => p.status === "confirmed").reduce((sp, p) => sp + Number(p.amount_paid), 0), 0);
    return { totalValue, totalPaid, outstanding: totalValue - totalPaid, orderCount: orders.length };
  };

  const startEdit = (c) => {
    setForm({ name: c.name || "", company_name: c.company_name || "", phone: c.phone || "", email: c.email || "", location: c.location || "", how_heard: c.how_heard || "", added_by: c.added_by || "", date_registered: c.date_registered || today });
    setEditMode(true);
  };

  const handleSave = async () => {
    if (!form.name || !form.phone) return setAlert({ type: "error", msg: "Name and phone are required." });
    setSaving(true);
    try {
      const siteAddr = form.site_address === '__other__' ? '' : (form.site_address || null);
      const payload = { name: form.name, company_name: form.company_name || null, phone: form.phone, email: form.email || null, location: siteAddr, how_heard: form.how_heard || null, added_by: form.added_by || null, date_registered: form.date_registered || today };
      const saved = await customersService.create(payload);
      try {
        await customerSitesService.create({
          customer_id: saved.id,
          site_name: form.site_name || 'Main Site',
          site_address: siteAddr,
          site_contact_name: form.site_contact_name || null,
          site_contact_phone: form.site_contact_phone || null,
          is_active: true,
        });
      } catch { /* site creation optional */ }
      const newList = await load();
      setShowForm(false);
      setForm(emptyForm);
      if (newList) setSelected(newList.find(c => c.id === saved.id) || null);
      setAlert({ type: "success", msg: `${saved.name} registered successfully!` });
    } catch (e) {
      setAlert({ type: "error", msg: "Failed to register. " + e.message });
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async () => {
    if (!form.name || !form.phone) return setAlert({ type: "error", msg: "Name and phone are required." });
    setSaving(true);
    try {
      await customersService.update(selected.id, { name: form.name, company_name: form.company_name || null, phone: form.phone, email: form.email || null, location: form.location || null, how_heard: form.how_heard || null, added_by: form.added_by || null });
      const newList = await load();
      if (newList) setSelected(newList.find(c => c.id === selected.id) || null);
      setEditMode(false);
      setAlert({ type: "success", msg: "Customer updated!" });
    } catch (e) {
      setAlert({ type: "error", msg: "Failed to update. " + e.message });
    } finally {
      setSaving(false);
    }
  };

  const handleAddSite = async () => {
    if (!siteForm.site_name) return setAlert({ type: "error", msg: "Site name is required." });
    setSavingSite(true);
    try {
      const addr = siteForm.site_address === '__other__' ? '' : (siteForm.site_address || null);
      await customerSitesService.create({
        customer_id: selected.id,
        site_name: siteForm.site_name,
        site_address: addr,
        site_contact_name: siteForm.site_contact_name || null,
        site_contact_phone: siteForm.site_contact_phone || null,
        is_active: true,
      });
      setSites(await customerSitesService.getByCustomer(selected.id));
      setSiteForm({ site_name: "", site_address: "", site_contact_name: "", site_contact_phone: "" });
      setShowAddSite(false);
      setAlert({ type: "success", msg: "Site added!" });
    } catch (e) {
      setAlert({ type: "error", msg: "Failed to add site: " + e.message });
    } finally {
      setSavingSite(false);
    }
  };

  const howHeardLabel = (v) => HOW_HEARD.find(h => h.value === v)?.label || v || "—";

  const handleDeleteCustomer = async () => {
    const c = confirmDelete;
    setConfirmDelete(null);
    try {
      await customersService.delete(c.id);
      setSelected(null);
      setAlert({ type: "success", msg: `${c.name} has been deleted.` });
      load();
    } catch (e) {
      setAlert({ type: "error", msg: "Failed to delete customer. " + e.message });
    }
  };

  const handleGenerateStatement = async (customer) => {
    setStmtLoading(true);
    try {
      const [stmtData, prods] = await Promise.all([
        customersService.getStatement(customer.id, stmtSiteId || null),
        productsService.getActive().catch(() => []),
      ]);
      const site = stmtSiteId ? sites.find(s => s.id === stmtSiteId) : null;
      await generateStatementPDF(customer, stmtData.orders, stmtData.waybills, stmtFrom || null, stmtTo || null, prods, site);
    } catch (e) {
      setAlert({ type: "error", msg: "Failed to generate statement. " + e.message });
    } finally {
      setStmtLoading(false);
    }
  };
  const statusColor = (s) => s === "completed" ? theme.green : s === "invoiced" ? theme.blue : s === "cancelled" ? theme.red : theme.accent;

  const filteredWaybills = custWaybills.filter(w => {
    if (waybillFrom && w.waybill_date < waybillFrom) return false;
    if (waybillTo && w.waybill_date > waybillTo) return false;
    return true;
  });
  const waybillSummary = {
    trips: filteredWaybills.length,
    loaded: filteredWaybills.reduce((s, w) => s + (w.quantity_loaded || 0), 0),
    received: filteredWaybills.reduce((s, w) => s + (w.quantity_received || 0), 0),
    damaged: filteredWaybills.reduce((s, w) => s + (w.quantity_damaged || 0), 0),
  };

  return (
    <div>
      {confirmDelete && <ConfirmModal msg={`Delete ${confirmDelete.name}? This cannot be undone.`} onConfirm={handleDeleteCustomer} onCancel={() => setConfirmDelete(null)} />}
      <div style={styles.header}>
        <div>
          <div style={styles.pageTitle}>Customer Registry</div>
          <div style={styles.pageSubtitle}>All customers, order history, and account balances</div>
        </div>
        <button style={styles.btn("primary")} onClick={() => { setShowForm(!showForm); setEditMode(false); setForm(emptyForm); }}>+ Register Customer</button>
      </div>

      {alert && <Alert msg={alert.msg} type={alert.type} onClose={() => setAlert(null)} />}
      {isMarketer && (
        <div style={{ background: theme.accent+'11', border: `1px solid ${theme.accent}33`, borderRadius: '8px', padding: '10px 16px', marginBottom: '16px', fontSize: '12px', color: theme.accent }}>
          👤 Showing only customers you registered.
        </div>
      )}
      {showForm && !editMode && <CustomerForm form={form} setForm={setForm} staff={staff} saving={saving} onSubmit={handleSave} onCancel={() => setShowForm(false)} submitLabel="Register" />}

      <div style={styles.grid(3)}>
        <StatCard label="Total Customers" value={customers.length} sub={isMarketer ? "Your customers" : "All registered"} accent={theme.blue} />
        <StatCard label="This Month" value={customers.filter(c => c.created_at?.startsWith(new Date().toISOString().slice(0, 7))).length} sub="New registrations" accent={theme.green} />
        <StatCard label="With Active Orders" value={customers.filter(c => (c.orders || []).some(o => o.status !== "completed" && o.status !== "cancelled")).length} sub="Pending/in progress" accent={theme.accent} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.6fr", gap: "16px" }}>
        <div style={styles.card}>
          <div style={{ marginBottom: "12px" }}>
            <input style={styles.input} placeholder="Search by name, phone, or location…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div style={{ fontSize: "11px", color: theme.textMuted, marginBottom: "8px" }}>{filtered.length} customer{filtered.length !== 1 ? "s" : ""}</div>
          {loading ? <Spinner /> : filtered.length === 0 ? (
            <div style={{ textAlign: "center", padding: "30px", color: theme.textMuted, fontSize: "13px" }}>No customers found.</div>
          ) : (
            <div style={{ maxHeight: "600px", overflowY: "auto" }}>
              {filtered.map(c => {
                const { totalValue, outstanding, orderCount } = getStats(c);
                return (
                  <div key={c.id} onClick={() => { setSelected(c); setEditMode(false); }} style={{ padding: "12px 14px", borderRadius: "8px", marginBottom: "6px", cursor: "pointer", border: `1px solid ${selected?.id === c.id ? theme.accent + "66" : theme.border}`, background: selected?.id === c.id ? "rgba(245,166,35,0.06)" : "transparent", transition: "all 0.15s" }}>
                    <div style={{ fontWeight: "600", fontSize: "13px" }}>{c.name}</div>
                    {c.company_name && <div style={{ fontSize: "11px", color: theme.accent, marginTop: "1px" }}>{c.company_name}</div>}
                    <div style={{ fontSize: "11px", color: theme.textMuted, marginTop: "2px" }}>{c.phone}{c.location ? ` · ${c.location}` : ""}</div>
                    <div style={{ display: "flex", gap: "12px", marginTop: "6px", fontSize: "11px" }}>
                      <span style={{ color: theme.textMuted }}>{orderCount} order{orderCount !== 1 ? "s" : ""}</span>
                      {canSeeAmounts && (<span style={{ color: theme.accent }}>{naira(totalValue)}</span>)}
                      {canSeeAmounts && outstanding > 0 && <span style={{ color: theme.red }}>Owes {naira(outstanding)}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div style={styles.card}>
          {!selected ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "300px", color: theme.textMuted, fontSize: "13px" }}>← Select a customer to view profile</div>
          ) : editMode ? (
            <CustomerForm form={form} setForm={setForm} staff={staff} saving={saving} onSubmit={handleUpdate} onCancel={() => setEditMode(false)} submitLabel="Save Changes" />
          ) : (() => {
            const { totalValue, totalPaid, outstanding, orderCount } = getStats(selected);
            const orders = selected.orders || [];
            return (
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
                  <div>
                    <div style={{ fontSize: "18px", fontWeight: "700", color: theme.text }}>{selected.name}</div>
                    {selected.company_name && <div style={{ fontSize: "13px", color: theme.accent, marginTop: "2px" }}>{selected.company_name}</div>}
                    <div style={{ fontSize: "12px", color: theme.textMuted, marginTop: "4px", display: "flex", gap: "10px", flexWrap: "wrap" }}>
                      {selected.phone && <span>📞 {selected.phone}</span>}
                      {selected.email && <span>✉️ {selected.email}</span>}
                      {selected.location && <span>📍 {selected.location}</span>}
                    </div>
                    <div style={{ display: "flex", gap: "8px", marginTop: "8px", flexWrap: "wrap" }}>
                      {selected.how_heard && <span style={styles.badge(theme.blue)}>{howHeardLabel(selected.how_heard)}</span>}
                      {selected.marketer?.full_name && <span style={styles.badge(theme.green)}>via {selected.marketer.full_name}</span>}
                      {selected.date_registered && <span style={{ fontSize: "11px", color: theme.textMuted }}>Registered: {selected.date_registered}</span>}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <button style={styles.btn("secondary")} onClick={() => startEdit(selected)}>Edit Details</button>
                    {(selected.orders?.length === 0) && (
                      <button style={styles.btn("danger")} onClick={() => setConfirmDelete(selected)}>Delete</button>
                    )}
                  </div>
                </div>

                <div style={styles.grid(4)}>
                  <StatCard label="Orders" value={orderCount} sub="All time" accent={theme.blue} />
                  {canSeeAmounts && (<StatCard label="Total Value" value={naira(totalValue)} sub="All orders" accent={theme.accent} />)}
                  {canSeeAmounts && (<StatCard label="Total Paid" value={naira(totalPaid)} sub="Confirmed" accent={theme.green} />)}
                  {canSeeAmounts && (<StatCard label="Outstanding" value={naira(outstanding)} sub="Balance due" accent={outstanding > 0 ? theme.red : theme.green} />)}
                </div>

                {/* ── SITES ── */}
                <div style={{ marginTop: "16px", paddingTop: "14px", borderTop: `1px solid ${theme.border}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                    <div style={styles.sectionTitle}>Delivery Sites</div>
                    <button style={{ ...styles.btn("secondary"), padding: "5px 12px", fontSize: "12px" }} onClick={() => setShowAddSite(!showAddSite)}>+ Add Site</button>
                  </div>
                  {sitesLoading ? <Spinner /> : (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", marginBottom: "12px" }}>
                      {sites.map(s => {
                        const siteOrderCount = (selected.orders || []).filter(o => o.site_id === s.id).length;
                        return (
                          <div key={s.id} style={{ background: theme.surface, borderRadius: "8px", padding: "10px 14px", border: `1px solid ${theme.border}`, minWidth: "180px", flex: "1" }}>
                            <div style={{ fontWeight: "700", fontSize: "13px", color: theme.accent }}>{s.site_name}</div>
                            {s.site_address && <div style={{ fontSize: "12px", color: theme.text, marginTop: "2px" }}>📍 {s.site_address}</div>}
                            {s.site_contact_name && <div style={{ fontSize: "11px", color: theme.textMuted, marginTop: "2px" }}>👤 {s.site_contact_name}{s.site_contact_phone ? ` · ${s.site_contact_phone}` : ""}</div>}
                            <div style={{ fontSize: "11px", color: theme.textMuted, marginTop: "4px" }}>{siteOrderCount} order{siteOrderCount !== 1 ? "s" : ""}</div>
                          </div>
                        );
                      })}
                      {sites.length === 0 && !sitesLoading && <div style={{ fontSize: "13px", color: theme.textMuted }}>No sites recorded yet.</div>}
                    </div>
                  )}
                  {showAddSite && (
                    <div style={{ background: theme.surface, borderRadius: "8px", padding: "14px", border: `1px solid ${theme.border}`, marginBottom: "12px" }}>
                      <div style={{ fontSize: "12px", fontWeight: "700", color: theme.textMuted, marginBottom: "10px" }}>NEW SITE</div>
                      <div style={styles.grid(2)}>
                        <div style={styles.formGroup}>
                          <label style={styles.label}>Site Name *</label>
                          <input style={styles.input} placeholder="e.g. Katampe Site" value={siteForm.site_name} onChange={e => setSiteForm({ ...siteForm, site_name: e.target.value })} />
                        </div>
                        <div style={styles.formGroup}>
                          <label style={styles.label}>Delivery Address</label>
                          <SiteAddressSelect value={siteForm.site_address} onChange={v => setSiteForm({ ...siteForm, site_address: v })} inputStyle={styles.input} />
                        </div>
                        <div style={styles.formGroup}>
                          <label style={styles.label}>Site Contact Name</label>
                          <input style={styles.input} placeholder="Person at this site" value={siteForm.site_contact_name} onChange={e => setSiteForm({ ...siteForm, site_contact_name: e.target.value })} />
                        </div>
                        <div style={styles.formGroup}>
                          <label style={styles.label}>Site Contact Phone</label>
                          <input style={styles.input} placeholder="+234…" value={siteForm.site_contact_phone} onChange={e => setSiteForm({ ...siteForm, site_contact_phone: e.target.value })} />
                        </div>
                      </div>
                      <div style={styles.row}>
                        <button style={styles.btn("primary")} onClick={handleAddSite} disabled={savingSite}>{savingSite ? "Saving…" : "Save Site"}</button>
                        <button style={styles.btn("secondary")} onClick={() => { setShowAddSite(false); setSiteForm({ site_name: "", site_address: "", site_contact_name: "", site_contact_phone: "" }); }}>Cancel</button>
                      </div>
                    </div>
                  )}
                </div>

                <div style={{ ...styles.sectionTitle, marginBottom: "10px" }}>Order History</div>
                {orders.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "20px", color: theme.textMuted, fontSize: "13px" }}>No orders yet.</div>
                ) : (
                  <table style={styles.table}>
                    <thead>
                      <tr>{["Date", "Items", "Value", "Paid", "Status"].map(h => <th key={h} style={styles.th}>{h}</th>)}</tr>
                    </thead>
                    <tbody>
                      {orders.map(o => {
                        const val = (o.order_items || []).reduce((s, i) => s + Number(i.subtotal ?? i.quantity * i.unit_price), 0);
                        const paid = (o.invoices || []).flatMap(inv => inv.payments || []).filter(p => p.status === "confirmed").reduce((s, p) => s + Number(p.amount_paid), 0);
                        return (
                          <tr key={o.id}>
                            <td style={styles.td}>{o.created_at?.split("T")[0]}</td>
                            <td style={styles.td}>{(o.order_items || []).map(i => i.block_type).join(", ") || "—"}</td>
                            <td style={styles.td}><strong style={{ color: theme.accent }}>{naira(val)}</strong></td>
                            <td style={styles.td}><span style={{ color: theme.green }}>{naira(paid)}</span></td>
                            <td style={styles.td}><span style={styles.badge(statusColor(o.status))}>{o.status}</span></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}

                {/* ── DELIVERY WAYBILLS ── */}
                <div style={{ marginTop: "20px", paddingTop: "16px", borderTop: `1px solid ${theme.border}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                    <div style={styles.sectionTitle}>Delivery Waybills</div>
                    <button style={{ ...styles.btn("primary"), padding: "6px 14px", fontSize: "12px" }} disabled={waybillPdfLoading || filteredWaybills.length === 0} onClick={async () => {
                      setWaybillPdfLoading(true);
                      try { await generateCustomerWaybillsPDF(selected, filteredWaybills, waybillFrom || null, waybillTo || null); }
                      catch (e) { setAlert({ type: "error", msg: "PDF error: " + e.message }); }
                      finally { setWaybillPdfLoading(false); }
                    }}>{waybillPdfLoading ? "Generating…" : "Download PDF"}</button>
                  </div>
                  <div style={{ display: "flex", gap: "10px", marginBottom: "12px", alignItems: "flex-end", flexWrap: "wrap" }}>
                    <div>
                      <label style={styles.label}>From</label>
                      <input style={{ ...styles.input, width: "130px" }} type="date" value={waybillFrom} onChange={e => setWaybillFrom(e.target.value)} />
                    </div>
                    <div>
                      <label style={styles.label}>To</label>
                      <input style={{ ...styles.input, width: "130px" }} type="date" value={waybillTo} onChange={e => setWaybillTo(e.target.value)} />
                    </div>
                    {(waybillFrom || waybillTo) && <button style={{ ...styles.btn("secondary"), padding: "8px 12px", fontSize: "12px", alignSelf: "flex-end" }} onClick={() => { setWaybillFrom(""); setWaybillTo(""); }}>Clear</button>}
                  </div>
                  {waybillsLoading ? <Spinner /> : filteredWaybills.length === 0 ? (
                    <div style={{ padding: "20px", textAlign: "center", color: theme.textMuted, fontSize: "13px" }}>No waybills recorded for this customer{(waybillFrom || waybillTo) ? " in the selected period" : ""}.</div>
                  ) : (
                    <>
                      <div style={{ overflowX: "auto" }}>
                        <table style={{ ...styles.table, minWidth: "700px" }}>
                          <thead>
                            <tr>{["Waybill No", "Date", "Block Type", "Loaded", "Received", "Damaged", "Driver", "Truck", "Batch No"].map(h => <th key={h} style={styles.th}>{h}</th>)}</tr>
                          </thead>
                          <tbody>
                            {filteredWaybills.map(w => (
                              <tr key={w.id}>
                                <td style={styles.td}><span style={{ color: theme.accent, fontWeight: "600" }}>{w.waybill_number}</span></td>
                                <td style={styles.td}>{w.waybill_date}</td>
                                <td style={styles.td}><span style={styles.badge(theme.blue)}>{w.block_type}</span></td>
                                <td style={styles.td}>{fmt(w.quantity_loaded)}</td>
                                <td style={styles.td}><strong style={{ color: theme.green }}>{fmt(w.quantity_received)}</strong></td>
                                <td style={styles.td}><span style={styles.badge((w.quantity_damaged || 0) > 0 ? theme.red : theme.textDim)}>{w.quantity_damaged || 0}</span></td>
                                <td style={styles.td}>{w.driver?.full_name || "—"}</td>
                                <td style={styles.td}>{w.truck_number || "—"}</td>
                                <td style={styles.td}>{w.batch_number || "—"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div style={{ display: "flex", gap: "10px", marginTop: "12px", flexWrap: "wrap" }}>
                        {[["Total Trips", String(waybillSummary.trips), theme.blue], ["Total Loaded", fmt(waybillSummary.loaded) + " blocks", theme.accent], ["Total Received", fmt(waybillSummary.received) + " blocks", theme.green], ["Transit Damaged", fmt(waybillSummary.damaged) + " blocks", waybillSummary.damaged > 0 ? theme.red : theme.textMuted]].map(([label, val, color]) => (
                          <div key={label} style={{ background: theme.surface, borderRadius: "8px", padding: "10px 14px", flex: 1, minWidth: "120px" }}>
                            <div style={{ fontSize: "11px", color: theme.textMuted }}>{label}</div>
                            <div style={{ fontSize: "16px", fontWeight: "700", color, marginTop: "3px" }}>{val}</div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>

                {canSeeAmounts && (<div style={{ marginTop: "20px", paddingTop: "16px", borderTop: `1px solid ${theme.border}` }}>
                  <div style={{ ...styles.sectionTitle, marginBottom: "10px" }}>Download Statement</div>
                  <div style={{ display: "flex", gap: "10px", alignItems: "flex-end", flexWrap: "wrap" }}>
                    {sites.length > 1 && (
                      <div>
                        <label style={styles.label}>Site Filter</label>
                        <select style={{ ...styles.input, minWidth: "160px" }} value={stmtSiteId} onChange={e => setStmtSiteId(e.target.value)}>
                          <option value="">All Sites (company total)</option>
                          {sites.map(s => <option key={s.id} value={s.id}>{s.site_name}</option>)}
                        </select>
                      </div>
                    )}
                    <div>
                      <label style={styles.label}>From Date</label>
                      <input style={{ ...styles.input, width: "140px" }} type="date" value={stmtFrom} onChange={e => setStmtFrom(e.target.value)} />
                    </div>
                    <div>
                      <label style={styles.label}>To Date</label>
                      <input style={{ ...styles.input, width: "140px" }} type="date" value={stmtTo} onChange={e => setStmtTo(e.target.value)} />
                    </div>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <button style={styles.btn("primary")} onClick={() => handleGenerateStatement(selected)} disabled={stmtLoading}>
                        {stmtLoading ? "Generating…" : "Download Statement PDF"}
                      </button>
                      {(stmtFrom || stmtTo) && (
                        <button style={styles.btn("secondary")} onClick={() => { setStmtFrom(""); setStmtTo(""); }}>Clear</button>
                      )}
                    </div>
                  </div>
                  <div style={{ fontSize: "11px", color: theme.textMuted, marginTop: "6px" }}>
                    {stmtFrom || stmtTo ? `Showing: ${stmtFrom || "all time"} → ${stmtTo || "present"}` : "Showing: all time (set dates to filter)"}
                  </div>
                </div>)}
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
};

// ── REPORTS ───────────────────────────────────────────────────
const Reports = ({ userProfile }) => <ReportsEngine userProfile={userProfile} />;

// ── INVENTORY ─────────────────────────────────────────────────
const UNITS = ["bags", "kg", "litres", "units", "tonnes", "metres", "packs"];
const ISSUED_TO = ["Production", "Maintenance", "Logistics", "Administration", "Other"];

const Inventory = ({ onLowStockChange, userProfile }) => {
  // Whoever is logged in is recorded as the person who entered the movement —
  // no free text, no override (deliberate accountability requirement).
  const recordedBy = userProfile?.full_name || userProfile?.email || null;
  // Roles allowed to write stock_movements (mirrors the table's RLS UPDATE/DELETE
  // grant). ICO and board_member can view Inventory but not write, so the
  // Edit/Delete buttons are hidden for them rather than failing on click.
  const MOVEMENT_WRITE_ROLES = ['md', 'store_officer', 'production_manager', 'assistant_production_manager', 'logistics_manager'];
  const canWriteMovement = hasRole(userProfile, ...MOVEMENT_WRITE_ROLES);
  const [tab, setTab] = useState("registry");
  const [items, setItems] = useState([]);
  const [movements, setMovements] = useState([]);
  const [suppliersList, setSuppliersList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [alert, setAlert] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [editItem, setEditItem] = useState(null);
  const [showItemForm, setShowItemForm] = useState(false);
  const [movFilter, setMovFilter] = useState({ from: "", to: "", itemId: "" });
  const [reportDates, setReportDates] = useState({ from: "", to: "" });
  const [reportLoading, setReportLoading] = useState(false);
  const [movEditTarget, setMovEditTarget] = useState(null);
  const [movEditForm, setMovEditForm] = useState({});
  const [movConfirmDelete, setMovConfirmDelete] = useState(null);

  const today = new Date().toISOString().split("T")[0];
  const emptyItem = { name: "", unit: "bags", current_stock: "", reorder_level: "", unit_cost: "", supplier: "", date_added: today };
  const emptyIn  = { itemId: "", quantity: "", unit: "kg", unitCost: "", supplierId: "", supplier: "", date: today, notes: "" };
  const emptyOut = { itemId: "", quantity: "", unit: "kg", issuedTo: "Production", reference: "", date: today, notes: "" };

  const [itemForm, setItemForm]   = useState(emptyItem);
  const [inForm,   setInForm]     = useState(emptyIn);
  const [outForm,  setOutForm]    = useState(emptyOut);

  const load = async () => {
    setLoading(true);
    try {
      const [its, sups] = await Promise.all([inventoryService.getAllItems(), suppliersService.getActive().catch(() => [])]);
      setItems(its);
      setSuppliersList(sups);
      if (onLowStockChange) onLowStockChange(its.filter(i => Number(i.current_stock) <= Number(i.reorder_level)).length);
    } catch (e) {
      setAlert({ type: "error", msg: "Could not load inventory: " + e.message });
    } finally {
      setLoading(false);
    }
  };

  const loadMovements = async () => {
    try {
      const m = await inventoryService.getMovements({
        itemId: movFilter.itemId || null,
        from: movFilter.from || null,
        to: movFilter.to || null,
      });
      setMovements(m);
    } catch (e) {
      setAlert({ type: "error", msg: "Could not load movements: " + e.message });
    }
  };

  useEffect(() => { load(); }, []);
  useEffect(() => { if (tab === "movements") loadMovements(); }, [tab, movFilter]);

  const lowStockItems = items.filter(i => Number(i.current_stock) <= Number(i.reorder_level));

  const startEditItem = (item) => {
    setItemForm({ name: item.name, unit: item.unit, current_stock: String(item.current_stock), reorder_level: String(item.reorder_level), unit_cost: String(item.unit_cost || ""), supplier: item.supplier || "", date_added: item.date_added || item.created_at?.split("T")[0] || today });
    setEditItem(item);
    setShowItemForm(true);
  };

  const handleSaveItem = async () => {
    if (!itemForm.name || !itemForm.unit) return setAlert({ type: "error", msg: "Item name and unit are required." });
    setSaving(true);
    try {
      const payload = { name: itemForm.name, unit: itemForm.unit, current_stock: Number(itemForm.current_stock) || 0, reorder_level: Number(itemForm.reorder_level) || 0, unit_cost: Number(itemForm.unit_cost) || 0, supplier: itemForm.supplier || null, date_added: itemForm.date_added || today };
      if (editItem) {
        await inventoryService.updateItem(editItem.id, payload);
      } else {
        await inventoryService.createItem(payload);
      }
      await load();
      setShowItemForm(false);
      setItemForm(emptyItem);
      setEditItem(null);
      setAlert({ type: "success", msg: editItem ? "Item updated." : "Item added to registry." });
    } catch (e) {
      setAlert({ type: "error", msg: "Failed to save item. " + e.message });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteItem = async () => {
    const item = confirmDelete;
    setConfirmDelete(null);
    try {
      await inventoryService.deleteItem(item.id);
      await load();
      setAlert({ type: "success", msg: `${item.name} removed from registry.` });
    } catch (e) {
      setAlert({ type: "error", msg: "Failed to delete item. " + e.message });
    }
  };

  const handleStockIn = async () => {
    if (!inForm.itemId || !inForm.quantity || !inForm.date) return setAlert({ type: "error", msg: "Item, quantity, and date are required." });
    if (suppliersList.length > 0 && !inForm.supplierId) return setAlert({ type: "error", msg: "Please select a supplier from the list." });
    setSaving(true);
    try {
      // Storage is always the item's base unit (kg). If the item is kg and the
      // user entered tonnes, convert to kg (× 1000, decimals preserved).
      const inItem = items.find(i => i.id === inForm.itemId);
      const qtyBase = (inItem?.unit === 'kg' && inForm.unit === 'tonnes') ? Number(inForm.quantity) * 1000 : Number(inForm.quantity);
      const supplierName = inForm.supplierId ? (suppliersList.find(s => s.id === inForm.supplierId)?.company_name || inForm.supplier) : inForm.supplier;
      const movement = await inventoryService.stockIn({ itemId: inForm.itemId, quantity: qtyBase, unitCost: Number(inForm.unitCost) || 0, supplier: supplierName, staffName: recordedBy, date: inForm.date, notes: inForm.notes });
      if (inForm.supplierId && qtyBase > 0) {
        const totalCost = qtyBase * (Number(inForm.unitCost) || 0);
        if (totalCost > 0) {
          const item = items.find(i => i.id === inForm.itemId);
          try {
            await supplierTransactionsService.create({ supplier_id: inForm.supplierId, transaction_date: inForm.date, transaction_type: 'purchase', amount: totalCost, description: `Stock in: ${item?.name || 'item'} × ${qtyBase.toLocaleString()} ${item?.unit || ''}`.trim(), linked_stock_movement_id: movement?.id || null });
          } catch { /* non-blocking */ }
        }
      }
      await load();
      if (tab === "movements") await loadMovements();
      setInForm(emptyIn);
      setAlert({ type: "success", msg: `Stock received${inForm.supplierId ? ' and supplier transaction recorded.' : '!'}` });
    } catch (e) {
      setAlert({ type: "error", msg: "Failed to record stock in. " + e.message });
    } finally {
      setSaving(false);
    }
  };

  const handleStockOut = async () => {
    if (!outForm.itemId || !outForm.quantity || !outForm.date) return setAlert({ type: "error", msg: "Item, quantity, and date are required." });
    setSaving(true);
    try {
      // Base unit (kg) storage; convert tonnes→kg for kg items (decimals preserved).
      const outItem = items.find(i => i.id === outForm.itemId);
      const qtyBase = (outItem?.unit === 'kg' && outForm.unit === 'tonnes') ? Number(outForm.quantity) * 1000 : Number(outForm.quantity);
      await inventoryService.stockOut({ itemId: outForm.itemId, quantity: qtyBase, issuedTo: outForm.issuedTo, staffName: recordedBy, reference: outForm.reference, date: outForm.date, notes: outForm.notes });
      await load();
      if (tab === "movements") await loadMovements();
      setOutForm(emptyOut);
      setAlert({ type: "success", msg: "Stock issued and inventory updated!" });
    } catch (e) {
      setAlert({ type: "error", msg: "Failed to record stock out. " + e.message });
    } finally {
      setSaving(false);
    }
  };

  const startEditMovement = (m) => {
    setMovEditTarget(m);
    setMovEditForm({
      date: m.date,
      quantity: String(m.quantity),
      ...(m.movement_type === "in"
        ? { unitCost: String(m.unit_cost || ""), supplier: m.supplier || "", staffName: m.staff_name || "" }
        : { issuedTo: m.issued_to || "", staffName: m.staff_name || "" }),
      notes: m.notes || "",
    });
  };

  const handleSaveMovementEdit = async () => {
    if (!movEditForm.quantity || !movEditForm.date) return setAlert({ type: "error", msg: "Date and quantity are required." });
    setSaving(true);
    try {
      const newData = movEditTarget.movement_type === "in"
        ? { date: movEditForm.date, quantity: Number(movEditForm.quantity), unit_cost: Number(movEditForm.unitCost) || null, total_cost: Number(movEditForm.quantity) * (Number(movEditForm.unitCost) || 0) || null, supplier: movEditForm.supplier || null, staff_name: movEditForm.staffName || null, notes: movEditForm.notes || null }
        : { date: movEditForm.date, quantity: Number(movEditForm.quantity), issued_to: movEditForm.issuedTo || null, staff_name: movEditForm.staffName || null, notes: movEditForm.notes || null };
      await inventoryService.editMovement(movEditTarget.id, movEditTarget, newData);
      await load();
      await loadMovements();
      setMovEditTarget(null);
      setAlert({ type: "success", msg: "Movement updated and stock adjusted." });
    } catch (e) {
      setAlert({ type: "error", msg: e.message });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteMovement = async () => {
    const m = movConfirmDelete;
    setMovConfirmDelete(null);
    try {
      if (m.movement_type === "in") {
        try { await supabase.from('supplier_transactions').delete().eq('linked_stock_movement_id', m.id); } catch {}
      }
      await inventoryService.deleteMovement(m.id, m);
      await load();
      await loadMovements();
      setAlert({ type: "success", msg: "Movement deleted and stock reversed." });
    } catch (e) {
      setAlert({ type: "error", msg: e.message });
    }
  };

  const handleReport = async () => {
    setReportLoading(true);
    try {
      const movs = await inventoryService.getMovements({ from: reportDates.from || null, to: reportDates.to || null });
      await generateInventoryReportPDF(items, movs, reportDates);
    } catch (e) {
      setAlert({ type: "error", msg: "Failed to generate report. " + e.message });
    } finally {
      setReportLoading(false);
    }
  };

  const totalValue = items.reduce((s, i) => s + Number(i.current_stock) * Number(i.unit_cost || 0), 0);
  const TABS = [{ id: "registry", label: "Stock Registry" }, { id: "stockin", label: "Stock In" }, { id: "stockout", label: "Stock Out" }, { id: "movements", label: "Movement Log" }, { id: "report", label: "Report" }];

  // Unit-toggle helpers: the kg/tonnes selector only applies to items stored in
  // kg (dust, chippings). For bags/litres items the native unit is shown as a
  // static label. When tonnes is chosen, preview the kg value that will be stored.
  const inItemSel  = items.find(i => i.id === inForm.itemId);
  const outItemSel = items.find(i => i.id === outForm.itemId);
  const inIsKg  = inItemSel?.unit === 'kg';
  const outIsKg = outItemSel?.unit === 'kg';
  const kgPreview = (qty) => (qty !== '' && !isNaN(Number(qty))) ? `= ${(Number(qty) * 1000).toLocaleString()} kg` : '';

  return (
    <div>
      {confirmDelete && <ConfirmModal msg={`Remove "${confirmDelete.name}" from inventory registry? All movement history for this item will also be deleted.`} onConfirm={handleDeleteItem} onCancel={() => setConfirmDelete(null)} />}

      <div style={styles.header}>
        <div>
          <div style={styles.pageTitle}>Inventory Management</div>
          <div style={styles.pageSubtitle}>Raw materials, consumables, and stock movements</div>
        </div>
        {tab === "registry" && <button style={styles.btn("primary")} onClick={() => { setShowItemForm(true); setEditItem(null); setItemForm(emptyItem); setTab("registry"); }}>+ Add Item</button>}
      </div>

      {alert && <Alert msg={alert.msg} type={alert.type} onClose={() => setAlert(null)} />}

      {/* Low stock alerts */}
      {lowStockItems.length > 0 && (
        <div style={{ background: "rgba(240,107,107,0.10)", border: `1px solid ${theme.red}44`, borderRadius: "10px", padding: "14px 18px", marginBottom: "20px" }}>
          <div style={{ fontWeight: "700", fontSize: "13px", color: theme.red, marginBottom: "8px" }}>⚠ {lowStockItems.length} item{lowStockItems.length > 1 ? "s" : ""} need restocking</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
            {lowStockItems.map(i => (
              <div key={i.id} style={{ background: "rgba(240,107,107,0.12)", border: `1px solid ${theme.red}55`, borderRadius: "6px", padding: "5px 10px", fontSize: "12px" }}>
                <strong style={{ color: theme.red }}>{i.name}</strong>
                <span style={{ color: theme.textMuted, marginLeft: "6px" }}>{Number(i.current_stock).toLocaleString()} {i.unit} left (min: {Number(i.reorder_level).toLocaleString()})</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Summary stats */}
      <div style={styles.grid(4)}>
        <StatCard label="Total Items" value={items.length} sub="In registry" accent={theme.blue} />
        <StatCard label="Low Stock" value={lowStockItems.length} sub="Below reorder level" accent={lowStockItems.length > 0 ? theme.red : theme.green} />
        <StatCard label="Total Stock Value" value={`₦${Math.round(totalValue).toLocaleString()}`} sub="At current unit cost" accent={theme.accent} />
        <StatCard label="Adequately Stocked" value={items.length - lowStockItems.length} sub="Above reorder level" accent={theme.green} />
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: "4px", marginBottom: "16px", borderBottom: `1px solid ${theme.border}`, paddingBottom: "0" }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{ padding: "9px 18px", fontSize: "13px", fontWeight: tab === t.id ? "600" : "400", color: tab === t.id ? theme.accent : theme.textMuted, background: "transparent", border: "none", borderBottom: tab === t.id ? `2px solid ${theme.accent}` : "2px solid transparent", cursor: "pointer", transition: "all 0.15s" }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── STOCK REGISTRY TAB ── */}
      {tab === "registry" && (
        <div>
          {showItemForm && (
            <div style={{ ...styles.card, marginBottom: "20px", borderColor: theme.accent + "44" }}>
              <div style={styles.sectionTitle}>{editItem ? `Edit — ${editItem.name}` : "Add New Inventory Item"}</div>
              <div style={styles.grid(3)}>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Item Name *</label>
                  <input style={styles.input} placeholder="e.g. Cement, Diesel…" value={itemForm.name} onChange={e => setItemForm({ ...itemForm, name: e.target.value })} />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Unit of Measure *</label>
                  <select style={styles.input} value={itemForm.unit} onChange={e => setItemForm({ ...itemForm, unit: e.target.value })}>
                    {UNITS.map(u => <option key={u}>{u}</option>)}
                  </select>
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Current Stock</label>
                  <input style={styles.input} type="number" placeholder="0" value={itemForm.current_stock} onChange={e => setItemForm({ ...itemForm, current_stock: e.target.value })} />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Reorder Level</label>
                  <input style={styles.input} type="number" placeholder="e.g. 50" value={itemForm.reorder_level} onChange={e => setItemForm({ ...itemForm, reorder_level: e.target.value })} />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Unit Cost (₦)</label>
                  <input style={styles.input} type="number" placeholder="0.00" value={itemForm.unit_cost} onChange={e => setItemForm({ ...itemForm, unit_cost: e.target.value })} />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Supplier Name</label>
                  <input style={styles.input} placeholder="Optional" value={itemForm.supplier} onChange={e => setItemForm({ ...itemForm, supplier: e.target.value })} />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Date Added</label>
                  <input style={styles.input} type="date" value={itemForm.date_added} onChange={e => setItemForm({ ...itemForm, date_added: e.target.value })} />
                </div>
              </div>
              <div style={styles.row}>
                <button style={styles.btn("primary")} onClick={handleSaveItem} disabled={saving}>{saving ? "Saving…" : editItem ? "Update Item" : "Add to Registry"}</button>
                <button style={styles.btn("secondary")} onClick={() => { setShowItemForm(false); setEditItem(null); setItemForm(emptyItem); }}>Cancel</button>
              </div>
            </div>
          )}

          <div style={styles.card}>
            <div style={styles.sectionTitle}>Inventory Registry ({items.length} items)</div>
            {loading ? <Spinner /> : items.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px", color: theme.textMuted, fontSize: "13px" }}>No items registered yet. Add your first inventory item.</div>
            ) : (
              <table style={styles.table}>
                <thead>
                  <tr>{["Item", "Unit", "On Hand", "Reorder Level", "Unit Cost", "Stock Value", "Supplier", "Date Added", "Last Updated", ""].map(h => <th key={h} style={styles.th}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {items.map(item => {
                    const isLow = Number(item.current_stock) <= Number(item.reorder_level);
                    const value = Number(item.current_stock) * Number(item.unit_cost || 0);
                    return (
                      <tr key={item.id} style={{ background: isLow ? "rgba(240,107,107,0.05)" : "transparent" }}>
                        <td style={styles.td}>
                          <strong style={{ color: isLow ? theme.red : theme.text }}>{item.name}</strong>
                          {isLow && <span style={{ ...styles.badge(theme.red), marginLeft: "6px", fontSize: "10px" }}>LOW</span>}
                        </td>
                        <td style={styles.td}>{item.unit}</td>
                        <td style={styles.td}><strong style={{ color: isLow ? theme.red : theme.accent }}>{Number(item.current_stock).toLocaleString()}</strong></td>
                        <td style={styles.td}>{Number(item.reorder_level).toLocaleString()}</td>
                        <td style={styles.td}>₦{Number(item.unit_cost || 0).toLocaleString()}</td>
                        <td style={styles.td}><strong style={{ color: theme.accent }}>₦{Math.round(value).toLocaleString()}</strong></td>
                        <td style={styles.td}>{item.supplier || "—"}</td>
                        <td style={styles.td}>{item.date_added || item.created_at?.split("T")[0] || "—"}</td>
                        <td style={styles.td}>{item.updated_at ? item.updated_at.split("T")[0] : "—"}</td>
                        <td style={styles.td}>
                          <div style={{ display: "flex", gap: "6px" }}>
                            <button style={{ ...styles.btn("secondary"), padding: "4px 10px", fontSize: "11px" }} onClick={() => startEditItem(item)}>Edit</button>
                            <button style={{ ...styles.btn("danger"), padding: "4px 10px", fontSize: "11px" }} onClick={() => setConfirmDelete(item)}>Delete</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ── STOCK IN TAB ── */}
      {tab === "stockin" && (
        <div style={styles.card}>
          <div style={styles.sectionTitle}>Record Stock Received</div>
          <div style={styles.grid(3)}>
            <div style={styles.formGroup}>
              <label style={styles.label}>Item *</label>
              <select style={styles.input} value={inForm.itemId} onChange={e => setInForm({ ...inForm, itemId: e.target.value })}>
                <option value="">— Select item —</option>
                {items.map(i => <option key={i.id} value={i.id}>{i.name} ({i.unit}) — {Number(i.current_stock).toLocaleString()} on hand</option>)}
              </select>
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Date Received *</label>
              <input style={styles.input} type="date" value={inForm.date} onChange={e => setInForm({ ...inForm, date: e.target.value })} />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Quantity Received *</label>
              <div style={{ display: "flex", gap: "6px" }}>
                <input style={{ ...styles.input, flex: 1 }} type="number" placeholder="e.g. 100" value={inForm.quantity} onChange={e => setInForm({ ...inForm, quantity: e.target.value })} />
                {inIsKg ? (
                  <select style={{ ...styles.input, width: "100px" }} value={inForm.unit} onChange={e => setInForm({ ...inForm, unit: e.target.value })}>
                    <option value="kg">kg</option>
                    <option value="tonnes">tonnes</option>
                  </select>
                ) : (
                  <span style={{ ...styles.input, width: "100px", display: "flex", alignItems: "center", color: theme.textMuted, background: "transparent" }}>{inItemSel?.unit || "—"}</span>
                )}
              </div>
              {inIsKg && inForm.unit === "tonnes" && inForm.quantity !== "" && (
                <div style={{ fontSize: "11px", color: theme.accent, marginTop: "4px", fontWeight: "600" }}>{kgPreview(inForm.quantity)} will be stored</div>
              )}
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Unit Cost at Purchase (₦)</label>
              <input style={styles.input} type="number" placeholder="0.00" value={inForm.unitCost} onChange={e => setInForm({ ...inForm, unitCost: e.target.value })} />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Total Cost (auto)</label>
              <input style={{ ...styles.input, background: "transparent", color: theme.accent, fontWeight: "700" }} readOnly value={inForm.quantity && inForm.unitCost ? `₦${Math.round(Number(inForm.quantity) * Number(inForm.unitCost)).toLocaleString()}` : "—"} />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Supplier *</label>
              {suppliersList.length > 0 ? (
                <select style={{ ...styles.input, borderColor: !inForm.supplierId ? theme.red + "88" : theme.border }} value={inForm.supplierId} onChange={e => {
                  const sup = suppliersList.find(s => s.id === e.target.value)
                  setInForm({ ...inForm, supplierId: e.target.value, supplier: sup?.company_name || '' })
                }}>
                  <option value="">— Select supplier —</option>
                  {suppliersList.map(s => <option key={s.id} value={s.id}>{s.company_name}</option>)}
                </select>
              ) : (
                <input style={styles.input} placeholder="Supplier name" value={inForm.supplier} onChange={e => setInForm({ ...inForm, supplier: e.target.value })} />
              )}
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Recorded By</label>
              <div style={{ ...styles.input, background: "transparent", color: theme.textMuted, display: "flex", alignItems: "center" }}>{recordedBy || "—"}</div>
            </div>
            <div style={{ ...styles.formGroup, gridColumn: "span 2" }}>
              <label style={styles.label}>Notes</label>
              <input style={styles.input} placeholder="Optional notes" value={inForm.notes} onChange={e => setInForm({ ...inForm, notes: e.target.value })} />
            </div>
          </div>
          <div style={styles.row}>
            <button style={styles.btn("primary")} onClick={handleStockIn} disabled={saving}>{saving ? "Recording…" : "Record Stock In"}</button>
            <button style={styles.btn("secondary")} onClick={() => setInForm(emptyIn)}>Clear</button>
          </div>
        </div>
      )}

      {/* ── STOCK OUT TAB ── */}
      {tab === "stockout" && (
        <div style={styles.card}>
          <div style={styles.sectionTitle}>Issue Stock</div>
          <div style={styles.grid(3)}>
            <div style={styles.formGroup}>
              <label style={styles.label}>Item *</label>
              <select style={styles.input} value={outForm.itemId} onChange={e => setOutForm({ ...outForm, itemId: e.target.value })}>
                <option value="">— Select item —</option>
                {items.map(i => <option key={i.id} value={i.id}>{i.name} ({i.unit}) — {Number(i.current_stock).toLocaleString()} on hand</option>)}
              </select>
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Date Issued *</label>
              <input style={styles.input} type="date" value={outForm.date} onChange={e => setOutForm({ ...outForm, date: e.target.value })} />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Quantity Issued *</label>
              <div style={{ display: "flex", gap: "6px" }}>
                <input style={{ ...styles.input, flex: 1 }} type="number" placeholder="e.g. 20" value={outForm.quantity} onChange={e => setOutForm({ ...outForm, quantity: e.target.value })} />
                {outIsKg ? (
                  <select style={{ ...styles.input, width: "100px" }} value={outForm.unit} onChange={e => setOutForm({ ...outForm, unit: e.target.value })}>
                    <option value="kg">kg</option>
                    <option value="tonnes">tonnes</option>
                  </select>
                ) : (
                  <span style={{ ...styles.input, width: "100px", display: "flex", alignItems: "center", color: theme.textMuted, background: "transparent" }}>{outItemSel?.unit || "—"}</span>
                )}
              </div>
              {outIsKg && outForm.unit === "tonnes" && outForm.quantity !== "" && (
                <div style={{ fontSize: "11px", color: theme.accent, marginTop: "4px", fontWeight: "600" }}>{kgPreview(outForm.quantity)} will be stored</div>
              )}
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Issued To</label>
              <select style={styles.input} value={outForm.issuedTo} onChange={e => setOutForm({ ...outForm, issuedTo: e.target.value })}>
                {ISSUED_TO.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Recorded By</label>
              <div style={{ ...styles.input, background: "transparent", color: theme.textMuted, display: "flex", alignItems: "center" }}>{recordedBy || "—"}</div>
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Reference / Job No.</label>
              <input style={styles.input} placeholder="Optional" value={outForm.reference} onChange={e => setOutForm({ ...outForm, reference: e.target.value })} />
            </div>
            <div style={{ ...styles.formGroup, gridColumn: "span 3" }}>
              <label style={styles.label}>Notes</label>
              <input style={styles.input} placeholder="Optional notes" value={outForm.notes} onChange={e => setOutForm({ ...outForm, notes: e.target.value })} />
            </div>
          </div>
          <div style={styles.row}>
            <button style={styles.btn("primary")} onClick={handleStockOut} disabled={saving}>{saving ? "Recording…" : "Record Stock Out"}</button>
            <button style={styles.btn("secondary")} onClick={() => setOutForm(emptyOut)}>Clear</button>
          </div>
        </div>
      )}

      {/* ── MOVEMENTS TAB ── */}
      {tab === "movements" && (
        <div>
          <div style={{ ...styles.card, marginBottom: "16px" }}>
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "flex-end" }}>
              <div>
                <label style={styles.label}>Filter by Item</label>
                <select style={{ ...styles.input, width: "220px" }} value={movFilter.itemId} onChange={e => setMovFilter({ ...movFilter, itemId: e.target.value })}>
                  <option value="">All items</option>
                  {items.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                </select>
              </div>
              <div>
                <label style={styles.label}>From</label>
                <input style={{ ...styles.input, width: "140px" }} type="date" value={movFilter.from} onChange={e => setMovFilter({ ...movFilter, from: e.target.value })} />
              </div>
              <div>
                <label style={styles.label}>To</label>
                <input style={{ ...styles.input, width: "140px" }} type="date" value={movFilter.to} onChange={e => setMovFilter({ ...movFilter, to: e.target.value })} />
              </div>
              {(movFilter.itemId || movFilter.from || movFilter.to) && (
                <button style={styles.btn("secondary")} onClick={() => setMovFilter({ from: "", to: "", itemId: "" })}>Clear Filters</button>
              )}
            </div>
          </div>

          {/* ── EDIT MOVEMENT MODAL ── */}
          {movEditTarget && (
            <div style={{ ...styles.card, marginBottom: "16px", borderLeft: `4px solid ${theme.accent}` }}>
              <div style={styles.sectionTitle}>Edit Movement — {movEditTarget.item?.name} ({movEditTarget.movement_type === "in" ? "Stock In" : "Stock Out"})</div>
              <div style={styles.grid(3)}>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Date</label>
                  <input style={styles.input} type="date" value={movEditForm.date} onChange={e => setMovEditForm({ ...movEditForm, date: e.target.value })} />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Quantity</label>
                  <input style={styles.input} type="number" value={movEditForm.quantity} onChange={e => setMovEditForm({ ...movEditForm, quantity: e.target.value })} />
                </div>
                {movEditTarget.movement_type === "in" ? (
                  <>
                    <div style={styles.formGroup}>
                      <label style={styles.label}>Unit Cost (₦)</label>
                      <input style={styles.input} type="number" value={movEditForm.unitCost} onChange={e => setMovEditForm({ ...movEditForm, unitCost: e.target.value })} />
                    </div>
                    <div style={styles.formGroup}>
                      <label style={styles.label}>Supplier</label>
                      <input style={styles.input} value={movEditForm.supplier} onChange={e => setMovEditForm({ ...movEditForm, supplier: e.target.value })} />
                    </div>
                  </>
                ) : (
                  <div style={styles.formGroup}>
                    <label style={styles.label}>Issued To</label>
                    <input style={styles.input} value={movEditForm.issuedTo} onChange={e => setMovEditForm({ ...movEditForm, issuedTo: e.target.value })} />
                  </div>
                )}
                <div style={styles.formGroup}>
                  <label style={styles.label}>Recorded By (original)</label>
                  <div style={{ ...styles.input, background: "transparent", color: theme.textMuted, display: "flex", alignItems: "center" }}>{movEditForm.staffName || "—"}</div>
                </div>
                <div style={{ ...styles.formGroup, gridColumn: "span 3" }}>
                  <label style={styles.label}>Notes</label>
                  <input style={styles.input} value={movEditForm.notes} onChange={e => setMovEditForm({ ...movEditForm, notes: e.target.value })} />
                </div>
              </div>
              <div style={styles.row}>
                <button style={styles.btn("primary")} onClick={handleSaveMovementEdit} disabled={saving}>{saving ? "Saving…" : "Save Changes"}</button>
                <button style={styles.btn("secondary")} onClick={() => setMovEditTarget(null)}>Cancel</button>
              </div>
            </div>
          )}

          {/* ── DELETE CONFIRMATION ── */}
          {movConfirmDelete && (
            <div style={{ ...styles.card, marginBottom: "16px", borderLeft: `4px solid ${theme.red}` }}>
              <div style={{ fontWeight: "700", marginBottom: "8px" }}>Delete this movement?</div>
              <div style={{ fontSize: "13px", color: theme.textMuted, marginBottom: "14px" }}>
                {movConfirmDelete.movement_type === "in" ? "+" : "-"}{Number(movConfirmDelete.quantity).toLocaleString()} {movConfirmDelete.item?.name} on {movConfirmDelete.date} will be reversed from current stock.
              </div>
              <div style={styles.row}>
                <button style={styles.btn("danger")} onClick={handleDeleteMovement}>Yes, Delete & Reverse Stock</button>
                <button style={styles.btn("secondary")} onClick={() => setMovConfirmDelete(null)}>Cancel</button>
              </div>
            </div>
          )}

          <div style={styles.card}>
            <div style={styles.sectionTitle}>Stock Movement Log ({movements.length} records)</div>
            {movements.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px", color: theme.textMuted, fontSize: "13px" }}>No movements found for the selected filters.</div>
            ) : (
              <table style={styles.table}>
                <thead>
                  <tr>{["Date", "Type", "Item", "Qty", "Unit", "Unit Cost", "Total Cost", "From / To", "Staff", "Notes", ""].map(h => <th key={h} style={styles.th}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {movements.map(m => {
                    const isAuto = m.reference?.startsWith("PROD-") || m.staff_name === "Auto";
                    return (
                      <tr key={m.id}>
                        <td style={styles.td}>{m.date}</td>
                        <td style={styles.td}>
                          <span style={styles.badge(m.movement_type === "in" ? theme.green : theme.red)}>
                            {m.movement_type === "in" ? "IN" : "OUT"}
                          </span>
                        </td>
                        <td style={styles.td}><strong>{m.item?.name || "—"}</strong></td>
                        <td style={styles.td}><strong style={{ color: m.movement_type === "in" ? theme.green : theme.red }}>{m.movement_type === "in" ? "+" : "-"}{Number(m.quantity).toLocaleString()}</strong></td>
                        <td style={styles.td}>{m.item?.unit || "—"}</td>
                        <td style={styles.td}>{m.unit_cost ? `₦${Number(m.unit_cost).toLocaleString()}` : "—"}</td>
                        <td style={styles.td}>{m.total_cost ? <strong style={{ color: theme.accent }}>₦{Math.round(m.total_cost).toLocaleString()}</strong> : "—"}</td>
                        <td style={styles.td}>{m.movement_type === "in" ? (m.supplier || "—") : (m.issued_to || "—")}</td>
                        <td style={styles.td}>{m.staff_name || "—"}</td>
                        <td style={styles.td}><span style={{ fontSize: "11px", color: theme.textMuted }}>{m.notes || ""}</span></td>
                        <td style={styles.td}>
                          {isAuto ? (
                            <span style={{ fontSize: "10px", color: theme.textMuted, fontStyle: "italic" }}>Auto — edit via Production Log</span>
                          ) : canWriteMovement ? (
                            <div style={{ display: "flex", gap: "4px" }}>
                              <button style={{ ...styles.btn("secondary"), padding: "3px 8px", fontSize: "11px" }} onClick={() => startEditMovement(m)}>Edit</button>
                              <button style={{ ...styles.btn("danger"), padding: "3px 8px", fontSize: "11px" }} onClick={() => setMovConfirmDelete(m)}>Delete</button>
                            </div>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ── REPORT TAB ── */}
      {tab === "report" && (
        <div style={styles.card}>
          <div style={styles.sectionTitle}>Download Inventory Report</div>
          <div style={{ fontSize: "13px", color: theme.textMuted, marginBottom: "20px" }}>
            The report includes current stock levels, total stock value, items below reorder level (highlighted), and movement history for the selected date range.
          </div>
          <div style={{ display: "flex", gap: "14px", alignItems: "flex-end", flexWrap: "wrap", marginBottom: "20px" }}>
            <div>
              <label style={styles.label}>Movement History From</label>
              <input style={{ ...styles.input, width: "160px" }} type="date" value={reportDates.from} onChange={e => setReportDates({ ...reportDates, from: e.target.value })} />
            </div>
            <div>
              <label style={styles.label}>To</label>
              <input style={{ ...styles.input, width: "160px" }} type="date" value={reportDates.to} onChange={e => setReportDates({ ...reportDates, to: e.target.value })} />
            </div>
            {(reportDates.from || reportDates.to) && (
              <button style={styles.btn("secondary")} onClick={() => setReportDates({ from: "", to: "" })}>Clear</button>
            )}
          </div>
          <div style={{ background: theme.surface, borderRadius: "8px", padding: "14px 18px", marginBottom: "20px", fontSize: "13px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
              <span style={{ color: theme.textMuted }}>Total Items in Registry</span>
              <strong>{items.length}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
              <span style={{ color: theme.textMuted }}>Items Below Reorder Level</span>
              <strong style={{ color: lowStockItems.length > 0 ? theme.red : theme.green }}>{lowStockItems.length}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", borderTop: `1px solid ${theme.border}`, paddingTop: "8px", marginTop: "4px" }}>
              <span style={{ color: theme.textMuted }}>Total Stock Value</span>
              <strong style={{ color: theme.accent }}>₦{Math.round(totalValue).toLocaleString()}</strong>
            </div>
          </div>
          <button style={styles.btn("primary")} onClick={handleReport} disabled={reportLoading || items.length === 0}>
            {reportLoading ? "Generating PDF…" : "Download Inventory Report PDF"}
          </button>
        </div>
      )}
    </div>
  );
};

// ── LPO APPROVALS ─────────────────────────────────────────────
const LPOApprovals = () => {
  const [lpos, setLpos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null);
  const [alert, setAlert] = useState(null);
  const [selected, setSelected] = useState(null);
  const [note, setNote] = useState("");
  const [docUrls, setDocUrls] = useState({});
  const today = new Date().toISOString().split("T")[0];
  const due = new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0];

  const load = async () => {
    setLoading(true);
    try {
      const rows = await lpoService.getAll();
      setLpos(rows);
      const entries = await Promise.all(rows.filter(l => l.document_url).map(async l => {
        try { return [l.id, await lpoService.getSignedUrl(l.document_url)]; } catch { return [l.id, null]; }
      }));
      setDocUrls(Object.fromEntries(entries));
    }
    catch (e) { setAlert({ type: "error", msg: "Could not load LPO queue: " + e.message }); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handleDecide = async (lpo, decision) => {
    if (decision === "rejected" && !note.trim()) return setAlert({ type: "error", msg: "A rejection note is required." });
    setSaving(lpo.id + decision);
    try {
      await lpoService.decide(lpo.id, decision, note.trim() || null);
      if (decision === "approved") {
        // 1) Ensure the invoice exists FIRST — a billing failure must not leave the
        //    order in_progress-but-uninvoiced.
        const existing = await invoicesService.getByOrder(lpo.order.id);
        if (existing.length === 0) {
          const total = (lpo.order.order_items || []).reduce((s, i) => s + i.quantity * i.unit_price, 0);
          let invNum = await invoicesService.getNextNumber();
          try {
            await invoicesService.create({ order_id: lpo.order.id, invoice_number: invNum, total_amount: total, issued_date: today, due_date: due });
          } catch (createErr) {
            if (createErr.code === '23505') {
              invNum = await invoicesService.getNextNumber();
              await invoicesService.create({ order_id: lpo.order.id, invoice_number: invNum, total_amount: total, issued_date: today, due_date: due });
            } else {
              setAlert({ type: "error", msg: `LPO approved, but invoice creation failed (${createErr.message}). The order was NOT moved to processing — generate the invoice manually from Orders, then it will proceed.` });
              await load();
              return; // finally{} still clears saving
            }
          }
        }
        // 2) Only after the invoice is confirmed, advance the order + delivery register.
        await ordersService.updateStatus(lpo.order.id, "in_progress");
        await pendingDeliveryService.addFromOrder(lpo.order);
        setAlert({ type: "success", msg: `LPO approved — ${lpo.order?.customer?.name} added to Pending Delivery Register.` });
      } else {
        setAlert({ type: "success", msg: "LPO rejected. BDM will be notified." });
      }
      setNote(""); setSelected(null);
      await load();
    } catch (e) { setAlert({ type: "error", msg: "Failed: " + e.message }); }
    finally { setSaving(null); }
  };

  const pendingLpos = lpos.filter(l => !l.md_decision);
  const decidedLpos = lpos.filter(l => l.md_decision);
  const statusColor = (d) => d === "approved" ? theme.green : d === "rejected" ? theme.red : theme.accent;

  return (
    <div>
      <div style={styles.header}>
        <div>
          <div style={styles.pageTitle}>LPO Approvals</div>
          <div style={styles.pageSubtitle}>Orders submitted as LPO awaiting MD approval</div>
        </div>
        {pendingLpos.length > 0 && <span style={{ ...styles.badge(theme.red), fontSize: "13px", padding: "6px 14px" }}>{pendingLpos.length} pending</span>}
      </div>
      {alert && <Alert msg={alert.msg} type={alert.type} onClose={() => setAlert(null)} />}
      {loading ? <Spinner /> : (
        <div>
          {pendingLpos.length === 0 ? (
            <div style={{ ...styles.card, textAlign: "center", padding: "48px", color: theme.textMuted }}>No LPO orders awaiting approval.</div>
          ) : pendingLpos.map(lpo => {
            const order = lpo.order || {};
            const total = (order.order_items || []).reduce((s, i) => s + i.quantity * i.unit_price, 0);
            const isOpen = selected?.id === lpo.id;
            return (
              <div key={lpo.id} style={{ ...styles.card, marginBottom: "14px", borderLeft: `4px solid ${theme.accent}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <div style={{ fontWeight: "700", fontSize: "15px" }}>{order.customer?.name || "—"}</div>
                    <div style={{ fontSize: "12px", color: theme.textMuted, marginTop: "3px" }}>{order.customer?.location} · Submitted by: {lpo.submitted_by || "—"} · {lpo.submitted_at?.split("T")[0]}</div>
                    <div style={{ marginTop: "8px", display: "flex", gap: "12px", fontSize: "13px", flexWrap: "wrap", alignItems: "center" }}>
                      {(order.order_items || []).map((it, i) => (
                        <span key={i} style={styles.badge(theme.blue)}>{it.quantity?.toLocaleString()} {it.block_type}</span>
                      ))}
                      <span style={{ color: theme.accent, fontWeight: "700" }}>{naira(total)}</span>
                      {lpo.document_url && docUrls[lpo.id] && (
                        <a href={docUrls[lpo.id]} target="_blank" rel="noreferrer" style={{ ...styles.btn("primary"), fontSize: "11px", padding: "3px 10px", textDecoration: "none", display: "inline-block" }}>📄 View LPO Document</a>
                      )}
                    </div>
                  </div>
                  <button style={styles.btn("secondary")} onClick={() => { setSelected(isOpen ? null : lpo); setNote(""); }}>{isOpen ? "Hide" : "Review"}</button>
                </div>
                {isOpen && (
                  <div style={{ marginTop: "16px", borderTop: `1px solid ${theme.border}`, paddingTop: "16px" }}>
                    <div style={styles.formGroup}>
                      <label style={styles.label}>MD Note (required for rejection, optional for approval)</label>
                      <input style={styles.input} placeholder="Enter note…" value={note} onChange={e => setNote(e.target.value)} />
                    </div>
                    <div style={styles.row}>
                      <button style={styles.btn("primary")} disabled={saving} onClick={() => handleDecide(lpo, "approved")}>{saving === lpo.id + "approved" ? "Approving…" : "✓ Approve LPO"}</button>
                      <button style={styles.btn("danger")} disabled={saving} onClick={() => handleDecide(lpo, "rejected")}>{saving === lpo.id + "rejected" ? "Rejecting…" : "✕ Reject"}</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {decidedLpos.length > 0 && (
            <div style={styles.card}>
              <div style={styles.sectionTitle}>Decision History</div>
              <table style={styles.table}>
                <thead><tr>{["Customer", "Submitted By", "Date", "Decision", "MD Note"].map(h => <th key={h} style={styles.th}>{h}</th>)}</tr></thead>
                <tbody>
                  {decidedLpos.map(l => (
                    <tr key={l.id}>
                      <td style={styles.td}><strong>{l.order?.customer?.name || "—"}</strong></td>
                      <td style={styles.td}>{l.submitted_by || "—"}</td>
                      <td style={styles.td}>{l.decided_at?.split("T")[0] || "—"}</td>
                      <td style={styles.td}><span style={styles.badge(statusColor(l.md_decision))}>{l.md_decision}</span></td>
                      <td style={styles.td}><span style={{ fontSize: "12px", color: theme.textMuted }}>{l.md_note || "—"}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ── PENDING DELIVERY REGISTER ──────────────────────────────────
const PendingDeliveryRegister = () => {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [alert, setAlert] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editDelivered, setEditDelivered] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try { setEntries(await pendingDeliveryService.getAll()); }
    catch (e) { setAlert({ type: "error", msg: "Could not load register: " + e.message }); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const startEdit = (e) => { setEditingId(e.id); setEditDelivered(String(e.delivered_qty || 0)); };
  const cancelEdit = () => { setEditingId(null); setEditDelivered(""); };

  const saveDelivered = async (id) => {
    setSaving(true);
    try {
      await pendingDeliveryService.setDelivered(id, parseInt(editDelivered) || 0);
      setAlert({ type: "success", msg: "Delivered quantity updated." });
      cancelEdit();
      await load();
    } catch (e) { setAlert({ type: "error", msg: "Failed to update: " + e.message }); }
    finally { setSaving(false); }
  };

  const handleMarkDone = async (id) => {
    setSaving(true);
    try {
      await pendingDeliveryService.markDone(id);
      setAlert({ type: "success", msg: "Entry marked as completed and removed from register." });
      await load();
    } catch (e) { setAlert({ type: "error", msg: "Failed: " + e.message }); }
    finally { setSaving(false); }
  };

  const daysSince = (iso) => Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  const statusColor = (s) => s === "completed" ? theme.green : s === "partially_delivered" ? theme.blue : s === "scheduled" ? theme.accent : theme.textMuted;
  const totalRemaining = entries.reduce((s, e) => s + (Number(e.remaining_qty) || 0), 0);

  // Group entries by customer_id
  const grouped = entries.reduce((acc, e) => {
    const key = e.customer_id;
    if (!acc[key]) acc[key] = { customer: e.customer, entries: [] };
    acc[key].entries.push(e);
    return acc;
  }, {});

  return (
    <div>
      <div style={styles.header}>
        <div>
          <div style={styles.pageTitle}>Pending Delivery Register</div>
          <div style={styles.pageSubtitle}>All customers currently awaiting delivery</div>
        </div>
      </div>
      {alert && <Alert msg={alert.msg} type={alert.type} onClose={() => setAlert(null)} />}
      <div style={styles.grid(3)}>
        <StatCard label="Customers Waiting" value={Object.keys(grouped).length} sub="Unique customers" accent={theme.blue} />
        <StatCard label="Total Blocks Remaining" value={fmt(totalRemaining)} sub="Still to be delivered" accent={theme.accent} />
        <StatCard label="Longest Wait" value={entries.length > 0 ? `${Math.max(...entries.map(e => daysSince(e.added_at)))} days` : "—"} sub="Days in register" accent={theme.red} />
      </div>
      {loading ? <Spinner /> : entries.length === 0 ? (
        <div style={{ ...styles.card, textAlign: "center", padding: "48px", color: theme.textMuted }}>No pending deliveries. Customers are added here when payment is confirmed or LPO is approved.</div>
      ) : (
        <div style={styles.card}>
          <table style={styles.table}>
            <thead>
              <tr>{["Customer / Block Type", "Location", "Total Qty", "Delivered", "Remaining", "Days Waiting", "Added", "Status", "Actions"].map(h => <th key={h} style={styles.th}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {Object.values(grouped).map(({ customer, entries: custEntries }) => (
                <>
                  {custEntries.length > 1 && (
                    <tr key={`hdr-${customer?.id}`} style={{ background: "rgba(255,255,255,0.04)" }}>
                      <td colSpan={9} style={{ ...styles.td, fontWeight: "700", fontSize: "13px", color: theme.accent, paddingTop: "10px", paddingBottom: "4px" }}>
                        {customer?.name || "—"}{customer?.company_name ? ` — ${customer.company_name}` : ""}
                        <span style={{ fontSize: "11px", color: theme.textMuted, fontWeight: "400", marginLeft: "8px" }}>
                          ({custEntries.length} pending orders)
                        </span>
                      </td>
                    </tr>
                  )}
                  {custEntries.map(e => {
                    const days = daysSince(e.added_at);
                    const pct = e.total_qty > 0 ? Math.round((e.delivered_qty / e.total_qty) * 100) : 0;
                    const isEditing = editingId === e.id;
                    const indent = custEntries.length > 1;
                    return (
                      <tr key={e.id} style={{ background: days > 14 ? "rgba(240,107,107,0.04)" : "transparent" }}>
                        <td style={styles.td}>
                          <div style={{ paddingLeft: indent ? "16px" : "0" }}>
                            {!indent && <strong>{e.customer?.name || "—"}</strong>}
                            {indent && <span style={{ color: theme.textMuted, fontSize: "11px" }}>↳ </span>}
                            <span style={styles.badge(theme.blue)}>{e.block_type}</span>
                            {indent && e.customer?.company_name && <div style={{ fontSize: "11px", color: theme.textMuted }}>{e.customer.company_name}</div>}
                            {!indent && e.customer?.company_name && <div style={{ fontSize: "11px", color: theme.textMuted }}>{e.customer.company_name}</div>}
                          </div>
                        </td>
                        <td style={styles.td}>{e.customer?.location || "—"}</td>
                        <td style={styles.td}>{Number(e.total_qty).toLocaleString()}</td>
                        <td style={styles.td}>
                          {isEditing ? (
                            <input type="number" value={editDelivered} onChange={ev => setEditDelivered(ev.target.value)}
                              style={{ ...styles.input, width: "80px", padding: "4px 6px", fontSize: "12px" }}
                              min="0" max={e.total_qty} autoFocus />
                          ) : (
                            <span style={{ color: theme.green }}>{Number(e.delivered_qty).toLocaleString()}</span>
                          )}
                        </td>
                        <td style={styles.td}><strong style={{ color: Number(e.remaining_qty) > 0 ? theme.accent : theme.green }}>{Number(e.remaining_qty).toLocaleString()}</strong></td>
                        <td style={styles.td}><span style={{ color: days > 14 ? theme.red : theme.textMuted, fontWeight: days > 14 ? "700" : "400" }}>{days}d</span></td>
                        <td style={styles.td}>{e.added_at?.split("T")[0]}</td>
                        <td style={styles.td}>
                          <div>
                            <span style={styles.badge(statusColor(e.status))}>{e.status?.replace(/_/g, " ")}</span>
                            <div style={{ ...styles.progressBar(), marginTop: "4px" }}><div style={styles.progressFill(pct, theme.green)} /></div>
                            <div style={{ fontSize: "10px", color: theme.textMuted, marginTop: "2px" }}>{pct}%</div>
                          </div>
                        </td>
                        <td style={styles.td}>
                          {isEditing ? (
                            <div style={{ display: "flex", gap: "4px" }}>
                              <button style={{ ...styles.btn("primary"), padding: "4px 8px", fontSize: "11px" }} onClick={() => saveDelivered(e.id)} disabled={saving}>Save</button>
                              <button style={{ ...styles.btn("secondary"), padding: "4px 8px", fontSize: "11px" }} onClick={cancelEdit}>Cancel</button>
                            </div>
                          ) : (
                            <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
                              <button style={{ ...styles.btn("secondary"), padding: "4px 8px", fontSize: "11px" }} onClick={() => startEdit(e)}>Edit Delivered</button>
                              <button style={{ ...styles.btn("danger"), padding: "4px 8px", fontSize: "11px" }} onClick={() => handleMarkDone(e.id)} disabled={saving}>Mark Done</button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

// ── DAILY SCHEDULE ─────────────────────────────────────────────
const DailySchedule = () => {
  const [schedules, setSchedules] = useState([]);
  const [pending, setPending] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [alert, setAlert] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [selectedEntries, setSelectedEntries] = useState([]);
  const [schedDate, setSchedDate] = useState(new Date().toISOString().split("T")[0]);
  const [createdBy, setCreatedBy] = useState("");
  const [expandedId, setExpandedId] = useState(null);
  const [statusFilter, setStatusFilter] = useState("all");

  const load = async () => {
    setLoading(true);
    try {
      const [s, p] = await Promise.all([schedulesService.getAll(), pendingDeliveryService.getAll()]);
      setSchedules(s);
      setPending(p.filter(p => p.status !== "completed"));
    } catch (e) { setAlert({ type: "error", msg: "Could not load schedules: " + e.message }); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const toggleEntry = (entry) => {
    setSelectedEntries(prev => {
      const exists = prev.find(e => e.id === entry.id);
      if (exists) return prev.filter(e => e.id !== entry.id);
      return [...prev, { ...entry, qtyToday: String(entry.remaining_qty), notes: "" }];
    });
  };

  const updateSelectedQty = (id, qty) => setSelectedEntries(prev => prev.map(e => e.id === id ? { ...e, qtyToday: qty } : e));
  const updateSelectedNotes = (id, notes) => setSelectedEntries(prev => prev.map(e => e.id === id ? { ...e, notes } : e));

  const handleCreate = async (submit = false) => {
    if (selectedEntries.length === 0) return setAlert({ type: "error", msg: "Select at least one customer from the register." });
    if (!schedDate) return setAlert({ type: "error", msg: "Schedule date is required." });
    setSaving(true);
    try {
      const sched = await schedulesService.create(
        { schedule_date: schedDate, created_by: createdBy || "BDM", status: submit ? "submitted" : "draft" },
        selectedEntries.map(e => ({
          customer_id: e.customer_id, order_id: e.order_id, pending_register_id: e.id,
          block_type: e.block_type, qty_scheduled: parseInt(e.qtyToday) || e.remaining_qty,
          location: e.customer?.location || "", notes: e.notes || null,
        }))
      );
      await load();
      setShowForm(false);
      setSelectedEntries([]);
      setAlert({ type: "success", msg: submit ? "Schedule submitted for ICO approval!" : "Schedule saved as draft." });
    } catch (e) { setAlert({ type: "error", msg: "Failed to create schedule: " + e.message }); }
    finally { setSaving(false); }
  };

  const handleSubmit = async (id) => {
    try { await schedulesService.updateStatus(id, "submitted"); await load(); setAlert({ type: "success", msg: "Schedule submitted for ICO approval." }); }
    catch (e) { setAlert({ type: "error", msg: e.message }); }
  };

  const statusColor = (s) => ({ draft: theme.textMuted, submitted: theme.accent, ico_approved: theme.green, rejected: theme.red, completed: theme.blue, in_progress: theme.blue, store_notified: theme.green }[s] || theme.textMuted);

  const printSchedulePDF = (sched) => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const W = doc.internal.pageSize.getWidth();
    doc.setFillColor(30, 40, 70); doc.rect(0, 0, W, 28, 'F');
    doc.setFontSize(13); doc.setFont(undefined, 'bold'); doc.setTextColor(255, 255, 255);
    doc.text('Abuja Precast Concrete Limited', 14, 11);
    doc.setFontSize(11); doc.setTextColor(180, 200, 255);
    doc.text('DAILY DELIVERY SCHEDULE', W - 14, 11, { align: 'right' });
    doc.setFontSize(9); doc.setFont(undefined, 'normal'); doc.setTextColor(200, 210, 240);
    doc.text(`Date: ${sched.schedule_date}`, 14, 20);
    doc.text(`Status: ${(sched.status || '').replace(/_/g, ' ').toUpperCase()}  |  Created by: ${sched.created_by || '—'}`, W - 14, 20, { align: 'right' });
    doc.setDrawColor(79, 142, 247); doc.setLineWidth(0.5); doc.line(14, 28, W - 14, 28);
    if (sched.ico_notes) {
      doc.setFontSize(9); doc.setTextColor(100, 150, 255); doc.text(`ICO Notes: ${sched.ico_notes}`, 14, 35);
    }
    const startY = sched.ico_notes ? 40 : 34;
    autoTable(doc, {
      startY,
      head: [['S/N', 'Customer', 'Site / Location', 'Block Type', 'Qty Scheduled', 'Special Instructions']],
      body: (sched.items || []).map((item, i) => [
        i + 1,
        item.customer?.name || '—',
        item.location || item.customer?.location || '—',
        item.block_type || '—',
        Number(item.qty_scheduled || 0).toLocaleString(),
        item.notes || '—',
      ]),
      styles: { fontSize: 8.5, cellPadding: 3 },
      headStyles: { fillColor: [30, 40, 70], textColor: [255, 255, 255], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [245, 247, 255] },
      margin: { left: 14, right: 14 },
    });
    const finalY = doc.lastAutoTable.finalY + 12;
    doc.setFontSize(9); doc.setTextColor(60, 60, 80); doc.setFont(undefined, 'normal');
    doc.text(`Prepared by: ${sched.created_by || '—'}`, 14, finalY);
    if (sched.ico_approved_by) doc.text(`Approved by ICO: ${sched.ico_approved_by}`, W / 2, finalY, { align: 'center' });
    doc.text(`Printed: ${new Date().toLocaleDateString('en-GB')}`, W - 14, finalY, { align: 'right' });
    doc.setFontSize(8); doc.setTextColor(140, 140, 160);
    doc.text('1, Dutse Alhaji, Behind Tipper Garage, Off Bwari Expressway, Abuja  |  +234 905 554 4433', W / 2, doc.internal.pageSize.getHeight() - 8, { align: 'center' });
    doc.save(`Schedule-${sched.schedule_date}.pdf`);
  };

  return (
    <div>
      <div style={styles.header}>
        <div><div style={styles.pageTitle}>Daily Delivery Schedule</div><div style={styles.pageSubtitle}>Plan and track daily deliveries</div></div>
        <button style={styles.btn("primary")} onClick={() => { setShowForm(!showForm); setSelectedEntries([]); }}>+ Create Schedule</button>
      </div>
      {alert && <Alert msg={alert.msg} type={alert.type} onClose={() => setAlert(null)} />}

      {showForm && (
        <div style={{ ...styles.card, marginBottom: "20px", borderColor: theme.accent + "44" }}>
          <div style={styles.sectionTitle}>New Delivery Schedule</div>
          <div style={{ display: "flex", gap: "16px", marginBottom: "16px", flexWrap: "wrap" }}>
            <div style={styles.formGroup}><label style={styles.label}>Schedule Date *</label><input style={{ ...styles.input, width: "180px" }} type="date" value={schedDate} onChange={e => setSchedDate(e.target.value)} /></div>
            <div style={styles.formGroup}><label style={styles.label}>Created By</label><input style={{ ...styles.input, width: "200px" }} placeholder="BDM name" value={createdBy} onChange={e => setCreatedBy(e.target.value)} /></div>
          </div>
          <div style={{ fontSize: "11px", fontWeight: "700", color: theme.textMuted, marginBottom: "10px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Select Customers from Pending Register</div>
          {pending.length === 0 ? (
            <div style={{ padding: "20px", color: theme.textMuted, fontSize: "13px" }}>No pending deliveries in the register.</div>
          ) : pending.map(entry => {
            const sel = selectedEntries.find(e => e.id === entry.id);
            return (
              <div key={entry.id} style={{ padding: "10px 14px", marginBottom: "8px", borderRadius: "8px", border: `1px solid ${sel ? theme.accent + "66" : theme.border}`, background: sel ? "rgba(245,166,35,0.05)" : "transparent" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <input type="checkbox" checked={!!sel} onChange={() => toggleEntry(entry)} style={{ width: "16px", height: "16px", cursor: "pointer", accentColor: theme.accent }} />
                  <div style={{ flex: 1 }}>
                    <strong>{entry.customer?.name}</strong>
                    <span style={{ ...styles.badge(theme.blue), marginLeft: "8px" }}>{entry.block_type}</span>
                    <div style={{ fontSize: "11px", color: theme.textMuted, marginTop: "2px" }}>{entry.customer?.location} · Remaining: {Number(entry.remaining_qty).toLocaleString()} blocks</div>
                  </div>
                  {sel && (
                    <div style={{ display: "flex", gap: "8px" }}>
                      <div><label style={{ ...styles.label, fontSize: "10px" }}>Qty Today</label><input style={{ ...styles.input, width: "100px" }} type="number" value={sel.qtyToday} onChange={e => updateSelectedQty(entry.id, e.target.value)} /></div>
                      <div><label style={{ ...styles.label, fontSize: "10px" }}>Instructions</label><input style={{ ...styles.input, width: "180px" }} placeholder="Optional" value={sel.notes} onChange={e => updateSelectedNotes(entry.id, e.target.value)} /></div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          {selectedEntries.length > 0 && (
            <div style={{ padding: "10px 14px", background: theme.surface, borderRadius: "8px", marginBottom: "16px", fontSize: "13px", color: theme.textMuted }}>
              {selectedEntries.length} customer{selectedEntries.length > 1 ? "s" : ""} selected · Total: {selectedEntries.reduce((s, e) => s + (parseInt(e.qtyToday) || 0), 0).toLocaleString()} blocks
            </div>
          )}
          <div style={styles.row}>
            <button style={styles.btn("primary")} onClick={() => handleCreate(true)} disabled={saving}>{saving ? "Submitting…" : "Save & Submit for ICO Approval"}</button>
            <button style={styles.btn("secondary")} onClick={() => handleCreate(false)} disabled={saving}>Save as Draft</button>
            <button style={styles.btn("secondary")} onClick={() => { setShowForm(false); setSelectedEntries([]); }}>Cancel</button>
          </div>
        </div>
      )}

      <div style={styles.card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px", flexWrap: "wrap", gap: "8px" }}>
          <div style={styles.sectionTitle}>Schedules</div>
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
            {[["all","All"],["draft","Draft"],["submitted","Pending ICO Approval"],["ico_approved","Approved"],["rejected","Rejected"]].map(([val, label]) => (
              <button key={val} onClick={() => setStatusFilter(val)} style={{ padding: "5px 12px", fontSize: "11px", fontWeight: "600", borderRadius: "6px", border: `1px solid ${statusFilter === val ? theme.accent : theme.border}`, background: statusFilter === val ? theme.accent + "22" : "transparent", color: statusFilter === val ? theme.accent : theme.textMuted, cursor: "pointer" }}>{label}</button>
            ))}
          </div>
        </div>
        {(() => {
          const filtered = statusFilter === "all" ? schedules : schedules.filter(s => {
            if (statusFilter === "ico_approved") return ["ico_approved", "store_notified", "in_progress"].includes(s.status);
            return s.status === statusFilter;
          });
          return loading ? <Spinner /> : filtered.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px", color: theme.textMuted }}>No schedules{statusFilter !== "all" ? ` with status "${statusFilter.replace(/_/g," ")}"` : ""} yet.</div>
          ) : filtered.map(s => (
          <div key={s.id} style={{ borderRadius: "8px", border: `1px solid ${theme.border}`, marginBottom: "10px", overflow: "hidden" }}>
            <div style={{ padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", background: expandedId === s.id ? "rgba(245,166,35,0.06)" : "transparent" }} onClick={() => setExpandedId(expandedId === s.id ? null : s.id)}>
              <div>
                <strong>{s.schedule_date}</strong>
                <span style={{ fontSize: "12px", color: theme.textMuted, marginLeft: "10px" }}>Created by {s.created_by || "—"} · {(s.items || []).length} deliveries</span>
                {s.ico_notes && <div style={{ fontSize: "11px", color: theme.textMuted, marginTop: "3px" }}>ICO note: {s.ico_notes}</div>}
              </div>
              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <span style={styles.badge(statusColor(s.status))}>{s.status?.replace(/_/g, " ")}</span>
                {s.status === "draft" && <button style={{ ...styles.btn("primary"), padding: "4px 12px", fontSize: "11px" }} onClick={e => { e.stopPropagation(); handleSubmit(s.id); }}>Submit for Approval</button>}
                {['ico_approved','store_notified','in_progress','completed'].includes(s.status) && (
                  <button data-board-allow data-ico-allow style={{ ...styles.btn("secondary"), padding: "4px 12px", fontSize: "11px" }} onClick={e => { e.stopPropagation(); printSchedulePDF(s); }}>Print PDF</button>
                )}
              </div>
            </div>
            {expandedId === s.id && (
              <div style={{ padding: "12px 16px", borderTop: `1px solid ${theme.border}`, background: theme.surface }}>
                <table style={styles.table}>
                  <thead><tr>{["Customer", "Location", "Block Type", "Qty Scheduled", "Notes", "Status"].map(h => <th key={h} style={styles.th}>{h}</th>)}</tr></thead>
                  <tbody>
                    {(s.items || []).map(item => (
                      <tr key={item.id}>
                        <td style={styles.td}><strong>{item.customer?.name || "—"}</strong></td>
                        <td style={styles.td}>{item.location || item.customer?.location || "—"}</td>
                        <td style={styles.td}><span style={styles.badge(theme.blue)}>{item.block_type}</span></td>
                        <td style={styles.td}><strong style={{ color: theme.accent }}>{Number(item.qty_scheduled).toLocaleString()}</strong></td>
                        <td style={styles.td}>{item.notes || "—"}</td>
                        <td style={styles.td}><span style={styles.badge(statusColor(item.status))}>{item.status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ));
        })()}
      </div>
    </div>
  );
};

// ── SCHEDULE APPROVALS (ICO) ────────────────────────────────────
const ScheduleApprovals = () => {
  const [submitted, setSubmitted] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null);
  const [alert, setAlert] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [notes, setNotes] = useState({});
  const [approvedBy, setApprovedBy] = useState("");
  const [rejectedItems, setRejectedItems] = useState({});

  const load = async () => {
    setLoading(true);
    try { setSubmitted(await schedulesService.getSubmitted()); }
    catch (e) { setAlert({ type: "error", msg: "Could not load submissions: " + e.message }); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const toggleRejectItem = (schedId, itemId) => {
    setRejectedItems(prev => {
      const cur = prev[schedId] || [];
      return { ...prev, [schedId]: cur.includes(itemId) ? cur.filter(i => i !== itemId) : [...cur, itemId] };
    });
  };

  const handleApprove = async (sched) => {
    if (!approvedBy.trim()) return setAlert({ type: "error", msg: "Enter your name as ICO approver." });
    setSaving(sched.id + "approve");
    try {
      const rejected = rejectedItems[sched.id] || [];
      await schedulesService.icoApprove(sched.id, approvedBy, notes[sched.id] || null, rejected);
      const approved = (sched.items || []).filter(i => !rejected.includes(i.id));
      for (const item of approved) {
        if (item.pending_register_id) {
          await pendingDeliveryService.updateDelivered(item.pending_register_id, 0).catch(() => {});
          await supabaseUpdateScheduleItemStatus(item.pending_register_id);
        }
      }
      setAlert({ type: "success", msg: `Schedule approved by ICO. ${rejected.length > 0 ? `${rejected.length} delivery(ies) removed.` : ""}` });
      await load();
    } catch (e) { setAlert({ type: "error", msg: "Failed: " + e.message }); }
    finally { setSaving(null); }
  };

  const handleReject = async (sched) => {
    if (!approvedBy.trim()) return setAlert({ type: "error", msg: "Enter your name as ICO reviewer." });
    if (!notes[sched.id]?.trim()) return setAlert({ type: "error", msg: "Rejection comments are required." });
    setSaving(sched.id + "reject");
    try {
      await schedulesService.icoReject(sched.id, approvedBy, notes[sched.id]);
      setAlert({ type: "success", msg: "Schedule rejected and returned to BDM." });
      await load();
    } catch (e) { setAlert({ type: "error", msg: "Failed: " + e.message }); }
    finally { setSaving(null); }
  };

  const supabaseUpdateScheduleItemStatus = async () => {}; // status updates handled by icoApprove

  const printApprovalPDF = (sched) => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const W = doc.internal.pageSize.getWidth();
    doc.setFillColor(30, 40, 70); doc.rect(0, 0, W, 28, 'F');
    doc.setFontSize(13); doc.setFont(undefined, 'bold'); doc.setTextColor(255, 255, 255);
    doc.text('Abuja Precast Concrete Limited', 14, 11);
    doc.setFontSize(11); doc.setTextColor(180, 200, 255);
    doc.text('SCHEDULE APPROVAL RECORD', W - 14, 11, { align: 'right' });
    doc.setFontSize(9); doc.setFont(undefined, 'normal'); doc.setTextColor(200, 210, 240);
    doc.text(`Date: ${sched.schedule_date}  |  Reviewed by ICO: ${approvedBy || sched.ico_approved_by || '—'}`, 14, 20);
    doc.text(`Status: ${(sched.status || '').replace(/_/g, ' ').toUpperCase()}`, W - 14, 20, { align: 'right' });
    doc.setDrawColor(79, 142, 247); doc.setLineWidth(0.5); doc.line(14, 28, W - 14, 28);
    let y = 34;
    if (sched.ico_notes) {
      doc.setFontSize(9); doc.setTextColor(100, 150, 255); doc.text(`ICO Notes: ${sched.ico_notes}`, 14, y); y += 8;
    }
    autoTable(doc, {
      startY: y,
      head: [['S/N', 'Customer', 'Site / Location', 'Block Type', 'Qty Scheduled', 'Decision', 'Notes']],
      body: (sched.items || []).map((item, i) => [
        i + 1,
        item.customer?.name || '—',
        item.location || item.customer?.location || '—',
        item.block_type || '—',
        Number(item.qty_scheduled || 0).toLocaleString(),
        item.status === 'rejected' ? 'REMOVED' : 'APPROVED',
        item.notes || '—',
      ]),
      styles: { fontSize: 8.5, cellPadding: 3 },
      headStyles: { fillColor: [30, 40, 70], textColor: [255, 255, 255], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [245, 247, 255] },
      didParseCell: (data) => {
        if (data.column.index === 5 && data.cell.text[0] === 'REMOVED') {
          data.cell.styles.textColor = [220, 60, 60]; data.cell.styles.fontStyle = 'bold';
        }
        if (data.column.index === 5 && data.cell.text[0] === 'APPROVED') {
          data.cell.styles.textColor = [30, 140, 80]; data.cell.styles.fontStyle = 'bold';
        }
      },
      margin: { left: 14, right: 14 },
    });
    const finalY = doc.lastAutoTable.finalY + 12;
    doc.setFontSize(9); doc.setTextColor(60, 60, 80);
    doc.text(`BDM / Prepared by: ${sched.created_by || '—'}`, 14, finalY);
    doc.text(`ICO Reviewer: ${approvedBy || sched.ico_approved_by || '—'}`, W / 2, finalY, { align: 'center' });
    doc.text(`Printed: ${new Date().toLocaleDateString('en-GB')}`, W - 14, finalY, { align: 'right' });
    doc.setFontSize(8); doc.setTextColor(140, 140, 160);
    doc.text('1, Dutse Alhaji, Behind Tipper Garage, Off Bwari Expressway, Abuja  |  +234 905 554 4433', W / 2, doc.internal.pageSize.getHeight() - 8, { align: 'center' });
    doc.save(`Schedule-Approval-${sched.schedule_date}.pdf`);
  };

  return (
    <div>
      <div style={styles.header}>
        <div><div style={styles.pageTitle}>Schedule Approvals</div><div style={styles.pageSubtitle}>ICO review queue for submitted delivery schedules</div></div>
        {submitted.length > 0 && <span style={{ ...styles.badge(theme.red), fontSize: "13px", padding: "6px 14px" }}>{submitted.length} pending</span>}
      </div>
      {alert && <Alert msg={alert.msg} type={alert.type} onClose={() => setAlert(null)} />}

      <div style={{ ...styles.card, marginBottom: "16px" }}>
        <div style={styles.formGroup}>
          <label style={styles.label}>ICO Reviewer Name</label>
          <input style={{ ...styles.input, maxWidth: "280px" }} placeholder="Enter your name to approve/reject" value={approvedBy} onChange={e => setApprovedBy(e.target.value)} />
        </div>
      </div>

      {loading ? <Spinner /> : submitted.length === 0 ? (
        <div style={{ ...styles.card, textAlign: "center", padding: "48px", color: theme.textMuted }}>No schedules awaiting ICO approval.</div>
      ) : submitted.map(sched => {
        const rejected = rejectedItems[sched.id] || [];
        const isOpen = expandedId === sched.id;
        return (
          <div key={sched.id} style={{ ...styles.card, marginBottom: "14px", borderLeft: `4px solid ${theme.accent}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }} onClick={() => setExpandedId(isOpen ? null : sched.id)}>
              <div>
                <div style={{ fontWeight: "700", fontSize: "15px" }}>Schedule for {sched.schedule_date}</div>
                <div style={{ fontSize: "12px", color: theme.textMuted, marginTop: "3px" }}>Created by {sched.created_by || "—"} · {(sched.items || []).length} customers · Submitted for ICO review</div>
              </div>
              <span style={{ ...styles.badge(theme.accent), cursor: "pointer" }}>{isOpen ? "▲ Hide" : "▼ Review"}</span>
            </div>
            {isOpen && (
              <div style={{ marginTop: "16px", borderTop: `1px solid ${theme.border}`, paddingTop: "16px" }}>
                <div style={{ fontSize: "12px", color: theme.textMuted, marginBottom: "10px" }}>Check items to <strong style={{ color: theme.red }}>REMOVE</strong> from this schedule before approving:</div>
                {(sched.items || []).map(item => {
                  const isRejected = rejected.includes(item.id);
                  return (
                    <div key={item.id} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "8px 12px", marginBottom: "6px", borderRadius: "6px", background: isRejected ? "rgba(240,107,107,0.08)" : "rgba(45,212,160,0.05)", border: `1px solid ${isRejected ? theme.red + "44" : theme.green + "44"}` }}>
                      <input type="checkbox" checked={isRejected} onChange={() => toggleRejectItem(sched.id, item.id)} style={{ width: "16px", height: "16px", cursor: "pointer", accentColor: theme.red }} />
                      <div style={{ flex: 1 }}>
                        <strong style={{ textDecoration: isRejected ? "line-through" : "none", opacity: isRejected ? 0.5 : 1 }}>{item.customer?.name || "—"}</strong>
                        <span style={{ ...styles.badge(theme.blue), marginLeft: "8px", opacity: isRejected ? 0.5 : 1 }}>{item.block_type}</span>
                        <span style={{ marginLeft: "10px", fontSize: "12px", color: theme.textMuted }}>{Number(item.qty_scheduled).toLocaleString()} blocks · {item.location || item.customer?.location || ""}</span>
                      </div>
                      {isRejected && <span style={{ fontSize: "11px", color: theme.red }}>Will be removed</span>}
                    </div>
                  );
                })}
                {rejected.length > 0 && <div style={{ fontSize: "12px", color: theme.red, marginBottom: "8px" }}>{rejected.length} item(s) marked for removal. The rest will be approved.</div>}
                <div style={styles.formGroup}>
                  <label style={styles.label}>ICO Notes (required for rejection)</label>
                  <input style={styles.input} placeholder="Comments for BDM…" value={notes[sched.id] || ""} onChange={e => setNotes(prev => ({ ...prev, [sched.id]: e.target.value }))} />
                </div>
                <div style={styles.row}>
                  <button data-ico-allow style={styles.btn("primary")} disabled={!!saving} onClick={() => handleApprove(sched)}>{saving === sched.id + "approve" ? "Approving…" : rejected.length > 0 ? `Approve (Remove ${rejected.length})` : "Approve Full Schedule"}</button>
                  <button data-ico-allow style={styles.btn("danger")} disabled={!!saving} onClick={() => handleReject(sched)}>{saving === sched.id + "reject" ? "Rejecting…" : "Reject Entire Schedule"}</button>
                  <button data-board-allow data-ico-allow style={{ ...styles.btn("secondary"), marginLeft: "auto" }} onClick={() => printApprovalPDF(sched)}>Print PDF</button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

// ── BATCHES ────────────────────────────────────────────────────
const Batches = ({ userProfile }) => {
  const [batches, setBatches] = useState([]);
  const [productions, setProductions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [alert, setAlert] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [editTarget, setEditTarget] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [deleting, setDeleting] = useState(null);
  const [dmgTarget, setDmgTarget] = useState(null);
  const [dmgForm, setDmgForm] = useState({ qty: '', date: '', notes: '' });
  const [dmgSaving, setDmgSaving] = useState(false);
  const [products, setProducts] = useState([]);
  const [productsLoadFailed, setProductsLoadFailed] = useState(false);
  const [curingId, setCuringId] = useState(null);
  const today = new Date().toISOString().split("T")[0];
  // Mirrors the live batches RLS policies exactly (single source, so buttons
  // can't drift out of sync with the DB the way Log Damage did):
  //   batches_insert / batches_update → md, production_manager, assistant_production_manager, store_officer
  //   batches_delete → md only
  const BATCH_WRITE_ROLES = ['md', 'production_manager', 'assistant_production_manager', 'store_officer'];
  const BATCH_DELETE_ROLES = ['md'];
  const canWriteBatch = hasRole(userProfile, ...BATCH_WRITE_ROLES);
  const canDeleteBatch = BATCH_DELETE_ROLES.includes(userProfile?.role);
  const emptyForm = { productId: "", blockType: "", dateCured: today, qtyAccepted: "", createdBy: "", notes: "", linkedProds: [] };
  const [form, setForm] = useState(emptyForm);

  const load = async () => {
    setLoading(true);
    try {
      const [b, p] = await Promise.all([batchesService.getAll(), productionService.getAll()]);
      setBatches(b);
      setProductions(p);
    } catch (e) { setAlert({ type: "error", msg: "Could not load batches: " + e.message }); }
    finally { setLoading(false); }
    // Products power the block-type dropdown and the curing standard per batch.
    // Loaded separately and non-blocking: a failure here must not break the
    // batch list or the New Batch flow, which work without it (degraded).
    productsService.getActive()
      .then(p => { setProducts(p); setProductsLoadFailed(false); })
      .catch(e => { console.error("Could not load products for batch curing/dropdown:", e); setProductsLoadFailed(true); });
  };

  useEffect(() => { load(); }, []);

  // Only block products belong in a batch; curing standards are read per batch
  // from the product FK.
  const blockProducts = products.filter(p => p.category === "Blocks");
  const productById = Object.fromEntries(products.map(p => [p.id, p]));

  const toggleProdLink = (id) => setForm(f => ({ ...f, linkedProds: f.linkedProds.includes(id) ? f.linkedProds.filter(p => p !== id) : [...f.linkedProds, id] }));

  const handleCreate = async () => {
    // Normal mode requires a product selection (product_id); the degraded
    // fallback (products failed to load) requires a block_type instead.
    if (!productsLoadFailed && !form.productId) return setAlert({ type: "error", msg: "Please select a block type." });
    if (productsLoadFailed && !form.blockType) return setAlert({ type: "error", msg: "Please select a block type." });
    if (!form.qtyAccepted || !form.dateCured) return setAlert({ type: "error", msg: "Quantity accepted and batch date are required." });
    setSaving(true);
    try {
      let batchNum = await batchesService.getNextNumber();
      try {
        await batchesService.create({
          batch_number: batchNum, product_id: form.productId || null, block_type: form.blockType, date_cured: form.dateCured,
          qty_accepted: parseInt(form.qtyAccepted), qty_remaining: parseInt(form.qtyAccepted),
          status: "active", notes: form.notes || null, created_by: form.createdBy || null,
        }, form.linkedProds);
      } catch (createErr) {
        if (createErr.code === '23505') {
          batchNum = await batchesService.getNextNumber();
          await batchesService.create({
            batch_number: batchNum, product_id: form.productId || null, block_type: form.blockType, date_cured: form.dateCured,
            qty_accepted: parseInt(form.qtyAccepted), qty_remaining: parseInt(form.qtyAccepted),
            status: "active", notes: form.notes || null, created_by: form.createdBy || null,
          }, form.linkedProds);
        } else {
          throw createErr;
        }
      }
      // Increase finished goods stock
      try { await finishedGoodsService.increase(form.blockType, parseInt(form.qtyAccepted)); } catch {}
      await load();
      setShowForm(false);
      setForm(emptyForm);
      setAlert({ type: "success", msg: `Batch ${batchNum} created. Finished goods stock updated.` });
    } catch (e) { setAlert({ type: "error", msg: "Failed to create batch: " + e.message }); }
    finally { setSaving(false); }
  };

  const startEdit = (b) => {
    setEditTarget(b);
    setEditForm({ blockType: b.block_type, dateCured: b.date_cured, qtyAccepted: String(b.qty_accepted), createdBy: b.created_by || "", notes: b.notes || "" });
    setExpandedId(null);
  };

  const handleSaveEdit = async () => {
    if (!editForm.qtyAccepted || !editForm.dateCured) return setAlert({ type: "error", msg: "Quantity and date are required." });
    setSaving(true);
    try {
      const oldQty = Number(editTarget.qty_accepted);
      const newQty = parseInt(editForm.qtyAccepted);
      const diff = newQty - oldQty;
      const newRemaining = Math.max(0, Number(editTarget.qty_remaining) + diff);
      await batchesService.update(editTarget.id, {
        block_type: editForm.blockType,
        date_cured: editForm.dateCured,
        qty_accepted: newQty,
        qty_remaining: newRemaining,
        status: newRemaining === 0 ? "exhausted" : "active",
        created_by: editForm.createdBy || null,
        notes: editForm.notes || null,
      });
      if (diff !== 0) {
        try {
          if (diff > 0) await finishedGoodsService.increase(editForm.blockType, diff);
          else await finishedGoodsService.decrease(editForm.blockType, Math.abs(diff));
        } catch {}
      }
      await load();
      setEditTarget(null);
      setAlert({ type: "success", msg: "Batch updated." });
    } catch (e) { setAlert({ type: "error", msg: "Failed to update: " + e.message }); }
    finally { setSaving(false); }
  };

  const handleDelete = async (b) => {
    if (!window.confirm(`Delete batch ${b.batch_number}? This cannot be undone.`)) return;
    setDeleting(b.id);
    try {
      try { await finishedGoodsService.decrease(b.block_type, Number(b.qty_remaining)); } catch {}
      await batchesService.delete(b.id);
      await load();
      setAlert({ type: "success", msg: `Batch ${b.batch_number} deleted.` });
    } catch (e) { setAlert({ type: "error", msg: "Failed to delete: " + e.message }); }
    finally { setDeleting(null); }
  };

  const openDmgModal = (b) => {
    setDmgTarget(b);
    setDmgForm({ qty: '', date: today, notes: '' });
  };

  const handleLogDamage = async () => {
    const qty = parseInt(dmgForm.qty);
    if (!qty || qty <= 0) return setAlert({ type: "error", msg: "Quantity damaged must be a positive number." });
    if (!dmgForm.date) return setAlert({ type: "error", msg: "Date is required." });
    setDmgSaving(true);
    try {
      await productionService.logDamage({
        date: dmgForm.date,
        block_type: dmgTarget.block_type,
        stage: "curing",
        quantity_damaged: qty,
        batch_id: dmgTarget.id,
        notes: dmgForm.notes || null,
        recorded_by: userProfile?.id || null,
      });
      await batchesService.reduceStock(dmgTarget.id, qty);
      try { await finishedGoodsService.decrease(dmgTarget.block_type, qty); } catch {}
      await load();
      setDmgTarget(null);
      setAlert({ type: "success", msg: `${qty} damaged block(s) logged against ${dmgTarget.batch_number}.` });
    } catch (e) { setAlert({ type: "error", msg: "Failed to log damage: " + e.message }); }
    finally { setDmgSaving(false); }
  };

  const handleMarkCured = async (b) => {
    setCuringId(b.id);
    try {
      await batchesService.markCured(b.id, userProfile?.id || null);
      await load();
      setAlert({ type: "success", msg: `Batch ${b.batch_number} marked as cured.` });
    } catch (e) { setAlert({ type: "error", msg: "Failed to mark cured: " + e.message }); }
    finally { setCuringId(null); }
  };

  // Advisory curing state for a batch row. Returns null when curing doesn't
  // apply (no product FK on historical rows, bought-in stock, or a product
  // with no finalized curing standard) — the row then shows "N/A" and no action.
  const curingInfo = (b) => {
    const prod = b.product_id ? productById[b.product_id] : null;
    if (!prod || prod.is_own_production !== true || prod.min_cure_days == null) return null;
    if (b.cured_verified) return { state: "cured" };
    if (!b.date_cured) return { state: "curing", ready: false, daysRemaining: null };
    const ageDays = Math.floor((new Date(today) - new Date(b.date_cured)) / 86400000);
    const daysRemaining = prod.min_cure_days - ageDays;
    return { state: "curing", ready: daysRemaining <= 0, daysRemaining };
  };

  const filteredProds = productions.filter(p => p.block_type === form.blockType);
  const totalInYard = batches.filter(b => b.status === "active").reduce((s, b) => s + Number(b.qty_remaining || 0), 0);

  return (
    <div>
      <div style={styles.header}>
        <div><div style={styles.pageTitle}>Batch Management</div><div style={styles.pageSubtitle}>Finished goods batches after curing — link to production logs</div></div>
        {canWriteBatch && <button style={styles.btn("primary")} onClick={() => setShowForm(!showForm)}>+ Create Batch</button>}
      </div>
      {alert && <Alert msg={alert.msg} type={alert.type} onClose={() => setAlert(null)} />}

      {/* Edit Modal */}
      {editTarget && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
          <div style={{ background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: "12px", padding: "24px", width: "100%", maxWidth: "540px" }}>
            <div style={{ fontWeight: "700", fontSize: "15px", marginBottom: "18px" }}>Edit Batch — {editTarget.batch_number}</div>
            <div style={styles.grid(2)}>
              <div style={styles.formGroup}><label style={styles.label}>Block Type</label><ProductSelect value={editForm.blockType} onChange={(name) => setEditForm(f => ({ ...f, blockType: name }))} style={styles.input} /></div>
              <div style={styles.formGroup}><label style={styles.label}>Batch Date *</label><input style={styles.input} type="date" value={editForm.dateCured} onChange={e => setEditForm(f => ({ ...f, dateCured: e.target.value }))} /></div>
              <div style={styles.formGroup}><label style={styles.label}>Qty Accepted *</label><input style={styles.input} type="number" value={editForm.qtyAccepted} onChange={e => setEditForm(f => ({ ...f, qtyAccepted: e.target.value }))} /></div>
              <div style={styles.formGroup}><label style={styles.label}>Created By</label><input style={styles.input} value={editForm.createdBy} onChange={e => setEditForm(f => ({ ...f, createdBy: e.target.value }))} /></div>
              <div style={{ ...styles.formGroup, gridColumn: "span 2" }}><label style={styles.label}>Notes</label><input style={styles.input} value={editForm.notes} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} /></div>
            </div>
            {parseInt(editForm.qtyAccepted) !== editTarget.qty_accepted && (
              <div style={{ padding: "8px 12px", background: theme.accent + "22", border: `1px solid ${theme.accent}44`, borderRadius: "6px", fontSize: "11px", color: theme.accent, marginBottom: "12px" }}>
                Qty changing by {parseInt(editForm.qtyAccepted) - editTarget.qty_accepted > 0 ? "+" : ""}{parseInt(editForm.qtyAccepted) - editTarget.qty_accepted} — finished goods stock will be adjusted automatically.
              </div>
            )}
            <div style={styles.row}>
              <button style={styles.btn("primary")} onClick={handleSaveEdit} disabled={saving}>{saving ? "Saving…" : "Save Changes"}</button>
              <button style={styles.btn("secondary")} onClick={() => setEditTarget(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Damage modal */}
      {dmgTarget && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
          <div style={{ background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: "12px", padding: "24px", width: "100%", maxWidth: "460px" }}>
            <div style={{ fontWeight: "700", fontSize: "15px", marginBottom: "4px" }}>Log Curing/Yard Damage</div>
            <div style={{ fontSize: "12px", color: theme.textMuted, marginBottom: "18px" }}>Batch {dmgTarget.batch_number} · {dmgTarget.block_type} · {Number(dmgTarget.qty_remaining).toLocaleString()} remaining</div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Quantity Damaged *</label>
              <input style={styles.input} type="number" min="1" placeholder="e.g. 30" value={dmgForm.qty} onChange={e => setDmgForm(f => ({ ...f, qty: e.target.value }))} />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Date *</label>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <input style={styles.input} type="date" value={dmgForm.date} onChange={e => setDmgForm(f => ({ ...f, date: e.target.value }))} />
                {dmgForm.date && dmgForm.date < today && (
                  <span style={{ fontSize: "10px", padding: "1px 6px", borderRadius: "4px", background: "#f59e0b22", color: "#f59e0b", border: "1px solid #f59e0b44", fontWeight: "700", whiteSpace: "nowrap" }}>Historical</span>
                )}
              </div>
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Notes (optional)</label>
              <input style={styles.input} placeholder="e.g. cracks found during picking" value={dmgForm.notes} onChange={e => setDmgForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
            <div style={styles.row}>
              <button style={styles.btn("danger")} onClick={handleLogDamage} disabled={dmgSaving}>{dmgSaving ? "Logging…" : "Log Damage"}</button>
              <button style={styles.btn("secondary")} onClick={() => setDmgTarget(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      <div style={styles.grid(3)}>
        <StatCard label="Active Batches" value={batches.filter(b => b.status === "active").length} sub="With stock remaining" accent={theme.green} />
        <StatCard label="Blocks In Yard" value={fmt(totalInYard)} sub="Across all active batches" accent={theme.accent} />
        <StatCard label="Exhausted Batches" value={batches.filter(b => b.status === "exhausted").length} sub="Fully delivered" accent={theme.textMuted} />
      </div>

      {showForm && (
        <div style={{ ...styles.card, marginBottom: "20px", borderColor: theme.accent + "44" }}>
          <div style={styles.sectionTitle}>Create New Batch</div>
          <div style={styles.grid(3)}>
            {productsLoadFailed ? (
              // Degraded: products couldn't load (network hiccup) — fall back to
              // the original free picker so batch creation still works. product_id
              // stays unset for these; block_type is still recorded.
              <div style={styles.formGroup}>
                <label style={styles.label}>Block Type *</label>
                <ProductSelect value={form.blockType} onChange={(name) => setForm({ ...form, blockType: name, productId: "", linkedProds: [] })} style={styles.input} />
              </div>
            ) : (
              <div style={styles.formGroup}>
                <label style={styles.label}>Block Type *</label>
                <select style={styles.input} value={form.productId} onChange={e => {
                  const p = blockProducts.find(pr => pr.id === e.target.value);
                  setForm({ ...form, productId: e.target.value, blockType: p ? p.name : "", linkedProds: [] });
                }}>
                  <option value="">— Select block —</option>
                  {blockProducts.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            )}
            <div style={styles.formGroup}>
              <label style={styles.label}>Batch Date *</label>
              <input style={styles.input} type="date" value={form.dateCured} onChange={e => setForm({ ...form, dateCured: e.target.value })} />
              <div style={{ fontSize: "11px", color: theme.textMuted, marginTop: "4px" }}>Date this batch was logged / cast</div>
            </div>
            <div style={styles.formGroup}><label style={styles.label}>Qty Accepted (Good Blocks) *</label><input style={styles.input} type="number" placeholder="e.g. 2500" value={form.qtyAccepted} onChange={e => setForm({ ...form, qtyAccepted: e.target.value })} /></div>
            <div style={styles.formGroup}><label style={styles.label}>Created By</label><input style={styles.input} placeholder="Store Officer name" value={form.createdBy} onChange={e => setForm({ ...form, createdBy: e.target.value })} /></div>
            <div style={{ ...styles.formGroup, gridColumn: "span 2" }}><label style={styles.label}>Notes</label><input style={styles.input} placeholder="Optional" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
          </div>
          {filteredProds.length > 0 && (
            <div style={{ marginBottom: "14px" }}>
              <div style={{ fontSize: "11px", fontWeight: "700", color: theme.textMuted, marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Link Production Log Entries (optional)</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                {filteredProds.map(p => {
                  const linked = form.linkedProds.includes(p.id);
                  return (
                    <div key={p.id} onClick={() => toggleProdLink(p.id)} style={{ padding: "5px 10px", borderRadius: "6px", fontSize: "12px", cursor: "pointer", border: `1px solid ${linked ? theme.accent : theme.border}`, background: linked ? "rgba(245,166,35,0.08)" : "transparent", color: linked ? theme.accent : theme.textMuted }}>
                      {p.date} · {p.block_type} · {p.quantity_produced?.toLocaleString()} blocks
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          <div style={styles.row}>
            <button style={styles.btn("primary")} onClick={handleCreate} disabled={saving}>{saving ? "Creating…" : "Create Batch & Update Stock"}</button>
            <button style={styles.btn("secondary")} onClick={() => { setShowForm(false); setForm(emptyForm); }}>Cancel</button>
          </div>
        </div>
      )}

      <div style={styles.card}>
        <div style={styles.sectionTitle}>All Batches ({batches.length})</div>
        {loading ? <Spinner /> : batches.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px", color: theme.textMuted }}>No batches created yet.</div>
        ) : batches.map(b => {
          const delivered = b.qty_accepted - b.qty_remaining;
          const pct = b.qty_accepted > 0 ? Math.round((delivered / b.qty_accepted) * 100) : 0;
          const isOpen = expandedId === b.id;
          const ci = curingInfo(b);
          return (
            <div key={b.id} style={{ borderRadius: "8px", border: `1px solid ${b.status === "exhausted" ? theme.border : theme.accent + "44"}`, marginBottom: "10px", overflow: "hidden" }}>
              <div style={{ padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }} onClick={() => setExpandedId(isOpen ? null : b.id)}>
                <div>
                  <strong style={{ fontSize: "14px" }}>{b.batch_number}</strong>
                  <span style={{ ...styles.badge(theme.blue), marginLeft: "8px" }}>{b.block_type}</span>
                  <span style={styles.badge(b.status === "active" ? theme.green : theme.textMuted)}>{b.status}</span>
                  {ci === null
                    ? <span style={styles.badge(theme.textMuted)}>N/A</span>
                    : ci.state === "cured"
                      ? <span style={styles.badge(theme.green)}>✓ Cured</span>
                      : <span style={styles.badge(theme.accent)}>Curing</span>}
                  <div style={{ fontSize: "12px", color: theme.textMuted, marginTop: "3px" }}>Batch date: {b.date_cured} · Created by: {b.created_by || "—"}</div>
                  {ci && ci.state === "curing" && !ci.ready && ci.daysRemaining != null && (
                    <div style={{ fontSize: "11px", color: theme.accent, marginTop: "3px" }}>Curing — ready in {ci.daysRemaining} day{ci.daysRemaining === 1 ? "" : "s"}</div>
                  )}
                </div>
                <div style={{ textAlign: "right", display: "flex", gap: "8px", alignItems: "center" }}>
                  <div>
                    <div style={{ fontSize: "13px" }}>Accepted: <strong style={{ color: theme.accent }}>{Number(b.qty_accepted).toLocaleString()}</strong></div>
                    <div style={{ fontSize: "13px" }}>Remaining: <strong style={{ color: b.status === "active" ? theme.green : theme.textMuted }}>{Number(b.qty_remaining).toLocaleString()}</strong></div>
                  </div>
                  <div style={{ display: "flex", gap: "6px" }} onClick={e => e.stopPropagation()}>
                    {canWriteBatch && ci && ci.state === "curing" && ci.ready && (
                      <button style={{ ...styles.btn("primary"), padding: "5px 12px", fontSize: "12px", background: theme.green, color: "#000" }} onClick={() => handleMarkCured(b)} disabled={curingId === b.id}>{curingId === b.id ? "…" : "Mark Cured"}</button>
                    )}
                    {canWriteBatch && b.status === "active" && (
                      <button style={{ ...styles.btn("danger"), padding: "5px 12px", fontSize: "12px" }} onClick={() => openDmgModal(b)}>Log Damage</button>
                    )}
                    {canWriteBatch && <button style={{ ...styles.btn("secondary"), padding: "5px 12px", fontSize: "12px" }} onClick={() => startEdit(b)}>Edit</button>}
                    {canDeleteBatch && <button style={{ ...styles.btn("danger"), padding: "5px 12px", fontSize: "12px" }} onClick={() => handleDelete(b)} disabled={deleting === b.id}>{deleting === b.id ? "…" : "Delete"}</button>}
                  </div>
                </div>
              </div>
              {isOpen && (
                <div style={{ padding: "12px 16px", borderTop: `1px solid ${theme.border}`, background: theme.surface }}>
                  <div style={{ fontSize: "12px", fontWeight: "700", color: theme.textMuted, marginBottom: "10px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Batch Reconciliation</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "10px", marginBottom: "12px" }}>
                    {[["Total Accepted", b.qty_accepted, theme.accent], ["Total Delivered", delivered, theme.green], ["Remaining in Batch", b.qty_remaining, b.status === "active" ? theme.blue : theme.textMuted], ["Delivery Rate", pct + "%", theme.green]].map(([label, val, color]) => (
                      <div key={label} style={{ background: theme.card, borderRadius: "6px", padding: "10px 12px" }}>
                        <div style={{ fontSize: "11px", color: theme.textMuted }}>{label}</div>
                        <div style={{ fontSize: "18px", fontWeight: "700", color }}>{Number(val).toLocaleString()}</div>
                      </div>
                    ))}
                  </div>
                  <div style={styles.progressBar()}><div style={styles.progressFill(pct, theme.green)} /></div>
                  <div style={{ fontSize: "11px", color: theme.textMuted, marginTop: "4px" }}>{pct}% of batch delivered</div>
                  {(b.links || []).length > 0 && (
                    <div style={{ marginTop: "12px" }}>
                      <div style={{ fontSize: "11px", fontWeight: "700", color: theme.textMuted, marginBottom: "6px", textTransform: "uppercase" }}>Linked Production Entries ({b.links.length})</div>
                      <div style={{ fontSize: "12px", color: theme.textMuted }}>{b.links.length} production log entr{b.links.length > 1 ? "ies" : "y"} linked to this batch.</div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ── PRODUCTS ──────────────────────────────────────────────────
const Products = () => {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [alert, setAlert] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const CATEGORIES = ["Blocks", "Interlocks", "Kerb Stones", "Other"];
  const UNITS = ["pieces", "sqm", "linear meter", "kg", "bags", "litres", "tonnes"];
  const emptyForm = { name: "", category: "Blocks", unit: "pieces", unit_price: "", description: "" };
  const [form, setForm] = useState(emptyForm);

  const load = async () => {
    setLoading(true);
    try { setProducts(await productsService.getAll()); }
    catch (e) { setAlert({ type: "error", msg: "Could not load products: " + e.message }); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const startEdit = (p) => {
    setEditTarget(p);
    setForm({ name: p.name, category: p.category, unit: p.unit, unit_price: String(p.unit_price || ""), description: p.description || "" });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.name) return setAlert({ type: "error", msg: "Product name is required." });
    setSaving(true); setAlert(null);
    try {
      const payload = { name: form.name, category: form.category, unit: form.unit, unit_price: parseFloat(form.unit_price) || 0, description: form.description || null };
      if (editTarget) {
        await productsService.update(editTarget.id, payload);
        setAlert({ type: "success", msg: `${form.name} updated.` });
      } else {
        await productsService.create(payload);
        setAlert({ type: "success", msg: `${form.name} added!` });
      }
      await load();
      setShowForm(false); setForm(emptyForm); setEditTarget(null);
    } catch (e) { setAlert({ type: "error", msg: "Failed to save. " + e.message }); }
    finally { setSaving(false); }
  };

  const handleToggle = async (p) => {
    try {
      await productsService.toggleActive(p.id, !p.is_active);
      await load();
      setAlert({ type: "success", msg: `${p.name} ${p.is_active ? "deactivated" : "activated"}.` });
    } catch (e) { setAlert({ type: "error", msg: "Failed to update: " + e.message }); }
  };

  const byCategory = {};
  CATEGORIES.forEach(cat => {
    const prods = products.filter(p => p.category === cat);
    if (prods.length > 0) byCategory[cat] = prods;
  });
  [...new Set(products.filter(p => !CATEGORIES.includes(p.category)).map(p => p.category))].forEach(cat => {
    byCategory[cat] = products.filter(p => p.category === cat);
  });

  return (
    <div>
      <div style={styles.header}>
        <div>
          <div style={styles.pageTitle}>Product Catalogue</div>
          <div style={styles.pageSubtitle}>Manage all product types, units of measure, and default pricing</div>
        </div>
        <button style={styles.btn("primary")} onClick={() => { setShowForm(!showForm); if (showForm) { setEditTarget(null); setForm(emptyForm); } }}>+ Add Product</button>
      </div>
      {alert && <Alert msg={alert.msg} type={alert.type} onClose={() => setAlert(null)} />}
      {showForm && (
        <div style={{ ...styles.card, marginBottom: "24px", borderColor: theme.accent + "44" }}>
          <div style={styles.sectionTitle}>{editTarget ? `Edit — ${editTarget.name}` : "New Product"}</div>
          <div style={styles.grid(3)}>
            <div style={styles.formGroup}>
              <label style={styles.label}>Product Name *</label>
              <input style={styles.input} placeholder="e.g. 9 Inch 3 Hole Block" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Category</label>
              <input list="product-categories" style={styles.input} value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} placeholder="Select or type…" />
              <datalist id="product-categories">
                {CATEGORIES.map(c => <option key={c} value={c} />)}
              </datalist>
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Unit of Measure</label>
              <input list="product-units" style={styles.input} value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} placeholder="Select or type…" />
              <datalist id="product-units">
                {UNITS.map(u => <option key={u} value={u} />)}
              </datalist>
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Default Unit Price (₦)</label>
              <input style={styles.input} type="number" placeholder="0" value={form.unit_price} onChange={e => setForm({ ...form, unit_price: e.target.value })} />
            </div>
            <div style={{ ...styles.formGroup, gridColumn: "span 2" }}>
              <label style={styles.label}>Description (optional)</label>
              <input style={styles.input} placeholder="Additional notes" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
            </div>
          </div>
          <div style={styles.row}>
            <button style={styles.btn("primary")} onClick={handleSave} disabled={saving}>{saving ? "Saving…" : editTarget ? "Update Product" : "Add Product"}</button>
            <button style={styles.btn("secondary")} onClick={() => { setShowForm(false); setEditTarget(null); setForm(emptyForm); }}>Cancel</button>
          </div>
        </div>
      )}
      {loading ? <Spinner /> : Object.keys(byCategory).length === 0 ? (
        <div style={{ ...styles.card, textAlign: "center", padding: "40px", color: theme.textMuted }}>
          No products yet. Add products above or run the SQL to seed initial products.
        </div>
      ) : Object.entries(byCategory).map(([cat, prods]) => (
        <div key={cat} style={{ ...styles.card, marginBottom: "16px" }}>
          <div style={styles.sectionTitle}>{cat} ({prods.length})</div>
          <table style={styles.table}>
            <thead>
              <tr>{["Name", "Unit", "Default Price", "Status", ""].map(h => <th key={h} style={styles.th}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {prods.map(p => (
                <tr key={p.id} style={{ opacity: p.is_active ? 1 : 0.5 }}>
                  <td style={styles.td}><strong>{p.name}</strong>{p.description && <div style={{ fontSize: "11px", color: theme.textMuted }}>{p.description}</div>}</td>
                  <td style={styles.td}><span style={styles.badge(theme.blue)}>{p.unit}</span></td>
                  <td style={styles.td}>{p.unit_price > 0 ? naira(p.unit_price) : <span style={{ color: theme.textMuted }}>—</span>}</td>
                  <td style={styles.td}><span style={styles.badge(p.is_active ? theme.green : theme.red)}>{p.is_active ? "active" : "inactive"}</span></td>
                  <td style={styles.td}>
                    <div style={{ display: "flex", gap: "6px" }}>
                      <button style={{ ...styles.btn("secondary"), padding: "4px 10px", fontSize: "11px" }} onClick={() => startEdit(p)}>Edit</button>
                      <button style={{ ...styles.btn(p.is_active ? "danger" : "primary"), padding: "4px 10px", fontSize: "11px" }} onClick={() => handleToggle(p)}>{p.is_active ? "Deactivate" : "Activate"}</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
};

// ── ACCOUNTING ────────────────────────────────────────────────
const BookkeepingTab = () => {
  const today = new Date().toISOString().split('T')[0];
  const [date, setDate] = useState(today);
  const [payments, setPayments] = useState([]);
  const [incomeList, setIncomeList] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [incomeForm, setIncomeForm] = useState({ source: '', description: '', amount: '' });
  const [expenseForm, setExpenseForm] = useState({ category_id: '', description: '', amount: '', vendor: '', supplierId: '' });
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const [acctSuppliers, setAcctSuppliers] = useState([]);
  const [showCatManager, setShowCatManager] = useState(false);
  const [allCats, setAllCats] = useState([]);
  const [catForm, setCatForm] = useState({ name: '', parentCategory: '' });
  const [catErr, setCatErr] = useState('');

  useEffect(() => {
    setLoading(true);
    Promise.all([
      accountingService.getConfirmedPayments(date, date),
      incomeRecordsService.getAll(date, date),
      expensesService.getAll(date, date),
      expenseCategoriesService.getActive(),
    ]).then(([p, ir, ex, cats]) => { setPayments(p); setIncomeList(ir); setExpenses(ex); setCategories(cats); })
      .catch(e => setErr(e?.message || 'An error occurred')).finally(() => setLoading(false));
  }, [date]);

  useEffect(() => { suppliersService.getActive().then(setAcctSuppliers).catch(() => {}); }, []);

  const addIncome = async () => {
    if (!incomeForm.source || !incomeForm.amount) return;
    try {
      const rec = await incomeRecordsService.create({ source: incomeForm.source, description: incomeForm.description, amount: Number(incomeForm.amount), record_date: date });
      setIncomeList(p => [rec, ...p]);
      setIncomeForm({ source: '', description: '', amount: '' });
      setOk('Income recorded');
    } catch (e) { setErr(e?.message || 'An error occurred'); }
  };

  const deleteIncome = async (id) => {
    try { await incomeRecordsService.delete(id); setIncomeList(p => p.filter(r => r.id !== id)); }
    catch (e) { setErr(e?.message || 'An error occurred'); }
  };

  const addExpense = async () => {
    if (!expenseForm.description || !expenseForm.amount) return;
    const amount = Number(expenseForm.amount);
    const status = amount >= 50000 ? 'pending' : 'approved';
    try {
      const { supplierId: sid, ...formRest } = expenseForm;
      const rec = await expensesService.create({ ...formRest, supplier_id: sid || null, category_id: expenseForm.category_id || null, amount, expense_date: date, status });
      setExpenses(p => [rec, ...p]);
      if (sid && amount > 0) {
        try {
          await supplierTransactionsService.create({ supplier_id: sid, transaction_date: date, transaction_type: 'purchase', amount, description: expenseForm.description, linked_expense_id: rec.id });
        } catch { /* non-blocking */ }
      }
      setExpenseForm({ category_id: '', description: '', amount: '', vendor: '', supplierId: '' });
      setOk(status === 'pending' ? 'Submitted for MD approval (≥₦50,000)' : 'Expense recorded');
    } catch (e) { setErr(e?.message || 'An error occurred'); }
  };

  const approveExpense = async (id, status) => {
    try { await expensesService.updateStatus(id, status, 'MD'); setExpenses(p => p.map(e => e.id === id ? { ...e, status } : e)); }
    catch (e) { setErr(e?.message || 'An error occurred'); }
  };

  const deleteExpense = async (id) => {
    try { await expensesService.delete(id); setExpenses(p => p.filter(e => e.id !== id)); }
    catch (e) { setErr(e?.message || 'An error occurred'); }
  };

  const openCatManager = async () => {
    try { const all = await expenseCategoriesService.getAll(); setAllCats(all); } catch (e) { setCatErr(e.message); }
    setShowCatManager(true);
  };

  const addCategory = async () => {
    if (!catForm.name.trim()) { setCatErr('Name is required'); return; }
    try {
      const created = await expenseCategoriesService.create(catForm.name, catForm.parentCategory);
      setAllCats(p => [...p, created].sort((a, b) => (a.parent_category || '').localeCompare(b.parent_category || '') || a.name.localeCompare(b.name)));
      setCategories(p => [...p, created].sort((a, b) => (a.parent_category || '').localeCompare(b.parent_category || '') || a.name.localeCompare(b.name)));
      setCatForm({ name: '', parentCategory: '' });
      setCatErr('');
    } catch (e) { setCatErr(e.message); }
  };

  const toggleCategory = async (cat) => {
    try {
      await expenseCategoriesService.setActive(cat.id, !cat.is_active);
      setAllCats(p => p.map(c => c.id === cat.id ? { ...c, is_active: !cat.is_active } : c));
      if (cat.is_active) setCategories(p => p.filter(c => c.id !== cat.id));
      else setCategories(p => [...p, { ...cat, is_active: true }].sort((a, b) => (a.parent_category || '').localeCompare(b.parent_category || '') || a.name.localeCompare(b.name)));
    } catch (e) { setCatErr(e.message); }
  };

  const deleteCategory = async (id) => {
    try {
      await expenseCategoriesService.delete(id);
      setAllCats(p => p.filter(c => c.id !== id));
      setCategories(p => p.filter(c => c.id !== id));
    } catch (e) { setCatErr(e.message); }
  };

  const totalPaymentsAmt = payments.reduce((s, p) => s + Number(p.amount_paid || 0), 0);
  const totalOtherIncome = incomeList.reduce((s, r) => s + Number(r.amount || 0), 0);
  const totalIncome = totalPaymentsAmt + totalOtherIncome;
  const totalExpenses = expenses.filter(e => e.status !== 'rejected').reduce((s, e) => s + Number(e.amount || 0), 0);
  const net = totalIncome - totalExpenses;

  return (
    <div>
      <div style={{ ...styles.row, alignItems: 'flex-end', marginBottom: '20px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <label style={styles.label}>Date</label>
          <input type="date" style={{ ...styles.input, width: '160px' }} value={date} onChange={e => setDate(e.target.value)} />
        </div>
        <div style={{ display: 'flex', gap: '12px', flex: 1 }}>
          {[
            { label: 'Total Income', val: totalIncome, color: theme.green },
            { label: 'Total Expenses', val: totalExpenses, color: theme.red },
            { label: 'Net', val: net, color: net >= 0 ? theme.green : theme.red },
          ].map(({ label, val, color }) => (
            <div key={label} style={{ ...styles.statCard(color), flex: 1, padding: '14px 16px' }}>
              <div style={styles.statLabel}>{label}</div>
              <div style={{ ...styles.statValue, fontSize: '17px', color }}>{naira(val)}</div>
            </div>
          ))}
        </div>
      </div>

      {err && <Alert msg={err} onClose={() => setErr('')} />}
      {ok && <Alert msg={ok} type="success" onClose={() => setOk('')} />}
      {loading && <Spinner />}

      <div style={styles.row}>
        <div style={{ flex: 1 }}>
          <div style={styles.sectionTitle}>Income</div>
          {payments.length > 0 && (
            <div style={{ ...styles.card, marginBottom: '12px' }}>
              <div style={{ fontSize: '11px', fontWeight: '700', color: theme.textMuted, marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Customer Payments</div>
              {payments.map(p => (
                <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: `1px solid ${theme.border}22`, fontSize: '12px' }}>
                  <div>
                    <div style={{ fontWeight: '600' }}>{p.invoice?.order?.customer?.name || 'Customer'}</div>
                    {p.invoice?.invoice_number && <div style={{ fontSize: '11px', color: theme.textMuted }}>{p.invoice.invoice_number}</div>}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontWeight: '600', color: theme.green }}>{naira(p.amount_paid)}</span>
                    <button
                      style={{ ...styles.btn('primary'), padding: '2px 8px', fontSize: '10px' }}
                      onClick={() => generatePaymentReceiptPDF({ payment: p, customer: p.invoice?.order?.customer, invoiceNumber: p.invoice?.invoice_number, invoiceTotal: p.invoice?.total_amount || null, totalPaidSoFar: null })}
                    >Receipt</button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div style={styles.card}>
            <div style={{ fontSize: '11px', fontWeight: '700', color: theme.textMuted, marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Add Other Income</div>
            <div style={styles.formGroup}><label style={styles.label}>Source *</label><input style={styles.input} placeholder="e.g. Equipment rental, Scrap sale" value={incomeForm.source} onChange={e => setIncomeForm(f => ({ ...f, source: e.target.value }))} /></div>
            <div style={styles.formGroup}><label style={styles.label}>Description</label><input style={styles.input} placeholder="Optional details" value={incomeForm.description} onChange={e => setIncomeForm(f => ({ ...f, description: e.target.value }))} /></div>
            <div style={styles.formGroup}><label style={styles.label}>Amount (₦) *</label><input type="number" style={styles.input} placeholder="0" value={incomeForm.amount} onChange={e => setIncomeForm(f => ({ ...f, amount: e.target.value }))} /></div>
            <button style={styles.btn('primary')} onClick={addIncome}>+ Add Income</button>
          </div>
          {incomeList.length > 0 && (
            <div style={{ ...styles.card, marginTop: '12px' }}>
              <div style={{ fontSize: '11px', fontWeight: '700', color: theme.textMuted, marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Other Income Today</div>
              {incomeList.map(r => (
                <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: `1px solid ${theme.border}22` }}>
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: '600' }}>{r.source}</div>
                    {r.description && <div style={{ fontSize: '11px', color: theme.textMuted }}>{r.description}</div>}
                  </div>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <span style={{ fontSize: '13px', fontWeight: '600', color: theme.green }}>{naira(r.amount)}</span>
                    <button style={{ ...styles.btn('danger'), padding: '2px 8px', fontSize: '10px' }} onClick={() => deleteIncome(r.id)}>✕</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ flex: 1 }}>
          <div style={styles.sectionTitle}>Expenses</div>
          <div style={styles.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <div style={{ fontSize: '11px', fontWeight: '700', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Record Expense</div>
              <button style={{ ...styles.btn('secondary'), padding: '3px 10px', fontSize: '11px' }} onClick={openCatManager}>⚙ Manage Categories</button>
            </div>

            {showCatManager && (
              <div style={{ background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: '8px', padding: '14px', marginBottom: '14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <div style={{ fontSize: '12px', fontWeight: '700', color: theme.text }}>Expense Categories</div>
                  <button style={{ ...styles.btn('secondary'), padding: '2px 8px', fontSize: '11px' }} onClick={() => { setShowCatManager(false); setCatErr(''); }}>✕ Close</button>
                </div>
                {catErr && <div style={{ color: theme.red, fontSize: '11px', marginBottom: '8px' }}>{catErr}</div>}
                <div style={{ display: 'flex', gap: '6px', marginBottom: '10px', flexWrap: 'wrap' }}>
                  <input style={{ ...styles.input, flex: 2, minWidth: '100px', padding: '5px 8px', fontSize: '12px' }} placeholder="Category name *" value={catForm.name} onChange={e => setCatForm(f => ({ ...f, name: e.target.value }))} />
                  <input style={{ ...styles.input, flex: 2, minWidth: '100px', padding: '5px 8px', fontSize: '12px' }} placeholder="Group (e.g. Operating Expenses)" value={catForm.parentCategory} onChange={e => setCatForm(f => ({ ...f, parentCategory: e.target.value }))} />
                  <button style={{ ...styles.btn('primary'), padding: '5px 12px', fontSize: '12px', whiteSpace: 'nowrap' }} onClick={addCategory}>+ Add</button>
                </div>
                <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                  {allCats.map(c => (
                    <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', borderBottom: `1px solid ${theme.border}22`, opacity: c.is_active ? 1 : 0.5 }}>
                      <div style={{ fontSize: '12px' }}>
                        {c.parent_category && <span style={{ color: theme.textMuted }}>{c.parent_category} › </span>}
                        <span style={{ fontWeight: '500' }}>{c.name}</span>
                        {!c.is_active && <span style={{ marginLeft: '6px', fontSize: '10px', color: theme.textMuted }}>(disabled)</span>}
                      </div>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <button style={{ ...styles.btn('secondary'), padding: '2px 8px', fontSize: '10px' }} onClick={() => toggleCategory(c)}>{c.is_active ? 'Disable' : 'Enable'}</button>
                        <button style={{ ...styles.btn('danger'), padding: '2px 8px', fontSize: '10px' }} onClick={() => deleteCategory(c.id)}>Delete</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={styles.formGroup}>
              <label style={styles.label}>Category</label>
              <select style={styles.input} value={expenseForm.category_id} onChange={e => setExpenseForm(f => ({ ...f, category_id: e.target.value }))}>
                <option value="">— Select category —</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.parent_category ? `${c.parent_category} › ` : ''}{c.name}</option>)}
              </select>
            </div>
            <div style={styles.formGroup}><label style={styles.label}>Description *</label><input style={styles.input} placeholder="What was purchased / paid for?" value={expenseForm.description} onChange={e => setExpenseForm(f => ({ ...f, description: e.target.value }))} /></div>
            <div style={styles.row}>
              <div style={{ flex: 1, ...styles.formGroup }}>
                <label style={styles.label}>Amount (₦) *</label>
                <input type="number" style={styles.input} placeholder="0" value={expenseForm.amount} onChange={e => setExpenseForm(f => ({ ...f, amount: e.target.value }))} />
              </div>
              <div style={{ flex: 1, ...styles.formGroup }}>
                <label style={styles.label}>Vendor / Payee</label>
                {acctSuppliers.length > 0 ? (
                  <select style={styles.input} value={expenseForm.supplierId || '__other__'} onChange={e => {
                    if (e.target.value === '__other__') { setExpenseForm(f => ({ ...f, supplierId: '', vendor: f.vendor })); }
                    else { const sup = acctSuppliers.find(s => s.id === e.target.value); setExpenseForm(f => ({ ...f, supplierId: e.target.value, vendor: sup?.company_name || '' })); }
                  }}>
                    <option value="">— Select supplier —</option>
                    {acctSuppliers.map(s => <option key={s.id} value={s.id}>{s.company_name}</option>)}
                    <option value="__other__">Other (type manually)</option>
                  </select>
                ) : null}
                {(!expenseForm.supplierId || expenseForm.supplierId === '__other__') && (
                  <input style={{ ...styles.input, marginTop: acctSuppliers.length > 0 ? '6px' : '0' }} placeholder="Vendor / payee name" value={expenseForm.vendor} onChange={e => setExpenseForm(f => ({ ...f, vendor: e.target.value, supplierId: '' }))} />
                )}
              </div>
            </div>
            {Number(expenseForm.amount) >= 50000 && (
              <div style={{ padding: '8px 12px', background: theme.accent + '22', border: `1px solid ${theme.accent}44`, borderRadius: '6px', fontSize: '11px', color: theme.accent, marginBottom: '10px' }}>
                ⚠ Amount ≥ ₦50,000 — will be submitted for MD approval
              </div>
            )}
            <button style={styles.btn('primary')} onClick={addExpense}>+ Record Expense</button>
          </div>
          {expenses.length > 0 && (
            <div style={{ ...styles.card, marginTop: '12px' }}>
              <div style={{ fontSize: '11px', fontWeight: '700', color: theme.textMuted, marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Expenses Today</div>
              {expenses.map(e => (
                <div key={e.id} style={{ padding: '8px 0', borderBottom: `1px solid ${theme.border}22` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '12px', fontWeight: '600' }}>{e.description}</div>
                      <div style={{ fontSize: '11px', color: theme.textMuted }}>{e.category?.name || 'Uncategorised'}{e.vendor ? ` · ${e.vendor}` : ''}</div>
                    </div>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                      <span style={{ fontSize: '13px', fontWeight: '600', color: theme.red }}>{naira(e.amount)}</span>
                      <span style={styles.badge(e.status === 'approved' ? theme.green : e.status === 'pending' ? theme.accent : theme.red)}>{e.status}</span>
                    </div>
                  </div>
                  {e.status === 'pending' && (
                    <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
                      <button style={{ ...styles.btn('primary'), padding: '3px 10px', fontSize: '11px' }} onClick={() => approveExpense(e.id, 'approved')}>✓ Approve</button>
                      <button style={{ ...styles.btn('danger'), padding: '3px 10px', fontSize: '11px' }} onClick={() => approveExpense(e.id, 'rejected')}>✕ Reject</button>
                    </div>
                  )}
                  {e.status !== 'pending' && (
                    <button style={{ ...styles.btn('danger'), padding: '2px 8px', fontSize: '10px', marginTop: '4px' }} onClick={() => deleteExpense(e.id)}>Delete</button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const PLTab = () => {
  const now = new Date();
  const firstOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const [from, setFrom] = useState(firstOfMonth);
  const [to, setTo] = useState(now.toISOString().split('T')[0]);
  const [payments, setPayments] = useState([]);
  const [incomeRecords, setIncomeRecords] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [pdfLoading, setPdfLoading] = useState(false);

  const load = () => {
    setLoading(true);
    Promise.all([
      accountingService.getConfirmedPayments(from, to),
      incomeRecordsService.getAll(from, to),
      expensesService.getAll(from, to),
    ]).then(([p, ir, ex]) => { setPayments(p); setIncomeRecords(ir); setExpenses(ex); })
      .catch(e => setErr(e?.message || 'An error occurred')).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const totalPaymentsAmt = payments.reduce((s, p) => s + Number(p.amount_paid || 0), 0);
  const totalOtherIncome = incomeRecords.reduce((s, r) => s + Number(r.amount || 0), 0);
  const totalRevenue = totalPaymentsAmt + totalOtherIncome;
  const approvedExpenses = expenses.filter(e => e.status !== 'rejected');
  const totalExpenses = approvedExpenses.reduce((s, e) => s + Number(e.amount || 0), 0);
  const netProfit = totalRevenue - totalExpenses;

  const expensesByGroup = {};
  for (const e of approvedExpenses) {
    const group = e.category?.parent_category || 'General';
    const cat = e.category?.name || 'Uncategorised';
    if (!expensesByGroup[group]) expensesByGroup[group] = {};
    expensesByGroup[group][cat] = (expensesByGroup[group][cat] || 0) + Number(e.amount || 0);
  }

  const downloadPdf = async () => {
    setPdfLoading(true);
    try { await generatePLStatementPDF({ fromDate: from || null, toDate: to || null, payments, incomeRecords, expenses: approvedExpenses }); }
    catch (e) { setErr(e?.message || 'An error occurred'); } finally { setPdfLoading(false); }
  };

  return (
    <div>
      <div style={{ ...styles.row, alignItems: 'flex-end', marginBottom: '20px', gap: '12px' }}>
        <div><label style={styles.label}>From</label><input type="date" style={{ ...styles.input, width: '150px' }} value={from} onChange={e => setFrom(e.target.value)} /></div>
        <div><label style={styles.label}>To</label><input type="date" style={{ ...styles.input, width: '150px' }} value={to} onChange={e => setTo(e.target.value)} /></div>
        <button style={styles.btn('secondary')} onClick={load}>Load</button>
        <button data-board-allow style={{ ...styles.btn('primary'), marginLeft: 'auto' }} onClick={downloadPdf} disabled={pdfLoading}>{pdfLoading ? 'Generating…' : '↓ Download PDF'}</button>
      </div>
      {err && <Alert msg={err} onClose={() => setErr('')} />}
      {loading ? <Spinner /> : (
        <div style={styles.row}>
          <div style={{ flex: 1 }}>
            <div style={{ ...styles.card, borderTop: `3px solid ${theme.green}`, marginBottom: '16px' }}>
              <div style={{ ...styles.sectionTitle, color: theme.green }}>Revenue</div>
              <table style={styles.table}>
                <tbody>
                  <tr><td style={styles.td}>Customer Payments</td><td style={{ ...styles.td, textAlign: 'right', fontWeight: '600', color: theme.green }}>{naira(totalPaymentsAmt)}</td></tr>
                  <tr><td style={styles.td}>Other Income</td><td style={{ ...styles.td, textAlign: 'right', fontWeight: '600', color: theme.green }}>{naira(totalOtherIncome)}</td></tr>
                  <tr>
                    <td style={{ ...styles.td, fontWeight: '700', color: theme.green }}>TOTAL REVENUE</td>
                    <td style={{ ...styles.td, textAlign: 'right', fontWeight: '700', fontSize: '15px', color: theme.green }}>{naira(totalRevenue)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div style={{ ...styles.card, borderTop: `3px solid ${theme.red}`, marginBottom: '16px' }}>
              <div style={{ ...styles.sectionTitle, color: theme.red }}>Expenses</div>
              <table style={styles.table}>
                <tbody>
                  {Object.entries(expensesByGroup).map(([group, cats]) => {
                    const groupTotal = Object.values(cats).reduce((a, v) => a + v, 0);
                    return [
                      <tr key={`g-${group}`} style={{ background: theme.surface }}>
                        <td style={{ ...styles.td, fontWeight: '700', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{group}</td>
                        <td style={{ ...styles.td, textAlign: 'right', fontWeight: '700' }}>{naira(groupTotal)}</td>
                      </tr>,
                      ...Object.entries(cats).map(([cat, amt]) => (
                        <tr key={`c-${cat}`}>
                          <td style={{ ...styles.td, paddingLeft: '24px', color: theme.textMuted, fontSize: '12px' }}>{cat}</td>
                          <td style={{ ...styles.td, textAlign: 'right', fontSize: '12px' }}>{naira(amt)}</td>
                        </tr>
                      )),
                    ];
                  })}
                  <tr>
                    <td style={{ ...styles.td, fontWeight: '700', color: theme.red }}>TOTAL EXPENSES</td>
                    <td style={{ ...styles.td, textAlign: 'right', fontWeight: '700', fontSize: '15px', color: theme.red }}>{naira(totalExpenses)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div style={{ ...styles.card, background: netProfit >= 0 ? theme.green + '11' : theme.red + '11', border: `1px solid ${netProfit >= 0 ? theme.green : theme.red}44` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: '700', fontSize: '14px', color: netProfit >= 0 ? theme.green : theme.red }}>{netProfit >= 0 ? 'NET PROFIT' : 'NET LOSS'}</span>
                <span style={{ fontWeight: '700', fontSize: '22px', color: netProfit >= 0 ? theme.green : theme.red }}>{naira(Math.abs(netProfit))}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

class CostTabErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { hasError: false, errMsg: '' }; }
  static getDerivedStateFromError(e) { return { hasError: true, errMsg: e?.message || 'Unexpected error' }; }
  render() {
    if (this.state.hasError) return (
      <div style={{ background: '#fff0f0', border: '1px solid #f5c6cb', borderRadius: '8px', padding: '24px', textAlign: 'center' }}>
        <div style={{ color: '#c00', fontWeight: '700', marginBottom: '8px' }}>Cost Analysis failed to load</div>
        <div style={{ color: '#555', fontSize: '13px', marginBottom: '16px' }}>{this.state.errMsg}</div>
        <button onClick={() => this.setState({ hasError: false, errMsg: '' })} style={{ padding: '8px 20px', background: '#c00', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '600' }}>Try Again</button>
      </div>
    );
    return this.props.children;
  }
}

const CostTab = () => {
  const now = new Date();
  const firstOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const [from, setFrom] = useState(firstOfMonth);
  const [to, setTo] = useState(now.toISOString().split('T')[0]);
  const [expenses, setExpenses] = useState([]);
  const [productionLogs, setProductionLogs] = useState([]);
  const [products, setProducts] = useState([]);
  const [labourCost, setLabourCost] = useState(0);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [pdfLoading, setPdfLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    setErr('');
    try {
      const [ex, pl, pr, labourRes] = await Promise.all([
        expensesService.getAll(from, to),
        accountingService.getProductionTotals(from, to),
        productsService.getActive().catch(() => []),
        supabase.from('weekly_labour_payroll')
          .select('total_amount')
          .in('status', ['paid', 'md_approved'])
          .gte('week_ending', from)
          .lte('week_ending', to),
      ]);
      setExpenses(Array.isArray(ex) ? ex : []);
      setProductionLogs(Array.isArray(pl) ? pl : []);
      setProducts(Array.isArray(pr) ? pr : []);
      const labourData = labourRes?.data || [];
      setLabourCost(labourData.reduce((s, r) => s + Number(r.total_amount || 0), 0));
    } catch (e) {
      setErr(e?.message || 'Failed to load cost analysis');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const safeExpenses = Array.isArray(expenses) ? expenses : [];
  const safeProductionLogs = Array.isArray(productionLogs) ? productionLogs : [];
  const safeProducts = Array.isArray(products) ? products : [];
  const rawExpenses = safeExpenses.filter(e => e.status !== 'rejected').reduce((s, e) => s + Number(e.amount || 0), 0);
  const totalExpenses = rawExpenses + labourCost;
  const productTotals = {};
  for (const log of safeProductionLogs) {
    productTotals[log.block_type] = (productTotals[log.block_type] || 0) + Number(log.quantity_produced || 0);
  }
  const totalQty = Object.values(productTotals).reduce((s, v) => s + v, 0);
  const productMap = Object.fromEntries(safeProducts.map(p => [p.name, p]));
  const labourPerUnit = totalQty > 0 ? labourCost / totalQty : 0;
  const rawExpPerUnit = totalQty > 0 ? rawExpenses / totalQty : 0;

  const downloadPdf = async () => {
    setPdfLoading(true);
    try { await generateCostAnalysisPDF({ fromDate: from || null, toDate: to || null, productTotals, totalExpenses, products }); }
    catch (e) { setErr(e?.message || 'An error occurred'); } finally { setPdfLoading(false); }
  };

  return (
    <div>
      <div style={{ ...styles.row, alignItems: 'flex-end', marginBottom: '20px', gap: '12px' }}>
        <div><label style={styles.label}>From</label><input type="date" style={{ ...styles.input, width: '150px' }} value={from} onChange={e => setFrom(e.target.value)} /></div>
        <div><label style={styles.label}>To</label><input type="date" style={{ ...styles.input, width: '150px' }} value={to} onChange={e => setTo(e.target.value)} /></div>
        <button style={styles.btn('secondary')} onClick={load}>Load</button>
        <button data-board-allow style={{ ...styles.btn('primary'), marginLeft: 'auto' }} onClick={downloadPdf} disabled={pdfLoading}>{pdfLoading ? 'Generating…' : '↓ Download PDF'}</button>
      </div>
      {err && <Alert msg={err} onClose={() => setErr('')} />}
      {loading ? <Spinner /> : (
        <>
          <div style={{ ...styles.grid(4), marginBottom: '20px' }}>
            <div style={styles.statCard(theme.blue)}><div style={styles.statLabel}>Total Units Produced</div><div style={{ ...styles.statValue, fontSize: '20px' }}>{fmt(totalQty)}</div></div>
            <div style={styles.statCard(theme.red)}><div style={styles.statLabel}>Material &amp; Overhead Expenses</div><div style={{ ...styles.statValue, fontSize: '20px', color: theme.red }}>{naira(rawExpenses)}</div></div>
            <div style={styles.statCard(theme.blue)}><div style={styles.statLabel}>Labour Cost (Period)</div><div style={{ ...styles.statValue, fontSize: '20px', color: theme.blue }}>{naira(labourCost)}</div></div>
            <div style={styles.statCard(theme.accent)}><div style={styles.statLabel}>Total Cost / Unit (Avg)</div><div style={{ ...styles.statValue, fontSize: '20px', color: theme.accent }}>{totalQty > 0 ? naira(Math.round(totalExpenses / totalQty)) : '—'}</div></div>
          </div>
          {labourCost > 0 && (
            <div style={{ ...styles.card, marginBottom: '20px', borderLeft: `4px solid ${theme.blue}` }}>
              <div style={{ fontSize: '12px', fontWeight: '700', color: theme.blue, marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Labour Cost Breakdown per Unit (avg all block types)</div>
              <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', fontSize: '13px' }}>
                <span>Raw materials &amp; overhead: <strong style={{ color: theme.text }}>{naira(Math.round(rawExpPerUnit))}/unit</strong></span>
                <span>Labour: <strong style={{ color: theme.blue }}>{naira(Math.round(labourPerUnit))}/unit</strong></span>
                <span>Total: <strong style={{ color: theme.accent }}>{naira(Math.round((rawExpPerUnit + labourPerUnit)))}/unit</strong></span>
              </div>
            </div>
          )}
          {Object.entries(productTotals).length > 0 && totalExpenses === 0 && (
            <div style={{ ...styles.card, marginBottom: '16px', borderLeft: `4px solid ${theme.accent}`, color: theme.textMuted, fontSize: '13px' }}>
              <strong style={{ color: theme.text }}>No expense or labour records found for selected period.</strong>
              {' '}Record expenses in Daily Bookkeeping to see cost analysis. Labour costs pull from paid payroll entries in Labour Management.
            </div>
          )}
          <div style={styles.card}>
            <div style={styles.sectionTitle}>Cost per Product (including Labour)</div>
            <table style={styles.table}>
              <thead>
                <tr>
                  {['Product', 'Units Produced', 'Materials Cost', 'Labour Cost', 'Total Cost', 'Cost / Unit', 'Selling Price', 'Gross Profit / Unit', 'Margin'].map(h => (
                    <th key={h} style={{ ...styles.th, textAlign: h === 'Product' ? 'left' : 'right' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Object.entries(productTotals).length === 0 ? (
                  <tr><td colSpan="9" style={{ ...styles.td, textAlign: 'center', color: theme.textMuted }}>No production data for this period</td></tr>
                ) : Object.entries(productTotals).map(([name, qty]) => {
                  const share = totalQty > 0 ? qty / totalQty : 0;
                  const allocatedMaterials = rawExpenses * share;
                  const allocatedLabour = labourCost * share;
                  const allocated = allocatedMaterials + allocatedLabour;
                  const costPerUnit = qty > 0 ? allocated / qty : 0;
                  const sellingPrice = productMap[name]?.unit_price || 0;
                  const profit = sellingPrice - costPerUnit;
                  const margin = sellingPrice > 0 ? (profit / sellingPrice) * 100 : 0;
                  const unit = productMap[name]?.unit || 'pcs';
                  return (
                    <tr key={name}>
                      <td style={styles.td}><strong>{name}</strong></td>
                      <td style={{ ...styles.td, textAlign: 'right' }}>{fmt(qty)} {unit}</td>
                      <td style={{ ...styles.td, textAlign: 'right' }}>{naira(Math.round(allocatedMaterials))}</td>
                      <td style={{ ...styles.td, textAlign: 'right', color: theme.blue }}>{naira(Math.round(allocatedLabour))}</td>
                      <td style={{ ...styles.td, textAlign: 'right', fontWeight: '700' }}>{naira(Math.round(allocated))}</td>
                      <td style={{ ...styles.td, textAlign: 'right' }}>{naira(Math.round(costPerUnit))}</td>
                      <td style={{ ...styles.td, textAlign: 'right' }}>{sellingPrice > 0 ? naira(sellingPrice) : <span style={{ color: theme.textMuted }}>—</span>}</td>
                      <td style={{ ...styles.td, textAlign: 'right', fontWeight: '600', color: profit >= 0 ? theme.green : theme.red }}>{sellingPrice > 0 ? naira(Math.round(profit)) : '—'}</td>
                      <td style={{ ...styles.td, textAlign: 'right', fontWeight: '600', color: margin >= 0 ? theme.green : theme.red }}>{sellingPrice > 0 ? `${margin.toFixed(1)}%` : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
};

const ReceivablesTab = () => {
  const [receivables, setReceivables] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [pdfLoading, setPdfLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    accountingService.getReceivables()
      .then(setReceivables).catch(e => setErr(e?.message || 'An error occurred')).finally(() => setLoading(false));
  }, []);

  const rows = [];
  const bucketTotals = { '0–30': 0, '31–60': 0, '61–90': 0, '90+': 0 };
  let grandTotal = 0;

  for (const order of receivables) {
    for (const inv of order.invoices || []) {
      // Drafts (quotations) and cancelled invoices are not receivables.
      if (inv.status === 'draft' || inv.status === 'cancelled') continue;
      const invoiced = Number(inv.total_amount || 0);
      const paid = (inv.payments || []).filter(p => p.status === 'confirmed').reduce((s, p) => s + Number(p.amount_paid || 0), 0);
      const outstanding = invoiced - paid;
      if (outstanding <= 0) continue;
      const days = inv.issued_date ? Math.floor((Date.now() - new Date(inv.issued_date).getTime()) / 86400000) : 999;
      const bucket = days <= 30 ? '0–30' : days <= 60 ? '31–60' : days <= 90 ? '61–90' : '90+';
      bucketTotals[bucket] += outstanding;
      grandTotal += outstanding;
      rows.push({ customer: order.customer?.name || '—', invoice: inv.invoice_number || '—', issuedDate: inv.issued_date, days, bucket, invoiced, paid, outstanding });
    }
  }

  const bucketColor = (b) => b === '0–30' ? theme.green : b === '31–60' ? '#c8a000' : b === '61–90' ? '#d06400' : theme.red;

  const downloadPdf = async () => {
    setPdfLoading(true);
    try { await generateReceivablesPDF(receivables); }
    catch (e) { setErr(e?.message || 'An error occurred'); } finally { setPdfLoading(false); }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '20px' }}>
        <button data-board-allow style={styles.btn('primary')} onClick={downloadPdf} disabled={pdfLoading}>{pdfLoading ? 'Generating…' : '↓ Download PDF'}</button>
      </div>
      {err && <Alert msg={err} onClose={() => setErr('')} />}

      <div style={{ ...styles.grid(5), marginBottom: '20px' }}>
        {[
          { label: '0–30 Days', val: bucketTotals['0–30'], color: theme.green },
          { label: '31–60 Days', val: bucketTotals['31–60'], color: '#c8a000' },
          { label: '61–90 Days', val: bucketTotals['61–90'], color: '#d06400' },
          { label: '90+ Days', val: bucketTotals['90+'], color: theme.red },
          { label: 'Total Outstanding', val: grandTotal, color: theme.blue },
        ].map(({ label, val, color }) => (
          <div key={label} style={styles.statCard(color)}>
            <div style={styles.statLabel}>{label}</div>
            <div style={{ ...styles.statValue, fontSize: '16px', color }}>{naira(val)}</div>
          </div>
        ))}
      </div>

      {loading ? <Spinner /> : (
        <div style={styles.card}>
          <table style={styles.table}>
            <thead>
              <tr>
                {['Customer', 'Invoice No.', 'Invoice Date', 'Age', 'Bucket', 'Invoiced', 'Paid', 'Outstanding'].map(h => (
                  <th key={h} style={styles.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan="8" style={{ ...styles.td, textAlign: 'center', color: theme.textMuted, padding: '30px' }}>No outstanding receivables</td></tr>
              ) : rows.map((r, i) => (
                <tr key={i}>
                  <td style={{ ...styles.td, fontWeight: '600' }}>{r.customer}</td>
                  <td style={styles.td}>{r.invoice}</td>
                  <td style={styles.td}>{r.issuedDate ? new Date(r.issuedDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</td>
                  <td style={styles.td}>{r.days === 999 ? '—' : `${r.days}d`}</td>
                  <td style={{ ...styles.td, fontWeight: '700', color: bucketColor(r.bucket) }}>{r.bucket}</td>
                  <td style={{ ...styles.td, textAlign: 'right' }}>{naira(r.invoiced)}</td>
                  <td style={{ ...styles.td, textAlign: 'right', color: theme.green }}>{naira(r.paid)}</td>
                  <td style={{ ...styles.td, textAlign: 'right', fontWeight: '700', color: theme.red }}>{naira(r.outstanding)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

const ManagementTab = () => {
  const now = new Date();
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const [month, setMonth] = useState(defaultMonth);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [pdfLoading, setPdfLoading] = useState(false);

  const load = async (m) => {
    setLoading(true);
    const [y, mo] = m.split('-').map(Number);
    const currFrom = `${y}-${String(mo).padStart(2, '0')}-01`;
    const currTo = new Date(y, mo, 0).toISOString().split('T')[0];
    const prevMo = mo === 1 ? 12 : mo - 1;
    const prevY = mo === 1 ? y - 1 : y;
    const prevFrom = `${prevY}-${String(prevMo).padStart(2, '0')}-01`;
    const prevTo = new Date(prevY, prevMo, 0).toISOString().split('T')[0];

    try {
      const [cp, ci, ce, pp, pi, pe] = await Promise.all([
        accountingService.getConfirmedPayments(currFrom, currTo),
        incomeRecordsService.getAll(currFrom, currTo),
        expensesService.getAll(currFrom, currTo),
        accountingService.getConfirmedPayments(prevFrom, prevTo),
        incomeRecordsService.getAll(prevFrom, prevTo),
        expensesService.getAll(prevFrom, prevTo),
      ]);

      const summarise = (payments, incomeRecs, exps) => {
        const revenue = payments.reduce((s, p) => s + Number(p.amount_paid || 0), 0) + incomeRecs.reduce((s, r) => s + Number(r.amount || 0), 0);
        const expenses = exps.filter(e => e.status !== 'rejected').reduce((s, e) => s + Number(e.amount || 0), 0);
        const customerAmts = {};
        for (const p of payments) {
          const name = p.invoice?.order?.customer?.name || 'Unknown';
          customerAmts[name] = (customerAmts[name] || 0) + Number(p.amount_paid || 0);
        }
        const topCustomers = Object.entries(customerAmts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, amount]) => ({ name, amount }));
        const catAmts = {};
        for (const e of exps.filter(ex => ex.status !== 'rejected')) {
          const name = e.category?.name || 'Uncategorised';
          catAmts[name] = (catAmts[name] || 0) + Number(e.amount || 0);
        }
        const topExpenses = Object.entries(catAmts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, amount]) => ({ name, amount }));
        return { revenue, expenses, transactions: payments.length + incomeRecs.length, topCustomers, topExpenses };
      };

      setData({ current: summarise(cp, ci, ce), previous: summarise(pp, pi, pe) });
    } catch (e) { setErr(e?.message || 'An error occurred'); } finally { setLoading(false); }
  };

  useEffect(() => { load(month); }, []);

  const monthLabel = (m) => {
    const [y, mo] = m.split('-');
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${months[parseInt(mo, 10) - 1]} ${y}`;
  };

  const prevMonth = (m) => {
    const [y, mo] = m.split('-').map(Number);
    const pm = mo === 1 ? 12 : mo - 1;
    const py = mo === 1 ? y - 1 : y;
    return `${py}-${String(pm).padStart(2, '0')}`;
  };

  const changeVal = (curr, prev) => {
    if (!prev) return { label: '—', color: theme.textMuted };
    const diff = curr - prev;
    const pct = ((diff / prev) * 100).toFixed(1);
    return { label: `${diff >= 0 ? '+' : ''}${pct}%`, color: diff >= 0 ? theme.green : theme.red };
  };

  const downloadPdf = async () => {
    if (!data) return;
    setPdfLoading(true);
    try {
      await generateManagementAccountsPDF({ monthLabel: monthLabel(month), prevMonthLabel: monthLabel(prevMonth(month)), current: data.current, previous: data.previous });
    } catch (e) { setErr(e?.message || 'An error occurred'); } finally { setPdfLoading(false); }
  };

  return (
    <div>
      <div style={{ ...styles.row, alignItems: 'flex-end', marginBottom: '20px', gap: '12px' }}>
        <div>
          <label style={styles.label}>Month</label>
          <input type="month" style={{ ...styles.input, width: '160px' }} value={month} onChange={e => setMonth(e.target.value)} />
        </div>
        <button style={styles.btn('secondary')} onClick={() => load(month)}>Load</button>
        <button style={{ ...styles.btn('primary'), marginLeft: 'auto' }} onClick={downloadPdf} disabled={pdfLoading || !data}>{pdfLoading ? 'Generating…' : '↓ Download PDF'}</button>
      </div>
      {err && <Alert msg={err} onClose={() => setErr('')} />}
      {loading ? <Spinner /> : !data ? null : (
        <>
          <div style={{ ...styles.grid(4), marginBottom: '20px' }}>
            {[
              { label: 'Revenue', curr: data.current.revenue, prev: data.previous.revenue, color: theme.green, better: 'higher' },
              { label: 'Expenses', curr: data.current.expenses, prev: data.previous.expenses, color: theme.red, better: 'lower' },
              { label: 'Net Profit', curr: data.current.revenue - data.current.expenses, prev: data.previous.revenue - data.previous.expenses, color: theme.blue, better: 'higher' },
              { label: 'Transactions', curr: data.current.transactions, prev: data.previous.transactions, color: theme.accent, better: 'higher' },
            ].map(({ label, curr, prev, color, better }) => {
              const cv = changeVal(curr, prev);
              const isPositive = better === 'higher' ? curr >= prev : curr <= prev;
              return (
                <div key={label} style={styles.statCard(color)}>
                  <div style={styles.statLabel}>{label}</div>
                  <div style={{ ...styles.statValue, fontSize: '18px', color }}>{label === 'Transactions' ? fmt(curr) : naira(curr)}</div>
                  <div style={{ fontSize: '11px', marginTop: '4px', color: isPositive ? theme.green : theme.red, fontWeight: '600' }}>{cv.label} vs {monthLabel(prevMonth(month))}</div>
                </div>
              );
            })}
          </div>
          <div style={styles.row}>
            <div style={{ flex: 1, ...styles.card }}>
              <div style={styles.sectionTitle}>Top 5 Customers — {monthLabel(month)}</div>
              <table style={styles.table}>
                <tbody>
                  {data.current.topCustomers.length === 0
                    ? <tr><td style={{ ...styles.td, color: theme.textMuted }}>No data</td></tr>
                    : data.current.topCustomers.map((c, i) => (
                      <tr key={i}>
                        <td style={{ ...styles.td, width: '28px', color: theme.textMuted, fontSize: '11px' }}>#{i + 1}</td>
                        <td style={{ ...styles.td, fontWeight: '600' }}>{c.name}</td>
                        <td style={{ ...styles.td, textAlign: 'right', fontWeight: '700', color: theme.green }}>{naira(c.amount)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            <div style={{ flex: 1, ...styles.card }}>
              <div style={styles.sectionTitle}>Top 5 Expenses — {monthLabel(month)}</div>
              <table style={styles.table}>
                <tbody>
                  {data.current.topExpenses.length === 0
                    ? <tr><td style={{ ...styles.td, color: theme.textMuted }}>No data</td></tr>
                    : data.current.topExpenses.map((e, i) => (
                      <tr key={i}>
                        <td style={{ ...styles.td, width: '28px', color: theme.textMuted, fontSize: '11px' }}>#{i + 1}</td>
                        <td style={{ ...styles.td, fontWeight: '600' }}>{e.name}</td>
                        <td style={{ ...styles.td, textAlign: 'right', fontWeight: '700', color: theme.red }}>{naira(e.amount)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

// ── BANK ACCOUNTS TAB ─────────────────────────────────────────
const CONF_COLOR = { high: '#2dd4a0', medium: '#f5a623', low: '#f06b6b', none: '#7c839e' };

const SEED_ACCOUNTS = [
  { bank_name: 'TAJ Bank PLC', account_name: 'Abuja Precast Concrete LTD', account_number: '0001732895', account_type: 'income', current_balance: 0 },
  { bank_name: 'Moniepoint', account_name: 'Abuja Precast Concrete LTD', account_number: '0000000000', account_type: 'expense', current_balance: 0 },
  { bank_name: 'TAJ Bank PLC', account_name: 'Abuja Precast Concrete LTD (Operations)', account_number: '0001733191', account_type: 'expense', current_balance: 0 },
];

const BankAccountsTab = ({ userProfile }) => {
  const [accounts, setAccounts] = useState([]);
  const [selected, setSelected] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [txLoading, setTxLoading] = useState(false);
  const [txFrom, setTxFrom] = useState('');
  const [txTo, setTxTo] = useState('');
  const [txSearch, setTxSearch] = useState('');
  const [importStep, setImportStep] = useState(null);
  const [importAcct, setImportAcct] = useState('');
  const [importFile, setImportFile] = useState(null);
  const [importParsing, setImportParsing] = useState(false);
  const [importHeaders, setImportHeaders] = useState([]);
  const [importRows, setImportRows] = useState([]);
  const [colMap, setColMap] = useState({ date: -1, description: -1, debit: -1, credit: -1, balance: -1 });
  const [preview, setPreview] = useState([]);
  const [importing, setImporting] = useState(false);
  const [matchModal, setMatchModal] = useState(null);
  const [matchType, setMatchType] = useState('other');
  const [matchNotes, setMatchNotes] = useState('');
  const [editAcct, setEditAcct] = useState(null);
  const [addAcctModal, setAddAcctModal] = useState(false);
  const [newAcct, setNewAcct] = useState({ bank_name: '', account_name: '', account_number: '', account_type: 'both' });
  const [savingAcct, setSavingAcct] = useState(false);
  const [modalErr, setModalErr] = useState('');
  const [createExpModal, setCreateExpModal] = useState(null);
  const [expCategories, setExpCategories] = useState([]);
  const [creatingExp, setCreatingExp] = useState(false);
  const [createExpForm, setCreateExpForm] = useState({ category_id: '', description: '', notes: '' });
  const [createPaymentModal, setCreatePaymentModal] = useState(null);
  const [createPaymentForm, setCreatePaymentForm] = useState({ customer_id: '', customerSearch: '', invoice_id: '', payment_method: 'bank_transfer', reference: '', notes: '', mode: 'invoice', paymentAmount: '', otherIncomeDesc: '' });
  const [allInvoices, setAllInvoices] = useState([]);
  const [allCustomers, setAllCustomers] = useState([]);
  const [creatingPayment, setCreatingPayment] = useState(false);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const [reconUnverified, setReconUnverified] = useState(false);
  const [reconWarnAcked, setReconWarnAcked] = useState(false);
  const [paymentRequests, setPaymentRequests] = useState([]);
  const [suggestedTxs, setSuggestedTxs] = useState([]);
  const [suggestModal, setSuggestModal] = useState(null);
  const [prSearch, setPrSearch] = useState('');
  const [rejectModal, setRejectModal] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [actioningId, setActioningId] = useState(null);

  const canConfirm = hasRole(userProfile, 'md', 'accountant');

  // Helpers for payment request reference matching
  const findPRCandidate = (tx) => {
    if (!tx.debit || !paymentRequests.length) return null;
    const txNum = extractPRReference(tx.description);
    if (txNum === null) return null;
    const pr = paymentRequests.find(p => extractPRReference(p.reference) === txNum);
    if (!pr) return null;
    return { pr, amtMatch: Math.abs(Number(pr.amount) - tx.debit) < 0.01 };
  };

  useEffect(() => {
    // Supporting data — fail silently so they don't block the accounts tab
    expenseCategoriesService.getActive().then(setExpCategories).catch(() => {});
    accountingService.getOpenInvoices().then(setAllInvoices).catch(() => {});
    customersService.getAll().then(setAllCustomers).catch(() => {});
    paymentRequestsService.listDisbursed().then(setPaymentRequests).catch(() => {});
    // Core accounts load
    bankAccountsService.getAll()
      .then(async (existing) => {
        let all = [...existing];
        for (const seed of SEED_ACCOUNTS) {
          if (!existing.find(a => a.account_number === seed.account_number)) {
            try { const created = await bankAccountsService.create(seed); all = [...all, created]; } catch {}
          }
        }
        all.sort((a, b) => {
          if (a.account_type !== b.account_type) return a.account_type === 'income' ? -1 : 1;
          return a.account_number.localeCompare(b.account_number);
        });
        setAccounts(all);
      })
      .catch(e => {
        const msg = e?.message || '';
        if (msg.toLowerCase().includes('fetch') || msg.toLowerCase().includes('network')) {
          setErr('Connection error — check your internet and refresh the page.');
        } else {
          setErr(msg || 'Failed to load bank accounts.');
        }
      });
  }, []);

  useEffect(() => {
    if (!selected) return;
    setTxLoading(true);
    bankTransactionsService.getByAccount(selected.id, txFrom || null, txTo || null)
      .then(setTransactions).catch(e => setErr(e?.message || 'An error occurred')).finally(() => setTxLoading(false));
  }, [selected?.id, txFrom, txTo]);

  useEffect(() => {
    if (!selected) { setSuggestedTxs([]); return; }
    bankTransactionsService.getSuggested(selected.id).then(setSuggestedTxs).catch(() => {});
  }, [selected?.id]);

  const openImport = (acct) => { setImportAcct(acct.id); setImportFile(null); setImportStep('upload'); setErr(''); setOk(''); setReconUnverified(false); setReconWarnAcked(false); };
  const closeImport = () => setImportStep(null);

  const handleFileSelect = async (file) => {
    if (!file) return;
    setImportFile(file);
    setImportParsing(true);
    try {
      const { headers, dataRows } = await parseFile(file);
      setImportHeaders(headers);
      setImportRows(dataRows);
      setColMap(autoMapColumns(headers));
      setImportStep('mapping');
    } catch (e) { setErr('Could not parse file: ' + e.message); }
    finally { setImportParsing(false); }
  };

  const buildPreview = async () => {
    setReconUnverified(false);
    setReconWarnAcked(false);
    const txs = mapRowsToTransactions(importRows, colMap);
    if (txs.length === 0) { setErr('No valid transactions found. Check column mapping.'); return; }

    // ── Whole-file reconciliation gate ────────────────────────────────────────
    // Prefer the bank's own TRANS SUMMARY totals (TAJ); fall back to summing
    // parsed rows when no summary block is present (e.g. Moniepoint CSV).
    const summary = extractStatementSummary(importRows, colMap);
    const { openingBalance, totalCredit, totalDebit, closingBalance } = summary;
    let chkCredits, chkDebits, chkClosing;
    if (totalCredit !== null && totalDebit !== null && closingBalance !== null) {
      // Primary path: bank-stated totals from TRANS SUMMARY
      chkCredits = totalCredit;
      chkDebits  = totalDebit;
      chkClosing = closingBalance;
    } else {
      // Fallback: sum every parsed row; use the available running balance as closing.
      // Check both ends — statements may be ordered ascending or descending by date.
      const b0 = txs[0]?.balance ?? 0;
      const bn = txs[txs.length - 1]?.balance ?? 0;
      if (b0 > 0 || bn > 0) {
        chkCredits = txs.reduce((s, t) => s + (t.credit || 0), 0);
        chkDebits  = txs.reduce((s, t) => s + (t.debit  || 0), 0);
        // Pick whichever end is arithmetically closer to the expected result
        if (openingBalance !== null) {
          const exp = openingBalance + chkCredits - chkDebits;
          chkClosing = Math.abs(exp - b0) <= Math.abs(exp - bn) ? b0 : bn;
        } else {
          chkClosing = b0 > 0 ? b0 : bn;
        }
      }
    }
    if (openingBalance !== null && chkCredits !== undefined && chkClosing !== undefined) {
      const expected = openingBalance + chkCredits - chkDebits;
      if (Math.abs(expected - chkClosing) > 1) {
        const fmtN = n => `₦${parseFloat(Math.abs(n).toFixed(2)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        setErr(
          `Statement does not reconcile — Opening ${fmtN(openingBalance)} + Credits ${fmtN(chkCredits)} − Debits ${fmtN(chkDebits)} = ${fmtN(expected)}, ` +
          `but stated closing balance is ${fmtN(chkClosing)} (difference: ${fmtN(expected - chkClosing)}). Import rejected.`
        );
        return;
      }
    } else {
      setReconUnverified(true);
    }
    // ─────────────────────────────────────────────────────────────────────────

    const withDups = await bankTransactionsService.checkDuplicates(importAcct, txs).catch(() => txs.map(t => ({ ...t, isDuplicate: false })));
    const acct = accounts.find(a => a.id === importAcct);
    let payments = [], expenses2 = [], invoices2 = allInvoices, customers2 = allCustomers;
    try {
      [payments, expenses2] = await Promise.all([
        accountingService.getConfirmedPayments(null, null),
        expensesService.getAll(null, null),
      ]);
      if (!invoices2.length) invoices2 = await accountingService.getOpenInvoices().catch(() => []);
      if (!customers2.length) customers2 = await customersService.getAll().catch(() => []);
    } catch {}
    const matched = autoMatchTransactions(
      withDups.filter(t => !t.isDuplicate),
      payments, expenses2,
      acct?.account_type || 'both',
      { invoices: invoices2, customers: customers2, paymentRequests }
    );
    setPreview(matched);
    setImportStep('preview');
  };

  const confirmImport = async () => {
    setImporting(true);
    try {
      const acct = accounts.find(a => a.id === importAcct);
      const batch = await bankImportBatchesService.create({
        bank_account_id: importAcct,
        import_date: new Date().toISOString().split('T')[0],
        file_name: importFile?.name || '',
        file_type: importFile?.name?.toLowerCase().endsWith('.pdf') ? 'pdf' : 'excel',
        total_transactions: preview.length,
        matched_count: preview.filter(t => t.autoMatch).length,
        unmatched_count: preview.filter(t => !t.autoMatch).length,
        imported_by: 'Admin',
        period_from: preview[preview.length - 1]?.transaction_date || null,
        period_to: preview[0]?.transaction_date || null,
      });
      const toInsert = preview.map(t => ({
        ...t,
        matchedTo: t.autoMatch ? { type: t.autoMatch.type, id: t.autoMatch.id } : null,
      }));
      await bankTransactionsService.insertBatch(importAcct, toInsert, batch.id);
      // Update account balance
      if (preview.length > 0 && preview[0].balance > 0) {
        await bankAccountsService.update(importAcct, { current_balance: preview[0].balance });
        setAccounts(a => a.map(ac => ac.id === importAcct ? { ...ac, current_balance: preview[0].balance } : ac));
      }
      setOk(`Imported ${preview.length} transactions (${preview.filter(t => t.autoMatch).length} auto-matched)`);
      setImportStep(null);
      if (selected?.id === importAcct) {
        bankTransactionsService.getByAccount(importAcct, txFrom || null, txTo || null).then(setTransactions).catch(() => {});
      }
    } catch (e) { setErr(e?.message || 'An error occurred'); } finally { setImporting(false); }
  };

  const handleSaveAcct = async () => {
    if (!editAcct) return;
    setModalErr('');
    setSavingAcct(true);
    try {
      await bankAccountsService.update(editAcct.id, {
        bank_name: editAcct.bank_name,
        account_name: editAcct.account_name,
        account_number: editAcct.account_number,
        account_type: editAcct.account_type,
      });
      setAccounts(a => a.map(x => x.id === editAcct.id ? { ...x, ...editAcct } : x));
      if (selected?.id === editAcct.id) setSelected(prev => ({ ...prev, ...editAcct }));
      setEditAcct(null);
      setOk('Account updated');
    } catch (e) { setModalErr(e.message); }
    finally { setSavingAcct(false); }
  };

  const handleAddAcct = async () => {
    setModalErr('');
    if (!newAcct.bank_name?.trim() || !newAcct.account_number?.trim()) {
      setModalErr('Bank name and account number are required');
      return;
    }
    setSavingAcct(true);
    try {
      const payload = {
        bank_name: newAcct.bank_name.trim(),
        account_name: newAcct.account_name?.trim() || newAcct.bank_name.trim(),
        account_number: newAcct.account_number.trim(),
        account_type: newAcct.account_type,
        current_balance: 0,
      };
      const created = await bankAccountsService.create(payload);
      setAccounts(a => [...a, created]);
      setAddAcctModal(false);
      setModalErr('');
      setNewAcct({ bank_name: '', account_name: '', account_number: '', account_type: 'both' });
      setOk('Account added successfully');
    } catch (e) { setModalErr(e.message || 'Failed to save. Check that the account number is unique.'); }
    finally { setSavingAcct(false); }
  };

  const handleCreatePayment = async () => {
    if (!createPaymentModal) return;
    setModalErr('');
    setCreatingPayment(true);
    const tx = createPaymentModal;
    const amount = Number(createPaymentForm.paymentAmount) || tx.credit;
    try {
      if (createPaymentForm.mode === 'other_income') {
        await incomeRecordsService.create({
          record_date: tx.transaction_date,
          source: 'Bank Transfer',
          description: createPaymentForm.otherIncomeDesc || tx.description,
          amount,
        });
        await bankTransactionsService.updateMatch(tx.id, 'manual', 'other_income', null, createPaymentForm.notes || '');
        setTransactions(t => t.map(x => x.id === tx.id ? { ...x, match_status: 'manual', matched_to_type: 'other_income' } : x));
        setOk(`Other income recorded — ${naira(amount)}`);
      } else {
        if (!createPaymentForm.invoice_id) { setModalErr('Please select an invoice'); setCreatingPayment(false); return; }
        const payment = await paymentsService.recordPayment({
          invoice_id: createPaymentForm.invoice_id,
          amount_paid: amount,
          payment_date: tx.transaction_date,
          status: 'confirmed',
          confirmed_by: 'Admin',
          payment_method: createPaymentForm.payment_method,
          reference: createPaymentForm.reference || '',
          notes: createPaymentForm.notes || `Matched from bank statement: ${tx.description}`,
        });
        const inv = allInvoices.find(i => i.id === createPaymentForm.invoice_id);
        if (inv) {
          const prevPaid = (inv.payments || []).filter(p => p.status === 'confirmed').reduce((s, p) => s + Number(p.amount_paid), 0);
          const totalNow = prevPaid + amount;
          if (totalNow >= Number(inv.total_amount)) {
            // Mark fully-paid via the real `status` column (there is no
            // `payment_status` column — the old write silently failed). Let a
            // genuine failure surface rather than swallowing it.
            await invoicesService.update(inv.id, { status: 'paid' });
          }
          // Partial payment: leave the invoice as 'issued'. There is no
          // 'partially_paid' value in the invoices_status_check constraint, so
          // writing one would fail; the outstanding balance is derived from
          // (total_amount − confirmed payments) instead.
          accountingService.getOpenInvoices().then(setAllInvoices).catch(() => {});
        }
        await bankTransactionsService.updateMatch(tx.id, 'matched', 'payment', payment.id, `Invoice: ${inv?.invoice_number || ''}`);
        setTransactions(t => t.map(x => x.id === tx.id ? { ...x, match_status: 'matched', matched_to_type: 'payment' } : x));
        setOk(`Payment recorded for ${inv?.invoice_number || 'invoice'} — ${naira(amount)}`);
      }
      setCreatePaymentModal(null);
      setCreatePaymentForm({ customer_id: '', customerSearch: '', invoice_id: '', payment_method: 'bank_transfer', reference: '', notes: '', mode: 'invoice', paymentAmount: '', otherIncomeDesc: '' });
    } catch (e) { setModalErr(e.message); }
    finally { setCreatingPayment(false); }
  };

  const handleCreateExpFromTx = async () => {
    if (!createExpModal || !createExpForm.category_id) { setModalErr('Please select a category'); return; }
    setModalErr('');
    setCreatingExp(true);
    const tx = createExpModal;
    const basePayload = {
      expense_date: tx.transaction_date,
      category_id: createExpForm.category_id,
      description: createExpForm.description || tx.description,
      amount: tx.debit,
      status: 'approved',
      requested_by: 'Admin',
    };
    try {
      // Try with notes first; fall back to base payload if column doesn't exist yet
      try {
        await expensesService.create({ ...basePayload, notes: createExpForm.notes || `Bank import: ${tx.transaction_date} ${tx.description}` });
      } catch (e) {
        if (e?.message?.includes('notes') || e?.message?.includes('schema cache') || e?.message?.includes('column')) {
          await expensesService.create(basePayload);
        } else {
          throw e;
        }
      }
      await bankTransactionsService.updateMatch(tx.id, 'manual', 'expense', null, 'Created from bank import');
      setTransactions(t => t.map(x => x.id === tx.id ? { ...x, match_status: 'manual', matched_to_type: 'expense' } : x));
      setCreateExpModal(null);
      setCreateExpForm({ category_id: '', description: '', notes: '' });
      setOk(`Expense record created: ${naira(tx.debit)}`);
    } catch (e) { setModalErr(e.message); }
    finally { setCreatingExp(false); }
  };

  const saveMatch = async () => {
    if (!matchModal) return;
    try {
      await bankTransactionsService.updateMatch(matchModal.id, matchType === 'other' ? 'manual' : 'matched', matchType, null, matchNotes);
      setTransactions(t => t.map(tx => tx.id === matchModal.id ? { ...tx, match_status: matchType === 'other' ? 'manual' : 'matched', matched_to_type: matchType, notes: matchNotes } : tx));
      setMatchModal(null);
    } catch (e) { setErr(e?.message || 'An error occurred'); }
  };

  const handleSuggestPR = async (tx, prId) => {
    setActioningId(tx.id);
    try {
      await bankTransactionsService.suggestMatch(tx.id, 'payment_request', prId);
      const pr = paymentRequests.find(p => p.id === prId);
      const updated = { ...tx, match_status: 'suggested', matched_to_type: 'payment_request', matched_to_id: prId };
      setTransactions(ts => ts.map(t => t.id === tx.id ? updated : t));
      setSuggestedTxs(ss => [...ss.filter(s => s.id !== tx.id), updated]);
      setSuggestModal(null);
      setPrSearch('');
      setOk(`Suggested match: ${pr?.reference || 'payment request'}`);
    } catch (e) { setErr(e?.message || 'An error occurred'); }
    finally { setActioningId(null); }
  };

  const handleConfirmMatch = async (tx) => {
    setActioningId(tx.id);
    try {
      await bankTransactionsService.confirmMatch(tx.id, 'confirm', null);
      setTransactions(ts => ts.map(t => t.id === tx.id ? { ...t, match_status: 'matched' } : t));
      setSuggestedTxs(ss => ss.filter(s => s.id !== tx.id));
      setOk(`Match confirmed`);
    } catch (e) { setErr(e?.message || 'An error occurred'); }
    finally { setActioningId(null); }
  };

  const handleRejectMatch = async () => {
    if (!rejectModal) return;
    if (!rejectReason.trim()) { setErr('Reason is required to reject a match'); return; }
    setActioningId(rejectModal.id);
    try {
      await bankTransactionsService.confirmMatch(rejectModal.id, 'reject', rejectReason.trim());
      setTransactions(ts => ts.map(t => t.id === rejectModal.id ? { ...t, match_status: 'unmatched', matched_to_type: null, matched_to_id: null } : t));
      setSuggestedTxs(ss => ss.filter(s => s.id !== rejectModal.id));
      setRejectModal(null);
      setRejectReason('');
      setOk(`Match rejected`);
    } catch (e) { setErr(e?.message || 'An error occurred'); }
    finally { setActioningId(null); }
  };

  const filtered = transactions.filter(t => {
    if (!txSearch) return true;
    const s = txSearch.toLowerCase();
    return t.description?.toLowerCase().includes(s) || String(t.debit).includes(s) || String(t.credit).includes(s);
  });

  return (
    <div>
      {err && <Alert msg={err} onClose={() => setErr('')} />}
      {ok && <Alert msg={ok} type="success" onClose={() => setOk('')} />}

      {/* Import Modal */}
      {importStep && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div style={{ background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: '12px', padding: '24px', width: '100%', maxWidth: '700px', maxHeight: '85vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div style={{ fontWeight: '700', fontSize: '15px' }}>
                {importStep === 'upload' && 'Import Bank Statement'}
                {importStep === 'mapping' && 'Map Columns'}
                {importStep === 'preview' && `Preview — ${preview.length} transactions`}
              </div>
              <button style={{ background: 'none', border: 'none', color: theme.textMuted, cursor: 'pointer', fontSize: '18px' }} onClick={closeImport}>✕</button>
            </div>

            {importStep === 'upload' && (
              <div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Bank Account</label>
                  <select style={styles.input} value={importAcct} onChange={e => setImportAcct(e.target.value)}>
                    {accounts.map(a => <option key={a.id} value={a.id}>{a.bank_name} — {a.account_number}</option>)}
                  </select>
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Statement File (CSV, Excel or PDF)</label>
                  <input type="file" accept=".csv,.xlsx,.xls,.pdf,.txt" style={{ ...styles.input, padding: '8px' }}
                    onChange={e => handleFileSelect(e.target.files?.[0])} />
                </div>
                {importParsing && <Spinner />}
              </div>
            )}

            {importStep === 'mapping' && (
              <div>
                <div style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '14px' }}>File: <strong>{importFile?.name}</strong> — {importRows.length} data rows detected. Map the columns below:</div>
                <div style={{ ...styles.grid(5), gap: '8px', marginBottom: '16px' }}>
                  {['date','description','debit','credit','balance'].map(col => (
                    <div key={col}>
                      <label style={{ ...styles.label, textTransform: 'capitalize' }}>{col} *</label>
                      <select style={{ ...styles.input, fontSize: '12px' }} value={colMap[col]} onChange={e => setColMap(m => ({ ...m, [col]: Number(e.target.value) }))}>
                        <option value={-1}>— none —</option>
                        {importHeaders.map((h, i) => <option key={i} value={i}>{h || `Col ${i+1}`}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
                <div style={{ ...styles.card, marginBottom: '16px', padding: '12px', overflowX: 'auto' }}>
                  <div style={{ fontSize: '11px', fontWeight: '700', color: theme.textMuted, marginBottom: '6px' }}>PREVIEW (first 4 rows)</div>
                  <table style={{ ...styles.table, fontSize: '11px' }}>
                    <thead><tr>{['date','description','debit','credit','balance'].map(c => <th key={c} style={{ ...styles.th, fontSize: '10px' }}>{c}</th>)}</tr></thead>
                    <tbody>
                      {importRows.slice(0, 4).map((row, ri) => (
                        <tr key={ri}>
                          {['date','description','debit','credit','balance'].map(c => (
                            <td key={c} style={{ ...styles.td, fontSize: '11px' }}>{colMap[c] >= 0 ? String(row[colMap[c]] ?? '') : <span style={{ color: theme.textDim }}>—</span>}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button style={styles.btn('secondary')} onClick={() => setImportStep('upload')}>← Back</button>
                  <button style={styles.btn('primary')} onClick={buildPreview}>Check Duplicates & Auto-Match →</button>
                </div>
              </div>
            )}

            {importStep === 'preview' && (
              <div>
                {reconUnverified && (
                  <div style={{ background: '#d9770622', border: '1px solid #d9770644', borderRadius: '8px', padding: '12px 14px', marginBottom: '14px', fontSize: '13px', color: '#d97706' }}>
                    <div style={{ fontWeight: '600', marginBottom: '4px' }}>Could not verify this statement reconciles</div>
                    <div style={{ marginBottom: '10px' }}>Opening balance or transaction totals were not found in the expected format — review this statement manually before importing.</div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                      <input type="checkbox" checked={reconWarnAcked} onChange={e => setReconWarnAcked(e.target.checked)} />
                      I have reviewed this statement manually and confirm I want to proceed
                    </label>
                  </div>
                )}
                <div style={{ ...styles.grid(3), marginBottom: '16px' }}>
                  <div style={styles.statCard(theme.blue)}><div style={styles.statLabel}>Total</div><div style={{ ...styles.statValue, fontSize: '18px' }}>{preview.length}</div></div>
                  <div style={styles.statCard(theme.green)}><div style={styles.statLabel}>Auto-Matched</div><div style={{ ...styles.statValue, fontSize: '18px', color: theme.green }}>{preview.filter(t => t.autoMatch).length}</div></div>
                  <div style={styles.statCard(theme.red)}><div style={styles.statLabel}>Unmatched</div><div style={{ ...styles.statValue, fontSize: '18px', color: theme.red }}>{preview.filter(t => !t.autoMatch).length}</div></div>
                </div>
                <div style={{ maxHeight: '350px', overflowY: 'auto', ...styles.card, padding: '0' }}>
                  <table style={{ ...styles.table, fontSize: '11px' }}>
                    <thead style={{ position: 'sticky', top: 0, background: theme.card }}>
                      <tr>{['Date','Description','Debit','Credit','Match'].map(h => <th key={h} style={{ ...styles.th, fontSize: '10px' }}>{h}</th>)}</tr>
                    </thead>
                    <tbody>
                      {preview.map((t, i) => (
                        <tr key={i} style={{ opacity: t.isDuplicate ? 0.4 : 1 }}>
                          <td style={styles.td}>{t.transaction_date}</td>
                          <td style={{ ...styles.td, maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.description}</td>
                          <td style={{ ...styles.td, textAlign: 'right', color: theme.red }}>{t.debit > 0 ? naira(t.debit) : ''}</td>
                          <td style={{ ...styles.td, textAlign: 'right', color: theme.green }}>{t.credit > 0 ? naira(t.credit) : ''}</td>
                          <td style={styles.td}>
                            {t.autoMatch
                              ? <span style={{ fontSize: '10px', fontWeight: '600', color: CONF_COLOR[t.autoMatch.confidence], background: CONF_COLOR[t.autoMatch.confidence] + '22', padding: '2px 6px', borderRadius: '4px' }}>{t.autoMatch.confidence} · {t.autoMatch.type}</span>
                              : <span style={{ fontSize: '10px', color: theme.textDim }}>unmatched</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
                  <button style={styles.btn('secondary')} onClick={() => setImportStep('mapping')}>← Back</button>
                  <button style={{ ...styles.btn('primary'), marginLeft: 'auto' }} onClick={confirmImport} disabled={importing || (reconUnverified && !reconWarnAcked)}>{importing ? 'Importing…' : `✓ Import ${preview.length} Transactions`}</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Match Modal */}
      {matchModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1001, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: '10px', padding: '20px', width: '360px' }}>
            <div style={{ fontWeight: '700', marginBottom: '14px' }}>Classify Transaction</div>
            <div style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '12px' }}>{matchModal.description} · {matchModal.debit > 0 ? naira(matchModal.debit) + ' debit' : naira(matchModal.credit) + ' credit'}</div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Type</label>
              <select style={styles.input} value={matchType} onChange={e => setMatchType(e.target.value)}>
                <option value="payment">Customer Payment</option>
                <option value="expense">Expense</option>
                <option value="transfer">Inter-account Transfer</option>
                <option value="other">Other / Bank Charge</option>
              </select>
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Notes</label>
              <input style={styles.input} placeholder="Optional" value={matchNotes} onChange={e => setMatchNotes(e.target.value)} />
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button style={styles.btn('secondary')} onClick={() => setMatchModal(null)}>Cancel</button>
              <button style={styles.btn('primary')} onClick={saveMatch}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Match Modal */}
      {rejectModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1002, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: '10px', padding: '20px', width: '380px' }}>
            <div style={{ fontWeight: '700', marginBottom: '10px' }}>Reject Suggested Match</div>
            <div style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '14px' }}>{rejectModal.description} · {naira(rejectModal.debit)}</div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Reason (required)</label>
              <input style={styles.input} value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="Why is this match incorrect?" autoFocus />
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button style={styles.btn('secondary')} onClick={() => { setRejectModal(null); setRejectReason(''); }}>Cancel</button>
              <button style={{ ...styles.btn('primary'), background: theme.red }} onClick={handleRejectMatch}
                disabled={!rejectReason.trim() || actioningId === rejectModal?.id}>
                {actioningId === rejectModal?.id ? 'Rejecting…' : 'Reject Match'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Link to Payment Request Modal */}
      {suggestModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1002, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: '10px', padding: '20px', width: '460px', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontWeight: '700', marginBottom: '4px' }}>Link to Payment Request</div>
            <div style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '12px' }}>{suggestModal.description} · {naira(suggestModal.debit)} · {suggestModal.transaction_date}</div>
            <input style={{ ...styles.input, marginBottom: '10px' }} placeholder="Search reference, payee, or purpose…"
              value={prSearch} onChange={e => setPrSearch(e.target.value)} autoFocus />
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {(() => {
                const s = prSearch.toLowerCase();
                const visible = paymentRequests.filter(pr =>
                  !s || (pr.reference || '').toLowerCase().includes(s) ||
                  (pr.payee_name || '').toLowerCase().includes(s) ||
                  (pr.purpose || '').toLowerCase().includes(s) ||
                  (pr.supplier?.company_name || '').toLowerCase().includes(s)
                );
                if (!visible.length) return <div style={{ textAlign: 'center', color: theme.textMuted, padding: '20px', fontSize: '12px' }}>No disbursed / closed payment requests found</div>;
                return visible.map(pr => {
                  const amtMatch = Math.abs(Number(pr.amount) - suggestModal.debit) < 0.01;
                  return (
                    <div key={pr.id}
                      style={{ padding: '8px 10px', borderRadius: '6px', cursor: 'pointer', marginBottom: '4px',
                        border: `1px solid ${amtMatch ? theme.green + '55' : theme.border}`,
                        background: amtMatch ? theme.green + '11' : 'transparent' }}
                      onClick={() => handleSuggestPR(suggestModal, pr.id)}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontWeight: '600', fontSize: '13px' }}>{pr.reference}</span>
                        <span style={{ fontSize: '11px', color: amtMatch ? theme.green : '#d97706' }}>
                          {naira(Number(pr.amount))}{amtMatch ? ' ✓' : ' (amt differs)'}
                        </span>
                      </div>
                      <div style={{ fontSize: '11px', color: theme.textMuted, marginTop: '2px' }}>
                        {pr.payee_name || pr.supplier?.company_name || '—'}{pr.purpose ? ` · ${pr.purpose}` : ''}
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
            <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: `1px solid ${theme.border}` }}>
              <button style={styles.btn('secondary')} onClick={() => { setSuggestModal(null); setPrSearch(''); }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Account Modal */}
      {editAcct && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 1002, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: '12px', padding: '24px', width: '380px' }}>
            <div style={{ fontWeight: '700', fontSize: '15px', marginBottom: '16px' }}>Edit Account</div>
            {modalErr && <div style={{ background: theme.red + '22', border: `1px solid ${theme.red}`, borderRadius: '6px', padding: '8px 12px', fontSize: '12px', color: theme.red, marginBottom: '12px' }}>{modalErr}</div>}
            {[['Bank Name', 'bank_name'], ['Account Name', 'account_name'], ['Account Number', 'account_number']].map(([lbl, key]) => (
              <div key={key} style={styles.formGroup}>
                <label style={styles.label}>{lbl}</label>
                <input style={styles.input} value={editAcct[key] || ''} onChange={e => setEditAcct(x => ({ ...x, [key]: e.target.value }))} />
              </div>
            ))}
            <div style={styles.formGroup}>
              <label style={styles.label}>Account Type</label>
              <select style={styles.input} value={editAcct.account_type} onChange={e => setEditAcct(x => ({ ...x, account_type: e.target.value }))}>
                <option value="income">Income (receives customer payments)</option>
                <option value="expense">Expense (pays out expenses)</option>
                <option value="both">Both</option>
              </select>
            </div>
            <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
              <button style={styles.btn('secondary')} onClick={() => { setEditAcct(null); setModalErr(''); }}>Cancel</button>
              <button style={styles.btn('primary')} onClick={handleSaveAcct} disabled={savingAcct}>{savingAcct ? 'Saving…' : 'Save Changes'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Account Modal */}
      {addAcctModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 1002, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: '12px', padding: '24px', width: '380px' }}>
            <div style={{ fontWeight: '700', fontSize: '15px', marginBottom: '16px' }}>Add Bank Account</div>
            {modalErr && <div style={{ background: theme.red + '22', border: `1px solid ${theme.red}`, borderRadius: '6px', padding: '8px 12px', fontSize: '12px', color: theme.red, marginBottom: '12px' }}>{modalErr}</div>}
            {[['Bank Name *', 'bank_name'], ['Account Name', 'account_name'], ['Account Number *', 'account_number']].map(([lbl, key]) => (
              <div key={key} style={styles.formGroup}>
                <label style={styles.label}>{lbl}</label>
                <input style={styles.input} value={newAcct[key] || ''} onChange={e => setNewAcct(x => ({ ...x, [key]: e.target.value }))} />
              </div>
            ))}
            <div style={styles.formGroup}>
              <label style={styles.label}>Account Type</label>
              <select style={styles.input} value={newAcct.account_type} onChange={e => setNewAcct(x => ({ ...x, account_type: e.target.value }))}>
                <option value="income">Income</option>
                <option value="expense">Expense</option>
                <option value="both">Both</option>
              </select>
            </div>
            <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
              <button style={styles.btn('secondary')} onClick={() => { setAddAcctModal(false); setModalErr(''); }}>Cancel</button>
              <button style={styles.btn('primary')} onClick={handleAddAcct} disabled={savingAcct}>{savingAcct ? 'Saving…' : 'Add Account'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Create Expense from Transaction Modal */}
      {createExpModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1003, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: '12px', padding: '24px', width: '420px' }}>
            <div style={{ fontWeight: '700', fontSize: '15px', marginBottom: '4px' }}>Create Expense Record</div>
            <div style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '16px' }}>From bank transaction: {createExpModal.transaction_date} · {naira(createExpModal.debit)}</div>
            {modalErr && <div style={{ background: theme.red + '22', border: `1px solid ${theme.red}`, borderRadius: '6px', padding: '8px 12px', fontSize: '12px', color: theme.red, marginBottom: '12px' }}>{modalErr}</div>}
            <div style={styles.formGroup}>
              <label style={styles.label}>Category *</label>
              <select style={styles.input} value={createExpForm.category_id} onChange={e => setCreateExpForm(f => ({ ...f, category_id: e.target.value }))}>
                <option value="">— Select category —</option>
                {expCategories.map(c => <option key={c.id} value={c.id}>{c.parent_category ? `${c.parent_category} › ` : ''}{c.name}</option>)}
              </select>
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Description</label>
              <input style={styles.input} value={createExpForm.description} onChange={e => setCreateExpForm(f => ({ ...f, description: e.target.value }))} placeholder={createExpModal.description} />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Notes</label>
              <input style={styles.input} value={createExpForm.notes} onChange={e => setCreateExpForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional" />
            </div>
            <div style={{ ...styles.card, padding: '10px 14px', marginBottom: '16px', background: theme.surface2 || theme.bg }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                <span style={{ color: theme.textMuted }}>Date</span><span>{createExpModal.transaction_date}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', fontWeight: '700', marginTop: '4px' }}>
                <span style={{ color: theme.textMuted }}>Amount</span><span style={{ color: theme.red }}>{naira(createExpModal.debit)}</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button style={styles.btn('secondary')} onClick={() => { setCreateExpModal(null); setModalErr(''); setCreateExpForm({ category_id: '', description: '', notes: '' }); }}>Cancel</button>
              <button style={styles.btn('primary')} onClick={handleCreateExpFromTx} disabled={creatingExp}>{creatingExp ? 'Creating…' : '✓ Create Expense & Mark Matched'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Create Payment from Transaction Modal */}
      {createPaymentModal && (() => {
        const tx = createPaymentModal;
        const isOther = createPaymentForm.mode === 'other_income';
        const amount = Number(createPaymentForm.paymentAmount) || tx.credit;
        // Customer search filtering
        const custSearch = createPaymentForm.customerSearch.toLowerCase();
        const custMatches = custSearch
          ? allCustomers.filter(c => c.name?.toLowerCase().includes(custSearch) || c.company_name?.toLowerCase().includes(custSearch)).slice(0, 8)
          : [];
        const showCustDropdown = custSearch && !createPaymentForm.customer_id && custMatches.length > 0;
        // Open invoices for selected customer
        const openInvoices = allInvoices.filter(inv => {
          if (createPaymentForm.customer_id && inv.order?.customer?.id !== createPaymentForm.customer_id) return false;
          const paid = (inv.payments || []).filter(p => p.status === 'confirmed').reduce((s, p) => s + Number(p.amount_paid), 0);
          return paid < Number(inv.total_amount);
        });
        // Selected invoice details
        const selInv = createPaymentForm.invoice_id ? allInvoices.find(i => i.id === createPaymentForm.invoice_id) : null;
        const selInvPaid = selInv ? (selInv.payments || []).filter(p => p.status === 'confirmed').reduce((s, p) => s + Number(p.amount_paid), 0) : 0;
        const selInvRemaining = selInv ? Number(selInv.total_amount) - selInvPaid : 0;
        const willComplete = selInv && Math.abs(selInvRemaining - amount) < 1;

        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 1003, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
            <div style={{ background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: '12px', padding: '24px', width: '500px', maxHeight: '92vh', overflowY: 'auto' }}>

              {/* Header */}
              <div style={{ fontWeight: '700', fontSize: '15px', marginBottom: '4px' }}>Record Incoming Payment</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                <div style={{ fontSize: '12px', color: theme.textMuted }}>{tx.transaction_date}</div>
                <div style={{ fontWeight: '700', color: theme.green, fontSize: '15px' }}>{naira(tx.credit)}</div>
              </div>
              <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '14px', background: theme.bg, borderRadius: '6px', padding: '7px 10px', fontFamily: 'monospace', wordBreak: 'break-all' }}>
                {tx.description}
              </div>

              {/* Mode toggle */}
              <div style={{ display: 'flex', gap: '0', marginBottom: '16px', border: `1px solid ${theme.border}`, borderRadius: '7px', overflow: 'hidden' }}>
                {[['invoice', 'Link to Invoice'], ['other_income', 'Other Income']].map(([m, label]) => (
                  <button key={m} style={{ flex: 1, padding: '7px', fontSize: '12px', fontWeight: '600', background: createPaymentForm.mode === m ? theme.accent : 'transparent', color: createPaymentForm.mode === m ? '#000' : theme.textMuted, border: 'none', cursor: 'pointer' }}
                    onClick={() => setCreatePaymentForm(f => ({ ...f, mode: m, invoice_id: '' }))}>
                    {label}
                  </button>
                ))}
              </div>

              {modalErr && <div style={{ background: theme.red + '22', border: `1px solid ${theme.red}`, borderRadius: '6px', padding: '8px 12px', fontSize: '12px', color: theme.red, marginBottom: '12px' }}>{modalErr}</div>}

              {/* Payment amount (editable for partial) */}
              <div style={styles.formGroup}>
                <label style={styles.label}>Payment Amount (₦) — edit for partial payment</label>
                <input type="number" style={styles.input} value={createPaymentForm.paymentAmount}
                  onChange={e => setCreatePaymentForm(f => ({ ...f, paymentAmount: e.target.value }))}
                  placeholder={String(tx.credit)} />
              </div>

              {!isOther ? (
                <>
                  {/* Customer search */}
                  <div style={{ ...styles.formGroup, position: 'relative' }}>
                    <label style={styles.label}>Search Customer</label>
                    <input style={styles.input} placeholder="Type customer name to search…"
                      value={createPaymentForm.customerSearch}
                      onChange={e => setCreatePaymentForm(f => ({ ...f, customerSearch: e.target.value, customer_id: '', invoice_id: '' }))} />
                    {showCustDropdown && (
                      <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: '6px', zIndex: 20, boxShadow: '0 4px 16px rgba(0,0,0,0.3)' }}>
                        {custMatches.map(c => (
                          <div key={c.id} style={{ padding: '9px 12px', cursor: 'pointer', fontSize: '13px', borderBottom: `1px solid ${theme.border}40` }}
                            onMouseDown={() => setCreatePaymentForm(f => ({ ...f, customer_id: c.id, customerSearch: c.name, invoice_id: '' }))}>
                            <strong>{c.name}</strong>{c.company_name ? <span style={{ color: theme.textMuted }}> · {c.company_name}</span> : ''}
                          </div>
                        ))}
                        <div style={{ padding: '8px 12px', fontSize: '12px', color: theme.textMuted, borderTop: `1px solid ${theme.border}`, cursor: 'pointer' }}
                          onMouseDown={() => setCreatePaymentForm(f => ({ ...f, customer_id: '', customerSearch: '', invoice_id: '' }))}>
                          Clear — show all invoices
                        </div>
                      </div>
                    )}
                    {createPaymentForm.customer_id && (
                      <div style={{ fontSize: '11px', color: theme.green, marginTop: '4px' }}>
                        ✓ {createPaymentForm.customerSearch} selected
                        <span style={{ color: theme.textMuted, cursor: 'pointer', marginLeft: '8px' }}
                          onClick={() => setCreatePaymentForm(f => ({ ...f, customer_id: '', customerSearch: '', invoice_id: '' }))}>clear</span>
                      </div>
                    )}
                  </div>

                  {/* Invoice list */}
                  <div style={styles.formGroup}>
                    <label style={styles.label}>Select Invoice * {openInvoices.length === 0 && createPaymentForm.customer_id ? '— no open invoices for this customer' : `(${openInvoices.length} open)`}</label>
                    <div style={{ maxHeight: '180px', overflowY: 'auto', border: `1px solid ${theme.border}`, borderRadius: '6px' }}>
                      {openInvoices.length === 0 ? (
                        <div style={{ padding: '12px', fontSize: '12px', color: theme.textMuted, textAlign: 'center' }}>
                          {createPaymentForm.customer_id ? 'No open invoices. Switch to "Other Income" to record this payment.' : 'Search for a customer above to filter invoices.'}
                        </div>
                      ) : openInvoices.map(inv => {
                        const pd = (inv.payments || []).filter(p => p.status === 'confirmed').reduce((s, p) => s + Number(p.amount_paid), 0);
                        const rem = Number(inv.total_amount) - pd;
                        const isSelected = createPaymentForm.invoice_id === inv.id;
                        const amtMatch = Math.abs(rem - amount) < 1;
                        return (
                          <div key={inv.id}
                            style={{ padding: '10px 12px', cursor: 'pointer', borderBottom: `1px solid ${theme.border}40`, background: isSelected ? theme.accent + '22' : amtMatch ? theme.green + '12' : 'transparent', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                            onClick={() => setCreatePaymentForm(f => ({ ...f, invoice_id: inv.id }))}>
                            <div>
                              <div style={{ fontSize: '12px', fontWeight: '600' }}>{inv.invoice_number}</div>
                              <div style={{ fontSize: '11px', color: theme.textMuted }}>{inv.order?.customer?.name} · {inv.issued_date}</div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                              <div style={{ fontSize: '12px', color: amtMatch ? theme.green : theme.textMuted, fontWeight: amtMatch ? '700' : '400' }}>{naira(rem)} remaining</div>
                              <div style={{ fontSize: '10px', color: theme.textDim }}>of {naira(inv.total_amount)}</div>
                            </div>
                            {isSelected && <span style={{ marginLeft: '8px', color: theme.accent, fontWeight: '700' }}>✓</span>}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Invoice summary */}
                  {selInv && (
                    <div style={{ background: (willComplete ? theme.green : theme.accent) + '18', border: `1px solid ${willComplete ? theme.green : theme.accent}44`, borderRadius: '8px', padding: '10px 14px', marginBottom: '14px', fontSize: '12px' }}>
                      {[['Invoice total', naira(selInv.total_amount)], ['Previously paid', naira(selInvPaid)], ['This payment', naira(amount)]].map(([l, v]) => (
                        <div key={l} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                          <span style={{ color: theme.textMuted }}>{l}</span><span>{v}</span>
                        </div>
                      ))}
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: '700', borderTop: `1px solid ${theme.border}`, paddingTop: '4px', marginTop: '4px' }}>
                        <span>After this payment</span>
                        <span style={{ color: willComplete ? theme.green : theme.accent }}>
                          {willComplete ? '✓ FULLY PAID' : selInvRemaining - amount > 0 ? `Balance: ${naira(selInvRemaining - amount)}` : `Overpayment: ${naira(amount - selInvRemaining)}`}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Payment details */}
                  <div style={{ ...styles.grid(2), gap: '8px' }}>
                    <div style={styles.formGroup}>
                      <label style={styles.label}>Payment Method</label>
                      <select style={styles.input} value={createPaymentForm.payment_method}
                        onChange={e => setCreatePaymentForm(f => ({ ...f, payment_method: e.target.value }))}>
                        <option value="bank_transfer">Bank Transfer</option>
                        <option value="cash">Cash</option>
                        <option value="cheque">Cheque</option>
                        <option value="pos">POS</option>
                      </select>
                    </div>
                    <div style={styles.formGroup}>
                      <label style={styles.label}>Reference</label>
                      <input style={styles.input} value={createPaymentForm.reference}
                        onChange={e => setCreatePaymentForm(f => ({ ...f, reference: e.target.value }))} placeholder="Optional" />
                    </div>
                  </div>
                </>
              ) : (
                <div style={styles.formGroup}>
                  <label style={styles.label}>Income Description *</label>
                  <input style={styles.input} value={createPaymentForm.otherIncomeDesc}
                    onChange={e => setCreatePaymentForm(f => ({ ...f, otherIncomeDesc: e.target.value }))}
                    placeholder={tx.description} />
                </div>
              )}

              <div style={styles.formGroup}>
                <label style={styles.label}>Notes</label>
                <input style={styles.input} value={createPaymentForm.notes}
                  onChange={e => setCreatePaymentForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional" />
              </div>

              <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                <button style={styles.btn('secondary')} onClick={() => { setCreatePaymentModal(null); setModalErr(''); setCreatePaymentForm({ customer_id: '', customerSearch: '', invoice_id: '', payment_method: 'bank_transfer', reference: '', notes: '', mode: 'invoice', paymentAmount: '', otherIncomeDesc: '' }); }}>Cancel</button>
                <button style={{ ...styles.btn('primary'), flex: 1 }} onClick={handleCreatePayment} disabled={creatingPayment}>
                  {creatingPayment ? 'Saving…' : isOther ? '✓ Record as Other Income' : '✓ Record Payment & Match'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Account Cards */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '12px' }}>
        <button style={{ ...styles.btn('secondary'), fontSize: '12px', padding: '5px 14px' }} onClick={() => setAddAcctModal(true)}>+ Add Account</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(accounts.length, 3)}, 1fr)`, gap: '16px', marginBottom: '24px' }}>
        {accounts.map(acct => {
          const typeColor = acct.account_type === 'income' ? theme.green : acct.account_type === 'expense' ? theme.red : theme.blue;
          return (
            <div key={acct.id} style={{ ...styles.card, cursor: 'pointer', borderTop: `3px solid ${typeColor}`, outline: selected?.id === acct.id ? `2px solid ${theme.accent}` : 'none' }}
              onClick={() => setSelected(acct)}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: '700', fontSize: '14px' }}>{acct.bank_name}</div>
                  <div style={{ fontSize: '11px', color: theme.textMuted, marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{acct.account_name}</div>
                  <div style={{ fontSize: '12px', color: theme.textMuted, marginTop: '2px', fontFamily: 'monospace' }}>{acct.account_number}</div>
                </div>
                <span style={styles.badge(typeColor)}>{acct.account_type}</span>
              </div>
              <div style={{ marginTop: '14px' }}>
                <div style={styles.statLabel}>Current Balance</div>
                <div style={{ fontSize: '20px', fontWeight: '700', color: theme.accent, marginTop: '4px' }}>{naira(acct.current_balance)}</div>
              </div>
              <div style={{ display: 'flex', gap: '8px', marginTop: '14px' }} onClick={e => e.stopPropagation()}>
                <button style={{ ...styles.btn('secondary'), padding: '5px 10px', fontSize: '12px', flex: 1 }} onClick={() => openImport(acct)}>↑ Import</button>
                <button style={{ ...styles.btn('secondary'), padding: '5px 10px', fontSize: '12px' }} onClick={() => setEditAcct({ ...acct })} title="Edit account details">✎</button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Transaction History */}
      {selected && (
        <div style={{ marginTop: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
            <div style={styles.sectionTitle}>{selected.bank_name} — Transactions</div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <input type="date" style={{ ...styles.input, width: '140px' }} placeholder="From" value={txFrom} onChange={e => setTxFrom(e.target.value)} />
              <input type="date" style={{ ...styles.input, width: '140px' }} placeholder="To" value={txTo} onChange={e => setTxTo(e.target.value)} />
              <input style={{ ...styles.input, width: '180px' }} placeholder="Search description / amount…" value={txSearch} onChange={e => setTxSearch(e.target.value)} />
            </div>
          </div>
          {/* Suggested Matches Queue — independent of date filter, always visible */}
          {suggestedTxs.length > 0 && (
            <div style={{ ...styles.card, marginBottom: '16px', borderLeft: `3px solid ${theme.accent}` }}>
              <div style={{ fontWeight: '600', fontSize: '13px', marginBottom: '10px' }}>
                {suggestedTxs.length} Pending Suggested Match{suggestedTxs.length !== 1 ? 'es' : ''} — awaiting review
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ ...styles.table, fontSize: '12px' }}>
                  <thead>
                    <tr>{['Date','Description','Debit','Suggested Match','Actions'].map(h => <th key={h} style={{ ...styles.th, fontSize: '11px' }}>{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {suggestedTxs.map(stx => {
                      const pr = paymentRequests.find(p => p.id === stx.matched_to_id);
                      return (
                        <tr key={stx.id}>
                          <td style={{ ...styles.td, whiteSpace: 'nowrap' }}>{stx.transaction_date}</td>
                          <td style={{ ...styles.td, maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={stx.description}>{stx.description}</td>
                          <td style={{ ...styles.td, textAlign: 'right', color: theme.red, fontWeight: '600' }}>{stx.debit > 0 ? naira(stx.debit) : ''}</td>
                          <td style={styles.td}>
                            {pr ? (
                              <div>
                                <div style={{ fontWeight: '600' }}>{pr.reference}</div>
                                <div style={{ fontSize: '10px', color: theme.textMuted }}>{pr.payee_name || pr.supplier?.company_name || pr.purpose || ''} · {naira(Number(pr.amount))}</div>
                              </div>
                            ) : stx.matched_to_type ? (
                              <span style={{ color: theme.textMuted, fontSize: '11px' }}>{stx.matched_to_type}</span>
                            ) : '—'}
                          </td>
                          <td style={{ ...styles.td, whiteSpace: 'nowrap' }}>
                            {canConfirm ? (
                              <div style={{ display: 'flex', gap: '4px' }}>
                                <button style={{ ...styles.btn('primary'), padding: '2px 8px', fontSize: '11px', background: theme.green }}
                                  onClick={() => handleConfirmMatch(stx)} disabled={actioningId === stx.id}>
                                  {actioningId === stx.id ? '…' : '✓ Confirm'}
                                </button>
                                <button style={{ ...styles.btn('secondary'), padding: '2px 8px', fontSize: '11px' }}
                                  onClick={() => { setRejectModal(stx); setRejectReason(''); }} disabled={actioningId === stx.id}>
                                  ✕ Reject
                                </button>
                              </div>
                            ) : <span style={{ fontSize: '11px', color: theme.textMuted }}>Awaiting accountant/MD review</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {txLoading ? <Spinner /> : (
            <div style={styles.card}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    {['Date','Description','Debit','Credit','Balance','Status','Actions'].map(h => <th key={h} style={styles.th}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0
                    ? <tr><td colSpan="7" style={{ ...styles.td, textAlign: 'center', color: theme.textMuted, padding: '30px' }}>No transactions. Import a statement to get started.</td></tr>
                    : filtered.map(tx => {
                      const isUnmatched = tx.match_status === 'unmatched' || !tx.match_status;
                      const isSuggested = tx.match_status === 'suggested';
                      const suggestedCat = (isUnmatched && tx.debit > 0) ? detectCategory(tx.description, tx.debit) : null;
                      const suggestedCustomer = (isUnmatched && tx.credit > 0) ? (() => {
                        const extracted = extractCustomerFromDesc(tx.description);
                        if (!extracted) return null;
                        const norm = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');
                        const en = norm(extracted);
                        return allCustomers.find(c => {
                          for (const raw of [c.name, c.company_name].filter(Boolean)) {
                            const cn = norm(raw);
                            if (en.includes(cn) || cn.includes(en)) return true;
                          }
                          return false;
                        }) || null;
                      })() : null;
                      const prCandidate = (isUnmatched && tx.debit > 0) ? findPRCandidate(tx) : null;
                      return (
                        <tr key={tx.id}>
                          <td style={{ ...styles.td, whiteSpace: 'nowrap' }}>{tx.transaction_date}</td>
                          <td style={{ ...styles.td, maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={tx.description}>{tx.description}</td>
                          <td style={{ ...styles.td, textAlign: 'right', color: theme.red, fontWeight: '600' }}>{tx.debit > 0 ? naira(tx.debit) : ''}</td>
                          <td style={{ ...styles.td, textAlign: 'right', color: theme.green, fontWeight: '600' }}>{tx.credit > 0 ? naira(tx.credit) : ''}</td>
                          <td style={{ ...styles.td, textAlign: 'right' }}>{tx.balance > 0 ? naira(tx.balance) : ''}</td>
                          <td style={styles.td}>
                            <span style={styles.badge(tx.match_status === 'matched' ? theme.green : tx.match_status === 'manual' ? theme.blue : isSuggested ? theme.accent : '#f5a623')}>
                              {tx.match_status || 'unmatched'}
                            </span>
                            {isSuggested && tx.matched_to_type === 'payment_request' && tx.matched_to_id && (() => {
                              const pr = paymentRequests.find(p => p.id === tx.matched_to_id);
                              return pr ? <div style={{ fontSize: '10px', color: theme.accent, marginTop: '2px' }}>{pr.reference}</div> : null;
                            })()}
                            {!isSuggested && tx.matched_to_type && <div style={{ fontSize: '10px', color: theme.textMuted, marginTop: '2px' }}>{tx.matched_to_type}</div>}
                            {isUnmatched && prCandidate?.amtMatch && (
                              <div style={{ fontSize: '10px', color: theme.green, marginTop: '3px', fontStyle: 'italic' }}>PR: {prCandidate.pr.reference}</div>
                            )}
                            {isUnmatched && prCandidate && !prCandidate.amtMatch && (
                              <div style={{ fontSize: '10px', color: '#d97706', marginTop: '3px' }}>⚠ PR ref found, amt mismatch ({naira(prCandidate.pr.amount)})</div>
                            )}
                            {isUnmatched && !prCandidate && suggestedCat && (
                              <div style={{ fontSize: '10px', color: theme.accent, marginTop: '3px', fontStyle: 'italic' }}>Suggested: {suggestedCat}</div>
                            )}
                            {isUnmatched && suggestedCustomer && (
                              <div style={{ fontSize: '10px', color: theme.green, marginTop: '3px', fontStyle: 'italic' }}>Customer: {suggestedCustomer.name}</div>
                            )}
                          </td>
                          <td style={{ ...styles.td, whiteSpace: 'nowrap' }}>
                            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                              {isUnmatched && (
                                <button style={{ ...styles.btn('secondary'), padding: '2px 7px', fontSize: '11px' }}
                                  onClick={() => { setMatchModal(tx); setMatchType('other'); setMatchNotes(''); }}>Match</button>
                              )}
                              {isUnmatched && tx.credit > 0 && (
                                <button style={{ ...styles.btn('primary'), padding: '2px 7px', fontSize: '11px', background: theme.green }}
                                  onClick={() => {
                                    setModalErr('');
                                    const custId = suggestedCustomer?.id || '';
                                    setCreatePaymentForm({ customer_id: custId, customerSearch: suggestedCustomer?.name || '', invoice_id: '', payment_method: 'bank_transfer', reference: '', notes: '', mode: 'invoice', paymentAmount: String(tx.credit), otherIncomeDesc: '' });
                                    setCreatePaymentModal(tx);
                                  }}>+ Payment</button>
                              )}
                              {isUnmatched && tx.debit > 0 && prCandidate?.amtMatch && (
                                <button style={{ ...styles.btn('primary'), padding: '2px 7px', fontSize: '11px', background: theme.green }}
                                  onClick={() => handleSuggestPR(tx, prCandidate.pr.id)}
                                  disabled={actioningId === tx.id}>
                                  {actioningId === tx.id ? '…' : `Suggest: ${prCandidate.pr.reference}`}
                                </button>
                              )}
                              {isUnmatched && tx.debit > 0 && (
                                <button style={{ ...styles.btn('secondary'), padding: '2px 7px', fontSize: '11px' }}
                                  onClick={() => { setSuggestModal(tx); setPrSearch(''); }}>Link to PR</button>
                              )}
                              {isUnmatched && tx.debit > 0 && (
                                <button style={{ ...styles.btn('primary'), padding: '2px 7px', fontSize: '11px' }}
                                  onClick={() => {
                                    setModalErr('');
                                    const cat = suggestedCat ? expCategories.find(c => c.name.toLowerCase().includes(suggestedCat.toLowerCase().split(' ')[0])) : null;
                                    setCreateExpForm({ category_id: cat?.id || '', description: tx.description, notes: '' });
                                    setCreateExpModal(tx);
                                  }}>+ Expense</button>
                              )}
                              {isSuggested && canConfirm && (
                                <>
                                  <button style={{ ...styles.btn('primary'), padding: '2px 7px', fontSize: '11px', background: theme.green }}
                                    onClick={() => handleConfirmMatch(tx)} disabled={actioningId === tx.id}>
                                    {actioningId === tx.id ? '…' : '✓ Confirm'}
                                  </button>
                                  <button style={{ ...styles.btn('secondary'), padding: '2px 7px', fontSize: '11px' }}
                                    onClick={() => { setRejectModal(tx); setRejectReason(''); }} disabled={actioningId === tx.id}>
                                    ✕ Reject
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  }
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ── RECONCILIATION TAB ────────────────────────────────────────
const ReconciliationTab = () => {
  const [accounts, setAccounts] = useState([]);
  const [accountId, setAccountId] = useState('');
  const [periodFrom, setPeriodFrom] = useState('');
  const [periodTo, setPeriodTo] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reconciledBy, setReconciledBy] = useState('');
  const [reconNotes, setReconNotes] = useState('');
  const [history, setHistory] = useState([]);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');

  useEffect(() => {
    bankAccountsService.getAll().then(a => {
      setAccounts(a);
      if (a.length > 0) setAccountId(a[0].id);
    }).catch(e => setErr(e?.message || 'An error occurred'));
  }, []);

  useEffect(() => {
    if (!accountId) return;
    bankReconciliationsService.getByAccount(accountId).then(setHistory).catch(() => {});
  }, [accountId]);

  const runReconciliation = async () => {
    if (!accountId || !periodFrom || !periodTo) { setErr('Select account and period'); return; }
    setLoading(true);
    try {
      const [bankTxs, payments, expenses2] = await Promise.all([
        bankTransactionsService.getByAccount(accountId, periodFrom, periodTo),
        accountingService.getConfirmedPayments(periodFrom, periodTo),
        expensesService.getAll(periodFrom, periodTo),
      ]);

      const bankCredits = bankTxs.reduce((s, t) => s + Number(t.credit || 0), 0);
      const bankDebits = bankTxs.reduce((s, t) => s + Number(t.debit || 0), 0);
      const bankOpen = bankTxs.length > 0 ? (bankTxs[bankTxs.length - 1].balance - bankTxs[bankTxs.length - 1].credit + bankTxs[bankTxs.length - 1].debit) : 0;
      const bankClose = bankTxs.length > 0 ? bankTxs[0].balance : 0;

      const sysCredits = payments.reduce((s, p) => s + Number(p.amount_paid || 0), 0);
      const sysDebits = expenses2.filter(e => e.status !== 'rejected').reduce((s, e) => s + Number(e.amount || 0), 0);
      const sysOpen = 0;
      const sysClose = sysCredits - sysDebits;

      const diff = bankClose - sysClose;

      const reconItems = [];
      // Unmatched bank transactions
      bankTxs.filter(t => t.match_status === 'unmatched').forEach(t => {
        reconItems.push({ description: t.description || 'Unmatched bank transaction', type: t.credit > 0 ? 'Credit in bank, not in system' : 'Debit in bank, not in system', amount: t.credit > 0 ? t.credit : t.debit });
      });

      setResult({ bankTxs, payments, expenses: expenses2, bank: { openingBalance: bankOpen, totalCredits: bankCredits, totalDebits: bankDebits, closingBalance: bankClose }, system: { openingBalance: sysOpen, totalCredits: sysCredits, totalDebits: sysDebits, closingBalance: sysClose }, difference: diff, reconItems });
    } catch (e) { setErr(e?.message || 'An error occurred'); }
    finally { setLoading(false); }
  };

  const saveReconciliation = async () => {
    if (!result) return;
    setSaving(true);
    try {
      const acct = accounts.find(a => a.id === accountId);
      const rec = await bankReconciliationsService.create({
        bank_account_id: accountId,
        reconciliation_date: new Date().toISOString().split('T')[0],
        period_from: periodFrom,
        period_to: periodTo,
        opening_balance_system: result.system.openingBalance,
        opening_balance_bank: result.bank.openingBalance,
        closing_balance_system: result.system.closingBalance,
        closing_balance_bank: result.bank.closingBalance,
        difference: result.difference,
        status: Math.abs(result.difference) < 0.01 ? 'completed' : 'draft',
        reconciled_by: reconciledBy,
        notes: reconNotes,
      });
      setHistory(h => [{ ...rec }, ...h]);
      setOk(Math.abs(result.difference) < 0.01 ? 'Reconciliation completed and saved!' : 'Reconciliation saved as draft (difference exists)');
    } catch (e) { setErr(e?.message || 'An error occurred'); }
    finally { setSaving(false); }
  };

  const downloadPdf = async () => {
    if (!result) return;
    const acct = accounts.find(a => a.id === accountId);
    setPdfLoading(true);
    try {
      await generateReconciliationPDF({
        account: acct,
        period: { from: periodFrom, to: periodTo },
        system: result.system,
        bank: result.bank,
        reconcilingItems: result.reconItems,
        difference: result.difference,
        reconciledBy,
        notes: reconNotes,
      });
    } catch (e) { setErr(e?.message || 'An error occurred'); }
    finally { setPdfLoading(false); }
  };

  return (
    <div>
      {err && <Alert msg={err} onClose={() => setErr('')} />}
      {ok && <Alert msg={ok} type="success" onClose={() => setOk('')} />}

      <div style={{ ...styles.row, alignItems: 'flex-end', marginBottom: '20px', gap: '12px', flexWrap: 'wrap' }}>
        <div>
          <label style={styles.label}>Bank Account</label>
          <select style={{ ...styles.input, width: '220px' }} value={accountId} onChange={e => setAccountId(e.target.value)}>
            {accounts.map(a => <option key={a.id} value={a.id}>{a.bank_name}</option>)}
          </select>
        </div>
        <div><label style={styles.label}>From</label><input type="date" style={{ ...styles.input, width: '150px' }} value={periodFrom} onChange={e => setPeriodFrom(e.target.value)} /></div>
        <div><label style={styles.label}>To</label><input type="date" style={{ ...styles.input, width: '150px' }} value={periodTo} onChange={e => setPeriodTo(e.target.value)} /></div>
        <button style={styles.btn('secondary')} onClick={runReconciliation} disabled={loading}>{loading ? 'Loading…' : 'Run Reconciliation'}</button>
        {result && <button style={{ ...styles.btn('primary'), marginLeft: 'auto' }} onClick={downloadPdf} disabled={pdfLoading}>{pdfLoading ? 'Generating…' : '↓ PDF'}</button>}
      </div>

      {result && (
        <>
          <div style={styles.row}>
            <div style={{ flex: 1, ...styles.card, borderTop: `3px solid ${theme.blue}` }}>
              <div style={{ ...styles.sectionTitle, color: theme.blue }}>System Records</div>
              <table style={styles.table}>
                <tbody>
                  <tr><td style={styles.td}>Opening Balance</td><td style={{ ...styles.td, textAlign: 'right' }}>{naira(result.system.openingBalance)}</td></tr>
                  <tr><td style={styles.td}>Total Receipts (Credits)</td><td style={{ ...styles.td, textAlign: 'right', color: theme.green }}>{naira(result.system.totalCredits)}</td></tr>
                  <tr><td style={styles.td}>Total Expenses (Debits)</td><td style={{ ...styles.td, textAlign: 'right', color: theme.red }}>({naira(result.system.totalDebits)})</td></tr>
                  <tr><td style={{ ...styles.td, fontWeight: '700' }}>Closing Balance</td><td style={{ ...styles.td, textAlign: 'right', fontWeight: '700', fontSize: '15px' }}>{naira(result.system.closingBalance)}</td></tr>
                </tbody>
              </table>
            </div>
            <div style={{ flex: 1, ...styles.card, borderTop: `3px solid ${theme.accent}` }}>
              <div style={{ ...styles.sectionTitle, color: theme.accent }}>Bank Statement</div>
              <table style={styles.table}>
                <tbody>
                  <tr><td style={styles.td}>Opening Balance</td><td style={{ ...styles.td, textAlign: 'right' }}>{naira(result.bank.openingBalance)}</td></tr>
                  <tr><td style={styles.td}>Total Credits</td><td style={{ ...styles.td, textAlign: 'right', color: theme.green }}>{naira(result.bank.totalCredits)}</td></tr>
                  <tr><td style={styles.td}>Total Debits</td><td style={{ ...styles.td, textAlign: 'right', color: theme.red }}>({naira(result.bank.totalDebits)})</td></tr>
                  <tr><td style={{ ...styles.td, fontWeight: '700' }}>Closing Balance</td><td style={{ ...styles.td, textAlign: 'right', fontWeight: '700', fontSize: '15px' }}>{naira(result.bank.closingBalance)}</td></tr>
                </tbody>
              </table>
            </div>
          </div>

          {result.reconItems.length > 0 && (
            <div style={{ ...styles.card, marginTop: '16px' }}>
              <div style={styles.sectionTitle}>Reconciling Items</div>
              <table style={styles.table}>
                <thead><tr><th style={styles.th}>Description</th><th style={styles.th}>Type</th><th style={{ ...styles.th, textAlign: 'right' }}>Amount</th></tr></thead>
                <tbody>
                  {result.reconItems.map((item, i) => (
                    <tr key={i}>
                      <td style={styles.td}>{item.description}</td>
                      <td style={{ ...styles.td, color: theme.textMuted, fontSize: '11px' }}>{item.type}</td>
                      <td style={{ ...styles.td, textAlign: 'right' }}>{naira(item.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div style={{ ...styles.card, marginTop: '16px', background: Math.abs(result.difference) < 0.01 ? theme.green + '11' : theme.red + '11', border: `1px solid ${Math.abs(result.difference) < 0.01 ? theme.green : theme.red}44` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <span style={{ fontWeight: '700', fontSize: '14px', color: Math.abs(result.difference) < 0.01 ? theme.green : theme.red }}>
                {Math.abs(result.difference) < 0.01 ? '✓ RECONCILED — Difference is ₦0' : `⚠ UNRECONCILED — Difference: ${naira(Math.abs(result.difference))}`}
              </span>
            </div>
            <div style={styles.row}>
              <div style={{ flex: 1 }}><label style={styles.label}>Reconciled By</label><input style={styles.input} placeholder="Accountant name" value={reconciledBy} onChange={e => setReconciledBy(e.target.value)} /></div>
              <div style={{ flex: 2 }}><label style={styles.label}>Notes</label><input style={styles.input} placeholder="Optional notes" value={reconNotes} onChange={e => setReconNotes(e.target.value)} /></div>
            </div>
            <button style={{ ...styles.btn('primary'), marginTop: '12px' }} onClick={saveReconciliation} disabled={saving}>{saving ? 'Saving…' : 'Save Reconciliation'}</button>
          </div>
        </>
      )}

      {history.length > 0 && (
        <div style={{ ...styles.card, marginTop: '24px' }}>
          <div style={styles.sectionTitle}>Reconciliation History</div>
          <table style={styles.table}>
            <thead><tr>{['Period','Date','Difference','Status','By'].map(h => <th key={h} style={styles.th}>{h}</th>)}</tr></thead>
            <tbody>
              {history.map(r => (
                <tr key={r.id}>
                  <td style={styles.td}>{r.period_from} — {r.period_to}</td>
                  <td style={styles.td}>{r.reconciliation_date}</td>
                  <td style={{ ...styles.td, color: Math.abs(r.difference) < 0.01 ? theme.green : theme.red, fontWeight: '600' }}>{naira(Math.abs(r.difference || 0))}</td>
                  <td style={styles.td}><span style={styles.badge(r.status === 'completed' ? theme.green : theme.accent)}>{r.status}</span></td>
                  <td style={{ ...styles.td, color: theme.textMuted }}>{r.reconciled_by || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

// ── RECEIPTS TAB ──────────────────────────────────────────────
const ReceiptsTab = () => {
  const today = new Date().toISOString().split('T')[0];
  const [receipts, setReceipts] = useState([]);
  const [approvedExpenses, setApprovedExpenses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [rfrom, setRfrom] = useState('');
  const [rto, setRto] = useState('');
  const [rsearch, setRsearch] = useState('');
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadForm, setUploadForm] = useState({ receipt_date: today, vendor_name: '', amount: '', tax_category: '', notes: '', expense_id: '' });
  const [uploading, setUploading] = useState(false);
  const [viewUrl, setViewUrl] = useState(null);
  const [viewIsPdf, setViewIsPdf] = useState(false);
  const [signedMap, setSignedMap] = useState({});
  const [missingCount, setMissingCount] = useState(0);
  const [showMissing, setShowMissing] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');

  const resolveSignedUrls = async (rows) => {
    const entries = await Promise.all((rows || []).map(async r => {
      try { return [r.id, await receiptsService.getSignedUrl(r.file_url)]; }
      catch { return [r.id, null]; }
    }));
    setSignedMap(m => ({ ...m, ...Object.fromEntries(entries) }));
  };

  const loadReceipts = () => {
    setLoading(true);
    receiptsService.getAll(rfrom || null, rto || null, rsearch || null)
      .then(rows => { setReceipts(rows); resolveSignedUrls(rows); })
      .catch(e => setErr(e?.message || 'An error occurred')).finally(() => setLoading(false));
  };

  useEffect(() => {
    loadReceipts();
    receiptsService.getMissingReceiptExpenses().then(setMissingCount).catch(() => {});
    expensesService.getAll().then(all => setApprovedExpenses(all.filter(e => e.status === 'approved'))).catch(() => {});
  }, []);

  const handleUpload = async () => {
    if (!uploadFile) { setErr('Please select a file'); return; }
    if (!uploadForm.receipt_date || !uploadForm.vendor_name || !uploadForm.amount) { setErr('Date, vendor and amount are required'); return; }
    setUploading(true);
    try {
      const rec = await receiptsService.upload(uploadFile, uploadForm);
      setReceipts(r => [rec, ...r]);
      resolveSignedUrls([rec]);
      setUploadFile(null);
      setUploadForm({ receipt_date: today, vendor_name: '', amount: '', tax_category: '', notes: '', expense_id: '' });
      setOk(`Receipt ${rec.receipt_number} uploaded`);
      receiptsService.getMissingReceiptExpenses().then(setMissingCount).catch(() => {});
    } catch (e) { setErr(e?.message || 'An error occurred'); }
    finally { setUploading(false); }
  };

  const handleDelete = async (r) => {
    try {
      await receiptsService.delete(r.id, r.file_url);
      setReceipts(rs => rs.filter(x => x.id !== r.id));
    } catch (e) { setErr(e?.message || 'An error occurred'); }
  };

  const exportTaxPackage = async () => {
    setExportLoading(true);
    try {
      const { default: JSZip } = await import('jszip');
      const zip = new JSZip();
      const folder = zip.folder('receipts');

      let csvRows = 'Receipt Number,Date,Vendor,Category,Amount,File Name\n';

      await Promise.all(receipts.map(async (r) => {
        try {
          const signed = signedMap[r.id] || await receiptsService.getSignedUrl(r.file_url);
          const res = signed ? await fetch(signed) : null;
          if (res?.ok) {
            const blob = await res.blob();
            folder.file(r.file_name || `${r.receipt_number}.file`, blob);
          }
        } catch {}
        const cat = r.expense?.category?.name || r.tax_category || '';
        csvRows += `"${r.receipt_number}","${r.receipt_date}","${r.vendor_name}","${cat}","${r.amount}","${r.file_name || ''}"\n`;
      }));

      zip.file('summary.csv', csvRows);
      const content = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(content);
      const a = document.createElement('a');
      a.href = url; a.download = `TaxPackage_${today}.zip`; a.click();
      URL.revokeObjectURL(url);
      setOk('Tax package downloaded');
    } catch (e) { setErr('Export failed: ' + e.message); }
    finally { setExportLoading(false); }
  };

  const filteredReceipts = showMissing ? [] : receipts;

  return (
    <div>
      {err && <Alert msg={err} onClose={() => setErr('')} />}
      {ok && <Alert msg={ok} type="success" onClose={() => setOk('')} />}

      {/* Image viewer */}
      {viewUrl && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setViewUrl(null)}>
          {viewIsPdf
            ? <iframe src={viewUrl} style={{ width: '80vw', height: '80vh', border: 'none' }} onClick={e => e.stopPropagation()} />
            : <img src={viewUrl} style={{ maxWidth: '90vw', maxHeight: '90vh', objectFit: 'contain' }} />}
        </div>
      )}

      <div style={styles.row}>
        <div style={{ width: '300px', flexShrink: 0 }}>
          <div style={{ ...styles.card, marginBottom: '16px' }}>
            <div style={styles.sectionTitle}>Upload Receipt</div>
            <div style={styles.formGroup}><label style={styles.label}>File (JPG / PNG / PDF)</label>
              <input type="file" accept="image/*,.pdf" style={{ ...styles.input, padding: '7px' }} onChange={e => setUploadFile(e.target.files?.[0])} />
            </div>
            {uploadFile && <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '8px' }}>Selected: {uploadFile.name}</div>}
            <div style={styles.formGroup}><label style={styles.label}>Date *</label><input type="date" style={styles.input} value={uploadForm.receipt_date} onChange={e => setUploadForm(f => ({ ...f, receipt_date: e.target.value }))} /></div>
            <div style={styles.formGroup}><label style={styles.label}>Vendor *</label><input style={styles.input} placeholder="Supplier name" value={uploadForm.vendor_name} onChange={e => setUploadForm(f => ({ ...f, vendor_name: e.target.value }))} /></div>
            <div style={styles.formGroup}><label style={styles.label}>Amount (₦) *</label><input type="number" style={styles.input} placeholder="0" value={uploadForm.amount} onChange={e => setUploadForm(f => ({ ...f, amount: e.target.value }))} /></div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Link to Expense (optional)</label>
              <select style={styles.input} value={uploadForm.expense_id} onChange={e => {
                const sel = approvedExpenses.find(x => x.id === e.target.value);
                setUploadForm(f => ({
                  ...f,
                  expense_id: e.target.value,
                  vendor_name: sel ? (f.vendor_name || sel.description) : f.vendor_name,
                  amount: sel ? (f.amount || String(sel.amount)) : f.amount,
                  receipt_date: sel ? (f.receipt_date || sel.expense_date) : f.receipt_date,
                }));
              }}>
                <option value="">— None —</option>
                {approvedExpenses.map(e => (
                  <option key={e.id} value={e.id}>
                    {e.expense_date} · {e.description} · ₦{Number(e.amount).toLocaleString()}
                  </option>
                ))}
              </select>
            </div>
            <div style={styles.formGroup}><label style={styles.label}>Tax Category</label>
              <input style={styles.input} placeholder="e.g. Fuel, Labour, Materials" value={uploadForm.tax_category} onChange={e => setUploadForm(f => ({ ...f, tax_category: e.target.value }))} />
            </div>
            <button style={{ ...styles.btn('primary'), width: '100%' }} onClick={handleUpload} disabled={uploading}>{uploading ? 'Uploading…' : '↑ Upload Receipt'}</button>
          </div>

          {missingCount > 0 && (
            <div style={{ ...styles.card, background: theme.red + '11', border: `1px solid ${theme.red}33` }}>
              <div style={{ color: theme.red, fontWeight: '700', fontSize: '13px' }}>⚠ {missingCount} expenses without receipts</div>
              <div style={{ fontSize: '11px', color: theme.textMuted, marginTop: '4px' }}>Upload receipts for approved expenses to maintain complete records.</div>
            </div>
          )}
        </div>

        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div><label style={styles.label}>From</label><input type="date" style={{ ...styles.input, width: '140px' }} value={rfrom} onChange={e => setRfrom(e.target.value)} /></div>
            <div><label style={styles.label}>To</label><input type="date" style={{ ...styles.input, width: '140px' }} value={rto} onChange={e => setRto(e.target.value)} /></div>
            <div style={{ flex: 1 }}><label style={styles.label}>Search vendor</label><input style={styles.input} placeholder="Search…" value={rsearch} onChange={e => setRsearch(e.target.value)} /></div>
            <button style={styles.btn('secondary')} onClick={loadReceipts}>Search</button>
            <button style={styles.btn('primary')} onClick={exportTaxPackage} disabled={exportLoading || receipts.length === 0}>{exportLoading ? 'Exporting…' : '↓ Tax ZIP'}</button>
          </div>
          {loading ? <Spinner /> : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '12px' }}>
              {receipts.length === 0
                ? <div style={{ ...styles.card, gridColumn: '1/-1', textAlign: 'center', color: theme.textMuted, padding: '30px' }}>No receipts found. Upload your first receipt.</div>
                : receipts.map(r => (
                  <div key={r.id} style={{ ...styles.card, padding: '12px', position: 'relative' }}>
                    <div style={{ height: '100px', background: theme.surface, borderRadius: '6px', marginBottom: '8px', overflow: 'hidden', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      onClick={() => { setViewIsPdf(r.receipt_type !== 'photo'); setViewUrl(signedMap[r.id]); }}>
                      {r.receipt_type === 'photo'
                        ? <img src={signedMap[r.id]} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => e.target.style.display = 'none'} />
                        : <div style={{ fontSize: '32px', textAlign: 'center' }}>📄</div>}
                    </div>
                    <div style={{ fontSize: '11px', fontWeight: '700', color: theme.accent }}>{r.receipt_number}</div>
                    <div style={{ fontSize: '11px', fontWeight: '600', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.vendor_name}</div>
                    <div style={{ fontSize: '11px', color: theme.green, fontWeight: '600' }}>{naira(r.amount)}</div>
                    <div style={{ fontSize: '10px', color: theme.textMuted }}>{r.receipt_date}</div>
                    <div style={{ display: 'flex', gap: '4px', marginTop: '8px' }}>
                      <a href={signedMap[r.id] || undefined} target="_blank" rel="noreferrer" style={{ ...styles.btn('secondary'), padding: '3px 8px', fontSize: '10px', textDecoration: 'none', display: 'inline-block' }}>↓</a>
                      <button style={{ ...styles.btn('danger'), padding: '3px 8px', fontSize: '10px' }} onClick={() => handleDelete(r)}>✕</button>
                    </div>
                  </div>
                ))
              }
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const Accounting = ({ userProfile }) => {
  const [tab, setTab] = useState('bookkeeping');
  const isFinanceAdmin = hasRole(userProfile, 'md', 'accountant');
  const TABS = [
    { id: 'bookkeeping', label: 'Daily Bookkeeping' },
    { id: 'pl', label: 'P&L Statement' },
    { id: 'cost', label: 'Cost Analysis' },
    { id: 'receivables', label: 'Accounts Receivable' },
    { id: 'management', label: 'Management Accounts' },
    { id: 'bank', label: 'Bank Accounts' },
    { id: 'reconciliation', label: 'Reconciliation' },
    { id: 'receipts', label: 'Receipts' },
    ...(isFinanceAdmin ? [{ id: 'opening_balances', label: 'Opening Balances' }] : []),
    { id: 'financial_statements', label: '📊 Financial Statements' },
  ];
  return (
    <div>
      <div style={styles.header}>
        <div>
          <div style={styles.pageTitle}>Accounting</div>
          <div style={styles.pageSubtitle}>Financial records, P&L, cost analysis and management accounts</div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: '2px', marginBottom: '24px', borderBottom: `1px solid ${theme.border}`, flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button key={t.id} data-ico-allow data-board-allow onClick={() => setTab(t.id)} style={{
            padding: '9px 16px', fontSize: '13px', fontWeight: tab === t.id ? '600' : '400',
            color: tab === t.id ? theme.accent : theme.textMuted,
            background: 'transparent', border: 'none', cursor: 'pointer',
            borderBottom: tab === t.id ? `2px solid ${theme.accent}` : '2px solid transparent',
            marginBottom: '-1px', transition: 'all 0.15s',
          }}>{t.label}</button>
        ))}
      </div>
      {tab === 'bookkeeping' && <BookkeepingTab />}
      {tab === 'pl' && <PLTab />}
      {tab === 'cost' && <CostTabErrorBoundary><CostTab /></CostTabErrorBoundary>}
      {tab === 'receivables' && <ReceivablesTab />}
      {tab === 'management' && <ManagementTab />}
      {tab === 'bank' && <BankAccountsTab userProfile={userProfile} />}
      {tab === 'reconciliation' && <ReconciliationTab />}
      {tab === 'receipts' && <ReceiptsTab />}
      {tab === 'opening_balances' && <OpeningBalances userProfile={userProfile} />}
      {tab === 'financial_statements' && <FinancialStatements userProfile={userProfile} />}
    </div>
  );
};

// ── CHANGE PASSWORD MODAL ─────────────────────────────────────
const ChangePasswordModal = ({ onClose }) => {
  const [newPwd, setNewPwd]       = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [saving, setSaving]       = useState(false);
  const [err, setErr]             = useState('');
  const [ok, setOk]               = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (newPwd.length < 6)          { setErr('Password must be at least 6 characters.'); return; }
    if (newPwd !== confirmPwd)       { setErr('Passwords do not match.'); return; }
    setSaving(true); setErr('');
    try {
      await authService.changePassword(newPwd);
      setOk('Password changed successfully.');
      setNewPwd(''); setConfirmPwd('');
      setTimeout(onClose, 1500);
    } catch(e) { setErr(e?.message || 'An error occurred'); }
    finally { setSaving(false); }
  };

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ background:theme.surface, borderRadius:'12px', padding:'28px', width:'100%', maxWidth:'360px', boxShadow:'0 16px 48px rgba(0,0,0,0.5)' }}>
        <div style={{ fontWeight:'700', fontSize:'15px', marginBottom:'18px' }}>Change Password</div>
        {err && <Alert msg={err} onClose={() => setErr('')} />}
        {ok  && <Alert msg={ok} type="success" onClose={() => setOk('')} />}
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom:'12px' }}>
            <label style={{ display:'block', fontSize:'11px', color:theme.textMuted, marginBottom:'4px', textTransform:'uppercase', letterSpacing:'0.06em' }}>New Password</label>
            <input style={styles.input} type="password" value={newPwd} onChange={e => setNewPwd(e.target.value)} placeholder="Min. 6 characters" required minLength={6} autoFocus />
          </div>
          <div style={{ marginBottom:'18px' }}>
            <label style={{ display:'block', fontSize:'11px', color:theme.textMuted, marginBottom:'4px', textTransform:'uppercase', letterSpacing:'0.06em' }}>Confirm New Password</label>
            <input style={{ ...styles.input, ...(confirmPwd && confirmPwd !== newPwd ? { borderColor:theme.red } : {}) }} type="password" value={confirmPwd} onChange={e => setConfirmPwd(e.target.value)} placeholder="Repeat password" required />
            {confirmPwd && confirmPwd !== newPwd && <div style={{ fontSize:'11px', color:theme.red, marginTop:'4px' }}>Passwords do not match.</div>}
          </div>
          <div style={{ display:'flex', gap:'10px' }}>
            <button type="submit" style={styles.btn('primary')} disabled={saving}>{saving ? 'Saving…' : 'Change Password'}</button>
            <button type="button" style={styles.btn('secondary')} onClick={onClose}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ── MY PROFILE ────────────────────────────────────────────────
const MyProfile = ({ userProfile }) => {
  const [tab, setTab] = useState('info');
  const [documents, setDocuments] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [docAlert, setDocAlert] = useState(null);
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [pwdSaving, setPwdSaving] = useState(false);
  const [pwdMsg, setPwdMsg] = useState(null);
  const [staffRecord, setStaffRecord] = useState(null);

  useEffect(() => {
    if (userProfile?.staff_id) {
      supabase.from('staff_public').select('id, full_name, role, staff_type, profile_photo_url').eq('id', userProfile.staff_id).single().then(({ data }) => setStaffRecord(data));
    }
    loadDocs();
  }, [userProfile]);

  const loadDocs = async () => {
    if (!userProfile?.id) return;
    const { data } = await supabase.from('staff_documents').select('*').eq('user_id', userProfile.id).order('uploaded_at', { ascending: false });
    const docs = data || [];
    await Promise.all(docs.map(async (doc) => {
      const path = doc.file_url?.startsWith('http')
        ? doc.file_url.match(/staff-documents\/(.+)$/)?.[1]
        : doc.file_url;
      if (path) {
        const { data: sd } = await supabase.storage.from('staff-documents').createSignedUrl(path, 3600);
        doc.displayUrl = sd?.signedUrl || null;
      } else {
        doc.displayUrl = null;
      }
    }));
    setDocuments(docs);
  };

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true); setDocAlert(null);
    try {
      const ext = file.name.split('.').pop();
      const path = `${userProfile.id}/${Date.now()}.${ext}`;
      const { data: storageData, error: upErr } = await supabase.storage.from('staff-documents').upload(path, file);
      if (upErr) throw upErr;
      await supabase.from('staff_documents').insert({
        user_id: userProfile.id,
        staff_id: userProfile.staff_id || null,
        file_name: file.name,
        file_url: storageData.path,
        file_size: file.size,
        document_type: ext.toLowerCase() === 'pdf' ? 'pdf' : ['jpg','jpeg','png'].includes(ext.toLowerCase()) ? 'image' : 'other',
      });
      setDocAlert({ type: 'success', msg: `${file.name} uploaded successfully.` });
      loadDocs();
    } catch (err) {
      setDocAlert({ type: 'error', msg: 'Upload failed: ' + err.message });
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleDeleteDoc = async (doc) => {
    try {
      const pathPart = doc.file_url?.startsWith('http')
        ? doc.file_url.split('/staff-documents/')[1]
        : doc.file_url;
      if (pathPart) await supabase.storage.from('staff-documents').remove([pathPart]);
      await supabase.from('staff_documents').delete().eq('id', doc.id);
      setDocAlert({ type: 'success', msg: 'Document deleted.' });
      loadDocs();
    } catch (err) {
      setDocAlert({ type: 'error', msg: 'Delete failed: ' + err.message });
    }
  };

  const handleChangePwd = async (e) => {
    e.preventDefault();
    if (newPwd.length < 6) { setPwdMsg({ type: 'error', msg: 'Password must be at least 6 characters.' }); return; }
    if (newPwd !== confirmPwd) { setPwdMsg({ type: 'error', msg: 'Passwords do not match.' }); return; }
    setPwdSaving(true); setPwdMsg(null);
    try {
      await authService.changePassword(newPwd);
      setPwdMsg({ type: 'success', msg: 'Password changed successfully.' });
      setNewPwd(''); setConfirmPwd('');
    } catch (err) {
      setPwdMsg({ type: 'error', msg: err.message });
    } finally {
      setPwdSaving(false);
    }
  };

  const role = userProfile?.role;
  const roleLabel = APP_ROLES.find(r => r.id === role)?.label || role;
  const fmtBytes = (b) => b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${(b / 1024).toFixed(0)} KB`;

  return (
    <div>
      <div style={styles.header}>
        <div>
          <div style={styles.pageTitle}>My Profile</div>
          <div style={styles.pageSubtitle}>View your account details, upload documents, and change your password</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', borderBottom: `1px solid ${theme.border}`, paddingBottom: '12px' }}>
        {['info', 'documents', 'password'].map(t => (
          <button data-ico-allow key={t} onClick={() => setTab(t)} style={{ padding: '8px 18px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: tab === t ? '700' : '400', background: tab === t ? theme.accent + '22' : 'transparent', color: tab === t ? theme.accent : theme.textMuted }}>
            {t === 'info' ? 'Personal Info' : t === 'documents' ? 'My Documents' : 'Change Password'}
          </button>
        ))}
      </div>

      {tab === 'info' && (
        <div style={styles.card}>
          <div style={{ display: 'flex', gap: '32px', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: '260px' }}>
              <div style={{ fontSize: '13px', fontWeight: '700', color: theme.textMuted, marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Account</div>
              {[['Full Name', userProfile?.full_name], ['Email', userProfile?.email], ['Role', roleLabel], ['Account Status', userProfile?.is_active ? 'Active' : 'Inactive']].map(([label, val]) => (
                <div key={label} style={{ marginBottom: '14px' }}>
                  <div style={{ fontSize: '11px', color: theme.textMuted, fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '3px' }}>{label}</div>
                  <div style={{ fontSize: '14px', color: theme.text, fontWeight: '500' }}>{val || '—'}</div>
                </div>
              ))}
            </div>
            {staffRecord && (
              <div style={{ flex: 1, minWidth: '260px' }}>
                <div style={{ fontSize: '13px', fontWeight: '700', color: theme.textMuted, marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Staff Record</div>
                {[['Employee No.', staffRecord.employee_number], ['Department', staffRecord.department], ['Position', staffRecord.position], ['Phone', staffRecord.phone], ['Date Joined', staffRecord.date_joined]].map(([label, val]) => (
                  <div key={label} style={{ marginBottom: '14px' }}>
                    <div style={{ fontSize: '11px', color: theme.textMuted, fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '3px' }}>{label}</div>
                    <div style={{ fontSize: '14px', color: theme.text, fontWeight: '500' }}>{val || '—'}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'documents' && (
        <div>
          {docAlert && <Alert msg={docAlert.msg} type={docAlert.type} onClose={() => setDocAlert(null)} />}
          <div style={{ ...styles.card, marginBottom: '16px' }}>
            <div style={{ fontSize: '13px', fontWeight: '700', color: theme.text, marginBottom: '12px' }}>Upload a Document</div>
            <div style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '12px' }}>Upload personal documents: NIN slip, guarantor form, certificates, ID cards, etc. (PDF, JPG, PNG — max 5 MB)</div>
            <input data-ico-allow type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={handleUpload} disabled={uploading} style={{ fontSize: '13px', color: theme.text }} />
            {uploading && <div style={{ fontSize: '12px', color: theme.accent, marginTop: '8px' }}>Uploading…</div>}
          </div>
          <div style={styles.card}>
            <div style={{ fontSize: '13px', fontWeight: '700', color: theme.text, marginBottom: '12px' }}>My Documents ({documents.length})</div>
            {documents.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '32px', color: theme.textMuted, fontSize: '13px' }}>No documents uploaded yet.</div>
            ) : (
              <table style={styles.table}>
                <thead><tr>{['File Name', 'Type', 'Size', 'Uploaded', ''].map(h => <th key={h} style={styles.th}>{h}</th>)}</tr></thead>
                <tbody>
                  {documents.map(doc => (
                    <tr key={doc.id}>
                      <td style={styles.td}><a href={doc.displayUrl || '#'} target="_blank" rel="noreferrer" style={{ color: theme.blue, textDecoration: 'none', fontWeight: '600' }}>{doc.file_name}</a></td>
                      <td style={styles.td}><span style={styles.badge(theme.blue)}>{doc.document_type}</span></td>
                      <td style={styles.td}>{doc.file_size ? fmtBytes(doc.file_size) : '—'}</td>
                      <td style={styles.td}>{doc.uploaded_at ? new Date(doc.uploaded_at).toLocaleDateString('en-GB') : '—'}</td>
                      <td style={styles.td}>
                        <button data-ico-allow style={{ ...styles.btn('danger'), padding: '4px 10px', fontSize: '11px' }} onClick={() => handleDeleteDoc(doc)}>Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {tab === 'password' && (
        <div style={{ ...styles.card, maxWidth: '420px' }}>
          <div style={{ fontSize: '13px', fontWeight: '700', color: theme.text, marginBottom: '16px' }}>Change Password</div>
          {pwdMsg && <Alert msg={pwdMsg.msg} type={pwdMsg.type} onClose={() => setPwdMsg(null)} />}
          <form onSubmit={handleChangePwd}>
            <div style={styles.formGroup}>
              <label style={styles.label}>New Password</label>
              <input data-ico-allow style={styles.input} type="password" value={newPwd} onChange={e => setNewPwd(e.target.value)} placeholder="Min. 6 characters" required minLength={6} />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Confirm New Password</label>
              <input data-ico-allow style={{ ...styles.input, ...(confirmPwd && confirmPwd !== newPwd ? { borderColor: theme.red } : {}) }} type="password" value={confirmPwd} onChange={e => setConfirmPwd(e.target.value)} placeholder="Repeat password" required />
              {confirmPwd && confirmPwd !== newPwd && <div style={{ fontSize: '11px', color: theme.red, marginTop: '4px' }}>Passwords do not match.</div>}
            </div>
            <button data-ico-allow type="submit" style={styles.btn('primary')} disabled={pwdSaving}>{pwdSaving ? 'Saving…' : 'Change Password'}</button>
          </form>
        </div>
      )}
    </div>
  );
};

// ── ADVANCES ──────────────────────────────────────────────────
const AdvancesPage = ({ userProfile }) => {
  const [advances, setAdvances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [alert, setAlert] = useState(null);
  const [actionSaving, setActionSaving] = useState(false);
  const [staffList, setStaffList] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ staff_id: '', amount: '', reason: '', installments: '1' });
  const [saving, setSaving] = useState(false);
  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejectReason, setRejectReason] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const [adv, staff] = await Promise.all([
        advancesService.list(),
        staffService.getPublicActive(),
      ]);
      setAdvances(adv);
      setStaffList(staff);
    } catch (e) { setAlert({ type: 'error', msg: e.message }); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    if (!form.staff_id || !form.amount || !form.reason)
      return setAlert({ type: 'error', msg: 'Staff, amount, and reason are required.' });
    setSaving(true); setAlert(null);
    try {
      await advancesService.create({
        staff_id: form.staff_id,
        amount: Number(form.amount),
        reason: form.reason,
        installments: Number(form.installments) || 1,
        requested_by: userProfile?.full_name || 'Admin',
      });
      setForm({ staff_id: '', amount: '', reason: '', installments: '1' });
      setShowForm(false);
      setAlert({ type: 'success', msg: 'Advance request recorded.' });
      load();
    } catch (e) { setAlert({ type: 'error', msg: e.message }); }
    finally { setSaving(false); }
  };

  const handleAction = async (id, action, reason = null) => {
    setActionSaving(true); setAlert(null);
    try {
      await advancesService.advance(id, action, reason);
      setRejectTarget(null); setRejectReason('');
      await load();
    } catch (e) { setAlert({ type: 'error', msg: e.message }); }
    finally { setActionSaving(false); }
  };

  const role = userProfile?.role;
  const canRecord = hasRole(userProfile, 'hr_officer', 'accountant', 'md');
  const advStatusColor = s =>
    s === 'disbursed' ? theme.green :
    s === 'md_approved' ? theme.blue :
    s === 'ico_approved' ? theme.accent :
    s === 'settled' ? theme.textMuted :
    (s === 'rejected' || s === 'cancelled') ? theme.red :
    theme.textMuted;

  return (
    <div>
      {alert && <Alert msg={alert.msg} type={alert.type} onClose={() => setAlert(null)} />}
      <div style={styles.header}>
        <div>
          <div style={styles.pageTitle}>Salary Advances</div>
          <div style={styles.pageSubtitle}>Track and approve staff advance requests</div>
        </div>
        {canRecord && (
          <button style={styles.btn('primary')} onClick={() => setShowForm(v => !v)}>
            {showForm ? '✕ Cancel' : '+ New Request'}
          </button>
        )}
      </div>

      {showForm && (
        <div style={{ ...styles.card, marginBottom: '20px' }}>
          <div style={styles.sectionTitle}>New Advance Request</div>
          <div style={styles.grid(2)}>
            <div style={styles.formGroup}>
              <label style={styles.label}>Staff Member</label>
              <select style={styles.input} value={form.staff_id} onChange={e => setForm(f => ({ ...f, staff_id: e.target.value }))}>
                <option value="">Select staff…</option>
                {staffList.map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}
              </select>
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Amount (₦)</label>
              <input style={styles.input} type="number" placeholder="0" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Installments</label>
              <input style={styles.input} type="number" min="1" placeholder="1" value={form.installments} onChange={e => setForm(f => ({ ...f, installments: e.target.value }))} />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Reason</label>
              <input style={styles.input} placeholder="Reason for advance…" value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} />
            </div>
          </div>
          <button style={styles.btn('primary')} onClick={handleCreate} disabled={saving}>{saving ? 'Saving…' : 'Submit Request'}</button>
        </div>
      )}

      {rejectTarget && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ ...styles.card, width: '420px' }}>
            <div style={{ ...styles.sectionTitle, marginBottom: '12px' }}>
              {rejectTarget.action === 'reject' ? 'Reject' : 'Cancel'} Advance — Reason Required
            </div>
            <textarea
              style={{ ...styles.input, height: '80px', resize: 'vertical' }}
              placeholder="Enter reason…"
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
            />
            <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
              <button
                style={styles.btn('danger')}
                disabled={!rejectReason.trim() || actionSaving}
                onClick={() => handleAction(rejectTarget.id, rejectTarget.action, rejectReason.trim())}
              >{actionSaving ? 'Saving…' : rejectTarget.action === 'reject' ? 'Reject' : 'Cancel Advance'}</button>
              <button style={styles.btn('secondary')} onClick={() => { setRejectTarget(null); setRejectReason(''); }}>Back</button>
            </div>
          </div>
        </div>
      )}

      <div style={styles.card}>
        {loading ? <Spinner /> : advances.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '30px', color: theme.textMuted }}>No advance requests yet.</div>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                {['Staff','Amount','Installments','Outstanding','Reason','Requested By','Status','Actions'].map(h => (
                  <th key={h} style={styles.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {advances.map(adv => {
                const status = adv.status;
                const actions = [];
                if (status === 'requested' && role === 'ico')
                  actions.push(<button key="ico" style={{ ...styles.btn('primary'), padding: '4px 10px', fontSize: '11px' }} onClick={() => handleAction(adv.id, 'ico_approve')} disabled={actionSaving}>✓ ICO Approve</button>);
                if (status === 'ico_approved' && role === 'md')
                  actions.push(<button key="md" style={{ ...styles.btn('primary'), padding: '4px 10px', fontSize: '11px' }} onClick={() => handleAction(adv.id, 'md_approve')} disabled={actionSaving}>✓ MD Approve</button>);
                if (status === 'md_approved' && ['accountant', 'md'].includes(role))
                  actions.push(<button key="disburse" style={{ ...styles.btn('primary'), padding: '4px 10px', fontSize: '11px', background: theme.green, color: '#000' }} onClick={() => handleAction(adv.id, 'disburse')} disabled={actionSaving}>↑ Disburse</button>);
                if (['requested','ico_approved','md_approved'].includes(status) && ['ico','md'].includes(role))
                  actions.push(<button key="reject" style={{ ...styles.btn('danger'), padding: '4px 10px', fontSize: '11px' }} onClick={() => setRejectTarget({ id: adv.id, action: 'reject' })}>✕ Reject</button>);
                if (status === 'requested' && ['hr_officer','accountant','md'].includes(role))
                  actions.push(<button key="cancel" style={{ ...styles.btn('secondary'), padding: '4px 10px', fontSize: '11px' }} onClick={() => setRejectTarget({ id: adv.id, action: 'cancel' })}>✕ Cancel</button>);
                return (
                  <tr key={adv.id}>
                    <td style={styles.td}><strong>{adv.staff?.full_name || '—'}</strong></td>
                    <td style={styles.td}><strong style={{ color: theme.accent }}>{naira(adv.amount)}</strong></td>
                    <td style={styles.td}>{adv.installments || 1}</td>
                    <td style={styles.td}>{(adv.outstanding_balance || 0) > 0 ? <strong style={{ color: theme.red }}>{naira(adv.outstanding_balance)}</strong> : <span style={{ color: theme.textMuted }}>—</span>}</td>
                    <td style={styles.td}>{adv.reason || '—'}</td>
                    <td style={styles.td}>{adv.requested_by || '—'}</td>
                    <td style={styles.td}><span style={styles.badge(advStatusColor(status))}>{status}</span></td>
                    <td style={styles.td}><div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>{actions.length ? actions : <span style={{ color: theme.textMuted, fontSize: '11px' }}>—</span>}</div></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

// One attached receipt row: name/date/uploader/note + a View link that fetches
// a signed URL on click. A signing failure marks just this row, not the list.
const PaymentRequestAttachmentRow = ({ att }) => {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const fileName = (att.file_path || '').split('/').pop() || 'receipt';
  const openFile = async () => {
    setBusy(true); setFailed(false);
    try {
      const url = await paymentRequestsService.getAttachmentSignedUrl(att.file_path);
      if (url) window.open(url, '_blank', 'noopener');
      else setFailed(true);
    } catch (e) { console.error('attachment signed URL failed', e); setFailed(true); }
    finally { setBusy(false); }
  };
  return (
    <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', padding: '8px 0', borderBottom: `1px solid ${theme.border}44` }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '13px', color: theme.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fileName}</div>
        <div style={{ fontSize: '11px', color: theme.textMuted, marginTop: '2px' }}>
          {att.uploader_name || 'Unknown'}{att.created_at ? ` · ${new Date(att.created_at).toLocaleDateString('en-GB')}` : ''}
        </div>
        {att.note && <div style={{ fontSize: '11px', color: theme.textMuted, marginTop: '2px', fontStyle: 'italic' }}>{att.note}</div>}
        {failed && <div style={{ fontSize: '11px', color: theme.red, marginTop: '2px' }}>Couldn&rsquo;t load file.</div>}
      </div>
      <button style={{ ...styles.btn('secondary'), padding: '4px 10px', fontSize: '11px', flexShrink: 0 }} onClick={openFile} disabled={busy}>{busy ? '…' : 'View'}</button>
    </div>
  );
};

// ── PAYMENT REQUESTS ──────────────────────────────────────────
const PaymentRequestsPage = ({ userProfile }) => {
  const role = userProfile?.role;
  const userId = userProfile?.id;
  const isInitiator = ['production_manager', 'logistics_manager', 'bdm', 'hr_officer'].includes(role);
  const canReviewVendors = ['md', 'ico', 'accountant'].includes(role);

  const [requests, setRequests] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [alert, setAlert] = useState(null);
  const [actionSaving, setActionSaving] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [form, setForm] = useState({ amount: '', purpose: '', expense_category_id: '', disbursement_method: 'bank_transfer', order_item_id: '', _order_id: '', category_other_note: '', payeeMode: 'existing', supplier_id: '', payee_name: '', payee_bank_name: '', payee_account_number: '', payee_account_name: '', saveAsVendor: false });
  const [saving, setSaving] = useState(false);
  const [activeSuppliers, setActiveSuppliers] = useState([]);
  const [pendingVendors, setPendingVendors] = useState([]);
  const [vendorSaving, setVendorSaving] = useState(null);

  const [recallTarget, setRecallTarget] = useState(null);
  const [recallReason, setRecallReason] = useState('');
  const [overrideCloseTarget, setOverrideCloseTarget] = useState(null);
  const [overrideCloseReason, setOverrideCloseReason] = useState('');
  const [disburseTarget, setDisburseTarget] = useState(null);
  const [disburseAccountId, setDisburseAccountId] = useState('');
  const [bankAccounts, setBankAccounts] = useState([]);
  const [detailReq, setDetailReq] = useState(null);
  const [copiedField, setCopiedField] = useState(null);
  const [showHistory, setShowHistory] = useState(false);
  const [attachFile, setAttachFile] = useState(null);
  const [attachNote, setAttachNote] = useState('');
  const [attachSaving, setAttachSaving] = useState(false);
  const [attachAlert, setAttachAlert] = useState(null);
  const [attachments, setAttachments] = useState([]);
  const [attachLoading, setAttachLoading] = useState(false);
  const [attachError, setAttachError] = useState(false);
  const [dupConfirm, setDupConfirm] = useState(false);

  const emptyBackfillForm = { requested_by: '', amount: '', purpose: '', transaction_date: '', note: '', expense_category_id: '', disbursement_method: 'bank_transfer', bank_account_id: '', payeeMode: 'existing', supplier_id: '', payee_name: '', payee_bank_name: '', payee_account_number: '', payee_account_name: '' };
  const [showBackfill, setShowBackfill] = useState(false);
  const [backfillForm, setBackfillForm] = useState(emptyBackfillForm);
  const [backfillSaving, setBackfillSaving] = useState(false);
  const [queryTarget, setQueryTarget] = useState(null);
  const [queryReason, setQueryReason] = useState('');
  const [allUsers, setAllUsers] = useState([]);
  const [showQueried, setShowQueried] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');

  const canBackfill = isInitiator || role === 'md';
  const canQuery = ['ico', 'accountant'].includes(role);

  const [resaleItems, setResaleItems] = useState([]);
  const [resaleOrderMap, setResaleOrderMap] = useState({});
  const [resaleItemsLoading, setResaleItemsLoading] = useState(false);

  const loadResaleItems = async () => {
    setResaleItemsLoading(true);
    try {
      const { data: items } = await supabase
        .from('order_items')
        .select('id, order_id, block_type, quantity, unit_price, cost_basis')
        .eq('source_type', 'resale')
        .order('created_at', { ascending: false })
        .limit(100);
      const rows = items || [];
      setResaleItems(rows);
      const orderIds = [...new Set(rows.map(r => r.order_id).filter(Boolean))];
      if (orderIds.length) {
        const { data: orders } = await supabase
          .from('orders')
          .select('id, created_at, customer:customer_id(name)')
          .in('id', orderIds);
        setResaleOrderMap(Object.fromEntries((orders || []).map(o => [o.id, o])));
      } else {
        setResaleOrderMap({});
      }
    } catch { /* non-fatal — link section stays hidden */ }
    finally { setResaleItemsLoading(false); }
  };

  const load = async () => {
    setLoading(true);
    try {
      const [reqs, cats] = await Promise.all([
        isInitiator ? paymentRequestsService.listMine(userId) : paymentRequestsService.list(),
        expenseCategoriesService.getActive(),
      ]);
      setRequests(reqs);
      setCategories(cats);
      if (isInitiator || role === 'md') paymentRequestsService.getActiveSuppliers().then(setActiveSuppliers).catch(() => {});
      if (canReviewVendors) paymentRequestsService.getPendingVendors().then(setPendingVendors).catch(() => {});
    } catch (e) { setAlert({ type: 'error', msg: e.message }); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);
  useEffect(() => { bankAccountsService.getAll().then(setBankAccounts).catch(() => {}); }, []);
  useEffect(() => {
    supabase.from('user_profiles_directory').select('id, full_name, role').order('full_name')
      .then(({ data }) => setAllUsers(data || [])).catch(() => {});
  }, []);

  const catMap = Object.fromEntries(categories.map(c => [c.id, c.name]));
  const tradingPurchasesId = categories.find(c => c.name === 'Trading Purchases')?.id;
  const othersCategoryId = categories.find(c => c.name === 'Others')?.id;
  const isTradingPurchases = !!(form.expense_category_id && form.expense_category_id === tradingPurchasesId);

  const resaleItemsByOrder = resaleItems.reduce((acc, item) => {
    if (!acc[item.order_id]) acc[item.order_id] = [];
    acc[item.order_id].push(item);
    return acc;
  }, {});

  const emptyForm = { amount: '', purpose: '', expense_category_id: '', disbursement_method: 'bank_transfer', order_item_id: '', _order_id: '', category_other_note: '', payeeMode: 'existing', supplier_id: '', payee_name: '', payee_bank_name: '', payee_account_number: '', payee_account_name: '', saveAsVendor: false };

  const openEdit = async (req) => {
    const payeeMode = req.supplier_id ? 'existing' : 'new';
    let _order_id = '';
    if (req.order_item_id && req.expense_category_id === tradingPurchasesId) {
      try {
        const { data } = await supabase.from('order_items').select('order_id').eq('id', req.order_item_id).single();
        _order_id = data?.order_id || '';
      } catch {}
      loadResaleItems();
    }
    setForm({
      amount: String(req.amount || ''),
      purpose: req.purpose || '',
      expense_category_id: req.expense_category_id || '',
      disbursement_method: req.disbursement_method || 'bank_transfer',
      category_other_note: req.category_other_note || '',
      order_item_id: req.order_item_id || '',
      _order_id,
      payeeMode,
      supplier_id: req.supplier_id || '',
      payee_name: req.payee_name || '',
      payee_bank_name: req.payee_bank_name || '',
      payee_account_number: req.payee_account_number || '',
      payee_account_name: req.payee_account_name || '',
      saveAsVendor: false,
    });
    setEditTarget(req);
    setShowForm(true);
  };

  const handleCreate = async () => {
    if (!form.amount || !form.purpose)
      return setAlert({ type: 'error', msg: 'Amount and purpose are required.' });
    if (othersCategoryId && form.expense_category_id === othersCategoryId && !form.category_other_note.trim())
      return setAlert({ type: 'error', msg: '"Others" category requires a description — please fill in the note.' });
    if (form.payeeMode === 'existing' && !form.supplier_id)
      return setAlert({ type: 'error', msg: 'Select an existing vendor, or switch to New Payee.' });
    if (form.payeeMode === 'new' && !form.payee_name.trim())
      return setAlert({ type: 'error', msg: 'Payee name is required.' });
    setSaving(true); setAlert(null);
    try {
      let supplierId = form.payeeMode === 'existing' ? form.supplier_id : null;
      if (form.payeeMode === 'new' && form.saveAsVendor) {
        const result = await paymentRequestsService.createSupplierFromPaymentRequest({
          company_name: form.payee_name.trim(),
          bank_name: form.payee_bank_name.trim() || null,
          bank_account_number: form.payee_account_number.trim() || null,
          bank_account_name: form.payee_account_name.trim() || null,
          contact_person: null,
          phone: null,
        });
        supplierId = typeof result === 'string' ? result : (result?.id || null);
      }
      const usePayeeFields = form.payeeMode === 'new' && !supplierId;
      const fields = {
        amount: Number(form.amount),
        purpose: form.purpose.trim(),
        expense_category_id: form.expense_category_id || null,
        disbursement_method: form.disbursement_method || 'bank_transfer',
        category_other_note: form.category_other_note.trim() || null,
        supplier_id: supplierId,
        payee_name: usePayeeFields ? form.payee_name.trim() : null,
        payee_bank_name: usePayeeFields ? (form.payee_bank_name.trim() || null) : null,
        payee_account_number: usePayeeFields ? (form.payee_account_number.trim() || null) : null,
        payee_account_name: usePayeeFields ? (form.payee_account_name.trim() || null) : null,
        order_item_id: form.order_item_id || null,
      };
      if (editTarget) {
        await paymentRequestsService.update(editTarget.id, fields);
        setShowForm(false);
        setEditTarget(null);
        setForm(emptyForm);
        setAlert({ type: 'success', msg: `Request ${editTarget.reference} updated.` });
      } else {
        let req;
        try {
          req = await paymentRequestsService.create(fields);
        } catch (createErr) {
          if (createErr.code === '23505') {
            req = await paymentRequestsService.create(fields);
          } else {
            throw createErr;
          }
        }
        setShowForm(false);
        setForm(emptyForm);
        setAlert({ type: 'success', msg: `Request submitted — Reference: ${req.reference}` });
      }
      load();
    } catch (e) { setAlert({ type: 'error', msg: e.message }); }
    finally { setSaving(false); }
  };

  const handleAction = async (id, action, reason = null) => {
    setActionSaving(true); setAlert(null);
    try {
      await paymentRequestsService.advance(id, action, reason);
      setRecallTarget(null); setRecallReason('');
      setOverrideCloseTarget(null); setOverrideCloseReason('');
      setQueryTarget(null); setQueryReason('');
      await load();
    } catch (e) { setAlert({ type: 'error', msg: e.message }); }
    finally { setActionSaving(false); }
  };

  const handleBackfill = async () => {
    if (!backfillForm.requested_by) return setAlert({ type: 'error', msg: 'Select who this payment was for.' });
    if (!backfillForm.amount || !backfillForm.purpose.trim()) return setAlert({ type: 'error', msg: 'Amount and purpose are required.' });
    if (!backfillForm.transaction_date) return setAlert({ type: 'error', msg: 'Transaction date is required.' });
    if (!backfillForm.note.trim()) return setAlert({ type: 'error', msg: 'Historical note is required.' });
    if (backfillForm.payeeMode === 'existing' && !backfillForm.supplier_id)
      return setAlert({ type: 'error', msg: 'Select an existing vendor, or switch to New Payee.' });
    if (backfillForm.payeeMode === 'new' && !backfillForm.payee_name.trim())
      return setAlert({ type: 'error', msg: 'Payee name is required.' });
    setBackfillSaving(true); setAlert(null);
    try {
      const usePayeeFields = backfillForm.payeeMode === 'new';
      await paymentRequestsService.backfill({
        requested_by: backfillForm.requested_by,
        amount: Number(backfillForm.amount),
        purpose: backfillForm.purpose.trim(),
        transaction_date: backfillForm.transaction_date,
        note: backfillForm.note.trim(),
        expense_category_id: backfillForm.expense_category_id || null,
        disbursement_method: backfillForm.disbursement_method || 'bank_transfer',
        bank_account_id: backfillForm.disbursement_method === 'bank_transfer' ? (backfillForm.bank_account_id || null) : null,
        supplier_id: backfillForm.payeeMode === 'existing' ? (backfillForm.supplier_id || null) : null,
        payee_name: usePayeeFields ? backfillForm.payee_name.trim() : null,
        payee_bank_name: usePayeeFields ? (backfillForm.payee_bank_name.trim() || null) : null,
        payee_account_number: usePayeeFields ? (backfillForm.payee_account_number.trim() || null) : null,
        payee_account_name: usePayeeFields ? (backfillForm.payee_account_name.trim() || null) : null,
      });
      setShowBackfill(false);
      setBackfillForm(emptyBackfillForm);
      setAlert({ type: 'success', msg: 'Historical entry recorded.' });
      await load();
    } catch (e) { setAlert({ type: 'error', msg: e.message }); }
    finally { setBackfillSaving(false); }
  };

  const handleDisburse = async () => {
    if (!disburseAccountId) return;
    setActionSaving(true); setAlert(null);
    try {
      await paymentRequestsService.advance(disburseTarget.id, 'mark_disbursed', null, disburseAccountId);
      setDisburseTarget(null); setDisburseAccountId('');
      await load();
    } catch (e) { setAlert({ type: 'error', msg: e.message }); }
    finally { setActionSaving(false); }
  };

  // Read-back of attachments for the open request. Never leaves a silent blank:
  // failure sets a visible error state (the write-only-blank pattern was the bug).
  const reloadAttachments = async (reqId) => {
    if (!reqId) { setAttachments([]); setAttachError(false); return; }
    setAttachLoading(true); setAttachError(false);
    try {
      setAttachments(await paymentRequestsService.listAttachments(reqId));
    } catch (e) {
      console.error('Failed to load payment-request attachments:', e);
      setAttachError(true);
    } finally {
      setAttachLoading(false);
    }
  };

  // Fetch attachments whenever a request detail is opened.
  useEffect(() => { reloadAttachments(detailReq?.id); setDupConfirm(false); }, [detailReq?.id]);

  const handleUploadAttachment = async (req, force = false) => {
    if (!attachFile) return setAttachAlert({ type: 'error', msg: 'Select a file first.' });
    // Non-blocking duplicate guard: if receipts already exist, make the user
    // consciously confirm rather than blindly re-upload (the root-cause bug).
    if (!force && attachments.length > 0) { setDupConfirm(true); return; }
    setDupConfirm(false);
    setAttachSaving(true); setAttachAlert(null);
    try {
      await paymentRequestsService.uploadAttachment(req.id, attachFile, userId, attachNote.trim() || null);
      setAttachFile(null);
      setAttachNote('');
      setAttachAlert({ type: 'success', msg: 'Receipt uploaded successfully.' });
      await reloadAttachments(req.id); // re-render list immediately so it's visibly confirmed
    } catch (e) { setAttachAlert({ type: 'error', msg: e.message }); }
    finally { setAttachSaving(false); }
  };

  const statusColor = s => ({
    draft:        theme.textMuted,
    ico_approved: theme.accent,
    md_approved:  theme.blue,
    funded:       theme.green,
    disbursed:    theme.green,
    closed:       '#a78bfa',
    recalled:     theme.red,
    cancelled:    theme.red,
    queried:      '#f59e0b',
  }[s] || theme.textMuted);

  const sm = { padding: '4px 10px', fontSize: '11px' };
  const rowActions = (req) => {
    const { id, status, disbursement_method } = req;
    const btns = [];
    if (role === 'ico' && status === 'draft') {
      btns.push(<button key="approve" style={{ ...styles.btn('primary'), ...sm }} onClick={() => handleAction(id, 'ico_approve')} disabled={actionSaving}>✓ Approve</button>);
      btns.push(<button key="recall" style={{ ...styles.btn('danger'), ...sm }} onClick={() => setRecallTarget({ id })}>↩ Recall</button>);
    } else if (role === 'md') {
      if (status === 'ico_approved') {
        btns.push(<button key="approve" style={{ ...styles.btn('primary'), ...sm }} onClick={() => handleAction(id, 'md_approve')} disabled={actionSaving}>✓ Approve</button>);
        btns.push(<button key="recall" style={{ ...styles.btn('danger'), ...sm }} onClick={() => setRecallTarget({ id })}>↩ Recall</button>);
      }
      if (status === 'funded') {
        btns.push(<button key="recall" style={{ ...styles.btn('danger'), ...sm }} onClick={() => setRecallTarget({ id })}>↩ Recall</button>);
      }
    } else if (role === 'accountant') {
      if (status === 'md_approved') {
        btns.push(<button key="fund" style={{ ...styles.btn('primary'), ...sm, background: theme.green, color: '#000' }} onClick={() => handleAction(id, 'mark_funded')} disabled={actionSaving}>↑ Mark Funded</button>);
      }
      if (status === 'funded') {
        btns.push(<button key="disburse" style={{ ...styles.btn('primary'), ...sm }} onClick={() => disbursement_method === 'cash' ? handleAction(id, 'mark_disbursed') : setDisburseTarget({ id })} disabled={actionSaving}>✓ Mark Disbursed</button>);
      }
      if (status === 'disbursed') {
        btns.push(<button key="close" style={{ ...styles.btn('primary'), ...sm, background: '#a78bfa', color: '#000' }} onClick={() => handleAction(id, 'close')} disabled={actionSaving}>✓ Close</button>);
        btns.push(<button key="override-close" style={{ ...styles.btn('secondary'), ...sm }} onClick={() => setOverrideCloseTarget({ id })}>Override Close</button>);
      }
    }
    if (role === 'md' && status === 'disbursed') {
      btns.push(<button key="close" style={{ ...styles.btn('primary'), ...sm, background: '#a78bfa', color: '#000' }} onClick={() => handleAction(id, 'close')} disabled={actionSaving}>✓ Close</button>);
      btns.push(<button key="override-close" style={{ ...styles.btn('secondary'), ...sm }} onClick={() => setOverrideCloseTarget({ id })}>Override Close</button>);
    }
    if (canQuery && status === 'disbursed' && req.transaction_date) {
      btns.push(<button key="query" style={{ ...styles.btn('secondary'), ...sm }} onClick={() => setQueryTarget({ id })}>⚑ Query</button>);
    }
    if (status === 'queried') {
      if (req.requested_by === userId || role === 'md') {
        btns.push(<button key="edit-queried" style={{ ...styles.btn('secondary'), ...sm }} onClick={() => openEdit(req)}>✏ Edit</button>);
        btns.push(<button key="resolve" style={{ ...styles.btn('primary'), ...sm, background: theme.green, color: '#000' }} onClick={() => handleAction(id, 'resolve_query')} disabled={actionSaving}>✓ Resolve</button>);
      }
    }
    return btns;
  };

  const actionQueue = isInitiator
    ? requests
    : role === 'ico'
    ? requests.filter(r => r.status === 'draft')
    : role === 'md'
    ? requests.filter(r => ['ico_approved', 'funded', 'disbursed'].includes(r.status))
    : role === 'accountant'
    ? requests.filter(r => ['md_approved', 'funded', 'disbursed'].includes(r.status))
    : requests;
  const queriedRequests = requests.filter(r => r.status === 'queried' &&
    (['ico', 'accountant', 'md'].includes(role) || r.requested_by === userId));
  const baseQueue = showQueried ? queriedRequests : ((!isInitiator && showHistory) ? requests : actionQueue);
  // Status filter takes precedence over the Action Queue / All / Queried toggle when active
  const queue = statusFilter !== 'all' ? requests.filter(r => r.status === statusFilter) : baseQueue;

  const ALL_STATUSES = ['draft', 'ico_approved', 'md_approved', 'funded', 'disbursed', 'closed', 'queried'];
  const fundedRequests = requests.filter(r => r.status === 'funded');
  const outstandingTotal = fundedRequests.reduce((s, r) => s + Number(r.amount || 0), 0);

  return (
    <div>
      {alert && <Alert msg={alert.msg} type={alert.type} onClose={() => setAlert(null)} />}

      <div style={styles.header}>
        <div>
          <div style={styles.pageTitle}>Payment Requests</div>
          <div style={styles.pageSubtitle}>
            {isInitiator ? 'Submit and track your payment requests' : 'Review and process payment requests'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {!isInitiator && (
            <div style={{ display: 'flex', gap: '4px' }}>
              {[['Action Queue', 'queue'], ['All Requests', 'all'], ...((canQuery || role === 'md') ? [['Queried', 'queried']] : [])].map(([label, val]) => {
                const active = val === 'queried' ? showQueried : (!showQueried && showHistory === (val === 'all'));
                return (
                  <button key={label}
                    style={{ ...styles.btn(active ? 'primary' : 'secondary'), padding: '7px 14px', fontSize: '12px' }}
                    onClick={() => {
                      if (val === 'queried') { setShowQueried(true); setShowHistory(false); }
                      else { setShowQueried(false); setShowHistory(val === 'all'); }
                    }}>
                    {label}
                    {val === 'queried' && queriedRequests.length > 0 && (
                      <span style={{ marginLeft: '5px', background: '#f59e0b', color: '#000', borderRadius: '10px', padding: '1px 5px', fontSize: '10px', fontWeight: '700' }}>{queriedRequests.length}</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
          {canBackfill && (
            <button style={styles.btn(showBackfill ? 'secondary' : 'secondary')} onClick={() => { setShowBackfill(v => !v); setBackfillForm(emptyBackfillForm); setShowForm(false); setEditTarget(null); }}>
              {showBackfill ? '✕ Cancel Backfill' : '+ Backfill Entry'}
            </button>
          )}
          {isInitiator && (
            <button style={styles.btn(showForm ? 'secondary' : 'primary')} onClick={() => { setShowForm(v => !v); setEditTarget(null); setForm(emptyForm); setShowBackfill(false); }}>
              {showForm ? '✕ Cancel' : '+ New Request'}
            </button>
          )}
        </div>
      </div>

      {fundedRequests.length > 0 && (
        <div style={{ ...styles.statCard(theme.green), marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '32px', flexWrap: 'wrap' }}>
          <div>
            <div style={styles.statLabel}>Outstanding Disbursement</div>
            <div style={{ ...styles.statValue, color: theme.green }}>{naira(outstandingTotal)}</div>
            <div style={styles.statSub}>
              {fundedRequests.length} request{fundedRequests.length !== 1 ? 's' : ''} funded but not yet disbursed
              {isInitiator && ' (your requests)'}
            </div>
          </div>
          <div style={{ fontSize: '12px', color: theme.textMuted, maxWidth: '320px' }}>
            Funding has been set aside for {isInitiator ? 'these requests' : 'these requests across all initiators'} — pending final disbursement by the accountant.
          </div>
        </div>
      )}

      {showForm && (isInitiator || editTarget) && (
        <div style={{ ...styles.card, marginBottom: '20px' }}>
          <div style={styles.sectionTitle}>
            {editTarget ? `Edit Request — ${editTarget.reference}` : 'New Payment Request'}
          </div>
          <div style={styles.grid(2)}>
            <div style={styles.formGroup}>
              <label style={styles.label}>Amount (₦) *</label>
              <input style={styles.input} type="number" min="1" placeholder="0"
                value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Disbursement Method</label>
              <select style={styles.input} value={form.disbursement_method}
                onChange={e => setForm(f => ({ ...f, disbursement_method: e.target.value }))}>
                <option value="bank_transfer">Bank Transfer</option>
                <option value="cash">Cash</option>
              </select>
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Purpose *</label>
              <input style={styles.input} placeholder="Brief description of the payment purpose…"
                value={form.purpose} onChange={e => setForm(f => ({ ...f, purpose: e.target.value }))} />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Expense Category (optional)</label>
              <select style={styles.input} value={form.expense_category_id}
                onChange={e => {
                  const val = e.target.value;
                  setForm(f => ({ ...f, expense_category_id: val, order_item_id: '', _order_id: '' }));
                  if (role === 'bdm' && tradingPurchasesId && val === tradingPurchasesId) loadResaleItems();
                }}>
                <option value="">— None —</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>
          {othersCategoryId && form.expense_category_id === othersCategoryId && (
            <div style={{ marginTop: '4px', marginBottom: '4px' }}>
              <label style={styles.label}>Please describe (required) <span style={{ fontWeight: 400, color: theme.textMuted }}>— what are these "Others" expenses?</span></label>
              <input style={styles.input} placeholder="e.g. Stationery, miscellaneous office supplies…"
                value={form.category_other_note}
                onChange={e => setForm(f => ({ ...f, category_other_note: e.target.value }))} />
            </div>
          )}
          {role === 'bdm' && isTradingPurchases && (
            <div style={{ padding: '12px', marginTop: '4px', marginBottom: '4px', background: theme.surface, borderRadius: '8px', border: `1px solid ${theme.blue}33` }}>
              <div style={{ fontSize: '11px', fontWeight: '700', color: theme.textMuted, marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Link to Order Item (optional)
              </div>
              {resaleItemsLoading ? (
                <div style={{ fontSize: '12px', color: theme.textMuted }}>Loading resale orders…</div>
              ) : Object.keys(resaleOrderMap).length === 0 ? (
                <div style={{ fontSize: '12px', color: theme.textMuted }}>No resale-type order items found.</div>
              ) : (
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  <div style={styles.formGroup}>
                    <label style={styles.label}>Order</label>
                    <select style={{ ...styles.input, minWidth: '220px' }} value={form._order_id}
                      onChange={e => setForm(f => ({ ...f, _order_id: e.target.value, order_item_id: '' }))}>
                      <option value="">— None —</option>
                      {Object.entries(resaleOrderMap).map(([id, o]) => (
                        <option key={id} value={id}>
                          {o.customer?.name || '—'} · {o.created_at ? new Date(o.created_at).toLocaleDateString('en-GB') : '—'}
                        </option>
                      ))}
                    </select>
                  </div>
                  {form._order_id && (
                    <div style={styles.formGroup}>
                      <label style={styles.label}>Order Item</label>
                      <select style={{ ...styles.input, minWidth: '260px' }} value={form.order_item_id}
                        onChange={e => setForm(f => ({ ...f, order_item_id: e.target.value }))}>
                        <option value="">— Select item —</option>
                        {(resaleItemsByOrder[form._order_id] || []).map(item => (
                          <option key={item.id} value={item.id}>
                            {item.block_type} × {fmt(item.quantity)}{item.cost_basis != null ? ` · cost ${naira(item.cost_basis)}` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
          <div style={{ marginTop: '16px', padding: '14px', background: theme.surface, borderRadius: '8px', border: `1px solid ${theme.border}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <div style={{ fontSize: '12px', fontWeight: '700', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Payee *</div>
              <div style={{ display: 'flex', gap: '4px' }}>
                {['existing', 'new'].map(m => (
                  <button key={m} type="button"
                    style={{ ...styles.btn(form.payeeMode === m ? 'primary' : 'secondary'), padding: '5px 12px', fontSize: '12px' }}
                    onClick={() => setForm(f => ({ ...f, payeeMode: m, supplier_id: '', payee_name: '', payee_bank_name: '', payee_account_number: '', payee_account_name: '', saveAsVendor: false }))}>
                    {m === 'existing' ? 'Existing Vendor' : 'New Payee'}
                  </button>
                ))}
              </div>
            </div>
            {form.payeeMode === 'existing' ? (
              <div style={styles.formGroup}>
                <label style={styles.label}>Vendor</label>
                <select style={styles.input} value={form.supplier_id}
                  onChange={e => setForm(f => ({ ...f, supplier_id: e.target.value }))}>
                  <option value="">— Select vendor —</option>
                  {activeSuppliers.map(s => <option key={s.id} value={s.id}>{s.company_name}</option>)}
                </select>
                {activeSuppliers.length === 0 && (
                  <div style={{ fontSize: '11px', color: theme.textMuted, marginTop: '4px' }}>No active vendors on record — switch to New Payee.</div>
                )}
              </div>
            ) : (
              <div>
                <div style={styles.grid(2)}>
                  <div style={styles.formGroup}>
                    <label style={styles.label}>Payee name *</label>
                    <input style={styles.input} placeholder="Person or business name"
                      value={form.payee_name} onChange={e => setForm(f => ({ ...f, payee_name: e.target.value }))} />
                  </div>
                  <div style={styles.formGroup}>
                    <label style={styles.label}>Bank name</label>
                    <input style={styles.input} placeholder="e.g. First Bank"
                      value={form.payee_bank_name} onChange={e => setForm(f => ({ ...f, payee_bank_name: e.target.value }))} />
                  </div>
                  <div style={styles.formGroup}>
                    <label style={styles.label}>Account number</label>
                    <input style={styles.input} placeholder="10-digit account number"
                      value={form.payee_account_number} onChange={e => setForm(f => ({ ...f, payee_account_number: e.target.value }))} />
                  </div>
                  <div style={styles.formGroup}>
                    <label style={styles.label}>Account name</label>
                    <input style={styles.input} placeholder="Name on account"
                      value={form.payee_account_name} onChange={e => setForm(f => ({ ...f, payee_account_name: e.target.value }))} />
                  </div>
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', marginTop: '4px', color: theme.text }}>
                  <input type="checkbox" checked={form.saveAsVendor}
                    onChange={e => setForm(f => ({ ...f, saveAsVendor: e.target.checked }))} />
                  Save as vendor for next time
                  {form.saveAsVendor && <span style={{ fontSize: '11px', color: theme.textMuted }}>(will appear in Pending Vendors for verification)</span>}
                </label>
              </div>
            )}
          </div>
          <button style={{ ...styles.btn('primary'), marginTop: '12px' }} onClick={handleCreate} disabled={saving}>
            {saving ? (editTarget ? 'Saving…' : 'Submitting…') : (editTarget ? 'Save Changes' : 'Submit Request')}
          </button>
        </div>
      )}

      {showBackfill && canBackfill && (
        <div style={{ ...styles.card, marginBottom: '20px', border: `1px solid #f59e0b` }}>
          <div style={styles.sectionTitle}>Backfill Historical Entry <span style={{ fontSize: '12px', fontWeight: 400, color: '#f59e0b' }}>— lands directly in Disbursed</span></div>
          <div style={styles.grid(2)}>
            <div style={styles.formGroup}>
              <label style={styles.label}>On behalf of (who was paid) *</label>
              <select style={styles.input} value={backfillForm.requested_by}
                onChange={e => setBackfillForm(f => ({ ...f, requested_by: e.target.value }))}>
                <option value="">— Select staff member —</option>
                {allUsers.map(u => <option key={u.id} value={u.id}>{u.full_name}{u.role ? ` (${u.role})` : ''}</option>)}
              </select>
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Transaction Date *</label>
              <input style={styles.input} type="date" max={new Date().toISOString().split('T')[0]}
                value={backfillForm.transaction_date}
                onChange={e => setBackfillForm(f => ({ ...f, transaction_date: e.target.value }))} />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Amount (₦) *</label>
              <input style={styles.input} type="number" min="1" placeholder="0"
                value={backfillForm.amount}
                onChange={e => setBackfillForm(f => ({ ...f, amount: e.target.value }))} />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Purpose *</label>
              <input style={styles.input} placeholder="Brief description of the payment purpose…"
                value={backfillForm.purpose}
                onChange={e => setBackfillForm(f => ({ ...f, purpose: e.target.value }))} />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Expense Category (optional)</label>
              <select style={styles.input} value={backfillForm.expense_category_id}
                onChange={e => setBackfillForm(f => ({ ...f, expense_category_id: e.target.value }))}>
                <option value="">— None —</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Disbursement Method</label>
              <select style={styles.input} value={backfillForm.disbursement_method}
                onChange={e => setBackfillForm(f => ({ ...f, disbursement_method: e.target.value }))}>
                <option value="bank_transfer">Bank Transfer</option>
                <option value="cash">Cash</option>
              </select>
            </div>
            {backfillForm.disbursement_method === 'bank_transfer' && (
              <div style={styles.formGroup}>
                <label style={styles.label}>Source Bank Account</label>
                <select style={styles.input} value={backfillForm.bank_account_id}
                  onChange={e => setBackfillForm(f => ({ ...f, bank_account_id: e.target.value }))}>
                  <option value="">— Select account —</option>
                  {bankAccounts.map(a => <option key={a.id} value={a.id}>{a.bank_name} — {a.account_number}</option>)}
                </select>
              </div>
            )}
          </div>
          <div style={{ marginTop: '12px' }}>
            <label style={styles.label}>Historical Note * <span style={{ fontWeight: 400, color: theme.textMuted }}>— e.g. "WhatsApp approval, 2026-07-04"</span></label>
            <textarea style={{ ...styles.input, height: '64px', resize: 'vertical' }}
              placeholder="Describe how this disbursement was originally authorised…"
              value={backfillForm.note}
              onChange={e => setBackfillForm(f => ({ ...f, note: e.target.value }))} />
          </div>
          <div style={{ marginTop: '14px', padding: '14px', background: theme.surface, borderRadius: '8px', border: `1px solid ${theme.border}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <div style={{ fontSize: '12px', fontWeight: '700', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Payee *</div>
              <div style={{ display: 'flex', gap: '4px' }}>
                {['existing', 'new'].map(m => (
                  <button key={m} type="button"
                    style={{ ...styles.btn(backfillForm.payeeMode === m ? 'primary' : 'secondary'), padding: '5px 12px', fontSize: '12px' }}
                    onClick={() => setBackfillForm(f => ({ ...f, payeeMode: m, supplier_id: '', payee_name: '', payee_bank_name: '', payee_account_number: '', payee_account_name: '' }))}>
                    {m === 'existing' ? 'Existing Vendor' : 'New Payee'}
                  </button>
                ))}
              </div>
            </div>
            {backfillForm.payeeMode === 'existing' ? (
              <div style={styles.formGroup}>
                <label style={styles.label}>Vendor</label>
                <select style={styles.input} value={backfillForm.supplier_id}
                  onChange={e => setBackfillForm(f => ({ ...f, supplier_id: e.target.value }))}>
                  <option value="">— Select vendor —</option>
                  {activeSuppliers.map(s => <option key={s.id} value={s.id}>{s.company_name}</option>)}
                </select>
                {activeSuppliers.length === 0 && (
                  <div style={{ fontSize: '11px', color: theme.textMuted, marginTop: '4px' }}>No active vendors — switch to New Payee.</div>
                )}
              </div>
            ) : (
              <div style={styles.grid(2)}>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Payee name *</label>
                  <input style={styles.input} placeholder="Person or business name"
                    value={backfillForm.payee_name}
                    onChange={e => setBackfillForm(f => ({ ...f, payee_name: e.target.value }))} />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Bank name</label>
                  <input style={styles.input} placeholder="e.g. First Bank"
                    value={backfillForm.payee_bank_name}
                    onChange={e => setBackfillForm(f => ({ ...f, payee_bank_name: e.target.value }))} />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Account number</label>
                  <input style={styles.input} placeholder="10-digit account number"
                    value={backfillForm.payee_account_number}
                    onChange={e => setBackfillForm(f => ({ ...f, payee_account_number: e.target.value }))} />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Account name</label>
                  <input style={styles.input} placeholder="Name on account"
                    value={backfillForm.payee_account_name}
                    onChange={e => setBackfillForm(f => ({ ...f, payee_account_name: e.target.value }))} />
                </div>
              </div>
            )}
          </div>
          <button style={{ ...styles.btn('primary'), marginTop: '14px', background: '#f59e0b', color: '#000' }} onClick={handleBackfill} disabled={backfillSaving}>
            {backfillSaving ? 'Recording…' : 'Record Historical Entry'}
          </button>
        </div>
      )}

      {recallTarget && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ ...styles.card, width: '420px' }}>
            <div style={{ ...styles.sectionTitle, marginBottom: '12px' }}>Recall Request — Reason Required</div>
            <textarea
              style={{ ...styles.input, height: '80px', resize: 'vertical' }}
              placeholder="Enter reason for recall…"
              value={recallReason}
              onChange={e => setRecallReason(e.target.value)}
            />
            <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
              <button style={styles.btn('danger')} disabled={!recallReason.trim() || actionSaving}
                onClick={() => handleAction(recallTarget.id, 'recall', recallReason.trim())}>
                {actionSaving ? 'Saving…' : 'Confirm Recall'}
              </button>
              <button style={styles.btn('secondary')} onClick={() => { setRecallTarget(null); setRecallReason(''); }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {overrideCloseTarget && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ ...styles.card, width: '420px' }}>
            <div style={{ ...styles.sectionTitle, marginBottom: '12px' }}>Override Close — Reason Required</div>
            <textarea
              style={{ ...styles.input, height: '80px', resize: 'vertical' }}
              placeholder="Enter reason for override close…"
              value={overrideCloseReason}
              onChange={e => setOverrideCloseReason(e.target.value)}
            />
            <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
              <button style={{ ...styles.btn('primary'), background: '#a78bfa', color: '#000' }} disabled={!overrideCloseReason.trim() || actionSaving}
                onClick={() => handleAction(overrideCloseTarget.id, 'override_close', overrideCloseReason.trim())}>
                {actionSaving ? 'Saving…' : 'Confirm Override Close'}
              </button>
              <button style={styles.btn('secondary')} onClick={() => { setOverrideCloseTarget(null); setOverrideCloseReason(''); }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {disburseTarget && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ ...styles.card, width: '420px' }}>
            <div style={{ ...styles.sectionTitle, marginBottom: '12px' }}>Mark Disbursed — Select Source Account</div>
            <select style={styles.input} value={disburseAccountId} onChange={e => setDisburseAccountId(e.target.value)}>
              <option value="">— Select source bank account —</option>
              {bankAccounts.map(a => <option key={a.id} value={a.id}>{a.bank_name} — {a.account_number}</option>)}
            </select>
            <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
              <button style={styles.btn('primary')} disabled={!disburseAccountId || actionSaving} onClick={handleDisburse}>
                {actionSaving ? 'Saving…' : 'Confirm Disbursement'}
              </button>
              <button style={styles.btn('secondary')} onClick={() => { setDisburseTarget(null); setDisburseAccountId(''); }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {queryTarget && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ ...styles.card, width: '420px' }}>
            <div style={{ ...styles.sectionTitle, marginBottom: '12px' }}>Query Entry — Reason Required</div>
            <textarea
              style={{ ...styles.input, height: '80px', resize: 'vertical' }}
              placeholder="Describe what needs to be corrected…"
              value={queryReason}
              onChange={e => setQueryReason(e.target.value)}
            />
            <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
              <button style={{ ...styles.btn('danger') }} disabled={!queryReason.trim() || actionSaving}
                onClick={() => handleAction(queryTarget.id, 'query', queryReason.trim())}>
                {actionSaving ? 'Saving…' : 'Submit Query'}
              </button>
              <button style={styles.btn('secondary')} onClick={() => { setQueryTarget(null); setQueryReason(''); }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {detailReq && (() => {
        const req = detailReq;
        const bankName = req.supplier_id ? req.supplier?.bank_name : req.payee_bank_name;
        const acctNum  = req.supplier_id ? req.supplier?.bank_account_number : req.payee_account_number;
        const acctName = req.supplier_id ? req.supplier?.bank_account_name : req.payee_account_name;
        const payeeName = req.supplier?.company_name || req.payee_name;
        const copyAcct = async () => {
          if (!acctNum) return;
          try { await navigator.clipboard.writeText(acctNum); setCopiedField('acct'); setTimeout(() => setCopiedField(null), 2000); } catch {}
        };
        const cat = categories.find(c => c.id === req.expense_category_id);
        const closureMechanism = cat?.closure_mechanism;
        const CLOSURE_LABELS = { stock_movements: 'Stock records', vehicle_maintenance: 'Vehicle Maintenance records', vehicle_fuel_log: 'Vehicle Fuel records', truck_loading_log: 'Loading records', external_haulage_log: 'Haulage records' };
        const canUploadEvidence = closureMechanism === 'receipt' && (isInitiator || ['md', 'accountant'].includes(role));
        const closureLabel = closureMechanism && closureMechanism !== 'receipt' ? CLOSURE_LABELS[closureMechanism] : null;
        const DL = ({ label, value, mono }) => value ? (
          <div style={{ marginBottom: '12px' }}>
            <div style={{ fontSize: '11px', fontWeight: '700', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '3px' }}>{label}</div>
            <div style={{ fontSize: '13px', color: theme.text, fontFamily: mono ? 'monospace' : undefined }}>{value}</div>
          </div>
        ) : null;
        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
            <div style={{ ...styles.card, width: '500px', maxWidth: '94vw', maxHeight: '90vh', overflowY: 'auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '18px' }}>
                <div>
                  <div style={{ fontFamily: 'monospace', fontSize: '13px', fontWeight: '700', color: theme.accent }}>{req.reference}</div>
                  <div style={{ fontSize: '20px', fontWeight: '700', color: theme.text, marginTop: '2px' }}>{naira(req.amount)}</div>
                </div>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <span style={styles.badge(statusColor(req.status))}>{req.status}</span>
                  <button style={{ ...styles.btn('secondary'), padding: '5px 10px' }} onClick={() => { setDetailReq(null); setAttachFile(null); setAttachNote(''); setAttachAlert(null); }}>✕</button>
                </div>
              </div>
              <div style={{ borderTop: `1px solid ${theme.border}`, paddingTop: '16px' }}>
                <DL label="Purpose" value={req.purpose} />
                <DL label="Category" value={req.expense_category_id ? catMap[req.expense_category_id] : null} />
                {req.category_other_note && <DL label="Category note" value={req.category_other_note} />}
                <DL label="Disbursement method" value={req.disbursement_method === 'bank_transfer' ? 'Bank Transfer' : req.disbursement_method === 'cash' ? 'Cash' : req.disbursement_method} />
                {req.transaction_date && <DL label="Transaction Date (Historical)" value={new Date(req.transaction_date).toLocaleDateString('en-GB')} />}
              </div>
              <div style={{ borderTop: `1px solid ${theme.border}`, paddingTop: '16px', marginTop: '4px' }}>
                <div style={{ fontSize: '11px', fontWeight: '700', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '12px' }}>Payee / Bank Details</div>
                <DL label="Payee" value={payeeName} />
                <DL label="Bank" value={bankName} />
                {acctNum ? (
                  <div style={{ marginBottom: '12px' }}>
                    <div style={{ fontSize: '11px', fontWeight: '700', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '3px' }}>Account Number</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontFamily: 'monospace', fontSize: '15px', fontWeight: '600', color: theme.text, letterSpacing: '0.05em' }}>{acctNum}</span>
                      <button
                        style={{ ...styles.btn(copiedField === 'acct' ? 'primary' : 'secondary'), padding: '3px 10px', fontSize: '11px' }}
                        onClick={copyAcct}>
                        {copiedField === 'acct' ? '✓ Copied' : 'Copy'}
                      </button>
                    </div>
                  </div>
                ) : null}
                <DL label="Account Name" value={acctName} />
                {!payeeName && !bankName && !acctNum && !acctName && (
                  <div style={{ fontSize: '13px', color: theme.textMuted }}>No payee details recorded.</div>
                )}
              </div>
              {!isInitiator && req.requester?.full_name && (
                <div style={{ borderTop: `1px solid ${theme.border}`, paddingTop: '16px', marginTop: '4px' }}>
                  <DL label="Requested by" value={req.requester.full_name} />
                  <DL label="Date" value={req.created_at ? new Date(req.created_at).toLocaleDateString('en-GB') : null} />
                </div>
              )}
              {(canUploadEvidence || attachments.length > 0) && (
                <div style={{ borderTop: `1px solid ${theme.border}`, paddingTop: '16px', marginTop: '4px' }}>
                  <div style={{ fontSize: '11px', fontWeight: '700', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '10px' }}>
                    Receipts{!attachLoading && !attachError ? ` (${attachments.length})` : ''}
                  </div>
                  {attachLoading ? (
                    <div style={{ fontSize: '13px', color: theme.textMuted }}>Loading receipts…</div>
                  ) : attachError ? (
                    <div style={{ fontSize: '13px', color: theme.red }}>
                      Couldn&rsquo;t load receipts.
                      <button style={{ ...styles.btn('secondary'), padding: '2px 8px', fontSize: '11px', marginLeft: '8px' }} onClick={() => reloadAttachments(req.id)}>Retry</button>
                    </div>
                  ) : attachments.length === 0 ? (
                    <div style={{ fontSize: '13px', color: theme.textMuted }}>No receipts attached yet</div>
                  ) : (
                    attachments.map(a => <PaymentRequestAttachmentRow key={a.id} att={a} />)
                  )}
                </div>
              )}
              {(canUploadEvidence || closureLabel) && (
                <div style={{ borderTop: `1px solid ${theme.border}`, paddingTop: '16px', marginTop: '4px' }}>
                  <div style={{ fontSize: '11px', fontWeight: '700', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '12px' }}>Closure Evidence</div>
                  {closureLabel && (
                    <div style={{ fontSize: '13px', color: theme.textMuted }}>Evidence is recorded in {closureLabel}.</div>
                  )}
                  {canUploadEvidence && (
                    <div>
                      {attachAlert && (
                        <div style={{ ...styles.alert(attachAlert.type), marginBottom: '10px' }}>
                          <span>{attachAlert.msg}</span>
                          <span style={{ cursor: 'pointer' }} onClick={() => setAttachAlert(null)}>✕</span>
                        </div>
                      )}
                      <div style={styles.formGroup}>
                        <label style={styles.label}>Receipt / Supporting Document</label>
                        <input type="file" style={{ ...styles.input, padding: '6px' }}
                          onChange={e => setAttachFile(e.target.files?.[0] || null)} />
                      </div>
                      <div style={styles.formGroup}>
                        <label style={styles.label}>Note (optional)</label>
                        <input style={styles.input} placeholder="e.g. Official receipt for delivery…"
                          value={attachNote} onChange={e => setAttachNote(e.target.value)} />
                      </div>
                      {dupConfirm ? (
                        <div style={{ padding: '10px 12px', borderRadius: '8px', background: theme.accent + '18', border: `1px solid ${theme.accent}55` }}>
                          <div style={{ fontSize: '12px', color: theme.text, marginBottom: '8px' }}>
                            This request already has {attachments.length} receipt{attachments.length === 1 ? '' : 's'} attached (listed above). Upload another anyway?
                          </div>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button style={{ ...styles.btn('primary'), background: '#a78bfa', color: '#000', padding: '6px 12px', fontSize: '12px' }}
                              disabled={attachSaving} onClick={() => handleUploadAttachment(req, true)}>
                              {attachSaving ? 'Uploading…' : 'Upload anyway'}
                            </button>
                            <button style={{ ...styles.btn('secondary'), padding: '6px 12px', fontSize: '12px' }}
                              disabled={attachSaving} onClick={() => setDupConfirm(false)}>Cancel</button>
                          </div>
                        </div>
                      ) : (
                        <button style={{ ...styles.btn('primary'), background: '#a78bfa', color: '#000' }}
                          disabled={!attachFile || attachSaving}
                          onClick={() => handleUploadAttachment(req)}>
                          {attachSaving ? 'Uploading…' : 'Upload Receipt'}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })()}

      <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '11px', fontWeight: '700', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', marginRight: '4px' }}>Filter:</span>
        {['all', ...ALL_STATUSES].map(s => (
          <button key={s}
            style={{ ...styles.btn(statusFilter === s ? 'primary' : 'secondary'), padding: '5px 11px', fontSize: '11px', fontWeight: '600' }}
            onClick={() => setStatusFilter(s)}>
            {s === 'all' ? 'All' : s.replace(/_/g, ' ')}
            {s !== 'all' && requests.filter(r => r.status === s).length > 0 && (
              <span style={{ marginLeft: '5px', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', padding: '0 5px', fontSize: '10px' }}>
                {requests.filter(r => r.status === s).length}
              </span>
            )}
          </button>
        ))}
      </div>

      <div style={styles.card}>
        {loading ? <Spinner /> : queue.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '30px', color: theme.textMuted }}>
            {statusFilter !== 'all' ? `No ${statusFilter.replace(/_/g, ' ')} requests.` : isInitiator ? 'No payment requests yet.' : showHistory ? 'No payment requests found.' : 'No requests pending in this queue.'}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={styles.table}>
              <thead>
                <tr>
                  {['Reference', 'Amount', 'Purpose', 'Category', 'Method', 'Payee',
                    ...(!isInitiator ? ['Requested By'] : []),
                    'Status', 'Date', 'Actions'].map(h => (
                    <th key={h} style={styles.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {queue.map(req => {
                  const actions = rowActions(req);
                  return (
                    <tr key={req.id}>
                      <td style={styles.td}><strong style={{ fontFamily: 'monospace', fontSize: '12px' }}>{req.reference}</strong></td>
                      <td style={styles.td}><strong style={{ color: theme.accent }}>{naira(req.amount)}</strong></td>
                      <td style={styles.td}>{req.purpose || '—'}</td>
                      <td style={styles.td}>{req.expense_category_id ? (catMap[req.expense_category_id] || '—') : <span style={{ color: theme.textMuted }}>—</span>}</td>
                      <td style={styles.td}>{req.disbursement_method === 'bank_transfer' ? 'Bank Transfer' : 'Cash'}</td>
                      <td style={styles.td}>{req.supplier?.company_name || req.payee_name || <span style={{ color: theme.textMuted }}>—</span>}</td>
                      {!isInitiator && <td style={styles.td}>{req.requester?.full_name || '—'}</td>}
                      <td style={styles.td}>
                        <span style={styles.badge(statusColor(req.status))}>{req.status}</span>
                        {req.transaction_date && <span style={{ ...styles.badge('#f59e0b'), marginLeft: '4px', fontSize: '10px', color: '#000' }}>Historical</span>}
                      </td>
                      <td style={styles.td}>{req.transaction_date ? new Date(req.transaction_date).toLocaleDateString('en-GB') : req.created_at ? new Date(req.created_at).toLocaleDateString('en-GB') : '—'}</td>
                      <td style={styles.td}>
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                          <button style={{ ...styles.btn('secondary'), ...sm }} onClick={() => setDetailReq(req)}>View</button>
                          {isInitiator && req.status === 'draft' && (
                            <button style={{ ...styles.btn('secondary'), ...sm }} onClick={() => openEdit(req)}>✏ Edit</button>
                          )}
                          {actions}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {canReviewVendors && (
        <div style={{ ...styles.card, marginTop: '20px' }}>
          <div style={styles.sectionTitle}>
            Pending Vendors
            {pendingVendors.length > 0 && <span style={{ fontSize: '12px', fontWeight: 400, color: theme.textMuted, marginLeft: '8px' }}>({pendingVendors.length})</span>}
          </div>
          {pendingVendors.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '20px', color: theme.textMuted, fontSize: '13px' }}>No vendors pending verification.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    {['Company', 'Bank', 'Account No.', 'Account Name', 'Submitted', 'Action'].map(h => (
                      <th key={h} style={styles.th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pendingVendors.map(v => (
                    <tr key={v.id}>
                      <td style={styles.td}><strong>{v.company_name}</strong></td>
                      <td style={styles.td}>{v.bank_name || '—'}</td>
                      <td style={styles.td}><span style={{ fontFamily: 'monospace', fontSize: '12px' }}>{v.bank_account_number || '—'}</span></td>
                      <td style={styles.td}>{v.bank_account_name || '—'}</td>
                      <td style={styles.td}>{v.created_at ? new Date(v.created_at).toLocaleDateString('en-GB') : '—'}</td>
                      <td style={styles.td}>
                        <button
                          style={{ ...styles.btn('primary'), ...sm, background: theme.green, color: '#000' }}
                          disabled={vendorSaving === v.id}
                          onClick={async () => {
                            setVendorSaving(v.id);
                            try {
                              await paymentRequestsService.approveVendor(v.id);
                              setPendingVendors(pv => pv.filter(p => p.id !== v.id));
                              setAlert({ type: 'success', msg: `${v.company_name} approved as active vendor.` });
                            } catch (e) { setAlert({ type: 'error', msg: e.message }); }
                            finally { setVendorSaving(null); }
                          }}>
                          {vendorSaving === v.id ? '…' : '✓ Approve'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ── LEAVE ─────────────────────────────────────────────────────
const LEAVE_TYPES = ['annual','sick','unpaid','compassionate','maternity'];

const DISC_TYPES = [
  { id: 'formal_query',        label: 'Formal Query' },
  { id: 'verbal_warning_log',  label: 'Verbal Warning (Log)' },
  { id: 'written_warning',     label: 'Written Warning' },
];

const DISC_SANCTIONS = [
  { id: 'none',           label: 'No further action' },
  { id: 'verbal_warning', label: 'Verbal warning' },
  { id: 'written_warning',label: 'Written warning' },
  { id: 'final_warning',  label: 'Final written warning' },
  { id: 'termination',    label: 'Termination' },
];
const calcLeaveDays = (start, end) => {
  if (!start || !end) return '';
  const diff = Math.round((new Date(end) - new Date(start)) / 86400000) + 1;
  return diff > 0 ? String(diff) : '';
};

const LeavePage = ({ userProfile }) => {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [alert, setAlert] = useState(null);
  const [actionSaving, setActionSaving] = useState(false);
  const [staffList, setStaffList] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ staff_id: '', leave_type: 'annual', is_paid: true, start_date: '', end_date: '', days: '', reason: '' });
  const [saving, setSaving] = useState(false);
  const [modalTarget, setModalTarget] = useState(null);
  const [modalReason, setModalReason] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const [reqs, staff] = await Promise.all([
        leaveService.list(),
        staffService.getPublicActive(),
      ]);
      setRequests(reqs);
      setStaffList(staff);
    } catch (e) { setAlert({ type: 'error', msg: e.message }); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const setFormField = (field, value) => {
    setForm(f => {
      const next = { ...f, [field]: value };
      if (field === 'start_date' || field === 'end_date') {
        const auto = calcLeaveDays(next.start_date, next.end_date);
        if (auto) next.days = auto;
      }
      return next;
    });
  };

  const handleCreate = async () => {
    if (!form.staff_id || !form.leave_type || !form.start_date || !form.end_date || !form.days)
      return setAlert({ type: 'error', msg: 'Staff, type, dates, and days are required.' });
    setSaving(true); setAlert(null);
    try {
      await leaveService.create({
        staff_id: form.staff_id,
        leave_type: form.leave_type,
        is_paid: form.is_paid,
        start_date: form.start_date,
        end_date: form.end_date,
        days: Number(form.days),
        reason: form.reason,
        requested_by: userProfile?.full_name || 'Admin',
      });
      setForm({ staff_id: '', leave_type: 'annual', is_paid: true, start_date: '', end_date: '', days: '', reason: '' });
      setShowForm(false);
      setAlert({ type: 'success', msg: 'Leave request recorded.' });
      load();
    } catch (e) { setAlert({ type: 'error', msg: e.message }); }
    finally { setSaving(false); }
  };

  const handleAction = async (id, action, reason = null) => {
    setActionSaving(true); setAlert(null);
    try {
      await leaveService.advance(id, action, reason);
      setModalTarget(null); setModalReason('');
      await load();
    } catch (e) { setAlert({ type: 'error', msg: e.message }); }
    finally { setActionSaving(false); }
  };

  const role = userProfile?.role;
  const canRecord = hasRole(userProfile, 'hr_officer', 'md');
  const leaveStatusColor = s =>
    s === 'md_approved' ? theme.green :
    s === 'ico_approved' ? theme.blue :
    (s === 'rejected' || s === 'cancelled') ? theme.red :
    theme.textMuted;

  return (
    <div>
      {alert && <Alert msg={alert.msg} type={alert.type} onClose={() => setAlert(null)} />}
      <div style={styles.header}>
        <div>
          <div style={styles.pageTitle}>Leave Requests</div>
          <div style={styles.pageSubtitle}>Record and approve staff leave</div>
        </div>
        {canRecord && (
          <button style={styles.btn('primary')} onClick={() => setShowForm(v => !v)}>
            {showForm ? '✕ Cancel' : '+ New Request'}
          </button>
        )}
      </div>

      {showForm && (
        <div style={{ ...styles.card, marginBottom: '20px' }}>
          <div style={styles.sectionTitle}>New Leave Request</div>
          <div style={styles.grid(3)}>
            <div style={styles.formGroup}>
              <label style={styles.label}>Staff Member</label>
              <select style={styles.input} value={form.staff_id} onChange={e => setFormField('staff_id', e.target.value)}>
                <option value="">Select staff…</option>
                {staffList.map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}
              </select>
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Leave Type</label>
              <select style={styles.input} value={form.leave_type} onChange={e => setFormField('leave_type', e.target.value)}>
                {LEAVE_TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
              </select>
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Paid Leave?</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingTop: '10px' }}>
                <input type="checkbox" id="is_paid" checked={form.is_paid} onChange={e => setFormField('is_paid', e.target.checked)} style={{ width: '16px', height: '16px', accentColor: theme.accent }} />
                <label htmlFor="is_paid" style={{ ...styles.label, marginBottom: 0, cursor: 'pointer' }}>Yes — paid leave</label>
              </div>
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Start Date</label>
              <input type="date" style={styles.input} value={form.start_date} onChange={e => setFormField('start_date', e.target.value)} />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>End Date</label>
              <input type="date" style={styles.input} value={form.end_date} onChange={e => setFormField('end_date', e.target.value)} />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Days</label>
              <input type="number" min="1" style={styles.input} value={form.days} onChange={e => setFormField('days', e.target.value)} placeholder="Auto-filled from dates" />
            </div>
          </div>
          <div style={styles.formGroup}>
            <label style={styles.label}>Reason</label>
            <input style={styles.input} placeholder="Reason for leave…" value={form.reason} onChange={e => setFormField('reason', e.target.value)} />
          </div>
          <button style={styles.btn('primary')} onClick={handleCreate} disabled={saving}>{saving ? 'Saving…' : 'Submit Request'}</button>
        </div>
      )}

      {modalTarget && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ ...styles.card, width: '420px' }}>
            <div style={{ ...styles.sectionTitle, marginBottom: '12px' }}>
              {modalTarget.action === 'reject' ? 'Reject' : 'Cancel'} Leave — Reason Required
            </div>
            <textarea
              style={{ ...styles.input, height: '80px', resize: 'vertical' }}
              placeholder="Enter reason…"
              value={modalReason}
              onChange={e => setModalReason(e.target.value)}
            />
            <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
              <button
                style={styles.btn('danger')}
                disabled={!modalReason.trim() || actionSaving}
                onClick={() => handleAction(modalTarget.id, modalTarget.action, modalReason.trim())}
              >{actionSaving ? 'Saving…' : modalTarget.action === 'reject' ? 'Reject' : 'Cancel Leave'}</button>
              <button style={styles.btn('secondary')} onClick={() => { setModalTarget(null); setModalReason(''); }}>Back</button>
            </div>
          </div>
        </div>
      )}

      <div style={styles.card}>
        {loading ? <Spinner /> : requests.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '30px', color: theme.textMuted }}>No leave requests yet.</div>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                {['Staff','Type','Paid?','Start','End','Days','Reason','Status','Actions'].map(h => (
                  <th key={h} style={styles.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {requests.map(req => {
                const status = req.status;
                const actions = [];
                if (status === 'requested' && role === 'ico')
                  actions.push(<button key="ico" style={{ ...styles.btn('primary'), padding: '4px 10px', fontSize: '11px' }} onClick={() => handleAction(req.id, 'ico_approve')} disabled={actionSaving}>✓ ICO Approve</button>);
                if (status === 'ico_approved' && role === 'md')
                  actions.push(<button key="md" style={{ ...styles.btn('primary'), padding: '4px 10px', fontSize: '11px' }} onClick={() => handleAction(req.id, 'md_approve')} disabled={actionSaving}>✓ MD Approve</button>);
                if (['requested','ico_approved'].includes(status) && ['ico','md'].includes(role))
                  actions.push(<button key="reject" style={{ ...styles.btn('danger'), padding: '4px 10px', fontSize: '11px' }} onClick={() => setModalTarget({ id: req.id, action: 'reject' })}>✕ Reject</button>);
                if (['requested','ico_approved','md_approved'].includes(status) && ['hr_officer','md'].includes(role))
                  actions.push(<button key="cancel" style={{ ...styles.btn('secondary'), padding: '4px 10px', fontSize: '11px' }} onClick={() => setModalTarget({ id: req.id, action: 'cancel' })}>✕ Cancel</button>);
                return (
                  <tr key={req.id}>
                    <td style={styles.td}><strong>{req.staff?.full_name || '—'}</strong></td>
                    <td style={styles.td}><span style={styles.badge(theme.accent)}>{req.leave_type}</span></td>
                    <td style={styles.td}>{req.is_paid ? <span style={{ color: theme.green, fontWeight: '600' }}>Yes</span> : <span style={{ color: theme.textMuted }}>No</span>}</td>
                    <td style={styles.td}>{req.start_date || '—'}</td>
                    <td style={styles.td}>{req.end_date || '—'}</td>
                    <td style={styles.td}><strong>{req.days ?? '—'}</strong></td>
                    <td style={styles.td}>{req.reason || '—'}</td>
                    <td style={styles.td}><span style={styles.badge(leaveStatusColor(status))}>{status}</span></td>
                    <td style={styles.td}><div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>{actions.length ? actions : <span style={{ color: theme.textMuted, fontSize: '11px' }}>—</span>}</div></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

// ── MY HR (SELF-SERVICE) ──────────────────────────────────────
const MyHRPage = ({ userProfile }) => {
  const currentYear = new Date().getFullYear();
  const [myStaff, setMyStaff] = useState(null);
  const [staffLoading, setStaffLoading] = useState(true);
  const [alert, setAlert] = useState(null);
  const [advances, setAdvances] = useState([]);
  const [leaves, setLeaves] = useState([]);
  const [listLoading, setListLoading] = useState(true);
  const [myBalance, setMyBalance] = useState([]);
  const [policyActive, setPolicyActive] = useState(false);
  const [balanceLoading, setBalanceLoading] = useState(true);
  const [showAdvForm, setShowAdvForm] = useState(false);
  const [advForm, setAdvForm] = useState({ amount: '', reason: '', installments: '1' });
  const [advSaving, setAdvSaving] = useState(false);
  const [showLeaveForm, setShowLeaveForm] = useState(false);
  const [leaveForm, setLeaveForm] = useState({ leave_type: 'annual', is_paid: true, start_date: '', end_date: '', days: '', reason: '' });
  const [leaveSaving, setLeaveSaving] = useState(false);
  const [cardLoading, setCardLoading] = useState(false);
  const [bizCardLoading, setBizCardLoading] = useState(false);
  const [myCases, setMyCases]           = useState([]);
  const [casesLoading, setCasesLoading] = useState(true);
  const [respondTarget, setRespondTarget] = useState(null);
  const [respondText, setRespondText]   = useState('');
  const [respondSaving, setRespondSaving] = useState(false);
  const [ackSaving, setAckSaving]       = useState(null);
  const [myAttendance, setMyAttendance] = useState([]);
  const [attLoading, setAttLoading]     = useState(true);
  const [attFlagTarget, setAttFlagTarget] = useState(null);
  const [attFlagText, setAttFlagText]   = useState('');
  const [attFlagSaving, setAttFlagSaving] = useState(false);
  const [pinMyValue, setPinMyValue]     = useState('');
  const [pinMyMsg, setPinMyMsg]         = useState(null);
  const [pinMySaving, setPinMySaving]   = useState(false);

  const loadAll = async () => {
    setStaffLoading(true); setListLoading(true); setBalanceLoading(true); setCasesLoading(true); setAttLoading(true);
    let staff = null;
    try {
      staff = await meService.getMyStaff();
      setMyStaff(staff);
    } catch (e) { setAlert({ type: 'error', msg: e.message }); }
    finally { setStaffLoading(false); }
    try {
      if (staff?.id) {
        const [adv, leave] = await Promise.all([advancesService.listMine(staff.id), leaveService.listMine(staff.id)]);
        setAdvances(adv); setLeaves(leave);
      } else {
        setAdvances([]); setLeaves([]);
      }
    } catch (e) { setAlert({ type: 'error', msg: e.message }); }
    finally { setListLoading(false); }
    try {
      const balPromises = [leaveBalanceService.getPolicySettings()];
      if (staff?.id) balPromises.push(leaveBalanceService.getMyBalance(staff.id, currentYear));
      const [pol, bal] = await Promise.all(balPromises);
      setPolicyActive(pol?.active === true);
      setMyBalance(bal || []);
    } catch (_) { /* leave balance not critical — fail silently */ }
    finally { setBalanceLoading(false); }
    try {
      const cases = await disciplinaryService.getMine();
      setMyCases(cases);
    } catch (_) { /* fail silently — self-service view may not exist for all deployments */ }
    finally { setCasesLoading(false); }
    try {
      if (staff?.id) {
        const to   = new Date().toISOString().slice(0, 10);
        const from = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
        const att  = await kioskService.getMyAttendance(staff.id, from, to);
        setMyAttendance(att);
      } else {
        setMyAttendance([]);
      }
    } catch (_) { /* fail silently */ }
    finally { setAttLoading(false); }
  };

  useEffect(() => { loadAll(); }, []);

  const setLeaveField = (field, value) => {
    setLeaveForm(f => {
      const next = { ...f, [field]: value };
      if (field === 'start_date' || field === 'end_date') {
        const auto = calcLeaveDays(next.start_date, next.end_date);
        if (auto) next.days = auto;
      }
      return next;
    });
  };

  const handleCreateAdvance = async () => {
    if (!advForm.amount || !advForm.reason)
      return setAlert({ type: 'error', msg: 'Amount and reason are required.' });
    setAdvSaving(true); setAlert(null);
    try {
      await advancesService.create({ staff_id: myStaff.id, amount: Number(advForm.amount), reason: advForm.reason, installments: Number(advForm.installments) || 1, requested_by: userProfile?.full_name || 'Admin' });
      setAdvForm({ amount: '', reason: '', installments: '1' });
      setShowAdvForm(false);
      setAlert({ type: 'success', msg: 'Advance request submitted.' });
      advancesService.listMine(myStaff.id).then(setAdvances).catch(() => {});
    } catch (e) { setAlert({ type: 'error', msg: e.message }); }
    finally { setAdvSaving(false); }
  };

  const handleCreateLeave = async () => {
    if (!leaveForm.start_date || !leaveForm.end_date || !leaveForm.days)
      return setAlert({ type: 'error', msg: 'Dates and days are required.' });
    setLeaveSaving(true); setAlert(null);
    try {
      await leaveService.create({ staff_id: myStaff.id, leave_type: leaveForm.leave_type, is_paid: leaveForm.is_paid, start_date: leaveForm.start_date, end_date: leaveForm.end_date, days: Number(leaveForm.days), reason: leaveForm.reason, requested_by: userProfile?.full_name || 'Admin' });
      setLeaveForm({ leave_type: 'annual', is_paid: true, start_date: '', end_date: '', days: '', reason: '' });
      setShowLeaveForm(false);
      setAlert({ type: 'success', msg: 'Leave request submitted.' });
      leaveService.listMine(myStaff.id).then(setLeaves).catch(() => {});
    } catch (e) { setAlert({ type: 'error', msg: e.message }); }
    finally { setLeaveSaving(false); }
  };

  const handleDownloadIDCard = async () => {
    setCardLoading(true); setAlert(null);
    try {
      let photoUrl = null;
      if (myStaff?.photo_path) photoUrl = await photoService.getSignedUrl(myStaff.photo_path);
      await generateIDCardPDF(myStaff, photoUrl);
    } catch (e) { setAlert({ type: 'error', msg: 'ID card error: ' + e.message }); }
    finally { setCardLoading(false); }
  };

  const handleDownloadBizCard = async () => {
    setBizCardLoading(true); setAlert(null);
    try { await generateBusinessCardPDF(myStaff); }
    catch (e) { setAlert({ type: 'error', msg: 'Business card error: ' + e.message }); }
    finally { setBizCardLoading(false); }
  };

  const handleSubmitFlagResponse = async (attendanceId) => {
    if (!attFlagText.trim()) return;
    setAttFlagSaving(true); setAlert(null);
    try {
      await kioskService.submitFlagResponse(attendanceId, attFlagText.trim());
      setAttFlagTarget(null); setAttFlagText('');
      setMyAttendance(prev => prev.map(r => r.id === attendanceId ? { ...r, flag_response: attFlagText.trim() } : r));
      setAlert({ type: 'success', msg: 'Response submitted.' });
    } catch (e) { setAlert({ type: 'error', msg: e.message }); }
    finally { setAttFlagSaving(false); }
  };

  const handleSetMyPin = async () => {
    if (pinMyValue.length < 4) return;
    setPinMySaving(true); setPinMyMsg(null);
    try {
      const { error } = await supabase.rpc('set_my_kiosk_pin', { p_pin: pinMyValue });
      if (error) throw error;
      setPinMyMsg({ type: 'success', msg: 'Kiosk PIN set successfully.' });
      setPinMyValue('');
    } catch (e) {
      setPinMyMsg({ type: 'error', msg: e.message });
    } finally {
      setPinMySaving(false);
    }
  };

  const advStatusColor = s => s === 'disbursed' ? theme.green : s === 'md_approved' ? theme.blue : s === 'ico_approved' ? theme.accent : s === 'settled' ? theme.textMuted : (s === 'rejected' || s === 'cancelled') ? theme.red : theme.textMuted;
  const leaveStatusColor = s => s === 'md_approved' ? theme.green : s === 'ico_approved' ? theme.blue : (s === 'rejected' || s === 'cancelled') ? theme.red : theme.textMuted;

  return (
    <div>
      {alert && <Alert msg={alert.msg} type={alert.type} onClose={() => setAlert(null)} />}
      <div style={styles.header}>
        <div><div style={styles.pageTitle}>My HR</div><div style={styles.pageSubtitle}>Your leave and advance requests</div></div>
      </div>

      {!staffLoading && myStaff && (
        <div style={{ ...styles.card, marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <div style={{ fontSize: '18px', fontWeight: '700' }}>{myStaff.full_name}</div>
            <div style={{ fontSize: '13px', color: theme.textMuted, marginTop: '4px' }}>{myStaff.job_title || myStaff.role || '—'} · {myStaff.employee_number || '—'}</div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button style={{ ...styles.btn('secondary'), fontSize: '12px' }} onClick={handleDownloadIDCard} disabled={cardLoading}>{cardLoading ? 'Generating…' : '↓ ID Card'}</button>
            <button style={{ ...styles.btn('secondary'), fontSize: '12px' }} onClick={handleDownloadBizCard} disabled={bizCardLoading}>{bizCardLoading ? 'Generating…' : '↓ Business Card'}</button>
          </div>
        </div>
      )}
      {!staffLoading && !myStaff && (
        <div style={{ ...styles.card, marginBottom: '20px', color: theme.textMuted, fontSize: '13px' }}>
          No staff profile is linked to this account.
        </div>
      )}

      <div style={{ ...styles.card, marginBottom: '20px' }}>
        <div style={styles.sectionTitle}>My Leave Balance ({currentYear})</div>
        {balanceLoading ? <div style={{ color: theme.textMuted, fontSize: '13px' }}>Loading…</div>
          : (!policyActive || myBalance.length === 0) ? (
          <div style={{ color: theme.textMuted, fontSize: '13px' }}>Leave balances not yet activated.</div>
        ) : (
          <div style={{ display: 'flex', gap: '28px', flexWrap: 'wrap' }}>
            {myBalance.filter(b => b.leave_type === 'annual' || b.leave_type === 'sick').map(b => {
              const bal = b.balance;
              return (
                <div key={b.leave_type}>
                  <div style={{ fontSize: '11px', fontWeight: '700', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{b.leave_type.charAt(0).toUpperCase() + b.leave_type.slice(1)}</div>
                  <div style={{ fontSize: '26px', fontWeight: '700', color: bal < 0 ? theme.red : theme.green, marginTop: '4px' }}>{bal}{bal < 0 ? ' ⚠' : ''}</div>
                  <div style={{ fontSize: '12px', color: theme.textMuted, marginTop: '2px' }}>{b.used_days} used / {b.entitled_days} entitled</div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <div style={styles.sectionTitle}>My Advances</div>
        <button style={{ ...styles.btn(showAdvForm ? 'secondary' : 'primary'), fontSize: '12px' }} onClick={() => setShowAdvForm(v => !v)} disabled={!myStaff}>{showAdvForm ? '✕ Cancel' : '+ Request Advance'}</button>
      </div>
      {showAdvForm && (
        <div style={{ ...styles.card, marginBottom: '16px' }}>
          <div style={styles.grid(3)}>
            <div style={styles.formGroup}><label style={styles.label}>Amount (₦)</label><input style={styles.input} type="number" placeholder="0" value={advForm.amount} onChange={e => setAdvForm(f => ({ ...f, amount: e.target.value }))} /></div>
            <div style={styles.formGroup}><label style={styles.label}>Installments</label><input style={styles.input} type="number" min="1" placeholder="1" value={advForm.installments} onChange={e => setAdvForm(f => ({ ...f, installments: e.target.value }))} /></div>
            <div style={styles.formGroup}><label style={styles.label}>Reason</label><input style={styles.input} placeholder="Reason…" value={advForm.reason} onChange={e => setAdvForm(f => ({ ...f, reason: e.target.value }))} /></div>
          </div>
          <button style={styles.btn('primary')} onClick={handleCreateAdvance} disabled={advSaving}>{advSaving ? 'Submitting…' : 'Submit'}</button>
        </div>
      )}
      <div style={{ ...styles.card, marginBottom: '24px' }}>
        {listLoading ? <Spinner /> : advances.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '20px', color: theme.textMuted }}>No advance requests yet.</div>
        ) : (
          <table style={styles.table}>
            <thead><tr>{['Amount','Installments','Outstanding','Reason','Status'].map(h => <th key={h} style={styles.th}>{h}</th>)}</tr></thead>
            <tbody>{advances.map(adv => (
              <tr key={adv.id}>
                <td style={styles.td}><strong style={{ color: theme.accent }}>{naira(adv.amount)}</strong></td>
                <td style={styles.td}>{adv.installments || 1}</td>
                <td style={styles.td}>{(adv.outstanding_balance || 0) > 0 ? <strong style={{ color: theme.red }}>{naira(adv.outstanding_balance)}</strong> : <span style={{ color: theme.textMuted }}>—</span>}</td>
                <td style={styles.td}>{adv.reason || '—'}</td>
                <td style={styles.td}><span style={styles.badge(advStatusColor(adv.status))}>{adv.status}</span></td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <div style={styles.sectionTitle}>My Leave</div>
        <button style={{ ...styles.btn(showLeaveForm ? 'secondary' : 'primary'), fontSize: '12px' }} onClick={() => setShowLeaveForm(v => !v)} disabled={!myStaff}>{showLeaveForm ? '✕ Cancel' : '+ Request Leave'}</button>
      </div>
      {showLeaveForm && (
        <div style={{ ...styles.card, marginBottom: '16px' }}>
          <div style={styles.grid(3)}>
            <div style={styles.formGroup}><label style={styles.label}>Leave Type</label><select style={styles.input} value={leaveForm.leave_type} onChange={e => setLeaveField('leave_type', e.target.value)}>{LEAVE_TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}</select></div>
            <div style={styles.formGroup}><label style={styles.label}>Start Date</label><input type="date" style={styles.input} value={leaveForm.start_date} onChange={e => setLeaveField('start_date', e.target.value)} /></div>
            <div style={styles.formGroup}><label style={styles.label}>End Date</label><input type="date" style={styles.input} value={leaveForm.end_date} onChange={e => setLeaveField('end_date', e.target.value)} /></div>
            <div style={styles.formGroup}><label style={styles.label}>Days</label><input type="number" min="1" style={styles.input} value={leaveForm.days} onChange={e => setLeaveField('days', e.target.value)} placeholder="Auto-filled" /></div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Paid Leave?</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingTop: '10px' }}>
                <input type="checkbox" checked={leaveForm.is_paid} onChange={e => setLeaveField('is_paid', e.target.checked)} style={{ width: '16px', height: '16px', accentColor: theme.accent }} />
                <span style={{ fontSize: '13px', color: theme.text }}>Yes — paid</span>
              </div>
            </div>
            <div style={styles.formGroup}><label style={styles.label}>Reason</label><input style={styles.input} placeholder="Reason…" value={leaveForm.reason} onChange={e => setLeaveField('reason', e.target.value)} /></div>
          </div>
          <button style={styles.btn('primary')} onClick={handleCreateLeave} disabled={leaveSaving}>{leaveSaving ? 'Submitting…' : 'Submit'}</button>
        </div>
      )}
      <div style={styles.card}>
        {listLoading ? <Spinner /> : leaves.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '20px', color: theme.textMuted }}>No leave requests yet.</div>
        ) : (
          <table style={styles.table}>
            <thead><tr>{['Type','Paid?','Start','End','Days','Reason','Status'].map(h => <th key={h} style={styles.th}>{h}</th>)}</tr></thead>
            <tbody>{leaves.map(req => (
              <tr key={req.id}>
                <td style={styles.td}><span style={styles.badge(theme.accent)}>{req.leave_type}</span></td>
                <td style={styles.td}>{req.is_paid ? <span style={{ color: theme.green, fontWeight: '600' }}>Yes</span> : <span style={{ color: theme.textMuted }}>No</span>}</td>
                <td style={styles.td}>{req.start_date || '—'}</td>
                <td style={styles.td}>{req.end_date || '—'}</td>
                <td style={styles.td}><strong>{req.days ?? '—'}</strong></td>
                <td style={styles.td}>{req.reason || '—'}</td>
                <td style={styles.td}><span style={styles.badge(leaveStatusColor(req.status))}>{req.status}</span></td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>

      <div style={{ marginTop: '28px' }}>
        <div style={styles.sectionTitle}>Queries &amp; Warnings</div>
        {casesLoading ? <Spinner /> : myCases.length === 0 ? (
          <div style={{ ...styles.card, color: theme.textMuted, fontSize: '13px', textAlign: 'center', padding: '20px' }}>
            No queries or warnings on record.
          </div>
        ) : myCases.map(c => {
          const canRespond = c.type === 'formal_query' && c.status === 'issued';
          const needsAck   = !c.acknowledged_at;
          const discStatusColor = s =>
            s === 'closed' ? theme.textMuted : s === 'reviewed' ? theme.blue :
            s === 'responded' ? theme.green : theme.accent;
          return (
            <div key={c.id} style={{ ...styles.card, marginBottom: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px' }}>
                <div>
                  <div style={{ fontWeight: '600', fontSize: '14px', color: theme.text }}>{c.title}</div>
                  <div style={{ fontSize: '12px', color: theme.textMuted, marginTop: '2px' }}>
                    {DISC_TYPES.find(t => t.id === c.type)?.label || c.type} · {c.incident_date || '—'}
                    {c.response_deadline ? ` · Respond by ${c.response_deadline}` : ''}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  <span style={styles.badge(discStatusColor(c.status))}>{c.status}</span>
                  {needsAck && (
                    <button
                      style={{ ...styles.btn('secondary'), fontSize: '11px', padding: '4px 10px' }}
                      disabled={ackSaving === c.id}
                      onClick={async () => {
                        setAckSaving(c.id); setAlert(null);
                        try {
                          await disciplinaryService.advance(c.id, 'acknowledge', null, null);
                          setMyCases(prev => prev.map(x => x.id === c.id ? { ...x, acknowledged_at: new Date().toISOString() } : x));
                        } catch (e) { setAlert({ type: 'error', msg: e.message }); }
                        finally { setAckSaving(null); }
                      }}>
                      {ackSaving === c.id ? 'Acknowledging…' : 'Acknowledge'}
                    </button>
                  )}
                </div>
              </div>
              {c.allegation && (
                <div style={{ fontSize: '12px', color: theme.textMuted, marginTop: '8px' }}>
                  <strong style={{ color: theme.text }}>Allegation:</strong> {c.allegation}
                </div>
              )}
              {c.sanction && c.sanction !== 'none' && (
                <div style={{ fontSize: '12px', color: theme.red, marginTop: '4px' }}>
                  <strong>Outcome:</strong> {DISC_SANCTIONS.find(s => s.id === c.sanction)?.label || c.sanction}
                </div>
              )}
              {canRespond && respondTarget !== c.id && (
                <button
                  style={{ ...styles.btn('primary'), fontSize: '12px', marginTop: '10px' }}
                  onClick={() => { setRespondTarget(c.id); setRespondText(''); }}>
                  Submit Response
                </button>
              )}
              {respondTarget === c.id && (
                <div style={{ marginTop: '10px' }}>
                  <textarea
                    style={{ ...styles.input, height: '80px', resize: 'vertical', marginBottom: '8px' }}
                    placeholder="Your response to this query…"
                    value={respondText}
                    onChange={e => setRespondText(e.target.value)} />
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      style={{ ...styles.btn('primary'), fontSize: '12px' }}
                      disabled={respondSaving || !respondText.trim()}
                      onClick={async () => {
                        setRespondSaving(true); setAlert(null);
                        try {
                          await disciplinaryService.advance(c.id, 'respond', respondText, null);
                          setRespondTarget(null); setRespondText('');
                          const updated = await disciplinaryService.getMine();
                          setMyCases(updated);
                        } catch (e) { setAlert({ type: 'error', msg: e.message }); }
                        finally { setRespondSaving(false); }
                      }}>
                      {respondSaving ? 'Submitting…' : 'Submit'}
                    </button>
                    <button style={{ ...styles.btn('secondary'), fontSize: '12px' }}
                      onClick={() => { setRespondTarget(null); setRespondText(''); }}>Cancel</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: '28px' }}>
        <div style={styles.sectionTitle}>My Attendance (Last 30 Days)</div>
        {attLoading ? <Spinner /> : myAttendance.length === 0 ? (
          <div style={{ ...styles.card, color: theme.textMuted, fontSize: '13px', textAlign: 'center', padding: '20px' }}>
            No attendance records in the last 30 days.
          </div>
        ) : (
          <div style={{ ...styles.card, overflowX: 'auto' }}>
            <table style={styles.table}>
              <thead><tr>{['Date','Present','Hours','Flag'].map(h => <th key={h} style={styles.th}>{h}</th>)}</tr></thead>
              <tbody>{myAttendance.map(row => (
                <tr key={row.id}>
                  <td style={styles.td}>{row.date}</td>
                  <td style={styles.td}>{row.present ? <span style={{ color: theme.green, fontWeight: 600 }}>Yes</span> : <span style={{ color: theme.red }}>No</span>}</td>
                  <td style={styles.td}>{row.hours_worked ?? '—'}</td>
                  <td style={styles.td}>
                    {row.flagged && !row.flag_response && attFlagTarget !== row.id && (
                      <div>
                        <span style={styles.badge(theme.red)}>Flagged</span>
                        {row.flag_reason && <div style={{ fontSize: '11px', color: theme.textMuted, margin: '3px 0' }}>{row.flag_reason}</div>}
                        <button style={{ ...styles.btn('secondary'), fontSize: '11px', padding: '3px 8px', marginTop: '4px' }}
                          onClick={() => { setAttFlagTarget(row.id); setAttFlagText(''); }}>
                          Respond
                        </button>
                      </div>
                    )}
                    {row.flagged && attFlagTarget === row.id && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <textarea
                          style={{ ...styles.input, height: '60px', resize: 'vertical', fontSize: '12px' }}
                          placeholder="Explain this flag…"
                          value={attFlagText}
                          onChange={e => setAttFlagText(e.target.value)} />
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button style={{ ...styles.btn('primary'), fontSize: '11px', padding: '4px 10px' }}
                            disabled={attFlagSaving || !attFlagText.trim()}
                            onClick={() => handleSubmitFlagResponse(row.id)}>
                            {attFlagSaving ? '…' : 'Submit'}
                          </button>
                          <button style={{ ...styles.btn('secondary'), fontSize: '11px', padding: '4px 10px' }}
                            onClick={() => { setAttFlagTarget(null); setAttFlagText(''); }}>
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                    {row.flagged && row.flag_response && (
                      <span style={{ fontSize: '11px', color: theme.green }}>Responded</span>
                    )}
                    {!row.flagged && <span style={{ color: theme.textMuted, fontSize: '12px' }}>—</span>}
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </div>

      <div style={{ ...styles.card, marginTop: '28px' }}>
        <div style={styles.sectionTitle}>Kiosk PIN</div>
        <div style={{ fontSize: '13px', color: theme.textMuted, marginBottom: '14px' }}>
          Set or reset your attendance kiosk PIN. Use this 4–6 digit PIN to clock in/out at the kiosk when your barcode is not available.
        </div>
        {pinMyMsg && <Alert msg={pinMyMsg.msg} type={pinMyMsg.type} onClose={() => setPinMyMsg(null)} />}
        <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end', maxWidth: '340px' }}>
          <div style={{ ...styles.formGroup, flex: 1, marginBottom: 0 }}>
            <label style={styles.label}>New PIN (4–6 digits)</label>
            <input
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              style={styles.input}
              placeholder="Enter 4–6 digit PIN"
              value={pinMyValue}
              onChange={e => setPinMyValue(e.target.value.replace(/\D/g, '').slice(0, 6))}
              onKeyDown={e => { if (e.key === 'Enter' && pinMyValue.length >= 4) handleSetMyPin(); }}
            />
          </div>
          <button
            style={{ ...styles.btn('primary'), flexShrink: 0 }}
            disabled={pinMySaving || pinMyValue.length < 4}
            onClick={handleSetMyPin}
          >
            {pinMySaving ? 'Saving…' : 'Set PIN'}
          </button>
        </div>
        <div style={{ fontSize: '11px', color: theme.textMuted, marginTop: '8px' }}>
          PIN is hashed server-side. It cannot be retrieved once set.
        </div>
      </div>
    </div>
  );
};

// ── ATTENDANCE FLAGS PAGE ─────────────────────────────────────
const AttendanceFlagsPage = ({ userProfile }) => {
  const [rows, setRows]           = useState([]);
  const [loading, setLoading]     = useState(true);
  const [alert, setAlert]         = useState(null);
  const [resolving, setResolving] = useState(null);
  const [forms, setForms]         = useState({});

  const load = async () => {
    setLoading(true);
    try { setRows(await kioskService.getFlagged()); }
    catch (e) { setAlert({ type: 'error', msg: e.message }); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const setField = (id, field, value) =>
    setForms(f => ({ ...f, [id]: { ...f[id], [field]: value } }));

  const handleResolve = async (id) => {
    const form = forms[id] || {};
    setResolving(id); setAlert(null);
    try {
      await kioskService.resolveFlag(id, form.hours_worked, form.present);
      setAlert({ type: 'success', msg: 'Flag resolved.' });
      load();
    } catch (e) { setAlert({ type: 'error', msg: e.message }); }
    finally { setResolving(null); }
  };

  return (
    <div>
      {alert && <Alert msg={alert.msg} type={alert.type} onClose={() => setAlert(null)} />}
      <div style={styles.header}>
        <div>
          <div style={styles.pageTitle}>Attendance Flags</div>
          <div style={styles.pageSubtitle}>Flagged attendance records requiring HR review (last 60 days)</div>
        </div>
        <button style={styles.btn('secondary')} onClick={load} disabled={loading}>Refresh</button>
      </div>
      {loading ? <Spinner /> : rows.length === 0 ? (
        <div style={{ ...styles.card, color: theme.textMuted, textAlign: 'center', padding: '40px' }}>
          No flagged records.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {rows.map(row => {
            const form = forms[row.id] || {};
            return (
              <div key={row.id} style={styles.card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px' }}>
                  <div>
                    <div style={{ fontWeight: '600', fontSize: '14px' }}>{row.staff?.full_name || '—'}</div>
                    <div style={{ fontSize: '12px', color: theme.textMuted, marginTop: '2px' }}>
                      {row.staff?.employee_number || ''} · {row.date}
                    </div>
                  </div>
                  <span style={styles.badge(theme.red)}>Flagged</span>
                </div>
                {row.flag_reason && (
                  <div style={{ fontSize: '12px', color: theme.textMuted, marginTop: '8px' }}>
                    <strong style={{ color: theme.text }}>Reason:</strong> {row.flag_reason}
                  </div>
                )}
                {row.flag_response && (
                  <div style={{ fontSize: '12px', color: theme.green, marginTop: '4px' }}>
                    <strong style={{ color: theme.text }}>Employee:</strong> {row.flag_response}
                  </div>
                )}
                <div style={{ marginTop: '12px', display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                  <div style={styles.formGroup}>
                    <label style={styles.label}>Hours Worked</label>
                    <input type="number" step="0.5" min="0" max="24"
                      style={{ ...styles.input, width: '100px' }}
                      placeholder="e.g. 8"
                      value={form.hours_worked ?? ''}
                      onChange={e => setField(row.id, 'hours_worked', e.target.value)} />
                  </div>
                  <div style={styles.formGroup}>
                    <label style={styles.label}>Present?</label>
                    <select style={{ ...styles.input, width: '90px' }}
                      value={form.present === undefined ? '' : String(form.present)}
                      onChange={e => setField(row.id, 'present', e.target.value === '' ? undefined : e.target.value === 'true')}>
                      <option value="">—</option>
                      <option value="true">Yes</option>
                      <option value="false">No</option>
                    </select>
                  </div>
                  <button style={styles.btn('primary')}
                    disabled={resolving === row.id}
                    onClick={() => handleResolve(row.id)}>
                    {resolving === row.id ? 'Resolving…' : 'Resolve Flag'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ── DISCIPLINARY ──────────────────────────────────────────────
const DisciplinaryPage = ({ userProfile }) => {
  const role = userProfile?.role;
  // NOTE: issue_disciplinary_case / advance_disciplinary enforce the actor via
  // get_user_role() — the PRIMARY role only, NOT granted roles. So these gates
  // must check the primary role, otherwise a user *granted* hr_officer would
  // see Issue/Review buttons that the RPC rejects on click. (To make
  // disciplinary truly multi-role, those RPCs would need has_any_role — a DB
  // change, out of scope here.)
  const canIssue  = role === 'md' || role === 'hr_officer';
  const canReview = role === 'md' || role === 'hr_officer';
  const canClose  = role === 'md';

  const [cases, setCases]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [alert, setAlert]         = useState(null);
  const [staffList, setStaffList] = useState([]);
  const [showForm, setShowForm]   = useState(false);
  const [form, setForm]           = useState({ staff_id: '', type: 'formal_query', title: '', allegation: '', incident_date: '', response_deadline: '' });
  const [saving, setSaving]       = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [audit, setAudit]         = useState({});
  const [auditLoading, setAuditLoading] = useState(false);
  const [reviewTarget, setReviewTarget] = useState(null);
  const [reviewNotes, setReviewNotes]   = useState('');
  const [reviewSaving, setReviewSaving] = useState(false);
  const [closeTarget, setCloseTarget]   = useState(null);
  const [closeSanction, setCloseSanction] = useState('none');
  const [closeSaving, setCloseSaving]   = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [c, s] = await Promise.all([disciplinaryService.listAll(), staffService.getPublicActive()]);
      setCases(c); setStaffList(s);
    } catch (e) { setAlert({ type: 'error', msg: e.message }); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const toggleExpand = async (caseId) => {
    if (expandedId === caseId) { setExpandedId(null); return; }
    setExpandedId(caseId);
    if (!audit[caseId]) {
      setAuditLoading(true);
      try {
        const rows = await disciplinaryService.getAudit(caseId);
        setAudit(a => ({ ...a, [caseId]: rows }));
      } catch (_) {}
      finally { setAuditLoading(false); }
    }
  };

  const refreshAudit = async (caseId) => {
    try {
      const rows = await disciplinaryService.getAudit(caseId);
      setAudit(a => ({ ...a, [caseId]: rows }));
    } catch (_) {}
  };

  const handleIssue = async () => {
    if (!form.staff_id || !form.title || !form.allegation || !form.incident_date)
      return setAlert({ type: 'error', msg: 'Staff, title, allegation, and incident date are required.' });
    setSaving(true); setAlert(null);
    try {
      await disciplinaryService.issue({
        staff_id: form.staff_id, type: form.type, title: form.title,
        allegation: form.allegation, incident_date: form.incident_date,
        response_deadline: form.type === 'formal_query' ? (form.response_deadline || null) : null,
      });
      setForm({ staff_id: '', type: 'formal_query', title: '', allegation: '', incident_date: '', response_deadline: '' });
      setShowForm(false);
      setAlert({ type: 'success', msg: 'Case issued.' });
      load();
    } catch (e) { setAlert({ type: 'error', msg: e.message }); }
    finally { setSaving(false); }
  };

  const handleReview = async (caseId) => {
    setReviewSaving(true); setAlert(null);
    try {
      await disciplinaryService.advance(caseId, 'review', reviewNotes || null, null);
      setReviewTarget(null); setReviewNotes('');
      await load(); await refreshAudit(caseId);
    } catch (e) { setAlert({ type: 'error', msg: e.message }); }
    finally { setReviewSaving(false); }
  };

  const handleClose = async (caseId) => {
    setCloseSaving(true); setAlert(null);
    try {
      await disciplinaryService.advance(caseId, 'close', null, closeSanction);
      setCloseTarget(null); setCloseSanction('none');
      await load(); await refreshAudit(caseId);
    } catch (e) { setAlert({ type: 'error', msg: e.message }); }
    finally { setCloseSaving(false); }
  };

  const statusColor = s =>
    s === 'closed'    ? theme.textMuted :
    s === 'reviewed'  ? theme.blue :
    s === 'responded' ? theme.green :
    s === 'issued'    ? theme.accent : theme.textMuted;

  return (
    <div>
      {alert && <Alert msg={alert.msg} type={alert.type} onClose={() => setAlert(null)} />}
      <div style={styles.header}>
        <div>
          <div style={styles.pageTitle}>Disciplinary</div>
          <div style={styles.pageSubtitle}>Manage formal queries and warnings</div>
        </div>
        {canIssue && (
          <button style={styles.btn('primary')} onClick={() => setShowForm(v => !v)}>
            {showForm ? '✕ Cancel' : '+ Issue Case'}
          </button>
        )}
      </div>

      {showForm && (
        <div style={{ ...styles.card, marginBottom: '20px' }}>
          <div style={styles.sectionTitle}>Issue New Case</div>
          <div style={styles.grid(2)}>
            <div style={styles.formGroup}>
              <label style={styles.label}>Staff Member</label>
              <select style={styles.input} value={form.staff_id} onChange={e => setForm(f => ({ ...f, staff_id: e.target.value }))}>
                <option value="">Select staff…</option>
                {staffList.map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}
              </select>
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Case Type</label>
              <select style={styles.input} value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                {DISC_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Title</label>
              <input style={styles.input} placeholder="Brief title of the case…" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Incident Date</label>
              <input type="date" style={styles.input} value={form.incident_date} onChange={e => setForm(f => ({ ...f, incident_date: e.target.value }))} />
            </div>
            {form.type === 'formal_query' && (
              <div style={styles.formGroup}>
                <label style={styles.label}>Response Deadline</label>
                <input type="date" style={styles.input} value={form.response_deadline} onChange={e => setForm(f => ({ ...f, response_deadline: e.target.value }))} />
              </div>
            )}
            <div style={{ ...styles.formGroup, gridColumn: '1 / -1' }}>
              <label style={styles.label}>Allegation / Details</label>
              <textarea style={{ ...styles.input, height: '80px', resize: 'vertical' }}
                placeholder="Describe the incident or allegation in full…"
                value={form.allegation} onChange={e => setForm(f => ({ ...f, allegation: e.target.value }))} />
            </div>
          </div>
          <button style={styles.btn('primary')} onClick={handleIssue} disabled={saving}>{saving ? 'Issuing…' : 'Issue Case'}</button>
        </div>
      )}

      <div style={styles.card}>
        {loading ? <Spinner /> : cases.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '20px', color: theme.textMuted }}>No cases on record.</div>
        ) : cases.map(c => (
          <div key={c.id} style={{ borderBottom: `1px solid ${theme.border}`, paddingBottom: '16px', marginBottom: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px' }}>
              <div>
                <div style={{ fontWeight: '600', fontSize: '14px', color: theme.text }}>{c.title}</div>
                <div style={{ fontSize: '12px', color: theme.textMuted, marginTop: '2px' }}>
                  {c.staff?.full_name || '—'} · {DISC_TYPES.find(t => t.id === c.type)?.label || c.type} · {c.incident_date || '—'}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={styles.badge(statusColor(c.status))}>{c.status}</span>
                {canReview && (c.status === 'issued' || c.status === 'responded') && reviewTarget !== c.id && closeTarget !== c.id && (
                  <button style={{ ...styles.btn('secondary'), fontSize: '11px', padding: '4px 10px' }}
                    onClick={() => { setReviewTarget(c.id); setCloseTarget(null); setReviewNotes(''); }}>Review</button>
                )}
                {canClose && c.status === 'reviewed' && closeTarget !== c.id && reviewTarget !== c.id && (
                  <button style={{ ...styles.btn('primary'), fontSize: '11px', padding: '4px 10px' }}
                    onClick={() => { setCloseTarget(c.id); setCloseSanction('none'); setReviewTarget(null); }}>Close</button>
                )}
                <button style={{ ...styles.btn('secondary'), fontSize: '11px', padding: '4px 10px' }}
                  onClick={() => toggleExpand(c.id)}>{expandedId === c.id ? '▲ Hide' : '▼ Details'}</button>
              </div>
            </div>

            {reviewTarget === c.id && (
              <div style={{ marginTop: '12px', padding: '12px', background: theme.surface, borderRadius: '8px', border: `1px solid ${theme.border}` }}>
                <label style={styles.label}>Review Notes</label>
                <textarea style={{ ...styles.input, height: '64px', resize: 'vertical', marginBottom: '8px' }}
                  placeholder="Notes on the review (optional)…" value={reviewNotes} onChange={e => setReviewNotes(e.target.value)} />
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button style={{ ...styles.btn('primary'), fontSize: '12px' }} onClick={() => handleReview(c.id)} disabled={reviewSaving}>
                    {reviewSaving ? 'Saving…' : 'Confirm Review'}
                  </button>
                  <button style={{ ...styles.btn('secondary'), fontSize: '12px' }} onClick={() => { setReviewTarget(null); setReviewNotes(''); }}>Cancel</button>
                </div>
              </div>
            )}

            {closeTarget === c.id && (
              <div style={{ marginTop: '12px', padding: '12px', background: theme.surface, borderRadius: '8px', border: `1px solid ${theme.border}` }}>
                <label style={styles.label}>Outcome / Sanction</label>
                <select style={{ ...styles.input, marginBottom: '4px' }} value={closeSanction} onChange={e => setCloseSanction(e.target.value)}>
                  {DISC_SANCTIONS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
                <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '8px' }}>
                  Records the outcome only — does not change employment status or payroll.
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button style={{ ...styles.btn('primary'), fontSize: '12px' }} onClick={() => handleClose(c.id)} disabled={closeSaving}>
                    {closeSaving ? 'Closing…' : 'Close Case'}
                  </button>
                  <button style={{ ...styles.btn('secondary'), fontSize: '12px' }} onClick={() => setCloseTarget(null)}>Cancel</button>
                </div>
              </div>
            )}

            {expandedId === c.id && (
              <div style={{ marginTop: '12px' }}>
                <div style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '8px' }}>
                  <strong style={{ color: theme.text }}>Allegation:</strong> {c.allegation || '—'}
                </div>
                {c.response_deadline && (
                  <div style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '8px' }}>
                    <strong style={{ color: theme.text }}>Response deadline:</strong> {c.response_deadline}
                  </div>
                )}
                {c.employee_response && (
                  <div style={{ fontSize: '12px', padding: '8px 10px', background: theme.surface, borderRadius: '6px', border: `1px solid ${theme.border}`, marginBottom: '8px' }}>
                    <strong style={{ color: theme.green }}>Employee response:</strong>
                    <div style={{ marginTop: '4px', color: theme.textMuted }}>{c.employee_response}</div>
                  </div>
                )}
                {c.sanction && c.sanction !== 'none' && (
                  <div style={{ fontSize: '12px', marginBottom: '8px' }}>
                    <strong style={{ color: theme.text }}>Outcome:</strong>{' '}
                    <span style={{ color: theme.red }}>{DISC_SANCTIONS.find(s => s.id === c.sanction)?.label || c.sanction}</span>
                  </div>
                )}
                <div style={{ fontSize: '11px', fontWeight: '700', color: theme.textDim, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '8px 0 4px' }}>Audit Trail</div>
                {auditLoading && !audit[c.id] ? <Spinner /> : (audit[c.id] || []).length === 0 ? (
                  <div style={{ fontSize: '12px', color: theme.textMuted }}>No audit entries yet.</div>
                ) : (audit[c.id] || []).map((entry, i) => (
                  <div key={i} style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>
                    <span style={{ color: theme.text, fontWeight: '600' }}>{entry.action}</span>
                    {entry.actor_role ? ` — ${entry.actor_role}` : ''}
                    {entry.note ? `: "${entry.note}"` : ''}
                    <span style={{ marginLeft: '8px', fontSize: '11px', color: theme.textDim }}>
                      {entry.created_at ? new Date(entry.created_at).toLocaleDateString() : ''}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

// ── TRUCK LOADING ─────────────────────────────────────────────
const TruckLoadingPage = ({ userProfile }) => {
  const role = userProfile?.role;
  const canLog         = hasRole(userProfile, 'production_manager', 'assistant_production_manager', 'logistics_manager', 'md');
  const canManageRates = hasRole(userProfile, 'logistics_manager', 'md');
  const canDelete      = hasRole(userProfile, 'md', 'production_manager', 'assistant_production_manager', 'logistics_manager');

  const defaultTab = canLog ? 'log' : 'rates';
  const [tab, setTab] = useState(defaultTab);

  // Shared data
  const [vehicles, setVehicles]     = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [products, setProducts]     = useState([]);

  // Log tab
  const [logs, setLogs]               = useState([]);
  const [entriesLoading, setEntriesLoading] = useState(false);
  const [showLogForm, setShowLogForm] = useState(false);
  const [logForm, setLogForm]         = useState({ vehicle_id: '', product_id: '', date: '', quantity_loaded: '', waybill_id: '' });
  const [selectedLoaders, setSelectedLoaders] = useState([]);
  const [logSaving, setLogSaving]     = useState(false);
  const [logAlert, setLogAlert]       = useState(null);
  const [isBackfill, setIsBackfill]   = useState(false);
  const [waybillsForLog, setWaybillsForLog] = useState([]);
  // Date-range filter (mirrors Labour → Payroll). Defaults to the current
  // Sat–Sat week. includeNull keeps undated legacy rows visible by default.
  const [rangeFrom, setRangeFrom]     = useState(() => shiftDays(getLastSaturday(), -6));
  const [rangeTo, setRangeTo]         = useState(() => getLastSaturday());
  const [includeNull, setIncludeNull] = useState(true);
  const [undatedCount, setUndatedCount] = useState(0);

  // Log tab — edit
  const [editingLogId, setEditingLogId]   = useState(null);
  const [editLogForm, setEditLogForm]     = useState({ vehicle_id: '', product_id: '', date: '', quantity_loaded: '' });
  const [editLogLoaders, setEditLogLoaders] = useState([]);
  const [editLogSaving, setEditLogSaving] = useState(false);

  // Rates tab
  const [rates, setRates]             = useState([]);
  const [ratesLoaded, setRatesLoaded] = useState(false);
  const [editingRate, setEditingRate] = useState(null);
  const [rateForm, setRateForm]       = useState({});
  const [rateSaving, setRateSaving]   = useState(false);
  const [rateAlert, setRateAlert]     = useState(null);

  // Log tab — delete
  const [deleteTarget, setDeleteTarget]   = useState(null);
  const [deleteSaving, setDeleteSaving]   = useState(false);

  const loadLogs = async () => {
    setEntriesLoading(true);
    try {
      const [data, undated] = await Promise.all([
        truckLoadingService.getLogs({ from: rangeFrom, to: rangeTo, includeNull }),
        truckLoadingService.getUndatedCount(),
      ]);
      setLogs(data);
      setUndatedCount(undated);
      loadWaybillsForLog(data);
    }
    catch (e) { setLogAlert({ type: 'error', msg: e.message }); }
    finally { setEntriesLoading(false); }
  };

  const shiftRange = (weeks) => {
    setRangeFrom(shiftWeek(rangeFrom, weeks));
    setRangeTo(shiftWeek(rangeTo, weeks));
  };

  const loadRates = async () => {
    try { setRates(await truckLoadingService.getRates()); setRatesLoaded(true); }
    catch (e) { setRateAlert({ type: 'error', msg: e.message }); }
  };

  useEffect(() => {
    Promise.all([
      vehiclesService.getAll(),
      truckLoadingService.getAssignments(),
      productsService.getActive(),
    ]).then(([v, a, p]) => { setVehicles(v); setAssignments(a); setProducts(p); })
      .catch(() => {});
  }, []);

  // Load (and reload) the log list whenever the range or null-toggle changes.
  useEffect(() => {
    if (canLog) loadLogs();
  }, [rangeFrom, rangeTo, includeNull]);

  useEffect(() => {
    if (tab === 'rates' && !ratesLoaded) loadRates();
  }, [tab]);

  const loadWaybillsForLog = async (currentLogs) => {
    try {
      const wbs = await waybillsService.getAll();
      const usedIds = new Set((currentLogs || logs).map(l => l.waybill_id).filter(Boolean));
      setWaybillsForLog(wbs.filter(w => !usedIds.has(w.id)));
    } catch { /* non-blocking */ }
  };

  const handleLogSubmit = async () => {
    if (!logForm.vehicle_id || !logForm.product_id || !logForm.date || !logForm.quantity_loaded) {
      setLogAlert({ type: 'error', msg: 'All log fields are required.' });
      return;
    }
    setLogSaving(true); setLogAlert(null);
    try {
      const result = await truckLoadingService.createLog(
        { vehicle_id: logForm.vehicle_id, product_id: logForm.product_id, date: logForm.date, quantity_loaded: Number(logForm.quantity_loaded), waybill_id: logForm.waybill_id || null },
        selectedLoaders,
      );
      setLogForm({ vehicle_id: '', product_id: '', date: '', quantity_loaded: '', waybill_id: '' });
      setSelectedLoaders([]);
      setShowLogForm(false);
      setIsBackfill(false);
      setLogAlert({ type: 'success', msg: `Trip #${result.trip_number_for_day ?? '?'} logged — Rate: ${naira(result.computed_rate_used)}, Total: ${naira(result.total_amount)}` });
      await loadLogs();
    } catch (e) {
      if (e.code === '23505') setLogAlert({ type: 'error', msg: 'A log entry for this waybill already exists.' });
      else setLogAlert({ type: 'error', msg: e.message });
    }
    finally { setLogSaving(false); }
  };

  const handleEditLogSave = async () => {
    setEditLogSaving(true); setLogAlert(null);
    try {
      await truckLoadingService.updateLog(editingLogId, editLogForm);
      await truckLoadingService.syncLoaders(editingLogId, editLogLoaders);
      setEditingLogId(null);
      setLogAlert({ type: 'success', msg: 'Entry updated.' });
      await loadLogs();
    } catch (e) {
      // Content-lock guard (truck_loading_content_guard) raises a clean,
      // actionable message; surface it as-is instead of a raw error. Covers the
      // race where the linked payroll gets approved between page load and save.
      setLogAlert({ type: 'error', msg: e?.message || 'Could not update the load entry.' });
    }
    finally { setEditLogSaving(false); }
  };

  const handleRateSave = async () => {
    setRateSaving(true); setRateAlert(null);
    try {
      await truckLoadingService.updateRate(editingRate, {
        base_rate: Number(rateForm.base_rate),
        trip_threshold: rateForm.trip_threshold !== '' ? Number(rateForm.trip_threshold) : null,
        incentive_rate: rateForm.incentive_rate !== '' ? Number(rateForm.incentive_rate) : null,
      });
      setEditingRate(null);
      setRateAlert({ type: 'success', msg: 'Rate updated.' });
      await loadRates();
    } catch (e) { setRateAlert({ type: 'error', msg: e.message }); }
    finally { setRateSaving(false); }
  };

  const handleDeleteLog = async (id) => {
    setDeleteSaving(true);
    try {
      await truckLoadingService.deleteLog(id);
      setDeleteTarget(null);
      setLogAlert({ type: 'success', msg: 'Entry deleted.' });
      await loadLogs();
    } catch (e) { setLogAlert({ type: 'error', msg: e.message }); setDeleteTarget(null); }
    finally { setDeleteSaving(false); }
  };

  const tabBtn = (id, label) => (
    <button
      onClick={() => setTab(id)}
      style={{ padding: '8px 16px', fontSize: '13px', fontWeight: tab === id ? '700' : '500', cursor: 'pointer', border: 'none', borderBottom: tab === id ? `2px solid ${theme.accent}` : '2px solid transparent', background: 'transparent', color: tab === id ? theme.accent : theme.textMuted, transition: 'all 0.15s' }}
    >{label}</button>
  );

  return (
    <div>
      <div style={styles.header}>
        <div>
          <div style={styles.pageTitle}>Truck Loading</div>
          <div style={styles.pageSubtitle}>Log entries and loading rates</div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '4px', borderBottom: `1px solid ${theme.border}`, marginBottom: '20px' }}>
        {canLog && tabBtn('log', 'Log Entry')}
        {canManageRates && tabBtn('rates', 'Rates')}
      </div>

      {/* ── Log Entry ── */}
      {tab === 'log' && (
        <div>
          {logAlert && <Alert msg={logAlert.msg} type={logAlert.type} onClose={() => setLogAlert(null)} />}
          <div style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '14px' }}>
            Loading payroll (weekly scoping, ICO/MD approval, payment schedules) is prepared in <strong style={{ color: theme.textMuted }}>Labour → Payroll → Loading Payroll</strong>.
          </div>
          <div style={{ marginBottom: '16px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button style={styles.btn('primary')} onClick={() => { setShowLogForm(f => !f); setLogAlert(null); setIsBackfill(false); setLogForm({ vehicle_id: '', product_id: '', date: '', quantity_loaded: '', waybill_id: '' }); setSelectedLoaders([]); }}>
              {showLogForm ? '✕ Cancel' : '+ New Log Entry'}
            </button>
            {!showLogForm && (
              <button style={styles.btn('secondary')} onClick={() => { setShowLogForm(true); setIsBackfill(true); loadWaybillsForLog(logs); }}>
                Backfill Historical Entry
              </button>
            )}
          </div>

          {showLogForm && (
            <div style={{ ...styles.card, marginBottom: '20px' }}>
              {isBackfill && (
                <div style={{ background: '#f59e0b22', border: '1px solid #f59e0b44', borderRadius: '6px', padding: '8px 12px', marginBottom: '14px', fontSize: '12px', color: '#f59e0b' }}>
                  Backfill mode — pick a past date and link to an existing waybill. The Historical badge will appear automatically.
                </div>
              )}
              <div style={styles.sectionTitle}>{isBackfill ? 'Backfill Log Entry' : 'New Log Entry'}</div>
              <div style={styles.grid(2)}>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Product</label>
                  <select style={styles.input} value={logForm.product_id} onChange={e => setLogForm(f => ({ ...f, product_id: e.target.value }))}>
                    <option value="">Select product…</option>
                    {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Vehicle</label>
                  <select style={styles.input} value={logForm.vehicle_id} onChange={e => {
                    const crew = assignments.filter(a => a.vehicle_id === e.target.value).map(a => a.labour_id);
                    setSelectedLoaders(crew);
                    setLogForm(f => ({ ...f, vehicle_id: e.target.value }));
                  }}>
                    <option value="">Select vehicle…</option>
                    {vehicles.map(v => <option key={v.id} value={v.id}>{v.vehicle_number}{v.vehicle_name ? ` — ${v.vehicle_name}` : ''}</option>)}
                  </select>
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Date</label>
                  <input type="date" style={styles.input} value={logForm.date} onChange={e => setLogForm(f => ({ ...f, date: e.target.value }))} />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Quantity Loaded</label>
                  <input type="number" style={styles.input} placeholder="e.g. 120" min="1" value={logForm.quantity_loaded} onChange={e => setLogForm(f => ({ ...f, quantity_loaded: e.target.value }))} />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Link to Waybill {isBackfill ? '' : '(optional)'}</label>
                  <select style={styles.input} value={logForm.waybill_id} onChange={e => {
                    const wb = waybillsForLog.find(w => w.id === e.target.value);
                    setLogForm(f => ({
                      ...f,
                      waybill_id: e.target.value,
                      ...(wb ? { date: wb.waybill_date, quantity_loaded: String(wb.quantity_loaded || f.quantity_loaded), vehicle_id: wb.vehicle_id || f.vehicle_id } : {}),
                    }));
                  }}>
                    <option value="">— {isBackfill ? 'Select waybill' : 'None (standalone load)'} —</option>
                    {waybillsForLog.map(w => <option key={w.id} value={w.id}>{w.waybill_number} · {w.waybill_date} · {w.block_type}</option>)}
                  </select>
                  {!isBackfill && waybillsForLog.length === 0 && <div style={{ fontSize: '11px', color: theme.textMuted, marginTop: '4px' }}>No unlinked waybills found. <button style={{ background: 'none', border: 'none', color: theme.blue, cursor: 'pointer', fontSize: '11px', padding: 0 }} onClick={() => loadWaybillsForLog(logs)}>Refresh</button></div>}
                </div>
              </div>
              {assignments.length > 0 && (
                <div style={styles.formGroup}>
                  <label style={styles.label}>Loaders (optional)</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {assignments.map(a => {
                      const sel = selectedLoaders.includes(a.labour_id);
                      return (
                        <button key={a.labour_id}
                          style={{ ...styles.btn(sel ? 'primary' : 'secondary'), fontSize: '12px', padding: '4px 10px' }}
                          onClick={() => setSelectedLoaders(l => sel ? l.filter(x => x !== a.labour_id) : [...l, a.labour_id])}>
                          {a.worker?.full_name || '—'}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              <button style={styles.btn('primary')} onClick={handleLogSubmit} disabled={logSaving}>
                {logSaving ? 'Saving…' : 'Save Log Entry'}
              </button>
            </div>
          )}

          {editingLogId && (
            <div style={{ ...styles.card, marginBottom: '16px', border: `1px solid ${theme.accent}44` }}>
              <div style={styles.sectionTitle}>Edit Log Entry</div>
              <div style={styles.grid(2)}>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Product</label>
                  <select style={styles.input} value={editLogForm.product_id} onChange={e => setEditLogForm(f => ({ ...f, product_id: e.target.value }))}>
                    {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Vehicle</label>
                  <select style={styles.input} value={editLogForm.vehicle_id} onChange={e => setEditLogForm(f => ({ ...f, vehicle_id: e.target.value }))}>
                    <option value="">— Select vehicle —</option>
                    {vehicles.map(v => <option key={v.id} value={v.id}>{v.vehicle_number}{v.vehicle_name ? ` — ${v.vehicle_name}` : ''}</option>)}
                  </select>
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Date</label>
                  <input type="date" style={styles.input} value={editLogForm.date} onChange={e => setEditLogForm(f => ({ ...f, date: e.target.value }))} />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Quantity Loaded</label>
                  <input type="number" style={styles.input} value={editLogForm.quantity_loaded} onChange={e => setEditLogForm(f => ({ ...f, quantity_loaded: e.target.value }))} />
                </div>
              </div>
              {assignments.length > 0 && (
                <div style={styles.formGroup}>
                  <label style={styles.label}>Loaders</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {assignments.map(a => {
                      const sel = editLogLoaders.includes(a.labour_id);
                      return (
                        <button key={a.labour_id}
                          style={{ ...styles.btn(sel ? 'primary' : 'secondary'), fontSize: '12px', padding: '4px 10px' }}
                          onClick={() => setEditLogLoaders(l => sel ? l.filter(x => x !== a.labour_id) : [...l, a.labour_id])}>
                          {a.worker?.full_name || '—'}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              <div style={styles.row}>
                <button style={styles.btn('primary')} onClick={handleEditLogSave} disabled={editLogSaving}>{editLogSaving ? 'Saving…' : 'Save'}</button>
                <button style={styles.btn('secondary')} onClick={() => setEditingLogId(null)}>Cancel</button>
              </div>
            </div>
          )}

          {deleteTarget && (
            <div style={{ ...styles.card, marginBottom: '12px', border: `1px solid ${theme.red}` }}>
              <div style={{ fontSize: '13px', marginBottom: '10px' }}>Delete this log entry? This cannot be undone.</div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button style={{ ...styles.btn('danger'), fontSize: '12px' }} onClick={() => handleDeleteLog(deleteTarget)} disabled={deleteSaving}>
                  {deleteSaving ? 'Deleting…' : 'Confirm Delete'}
                </button>
                <button style={{ ...styles.btn('secondary'), fontSize: '12px' }} onClick={() => setDeleteTarget(null)}>Cancel</button>
              </div>
            </div>
          )}

          {/* Date range filter (mirrors Labour → Payroll) */}
          <div style={{ display: 'flex', marginBottom: '14px', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div>
              <label style={styles.label}>From</label>
              <input type="date" style={{ ...styles.input, width: '148px' }} value={rangeFrom} onChange={e => setRangeFrom(e.target.value)} />
            </div>
            <div>
              <label style={styles.label}>To</label>
              <input type="date" style={{ ...styles.input, width: '148px' }} value={rangeTo} onChange={e => setRangeTo(e.target.value)} />
            </div>
            <div style={{ display: 'flex', gap: '4px', paddingBottom: '1px' }}>
              <button style={{ ...styles.btn('secondary'), padding: '6px 10px' }} onClick={() => shiftRange(-1)}>‹</button>
              <button style={{ ...styles.btn('secondary'), padding: '6px 10px' }} onClick={() => shiftRange(1)}>›</button>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: theme.textMuted, cursor: 'pointer', paddingBottom: '6px' }}>
              <input type="checkbox" checked={includeNull} onChange={e => setIncludeNull(e.target.checked)} />
              Include entries with no date ({undatedCount})
            </label>
          </div>
          {rangeFrom && rangeTo && rangeFrom > rangeTo && (
            <div style={{ fontSize: '12px', color: theme.accent, marginBottom: '10px' }}>“From” is after “To” — showing only undated entries (if included). Swap the dates to see a range.</div>
          )}

          <div style={styles.card}>
            {entriesLoading ? <Spinner /> : logs.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '20px', color: theme.textMuted }}>
                No log entries in this range.
                {!includeNull && undatedCount > 0 && <> Tick <em>“Include entries with no date ({undatedCount})”</em> above to show undated records.</>}
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>Date</th>
                      <th style={styles.th}>Product</th>
                      <th style={styles.th}>Vehicle</th>
                      <th style={styles.th}>Trip #</th>
                      <th style={styles.th}>Qty Loaded</th>
                      <th style={styles.th}>Rate Used</th>
                      <th style={styles.th}>Total</th>
                      <th style={styles.th}>Loaders</th>
                      {canDelete && <th style={styles.th}></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map(log => {
                      const isHistorical = log.date && log.created_at && log.date < log.created_at.split('T')[0];
                      const isPaid = log.payment_status === 'paid';
                      // Content lock mirrors the DB guard (truck_loading_content_guard):
                      // unlinked logs are always editable; a linked log is editable only
                      // while its payroll is still 'draft'. Missing linked payroll →
                      // treat as editable (nothing is actively locking it).
                      const payrollStatus = log.payroll?.status;
                      const payrollEditable = !log.payroll_id || !payrollStatus || payrollStatus === 'draft';
                      const logLoaderIds = (log.loaders || []).map(l => l.labour_id);
                      const logLoaderNames = logLoaderIds.map(lid => {
                        const a = assignments.find(a => a.labour_id === lid);
                        return a?.worker?.full_name || lid;
                      });
                      return (
                        <tr key={log.id}>
                          <td style={styles.td}>
                            {log.date || <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '4px', background: theme.red + '22', color: theme.red, border: `1px solid ${theme.red}44`, fontWeight: '700' }}>no date</span>}
                            {isHistorical && <span style={{ marginLeft: '6px', fontSize: '10px', padding: '1px 6px', borderRadius: '4px', background: '#f59e0b22', color: '#f59e0b', border: '1px solid #f59e0b44', fontWeight: '700' }}>Historical</span>}
                          </td>
                          <td style={styles.td}>{log.product?.name || '—'}</td>
                          <td style={styles.td}>{log.vehicle?.vehicle_number || '—'}</td>
                          <td style={styles.td}>{log.trip_number_for_day ?? '—'}</td>
                          <td style={styles.td}>{fmt(log.quantity_loaded)}</td>
                          <td style={styles.td}>{log.computed_rate_used != null ? naira(log.computed_rate_used) : '—'}</td>
                          <td style={styles.td}>{log.total_amount != null ? naira(log.total_amount) : '—'}</td>
                          <td style={styles.td}>
                            {logLoaderNames.length > 0
                              ? <span style={{ fontSize: '11px', color: theme.textMuted }}>{logLoaderNames.join(', ')}</span>
                              : <span style={{ fontSize: '11px', color: theme.textDim }}>—</span>}
                          </td>
                          {canDelete && (
                            <td style={styles.td}>
                              <div style={{ display: 'flex', gap: '6px' }}>
                                {payrollEditable ? (
                                  <button style={{ ...styles.btn('secondary'), fontSize: '11px', padding: '3px 10px' }} onClick={() => {
                                    setEditingLogId(log.id);
                                    setEditLogForm({ vehicle_id: log.vehicle_id || '', product_id: log.product_id || '', date: log.date || '', quantity_loaded: String(log.quantity_loaded || '') });
                                    setEditLogLoaders(logLoaderIds);
                                    setShowLogForm(false);
                                  }}>Edit</button>
                                ) : (
                                  <span title="Locked: linked to an approved/paid payroll" style={{ fontSize: '11px', color: theme.textMuted, padding: '3px 6px' }}>{isPaid ? 'Paid' : 'Locked'}</span>
                                )}
                                <button style={{ ...styles.btn('danger'), fontSize: '11px', padding: '3px 10px' }} onClick={() => setDeleteTarget(log.id)} disabled={!payrollEditable}>Delete</button>
                              </div>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Rates ── */}
      {tab === 'rates' && (
        <div>
          {rateAlert && <Alert msg={rateAlert.msg} type={rateAlert.type} onClose={() => setRateAlert(null)} />}
          <div style={styles.card}>
            {!ratesLoaded ? <Spinner /> : rates.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '20px', color: theme.textMuted }}>No rates configured.</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>Product</th>
                      <th style={styles.th}>Base Rate / Trip</th>
                      <th style={styles.th}>Trip Threshold</th>
                      <th style={styles.th}>Incentive Rate</th>
                      {canManageRates && <th style={styles.th}></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {rates.map(r => (
                      <tr key={r.id}>
                        <td style={styles.td}>{r.product?.name || '—'}</td>
                        {editingRate === r.id ? (
                          <>
                            <td style={styles.td}><input type="number" style={{ ...styles.input, width: '110px' }} value={rateForm.base_rate ?? ''} onChange={e => setRateForm(f => ({ ...f, base_rate: e.target.value }))} /></td>
                            <td style={styles.td}><input type="number" style={{ ...styles.input, width: '80px' }} value={rateForm.trip_threshold ?? ''} onChange={e => setRateForm(f => ({ ...f, trip_threshold: e.target.value }))} /></td>
                            <td style={styles.td}><input type="number" style={{ ...styles.input, width: '110px' }} value={rateForm.incentive_rate ?? ''} onChange={e => setRateForm(f => ({ ...f, incentive_rate: e.target.value }))} /></td>
                            <td style={styles.td}>
                              <div style={{ display: 'flex', gap: '6px' }}>
                                <button style={{ ...styles.btn('primary'), fontSize: '11px', padding: '4px 10px' }} onClick={handleRateSave} disabled={rateSaving}>{rateSaving ? '…' : 'Save'}</button>
                                <button style={{ ...styles.btn('secondary'), fontSize: '11px', padding: '4px 10px' }} onClick={() => setEditingRate(null)}>Cancel</button>
                              </div>
                            </td>
                          </>
                        ) : (
                          <>
                            <td style={styles.td}>{naira(r.base_rate)}</td>
                            <td style={styles.td}>{r.trip_threshold ?? '—'}</td>
                            <td style={styles.td}>{r.incentive_rate != null ? naira(r.incentive_rate) : '—'}</td>
                            {canManageRates && (
                              <td style={styles.td}>
                                <button style={{ ...styles.btn('secondary'), fontSize: '11px', padding: '4px 10px' }}
                                  onClick={() => { setEditingRate(r.id); setRateForm({ base_rate: r.base_rate ?? '', trip_threshold: r.trip_threshold ?? '', incentive_rate: r.incentive_rate ?? '' }); }}>
                                  Edit
                                </button>
                              </td>
                            )}
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
};

// ── TRADING MARGIN REPORT ─────────────────────────────────────
const TradingMarginReport = () => {
  const [rows, setRows]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  useEffect(() => {
    supabase.rpc('get_order_trading_margin')
      .then(({ data, error: e }) => {
        if (e) throw e;
        const normalized = (data || []).map(r => {
          const sale     = Number(r.resale_sale_amount)     || 0;
          const purchase = Number(r.purchase_cost)          || 0;
          const fuel     = Number(r.attributed_fuel_cost)   || 0;
          const loading  = Number(r.attributed_loading_cost)|| 0;
          const haulage  = Number(r.attributed_haulage_cost)|| 0;
          const landed   = purchase + fuel + loading + haulage;
          return { ...r, sale_amount: sale, purchase_cost: purchase, gross_margin: sale - purchase, fuel_cost: fuel, loading_cost: loading, haulage_cost: haulage, landed_cost: landed, true_margin: sale - landed };
        });
        setRows(normalized);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const totals = rows.reduce((acc, r) => ({
    sale:          acc.sale          + (r.sale_amount   || 0),
    purchase:      acc.purchase      + (r.purchase_cost || 0),
    grossMargin:   acc.grossMargin   + (r.gross_margin  || 0),
    fuel:          acc.fuel          + (r.fuel_cost     || 0),
    loading:       acc.loading       + (r.loading_cost  || 0),
    haulage:       acc.haulage       + (r.haulage_cost  || 0),
    landed:        acc.landed        + (r.landed_cost   || 0),
    trueMargin:    acc.trueMargin    + (r.true_margin   || 0),
  }), { sale: 0, purchase: 0, grossMargin: 0, fuel: 0, loading: 0, haulage: 0, landed: 0, trueMargin: 0 });

  const pct = (num, den) => den > 0 ? ((num / den) * 100).toFixed(1) + '%' : '—';
  const mc  = v => v > 0 ? theme.green : v < 0 ? theme.red : theme.textMuted;

  const SummaryCard = ({ label, value, sub, color }) => (
    <div style={{ flex: 1, minWidth: '160px', background: theme.card, border: `1px solid ${theme.border}`, borderRadius: '10px', padding: '16px 18px' }}>
      <div style={{ fontSize: '10px', fontWeight: '700', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '6px' }}>{label}</div>
      <div style={{ fontSize: '19px', fontWeight: '700', color }}>{value}</div>
      {sub && <div style={{ fontSize: '11px', color, opacity: 0.75, marginTop: '2px' }}>{sub} of sales</div>}
    </div>
  );

  const thD = { ...styles.th, color: '#f59e0b' };
  const tdD = (v) => ({ ...styles.td, color: v > 0 ? '#f59e0b' : theme.textMuted });

  return (
    <div>
      <div style={styles.header}>
        <div>
          <div style={styles.pageTitle}>Trading Margin Report</div>
          <div style={styles.pageSubtitle}>Per-order gross margin vs. true margin after delivery costs</div>
        </div>
      </div>

      {!loading && !error && rows.length > 0 && (
        <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
          <SummaryCard label="Total Sale Value"   value={naira(totals.sale)}        color={theme.text} />
          <SummaryCard label="Gross Margin"        value={naira(totals.grossMargin)} sub={pct(totals.grossMargin, totals.sale)} color={mc(totals.grossMargin)} />
          <SummaryCard label="Total Delivery Costs" value={naira(totals.fuel + totals.loading + totals.haulage)} sub={pct(totals.fuel + totals.loading + totals.haulage, totals.sale)} color="#f59e0b" />
          <SummaryCard label="True Margin"         value={naira(totals.trueMargin)}  sub={pct(totals.trueMargin, totals.sale)}  color={mc(totals.trueMargin)} />
        </div>
      )}

      <div style={styles.card}>
        {loading ? <Spinner /> : error ? (
          <div style={{ color: theme.red, padding: '20px', fontSize: '13px' }}>{error}</div>
        ) : rows.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '30px', color: theme.textMuted }}>No orders with resale line items found.</div>
        ) : (
          <>
            <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '14px' }}>
              <span style={{ color: theme.green }}>■</span> Gross margin (before delivery) &nbsp;
              <span style={{ color: '#f59e0b' }}>■</span> Delivery cost drag (fuel · loading · haulage) &nbsp;
              <span style={{ color: theme.green }}>■</span>/<span style={{ color: theme.red }}>■</span> True margin (after delivery)
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Reference</th>
                    <th style={styles.th}>Customer</th>
                    <th style={styles.th}>Date</th>
                    <th style={styles.th}>Sale Amount</th>
                    <th style={styles.th}>Purchase Cost</th>
                    <th style={{ ...styles.th, color: theme.green }}>Gross Margin</th>
                    <th style={thD}>Fuel Cost</th>
                    <th style={thD}>Loading Cost</th>
                    <th style={thD}>Haulage Cost</th>
                    <th style={styles.th}>Landed Cost</th>
                    <th style={{ ...styles.th, color: theme.green }}>True Margin</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => {
                    const drag = (r.gross_margin || 0) - (r.true_margin || 0);
                    return (
                      <tr key={r.order_id || i}>
                        <td style={styles.td}><strong style={{ fontFamily: 'monospace', fontSize: '12px' }}>{r.invoice_number || (r.order_id ? r.order_id.slice(0, 8) + ' (not invoiced)' : '—')}</strong></td>
                        <td style={styles.td}>{r.customer_name || '—'}</td>
                        <td style={styles.td}>{r.order_date ? new Date(r.order_date).toLocaleDateString('en-GB') : '—'}</td>
                        <td style={styles.td}><strong>{naira(r.sale_amount)}</strong></td>
                        <td style={styles.td}>{naira(r.purchase_cost)}</td>
                        <td style={styles.td}>
                          <div style={{ fontWeight: '700', color: mc(r.gross_margin) }}>{naira(r.gross_margin)}</div>
                          <div style={{ fontSize: '11px', color: theme.textMuted }}>{pct(r.gross_margin, r.sale_amount)}</div>
                        </td>
                        <td style={tdD(r.fuel_cost)}>{naira(r.fuel_cost || 0)}</td>
                        <td style={tdD(r.loading_cost)}>{naira(r.loading_cost || 0)}</td>
                        <td style={tdD(r.haulage_cost)}>{naira(r.haulage_cost || 0)}</td>
                        <td style={styles.td}>{naira(r.landed_cost)}</td>
                        <td style={styles.td}>
                          <div style={{ fontWeight: '700', color: mc(r.true_margin) }}>{naira(r.true_margin)}</div>
                          <div style={{ fontSize: '11px', color: theme.textMuted }}>{pct(r.true_margin, r.sale_amount)}</div>
                          {drag > 0 && (
                            <div style={{ fontSize: '10px', color: '#f59e0b', marginTop: '2px' }}>▼ {naira(drag)} delivery drag</div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ background: theme.surface, fontWeight: '600' }}>
                    <td colSpan={3} style={{ ...styles.td, fontWeight: '700', color: theme.textMuted }}>Totals ({rows.length} orders)</td>
                    <td style={styles.td}><strong>{naira(totals.sale)}</strong></td>
                    <td style={styles.td}>{naira(totals.purchase)}</td>
                    <td style={styles.td}>
                      <div style={{ fontWeight: '700', color: mc(totals.grossMargin) }}>{naira(totals.grossMargin)}</div>
                      <div style={{ fontSize: '11px', color: theme.textMuted }}>{pct(totals.grossMargin, totals.sale)}</div>
                    </td>
                    <td style={{ ...styles.td, color: '#f59e0b', fontWeight: '700' }}>{naira(totals.fuel)}</td>
                    <td style={{ ...styles.td, color: '#f59e0b', fontWeight: '700' }}>{naira(totals.loading)}</td>
                    <td style={{ ...styles.td, color: '#f59e0b', fontWeight: '700' }}>{naira(totals.haulage)}</td>
                    <td style={{ ...styles.td, fontWeight: '700' }}>{naira(totals.landed)}</td>
                    <td style={styles.td}>
                      <div style={{ fontWeight: '700', color: mc(totals.trueMargin) }}>{naira(totals.trueMargin)}</div>
                      <div style={{ fontSize: '11px', color: theme.textMuted }}>{pct(totals.trueMargin, totals.sale)}</div>
                      {totals.grossMargin > totals.trueMargin && (
                        <div style={{ fontSize: '10px', color: '#f59e0b', marginTop: '2px' }}>▼ {naira(totals.grossMargin - totals.trueMargin)} total delivery drag</div>
                      )}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

// ── NAV ───────────────────────────────────────────────────────
const navItems = [
  { section: "Overview", items: [{ id: "dashboard", label: "Dashboard", icon: "dashboard" }] },
  { section: "Production", items: [
    { id: "production", label: "Production", icon: "production" },
    { id: "inventory", label: "Inventory", icon: "inventory" },
    { id: "batches", label: "Batches", icon: "batches" },
    { id: "maintenance", label: "Maintenance", icon: "maintenance" },
  ]},
  { section: "Logistics", items: [
    { id: "waybills", label: "Waybills", icon: "waybill" },
    { id: "vehicles", label: "Vehicles", icon: "truck" },
    { id: "truck_loading", label: "Truck Loading", icon: "truck" },
    { id: "pending_register", label: "Pending Deliveries", icon: "pending" },
    { id: "daily_schedule", label: "Daily Schedule", icon: "schedule" },
  ]},
  { section: "HR & Workforce", items: [
    { id: "staff", label: "Staff", icon: "staff" },
    { id: "labour", label: "Labour", icon: "staff" },
    { id: "disciplinary", label: "Disciplinary", icon: "staff" },
    { id: "attendance_kiosk", label: "Attendance Kiosk", icon: "staff" },
    { id: "attendance_flags", label: "Attendance Flags", icon: "staff" },
    { id: "leave", label: "Leave Requests", icon: "staff" },
    { id: "advances", label: "Salary Advances", icon: "orders" },
  ]},
  { section: "Sales", items: [{ id: "customers", label: "Customers", icon: "staff" }, { id: "orders", label: "Orders & Invoicing", icon: "orders" }] },
  { section: "Approvals", items: [
    { id: "lpo_approvals", label: "LPO Approvals", icon: "lpo" },
    { id: "schedule_approvals", label: "Schedule Approvals", icon: "approve" },
  ]},
  { section: "Analytics", items: [
    { id: "reports", label: "Reports", icon: "reports" },
    { id: "kpi_dashboard", label: "KPI Dashboard", icon: "reports" },
    { id: "trading_margin", label: "Trading Margin", icon: "orders" },
  ]},
  { section: "Finance", items: [
    { id: "accounting", label: "Accounting", icon: "orders" },
    { id: "payment_requests", label: "Payment Requests", icon: "orders" },
  ]},
  { section: "Settings", items: [
    { id: "products", label: "Products", icon: "products" },
    { id: "suppliers", label: "Suppliers", icon: "supplier" },
    { id: "data_import", label: "Data Import", icon: "orders" },
    { id: "user_management", label: "User Management", icon: "staff" },
  ]},
  { section: "Account", items: [
    { id: "messages", label: "Messages", icon: "staff" },
    { id: "my_hr", label: "My HR", icon: "staff" },
    { id: "my_profile", label: "My Profile", icon: "staff" },
  ]},
];

// ── ROLE GRANTS (MD-only) ─────────────────────────────────────
// Temporary additional roles: grant/revoke, with a separation-of-duties
// warning (advisory — MD may accept and proceed). MD is never grantable.
const RoleGrantsManager = ({ users }) => {
  const [grants, setGrants]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [gErr, setGErr]       = useState('');
  const [gOk, setGOk]         = useState('');
  const [form, setForm]       = useState({ user_id: '', role: '', reason: '', expires_at: '' });
  const [conflict, setConflict] = useState(null);   // warning string awaiting confirmation
  const [busy, setBusy]       = useState(false);
  const [revoking, setRevoking] = useState(null);

  const grantableRoles = APP_ROLES.filter(r => r.id !== 'md');
  const userName = (id) => users.find(u => u.id === id)?.full_name || users.find(u => u.id === id)?.email || 'Unknown';
  const userPrimary = (id) => { const u = users.find(u => u.id === id); return u ? (APP_ROLES.find(r => r.id === u.role)?.label || u.role) : '—'; };
  const roleLabel = (id) => APP_ROLES.find(r => r.id === id)?.label || id;

  const load = async () => {
    setLoading(true);
    try { setGrants(await authService.listActiveGrants()); }
    catch (e) { setGErr(e?.message || 'Could not load grants'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  // Grant: check conflict first; if the DB flags one, require explicit confirm.
  const submitGrant = async (bypassConflict = false) => {
    setGErr(''); setGOk('');
    if (!form.user_id || !form.role) { setGErr('Pick a user and a role.'); return; }
    if (form.role === 'md') { setGErr('MD cannot be granted.'); return; }
    setBusy(true);
    try {
      if (!bypassConflict) {
        const warning = await authService.checkRoleConflict(form.user_id, form.role);
        if (warning) { setConflict(warning); setBusy(false); return; }
      }
      const expiresIso = form.expires_at ? new Date(form.expires_at + 'T23:59:59').toISOString() : null;
      await authService.grantRole(form.user_id, form.role, form.reason.trim() || null, expiresIso);
      setConflict(null);
      setForm({ user_id: '', role: '', reason: '', expires_at: '' });
      setGOk('Role granted.');
      setTimeout(() => setGOk(''), 3000);
      await load();
    } catch (e) { setGErr(e?.message || 'Grant failed.'); setConflict(null); }
    finally { setBusy(false); }
  };

  const revoke = async (g) => {
    setRevoking(g.id);
    try { await authService.revokeRole(g.user_id, g.role); await load(); }
    catch (e) { setGErr(e?.message || 'Revoke failed.'); }
    finally { setRevoking(null); }
  };

  const fmtD = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
  const expiringSoon = (d) => d && new Date(d) < new Date(Date.now() + 14 * 86400000);

  return (
    <div style={{ ...styles.card, marginTop: '20px' }}>
      <div style={{ fontWeight: '700', fontSize: '15px', marginBottom: '4px' }}>Role Grants — temporary additional roles</div>
      <div style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '16px' }}>
        Grant a user extra roles beyond their primary one (e.g. cover HR or accounting while short-staffed). MD cannot be granted. Grants default to 90 days if no expiry is set.
      </div>
      {gErr && <Alert msg={gErr} onClose={() => setGErr('')} />}
      {gOk  && <Alert msg={gOk} type="success" onClose={() => setGOk('')} />}

      {/* Grant form */}
      <div style={{ ...styles.grid(4), marginBottom: '10px' }}>
        <div style={styles.formGroup}>
          <label style={styles.label}>User</label>
          <select style={styles.input} value={form.user_id} onChange={e => { setForm(f => ({ ...f, user_id: e.target.value })); setConflict(null); }}>
            <option value="">— Select user —</option>
            {[...users].sort((a,b)=>(a.full_name||'').localeCompare(b.full_name||'')).map(u => <option key={u.id} value={u.id}>{u.full_name || u.email} ({roleLabel(u.role)})</option>)}
          </select>
        </div>
        <div style={styles.formGroup}>
          <label style={styles.label}>Role to grant</label>
          <select style={styles.input} value={form.role} onChange={e => { setForm(f => ({ ...f, role: e.target.value })); setConflict(null); }}>
            <option value="">— Select role —</option>
            {grantableRoles.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
        </div>
        <div style={styles.formGroup}>
          <label style={styles.label}>Expiry (optional)</label>
          <input type="date" style={styles.input} value={form.expires_at} onChange={e => setForm(f => ({ ...f, expires_at: e.target.value }))} />
        </div>
        <div style={styles.formGroup}>
          <label style={styles.label}>Reason (optional)</label>
          <input style={styles.input} placeholder="e.g. covering HR leave" value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} />
        </div>
      </div>

      {conflict ? (
        <div style={{ padding: '12px 14px', borderRadius: '8px', background: theme.red + '18', border: `1px solid ${theme.red}55`, marginBottom: '12px' }}>
          <div style={{ fontSize: '13px', color: theme.text, fontWeight: '600', marginBottom: '6px' }}>⚠ Separation-of-duties warning</div>
          <div style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '10px' }}>{conflict}</div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button style={styles.btn('danger')} disabled={busy} onClick={() => submitGrant(true)}>{busy ? 'Granting…' : 'Grant anyway'}</button>
            <button style={styles.btn('secondary')} disabled={busy} onClick={() => setConflict(null)}>Cancel</button>
          </div>
        </div>
      ) : (
        <button style={styles.btn('primary')} disabled={busy} onClick={() => submitGrant(false)}>{busy ? 'Checking…' : '+ Grant Role'}</button>
      )}

      {/* Active grants */}
      <div style={{ fontWeight: '700', fontSize: '13px', margin: '20px 0 8px' }}>Active grants ({grants.length})</div>
      {loading ? <Spinner /> : grants.length === 0 ? (
        <div style={{ fontSize: '13px', color: theme.textMuted, padding: '8px 0' }}>No active role grants.</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={styles.table}>
            <thead><tr>{['User', 'Primary Role', 'Granted Role', 'Granted By', 'Granted', 'Expires', ''].map(h => <th key={h} style={styles.th}>{h}</th>)}</tr></thead>
            <tbody>
              {grants.map(g => (
                <tr key={g.id}>
                  <td style={styles.td}>{userName(g.user_id)}</td>
                  <td style={styles.td}><span style={{ fontSize: '12px', color: theme.textMuted }}>{userPrimary(g.user_id)}</span></td>
                  <td style={styles.td}><span style={styles.badge(theme.accent)}>{roleLabel(g.role)}</span></td>
                  <td style={styles.td}>{g.granted_by_name || '—'}</td>
                  <td style={styles.td}>{fmtD(g.granted_at)}</td>
                  <td style={styles.td}>
                    {fmtD(g.expires_at)}
                    {expiringSoon(g.expires_at) && <span style={{ marginLeft: '6px', fontSize: '10px', padding: '1px 6px', borderRadius: '4px', background: '#f59e0b22', color: '#f59e0b', border: '1px solid #f59e0b44', fontWeight: '700' }}>expiring soon</span>}
                  </td>
                  <td style={styles.td}>
                    <button style={{ ...styles.btn('danger'), padding: '4px 10px', fontSize: '11px' }} disabled={revoking === g.id} onClick={() => revoke(g)}>{revoking === g.id ? '…' : 'Revoke'}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

// ── USER MANAGEMENT ───────────────────────────────────────────
const UserManagement = ({ userProfile }) => {
  const [users, setUsers]         = useState([]);
  const [staffList, setStaffList] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [err, setErr]             = useState('');
  const [ok, setOk]               = useState('');
  const [search, setSearch]       = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating]   = useState(false);

  // Create-form state
  const [form, setForm]           = useState({ full_name: '', email: '', password: '', role: 'staff', staff_id: null });
  const [staffSearch, setStaffSearch] = useState('');
  const [showStaffDrop, setShowStaffDrop] = useState(false);
  const [staffMode, setStaffMode] = useState('search'); // 'search' | 'manual'
  const [selectedStaff, setSelectedStaff] = useState(null);
  const [duplicateUser, setDuplicateUser] = useState(null);

  useEffect(() => {
    Promise.all([authService.listUsers(), authService.getStaffList()])
      .then(([u, s]) => { setUsers(u); setStaffList(s); })
      .catch(e => setErr(e?.message || 'An error occurred'))
      .finally(() => setLoading(false));
  }, []);

  const resetForm = () => {
    setForm({ full_name: '', email: '', password: '', role: 'staff', staff_id: null });
    setStaffSearch(''); setStaffMode('search'); setSelectedStaff(null); setDuplicateUser(null);
  };

  const filteredStaff = staffList.filter(s =>
    !staffSearch || s.full_name.toLowerCase().includes(staffSearch.toLowerCase())
  );

  const selectStaff = (s) => {
    const dup = users.find(u => u.staff_id === s.id);
    setDuplicateUser(dup || null);
    setSelectedStaff(s);
    setForm(p => ({ ...p, full_name: s.full_name, staff_id: s.id }));
    setStaffSearch(s.full_name);
    setShowStaffDrop(false);
  };

  const selectManual = () => {
    setStaffMode('manual'); setSelectedStaff(null);
    setForm(p => ({ ...p, full_name: '', staff_id: null }));
    setStaffSearch(''); setShowStaffDrop(false); setDuplicateUser(null);
  };

  const emailDuplicate = form.email ? users.find(u => u.email === form.email) : null;

  const handleCreate = async (e) => {
    e.preventDefault();
    if (form.password.length < 6) { setErr('Password must be at least 6 characters'); return; }
    if (emailDuplicate) { setErr(`This email is already in use by ${emailDuplicate.full_name}.`); return; }
    if (duplicateUser) { setErr(`${selectedStaff?.full_name} already has a system account.`); return; }
    setCreating(true); setErr('');
    try {
      const profile = await authService.createUser(form.email, form.password, form.full_name, form.role, form.staff_id || null);
      setUsers(p => [...p, profile].sort((a, b) => (a.full_name||'').localeCompare(b.full_name||'')));
      setOk(`${form.full_name} created. Share the temporary password with them.`);
      setTimeout(() => setOk(''), 5000);
      resetForm(); setShowCreate(false);
    } catch(e) { setErr(e?.message || 'An error occurred'); }
    finally { setCreating(false); }
  };

  const updateRole = async (id, role) => {
    try { await authService.updateUserRole(id, role); setUsers(p => p.map(u => u.id === id ? {...u, role} : u)); setOk('Role updated'); setTimeout(() => setOk(''), 2000); }
    catch(e) { setErr(e?.message || 'An error occurred'); }
  };
  const toggleActive = async (id, isActive) => {
    try { await authService.toggleUserActive(id, isActive); setUsers(p => p.map(u => u.id === id ? {...u, is_active: isActive} : u)); }
    catch(e) { setErr(e?.message || 'An error occurred'); }
  };
  const handleResetPwd = async (email, name) => {
    try { await authService.resetPassword(email); setOk(`Password reset email sent to ${name}.`); setTimeout(() => setOk(''), 4000); }
    catch(e) { setErr(e?.message || 'An error occurred'); }
  };

  const isMD = userProfile?.role === 'md';

  const filteredUsers = users.filter(u =>
    !search ||
    (u.full_name||'').toLowerCase().includes(search.toLowerCase()) ||
    (u.email||'').toLowerCase().includes(search.toLowerCase()) ||
    (APP_ROLES.find(r => r.id === u.role)?.label || '').toLowerCase().includes(search.toLowerCase())
  );

  const avatarColors = ['#4f8ef7','#27ae60','#e67e22','#9b59b6','#e74c3c','#16a085','#2980b9','#8e44ad'];
  const avatarColor = (name) => { let h = 0; for (let c of (name||'')) h = (h*31 + c.charCodeAt(0)) % avatarColors.length; return avatarColors[Math.abs(h)]; };
  const initials = (name) => (name||'?').split(' ').map(p=>p[0]).join('').slice(0,2).toUpperCase();

  const labelSt = { display:'block', fontSize:'11px', color:theme.textMuted, marginBottom:'4px', textTransform:'uppercase', letterSpacing:'0.06em' };
  const isRoleBoard = form.role === 'board_member';

  return (
    <div>
      <div style={styles.header}>
        <div><div style={styles.pageTitle}>User Management</div><div style={styles.pageSubtitle}>Manage system users and roles — MD access only</div></div>
        {isMD && <button style={styles.btn('primary')} onClick={() => { setShowCreate(s => !s); setErr(''); if (showCreate) resetForm(); }}>{showCreate ? '✕ Cancel' : '+ Add User'}</button>}
      </div>
      {err && <Alert msg={err} onClose={() => setErr('')} />}
      {ok  && <Alert msg={ok} type="success" onClose={() => setOk('')} />}

      {showCreate && (
        <div style={{ ...styles.card, marginBottom:'16px' }}>
          <div style={{ fontWeight:'700', fontSize:'14px', marginBottom:'16px' }}>Create New User</div>
          <form onSubmit={handleCreate}>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px', marginBottom:'14px' }}>

              {/* STAFF COMBO */}
              <div style={{ position:'relative' }}>
                <label style={labelSt}>Staff Member *</label>
                {staffMode === 'search' ? (
                  <>
                    <input
                      style={styles.input}
                      value={staffSearch}
                      onChange={e => { setStaffSearch(e.target.value); setShowStaffDrop(true); setSelectedStaff(null); setForm(p=>({...p, full_name:'', staff_id:null})); setDuplicateUser(null); }}
                      onFocus={() => setShowStaffDrop(true)}
                      onBlur={() => setTimeout(() => setShowStaffDrop(false), 200)}
                      onKeyDown={e => e.key === 'Escape' && setShowStaffDrop(false)}
                      placeholder="Search staff by name…"
                      autoComplete="off"
                    />
                    {showStaffDrop && (
                      <div style={{ position:'absolute', top:'100%', left:0, right:0, background:theme.surface, border:`1px solid ${theme.border}`, borderRadius:'8px', zIndex:100, maxHeight:'220px', overflowY:'auto', boxShadow:'0 8px 24px rgba(0,0,0,0.4)', marginTop:'2px' }}>
                        {filteredStaff.length === 0 && staffSearch && (
                          <div style={{ padding:'10px 12px', color:theme.textMuted, fontSize:'12px' }}>No staff match "{staffSearch}"</div>
                        )}
                        {filteredStaff.map(s => (
                          <div key={s.id} onMouseDown={() => selectStaff(s)} style={{ padding:'10px 12px', cursor:'pointer', borderBottom:`1px solid ${theme.border}22` }}>
                            <div style={{ fontWeight:'600', fontSize:'13px' }}>{s.full_name}</div>
                            <div style={{ fontSize:'11px', color:theme.textMuted }}>{s.role} · {s.staff_type === 'permanent' ? 'Permanent' : 'Daily'}</div>
                          </div>
                        ))}
                        <div onMouseDown={selectManual} style={{ padding:'10px 12px', cursor:'pointer', borderTop:`1px solid ${theme.border}`, color:theme.accent, fontSize:'12px', fontWeight:'600' }}>
                          + Not in staff list — enter manually
                        </div>
                      </div>
                    )}
                    {selectedStaff && !duplicateUser && (
                      <div style={{ marginTop:'6px', fontSize:'11px', color:theme.textMuted, padding:'6px 10px', background:theme.accent+'11', borderRadius:'6px' }}>
                        ✓ {selectedStaff.full_name} · {selectedStaff.role} · {selectedStaff.staff_type === 'permanent' ? 'Permanent' : 'Daily'}
                      </div>
                    )}
                    {duplicateUser && (
                      <div style={{ marginTop:'6px', padding:'8px 10px', background:theme.red+'18', border:`1px solid ${theme.red}44`, borderRadius:'6px', fontSize:'12px' }}>
                        <div style={{ color:theme.red, fontWeight:'700' }}>⚠ {selectedStaff?.full_name} already has a system account</div>
                        <div style={{ color:theme.textMuted, marginTop:'2px' }}>{duplicateUser.email} · {APP_ROLES.find(r=>r.id===duplicateUser.role)?.label || duplicateUser.role}</div>
                        <div style={{ marginTop:'6px', fontSize:'11px', color:theme.textMuted }}>Update their role using the table below instead.</div>
                      </div>
                    )}
                    {isRoleBoard && !duplicateUser && (
                      <div style={{ marginTop:'6px', fontSize:'11px', color:theme.accent }}>
                        Board members are typically not in the staff list — select "Not in staff list" above.
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <input style={styles.input} value={form.full_name} onChange={e => setForm(p=>({...p, full_name:e.target.value}))} placeholder="Full name" required />
                    <div style={{ marginTop:'6px', fontSize:'11px', color:theme.textMuted }}>
                      This user will not be linked to a staff record.{' '}
                      <span style={{ color:theme.accent, cursor:'pointer', textDecoration:'underline' }} onClick={() => { setStaffMode('search'); setForm(p=>({...p, full_name:'', staff_id:null})); }}>Search staff instead</span>
                    </div>
                  </>
                )}
              </div>

              {/* EMAIL */}
              <div>
                <label style={labelSt}>Email Address *</label>
                <input style={{ ...styles.input, ...(emailDuplicate ? { borderColor:theme.red } : {}) }} type="email" value={form.email} onChange={e => setForm(p=>({...p, email:e.target.value}))} placeholder="user@company.com" required />
                {emailDuplicate && <div style={{ marginTop:'4px', fontSize:'11px', color:theme.red }}>Already in use by {emailDuplicate.full_name}.</div>}
              </div>

              {/* PASSWORD */}
              <div>
                <label style={labelSt}>Temporary Password *</label>
                <input style={styles.input} type="password" value={form.password} onChange={e => setForm(p=>({...p, password:e.target.value}))} placeholder="Min. 6 characters" required minLength={6} />
              </div>

              {/* ROLE */}
              <div>
                <label style={labelSt}>Role *</label>
                <select style={styles.input} value={form.role} onChange={e => setForm(p=>({...p, role:e.target.value}))}>
                  {APP_ROLES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
                </select>
                {isRoleBoard && (
                  <div style={{ marginTop:'6px', fontSize:'11px', color:theme.accent, padding:'6px 10px', background:theme.accent+'11', borderRadius:'6px' }}>
                    Board Members have read-only access to all modules including financial statements.
                  </div>
                )}
              </div>
            </div>

            <div style={{ display:'flex', gap:'10px', alignItems:'center' }}>
              <button type="submit" style={styles.btn('primary')} disabled={creating || !!duplicateUser || !!emailDuplicate}>
                {creating ? 'Creating…' : 'Create User'}
              </button>
              <button type="button" style={styles.btn('secondary')} onClick={() => { setShowCreate(false); resetForm(); }}>Cancel</button>
            </div>
            <div style={{ marginTop:'10px', fontSize:'11px', color:theme.textMuted }}>
              Share the temporary password privately — the user can log in immediately.
            </div>
          </form>
        </div>
      )}

      {loading ? <Spinner /> : (
        <div style={styles.card}>
          <input style={{ ...styles.input, maxWidth:'320px', marginBottom:'14px' }} value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name, email or role…" />
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'13px' }}>
            <thead>
              <tr style={{ borderBottom:`2px solid ${theme.border}` }}>
                {['','Name','Email','Role','Staff Record','Status','Last Login','Actions'].map(h =>
                  <th key={h} style={{ padding:'8px 10px', textAlign:'left', color:theme.textMuted, fontWeight:'700', fontSize:'11px', textTransform:'uppercase', letterSpacing:'0.06em' }}>{h}</th>
                )}
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map(u => {
                const col = avatarColor(u.full_name);
                const linked = staffList.find(s => s.id === u.staff_id);
                return (
                  <tr key={u.id} style={{ borderBottom:`1px solid ${theme.border}22` }}>
                    <td style={{ padding:'8px 10px' }}>
                      <div style={{ width:'34px', height:'34px', borderRadius:'50%', background:col, display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontWeight:'700', fontSize:'12px' }}>
                        {initials(u.full_name)}
                      </div>
                    </td>
                    <td style={{ padding:'8px 10px', fontWeight:'600' }}>{u.full_name}</td>
                    <td style={{ padding:'8px 10px', color:theme.textMuted, fontSize:'12px' }}>{u.email}</td>
                    <td style={{ padding:'8px 10px' }}>
                      {isMD && u.id !== userProfile?.id ? (
                        <select style={{ ...styles.input, padding:'3px 6px', fontSize:'12px', width:'auto' }} value={u.role} onChange={e => updateRole(u.id, e.target.value)}>
                          {APP_ROLES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
                        </select>
                      ) : (
                        <span style={{ background:col+'22', color:col, borderRadius:'4px', padding:'2px 8px', fontSize:'11px', fontWeight:'700', whiteSpace:'nowrap' }}>
                          {APP_ROLES.find(r=>r.id===u.role)?.label || u.role}
                        </span>
                      )}
                    </td>
                    <td style={{ padding:'8px 10px', fontSize:'12px' }}>
                      {linked
                        ? <span style={{ color:theme.green, fontWeight:'600' }}>✓ {linked.full_name}</span>
                        : <span style={{ color:theme.textMuted }}>—</span>}
                    </td>
                    <td style={{ padding:'8px 10px' }}>
                      <span style={{ background:u.is_active?theme.green+'22':theme.red+'22', color:u.is_active?theme.green:theme.red, borderRadius:'4px', padding:'2px 8px', fontSize:'11px', fontWeight:'700' }}>
                        {u.is_active?'Active':'Inactive'}
                      </span>
                    </td>
                    <td style={{ padding:'8px 10px', color:theme.textMuted, fontSize:'11px' }}>
                      {u.last_login ? new Date(u.last_login).toLocaleString('en-GB',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}) : '—'}
                    </td>
                    <td style={{ padding:'8px 10px' }}>
                      {u.id !== userProfile?.id && isMD && (
                        <div style={{ display:'flex', gap:'6px', flexWrap:'wrap' }}>
                          <button style={{ ...styles.btn('secondary'), padding:'3px 8px', fontSize:'11px' }} onClick={() => handleResetPwd(u.email, u.full_name)}>Reset Pwd</button>
                          <button style={{ ...styles.btn(u.is_active?'danger':'secondary'), padding:'3px 8px', fontSize:'11px' }} onClick={() => toggleActive(u.id, !u.is_active)}>
                            {u.is_active?'Deactivate':'Activate'}
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
              {!filteredUsers.length && (
                <tr><td colSpan={8} style={{ padding:'20px', textAlign:'center', color:theme.textMuted }}>
                  {search ? `No users match "${search}"` : 'No users found. Create the first user above.'}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {isMD && <RoleGrantsManager users={users} />}
    </div>
  );
};

// ── APP ───────────────────────────────────────────────────────
export default function App() {
  const [session, setSession] = useState(undefined); // undefined = loading
  const [userProfile, setUserProfile] = useState(null);
  const [active, setActive] = useState("dashboard");
  const [lowStockCount, setLowStockCount] = useState(0);
  const [lpoCount, setLpoCount] = useState(0);
  const [scheduleCount, setScheduleCount] = useState(0);
  const [unreadMsgCount, setUnreadMsgCount] = useState(0);
  const [showChangePwd, setShowChangePwd] = useState(false);
  const [sessionWarning, setSessionWarning] = useState(false); // 15-min expiry warning
  const [sessionMinutes, setSessionMinutes] = useState(15);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' && window.innerWidth <= 768);

  // ── Auth ──────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session || null);
      if (session) loadProfile(session.user);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session || null);
      if (!session) { setUserProfile(null); }
    });
    return () => subscription.unsubscribe();
  }, []);

  // ── Session expiry monitor ────────────────────────────────
  useEffect(() => {
    if (!session) return;
    const check = () => {
      const expiresAt = session.expires_at; // unix timestamp (seconds)
      if (!expiresAt) return;
      const secsLeft = expiresAt - Math.floor(Date.now() / 1000);
      const minsLeft = Math.floor(secsLeft / 60);
      if (secsLeft <= 0) {
        supabase.auth.signOut();
        return;
      }
      if (secsLeft <= 900) { // 15 minutes
        setSessionWarning(true);
        setSessionMinutes(minsLeft);
      } else {
        setSessionWarning(false);
      }
    };
    check();
    const interval = setInterval(check, 60000);
    return () => clearInterval(interval);
  }, [session]);

  // ── Mobile sidebar ────────────────────────────────────────
  useEffect(() => {
    const onResize = () => {
      const mobile = window.innerWidth <= 768;
      setIsMobile(mobile);
      if (!mobile) setSidebarOpen(false);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const handleExtendSession = async () => {
    try { await supabase.auth.refreshSession(); setSessionWarning(false); } catch { /* ignore */ }
  };

  // Attach the user's effective roles (primary + active grants) from the DB.
  // Falls back to [primary role] on null/empty/error so a hiccup degrades to
  // single-role behaviour rather than locking the user out.
  const attachEffectiveRoles = async (profile) => {
    if (!profile) return profile;
    try {
      const { data, error } = await supabase.rpc('my_effective_roles');
      if (error) throw error;
      const roles = Array.isArray(data) && data.length ? data : [profile.role];
      return { ...profile, effectiveRoles: roles };
    } catch {
      return { ...profile, effectiveRoles: profile.role ? [profile.role] : [] };
    }
  };

  const loadProfile = async (user) => {
    try {
      const profile = await authService.getProfile(user.id);
      setUserProfile(await attachEffectiveRoles(profile));
      supabase.from('user_profiles').update({ last_login: new Date().toISOString() }).eq('id', user.id).then(() => {}).catch(() => {});
    } catch {
      // Auto-create profile on first login
      try {
        const namePart = user.email.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        const profile = await authService.upsertProfile(user.id, user.email, namePart, 'staff');
        setUserProfile(await attachEffectiveRoles(profile));
      } catch { setUserProfile({ id: user.id, email: user.email, full_name: user.email, role: 'staff', is_active: true, effectiveRoles: ['staff'] }); }
    }
  };

  const handleLogin = async (profile) => { setUserProfile(await attachEffectiveRoles(profile)); };
  const handleLogout = async () => { await authService.signOut(); setSession(null); setUserProfile(null); setActive('dashboard'); };

  // Load approval badge counts (must be before any conditional returns)
  useEffect(() => {
    lpoService.getPending().then(l => setLpoCount(l.length)).catch(() => {});
    schedulesService.getSubmitted().then(s => setScheduleCount(s.length)).catch(() => {});
  }, [active]);

  // Poll unread message count for the nav badge (30s interval; skip while on Messages page)
  useEffect(() => {
    if (!userProfile || active === 'messages') return;
    messagesService.getTotalUnread(userProfile.id).then(setUnreadMsgCount).catch(() => {});
    const interval = setInterval(() => {
      messagesService.getTotalUnread(userProfile.id).then(setUnreadMsgCount).catch(() => {});
    }, 30000);
    return () => clearInterval(interval);
  }, [active, userProfile]);

  if (session === undefined) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#0f1117' }}>
      <div style={{ color: '#e8eaf0', fontSize: '14px' }}>Loading…</div>
    </div>
  );
  if (!session) return <LoginScreen onLogin={handleLogin} />;

  const role = userProfile?.role || 'staff';
  const isBoard = role === 'board_member';
  const isICO   = role === 'ico';
  const isMD    = role === 'md';

  // Multi-role: navigable pages are the UNION across all effective roles.
  // 'md' → 'all' is preserved (md can't be a granted role, so only a primary
  // md yields 'all').
  const effRoles = effectiveRolesOf(userProfile).length ? effectiveRolesOf(userProfile) : ['staff'];
  const allowedPages = effRoles.some(r => ROLE_PAGES[r] === 'all')
    ? 'all'
    : [...new Set(effRoles.flatMap(r => ROLE_PAGES[r] || ['dashboard']))];
  // Pages unlocked specifically by a granted (non-primary) role — used to relax
  // the ICO/board read-only mask on exactly those pages, not everywhere.
  const grantedRoles = effRoles.filter(r => r !== role);
  const grantedPages = new Set(grantedRoles.flatMap(r => (ROLE_PAGES[r] && ROLE_PAGES[r] !== 'all') ? ROLE_PAGES[r] : []));
  const canSee = (pageId) => {
    if (pageId === 'my_profile') return true;
    if (pageId === 'my_hr') return !!userProfile?.staff_id;
    return allowedPages === 'all' || allowedPages.includes(pageId);
  };
  const visibleNav = navItems
    .map(s => ({ ...s, items: s.items.filter(it => canSee(it.id)) }))
    .filter(s => s.items.length > 0);
  const safePage = canSee(active) ? active : (visibleNav[0]?.items[0]?.id || 'dashboard');
  // The read-only mask still applies to a primary board/ICO viewer, but is
  // relaxed on any page a granted role unlocks (so a granted write role works).
  const boardMasked = isBoard && !BOARD_EXEMPT_PAGES.includes(safePage) && !grantedPages.has(safePage);
  const icoMasked   = isICO   && !ICO_EXEMPT_PAGES.includes(safePage)   && !grantedPages.has(safePage);

  const pages = {
    dashboard: isBoard ? <BoardDashboard userProfile={userProfile} /> : <Dashboard onNavigate={setActive} userProfile={userProfile} />,
    production: <Production userProfile={userProfile} />,
    inventory: <Inventory onLowStockChange={setLowStockCount} userProfile={userProfile} />,
    batches: <Batches userProfile={userProfile} />,
    waybills: <Waybills userProfile={userProfile} />,
    vehicles: <VehicleRegistry />,
    staff: <Staff userProfile={userProfile} />,
    customers: <Customers userProfile={userProfile} />,
    orders: <Orders onNavigate={setActive} userProfile={userProfile} />,
    pending_register: <PendingDeliveryRegister />,
    daily_schedule: <DailySchedule />,
    lpo_approvals: <LPOApprovals />,
    schedule_approvals: <ScheduleApprovals />,
    reports: <Reports userProfile={userProfile} />,
    kpi_dashboard: <KPIDashboard />,
    trading_margin: <TradingMarginReport />,
    products: <Products />,
    suppliers: <SupplierRegistry />,
    accounting: <Accounting userProfile={userProfile} />,
    data_import: <DataImport />,
    user_management: <UserManagement userProfile={userProfile} />,
    labour: <Labour userProfile={userProfile} />,
    maintenance: <Maintenance userProfile={userProfile} />,
    truck_loading: <TruckLoadingPage userProfile={userProfile} />,
    advances: <AdvancesPage userProfile={userProfile} />,
    payment_requests: <PaymentRequestsPage userProfile={userProfile} />,
    leave: <LeavePage userProfile={userProfile} />,
    disciplinary: <DisciplinaryPage userProfile={userProfile} />,
    attendance_kiosk: <AttendanceKiosk userProfile={userProfile} />,
    attendance_flags: <AttendanceFlagsPage userProfile={userProfile} />,
    messages: <Messages userProfile={userProfile} onUnreadChange={setUnreadMsgCount} />,
    my_hr: <MyHRPage userProfile={userProfile} />,
    my_profile: <MyProfile userProfile={userProfile} />,
  };

  const getBadge = (id) => {
    if (id === "inventory" && lowStockCount > 0) return lowStockCount;
    if (id === "lpo_approvals" && lpoCount > 0) return lpoCount;
    if (id === "schedule_approvals" && scheduleCount > 0) return scheduleCount;
    if (id === "messages" && unreadMsgCount > 0) return unreadMsgCount;
    return 0;
  };

  return (
    <>
    <style>{`
      @media (max-width: 768px) {
        * { box-sizing: border-box; }
        table { min-width: 520px !important; }
        div:has(> table) { overflow-x: auto !important; -webkit-overflow-scrolling: touch; }
        input, select, textarea { font-size: 16px !important; }
        button { touch-action: manipulation; }
      }
    `}</style>
    <div style={styles.app}>
      {/* Mobile overlay */}
      {isMobile && sidebarOpen && (
        <div onClick={() => setSidebarOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 200 }} />
      )}
      <div style={{ ...styles.sidebar, overflowY: "auto", ...(isMobile ? { transform: sidebarOpen ? 'translateX(0)' : 'translateX(-240px)', transition: 'transform 0.25s ease', zIndex: 300 } : {}) }}>
        <div style={styles.logo}>
          <img src="/logo.png" alt="Abuja Precast Concrete Limited" style={{ width: "100%", maxWidth: "180px", marginBottom: "10px", display: "block" }} />
          <div style={styles.logoSub}>Quality Precast products. Reliable Delivery.</div>
        </div>
        <nav style={styles.nav}>
          {visibleNav.map(section => (
            <div key={section.section}>
              <div style={styles.navSection}>{section.section}</div>
              {section.items.map(item => {
                const badge = getBadge(item.id);
                return (
                  <div key={item.id} style={styles.navItem(active === item.id)} onClick={() => { setActive(item.id); if (isMobile) setSidebarOpen(false); }}>
                    <Icon name={item.icon} size={14} />
                    <span style={{ flex: 1 }}>{item.label}</span>
                    {badge > 0 && (
                      <span style={{ background: theme.red, color: "#fff", fontSize: "10px", fontWeight: "700", borderRadius: "10px", padding: "1px 6px", minWidth: "18px", textAlign: "center" }}>{badge}</span>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </nav>
        <div style={{ padding: "14px 20px", borderTop: `1px solid ${theme.border}`, fontSize: "11px", color: theme.textMuted, lineHeight: "1.7" }}>
          <div style={{ fontWeight: "700", color: theme.text, fontSize: "12px", marginBottom: "2px" }}>{userProfile?.full_name || 'User'}</div>
          <div style={{ color: theme.accent, fontSize: "11px", marginBottom: "6px" }}>{APP_ROLES.find(r => r.id === role)?.label || role} {(isBoard || isICO) ? '· View Only' : ''}</div>
          <div>📍 1, Dutse Alhaji, Behind Tipper Garage, Off Bwari Expressway, Abuja.</div>
          <div>📞 +234 905 554 4433</div>
          <div style={{ wordBreak: "break-all" }}>✉️ abujaprecastconcreteltd@gmail.com</div>
          <div style={{ display:"flex", gap:"6px", marginTop:"10px" }}>
            <button onClick={() => setShowChangePwd(true)} style={{ flex:1, padding:"6px", background:"transparent", border:`1px solid ${theme.border}`, borderRadius:"6px", color:theme.textMuted, fontSize:"11px", cursor:"pointer", fontWeight:"600" }}>Change Password</button>
            <button onClick={handleLogout} style={{ flex:1, padding:"6px", background:"transparent", border:`1px solid ${theme.border}`, borderRadius:"6px", color:theme.textMuted, fontSize:"11px", cursor:"pointer", fontWeight:"600" }}>Sign Out</button>
          </div>
        </div>
      </div>
      {showChangePwd && <ChangePasswordModal onClose={() => setShowChangePwd(false)} />}
      <MessagesBell
        unreadMsgCount={unreadMsgCount}
        onNavigate={(page) => { setActive(page); if (isMobile) setSidebarOpen(false); }}
        isMobile={isMobile}
      />
      <NotificationBell
        userProfile={userProfile}
        onNavigate={(page) => { setActive(page); if (isMobile) setSidebarOpen(false); }}
        isMobile={isMobile}
      />
      <main style={{ ...styles.main, ...(isMobile ? { marginLeft: 0, padding: '16px 14px', paddingTop: '58px' } : {}) }} {...(boardMasked ? { 'data-board-view': 'true' } : {})} {...(icoMasked ? { 'data-ico-view': 'true' } : {})}>
        {/* Mobile hamburger */}
        {isMobile && (
          <button data-board-allow data-ico-allow onClick={() => setSidebarOpen(s => !s)} style={{ position: 'fixed', top: '12px', left: '12px', zIndex: 250, background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: '8px', padding: '8px 12px', cursor: 'pointer', fontSize: '18px', color: theme.text, lineHeight: 1, boxShadow: '0 2px 8px rgba(0,0,0,0.3)' }}>☰</button>
        )}
        {sessionWarning && (
          <div style={{ background: "#7c3a0022", border: "1px solid #c47d0e88", borderRadius: "8px", padding: "10px 16px", marginBottom: "16px", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "13px", color: theme.accent }}>
            <span>⚠️ Your session expires in <strong>{sessionMinutes} minute{sessionMinutes !== 1 ? 's' : ''}</strong>. Unsaved work may be lost.</span>
            <div style={{ display: "flex", gap: "8px" }}>
              <button data-board-allow data-ico-allow onClick={handleExtendSession} style={{ padding: "5px 14px", borderRadius: "6px", background: theme.accent, color: "#000", border: "none", fontSize: "12px", fontWeight: "700", cursor: "pointer" }}>Extend Session</button>
              <button data-board-allow data-ico-allow onClick={() => setSessionWarning(false)} style={{ padding: "5px 10px", borderRadius: "6px", background: "transparent", color: theme.textMuted, border: `1px solid ${theme.border}`, fontSize: "12px", cursor: "pointer" }}>Dismiss</button>
            </div>
          </div>
        )}
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
        {boardMasked && (
          <div style={{ background: theme.accent+'22', border: `1px solid ${theme.accent}44`, borderRadius: '8px', padding: '8px 16px', margin: '0 0 16px', fontSize: '12px', color: theme.accent, fontWeight: '600' }}>
            👁 View Only Mode — Board Member access
          </div>
        )}
        {icoMasked && (
          <div style={{ background: theme.blue+'22', border: `1px solid ${theme.blue}44`, borderRadius: '8px', padding: '8px 16px', margin: '0 0 16px', fontSize: '12px', color: theme.blue, fontWeight: '600' }}>
            🔒 Read-Only Mode — Internal Control Officer. Approvals available in Schedule Approvals and Labour modules.
          </div>
        )}
        {pages[safePage]}
      </main>
    </div>
    </>
  );
}
