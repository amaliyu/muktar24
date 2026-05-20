import { useState, useEffect } from "react";
import { productionService } from './services/production';
import { staffService } from './services/staff';
import { ordersService, customersService } from './services/orders';
import { waybillsService } from './services/deliveries';
import { invoicesService, paymentsService } from './services/payments';
import { inventoryService } from './services/inventory';
import { lpoService } from './services/lpo';
import { pendingDeliveryService } from './services/pendingDelivery';
import { schedulesService } from './services/schedules';
import { batchesService } from './services/batches';
import { finishedGoodsService } from './services/finishedGoods';
import { generateInvoicePDF } from './utils/generateInvoicePDF';
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
import { parseFile, autoMapColumns, mapRowsToTransactions, autoMatchTransactions } from './utils/parseBankStatement';

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

const BLOCK_TYPES = ["9-inch", "6-inch", "Interlock"];
const ROLES = ["Driver", "Labourer", "Marketer", "Supervisor", "Other"];
const HOW_HEARD = [
  { value: "referral", label: "Referral" },
  { value: "social_media", label: "Social Media" },
  { value: "drive_by", label: "Drive-By" },
  { value: "marketer", label: "Brought by Marketer" },
];
const fmt = (n) => (n || 0).toLocaleString();
const naira = (n) => `₦${fmt(n)}`;

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

const InvoiceEditorModal = ({ editor, setEditor, onSave, saving }) => {
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
  const addItem = () => setEditor(e => ({ ...e, items: [...e.items, { description: '', quantity: '', unit_price: '' }] }));
  const removeItem = idx => setEditor(e => ({ ...e, items: e.items.filter((_, i) => i !== idx) }));

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 1000, overflowY: 'auto', padding: '24px 16px' }}>
      <div style={{ background: theme.card, border: `1px solid ${theme.border}`, borderRadius: '12px', width: '100%', maxWidth: '720px' }}>
        <div style={{ padding: '20px 24px', borderBottom: `1px solid ${theme.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: '16px', fontWeight: '700', color: theme.text }}>Invoice Editor</div>
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
          {items.map((item, idx) => (
            <div key={idx} style={{ display: 'flex', gap: '8px', marginBottom: '8px', alignItems: 'center' }}>
              <input style={{ ...styles.input, flex: 2 }} placeholder="Description" value={item.description} onChange={e => updItem(idx, 'description', e.target.value)} />
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
            <button style={styles.btn('primary')} onClick={onSave} disabled={saving}>{saving ? 'Saving…' : 'Save & Download PDF'}</button>
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
  const icons = { dashboard: "⊞", production: "🏭", orders: "📋", staff: "👥", waybill: "📄", reports: "📊", inventory: "📦", batches: "🗂", pending: "⏳", schedule: "📅", lpo: "📝", approve: "✓", settings: "⚙", products: "🧱", logout: "→" };
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
      {categories.length === 0 && !value && <option value="9-inch">9-inch</option>}
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
const Dashboard = () => {
  const [stats, setStats] = useState({ staff: 0, produced: 0, orders: 0, revenue: 0, pending: 0, waybills: 0, damages: 0, lpoQueue: 0, scheduleQueue: 0, pendingRegister: 0 });
  const [finishedGoods, setFinishedGoods] = useState([]);
  const [recent, setRecent] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [staffList, productions, orders, waybills] = await Promise.all([
          staffService.getAll(),
          productionService.getAll(),
          ordersService.getAll(),
          waybillsService.getAll(),
        ]);
        const produced = productions.reduce((s, p) => s + (p.quantity_produced || 0), 0);
        const damages = waybills.reduce((s, w) => s + (w.quantity_damaged || 0), 0);
        const revenue = orders.reduce((s, o) =>
          s + (o.invoices || []).flatMap(inv => inv.payments || []).filter(p => p.status === "confirmed").reduce((a, p) => a + p.amount_paid, 0), 0);
        const pending = orders.filter(o => o.status === "pending").length;
        setStats({ staff: staffList.length, produced, orders: orders.length, revenue, pending, waybills: waybills.length, damages, lpoQueue: 0, scheduleQueue: 0, pendingRegister: 0 });
        setRecent(orders.slice(0, 5));
      } catch {
        // show zeros on error
      }
      try {
        const [lpos, scheds, pendReg, fg, prods] = await Promise.all([
          lpoService.getPending(),
          schedulesService.getSubmitted(),
          pendingDeliveryService.getAll(),
          finishedGoodsService.getAll(),
          productsService.getActive().catch(() => []),
        ]);
        const productUnitMap = Object.fromEntries(prods.map(p => [p.name, p.unit]));
        setStats(s => ({ ...s, lpoQueue: lpos.length, scheduleQueue: scheds.length, pendingRegister: pendReg.length }));
        setFinishedGoods(fg.map(f => ({ ...f, unit: productUnitMap[f.block_type] || 'pieces' })));
      } catch { /* workflow tables may not exist yet */ } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <div>
      <div style={styles.header}>
        <div>
          <div style={styles.pageTitle}>{greeting}, MD 👋</div>
          <div style={styles.pageSubtitle}>Business overview — Abuja Precast Concrete Limited</div>
        </div>
        <span style={styles.badge(theme.green)}>Operations Active</span>
      </div>
      {loading ? <Spinner /> : (
        <>
          <div style={styles.grid(4)}>
            <StatCard label="Total Staff" value={stats.staff} sub="Active employees" accent={theme.blue} />
            <StatCard label="Blocks Produced" value={fmt(stats.produced)} sub="All time" accent={theme.accent} />
            <StatCard label="Total Orders" value={stats.orders} sub={`${stats.pending} pending`} accent={theme.blue} />
            <StatCard label="Waybills Issued" value={stats.waybills} sub="All deliveries" accent={theme.accentDim} />
          </div>
          <div style={styles.grid(3)}>
            <StatCard label="Revenue Collected" value={naira(stats.revenue)} sub="Confirmed payments" accent={theme.green} />
            <StatCard label="Pending Orders" value={stats.pending} sub="Awaiting processing" accent={theme.accent} />
            <StatCard label="Transit Damages" value={fmt(stats.damages)} sub="Blocks damaged in delivery" accent={theme.red} />
          </div>
          {(stats.lpoQueue > 0 || stats.scheduleQueue > 0 || stats.pendingRegister > 0) && (
            <div style={{ display: "flex", gap: "12px", marginBottom: "16px", flexWrap: "wrap" }}>
              {stats.lpoQueue > 0 && (
                <div style={{ background: "rgba(245,166,35,0.12)", border: `1px solid ${theme.accent}55`, borderRadius: "10px", padding: "12px 18px", flex: 1, minWidth: "200px" }}>
                  <div style={{ fontSize: "11px", fontWeight: "700", color: theme.accent, textTransform: "uppercase", letterSpacing: "0.05em" }}>LPO Approvals Pending</div>
                  <div style={{ fontSize: "28px", fontWeight: "700", color: theme.text, marginTop: "4px" }}>{stats.lpoQueue}</div>
                  <div style={{ fontSize: "12px", color: theme.textMuted }}>Orders awaiting MD approval</div>
                </div>
              )}
              {stats.scheduleQueue > 0 && (
                <div style={{ background: "rgba(91,141,238,0.12)", border: `1px solid ${theme.blue}55`, borderRadius: "10px", padding: "12px 18px", flex: 1, minWidth: "200px" }}>
                  <div style={{ fontSize: "11px", fontWeight: "700", color: theme.blue, textTransform: "uppercase", letterSpacing: "0.05em" }}>Schedules Awaiting ICO</div>
                  <div style={{ fontSize: "28px", fontWeight: "700", color: theme.text, marginTop: "4px" }}>{stats.scheduleQueue}</div>
                  <div style={{ fontSize: "12px", color: theme.textMuted }}>Delivery schedules submitted</div>
                </div>
              )}
              {stats.pendingRegister > 0 && (
                <div style={{ background: "rgba(45,212,160,0.10)", border: `1px solid ${theme.green}55`, borderRadius: "10px", padding: "12px 18px", flex: 1, minWidth: "200px" }}>
                  <div style={{ fontSize: "11px", fontWeight: "700", color: theme.green, textTransform: "uppercase", letterSpacing: "0.05em" }}>Pending Deliveries</div>
                  <div style={{ fontSize: "28px", fontWeight: "700", color: theme.text, marginTop: "4px" }}>{stats.pendingRegister}</div>
                  <div style={{ fontSize: "12px", color: theme.textMuted }}>Customers awaiting delivery</div>
                </div>
              )}
            </div>
          )}
          {finishedGoods.length > 0 && (
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
          {recent.length > 0 && (
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
const Production = () => {
  const [showForm, setShowForm] = useState(false);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [alert, setAlert] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [editTarget, setEditTarget] = useState(null);
  const emptyForm = { date: "", blockType: "9-inch", produced: "", cement: "", granite: "", diesel: "", dmgProd: "0", dmgStack: "0" };
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

  useEffect(() => { load(); }, []);

  const startEdit = (record) => {
    setEditTarget(record);
    setForm({
      date: record.date, blockType: record.block_type,
      produced: String(record.quantity_produced || ""),
      cement: String(record.cement_bags || ""),
      granite: String(record.granite_dust_kg || ""),
      diesel: String(record.diesel_litres || ""),
      dmgProd: String(record.damaged?.production || 0),
      dmgStack: String(record.damaged?.stacking || 0),
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.date || !form.produced) return setAlert({ type: "error", msg: "Date and quantity produced are required." });
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
        diesel_litres: parseFloat(form.diesel) || 0,
      };
      if (editTarget) {
        await productionService.update(editTarget.id, entryData);
        await productionService.clearDamages(editTarget.id);
        if (dmgProd > 0) await productionService.logDamage({ date: form.date, block_type: form.blockType, stage: "production", quantity_damaged: dmgProd, production_log_id: editTarget.id });
        if (dmgStack > 0) await productionService.logDamage({ date: form.date, block_type: form.blockType, stage: "stacking", quantity_damaged: dmgStack, production_log_id: editTarget.id });
        await load();
        setAlert({ type: "success", msg: "Production entry updated." });
      } else {
        const entry = await productionService.create(entryData);
        if (dmgProd > 0) await productionService.logDamage({ date: form.date, block_type: form.blockType, stage: "production", quantity_damaged: dmgProd, production_log_id: entry.id });
        if (dmgStack > 0) await productionService.logDamage({ date: form.date, block_type: form.blockType, stage: "stacking", quantity_damaged: dmgStack, production_log_id: entry.id });
        try {
          await inventoryService.autoDeductProduction({
            cementBags: entryData.cement_bags,
            graniteDustKg: entryData.granite_dust_kg,
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

  const handleDelete = async (id) => {
    try {
      await productionService.deleteEntry(id);
      setRecords(prev => prev.filter(r => r.id !== id));
      setAlert({ type: "success", msg: "Entry deleted." });
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
      {confirmDelete && <ConfirmModal msg={`Delete production entry for ${confirmDelete.date}? This will also remove any linked damage records.`} onConfirm={() => handleDelete(confirmDelete.id)} onCancel={() => setConfirmDelete(null)} />}
      <div style={styles.header}>
        <div>
          <div style={styles.pageTitle}>Production Log</div>
          <div style={styles.pageSubtitle}>Daily block production, material usage, and damage tracking</div>
        </div>
        <button style={styles.btn("primary")} onClick={() => setShowForm(!showForm)}>+ Log Today's Production</button>
      </div>

      {alert && <Alert msg={alert.msg} type={alert.type} onClose={() => setAlert(null)} />}

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
            <button style={styles.btn("primary")} onClick={handleSave} disabled={saving}>{saving ? "Saving…" : editTarget ? "Update Entry" : "Save Entry"}</button>
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
              <tr>{["Date", "Block Type", "Produced", "Cement (bags)", "Granite (kg)", "Diesel (L)", "Dmg Production", "Dmg Stacking", "Net Output", ""].map(h => <th key={h} style={styles.th}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {records.map((p) => {
                const net = (p.quantity_produced || 0) - (p.damaged?.production || 0) - (p.damaged?.stacking || 0);
                return (
                  <tr key={p.id}>
                    <td style={styles.td}>{p.date}</td>
                    <td style={styles.td}><span style={styles.badge(theme.blue)}>{p.block_type}</span></td>
                    <td style={styles.td}>{fmt(p.quantity_produced)}</td>
                    <td style={styles.td}>{p.cement_bags}</td>
                    <td style={styles.td}>{fmt(p.granite_dust_kg)}</td>
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

// ── STAFF ─────────────────────────────────────────────────────
const Staff = () => {
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [alert, setAlert] = useState(null);
  const [editTarget, setEditTarget] = useState(null);
  const emptyForm = { full_name: "", phone: "", role: "Driver", staff_type: "permanent", monthly_salary: "", daily_rate: "", date_hired: "" };
  const [form, setForm] = useState(emptyForm);

  const load = async () => {
    setLoading(true);
    try {
      setStaff(await staffService.getAll());
    } catch {
      setAlert({ type: "error", msg: "Could not load staff records." });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const startEdit = (s) => {
    setEditTarget(s);
    setForm({ full_name: s.full_name, phone: s.phone || "", role: s.role, staff_type: s.staff_type, monthly_salary: String(s.monthly_salary || ""), daily_rate: String(s.daily_rate || ""), date_hired: s.date_hired || "" });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.full_name) return setAlert({ type: "error", msg: "Full name is required." });
    setSaving(true);
    setAlert(null);
    try {
      const payload = {
        full_name: form.full_name,
        phone: form.phone || null,
        role: form.role,
        staff_type: form.staff_type,
        monthly_salary: form.staff_type === "permanent" ? parseFloat(form.monthly_salary) || null : null,
        daily_rate: form.staff_type === "daily" ? parseFloat(form.daily_rate) || null : null,
        date_hired: form.date_hired || null,
      };
      if (editTarget) {
        const updated = await staffService.update(editTarget.id, payload);
        setStaff(prev => prev.map(s => s.id === editTarget.id ? { ...s, ...updated } : s));
        setAlert({ type: "success", msg: `${updated.full_name} updated.` });
      } else {
        const saved = await staffService.create({ ...payload, is_active: true });
        setStaff(prev => [...prev, saved]);
        setAlert({ type: "success", msg: `${saved.full_name} added successfully!` });
      }
      setForm(emptyForm);
      setShowForm(false);
      setEditTarget(null);
    } catch (e) {
      setAlert({ type: "error", msg: "Failed to save staff. " + e.message });
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (s) => {
    try {
      const updated = s.is_active ? await staffService.deactivate(s.id) : await staffService.activate(s.id);
      setStaff(prev => prev.map(m => m.id === s.id ? { ...m, ...updated } : m));
      setAlert({ type: "success", msg: `${s.full_name} marked as ${updated.is_active ? "active" : "inactive"}.` });
    } catch (e) {
      setAlert({ type: "error", msg: "Failed to update status. " + e.message });
    }
  };

  const permanent = staff.filter(s => s.staff_type === "permanent");
  const daily = staff.filter(s => s.staff_type === "daily");

  return (
    <div>
      <div style={styles.header}>
        <div>
          <div style={styles.pageTitle}>Staff Management</div>
          <div style={styles.pageSubtitle}>Permanent staff and daily workers</div>
        </div>
        <button style={styles.btn("primary")} onClick={() => setShowForm(!showForm)}>+ Add Staff</button>
      </div>

      {alert && <Alert msg={alert.msg} type={alert.type} onClose={() => setAlert(null)} />}

      {showForm && (
        <div style={{ ...styles.card, marginBottom: "24px", borderColor: theme.accent + "44" }}>
          <div style={styles.sectionTitle}>{editTarget ? `Edit — ${editTarget.full_name}` : "Add New Staff Member"}</div>
          <div style={styles.grid(3)}>
            <div style={styles.formGroup}>
              <label style={styles.label}>Full Name *</label>
              <input style={styles.input} placeholder="e.g. Emeka Okafor" value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Phone Number</label>
              <input style={styles.input} placeholder="+234..." value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Role</label>
              <select style={styles.input} value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
                {ROLES.map(r => <option key={r}>{r}</option>)}
              </select>
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Staff Type</label>
              <select style={styles.input} value={form.staff_type} onChange={e => setForm({ ...form, staff_type: e.target.value })}>
                <option value="permanent">Permanent</option>
                <option value="daily">Daily</option>
              </select>
            </div>
            {form.staff_type === "permanent" ? (
              <div style={styles.formGroup}>
                <label style={styles.label}>Monthly Salary (₦)</label>
                <input style={styles.input} type="number" placeholder="e.g. 85000" value={form.monthly_salary} onChange={e => setForm({ ...form, monthly_salary: e.target.value })} />
              </div>
            ) : (
              <div style={styles.formGroup}>
                <label style={styles.label}>Daily Rate (₦)</label>
                <input style={styles.input} type="number" placeholder="e.g. 3500" value={form.daily_rate} onChange={e => setForm({ ...form, daily_rate: e.target.value })} />
              </div>
            )}
            <div style={styles.formGroup}>
              <label style={styles.label}>Date Hired</label>
              <input style={styles.input} type="date" value={form.date_hired} onChange={e => setForm({ ...form, date_hired: e.target.value })} />
            </div>
          </div>
          <div style={styles.row}>
            <button style={styles.btn("primary")} onClick={handleSave} disabled={saving}>{saving ? "Saving…" : editTarget ? "Update Staff" : "Add Staff Member"}</button>
            <button style={styles.btn("secondary")} onClick={() => { setShowForm(false); setForm(emptyForm); setEditTarget(null); }}>Cancel</button>
          </div>
        </div>
      )}

      <div style={styles.grid(3)}>
        <StatCard label="Total Staff" value={staff.length} sub="All categories" accent={theme.blue} />
        <StatCard label="Permanent Staff" value={permanent.length} sub="Monthly salary" accent={theme.green} />
        <StatCard label="Daily Workers" value={daily.length} sub="Daily rate" accent={theme.accent} />
      </div>

      <div style={styles.card}>
        <div style={styles.sectionTitle}>Staff Directory</div>
        {loading ? <Spinner /> : staff.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px", color: theme.textMuted, fontSize: "13px" }}>No staff records yet. Add your first staff member above.</div>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>{["Name", "Role", "Type", "Pay Rate", "Date Hired", "Status", "Actions"].map(h => <th key={h} style={styles.th}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {staff.map(s => (
                <tr key={s.id}>
                  <td style={styles.td}><strong>{s.full_name}</strong>{s.phone && <div style={{ fontSize: "11px", color: theme.textMuted }}>{s.phone}</div>}</td>
                  <td style={styles.td}>{s.role}</td>
                  <td style={styles.td}><span style={styles.badge(s.staff_type === "permanent" ? theme.blue : theme.accent)}>{s.staff_type}</span></td>
                  <td style={styles.td}>{s.staff_type === "permanent" ? naira(s.monthly_salary) + "/mo" : naira(s.daily_rate) + "/day"}</td>
                  <td style={styles.td}>{s.date_hired || "—"}</td>
                  <td style={styles.td}><span style={styles.badge(s.is_active ? theme.green : theme.red)}>{s.is_active ? "active" : "inactive"}</span></td>
                  <td style={styles.td}>
                    <div style={{ display: "flex", gap: "6px" }}>
                      <button style={{ ...styles.btn("secondary"), padding: "4px 10px", fontSize: "11px" }} onClick={() => startEdit(s)}>Edit</button>
                      <button style={{ ...styles.btn(s.is_active ? "danger" : "primary"), padding: "4px 10px", fontSize: "11px" }} onClick={() => handleToggleActive(s)}>{s.is_active ? "Deactivate" : "Activate"}</button>
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

// ── ORDERS ────────────────────────────────────────────────────
const emptyItem = () => ({ blockType: "9-inch", quantity: "", unitPrice: "", unit: "pieces" });

const Orders = ({ onNavigate }) => {
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
  const emptyForm = { customerName: "", customerPhone: "", customerLocation: "", marketerId: "", items: [emptyItem()], isLpo: false, lpoSubmittedBy: "" };
  const [form, setForm] = useState(emptyForm);
  const [payForm, setPayForm] = useState({ amount: "", date: "" });
  const [orderEditMode, setOrderEditMode] = useState(false);
  const [orderEditItems, setOrderEditItems] = useState([]);
  const [orderEditMarketer, setOrderEditMarketer] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const [o, s, c] = await Promise.all([ordersService.getAll(), staffService.getActive(), customersService.getAll()]);
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

  const orderTotal = (order) => (order.order_items || []).reduce((s, i) => s + (i.subtotal || i.quantity * i.unit_price), 0);
  const orderPaid = (order) => (order.invoices || []).flatMap(inv => inv.payments || []).filter(p => p.status === "confirmed").reduce((s, p) => s + p.amount_paid, 0);
  const orderQty = (order) => (order.order_items || []).reduce((s, i) => s + i.quantity, 0);

  const updateItem = (idx, field, val) => {
    const items = [...form.items];
    items[idx] = { ...items[idx], [field]: val };
    setForm({ ...form, items });
  };

  const handleSave = async () => {
    if (customerMode === "existing" && !pickedCustomer) return setAlert({ type: "error", msg: "Please select a customer." });
    if (customerMode === "new" && !form.customerName) return setAlert({ type: "error", msg: "Customer name is required." });
    if (form.items.some(i => !i.quantity || !i.unitPrice)) return setAlert({ type: "error", msg: "All items need quantity and unit price." });
    setSaving(true);
    setAlert(null);
    try {
      let customerId;
      if (customerMode === "existing") {
        customerId = pickedCustomer.id;
      } else {
        const customer = await customersService.create({ name: form.customerName, phone: form.customerPhone || null, location: form.customerLocation || null });
        customerId = customer.id;
      }
      const newOrder = await ordersService.create({
        order: { customer_id: customerId, marketer_id: form.marketerId || null, status: form.isLpo ? "lpo_pending" : "pending", is_lpo: form.isLpo || false },
        items: form.items.map(i => ({ block_type: i.blockType, quantity: parseInt(i.quantity), unit_price: parseFloat(i.unitPrice) })),
      });
      if (form.isLpo) {
        try {
          await lpoService.create({ order_id: newOrder.id, submitted_by: form.lpoSubmittedBy || "BDM" });
        } catch { /* LPO table may not exist yet */ }
      }
      await load();
      setForm(emptyForm);
      setPickedCustomer(null);
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

  const handleGenerateInvoice = async () => {
    if (!selected) return;
    const today = new Date().toISOString().split("T")[0];
    const due = new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0];
    let productMap = {};
    try {
      const prods = await productsService.getActive();
      prods.forEach(p => { productMap[p.name] = p.unit; });
    } catch {}
    const buildItems = (orderItems) => orderItems.map(i => ({
      description: i.block_type || i.description || "",
      quantity: i.quantity,
      unit_price: i.unit_price,
      unit: productMap[i.block_type] || "",
    }));
    const existingInvoice = (selected.invoices || [])[0];
    if (existingInvoice) {
      const editorItems = buildItems(selected.order_items || []);
      setInvoiceEditor({
        invoice_number: existingInvoice.invoice_number,
        issued_date: existingInvoice.issued_date || today,
        due_date: existingInvoice.due_date || due,
        items: editorItems.length > 0 ? editorItems : [{ description: "", quantity: "", unit_price: "", unit: "" }],
        delivery_cost: "",
        include_vat: true,
        discount: "",
        _existingId: existingInvoice.id,
      });
    } else {
      const count = orders.reduce((s, o) => s + (o.invoices || []).length, 0);
      const year = new Date().getFullYear();
      const invoiceNumber = `APC-INV-${year}-${String((count || 0) + 1).padStart(3, "0")}`;
      const editorItems = buildItems(selected.order_items || []);
      setInvoiceEditor({
        invoice_number: invoiceNumber,
        issued_date: today,
        due_date: due,
        items: editorItems.length > 0 ? editorItems : [{ description: "", quantity: "", unit_price: "", unit: "" }],
        delivery_cost: "",
        include_vat: true,
        discount: "",
        _existingId: null,
      });
    }
  };

  const handleSaveInvoice = async () => {
    if (!invoiceEditor) return;
    setInvoicing(true);
    try {
      const { _existingId, invoice_number, issued_date, due_date, items, delivery_cost, include_vat, discount } = invoiceEditor;
      const itemSubtotal = items.reduce((s, i) => s + (Number(i.quantity) || 0) * (Number(i.unit_price) || 0), 0);
      const delivN = Number(delivery_cost) || 0;
      const discN = Number(discount) || 0;
      const sub = itemSubtotal + delivN;
      const afterDisc = sub - discN;
      const vat = include_vat ? afterDisc * 0.075 : 0;
      const total = afterDisc + vat;

      let invoiceId = _existingId;
      if (_existingId) {
        await invoicesService.update(_existingId, { invoice_number, issued_date, due_date, total_amount: total });
      } else {
        const newInvoice = await invoicesService.create({ order_id: selected.id, invoice_number, issued_date, due_date, total_amount: total });
        invoiceId = newInvoice.id;
        await ordersService.updateStatus(selected.id, "invoiced");
      }

      const customer = selected.customer || { name: selected.customerName, location: selected.customerLocation, phone: selected.customerPhone };
      await generateInvoicePDF({ invoice_number, issued_date, due_date, items, delivery_cost: delivN, include_vat, discount: discN }, customer);

      setInvoiceEditor(null);
      const newOrders = await load();
      if (newOrders) setSelected(newOrders.find(o => o.id === selected.id) || null);
      setAlert({ type: "success", msg: `Invoice ${invoice_number} saved and downloaded!` });
    } catch (e) {
      setAlert({ type: "error", msg: "Failed to save invoice. " + e.message });
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
          const totalInvoiced = (selected.invoices || []).reduce((s, inv) => s + Number(inv.total_amount || 0), 0);
          const alreadyPaid = (selected.invoices || []).flatMap(inv => (inv.payments || []).filter(p => p.status === "confirmed")).reduce((s, p) => s + Number(p.amount_paid), 0);
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

  const startOrderEdit = (order) => {
    setOrderEditItems((order.order_items || []).map(i => ({ blockType: i.block_type, quantity: String(i.quantity), unitPrice: String(i.unit_price) })));
    setOrderEditMarketer(order.marketer_id || "");
    setOrderEditMode(true);
  };

  const handleUpdateOrder = async () => {
    if (orderEditItems.some(i => !i.quantity || !i.unitPrice)) return setAlert({ type: "error", msg: "All items need quantity and unit price." });
    try {
      await ordersService.updateOrder(selected.id, {
        marketerId: orderEditMarketer || null,
        items: orderEditItems.map(i => ({ block_type: i.blockType, quantity: parseInt(i.quantity), unit_price: parseFloat(i.unitPrice) })),
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
      {confirmDelete && <ConfirmModal msg={confirmDelete.type === "payment" ? `Remove payment of ${naira(confirmDelete.amount_paid)} recorded on ${confirmDelete.payment_date}? This cannot be undone.` : `Delete order for ${confirmDelete.customer?.name}? This will also delete all invoices and payments.`} onConfirm={() => confirmDelete.type === "payment" ? handleDeletePayment(confirmDelete.id) : handleDeleteOrder(confirmDelete.id)} onCancel={() => setConfirmDelete(null)} />}
      <InvoiceEditorModal editor={invoiceEditor} setEditor={setInvoiceEditor} onSave={handleSaveInvoice} saving={invoicing} />
      <div style={styles.header}>
        <div>
          <div style={styles.pageTitle}>Orders & Invoicing</div>
          <div style={styles.pageSubtitle}>Customer orders, payment tracking, and delivery status</div>
        </div>
        <button style={styles.btn("primary")} onClick={() => setShowForm(!showForm)}>+ New Order</button>
      </div>

      {alert && <Alert msg={alert.msg} type={alert.type} onClose={() => setAlert(null)} />}

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
              <div key={idx} style={{ display: "flex", gap: "10px", marginBottom: "10px", alignItems: "flex-end" }}>
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
                {form.items.length > 1 && (
                  <button style={{ ...styles.btn("danger"), padding: "9px 12px", alignSelf: idx === 0 ? "flex-end" : "center" }} onClick={() => setForm({ ...form, items: form.items.filter((_, i) => i !== idx) })}>✕</button>
                )}
              </div>
            ))}
            {form.items.length < 5 && (
              <button style={styles.btn("secondary")} onClick={() => setForm({ ...form, items: [...form.items, emptyItem()] })}>+ Add Item</button>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 0", borderTop: `1px solid ${theme.border}22`, marginBottom: "4px" }}>
            <input type="checkbox" id="lpo_flag" checked={form.isLpo} onChange={e => setForm({ ...form, isLpo: e.target.checked })} style={{ width: "16px", height: "16px", cursor: "pointer", accentColor: theme.accent }} />
            <label htmlFor="lpo_flag" style={{ ...styles.label, marginBottom: 0, cursor: "pointer", color: form.isLpo ? theme.accent : theme.textMuted, fontWeight: form.isLpo ? "700" : "400" }}>
              This is an LPO order (requires MD approval before delivery)
            </label>
            {form.isLpo && (
              <input style={{ ...styles.input, maxWidth: "220px", marginLeft: "8px" }} placeholder="Submitted by (BDM name)" value={form.lpoSubmittedBy} onChange={e => setForm({ ...form, lpoSubmittedBy: e.target.value })} />
            )}
          </div>
          <div style={styles.row}>
            <button style={styles.btn(form.isLpo ? "secondary" : "primary")} onClick={handleSave} disabled={saving}>{saving ? "Saving…" : form.isLpo ? "Submit LPO for MD Approval" : "Create Order"}</button>
            <button style={styles.btn("secondary")} onClick={() => { setShowForm(false); setForm(emptyForm); }}>Cancel</button>
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
                      <div style={{ fontSize: "12px", color: theme.textMuted }}>{o.customer?.location} · {o.marketer?.full_name || "No marketer"}</div>
                    </div>
                    <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                      {o.is_lpo && <span style={styles.badge(theme.blue)}>LPO</span>}
                      <span style={styles.badge(statusColor(o.status))}>{o.status}</span>
                      <button style={{ ...styles.btn("danger"), padding: "3px 9px", fontSize: "11px" }} onClick={e => { e.stopPropagation(); setConfirmDelete(o); }}>Delete</button>
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
                    {!orderEditMode && <button style={{ ...styles.btn("secondary"), padding: "4px 12px", fontSize: "12px" }} onClick={() => startOrderEdit(selected)}>Edit Order</button>}
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
                        <div key={idx} style={{ display: "flex", gap: "8px", marginBottom: "8px", alignItems: "center" }}>
                          <ProductSelect value={item.blockType} onChange={(name, unit) => { const it = [...orderEditItems]; it[idx] = { ...it[idx], blockType: name, unit }; setOrderEditItems(it); }} style={{ ...styles.input, flex: 1 }} />
                          <input style={{ ...styles.input, flex: 1 }} type="number" placeholder="Qty" value={item.quantity} onChange={e => { const it = [...orderEditItems]; it[idx] = { ...it[idx], quantity: e.target.value }; setOrderEditItems(it); }} />
                          <input style={{ ...styles.input, flex: 1 }} type="number" placeholder="Unit Price" value={item.unitPrice} onChange={e => { const it = [...orderEditItems]; it[idx] = { ...it[idx], unitPrice: e.target.value }; setOrderEditItems(it); }} />
                          <div style={{ ...styles.input, flex: 1, background: "transparent", color: theme.accent, fontWeight: "700" }}>{item.quantity && item.unitPrice ? naira(parseInt(item.quantity) * parseFloat(item.unitPrice)) : "—"}</div>
                          {orderEditItems.length > 1 && <button style={{ ...styles.btn("danger"), padding: "8px 10px" }} onClick={() => setOrderEditItems(orderEditItems.filter((_, i) => i !== idx))}>✕</button>}
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
                        <span>{item.block_type} × {fmt(item.quantity)}</span>
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
                    const allPayments = (selected.invoices || []).flatMap(inv => (inv.payments || []).map(p => ({ ...p })));
                    return allPayments.length > 0 ? (
                      <div style={{ marginTop: "16px", marginBottom: "4px" }}>
                        <div style={{ fontSize: "11px", fontWeight: "700", color: theme.textMuted, marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.06em" }}>Payment History</div>
                        {allPayments.map(p => (
                          <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${theme.border}22`, fontSize: "13px" }}>
                            <span style={{ color: theme.textMuted }}>{p.payment_date}</span>
                            <span style={{ color: theme.green, fontWeight: "600" }}>{naira(p.amount_paid)}</span>
                            <span style={styles.badge(p.status === "confirmed" ? theme.green : theme.accent)}>{p.status}</span>
                            <div style={{ display: "flex", gap: "6px" }}>
                              <button style={{ ...styles.btn("secondary"), padding: "3px 8px", fontSize: "11px" }} onClick={() => { setEditPayment(p); setPayForm({ amount: String(p.amount_paid), date: p.payment_date }); setShowPayForm(true); }}>Edit</button>
                              <button style={{ ...styles.btn("danger"), padding: "3px 8px", fontSize: "11px" }} onClick={() => setConfirmDelete({ ...p, type: "payment" })}>Remove</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : null;
                  })()}
                  <div style={{ marginTop: "16px" }}>
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                      {(selected.invoices || []).length === 0 ? (
                        <button style={styles.btn("primary")} onClick={handleGenerateInvoice} disabled={invoicing}>{invoicing ? "Generating…" : "Generate Invoice"}</button>
                      ) : (
                        <>
                          <div style={{ width: "100%", fontSize: "12px", color: theme.textMuted, marginBottom: "6px" }}>
                            Invoice: <strong style={{ color: theme.accent }}>{selected.invoices[0].invoice_number}</strong>
                          </div>
                          <button style={styles.btn("primary")} onClick={handleGenerateInvoice} disabled={invoicing}>{invoicing ? "Downloading…" : "Download Invoice PDF"}</button>
                          <button style={styles.btn("secondary")} onClick={() => setShowPayForm(!showPayForm)}>+ Record Payment</button>
                        </>
                      )}
                      <button style={styles.btn("secondary")} onClick={() => onNavigate("waybills")}>View Waybills</button>
                    </div>
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
const Waybills = () => {
  const [waybills, setWaybills] = useState([]);
  const [staff, setStaff] = useState([]);
  const [activeBatches, setActiveBatches] = useState([]);
  const [activeOrders, setActiveOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [alert, setAlert] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [editTarget, setEditTarget] = useState(null);
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const emptyForm = { waybillDate: "", driverId: "", truckNumber: "", blockType: "9-inch", quantityLoaded: "", quantityReceived: "", quantityDamaged: "0", batchId: "", notes: "" };
  const [form, setForm] = useState(emptyForm);

  const load = async () => {
    setLoading(true);
    try {
      const [w, s] = await Promise.all([waybillsService.getAll(), staffService.getActive()]);
      setWaybills(w);
      setStaff(s);
    } catch {
      setAlert({ type: "error", msg: "Could not load waybills." });
    }
    try {
      const [orders, batches] = await Promise.all([ordersService.getAll(), batchesService.getActive().catch(() => [])]);
      setActiveOrders(orders.filter(o => ["invoiced", "in_progress", "lpo_approved"].includes(o.status)));
      setActiveBatches(batches);
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
      waybillDate: w.waybill_date, driverId: w.driver_id || "",
      truckNumber: w.truck_number || "", blockType: w.block_type || "9-inch",
      quantityLoaded: String(w.quantity_loaded || ""),
      quantityReceived: String(w.quantity_received || ""),
      quantityDamaged: String(w.quantity_damaged || 0),
      batchId: w.batch_id || "",
      notes: w.notes || "",
    });
    setSelectedOrderId("");
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!editTarget && !selectedOrderId) return setAlert({ type: "error", msg: "Select a customer with an active invoice before recording a waybill." });
    if (!form.waybillDate || !form.quantityLoaded) return setAlert({ type: "error", msg: "Date and quantity loaded are required." });
    setSaving(true);
    setAlert(null);
    try {
      const damaged = parseInt(form.quantityDamaged) || 0;
      const waybillData = {
        driver_id: form.driverId || null,
        truck_number: form.truckNumber || null,
        block_type: form.blockType,
        quantity_loaded: parseInt(form.quantityLoaded) || 0,
        quantity_received: parseInt(form.quantityReceived) || 0,
        quantity_damaged: damaged,
        waybill_date: form.waybillDate,
        notes: form.notes || null,
      };

      if (editTarget) {
        await waybillsService.update(editTarget.id, { ...waybillData, batch_id: form.batchId || null });
        await load();
        setAlert({ type: "success", msg: `Waybill ${editTarget.waybill_number} updated.` });
      } else {
        const nextNum = await waybillsService.getNextNumber();
        const waybillNumber = `APC-WB-${String(nextNum).padStart(3, "0")}`;
        const qtyLoaded = parseInt(form.quantityLoaded) || 0;
        const qtyReceived = parseInt(form.quantityReceived) || 0;
        await waybillsService.create({ ...waybillData, batch_id: form.batchId || null, waybill_number: waybillNumber, receiver_name: selectedOrder?.customer?.name || null });
        if (damaged > 0) {
          await productionService.logDamage({ date: form.waybillDate, block_type: form.blockType, stage: "delivery", quantity_damaged: damaged, notes: `Transit damage on waybill ${waybillNumber}` });
        }
        // Side effects (non-blocking)
        try {
          if (qtyLoaded > 0) await finishedGoodsService.decrease(form.blockType, qtyLoaded);
          if (form.batchId && qtyLoaded > 0) await batchesService.reduceStock(form.batchId, qtyLoaded);
          if (qtyReceived > 0 && selectedOrder) {
            const pending = await pendingDeliveryService.getByOrder(selectedOrder.id);
            const match = pending.find(p => p.block_type === form.blockType);
            if (match) await pendingDeliveryService.updateDelivered(match.id, qtyReceived);
          }
        } catch { /* side effects optional */ }
        await load();
        setAlert({ type: "success", msg: `Waybill ${waybillNumber} recorded for ${selectedOrder?.customer?.name}${damaged > 0 ? " — transit damage logged automatically." : "."}` });
      }
      setForm(emptyForm);
      setSelectedOrderId("");
      setShowForm(false);
      setEditTarget(null);
    } catch (e) {
      setAlert({ type: "error", msg: "Failed to save waybill. " + e.message });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteWaybill = async (id) => {
    try {
      await waybillsService.delete(id);
      setWaybills(prev => prev.filter(w => w.id !== id));
      setAlert({ type: "success", msg: "Waybill deleted." });
    } catch (e) {
      setAlert({ type: "error", msg: "Failed to delete waybill. " + e.message });
    } finally {
      setConfirmDelete(null);
    }
  };

  const totalLoaded = waybills.reduce((s, w) => s + (w.quantity_loaded || 0), 0);
  const totalDamaged = waybills.reduce((s, w) => s + (w.quantity_damaged || 0), 0);
  const damageRate = totalLoaded > 0 ? ((totalDamaged / totalLoaded) * 100).toFixed(2) : "0.00";

  return (
    <div>
      {confirmDelete && <ConfirmModal msg={`Delete waybill ${confirmDelete.waybill_number}? This cannot be undone.`} onConfirm={() => handleDeleteWaybill(confirmDelete.id)} onCancel={() => setConfirmDelete(null)} />}
      <div style={styles.header}>
        <div>
          <div style={styles.pageTitle}>Waybill Records</div>
          <div style={styles.pageSubtitle}>Track every delivery trip — loaded, received, and damaged quantities</div>
        </div>
        <button style={styles.btn("primary")} onClick={() => setShowForm(!showForm)}>+ Record Waybill</button>
      </div>

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
              <label style={styles.label}>Driver</label>
              <select style={styles.input} value={form.driverId} onChange={e => setForm({ ...form, driverId: e.target.value })}>
                <option value="">— Select driver —</option>
                {staff.map(s => <option key={s.id} value={s.id}>{s.full_name} ({s.role})</option>)}
              </select>
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Truck Number</label>
              <input style={styles.input} placeholder="e.g. ABC-123-AA" value={form.truckNumber} onChange={e => setForm({ ...form, truckNumber: e.target.value })} />
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
            <div style={styles.formGroup}>
              <label style={styles.label}>Quantity Damaged in Transit</label>
              <input style={styles.input} type="number" placeholder="0" value={form.quantityDamaged} onChange={e => setForm({ ...form, quantityDamaged: e.target.value })} />
            </div>
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
                {activeOrders.length === 0 && <div style={{ fontSize: "11px", color: theme.red, marginTop: "4px" }}>No customers with active invoices. Generate an invoice first.</div>}
              </div>
            )}
            <div style={styles.formGroup}>
              <label style={styles.label}>Notes</label>
              <input style={styles.input} placeholder="Optional notes" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
          {parseInt(form.quantityDamaged) > 0 && (
            <div style={{ ...styles.alert("error"), marginBottom: "14px" }}>
              <span>⚠️ {form.quantityDamaged} damaged blocks will be automatically logged to the damage register as transit damage.</span>
            </div>
          )}
          <div style={styles.row}>
            <button style={styles.btn("primary")} onClick={handleSave} disabled={saving}>{saving ? "Saving…" : editTarget ? "Update Waybill" : "Record Waybill"}</button>
            <button style={styles.btn("secondary")} onClick={() => { setShowForm(false); setForm(emptyForm); setSelectedOrderId(""); setEditTarget(null); }}>Cancel</button>
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
              <tr>{["Waybill No.", "Date", "Driver", "Truck", "Block Type", "Loaded", "Received", "Damaged", "Receiver", ""].map(h => <th key={h} style={styles.th}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {waybills.map(w => (
                <tr key={w.id}>
                  <td style={styles.td}><span style={{ color: theme.accent, fontWeight: "600" }}>{w.waybill_number}</span></td>
                  <td style={styles.td}>{w.waybill_date}</td>
                  <td style={styles.td}>{w.driver?.full_name || "—"}</td>
                  <td style={styles.td}>{w.truck_number || "—"}</td>
                  <td style={styles.td}><span style={styles.badge(theme.blue)}>{w.block_type}</span></td>
                  <td style={styles.td}>{fmt(w.quantity_loaded)}</td>
                  <td style={styles.td}><strong style={{ color: theme.green }}>{fmt(w.quantity_received)}</strong></td>
                  <td style={styles.td}><span style={styles.badge(w.quantity_damaged > 0 ? theme.red : theme.green)}>{w.quantity_damaged}</span></td>
                  <td style={styles.td}>{w.receiver_name || "—"}</td>
                  <td style={styles.td}>
                    <div style={{ display: "flex", gap: "6px" }}>
                      <button style={{ ...styles.btn("secondary"), padding: "4px 10px", fontSize: "11px" }} onClick={() => {
                        const driver = staff.find(s => s.id === w.driver_id);
                        generateWaybillPDF({ waybill_number: w.waybill_number, date: w.waybill_date, customer_name: w.receiver_name, customer_location: "", block_type: w.block_type, quantity_loaded: w.quantity_loaded, batch_number: w.batch_id || "", driver_name: driver?.full_name || "", truck_number: w.truck_number || "", notes: w.notes || "" });
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

// ── CUSTOMER FORM (top-level to avoid focus loss on re-render) ────
const CustomerForm = ({ form, setForm, staff, saving, onSubmit, onCancel, submitLabel }) => (
  <div style={{ ...styles.card, marginBottom: "24px", borderColor: theme.accent + "44" }}>
    <div style={styles.sectionTitle}>{submitLabel === "Register" ? "Register New Customer" : "Edit Customer"}</div>
    <div style={styles.grid(3)}>
      {[{ label: "Full Name *", key: "name", placeholder: "e.g. Emeka Okafor" }, { label: "Company Name", key: "company_name", placeholder: "Optional" }, { label: "Phone *", key: "phone", placeholder: "+234…" }, { label: "Email", key: "email", placeholder: "Optional" }, { label: "Site Location / Delivery Address", key: "location", placeholder: "e.g. Gwarinpa, Abuja" }].map(f => (
        <div key={f.key} style={styles.formGroup}>
          <label style={styles.label}>{f.label}</label>
          <input style={styles.input} placeholder={f.placeholder} value={form[f.key]} onChange={e => setForm({ ...form, [f.key]: e.target.value })} />
        </div>
      ))}
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
    <div style={styles.row}>
      <button style={styles.btn("primary")} onClick={onSubmit} disabled={saving}>{saving ? "Saving…" : submitLabel}</button>
      <button style={styles.btn("secondary")} onClick={onCancel}>Cancel</button>
    </div>
  </div>
);

// ── CUSTOMERS ─────────────────────────────────────────────────
const Customers = () => {
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
  const emptyForm = { name: "", company_name: "", phone: "", email: "", location: "", how_heard: "", added_by: "", date_registered: today };
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

  const load = async () => {
    setLoading(true);
    try {
      const [c, s] = await Promise.all([customersService.getAllWithStats(), staffService.getAll()]);
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

  const filtered = customers.filter(c => {
    const q = search.toLowerCase();
    return !q || [c.name, c.phone, c.location, c.company_name].some(f => f?.toLowerCase().includes(q));
  });

  const getStats = (c) => {
    const orders = c.orders || [];
    const totalValue = orders.reduce((s, o) => s + (o.order_items || []).reduce((si, i) => si + Number(i.subtotal ?? i.quantity * i.unit_price), 0), 0);
    const totalPaid = orders.reduce((s, o) => s + (o.invoices || []).flatMap(inv => inv.payments || []).filter(p => p.status === "confirmed").reduce((sp, p) => sp + Number(p.amount_paid), 0), 0);
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
      const payload = { name: form.name, company_name: form.company_name || null, phone: form.phone, email: form.email || null, location: form.location || null, how_heard: form.how_heard || null, added_by: form.added_by || null, date_registered: form.date_registered || today };
      const saved = await customersService.create(payload);
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
      const [orders, prods] = await Promise.all([
        customersService.getStatement(customer.id),
        productsService.getActive().catch(() => []),
      ]);
      await generateStatementPDF(customer, orders, stmtFrom || null, stmtTo || null, prods);
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
      {showForm && !editMode && <CustomerForm form={form} setForm={setForm} staff={staff} saving={saving} onSubmit={handleSave} onCancel={() => setShowForm(false)} submitLabel="Register" />}

      <div style={styles.grid(3)}>
        <StatCard label="Total Customers" value={customers.length} sub="All registered" accent={theme.blue} />
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
                      <span style={{ color: theme.accent }}>{naira(totalValue)}</span>
                      {outstanding > 0 && <span style={{ color: theme.red }}>Owes {naira(outstanding)}</span>}
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
                  <StatCard label="Total Value" value={naira(totalValue)} sub="All orders" accent={theme.accent} />
                  <StatCard label="Total Paid" value={naira(totalPaid)} sub="Confirmed" accent={theme.green} />
                  <StatCard label="Outstanding" value={naira(outstanding)} sub="Balance due" accent={outstanding > 0 ? theme.red : theme.green} />
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

                <div style={{ marginTop: "20px", paddingTop: "16px", borderTop: `1px solid ${theme.border}` }}>
                  <div style={{ ...styles.sectionTitle, marginBottom: "10px" }}>Download Statement</div>
                  <div style={{ display: "flex", gap: "10px", alignItems: "flex-end", flexWrap: "wrap" }}>
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
                </div>
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
};

// ── REPORTS ───────────────────────────────────────────────────
const Reports = () => (
  <div>
    <div style={styles.header}>
      <div>
        <div style={styles.pageTitle}>Reports</div>
        <div style={styles.pageSubtitle}>Generate staff, production, and board-level reports</div>
      </div>
    </div>
    <div style={styles.grid(2)}>
      {[
        { title: "Production Report", desc: "Daily/weekly/monthly production volumes, material usage, and cost per block", color: theme.accent, icon: "🏭" },
        { title: "Damage & Waste Report", desc: "Breakages by stage — production, stacking, loading, and delivery", color: theme.red, icon: "⚠️" },
        { title: "Customer Statement", desc: "Per-customer order history, payments received, and delivery records", color: theme.blue, icon: "📋" },
        { title: "Staff & Payroll Report", desc: "Attendance, wages for daily workers, and permanent staff costs", color: theme.green, icon: "👥" },
        { title: "Delivery & Logistics Report", desc: "Diesel usage, distances covered, loading/offloading costs by driver", color: theme.accentDim, icon: "🚛" },
        { title: "Board Summary Report", desc: "High-level overview of revenue, costs, production, and KPIs for board review", color: theme.blue, icon: "📊" },
      ].map((r, i) => (
        <div key={i} style={{ ...styles.card, borderTop: `3px solid ${r.color}`, cursor: "pointer" }}>
          <div style={{ fontSize: "24px", marginBottom: "10px" }}>{r.icon}</div>
          <div style={{ fontWeight: "700", fontSize: "14px", marginBottom: "6px" }}>{r.title}</div>
          <div style={{ fontSize: "12px", color: theme.textMuted, marginBottom: "16px" }}>{r.desc}</div>
          <div style={styles.row}>
            <button style={styles.btn("primary")}>Generate PDF</button>
            <button style={styles.btn("secondary")}>Export Excel</button>
          </div>
        </div>
      ))}
    </div>
  </div>
);

// ── INVENTORY ─────────────────────────────────────────────────
const UNITS = ["bags", "kg", "litres", "units", "tonnes", "metres", "packs"];
const ISSUED_TO = ["Production", "Maintenance", "Logistics", "Administration", "Other"];

const Inventory = ({ onLowStockChange }) => {
  const [tab, setTab] = useState("registry");
  const [items, setItems] = useState([]);
  const [movements, setMovements] = useState([]);
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [alert, setAlert] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [editItem, setEditItem] = useState(null);
  const [showItemForm, setShowItemForm] = useState(false);
  const [movFilter, setMovFilter] = useState({ from: "", to: "", itemId: "" });
  const [reportDates, setReportDates] = useState({ from: "", to: "" });
  const [reportLoading, setReportLoading] = useState(false);

  const today = new Date().toISOString().split("T")[0];
  const emptyItem = { name: "", unit: "bags", current_stock: "", reorder_level: "", unit_cost: "", supplier: "" };
  const emptyIn  = { itemId: "", quantity: "", unitCost: "", supplier: "", staffName: "", date: today, notes: "" };
  const emptyOut = { itemId: "", quantity: "", issuedTo: "Production", staffName: "", reference: "", date: today, notes: "" };

  const [itemForm, setItemForm]   = useState(emptyItem);
  const [inForm,   setInForm]     = useState(emptyIn);
  const [outForm,  setOutForm]    = useState(emptyOut);

  const load = async () => {
    setLoading(true);
    try {
      const [its, s] = await Promise.all([inventoryService.getAllItems(), staffService.getActive()]);
      setItems(its);
      setStaff(s);
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
    setItemForm({ name: item.name, unit: item.unit, current_stock: String(item.current_stock), reorder_level: String(item.reorder_level), unit_cost: String(item.unit_cost || ""), supplier: item.supplier || "" });
    setEditItem(item);
    setShowItemForm(true);
  };

  const handleSaveItem = async () => {
    if (!itemForm.name || !itemForm.unit) return setAlert({ type: "error", msg: "Item name and unit are required." });
    setSaving(true);
    try {
      const payload = { name: itemForm.name, unit: itemForm.unit, current_stock: Number(itemForm.current_stock) || 0, reorder_level: Number(itemForm.reorder_level) || 0, unit_cost: Number(itemForm.unit_cost) || 0, supplier: itemForm.supplier || null };
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
    setSaving(true);
    try {
      await inventoryService.stockIn({ itemId: inForm.itemId, quantity: Number(inForm.quantity), unitCost: Number(inForm.unitCost) || 0, supplier: inForm.supplier, staffName: inForm.staffName, date: inForm.date, notes: inForm.notes });
      await load();
      if (tab === "movements") await loadMovements();
      setInForm(emptyIn);
      setAlert({ type: "success", msg: "Stock received and inventory updated!" });
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
      await inventoryService.stockOut({ itemId: outForm.itemId, quantity: Number(outForm.quantity), issuedTo: outForm.issuedTo, staffName: outForm.staffName, reference: outForm.reference, date: outForm.date, notes: outForm.notes });
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

  return (
    <div>
      {confirmDelete && <ConfirmModal msg={`Remove "${confirmDelete.name}" from inventory registry? All movement history for this item will also be deleted.`} onConfirm={handleDeleteItem} onCancel={() => setConfirmDelete(null)} />}

      <div style={styles.header}>
        <div>
          <div style={styles.pageTitle}>Inventory Management</div>
          <div style={styles.pageSubtitle}>Raw materials, consumables, and stock movements</div>
        </div>
        <button style={styles.btn("primary")} onClick={() => { setShowItemForm(true); setEditItem(null); setItemForm(emptyItem); setTab("registry"); }}>+ Add Item</button>
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
                  <tr>{["Item", "Unit", "On Hand", "Reorder Level", "Unit Cost", "Stock Value", "Supplier", "Last Updated", ""].map(h => <th key={h} style={styles.th}>{h}</th>)}</tr>
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
              <input style={styles.input} type="number" placeholder="e.g. 100" value={inForm.quantity} onChange={e => setInForm({ ...inForm, quantity: e.target.value })} />
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
              <label style={styles.label}>Supplier Name</label>
              <input style={styles.input} placeholder="Optional" value={inForm.supplier} onChange={e => setInForm({ ...inForm, supplier: e.target.value })} />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Received By</label>
              <select style={styles.input} value={inForm.staffName} onChange={e => setInForm({ ...inForm, staffName: e.target.value })}>
                <option value="">— Select staff —</option>
                {staff.map(s => <option key={s.id} value={s.full_name}>{s.full_name}</option>)}
              </select>
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
              <input style={styles.input} type="number" placeholder="e.g. 20" value={outForm.quantity} onChange={e => setOutForm({ ...outForm, quantity: e.target.value })} />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Issued To</label>
              <select style={styles.input} value={outForm.issuedTo} onChange={e => setOutForm({ ...outForm, issuedTo: e.target.value })}>
                {ISSUED_TO.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Issued By</label>
              <select style={styles.input} value={outForm.staffName} onChange={e => setOutForm({ ...outForm, staffName: e.target.value })}>
                <option value="">— Select staff —</option>
                {staff.map(s => <option key={s.id} value={s.full_name}>{s.full_name}</option>)}
              </select>
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

          <div style={styles.card}>
            <div style={styles.sectionTitle}>Stock Movement Log ({movements.length} records)</div>
            {movements.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px", color: theme.textMuted, fontSize: "13px" }}>No movements found for the selected filters.</div>
            ) : (
              <table style={styles.table}>
                <thead>
                  <tr>{["Date", "Type", "Item", "Qty", "Unit", "Unit Cost", "Total Cost", "From / To", "Staff", "Notes"].map(h => <th key={h} style={styles.th}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {movements.map(m => (
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
                    </tr>
                  ))}
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
  const today = new Date().toISOString().split("T")[0];
  const due = new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0];

  const load = async () => {
    setLoading(true);
    try { setLpos(await lpoService.getAll()); }
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
        await ordersService.updateStatus(lpo.order.id, "lpo_approved");
        // Auto-create invoice if none exists
        const existing = await invoicesService.getByOrder(lpo.order.id);
        if (existing.length === 0) {
          const total = (lpo.order.order_items || []).reduce((s, i) => s + i.quantity * i.unit_price, 0);
          const count = lpos.length;
          const year = new Date().getFullYear();
          await invoicesService.create({ order_id: lpo.order.id, invoice_number: `APC-LPO-${year}-${String(count + 1).padStart(3, "0")}`, total_amount: total, issued_date: today, due_date: due });
        }
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
                    <div style={{ marginTop: "8px", display: "flex", gap: "12px", fontSize: "13px" }}>
                      {(order.order_items || []).map((it, i) => (
                        <span key={i} style={styles.badge(theme.blue)}>{it.quantity?.toLocaleString()} {it.block_type}</span>
                      ))}
                      <span style={{ color: theme.accent, fontWeight: "700" }}>{naira(total)}</span>
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

  const load = async () => {
    setLoading(true);
    try { setEntries(await pendingDeliveryService.getAll()); }
    catch (e) { setAlert({ type: "error", msg: "Could not load register: " + e.message }); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const daysSince = (iso) => Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  const statusColor = (s) => s === "completed" ? theme.green : s === "partially_delivered" ? theme.blue : s === "scheduled" ? theme.accent : theme.textMuted;
  const totalRemaining = entries.reduce((s, e) => s + (Number(e.remaining_qty) || 0), 0);

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
        <StatCard label="Customers Waiting" value={entries.length} sub="Non-completed entries" accent={theme.blue} />
        <StatCard label="Total Blocks Remaining" value={fmt(totalRemaining)} sub="Still to be delivered" accent={theme.accent} />
        <StatCard label="Longest Wait" value={entries.length > 0 ? `${Math.max(...entries.map(e => daysSince(e.added_at)))} days` : "—"} sub="Days in register" accent={theme.red} />
      </div>
      {loading ? <Spinner /> : entries.length === 0 ? (
        <div style={{ ...styles.card, textAlign: "center", padding: "48px", color: theme.textMuted }}>No pending deliveries. Customers are added here when payment is confirmed or LPO is approved.</div>
      ) : (
        <div style={styles.card}>
          <table style={styles.table}>
            <thead>
              <tr>{["Customer", "Location", "Block Type", "Total Qty", "Delivered", "Remaining", "Days Waiting", "Added", "Status"].map(h => <th key={h} style={styles.th}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {entries.map(e => {
                const days = daysSince(e.added_at);
                const pct = e.total_qty > 0 ? Math.round((e.delivered_qty / e.total_qty) * 100) : 0;
                return (
                  <tr key={e.id} style={{ background: days > 14 ? "rgba(240,107,107,0.04)" : "transparent" }}>
                    <td style={styles.td}><strong>{e.customer?.name || "—"}</strong>{e.customer?.company_name && <div style={{ fontSize: "11px", color: theme.textMuted }}>{e.customer.company_name}</div>}</td>
                    <td style={styles.td}>{e.customer?.location || "—"}</td>
                    <td style={styles.td}><span style={styles.badge(theme.blue)}>{e.block_type}</span></td>
                    <td style={styles.td}>{Number(e.total_qty).toLocaleString()}</td>
                    <td style={styles.td}><span style={{ color: theme.green }}>{Number(e.delivered_qty).toLocaleString()}</span></td>
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
                  </tr>
                );
              })}
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
        <div style={styles.sectionTitle}>All Schedules ({schedules.length})</div>
        {loading ? <Spinner /> : schedules.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px", color: theme.textMuted }}>No schedules yet.</div>
        ) : schedules.map(s => (
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
        ))}
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
                  <button style={styles.btn("primary")} disabled={!!saving} onClick={() => handleApprove(sched)}>{saving === sched.id + "approve" ? "Approving…" : rejected.length > 0 ? `Approve (Remove ${rejected.length})` : "Approve Full Schedule"}</button>
                  <button style={styles.btn("danger")} disabled={!!saving} onClick={() => handleReject(sched)}>{saving === sched.id + "reject" ? "Rejecting…" : "Reject Entire Schedule"}</button>
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
const Batches = () => {
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
  const today = new Date().toISOString().split("T")[0];
  const emptyForm = { blockType: "9-inch", dateCured: today, qtyAccepted: "", createdBy: "", notes: "", linkedProds: [] };
  const [form, setForm] = useState(emptyForm);

  const load = async () => {
    setLoading(true);
    try {
      const [b, p] = await Promise.all([batchesService.getAll(), productionService.getAll()]);
      setBatches(b);
      setProductions(p);
    } catch (e) { setAlert({ type: "error", msg: "Could not load batches: " + e.message }); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const toggleProdLink = (id) => setForm(f => ({ ...f, linkedProds: f.linkedProds.includes(id) ? f.linkedProds.filter(p => p !== id) : [...f.linkedProds, id] }));

  const handleCreate = async () => {
    if (!form.qtyAccepted || !form.dateCured) return setAlert({ type: "error", msg: "Quantity accepted and cure date are required." });
    setSaving(true);
    try {
      const batchNum = await batchesService.getNextNumber();
      const batch = await batchesService.create({
        batch_number: batchNum, block_type: form.blockType, date_cured: form.dateCured,
        qty_accepted: parseInt(form.qtyAccepted), qty_remaining: parseInt(form.qtyAccepted),
        status: "active", notes: form.notes || null, created_by: form.createdBy || null,
      }, form.linkedProds);
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

  const filteredProds = productions.filter(p => p.block_type === form.blockType);
  const totalInYard = batches.filter(b => b.status === "active").reduce((s, b) => s + Number(b.qty_remaining || 0), 0);

  return (
    <div>
      <div style={styles.header}>
        <div><div style={styles.pageTitle}>Batch Management</div><div style={styles.pageSubtitle}>Finished goods batches after curing — link to production logs</div></div>
        <button style={styles.btn("primary")} onClick={() => setShowForm(!showForm)}>+ Create Batch</button>
      </div>
      {alert && <Alert msg={alert.msg} type={alert.type} onClose={() => setAlert(null)} />}

      {/* Edit Modal */}
      {editTarget && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
          <div style={{ background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: "12px", padding: "24px", width: "100%", maxWidth: "540px" }}>
            <div style={{ fontWeight: "700", fontSize: "15px", marginBottom: "18px" }}>Edit Batch — {editTarget.batch_number}</div>
            <div style={styles.grid(2)}>
              <div style={styles.formGroup}><label style={styles.label}>Block Type</label><ProductSelect value={editForm.blockType} onChange={(name) => setEditForm(f => ({ ...f, blockType: name }))} style={styles.input} /></div>
              <div style={styles.formGroup}><label style={styles.label}>Date Cured *</label><input style={styles.input} type="date" value={editForm.dateCured} onChange={e => setEditForm(f => ({ ...f, dateCured: e.target.value }))} /></div>
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

      <div style={styles.grid(3)}>
        <StatCard label="Active Batches" value={batches.filter(b => b.status === "active").length} sub="With stock remaining" accent={theme.green} />
        <StatCard label="Blocks In Yard" value={fmt(totalInYard)} sub="Across all active batches" accent={theme.accent} />
        <StatCard label="Exhausted Batches" value={batches.filter(b => b.status === "exhausted").length} sub="Fully delivered" accent={theme.textMuted} />
      </div>

      {showForm && (
        <div style={{ ...styles.card, marginBottom: "20px", borderColor: theme.accent + "44" }}>
          <div style={styles.sectionTitle}>Create New Batch</div>
          <div style={styles.grid(3)}>
            <div style={styles.formGroup}><label style={styles.label}>Block Type</label><ProductSelect value={form.blockType} onChange={(name) => setForm({ ...form, blockType: name, linkedProds: [] })} style={styles.input} /></div>
            <div style={styles.formGroup}><label style={styles.label}>Date Cured *</label><input style={styles.input} type="date" value={form.dateCured} onChange={e => setForm({ ...form, dateCured: e.target.value })} /></div>
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
          return (
            <div key={b.id} style={{ borderRadius: "8px", border: `1px solid ${b.status === "exhausted" ? theme.border : theme.accent + "44"}`, marginBottom: "10px", overflow: "hidden" }}>
              <div style={{ padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }} onClick={() => setExpandedId(isOpen ? null : b.id)}>
                <div>
                  <strong style={{ fontSize: "14px" }}>{b.batch_number}</strong>
                  <span style={{ ...styles.badge(theme.blue), marginLeft: "8px" }}>{b.block_type}</span>
                  <span style={styles.badge(b.status === "active" ? theme.green : theme.textMuted)}>{b.status}</span>
                  <div style={{ fontSize: "12px", color: theme.textMuted, marginTop: "3px" }}>Cured: {b.date_cured} · Created by: {b.created_by || "—"}</div>
                </div>
                <div style={{ textAlign: "right", display: "flex", gap: "8px", alignItems: "center" }}>
                  <div>
                    <div style={{ fontSize: "13px" }}>Accepted: <strong style={{ color: theme.accent }}>{Number(b.qty_accepted).toLocaleString()}</strong></div>
                    <div style={{ fontSize: "13px" }}>Remaining: <strong style={{ color: b.status === "active" ? theme.green : theme.textMuted }}>{Number(b.qty_remaining).toLocaleString()}</strong></div>
                  </div>
                  <div style={{ display: "flex", gap: "6px" }} onClick={e => e.stopPropagation()}>
                    <button style={{ ...styles.btn("secondary"), padding: "5px 12px", fontSize: "12px" }} onClick={() => startEdit(b)}>Edit</button>
                    <button style={{ ...styles.btn("danger"), padding: "5px 12px", fontSize: "12px" }} onClick={() => handleDelete(b)} disabled={deleting === b.id}>{deleting === b.id ? "…" : "Delete"}</button>
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
  const [expenseForm, setExpenseForm] = useState({ category_id: '', description: '', amount: '', vendor: '' });
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');

  useEffect(() => {
    setLoading(true);
    Promise.all([
      accountingService.getConfirmedPayments(date, date),
      incomeRecordsService.getAll(date, date),
      expensesService.getAll(date, date),
      expenseCategoriesService.getActive(),
    ]).then(([p, ir, ex, cats]) => { setPayments(p); setIncomeList(ir); setExpenses(ex); setCategories(cats); })
      .catch(e => setErr(e.message)).finally(() => setLoading(false));
  }, [date]);

  const addIncome = async () => {
    if (!incomeForm.source || !incomeForm.amount) return;
    try {
      const rec = await incomeRecordsService.create({ source: incomeForm.source, description: incomeForm.description, amount: Number(incomeForm.amount), record_date: date });
      setIncomeList(p => [rec, ...p]);
      setIncomeForm({ source: '', description: '', amount: '' });
      setOk('Income recorded');
    } catch (e) { setErr(e.message); }
  };

  const deleteIncome = async (id) => {
    try { await incomeRecordsService.delete(id); setIncomeList(p => p.filter(r => r.id !== id)); }
    catch (e) { setErr(e.message); }
  };

  const addExpense = async () => {
    if (!expenseForm.description || !expenseForm.amount) return;
    const amount = Number(expenseForm.amount);
    const status = amount >= 50000 ? 'pending' : 'approved';
    try {
      const rec = await expensesService.create({ ...expenseForm, category_id: expenseForm.category_id || null, amount, expense_date: date, status });
      setExpenses(p => [rec, ...p]);
      setExpenseForm({ category_id: '', description: '', amount: '', vendor: '' });
      setOk(status === 'pending' ? 'Submitted for MD approval (≥₦50,000)' : 'Expense recorded');
    } catch (e) { setErr(e.message); }
  };

  const approveExpense = async (id, status) => {
    try { await expensesService.updateStatus(id, status, 'MD'); setExpenses(p => p.map(e => e.id === id ? { ...e, status } : e)); }
    catch (e) { setErr(e.message); }
  };

  const deleteExpense = async (id) => {
    try { await expensesService.delete(id); setExpenses(p => p.filter(e => e.id !== id)); }
    catch (e) { setErr(e.message); }
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
                <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: `1px solid ${theme.border}22`, fontSize: '12px' }}>
                  <span style={{ color: theme.textMuted }}>{p.invoice?.order?.customer?.name || 'Customer'}</span>
                  <span style={{ fontWeight: '600', color: theme.green }}>{naira(p.amount_paid)}</span>
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
            <div style={{ fontSize: '11px', fontWeight: '700', color: theme.textMuted, marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Record Expense</div>
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
                <input style={styles.input} placeholder="Optional" value={expenseForm.vendor} onChange={e => setExpenseForm(f => ({ ...f, vendor: e.target.value }))} />
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
      .catch(e => setErr(e.message)).finally(() => setLoading(false));
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
    catch (e) { setErr(e.message); } finally { setPdfLoading(false); }
  };

  return (
    <div>
      <div style={{ ...styles.row, alignItems: 'flex-end', marginBottom: '20px', gap: '12px' }}>
        <div><label style={styles.label}>From</label><input type="date" style={{ ...styles.input, width: '150px' }} value={from} onChange={e => setFrom(e.target.value)} /></div>
        <div><label style={styles.label}>To</label><input type="date" style={{ ...styles.input, width: '150px' }} value={to} onChange={e => setTo(e.target.value)} /></div>
        <button style={styles.btn('secondary')} onClick={load}>Load</button>
        <button style={{ ...styles.btn('primary'), marginLeft: 'auto' }} onClick={downloadPdf} disabled={pdfLoading}>{pdfLoading ? 'Generating…' : '↓ Download PDF'}</button>
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

const CostTab = () => {
  const now = new Date();
  const firstOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const [from, setFrom] = useState(firstOfMonth);
  const [to, setTo] = useState(now.toISOString().split('T')[0]);
  const [expenses, setExpenses] = useState([]);
  const [productionLogs, setProductionLogs] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [pdfLoading, setPdfLoading] = useState(false);

  const load = () => {
    setLoading(true);
    Promise.all([
      expensesService.getAll(from, to),
      accountingService.getProductionTotals(from, to),
      productsService.getActive().catch(() => []),
    ]).then(([ex, pl, pr]) => { setExpenses(ex); setProductionLogs(pl); setProducts(pr); })
      .catch(e => setErr(e.message)).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const totalExpenses = expenses.filter(e => e.status !== 'rejected').reduce((s, e) => s + Number(e.amount || 0), 0);
  const productTotals = {};
  for (const log of productionLogs) {
    productTotals[log.block_type] = (productTotals[log.block_type] || 0) + Number(log.quantity_produced || 0);
  }
  const totalQty = Object.values(productTotals).reduce((s, v) => s + v, 0);
  const productMap = Object.fromEntries(products.map(p => [p.name, p]));

  const downloadPdf = async () => {
    setPdfLoading(true);
    try { await generateCostAnalysisPDF({ fromDate: from || null, toDate: to || null, productTotals, totalExpenses, products }); }
    catch (e) { setErr(e.message); } finally { setPdfLoading(false); }
  };

  return (
    <div>
      <div style={{ ...styles.row, alignItems: 'flex-end', marginBottom: '20px', gap: '12px' }}>
        <div><label style={styles.label}>From</label><input type="date" style={{ ...styles.input, width: '150px' }} value={from} onChange={e => setFrom(e.target.value)} /></div>
        <div><label style={styles.label}>To</label><input type="date" style={{ ...styles.input, width: '150px' }} value={to} onChange={e => setTo(e.target.value)} /></div>
        <button style={styles.btn('secondary')} onClick={load}>Load</button>
        <button style={{ ...styles.btn('primary'), marginLeft: 'auto' }} onClick={downloadPdf} disabled={pdfLoading}>{pdfLoading ? 'Generating…' : '↓ Download PDF'}</button>
      </div>
      {err && <Alert msg={err} onClose={() => setErr('')} />}
      {loading ? <Spinner /> : (
        <>
          <div style={{ ...styles.grid(3), marginBottom: '20px' }}>
            <div style={styles.statCard(theme.blue)}><div style={styles.statLabel}>Total Units Produced</div><div style={{ ...styles.statValue, fontSize: '20px' }}>{fmt(totalQty)}</div></div>
            <div style={styles.statCard(theme.red)}><div style={styles.statLabel}>Total Expenses (Period)</div><div style={{ ...styles.statValue, fontSize: '20px', color: theme.red }}>{naira(totalExpenses)}</div></div>
            <div style={styles.statCard(theme.accent)}><div style={styles.statLabel}>Avg Cost / Unit</div><div style={{ ...styles.statValue, fontSize: '20px', color: theme.accent }}>{totalQty > 0 ? naira(Math.round(totalExpenses / totalQty)) : '—'}</div></div>
          </div>
          <div style={styles.card}>
            <div style={styles.sectionTitle}>Cost per Product</div>
            <table style={styles.table}>
              <thead>
                <tr>
                  {['Product', 'Units Produced', 'Allocated Cost', 'Cost / Unit', 'Selling Price', 'Gross Profit / Unit', 'Margin'].map(h => (
                    <th key={h} style={{ ...styles.th, textAlign: h === 'Product' ? 'left' : 'right' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Object.entries(productTotals).length === 0 ? (
                  <tr><td colSpan="7" style={{ ...styles.td, textAlign: 'center', color: theme.textMuted }}>No production data for this period</td></tr>
                ) : Object.entries(productTotals).map(([name, qty]) => {
                  const share = totalQty > 0 ? qty / totalQty : 0;
                  const allocated = totalExpenses * share;
                  const costPerUnit = qty > 0 ? allocated / qty : 0;
                  const sellingPrice = productMap[name]?.unit_price || 0;
                  const profit = sellingPrice - costPerUnit;
                  const margin = sellingPrice > 0 ? (profit / sellingPrice) * 100 : 0;
                  const unit = productMap[name]?.unit || 'pcs';
                  return (
                    <tr key={name}>
                      <td style={styles.td}><strong>{name}</strong></td>
                      <td style={{ ...styles.td, textAlign: 'right' }}>{fmt(qty)} {unit}</td>
                      <td style={{ ...styles.td, textAlign: 'right' }}>{naira(Math.round(allocated))}</td>
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
      .then(setReceivables).catch(e => setErr(e.message)).finally(() => setLoading(false));
  }, []);

  const rows = [];
  const bucketTotals = { '0–30': 0, '31–60': 0, '61–90': 0, '90+': 0 };
  let grandTotal = 0;

  for (const order of receivables) {
    for (const inv of order.invoices || []) {
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
    catch (e) { setErr(e.message); } finally { setPdfLoading(false); }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '20px' }}>
        <button style={styles.btn('primary')} onClick={downloadPdf} disabled={pdfLoading}>{pdfLoading ? 'Generating…' : '↓ Download PDF'}</button>
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
    } catch (e) { setErr(e.message); } finally { setLoading(false); }
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
    } catch (e) { setErr(e.message); } finally { setPdfLoading(false); }
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

const BankAccountsTab = () => {
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
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');

  useEffect(() => {
    bankAccountsService.getAll().then(a => { setAccounts(a); }).catch(e => setErr(e.message));
  }, []);

  useEffect(() => {
    if (!selected) return;
    setTxLoading(true);
    bankTransactionsService.getByAccount(selected.id, txFrom || null, txTo || null)
      .then(setTransactions).catch(e => setErr(e.message)).finally(() => setTxLoading(false));
  }, [selected?.id, txFrom, txTo]);

  const openImport = (acct) => { setImportAcct(acct.id); setImportFile(null); setImportStep('upload'); setErr(''); setOk(''); };
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
    const txs = mapRowsToTransactions(importRows, colMap);
    if (txs.length === 0) { setErr('No valid transactions found. Check column mapping.'); return; }
    const withDups = await bankTransactionsService.checkDuplicates(importAcct, txs).catch(() => txs.map(t => ({ ...t, isDuplicate: false })));
    // Auto-match
    const acct = accounts.find(a => a.id === importAcct);
    let payments = [], expenses2 = [];
    try {
      [payments, expenses2] = await Promise.all([
        accountingService.getConfirmedPayments(null, null),
        expensesService.getAll(null, null),
      ]);
    } catch {}
    const matched = autoMatchTransactions(withDups.filter(t => !t.isDuplicate), payments, expenses2, acct?.account_type || 'both');
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
    } catch (e) { setErr(e.message); } finally { setImporting(false); }
  };

  const saveMatch = async () => {
    if (!matchModal) return;
    try {
      await bankTransactionsService.updateMatch(matchModal.id, matchType === 'other' ? 'manual' : 'matched', matchType, null, matchNotes);
      setTransactions(t => t.map(tx => tx.id === matchModal.id ? { ...tx, match_status: matchType === 'other' ? 'manual' : 'matched', matched_to_type: matchType, notes: matchNotes } : tx));
      setMatchModal(null);
    } catch (e) { setErr(e.message); }
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
                  <button style={{ ...styles.btn('primary'), marginLeft: 'auto' }} onClick={confirmImport} disabled={importing}>{importing ? 'Importing…' : `✓ Import ${preview.length} Transactions`}</button>
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

      {/* Account Cards */}
      <div style={styles.grid(accounts.length > 2 ? 3 : 2)}>
        {accounts.map(acct => (
          <div key={acct.id} style={{ ...styles.card, cursor: 'pointer', borderTop: `3px solid ${acct.account_type === 'income' ? theme.green : acct.account_type === 'expense' ? theme.red : theme.blue}`, outline: selected?.id === acct.id ? `2px solid ${theme.accent}` : 'none' }}
            onClick={() => setSelected(acct)}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontWeight: '700', fontSize: '14px' }}>{acct.bank_name}</div>
                <div style={{ fontSize: '11px', color: theme.textMuted, marginTop: '2px' }}>{acct.account_name}</div>
                <div style={{ fontSize: '12px', color: theme.textMuted, marginTop: '2px', fontFamily: 'monospace' }}>{acct.account_number}</div>
              </div>
              <span style={styles.badge(acct.account_type === 'income' ? theme.green : acct.account_type === 'expense' ? theme.red : theme.blue)}>{acct.account_type}</span>
            </div>
            <div style={{ marginTop: '14px' }}>
              <div style={styles.statLabel}>Current Balance</div>
              <div style={{ fontSize: '20px', fontWeight: '700', color: theme.accent, marginTop: '4px' }}>{naira(acct.current_balance)}</div>
            </div>
            <div style={{ display: 'flex', gap: '8px', marginTop: '14px' }} onClick={e => e.stopPropagation()}>
              <button style={{ ...styles.btn('secondary'), padding: '5px 12px', fontSize: '12px', flex: 1 }} onClick={() => openImport(acct)}>↑ Import</button>
            </div>
          </div>
        ))}
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
          {txLoading ? <Spinner /> : (
            <div style={styles.card}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    {['Date','Description','Debit','Credit','Balance','Status',''].map(h => <th key={h} style={styles.th}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0
                    ? <tr><td colSpan="7" style={{ ...styles.td, textAlign: 'center', color: theme.textMuted, padding: '30px' }}>No transactions. Import a statement to get started.</td></tr>
                    : filtered.map(tx => (
                      <tr key={tx.id}>
                        <td style={{ ...styles.td, whiteSpace: 'nowrap' }}>{tx.transaction_date}</td>
                        <td style={{ ...styles.td, maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={tx.description}>{tx.description}</td>
                        <td style={{ ...styles.td, textAlign: 'right', color: theme.red, fontWeight: '600' }}>{tx.debit > 0 ? naira(tx.debit) : ''}</td>
                        <td style={{ ...styles.td, textAlign: 'right', color: theme.green, fontWeight: '600' }}>{tx.credit > 0 ? naira(tx.credit) : ''}</td>
                        <td style={{ ...styles.td, textAlign: 'right' }}>{tx.balance > 0 ? naira(tx.balance) : ''}</td>
                        <td style={styles.td}>
                          <span style={styles.badge(tx.match_status === 'matched' ? theme.green : tx.match_status === 'manual' ? theme.blue : theme.red)}>
                            {tx.match_status || 'unmatched'}
                          </span>
                          {tx.matched_to_type && <div style={{ fontSize: '10px', color: theme.textMuted, marginTop: '2px' }}>{tx.matched_to_type}</div>}
                        </td>
                        <td style={styles.td}>
                          {tx.match_status === 'unmatched' && (
                            <button style={{ ...styles.btn('secondary'), padding: '3px 8px', fontSize: '11px' }}
                              onClick={() => { setMatchModal(tx); setMatchType('other'); setMatchNotes(''); }}>Match</button>
                          )}
                        </td>
                      </tr>
                    ))
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
    }).catch(e => setErr(e.message));
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
    } catch (e) { setErr(e.message); }
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
    } catch (e) { setErr(e.message); }
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
    } catch (e) { setErr(e.message); }
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
  const [loading, setLoading] = useState(false);
  const [rfrom, setRfrom] = useState('');
  const [rto, setRto] = useState('');
  const [rsearch, setRsearch] = useState('');
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadForm, setUploadForm] = useState({ receipt_date: today, vendor_name: '', amount: '', tax_category: '', notes: '' });
  const [uploading, setUploading] = useState(false);
  const [viewUrl, setViewUrl] = useState(null);
  const [missingCount, setMissingCount] = useState(0);
  const [showMissing, setShowMissing] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');

  const loadReceipts = () => {
    setLoading(true);
    receiptsService.getAll(rfrom || null, rto || null, rsearch || null)
      .then(setReceipts).catch(e => setErr(e.message)).finally(() => setLoading(false));
  };

  useEffect(() => { loadReceipts(); receiptsService.getMissingReceiptExpenses().then(setMissingCount).catch(() => {}); }, []);

  const handleUpload = async () => {
    if (!uploadFile) { setErr('Please select a file'); return; }
    if (!uploadForm.receipt_date || !uploadForm.vendor_name || !uploadForm.amount) { setErr('Date, vendor and amount are required'); return; }
    setUploading(true);
    try {
      const rec = await receiptsService.upload(uploadFile, uploadForm);
      setReceipts(r => [rec, ...r]);
      setUploadFile(null);
      setUploadForm({ receipt_date: today, vendor_name: '', amount: '', tax_category: '', notes: '' });
      setOk(`Receipt ${rec.receipt_number} uploaded`);
      receiptsService.getMissingReceiptExpenses().then(setMissingCount).catch(() => {});
    } catch (e) { setErr(e.message); }
    finally { setUploading(false); }
  };

  const handleDelete = async (r) => {
    try {
      await receiptsService.delete(r.id, r.file_url);
      setReceipts(rs => rs.filter(x => x.id !== r.id));
    } catch (e) { setErr(e.message); }
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
          const res = await fetch(r.file_url);
          if (res.ok) {
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
          {viewUrl.endsWith('.pdf') || viewUrl.includes('/pdf')
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
                      onClick={() => setViewUrl(r.file_url)}>
                      {r.receipt_type === 'photo'
                        ? <img src={r.file_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => e.target.style.display = 'none'} />
                        : <div style={{ fontSize: '32px', textAlign: 'center' }}>📄</div>}
                    </div>
                    <div style={{ fontSize: '11px', fontWeight: '700', color: theme.accent }}>{r.receipt_number}</div>
                    <div style={{ fontSize: '11px', fontWeight: '600', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.vendor_name}</div>
                    <div style={{ fontSize: '11px', color: theme.green, fontWeight: '600' }}>{naira(r.amount)}</div>
                    <div style={{ fontSize: '10px', color: theme.textMuted }}>{r.receipt_date}</div>
                    <div style={{ display: 'flex', gap: '4px', marginTop: '8px' }}>
                      <a href={r.file_url} target="_blank" rel="noreferrer" style={{ ...styles.btn('secondary'), padding: '3px 8px', fontSize: '10px', textDecoration: 'none', display: 'inline-block' }}>↓</a>
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

const Accounting = () => {
  const [tab, setTab] = useState('bookkeeping');
  const TABS = [
    { id: 'bookkeeping', label: 'Daily Bookkeeping' },
    { id: 'pl', label: 'P&L Statement' },
    { id: 'cost', label: 'Cost Analysis' },
    { id: 'receivables', label: 'Accounts Receivable' },
    { id: 'management', label: 'Management Accounts' },
    { id: 'bank', label: 'Bank Accounts' },
    { id: 'reconciliation', label: 'Reconciliation' },
    { id: 'receipts', label: 'Receipts' },
  ];
  return (
    <div>
      <div style={styles.header}>
        <div>
          <div style={styles.pageTitle}>Accounting</div>
          <div style={styles.pageSubtitle}>Financial records, P&L, cost analysis and management accounts</div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: '2px', marginBottom: '24px', borderBottom: `1px solid ${theme.border}` }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
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
      {tab === 'cost' && <CostTab />}
      {tab === 'receivables' && <ReceivablesTab />}
      {tab === 'management' && <ManagementTab />}
      {tab === 'bank' && <BankAccountsTab />}
      {tab === 'reconciliation' && <ReconciliationTab />}
      {tab === 'receipts' && <ReceiptsTab />}
    </div>
  );
};

// ── NAV ───────────────────────────────────────────────────────
const navItems = [
  { section: "Overview", items: [{ id: "dashboard", label: "Dashboard", icon: "dashboard" }] },
  { section: "Operations", items: [
    { id: "production", label: "Production", icon: "production" },
    { id: "inventory", label: "Inventory", icon: "inventory" },
    { id: "batches", label: "Batches", icon: "batches" },
    { id: "waybills", label: "Waybills", icon: "waybill" },
    { id: "staff", label: "Staff", icon: "staff" },
  ]},
  { section: "Deliveries", items: [
    { id: "pending_register", label: "Pending Deliveries", icon: "pending" },
    { id: "daily_schedule", label: "Daily Schedule", icon: "schedule" },
  ]},
  { section: "Sales", items: [{ id: "customers", label: "Customers", icon: "staff" }, { id: "orders", label: "Orders & Invoicing", icon: "orders" }] },
  { section: "Approvals", items: [
    { id: "lpo_approvals", label: "LPO Approvals", icon: "lpo" },
    { id: "schedule_approvals", label: "Schedule Approvals", icon: "approve" },
  ]},
  { section: "Analytics", items: [{ id: "reports", label: "Reports", icon: "reports" }] },
  { section: "Finance", items: [{ id: "accounting", label: "Accounting", icon: "orders" }] },
  { section: "Settings", items: [{ id: "products", label: "Products", icon: "products" }] },
];

// ── APP ───────────────────────────────────────────────────────
export default function App() {
  const [active, setActive] = useState("dashboard");
  const [lowStockCount, setLowStockCount] = useState(0);
  const [lpoCount, setLpoCount] = useState(0);
  const [scheduleCount, setScheduleCount] = useState(0);

  const pages = {
    dashboard: <Dashboard />,
    production: <Production />,
    inventory: <Inventory onLowStockChange={setLowStockCount} />,
    batches: <Batches />,
    waybills: <Waybills />,
    staff: <Staff />,
    customers: <Customers />,
    orders: <Orders onNavigate={setActive} />,
    pending_register: <PendingDeliveryRegister />,
    daily_schedule: <DailySchedule />,
    lpo_approvals: <LPOApprovals />,
    schedule_approvals: <ScheduleApprovals />,
    reports: <Reports />,
    products: <Products />,
    accounting: <Accounting />,
  };

  // Load approval badge counts on mount
  useEffect(() => {
    lpoService.getPending().then(l => setLpoCount(l.length)).catch(() => {});
    schedulesService.getSubmitted().then(s => setScheduleCount(s.length)).catch(() => {});
  }, [active]);

  const getBadge = (id) => {
    if (id === "inventory" && lowStockCount > 0) return lowStockCount;
    if (id === "lpo_approvals" && lpoCount > 0) return lpoCount;
    if (id === "schedule_approvals" && scheduleCount > 0) return scheduleCount;
    return 0;
  };

  return (
    <div style={styles.app}>
      <div style={{ ...styles.sidebar, overflowY: "auto" }}>
        <div style={styles.logo}>
          <img src="/logo.png" alt="Abuja Precast Concrete Limited" style={{ width: "100%", maxWidth: "180px", marginBottom: "10px", display: "block" }} />
          <div style={styles.logoSub}>Quality Precast products. Reliable Delivery.</div>
        </div>
        <nav style={styles.nav}>
          {navItems.map(section => (
            <div key={section.section}>
              <div style={styles.navSection}>{section.section}</div>
              {section.items.map(item => {
                const badge = getBadge(item.id);
                return (
                  <div key={item.id} style={styles.navItem(active === item.id)} onClick={() => setActive(item.id)}>
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
          <div style={{ fontWeight: "700", color: theme.text, fontSize: "12px", marginBottom: "6px" }}>MD Access · Full permissions</div>
          <div>📍 No. 1, Off Bwari Road, Abuja, Nigeria.</div>
          <div>📞 +234 905 554 4433</div>
          <div style={{ wordBreak: "break-all" }}>✉️ abujaprecastconcreteltd@gmail.com</div>
        </div>
      </div>
      <main style={styles.main}>
        {pages[active]}
      </main>
    </div>
  );
}
