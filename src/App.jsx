import { useState } from "react";

const theme = {
  bg: "#0f1117",
  surface: "#1a1d27",
  card: "#21263a",
  border: "#2e3452",
  accent: "#f5a623",
  accentDim: "#c47d0e",
  green: "#2dd4a0",
  red: "#f06b6b",
  blue: "#5b8dee",
  text: "#e8eaf0",
  textMuted: "#7c839e",
  textDim: "#4a5175",
};

const styles = {
  app: {
    minHeight: "100vh",
    background: theme.bg,
    color: theme.text,
    fontFamily: "'DM Sans', 'Segoe UI', sans-serif",
    display: "flex",
  },
  sidebar: {
    width: "240px",
    minHeight: "100vh",
    background: theme.surface,
    borderRight: `1px solid ${theme.border}`,
    display: "flex",
    flexDirection: "column",
    padding: "0",
    position: "fixed",
    top: 0,
    left: 0,
    bottom: 0,
  },
  logo: {
    padding: "20px 20px 16px",
    borderBottom: `1px solid ${theme.border}`,
  },
  logoPlaceholder: {
    width: "52px",
    height: "52px",
    borderRadius: "10px",
    background: theme.card,
    border: `2px dashed ${theme.border}`,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: "12px",
    cursor: "pointer",
    transition: "border-color 0.15s",
  },
  logoPlaceholderText: {
    fontSize: "9px",
    color: theme.textDim,
    textAlign: "center",
    marginTop: "2px",
    letterSpacing: "0.04em",
  },
  logoTitle: {
    fontSize: "12px",
    fontWeight: "700",
    color: theme.accent,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    lineHeight: "1.3",
  },
  logoSub: {
    fontSize: "10.5px",
    color: theme.textMuted,
    marginTop: "3px",
    lineHeight: "1.4",
  },
  nav: {
    padding: "12px 0",
    flex: 1,
  },
  navSection: {
    padding: "8px 20px 4px",
    fontSize: "10px",
    fontWeight: "700",
    color: theme.textDim,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
  },
  navItem: (active) => ({
    display: "flex",
    alignItems: "center",
    gap: "10px",
    padding: "9px 20px",
    fontSize: "13.5px",
    fontWeight: active ? "600" : "400",
    color: active ? theme.accent : theme.textMuted,
    background: active ? "rgba(245,166,35,0.08)" : "transparent",
    borderLeft: active ? `3px solid ${theme.accent}` : "3px solid transparent",
    cursor: "pointer",
    transition: "all 0.15s",
  }),
  main: {
    marginLeft: "240px",
    flex: 1,
    padding: "28px 32px",
    minHeight: "100vh",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: "28px",
  },
  pageTitle: {
    fontSize: "22px",
    fontWeight: "700",
    color: theme.text,
  },
  pageSubtitle: {
    fontSize: "13px",
    color: theme.textMuted,
    marginTop: "3px",
  },
  badge: (color) => ({
    display: "inline-block",
    padding: "3px 10px",
    borderRadius: "20px",
    fontSize: "11px",
    fontWeight: "600",
    background: color + "22",
    color: color,
    border: `1px solid ${color}44`,
  }),
  grid: (cols) => ({
    display: "grid",
    gridTemplateColumns: `repeat(${cols}, 1fr)`,
    gap: "16px",
    marginBottom: "24px",
  }),
  card: {
    background: theme.card,
    border: `1px solid ${theme.border}`,
    borderRadius: "12px",
    padding: "20px",
  },
  statCard: (accent) => ({
    background: theme.card,
    border: `1px solid ${theme.border}`,
    borderRadius: "12px",
    padding: "20px",
    borderTop: `3px solid ${accent}`,
  }),
  statLabel: {
    fontSize: "11px",
    fontWeight: "700",
    color: theme.textMuted,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
  },
  statValue: {
    fontSize: "26px",
    fontWeight: "700",
    color: theme.text,
    marginTop: "6px",
  },
  statSub: {
    fontSize: "12px",
    color: theme.textMuted,
    marginTop: "4px",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: "13px",
  },
  th: {
    textAlign: "left",
    padding: "10px 14px",
    fontSize: "11px",
    fontWeight: "700",
    color: theme.textMuted,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    borderBottom: `1px solid ${theme.border}`,
  },
  td: {
    padding: "12px 14px",
    borderBottom: `1px solid ${theme.border}22`,
    color: theme.text,
  },
  sectionTitle: {
    fontSize: "14px",
    fontWeight: "700",
    color: theme.text,
    marginBottom: "14px",
  },
  btn: (variant) => ({
    padding: "8px 18px",
    borderRadius: "8px",
    fontSize: "13px",
    fontWeight: "600",
    cursor: "pointer",
    border: "none",
    background: variant === "primary" ? theme.accent : theme.surface,
    color: variant === "primary" ? "#000" : theme.textMuted,
    border: variant === "secondary" ? `1px solid ${theme.border}` : "none",
  }),
  input: {
    background: theme.surface,
    border: `1px solid ${theme.border}`,
    borderRadius: "8px",
    padding: "9px 12px",
    fontSize: "13px",
    color: theme.text,
    width: "100%",
    outline: "none",
  },
  label: {
    fontSize: "12px",
    fontWeight: "600",
    color: theme.textMuted,
    marginBottom: "5px",
    display: "block",
  },
  formGroup: {
    marginBottom: "14px",
  },
  row: {
    display: "flex",
    gap: "12px",
  },
  progressBar: (pct, color) => ({
    height: "6px",
    background: theme.border,
    borderRadius: "3px",
    overflow: "hidden",
    marginTop: "8px",
  }),
  progressFill: (pct, color) => ({
    height: "100%",
    width: `${pct}%`,
    background: color,
    borderRadius: "3px",
    transition: "width 0.4s ease",
  }),
};

// ── SAMPLE DATA ──────────────────────────────────────────────
const sampleProduction = [
  { date: "2026-05-11", blockType: "9-inch", produced: 850, cement: 42, granite: 1200, diesel: 80, damaged: { production: 4, stacking: 2 } },
  { date: "2026-05-10", blockType: "6-inch", produced: 1200, cement: 55, granite: 1600, diesel: 90, damaged: { production: 6, stacking: 1 } },
  { date: "2026-05-09", blockType: "Interlock", produced: 600, cement: 38, granite: 900, diesel: 70, damaged: { production: 3, stacking: 0 } },
];

const sampleOrders = [
  { id: "APC-ORD-001", customer: "Metama Housing", location: "Metama, Abuja", marketer: "Aliyu Musa", items: [{ type: "9-inch", qty: 10000, unit: 250 }, { type: "6-inch", qty: 5000, unit: 200 }], totalValue: 3500000, paid: 1500000, delivered: 6000, status: "in_progress" },
  { id: "APC-ORD-002", customer: "Gwarinpa Developers", location: "Gwarinpa, Abuja", marketer: "Fatima Bello", items: [{ type: "Interlock", qty: 3000, unit: 350 }], totalValue: 1050000, paid: 1050000, delivered: 3000, status: "completed" },
  { id: "APC-ORD-003", customer: "Kubwa Estate", location: "Kubwa, Abuja", marketer: "Aliyu Musa", items: [{ type: "9-inch", qty: 8000, unit: 250 }], totalValue: 2000000, paid: 500000, delivered: 0, status: "invoiced" },
];

const sampleStaff = [
  { name: "Emeka Okafor", role: "Driver", type: "permanent", salary: 85000, status: "active" },
  { name: "Musa Ibrahim", role: "Labourer", type: "daily", rate: 3500, status: "active" },
  { name: "Fatima Bello", role: "Marketer", type: "permanent", salary: 95000, status: "active" },
  { name: "James Eze", role: "Labourer", type: "daily", rate: 3500, status: "active" },
  { name: "Aliyu Musa", role: "Marketer", type: "permanent", salary: 90000, status: "active" },
];

const sampleWaybills = [
  { id: "APC-WB-001", date: "2026-05-11", order: "APC-ORD-001", driver: "Emeka Okafor", truck: "ABC-123-AA", blockType: "9-inch", loaded: 400, received: 397, damaged: 3, receiver: "Mr. Tunde" },
  { id: "APC-WB-002", date: "2026-05-10", order: "APC-ORD-001", driver: "Emeka Okafor", truck: "ABC-123-AA", blockType: "9-inch", loaded: 500, received: 500, damaged: 0, receiver: "Mr. Tunde" },
  { id: "APC-WB-003", date: "2026-05-09", order: "APC-ORD-002", driver: "Emeka Okafor", truck: "XYZ-456-BB", blockType: "Interlock", loaded: 600, received: 598, damaged: 2, receiver: "Alhaji Sule" },
];

// ── ICONS ─────────────────────────────────────────────────────
const Icon = ({ name, size = 16 }) => {
  const icons = {
    dashboard: "⊞", production: "🏭", orders: "📋", staff: "👥",
    waybill: "📄", reports: "📊", settings: "⚙", logout: "→",
    up: "↑", down: "↓", alert: "⚠", check: "✓", plus: "+",
  };
  return <span style={{ fontSize: size }}>{icons[name] || "•"}</span>;
};

// ── STAT CARD ─────────────────────────────────────────────────
const StatCard = ({ label, value, sub, accent, pct }) => (
  <div style={styles.statCard(accent)}>
    <div style={styles.statLabel}>{label}</div>
    <div style={styles.statValue}>{value}</div>
    {sub && <div style={styles.statSub}>{sub}</div>}
    {pct !== undefined && (
      <div style={styles.progressBar(pct, accent)}>
        <div style={styles.progressFill(pct, accent)} />
      </div>
    )}
  </div>
);

// ── DASHBOARD ─────────────────────────────────────────────────
const Dashboard = () => (
  <div>
    <div style={styles.header}>
      <div>
        <div style={styles.pageTitle}>Good morning, MD 👋</div>
        <div style={styles.pageSubtitle}>Here's your business overview for today — Monday, 11 May 2026</div>
      </div>
      <span style={styles.badge(theme.green)}>Operations Active</span>
    </div>

    <div style={styles.grid(4)}>
      <StatCard label="Blocks Produced Today" value="850" sub="9-inch blocks" accent={theme.accent} />
      <StatCard label="Active Orders" value="3" sub="₦6.55M total value" accent={theme.blue} />
      <StatCard label="Revenue This Month" value="₦3.05M" sub="Payments confirmed" accent={theme.green} />
      <StatCard label="Damages This Week" value="15" sub="Across all stages" accent={theme.red} />
    </div>

    <div style={styles.grid(2)}>
      <div style={styles.card}>
        <div style={styles.sectionTitle}>Production This Week</div>
        {[
          { day: "Mon", blocks: 850, color: theme.accent },
          { day: "Tue", blocks: 1200, color: theme.accent },
          { day: "Wed", blocks: 600, color: theme.accent },
          { day: "Thu", blocks: 950, color: theme.accentDim },
          { day: "Fri", blocks: 0, color: theme.border },
        ].map(d => (
          <div key={d.day} style={{ marginBottom: "10px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", marginBottom: "4px" }}>
              <span style={{ color: theme.textMuted }}>{d.day}</span>
              <span style={{ color: theme.text, fontWeight: "600" }}>{d.blocks.toLocaleString()} blocks</span>
            </div>
            <div style={styles.progressBar(100, d.color)}>
              <div style={styles.progressFill((d.blocks / 1200) * 100, d.color)} />
            </div>
          </div>
        ))}
      </div>

      <div style={styles.card}>
        <div style={styles.sectionTitle}>Order Status</div>
        {sampleOrders.map(o => (
          <div key={o.id} style={{ marginBottom: "16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: "13px", fontWeight: "600" }}>{o.customer}</div>
                <div style={{ fontSize: "11px", color: theme.textMuted }}>{o.id} · {o.location}</div>
              </div>
              <span style={styles.badge(o.status === "completed" ? theme.green : o.status === "invoiced" ? theme.blue : theme.accent)}>
                {o.status}
              </span>
            </div>
            <div style={{ marginTop: "8px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: theme.textMuted }}>
                <span>Delivered: {o.delivered.toLocaleString()} blocks</span>
                <span>Paid: ₦{o.paid.toLocaleString()}</span>
              </div>
              <div style={styles.progressBar(100, theme.green)}>
                <div style={styles.progressFill((o.paid / o.totalValue) * 100, theme.green)} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>

    <div style={styles.card}>
      <div style={styles.sectionTitle}>Recent Waybills</div>
      <table style={styles.table}>
        <thead>
          <tr>
            {["Waybill No.", "Date", "Customer Order", "Driver", "Loaded", "Received", "Damaged"].map(h => (
              <th key={h} style={styles.th}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sampleWaybills.map(w => (
            <tr key={w.id}>
              <td style={styles.td}><span style={{ color: theme.accent, fontWeight: "600" }}>{w.id}</span></td>
              <td style={styles.td}>{w.date}</td>
              <td style={styles.td}>{w.order}</td>
              <td style={styles.td}>{w.driver}</td>
              <td style={styles.td}>{w.loaded}</td>
              <td style={styles.td}>{w.received}</td>
              <td style={styles.td}>
                <span style={styles.badge(w.damaged > 0 ? theme.red : theme.green)}>
                  {w.damaged}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

// ── PRODUCTION ────────────────────────────────────────────────
const Production = () => {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ date: "", blockType: "9-inch", produced: "", cement: "", granite: "", diesel: "", dmgProd: "", dmgStack: "" });

  return (
    <div>
      <div style={styles.header}>
        <div>
          <div style={styles.pageTitle}>Production Log</div>
          <div style={styles.pageSubtitle}>Daily block production, material usage, and damage tracking</div>
        </div>
        <button style={styles.btn("primary")} onClick={() => setShowForm(!showForm)}>
          + Log Today's Production
        </button>
      </div>

      {showForm && (
        <div style={{ ...styles.card, marginBottom: "24px", borderColor: theme.accent + "44" }}>
          <div style={styles.sectionTitle}>New Production Entry</div>
          <div style={styles.grid(3)}>
            <div style={styles.formGroup}>
              <label style={styles.label}>Date</label>
              <input style={styles.input} type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Block Type</label>
              <select style={styles.input} value={form.blockType} onChange={e => setForm({ ...form, blockType: e.target.value })}>
                <option>9-inch</option><option>6-inch</option><option>Interlock</option>
              </select>
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Quantity Produced</label>
              <input style={styles.input} type="number" placeholder="e.g. 850" value={form.produced} onChange={e => setForm({ ...form, produced: e.target.value })} />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Cement Bags Used</label>
              <input style={styles.input} type="number" placeholder="bags" value={form.cement} onChange={e => setForm({ ...form, cement: e.target.value })} />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Granite Dust (kg)</label>
              <input style={styles.input} type="number" placeholder="kg" value={form.granite} onChange={e => setForm({ ...form, granite: e.target.value })} />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Diesel Used (litres)</label>
              <input style={styles.input} type="number" placeholder="litres" value={form.diesel} onChange={e => setForm({ ...form, diesel: e.target.value })} />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Damaged During Production</label>
              <input style={styles.input} type="number" placeholder="blocks broken" value={form.dmgProd} onChange={e => setForm({ ...form, dmgProd: e.target.value })} />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Damaged During Stacking</label>
              <input style={styles.input} type="number" placeholder="blocks broken" value={form.dmgStack} onChange={e => setForm({ ...form, dmgStack: e.target.value })} />
            </div>
          </div>
          <div style={styles.row}>
            <button style={styles.btn("primary")}>Save Entry</button>
            <button style={styles.btn("secondary")} onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </div>
      )}

      <div style={styles.grid(4)}>
        <StatCard label="Total This Week" value="3,650" sub="Blocks produced" accent={theme.accent} />
        <StatCard label="Cement Used" value="135 bags" sub="This week" accent={theme.blue} />
        <StatCard label="Diesel (Production)" value="240 L" sub="This week" accent={theme.accentDim} />
        <StatCard label="Total Damages" value="16" sub="Production + stacking" accent={theme.red} />
      </div>

      <div style={styles.card}>
        <div style={styles.sectionTitle}>Production Records</div>
        <table style={styles.table}>
          <thead>
            <tr>
              {["Date", "Block Type", "Produced", "Cement (bags)", "Granite (kg)", "Diesel (L)", "Dmg Production", "Dmg Stacking", "Net Output"].map(h => (
                <th key={h} style={styles.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sampleProduction.map((p, i) => {
              const net = p.produced - p.damaged.production - p.damaged.stacking;
              return (
                <tr key={i}>
                  <td style={styles.td}>{p.date}</td>
                  <td style={styles.td}><span style={styles.badge(theme.blue)}>{p.blockType}</span></td>
                  <td style={styles.td}>{p.produced.toLocaleString()}</td>
                  <td style={styles.td}>{p.cement}</td>
                  <td style={styles.td}>{p.granite.toLocaleString()}</td>
                  <td style={styles.td}>{p.diesel}</td>
                  <td style={styles.td}><span style={styles.badge(p.damaged.production > 0 ? theme.red : theme.green)}>{p.damaged.production}</span></td>
                  <td style={styles.td}><span style={styles.badge(p.damaged.stacking > 0 ? theme.red : theme.green)}>{p.damaged.stacking}</span></td>
                  <td style={styles.td}><strong style={{ color: theme.green }}>{net.toLocaleString()}</strong></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ── ORDERS ────────────────────────────────────────────────────
const Orders = () => {
  const [selected, setSelected] = useState(null);

  return (
    <div>
      <div style={styles.header}>
        <div>
          <div style={styles.pageTitle}>Orders & Invoicing</div>
          <div style={styles.pageSubtitle}>Customer orders, invoice generation, payment tracking, and delivery status</div>
        </div>
        <button style={styles.btn("primary")}>+ New Order Request</button>
      </div>

      <div style={styles.grid(3)}>
        <StatCard label="Total Orders" value="3" sub="All time" accent={theme.blue} />
        <StatCard label="Outstanding Balance" value="₦3.5M" sub="Awaiting payment" accent={theme.accent} />
        <StatCard label="Fully Delivered" value="1" sub="Orders completed" accent={theme.green} />
      </div>

      <div style={styles.grid(2)}>
        <div style={styles.card}>
          <div style={styles.sectionTitle}>All Orders</div>
          {sampleOrders.map(o => (
            <div
              key={o.id}
              onClick={() => setSelected(o)}
              style={{
                padding: "14px",
                borderRadius: "8px",
                marginBottom: "8px",
                background: selected?.id === o.id ? "rgba(245,166,35,0.08)" : "transparent",
                border: `1px solid ${selected?.id === o.id ? theme.accent + "44" : theme.border}`,
                cursor: "pointer",
                transition: "all 0.15s",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontWeight: "600", fontSize: "14px" }}>{o.customer}</div>
                  <div style={{ fontSize: "12px", color: theme.textMuted }}>{o.id} · {o.marketer}</div>
                </div>
                <span style={styles.badge(o.status === "completed" ? theme.green : o.status === "invoiced" ? theme.blue : theme.accent)}>
                  {o.status}
                </span>
              </div>
              <div style={{ marginTop: "8px", display: "flex", gap: "20px", fontSize: "12px", color: theme.textMuted }}>
                <span>Value: <strong style={{ color: theme.text }}>₦{o.totalValue.toLocaleString()}</strong></span>
                <span>Paid: <strong style={{ color: theme.green }}>₦{o.paid.toLocaleString()}</strong></span>
              </div>
            </div>
          ))}
        </div>

        <div style={styles.card}>
          {selected ? (
            <>
              <div style={styles.sectionTitle}>Customer Statement — {selected.customer}</div>
              <div style={{ marginBottom: "16px" }}>
                <div style={{ fontSize: "12px", color: theme.textMuted, marginBottom: "2px" }}>Location</div>
                <div style={{ fontSize: "13px" }}>{selected.location}</div>
              </div>
              <div style={{ marginBottom: "16px" }}>
                <div style={styles.sectionTitle}>Order Items</div>
                {selected.items.map((item, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${theme.border}22`, fontSize: "13px" }}>
                    <span>{item.type} block × {item.qty.toLocaleString()}</span>
                    <span>₦{(item.qty * item.unit).toLocaleString()}</span>
                  </div>
                ))}
                <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", fontWeight: "700" }}>
                  <span>Total Value</span>
                  <span style={{ color: theme.accent }}>₦{selected.totalValue.toLocaleString()}</span>
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {[
                  { label: "Amount Paid", value: `₦${selected.paid.toLocaleString()}`, color: theme.green, pct: (selected.paid / selected.totalValue) * 100 },
                  { label: "Balance Outstanding", value: `₦${(selected.totalValue - selected.paid).toLocaleString()}`, color: theme.red, pct: ((selected.totalValue - selected.paid) / selected.totalValue) * 100 },
                  { label: "Blocks Delivered", value: `${selected.delivered.toLocaleString()} blocks`, color: theme.blue, pct: (selected.delivered / selected.items.reduce((s, i) => s + i.qty, 0)) * 100 },
                ].map(row => (
                  <div key={row.label}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px" }}>
                      <span style={{ color: theme.textMuted }}>{row.label}</span>
                      <span style={{ color: row.color, fontWeight: "600" }}>{row.value}</span>
                    </div>
                    <div style={styles.progressBar(row.pct, row.color)}>
                      <div style={styles.progressFill(row.pct, row.color)} />
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: "16px", display: "flex", gap: "8px" }}>
                <button style={styles.btn("primary")}>Generate Invoice</button>
                <button style={styles.btn("secondary")}>View Waybills</button>
              </div>
            </>
          ) : (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "200px", color: theme.textMuted, fontSize: "13px" }}>
              ← Select an order to view the customer statement
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ── STAFF ─────────────────────────────────────────────────────
const Staff = () => (
  <div>
    <div style={styles.header}>
      <div>
        <div style={styles.pageTitle}>Staff Management</div>
        <div style={styles.pageSubtitle}>Permanent staff and daily workers</div>
      </div>
      <button style={styles.btn("primary")}>+ Add Staff</button>
    </div>
    <div style={styles.grid(3)}>
      <StatCard label="Total Staff" value="5" sub="All categories" accent={theme.blue} />
      <StatCard label="Permanent Staff" value="3" sub="Monthly salary" accent={theme.green} />
      <StatCard label="Daily Workers" value="2" sub="₦3,500/day" accent={theme.accent} />
    </div>
    <div style={styles.card}>
      <div style={styles.sectionTitle}>Staff Directory</div>
      <table style={styles.table}>
        <thead>
          <tr>
            {["Name", "Role", "Type", "Pay Rate", "Status"].map(h => (
              <th key={h} style={styles.th}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sampleStaff.map((s, i) => (
            <tr key={i}>
              <td style={styles.td}><strong>{s.name}</strong></td>
              <td style={styles.td}>{s.role}</td>
              <td style={styles.td}>
                <span style={styles.badge(s.type === "permanent" ? theme.blue : theme.accent)}>
                  {s.type}
                </span>
              </td>
              <td style={styles.td}>
                {s.type === "permanent" ? `₦${s.salary.toLocaleString()}/mo` : `₦${s.rate.toLocaleString()}/day`}
              </td>
              <td style={styles.td}>
                <span style={styles.badge(theme.green)}>{s.status}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

// ── WAYBILLS ──────────────────────────────────────────────────
const Waybills = () => (
  <div>
    <div style={styles.header}>
      <div>
        <div style={styles.pageTitle}>Waybill Records</div>
        <div style={styles.pageSubtitle}>Track every delivery trip — loaded, received, and damaged quantities</div>
      </div>
      <button style={styles.btn("primary")}>+ Record Waybill</button>
    </div>
    <div style={styles.grid(3)}>
      <StatCard label="Waybills This Week" value="3" sub="Delivery trips" accent={theme.blue} />
      <StatCard label="Total Loaded" value="1,500" sub="Blocks dispatched" accent={theme.accent} />
      <StatCard label="Total Damaged (Transit)" value="5" sub="0.33% damage rate" accent={theme.red} />
    </div>
    <div style={styles.card}>
      <div style={styles.sectionTitle}>Waybill Log</div>
      <table style={styles.table}>
        <thead>
          <tr>
            {["Waybill No.", "Date", "Order", "Driver", "Truck", "Block Type", "Loaded", "Received", "Damaged", "Receiver"].map(h => (
              <th key={h} style={styles.th}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sampleWaybills.map((w, i) => (
            <tr key={i}>
              <td style={styles.td}><span style={{ color: theme.accent, fontWeight: "600" }}>{w.id}</span></td>
              <td style={styles.td}>{w.date}</td>
              <td style={styles.td}>{w.order}</td>
              <td style={styles.td}>{w.driver}</td>
              <td style={styles.td}>{w.truck}</td>
              <td style={styles.td}><span style={styles.badge(theme.blue)}>{w.blockType}</span></td>
              <td style={styles.td}>{w.loaded}</td>
              <td style={styles.td}><strong style={{ color: theme.green }}>{w.received}</strong></td>
              <td style={styles.td}><span style={styles.badge(w.damaged > 0 ? theme.red : theme.green)}>{w.damaged}</span></td>
              <td style={styles.td}>{w.receiver}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

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

// ── MAIN APP ──────────────────────────────────────────────────
const navItems = [
  { section: "Overview", items: [{ id: "dashboard", label: "Dashboard", icon: "dashboard" }] },
  { section: "Operations", items: [
    { id: "production", label: "Production", icon: "production" },
    { id: "waybills", label: "Waybills", icon: "waybill" },
    { id: "staff", label: "Staff", icon: "staff" },
  ]},
  { section: "Sales", items: [
    { id: "orders", label: "Orders & Invoicing", icon: "orders" },
  ]},
  { section: "Analytics", items: [
    { id: "reports", label: "Reports", icon: "reports" },
  ]},
];

export default function App() {
  const [active, setActive] = useState("dashboard");

  const pages = {
    dashboard: <Dashboard />,
    production: <Production />,
    waybills: <Waybills />,
    staff: <Staff />,
    orders: <Orders />,
    reports: <Reports />,
  };

  return (
    <div style={styles.app}>
      <div style={styles.sidebar}>
        <div style={styles.logo}>
          <div style={styles.logoPlaceholder} title="Logo coming soon">
            <span style={{ fontSize: "20px" }}>🏗️</span>
            <span style={styles.logoPlaceholderText}>Your Logo</span>
          </div>
          <div style={styles.logoTitle}>Abuja Precast Concrete Limited</div>
          <div style={styles.logoSub}>Quality Precast products. Reliable Delivery.</div>
        </div>
        <nav style={styles.nav}>
          {navItems.map(section => (
            <div key={section.section}>
              <div style={styles.navSection}>{section.section}</div>
              {section.items.map(item => (
                <div
                  key={item.id}
                  style={styles.navItem(active === item.id)}
                  onClick={() => setActive(item.id)}
                >
                  <Icon name={item.icon} size={14} />
                  {item.label}
                </div>
              ))}
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
