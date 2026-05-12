import { useState, useEffect } from "react";
import { productionService } from './services/production';
import { staffService } from './services/staff';
import { ordersService, customersService } from './services/orders';
import { waybillsService } from './services/deliveries';
import { invoicesService, paymentsService } from './services/payments';

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

const Icon = ({ name, size = 16 }) => {
  const icons = { dashboard: "⊞", production: "🏭", orders: "📋", staff: "👥", waybill: "📄", reports: "📊", settings: "⚙", logout: "→" };
  return <span style={{ fontSize: size }}>{icons[name] || "•"}</span>;
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
  const [stats, setStats] = useState({ staff: 0, produced: 0, orders: 0, revenue: 0, pending: 0, waybills: 0, damages: 0 });
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
        setStats({ staff: staffList.length, produced, orders: orders.length, revenue, pending, waybills: waybills.length, damages });
        setRecent(orders.slice(0, 5));
      } catch {
        // show zeros on error
      } finally {
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

  const handleSave = async () => {
    if (!form.date || !form.produced) return setAlert({ type: "error", msg: "Date and quantity produced are required." });
    setSaving(true);
    setAlert(null);
    try {
      const entry = await productionService.create({
        date: form.date,
        block_type: form.blockType,
        quantity_produced: parseInt(form.produced) || 0,
        cement_bags: parseFloat(form.cement) || 0,
        granite_dust_kg: parseFloat(form.granite) || 0,
        diesel_litres: parseFloat(form.diesel) || 0,
      });
      const dmgProd = parseInt(form.dmgProd) || 0;
      const dmgStack = parseInt(form.dmgStack) || 0;
      if (dmgProd > 0) await productionService.logDamage({ date: form.date, block_type: form.blockType, stage: "production", quantity_damaged: dmgProd, production_log_id: entry.id });
      if (dmgStack > 0) await productionService.logDamage({ date: form.date, block_type: form.blockType, stage: "stacking", quantity_damaged: dmgStack, production_log_id: entry.id });
      setRecords(prev => [{ ...entry, damaged: { production: dmgProd, stacking: dmgStack } }, ...prev]);
      setForm(emptyForm);
      setShowForm(false);
      setAlert({ type: "success", msg: "Production entry saved successfully!" });
    } catch (e) {
      setAlert({ type: "error", msg: "Failed to save. " + e.message });
    } finally {
      setSaving(false);
    }
  };

  const totalProduced = records.reduce((s, r) => s + (r.quantity_produced || 0), 0);
  const totalCement = records.reduce((s, r) => s + (r.cement_bags || 0), 0);
  const totalDiesel = records.reduce((s, r) => s + (r.diesel_litres || 0), 0);
  const totalDamages = records.reduce((s, r) => s + (r.damaged?.production || 0) + (r.damaged?.stacking || 0), 0);

  return (
    <div>
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
          <div style={styles.sectionTitle}>New Production Entry</div>
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
              <select style={styles.input} value={form.blockType} onChange={e => setForm({ ...form, blockType: e.target.value })}>
                {BLOCK_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
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
            <button style={styles.btn("primary")} onClick={handleSave} disabled={saving}>{saving ? "Saving…" : "Save Entry"}</button>
            <button style={styles.btn("secondary")} onClick={() => { setShowForm(false); setForm(emptyForm); }}>Cancel</button>
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
              <tr>{["Date", "Block Type", "Produced", "Cement (bags)", "Granite (kg)", "Diesel (L)", "Dmg Production", "Dmg Stacking", "Net Output"].map(h => <th key={h} style={styles.th}>{h}</th>)}</tr>
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
        is_active: true,
      };
      const saved = await staffService.create(payload);
      setStaff(prev => [...prev, saved]);
      setForm(emptyForm);
      setShowForm(false);
      setAlert({ type: "success", msg: `${saved.full_name} added successfully!` });
    } catch (e) {
      setAlert({ type: "error", msg: "Failed to save staff. " + e.message });
    } finally {
      setSaving(false);
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
          <div style={styles.sectionTitle}>Add New Staff Member</div>
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
            <button style={styles.btn("primary")} onClick={handleSave} disabled={saving}>{saving ? "Saving…" : "Add Staff Member"}</button>
            <button style={styles.btn("secondary")} onClick={() => { setShowForm(false); setForm(emptyForm); }}>Cancel</button>
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
              <tr>{["Name", "Role", "Type", "Pay Rate", "Date Hired", "Status"].map(h => <th key={h} style={styles.th}>{h}</th>)}</tr>
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
const emptyItem = () => ({ blockType: "9-inch", quantity: "", unitPrice: "" });

const Orders = ({ onNavigate }) => {
  const [orders, setOrders] = useState([]);
  const [staff, setStaff] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [invoicing, setInvoicing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [showPayForm, setShowPayForm] = useState(false);
  const [alert, setAlert] = useState(null);
  const emptyForm = { customerName: "", customerPhone: "", customerLocation: "", marketerId: "", items: [emptyItem()] };
  const [form, setForm] = useState(emptyForm);
  const [payForm, setPayForm] = useState({ amount: "", date: "" });

  const load = async () => {
    setLoading(true);
    try {
      const [o, s] = await Promise.all([ordersService.getAll(), staffService.getActive()]);
      setOrders(o);
      setStaff(s);
      return o;
    } catch {
      setAlert({ type: "error", msg: "Could not load orders." });
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
    if (!form.customerName) return setAlert({ type: "error", msg: "Customer name is required." });
    if (form.items.some(i => !i.quantity || !i.unitPrice)) return setAlert({ type: "error", msg: "All items need quantity and unit price." });
    setSaving(true);
    setAlert(null);
    try {
      const customer = await customersService.create({ name: form.customerName, phone: form.customerPhone || null, location: form.customerLocation || null });
      await ordersService.create({
        order: { customer_id: customer.id, marketer_id: form.marketerId || null, status: "pending" },
        items: form.items.map(i => ({ block_type: i.blockType, quantity: parseInt(i.quantity), unit_price: parseFloat(i.unitPrice) })),
      });
      await load();
      setForm(emptyForm);
      setShowForm(false);
      setAlert({ type: "success", msg: "Order created successfully!" });
    } catch (e) {
      setAlert({ type: "error", msg: "Failed to create order. " + e.message });
    } finally {
      setSaving(false);
    }
  };

  const handleGenerateInvoice = async () => {
    if (!selected) return;
    setInvoicing(true);
    try {
      if ((selected.invoices || []).length > 0) { setAlert({ type: "error", msg: `Invoice ${selected.invoices[0].invoice_number} already exists.` }); return; }
      const count = orders.reduce((s, o) => s + (o.invoices || []).length, 0);
      const invoiceNumber = `APC-INV-${String((count || 0) + 1).padStart(3, "0")}`;
      const total = orderTotal(selected);
      const today = new Date().toISOString().split("T")[0];
      const due = new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0];
      await invoicesService.create({ order_id: selected.id, invoice_number: invoiceNumber, total_amount: total, issued_date: today, due_date: due });
      const newOrders = await load();
      if (newOrders) setSelected(newOrders.find(o => o.id === selected.id) || selected);
      setAlert({ type: "success", msg: `Invoice ${invoiceNumber} generated!` });
    } catch (e) {
      setAlert({ type: "error", msg: "Failed to generate invoice. " + e.message });
    } finally {
      setInvoicing(false);
    }
  };

  const handleRecordPayment = async () => {
    if (!payForm.amount || !payForm.date) return setAlert({ type: "error", msg: "Amount and date are required." });
    const invoice = selected?.invoices?.[0];
    if (!invoice) return setAlert({ type: "error", msg: "Generate an invoice first." });
    try {
      await paymentsService.recordPayment({ invoice_id: invoice.id, amount_paid: parseFloat(payForm.amount), payment_date: payForm.date, status: "confirmed" });
      const newOrders = await load();
      if (newOrders) setSelected(newOrders.find(o => o.id === selected.id) || selected);
      setPayForm({ amount: "", date: "" });
      setShowPayForm(false);
      setAlert({ type: "success", msg: "Payment recorded successfully!" });
    } catch (e) {
      setAlert({ type: "error", msg: "Failed to record payment. " + e.message });
    }
  };

  const statusColor = (s) => s === "completed" ? theme.green : s === "invoiced" ? theme.blue : s === "cancelled" ? theme.red : theme.accent;

  const totalValue = orders.reduce((s, o) => s + orderTotal(o), 0);
  const totalPaid = orders.reduce((s, o) => s + orderPaid(o), 0);

  return (
    <div>
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
            <div style={{ fontSize: "12px", fontWeight: "700", color: theme.textMuted, marginBottom: "10px", textTransform: "uppercase", letterSpacing: "0.06em" }}>Customer Details</div>
            <div style={styles.grid(3)}>
              <div style={styles.formGroup}>
                <label style={styles.label}>Customer Name *</label>
                <input style={styles.input} placeholder="e.g. Metama Housing" value={form.customerName} onChange={e => setForm({ ...form, customerName: e.target.value })} />
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>Phone</label>
                <input style={styles.input} placeholder="+234..." value={form.customerPhone} onChange={e => setForm({ ...form, customerPhone: e.target.value })} />
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>Location</label>
                <input style={styles.input} placeholder="e.g. Gwarinpa, Abuja" value={form.customerLocation} onChange={e => setForm({ ...form, customerLocation: e.target.value })} />
              </div>
            </div>
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
                  <select style={styles.input} value={item.blockType} onChange={e => updateItem(idx, "blockType", e.target.value)}>
                    {BLOCK_TYPES.map(t => <option key={t}>{t}</option>)}
                  </select>
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
          <div style={styles.row}>
            <button style={styles.btn("primary")} onClick={handleSave} disabled={saving}>{saving ? "Saving…" : "Create Order"}</button>
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
                    <span style={styles.badge(statusColor(o.status))}>{o.status}</span>
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
                  <div style={styles.sectionTitle}>Customer Statement — {selected.customer?.name}</div>
                  <div style={{ marginBottom: "12px", fontSize: "13px", color: theme.textMuted }}>{selected.customer?.location} · {selected.customer?.phone}</div>
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
                  <div style={{ marginTop: "16px" }}>
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                      {(selected.invoices || []).length === 0 ? (
                        <button style={styles.btn("primary")} onClick={handleGenerateInvoice} disabled={invoicing}>{invoicing ? "Generating…" : "Generate Invoice"}</button>
                      ) : (
                        <>
                          <div style={{ width: "100%", fontSize: "12px", color: theme.textMuted, marginBottom: "6px" }}>
                            Invoice: <strong style={{ color: theme.accent }}>{selected.invoices[0].invoice_number}</strong>
                          </div>
                          <button style={styles.btn("primary")} onClick={() => setShowPayForm(!showPayForm)}>+ Record Payment</button>
                        </>
                      )}
                      <button style={styles.btn("secondary")} onClick={() => onNavigate("waybills")}>View Waybills</button>
                    </div>
                    {showPayForm && (
                      <div style={{ marginTop: "12px", padding: "14px", background: theme.surface, borderRadius: "8px", border: `1px solid ${theme.border}` }}>
                        <div style={{ fontSize: "11px", fontWeight: "700", color: theme.textMuted, marginBottom: "10px", textTransform: "uppercase", letterSpacing: "0.06em" }}>Record Payment</div>
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
                          <button style={styles.btn("primary")} onClick={handleRecordPayment}>Confirm Payment</button>
                          <button style={styles.btn("secondary")} onClick={() => setShowPayForm(false)}>Cancel</button>
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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [alert, setAlert] = useState(null);
  const emptyForm = { waybillDate: "", driverId: "", truckNumber: "", blockType: "9-inch", quantityLoaded: "", quantityReceived: "", quantityDamaged: "0", receiverName: "", notes: "" };
  const [form, setForm] = useState(emptyForm);

  const load = async () => {
    setLoading(true);
    try {
      const [w, s] = await Promise.all([waybillsService.getAll(), staffService.getActive()]);
      setWaybills(w);
      setStaff(s);
    } catch {
      setAlert({ type: "error", msg: "Could not load waybills." });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleSave = async () => {
    if (!form.waybillDate || !form.quantityLoaded) return setAlert({ type: "error", msg: "Date and quantity loaded are required." });
    setSaving(true);
    setAlert(null);
    try {
      const count = await waybillsService.getCount();
      const waybillNumber = `APC-WB-${String(count + 1).padStart(3, "0")}`;
      const damaged = parseInt(form.quantityDamaged) || 0;

      await waybillsService.create({
        waybill_number: waybillNumber,
        driver_id: form.driverId || null,
        truck_number: form.truckNumber || null,
        block_type: form.blockType,
        quantity_loaded: parseInt(form.quantityLoaded) || 0,
        quantity_received: parseInt(form.quantityReceived) || 0,
        quantity_damaged: damaged,
        receiver_name: form.receiverName || null,
        waybill_date: form.waybillDate,
        notes: form.notes || null,
      });

      if (damaged > 0) {
        await productionService.logDamage({
          date: form.waybillDate,
          block_type: form.blockType,
          stage: "delivery",
          quantity_damaged: damaged,
          notes: `Transit damage on waybill ${waybillNumber}`,
        });
      }

      await load();
      setForm(emptyForm);
      setShowForm(false);
      setAlert({ type: "success", msg: `Waybill ${waybillNumber} recorded${damaged > 0 ? " — transit damage logged automatically." : "."}` });
    } catch (e) {
      setAlert({ type: "error", msg: "Failed to save waybill. " + e.message });
    } finally {
      setSaving(false);
    }
  };

  const totalLoaded = waybills.reduce((s, w) => s + (w.quantity_loaded || 0), 0);
  const totalDamaged = waybills.reduce((s, w) => s + (w.quantity_damaged || 0), 0);
  const damageRate = totalLoaded > 0 ? ((totalDamaged / totalLoaded) * 100).toFixed(2) : "0.00";

  return (
    <div>
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
          <div style={styles.sectionTitle}>New Waybill Entry</div>
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
              <select style={styles.input} value={form.blockType} onChange={e => setForm({ ...form, blockType: e.target.value })}>
                {BLOCK_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
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
              <label style={styles.label}>Quantity Damaged in Transit</label>
              <input style={styles.input} type="number" placeholder="0" value={form.quantityDamaged} onChange={e => setForm({ ...form, quantityDamaged: e.target.value })} />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Receiver Name</label>
              <input style={styles.input} placeholder="e.g. Mr. Tunde" value={form.receiverName} onChange={e => setForm({ ...form, receiverName: e.target.value })} />
            </div>
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
            <button style={styles.btn("primary")} onClick={handleSave} disabled={saving}>{saving ? "Saving…" : "Record Waybill"}</button>
            <button style={styles.btn("secondary")} onClick={() => { setShowForm(false); setForm(emptyForm); }}>Cancel</button>
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
              <tr>{["Waybill No.", "Date", "Driver", "Truck", "Block Type", "Loaded", "Received", "Damaged", "Receiver"].map(h => <th key={h} style={styles.th}>{h}</th>)}</tr>
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
                </tr>
              ))}
            </tbody>
          </table>
        )}
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

// ── NAV ───────────────────────────────────────────────────────
const navItems = [
  { section: "Overview", items: [{ id: "dashboard", label: "Dashboard", icon: "dashboard" }] },
  { section: "Operations", items: [{ id: "production", label: "Production", icon: "production" }, { id: "waybills", label: "Waybills", icon: "waybill" }, { id: "staff", label: "Staff", icon: "staff" }] },
  { section: "Sales", items: [{ id: "orders", label: "Orders & Invoicing", icon: "orders" }] },
  { section: "Analytics", items: [{ id: "reports", label: "Reports", icon: "reports" }] },
];

// ── APP ───────────────────────────────────────────────────────
export default function App() {
  const [active, setActive] = useState("dashboard");
  const pages = { dashboard: <Dashboard />, production: <Production />, waybills: <Waybills />, staff: <Staff />, orders: <Orders onNavigate={setActive} />, reports: <Reports /> };

  return (
    <div style={styles.app}>
      <div style={styles.sidebar}>
        <div style={styles.logo}>
          <img src="/logo.png" alt="Abuja Precast Concrete Limited" style={{ width: "100%", maxWidth: "180px", marginBottom: "10px", display: "block" }} />
          <div style={styles.logoSub}>Quality Precast products. Reliable Delivery.</div>
        </div>
        <nav style={styles.nav}>
          {navItems.map(section => (
            <div key={section.section}>
              <div style={styles.navSection}>{section.section}</div>
              {section.items.map(item => (
                <div key={item.id} style={styles.navItem(active === item.id)} onClick={() => setActive(item.id)}>
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
