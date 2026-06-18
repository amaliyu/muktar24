import { useState, useEffect, useRef } from 'react';
import { staffService } from '../services/staff';
import { attendanceService, payrollService } from '../services/attendance';
import { rolesService, documentsService, hrStaffService, photoService } from '../services/hrService';
import { generatePayrollPDF } from '../utils/generatePayrollPDF';
import { generateIDCardPDF, generateBusinessCardPDF } from '../utils/cardGenerator';
import { supabase } from '../lib/supabase';

const theme = {
  bg: "#0f1117", surface: "#1a1d27", card: "#21263a", border: "#2e3452",
  accent: "#f5a623", accentDim: "#c47d0e", green: "#2dd4a0", red: "#f06b6b",
  blue: "#5b8dee", text: "#e8eaf0", textMuted: "#7c839e", textDim: "#4a5175",
};
const styles = {
  btn: (variant) => ({ padding: "8px 18px", borderRadius: "8px", fontSize: "13px", fontWeight: "600", cursor: "pointer", border: variant === "secondary" ? `1px solid ${theme.border}` : "none", background: variant === "primary" ? theme.accent : variant === "danger" ? theme.red : theme.surface, color: variant === "primary" ? "#000" : variant === "danger" ? "#fff" : theme.textMuted }),
  input: { background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: "8px", padding: "9px 12px", fontSize: "13px", color: theme.text, width: "100%", outline: "none" },
  label: { fontSize: "12px", fontWeight: "600", color: theme.textMuted, marginBottom: "5px", display: "block" },
  formGroup: { marginBottom: "14px" },
  row: { display: "flex", gap: "12px" },
  card: { background: theme.card, border: `1px solid ${theme.border}`, borderRadius: "12px", padding: "20px" },
  sectionTitle: { fontSize: "14px", fontWeight: "700", color: theme.text, marginBottom: "14px" },
  badge: (color) => ({ display: "inline-block", padding: "3px 10px", borderRadius: "20px", fontSize: "11px", fontWeight: "600", background: color + "22", color, border: `1px solid ${color}44` }),
  grid: (cols) => ({ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: "16px", marginBottom: "24px" }),
  table: { width: "100%", borderCollapse: "collapse", fontSize: "13px" },
  th: { textAlign: "left", padding: "10px 14px", fontSize: "11px", fontWeight: "700", color: theme.textMuted, letterSpacing: "0.06em", textTransform: "uppercase", borderBottom: `1px solid ${theme.border}` },
  td: { padding: "12px 14px", borderBottom: `1px solid ${theme.border}22`, color: theme.text },
  progressBar: () => ({ height: "6px", background: theme.border, borderRadius: "3px", overflow: "hidden", marginTop: "8px" }),
  progressFill: (pct, color) => ({ height: "100%", width: `${Math.min(pct, 100)}%`, background: color, borderRadius: "3px", transition: "width 0.4s ease" }),
  alert: (type) => ({ padding: "10px 14px", borderRadius: "8px", marginBottom: "16px", background: (type === "success" ? theme.green : theme.red) + "22", border: `1px solid ${(type === "success" ? theme.green : theme.red)}44`, color: type === "success" ? theme.green : theme.red, fontSize: "13px", display: "flex", justifyContent: "space-between", alignItems: "center" }),
  statCard: (accent) => ({ background: theme.card, border: `1px solid ${theme.border}`, borderRadius: "12px", padding: "20px", borderTop: `3px solid ${accent}` }),
};
const naira = (n) => `₦${(n || 0).toLocaleString()}`;
const fmt = (n) => (n || 0).toLocaleString();

const getMissingFields = (staff) => {
  const missing = [];
  if (!staff.job_title?.trim()) missing.push('job title');
  if (!staff.photo_path)        missing.push('photo');
  if (!staff.phone?.trim())     missing.push('phone');
  return missing;
};

const NIGERIAN_STATES = [
  "Abia","Adamawa","Akwa Ibom","Anambra","Bauchi","Bayelsa","Benue","Borno",
  "Cross River","Delta","Ebonyi","Edo","Ekiti","Enugu","FCT (Abuja)","Gombe",
  "Imo","Jigawa","Kaduna","Kano","Katsina","Kebbi","Kogi","Kwara","Lagos",
  "Nasarawa","Niger","Ogun","Ondo","Osun","Oyo","Plateau","Rivers","Sokoto",
  "Taraba","Yobe","Zamfara"
];
const NIGERIAN_BANKS = [
  "Access Bank","Fidelity Bank","First Bank","GTBank","Keystone Bank","Kuda Bank",
  "Moniepoint","OPay","PalmPay","Polaris Bank","Providus Bank","Stanbic IBTC",
  "Sterling Bank","TAJ Bank","UBA","Union Bank","Unity Bank","Wema Bank",
  "Zenith Bank","Other"
];
const DEPARTMENTS = ["Operations","Sales","Finance","Logistics","Admin"];
const DOCUMENT_LABELS = ["Offer Letter","ID Card","NIN Slip","Guarantor Form","Medical Certificate","Warning Letter","Other"];
const EMPLOYMENT_STATUSES = ["active","suspended","terminated","resigned"];
const MARITAL_STATUSES = ["Single","Married","Divorced","Widowed"];

// ── SMALL HELPERS ─────────────────────────────────────────────
const Spinner = () => (
  <div style={{ display: "flex", justifyContent: "center", padding: "40px" }}>
    <div style={{ width: "32px", height: "32px", borderRadius: "50%", border: `3px solid ${theme.border}`, borderTopColor: theme.accent, animation: "spin 0.8s linear infinite" }} />
  </div>
);

const Alert = ({ msg, type, onClose }) => (
  <div style={styles.alert(type)}>
    <span>{msg}</span>
    {onClose && <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", fontSize: "16px" }}>×</button>}
  </div>
);

const StatCard = ({ label, value, sub, accent }) => (
  <div style={styles.statCard(accent)}>
    <div style={{ fontSize: "11px", fontWeight: "700", color: theme.textMuted, letterSpacing: "0.08em", textTransform: "uppercase" }}>{label}</div>
    <div style={{ fontSize: "26px", fontWeight: "700", color: theme.text, marginTop: "6px" }}>{value}</div>
    {sub && <div style={{ fontSize: "12px", color: theme.textMuted, marginTop: "4px" }}>{sub}</div>}
  </div>
);

// ── ROLES TAB ─────────────────────────────────────────────────
const RolesTab = () => {
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [alert, setAlert] = useState(null);
  const emptyForm = { role_name: "", department: DEPARTMENTS[0], description: "", is_active: true };
  const [form, setForm] = useState(emptyForm);

  const load = async () => {
    setLoading(true);
    try { setRoles(await rolesService.getAll()); }
    catch (e) { setAlert({ type: "error", msg: "Failed to load roles: " + e.message }); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const startEdit = (role) => {
    setEditTarget(role);
    setForm({ role_name: role.role_name, department: role.department, description: role.description || "", is_active: role.is_active });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.role_name) return setAlert({ type: "error", msg: "Role name is required." });
    setSaving(true); setAlert(null);
    try {
      if (editTarget) {
        await rolesService.update(editTarget.id, form);
      } else {
        await rolesService.create(form);
      }
      await load();
      setShowForm(false); setEditTarget(null); setForm(emptyForm);
      setAlert({ type: "success", msg: editTarget ? "Role updated." : "Role created." });
    } catch (e) { setAlert({ type: "error", msg: "Failed to save role: " + e.message }); }
    finally { setSaving(false); }
  };

  const handleToggle = async (role) => {
    try {
      await rolesService.update(role.id, { is_active: !role.is_active });
      await load();
    } catch (e) { setAlert({ type: "error", msg: "Failed to update role: " + e.message }); }
  };

  const totalRoles = roles.length;
  const activeRoles = roles.filter(r => r.is_active).length;
  const uniqueDepts = [...new Set(roles.map(r => r.department))].length;

  // Group by department
  const grouped = {};
  for (const r of roles) {
    if (!grouped[r.department]) grouped[r.department] = [];
    grouped[r.department].push(r);
  }

  return (
    <div>
      {alert && <Alert msg={alert.msg} type={alert.type} onClose={() => setAlert(null)} />}
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "16px" }}>
        <button style={styles.btn("primary")} onClick={() => { setShowForm(!showForm); setEditTarget(null); setForm(emptyForm); }}>+ Add Role</button>
      </div>

      {showForm && (
        <div style={{ ...styles.card, marginBottom: "24px", borderColor: theme.accent + "44" }}>
          <div style={styles.sectionTitle}>{editTarget ? `Edit — ${editTarget.role_name}` : "Add New Role"}</div>
          <div style={styles.grid(3)}>
            <div style={styles.formGroup}>
              <label style={styles.label}>Role Name *</label>
              <input style={styles.input} placeholder="e.g. Block Molder" value={form.role_name} onChange={e => setForm({ ...form, role_name: e.target.value })} />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Department</label>
              <select style={styles.input} value={form.department} onChange={e => setForm({ ...form, department: e.target.value })}>
                {DEPARTMENTS.map(d => <option key={d}>{d}</option>)}
              </select>
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Active</label>
              <select style={styles.input} value={form.is_active ? "true" : "false"} onChange={e => setForm({ ...form, is_active: e.target.value === "true" })}>
                <option value="true">Active</option>
                <option value="false">Inactive</option>
              </select>
            </div>
          </div>
          <div style={styles.formGroup}>
            <label style={styles.label}>Description</label>
            <textarea style={{ ...styles.input, resize: "vertical", minHeight: "60px" }} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Role description..." />
          </div>
          <div style={styles.row}>
            <button style={styles.btn("primary")} onClick={handleSave} disabled={saving}>{saving ? "Saving…" : editTarget ? "Update Role" : "Create Role"}</button>
            <button style={styles.btn("secondary")} onClick={() => { setShowForm(false); setEditTarget(null); setForm(emptyForm); }}>Cancel</button>
          </div>
        </div>
      )}

      <div style={styles.grid(3)}>
        <StatCard label="Total Roles" value={totalRoles} sub="All roles" accent={theme.blue} />
        <StatCard label="Active" value={activeRoles} sub="Currently active" accent={theme.green} />
        <StatCard label="Departments" value={uniqueDepts} sub="With roles defined" accent={theme.accent} />
      </div>

      {loading ? <Spinner /> : (
        <div>
          {Object.entries(grouped).map(([dept, deptRoles]) => (
            <div key={dept} style={{ marginBottom: "24px" }}>
              <div style={{ fontSize: "12px", fontWeight: "700", color: theme.textMuted, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "8px", padding: "6px 0", borderBottom: `1px solid ${theme.border}` }}>{dept}</div>
              <div style={styles.card}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      {["Role Name","Department","Description","Status","Actions"].map(h => <th key={h} style={styles.th}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {deptRoles.map(r => (
                      <tr key={r.id}>
                        <td style={styles.td}><strong>{r.role_name}</strong></td>
                        <td style={styles.td}>{r.department}</td>
                        <td style={styles.td}>{r.description || "—"}</td>
                        <td style={styles.td}><span style={styles.badge(r.is_active ? theme.green : theme.textMuted)}>{r.is_active ? "Active" : "Inactive"}</span></td>
                        <td style={styles.td}>
                          <div style={{ display: "flex", gap: "6px" }}>
                            <button style={{ ...styles.btn("secondary"), padding: "4px 10px", fontSize: "11px" }} onClick={() => startEdit(r)}>Edit</button>
                            <button style={{ ...styles.btn(r.is_active ? "danger" : "primary"), padding: "4px 10px", fontSize: "11px" }} onClick={() => handleToggle(r)}>{r.is_active ? "Deactivate" : "Activate"}</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ── STAFF FORM MODAL ──────────────────────────────────────────
const StaffFormModal = ({ onClose, onSaved, editTarget, roles }) => {
  const emptyForm = {
    // Tab 1 — Personal
    full_name: "", date_of_birth: "", gender: "", marital_status: "",
    state_of_origin: "", lga_of_origin: "", home_address: "", nin: "",
    // Tab 2 — Employment
    employee_number: "", department: "", role_id: "", job_title: "", staff_type: "permanent",
    date_hired: "", monthly_salary: "", daily_rate: "", employment_status: "onboarding",
    // Tab 3 — Contact & Emergency
    phone: "", email: "",
    emergency_contact_name: "", emergency_contact_phone: "", emergency_contact_relationship: "",
    guarantor_name: "", guarantor_phone: "", guarantor_address: "",
    // Tab 4 — Next of Kin
    next_of_kin_name: "", next_of_kin_phone: "", next_of_kin_relationship: "",
    // Tab 5 — Bank Details
    bank_name: "", bank_account_number: "", bank_account_name: "",
  };

  const [activeTab, setActiveTab] = useState(1);
  const [saving, setSaving] = useState(false);
  const [alert, setAlert] = useState(null);
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    if (editTarget) {
      setForm({
        full_name: editTarget.full_name || "",
        date_of_birth: editTarget.date_of_birth || "",
        gender: editTarget.gender || "",
        marital_status: editTarget.marital_status || "",
        state_of_origin: editTarget.state_of_origin || "",
        lga_of_origin: editTarget.lga_of_origin || "",
        home_address: editTarget.home_address || "",
        nin: editTarget.nin || "",
        employee_number: editTarget.employee_number || "",
        department: editTarget.department || "",
        role_id: editTarget.role_id || "",
        job_title: editTarget.job_title || "",
        staff_type: editTarget.staff_type || "permanent",
        date_hired: editTarget.date_hired || "",
        monthly_salary: String(editTarget.monthly_salary || ""),
        daily_rate: String(editTarget.daily_rate || ""),
        employment_status: editTarget.employment_status || "active",
        phone: editTarget.phone || "",
        email: editTarget.email || "",
        emergency_contact_name: editTarget.emergency_contact_name || "",
        emergency_contact_phone: editTarget.emergency_contact_phone || "",
        emergency_contact_relationship: editTarget.emergency_contact_relationship || "",
        guarantor_name: editTarget.guarantor_name || "",
        guarantor_phone: editTarget.guarantor_phone || "",
        guarantor_address: editTarget.guarantor_address || "",
        next_of_kin_name: editTarget.next_of_kin_name || "",
        next_of_kin_phone: editTarget.next_of_kin_phone || "",
        next_of_kin_relationship: editTarget.next_of_kin_relationship || "",
        bank_name: editTarget.bank_name || "",
        bank_account_number: editTarget.bank_account_number || "",
        bank_account_name: editTarget.bank_account_name || "",
      });
    } else {
      hrStaffService.getNextEmployeeNumber().then(num => {
        setForm(f => ({ ...f, employee_number: num }));
      }).catch(() => {});
    }
  }, []);

  const upd = (field, val) => setForm(f => ({ ...f, [field]: val }));

  const filteredRoles = roles.filter(r => !form.department || r.department === form.department);

  const handleSave = async () => {
    if (!form.full_name) return setAlert({ type: "error", msg: "Full name is required." });
    setSaving(true); setAlert(null);
    try {
      const payload = {
        full_name: form.full_name,
        date_of_birth: form.date_of_birth || null,
        gender: form.gender || null,
        marital_status: form.marital_status || null,
        state_of_origin: form.state_of_origin || null,
        lga_of_origin: form.lga_of_origin || null,
        home_address: form.home_address || null,
        nin: form.nin || null,
        employee_number: form.employee_number || null,
        department: form.department || null,
        role_id: form.role_id || null,
        job_title: form.job_title?.trim() || null,
        role: roles.find(r => String(r.id) === String(form.role_id))?.role_name || form.department || "Staff",
        staff_type: form.staff_type,
        date_hired: form.date_hired || null,
        monthly_salary: form.staff_type === "permanent" ? parseFloat(form.monthly_salary) || null : null,
        daily_rate: form.staff_type === "daily" ? parseFloat(form.daily_rate) || null : null,
        employment_status: form.employment_status || "onboarding",
        phone: form.phone || null,
        email: form.email || null,
        emergency_contact_name: form.emergency_contact_name || null,
        emergency_contact_phone: form.emergency_contact_phone || null,
        emergency_contact_relationship: form.emergency_contact_relationship || null,
        guarantor_name: form.guarantor_name || null,
        guarantor_phone: form.guarantor_phone || null,
        guarantor_address: form.guarantor_address || null,
        next_of_kin_name: form.next_of_kin_name || null,
        next_of_kin_phone: form.next_of_kin_phone || null,
        next_of_kin_relationship: form.next_of_kin_relationship || null,
        bank_name: form.bank_name || null,
        bank_account_number: form.bank_account_number || null,
        bank_account_name: form.bank_account_name || null,
      };
      let result;
      if (editTarget) {
        result = await staffService.update(editTarget.id, payload);
      } else {
        result = await staffService.create(payload);
      }
      onSaved(result);
      onClose();
    } catch (e) { setAlert({ type: "error", msg: "Failed to save: " + e.message }); }
    finally { setSaving(false); }
  };

  const tabs = ["Personal Info", "Employment", "Contact & Emergency", "Next of Kin", "Bank Details"];

  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.7)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: theme.card, borderRadius: "12px", width: "760px", maxWidth: "95vw", maxHeight: "90vh", overflow: "hidden", display: "flex", flexDirection: "column" }}>
        {/* Header */}
        <div style={{ padding: "18px 24px", borderBottom: `1px solid ${theme.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
          <div style={{ fontSize: "16px", fontWeight: "700", color: theme.text }}>{editTarget ? `Edit — ${editTarget.full_name}` : "Add New Staff Member"}</div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: theme.textMuted, fontSize: "20px" }}>×</button>
        </div>
        {/* Tab bar */}
        <div style={{ display: "flex", borderBottom: `1px solid ${theme.border}`, flexShrink: 0, overflowX: "auto" }}>
          {tabs.map((t, i) => (
            <button key={i} onClick={() => setActiveTab(i + 1)} style={{ padding: "10px 18px", fontSize: "12px", fontWeight: activeTab === i + 1 ? "700" : "400", color: activeTab === i + 1 ? theme.accent : theme.textMuted, background: "none", border: "none", borderBottom: activeTab === i + 1 ? `2px solid ${theme.accent}` : "2px solid transparent", cursor: "pointer", whiteSpace: "nowrap" }}>
              {i + 1}. {t}
            </button>
          ))}
        </div>
        {/* Content */}
        <div style={{ flex: 1, overflowY: "auto", padding: "24px" }}>
          {alert && <Alert msg={alert.msg} type={alert.type} onClose={() => setAlert(null)} />}

          {/* Tab 1 — Personal Info */}
          {activeTab === 1 && (
            <div>
              <div style={styles.formGroup}>
                <label style={styles.label}>Full Name *</label>
                <input style={styles.input} placeholder="e.g. Emeka Okafor" value={form.full_name} onChange={e => upd("full_name", e.target.value)} />
              </div>
              <div style={styles.grid(3)}>
                <div style={styles.formGroup}><label style={styles.label}>Date of Birth</label><input type="date" style={styles.input} value={form.date_of_birth} onChange={e => upd("date_of_birth", e.target.value)} /></div>
                <div style={styles.formGroup}><label style={styles.label}>Gender</label>
                  <select style={styles.input} value={form.gender} onChange={e => upd("gender", e.target.value)}>
                    <option value="">Select…</option><option>Male</option><option>Female</option>
                  </select>
                </div>
                <div style={styles.formGroup}><label style={styles.label}>Marital Status</label>
                  <select style={styles.input} value={form.marital_status} onChange={e => upd("marital_status", e.target.value)}>
                    <option value="">Select…</option>
                    {MARITAL_STATUSES.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div style={styles.grid(2)}>
                <div style={styles.formGroup}><label style={styles.label}>State of Origin</label>
                  <select style={styles.input} value={form.state_of_origin} onChange={e => upd("state_of_origin", e.target.value)}>
                    <option value="">Select State…</option>
                    {NIGERIAN_STATES.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div style={styles.formGroup}><label style={styles.label}>LGA of Origin</label><input style={styles.input} placeholder="LGA" value={form.lga_of_origin} onChange={e => upd("lga_of_origin", e.target.value)} /></div>
              </div>
              <div style={styles.formGroup}><label style={styles.label}>Home Address</label><textarea style={{ ...styles.input, resize: "vertical", minHeight: "60px" }} value={form.home_address} onChange={e => upd("home_address", e.target.value)} /></div>
              <div style={styles.formGroup}><label style={styles.label}>NIN</label><input style={styles.input} placeholder="National Identification Number" value={form.nin} onChange={e => upd("nin", e.target.value)} /></div>
            </div>
          )}

          {/* Tab 2 — Employment */}
          {activeTab === 2 && (
            <div>
              <div style={styles.grid(3)}>
                <div style={styles.formGroup}><label style={styles.label}>Employee Number</label><input style={styles.input} value={form.employee_number} onChange={e => upd("employee_number", e.target.value)} /></div>
                <div style={styles.formGroup}><label style={styles.label}>Department</label>
                  <select style={styles.input} value={form.department} onChange={e => { upd("department", e.target.value); upd("role_id", ""); }}>
                    <option value="">Select…</option>
                    {DEPARTMENTS.map(d => <option key={d}>{d}</option>)}
                  </select>
                </div>
                <div style={styles.formGroup}><label style={styles.label}>Role</label>
                  <select style={styles.input} value={form.role_id} onChange={e => upd("role_id", e.target.value)}>
                    <option value="">Select Role…</option>
                    {filteredRoles.map(r => <option key={r.id} value={r.id}>{r.role_name}</option>)}
                  </select>
                </div>
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>Job Title <span style={{ color: "#f5a623" }}>(required for ID / business card)</span></label>
                <input style={styles.input} placeholder="e.g. Internal Control Officer" value={form.job_title} onChange={e => upd("job_title", e.target.value)} />
              </div>
              <div style={styles.grid(3)}>
                <div style={styles.formGroup}><label style={styles.label}>Staff Type</label>
                  <select style={styles.input} value={form.staff_type} onChange={e => upd("staff_type", e.target.value)}>
                    <option value="permanent">Permanent</option>
                    <option value="daily">Daily</option>
                    <option value="contract">Contract</option>
                  </select>
                </div>
                <div style={styles.formGroup}><label style={styles.label}>Date Hired</label><input type="date" style={styles.input} value={form.date_hired} onChange={e => upd("date_hired", e.target.value)} /></div>
                <div style={styles.formGroup}><label style={styles.label}>Employment Status</label>
                  <select style={styles.input} value={form.employment_status} onChange={e => upd("employment_status", e.target.value)}>
                    {EMPLOYMENT_STATUSES.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              {form.staff_type === "permanent" && (
                <div style={styles.formGroup}><label style={styles.label}>Monthly Salary (₦)</label><input type="number" style={styles.input} placeholder="e.g. 85000" value={form.monthly_salary} onChange={e => upd("monthly_salary", e.target.value)} /></div>
              )}
              {form.staff_type === "daily" && (
                <div style={styles.formGroup}><label style={styles.label}>Daily Rate (₦)</label><input type="number" style={styles.input} placeholder="e.g. 3500" value={form.daily_rate} onChange={e => upd("daily_rate", e.target.value)} /></div>
              )}
            </div>
          )}

          {/* Tab 3 — Contact & Emergency */}
          {activeTab === 3 && (
            <div>
              <div style={styles.grid(2)}>
                <div style={styles.formGroup}><label style={styles.label}>Phone</label><input style={styles.input} placeholder="+234…" value={form.phone} onChange={e => upd("phone", e.target.value)} /></div>
                <div style={styles.formGroup}><label style={styles.label}>Email</label><input type="email" style={styles.input} placeholder="email@example.com" value={form.email} onChange={e => upd("email", e.target.value)} /></div>
              </div>
              <div style={{ fontSize: "12px", fontWeight: "700", color: theme.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "12px", marginTop: "8px" }}>Emergency Contact</div>
              <div style={styles.grid(3)}>
                <div style={styles.formGroup}><label style={styles.label}>Name</label><input style={styles.input} value={form.emergency_contact_name} onChange={e => upd("emergency_contact_name", e.target.value)} /></div>
                <div style={styles.formGroup}><label style={styles.label}>Phone</label><input style={styles.input} value={form.emergency_contact_phone} onChange={e => upd("emergency_contact_phone", e.target.value)} /></div>
                <div style={styles.formGroup}><label style={styles.label}>Relationship</label><input style={styles.input} value={form.emergency_contact_relationship} onChange={e => upd("emergency_contact_relationship", e.target.value)} /></div>
              </div>
              <div style={{ fontSize: "12px", fontWeight: "700", color: theme.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "12px", marginTop: "8px" }}>Guarantor</div>
              <div style={styles.grid(2)}>
                <div style={styles.formGroup}><label style={styles.label}>Guarantor Name</label><input style={styles.input} value={form.guarantor_name} onChange={e => upd("guarantor_name", e.target.value)} /></div>
                <div style={styles.formGroup}><label style={styles.label}>Guarantor Phone</label><input style={styles.input} value={form.guarantor_phone} onChange={e => upd("guarantor_phone", e.target.value)} /></div>
              </div>
              <div style={styles.formGroup}><label style={styles.label}>Guarantor Address</label><textarea style={{ ...styles.input, resize: "vertical", minHeight: "60px" }} value={form.guarantor_address} onChange={e => upd("guarantor_address", e.target.value)} /></div>
            </div>
          )}

          {/* Tab 4 — Next of Kin */}
          {activeTab === 4 && (
            <div>
              <div style={styles.grid(3)}>
                <div style={styles.formGroup}><label style={styles.label}>Full Name</label><input style={styles.input} value={form.next_of_kin_name} onChange={e => upd("next_of_kin_name", e.target.value)} /></div>
                <div style={styles.formGroup}><label style={styles.label}>Relationship</label><input style={styles.input} value={form.next_of_kin_relationship} onChange={e => upd("next_of_kin_relationship", e.target.value)} /></div>
                <div style={styles.formGroup}><label style={styles.label}>Phone</label><input style={styles.input} value={form.next_of_kin_phone} onChange={e => upd("next_of_kin_phone", e.target.value)} /></div>
              </div>
            </div>
          )}

          {/* Tab 5 — Bank Details */}
          {activeTab === 5 && (
            <div>
              <div style={styles.formGroup}><label style={styles.label}>Bank Name</label>
                <select style={styles.input} value={form.bank_name} onChange={e => upd("bank_name", e.target.value)}>
                  <option value="">Select Bank…</option>
                  {NIGERIAN_BANKS.map(b => <option key={b}>{b}</option>)}
                </select>
              </div>
              <div style={styles.grid(2)}>
                <div style={styles.formGroup}><label style={styles.label}>Account Number</label><input style={styles.input} placeholder="10-digit account number" value={form.bank_account_number} onChange={e => upd("bank_account_number", e.target.value)} /></div>
                <div style={styles.formGroup}><label style={styles.label}>Account Name (as on bank)</label><input style={styles.input} placeholder="Name as on bank account" value={form.bank_account_name} onChange={e => upd("bank_account_name", e.target.value)} /></div>
              </div>
              <div style={{ fontSize: "12px", color: theme.textMuted, marginTop: "8px" }}>Bank details used for salary/wage transfers</div>
            </div>
          )}
        </div>
        {/* Footer */}
        <div style={{ padding: "16px 24px", borderTop: `1px solid ${theme.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
          <div style={{ display: "flex", gap: "8px" }}>
            {activeTab > 1 && <button style={styles.btn("secondary")} onClick={() => setActiveTab(t => t - 1)}>← Previous</button>}
            {activeTab < 5 && <button style={styles.btn("primary")} onClick={() => setActiveTab(t => t + 1)}>Next →</button>}
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button style={styles.btn("secondary")} onClick={onClose}>Cancel</button>
            <button style={styles.btn("primary")} onClick={handleSave} disabled={saving}>{saving ? "Saving…" : "Save"}</button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ── STAFF PROFILE ─────────────────────────────────────────────
const StaffProfile = ({ staffId, onBack, onUpdated, roles, userProfile }) => {
  const [staff, setStaff] = useState(null);
  const [loading, setLoading] = useState(true);
  const [documents, setDocuments] = useState([]);
  const [docsLoading, setDocsLoading] = useState(true);
  const [tab, setTab] = useState("personal");
  const [editMode, setEditMode] = useState(false);
  const [alert, setAlert] = useState(null);
  const [attendanceHistory, setAttendanceHistory] = useState([]);
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [payrollHistory, setPayrollHistory] = useState([]);
  const [payrollLoading, setPayrollLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadLabel, setUploadLabel] = useState("Offer Letter");
  const fileInputRef = useRef(null);
  const [photoSignedUrl, setPhotoSignedUrl] = useState(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [generatingIDCard, setGeneratingIDCard] = useState(false);
  const [generatingBizCard, setGeneratingBizCard] = useState(false);
  const photoFileRef = useRef(null);

  const loadStaff = async () => {
    setLoading(true);
    try { setStaff(await hrStaffService.getById(staffId)); }
    catch (e) { setAlert({ type: "error", msg: "Failed to load staff: " + e.message }); }
    finally { setLoading(false); }
  };

  const loadDocs = async () => {
    setDocsLoading(true);
    try { setDocuments(await documentsService.getByStaff(staffId)); }
    catch (e) { setAlert({ type: "error", msg: "Failed to load documents." }); }
    finally { setDocsLoading(false); }
  };

  useEffect(() => { loadStaff(); loadDocs(); }, [staffId]);

  // Fetch signed URL whenever photo_path changes
  useEffect(() => {
    if (!staff?.photo_path) { setPhotoSignedUrl(null); return; }
    photoService.getSignedUrl(staff.photo_path).then(setPhotoSignedUrl).catch(() => setPhotoSignedUrl(null));
  }, [staff?.photo_path]);

  const canUploadPhoto = userProfile?.role === 'md' || userProfile?.role === 'hr_officer';

  const handlePhotoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoUploading(true); setAlert(null);
    try {
      const path = await photoService.upload(staff.id, file);
      const signedUrl = await photoService.getSignedUrl(path);
      setPhotoSignedUrl(signedUrl);
      setStaff(s => ({ ...s, photo_path: path }));
      const completedBy = userProfile?.full_name || userProfile?.email || 'HR';
      await photoService.markChecklistPhotoComplete(staff.id, completedBy);
      setAlert({ type: "success", msg: "Photo uploaded and profile updated." });
    } catch (e) {
      setAlert({ type: "error", msg: "Photo upload failed: " + e.message });
    } finally {
      setPhotoUploading(false);
      if (photoFileRef.current) photoFileRef.current.value = "";
    }
  };

  const handleDownloadIDCard = async () => {
    setGeneratingIDCard(true); setAlert(null);
    try {
      await generateIDCardPDF(staff, photoSignedUrl);
    } catch (e) {
      setAlert({ type: "error", msg: "ID card generation failed: " + e.message });
    } finally { setGeneratingIDCard(false); }
  };

  const handleDownloadBizCard = async () => {
    setGeneratingBizCard(true); setAlert(null);
    try {
      await generateBusinessCardPDF(staff);
    } catch (e) {
      setAlert({ type: "error", msg: "Business card generation failed: " + e.message });
    } finally { setGeneratingBizCard(false); }
  };

  useEffect(() => {
    if (tab === "attendance" && staff) {
      setAttendanceLoading(true);
      const to = new Date().toISOString().split("T")[0];
      const from = new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0];
      attendanceService.getByRange(from, to, staffId)
        .then(setAttendanceHistory)
        .catch(() => {})
        .finally(() => setAttendanceLoading(false));
    }
  }, [tab, staffId]);

  useEffect(() => {
    if (tab === "payroll" && staff) {
      setPayrollLoading(true);
      supabase
        .from('payroll_lines')
        .select('*, payroll_run:payroll_run_id(period_from, period_to, run_date, status)')
        .eq('staff_id', staffId)
        .order('created_at', { ascending: false })
        .then(({ data, error }) => {
          if (!error) setPayrollHistory(data || []);
        })
        .finally(() => setPayrollLoading(false));
    }
  }, [tab, staffId]);

  const handleUpload = async () => {
    const file = fileInputRef.current?.files?.[0];
    if (!file) return setAlert({ type: "error", msg: "Please select a file." });
    setUploading(true);
    try {
      await documentsService.upload(staffId, file, uploadLabel);
      fileInputRef.current.value = "";
      await loadDocs();
      setAlert({ type: "success", msg: "Document uploaded successfully." });
    } catch (e) { setAlert({ type: "error", msg: "Upload failed: " + e.message }); }
    finally { setUploading(false); }
  };

  const handleDeleteDoc = async (doc) => {
    try {
      await documentsService.delete(doc.id, doc.file_url);
      await loadDocs();
    } catch (e) { setAlert({ type: "error", msg: "Delete failed: " + e.message }); }
  };

  if (loading) return <Spinner />;
  if (!staff) return <div style={{ color: theme.textMuted }}>Staff not found.</div>;

  const roleName = staff.staffRole?.role_name || "—";
  const deptName = staff.staffRole?.department || staff.department || "—";
  const initials = (staff.full_name || "").split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase();
  const statusColors = { active: theme.green, terminated: theme.red, suspended: theme.accent, resigned: theme.textMuted };
  const statusColor = statusColors[staff.employment_status] || theme.textMuted;

  const attTotal = attendanceHistory.length;
  const attPresent = attendanceHistory.filter(a => a.present).length;
  const attRate = attTotal > 0 ? Math.round(attPresent / attTotal * 100) : 0;

  const profileTabs = ["personal","employment","attendance","payroll","documents"];
  const profileTabLabels = { personal: "Personal Info", employment: "Employment", attendance: "Attendance", payroll: "Payroll", documents: "Documents" };

  return (
    <div>
      {alert && <Alert msg={alert.msg} type={alert.type} onClose={() => setAlert(null)} />}

      {/* Profile Header */}
      <div style={{ ...styles.card, marginBottom: "24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "16px" }}>
          {/* Left: photo + name */}
          <div style={{ display: "flex", gap: "16px", alignItems: "flex-start" }}>
            {/* Photo + upload */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "6px" }}>
              {photoSignedUrl || staff.profile_photo_url ? (
                <img src={photoSignedUrl || staff.profile_photo_url} alt={staff.full_name} style={{ width: "68px", height: "68px", borderRadius: "10px", objectFit: "cover", border: `2px solid ${theme.blue}44` }} />
              ) : (
                <div style={{ width: "68px", height: "68px", borderRadius: "10px", background: theme.accent + "33", color: theme.accent, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "22px", fontWeight: "700" }}>{initials}</div>
              )}
              {canUploadPhoto && (
                <>
                  <input ref={photoFileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handlePhotoUpload} />
                  <button
                    style={{ ...styles.btn("secondary"), padding: "3px 8px", fontSize: "10px", whiteSpace: "nowrap" }}
                    onClick={() => photoFileRef.current?.click()}
                    disabled={photoUploading}
                  >
                    {photoUploading ? "Uploading…" : "Upload Photo"}
                  </button>
                </>
              )}
            </div>
            {/* Name + badges + incomplete flag */}
            <div>
              <div style={{ fontSize: "20px", fontWeight: "700", color: theme.text }}>{staff.full_name}</div>
              <div style={{ fontSize: "12px", color: theme.textMuted, marginTop: "2px" }}>{staff.employee_number}</div>
              <div style={{ display: "flex", gap: "6px", marginTop: "6px", flexWrap: "wrap" }}>
                <span style={styles.badge(theme.blue)}>{deptName}</span>
                <span style={styles.badge(theme.accent)}>{roleName}</span>
                {staff.job_title && <span style={styles.badge(theme.blue)}>{staff.job_title}</span>}
              </div>
              {(() => {
                const missing = getMissingFields(staff);
                return missing.length > 0 ? (
                  <div style={{ fontSize: "12px", color: "#f5a623", marginTop: "8px", fontWeight: "600" }}>
                    ⚠ Incomplete profile — missing: {missing.join(', ')}
                  </div>
                ) : (
                  <div style={{ fontSize: "12px", color: theme.green, marginTop: "8px" }}>✓ Profile complete</div>
                );
              })()}
            </div>
          </div>

          {/* Right: status + actions */}
          <div style={{ textAlign: "right", display: "flex", flexDirection: "column", gap: "6px", alignItems: "flex-end" }}>
            <span style={styles.badge(statusColor)}>{staff.employment_status || "active"}</span>
            <div style={{ fontSize: "12px", color: theme.textMuted }}>Hired: {staff.date_hired || "—"}</div>
            <button style={{ ...styles.btn("secondary"), fontSize: "12px" }} onClick={() => setEditMode(true)}>Edit Profile</button>

            {/* ID Card button */}
            {staff.employment_status === "active" && staff.photo_path ? (
              <button style={{ ...styles.btn("primary"), fontSize: "12px" }} onClick={handleDownloadIDCard} disabled={generatingIDCard}>
                {generatingIDCard ? "Generating…" : "↓ ID Card"}
              </button>
            ) : (
              <button
                style={{ ...styles.btn("secondary"), fontSize: "12px", opacity: 0.5, cursor: "not-allowed" }}
                disabled
                title="Staff must be active and have a photo before an ID card can be issued"
              >
                ↓ ID Card
              </button>
            )}

            {/* Business Card button */}
            {staff.employment_status === "active" ? (
              <button style={{ ...styles.btn("secondary"), fontSize: "12px" }} onClick={handleDownloadBizCard} disabled={generatingBizCard}>
                {generatingBizCard ? "Generating…" : "↓ Business Card"}
              </button>
            ) : (
              <button style={{ ...styles.btn("secondary"), fontSize: "12px", opacity: 0.5, cursor: "not-allowed" }} disabled title="Staff must be active">
                ↓ Business Card
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: "8px", marginBottom: "24px", borderBottom: `1px solid ${theme.border}`, paddingBottom: "12px", overflowX: "auto" }}>
        {profileTabs.map(t => (
          <button key={t} style={{ ...styles.btn(tab === t ? "primary" : "secondary"), fontSize: "12px", whiteSpace: "nowrap" }} onClick={() => setTab(t)}>{profileTabLabels[t]}</button>
        ))}
      </div>

      {/* Tab: Personal Info */}
      {tab === "personal" && (
        <div>
          <div style={styles.grid(2)}>
            {[
              ["Full Name", staff.full_name],
              ["Date of Birth", staff.date_of_birth],
              ["Gender", staff.gender],
              ["Marital Status", staff.marital_status],
              ["State of Origin", staff.state_of_origin],
              ["LGA of Origin", staff.lga_of_origin],
              ["NIN", staff.nin],
            ].map(([label, val]) => (
              <div key={label} style={styles.formGroup}>
                <label style={styles.label}>{label}</label>
                <div style={{ fontSize: "14px", color: val ? theme.text : theme.textMuted }}>{val || "—"}</div>
              </div>
            ))}
          </div>
          <div style={styles.formGroup}>
            <label style={styles.label}>Home Address</label>
            <div style={{ fontSize: "14px", color: staff.home_address ? theme.text : theme.textMuted }}>{staff.home_address || "—"}</div>
          </div>
          <div style={{ fontSize: "12px", fontWeight: "700", color: theme.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", margin: "16px 0 12px" }}>Emergency Contact</div>
          <div style={styles.grid(3)}>
            {[["Name", staff.emergency_contact_name],["Phone", staff.emergency_contact_phone],["Relationship", staff.emergency_contact_relationship]].map(([l, v]) => (
              <div key={l} style={styles.formGroup}><label style={styles.label}>{l}</label><div style={{ fontSize: "14px", color: v ? theme.text : theme.textMuted }}>{v || "—"}</div></div>
            ))}
          </div>
          <div style={{ fontSize: "12px", fontWeight: "700", color: theme.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", margin: "16px 0 12px" }}>Guarantor</div>
          <div style={styles.grid(2)}>
            {[["Name", staff.guarantor_name],["Phone", staff.guarantor_phone]].map(([l, v]) => (
              <div key={l} style={styles.formGroup}><label style={styles.label}>{l}</label><div style={{ fontSize: "14px", color: v ? theme.text : theme.textMuted }}>{v || "—"}</div></div>
            ))}
          </div>
          <div style={styles.formGroup}><label style={styles.label}>Guarantor Address</label><div style={{ fontSize: "14px", color: staff.guarantor_address ? theme.text : theme.textMuted }}>{staff.guarantor_address || "—"}</div></div>
          <div style={{ marginTop: "16px" }}>
            <button style={styles.btn("primary")} onClick={() => setEditMode(true)}>Edit Personal Info</button>
          </div>
        </div>
      )}

      {/* Tab: Employment */}
      {tab === "employment" && (
        <div>
          <div style={styles.grid(2)}>
            {[
              ["Employee Number", staff.employee_number],
              ["Department", deptName],
              ["Role", roleName],
              ["Job Title", staff.job_title],
              ["Staff Type", staff.staff_type],
              ["Date Hired", staff.date_hired],
              ["Employment Status", staff.employment_status],
            ].map(([label, val]) => (
              <div key={label} style={styles.formGroup}>
                <label style={styles.label}>{label}</label>
                <div style={{ fontSize: "14px", color: val ? theme.text : theme.textMuted }}>{val || "—"}</div>
              </div>
            ))}
          </div>
          {staff.staff_type === "permanent" && (
            <div style={styles.formGroup}><label style={styles.label}>Monthly Salary</label><div style={{ fontSize: "18px", fontWeight: "700", color: theme.green }}>{naira(staff.monthly_salary)}/mo</div></div>
          )}
          {staff.staff_type === "daily" && (
            <div style={styles.formGroup}><label style={styles.label}>Daily Rate</label><div style={{ fontSize: "18px", fontWeight: "700", color: theme.accent }}>{naira(staff.daily_rate)}/day</div></div>
          )}
          <div style={{ fontSize: "12px", fontWeight: "700", color: theme.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", margin: "16px 0 12px" }}>Bank Details</div>
          <div style={styles.grid(3)}>
            {[["Bank Name", staff.bank_name],["Account Number", staff.bank_account_number],["Account Name", staff.bank_account_name]].map(([l, v]) => (
              <div key={l} style={styles.formGroup}><label style={styles.label}>{l}</label><div style={{ fontSize: "14px", color: v ? theme.text : theme.textMuted }}>{v || "—"}</div></div>
            ))}
          </div>
          <div style={{ marginTop: "16px" }}>
            <button style={styles.btn("primary")} onClick={() => setEditMode(true)}>Edit Employment</button>
          </div>
        </div>
      )}

      {/* Tab: Attendance */}
      {tab === "attendance" && (
        <div>
          <div style={styles.grid(4)}>
            <StatCard label="Total Days" value={attTotal} sub="In last 30 days" accent={theme.blue} />
            <StatCard label="Present" value={attPresent} sub="Days present" accent={theme.green} />
            <StatCard label="Absent" value={attTotal - attPresent} sub="Days absent" accent={theme.red} />
            <StatCard label="Attendance Rate" value={attRate + "%"} sub="Present / total" accent={attRate >= 80 ? theme.green : theme.red} />
          </div>
          {attendanceLoading ? <Spinner /> : attendanceHistory.length === 0 ? (
            <div style={{ ...styles.card, textAlign: "center", padding: "40px", color: theme.textMuted }}>No attendance records found for the last 30 days.</div>
          ) : (
            <div style={styles.card}>
              <div style={styles.sectionTitle}>Attendance — Last 30 Days</div>
              <table style={styles.table}>
                <thead><tr>{["Date","Status","Hours Worked","Notes"].map(h => <th key={h} style={styles.th}>{h}</th>)}</tr></thead>
                <tbody>
                  {attendanceHistory.map(a => (
                    <tr key={a.id}>
                      <td style={styles.td}>{a.date}</td>
                      <td style={styles.td}><span style={styles.badge(a.present ? theme.green : theme.red)}>{a.present ? "Present" : "Absent"}</span></td>
                      <td style={styles.td}>{a.hours_worked ? a.hours_worked + "h" : "—"}</td>
                      <td style={styles.td}>{a.notes || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tab: Payroll */}
      {tab === "payroll" && (
        <div>
          {payrollLoading ? <Spinner /> : payrollHistory.length === 0 ? (
            <div style={{ ...styles.card, textAlign: "center", padding: "40px", color: theme.textMuted }}>No payroll records found.</div>
          ) : (
            <div style={styles.card}>
              <div style={styles.sectionTitle}>Payroll History</div>
              <table style={styles.table}>
                <thead><tr>{["Period","Amount Due","Amount Paid","Payment Date","Method","Status"].map(h => <th key={h} style={styles.th}>{h}</th>)}</tr></thead>
                <tbody>
                  {payrollHistory.map(l => (
                    <tr key={l.id}>
                      <td style={styles.td}>{l.payroll_run ? `${l.payroll_run.period_from} → ${l.payroll_run.period_to}` : "—"}</td>
                      <td style={styles.td}><strong style={{ color: theme.accent }}>{naira(l.amount_due)}</strong></td>
                      <td style={styles.td}>{naira(l.amount_paid)}</td>
                      <td style={styles.td}>{l.payment_date || "—"}</td>
                      <td style={styles.td}>{l.payment_method || "—"}</td>
                      <td style={styles.td}><span style={styles.badge(l.payroll_run?.status === "paid" ? theme.green : theme.blue)}>{l.payroll_run?.status || "—"}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tab: Documents */}
      {tab === "documents" && (
        <div>
          <div style={{ ...styles.card, marginBottom: "16px" }}>
            <div style={styles.sectionTitle}>Upload Document</div>
            <div style={styles.grid(2)}>
              <div style={styles.formGroup}>
                <label style={styles.label}>Document Type</label>
                <select style={styles.input} value={uploadLabel} onChange={e => setUploadLabel(e.target.value)}>
                  {DOCUMENT_LABELS.map(l => <option key={l}>{l}</option>)}
                </select>
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>File (PDF or Image)</label>
                <input ref={fileInputRef} type="file" accept=".pdf,image/*" style={{ ...styles.input, padding: "7px 12px" }} />
              </div>
            </div>
            <button style={styles.btn("primary")} onClick={handleUpload} disabled={uploading}>{uploading ? "Uploading…" : "Upload Document"}</button>
          </div>

          {docsLoading ? <Spinner /> : documents.length === 0 ? (
            <div style={{ ...styles.card, textAlign: "center", padding: "40px", color: theme.textMuted }}>No documents uploaded yet.</div>
          ) : (
            <div style={styles.card}>
              <div style={styles.sectionTitle}>Documents ({documents.length})</div>
              <table style={styles.table}>
                <thead><tr>{["Document Type","File Name","Uploaded","Actions"].map(h => <th key={h} style={styles.th}>{h}</th>)}</tr></thead>
                <tbody>
                  {documents.map(doc => (
                    <tr key={doc.id}>
                      <td style={styles.td}><span style={styles.badge(theme.blue)}>{doc.document_label}</span></td>
                      <td style={styles.td}>{doc.file_name}</td>
                      <td style={styles.td}>{doc.uploaded_at ? new Date(doc.uploaded_at).toLocaleDateString() : "—"}</td>
                      <td style={styles.td}>
                        <div style={{ display: "flex", gap: "6px" }}>
                          <a href={doc.displayUrl || '#'} target="_blank" rel="noopener noreferrer" style={{ ...styles.btn("secondary"), padding: "4px 10px", fontSize: "11px", textDecoration: "none" }}>View</a>
                          <button style={{ ...styles.btn("danger"), padding: "4px 10px", fontSize: "11px" }} onClick={() => handleDeleteDoc(doc)}>Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Edit Modal */}
      {editMode && (
        <StaffFormModal
          editTarget={staff}
          roles={roles}
          onClose={() => setEditMode(false)}
          onSaved={(updated) => {
            setStaff(s => ({ ...s, ...updated }));
            if (onUpdated) onUpdated(updated);
          }}
        />
      )}
    </div>
  );
};

// ── STAFF DIRECTORY ───────────────────────────────────────────
const StaffDirectory = ({ onViewProfile }) => {
  const [staff, setStaff] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [alert, setAlert] = useState(null);
  const [editTarget, setEditTarget] = useState(null);
  const [filterDept, setFilterDept] = useState("");
  const [filterRole, setFilterRole] = useState("");
  const [filterType, setFilterType] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [search, setSearch] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const [s, r] = await Promise.all([staffService.getAll(), rolesService.getActive()]);
      setStaff(s);
      setRoles(r);
    } catch (e) { setAlert({ type: "error", msg: "Failed to load staff: " + e.message }); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const handleSave = () => { load(); setShowForm(false); setEditTarget(null); };

  const filtered = staff.filter(s => {
    if (search && !s.full_name?.toLowerCase().includes(search.toLowerCase()) && !s.employee_number?.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterDept && s.department !== filterDept) return false;
    if (filterRole && String(s.role_id) !== String(filterRole)) return false;
    if (filterType && s.staff_type !== filterType) return false;
    if (filterStatus === "active" && s.employment_status !== "active") return false;
    if (filterStatus === "onboarding" && s.employment_status !== "onboarding") return false;
    if (filterStatus === "suspended" && s.employment_status !== "suspended") return false;
    if (filterStatus === "terminated" && s.employment_status !== "terminated") return false;
    return true;
  });

  const depts = [...new Set(staff.map(s => s.department).filter(Boolean))];
  const filteredRolesForDropdown = roles.filter(r => !filterDept || r.department === filterDept);
  const activeCount = staff.filter(s => s.employment_status === "active").length;
  const permCount = staff.filter(s => s.staff_type === "permanent").length;
  const dailyCount = staff.filter(s => s.staff_type === "daily").length;

  const statusColor = (s) => {
    if (s.employment_status === "terminated") return theme.red;
    if (s.employment_status === "suspended") return theme.accent;
    if (s.employment_status === "onboarding") return theme.blue;
    if (s.employment_status === "resigned") return theme.textMuted;
    return s.employment_status === "active" ? theme.green : theme.red;
  };

  return (
    <div>
      {alert && <Alert msg={alert.msg} type={alert.type} onClose={() => setAlert(null)} />}

      <div style={styles.grid(4)}>
        <StatCard label="Total Staff" value={staff.length} sub="All categories" accent={theme.blue} />
        <StatCard label="Active" value={activeCount} sub="Currently active" accent={theme.green} />
        <StatCard label="Permanent" value={permCount} sub="Monthly salary" accent={theme.blue} />
        <StatCard label="Daily Workers" value={dailyCount} sub="Daily rate" accent={theme.accent} />
      </div>

      {/* Filter bar */}
      <div style={{ ...styles.card, marginBottom: "16px" }}>
        <div style={{ display: "flex", gap: "10px", alignItems: "flex-end", flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 180px" }}>
            <label style={styles.label}>Search</label>
            <input style={styles.input} placeholder="Name or employee number…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div>
            <label style={styles.label}>Department</label>
            <select style={{ ...styles.input, width: "160px" }} value={filterDept} onChange={e => { setFilterDept(e.target.value); setFilterRole(""); }}>
              <option value="">All Departments</option>
              {depts.map(d => <option key={d}>{d}</option>)}
            </select>
          </div>
          <div>
            <label style={styles.label}>Role</label>
            <select style={{ ...styles.input, width: "160px" }} value={filterRole} onChange={e => setFilterRole(e.target.value)}>
              <option value="">All Roles</option>
              {filteredRolesForDropdown.map(r => <option key={r.id} value={r.id}>{r.role_name}</option>)}
            </select>
          </div>
          <div>
            <label style={styles.label}>Staff Type</label>
            <select style={{ ...styles.input, width: "130px" }} value={filterType} onChange={e => setFilterType(e.target.value)}>
              <option value="">All</option>
              <option value="permanent">Permanent</option>
              <option value="daily">Daily</option>
            </select>
          </div>
          <div>
            <label style={styles.label}>Status</label>
            <select style={{ ...styles.input, width: "140px" }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
              <option value="">All</option>
              <option value="active">Active</option>
              <option value="onboarding">Onboarding</option>
              <option value="suspended">Suspended</option>
              <option value="terminated">Terminated</option>
            </select>
          </div>
          <button style={styles.btn("primary")} onClick={() => setShowForm(true)}>+ Add Staff</button>
        </div>
      </div>

      {loading ? <Spinner /> : (
        <div style={styles.card}>
          <div style={styles.sectionTitle}>Staff Directory ({filtered.length})</div>
          {filtered.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px", color: theme.textMuted }}>No staff records match your filters.</div>
          ) : (
            <table style={styles.table}>
              <thead>
                <tr>{["Name","Dept / Role","Type","Pay","Date Hired","Status","Actions"].map(h => <th key={h} style={styles.th}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {filtered.map(s => {
                  const roleObj = roles.find(r => r.id === s.role_id);
                  return (
                    <tr key={s.id}>
                      <td style={styles.td}>
                        <strong style={{ cursor: "pointer", color: theme.accent }} onClick={() => onViewProfile(s.id)}>{s.full_name}</strong>
                        {s.employee_number && <div style={{ fontSize: "11px", color: theme.textMuted }}>{s.employee_number}</div>}
                        {(() => {
                          const missing = getMissingFields(s);
                          return missing.length > 0 ? (
                            <div style={{ fontSize: "10px", color: "#f5a623", marginTop: "2px", fontWeight: "600" }}>
                              ⚠ Missing: {missing.join(', ')}
                            </div>
                          ) : null;
                        })()}
                      </td>
                      <td style={styles.td}>
                        <span style={styles.badge(theme.blue)}>{s.department || "—"}</span>
                        {roleObj && <div style={{ fontSize: "11px", color: theme.textMuted, marginTop: "3px" }}>{roleObj.role_name}</div>}
                      </td>
                      <td style={styles.td}><span style={styles.badge(s.staff_type === "permanent" ? theme.blue : s.staff_type === "daily" ? theme.accent : theme.textMuted)}>{s.staff_type}</span></td>
                      <td style={styles.td}>{s.staff_type === "permanent" ? naira(s.monthly_salary) + "/mo" : naira(s.daily_rate) + "/day"}</td>
                      <td style={styles.td}>{s.date_hired || "—"}</td>
                      <td style={styles.td}><span style={styles.badge(statusColor(s))}>{s.employment_status || "active"}</span></td>
                      <td style={styles.td}>
                        <div style={{ display: "flex", gap: "6px" }}>
                          <button style={{ ...styles.btn("primary"), padding: "4px 10px", fontSize: "11px" }} onClick={() => onViewProfile(s.id)}>Profile</button>
                          <button style={{ ...styles.btn("secondary"), padding: "4px 10px", fontSize: "11px" }} onClick={() => { setEditTarget(s); setShowForm(true); }}>Edit</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {showForm && (
        <StaffFormModal
          editTarget={editTarget}
          roles={roles}
          onClose={() => { setShowForm(false); setEditTarget(null); }}
          onSaved={handleSave}
        />
      )}
    </div>
  );
};

// ── ATTENDANCE TAB ─────────────────────────────────────────────
const AttendanceTab = () => {
  const today = new Date().toISOString().split("T")[0];
  const [activeStaff, setActiveStaff] = useState([]);
  const [attendanceDate, setAttendanceDate] = useState(today);
  const [rows, setRows] = useState([]);
  const [saving, setSaving] = useState(false);
  const [alert, setAlert] = useState(null);
  const [histFrom, setHistFrom] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().split("T")[0]; });
  const [histTo, setHistTo] = useState(today);
  const [histStaff, setHistStaff] = useState("");
  const [history, setHistory] = useState([]);
  const [histLoading, setHistLoading] = useState(false);
  const [histFilter, setHistFilter] = useState("all");
  const [view, setView] = useState("entry");

  useEffect(() => {
    staffService.getActive().then(s => { setActiveStaff(s); }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!attendanceDate || activeStaff.length === 0) return;
    attendanceService.getByDate(attendanceDate).then(existing => {
      const existingMap = Object.fromEntries(existing.map(r => [r.staff_id, r]));
      setRows(activeStaff.map(s => {
        const ex = existingMap[s.id];
        return { staff_id: s.id, full_name: s.full_name, role: s.staffRole?.role_name || s.role || "—", staff_type: s.staff_type, daily_rate: s.daily_rate, present: ex ? ex.present : true, hours_worked: ex ? (ex.hours_worked || "") : "", notes: ex ? (ex.notes || "") : "" };
      }));
    }).catch(() => {});
  }, [attendanceDate, activeStaff]);

  const loadHistory = async () => {
    setHistLoading(true);
    try { setHistory(await attendanceService.getByRange(histFrom, histTo, histStaff || null)); }
    catch (e) { setAlert({ type: "error", msg: "Failed to load history: " + e.message }); }
    finally { setHistLoading(false); }
  };

  useEffect(() => { if (view === "history") loadHistory(); }, [view]);

  const handleSaveAttendance = async () => {
    setSaving(true); setAlert(null);
    try {
      const records = rows.map(r => ({ staff_id: r.staff_id, date: attendanceDate, present: r.present, hours_worked: r.hours_worked ? parseFloat(r.hours_worked) : null, notes: r.notes || null, recorded_by: "Admin" }));
      await attendanceService.saveAll(records);
      setAlert({ type: "success", msg: `Attendance saved for ${attendanceDate} (${rows.filter(r => r.present).length} present, ${rows.filter(r => !r.present).length} absent).` });
    } catch (e) {
      const msg = e.message?.includes('not active') || e.message?.includes('not eligible')
        ? 'This staff member is not active and cannot be added to attendance/payroll.'
        : 'Failed to save: ' + e.message;
      setAlert({ type: "error", msg });
    }
    finally { setSaving(false); }
  };

  const updateRow = (staffId, field, val) => setRows(prev => prev.map(r => r.staff_id === staffId ? { ...r, [field]: val } : r));
  const presentCount = rows.filter(r => r.present).length;
  const absentCount = rows.filter(r => !r.present).length;

  const filteredHistory = history.filter(h => {
    if (histFilter === "present") return h.present;
    if (histFilter === "absent") return !h.present;
    return true;
  });

  const historyByStaff = {};
  for (const h of history) {
    if (!historyByStaff[h.staff_id]) historyByStaff[h.staff_id] = { name: h.staff?.full_name || "—", total: 0, present: 0 };
    historyByStaff[h.staff_id].total++;
    if (h.present) historyByStaff[h.staff_id].present++;
  }
  const allRate = history.length > 0 ? Math.round(history.filter(h => h.present).length / history.length * 100) : 0;
  const mostAbsent = Object.values(historyByStaff).sort((a, b) => (a.present / a.total) - (b.present / b.total))[0];

  return (
    <div>
      {alert && <Alert msg={alert.msg} type={alert.type} onClose={() => setAlert(null)} />}
      <div style={{ display: "flex", gap: "8px", marginBottom: "20px" }}>
        {[["entry","Daily Entry"],["history","History"]].map(([v, label]) => (
          <button key={v} style={{ ...styles.btn(view === v ? "primary" : "secondary"), fontSize: "13px" }} onClick={() => setView(v)}>{label}</button>
        ))}
      </div>

      {view === "entry" && (
        <div>
          <div style={{ display: "flex", gap: "12px", alignItems: "flex-end", marginBottom: "20px" }}>
            <div>
              <label style={styles.label}>Attendance Date</label>
              <input type="date" style={{ ...styles.input, width: "160px" }} value={attendanceDate} onChange={e => setAttendanceDate(e.target.value)} />
            </div>
            <div style={{ display: "flex", gap: "12px" }}>
              <div style={{ background: theme.green + "22", border: `1px solid ${theme.green}44`, borderRadius: "8px", padding: "8px 16px", textAlign: "center" }}>
                <div style={{ fontSize: "20px", fontWeight: "700", color: theme.green }}>{presentCount}</div>
                <div style={{ fontSize: "11px", color: theme.textMuted }}>Present</div>
              </div>
              <div style={{ background: theme.red + "22", border: `1px solid ${theme.red}44`, borderRadius: "8px", padding: "8px 16px", textAlign: "center" }}>
                <div style={{ fontSize: "20px", fontWeight: "700", color: theme.red }}>{absentCount}</div>
                <div style={{ fontSize: "11px", color: theme.textMuted }}>Absent</div>
              </div>
            </div>
            <button style={{ ...styles.btn("secondary"), fontSize: "12px" }} onClick={() => setRows(prev => prev.map(r => ({ ...r, present: true })))}>Mark All Present</button>
          </div>
          {rows.length === 0 ? (
            <div style={{ ...styles.card, textAlign: "center", padding: "40px", color: theme.textMuted }}>No active staff found.</div>
          ) : (
            <div style={styles.card}>
              <div style={styles.sectionTitle}>Staff Attendance — {attendanceDate}</div>
              <table style={styles.table}>
                <thead><tr>{["Name","Role","Type","Present/Absent","Hours Worked","Notes"].map(h => <th key={h} style={styles.th}>{h}</th>)}</tr></thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r.staff_id} style={{ background: r.present ? "transparent" : theme.red + "08" }}>
                      <td style={styles.td}><strong>{r.full_name}</strong></td>
                      <td style={styles.td}>{r.role}</td>
                      <td style={styles.td}><span style={styles.badge(r.staff_type === "permanent" ? theme.blue : theme.accent)}>{r.staff_type}</span></td>
                      <td style={styles.td}>
                        <div style={{ display: "flex", gap: "6px" }}>
                          <button onClick={() => updateRow(r.staff_id, "present", true)} style={{ padding: "5px 14px", borderRadius: "6px", fontSize: "12px", fontWeight: "600", cursor: "pointer", border: "none", background: r.present ? theme.green : theme.surface, color: r.present ? "#000" : theme.textMuted }}>Present</button>
                          <button onClick={() => updateRow(r.staff_id, "present", false)} style={{ padding: "5px 14px", borderRadius: "6px", fontSize: "12px", fontWeight: "600", cursor: "pointer", border: "none", background: !r.present ? theme.red : theme.surface, color: !r.present ? "#fff" : theme.textMuted }}>Absent</button>
                        </div>
                      </td>
                      <td style={styles.td}><input style={{ ...styles.input, width: "80px" }} type="number" placeholder="8" value={r.hours_worked} onChange={e => updateRow(r.staff_id, "hours_worked", e.target.value)} /></td>
                      <td style={styles.td}><input style={styles.input} placeholder="Optional note" value={r.notes} onChange={e => updateRow(r.staff_id, "notes", e.target.value)} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ marginTop: "16px" }}>
                <button style={styles.btn("primary")} onClick={handleSaveAttendance} disabled={saving}>{saving ? "Saving…" : "Save All Attendance"}</button>
              </div>
            </div>
          )}
        </div>
      )}

      {view === "history" && (
        <div>
          <div style={{ ...styles.card, marginBottom: "16px" }}>
            <div style={{ display: "flex", gap: "10px", alignItems: "flex-end", flexWrap: "wrap" }}>
              <div><label style={styles.label}>From</label><input type="date" style={{ ...styles.input, width: "140px" }} value={histFrom} onChange={e => setHistFrom(e.target.value)} /></div>
              <div><label style={styles.label}>To</label><input type="date" style={{ ...styles.input, width: "140px" }} value={histTo} onChange={e => setHistTo(e.target.value)} /></div>
              <div><label style={styles.label}>Staff</label>
                <select style={{ ...styles.input, width: "180px" }} value={histStaff} onChange={e => setHistStaff(e.target.value)}>
                  <option value="">All Staff</option>
                  {activeStaff.map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}
                </select>
              </div>
              <div><label style={styles.label}>Filter</label>
                <select style={{ ...styles.input, width: "130px" }} value={histFilter} onChange={e => setHistFilter(e.target.value)}>
                  <option value="all">All Records</option>
                  <option value="present">Present Only</option>
                  <option value="absent">Absent Only</option>
                </select>
              </div>
              <button style={styles.btn("primary")} onClick={loadHistory}>Search</button>
            </div>
          </div>
          {history.length > 0 && (
            <div style={styles.grid(3)}>
              <StatCard label="Records Found" value={filteredHistory.length} sub="In selected period" accent={theme.blue} />
              <StatCard label="Attendance Rate" value={allRate + "%"} sub="Present / total" accent={allRate >= 80 ? theme.green : theme.red} />
              {mostAbsent && <StatCard label="Most Absent" value={mostAbsent.name} sub={`${mostAbsent.present}/${mostAbsent.total} days present`} accent={theme.red} />}
            </div>
          )}
          {histLoading ? <Spinner /> : filteredHistory.length === 0 ? (
            <div style={{ ...styles.card, textAlign: "center", padding: "40px", color: theme.textMuted }}>No records found.</div>
          ) : (
            <div style={styles.card}>
              <div style={styles.sectionTitle}>Attendance Records</div>
              <table style={styles.table}>
                <thead><tr>{["Date","Staff Name","Role","Status","Hours","Notes"].map(h => <th key={h} style={styles.th}>{h}</th>)}</tr></thead>
                <tbody>
                  {filteredHistory.map(h => (
                    <tr key={h.id}>
                      <td style={styles.td}>{h.date}</td>
                      <td style={styles.td}><strong>{h.staff?.full_name || "—"}</strong></td>
                      <td style={styles.td}>{h.staff?.role || "—"}</td>
                      <td style={styles.td}><span style={styles.badge(h.present ? theme.green : theme.red)}>{h.present ? "Present" : "Absent"}</span></td>
                      <td style={styles.td}>{h.hours_worked ? h.hours_worked + "h" : "—"}</td>
                      <td style={styles.td}>{h.notes || "—"}</td>
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

// ── PAYROLL TAB ───────────────────────────────────────────────
const PayrollTab = () => {
  const today = new Date().toISOString().split("T")[0];
  const firstOfMonth = today.slice(0, 8) + "01";
  const [view, setView] = useState("new");
  const [step, setStep] = useState(1);
  const [periodFrom, setPeriodFrom] = useState(firstOfMonth);
  const [periodTo, setPeriodTo] = useState(today);
  const [preparedBy, setPreparedBy] = useState("Admin");
  const [calcLines, setCalcLines] = useState([]);
  const [calcLoading, setCalcLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [alert, setAlert] = useState(null);
  const [runs, setRuns] = useState([]);
  const [runsLoading, setRunsLoading] = useState(false);
  const [selectedRun, setSelectedRun] = useState(null);
  const [runLines, setRunLines] = useState([]);
  const [paymentEdits, setPaymentEdits] = useState({});
  const [pdfLoading, setPdfLoading] = useState(false);

  const loadRuns = async () => {
    setRunsLoading(true);
    try { setRuns(await payrollService.getRuns()); }
    catch (e) { setAlert({ type: "error", msg: "Could not load payroll runs: " + e.message }); }
    finally { setRunsLoading(false); }
  };
  useEffect(() => { if (view === "history") loadRuns(); }, [view]);

  const handleCalculate = async () => {
    if (!periodFrom || !periodTo) return setAlert({ type: "error", msg: "Select a period." });
    setCalcLoading(true); setAlert(null);
    try {
      const [allStaff, attendanceCounts] = await Promise.all([
        staffService.getActive(),
        attendanceService.getCountsByRange(periodFrom, periodTo),
      ]);
      const lines = allStaff.map(s => {
        const daysPresent = attendanceCounts[s.id] || 0;
        let amountDue = 0;
        if (s.staff_type === "daily") {
          amountDue = daysPresent * (s.daily_rate || 0);
        } else {
          const from = new Date(periodFrom), to = new Date(periodTo);
          const daysInMonth = new Date(from.getFullYear(), from.getMonth() + 1, 0).getDate();
          const daysInPeriod = Math.round((to - from) / 86400000) + 1;
          amountDue = ((s.monthly_salary || 0) / daysInMonth) * daysInPeriod;
        }
        return { staff_id: s.id, full_name: s.full_name, role: s.staffRole?.role_name || s.role || "—", staff_type: s.staff_type, days_present: daysPresent, daily_rate: s.daily_rate || 0, monthly_salary: s.monthly_salary || 0, amount_due: Math.round(amountDue) };
      });
      setCalcLines(lines);
      setStep(2);
    } catch (e) { setAlert({ type: "error", msg: "Calculation failed: " + e.message }); }
    finally { setCalcLoading(false); }
  };

  const dailyLines = calcLines.filter(l => l.staff_type === "daily");
  const permLines  = calcLines.filter(l => l.staff_type === "permanent");
  const totalDaily = dailyLines.reduce((s, l) => s + l.amount_due, 0);
  const totalPerm  = permLines.reduce((s, l) => s + l.amount_due, 0);
  const grandTotal = totalDaily + totalPerm;

  const handleApprove = async () => {
    setSaving(true); setAlert(null);
    try {
      const run = { period_from: periodFrom, period_to: periodTo, run_date: today, total_daily_wages: totalDaily, total_permanent_salaries: totalPerm, total_payroll: grandTotal, prepared_by: preparedBy, status: "approved" };
      const lines = calcLines.map(l => ({ staff_id: l.staff_id, staff_type: l.staff_type, days_present: l.days_present, daily_rate: l.daily_rate, monthly_salary: l.monthly_salary, amount_due: l.amount_due }));
      await payrollService.createRun(run, lines);
      setAlert({ type: "success", msg: `Payroll approved — ${naira(grandTotal)} total for ${calcLines.length} staff.` });
      setStep(1); setCalcLines([]); setView("history"); loadRuns();
    } catch (e) {
      const msg = e.message?.includes('not active') || e.message?.includes('not eligible')
        ? 'This staff member is not active and cannot be added to payroll.'
        : 'Failed to save payroll: ' + e.message;
      setAlert({ type: "error", msg });
    }
  };

  const openRun = async (run) => {
    setSelectedRun(run);
    try {
      const { lines } = await payrollService.getRunWithLines(run.id);
      setRunLines(lines);
      const edits = {};
      lines.forEach(l => { edits[l.id] = { amount_paid: String(l.amount_paid || l.amount_due || ""), payment_date: l.payment_date || today, payment_method: l.payment_method || "cash" }; });
      setPaymentEdits(edits);
    } catch (e) { setAlert({ type: "error", msg: e.message }); }
  };

  const handleRecordPayments = async () => {
    setSaving(true);
    try {
      await Promise.all(runLines.map(l => {
        const e = paymentEdits[l.id] || {};
        return payrollService.updateLine(l.id, { amount_paid: parseFloat(e.amount_paid) || 0, payment_date: e.payment_date || today, payment_method: e.payment_method || "cash" });
      }));
      await payrollService.updateRun(selectedRun.id, { status: "paid" });
      setAlert({ type: "success", msg: "Payments recorded — payroll marked as PAID." });
      loadRuns(); setSelectedRun(null);
    } catch (e) { setAlert({ type: "error", msg: "Failed to record payments: " + e.message }); }
    finally { setSaving(false); }
  };

  const handleDownloadPDF = async (run, lines) => {
    setPdfLoading(true);
    try { await generatePayrollPDF(run, lines); }
    catch (e) { setAlert({ type: "error", msg: "PDF error: " + e.message }); }
    finally { setPdfLoading(false); }
  };

  const statusColor = s => s === "paid" ? theme.green : s === "approved" ? theme.blue : theme.accent;

  return (
    <div>
      {alert && <Alert msg={alert.msg} type={alert.type} onClose={() => setAlert(null)} />}
      <div style={{ display: "flex", gap: "8px", marginBottom: "20px" }}>
        {[["new","New Payroll Run"],["history","Payroll History"]].map(([v, label]) => (
          <button key={v} style={{ ...styles.btn(view === v ? "primary" : "secondary"), fontSize: "13px" }} onClick={() => { setView(v); setSelectedRun(null); }}>{label}</button>
        ))}
      </div>

      {view === "new" && (
        <div>
          <div style={{ display: "flex", gap: "6px", marginBottom: "20px" }}>
            {[["1","Select Period"],["2","Review"],["3","Approve"]].map(([n, label]) => (
              <div key={n} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <div style={{ width: "24px", height: "24px", borderRadius: "50%", background: step >= parseInt(n) ? theme.accent : theme.surface, color: step >= parseInt(n) ? "#000" : theme.textMuted, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", fontWeight: "700" }}>{n}</div>
                <span style={{ fontSize: "12px", color: step >= parseInt(n) ? theme.text : theme.textMuted, fontWeight: step === parseInt(n) ? "700" : "400" }}>{label}</span>
                {n !== "3" && <span style={{ color: theme.textDim, margin: "0 4px" }}>›</span>}
              </div>
            ))}
          </div>

          {step === 1 && (
            <div style={{ ...styles.card, maxWidth: "500px" }}>
              <div style={styles.sectionTitle}>Step 1 — Select Pay Period</div>
              <div style={styles.grid(2)}>
                <div style={styles.formGroup}><label style={styles.label}>Period From</label><input type="date" style={styles.input} value={periodFrom} onChange={e => setPeriodFrom(e.target.value)} /></div>
                <div style={styles.formGroup}><label style={styles.label}>Period To</label><input type="date" style={styles.input} value={periodTo} onChange={e => setPeriodTo(e.target.value)} /></div>
              </div>
              <div style={styles.formGroup}><label style={styles.label}>Prepared By</label><input style={styles.input} value={preparedBy} onChange={e => setPreparedBy(e.target.value)} /></div>
              <button style={styles.btn("primary")} onClick={handleCalculate} disabled={calcLoading}>{calcLoading ? "Calculating…" : "Calculate Payroll →"}</button>
            </div>
          )}

          {step === 2 && (
            <div>
              <div style={styles.grid(3)}>
                <StatCard label="Daily Worker Wages" value={naira(totalDaily)} sub={`${dailyLines.length} workers`} accent={theme.accent} />
                <StatCard label="Permanent Salaries" value={naira(totalPerm)} sub={`${permLines.length} staff`} accent={theme.blue} />
                <StatCard label="Grand Total" value={naira(grandTotal)} sub={`${calcLines.length} total staff`} accent={theme.green} />
              </div>
              {dailyLines.length > 0 && (
                <div style={{ ...styles.card, marginBottom: "16px" }}>
                  <div style={styles.sectionTitle}>Daily Workers</div>
                  <table style={styles.table}>
                    <thead><tr>{["Name","Role","Days Present","Daily Rate","Amount Due"].map(h => <th key={h} style={styles.th}>{h}</th>)}</tr></thead>
                    <tbody>
                      {dailyLines.map(l => (
                        <tr key={l.staff_id}>
                          <td style={styles.td}><strong>{l.full_name}</strong></td>
                          <td style={styles.td}>{l.role}</td>
                          <td style={styles.td}><span style={{ color: theme.accent, fontWeight: "700" }}>{l.days_present} days</span></td>
                          <td style={styles.td}>{naira(l.daily_rate)}/day</td>
                          <td style={styles.td}><strong style={{ color: theme.green }}>{naira(l.amount_due)}</strong></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {permLines.length > 0 && (
                <div style={{ ...styles.card, marginBottom: "16px" }}>
                  <div style={styles.sectionTitle}>Permanent Staff</div>
                  <table style={styles.table}>
                    <thead><tr>{["Name","Role","Monthly Salary","Pro-rated Amount"].map(h => <th key={h} style={styles.th}>{h}</th>)}</tr></thead>
                    <tbody>
                      {permLines.map(l => (
                        <tr key={l.staff_id}>
                          <td style={styles.td}><strong>{l.full_name}</strong></td>
                          <td style={styles.td}>{l.role}</td>
                          <td style={styles.td}>{naira(l.monthly_salary)}/mo</td>
                          <td style={styles.td}><strong style={{ color: theme.blue }}>{naira(l.amount_due)}</strong></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div style={styles.row}>
                <button style={styles.btn("primary")} onClick={() => setStep(3)}>Approve Payroll →</button>
                <button style={styles.btn("secondary")} onClick={() => setStep(1)}>← Back</button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div style={styles.card}>
              <div style={styles.sectionTitle}>Step 3 — Approve & Save</div>
              <div style={{ display: "flex", gap: "16px", marginBottom: "16px", flexWrap: "wrap" }}>
                <div style={{ background: theme.surface, borderRadius: "8px", padding: "12px 20px" }}>
                  <div style={{ fontSize: "11px", color: theme.textMuted }}>Daily Workers</div>
                  <div style={{ fontSize: "20px", fontWeight: "700", color: theme.accent }}>{naira(totalDaily)}</div>
                </div>
                <div style={{ background: theme.surface, borderRadius: "8px", padding: "12px 20px" }}>
                  <div style={{ fontSize: "11px", color: theme.textMuted }}>Permanent Staff</div>
                  <div style={{ fontSize: "20px", fontWeight: "700", color: theme.blue }}>{naira(totalPerm)}</div>
                </div>
                <div style={{ background: theme.surface, borderRadius: "8px", padding: "12px 20px" }}>
                  <div style={{ fontSize: "11px", color: theme.textMuted }}>Grand Total</div>
                  <div style={{ fontSize: "22px", fontWeight: "700", color: theme.green }}>{naira(grandTotal)}</div>
                </div>
              </div>
              <div style={{ fontSize: "13px", color: theme.textMuted, marginBottom: "16px" }}>
                Period: <strong>{periodFrom}</strong> → <strong>{periodTo}</strong> · {calcLines.length} staff members
              </div>
              <div style={styles.row}>
                <button style={styles.btn("primary")} onClick={handleApprove} disabled={saving}>{saving ? "Saving…" : "✓ Approve & Save Payroll"}</button>
                <button style={styles.btn("secondary")} onClick={() => setStep(2)}>← Back to Review</button>
              </div>
            </div>
          )}
        </div>
      )}

      {view === "history" && !selectedRun && (
        runsLoading ? <Spinner /> : runs.length === 0 ? (
          <div style={{ ...styles.card, textAlign: "center", padding: "40px", color: theme.textMuted }}>No payroll runs yet.</div>
        ) : (
          <div style={styles.card}>
            <div style={styles.sectionTitle}>Payroll Runs</div>
            <table style={styles.table}>
              <thead><tr>{["Period","Run Date","Prepared By","Total","Status","Actions"].map(h => <th key={h} style={styles.th}>{h}</th>)}</tr></thead>
              <tbody>
                {runs.map(r => (
                  <tr key={r.id}>
                    <td style={styles.td}>{r.period_from} → {r.period_to}</td>
                    <td style={styles.td}>{r.run_date}</td>
                    <td style={styles.td}>{r.prepared_by || "—"}</td>
                    <td style={styles.td}><strong style={{ color: theme.green }}>{naira(r.total_payroll)}</strong></td>
                    <td style={styles.td}><span style={styles.badge(statusColor(r.status))}>{r.status}</span></td>
                    <td style={styles.td}><button style={{ ...styles.btn("secondary"), padding: "4px 10px", fontSize: "11px" }} onClick={() => openRun(r)}>View</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {view === "history" && selectedRun && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
            <div>
              <div style={{ fontSize: "16px", fontWeight: "700" }}>Payroll Run — {selectedRun.period_from} → {selectedRun.period_to}</div>
              <div style={{ fontSize: "12px", color: theme.textMuted, marginTop: "2px" }}>Prepared by {selectedRun.prepared_by || "—"} · <span style={styles.badge(statusColor(selectedRun.status))}>{selectedRun.status}</span></div>
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <button style={{ ...styles.btn("secondary"), fontSize: "12px" }} onClick={() => setSelectedRun(null)}>← Back</button>
              <button style={{ ...styles.btn("primary"), fontSize: "12px" }} onClick={() => handleDownloadPDF(selectedRun, runLines)} disabled={pdfLoading}>{pdfLoading ? "Generating…" : "↓ Download PDF"}</button>
            </div>
          </div>
          <div style={styles.grid(3)}>
            <StatCard label="Daily Wages" value={naira(selectedRun.total_daily_wages)} sub="Daily workers" accent={theme.accent} />
            <StatCard label="Salaries" value={naira(selectedRun.total_permanent_salaries)} sub="Permanent staff" accent={theme.blue} />
            <StatCard label="Total Payroll" value={naira(selectedRun.total_payroll)} sub="Grand total" accent={theme.green} />
          </div>
          <div style={styles.card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
              <div style={styles.sectionTitle}>Payment Details</div>
              {selectedRun.status !== "paid" && (
                <button style={styles.btn("primary")} onClick={handleRecordPayments} disabled={saving}>{saving ? "Saving…" : "Record Payments & Mark Paid"}</button>
              )}
            </div>
            <table style={styles.table}>
              <thead><tr>{["Name","Role","Type","Amount Due","Amount Paid","Date","Method","Notes"].map(h => <th key={h} style={styles.th}>{h}</th>)}</tr></thead>
              <tbody>
                {runLines.map(l => {
                  const e = paymentEdits[l.id] || {};
                  const editable = selectedRun.status !== "paid";
                  return (
                    <tr key={l.id}>
                      <td style={styles.td}><strong>{l.staff?.full_name || "—"}</strong></td>
                      <td style={styles.td}>{l.staff?.role || "—"}</td>
                      <td style={styles.td}><span style={styles.badge(l.staff_type === "permanent" ? theme.blue : theme.accent)}>{l.staff_type}</span></td>
                      <td style={styles.td}><strong style={{ color: theme.accent }}>{naira(l.amount_due)}</strong></td>
                      <td style={styles.td}>{editable ? <input style={{ ...styles.input, width: "110px" }} type="number" value={e.amount_paid} onChange={ev => setPaymentEdits(pe => ({ ...pe, [l.id]: { ...pe[l.id], amount_paid: ev.target.value } }))} /> : naira(l.amount_paid)}</td>
                      <td style={styles.td}>{editable ? <input type="date" style={{ ...styles.input, width: "130px" }} value={e.payment_date} onChange={ev => setPaymentEdits(pe => ({ ...pe, [l.id]: { ...pe[l.id], payment_date: ev.target.value } }))} /> : l.payment_date || "—"}</td>
                      <td style={styles.td}>{editable ? <select style={{ ...styles.input, width: "110px" }} value={e.payment_method} onChange={ev => setPaymentEdits(pe => ({ ...pe, [l.id]: { ...pe[l.id], payment_method: ev.target.value } }))}><option value="cash">Cash</option><option value="transfer">Transfer</option></select> : l.payment_method || "—"}</td>
                      <td style={styles.td}>{l.notes || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

// ── ONBOARDING TAB ────────────────────────────────────────────
const OnboardingTab = () => {
  const [onboardingStaff, setOnboardingStaff] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [checklists, setChecklists] = useState({});
  const [loading, setLoading] = useState(false);
  const [actioning, setActioning] = useState({});
  const [alert, setAlert] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      supabase.from('user_profiles').select('full_name, role').eq('id', user.id).single()
        .then(({ data }) => { if (data) setCurrentUser(data); });
    });
  }, []);

  const loadData = async () => {
    setLoading(true);
    const [staffRes, tplRes] = await Promise.all([
      supabase.from('staff').select('*, staffRole:role_id(role_name)').eq('employment_status', 'onboarding').order('full_name'),
      supabase.from('onboarding_checklist_templates').select('*').order('sort_order'),
    ]);
    const staff = staffRes.data || [];
    setOnboardingStaff(staff);
    setTemplates(tplRes.data || []);
    if (staff.length > 0) {
      const { data: rows } = await supabase.from('staff_onboarding_checklist')
        .select('*').in('staff_id', staff.map(s => s.id));
      const grouped = {};
      staff.forEach(s => { grouped[s.id] = {}; });
      (rows || []).forEach(r => { grouped[r.staff_id][r.item_key] = r; });
      setChecklists(grouped);
    }
    setLoading(false);
  };
  useEffect(() => { loadData(); }, []);

  const handleToggle = async (staffId, itemKey, nowComplete) => {
    const now = new Date().toISOString();
    const completedBy = currentUser?.full_name || currentUser?.role || 'hr';
    const existing = checklists[staffId]?.[itemKey];
    const patch = { is_complete: nowComplete, completed_at: nowComplete ? now : null, completed_by: nowComplete ? completedBy : null };
    const { error } = existing
      ? await supabase.from('staff_onboarding_checklist').update(patch).eq('id', existing.id)
      : await supabase.from('staff_onboarding_checklist').insert({ staff_id: staffId, item_key: itemKey, ...patch });
    if (error) { setAlert({ type: 'error', msg: error.message }); return; }
    setChecklists(prev => ({
      ...prev,
      [staffId]: { ...prev[staffId], [itemKey]: { ...existing, staff_id: staffId, item_key: itemKey, ...patch } },
    }));
  };

  const handleActivate = async (s) => {
    setActioning(prev => ({ ...prev, [s.id]: true }));
    const { error } = await supabase.from('staff').update({ employment_status: 'active' }).eq('id', s.id);
    setActioning(prev => ({ ...prev, [s.id]: false }));
    if (error) {
      setAlert({ type: 'error', msg: 'Complete all required checklist items before activating this staff member.' });
      return;
    }
    setAlert({ type: 'success', msg: `${s.full_name} activated successfully.` });
    loadData();
  };

  const canEdit = ['md', 'hr_officer'].includes(currentUser?.role);

  if (loading) return <Spinner />;

  return (
    <div>
      {alert && <Alert msg={alert.msg} type={alert.type} onClose={() => setAlert(null)} />}
      {onboardingStaff.length === 0 ? (
        <div style={{ ...styles.card, textAlign: 'center', padding: '40px', color: theme.textMuted }}>
          No staff currently in onboarding.
        </div>
      ) : onboardingStaff.map(s => {
        const items = checklists[s.id] || {};
        const allRequired = templates.filter(t => t.is_required);
        const allDone = allRequired.every(t => items[t.item_key]?.is_complete);
        return (
          <div key={s.id} style={{ ...styles.card, marginBottom: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
              <div>
                <div style={{ fontWeight: '700', fontSize: '15px' }}>{s.full_name}</div>
                <div style={{ fontSize: '12px', color: theme.textMuted, marginTop: '2px' }}>
                  {s.staffRole?.role_name || s.role || '—'} · {s.staff_type} · Hired {s.date_hired || '—'}
                </div>
              </div>
              {canEdit && (
                <button
                  style={{ ...styles.btn(allDone ? 'primary' : 'secondary'), opacity: allDone ? 1 : 0.5 }}
                  onClick={() => handleActivate(s)}
                  disabled={actioning[s.id] || !allDone}
                  title={allDone ? 'Activate staff member' : 'Complete all required items first'}
                >
                  {actioning[s.id] ? 'Activating…' : 'Activate'}
                </button>
              )}
            </div>
            <table style={styles.table}>
              <thead>
                <tr>
                  {['Checklist Item', 'Required', 'Complete', 'Completed By', 'Date'].map(h => <th key={h} style={styles.th}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {templates.map(t => {
                  const row = items[t.item_key];
                  return (
                    <tr key={t.item_key}>
                      <td style={styles.td}>
                        <div style={{ fontWeight: '600' }}>{t.label}</div>
                        {t.description && <div style={{ fontSize: '11px', color: theme.textMuted }}>{t.description}</div>}
                      </td>
                      <td style={styles.td}>
                        <span style={styles.badge(t.is_required ? theme.accent : theme.textMuted)}>{t.is_required ? 'Required' : 'Optional'}</span>
                      </td>
                      <td style={styles.td}>
                        <input
                          type="checkbox"
                          checked={!!row?.is_complete}
                          disabled={!canEdit}
                          onChange={e => handleToggle(s.id, t.item_key, e.target.checked)}
                          style={{ width: '16px', height: '16px', cursor: canEdit ? 'pointer' : 'default' }}
                        />
                      </td>
                      <td style={styles.td}>{row?.completed_by || '—'}</td>
                      <td style={styles.td}>{row?.completed_at ? new Date(row.completed_at).toLocaleDateString('en-GB') : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
};

// ── MAIN STAFF COMPONENT ──────────────────────────────────────
const Staff = ({ userProfile }) => {
  const [tab, setTab] = useState("directory");
  const [profileStaffId, setProfileStaffId] = useState(null);
  const [roles, setRoles] = useState([]);

  useEffect(() => {
    rolesService.getActive().then(setRoles).catch(() => {});
  }, []);

  if (profileStaffId) {
    return (
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "28px" }}>
          <div>
            <div style={{ fontSize: "22px", fontWeight: "700", color: theme.text }}>Staff Profile</div>
            <div style={{ fontSize: "13px", color: theme.textMuted, marginTop: "3px" }}>HR Management System</div>
          </div>
          <button style={styles.btn("secondary")} onClick={() => setProfileStaffId(null)}>← Back to Directory</button>
        </div>
        <StaffProfile staffId={profileStaffId} onBack={() => setProfileStaffId(null)} roles={roles} userProfile={userProfile} />
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "28px" }}>
        <div>
          <div style={{ fontSize: "22px", fontWeight: "700", color: theme.text }}>HR Management</div>
          <div style={{ fontSize: "13px", color: theme.textMuted, marginTop: "3px" }}>Staff directory, attendance tracking, payroll, and roles</div>
        </div>
      </div>
      <div style={{ display: "flex", gap: "8px", marginBottom: "24px", borderBottom: `1px solid ${theme.border}`, paddingBottom: "12px" }}>
        {[["directory","Staff Directory"],["onboarding","Onboarding"],["attendance","Attendance"],["payroll","Payroll"],["roles","Roles"]].map(([id, label]) => (
          <button key={id} style={{ ...styles.btn(tab === id ? "primary" : "secondary"), fontSize: "13px" }} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>
      {tab === "directory"  && <StaffDirectory onViewProfile={setProfileStaffId} roles={roles} />}
      {tab === "onboarding" && <OnboardingTab />}
      {tab === "attendance" && <AttendanceTab />}
      {tab === "payroll"    && <PayrollTab />}
      {tab === "roles"      && <RolesTab />}
    </div>
  );
};

export default Staff;
