import React, { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

// ── Theme ─────────────────────────────────────────────────────────────
const theme = {
  bg: '#0f1117', surface: '#1a1d27', card: '#21263a', border: '#2e3452',
  accent: '#f5a623', green: '#2dd4a0', red: '#f06b6b', blue: '#5b8dee',
  text: '#e8eaf0', textMuted: '#7c839e',
}

// ── Helpers ───────────────────────────────────────────────────────────
const naira  = (n) => `₦${Math.round(Number(n) || 0).toLocaleString()}`
const fmt    = (n) => Number(n || 0).toLocaleString()
const today  = () => new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })
const isoToday = () => new Date().toISOString().split('T')[0]

const firstOfMonth = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}
const firstOfLastMonth = () => {
  const d = new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() - 1)
  return d.toISOString().split('T')[0]
}
const lastOfLastMonth = () => {
  const d = new Date()
  d.setDate(0)
  return d.toISOString().split('T')[0]
}
const monthLabel = (isoStr) => {
  if (!isoStr) return ''
  const [y, m] = isoStr.split('-')
  return new Date(+y, +m - 1, 1).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' })
}
const last12MonthStarts = () => {
  const months = []
  for (let i = 11; i >= 0; i--) {
    const d = new Date()
    d.setDate(1)
    d.setMonth(d.getMonth() - i)
    months.push(d.toISOString().split('T')[0].substring(0, 7))
  }
  return months
}
const daysBetween = (a, b) => Math.ceil((new Date(b) - new Date(a)) / 86400000)

const CHART_COLORS = [
  theme.accent, theme.blue, theme.green, theme.red,
  '#9b59b6', '#e67e22', '#1abc9c', '#e74c3c', '#3498db', '#2ecc71',
]

// ── SVG Charts ────────────────────────────────────────────────────────
const BarChart = ({ data, color = theme.accent, height = 160 }) => {
  if (!data || data.length === 0) {
    return (
      <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: theme.textMuted, fontSize: '12px' }}>
        No data available
      </div>
    )
  }
  const max = Math.max(...data.map(d => d.value), 1)
  const W = 480, barAreaH = height - 28, gap = 4
  const barW = Math.max(4, Math.floor((W - gap * data.length) / data.length) - gap)
  const step = W / data.length

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${height}`} style={{ overflow: 'visible', display: 'block' }}>
      {data.map((d, i) => {
        const bh = Math.max(2, (d.value / max) * barAreaH)
        const x  = i * step + (step - barW) / 2
        const y  = barAreaH - bh
        return (
          <g key={i}>
            <rect x={x} y={y} width={barW} height={bh} fill={Array.isArray(color) ? color[i % color.length] : color} rx="2" opacity="0.85" />
            <text x={x + barW / 2} y={height - 6} textAnchor="middle" fontSize="9" fill={theme.textMuted} fontFamily="sans-serif">
              {d.label}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

const PieChart = ({ segments, size = 160 }) => {
  if (!segments || segments.length === 0) return null
  const total = segments.reduce((s, d) => s + d.value, 0)
  if (!total) return null
  const r = (size / 2) * 0.72, cx = size / 2, cy = size / 2
  let cumAngle = -Math.PI / 2
  const slices = segments.map((d, i) => {
    const angle = (d.value / total) * 2 * Math.PI
    const x1 = cx + r * Math.cos(cumAngle)
    const y1 = cy + r * Math.sin(cumAngle)
    cumAngle += angle
    const x2 = cx + r * Math.cos(cumAngle)
    const y2 = cy + r * Math.sin(cumAngle)
    const large = angle > Math.PI ? 1 : 0
    return {
      path: `M${cx},${cy} L${x1.toFixed(2)},${y1.toFixed(2)} A${r},${r} 0 ${large},1 ${x2.toFixed(2)},${y2.toFixed(2)} Z`,
      color: d.color || CHART_COLORS[i % CHART_COLORS.length],
      label: d.label,
      value: d.value,
      pct:   ((d.value / total) * 100).toFixed(1),
    }
  })

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '18px', flexWrap: 'wrap' }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
        {slices.map((sl, i) => (
          <path key={i} d={sl.path} fill={sl.color} opacity="0.88" stroke={theme.card} strokeWidth="1" />
        ))}
        <circle cx={cx} cy={cy} r={r * 0.45} fill={theme.card} />
      </svg>
      <div style={{ flex: 1, minWidth: '120px' }}>
        {slices.map((sl, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '6px', fontSize: '11px' }}>
            <div style={{ width: '10px', height: '10px', borderRadius: '2px', background: sl.color, flexShrink: 0 }} />
            <span style={{ color: theme.textMuted, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sl.label}</span>
            <span style={{ color: theme.text, fontWeight: '600' }}>{sl.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Stat Card ─────────────────────────────────────────────────────────
const StatCard = ({ label, value, sub, accent, trend }) => {
  const up = trend > 0, down = trend < 0
  return (
    <div style={{ background: theme.card, border: `1px solid ${theme.border}`, borderRadius: '12px', padding: '18px 20px', borderTop: `3px solid ${accent || theme.accent}` }}>
      <div style={{ fontSize: '10px', fontWeight: '700', color: theme.textMuted, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '8px' }}>
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap' }}>
        <div style={{ fontSize: '24px', fontWeight: '800', color: accent || theme.text, lineHeight: 1.1 }}>{value}</div>
        {trend != null && trend !== 0 && (
          <span style={{ fontSize: '11px', fontWeight: '600', color: up ? theme.green : theme.red, background: (up ? theme.green : theme.red) + '22', padding: '2px 7px', borderRadius: '4px' }}>
            {up ? '▲' : '▼'} {Math.abs(trend).toFixed(1)}%
          </span>
        )}
      </div>
      {sub && <div style={{ fontSize: '12px', color: theme.textMuted, marginTop: '5px' }}>{sub}</div>}
    </div>
  )
}

// ── Alert Box ─────────────────────────────────────────────────────────
const AlertBox = ({ title, color, children, emptyMsg }) => (
  <div style={{ background: theme.card, border: `1px solid ${theme.border}`, borderRadius: '12px', padding: '18px 20px', flex: 1, minWidth: '200px' }}>
    <div style={{ fontSize: '11px', fontWeight: '700', color, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
      <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: color }} />
      {title}
    </div>
    <div style={{ fontSize: '12px', color: theme.text, lineHeight: 1.7 }}>
      {React.Children.count(children) === 0 ? (
        <span style={{ color: theme.textMuted }}>{emptyMsg || 'None'}</span>
      ) : children}
    </div>
  </div>
)

// ── Chart Card ────────────────────────────────────────────────────────
const ChartCard = ({ title, children }) => (
  <div style={{ background: theme.card, border: `1px solid ${theme.border}`, borderRadius: '12px', padding: '20px' }}>
    <div style={{ fontSize: '13px', fontWeight: '700', color: theme.text, marginBottom: '16px' }}>{title}</div>
    {children}
  </div>
)

// ── Section Header ────────────────────────────────────────────────────
const SectionHeader = ({ title }) => (
  <div style={{ fontSize: '11px', fontWeight: '700', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.1em', margin: '28px 0 14px', borderBottom: `1px solid ${theme.border}`, paddingBottom: '8px' }}>
    {title}
  </div>
)

// ── Main Component ────────────────────────────────────────────────────
export default function BoardDashboard() {
  const [loading, setLoading] = useState(true)
  const [d, setD] = useState({
    revThisMonth:     0,
    revLastMonth:     0,
    incomeThisMonth:  0,
    expenseThisMonth: 0,
    cashPosition:     0,
    receivables:      0,
    blocksThisMonth:  0,
    activeOrdersValue:0,
    revTrend:         [],
    prodTrend:        [],
    expenseByCategory:[],
    top5Customers:    [],
    overdueReceivables:[],
    expiringDocs:     [],
    lowStock:         [],
    pendingApprovals: 0,
  })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const thisMonthStart = firstOfMonth()
      const lastMonthStart = firstOfLastMonth()
      const lastMonthEnd   = lastOfLastMonth()
      const todayISO       = isoToday()
      const months12       = last12MonthStarts()
      const twelveMonthsAgo = months12[0] + '-01'
      const thirtyDaysFromNow = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0]
      const sixtyDaysAgo  = new Date(Date.now() - 60 * 86400000).toISOString().split('T')[0]
      const threeMonthsAgo = new Date(Date.now() - 90 * 86400000).toISOString().split('T')[0]

      const results = await Promise.allSettled([
        // 0: Current month confirmed payments
        supabase.from('payments').select('amount_paid').eq('status', 'confirmed').gte('payment_date', thisMonthStart),
        // 1: Previous month confirmed payments
        supabase.from('payments').select('amount_paid').eq('status', 'confirmed').gte('payment_date', lastMonthStart).lte('payment_date', lastMonthEnd),
        // 2: Current month income records
        supabase.from('income_records').select('amount').gte('record_date', thisMonthStart),
        // 3: Current month approved expenses
        supabase.from('expenses').select('amount').eq('status', 'approved').gte('expense_date', thisMonthStart),
        // 4: All bank accounts
        supabase.from('bank_accounts').select('current_balance'),
        // 5: Invoices for receivables
        supabase.from('invoices').select('id, total_amount, issued_date, order:order_id(customer:customer_id(id, name)), payments(amount_paid, status)'),
        // 6: Production this month
        supabase.from('production_log').select('quantity_produced').gte('date', thisMonthStart),
        // 7: Active orders with items
        supabase.from('orders').select('id, order_items(subtotal)').not('status', 'in', '("delivered","cancelled")'),
        // 8: Revenue last 12 months
        supabase.from('payments').select('amount_paid, payment_date').eq('status', 'confirmed').gte('payment_date', twelveMonthsAgo),
        // 9: Production last 12 months
        supabase.from('production_log').select('quantity_produced, date').gte('date', twelveMonthsAgo),
        // 10: Expenses by category last 3 months
        supabase.from('expenses').select('amount, category:category_id(name, parent_category)').neq('status', 'rejected').gte('expense_date', threeMonthsAgo),
        // 11: Payments for top 5 customers (last 12 months)
        supabase.from('payments').select('amount_paid, invoice:invoice_id(order:order_id(customer:customer_id(id, name)))').eq('status', 'confirmed').gte('payment_date', twelveMonthsAgo),
        // 12: Vehicles for expiring docs
        supabase.from('vehicles').select('id, vehicle_number, vehicle_name, insurance_expiry_date, road_worthiness_expiry_date').eq('status', 'active'),
        // 13: Low stock items
        supabase.from('inventory_items').select('name, current_stock, reorder_level'),
        // 14: Pending LPO approvals
        supabase.from('lpo_orders').select('id').eq('status', 'pending'),
      ])

      const get = (i) => results[i]?.status === 'fulfilled' ? (results[i].value.data || []) : []

      // Current month revenue
      const revThisMonth = get(0).reduce((s, p) => s + Number(p.amount_paid || 0), 0)
      const revLastMonth = get(1).reduce((s, p) => s + Number(p.amount_paid || 0), 0)

      // Income and expenses
      const incomeThisMonth  = get(2).reduce((s, r) => s + Number(r.amount || 0), 0) + revThisMonth
      const expenseThisMonth = get(3).reduce((s, e) => s + Number(e.amount || 0), 0)

      // Cash position
      const cashPosition = get(4).reduce((s, b) => s + Number(b.current_balance || 0), 0)

      // Receivables
      const allInvoices = get(5)
      const receivables = allInvoices.reduce((total, inv) => {
        const confirmed = (inv.payments || [])
          .filter(p => p.status === 'confirmed')
          .reduce((s, p) => s + Number(p.amount_paid || 0), 0)
        const outstanding = Math.max(0, Number(inv.total_amount || 0) - confirmed)
        return total + outstanding
      }, 0)

      // Overdue receivables (> 60 days with outstanding balance)
      const overdueReceivables = allInvoices.reduce((arr, inv) => {
        const confirmed = (inv.payments || [])
          .filter(p => p.status === 'confirmed')
          .reduce((s, p) => s + Number(p.amount_paid || 0), 0)
        const outstanding = Number(inv.total_amount || 0) - confirmed
        if (outstanding > 0 && inv.issued_date && inv.issued_date < sixtyDaysAgo) {
          arr.push({
            customer: inv.order?.customer?.name || 'Unknown',
            amount:   outstanding,
            days:     daysBetween(inv.issued_date, isoToday()),
          })
        }
        return arr
      }, []).sort((a, b) => b.amount - a.amount).slice(0, 8)

      // Production this month
      const blocksThisMonth = get(6).reduce((s, r) => s + Number(r.quantity_produced || 0), 0)

      // Active orders value
      const activeOrdersValue = get(7).reduce((s, o) => {
        const itemsTotal = (o.order_items || []).reduce((ss, i) => ss + Number(i.subtotal || 0), 0)
        return s + itemsTotal
      }, 0)

      // Revenue trend last 12 months
      const revByMonth = {}
      months12.forEach(m => { revByMonth[m] = 0 })
      get(8).forEach(p => {
        if (p.payment_date) {
          const key = p.payment_date.substring(0, 7)
          if (revByMonth[key] !== undefined) revByMonth[key] += Number(p.amount_paid || 0)
        }
      })
      const revTrend = months12.map(m => ({ label: monthLabel(m + '-01'), value: revByMonth[m] || 0 }))

      // Production trend last 12 months
      const prodByMonth = {}
      months12.forEach(m => { prodByMonth[m] = 0 })
      get(9).forEach(p => {
        if (p.date) {
          const key = p.date.substring(0, 7)
          if (prodByMonth[key] !== undefined) prodByMonth[key] += Number(p.quantity_produced || 0)
        }
      })
      const prodTrend = months12.map(m => ({ label: monthLabel(m + '-01'), value: prodByMonth[m] || 0 }))

      // Expense by category
      const catMap = {}
      get(10).forEach(e => {
        const cat = e.category?.parent_category || e.category?.name || 'Other'
        catMap[cat] = (catMap[cat] || 0) + Number(e.amount || 0)
      })
      const expenseByCategory = Object.entries(catMap)
        .map(([label, value], i) => ({ label, value, color: CHART_COLORS[i % CHART_COLORS.length] }))
        .sort((a, b) => b.value - a.value)

      // Top 5 customers
      const custMap = {}
      get(11).forEach(p => {
        const cust = p.invoice?.order?.customer
        if (cust) {
          if (!custMap[cust.id]) custMap[cust.id] = { name: cust.name, total: 0 }
          custMap[cust.id].total += Number(p.amount_paid || 0)
        }
      })
      const totalRev = Object.values(custMap).reduce((s, c) => s + c.total, 0)
      const top5Customers = Object.values(custMap)
        .sort((a, b) => b.total - a.total)
        .slice(0, 5)
        .map((c, i) => ({ ...c, rank: i + 1, pct: totalRev > 0 ? ((c.total / totalRev) * 100).toFixed(1) : 0 }))

      // Expiring vehicle docs within 30 days
      const expiringDocs = []
      get(12).forEach(v => {
        const insExp  = v.insurance_expiry_date
        const rwoExp  = v.road_worthiness_expiry_date
        if (insExp && insExp <= thirtyDaysFromNow && insExp >= todayISO) {
          expiringDocs.push({ vehicle: `${v.vehicle_number} ${v.vehicle_name}`, doc: 'Insurance', expiry: insExp })
        }
        if (rwoExp && rwoExp <= thirtyDaysFromNow && rwoExp >= todayISO) {
          expiringDocs.push({ vehicle: `${v.vehicle_number} ${v.vehicle_name}`, doc: 'Road Worthiness', expiry: rwoExp })
        }
      })
      expiringDocs.sort((a, b) => a.expiry.localeCompare(b.expiry))

      // Low stock
      const lowStock = get(13)
        .filter(i => Number(i.current_stock) <= Number(i.reorder_level || 0))
        .map(i => ({ name: i.name, stock: i.current_stock, reorder: i.reorder_level }))
        .slice(0, 8)

      // Pending approvals
      const pendingApprovals = get(14).length

      setD({
        revThisMonth, revLastMonth, incomeThisMonth, expenseThisMonth,
        cashPosition, receivables, blocksThisMonth, activeOrdersValue,
        revTrend, prodTrend, expenseByCategory, top5Customers,
        overdueReceivables, expiringDocs, lowStock, pendingApprovals,
      })
    } catch (err) {
      console.error('BoardDashboard load error:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // ── PDF Download ─────────────────────────────────────────────────
  const downloadPDF = () => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const pageW = doc.internal.pageSize.getWidth()
    let y = 16

    // Company header
    doc.setFontSize(16)
    doc.setTextColor(245, 166, 35)
    doc.text('ABUJA PRECAST CONCRETE LIMITED', pageW / 2, y, { align: 'center' })
    y += 7

    doc.setFontSize(11)
    doc.setTextColor(200, 200, 200)
    doc.text('Board Executive Dashboard', pageW / 2, y, { align: 'center' })
    y += 5

    doc.setFontSize(9)
    doc.setTextColor(150, 150, 150)
    doc.text(`As at ${today()}`, pageW / 2, y, { align: 'center' })
    y += 8

    doc.setDrawColor(46, 52, 82)
    doc.line(14, y, pageW - 14, y)
    y += 6

    // KPIs
    doc.setFontSize(12)
    doc.setTextColor(245, 166, 35)
    doc.text('Key Performance Indicators', 14, y)
    y += 6

    const netProfit = d.incomeThisMonth - d.expenseThisMonth
    const revChange = d.revLastMonth > 0 ? ((d.revThisMonth - d.revLastMonth) / d.revLastMonth * 100).toFixed(1) : 0

    autoTable(doc, {
      startY: y,
      head: [['Metric', 'Value', 'Note']],
      body: [
        ['Revenue This Month', naira(d.revThisMonth), `${revChange > 0 ? '▲' : '▼'} ${Math.abs(revChange)}% vs last month`],
        ['Net Profit This Month', naira(netProfit), netProfit >= 0 ? 'Profitable' : 'Loss'],
        ['Cash Position', naira(d.cashPosition), 'Total bank balances'],
        ['Outstanding Receivables', naira(d.receivables), 'Unpaid invoice balances'],
        ['Blocks Produced This Month', fmt(d.blocksThisMonth) + ' units', ''],
        ['Active Orders Value', naira(d.activeOrdersValue), 'Orders not yet delivered/cancelled'],
      ],
      styles: { fontSize: 9, textColor: [40, 40, 40] },
      headStyles: { fillColor: [33, 38, 58], textColor: [232, 234, 240], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [245, 247, 255] },
      margin: { left: 14, right: 14 },
    })
    y = doc.lastAutoTable.finalY + 10

    // Top 5 Customers
    doc.setFontSize(12)
    doc.setTextColor(245, 166, 35)
    doc.text('Top 5 Customers by Revenue (Last 12 Months)', 14, y)
    y += 4

    autoTable(doc, {
      startY: y,
      head: [['Rank', 'Customer', 'Revenue', '% of Total']],
      body: d.top5Customers.map(c => [c.rank, c.name, naira(c.total), `${c.pct}%`]),
      styles: { fontSize: 9, textColor: [40, 40, 40] },
      headStyles: { fillColor: [33, 38, 58], textColor: [232, 234, 240], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [245, 247, 255] },
      margin: { left: 14, right: 14 },
    })
    y = doc.lastAutoTable.finalY + 10

    // Alerts summary
    doc.setFontSize(12)
    doc.setTextColor(245, 166, 35)
    doc.text('Alerts Summary', 14, y)
    y += 4

    autoTable(doc, {
      startY: y,
      head: [['Alert', 'Count / Detail']],
      body: [
        ['Overdue Receivables (>60 days)', d.overdueReceivables.length > 0 ? d.overdueReceivables.map(r => `${r.customer}: ${naira(r.amount)}`).join('; ') : 'None'],
        ['Expiring Vehicle Documents (30 days)', d.expiringDocs.length > 0 ? d.expiringDocs.map(e => `${e.vehicle} – ${e.doc} (${e.expiry})`).join('; ') : 'None'],
        ['Low Stock Items', d.lowStock.length > 0 ? d.lowStock.map(i => `${i.name}: ${i.stock}`).join('; ') : 'None'],
        ['Pending LPO Approvals', `${d.pendingApprovals} approval(s) awaiting`],
      ],
      styles: { fontSize: 8, textColor: [40, 40, 40], cellWidth: 'wrap', overflow: 'linebreak' },
      headStyles: { fillColor: [33, 38, 58], textColor: [232, 234, 240], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [245, 247, 255] },
      columnStyles: { 1: { cellWidth: 110 } },
      margin: { left: 14, right: 14 },
    })
    y = doc.lastAutoTable.finalY + 12

    // Footer
    doc.setFontSize(8)
    doc.setTextColor(150, 150, 150)
    doc.text('Prepared for the Board of Directors — Confidential', pageW / 2, y, { align: 'center' })
    y += 4
    doc.text(`Generated on ${today()} | Abuja Precast Concrete Limited`, pageW / 2, y, { align: 'center' })

    doc.save(`Board_Dashboard_${isoToday()}.pdf`)
  }

  // ── Derived values ────────────────────────────────────────────────
  const netProfitThisMonth = d.incomeThisMonth - d.expenseThisMonth
  const revChangePct = d.revLastMonth > 0
    ? ((d.revThisMonth - d.revLastMonth) / d.revLastMonth) * 100
    : 0

  // ── Render ────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ padding: '48px', textAlign: 'center', color: theme.textMuted, fontSize: '14px', fontFamily: "'DM Sans','Segoe UI',sans-serif" }}>
        <div style={{ marginBottom: '12px', fontSize: '24px' }}>⏳</div>
        Loading board dashboard…
      </div>
    )
  }

  return (
    <div style={{ padding: '24px 28px', fontFamily: "'DM Sans','Segoe UI',sans-serif", color: theme.text, maxWidth: '1400px', margin: '0 auto' }}>

      {/* ── Header ─────────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '28px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <div style={{ fontSize: '22px', fontWeight: '800', color: theme.text }}>Board Executive Dashboard</div>
          <div style={{ fontSize: '13px', color: theme.textMuted, marginTop: '4px' }}>As at {today()}</div>
        </div>
        <button
          onClick={downloadPDF}
          style={{ padding: '10px 20px', borderRadius: '8px', background: theme.accent, border: 'none', color: '#1a0e00', fontWeight: '700', fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit' }}
        >
          Download Report
        </button>
      </div>

      {/* ── KPI Row ─────────────────────────────────────────────── */}
      <SectionHeader title="Key Performance Indicators" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', marginBottom: '28px' }}>
        <StatCard
          label="Revenue This Month"
          value={naira(d.revThisMonth)}
          accent={theme.green}
          sub={`Last month: ${naira(d.revLastMonth)}`}
          trend={revChangePct}
        />
        <StatCard
          label="Net Profit This Month"
          value={naira(netProfitThisMonth)}
          accent={netProfitThisMonth >= 0 ? theme.green : theme.red}
          sub={`Income: ${naira(d.incomeThisMonth)} · Exp: ${naira(d.expenseThisMonth)}`}
          trend={null}
        />
        <StatCard
          label="Cash Position"
          value={naira(d.cashPosition)}
          accent={theme.blue}
          sub="Total bank balances"
          trend={null}
        />
        <StatCard
          label="Outstanding Receivables"
          value={naira(d.receivables)}
          accent={theme.accent}
          sub="Unpaid invoice balances"
          trend={null}
        />
        <StatCard
          label="Blocks Produced This Month"
          value={fmt(d.blocksThisMonth)}
          accent={theme.blue}
          sub="Units produced since 1st"
          trend={null}
        />
        <StatCard
          label="Active Orders Value"
          value={naira(d.activeOrdersValue)}
          accent={theme.accent}
          sub="Orders not delivered/cancelled"
          trend={null}
        />
      </div>

      {/* ── Charts ──────────────────────────────────────────────── */}
      <SectionHeader title="Analytics" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '16px', marginBottom: '28px' }}>

        {/* Revenue Trend */}
        <ChartCard title="Revenue Trend — Last 12 Months">
          <BarChart data={d.revTrend} color={theme.green} height={160} />
          <div style={{ fontSize: '10px', color: theme.textMuted, marginTop: '6px' }}>Confirmed payments by month (₦)</div>
        </ChartCard>

        {/* Production Trend */}
        <ChartCard title="Production Trend — Last 12 Months">
          <BarChart data={d.prodTrend} color={theme.blue} height={160} />
          <div style={{ fontSize: '10px', color: theme.textMuted, marginTop: '6px' }}>Units produced per month</div>
        </ChartCard>

        {/* Expense Breakdown */}
        <ChartCard title="Expense Breakdown — Last 3 Months">
          {d.expenseByCategory.length > 0 ? (
            <PieChart segments={d.expenseByCategory} size={160} />
          ) : (
            <div style={{ color: theme.textMuted, fontSize: '12px', padding: '20px 0' }}>No expense data</div>
          )}
        </ChartCard>

        {/* Top 5 Customers */}
        <ChartCard title="Top 5 Customers by Revenue — Last 12 Months">
          {d.top5Customers.length > 0 ? (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr>
                  {['#', 'Customer', 'Revenue', '% Total'].map(h => (
                    <th key={h} style={{ textAlign: h === 'Revenue' || h === '% Total' ? 'right' : 'left', padding: '6px 8px', fontSize: '10px', fontWeight: '700', color: theme.textMuted, borderBottom: `1px solid ${theme.border}`, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {d.top5Customers.map((c, i) => (
                  <tr key={i} style={{ borderBottom: `1px solid ${theme.border}22` }}>
                    <td style={{ padding: '9px 8px', color: theme.textMuted, fontWeight: '700' }}>{c.rank}</td>
                    <td style={{ padding: '9px 8px', color: theme.text }}>{c.name}</td>
                    <td style={{ padding: '9px 8px', color: theme.green, textAlign: 'right', fontWeight: '600' }}>{naira(c.total)}</td>
                    <td style={{ padding: '9px 8px', textAlign: 'right' }}>
                      <span style={{ background: theme.accent + '22', color: theme.accent, padding: '2px 7px', borderRadius: '4px', fontSize: '11px', fontWeight: '600' }}>{c.pct}%</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div style={{ color: theme.textMuted, fontSize: '12px', padding: '20px 0' }}>No customer revenue data</div>
          )}
        </ChartCard>
      </div>

      {/* ── Alerts ──────────────────────────────────────────────── */}
      <SectionHeader title="Alerts & Flags" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px' }}>

        {/* Overdue Receivables */}
        <AlertBox title="Overdue Payments (>60 days)" color={theme.red} emptyMsg="No overdue receivables">
          {d.overdueReceivables.length > 0 && d.overdueReceivables.map((r, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderBottom: i < d.overdueReceivables.length - 1 ? `1px solid ${theme.border}22` : 'none', padding: '5px 0' }}>
              <div>
                <div style={{ fontWeight: '600', fontSize: '12px' }}>{r.customer}</div>
                <div style={{ fontSize: '10px', color: theme.textMuted }}>{r.days} days overdue</div>
              </div>
              <div style={{ color: theme.red, fontWeight: '700', fontSize: '12px', whiteSpace: 'nowrap', marginLeft: '8px' }}>{naira(r.amount)}</div>
            </div>
          ))}
        </AlertBox>

        {/* Expiring Vehicle Documents */}
        <AlertBox title="Expiring Vehicle Docs (30 days)" color={theme.accent} emptyMsg="No documents expiring soon">
          {d.expiringDocs.length > 0 && d.expiringDocs.map((e, i) => (
            <div key={i} style={{ borderBottom: i < d.expiringDocs.length - 1 ? `1px solid ${theme.border}22` : 'none', padding: '5px 0' }}>
              <div style={{ fontWeight: '600', fontSize: '12px' }}>{e.vehicle}</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: theme.textMuted }}>
                <span>{e.doc}</span>
                <span style={{ color: theme.accent }}>{e.expiry}</span>
              </div>
            </div>
          ))}
        </AlertBox>

        {/* Low Stock */}
        <AlertBox title="Low Stock Items" color={theme.blue} emptyMsg="All items adequately stocked">
          {d.lowStock.length > 0 && d.lowStock.map((item, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: i < d.lowStock.length - 1 ? `1px solid ${theme.border}22` : 'none', padding: '5px 0', fontSize: '12px' }}>
              <span>{item.name}</span>
              <span style={{ color: theme.red, fontWeight: '600' }}>{fmt(item.stock)} left</span>
            </div>
          ))}
        </AlertBox>

        {/* Pending Approvals */}
        <AlertBox title="Pending Approvals" color={theme.accent} emptyMsg="No pending approvals">
          {d.pendingApprovals > 0 && (
            <div>
              <div style={{ fontSize: '28px', fontWeight: '800', color: theme.accent, lineHeight: 1.2 }}>{d.pendingApprovals}</div>
              <div style={{ fontSize: '12px', color: theme.textMuted, marginTop: '4px' }}>LPO order{d.pendingApprovals !== 1 ? 's' : ''} awaiting approval</div>
              <div style={{ marginTop: '10px', padding: '8px 12px', background: theme.accent + '18', borderRadius: '6px', fontSize: '11px', color: theme.accent, fontWeight: '600' }}>
                Action required — review pending LPOs
              </div>
            </div>
          )}
        </AlertBox>
      </div>
    </div>
  )
}
