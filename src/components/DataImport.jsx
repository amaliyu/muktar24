import React, { useState } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '../lib/supabase'

const theme = {
  bg: '#0f1117', surface: '#1a1d27', card: '#21263a', border: '#2e3452',
  accent: '#f5a623', green: '#2dd4a0', red: '#f06b6b', blue: '#5b8dee',
  text: '#e8eaf0', textMuted: '#7c839e',
}

const styles = {
  page: { padding: '24px 28px', color: theme.text },
  card: { background: theme.card, border: `1px solid ${theme.border}`, borderRadius: '10px', padding: '20px', marginBottom: '16px' },
  label: { display: 'block', fontSize: '11px', fontWeight: '700', color: theme.textMuted, marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.06em' },
  input: { width: '100%', padding: '9px 12px', background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: '6px', color: theme.text, fontSize: '13px', boxSizing: 'border-box' },
  btn: (v = 'primary') => ({
    padding: '9px 18px', borderRadius: '7px', fontWeight: '600', fontSize: '13px', cursor: 'pointer',
    border: `1px solid ${v === 'danger' ? theme.red : v === 'success' ? theme.green : v === 'primary' ? theme.accent : theme.border}`,
    background: v === 'primary' ? theme.accent : v === 'danger' ? '#3d1515' : v === 'success' ? '#0d3028' : theme.surface,
    color: v === 'primary' ? '#1a0e00' : v === 'danger' ? theme.red : v === 'success' ? theme.green : theme.text,
  }),
  th: { padding: '8px 10px', textAlign: 'left', fontSize: '11px', fontWeight: '700', color: theme.textMuted, textTransform: 'uppercase', borderBottom: `1px solid ${theme.border}` },
  td: { padding: '8px 10px', fontSize: '12px', borderBottom: `1px solid ${theme.border}22` },
  badge: (color) => ({ display: 'inline-block', padding: '2px 7px', borderRadius: '4px', fontSize: '10px', fontWeight: '700', background: color + '22', color, border: `1px solid ${color}44` }),
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

const Alert = ({ msg, type = 'error', onClose }) => (
  <div style={{ padding: '12px 16px', borderRadius: '8px', marginBottom: '14px', background: type === 'success' ? theme.green + '22' : type === 'warning' ? theme.accent + '22' : theme.red + '22', color: type === 'success' ? theme.green : type === 'warning' ? theme.accent : theme.red, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px' }}>
    <span>{msg}</span>
    {onClose && <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: '18px' }}>×</button>}
  </div>
)

// ── STEP INDICATOR ───────────────────────────────────────────────────────────
const Steps = ({ current, steps }) => (
  <div style={{ display: 'flex', gap: '0', marginBottom: '28px', alignItems: 'center' }}>
    {steps.map((s, i) => (
      <React.Fragment key={i}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
          <div style={{ width: '28px', height: '28px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: '700', background: i < current ? theme.green : i === current ? theme.accent : theme.surface, color: i < current ? '#0d3028' : i === current ? '#1a0e00' : theme.textMuted, border: `2px solid ${i < current ? theme.green : i === current ? theme.accent : theme.border}` }}>
            {i < current ? '✓' : i + 1}
          </div>
          <div style={{ fontSize: '10px', color: i === current ? theme.accent : theme.textMuted, marginTop: '4px', textAlign: 'center', fontWeight: i === current ? '700' : '400' }}>{s}</div>
        </div>
        {i < steps.length - 1 && <div style={{ flex: 1, height: '2px', background: i < current ? theme.green : theme.border, maxWidth: '40px' }} />}
      </React.Fragment>
    ))}
  </div>
)

// ── LOADING LOG IMPORTER ─────────────────────────────────────────────────────
function LoadingLogImporter() {
  const [step, setStep] = useState(0)
  const [rows, setRows] = useState([])
  const [headers, setHeaders] = useState([])
  const [colMap, setColMap] = useState({})
  const [validated, setValidated] = useState([])
  const [customers, setCustomers] = useState([])
  const [vehicles, setVehicles] = useState([])
  const [weekDate, setWeekDate] = useState('')
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState(null)
  const [alert, setAlert] = useState(null)

  const EXPECTED = { date: 'DATE', customer: 'NAME', qty_loaded: 'QUANTITY LOADED', qty_received: 'QUANTITY RECEIVED', broken: 'BROKEN BLOCKS', amount: 'AMOUNT', waybill_no: 'WAYBILL NO', block_type: 'BLOCK TYPE', reference_no: 'REFERENCE NO', plate_number: 'PLATE NUMBER' }

  const handleFile = async (file) => {
    try {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array', cellDates: false })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
      if (data.length < 2) return setAlert({ msg: 'File appears empty', type: 'error' })
      const hdrs = data[0].map(h => String(h).trim())
      const dataRows = data.slice(1).filter(r => r.some(c => c !== ''))
      setHeaders(hdrs)
      setRows(dataRows)
      const map = {}
      Object.entries(EXPECTED).forEach(([key, label]) => {
        const idx = hdrs.findIndex(h => h.toUpperCase().includes(label.replace('QUANTITY ', 'QTY ').replace('QUANTITY', '').trim()) || h.toUpperCase() === label)
        if (idx >= 0) map[key] = idx
      })
      hdrs.forEach((h, i) => {
        const upper = h.toUpperCase()
        if (upper.includes('DATE') && !('date' in map)) map.date = i
        if ((upper.includes('NAME') || upper.includes('CUSTOMER')) && !('customer' in map)) map.customer = i
        if (upper.includes('LOADED') && !('qty_loaded' in map)) map.qty_loaded = i
        if (upper.includes('RECEIVED') && !('qty_received' in map)) map.qty_received = i
        if (upper.includes('BROKEN') && !('broken' in map)) map.broken = i
        if ((upper.includes('AMOUNT') || upper.includes('TOTAL')) && !('amount' in map)) map.amount = i
        if (upper.includes('WAYBILL') && !('waybill_no' in map)) map.waybill_no = i
        if (upper.includes('BLOCK') && !('block_type' in map)) map.block_type = i
        if (upper.includes('PLATE') && !('plate_number' in map)) map.plate_number = i
        if (upper.includes('REF') && !('reference_no' in map)) map.reference_no = i
      })
      setColMap(map)
      const [custRes, vehRes] = await Promise.all([
        supabase.from('customers').select('id, name'),
        supabase.from('vehicles').select('id, vehicle_number'),
      ])
      setCustomers(custRes.data || [])
      setVehicles(vehRes.data || [])
      setStep(1)
    } catch (e) { setAlert({ msg: 'Could not read file: ' + (e?.message || 'unknown error'), type: 'error' }) }
  }

  const handleValidate = () => {
    const get = (row, key) => colMap[key] != null ? row[colMap[key]] : ''
    const vRows = rows.map((row, idx) => {
      const dateStr = parseExcelDate(get(row, 'date'))
      const custName = String(get(row, 'customer') || '').trim()
      const plateName = String(get(row, 'plate_number') || '').trim().toUpperCase()
      const blockType = sanitizeBlockType(get(row, 'block_type'))
      const waybillNo = String(get(row, 'waybill_no') || '').trim()
      const custMatch = customers.find(c => c.name?.toLowerCase() === custName.toLowerCase())
      const vehMatch = vehicles.find(v => v.vehicle_number?.toUpperCase() === plateName)
      const issues = []
      if (!dateStr) issues.push('Invalid date')
      if (!custName) issues.push('Missing customer name')
      else if (!custMatch) issues.push(`Customer "${custName}" not found`)
      if (!waybillNo) issues.push('Missing waybill no')
      return {
        idx, dateStr, custName, plateName, blockType, waybillNo,
        qty_loaded: Number(get(row, 'qty_loaded')) || 0,
        qty_received: Number(get(row, 'qty_received')) || 0,
        broken: Number(get(row, 'broken')) || 0,
        amount: Number(get(row, 'amount')) || 0,
        reference_no: String(get(row, 'reference_no') || '').trim(),
        custId: custMatch?.id || null,
        vehId: vehMatch?.id || null,
        issues,
        skip: false,
        overrideCustomer: '',
      }
    })
    setValidated(vRows)
    setStep(2)
  }

  const toggleSkip = (idx) => setValidated(v => v.map((r, i) => i === idx ? { ...r, skip: !r.skip } : r))

  const handleImport = async () => {
    setImporting(true)
    let imported = 0, skipped = 0, errors = 0
    for (const row of validated) {
      if (row.skip || row.issues.length > 0) { skipped++; continue }
      const { error } = await supabase.from('truck_loading_log').insert({
        date: row.dateStr,
        customer_name: row.custName,
        customer_id: row.custId,
        vehicle_id: row.vehId,
        plate_number: row.plateName,
        blocks_loaded: row.qty_loaded,
        quantity_received: row.qty_received,
        quantity_damaged: row.broken,
        total_amount: row.amount,
        physical_waybill_number: row.waybillNo,
        block_type: row.blockType,
        reference_number: row.reference_no,
        payment_status: 'unpaid',
        payment_week_ending: row.dateStr,
      })
      if (error) errors++
      else imported++
    }
    setResult({ imported, skipped, errors })
    setImporting(false)
    setStep(3)
  }

  const validCount = validated.filter(r => r.issues.length === 0 && !r.skip).length
  const issueCount = validated.filter(r => r.issues.length > 0).length

  return (
    <div>
      {alert && <Alert msg={alert.msg} type={alert.type} onClose={() => setAlert(null)} />}
      <Steps current={step} steps={['Upload', 'Map Columns', 'Review & Validate', 'Done']} />

      {step === 0 && (
        <div style={styles.card}>
          <div style={{ marginBottom: '14px', color: theme.textMuted, fontSize: '13px' }}>Expected columns: DATE, NAME, QUANTITY LOADED, QUANTITY RECEIVED, BROKEN BLOCKS, AMOUNT, WAYBILL NO, BLOCK TYPE, REFERENCE NO, PLATE NUMBER</div>
          <label style={styles.label}>Select Excel File (.xlsx or .xls)</label>
          <input type="file" accept=".xlsx,.xls,.csv" style={{ color: theme.text }} onChange={e => e.target.files[0] && handleFile(e.target.files[0])} />
        </div>
      )}

      {step === 1 && (
        <div style={styles.card}>
          <div style={{ marginBottom: '16px', fontWeight: '700' }}>Column Mapping — {rows.length} rows detected</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
            {Object.entries(EXPECTED).map(([key, label]) => (
              <div key={key} style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <div style={{ fontSize: '12px', color: theme.textMuted, width: '130px', flexShrink: 0 }}>{label}</div>
                <select style={{ ...styles.input, flex: 1 }} value={colMap[key] ?? ''} onChange={e => setColMap(m => ({ ...m, [key]: e.target.value === '' ? undefined : Number(e.target.value) }))}>
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
                <tbody>{rows.slice(0, 5).map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} style={styles.td}>{String(c)}</td>)}</tr>)}</tbody>
              </table>
            </div>
          </div>
          <button style={styles.btn('primary')} onClick={handleValidate}>Validate Rows →</button>
        </div>
      )}

      {step === 2 && (
        <div>
          <div style={{ ...styles.card, display: 'flex', gap: '20px', alignItems: 'center' }}>
            <span style={styles.badge(theme.green)}>{validCount} valid</span>
            <span style={styles.badge(theme.red)}>{issueCount} need attention</span>
            <span style={{ fontSize: '12px', color: theme.textMuted }}>{validated.filter(r => r.skip).length} skipped</span>
            <button style={{ ...styles.btn('primary'), marginLeft: 'auto' }} onClick={handleImport} disabled={importing || validCount === 0}>{importing ? 'Importing…' : `Import ${validCount} rows`}</button>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead><tr>{['#', 'Date', 'Customer', 'Block Type', 'Loaded', 'Amount', 'Waybill No', 'Issues', 'Skip'].map(h => <th key={h} style={styles.th}>{h}</th>)}</tr></thead>
              <tbody>
                {validated.map((r, i) => (
                  <tr key={i} style={{ background: r.skip ? theme.surface : r.issues.length > 0 ? theme.red + '08' : 'transparent', opacity: r.skip ? 0.5 : 1 }}>
                    <td style={styles.td}>{r.idx + 1}</td>
                    <td style={styles.td}>{r.dateStr || <span style={{ color: theme.red }}>invalid</span>}</td>
                    <td style={styles.td}>{r.custName || '—'}{r.custId && <span style={{ ...styles.badge(theme.green), marginLeft: '4px' }}>✓</span>}</td>
                    <td style={styles.td}>{r.blockType || '—'}</td>
                    <td style={styles.td}>{r.qty_loaded}</td>
                    <td style={styles.td}>₦{Number(r.amount).toLocaleString()}</td>
                    <td style={styles.td}>{r.waybillNo || '—'}</td>
                    <td style={styles.td}>{r.issues.length > 0 ? <span style={{ color: theme.red, fontSize: '11px' }}>{r.issues.join(', ')}</span> : <span style={{ color: theme.green }}>✓ OK</span>}</td>
                    <td style={styles.td}><input type="checkbox" checked={r.skip} onChange={() => toggleSkip(i)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {step === 3 && result && (
        <div style={styles.card}>
          <div style={{ fontSize: '18px', fontWeight: '700', marginBottom: '16px' }}>Import Complete</div>
          <div style={{ display: 'flex', gap: '20px' }}>
            <div style={{ ...styles.card, flex: 1, borderLeft: `4px solid ${theme.green}`, marginBottom: 0 }}>
              <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '4px' }}>IMPORTED</div>
              <div style={{ fontSize: '28px', fontWeight: '700', color: theme.green }}>{result.imported}</div>
            </div>
            <div style={{ ...styles.card, flex: 1, borderLeft: `4px solid ${theme.textMuted}`, marginBottom: 0 }}>
              <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '4px' }}>SKIPPED</div>
              <div style={{ fontSize: '28px', fontWeight: '700', color: theme.textMuted }}>{result.skipped}</div>
            </div>
            {result.errors > 0 && <div style={{ ...styles.card, flex: 1, borderLeft: `4px solid ${theme.red}`, marginBottom: 0 }}>
              <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '4px' }}>ERRORS</div>
              <div style={{ fontSize: '28px', fontWeight: '700', color: theme.red }}>{result.errors}</div>
            </div>}
          </div>
          <button style={{ ...styles.btn('secondary'), marginTop: '16px' }} onClick={() => { setStep(0); setRows([]); setValidated([]); setResult(null) }}>Import Another File</button>
        </div>
      )}
    </div>
  )
}

// ── WEEKLY PAYROLL IMPORTER ──────────────────────────────────────────────────
function WeeklyPayrollImporter() {
  const [step, setStep] = useState(0)
  const [rows, setRows] = useState([])
  const [headers, setHeaders] = useState([])
  const [colMap, setColMap] = useState({})
  const [weekStart, setWeekStart] = useState('')
  const [validated, setValidated] = useState([])
  const [pool, setPool] = useState([])
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState(null)
  const [alert, setAlert] = useState(null)

  const EXPECTED = { sn: 'SN', name: 'NAMES', mon: 'MON', tue: 'TUE', wed: 'WED', thu: 'THU', fri: 'FRI', sat: 'SAT', total_pay: 'TOTAL PAY', cleaning: 'CLEANING', hajiya: 'HAJIYA', minus: 'MINUS', total: 'TOTAL' }

  const handleFile = async (file) => {
    try {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array', cellDates: false })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
      if (data.length < 2) return setAlert({ msg: 'File appears empty', type: 'error' })
      const hdrs = data[0].map(h => String(h).trim())
      const dataRows = data.slice(1).filter(r => r.some(c => c !== '') && r[0] !== '' && !String(r[0]).toUpperCase().includes('TOTAL'))
      setHeaders(hdrs)
      setRows(dataRows)
      const map = {}
      hdrs.forEach((h, i) => {
        const upper = h.toUpperCase().trim()
        if ((upper === 'SN' || upper === 'S/N' || upper === 'NO') && !('sn' in map)) map.sn = i
        if ((upper.includes('NAME') || upper === 'NAMES') && !('name' in map)) map.name = i
        if (upper === 'MON' || upper === 'MONDAY') map.mon = i
        if (upper === 'TUE' || upper === 'TUESDAY') map.tue = i
        if (upper === 'WED' || upper === 'WEDNESDAY') map.wed = i
        if (upper === 'THU' || upper === 'THURSDAY') map.thu = i
        if (upper === 'FRI' || upper === 'FRIDAY') map.fri = i
        if (upper === 'SAT' || upper === 'SATURDAY') map.sat = i
        if ((upper.includes('TOTAL') && upper.includes('PAY')) && !('total_pay' in map)) map.total_pay = i
        if (upper === 'CLEANING' && !('cleaning' in map)) map.cleaning = i
        if ((upper === 'HAJIYA' || upper === 'ADVANCE' || upper.includes('FEED')) && !('hajiya' in map)) map.hajiya = i
        if ((upper === 'MINUS' || upper === 'DEDUCTION') && !('minus' in map)) map.minus = i
        if (upper === 'TOTAL' && !('total' in map)) map.total = i
      })
      setColMap(map)
      const { data: poolData } = await supabase.from('labour_pool').select('id, full_name')
      setPool(poolData || [])
      setStep(1)
    } catch (e) { setAlert({ msg: 'Could not read file: ' + (e?.message || 'unknown error'), type: 'error' }) }
  }

  const handleValidate = () => {
    if (!weekStart) return setAlert({ msg: 'Please enter the week start date (Monday)', type: 'error' })
    const get = (row, key) => colMap[key] != null ? row[colMap[key]] : ''
    const weekSat = (() => {
      const d = new Date(weekStart)
      d.setDate(d.getDate() + 5)
      return d.toISOString().split('T')[0]
    })()
    const getDayDate = (offset) => {
      const d = new Date(weekStart)
      d.setDate(d.getDate() + offset)
      return d.toISOString().split('T')[0]
    }
    const vRows = rows.map((row, idx) => {
      const name = String(get(row, 'name') || '').trim()
      const workerMatch = pool.find(w => w.full_name?.toLowerCase() === name.toLowerCase()) ||
        pool.find(w => w.full_name?.toLowerCase().includes(name.toLowerCase()) || name.toLowerCase().includes(w.full_name?.toLowerCase()))
      const issues = []
      if (!name) { issues.push('Missing name'); return { idx, name, issues, skip: true } }
      if (!workerMatch) issues.push(`Worker "${name}" not found in Labour Pool`)
      const days = [
        { day: 'Mon', date: getDayDate(0), val: get(row, 'mon') },
        { day: 'Tue', date: getDayDate(1), val: get(row, 'tue') },
        { day: 'Wed', date: getDayDate(2), val: get(row, 'wed') },
        { day: 'Thu', date: getDayDate(3), val: get(row, 'thu') },
        { day: 'Fri', date: getDayDate(4), val: get(row, 'fri') },
        { day: 'Sat', date: getDayDate(5), val: get(row, 'sat') },
      ]
      return {
        idx, name, workerMatch, workerId: workerMatch?.id || null,
        days, weekSat,
        gross_pay: Number(get(row, 'total_pay')) || 0,
        bonus_amount: Number(get(row, 'cleaning')) || 0,
        advance_amount: Number(get(row, 'hajiya')) || 0,
        deduction_amount: Number(get(row, 'minus')) || 0,
        net_pay: Number(get(row, 'total')) || 0,
        issues, skip: issues.length > 0,
      }
    }).filter(r => r.name)
    setValidated(vRows)
    setStep(2)
  }

  const toggleSkip = (idx) => setValidated(v => v.map((r, i) => i === idx ? { ...r, skip: !r.skip } : r))

  const handleImport = async () => {
    setImporting(true)
    let imported = 0, skipped = 0, errors = 0
    for (const row of validated) {
      if (row.skip) { skipped++; continue }
      const { error } = await supabase.from('historical_payroll_import').insert({
        worker_name: row.name,
        labour_pool_id: row.workerId,
        week_ending: row.weekSat,
        gross_pay: row.gross_pay,
        bonus_amount: row.bonus_amount,
        advance_amount: row.advance_amount,
        deduction_amount: row.deduction_amount,
        net_pay: row.net_pay,
      }).select()
      if (error) {
        // Table may not exist — try weekly_labour_payroll as a fallback note
        errors++
      } else imported++
    }
    setResult({ imported, skipped, errors })
    setImporting(false)
    setStep(3)
  }

  const validCount = validated.filter(r => !r.skip && r.issues.length === 0).length

  return (
    <div>
      {alert && <Alert msg={alert.msg} type={alert.type} onClose={() => setAlert(null)} />}
      <Steps current={step} steps={['Upload', 'Map & Date', 'Review', 'Done']} />

      {step === 0 && (
        <div style={styles.card}>
          <div style={{ marginBottom: '14px', color: theme.textMuted, fontSize: '13px' }}>Expected columns: SN, NAMES, MON, TUE, WED, THU, FRI, SAT, TOTAL PAY, CLEANING, HAJIYA, MINUS, TOTAL</div>
          <label style={styles.label}>Select Excel File (.xlsx or .xls)</label>
          <input type="file" accept=".xlsx,.xls,.csv" style={{ color: theme.text }} onChange={e => e.target.files[0] && handleFile(e.target.files[0])} />
        </div>
      )}

      {step === 1 && (
        <div style={styles.card}>
          <div style={{ marginBottom: '16px', fontWeight: '700' }}>Column Mapping — {rows.length} rows detected</div>
          <div style={{ marginBottom: '16px' }}>
            <label style={styles.label}>Week Start Date (Monday of the payroll week)</label>
            <input type="date" style={{ ...styles.input, width: '180px' }} value={weekStart} onChange={e => setWeekStart(e.target.value)} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '20px' }}>
            {Object.entries(EXPECTED).map(([key, label]) => (
              <div key={key} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <div style={{ fontSize: '11px', color: theme.textMuted, width: '90px', flexShrink: 0 }}>{label}</div>
                <select style={{ ...styles.input, flex: 1, fontSize: '12px' }} value={colMap[key] ?? ''} onChange={e => setColMap(m => ({ ...m, [key]: e.target.value === '' ? undefined : Number(e.target.value) }))}>
                  <option value="">— skip —</option>
                  {headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
                </select>
              </div>
            ))}
          </div>
          <button style={styles.btn('primary')} onClick={handleValidate}>Validate Rows →</button>
        </div>
      )}

      {step === 2 && (
        <div>
          <div style={{ ...styles.card, display: 'flex', gap: '20px', alignItems: 'center' }}>
            <span style={styles.badge(theme.green)}>{validCount} valid</span>
            <span style={styles.badge(theme.red)}>{validated.filter(r => r.issues.length > 0).length} need attention</span>
            <button style={{ ...styles.btn('primary'), marginLeft: 'auto' }} onClick={handleImport} disabled={importing || validCount === 0}>{importing ? 'Importing…' : `Import ${validCount} rows`}</button>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead><tr>{['Name', 'Match', 'Gross Pay', 'Bonus', 'Advance', 'Deduction', 'Net Pay', 'Issues', 'Skip'].map(h => <th key={h} style={styles.th}>{h}</th>)}</tr></thead>
              <tbody>
                {validated.map((r, i) => (
                  <tr key={i} style={{ background: r.skip ? theme.surface : r.issues.length > 0 ? theme.red + '08' : 'transparent', opacity: r.skip ? 0.5 : 1 }}>
                    <td style={styles.td}>{r.name}</td>
                    <td style={styles.td}>{r.workerMatch ? <span style={styles.badge(theme.green)}>✓ {r.workerMatch.full_name}</span> : <span style={styles.badge(theme.red)}>Not found</span>}</td>
                    <td style={styles.td}>₦{Number(r.gross_pay || 0).toLocaleString()}</td>
                    <td style={{ ...styles.td, color: theme.green }}>₦{Number(r.bonus_amount || 0).toLocaleString()}</td>
                    <td style={{ ...styles.td, color: theme.red }}>₦{Number(r.advance_amount || 0).toLocaleString()}</td>
                    <td style={{ ...styles.td, color: theme.red }}>₦{Number(r.deduction_amount || 0).toLocaleString()}</td>
                    <td style={{ ...styles.td, fontWeight: '600', color: theme.accent }}>₦{Number(r.net_pay || 0).toLocaleString()}</td>
                    <td style={styles.td}>{r.issues.length > 0 ? <span style={{ color: theme.red, fontSize: '11px' }}>{r.issues.join(', ')}</span> : <span style={{ color: theme.green }}>✓</span>}</td>
                    <td style={styles.td}><input type="checkbox" checked={r.skip} onChange={() => toggleSkip(i)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {step === 3 && result && (
        <div style={styles.card}>
          <div style={{ fontSize: '18px', fontWeight: '700', marginBottom: '16px' }}>Import Complete</div>
          <div style={{ display: 'flex', gap: '20px' }}>
            <div style={{ ...styles.card, flex: 1, borderLeft: `4px solid ${theme.green}`, marginBottom: 0 }}>
              <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '4px' }}>IMPORTED</div>
              <div style={{ fontSize: '28px', fontWeight: '700', color: theme.green }}>{result.imported}</div>
            </div>
            <div style={{ ...styles.card, flex: 1, borderLeft: `4px solid ${theme.textMuted}`, marginBottom: 0 }}>
              <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '4px' }}>SKIPPED</div>
              <div style={{ fontSize: '28px', fontWeight: '700', color: theme.textMuted }}>{result.skipped}</div>
            </div>
            {result.errors > 0 && <div style={{ ...styles.card, flex: 1, borderLeft: `4px solid ${theme.red}`, marginBottom: 0 }}>
              <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '4px' }}>ERRORS</div>
              <div style={{ fontSize: '28px', fontWeight: '700', color: theme.red }}>{result.errors}</div>
              <div style={{ fontSize: '11px', color: theme.textMuted, marginTop: '4px' }}>Note: historical_payroll_import table may need to be created in Supabase</div>
            </div>}
          </div>
          <button style={{ ...styles.btn('secondary'), marginTop: '16px' }} onClick={() => { setStep(0); setRows([]); setValidated([]); setResult(null) }}>Import Another File</button>
        </div>
      )}
    </div>
  )
}

// ── MAIN COMPONENT ───────────────────────────────────────────────────────────
export default function DataImport() {
  const [importType, setImportType] = useState(null)

  return (
    <div style={styles.page}>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ margin: '0 0 4px', fontSize: '22px', fontWeight: '700', color: theme.text }}>Historical Data Import</h1>
        <div style={{ fontSize: '13px', color: theme.textMuted }}>Bulk import historical records from Excel files — MD access only</div>
      </div>

      {!importType ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', maxWidth: '600px' }}>
          <button onClick={() => setImportType('loading')} style={{ ...styles.card, cursor: 'pointer', textAlign: 'left', border: `1px solid ${theme.border}`, background: theme.card, transition: 'border-color 0.15s' }} onMouseOver={e => e.currentTarget.style.borderColor = theme.accent} onMouseOut={e => e.currentTarget.style.borderColor = theme.border}>
            <div style={{ fontSize: '28px', marginBottom: '8px' }}>🚛</div>
            <div style={{ fontWeight: '700', color: theme.text, marginBottom: '4px' }}>Loading Log</div>
            <div style={{ fontSize: '12px', color: theme.textMuted }}>Import historical truck loading records with waybill numbers, quantities and amounts</div>
          </button>
          <button onClick={() => setImportType('payroll')} style={{ ...styles.card, cursor: 'pointer', textAlign: 'left', border: `1px solid ${theme.border}`, background: theme.card, transition: 'border-color 0.15s' }} onMouseOver={e => e.currentTarget.style.borderColor = theme.accent} onMouseOut={e => e.currentTarget.style.borderColor = theme.border}>
            <div style={{ fontSize: '28px', marginBottom: '8px' }}>📋</div>
            <div style={{ fontWeight: '700', color: theme.text, marginBottom: '4px' }}>Weekly Labour Payroll</div>
            <div style={{ fontSize: '12px', color: theme.textMuted }}>Import weekly payroll sheets with worker names, daily attendance and pay breakdown</div>
          </button>
        </div>
      ) : (
        <div>
          <button onClick={() => setImportType(null)} style={{ ...styles.btn('secondary'), marginBottom: '20px' }}>← Back to Import Types</button>
          <div style={{ fontWeight: '700', fontSize: '16px', marginBottom: '20px', color: theme.text }}>
            {importType === 'loading' ? '🚛 Loading Log Import' : '📋 Weekly Labour Payroll Import'}
          </div>
          {importType === 'loading' ? <LoadingLogImporter /> : <WeeklyPayrollImporter />}
        </div>
      )}
    </div>
  )
}
