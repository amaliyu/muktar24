import React, { useState, useEffect } from 'react'
import { suppliersService, supplierTransactionsService, supplierDocumentsService } from '../services/suppliers'
import { expensesService } from '../services/accounting'
import { supabase } from '../lib/supabase'

const theme = {
  bg: "#0f1117", surface: "#1a1d27", card: "#21263a", border: "#2e3452",
  accent: "#f5a623", accentDim: "#c47d0e", green: "#2dd4a0", red: "#f06b6b",
  blue: "#5b8dee", text: "#e8eaf0", textMuted: "#7c839e", textDim: "#4a5175",
}
const styles = {
  page: { color: theme.text, fontFamily: "'DM Sans','Segoe UI',sans-serif" },
  card: { background: theme.card, border: `1px solid ${theme.border}`, borderRadius: '10px', padding: '18px' },
  row: { display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' },
  grid: (n) => ({ display: 'grid', gridTemplateColumns: `repeat(${n}, 1fr)`, gap: '16px' }),
  label: { display: 'block', fontSize: '11px', fontWeight: '700', color: theme.textMuted, marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.06em' },
  input: { width: '100%', padding: '9px 12px', background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: '6px', color: theme.text, fontSize: '13px', boxSizing: 'border-box' },
  btn: (v = 'secondary') => ({
    padding: '9px 16px', borderRadius: '7px', fontWeight: '600', fontSize: '13px', cursor: 'pointer',
    border: `1px solid ${v === 'danger' ? theme.red : v === 'primary' ? theme.accent : theme.border}`,
    background: v === 'primary' ? theme.accent : v === 'danger' ? '#3d1515' : theme.surface,
    color: v === 'primary' ? '#1a0e00' : v === 'danger' ? theme.red : theme.text,
  }),
  badge: (color) => ({ display: 'inline-block', padding: '2px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: '700', background: color + '22', color, border: `1px solid ${color}44`, textTransform: 'uppercase' }),
  th: { padding: '10px 12px', textAlign: 'left', fontSize: '11px', fontWeight: '700', color: theme.textMuted, textTransform: 'uppercase', borderBottom: `1px solid ${theme.border}`, whiteSpace: 'nowrap' },
  td: { padding: '10px 12px', fontSize: '13px', borderBottom: `1px solid ${theme.border}22`, verticalAlign: 'top' },
  tab: (active) => ({ padding: '8px 16px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: active ? '700' : '400', background: active ? theme.accent + '22' : 'transparent', color: active ? theme.accent : theme.textMuted }),
  formGroup: { marginBottom: '14px' },
  alert: (t) => ({ padding: '10px 14px', borderRadius: '8px', marginBottom: '14px', background: (t === 'success' ? theme.green : t === 'warning' ? theme.accent : theme.red) + '22', border: `1px solid ${(t === 'success' ? theme.green : t === 'warning' ? theme.accent : theme.red)}44`, color: t === 'success' ? theme.green : t === 'warning' ? theme.accent : theme.red, fontSize: '13px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }),
}

const SUPPLY_CATEGORIES = ['Cement', 'Granite Dust', 'Sharp Sand', 'Diesel', 'Engine Oil', 'Hydraulic Oil', 'Spare Parts', 'Tyres', 'Vehicles', 'Printing', 'Stationery', 'Other']
const STATES = ['Abuja (FCT)', 'Kaduna', 'Kano', 'Lagos', 'Rivers', 'Ogun', 'Anambra', 'Enugu', 'Delta', 'Nasarawa', 'Niger', 'Benue', 'Plateau', 'Other']
const PAYMENT_TERMS = ['Cash', 'On Delivery', '30 Days Net', '60 Days Net', '90 Days Net', 'Advance Payment']
const STATUS_COLORS = { active: theme.green, inactive: theme.textMuted, blacklisted: theme.red }

const fmt = (n) => (Number(n) || 0).toLocaleString()
const naira = (n) => `₦${fmt(n)}`
const todayStr = () => new Date().toISOString().split('T')[0]

const Spinner = () => <div style={{ textAlign: 'center', padding: '48px', color: theme.textMuted }}>Loading…</div>
const AlertBar = ({ msg, type = 'error', onClose }) => (
  <div style={styles.alert(type)}>
    <span>{msg}</span>
    {onClose && <span style={{ cursor: 'pointer', fontWeight: '700', marginLeft: '12px' }} onClick={onClose}>✕</span>}
  </div>
)

const Stars = ({ value = 0, onChange }) => (
  <div style={{ display: 'flex', gap: '4px' }}>
    {[1, 2, 3, 4, 5].map(n => (
      <span key={n} style={{ fontSize: '22px', cursor: onChange ? 'pointer' : 'default', color: n <= value ? theme.accent : theme.border }}
        onClick={() => onChange && onChange(n === value ? 0 : n)}>★</span>
    ))}
  </div>
)

// ── SUPPLIER FORM ──────────────────────────────────────────────
const SupplierForm = ({ supplier, onSave, onCancel }) => {
  const empty = { company_name: '', contact_person: '', phone: '', email: '', address: '', state: 'Abuja (FCT)', what_they_supply: [], bank_name: '', bank_account_number: '', bank_account_name: '', payment_terms: 'Cash', rating: 0, status: 'active', notes: '' }
  const [form, setForm] = useState(supplier ? { ...empty, ...supplier } : empty)
  const [saving, setSaving] = useState(false)
  const [alert, setAlert] = useState(null)

  const toggleSupplyCategory = (cat) => {
    setForm(f => ({ ...f, what_they_supply: f.what_they_supply?.includes(cat) ? f.what_they_supply.filter(c => c !== cat) : [...(f.what_they_supply || []), cat] }))
  }

  const handleSave = async () => {
    if (!form.company_name) return setAlert('Company name is required.')
    setSaving(true)
    try {
      if (supplier) {
        await suppliersService.update(supplier.id, form)
      } else {
        let num = await suppliersService.getNextNumber()
        try {
          await suppliersService.create({ ...form, supplier_number: num })
        } catch (createErr) {
          if (createErr.code === '23505') {
            num = await suppliersService.getNextNumber()
            await suppliersService.create({ ...form, supplier_number: num })
          } else {
            throw createErr
          }
        }
      }
      onSave()
    } catch (e) { setAlert(e.message) }
    finally { setSaving(false) }
  }

  return (
    <div style={{ ...styles.card, borderLeft: `4px solid ${theme.accent}`, marginBottom: '20px' }}>
      <div style={{ fontWeight: '700', fontSize: '15px', color: theme.text, marginBottom: '16px' }}>{supplier ? 'Edit Supplier' : 'Register New Supplier'}</div>
      {alert && <AlertBar msg={alert} onClose={() => setAlert(null)} />}
      <div style={{ ...styles.grid(3), marginBottom: '4px' }}>
        <div style={{ ...styles.formGroup, gridColumn: 'span 2' }}><label style={styles.label}>Company Name *</label><input style={styles.input} value={form.company_name} onChange={e => setForm(f => ({ ...f, company_name: e.target.value }))} /></div>
        <div style={styles.formGroup}><label style={styles.label}>Status</label>
          <select style={styles.input} value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
            <option value="active">Active</option><option value="inactive">Inactive</option><option value="blacklisted">Blacklisted</option>
          </select>
        </div>
        <div style={styles.formGroup}><label style={styles.label}>Contact Person</label><input style={styles.input} value={form.contact_person} onChange={e => setForm(f => ({ ...f, contact_person: e.target.value }))} /></div>
        <div style={styles.formGroup}><label style={styles.label}>Phone</label><input style={styles.input} value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} /></div>
        <div style={styles.formGroup}><label style={styles.label}>Email</label><input style={styles.input} type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></div>
        <div style={{ ...styles.formGroup, gridColumn: 'span 2' }}><label style={styles.label}>Address</label><input style={styles.input} value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} /></div>
        <div style={styles.formGroup}><label style={styles.label}>State</label>
          <select style={styles.input} value={form.state} onChange={e => setForm(f => ({ ...f, state: e.target.value }))}>
            {STATES.map(s => <option key={s}>{s}</option>)}
          </select>
        </div>
      </div>

      <div style={styles.formGroup}>
        <label style={styles.label}>What They Supply</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          {SUPPLY_CATEGORIES.map(cat => (
            <label key={cat} style={{ display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer', fontSize: '13px', padding: '5px 10px', borderRadius: '6px', background: form.what_they_supply?.includes(cat) ? theme.accent + '22' : theme.surface, border: `1px solid ${form.what_they_supply?.includes(cat) ? theme.accent : theme.border}`, color: form.what_they_supply?.includes(cat) ? theme.accent : theme.textMuted }}>
              <input type="checkbox" checked={form.what_they_supply?.includes(cat) || false} onChange={() => toggleSupplyCategory(cat)} style={{ display: 'none' }} />
              {cat}
            </label>
          ))}
        </div>
      </div>

      <div style={styles.grid(3)}>
        <div style={styles.formGroup}><label style={styles.label}>Bank Name</label><input style={styles.input} value={form.bank_name} onChange={e => setForm(f => ({ ...f, bank_name: e.target.value }))} /></div>
        <div style={styles.formGroup}><label style={styles.label}>Account Number</label><input style={styles.input} value={form.bank_account_number} onChange={e => setForm(f => ({ ...f, bank_account_number: e.target.value }))} /></div>
        <div style={styles.formGroup}><label style={styles.label}>Account Name</label><input style={styles.input} value={form.bank_account_name} onChange={e => setForm(f => ({ ...f, bank_account_name: e.target.value }))} /></div>
        <div style={styles.formGroup}><label style={styles.label}>Payment Terms</label>
          <select style={styles.input} value={form.payment_terms} onChange={e => setForm(f => ({ ...f, payment_terms: e.target.value }))}>
            {PAYMENT_TERMS.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div style={styles.formGroup}>
          <label style={styles.label}>Rating</label>
          <Stars value={form.rating} onChange={v => setForm(f => ({ ...f, rating: v }))} />
        </div>
        {form.status === 'blacklisted' && (
          <div style={{ ...styles.formGroup, gridColumn: 'span 3' }}><label style={styles.label}>Blacklist Reason</label><input style={styles.input} value={form.blacklist_reason || ''} onChange={e => setForm(f => ({ ...f, blacklist_reason: e.target.value }))} /></div>
        )}
        <div style={{ ...styles.formGroup, gridColumn: 'span 3' }}><label style={styles.label}>Notes</label><input style={styles.input} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></div>
      </div>

      <div style={styles.row}>
        <button style={styles.btn('primary')} onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : supplier ? 'Save Changes' : 'Register Supplier'}</button>
        <button style={styles.btn()} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}

// ── TRANSACTIONS TAB ───────────────────────────────────────────
const TransactionsTab = ({ supplierId, companyName }) => {
  const [txns, setTxns] = useState([])
  const [loading, setLoading] = useState(true)
  const [showPayForm, setShowPayForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [alert, setAlert] = useState(null)
  const [payForm, setPayForm] = useState({ transaction_date: todayStr(), amount: '', description: '', reference: '', payment_method: 'Bank Transfer', create_expense: true })

  const load = async () => {
    setLoading(true)
    try { setTxns(await supplierTransactionsService.getBySupplier(supplierId)) }
    catch (e) { setAlert({ type: 'error', msg: e.message }) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [supplierId])

  const totalPurchased = txns.filter(t => t.transaction_type === 'purchase').reduce((s, t) => s + Number(t.amount), 0)
  const totalPaid = txns.filter(t => t.transaction_type === 'payment').reduce((s, t) => s + Number(t.amount), 0)
  const balance = totalPurchased - totalPaid

  const handleAddPayment = async () => {
    if (!payForm.amount || !payForm.transaction_date) return setAlert({ type: 'error', msg: 'Date and amount required.' })
    setSaving(true)
    try {
      let expenseId = null
      if (payForm.create_expense) {
        try {
          const exp = await expensesService.create({
            expense_date: payForm.transaction_date, description: payForm.description || `Payment to ${companyName}`,
            amount: Number(payForm.amount), vendor: companyName, status: 'approved',
            notes: `Supplier payment: ${companyName}${payForm.reference ? ' · Ref: ' + payForm.reference : ''}`,
          })
          expenseId = exp.id
        } catch { /* non-blocking */ }
      }
      await supplierTransactionsService.create({
        supplier_id: supplierId, transaction_date: payForm.transaction_date,
        transaction_type: 'payment', amount: Number(payForm.amount),
        description: payForm.description || `Payment to ${companyName}`,
        reference: payForm.reference || null, linked_expense_id: expenseId,
      })
      setPayForm({ transaction_date: todayStr(), amount: '', description: '', reference: '', payment_method: 'Bank Transfer', create_expense: true })
      setShowPayForm(false)
      setAlert({ type: 'success', msg: `Payment of ${naira(payForm.amount)} recorded${expenseId ? ' and added to P&L expenses.' : '.'}` })
      await load()
    } catch (e) { setAlert({ type: 'error', msg: e.message }) }
    finally { setSaving(false) }
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this transaction?')) return
    try { await supplierTransactionsService.delete(id); await load() }
    catch (e) { setAlert({ type: 'error', msg: e.message }) }
  }

  return (
    <div>
      {alert && <AlertBar msg={alert.msg} type={alert.type} onClose={() => setAlert(null)} />}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '20px' }}>
        {[
          { label: 'Total Purchased', value: naira(totalPurchased), color: theme.red },
          { label: 'Total Paid', value: naira(totalPaid), color: theme.green },
          { label: 'Outstanding Balance', value: naira(Math.max(0, balance)), color: balance > 0 ? theme.accent : theme.green },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ background: theme.surface, borderRadius: '8px', padding: '14px', borderTop: `3px solid ${color}` }}>
            <div style={{ fontSize: '11px', color: theme.textMuted, textTransform: 'uppercase' }}>{label}</div>
            <div style={{ fontSize: '20px', fontWeight: '700', color, marginTop: '6px' }}>{value}</div>
          </div>
        ))}
      </div>

      <div style={{ ...styles.row, justifyContent: 'flex-end', marginBottom: '12px' }}>
        <button style={styles.btn('primary')} onClick={() => setShowPayForm(v => !v)}>+ Record Payment</button>
      </div>

      {showPayForm && (
        <div style={{ ...styles.card, borderLeft: `4px solid ${theme.green}`, marginBottom: '16px' }}>
          <div style={{ fontWeight: '700', marginBottom: '12px' }}>Record Payment to {companyName}</div>
          <div style={styles.grid(3)}>
            <div style={styles.formGroup}><label style={styles.label}>Date</label><input style={styles.input} type="date" value={payForm.transaction_date} onChange={e => setPayForm(f => ({ ...f, transaction_date: e.target.value }))} /></div>
            <div style={styles.formGroup}><label style={styles.label}>Amount (₦) *</label><input style={styles.input} type="number" value={payForm.amount} onChange={e => setPayForm(f => ({ ...f, amount: e.target.value }))} /></div>
            <div style={styles.formGroup}><label style={styles.label}>Payment Method</label>
              <select style={styles.input} value={payForm.payment_method} onChange={e => setPayForm(f => ({ ...f, payment_method: e.target.value }))}>
                {['Bank Transfer', 'Cash', 'Cheque', 'Mobile Transfer'].map(m => <option key={m}>{m}</option>)}
              </select>
            </div>
            <div style={{ ...styles.formGroup, gridColumn: 'span 2' }}><label style={styles.label}>Description</label><input style={styles.input} placeholder={`Payment to ${companyName}`} value={payForm.description} onChange={e => setPayForm(f => ({ ...f, description: e.target.value }))} /></div>
            <div style={styles.formGroup}><label style={styles.label}>Bank Reference</label><input style={styles.input} value={payForm.reference} onChange={e => setPayForm(f => ({ ...f, reference: e.target.value }))} /></div>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', marginBottom: '14px', cursor: 'pointer', color: theme.textMuted }}>
            <input type="checkbox" checked={payForm.create_expense} onChange={e => setPayForm(f => ({ ...f, create_expense: e.target.checked }))} />
            Automatically record this payment as an expense in P&L
          </label>
          <div style={styles.row}>
            <button style={styles.btn('primary')} onClick={handleAddPayment} disabled={saving}>{saving ? 'Saving…' : 'Save Payment'}</button>
            <button style={styles.btn()} onClick={() => setShowPayForm(false)}>Cancel</button>
          </div>
        </div>
      )}

      {loading ? <Spinner /> : txns.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', color: theme.textMuted }}>No transactions yet.</div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>{['Date', 'Type', 'Description', 'Purchase', 'Payment', 'Reference', ''].map(h => <th key={h} style={styles.th}>{h}</th>)}</tr></thead>
          <tbody>
            {[...txns].sort((a, b) => a.transaction_date.localeCompare(b.transaction_date)).reduce((acc, t, i, arr) => {
              let runBal = 0
              for (let j = 0; j <= arr.indexOf(t); j++) {
                const tx = arr[j]
                if (tx.transaction_type === 'purchase') runBal += Number(tx.amount)
                else runBal -= Number(tx.amount)
              }
              acc.push({ ...t, runBal })
              return acc
            }, []).reverse().map(t => (
              <tr key={t.id}>
                <td style={styles.td}>{t.transaction_date}</td>
                <td style={styles.td}><span style={styles.badge(t.transaction_type === 'purchase' ? theme.red : t.transaction_type === 'payment' ? theme.green : theme.blue)}>{t.transaction_type}</span></td>
                <td style={styles.td}>{t.description || '—'}</td>
                <td style={styles.td}>{t.transaction_type === 'purchase' ? <strong style={{ color: theme.red }}>{naira(t.amount)}</strong> : <span style={{ color: theme.textMuted }}>—</span>}</td>
                <td style={styles.td}>{t.transaction_type === 'payment' ? <strong style={{ color: theme.green }}>{naira(t.amount)}</strong> : <span style={{ color: theme.textMuted }}>—</span>}</td>
                <td style={styles.td}>{t.reference || '—'}</td>
                <td style={styles.td}><button style={{ ...styles.btn('danger'), padding: '2px 7px', fontSize: '11px' }} onClick={() => handleDelete(t.id)}>×</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

// ── SUPPLY HISTORY TAB ─────────────────────────────────────────
const SupplyHistoryTab = ({ supplierId, companyName }) => {
  const [stockMoves, setStockMoves] = useState([])
  const [maintenance, setMaintenance] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const [sm, vm] = await Promise.all([
          supabase.from('stock_movements').select('*, item:item_id(name, unit)').or(`supplier_id.eq.${supplierId},supplier.ilike.%${companyName}%`).eq('movement_type', 'in').order('date', { ascending: false }).then(r => r.data || []),
          supabase.from('vehicle_maintenance').select('*, vehicle:vehicle_id(vehicle_number, vehicle_name)').or(`supplier_id.eq.${supplierId},vendor_name.ilike.%${companyName}%`).order('maintenance_date', { ascending: false }).then(r => r.data || []),
        ])
        setStockMoves(sm)
        setMaintenance(vm)
      } catch { }
      finally { setLoading(false) }
    }
    load()
  }, [supplierId, companyName])

  const totalStockValue = stockMoves.reduce((s, m) => s + (Number(m.quantity) * Number(m.unit_cost || 0)), 0)
  const totalMaintenanceValue = maintenance.reduce((s, m) => s + Number(m.cost || 0), 0)

  if (loading) return <Spinner />
  return (
    <div>
      <div style={{ ...styles.grid(2), marginBottom: '20px' }}>
        <div style={{ background: theme.surface, borderRadius: '8px', padding: '14px', borderTop: `3px solid ${theme.blue}` }}>
          <div style={{ fontSize: '11px', color: theme.textMuted, textTransform: 'uppercase' }}>Stock Supplied (Value)</div>
          <div style={{ fontSize: '20px', fontWeight: '700', color: theme.blue, marginTop: '6px' }}>{naira(totalStockValue)}</div>
          <div style={{ fontSize: '11px', color: theme.textMuted }}>{stockMoves.length} deliveries</div>
        </div>
        <div style={{ background: theme.surface, borderRadius: '8px', padding: '14px', borderTop: `3px solid ${theme.accent}` }}>
          <div style={{ fontSize: '11px', color: theme.textMuted, textTransform: 'uppercase' }}>Maintenance Services</div>
          <div style={{ fontSize: '20px', fontWeight: '700', color: theme.accent, marginTop: '6px' }}>{naira(totalMaintenanceValue)}</div>
          <div style={{ fontSize: '11px', color: theme.textMuted }}>{maintenance.length} records</div>
        </div>
      </div>

      {stockMoves.length > 0 && (
        <>
          <div style={{ fontWeight: '700', fontSize: '13px', color: theme.textMuted, textTransform: 'uppercase', marginBottom: '10px' }}>Stock Deliveries</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '24px' }}>
            <thead><tr>{['Date', 'Item', 'Quantity', 'Unit Cost', 'Total'].map(h => <th key={h} style={styles.th}>{h}</th>)}</tr></thead>
            <tbody>
              {stockMoves.map(m => (
                <tr key={m.id}>
                  <td style={styles.td}>{m.date}</td>
                  <td style={styles.td}>{m.item?.name || '—'}</td>
                  <td style={styles.td}>{fmt(m.quantity)} {m.item?.unit || ''}</td>
                  <td style={styles.td}>{m.unit_cost ? naira(m.unit_cost) : '—'}</td>
                  <td style={styles.td}><strong style={{ color: theme.accent }}>{naira(Number(m.quantity) * Number(m.unit_cost || 0))}</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {maintenance.length > 0 && (
        <>
          <div style={{ fontWeight: '700', fontSize: '13px', color: theme.textMuted, textTransform: 'uppercase', marginBottom: '10px' }}>Vehicle Maintenance Services</div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>{['Date', 'Vehicle', 'Type', 'Description', 'Cost'].map(h => <th key={h} style={styles.th}>{h}</th>)}</tr></thead>
            <tbody>
              {maintenance.map(m => (
                <tr key={m.id}>
                  <td style={styles.td}>{m.maintenance_date}</td>
                  <td style={styles.td}>{m.vehicle?.vehicle_number || '—'}</td>
                  <td style={styles.td}>{m.maintenance_type}</td>
                  <td style={styles.td}>{m.description || '—'}</td>
                  <td style={styles.td}><strong style={{ color: theme.accent }}>{naira(m.cost)}</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {stockMoves.length === 0 && maintenance.length === 0 && (
        <div style={{ textAlign: 'center', padding: '48px', color: theme.textMuted }}>No supply history found for this supplier.</div>
      )}
    </div>
  )
}

// ── DOCUMENTS TAB ──────────────────────────────────────────────
const SupplierDocumentsTab = ({ supplierId }) => {
  const [docs, setDocs] = useState([])
  const [docUrls, setDocUrls] = useState({})
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [label, setLabel] = useState('')
  const [alert, setAlert] = useState(null)

  const DOC_LABELS = ['Registration Certificate', 'Tax Clearance', 'Product Catalogue', 'Contract Agreement', 'Quality Certificate', 'Other']

  const load = async () => {
    setLoading(true)
    try {
      const rows = await supplierDocumentsService.getBySupplier(supplierId)
      setDocs(rows)
      const entries = await Promise.all(rows.map(async d => {
        try { return [d.id, await supplierDocumentsService.getSignedUrl(d.file_url)] } catch { return [d.id, null] }
      }))
      setDocUrls(Object.fromEntries(entries))
    }
    catch { }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [supplierId])

  const handleUpload = async (file) => {
    if (!label) return setAlert({ type: 'error', msg: 'Select a document label before uploading.' })
    setUploading(true)
    try {
      await supplierDocumentsService.upload(supplierId, file, label)
      setLabel('')
      setAlert({ type: 'success', msg: `${label} uploaded.` })
      await load()
    } catch (e) { setAlert({ type: 'error', msg: 'Upload failed: ' + e.message }) }
    finally { setUploading(false) }
  }

  const handleDelete = async (doc) => {
    if (!window.confirm('Delete this document?')) return
    try { await supplierDocumentsService.delete(doc.id, doc.file_url); await load() }
    catch (e) { setAlert({ type: 'error', msg: e.message }) }
  }

  return (
    <div>
      {alert && <AlertBar msg={alert.msg} type={alert.type} onClose={() => setAlert(null)} />}
      <div style={{ ...styles.row, marginBottom: '16px' }}>
        <select style={{ ...styles.input, width: '200px' }} value={label} onChange={e => setLabel(e.target.value)}>
          <option value="">— Select document type —</option>
          {DOC_LABELS.map(l => <option key={l}>{l}</option>)}
        </select>
        <label style={{ cursor: 'pointer' }}>
          <span style={{ ...styles.btn('primary'), display: 'inline-block' }}>{uploading ? 'Uploading…' : '+ Upload Document'}</span>
          <input type="file" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" style={{ display: 'none' }} disabled={uploading} onChange={e => e.target.files[0] && handleUpload(e.target.files[0])} />
        </label>
      </div>
      {loading ? <Spinner /> : docs.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px', color: theme.textMuted }}>No documents uploaded yet.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {docs.map(d => (
            <div key={d.id} style={{ ...styles.row, ...styles.card, padding: '12px 16px' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: '600', fontSize: '13px' }}>{d.document_label}</div>
                <div style={{ fontSize: '11px', color: theme.textMuted }}>{d.file_name} {d.file_size ? `· ${(d.file_size / 1024).toFixed(0)} KB` : ''} · {new Date(d.uploaded_at).toLocaleDateString('en-NG')}</div>
              </div>
              <a href={docUrls[d.id] || undefined} target="_blank" rel="noreferrer" style={{ fontSize: '12px', color: theme.blue }}>View</a>
              <button style={{ ...styles.btn('danger'), padding: '3px 8px', fontSize: '11px' }} onClick={() => handleDelete(d)}>Delete</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── SUPPLIER PROFILE ───────────────────────────────────────────
const SupplierProfile = ({ supplier: initialSupplier, onBack, onUpdate }) => {
  const [supplier, setSupplier] = useState(initialSupplier)
  const [tab, setTab] = useState('details')
  const [editing, setEditing] = useState(false)
  const [alert, setAlert] = useState(null)
  const [balance, setBalance] = useState(0)

  useEffect(() => {
    supplierTransactionsService.getBalance(supplier.id).then(setBalance).catch(() => {})
  }, [supplier.id])

  const TABS = [
    { id: 'details', label: 'Details' },
    { id: 'transactions', label: 'Transactions' },
    { id: 'supply', label: 'Supply History' },
    { id: 'documents', label: 'Documents' },
  ]

  const statusColor = STATUS_COLORS[supplier.status] || theme.textMuted

  if (editing) {
    return <SupplierForm supplier={supplier} onSave={async () => {
      const updated = await suppliersService.getById(supplier.id).catch(() => supplier)
      setSupplier(updated)
      setEditing(false)
      onUpdate()
    }} onCancel={() => setEditing(false)} />
  }

  return (
    <div style={styles.page}>
      {alert && <AlertBar msg={alert.msg} type={alert.type} onClose={() => setAlert(null)} />}
      <div style={{ ...styles.row, marginBottom: '20px' }}>
        <button style={styles.btn()} onClick={onBack}>← Back to Suppliers</button>
      </div>

      <div style={{ ...styles.card, marginBottom: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <div style={{ fontSize: '22px', fontWeight: '800', color: theme.text }}>{supplier.company_name}</div>
            <div style={{ fontSize: '12px', color: theme.accent, fontWeight: '600', marginTop: '2px' }}>{supplier.supplier_number}</div>
            <div style={{ fontSize: '13px', color: theme.textMuted, marginTop: '4px' }}>{supplier.contact_person}{supplier.phone ? ` · ${supplier.phone}` : ''}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' }}>
              {(supplier.what_they_supply || []).map(c => <span key={c} style={styles.badge(theme.blue)}>{c}</span>)}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <span style={styles.badge(statusColor)}>{supplier.status}</span>
            {supplier.rating > 0 && <div style={{ marginTop: '6px' }}><Stars value={supplier.rating} /></div>}
            {balance > 0 && <div style={{ marginTop: '8px', fontSize: '13px', color: theme.red, fontWeight: '600' }}>Owed: {naira(balance)}</div>}
            <button style={{ ...styles.btn('primary'), marginTop: '10px' }} onClick={() => setEditing(true)}>Edit Supplier</button>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '6px', marginBottom: '20px', flexWrap: 'wrap' }}>
        {TABS.map(t => <button key={t.id} style={styles.tab(tab === t.id)} onClick={() => setTab(t.id)}>{t.label}</button>)}
      </div>

      {tab === 'details' && (
        <div style={{ ...styles.grid(2) }}>
          {[
            ['Supplier Number', supplier.supplier_number],
            ['Company Name', supplier.company_name],
            ['Contact Person', supplier.contact_person || '—'],
            ['Phone', supplier.phone || '—'],
            ['Email', supplier.email || '—'],
            ['Address', supplier.address || '—'],
            ['State', supplier.state || '—'],
            ['Payment Terms', supplier.payment_terms || '—'],
            ['Bank Name', supplier.bank_name || '—'],
            ['Account Number', supplier.bank_account_number || '—'],
            ['Account Name', supplier.bank_account_name || '—'],
            ['Status', supplier.status],
          ].map(([label, val]) => (
            <div key={label} style={{ padding: '10px 0', borderBottom: `1px solid ${theme.border}22`, display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '12px', color: theme.textMuted }}>{label}</span>
              <span style={{ fontSize: '13px', fontWeight: '600' }}>{val}</span>
            </div>
          ))}
          {supplier.what_they_supply?.length > 0 && (
            <div style={{ padding: '10px 0', borderBottom: `1px solid ${theme.border}22`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gridColumn: 'span 2' }}>
              <span style={{ fontSize: '12px', color: theme.textMuted }}>What They Supply</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>{supplier.what_they_supply.map(c => <span key={c} style={styles.badge(theme.blue)}>{c}</span>)}</div>
            </div>
          )}
          {supplier.blacklist_reason && (
            <div style={{ padding: '10px', background: theme.red + '15', borderRadius: '6px', gridColumn: 'span 2', fontSize: '13px', color: theme.red }}>
              Blacklist reason: {supplier.blacklist_reason}
            </div>
          )}
          {supplier.notes && (
            <div style={{ padding: '12px', background: theme.surface, borderRadius: '6px', fontSize: '13px', color: theme.textMuted, gridColumn: 'span 2' }}>{supplier.notes}</div>
          )}
        </div>
      )}
      {tab === 'transactions' && <TransactionsTab supplierId={supplier.id} companyName={supplier.company_name} />}
      {tab === 'supply' && <SupplyHistoryTab supplierId={supplier.id} companyName={supplier.company_name} />}
      {tab === 'documents' && <SupplierDocumentsTab supplierId={supplier.id} />}
    </div>
  )
}

// ── SUPPLIER REGISTRY (MAIN) ───────────────────────────────────
const SupplierRegistry = () => {
  const [suppliers, setSuppliers] = useState([])
  const [balances, setBalances] = useState({})
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterSupply, setFilterSupply] = useState('')
  const [alert, setAlert] = useState(null)

  const load = async () => {
    setLoading(true)
    try {
      const [s, b] = await Promise.all([suppliersService.getAll(), supplierTransactionsService.getAllBalances().catch(() => ({}))])
      setSuppliers(s)
      setBalances(b)
    } catch (e) { setAlert({ type: 'error', msg: 'Could not load suppliers: ' + e.message }) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  if (selected) {
    return <SupplierProfile supplier={selected} onBack={() => setSelected(null)} onUpdate={load} />
  }

  const filtered = suppliers.filter(s => {
    if (filterStatus && s.status !== filterStatus) return false
    if (filterSupply && !(s.what_they_supply || []).includes(filterSupply)) return false
    if (search) {
      const q = search.toLowerCase()
      return (s.company_name || '').toLowerCase().includes(q) || (s.contact_person || '').toLowerCase().includes(q) || (s.supplier_number || '').toLowerCase().includes(q)
    }
    return true
  })

  const totalOwed = Object.values(balances).reduce((s, b) => s + Math.max(0, b), 0)
  const activeCount = suppliers.filter(s => s.status === 'active').length
  const blacklistedCount = suppliers.filter(s => s.status === 'blacklisted').length

  return (
    <div style={styles.page}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <div style={{ fontSize: '20px', fontWeight: '800', color: theme.text }}>Supplier Registry</div>
          <div style={{ fontSize: '13px', color: theme.textMuted, marginTop: '3px' }}>Manage suppliers, track transactions, and monitor balances</div>
        </div>
        <button style={styles.btn('primary')} onClick={() => setShowForm(v => !v)}>+ Register Supplier</button>
      </div>

      {alert && <AlertBar msg={alert.msg} type={alert.type} onClose={() => setAlert(null)} />}

      {/* Summary Cards */}
      <div style={{ ...styles.grid(4), marginBottom: '24px' }}>
        {[
          { label: 'Total Suppliers', value: suppliers.length, color: theme.blue },
          { label: 'Active', value: activeCount, color: theme.green },
          { label: 'Total Owed', value: naira(totalOwed), color: totalOwed > 0 ? theme.red : theme.textMuted },
          { label: 'Blacklisted', value: blacklistedCount, color: blacklistedCount > 0 ? theme.red : theme.textMuted },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ ...styles.card, borderTop: `3px solid ${color}` }}>
            <div style={{ fontSize: '11px', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
            <div style={{ fontSize: '22px', fontWeight: '700', color, marginTop: '6px' }}>{value}</div>
          </div>
        ))}
      </div>

      {showForm && (
        <SupplierForm onSave={async () => { setShowForm(false); await load(); setAlert({ type: 'success', msg: 'Supplier registered.' }) }} onCancel={() => setShowForm(false)} />
      )}

      {/* Filters */}
      <div style={{ ...styles.row, marginBottom: '16px' }}>
        <input style={{ ...styles.input, width: '240px' }} placeholder="Search name, contact, number…" value={search} onChange={e => setSearch(e.target.value)} />
        <select style={{ ...styles.input, width: '150px' }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="blacklisted">Blacklisted</option>
        </select>
        <select style={{ ...styles.input, width: '160px' }} value={filterSupply} onChange={e => setFilterSupply(e.target.value)}>
          <option value="">All categories</option>
          {SUPPLY_CATEGORIES.map(c => <option key={c}>{c}</option>)}
        </select>
        {(search || filterStatus || filterSupply) && <button style={styles.btn()} onClick={() => { setSearch(''); setFilterStatus(''); setFilterSupply('') }}>Clear</button>}
      </div>

      {/* Supplier Cards */}
      {loading ? <Spinner /> : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px', color: theme.textMuted }}>
          {suppliers.length === 0 ? 'No suppliers registered. Click "+ Register Supplier" to get started.' : 'No suppliers match your filters.'}
        </div>
      ) : (
        <div style={styles.grid(2)}>
          {filtered.map(s => {
            const bal = balances[s.id] || 0
            const statusColor = STATUS_COLORS[s.status] || theme.textMuted
            return (
              <div key={s.id}
                style={{ ...styles.card, cursor: 'pointer', borderLeft: `4px solid ${s.status === 'blacklisted' ? theme.red : statusColor}` }}
                onClick={() => setSelected(s)}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '16px', fontWeight: '700', color: theme.text }}>{s.company_name}</div>
                    <div style={{ fontSize: '11px', color: theme.accent, fontWeight: '600' }}>{s.supplier_number}</div>
                    {s.contact_person && <div style={{ fontSize: '12px', color: theme.textMuted, marginTop: '3px' }}>{s.contact_person}{s.phone ? ` · ${s.phone}` : ''}</div>}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span style={styles.badge(statusColor)}>{s.status}</span>
                    {s.rating > 0 && <div style={{ marginTop: '4px' }}><Stars value={s.rating} /></div>}
                  </div>
                </div>
                {(s.what_they_supply || []).length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '8px' }}>
                    {s.what_they_supply.map(c => <span key={c} style={styles.badge(theme.blue)}>{c}</span>)}
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '10px', paddingTop: '10px', borderTop: `1px solid ${theme.border}22`, fontSize: '12px' }}>
                  <span style={{ color: theme.textMuted }}>{s.payment_terms || '—'}</span>
                  {bal > 0 && <span style={{ color: theme.red, fontWeight: '600' }}>Owed: {naira(bal)}</span>}
                  {bal <= 0 && <span style={{ color: theme.green, fontSize: '11px' }}>No outstanding balance</span>}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default SupplierRegistry
