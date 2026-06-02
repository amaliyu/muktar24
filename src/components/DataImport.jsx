import React, { useState, useEffect, useCallback } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '../lib/supabase'

const theme = {
  bg: '#0f1117', surface: '#1a1d27', card: '#21263a', border: '#2e3452',
  accent: '#f5a623', green: '#2dd4a0', red: '#f06b6b', blue: '#5b8dee',
  text: '#e8eaf0', textMuted: '#7c839e',
}

const naira = (n) => `₦${Math.round(Number(n) || 0).toLocaleString()}`

const styles = {
  page: { padding: '24px 28px', color: theme.text },
  card: { background: theme.card, border: `1px solid ${theme.border}`, borderRadius: '10px', padding: '20px', marginBottom: '16px' },
  label: { display: 'block', fontSize: '11px', fontWeight: '700', color: theme.textMuted, marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.06em' },
  input: { width: '100%', padding: '9px 12px', background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: '6px', color: theme.text, fontSize: '13px', boxSizing: 'border-box' },
  btn: (v = 'primary') => ({
    padding: '9px 18px', borderRadius: '7px', fontWeight: '600', fontSize: '13px', cursor: 'pointer',
    border: `1px solid ${v === 'danger' ? theme.red : v === 'success' ? theme.green : v === 'primary' ? theme.accent : v === 'blue' ? theme.blue : theme.border}`,
    background: v === 'primary' ? theme.accent : v === 'danger' ? '#3d1515' : v === 'success' ? '#0d3028' : v === 'blue' ? '#1a2a4a' : theme.surface,
    color: v === 'primary' ? '#1a0e00' : v === 'danger' ? theme.red : v === 'success' ? theme.green : v === 'blue' ? theme.blue : theme.text,
  }),
  th: { padding: '8px 10px', textAlign: 'left', fontSize: '11px', fontWeight: '700', color: theme.textMuted, textTransform: 'uppercase', borderBottom: `1px solid ${theme.border}` },
  td: { padding: '8px 10px', fontSize: '12px', borderBottom: `1px solid ${theme.border}22` },
  badge: (color) => ({ display: 'inline-block', padding: '2px 7px', borderRadius: '4px', fontSize: '10px', fontWeight: '700', background: color + '22', color, border: `1px solid ${color}44` }),
  tab: (active) => ({ padding: '8px 18px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: active ? '700' : '400', background: active ? theme.accent + '22' : 'transparent', color: active ? theme.accent : theme.textMuted }),
}

const BLOCK_TYPE_MAP = {
  '6 Inch': '6 Inch Block', '6-inch': '6 Inch Block', '6 inch': '6 Inch Block', '6inch': '6 Inch Block',
  '9 Inch': '9 Inch 3 Hole Block', '9-inch': '9 Inch 3 Hole Block', '9 inch': '9 Inch 3 Hole Block', '9inch': '9 Inch 3 Hole Block',
  '9 inches Block': '9 Inch 3 Hole Block', '9 Inches Block': '9 Inch 3 Hole Block',
  'Interlock': 'Standard Interlock', 'interlock': 'Standard Interlock',
  '4 Inch': '4 Inch Block', '4-inch': '4 Inch Block', '4 inch': '4 Inch Block',
}
const sanitizeBlockType = (bt) => {
  if (!bt) return bt
  const trimmed = String(bt).trim()
  return BLOCK_TYPE_MAP[trimmed] || trimmed
}

function parseExcelDate(val) {
  if (!val) return null
  if (typeof val === 'number') {
    const d = XLSX.SSF.parse_date_code(val)
    if (!d) return null
    return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`
  }
  const s = String(val).trim()
  const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/)
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`
  const ymd = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (ymd) return s.substring(0, 10)
  return null
}

const AlertBar = ({ msg, type = 'error', onClose }) => (
  <div style={{ padding: '12px 16px', borderRadius: '8px', marginBottom: '14px', background: type === 'success' ? theme.green + '22' : type === 'warning' ? theme.accent + '22' : theme.red + '22', color: type === 'success' ? theme.green : type === 'warning' ? theme.accent : theme.red, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px' }}>
  <span>{msg}</span>
  {onClose && <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: '18px' }}>×</button>}
</div>
)

const Steps = ({ current, steps }) => (
  <div style={{ display: 'flex', marginBottom: '28px', alignItems: 'center' }}>
    {steps.map((s, i) => (
      <React.Fragment key={i}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
          <div style={{ width: '28px', height: '28px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: '700', background: i < current ? theme.green : i === current ? theme.accent : theme.surface, color: i < current ? '#0d3028' : i === current ? '#1a0e00' : theme.textMuted, border: `2px solid ${i < current ? theme.green : i === current ? theme.accent : theme.border}` }}>
            {i < current ? '✓' : i + 1}
          </div>
          <div style={{ fontSize: '10px', color: i === current ? theme.accent : i < current ? theme.green : theme.textMuted, marginTop: '4px', textAlign: 'center', fontWeight: i === current ? '700' : '400' }}>{s}</div>
        </div>
        {i < steps.length - 1 && <div style={{ flex: 1, height: '2px', background: i < current ? theme.green : theme.border, maxWidth: '36px' }} />}
      </React.Fragment>
    ))}
  </div>
)

// ── IMPORT TYPE DEFINITIONS ───────────────────────────────────────────────────

const IMPORT_TYPES = [
  {
    id: 'loading_log',
    label: 'Loading Log',
    icon: '🚛',
    description: 'Historical truck loading records with waybill numbers, quantities and amounts',
    fields: {
      date: 'Date', customer_name: 'Customer Name', plate_number: 'Plate Number',
      block_type: 'Block Type', qty_loaded: 'Qty Loaded', qty_received: 'Qty Received',
      broken: 'Broken Blocks', amount: 'Amount', waybill_no: 'Waybill No', reference_no: 'Ref No',
    },
    requiredFields: ['date', 'customer_name', 'waybill_no'],
    getLookups: async () => {
      const [{ data: customers }, { data: vehicles }] = await Promise.all([
        supabase.from('customers').select('id, name'),
        supabase.from('vehicles').select('id, vehicle_number'),
      ])
      return { customers: customers || [], vehicles: vehicles || [] }
    },
    validate: (mapped, lookups) => {
      const errors = [], warnings = []
      if (!mapped.date) errors.push('Invalid date')
      if (!mapped.customer_name) errors.push('Missing customer name')
      else {
        const c = lookups.customers?.find(c => c.name?.toLowerCase() === mapped.customer_name.toLowerCase())
        if (!c) warnings.push(`Customer "${mapped.customer_name}" not found in system — will be stored as text`)
      }
      if (!mapped.waybill_no) errors.push('Missing waybill number')
      if (!mapped.qty_loaded) warnings.push('No quantity loaded specified')
      return { errors, warnings }
    },
    buildInsert: (mapped, lookups) => {
      const customer = lookups.customers?.find(c => c.name?.toLowerCase() === mapped.customer_name?.toLowerCase())
      const vehicle = mapped.plate_number ? lookups.vehicles?.find(v => v.vehicle_number?.toUpperCase() === mapped.plate_number?.toUpperCase()) : null
      return {
        date: mapped.date, customer_name: mapped.customer_name, customer_id: customer?.id || null,
        vehicle_id: vehicle?.id || null, plate_number: mapped.plate_number || null,
        block_type: sanitizeBlockType(mapped.block_type), blocks_loaded: Number(mapped.qty_loaded) || 0,
        quantity_received: Number(mapped.qty_received) || 0, quantity_damaged: Number(mapped.broken) || 0,
        total_amount: Number(mapped.amount) || 0, physical_waybill_number: mapped.waybill_no,
        reference_number: mapped.reference_no || null, payment_status: 'unpaid', payment_week_ending: mapped.date,
      }
    },
    mergeTable: 'truck_loading_log',
  },
  {
    id: 'payroll',
    label: 'Weekly Labour Payroll',
    icon: '📋',
    description: 'Weekly payroll sheets with worker names, daily attendance and pay breakdown',
    fields: {
      name: 'Worker Name', week_ending: 'Week Ending',
      mon: 'MON', tue: 'TUE', wed: 'WED', thu: 'THU', fri: 'FRI', sat: 'SAT',
      gross_pay: 'Gross Pay', bonus: 'Bonus', advance: 'Advance', deduction: 'Deduction', net_pay: 'Net Pay',
    },
    requiredFields: ['name'],
    getLookups: async () => {
      const { data: pool } = await supabase.from('labour_pool').select('id, full_name')
      return { pool: pool || [] }
    },
    validate: (mapped, lookups) => {
      const errors = [], warnings = []
      if (!mapped.name) errors.push('Missing worker name')
      else {
        const match = lookups.pool?.find(w => w.full_name?.toLowerCase() === mapped.name.toLowerCase() ||
          w.full_name?.toLowerCase().includes(mapped.name.toLowerCase()))
        if (!match) warnings.push(`Worker "${mapped.name}" not found in Labour Pool`)
      }
      return { errors, warnings }
    },
    buildInsert: (mapped, lookups) => {
      const worker = lookups.pool?.find(w => w.full_name?.toLowerCase() === mapped.name?.toLowerCase() ||
        w.full_name?.toLowerCase().includes(mapped.name?.toLowerCase()))
      return {
        worker_name: mapped.name, labour_pool_id: worker?.id || null,
        week_ending: mapped.week_ending || null,
        gross_pay: Number(mapped.gross_pay) || 0, bonus_amount: Number(mapped.bonus) || 0,
        advance_amount: Number(mapped.advance) || 0, deduction_amount: Number(mapped.deduction) || 0,
        net_pay: Number(mapped.net_pay) || 0,
      }
    },
    mergeTable: 'historical_payroll_import',
  },
  {
    id: 'production',
    label: 'Production Log',
    icon: '🏭',
    description: 'Daily production records by block type, shift and quantity produced',
    fields: {
      date: 'Date', block_type: 'Block Type', quantity: 'Quantity Produced', shift: 'Shift', notes: 'Notes',
    },
    requiredFields: ['date', 'block_type', 'quantity'],
    getLookups: async () => ({ }),
    validate: (mapped) => {
      const errors = [], warnings = []
      if (!mapped.date) errors.push('Invalid date')
      if (!mapped.block_type) errors.push('Missing block type')
      if (!mapped.quantity || isNaN(Number(mapped.quantity))) errors.push('Invalid quantity')
      return { errors, warnings }
    },
    buildInsert: (mapped) => ({
      production_date: mapped.date, block_type: sanitizeBlockType(mapped.block_type),
      quantity_produced: Number(mapped.quantity) || 0, shift: mapped.shift || null, notes: mapped.notes || null,
    }),
    mergeTable: 'production_log',
  },
  {
    id: 'waybills',
    label: 'Waybill Delivery Records',
    icon: '📦',
    description: 'Delivery records including loaded, received and damage quantities',
    fields: {
      date: 'Date', waybill_no: 'Waybill No', customer_name: 'Customer Name', plate_number: 'Plate Number',
      block_type: 'Block Type', qty_loaded: 'Qty Loaded', qty_received: 'Qty Received', qty_damaged: 'Qty Damaged', amount: 'Amount',
    },
    requiredFields: ['date', 'waybill_no'],
    getLookups: async () => {
      const [{ data: customers }, { data: vehicles }] = await Promise.all([
        supabase.from('customers').select('id, name'),
        supabase.from('vehicles').select('id, vehicle_number'),
      ])
      return { customers: customers || [], vehicles: vehicles || [] }
    },
    validate: (mapped, lookups) => {
      const errors = [], warnings = []
      if (!mapped.date) errors.push('Invalid date')
      if (!mapped.waybill_no) errors.push('Missing waybill number')
      if (mapped.customer_name) {
        const c = lookups.customers?.find(c => c.name?.toLowerCase() === mapped.customer_name.toLowerCase())
        if (!c) warnings.push(`Customer "${mapped.customer_name}" not found — will import without customer link`)
      }
      return { errors, warnings }
    },
    buildInsert: (mapped, lookups) => {
      const customer = lookups.customers?.find(c => c.name?.toLowerCase() === mapped.customer_name?.toLowerCase())
      const vehicle = mapped.plate_number ? lookups.vehicles?.find(v => v.vehicle_number?.toUpperCase() === mapped.plate_number?.toUpperCase()) : null
      return {
        waybill_date: mapped.date, waybill_number: mapped.waybill_no, customer_id: customer?.id || null,
        customer_name: mapped.customer_name || null, vehicle_id: vehicle?.id || null,
        plate_number: mapped.plate_number || null, block_type: sanitizeBlockType(mapped.block_type),
        quantity_loaded: Number(mapped.qty_loaded) || 0, quantity_received: Number(mapped.qty_received) || 0,
        quantity_damaged: Number(mapped.qty_damaged) || 0, amount: Number(mapped.amount) || 0,
        status: 'delivered',
      }
    },
    mergeTable: 'waybills',
  },
  {
    id: 'payments',
    label: 'Customer Payments',
    icon: '💰',
    description: 'Historical customer payment records with amounts and references',
    fields: {
      date: 'Date', customer_name: 'Customer Name', invoice_no: 'Invoice No',
      amount_paid: 'Amount Paid', payment_method: 'Payment Method', reference: 'Reference No',
    },
    requiredFields: ['date', 'customer_name', 'amount_paid'],
    getLookups: async () => {
      const { data: customers } = await supabase.from('customers').select('id, name')
      return { customers: customers || [] }
    },
    validate: (mapped, lookups) => {
      const errors = [], warnings = []
      if (!mapped.date) errors.push('Invalid date')
      if (!mapped.customer_name) errors.push('Missing customer name')
      else {
        const c = lookups.customers?.find(c => c.name?.toLowerCase() === mapped.customer_name.toLowerCase())
        if (!c) warnings.push(`Customer "${mapped.customer_name}" not found`)
      }
      if (!mapped.amount_paid || isNaN(Number(mapped.amount_paid))) errors.push('Invalid amount')
      return { errors, warnings }
    },
    buildInsert: (mapped, lookups) => {
      const customer = lookups.customers?.find(c => c.name?.toLowerCase() === mapped.customer_name?.toLowerCase())
      return {
        payment_date: mapped.date, customer_id: customer?.id || null, customer_name: mapped.customer_name,
        invoice_reference: mapped.invoice_no || null, amount_paid: Number(mapped.amount_paid) || 0,
        payment_method: mapped.payment_method || 'bank_transfer', reference_number: mapped.reference || null,
        status: 'confirmed',
      }
    },
    mergeTable: 'historical_payments_import',
  },
  {
    id: 'inventory',
    label: 'Inventory Stock Movements',
    icon: '📦',
    description: 'Stock movements in and out of inventory with item names and quantities',
    fields: {
      date: 'Date', item_name: 'Item Name', movement_type: 'Type (in/out)', quantity: 'Quantity', notes: 'Notes',
    },
    requiredFields: ['date', 'item_name', 'quantity'],
    getLookups: async () => ({ }),
    validate: (mapped) => {
      const errors = [], warnings = []
      if (!mapped.date) errors.push('Invalid date')
      if (!mapped.item_name) errors.push('Missing item name')
      if (!mapped.quantity || isNaN(Number(mapped.quantity))) errors.push('Invalid quantity')
      const type = String(mapped.movement_type || '').toLowerCase()
      if (mapped.movement_type && !['in', 'out', 'adjustment'].includes(type)) warnings.push(`Movement type "${mapped.movement_type}" — expected in/out/adjustment`)
      return { errors, warnings }
    },
    buildInsert: (mapped) => ({
      log_date: mapped.date, item_name: mapped.item_name,
      movement_type: mapped.movement_type || 'in', quantity: Number(mapped.quantity) || 0,
      notes: mapped.notes || null,
    }),
    mergeTable: 'inventory_log',
  },
  {
    id: 'expenses',
    label: 'Expenses',
    icon: '💸',
    description: 'Historical expense records with category, amount and vendor details',
    fields: {
      date: 'Date', category: 'Category', description: 'Description',
      amount: 'Amount', vendor: 'Vendor', reference: 'Reference',
    },
    requiredFields: ['date', 'amount'],
    getLookups: async () => ({ }),
    validate: (mapped) => {
      const errors = [], warnings = []
      if (!mapped.date) errors.push('Invalid date')
      if (!mapped.amount || isNaN(Number(mapped.amount))) errors.push('Invalid amount')
      if (!mapped.category) warnings.push('No category — will use "Uncategorized"')
      if (!mapped.description) warnings.push('No description provided')
      return { errors, warnings }
    },
    buildInsert: (mapped) => ({
      expense_date: mapped.date, description: mapped.description || mapped.category || 'Historical import',
      amount: Number(mapped.amount) || 0, vendor: mapped.vendor || null,
      reference_number: mapped.reference || null, status: 'approved',
      category_name: mapped.category || 'Uncategorized',
    }),
    mergeTable: 'expenses',
  },
]

// ── STATUS HELPERS ────────────────────────────────────────────────────────────

const STATUS_COLORS = { draft: theme.textMuted, reviewing: theme.blue, confirmed: theme.accent, merged: theme.green, locked: theme.green }
const statusColor = (s) => STATUS_COLORS[s] || theme.textMuted

// ── IMPORT WIZARD ─────────────────────────────────────────────────────────────

function ImportWizard({ typeConfig, onBack }) {
  const STEP_LABELS = ['Upload', 'Map Columns', 'Validate', 'Review Flagged', 'Confirm & Stage', 'Merge & Done']
  const [step, setStep] = useState(0)
  const [rawRows, setRawRows] = useState([])
  const [headers, setHeaders] = useState([])
  const [colMap, setColMap] = useState({})
  const [period, setPeriod] = useState({ month: new Date().getMonth() + 1, year: new Date().getFullYear() })
  const [validated, setValidated] = useState([])
  const [lookups, setLookups] = useState({})
  const [batchId, setBatchId] = useState(null)
  const [working, setWorking] = useState(false)
  const [alert, setAlert] = useState(null)
  const [mergeResult, setMergeResult] = useState(null)

  const handleFile = async (file) => {
    setAlert(null)
    try {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array', cellDates: false })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
      if (data.length < 2) return setAlert({ msg: 'File appears empty or has only headers', type: 'error' })
      const hdrs = data[0].map(h => String(h).trim())
      const dataRows = data.slice(1).filter(r => r.some(c => c !== ''))
      setHeaders(hdrs)
      setRawRows(dataRows)
      // Auto-detect column mapping
      const map = {}
      Object.entries(typeConfig.fields).forEach(([field, label]) => {
        const labelUpper = label.toUpperCase()
        const idx = hdrs.findIndex(h => {
          const hu = h.toUpperCase()
          return hu === labelUpper || hu.includes(labelUpper) || labelUpper.includes(hu)
        })
        if (idx >= 0) map[field] = idx
      })
      setColMap(map)
      setStep(1)
    } catch (e) {
      setAlert({ msg: 'Could not read file: ' + (e?.message || 'unknown error'), type: 'error' })
    }
  }

  const handleValidate = async () => {
    setWorking(true)
    setAlert(null)
    try {
      const lu = await typeConfig.getLookups()
      setLookups(lu)
      const get = (row, key) => colMap[key] != null ? row[colMap[key]] : ''
      const vRows = rawRows.map((row, idx) => {
        const mapped = {}
        Object.keys(typeConfig.fields).forEach(field => {
          let val = get(row, field)
          if (field === 'date' || field === 'week_ending') val = parseExcelDate(val)
          else val = val === '' || val == null ? '' : String(val).trim()
          mapped[field] = val
        })
        const { errors, warnings } = typeConfig.validate(mapped, lu)
        return { idx, mapped, errors, warnings, skip: errors.length > 0 }
      })
      setValidated(vRows)
      setStep(2)
    } catch (e) {
      setAlert({ msg: 'Validation error: ' + (e?.message || 'unknown'), type: 'error' })
    }
    setWorking(false)
  }

  const toggleSkip = (idx) => setValidated(v => v.map((r, i) => i === idx ? { ...r, skip: !r.skip } : r))

  const handleStage = async () => {
    setWorking(true)
    setAlert(null)
    const readyRows = validated.filter(r => !r.skip)
    const errorRows = validated.filter(r => !r.skip && r.errors.length > 0)
    const warnRows = validated.filter(r => !r.skip && r.warnings.length > 0 && r.errors.length === 0)
    try {
      const batchPayload = {
        import_type: typeConfig.id, period_month: period.month, period_year: period.year,
        period_label: `${new Date(period.year, period.month - 1).toLocaleString('default', { month: 'long' })} ${period.year}`,
        status: 'confirmed', total_rows: rawRows.length, valid_rows: readyRows.length - errorRows.length,
        skipped_rows: validated.filter(r => r.skip).length, error_rows: errorRows.length,
        imported_at: new Date().toISOString(), notes: `${warnRows.length} warnings`,
      }
      const { data: batch, error: be } = await supabase.from('import_batches').insert(batchPayload).select('id').single()
      if (be) throw new Error('Staging tables not found — run the SQL in chat to create them. Error: ' + be.message)
      const stagingRows = readyRows.map((r, i) => ({
        batch_id: batch.id, row_number: r.idx + 1, raw_data: r.mapped, mapped_data: r.mapped,
        status: r.errors.length > 0 ? 'error' : r.warnings.length > 0 ? 'warning' : 'valid',
        warnings: r.warnings, errors: r.errors,
      }))
      await supabase.from('import_staging_rows').insert(stagingRows)
      setBatchId(batch.id)
      setStep(4)
    } catch (e) {
      setAlert({ msg: e.message, type: 'error' })
    }
    setWorking(false)
  }

  const handleMerge = async () => {
    setWorking(true)
    setAlert(null)
    let imported = 0, skipped = 0, errors = 0
    const readyRows = validated.filter(r => !r.skip && r.errors.length === 0)
    for (const row of readyRows) {
      try {
        const insertObj = typeConfig.buildInsert(row.mapped, lookups)
        const { error } = await supabase.from(typeConfig.mergeTable).insert(insertObj)
        if (error) { errors++; } else { imported++ }
      } catch { errors++ }
    }
    if (batchId) {
      await supabase.from('import_batches').update({ status: 'merged', merged_at: new Date().toISOString() }).eq('id', batchId)
      await supabase.from('import_staging_rows').update({ status: 'merged' }).eq('batch_id', batchId)
    }
    setMergeResult({ imported, skipped: validated.filter(r => r.skip).length, errors })
    setWorking(false)
    setStep(5)
  }

  const handleDirectMerge = async () => {
    setWorking(true)
    setAlert(null)
    let imported = 0, skipped = 0, errors = 0
    const readyRows = validated.filter(r => !r.skip && r.errors.length === 0)
    for (const row of readyRows) {
      try {
        const insertObj = typeConfig.buildInsert(row.mapped, lookups)
        const { error } = await supabase.from(typeConfig.mergeTable).insert(insertObj)
        if (error) errors++; else imported++
      } catch { errors++ }
    }
    setMergeResult({ imported, skipped: validated.filter(r => r.skip).length, errors })
    setWorking(false)
    setStep(5)
  }

  const validCount = validated.filter(r => !r.skip && r.errors.length === 0).length
  const errorCount = validated.filter(r => r.errors.length > 0).length
  const warnCount = validated.filter(r => r.warnings.length > 0 && r.errors.length === 0).length

  return (
    <div>
      {alert && <AlertBar msg={alert.msg} type={alert.type} onClose={() => setAlert(null)} />}
      <Steps current={step} steps={STEP_LABELS} />

      {/* STEP 0 — Upload */}
      {step === 0 && (
        <div style={styles.card}>
          <div style={{ marginBottom: '14px' }}>
            <div style={{ fontSize: '14px', fontWeight: '700', marginBottom: '8px' }}>Expected columns for {typeConfig.label}:</div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {Object.values(typeConfig.fields).map(f => (
                <span key={f} style={{ ...styles.badge(theme.blue), fontSize: '11px' }}>{f}</span>
              ))}
            </div>
          </div>
          <div style={{ marginBottom: '16px', display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: '140px' }}>
              <label style={styles.label}>Period Month</label>
              <select style={styles.input} value={period.month} onChange={e => setPeriod(p => ({ ...p, month: Number(e.target.value) }))}>
                {Array.from({ length: 12 }, (_, i) => <option key={i} value={i + 1}>{new Date(2024, i).toLocaleString('default', { month: 'long' })}</option>)}
              </select>
            </div>
            <div style={{ flex: 1, minWidth: '100px' }}>
              <label style={styles.label}>Period Year</label>
              <input type="number" style={styles.input} value={period.year} min="2020" max="2030" onChange={e => setPeriod(p => ({ ...p, year: Number(e.target.value) }))} />
            </div>
          </div>
          <label style={styles.label}>Select Excel or CSV File</label>
          <input type="file" accept=".xlsx,.xls,.csv" style={{ color: theme.text, marginTop: '4px' }} onChange={e => e.target.files[0] && handleFile(e.target.files[0])} />
        </div>
      )}

      {/* STEP 1 — Map Columns */}
      {step === 1 && (
        <div style={styles.card}>
          <div style={{ fontWeight: '700', marginBottom: '16px' }}>Map Columns — {rawRows.length} rows detected</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '20px' }}>
            {Object.entries(typeConfig.fields).map(([field, label]) => (
              <div key={field} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <div style={{ fontSize: '12px', color: typeConfig.requiredFields.includes(field) ? theme.accent : theme.textMuted, width: '130px', flexShrink: 0 }}>
                  {label}{typeConfig.requiredFields.includes(field) ? ' *' : ''}
                </div>
                <select style={{ ...styles.input, flex: 1, fontSize: '12px' }} value={colMap[field] ?? ''} onChange={e => setColMap(m => ({ ...m, [field]: e.target.value === '' ? undefined : Number(e.target.value) }))}>
                  <option value="">— skip —</option>
                  {headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
                </select>
              </div>
            ))}
          </div>
          <div style={{ marginBottom: '16px' }}>
            <div style={{ fontWeight: '600', marginBottom: '8px', fontSize: '13px' }}>Preview (first 5 rows)</div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                <thead><tr>{headers.map((h, i) => <th key={i} style={styles.th}>{h}</th>)}</tr></thead>
                <tbody>{rawRows.slice(0, 5).map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} style={styles.td}>{String(c)}</td>)}</tr>)}</tbody>
              </table>
            </div>
          </div>
          <button style={styles.btn('primary')} onClick={handleValidate} disabled={working}>{working ? 'Validating…' : 'Validate Rows →'}</button>
        </div>
      )}

      {/* STEP 2 — Validate summary + STEP 3 — Review flagged (combined) */}
      {(step === 2 || step === 3) && (
        <div>
          <div style={{ ...styles.card, display: 'flex', gap: '20px', alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={styles.badge(theme.green)}>{validCount} valid</span>
            <span style={styles.badge(theme.red)}>{errorCount} errors</span>
            <span style={styles.badge(theme.accent)}>{warnCount} warnings</span>
            <span style={{ fontSize: '12px', color: theme.textMuted }}>{validated.filter(r => r.skip).length} skipped</span>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
              {step === 2 && <button style={styles.btn('ghost')} onClick={() => setStep(3)}>Review Flagged ({errorCount + warnCount}) →</button>}
              {step === 3 && <button style={styles.btn('ghost')} onClick={() => setStep(2)}>← All Rows</button>}
              <button style={styles.btn('primary')} onClick={handleStage} disabled={working || validCount === 0}>{working ? 'Staging…' : `Confirm & Stage (${validCount} rows)`}</button>
              <button style={{ ...styles.btn('blue'), fontSize: '11px' }} onClick={handleDirectMerge} disabled={working || validCount === 0} title="Skip staging tables — import directly">{working ? '…' : 'Direct Import'}</button>
            </div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr>
                  <th style={styles.th}>#</th>
                  {Object.values(typeConfig.fields).slice(0, 5).map(f => <th key={f} style={styles.th}>{f}</th>)}
                  <th style={styles.th}>Issues</th>
                  <th style={styles.th}>Skip</th>
                </tr>
              </thead>
              <tbody>
                {(step === 3 ? validated.filter(r => r.errors.length > 0 || r.warnings.length > 0) : validated).map((r, i) => (
                  <tr key={i} style={{ background: r.skip ? theme.surface : r.errors.length > 0 ? theme.red + '08' : r.warnings.length > 0 ? theme.accent + '06' : 'transparent', opacity: r.skip ? 0.5 : 1 }}>
                    <td style={styles.td}>{r.idx + 1}</td>
                    {Object.keys(typeConfig.fields).slice(0, 5).map(f => (
                      <td key={f} style={styles.td}>{r.mapped[f] || '—'}</td>
                    ))}
                    <td style={styles.td}>
                      {r.errors.map((e, j) => <div key={j} style={{ color: theme.red, fontSize: '11px' }}>✗ {e}</div>)}
                      {r.warnings.map((w, j) => <div key={j} style={{ color: theme.accent, fontSize: '11px' }}>⚠ {w}</div>)}
                      {r.errors.length === 0 && r.warnings.length === 0 && <span style={{ color: theme.green }}>✓ OK</span>}
                    </td>
                    <td style={styles.td}><input type="checkbox" checked={r.skip} onChange={() => toggleSkip(i)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* STEP 4 — Staged confirmation */}
      {step === 4 && (
        <div style={styles.card}>
          <div style={{ fontSize: '18px', fontWeight: '700', marginBottom: '8px', color: theme.green }}>✓ Batch Staged Successfully</div>
          <div style={{ color: theme.textMuted, fontSize: '13px', marginBottom: '20px' }}>
            {validCount} rows are staged and ready to merge into <strong>{typeConfig.mergeTable}</strong>. Review the summary below before merging.
          </div>
          <div style={{ display: 'flex', gap: '16px', marginBottom: '20px', flexWrap: 'wrap' }}>
            {[
              { label: 'Valid Rows', value: validCount, color: theme.green },
              { label: 'Warnings', value: warnCount, color: theme.accent },
              { label: 'Errors Skipped', value: errorCount, color: theme.red },
              { label: 'User Skipped', value: validated.filter(r => r.skip).length, color: theme.textMuted },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ flex: 1, minWidth: '120px', background: theme.surface, borderRadius: '8px', padding: '12px' }}>
                <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '4px' }}>{label}</div>
                <div style={{ fontSize: '24px', fontWeight: '700', color }}>{value}</div>
              </div>
            ))}
          </div>
          <div style={{ ...styles.btn('primary'), display: 'inline-block', cursor: 'pointer' }} onClick={handleMerge}>
            {working ? 'Merging into live tables…' : `Merge ${validCount} rows into ${typeConfig.mergeTable} →`}
          </div>
        </div>
      )}

      {/* STEP 5 — Done */}
      {step === 5 && mergeResult && (
        <div style={styles.card}>
          <div style={{ fontSize: '18px', fontWeight: '700', marginBottom: '16px' }}>Import Complete</div>
          <div style={{ display: 'flex', gap: '16px', marginBottom: '20px', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: '120px', background: theme.surface, borderRadius: '8px', padding: '14px', borderLeft: `4px solid ${theme.green}` }}>
              <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '4px' }}>IMPORTED</div>
              <div style={{ fontSize: '28px', fontWeight: '700', color: theme.green }}>{mergeResult.imported}</div>
            </div>
            <div style={{ flex: 1, minWidth: '120px', background: theme.surface, borderRadius: '8px', padding: '14px', borderLeft: `4px solid ${theme.textMuted}` }}>
              <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '4px' }}>SKIPPED</div>
              <div style={{ fontSize: '28px', fontWeight: '700', color: theme.textMuted }}>{mergeResult.skipped}</div>
            </div>
            {mergeResult.errors > 0 && (
              <div style={{ flex: 1, minWidth: '120px', background: theme.surface, borderRadius: '8px', padding: '14px', borderLeft: `4px solid ${theme.red}` }}>
                <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '4px' }}>ERRORS</div>
                <div style={{ fontSize: '28px', fontWeight: '700', color: theme.red }}>{mergeResult.errors}</div>
                <div style={{ fontSize: '11px', color: theme.textMuted, marginTop: '4px' }}>Check that the target table exists in Supabase</div>
              </div>
            )}
          </div>
          <button style={styles.btn('ghost')} onClick={onBack}>← Import Another Type</button>
        </div>
      )}
    </div>
  )
}

// ── IMPORT HISTORY ─────────────────────────────────────────────────────────────

function ImportHistory() {
  const [batches, setBatches] = useState([])
  const [loading, setLoading] = useState(true)
  const [alert, setAlert] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase.from('import_batches').select('*').order('created_at', { ascending: false }).limit(100)
    if (error) setAlert({ msg: 'import_batches table not found. Run the SQL provided in chat to create it.', type: 'warning' })
    setBatches(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  if (loading) return <div style={{ padding: '40px', textAlign: 'center', color: theme.textMuted }}>Loading…</div>

  return (
    <div>
      {alert && <AlertBar msg={alert.msg} type={alert.type} onClose={() => setAlert(null)} />}
      <div style={{ ...styles.card, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontWeight: '700' }}>Import History — {batches.length} batch{batches.length !== 1 ? 'es' : ''}</div>
        <button style={styles.btn('ghost')} onClick={load}>Refresh</button>
      </div>
      {batches.length === 0 ? (
        <div style={{ ...styles.card, textAlign: 'center', color: theme.textMuted, padding: '40px' }}>
          No import batches yet. Start a new import to see history here.
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>{['Type', 'Period', 'Status', 'Total', 'Valid', 'Errors', 'Skipped', 'Imported At', 'Merged At'].map(h => <th key={h} style={styles.th}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {batches.map(b => (
                <tr key={b.id}>
                  <td style={styles.td}>{IMPORT_TYPES.find(t => t.id === b.import_type)?.label || b.import_type}</td>
                  <td style={styles.td}>{b.period_label || `${b.period_month}/${b.period_year}`}</td>
                  <td style={styles.td}><span style={styles.badge(statusColor(b.status))}>{b.status}</span></td>
                  <td style={styles.td}>{b.total_rows}</td>
                  <td style={{ ...styles.td, color: theme.green }}>{b.valid_rows}</td>
                  <td style={{ ...styles.td, color: b.error_rows > 0 ? theme.red : theme.textMuted }}>{b.error_rows}</td>
                  <td style={{ ...styles.td, color: theme.textMuted }}>{b.skipped_rows}</td>
                  <td style={styles.td}>{b.imported_at ? new Date(b.imported_at).toLocaleDateString() : '—'}</td>
                  <td style={{ ...styles.td, color: b.merged_at ? theme.green : theme.textMuted }}>{b.merged_at ? new Date(b.merged_at).toLocaleDateString() : 'Pending'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── PROGRESS TRACKER ─────────────────────────────────────────────────────────

function ProgressTracker() {
  const [batches, setBatches] = useState([])
  const [loading, setLoading] = useState(true)
  const [alert, setAlert] = useState(null)
  const currentYear = new Date().getFullYear()

  useEffect(() => {
    supabase.from('import_batches').select('import_type, period_month, period_year, status')
      .then(({ data, error }) => {
        if (error) setAlert({ msg: 'Create staging tables first (SQL provided in chat).', type: 'warning' })
        setBatches(data || [])
        setLoading(false)
      })
  }, [])

  const months = Array.from({ length: 12 }, (_, i) => i + 1)
  const monthName = (m) => new Date(2024, m - 1).toLocaleString('default', { month: 'short' })

  const getBatchesFor = (type, month, year) => batches.filter(b => b.import_type === type && b.period_month === month && b.period_year === year)

  const cellColor = (bs) => {
    if (bs.length === 0) return theme.border
    if (bs.some(b => b.status === 'merged')) return theme.green
    if (bs.some(b => b.status === 'confirmed')) return theme.accent
    return theme.blue
  }

  if (loading) return <div style={{ padding: '40px', textAlign: 'center', color: theme.textMuted }}>Loading…</div>

  return (
    <div>
      {alert && <AlertBar msg={alert.msg} type={alert.type} onClose={() => setAlert(null)} />}
      <div style={{ ...styles.card, marginBottom: '20px' }}>
        <div style={{ fontWeight: '700', marginBottom: '4px' }}>Month-by-Month Import Progress — {currentYear}</div>
        <div style={{ fontSize: '12px', color: theme.textMuted, display: 'flex', gap: '16px', marginTop: '8px' }}>
          <span><span style={{ display: 'inline-block', width: '10px', height: '10px', background: theme.green, borderRadius: '2px', marginRight: '4px' }} />Merged</span>
          <span><span style={{ display: 'inline-block', width: '10px', height: '10px', background: theme.accent, borderRadius: '2px', marginRight: '4px' }} />Staged</span>
          <span><span style={{ display: 'inline-block', width: '10px', height: '10px', background: theme.blue, borderRadius: '2px', marginRight: '4px' }} />Draft</span>
          <span><span style={{ display: 'inline-block', width: '10px', height: '10px', background: theme.border, borderRadius: '2px', marginRight: '4px' }} />Not imported</span>
        </div>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
          <thead>
            <tr>
              <th style={{ ...styles.th, minWidth: '160px' }}>Import Type</th>
              {months.map(m => <th key={m} style={{ ...styles.th, textAlign: 'center', minWidth: '44px' }}>{monthName(m)}</th>)}
            </tr>
          </thead>
          <tbody>
            {IMPORT_TYPES.map(type => (
              <tr key={type.id}>
                <td style={{ ...styles.td, fontWeight: '600' }}>{type.icon} {type.label}</td>
                {months.map(m => {
                  const bs = getBatchesFor(type.id, m, currentYear)
                  const color = cellColor(bs)
                  return (
                    <td key={m} style={{ ...styles.td, textAlign: 'center', padding: '6px' }}>
                      <div style={{ width: '28px', height: '28px', borderRadius: '6px', background: color + (color === theme.border ? '' : '33'), border: `1px solid ${color}55`, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', color, fontWeight: '700' }}>
                        {bs.length > 0 ? bs.length : ''}
                      </div>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── MAIN COMPONENT ────────────────────────────────────────────────────────────

export default function DataImport() {
  const [tab, setTab] = useState('import')
  const [selectedType, setSelectedType] = useState(null)

  return (
    <div style={styles.page}>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ margin: '0 0 4px', fontSize: '22px', fontWeight: '700', color: theme.text }}>Historical Data Import</h1>
        <div style={{ fontSize: '13px', color: theme.textMuted }}>Bulk import historical records from Excel files — MD and Accountant access</div>
      </div>

      {/* Tab nav */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '24px', background: theme.surface, padding: '6px', borderRadius: '8px', width: 'fit-content' }}>
        {[
          { id: 'import', label: '↑ New Import' },
          { id: 'history', label: '📋 History' },
          { id: 'progress', label: '📊 Progress' },
        ].map(t => (
          <button key={t.id} style={styles.tab(tab === t.id)} onClick={() => { setTab(t.id); setSelectedType(null) }}>{t.label}</button>
        ))}
      </div>

      {tab === 'import' && !selectedType && (
        <div>
          <div style={{ fontSize: '14px', color: theme.textMuted, marginBottom: '16px' }}>Select an import type to begin</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '14px' }}>
            {IMPORT_TYPES.map(type => (
              <button key={type.id} onClick={() => setSelectedType(type.id)} style={{ ...styles.card, cursor: 'pointer', textAlign: 'left', border: `1px solid ${theme.border}`, background: theme.card, transition: 'border-color 0.15s', marginBottom: 0 }} onMouseOver={e => e.currentTarget.style.borderColor = theme.accent} onMouseOut={e => e.currentTarget.style.borderColor = theme.border}>
                <div style={{ fontSize: '28px', marginBottom: '8px' }}>{type.icon}</div>
                <div style={{ fontWeight: '700', color: theme.text, marginBottom: '4px' }}>{type.label}</div>
                <div style={{ fontSize: '12px', color: theme.textMuted }}>{type.description}</div>
                <div style={{ fontSize: '10px', color: theme.textMuted, marginTop: '8px' }}>→ {type.mergeTable}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {tab === 'import' && selectedType && (
        <div>
          <button onClick={() => setSelectedType(null)} style={{ ...styles.btn('ghost'), marginBottom: '20px' }}>← Back to Import Types</button>
          <div style={{ fontWeight: '700', fontSize: '16px', marginBottom: '20px', color: theme.text }}>
            {IMPORT_TYPES.find(t => t.id === selectedType)?.icon} {IMPORT_TYPES.find(t => t.id === selectedType)?.label}
          </div>
          <ImportWizard typeConfig={IMPORT_TYPES.find(t => t.id === selectedType)} onBack={() => setSelectedType(null)} />
        </div>
      )}

      {tab === 'history' && <ImportHistory />}
      {tab === 'progress' && <ProgressTracker />}
    </div>
  )
}
