import React, { useState, useEffect, useRef } from 'react'
import { vehiclesService, maintenanceService, fuelLogService, vehicleDocumentsService } from '../services/vehicles'
import { staffService } from '../services/staff'
import { expensesService } from '../services/accounting'
import { suppliersService, supplierTransactionsService } from '../services/suppliers'
import { supabase } from '../lib/supabase'

const theme = {
  bg: '#0f1117', surface: '#1a1d27', card: '#21263a', border: '#2e3452',
  accent: '#f5a623', accentDim: '#c47d0e', green: '#2dd4a0', red: '#f06b6b',
  blue: '#5b8dee', text: '#e8eaf0', textMuted: '#7c839e', textDim: '#4a5175',
}
const naira = (n) => `₦${Math.round(Number(n) || 0).toLocaleString()}`
const fmt = (n) => Number(n || 0).toLocaleString()
const todayStr = () => new Date().toISOString().split('T')[0]

const daysUntil = (dateStr) => {
  if (!dateStr) return null
  return Math.ceil((new Date(dateStr) - new Date()) / 86400000)
}
const isExpired = (d) => daysUntil(d) !== null && daysUntil(d) < 0
const isExpiring = (d, within = 30) => daysUntil(d) !== null && daysUntil(d) >= 0 && daysUntil(d) <= within

const expiryColor = (d) => {
  if (!d) return theme.textMuted
  if (isExpired(d)) return theme.red
  if (isExpiring(d)) return theme.accent
  return theme.green
}

const VEHICLE_TYPES = ['Tipper', 'Flatbed', 'Pickup', 'Hijet', 'Rental', 'Other']
const MAINTENANCE_TYPES = ['Routine', 'Repair', 'Tyres', 'Engine', 'Electrical', 'Other']
const DOC_LABELS = ['Insurance Certificate', 'Road Worthiness Certificate', 'Vehicle Licence', 'Purchase Document', 'Other']

const styles = {
  page: { padding: '24px 28px', color: theme.text },
  card: { background: theme.card, border: `1px solid ${theme.border}`, borderRadius: '10px', padding: '18px 20px', marginBottom: '16px' },
  row: { display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' },
  grid: (n) => ({ display: 'grid', gridTemplateColumns: `repeat(${n}, 1fr)`, gap: '16px' }),
  label: { display: 'block', fontSize: '11px', fontWeight: '700', color: theme.textMuted, marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.06em' },
  input: { width: '100%', padding: '9px 12px', background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: '6px', color: theme.text, fontSize: '13px', boxSizing: 'border-box' },
  btn: (v = 'primary') => ({
    padding: '9px 16px', borderRadius: '7px', fontWeight: '600', fontSize: '13px', cursor: 'pointer',
    border: `1px solid ${v === 'danger' ? theme.red : v === 'primary' ? theme.accent : theme.border}`,
    background: v === 'primary' ? theme.accent : v === 'danger' ? '#3d1515' : theme.surface,
    color: v === 'primary' ? '#1a0e00' : v === 'danger' ? theme.red : theme.text,
  }),
  badge: (color) => ({ display: 'inline-block', padding: '2px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: '700', background: color + '22', color, border: `1px solid ${color}44`, textTransform: 'uppercase' }),
  th: { padding: '10px 12px', textAlign: 'left', fontSize: '11px', fontWeight: '700', color: theme.textMuted, textTransform: 'uppercase', borderBottom: `1px solid ${theme.border}` },
  td: { padding: '10px 12px', fontSize: '13px', borderBottom: `1px solid ${theme.border}22` },
  tab: (active) => ({ padding: '8px 16px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: active ? '700' : '400', background: active ? theme.accent + '22' : 'transparent', color: active ? theme.accent : theme.textMuted }),
  sectionTitle: { fontSize: '13px', fontWeight: '700', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '14px' },
  formGroup: { marginBottom: '14px' },
}

const Spinner = () => (
  <div style={{ textAlign: 'center', padding: '48px', color: theme.textMuted }}>Loading…</div>
)

const AlertBar = ({ msg, type = 'error', onClose }) => (
  <div style={{ padding: '12px 16px', borderRadius: '8px', marginBottom: '14px', background: type === 'success' ? theme.green + '22' : type === 'warning' ? theme.accent + '22' : theme.red + '22', color: type === 'success' ? theme.green : type === 'warning' ? theme.accent : theme.red, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px' }}>
    <span>{msg}</span>
    {onClose && <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: '16px' }}>×</button>}
  </div>
)

const StatCard = ({ label, value, sub, color = theme.accent }) => (
  <div style={{ ...styles.card, borderLeft: `4px solid ${color}`, marginBottom: 0 }}>
    <div style={{ fontSize: '11px', fontWeight: '700', color: theme.textMuted, textTransform: 'uppercase', marginBottom: '6px', letterSpacing: '0.06em' }}>{label}</div>
    <div style={{ fontSize: '24px', fontWeight: '700', color }}>{value}</div>
    {sub && <div style={{ fontSize: '11px', color: theme.textMuted, marginTop: '4px' }}>{sub}</div>}
  </div>
)

// ── VEHICLE FORM ─────────────────────────────────────────────────
const VehicleForm = ({ vehicle, staff, onSave, onCancel }) => {
  const empty = { vehicle_number: '', vehicle_name: '', vehicle_type: 'Tipper', make: '', model: '', year: '', color: '', capacity_blocks: '', assigned_driver_id: '', ownership: 'company_owned', status: 'active', insurance_expiry_date: '', road_worthiness_expiry_date: '', purchase_date: '', purchase_price: '', owner_name: '', owner_phone: '', monthly_rental_amount: '', contract_start_date: '', notes: '' }
  const [form, setForm] = useState(vehicle ? { ...empty, ...vehicle, assigned_driver_id: vehicle.assigned_driver_id || '', insurance_expiry_date: vehicle.insurance_expiry_date || '', road_worthiness_expiry_date: vehicle.road_worthiness_expiry_date || '', purchase_date: vehicle.purchase_date || '' } : empty)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const upd = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async () => {
    if (!form.vehicle_number) return setErr('Plate number is required.')
    if (!form.vehicle_type) return setErr('Vehicle type is required.')
    setSaving(true); setErr('')
    try {
      const payload = { ...form, year: form.year ? Number(form.year) : null, capacity_blocks: form.capacity_blocks ? Number(form.capacity_blocks) : null, purchase_price: form.purchase_price ? Number(form.purchase_price) : null, monthly_rental_amount: form.monthly_rental_amount ? Number(form.monthly_rental_amount) : null, assigned_driver_id: form.assigned_driver_id || null, insurance_expiry_date: form.insurance_expiry_date || null, road_worthiness_expiry_date: form.road_worthiness_expiry_date || null, purchase_date: form.purchase_date || null, contract_start_date: form.contract_start_date || null, owner_name: form.owner_name || null, owner_phone: form.owner_phone || null }
      if (vehicle) {
        await vehiclesService.update(vehicle.id, payload)
      } else {
        await vehiclesService.create(payload)
      }
      onSave()
    } catch (e) { setErr(e.message) }
    finally { setSaving(false) }
  }

  return (
    <div style={{ ...styles.card, borderLeft: `4px solid ${theme.accent}` }}>
      <div style={{ ...styles.sectionTitle, marginBottom: '18px' }}>{vehicle ? 'Edit Vehicle' : 'Register New Vehicle'}</div>
      {err && <AlertBar msg={err} onClose={() => setErr('')} />}
      <div style={styles.grid(3)}>
        <div style={styles.formGroup}><label style={styles.label}>Plate Number *</label><input style={styles.input} placeholder="e.g. BWR-100XB" value={form.vehicle_number} onChange={e => upd('vehicle_number', e.target.value.toUpperCase())} /></div>
        <div style={styles.formGroup}><label style={styles.label}>Vehicle Name</label><input style={styles.input} placeholder="e.g. Yellow Truck" value={form.vehicle_name} onChange={e => upd('vehicle_name', e.target.value)} /></div>
        <div style={styles.formGroup}><label style={styles.label}>Type *</label>
          <select style={styles.input} value={form.vehicle_type} onChange={e => upd('vehicle_type', e.target.value)}>{VEHICLE_TYPES.map(t => <option key={t}>{t}</option>)}</select></div>
        <div style={styles.formGroup}><label style={styles.label}>Make</label><input style={styles.input} placeholder="e.g. Mack, Volvo" value={form.make} onChange={e => upd('make', e.target.value)} /></div>
        <div style={styles.formGroup}><label style={styles.label}>Model</label><input style={styles.input} value={form.model} onChange={e => upd('model', e.target.value)} /></div>
        <div style={styles.formGroup}><label style={styles.label}>Year</label><input style={styles.input} type="number" placeholder="e.g. 2018" value={form.year} onChange={e => upd('year', e.target.value)} /></div>
        <div style={styles.formGroup}><label style={styles.label}>Color</label><input style={styles.input} placeholder="e.g. Yellow" value={form.color} onChange={e => upd('color', e.target.value)} /></div>
        <div style={styles.formGroup}><label style={styles.label}>Capacity (blocks/trip)</label><input style={styles.input} type="number" placeholder="e.g. 500" value={form.capacity_blocks} onChange={e => upd('capacity_blocks', e.target.value)} /></div>
        <div style={styles.formGroup}><label style={styles.label}>Ownership</label>
          <select style={styles.input} value={form.ownership} onChange={e => upd('ownership', e.target.value)}>
            <option value="company_owned">Company Owned</option>
            <option value="hired">Hired</option>
          </select></div>
        <div style={styles.formGroup}><label style={styles.label}>Assigned Driver</label>
          <select style={styles.input} value={form.assigned_driver_id} onChange={e => upd('assigned_driver_id', e.target.value)}>
            <option value="">— None —</option>
            {staff.map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}
          </select></div>
        <div style={styles.formGroup}><label style={styles.label}>Status</label>
          <select style={styles.input} value={form.status} onChange={e => upd('status', e.target.value)}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="maintenance">In Maintenance</option>
          </select></div>
        <div style={styles.formGroup}><label style={styles.label}>Insurance Expiry</label><input style={styles.input} type="date" value={form.insurance_expiry_date} onChange={e => upd('insurance_expiry_date', e.target.value)} /></div>
        <div style={styles.formGroup}><label style={styles.label}>Road Worthiness Expiry</label><input style={styles.input} type="date" value={form.road_worthiness_expiry_date} onChange={e => upd('road_worthiness_expiry_date', e.target.value)} /></div>
        <div style={styles.formGroup}><label style={styles.label}>Purchase Date</label><input style={styles.input} type="date" value={form.purchase_date} onChange={e => upd('purchase_date', e.target.value)} /></div>
        <div style={styles.formGroup}><label style={styles.label}>Purchase Price (₦)</label><input style={styles.input} type="number" value={form.purchase_price} onChange={e => upd('purchase_price', e.target.value)} /></div>
        <div style={{ ...styles.formGroup, gridColumn: 'span 3' }}><label style={styles.label}>Notes</label><input style={styles.input} value={form.notes} onChange={e => upd('notes', e.target.value)} /></div>
      </div>
      {form.vehicle_type === 'Rental' && (
        <div style={{ marginTop: '16px', padding: '14px 16px', background: theme.surface, borderRadius: '8px', border: `1px solid ${theme.accent}44` }}>
          <div style={{ fontSize: '12px', fontWeight: '700', color: theme.accent, marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Rental Details</div>
          <div style={styles.grid(3)}>
            <div style={styles.formGroup}><label style={styles.label}>Owner Name</label><input style={styles.input} placeholder="e.g. Alhaji Musa" value={form.owner_name} onChange={e => upd('owner_name', e.target.value)} /></div>
            <div style={styles.formGroup}><label style={styles.label}>Owner Phone</label><input style={styles.input} placeholder="e.g. 0801234567" value={form.owner_phone} onChange={e => upd('owner_phone', e.target.value)} /></div>
            <div style={styles.formGroup}><label style={styles.label}>Monthly Rental (₦)</label><input style={styles.input} type="number" placeholder="e.g. 150000" value={form.monthly_rental_amount} onChange={e => upd('monthly_rental_amount', e.target.value)} /></div>
            <div style={styles.formGroup}><label style={styles.label}>Contract Start Date</label><input style={styles.input} type="date" value={form.contract_start_date} onChange={e => upd('contract_start_date', e.target.value)} /></div>
            <div style={{ ...styles.formGroup, gridColumn: 'span 2' }}><label style={styles.label}>Maintenance Responsibility</label><input style={{ ...styles.input, color: theme.textMuted }} value="APCL (Abuja Precast Concrete Limited)" readOnly /></div>
          </div>
        </div>
      )}
      <div style={styles.row}>
        <button style={styles.btn('primary')} onClick={handleSubmit} disabled={saving}>{saving ? 'Saving…' : vehicle ? 'Save Changes' : 'Register Vehicle'}</button>
        <button style={styles.btn()} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}

// ── MAINTENANCE TAB ───────────────────────────────────────────────
const MaintenanceTab = ({ vehicleId, vehicleNumber, vehicleName }) => {
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editTarget, setEditTarget] = useState(null)
  const [saving, setSaving] = useState(false)
  const [alert, setAlert] = useState(null)
  const [suppliers, setSuppliers] = useState([])
  const today = todayStr()
  const emptyForm = { maintenance_date: today, maintenance_type: 'Routine', description: '', cost: '', supplierId: '', vendor_name: '', vendor_phone: '', downtime_days: '', next_maintenance_date: '', recorded_by: '', notes: '' }
  const [form, setForm] = useState(emptyForm)
  const [uploading, setUploading] = useState(false)
  const [receiptUrl, setReceiptUrl] = useState('')

  const load = async () => {
    setLoading(true)
    try { setRecords(await maintenanceService.getByVehicle(vehicleId)) }
    catch (e) { setAlert({ type: 'error', msg: e.message }) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [vehicleId])
  useEffect(() => { suppliersService.getActive().then(setSuppliers).catch(() => {}) }, [])

  const openCreate = () => { setEditTarget(null); setForm(emptyForm); setReceiptUrl(''); setShowForm(true) }
  const openEdit = (r) => {
    setEditTarget(r)
    setForm({ maintenance_date: r.maintenance_date, maintenance_type: r.maintenance_type, description: r.description || '', cost: String(r.cost || ''), supplierId: r.supplier_id || '', vendor_name: r.vendor_name || '', vendor_phone: r.vendor_phone || '', downtime_days: String(r.downtime_days || ''), next_maintenance_date: r.next_maintenance_date || '', recorded_by: r.recorded_by || '', notes: r.notes || '' })
    setReceiptUrl(r.receipt_url || '')
    setShowForm(true)
  }

  const getOrCreateVehicleMaintenanceCategoryId = async () => {
    const { data } = await supabase.from('expense_categories').select('id').ilike('name', 'vehicle maintenance').limit(1)
    if (data?.[0]?.id) return data[0].id
    const { data: newCat } = await supabase.from('expense_categories').insert({ name: 'Vehicle Maintenance', parent_category: 'Operations', is_active: true }).select('id').single()
    return newCat?.id || null
  }

  const handleSave = async () => {
    if (!form.maintenance_date || !form.maintenance_type) return setAlert({ type: 'error', msg: 'Date and type are required.' })
    setSaving(true)
    try {
      const cost = Number(form.cost) || 0
      const supplierObj = form.supplierId ? suppliers.find(s => s.id === form.supplierId) : null
      const vendorName = supplierObj?.company_name || form.vendor_name || null
      const { supplierId: _sid, ...formRest } = form
      const payload = { ...formRest, vehicle_id: vehicleId, supplier_id: form.supplierId || null, vendor_name: vendorName, cost, downtime_days: Number(form.downtime_days) || 0, receipt_url: receiptUrl || null, next_maintenance_date: form.next_maintenance_date || null }
      const expDesc = `${vehicleNumber || 'Vehicle'}${vehicleName ? ` (${vehicleName})` : ''} — ${form.maintenance_type}${form.description ? ': ' + form.description : ''}`

      const upsertSupplierTxn = async (expId, amount) => {
        if (!form.supplierId || amount <= 0) return
        const existing = await supabase.from('supplier_transactions').select('id').eq('linked_expense_id', expId).maybeSingle()
        if (existing.data?.id) {
          await supplierTransactionsService.update ? null : null
          await supabase.from('supplier_transactions').update({ amount, description: expDesc, transaction_date: form.maintenance_date }).eq('id', existing.data.id)
        } else {
          await supplierTransactionsService.create({ supplier_id: form.supplierId, transaction_date: form.maintenance_date, transaction_type: 'purchase', amount, description: expDesc, linked_expense_id: expId })
        }
      }

      if (editTarget) {
        await maintenanceService.update(editTarget.id, payload)
        if (cost > 0) {
          if (editTarget.linked_expense_id) {
            await expensesService.update(editTarget.linked_expense_id, { expense_date: form.maintenance_date, description: expDesc, amount: cost, vendor: vendorName, supplier_id: form.supplierId || null })
            await upsertSupplierTxn(editTarget.linked_expense_id, cost)
          } else {
            const catId = await getOrCreateVehicleMaintenanceCategoryId()
            const exp = await expensesService.create({ expense_date: form.maintenance_date, description: expDesc, amount: cost, vendor: vendorName, supplier_id: form.supplierId || null, category_id: catId, status: 'approved', notes: `vehicle-maintenance:${editTarget.id}` })
            await maintenanceService.update(editTarget.id, { linked_expense_id: exp.id })
            await upsertSupplierTxn(exp.id, cost)
          }
        } else if (editTarget.linked_expense_id) {
          await supabase.from('supplier_transactions').delete().eq('linked_expense_id', editTarget.linked_expense_id)
          await expensesService.delete(editTarget.linked_expense_id)
          await maintenanceService.update(editTarget.id, { linked_expense_id: null })
        }
        setAlert({ type: 'success', msg: 'Maintenance record updated.' })
      } else {
        const record = await maintenanceService.create(payload)
        if (cost > 0) {
          const catId = await getOrCreateVehicleMaintenanceCategoryId()
          const exp = await expensesService.create({ expense_date: form.maintenance_date, description: expDesc, amount: cost, vendor: vendorName, supplier_id: form.supplierId || null, category_id: catId, status: 'approved', notes: `vehicle-maintenance:${record.id}` })
          await maintenanceService.update(record.id, { linked_expense_id: exp.id })
          await upsertSupplierTxn(exp.id, cost)
        }
        setAlert({ type: 'success', msg: 'Maintenance record saved and expense logged to P&L.' })
      }
      setForm(emptyForm); setReceiptUrl(''); setShowForm(false); setEditTarget(null)
      await load()
    } catch (e) { setAlert({ type: 'error', msg: e.message }) }
    finally { setSaving(false) }
  }

  const handleDelete = async (r) => {
    if (!window.confirm('Delete this maintenance record? This will also remove the linked P&L expense and supplier transaction.')) return
    try {
      if (r.linked_expense_id) {
        try { await supabase.from('supplier_transactions').delete().eq('linked_expense_id', r.linked_expense_id) } catch {}
        try { await expensesService.delete(r.linked_expense_id) } catch {}
      }
      await maintenanceService.delete(r.id)
      await load()
      setAlert({ type: 'success', msg: 'Record, linked expense, and supplier transaction deleted.' })
    } catch (e) { setAlert({ type: 'error', msg: e.message }) }
  }

  const handleReceiptUpload = async (file) => {
    setUploading(true)
    try { setReceiptUrl(await maintenanceService.uploadReceipt(file)) }
    catch (e) { setAlert({ type: 'error', msg: 'Upload failed: ' + e.message }) }
    finally { setUploading(false) }
  }

  const totalCost = records.reduce((s, r) => s + Number(r.cost || 0), 0)
  const overdueNext = records.find(r => r.next_maintenance_date && r.next_maintenance_date < todayStr())

  return (
    <div>
      {alert && <AlertBar msg={alert.msg} type={alert.type} onClose={() => setAlert(null)} />}
      {overdueNext && <AlertBar msg={`Maintenance overdue! Next service was due ${overdueNext.next_maintenance_date} (${overdueNext.maintenance_type})`} type="warning" />}
      <div style={{ ...styles.row, justifyContent: 'space-between', marginBottom: '16px' }}>
        <div>
          <span style={{ fontSize: '13px', color: theme.textMuted }}>Total maintenance cost: </span>
          <strong style={{ color: theme.accent }}>{naira(totalCost)}</strong>
        </div>
        <button style={styles.btn('primary')} onClick={openCreate}>+ Add Maintenance Record</button>
      </div>
      {showForm && (
        <div style={{ ...styles.card, borderLeft: `4px solid ${theme.accent}`, marginBottom: '16px' }}>
          <div style={{ fontWeight: '700', marginBottom: '12px', color: theme.text }}>{editTarget ? 'Edit Maintenance Record' : 'New Maintenance Record'}</div>
          <div style={styles.grid(3)}>
            <div style={styles.formGroup}><label style={styles.label}>Date</label><input style={styles.input} type="date" value={form.maintenance_date} onChange={e => setForm(f => ({ ...f, maintenance_date: e.target.value }))} /></div>
            <div style={styles.formGroup}><label style={styles.label}>Type</label>
              <select style={styles.input} value={form.maintenance_type} onChange={e => setForm(f => ({ ...f, maintenance_type: e.target.value }))}>
                {MAINTENANCE_TYPES.map(t => <option key={t}>{t}</option>)}
              </select></div>
            <div style={styles.formGroup}><label style={styles.label}>Cost (₦)</label><input style={styles.input} type="number" value={form.cost} onChange={e => setForm(f => ({ ...f, cost: e.target.value }))} /></div>
            <div style={{ ...styles.formGroup, gridColumn: 'span 3' }}><label style={styles.label}>Description</label><input style={styles.input} placeholder="What was done?" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Vendor / Supplier</label>
              {suppliers.length > 0 ? (
                <select style={styles.input} value={form.supplierId} onChange={e => {
                  const sup = suppliers.find(s => s.id === e.target.value)
                  setForm(f => ({ ...f, supplierId: e.target.value, vendor_name: sup?.company_name || f.vendor_name }))
                }}>
                  <option value="">— Select supplier or type below —</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.company_name}</option>)}
                </select>
              ) : null}
              {!form.supplierId && <input style={{ ...styles.input, marginTop: suppliers.length > 0 ? '6px' : '0' }} placeholder="Or enter vendor name manually" value={form.vendor_name} onChange={e => setForm(f => ({ ...f, vendor_name: e.target.value }))} />}
            </div>
            <div style={styles.formGroup}><label style={styles.label}>Vendor Phone</label><input style={styles.input} value={form.vendor_phone} onChange={e => setForm(f => ({ ...f, vendor_phone: e.target.value }))} /></div>
            <div style={styles.formGroup}><label style={styles.label}>Downtime (days)</label><input style={styles.input} type="number" value={form.downtime_days} onChange={e => setForm(f => ({ ...f, downtime_days: e.target.value }))} /></div>
            <div style={styles.formGroup}><label style={styles.label}>Next Maintenance Date</label><input style={styles.input} type="date" value={form.next_maintenance_date} onChange={e => setForm(f => ({ ...f, next_maintenance_date: e.target.value }))} /></div>
            <div style={styles.formGroup}><label style={styles.label}>Recorded By</label><input style={styles.input} value={form.recorded_by} onChange={e => setForm(f => ({ ...f, recorded_by: e.target.value }))} /></div>
            <div style={styles.formGroup}><label style={styles.label}>Receipt</label>
              {receiptUrl ? (
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <a href={receiptUrl} target="_blank" rel="noreferrer" style={{ fontSize: '12px', color: theme.blue }}>View Receipt</a>
                  <button style={{ ...styles.btn('danger'), padding: '2px 8px', fontSize: '11px' }} onClick={() => setReceiptUrl('')}>Remove</button>
                </div>
              ) : (
                <label style={{ cursor: 'pointer' }}>
                  <span style={{ ...styles.btn(), display: 'inline-block', cursor: 'pointer', padding: '7px 12px', fontSize: '12px' }}>{uploading ? 'Uploading…' : 'Upload Receipt'}</span>
                  <input type="file" accept=".pdf,.jpg,.jpeg,.png" style={{ display: 'none' }} disabled={uploading} onChange={e => e.target.files[0] && handleReceiptUpload(e.target.files[0])} />
                </label>
              )}
            </div>
            <div style={{ ...styles.formGroup, gridColumn: 'span 2' }}><label style={styles.label}>Notes</label><input style={styles.input} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></div>
          </div>
          {Number(form.cost) > 0 && <div style={{ fontSize: '12px', color: theme.green, marginBottom: '10px' }}>✓ Cost will be logged to P&L{form.supplierId ? ' and recorded as supplier purchase' : ''}</div>}
          <div style={styles.row}>
            <button style={styles.btn('primary')} onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : editTarget ? 'Update Record' : 'Save Record'}</button>
            <button style={styles.btn()} onClick={() => { setShowForm(false); setEditTarget(null) }}>Cancel</button>
          </div>
        </div>
      )}
      {loading ? <Spinner /> : records.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', color: theme.textMuted }}>No maintenance records yet.</div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>{['Date', 'Type', 'Description', 'Cost', 'Vendor', 'Downtime', 'Next Service', ''].map(h => <th key={h} style={styles.th}>{h}</th>)}</tr></thead>
          <tbody>
            {records.map(r => (
              <tr key={r.id}>
                <td style={styles.td}>{r.maintenance_date}</td>
                <td style={styles.td}><span style={styles.badge(theme.blue)}>{r.maintenance_type}</span></td>
                <td style={styles.td}>{r.description || '—'}</td>
                <td style={styles.td}>
                  <strong style={{ color: theme.accent }}>{naira(r.cost)}</strong>
                  {r.linked_expense_id && <div style={{ fontSize: '10px', color: theme.green }}>✓ in P&L</div>}
                </td>
                <td style={styles.td}>{r.vendor_name || '—'}{r.vendor_phone && <div style={{ fontSize: '11px', color: theme.textMuted }}>{r.vendor_phone}</div>}</td>
                <td style={styles.td}>{r.downtime_days ? `${r.downtime_days}d` : '—'}</td>
                <td style={styles.td}>{r.next_maintenance_date ? <span style={{ color: expiryColor(r.next_maintenance_date) }}>{r.next_maintenance_date}</span> : '—'}</td>
                <td style={styles.td}>
                  <div style={styles.row}>
                    {r.receipt_url && <a href={r.receipt_url} target="_blank" rel="noreferrer" style={{ fontSize: '11px', color: theme.blue }}>Receipt</a>}
                    <button style={{ ...styles.btn(), padding: '3px 8px', fontSize: '11px' }} onClick={() => openEdit(r)}>Edit</button>
                    <button style={{ ...styles.btn('danger'), padding: '3px 8px', fontSize: '11px' }} onClick={() => handleDelete(r)}>Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

// ── FUEL LOG TAB ──────────────────────────────────────────────────
const FuelLogTab = ({ vehicleId }) => {
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [alert, setAlert] = useState(null)
  const today = todayStr()
  const emptyForm = { date: today, litres_dispensed: '', cost_per_litre: '', total_cost: '', odometer_reading: '', dispensed_by: '', purpose: 'delivery', notes: '' }
  const [form, setForm] = useState(emptyForm)

  const load = async () => {
    setLoading(true)
    try { setEntries(await fuelLogService.getByVehicle(vehicleId)) }
    catch (e) { setAlert({ type: 'error', msg: e.message }) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [vehicleId])

  const litres = Number(form.litres_dispensed) || 0
  const cpl = Number(form.cost_per_litre) || 0
  const autoTotal = litres * cpl

  const handleSave = async () => {
    if (!form.date || !form.litres_dispensed) return setAlert({ type: 'error', msg: 'Date and litres are required.' })
    setSaving(true)
    try {
      await fuelLogService.create({ ...form, vehicle_id: vehicleId, litres_dispensed: litres, cost_per_litre: cpl, total_cost: autoTotal || (Number(form.total_cost) || 0), odometer_reading: form.odometer_reading ? Number(form.odometer_reading) : null })
      setForm(emptyForm); setShowForm(false)
      setAlert({ type: 'success', msg: 'Fuel entry saved.' })
      await load()
    } catch (e) { setAlert({ type: 'error', msg: e.message }) }
    finally { setSaving(false) }
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this fuel entry?')) return
    try { await fuelLogService.delete(id); await load(); setAlert({ type: 'success', msg: 'Entry deleted.' }) }
    catch (e) { setAlert({ type: 'error', msg: e.message }) }
  }

  const totalFuelCost = entries.reduce((s, e) => s + Number(e.total_cost || 0), 0)
  const totalLitres = entries.reduce((s, e) => s + Number(e.litres_dispensed || 0), 0)

  return (
    <div>
      {alert && <AlertBar msg={alert.msg} type={alert.type} onClose={() => setAlert(null)} />}
      <div style={{ ...styles.row, justifyContent: 'space-between', marginBottom: '16px' }}>
        <div style={styles.row}>
          <span style={{ fontSize: '13px', color: theme.textMuted }}>Total fuel cost: <strong style={{ color: theme.accent }}>{naira(totalFuelCost)}</strong></span>
          <span style={{ fontSize: '13px', color: theme.textMuted }}>Total litres: <strong style={{ color: theme.blue }}>{fmt(totalLitres)} L</strong></span>
        </div>
        <button style={styles.btn('primary')} onClick={() => setShowForm(v => !v)}>+ Add Fuel Entry</button>
      </div>
      {showForm && (
        <div style={{ ...styles.card, borderLeft: `4px solid ${theme.green}`, marginBottom: '16px' }}>
          <div style={styles.grid(3)}>
            <div style={styles.formGroup}><label style={styles.label}>Date</label><input style={styles.input} type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} /></div>
            <div style={styles.formGroup}><label style={styles.label}>Litres Dispensed</label><input style={styles.input} type="number" placeholder="0" value={form.litres_dispensed} onChange={e => setForm(f => ({ ...f, litres_dispensed: e.target.value }))} /></div>
            <div style={styles.formGroup}><label style={styles.label}>Cost per Litre (₦)</label><input style={styles.input} type="number" placeholder="0" value={form.cost_per_litre} onChange={e => setForm(f => ({ ...f, cost_per_litre: e.target.value }))} /></div>
            <div style={styles.formGroup}><label style={styles.label}>Total Cost (₦) {autoTotal > 0 ? <span style={{ color: theme.green }}>= {naira(autoTotal)}</span> : '(auto)'}</label><input style={styles.input} type="number" placeholder="Auto-calculated" value={autoTotal || form.total_cost} readOnly={autoTotal > 0} onChange={e => setForm(f => ({ ...f, total_cost: e.target.value }))} /></div>
            <div style={styles.formGroup}><label style={styles.label}>Odometer (km)</label><input style={styles.input} type="number" value={form.odometer_reading} onChange={e => setForm(f => ({ ...f, odometer_reading: e.target.value }))} /></div>
            <div style={styles.formGroup}><label style={styles.label}>Dispensed By</label><input style={styles.input} value={form.dispensed_by} onChange={e => setForm(f => ({ ...f, dispensed_by: e.target.value }))} /></div>
            <div style={styles.formGroup}><label style={styles.label}>Purpose</label>
              <select style={styles.input} value={form.purpose} onChange={e => setForm(f => ({ ...f, purpose: e.target.value }))}>
                <option value="delivery">Delivery</option>
                <option value="other">Other</option>
              </select></div>
            <div style={{ ...styles.formGroup, gridColumn: 'span 2' }}><label style={styles.label}>Notes</label><input style={styles.input} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></div>
          </div>
          <div style={styles.row}>
            <button style={styles.btn('primary')} onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save Entry'}</button>
            <button style={styles.btn()} onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </div>
      )}
      {loading ? <Spinner /> : entries.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', color: theme.textMuted }}>No fuel entries yet.</div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>{['Date', 'Litres', 'Cost/Litre', 'Total Cost', 'Odometer', 'Dispensed By', 'Purpose', 'Notes', ''].map(h => <th key={h} style={styles.th}>{h}</th>)}</tr></thead>
          <tbody>
            {entries.map(e => (
              <tr key={e.id}>
                <td style={styles.td}>{e.date}</td>
                <td style={styles.td}><strong style={{ color: theme.blue }}>{fmt(e.litres_dispensed)} L</strong></td>
                <td style={styles.td}>{e.cost_per_litre ? naira(e.cost_per_litre) : '—'}</td>
                <td style={styles.td}><strong style={{ color: theme.accent }}>{naira(e.total_cost)}</strong></td>
                <td style={styles.td}>{e.odometer_reading ? `${fmt(e.odometer_reading)} km` : '—'}</td>
                <td style={styles.td}>{e.dispensed_by || '—'}</td>
                <td style={styles.td}><span style={styles.badge(theme.blue)}>{e.purpose}</span></td>
                <td style={styles.td}><span style={{ fontSize: '11px', color: theme.textMuted }}>{e.notes || ''}</span></td>
                <td style={styles.td}><button style={{ ...styles.btn('danger'), padding: '3px 8px', fontSize: '11px' }} onClick={() => handleDelete(e.id)}>Delete</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

// ── DOCUMENTS TAB ─────────────────────────────────────────────────
const DocumentsTab = ({ vehicleId }) => {
  const [docs, setDocs] = useState([])
  const [loading, setLoading] = useState(true)
  const [alert, setAlert] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [docLabel, setDocLabel] = useState(DOC_LABELS[0])
  const [expiry, setExpiry] = useState('')

  const load = async () => {
    setLoading(true)
    try { setDocs(await vehicleDocumentsService.getByVehicle(vehicleId)) }
    catch { setDocs([]) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [vehicleId])

  const handleUpload = async (file) => {
    setUploading(true)
    try {
      await vehicleDocumentsService.upload(vehicleId, file, docLabel, expiry, '')
      setExpiry(''); await load()
      setAlert({ type: 'success', msg: 'Document uploaded.' })
    } catch (e) { setAlert({ type: 'error', msg: e.message }) }
    finally { setUploading(false) }
  }

  const handleDelete = async (doc) => {
    if (!window.confirm(`Delete "${doc.document_label}"?`)) return
    try { await vehicleDocumentsService.delete(doc.id, doc.file_url); await load() }
    catch (e) { setAlert({ type: 'error', msg: e.message }) }
  }

  return (
    <div>
      {alert && <AlertBar msg={alert.msg} type={alert.type} onClose={() => setAlert(null)} />}
      <div style={{ ...styles.card, borderLeft: `4px solid ${theme.blue}`, marginBottom: '16px' }}>
        <div style={styles.sectionTitle}>Upload Document</div>
        <div style={styles.grid(3)}>
          <div style={styles.formGroup}><label style={styles.label}>Document Type</label>
            <select style={styles.input} value={docLabel} onChange={e => setDocLabel(e.target.value)}>
              {DOC_LABELS.map(l => <option key={l}>{l}</option>)}
            </select></div>
          <div style={styles.formGroup}><label style={styles.label}>Expiry Date (if applicable)</label>
            <input style={styles.input} type="date" value={expiry} onChange={e => setExpiry(e.target.value)} /></div>
          <div style={styles.formGroup}><label style={styles.label}>File (PDF / JPG / PNG)</label>
            <label style={{ cursor: 'pointer' }}>
              <span style={{ ...styles.btn(), display: 'inline-block', cursor: 'pointer', padding: '8px 14px', fontSize: '12px' }}>{uploading ? 'Uploading…' : 'Choose File'}</span>
              <input type="file" accept=".pdf,.jpg,.jpeg,.png" style={{ display: 'none' }} disabled={uploading} onChange={e => e.target.files[0] && handleUpload(e.target.files[0])} />
            </label>
          </div>
        </div>
      </div>
      {loading ? <Spinner /> : docs.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', color: theme.textMuted }}>No documents uploaded yet.</div>
      ) : (
        <div>
          {docs.map(d => {
            const expired = d.expiry_date && isExpired(d.expiry_date)
            const expiring = d.expiry_date && isExpiring(d.expiry_date)
            return (
              <div key={d.id} style={{ ...styles.card, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px', borderLeft: `3px solid ${expired ? theme.red : expiring ? theme.accent : theme.border}` }}>
                <div>
                  <div style={{ fontWeight: '700', fontSize: '13px' }}>{d.document_label}</div>
                  <div style={{ fontSize: '11px', color: theme.textMuted, marginTop: '3px' }}>{d.file_name} · Uploaded {d.uploaded_at?.split('T')[0]}</div>
                  {d.expiry_date && <div style={{ fontSize: '11px', color: expiryColor(d.expiry_date), marginTop: '3px' }}>Expires: {d.expiry_date}{expired ? ' — EXPIRED' : expiring ? ` — Expires in ${daysUntil(d.expiry_date)} days` : ''}</div>}
                </div>
                <div style={styles.row}>
                  <a href={d.file_url} target="_blank" rel="noreferrer" style={{ ...styles.btn(), textDecoration: 'none', padding: '6px 12px', fontSize: '12px' }}>View</a>
                  <button style={{ ...styles.btn('danger'), padding: '6px 12px', fontSize: '12px' }} onClick={() => handleDelete(d)}>Delete</button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── VEHICLE PROFILE ───────────────────────────────────────────────
const VehicleProfile = ({ vehicle: initialVehicle, staff, staffMap, onBack, onUpdate }) => {
  const [vehicle, setVehicle] = useState(initialVehicle)
  const [tab, setTab] = useState('details')
  const [editing, setEditing] = useState(false)
  const [deliveries, setDeliveries] = useState([])
  const [delvLoading, setDelvLoading] = useState(false)
  const [alert, setAlert] = useState(null)

  const TABS = [
    { id: 'details', label: 'Details' },
    { id: 'deliveries', label: 'Delivery History' },
    { id: 'damage', label: 'Damage Analysis' },
    { id: 'maintenance', label: 'Maintenance Log' },
    { id: 'fuel', label: 'Fuel Log' },
    { id: 'documents', label: 'Documents' },
  ]

  const [dmgFrom, setDmgFrom] = useState('')
  const [dmgTo, setDmgTo] = useState('')
  const [fleetAvgRate, setFleetAvgRate] = useState(null)

  useEffect(() => {
    if (tab === 'deliveries' || tab === 'damage') loadDeliveries()
  }, [tab])

  useEffect(() => {
    if (tab === 'damage' && fleetAvgRate === null) loadFleetAvg()
  }, [tab])

  const loadDeliveries = async () => {
    setDelvLoading(true)
    try {
      const { data, error } = await supabase
        .from('waybills')
        .select('*, driver:driver_id(full_name)')
        .eq('vehicle_id', vehicle.id)
        .order('waybill_date', { ascending: false })
      if (error) throw error
      setDeliveries(data || [])
    } catch { setDeliveries([]) }
    finally { setDelvLoading(false) }
  }

  const loadFleetAvg = async () => {
    try {
      const { data } = await supabase.from('waybills').select('quantity_loaded, quantity_damaged')
      if (!data || data.length === 0) { setFleetAvgRate(0); return }
      const tl = data.reduce((s, w) => s + (w.quantity_loaded || 0), 0)
      const td = data.reduce((s, w) => s + (w.quantity_damaged || 0), 0)
      setFleetAvgRate(tl > 0 ? (td / tl) * 100 : 0)
    } catch { setFleetAvgRate(0) }
  }

  const handleUpdate = async () => {
    try {
      const updated = await vehiclesService.getById(vehicle.id)
      setVehicle(updated)
      setEditing(false)
      onUpdate()
    } catch {}
  }

  const statusColor = { active: theme.green, inactive: theme.textMuted, maintenance: theme.accent }

  if (editing) {
    return (
      <div style={styles.page}>
        <button style={{ ...styles.btn(), marginBottom: '16px' }} onClick={() => setEditing(false)}>← Back to Profile</button>
        <VehicleForm vehicle={vehicle} staff={staff} onSave={handleUpdate} onCancel={() => setEditing(false)} />
      </div>
    )
  }

  return (
    <div style={styles.page}>
      <div style={{ ...styles.row, marginBottom: '20px' }}>
        <button style={styles.btn()} onClick={onBack}>← All Vehicles</button>
      </div>

      {/* Vehicle Header */}
      <div style={{ ...styles.card, borderLeft: `5px solid ${theme.accent}`, marginBottom: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <div style={{ fontSize: '24px', fontWeight: '800', color: theme.accent, letterSpacing: '0.05em' }}>{vehicle.vehicle_number}</div>
            <div style={{ fontSize: '15px', fontWeight: '600', color: theme.text, marginTop: '4px' }}>{vehicle.vehicle_name || vehicle.vehicle_type}</div>
            <div style={{ fontSize: '12px', color: theme.textMuted, marginTop: '4px' }}>{vehicle.make}{vehicle.model ? ` ${vehicle.model}` : ''}{vehicle.year ? ` · ${vehicle.year}` : ''}{vehicle.color ? ` · ${vehicle.color}` : ''}</div>
            <div style={{ ...styles.row, marginTop: '10px' }}>
              <span style={styles.badge(statusColor[vehicle.status] || theme.textMuted)}>{vehicle.status}</span>
              <span style={styles.badge(theme.blue)}>{vehicle.vehicle_type}</span>
              {vehicle.ownership === 'hired' && <span style={styles.badge(theme.accent)}>Hired</span>}
              {vehicle.capacity_blocks && <span style={{ fontSize: '12px', color: theme.textMuted }}>Capacity: {fmt(vehicle.capacity_blocks)} blocks/trip</span>}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '12px', color: theme.textMuted }}>Assigned Driver</div>
            <div style={{ fontWeight: '700', color: theme.text }}>{staffMap?.[vehicle.assigned_driver_id]?.full_name || '— Not assigned —'}</div>
            <button style={{ ...styles.btn('primary'), marginTop: '10px' }} onClick={() => setEditing(true)}>Edit Vehicle</button>
          </div>
        </div>
        {/* Document Expiry Alerts */}
        <div style={{ ...styles.row, marginTop: '14px', paddingTop: '14px', borderTop: `1px solid ${theme.border}22` }}>
          {vehicle.insurance_expiry_date && (
            <div style={{ fontSize: '12px' }}>
              <span style={{ color: theme.textMuted }}>Insurance: </span>
              <span style={{ color: expiryColor(vehicle.insurance_expiry_date), fontWeight: '600' }}>{vehicle.insurance_expiry_date}{isExpired(vehicle.insurance_expiry_date) ? ' — EXPIRED' : isExpiring(vehicle.insurance_expiry_date) ? ` (${daysUntil(vehicle.insurance_expiry_date)}d)` : ''}</span>
            </div>
          )}
          {vehicle.road_worthiness_expiry_date && (
            <div style={{ fontSize: '12px' }}>
              <span style={{ color: theme.textMuted }}>Road Worthiness: </span>
              <span style={{ color: expiryColor(vehicle.road_worthiness_expiry_date), fontWeight: '600' }}>{vehicle.road_worthiness_expiry_date}{isExpired(vehicle.road_worthiness_expiry_date) ? ' — EXPIRED' : isExpiring(vehicle.road_worthiness_expiry_date) ? ` (${daysUntil(vehicle.road_worthiness_expiry_date)}d)` : ''}</span>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ ...styles.row, marginBottom: '20px', borderBottom: `1px solid ${theme.border}`, paddingBottom: '8px' }}>
        {TABS.map(t => <button key={t.id} style={styles.tab(tab === t.id)} onClick={() => setTab(t.id)}>{t.label}</button>)}
      </div>

      {/* Tab Content */}
      {tab === 'details' && (
        <div style={styles.grid(2)}>
          {[
            ['Plate Number', vehicle.vehicle_number],
            ['Vehicle Name', vehicle.vehicle_name || '—'],
            ['Type', vehicle.vehicle_type],
            ['Make', vehicle.make || '—'],
            ['Model', vehicle.model || '—'],
            ['Year', vehicle.year || '—'],
            ['Color', vehicle.color || '—'],
            ['Capacity', vehicle.capacity_blocks ? `${fmt(vehicle.capacity_blocks)} blocks/trip` : '—'],
            ['Ownership', vehicle.ownership === 'company_owned' ? 'Company Owned' : 'Hired'],
            ['Status', vehicle.status],
            ['Assigned Driver', staffMap?.[vehicle.assigned_driver_id]?.full_name || '—'],
            ['Purchase Date', vehicle.purchase_date || '—'],
            ['Purchase Price', vehicle.purchase_price ? naira(vehicle.purchase_price) : '—'],
            ['Insurance Expiry', vehicle.insurance_expiry_date || '—'],
            ['Road Worthiness Expiry', vehicle.road_worthiness_expiry_date || '—'],
          ].map(([label, val]) => (
            <div key={label} style={{ padding: '12px 0', borderBottom: `1px solid ${theme.border}22`, display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '12px', color: theme.textMuted }}>{label}</span>
              <span style={{ fontSize: '13px', fontWeight: '600' }}>{val}</span>
            </div>
          ))}
          {vehicle.notes && <div style={{ gridColumn: 'span 2', padding: '12px', background: theme.surface, borderRadius: '6px', fontSize: '13px', color: theme.textMuted }}>{vehicle.notes}</div>}
        </div>
      )}

      {tab === 'deliveries' && (
        <div>
          {delvLoading ? <Spinner /> : deliveries.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px', color: theme.textMuted }}>No delivery records found for this vehicle.</div>
          ) : (
            <>
              <div style={{ ...styles.row, marginBottom: '14px', fontSize: '13px', color: theme.textMuted }}>
                <span>Total trips: <strong style={{ color: theme.text }}>{deliveries.length}</strong></span>
                <span>Total loaded: <strong style={{ color: theme.accent }}>{fmt(deliveries.reduce((s, d) => s + (d.quantity_loaded || 0), 0))} blocks</strong></span>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>{['Date', 'Waybill No', 'Customer', 'Block Type', 'Loaded', 'Received', 'Driver'].map(h => <th key={h} style={styles.th}>{h}</th>)}</tr></thead>
                <tbody>
                  {deliveries.map(d => (
                    <tr key={d.id}>
                      <td style={styles.td}>{d.waybill_date}</td>
                      <td style={styles.td}><span style={{ color: theme.accent, fontWeight: '600' }}>{d.waybill_number}</span></td>
                      <td style={styles.td}>{d.receiver_name || '—'}</td>
                      <td style={styles.td}><span style={styles.badge(theme.blue)}>{d.block_type}</span></td>
                      <td style={styles.td}>{fmt(d.quantity_loaded)}</td>
                      <td style={styles.td}><strong style={{ color: theme.green }}>{fmt(d.quantity_received)}</strong></td>
                      <td style={styles.td}>{d.driver?.full_name || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      )}

      {tab === 'damage' && (() => {
        const filtered = deliveries.filter(d => {
          if (dmgFrom && d.waybill_date < dmgFrom) return false
          if (dmgTo && d.waybill_date > dmgTo) return false
          return true
        })
        const tLoaded = filtered.reduce((s, d) => s + (d.quantity_loaded || 0), 0)
        const tDamaged = filtered.reduce((s, d) => s + (d.quantity_damaged || 0), 0)
        const rate = tLoaded > 0 ? (tDamaged / tLoaded) * 100 : 0
        const aboveAvg = fleetAvgRate !== null && rate > fleetAvgRate
        const damagedTrips = filtered.filter(d => d.quantity_damaged > 0)
        return (
          <div>
            {delvLoading ? <Spinner /> : (
              <>
                <div style={{ ...styles.row, marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
                  <div style={styles.formGroup}>
                    <label style={styles.label}>From</label>
                    <input style={{ ...styles.input, width: '150px' }} type="date" value={dmgFrom} onChange={e => setDmgFrom(e.target.value)} />
                  </div>
                  <div style={styles.formGroup}>
                    <label style={styles.label}>To</label>
                    <input style={{ ...styles.input, width: '150px' }} type="date" value={dmgTo} onChange={e => setDmgTo(e.target.value)} />
                  </div>
                  {(dmgFrom || dmgTo) && <button style={{ ...styles.btn(), alignSelf: 'flex-end', marginBottom: '14px' }} onClick={() => { setDmgFrom(''); setDmgTo('') }}>Clear</button>}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '20px' }}>
                  {[
                    { label: 'Total Trips', value: filtered.length, color: theme.blue },
                    { label: 'Blocks Loaded', value: fmt(tLoaded), color: theme.accent },
                    { label: 'Blocks Damaged', value: fmt(tDamaged), color: theme.red },
                    { label: 'Damage Rate', value: `${rate.toFixed(2)}%`, color: aboveAvg ? theme.red : theme.green },
                  ].map(({ label, value, color }) => (
                    <div key={label} style={{ background: theme.surface, borderRadius: '8px', padding: '14px', borderTop: `3px solid ${color}` }}>
                      <div style={{ fontSize: '11px', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
                      <div style={{ fontSize: '22px', fontWeight: '700', color, marginTop: '6px' }}>{value}</div>
                    </div>
                  ))}
                </div>
                {fleetAvgRate !== null && (
                  <div style={{ padding: '12px 16px', borderRadius: '8px', marginBottom: '16px', background: aboveAvg ? theme.red + '15' : theme.green + '15', border: `1px solid ${aboveAvg ? theme.red : theme.green}44` }}>
                    <span style={{ fontSize: '13px', color: aboveAvg ? theme.red : theme.green, fontWeight: '600' }}>
                      {aboveAvg ? '⚠ Above fleet average' : '✓ Below fleet average'}: fleet avg is {fleetAvgRate.toFixed(2)}%, this vehicle is {rate.toFixed(2)}%
                    </span>
                  </div>
                )}
                {damagedTrips.length > 0 ? (
                  <>
                    <div style={styles.sectionTitle}>Trips with Transit Damage</div>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead><tr>{['Date', 'Waybill', 'Customer', 'Block Type', 'Loaded', 'Damaged', 'Rate'].map(h => <th key={h} style={styles.th}>{h}</th>)}</tr></thead>
                      <tbody>
                        {damagedTrips.map(d => {
                          const r = d.quantity_loaded > 0 ? (d.quantity_damaged / d.quantity_loaded * 100).toFixed(1) : '0.0'
                          return (
                            <tr key={d.id}>
                              <td style={styles.td}>{d.waybill_date}</td>
                              <td style={styles.td}><span style={{ color: theme.accent, fontWeight: '600' }}>{d.waybill_number}</span></td>
                              <td style={styles.td}>{d.receiver_name || '—'}</td>
                              <td style={styles.td}><span style={styles.badge(theme.blue)}>{d.block_type}</span></td>
                              <td style={styles.td}>{fmt(d.quantity_loaded)}</td>
                              <td style={styles.td}><strong style={{ color: theme.red }}>{fmt(d.quantity_damaged)}</strong></td>
                              <td style={styles.td}><span style={{ color: Number(r) > 5 ? theme.red : theme.accent }}>{r}%</span></td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </>
                ) : (
                  <div style={{ textAlign: 'center', padding: '32px', color: theme.textMuted }}>No transit damage recorded{(dmgFrom || dmgTo) ? ' in this period.' : '.'}</div>
                )}
              </>
            )}
          </div>
        )
      })()}
      {tab === 'maintenance' && <MaintenanceTab vehicleId={vehicle.id} vehicleNumber={vehicle.vehicle_number} vehicleName={vehicle.vehicle_name} />}
      {tab === 'fuel' && <FuelLogTab vehicleId={vehicle.id} />}
      {tab === 'documents' && <DocumentsTab vehicleId={vehicle.id} />}
    </div>
  )
}

// ── VEHICLE REGISTRY (MAIN) ───────────────────────────────────────
const VehicleRegistry = () => {
  const [vehicles, setVehicles] = useState([])
  const [staff, setStaff] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedVehicle, setSelectedVehicle] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [alert, setAlert] = useState(null)

  const load = async () => {
    setLoading(true)
    try {
      const [v, s] = await Promise.all([vehiclesService.getAll(), staffService.getPublicList()])
      setVehicles(v)
      setStaff(s)
    } catch (e) { setAlert({ type: 'error', msg: 'Could not load vehicles: ' + e.message }) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const staffMap = Object.fromEntries(staff.map(s => [s.id, s]))

  if (selectedVehicle) {
    return <VehicleProfile vehicle={selectedVehicle} staff={staff} staffMap={staffMap} onBack={() => setSelectedVehicle(null)} onUpdate={load} />
  }

  const today = todayStr()
  const total = vehicles.length
  const active = vehicles.filter(v => v.status === 'active').length
  const inMaintenance = vehicles.filter(v => v.status === 'maintenance').length
  const expiring = vehicles.filter(v =>
    (v.insurance_expiry_date && v.insurance_expiry_date <= new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0]) ||
    (v.road_worthiness_expiry_date && v.road_worthiness_expiry_date <= new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0])
  ).length

  const filtered = vehicles.filter(v => {
    if (filterStatus && v.status !== filterStatus) return false
    if (search) {
      const q = search.toLowerCase()
      return (v.vehicle_number || '').toLowerCase().includes(q) || (v.vehicle_name || '').toLowerCase().includes(q) || (v.make || '').toLowerCase().includes(q)
    }
    return true
  })

  const statusColor = { active: theme.green, inactive: theme.textMuted, maintenance: theme.accent }

  return (
    <div style={styles.page}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <div style={{ fontSize: '20px', fontWeight: '800', color: theme.text }}>Vehicle Registry</div>
          <div style={{ fontSize: '13px', color: theme.textMuted, marginTop: '3px' }}>Fleet management, maintenance tracking, and fuel logs</div>
        </div>
        <button style={styles.btn('primary')} onClick={() => setShowForm(v => !v)}>+ Register Vehicle</button>
      </div>

      {alert && <AlertBar msg={alert.msg} type={alert.type} onClose={() => setAlert(null)} />}

      {/* Summary Cards */}
      <div style={{ ...styles.grid(4), marginBottom: '24px' }}>
        <StatCard label="Total Vehicles" value={total} color={theme.blue} />
        <StatCard label="Active" value={active} color={theme.green} />
        <StatCard label="In Maintenance" value={inMaintenance} color={theme.accent} />
        <StatCard label="Docs Expiring (30d)" value={expiring} color={expiring > 0 ? theme.red : theme.textMuted} />
      </div>

      {/* Add Form */}
      {showForm && (
        <VehicleForm staff={staff} onSave={async () => { setShowForm(false); await load(); setAlert({ type: 'success', msg: 'Vehicle registered.' }) }} onCancel={() => setShowForm(false)} />
      )}

      {/* Filters */}
      <div style={{ ...styles.row, marginBottom: '16px' }}>
        <input style={{ ...styles.input, width: '240px' }} placeholder="Search plate, name, make…" value={search} onChange={e => setSearch(e.target.value)} />
        <select style={{ ...styles.input, width: '160px' }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="maintenance">In Maintenance</option>
        </select>
        {(search || filterStatus) && <button style={styles.btn()} onClick={() => { setSearch(''); setFilterStatus('') }}>Clear</button>}
      </div>

      {/* Vehicle Cards */}
      {loading ? <Spinner /> : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px', color: theme.textMuted }}>
          {vehicles.length === 0 ? 'No vehicles registered yet. Click "+ Register Vehicle" to add your first vehicle.' : 'No vehicles match your filters.'}
        </div>
      ) : (
        <div style={styles.grid(2)}>
          {filtered.map(v => {
            const insExpired = v.insurance_expiry_date && isExpired(v.insurance_expiry_date)
            const insExpiring = v.insurance_expiry_date && isExpiring(v.insurance_expiry_date)
            const rwExpired = v.road_worthiness_expiry_date && isExpired(v.road_worthiness_expiry_date)
            const rwExpiring = v.road_worthiness_expiry_date && isExpiring(v.road_worthiness_expiry_date)
            const hasDocAlert = insExpired || insExpiring || rwExpired || rwExpiring
            return (
              <div key={v.id}
                style={{ ...styles.card, cursor: 'pointer', borderLeft: `4px solid ${hasDocAlert ? theme.red : statusColor[v.status] || theme.border}`, marginBottom: 0, transition: 'border-color 0.2s' }}
                onClick={() => setSelectedVehicle(v)}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontSize: '20px', fontWeight: '800', color: theme.accent, letterSpacing: '0.05em' }}>{v.vehicle_number}</div>
                    <div style={{ fontSize: '13px', fontWeight: '600', color: theme.text }}>{v.vehicle_name || v.vehicle_type}</div>
                    <div style={{ fontSize: '11px', color: theme.textMuted, marginTop: '2px' }}>{v.make}{v.model ? ` ${v.model}` : ''}{v.color ? ` · ${v.color}` : ''}</div>
                  </div>
                  <span style={styles.badge(statusColor[v.status] || theme.textMuted)}>{v.status}</span>
                </div>
                <div style={{ ...styles.row, marginTop: '12px', fontSize: '12px', gap: '14px' }}>
                  <span style={{ color: theme.textMuted }}>👤 {staffMap[v.assigned_driver_id]?.full_name || '— No driver —'}</span>
                  {v.capacity_blocks && <span style={{ color: theme.textMuted }}>📦 {fmt(v.capacity_blocks)} blocks/trip</span>}
                </div>
                {(insExpired || insExpiring || rwExpired || rwExpiring) && (
                  <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: `1px solid ${theme.border}22` }}>
                    {(insExpired || insExpiring) && (
                      <div style={{ fontSize: '11px', color: insExpired ? theme.red : theme.accent }}>
                        {insExpired ? '⚠ Insurance EXPIRED' : `⚠ Insurance expiring in ${daysUntil(v.insurance_expiry_date)} days`}
                      </div>
                    )}
                    {(rwExpired || rwExpiring) && (
                      <div style={{ fontSize: '11px', color: rwExpired ? theme.red : theme.accent }}>
                        {rwExpired ? '⚠ Road Worthiness EXPIRED' : `⚠ Road Worthiness expiring in ${daysUntil(v.road_worthiness_expiry_date)} days`}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default VehicleRegistry
