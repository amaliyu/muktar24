import React, { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

const theme = {
  bg: '#0f1117', surface: '#1a1d27', card: '#21263a', border: '#2e3452',
  accent: '#f5a623', green: '#2dd4a0', red: '#f06b6b', blue: '#5b8dee',
  purple: '#9b59b6', text: '#e8eaf0', textMuted: '#7c839e', textDim: '#4a5175',
}

const naira = n => `₦${Math.round(Number(n) || 0).toLocaleString()}`
const fmt   = n => Number(n || 0).toLocaleString()
const pct   = (a, b) => b ? ((a / b) * 100).toFixed(1) + '%' : '0%'
const today = () => new Date().toISOString().split('T')[0]

const s = {
  page:    { padding: '20px', maxWidth: '1400px', margin: '0 auto' },
  card:    { background: theme.card, border: `1px solid ${theme.border}`, borderRadius: '10px', padding: '16px' },
  label:   { fontSize: '10px', fontWeight: '700', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' },
  val:     { fontSize: '26px', fontWeight: '800', color: theme.text, lineHeight: 1.1 },
  sub:     { fontSize: '11px', color: theme.textMuted, marginTop: '4px' },
  grid:    cols => ({ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: '14px' }),
  row:     { display: 'flex', gap: '10px', alignItems: 'center' },
  input:   { background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: '7px', padding: '8px 12px', color: theme.text, fontSize: '13px', outline: 'none' },
  btn:     (v='secondary') => ({ padding: '8px 16px', borderRadius: '7px', border: `1px solid ${v==='primary'?theme.accent:v==='danger'?theme.red:theme.border}`, background: v==='primary'?theme.accent+'22':v==='danger'?theme.red+'22':'transparent', color: v==='primary'?theme.accent:v==='danger'?theme.red:theme.text, fontWeight: '600', fontSize: '12px', cursor: 'pointer' }),
  tab:     active => ({ padding: '7px 16px', borderRadius: '6px', border: `1px solid ${active?theme.accent:theme.border}`, background: active?theme.accent+'22':'transparent', color: active?theme.accent:theme.textMuted, fontWeight: '600', fontSize: '12px', cursor: 'pointer' }),
  badge:   color => ({ padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: '600', background: color+'22', color }),
  section: { fontSize: '11px', fontWeight: '700', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '20px 0 10px' },
}

// ── SVG CHARTS ─────────────────────────────────────────────────────
const BarChart = ({ data, colorFn, height = 140 }) => {
  if (!data?.length) return <div style={{ color: theme.textMuted, fontSize: '12px', padding: '20px 0' }}>No data</div>
  const max = Math.max(...data.map(d => d.value), 1)
  const barW = Math.floor(280 / data.length) - 4
  return (
    <svg width="100%" viewBox={`0 0 280 ${height}`} style={{ overflow: 'visible' }}>
      {data.map((d, i) => {
        const h = Math.max(2, (d.value / max) * (height - 30))
        const x = i * (280 / data.length) + 2
        const y = height - 20 - h
        return (
          <g key={i}>
            <rect x={x} y={y} width={barW} height={h} fill={colorFn ? colorFn(d, i) : theme.accent} rx="2" opacity="0.85" />
            <text x={x + barW / 2} y={height - 6} textAnchor="middle" fontSize="8" fill={theme.textMuted} style={{ fontFamily: 'sans-serif' }}>{d.label?.slice(0, 6)}</text>
            {h > 14 && <text x={x + barW / 2} y={y + 11} textAnchor="middle" fontSize="8" fill={theme.text} style={{ fontFamily: 'sans-serif' }}>{fmt(d.value)}</text>}
          </g>
        )
      })}
    </svg>
  )
}

const LineChart = ({ data, color = theme.accent, height = 100 }) => {
  if (!data?.length) return null
  const vals = data.map(d => d.value)
  const max = Math.max(...vals, 1), min = Math.min(...vals, 0)
  const W = 280, H = height - 20
  const pts = data.map((d, i) => {
    const x = data.length === 1 ? W / 2 : (i / (data.length - 1)) * W
    const y = H - ((d.value - min) / (max - min || 1)) * H
    return `${x},${y}`
  }).join(' ')
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${height}`}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
      {data.map((d, i) => {
        const x = data.length === 1 ? W / 2 : (i / (data.length - 1)) * W
        const y = H - ((d.value - min) / (max - min || 1)) * H
        return <circle key={i} cx={x} cy={y} r="3" fill={color} />
      })}
      {data.map((d, i) => {
        const x = data.length === 1 ? W / 2 : (i / (data.length - 1)) * W
        return <text key={i} x={x} y={height - 2} textAnchor="middle" fontSize="8" fill={theme.textMuted} style={{ fontFamily: 'sans-serif' }}>{d.label}</text>
      })}
    </svg>
  )
}

const DonutChart = ({ segments, size = 90 }) => {
  if (!segments?.length) return null
  const total = segments.reduce((s, d) => s + d.value, 0)
  if (!total) return null
  const r = 34, cx = size / 2, cy = size / 2
  let cumAngle = -Math.PI / 2
  const slices = segments.map(d => {
    const angle = (d.value / total) * 2 * Math.PI
    const x1 = cx + r * Math.cos(cumAngle), y1 = cy + r * Math.sin(cumAngle)
    cumAngle += angle
    const x2 = cx + r * Math.cos(cumAngle), y2 = cy + r * Math.sin(cumAngle)
    const large = angle > Math.PI ? 1 : 0
    return { path: `M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${large},1 ${x2},${y2} Z`, color: d.color, label: d.label, value: d.value }
  })
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {slices.map((sl, i) => <path key={i} d={sl.path} fill={sl.color} opacity="0.88" />)}
      <circle cx={cx} cy={cy} r={r * 0.55} fill={theme.card} />
    </svg>
  )
}

const TrendBadge = ({ current, previous }) => {
  if (previous == null || previous === 0) return null
  const delta = ((current - previous) / Math.abs(previous)) * 100
  const up = delta >= 0
  return (
    <span style={{ ...s.badge(up ? theme.green : theme.red), fontSize: '10px', marginLeft: '6px' }}>
      {up ? '▲' : '▼'} {Math.abs(delta).toFixed(1)}%
    </span>
  )
}

const ProgressBar = ({ value, target, color }) => {
  const pctVal = target ? Math.min((value / target) * 100, 100) : 0
  const c = pctVal >= 90 ? theme.green : pctVal >= 70 ? theme.accent : theme.red
  return (
    <div style={{ marginTop: '8px' }}>
      <div style={{ height: '6px', background: theme.border, borderRadius: '3px', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pctVal}%`, background: color || c, borderRadius: '3px', transition: 'width 0.4s' }} />
      </div>
      {target > 0 && <div style={{ fontSize: '10px', color: theme.textMuted, marginTop: '3px' }}>{pctVal.toFixed(0)}% of target ({fmt(target)})</div>}
    </div>
  )
}

const KPICard = ({ label, value, sub, accent, trend, target, targetVal, children }) => (
  <div style={{ ...s.card, borderLeft: `3px solid ${accent || theme.accent}` }}>
    <div style={s.label}>{label}</div>
    <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px', flexWrap: 'wrap' }}>
      <div style={{ ...s.val, color: accent || theme.text }}>{value}</div>
      {trend}
    </div>
    {sub && <div style={s.sub}>{sub}</div>}
    {target && targetVal != null && <ProgressBar value={targetVal} target={target} />}
    {children}
  </div>
)

// ── DATE RANGE HELPERS ─────────────────────────────────────────────
const getRange = (preset) => {
  const d = new Date(), y = d.getFullYear(), m = d.getMonth()
  const iso = dt => dt.toISOString().split('T')[0]
  if (preset === 'today') return { from: today(), to: today() }
  if (preset === 'week') {
    const dow = d.getDay(), mon = new Date(d); mon.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1))
    return { from: iso(mon), to: today() }
  }
  if (preset === 'month') return { from: `${y}-${String(m + 1).padStart(2, '0')}-01`, to: today() }
  if (preset === 'lastmonth') {
    const lm = new Date(y, m - 1, 1), lme = new Date(y, m, 0)
    return { from: iso(lm), to: iso(lme) }
  }
  if (preset === 'quarter') {
    const qStart = new Date(y, Math.floor(m / 3) * 3, 1)
    return { from: iso(qStart), to: today() }
  }
  if (preset === 'year') return { from: `${y}-01-01`, to: today() }
  return { from: '', to: '' }
}

const prevPeriod = (from, to) => {
  const diff = (new Date(to) - new Date(from))
  const pFrom = new Date(new Date(from) - diff - 86400000)
  const pTo   = new Date(new Date(from) - 86400000)
  const iso = dt => dt.toISOString().split('T')[0]
  return { from: iso(pFrom), to: iso(pTo) }
}

const PALETTE = [theme.accent, theme.blue, theme.green, theme.purple, theme.red, '#e67e22', '#1abc9c']

// ── MAIN COMPONENT ─────────────────────────────────────────────────
export default function KPIDashboard() {
  const [tab, setTab]         = useState('overview')
  const [preset, setPreset]   = useState('month')
  const [range, setRange]     = useState(getRange('month'))
  const [loading, setLoading] = useState(false)
  const [data, setData]       = useState({})
  const [targets, setTargets] = useState(() => {
    try { return JSON.parse(localStorage.getItem('kpi_targets') || '{}') } catch { return {} }
  })
  const [showTargets, setShowTargets] = useState(false)
  const [targetForm, setTargetForm]   = useState({})

  const saveTargets = (t) => { setTargets(t); localStorage.setItem('kpi_targets', JSON.stringify(t)) }

  const applyPreset = (p) => {
    setPreset(p)
    if (p !== 'custom') setRange(getRange(p))
  }

  const load = useCallback(async () => {
    if (!range.from || !range.to) return
    setLoading(true)
    try {
      const { from, to } = range
      const { from: pFrom, to: pTo } = prevPeriod(from, to)

      const [
        prodCurr, prodPrev, dmgLog,
        payCurr, payPrev, invoices,
        orders, customers,
        waybills, pendingReg,
        attendance, staff,
        expenses, bankAccts,
        monthlyProd, monthlyRev,
      ] = await Promise.allSettled([
        // Production current + prev
        supabase.from('production_log').select('date,block_type,quantity_produced,cement_bags,diesel_litres,granite_dust_kg').gte('date', from).lte('date', to),
        supabase.from('production_log').select('quantity_produced,cement_bags,diesel_litres,granite_dust_kg').gte('date', pFrom).lte('date', pTo),
        // Damage log
        supabase.from('damage_log').select('date,block_type,stage,quantity_damaged').gte('date', from).lte('date', to),
        // Payments current + prev
        supabase.from('payments').select('amount_paid,payment_date,invoice_id,invoice:invoice_id(order:order_id(customer:customer_id(id,name)))').eq('status','confirmed').gte('payment_date', from).lte('payment_date', to),
        supabase.from('payments').select('amount_paid').eq('status','confirmed').gte('payment_date', pFrom).lte('payment_date', pTo),
        // Invoices
        supabase.from('invoices').select('total_amount,issued_date').gte('issued_date', from).lte('issued_date', to),
        // Orders
        supabase.from('orders').select('id,created_at,status,order_items(quantity,unit_price),customer:customer_id(id,name)').gte('created_at', from + 'T00:00:00').lte('created_at', to + 'T23:59:59'),
        // Customers
        supabase.from('customers').select('id,created_at'),
        // Waybills
        supabase.from('waybills').select('waybill_date,block_type,quantity_loaded,quantity_received,quantity_damaged,vehicle_id,truck_number').gte('waybill_date', from).lte('waybill_date', to),
        // Pending register
        supabase.from('pending_delivery_register').select('block_type,remaining_qty,total_qty,status,added_at,customer:customer_id(name)').neq('status','completed'),
        // Attendance — no staff embed; staff_type resolved via separate staff_public lookup below
        supabase.from('attendance').select('date,present,staff_id').gte('date', from).lte('date', to),
        // Staff — staff_public is readable by all authenticated roles
        supabase.from('staff_public').select('id,role,staff_type,is_active'),
        // Expenses
        supabase.from('expenses').select('amount,expense_date,status,category:category_id(name,parent_category),vendor').eq('status','approved').gte('expense_date', from).lte('expense_date', to),
        // Bank accounts
        supabase.from('bank_accounts').select('account_name,current_balance'),
        // Monthly production (last 12 months)
        supabase.from('production_log').select('date,quantity_produced').gte('date', new Date(new Date().setFullYear(new Date().getFullYear() - 1)).toISOString().split('T')[0]),
        // Monthly revenue (last 12 months)
        supabase.from('payments').select('amount_paid,payment_date').eq('status','confirmed').gte('payment_date', new Date(new Date().setFullYear(new Date().getFullYear() - 1)).toISOString().split('T')[0]),
      ])

      const g = r => r.status === 'fulfilled' ? (r.value.data || []) : []

      // Resolve staff_type for attendance rows via staff_public (no base-staff embed)
      const attendanceRows = g(attendance)
      const attStaffIds = [...new Set(attendanceRows.map(a => a.staff_id).filter(Boolean))]
      const { data: attStaffRows } = attStaffIds.length
        ? await supabase.from('staff_public').select('id,staff_type').in('id', attStaffIds)
        : { data: [] }
      const attStaffTypeMap = Object.fromEntries((attStaffRows || []).map(s => [s.id, s.staff_type]))
      const attendanceWithType = attendanceRows.map(a => ({ ...a, _staff_type: attStaffTypeMap[a.staff_id] || null }))

      setData({
        prodCurr: g(prodCurr), prodPrev: g(prodPrev), dmgLog: g(dmgLog),
        payCurr: g(payCurr), payPrev: g(payPrev), invoices: g(invoices),
        orders: g(orders), customers: g(customers),
        waybills: g(waybills), pendingReg: g(pendingReg),
        attendance: attendanceWithType, staff: g(staff),
        expenses: g(expenses), bankAccts: g(bankAccts),
        monthlyProd: g(monthlyProd), monthlyRev: g(monthlyRev),
        range, pRange: { from: pFrom, to: pTo },
      })
    } finally { setLoading(false) }
  }, [range])

  useEffect(() => { load() }, [load])

  // ── COMPUTED METRICS ─────────────────────────────────────────────
  const M = (() => {
    if (!data.prodCurr) return {}
    const { prodCurr, prodPrev, dmgLog, payCurr, payPrev, invoices,
            orders, customers, waybills, pendingReg, attendance, staff,
            expenses, bankAccts, monthlyProd, monthlyRev,
            range: r } = data

    // Production
    const totalProduced      = prodCurr.reduce((s, p) => s + (p.quantity_produced || 0), 0)
    const prevProduced       = prodPrev.reduce((s, p) => s + (p.quantity_produced || 0), 0)
    const cementUsed         = prodCurr.reduce((s, p) => s + (Number(p.cement_bags) || 0), 0)
    const dieselUsed         = prodCurr.reduce((s, p) => s + (Number(p.diesel_litres) || 0), 0)
    const graniteUsed        = prodCurr.reduce((s, p) => s + (Number(p.granite_dust_kg) || 0), 0)
    const prodDays           = new Set(prodCurr.map(p => p.date)).size
    const workingDays        = Math.max(1, Math.ceil((new Date(r.to) - new Date(r.from)) / 86400000) + 1)
    const dailyAvgProd       = prodDays > 0 ? Math.round(totalProduced / prodDays) : 0
    const prodByType         = {}; prodCurr.forEach(p => { prodByType[p.block_type] = (prodByType[p.block_type] || 0) + p.quantity_produced })
    const dmgProduction      = dmgLog.filter(d => ['production','stacking'].includes(d.stage)).reduce((s, d) => s + d.quantity_damaged, 0)
    const dmgTransit         = dmgLog.filter(d => d.stage === 'delivery').reduce((s, d) => s + d.quantity_damaged, 0)
    const dmgByType          = {}; dmgLog.forEach(d => { dmgByType[d.block_type] = (dmgByType[d.block_type] || 0) + d.quantity_damaged })

    // Revenue
    const revenue            = payCurr.reduce((s, p) => s + Number(p.amount_paid), 0)
    const prevRevenue        = payPrev.reduce((s, p) => s + Number(p.amount_paid), 0)
    const totalInvoiced      = invoices.reduce((s, i) => s + Number(i.total_amount), 0)
    const collectionRate     = totalInvoiced > 0 ? (revenue / totalInvoiced * 100).toFixed(1) : 0

    // Customer revenue map
    const custRevMap = {}; payCurr.forEach(p => {
      const cid   = p.invoice?.order?.customer?.id
      const cname = p.invoice?.order?.customer?.name || 'Unknown'
      if (cid) { custRevMap[cid] = custRevMap[cid] || { name: cname, total: 0 }; custRevMap[cid].total += Number(p.amount_paid) }
    })
    const top5Customers = Object.values(custRevMap).sort((a, b) => b.total - a.total).slice(0, 5)

    const orderCount         = orders.length
    const orderValue         = orders.reduce((s, o) => s + (o.order_items || []).reduce((ss, i) => ss + i.quantity * i.unit_price, 0), 0)
    const avgOrderVal        = orderCount > 0 ? orderValue / orderCount : 0
    const newCustCount       = customers.filter(c => c.created_at >= r.from).length
    const repeatCustCount    = (() => {
      const freq = {}; orders.forEach(o => { if (o.customer?.id) freq[o.customer.id] = (freq[o.customer.id] || 0) + 1 })
      return Object.values(freq).filter(v => v > 1).length
    })()

    // Delivery
    const totalTrips         = waybills.length
    const totalLoaded        = waybills.reduce((s, w) => s + (w.quantity_loaded || 0), 0)
    const totalReceived      = waybills.reduce((s, w) => s + (w.quantity_received || 0), 0)
    const totalDamaged       = waybills.reduce((s, w) => s + (w.quantity_damaged || 0), 0)
    const damageRate         = totalLoaded > 0 ? (totalDamaged / totalLoaded * 100).toFixed(2) : 0
    const vehicleMap         = {}; waybills.forEach(w => {
      const k = w.truck_number || w.vehicle_id || 'Unknown'
      vehicleMap[k] = vehicleMap[k] || { trips: 0, loaded: 0, received: 0, damaged: 0 }
      vehicleMap[k].trips++; vehicleMap[k].loaded += (w.quantity_loaded || 0)
      vehicleMap[k].received += (w.quantity_received || 0); vehicleMap[k].damaged += (w.quantity_damaged || 0)
    })
    const pendingTotal       = pendingReg.reduce((s, p) => s + (p.remaining_qty || 0), 0)
    const oldestPending      = pendingReg.length > 0 ? Math.max(...pendingReg.map(p => Math.ceil((new Date() - new Date(p.added_at)) / 86400000))) : 0

    // Staff
    const activeStaff        = staff.filter(s => s.is_active)
    const dailyStaff         = activeStaff.filter(s => s.staff_type === 'daily')
    const permStaff          = activeStaff.filter(s => s.staff_type === 'permanent')
    const attendanceRecords  = attendance.filter(a => a.present && a._staff_type === 'daily')
    const totalDailySlots    = attendance.filter(a => a._staff_type === 'daily').length
    const attendanceRate     = totalDailySlots > 0 ? (attendanceRecords.length / totalDailySlots * 100).toFixed(1) : 0

    // Financial
    const totalExpenses      = expenses.reduce((s, e) => s + Number(e.amount), 0)
    const cashPosition       = bankAccts.reduce((s, b) => s + Number(b.current_balance || 0), 0)
    const grossProfit        = revenue - totalExpenses
    const grossMargin        = revenue > 0 ? (grossProfit / revenue * 100).toFixed(1) : 0
    const expByCategory      = {}; expenses.forEach(e => {
      const cat = e.category?.parent_category || e.category?.name || 'Other'
      expByCategory[cat] = (expByCategory[cat] || 0) + Number(e.amount)
    })
    const expCategories      = Object.entries(expByCategory).sort((a, b) => b[1] - a[1]).slice(0, 6)

    // Monthly trends
    const monthBucket = (dateStr) => dateStr?.slice(0, 7)
    const monthlyProdMap = {}; monthlyProd.forEach(p => {
      const m = monthBucket(p.date); if (m) monthlyProdMap[m] = (monthlyProdMap[m] || 0) + p.quantity_produced
    })
    const monthlyRevMap = {}; monthlyRev.forEach(p => {
      const m = monthBucket(p.payment_date); if (m) monthlyRevMap[m] = (monthlyRevMap[m] || 0) + Number(p.amount_paid)
    })
    const last12 = Array.from({ length: 12 }, (_, i) => {
      const d = new Date(); d.setMonth(d.getMonth() - 11 + i)
      return d.toISOString().slice(0, 7)
    })
    const prodTrend = last12.map(m => ({ label: m.slice(5), value: monthlyProdMap[m] || 0 }))
    const revTrend  = last12.map(m => ({ label: m.slice(5), value: monthlyRevMap[m] || 0 }))

    return {
      totalProduced, prevProduced, cementUsed, dieselUsed, graniteUsed,
      prodDays, dailyAvgProd, workingDays, prodByType,
      dmgProduction, dmgTransit, dmgByType,
      revenue, prevRevenue, totalInvoiced, collectionRate,
      top5Customers, orderCount, orderValue, avgOrderVal,
      newCustCount, repeatCustCount,
      totalTrips, totalLoaded, totalReceived, totalDamaged, damageRate,
      vehicleMap, pendingTotal, oldestPending,
      activeStaff, dailyStaff, permStaff,
      attendanceRate,
      totalExpenses, cashPosition, grossProfit, grossMargin, expByCategory, expCategories,
      prodTrend, revTrend,
    }
  })()

  // ── TABS ─────────────────────────────────────────────────────────
  const TABS = [
    { id: 'overview',    label: '⊞ Overview' },
    { id: 'production',  label: '🏭 Production' },
    { id: 'sales',       label: '📋 Sales' },
    { id: 'delivery',    label: '📄 Delivery' },
    { id: 'staff',       label: '👥 Staff' },
    { id: 'financial',   label: '💰 Financial' },
  ]

  // ── PDF ─────────────────────────────────────────────────────────
  const downloadPDF = () => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const W = 210, now = new Date().toLocaleString()
    doc.setFillColor(15, 17, 23); doc.rect(0, 0, W, 40, 'F')
    doc.setTextColor(245, 166, 35); doc.setFontSize(18); doc.setFont('helvetica', 'bold')
    doc.text('Abuja Precast Concrete Limited', W / 2, 14, { align: 'center' })
    doc.setFontSize(12); doc.setTextColor(180, 180, 180)
    doc.text('KPI Dashboard Report', W / 2, 22, { align: 'center' })
    doc.setFontSize(9); doc.text(`Period: ${range.from} to ${range.to}`, W / 2, 30, { align: 'center' })
    doc.text(`Generated: ${now}`, W / 2, 36, { align: 'center' })
    let y = 48
    const section = (title) => {
      doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(245, 166, 35)
      doc.text(title, 14, y); y += 6
      doc.setDrawColor(80, 80, 80); doc.line(14, y, W - 14, y); y += 4
    }
    const kv = rows => {
      autoTable(doc, { startY: y, head: [['Metric', 'Value']], body: rows, theme: 'grid', styles: { fontSize: 9, cellPadding: 2 }, headStyles: { fillColor: [33, 38, 58], textColor: [245, 166, 35] }, columnStyles: { 0: { cellWidth: 100 }, 1: { fontStyle: 'bold' } } })
      y = doc.lastAutoTable.finalY + 6
    }
    section('PRODUCTION'); kv([
      ['Total Blocks Produced', fmt(M.totalProduced)],
      ['Daily Average', fmt(M.dailyAvgProd)],
      ['Production Days', M.prodDays],
      ['Cement Used (bags)', fmt(M.cementUsed)],
      ['Diesel Used (litres)', fmt(M.dieselUsed)],
      ['Granite Used (kg)', fmt(M.graniteUsed)],
      ['Production Damage', fmt(M.dmgProduction) + ` (${M.totalProduced > 0 ? (M.dmgProduction / M.totalProduced * 100).toFixed(1) : 0}%)`],
    ])
    section('SALES & REVENUE'); kv([
      ['Revenue Collected', naira(M.revenue)],
      ['Total Invoiced', naira(M.totalInvoiced)],
      ['Collection Rate', M.collectionRate + '%'],
      ['Orders Created', M.orderCount],
      ['Total Order Value', naira(M.orderValue)],
      ['Average Order Value', naira(M.avgOrderVal)],
      ['New Customers', M.newCustCount],
    ])
    section('DELIVERY'); kv([
      ['Total Trips', M.totalTrips],
      ['Total Blocks Loaded', fmt(M.totalLoaded)],
      ['Total Blocks Received', fmt(M.totalReceived)],
      ['Transit Damage Rate', M.damageRate + '%'],
      ['Pending Deliveries (blocks)', fmt(M.pendingTotal)],
      ['Oldest Pending (days)', M.oldestPending],
    ])
    section('STAFF & OPERATIONS'); kv([
      ['Active Staff', M.activeStaff?.length],
      ['Attendance Rate', M.attendanceRate + '%'],
    ])
    section('FINANCIAL'); kv([
      ['Revenue', naira(M.revenue)],
      ['Total Expenses', naira(M.totalExpenses)],
      ['Gross Profit', naira(M.grossProfit)],
      ['Gross Margin', M.grossMargin + '%'],
      ['Cash Position', naira(M.cashPosition)],
    ])
    if (M.top5Customers?.length) {
      section('TOP CUSTOMERS')
      autoTable(doc, { startY: y, head: [['Customer', 'Revenue']], body: M.top5Customers.map(c => [c.name, naira(c.total)]), theme: 'grid', styles: { fontSize: 9 }, headStyles: { fillColor: [33, 38, 58], textColor: [245, 166, 35] } })
      y = doc.lastAutoTable.finalY + 6
    }
    doc.save(`KPI_Report_${range.from}_${range.to}.pdf`)
  }

  // ── RENDER ───────────────────────────────────────────────────────
  const PRESETS = [['today','Today'],['week','This Week'],['month','This Month'],['lastmonth','Last Month'],['quarter','This Quarter'],['year','This Year'],['custom','Custom']]

  return (
    <div style={s.page}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <div style={{ fontSize: '20px', fontWeight: '800', color: theme.text }}>KPI Dashboard</div>
          <div style={{ fontSize: '12px', color: theme.textMuted, marginTop: '2px' }}>Abuja Precast Concrete Limited · {range.from} → {range.to}</div>
        </div>
        <div style={s.row}>
          <button data-ico-allow data-board-allow style={s.btn('primary')} onClick={downloadPDF}>↓ KPI Report PDF</button>
          <button style={s.btn()} onClick={() => { setTargetForm({ ...targets }); setShowTargets(true) }}>⚙ Set Targets</button>
          <button data-ico-allow data-board-allow style={s.btn()} onClick={load} disabled={loading}>{loading ? '…' : '↺'}</button>
        </div>
      </div>

      {/* Date Range */}
      <div style={{ ...s.card, marginBottom: '16px', padding: '12px 16px' }}>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
          {PRESETS.map(([p, l]) => (
            <button key={p} data-ico-allow data-board-allow style={s.tab(preset === p)} onClick={() => applyPreset(p)}>{l}</button>
          ))}
          {preset === 'custom' && (
            <>
              <input type="date" style={s.input} value={range.from} onChange={e => setRange(r => ({ ...r, from: e.target.value }))} />
              <span style={{ color: theme.textMuted }}>→</span>
              <input type="date" style={s.input} value={range.to} onChange={e => setRange(r => ({ ...r, to: e.target.value }))} />
            </>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '16px' }}>
        {TABS.map(t => <button key={t.id} data-ico-allow data-board-allow style={s.tab(tab === t.id)} onClick={() => setTab(t.id)}>{t.label}</button>)}
      </div>

      {loading && <div style={{ textAlign: 'center', padding: '60px', color: theme.textMuted, fontSize: '13px' }}>Loading KPIs…</div>}

      {!loading && M.revenue != null && (
        <>
          {/* ── OVERVIEW TAB ─────────────────────────────────── */}
          {tab === 'overview' && (
            <div>
              <div style={s.grid(4)}>
                <KPICard label="Blocks Produced" value={fmt(M.totalProduced)} accent={theme.accent}
                  trend={<TrendBadge current={M.totalProduced} previous={M.prevProduced} />}
                  sub={`${M.prodDays} production days`}
                  target={targets.monthlyProductionTarget} targetVal={M.totalProduced} />
                <KPICard label="Revenue Collected" value={naira(M.revenue)} accent={theme.green}
                  trend={<TrendBadge current={M.revenue} previous={M.prevRevenue} />}
                  sub={`Collection rate: ${M.collectionRate}%`}
                  target={targets.monthlyRevenueTarget} targetVal={M.revenue} />
                <KPICard label="Total Deliveries" value={fmt(M.totalTrips)} accent={theme.blue}
                  sub={`${fmt(M.totalReceived)} blocks delivered`} />
                <KPICard label="Gross Profit" value={naira(M.grossProfit)} accent={M.grossProfit >= 0 ? theme.green : theme.red}
                  sub={`Margin: ${M.grossMargin}%`} />
              </div>
              <div style={{ ...s.grid(4), marginTop: '14px' }}>
                <KPICard label="Transit Damage Rate" value={M.damageRate + '%'} accent={Number(M.damageRate) < 1 ? theme.green : Number(M.damageRate) < 2 ? theme.accent : theme.red}
                  sub={`${fmt(M.totalDamaged)} blocks damaged`} />
                <KPICard label="Cash Position" value={naira(M.cashPosition)} accent={theme.blue} sub="Across all bank accounts" />
                <KPICard label="Attendance Rate" value={M.attendanceRate + '%'} accent={Number(M.attendanceRate) > 80 ? theme.green : theme.accent}
                  sub={`${M.activeStaff?.length || 0} active staff`} />
                <KPICard label="Pending Deliveries" value={fmt(M.pendingTotal)} accent={theme.accent}
                  sub={`${M.oldestPending} days oldest`} />
              </div>
              <div style={{ ...s.grid(2), marginTop: '14px' }}>
                <div style={s.card}>
                  <div style={s.section}>Monthly Production Trend (12 months)</div>
                  <LineChart data={M.prodTrend} color={theme.accent} height={120} />
                </div>
                <div style={s.card}>
                  <div style={s.section}>Monthly Revenue Trend (12 months)</div>
                  <LineChart data={M.revTrend} color={theme.green} height={120} />
                </div>
              </div>
            </div>
          )}

          {/* ── PRODUCTION TAB ───────────────────────────────── */}
          {tab === 'production' && (
            <div>
              <div style={s.grid(4)}>
                <KPICard label="Total Blocks Produced" value={fmt(M.totalProduced)} accent={theme.accent}
                  trend={<TrendBadge current={M.totalProduced} previous={M.prevProduced} />}
                  sub={`vs ${fmt(M.prevProduced)} previous period`}
                  target={targets.monthlyProductionTarget} targetVal={M.totalProduced} />
                <KPICard label="Daily Average" value={fmt(M.dailyAvgProd)} accent={theme.blue}
                  sub={`Over ${M.prodDays} days with production`} />
                <KPICard label="Production Days" value={M.prodDays} accent={theme.textMuted}
                  sub={`of ${M.workingDays} calendar days in period`} />
                <KPICard label="Production Efficiency" value={targets.monthlyProductionTarget ? `${Math.min(100, Math.round(M.totalProduced / targets.monthlyProductionTarget * 100))}%` : '—'}
                  accent={theme.green} sub={targets.monthlyProductionTarget ? `Target: ${fmt(targets.monthlyProductionTarget)}` : 'Set a target to track'}
                  target={targets.monthlyProductionTarget} targetVal={M.totalProduced} />
              </div>
              <div style={s.section}>Production by Block Type</div>
              <div style={s.grid(3)}>
                {Object.entries(M.prodByType).map(([type, qty], i) => (
                  <div key={type} style={{ ...s.card, borderLeft: `3px solid ${PALETTE[i % PALETTE.length]}` }}>
                    <div style={s.label}>{type}</div>
                    <div style={{ ...s.val, color: PALETTE[i % PALETTE.length] }}>{fmt(qty)}</div>
                    <div style={s.sub}>{M.totalProduced > 0 ? (qty / M.totalProduced * 100).toFixed(1) : 0}% of total</div>
                  </div>
                ))}
              </div>
              <div style={s.section}>Material Consumption</div>
              <div style={s.grid(4)}>
                <KPICard label="Cement Used" value={`${fmt(M.cementUsed)} bags`} accent={theme.accent}
                  sub={M.totalProduced > 0 ? `${(M.cementUsed / M.totalProduced * 1000).toFixed(1)} bags per 1,000 blocks` : ''} />
                <KPICard label="Diesel (Production)" value={`${fmt(M.dieselUsed)} L`} accent={theme.blue}
                  sub={M.totalProduced > 0 ? `${(M.dieselUsed / M.totalProduced * 1000).toFixed(1)} litres per 1,000 blocks` : ''} />
                <KPICard label="Granite Dust" value={`${fmt(M.graniteUsed)} kg`} accent={theme.textMuted}
                  sub={M.totalProduced > 0 ? `${(M.graniteUsed / M.totalProduced * 1000).toFixed(1)} kg per 1,000 blocks` : ''} />
              </div>
              <div style={s.section}>Damage Analysis</div>
              <div style={s.grid(3)}>
                <KPICard label="Production + Stacking Damage" value={fmt(M.dmgProduction)} accent={theme.red}
                  sub={M.totalProduced > 0 ? `${(M.dmgProduction / M.totalProduced * 100).toFixed(2)}% of produced` : ''} />
                <KPICard label="Transit Damage" value={fmt(M.dmgTransit)} accent={theme.accent}
                  sub={M.totalLoaded > 0 ? `${(M.dmgTransit / M.totalLoaded * 100).toFixed(2)}% of loaded` : ''} />
                <div style={s.card}>
                  <div style={s.label}>Damage by Block Type</div>
                  {Object.entries(M.dmgByType).length === 0
                    ? <div style={s.sub}>No damage recorded in period</div>
                    : Object.entries(M.dmgByType).map(([t, v]) => (
                      <div key={t} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: `1px solid ${theme.border}22`, fontSize: '12px' }}>
                        <span style={{ color: theme.text }}>{t}</span>
                        <span style={{ color: theme.red, fontWeight: '700' }}>{fmt(v)}</span>
                      </div>
                    ))}
                </div>
              </div>
              <div style={{ ...s.card, marginTop: '14px' }}>
                <div style={s.section}>Monthly Production Trend</div>
                <BarChart data={M.prodTrend} colorFn={(d, i) => theme.accent} height={160} />
              </div>
            </div>
          )}

          {/* ── SALES TAB ────────────────────────────────────── */}
          {tab === 'sales' && (
            <div>
              <div style={s.grid(4)}>
                <KPICard label="Revenue Collected" value={naira(M.revenue)} accent={theme.green}
                  trend={<TrendBadge current={M.revenue} previous={M.prevRevenue} />}
                  target={targets.monthlyRevenueTarget} targetVal={M.revenue} />
                <KPICard label="Total Invoiced" value={naira(M.totalInvoiced)} accent={theme.blue}
                  sub={`Collection rate: ${M.collectionRate}%`} />
                <KPICard label="New Orders" value={M.orderCount} accent={theme.accent}
                  sub={`Value: ${naira(M.orderValue)}`} />
                <KPICard label="Avg Order Value" value={naira(M.avgOrderVal)} accent={theme.textMuted} />
              </div>
              <div style={{ ...s.grid(3), marginTop: '14px' }}>
                <KPICard label="New Customers" value={M.newCustCount} accent={theme.green}
                  sub="Registered in period" />
                <KPICard label="Repeat Customers" value={M.repeatCustCount} accent={theme.blue}
                  sub="Customers with >1 order" />
                <KPICard label="Outstanding Receivables" value={naira(Math.max(0, M.totalInvoiced - M.revenue))} accent={theme.red}
                  sub="Invoiced but not yet collected" />
              </div>
              <div style={s.section}>Top 5 Customers by Revenue</div>
              {M.top5Customers?.length > 0 ? (
                <div style={s.card}>
                  {M.top5Customers.map((c, i) => (
                    <div key={i} style={{ marginBottom: '10px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                        <span style={{ fontSize: '13px', fontWeight: '600', color: theme.text }}>{i + 1}. {c.name}</span>
                        <span style={{ fontSize: '13px', fontWeight: '700', color: theme.green }}>{naira(c.total)}</span>
                      </div>
                      <div style={{ height: '6px', background: theme.border, borderRadius: '3px' }}>
                        <div style={{ height: '100%', width: `${M.revenue > 0 ? (c.total / M.revenue * 100) : 0}%`, background: PALETTE[i], borderRadius: '3px' }} />
                      </div>
                      <div style={{ fontSize: '10px', color: theme.textMuted, marginTop: '2px' }}>{M.revenue > 0 ? (c.total / M.revenue * 100).toFixed(1) : 0}% of total revenue</div>
                    </div>
                  ))}
                </div>
              ) : <div style={{ ...s.card, color: theme.textMuted, fontSize: '12px', padding: '24px' }}>No payment data in this period.</div>}
              <div style={{ ...s.card, marginTop: '14px' }}>
                <div style={s.section}>Monthly Revenue Trend</div>
                <LineChart data={M.revTrend} color={theme.green} height={140} />
              </div>
            </div>
          )}

          {/* ── DELIVERY TAB ─────────────────────────────────── */}
          {tab === 'delivery' && (
            <div>
              <div style={s.grid(4)}>
                <KPICard label="Total Trips" value={fmt(M.totalTrips)} accent={theme.blue} />
                <KPICard label="Blocks Delivered" value={fmt(M.totalReceived)} accent={theme.green}
                  sub={`${fmt(M.totalLoaded)} loaded`} />
                <KPICard label="Transit Damage Rate" value={`${M.damageRate}%`}
                  accent={Number(M.damageRate) < 1 ? theme.green : Number(M.damageRate) < 2 ? theme.accent : theme.red}
                  sub={`${fmt(M.totalDamaged)} blocks · Target: <${targets.maxDamageRate || 1}%`}>
                  <div style={{ height: '6px', background: theme.border, borderRadius: '3px', marginTop: '8px' }}>
                    <div style={{ height: '100%', width: `${Math.min(Number(M.damageRate) / (targets.maxDamageRate || 2) * 100, 100)}%`, background: Number(M.damageRate) < 1 ? theme.green : theme.red, borderRadius: '3px' }} />
                  </div>
                </KPICard>
                <KPICard label="Pending Deliveries" value={fmt(M.pendingTotal)} accent={theme.accent}
                  sub={`Oldest: ${M.oldestPending} days · ${data.pendingReg?.length || 0} customers`} />
              </div>
              <div style={s.section}>Vehicle Performance</div>
              <div style={s.card}>
                {Object.keys(M.vehicleMap).length === 0 ? (
                  <div style={{ color: theme.textMuted, fontSize: '12px', padding: '20px 0' }}>No delivery data in period.</div>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                    <thead>
                      <tr>{['Vehicle','Trips','Loaded','Received','Damaged','Damage Rate'].map(h => (
                        <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontSize: '10px', fontWeight: '700', color: theme.textMuted, borderBottom: `1px solid ${theme.border}`, textTransform: 'uppercase' }}>{h}</th>
                      ))}</tr>
                    </thead>
                    <tbody>
                      {Object.entries(M.vehicleMap).sort((a, b) => b[1].trips - a[1].trips).map(([veh, v]) => {
                        const dr = v.loaded > 0 ? (v.damaged / v.loaded * 100).toFixed(2) : 0
                        return (
                          <tr key={veh}>
                            <td style={{ padding: '8px 10px', color: theme.text, fontWeight: '600' }}>{veh}</td>
                            <td style={{ padding: '8px 10px', color: theme.blue }}>{v.trips}</td>
                            <td style={{ padding: '8px 10px' }}>{fmt(v.loaded)}</td>
                            <td style={{ padding: '8px 10px', color: theme.green }}>{fmt(v.received)}</td>
                            <td style={{ padding: '8px 10px', color: theme.red }}>{fmt(v.damaged)}</td>
                            <td style={{ padding: '8px 10px' }}>
                              <span style={s.badge(Number(dr) < 1 ? theme.green : Number(dr) < 2 ? theme.accent : theme.red)}>{dr}%</span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )}
              </div>
              <div style={s.section}>Pending Deliveries</div>
              <div style={s.card}>
                {data.pendingReg?.length === 0 ? (
                  <div style={{ color: theme.textMuted, fontSize: '12px', padding: '20px 0' }}>All deliveries complete.</div>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                    <thead>
                      <tr>{['Customer','Block Type','Remaining','Days Waiting'].map(h => (
                        <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontSize: '10px', fontWeight: '700', color: theme.textMuted, borderBottom: `1px solid ${theme.border}`, textTransform: 'uppercase' }}>{h}</th>
                      ))}</tr>
                    </thead>
                    <tbody>
                      {(data.pendingReg || []).slice(0, 15).map((p, i) => {
                        const days = Math.ceil((new Date() - new Date(p.added_at)) / 86400000)
                        return (
                          <tr key={i}>
                            <td style={{ padding: '8px 10px', color: theme.text, fontWeight: '600' }}>{p.customer?.name || '—'}</td>
                            <td style={{ padding: '8px 10px' }}><span style={s.badge(theme.blue)}>{p.block_type}</span></td>
                            <td style={{ padding: '8px 10px', color: theme.accent, fontWeight: '700' }}>{fmt(p.remaining_qty)}</td>
                            <td style={{ padding: '8px 10px' }}><span style={s.badge(days > (targets.maxDeliveryDays || 14) ? theme.red : theme.green)}>{days}d</span></td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          {/* ── STAFF TAB ────────────────────────────────────── */}
          {tab === 'staff' && (
            <div>
              <div style={s.grid(2)}>
                <KPICard label="Active Staff" value={M.activeStaff?.length || 0} accent={theme.blue}
                  sub={`${M.permStaff?.length || 0} permanent · ${M.dailyStaff?.length || 0} daily`} />
                <KPICard label="Attendance Rate" value={`${M.attendanceRate}%`}
                  accent={Number(M.attendanceRate) >= 80 ? theme.green : theme.red}
                  sub="Daily workers in period" />
              </div>
              <div style={s.section}>Staff by Role</div>
              <div style={s.card}>
                {(() => {
                  const byRole = {}; (M.activeStaff || []).forEach(st => { byRole[st.role] = (byRole[st.role] || 0) + 1 })
                  const total = M.activeStaff?.length || 1
                  return Object.entries(byRole).sort((a,b)=>b[1]-a[1]).map(([role, count], i) => (
                    <div key={role} style={{ marginBottom: '10px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                        <span style={{ fontSize: '13px', color: theme.text }}>{role}</span>
                        <span style={{ fontSize: '13px', fontWeight: '700', color: theme.text }}>{count}</span>
                      </div>
                      <div style={{ height: '5px', background: theme.border, borderRadius: '3px' }}>
                        <div style={{ height: '100%', width: `${count / total * 100}%`, background: PALETTE[i % PALETTE.length], borderRadius: '3px' }} />
                      </div>
                    </div>
                  ))
                })()}
              </div>
              <div style={s.section}>Staff Type Breakdown</div>
              <div style={s.grid(2)}>
                <div style={s.card}>
                  <div style={s.label}>Permanent Staff</div>
                  <div style={{ ...s.val, color: theme.blue }}>{M.permStaff?.length || 0}</div>
                  <div style={s.sub}>Monthly salary basis</div>
                </div>
                <div style={s.card}>
                  <div style={s.label}>Daily Workers</div>
                  <div style={{ ...s.val, color: theme.accent }}>{M.dailyStaff?.length || 0}</div>
                  <div style={s.sub}>Attendance-based wages</div>
                </div>
              </div>
            </div>
          )}

          {/* ── FINANCIAL TAB ────────────────────────────────── */}
          {tab === 'financial' && (
            <div>
              <div style={s.grid(4)}>
                <KPICard label="Revenue" value={naira(M.revenue)} accent={theme.green}
                  trend={<TrendBadge current={M.revenue} previous={M.prevRevenue} />} />
                <KPICard label="Total Expenses" value={naira(M.totalExpenses)} accent={theme.red} />
                <KPICard label="Gross Profit" value={naira(M.grossProfit)} accent={M.grossProfit >= 0 ? theme.green : theme.red}
                  sub={`Margin: ${M.grossMargin}%`} />
                <KPICard label="Cash Position" value={naira(M.cashPosition)} accent={theme.blue}
                  sub="All bank accounts combined" />
              </div>
              <div style={s.section}>Expense Breakdown</div>
              <div style={{ ...s.card, display: 'flex', gap: '24px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <DonutChart size={120} segments={M.expCategories.map(([cat, val], i) => ({ label: cat, value: val, color: PALETTE[i % PALETTE.length] }))} />
                <div style={{ flex: 1, minWidth: '200px' }}>
                  {M.expCategories.map(([cat, val], i) => (
                    <div key={cat} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: `1px solid ${theme.border}22`, fontSize: '12px' }}>
                      <div style={s.row}>
                        <div style={{ width: '10px', height: '10px', borderRadius: '2px', background: PALETTE[i % PALETTE.length], flexShrink: 0 }} />
                        <span style={{ color: theme.text }}>{cat}</span>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontWeight: '700', color: theme.red }}>{naira(val)}</div>
                        <div style={{ fontSize: '10px', color: theme.textMuted }}>{M.totalExpenses > 0 ? (val / M.totalExpenses * 100).toFixed(1) : 0}%</div>
                      </div>
                    </div>
                  ))}
                  {M.expCategories.length === 0 && <div style={{ color: theme.textMuted, fontSize: '12px' }}>No approved expenses in period.</div>}
                </div>
              </div>
              <div style={{ ...s.grid(2), marginTop: '14px' }}>
                <div style={s.card}>
                  <div style={s.section}>Revenue Trend (12 months)</div>
                  <LineChart data={M.revTrend} color={theme.green} height={140} />
                </div>
                <div style={s.card}>
                  <div style={s.section}>Bank Accounts</div>
                  {(data.bankAccts || []).length === 0
                    ? <div style={{ color: theme.textMuted, fontSize: '12px' }}>No bank accounts found.</div>
                    : (data.bankAccts || []).map((b, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${theme.border}44`, fontSize: '13px' }}>
                        <span style={{ color: theme.text }}>{b.account_name}</span>
                        <span style={{ fontWeight: '700', color: Number(b.current_balance) >= 0 ? theme.green : theme.red }}>{naira(b.current_balance)}</span>
                      </div>
                    ))}
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0 0', fontSize: '14px', fontWeight: '700' }}>
                    <span style={{ color: theme.textMuted }}>Total Cash</span>
                    <span style={{ color: theme.green }}>{naira(M.cashPosition)}</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── TARGETS MODAL ────────────────────────────────────────── */}
      {showTargets && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div style={{ ...s.card, width: '100%', maxWidth: '480px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ fontWeight: '700', color: theme.text, fontSize: '15px' }}>Set KPI Targets</div>
              <button style={s.btn()} onClick={() => setShowTargets(false)}>✕</button>
            </div>
            {[
              ['monthlyProductionTarget', 'Monthly Production Target (blocks)', 'e.g. 50000'],
              ['monthlyRevenueTarget', 'Monthly Revenue Target (₦)', 'e.g. 5000000'],
              ['maxDamageRate', 'Max Acceptable Damage Rate (%)', 'e.g. 1'],
              ['maxDeliveryDays', 'Max Delivery Days per Order', 'e.g. 14'],
            ].map(([key, label, ph]) => (
              <div key={key} style={{ marginBottom: '14px' }}>
                <label style={s.label}>{label}</label>
                <input type="number" style={{ ...s.input, width: '100%', boxSizing: 'border-box' }} placeholder={ph}
                  value={targetForm[key] || ''}
                  onChange={e => setTargetForm(f => ({ ...f, [key]: e.target.value ? Number(e.target.value) : '' }))} />
              </div>
            ))}
            <div style={s.row}>
              <button style={s.btn('primary')} onClick={() => { saveTargets(targetForm); setShowTargets(false) }}>Save Targets</button>
              <button style={s.btn()} onClick={() => setShowTargets(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
