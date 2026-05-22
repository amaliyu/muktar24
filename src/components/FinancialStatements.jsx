import React, { useState, useEffect, useCallback } from 'react'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { balanceSheetService, incomeStatementService, cashFlowService, openingBalancesService, financialAdjustmentsService } from '../services/financialService'

const theme = {
  bg: '#0f1117', surface: '#1a1d27', card: '#21263a', border: '#2e3452',
  accent: '#f5a623', green: '#2dd4a0', red: '#f06b6b', blue: '#5b8dee',
  text: '#e8eaf0', textMuted: '#7c839e',
}

const naira = n => `₦${Math.round(Number(n) || 0).toLocaleString()}`
const fmt   = n => Math.round(Number(n) || 0).toLocaleString()
const today = () => new Date().toISOString().split('T')[0]
const firstOfYear = () => `${new Date().getFullYear()}-01-01`
const firstOfMonth = () => {
  const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`
}

const s = {
  card: { background: theme.card, border: `1px solid ${theme.border}`, borderRadius: '10px', padding: '18px', marginBottom: '14px' },
  sectionTitle: { fontSize: '11px', fontWeight: '700', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px' },
  row: (indent=0) => ({ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', paddingLeft: `${indent * 16}px`, borderBottom: `1px solid ${theme.border}22`, fontSize: '13px' }),
  totalRow: (color=theme.text) => ({ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderTop: `2px solid ${theme.border}`, marginTop: '4px', fontWeight: '700', fontSize: '13px', color }),
  doubleRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderTop: `4px double ${theme.border}`, marginTop: '4px', fontWeight: '800', fontSize: '14px' },
  input: { background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: '6px', padding: '6px 10px', color: theme.text, fontSize: '12px', outline: 'none' },
  btn: (v='secondary') => ({ padding: '7px 14px', borderRadius: '7px', border: `1px solid ${v==='primary'?theme.accent:v==='danger'?theme.red:theme.border}`, background: v==='primary'?theme.accent+'22':v==='danger'?theme.red+'22':'transparent', color: v==='primary'?theme.accent:v==='danger'?theme.red:theme.text, fontWeight: '600', fontSize: '12px', cursor: 'pointer' }),
  label: { fontSize: '11px', fontWeight: '600', color: theme.textMuted, marginBottom: '4px' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' },
  tabBar: { display: 'flex', gap: '2px', marginBottom: '20px', borderBottom: `1px solid ${theme.border}`, flexWrap: 'wrap' },
  tab: active => ({ padding: '8px 16px', fontSize: '13px', fontWeight: active?'600':'400', color: active?theme.accent:theme.textMuted, background: 'transparent', border: 'none', cursor: 'pointer', borderBottom: active?`2px solid ${theme.accent}`:'2px solid transparent', marginBottom: '-1px' }),
}

// ── HELPERS ───────────────────────────────────────────────────────
async function addPdfHeader(doc, title, subtitle) {
  const W = doc.internal.pageSize.getWidth()
  const ml = 14, mr = W - 14
  try {
    const res = await fetch('/logo.png')
    const blob = await res.blob()
    const b64 = await new Promise(r => { const rd = new FileReader(); rd.onload = () => r(rd.result); rd.readAsDataURL(blob) })
    doc.addImage(b64, 'PNG', ml, 8, 28, 14)
  } catch { /* no logo */ }
  doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(20)
  doc.text('ABUJA PRECAST CONCRETE LIMITED', ml + 32, 13)
  doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(80)
  doc.text('RC: 1838184  |  No. 1, Off Bwari Road, Abuja', ml + 32, 19)
  doc.setFontSize(13); doc.setFont('helvetica', 'bold'); doc.setTextColor(245, 166, 35)
  doc.text(title, mr, 13, { align: 'right' })
  doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(80)
  doc.text(subtitle, mr, 19, { align: 'right' })
  doc.setDrawColor(180); doc.setLineWidth(0.4); doc.line(ml, 24, mr, 24)
  return 30
}

// ── BALANCE SHEET ──────────────────────────────────────────────────
const BalanceSheetTab = ({ userProfile }) => {
  const [asAt, setAsAt] = useState(today())
  const [compareDate, setCompareDate] = useState('')
  const [data, setData] = useState(null)
  const [compareData, setCompareData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editVal, setEditVal] = useState({ amount: '', depreciation_amount: '', notes: '' })
  const [adjForm, setAdjForm] = useState({ account_name: '', amount: '', reason: '' })
  const [showAdjForm, setShowAdjForm] = useState(false)

  const canEdit = ['md', 'accountant'].includes(userProfile?.role)

  const load = useCallback(async (date, setFn) => {
    setLoading(true); setErr('')
    try { const d = await balanceSheetService.getData(date); setFn(d) }
    catch (e) { setErr(e.message) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load(asAt, setData) }, [asAt, load])
  useEffect(() => { if (compareDate) load(compareDate, setCompareData); else setCompareData(null) }, [compareDate, load])

  const calcBS = (d) => {
    if (!d) return null
    const obs = d.openingBalances || []

    // Fixed Assets
    const vehicleEntries = obs.filter(o => o.vehicle_id)
    const otherFixed = obs.filter(o => o.sub_category === 'fixed_asset' && !o.vehicle_id)
    const totalVehiclesNBV = vehicleEntries.reduce((s, o) => s + (Number(o.amount) - Number(o.depreciation_amount||0)), 0)
    const totalOtherFixedNBV = otherFixed.reduce((s, o) => s + (Number(o.amount) - Number(o.depreciation_amount||0)), 0)
    const totalFixedAssets = totalVehiclesNBV + totalOtherFixedNBV

    // Current Assets
    const fgValue = (d.finishedGoods||[]).reduce((s, fg) => {
      const p = (d.products||[]).find(p => p.name === fg.block_type)
      return s + (Number(fg.quantity_in_yard||0) * Number(p?.unit_price||0))
    }, 0)
    const rawMatsValue = (d.inventoryItems||[]).reduce((s, i) => s + (Number(i.current_stock||0) * Number(i.unit_cost||0)), 0)
    const bankTotal = (d.bankAccounts||[]).reduce((s, b) => s + Number(b.current_balance||0), 0)
    const manualCurrentAssets = obs.filter(o => o.sub_category === 'current_asset')
    const manualCurrentTotal = manualCurrentAssets.reduce((s, o) => s + Number(o.amount||0), 0)
    const totalCurrentAssets = fgValue + rawMatsValue + Number(d.receivables||0) + bankTotal + manualCurrentTotal
    const totalAssets = totalFixedAssets + totalCurrentAssets

    // Liabilities
    const currentLiabs = obs.filter(o => o.sub_category === 'current_liability')
    const currentLiabTotal = currentLiabs.reduce((s, o) => s + Number(o.amount||0), 0)
    const totalCurrentLiabilities = Number(d.supplierPayables||0) + currentLiabTotal
    const ltLiabs = obs.filter(o => o.sub_category === 'long_term_liability')
    const totalLTLiabilities = ltLiabs.reduce((s, o) => s + Number(o.amount||0), 0)
    const totalLiabilities = totalCurrentLiabilities + totalLTLiabilities

    // Equity
    const equityObs = obs.filter(o => o.sub_category === 'equity')
    const shareCapital = equityObs.reduce((s, o) => s + Number(o.amount||0), 0)
    const ytdProfit = Number(d.ytdProfit||0)
    const totalEquity = shareCapital + ytdProfit
    const totalLiabEquity = totalLiabilities + totalEquity
    const difference = totalAssets - totalLiabEquity

    return {
      vehicleEntries, otherFixed, totalVehiclesNBV, totalOtherFixedNBV, totalFixedAssets,
      fgValue, rawMatsValue, bankTotal, manualCurrentAssets, manualCurrentTotal,
      totalCurrentAssets, totalAssets,
      currentLiabs, currentLiabTotal, totalCurrentLiabilities,
      ltLiabs, totalLTLiabilities, totalLiabilities,
      equityObs, shareCapital, ytdProfit, totalEquity, totalLiabEquity, difference,
      bankAccounts: d.bankAccounts||[], finishedGoods: d.finishedGoods||[],
      products: d.products||[], inventoryItems: d.inventoryItems||[],
      adjustments: d.adjustments||[],
    }
  }

  const bs = calcBS(data)
  const bsC = calcBS(compareData)

  const saveEdit = async (ob) => {
    try {
      await openingBalancesService.update(ob.id, { amount: Number(editVal.amount)||0, depreciation_amount: Number(editVal.depreciation_amount)||0, notes: editVal.notes, last_edited_by: userProfile?.full_name, last_edited_at: new Date().toISOString() }, userProfile?.full_name, '', Number(ob.amount), Number(ob.depreciation_amount))
      setEditingId(null)
      load(asAt, setData)
    } catch(e) { setErr(e.message) }
  }

  const addAdj = async () => {
    if (!adjForm.account_name || !adjForm.amount) return
    try {
      await financialAdjustmentsService.create({ statement_type: 'balance_sheet', account_name: adjForm.account_name, amount: Number(adjForm.amount), adjustment_date: asAt, reason: adjForm.reason, entered_by: userProfile?.full_name })
      setAdjForm({ account_name: '', amount: '', reason: '' }); setShowAdjForm(false)
      load(asAt, setData)
    } catch(e) { setErr(e.message) }
  }

  const downloadPDF = async () => {
    if (!bs) return
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    let y = await addPdfHeader(doc, 'BALANCE SHEET', `As at ${asAt}`)
    const W = doc.internal.pageSize.getWidth()
    const ml = 14, mr = W - 14

    const section = (title) => { y += 4; doc.setFontSize(9); doc.setFont('helvetica','bold'); doc.setTextColor(150); doc.text(title, ml, y); y += 5 }
    const lineItem = (label, cost, dep, nbv, indent=0) => {
      doc.setFontSize(9); doc.setFont('helvetica','normal'); doc.setTextColor(40)
      doc.text(label, ml + indent, y)
      if (cost !== undefined) { doc.text(`₦${fmt(cost)}`, ml+80, y, {align:'right'}); doc.text(`₦${fmt(dep)}`, ml+115, y, {align:'right'}) }
      doc.text(`₦${fmt(nbv)}`, mr, y, {align:'right'}); y += 5
    }
    const totalLine = (label, val) => { doc.setFontSize(9); doc.setFont('helvetica','bold'); doc.setTextColor(20); doc.text(label, ml, y); doc.text(`₦${fmt(val)}`, mr, y, {align:'right'}); y += 6 }
    const divider = () => { doc.setDrawColor(200); doc.setLineWidth(0.3); doc.line(ml, y, mr, y); y += 3 }

    // Column headers
    doc.setFontSize(8); doc.setFont('helvetica','bold'); doc.setTextColor(120)
    doc.text('Cost', ml+80, y, {align:'right'}); doc.text('Dep.', ml+115, y, {align:'right'}); doc.text('NBV', mr, y, {align:'right'}); y += 5

    section('FIXED ASSETS')
    bs.vehicleEntries.forEach(v => { const veh = data?.vehicles?.find(x => x.id===v.vehicle_id); lineItem(`${veh?.vehicle_name||v.account_name}`, v.amount, v.depreciation_amount, Number(v.amount)-Number(v.depreciation_amount||0), 4) })
    bs.otherFixed.forEach(o => lineItem(o.account_name, o.amount, o.depreciation_amount||0, Number(o.amount)-Number(o.depreciation_amount||0), 4))
    totalLine('TOTAL FIXED ASSETS', bs.totalFixedAssets); divider()

    section('CURRENT ASSETS')
    lineItem('Finished Goods Stock', undefined, undefined, bs.fgValue, 4)
    lineItem('Raw Materials / Inventory', undefined, undefined, bs.rawMatsValue, 4)
    lineItem('Accounts Receivable', undefined, undefined, data?.receivables||0, 4)
    bs.bankAccounts.forEach(b => lineItem(`Cash at Bank — ${b.account_name}`, undefined, undefined, b.current_balance, 4))
    bs.manualCurrentAssets.forEach(o => lineItem(o.account_name, undefined, undefined, o.amount, 4))
    totalLine('TOTAL CURRENT ASSETS', bs.totalCurrentAssets); divider()
    totalLine('TOTAL ASSETS', bs.totalAssets)

    y += 8
    section('CURRENT LIABILITIES')
    lineItem('Trade Payables', undefined, undefined, data?.supplierPayables||0, 4)
    bs.currentLiabs.forEach(o => lineItem(o.account_name, undefined, undefined, o.amount, 4))
    totalLine('TOTAL CURRENT LIABILITIES', bs.totalCurrentLiabilities); divider()

    section('LONG TERM LIABILITIES')
    bs.ltLiabs.forEach(o => lineItem(o.account_name, undefined, undefined, o.amount, 4))
    totalLine('TOTAL LONG TERM LIABILITIES', bs.totalLTLiabilities); divider()
    totalLine('TOTAL LIABILITIES', bs.totalLiabilities)

    y += 4
    section('EQUITY')
    bs.equityObs.forEach(o => lineItem(o.account_name, undefined, undefined, o.amount, 4))
    lineItem('Current Year Profit / (Loss)', undefined, undefined, bs.ytdProfit, 4)
    totalLine('TOTAL EQUITY', bs.totalEquity); divider()
    totalLine('TOTAL LIABILITIES AND EQUITY', bs.totalLiabEquity)

    if (Math.abs(bs.difference) > 1) {
      y += 4; doc.setFontSize(9); doc.setFont('helvetica','bold'); doc.setTextColor(220,50,50)
      doc.text(`Balance difference: ₦${fmt(bs.difference)}`, ml, y); y += 5
    }

    doc.setFontSize(8); doc.setFont('helvetica','italic'); doc.setTextColor(140)
    doc.text(`Prepared: ${new Date().toLocaleDateString()}  |  Abuja Precast Concrete Limited`, doc.internal.pageSize.getWidth()/2, doc.internal.pageSize.getHeight()-8, {align:'center'})
    doc.save(`Balance_Sheet_${asAt}.pdf`)
  }

  const EditBtn = ({ ob }) => canEdit ? (
    <button style={{ ...s.btn('secondary'), padding: '2px 8px', fontSize: '10px', marginLeft: '8px' }}
      onClick={() => { setEditingId(ob.id); setEditVal({ amount: ob.amount, depreciation_amount: ob.depreciation_amount||0, notes: ob.notes||'' }) }}>Edit</button>
  ) : null

  const NBVCell = ({ ob, compare }) => {
    const nbv = Number(ob.amount||0) - Number(ob.depreciation_amount||0)
    const cnbv = compare ? Number(compare.amount||0) - Number(compare.depreciation_amount||0) : null
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        {compare && <span style={{ color: theme.textMuted, fontSize: '12px' }}>{naira(cnbv)}</span>}
        <span style={{ fontWeight: '600', minWidth: '90px', textAlign: 'right' }}>{naira(nbv)}</span>
        <EditBtn ob={ob} />
      </div>
    )
  }

  const AmountCell = ({ amount, compareAmount }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
      {compareAmount !== undefined && <span style={{ color: theme.textMuted, fontSize: '12px' }}>{naira(compareAmount)}</span>}
      <span style={{ fontWeight: '600', minWidth: '90px', textAlign: 'right' }}>{naira(amount)}</span>
    </div>
  )

  return (
    <div>
      {/* Controls */}
      <div style={s.header}>
        <div>
          <div style={{ fontSize: '16px', fontWeight: '700', color: theme.text }}>Balance Sheet</div>
          <div style={{ fontSize: '12px', color: theme.textMuted, marginTop: '4px' }}>As at selected date • Figures in Nigerian Naira (₦)</div>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          <div><div style={s.label}>As at Date</div><input type="date" style={s.input} value={asAt} onChange={e => setAsAt(e.target.value)} /></div>
          <div><div style={s.label}>Compare with</div><input type="date" style={s.input} value={compareDate} onChange={e => setCompareDate(e.target.value)} /></div>
          <button style={{ ...s.btn('primary'), marginTop: '18px' }} onClick={downloadPDF}>⬇ Download PDF</button>
        </div>
      </div>

      {err && <div style={{ color: theme.red, marginBottom: '12px', fontSize: '12px' }}>{err}</div>}
      {loading && <div style={{ color: theme.textMuted, marginBottom: '12px' }}>Loading...</div>}

      {bs && (
        <>
          {bsC && (
            <div style={{ background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: '8px', padding: '8px 14px', marginBottom: '14px', fontSize: '11px', color: theme.textMuted, display: 'flex', gap: '20px' }}>
              <span>Comparison mode:</span>
              <span style={{ color: theme.text }}>{asAt} (current)</span>
              <span>vs</span>
              <span style={{ color: theme.accent }}>{compareDate}</span>
            </div>
          )}

          {/* Editing inline form */}
          {editingId && (
            <div style={{ ...s.card, background: theme.surface, marginBottom: '14px' }}>
              <div style={{ fontWeight: '700', marginBottom: '10px', fontSize: '13px' }}>Edit Balance Entry</div>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <div><div style={s.label}>Cost / Amount (₦)</div><input type="number" style={s.input} value={editVal.amount} onChange={e => setEditVal(v => ({...v, amount: e.target.value}))} /></div>
                <div><div style={s.label}>Accumulated Depreciation (₦)</div><input type="number" style={s.input} value={editVal.depreciation_amount} onChange={e => setEditVal(v => ({...v, depreciation_amount: e.target.value}))} /></div>
                <div style={{ flex: 2 }}><div style={s.label}>Notes</div><input style={{ ...s.input, width: '100%' }} value={editVal.notes} onChange={e => setEditVal(v => ({...v, notes: e.target.value}))} /></div>
              </div>
              <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                <button style={s.btn('primary')} onClick={() => { const ob = data?.openingBalances?.find(o => o.id===editingId); if(ob) saveEdit(ob) }}>Save</button>
                <button style={s.btn('secondary')} onClick={() => setEditingId(null)}>Cancel</button>
              </div>
            </div>
          )}

          {/* ASSETS */}
          <div style={s.card}>
            <div style={{ fontSize: '14px', fontWeight: '800', color: theme.text, marginBottom: '14px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Assets</div>

            <div style={s.sectionTitle}>Fixed Assets (Non-Current Assets)</div>
            <div style={{ ...s.row(), fontWeight: '700', color: theme.textMuted, fontSize: '11px' }}>
              <span></span>
              <div style={{ display: 'flex', gap: '12px' }}>
                {bsC && <span style={{ minWidth: '90px', textAlign: 'right' }}>{compareDate}</span>}
                <span style={{ minWidth: '90px', textAlign: 'right' }}>{asAt}</span>
              </div>
            </div>

            {bs.vehicleEntries.map(ob => {
              const veh = data?.vehicles?.find(v => v.id === ob.vehicle_id)
              const cOb = bsC?.vehicleEntries?.find(o => o.vehicle_id === ob.vehicle_id)
              return (
                <div key={ob.id} style={s.row(1)}>
                  <span>{veh ? `${veh.vehicle_name} (${veh.vehicle_number})` : ob.account_name}</span>
                  <NBVCell ob={ob} compare={cOb} />
                </div>
              )
            })}
            {bs.otherFixed.map(ob => {
              const cOb = bsC?.otherFixed?.find(o => o.id === ob.id)
              return (
                <div key={ob.id} style={s.row(1)}>
                  <span>{ob.account_name}</span>
                  <NBVCell ob={ob} compare={cOb} />
                </div>
              )
            })}
            <div style={s.totalRow(theme.green)}>
              <span>Total Fixed Assets</span>
              <AmountCell amount={bs.totalFixedAssets} compareAmount={bsC?.totalFixedAssets} />
            </div>

            <div style={{ height: '14px' }} />
            <div style={s.sectionTitle}>Current Assets</div>
            <div style={s.row(1)}><span>Finished Goods Stock</span><AmountCell amount={bs.fgValue} compareAmount={bsC?.fgValue} /></div>
            <div style={s.row(1)}><span>Raw Materials / Inventory</span><AmountCell amount={bs.rawMatsValue} compareAmount={bsC?.rawMatsValue} /></div>
            <div style={s.row(1)}><span>Accounts Receivable</span><AmountCell amount={data?.receivables||0} compareAmount={compareData?.receivables} /></div>
            {bs.bankAccounts.map(b => (
              <div key={b.id} style={s.row(1)}><span>Cash at Bank — {b.account_name}</span><AmountCell amount={b.current_balance} compareAmount={compareData?.bankAccounts?.find(x=>x.id===b.id)?.current_balance} /></div>
            ))}
            {bs.manualCurrentAssets.map(ob => {
              const cOb = bsC?.manualCurrentAssets?.find(o => o.id === ob.id)
              return (
                <div key={ob.id} style={s.row(1)}>
                  <span>{ob.account_name}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    {bsC && <span style={{ color: theme.textMuted, fontSize: '12px' }}>{naira(cOb?.amount||0)}</span>}
                    <span style={{ fontWeight: '600', minWidth: '90px', textAlign: 'right' }}>{naira(ob.amount)}</span>
                    <EditBtn ob={ob} />
                  </div>
                </div>
              )
            })}
            <div style={s.totalRow(theme.green)}>
              <span>Total Current Assets</span>
              <AmountCell amount={bs.totalCurrentAssets} compareAmount={bsC?.totalCurrentAssets} />
            </div>

            <div style={s.doubleRow}>
              <span>TOTAL ASSETS</span>
              <AmountCell amount={bs.totalAssets} compareAmount={bsC?.totalAssets} />
            </div>
          </div>

          {/* LIABILITIES */}
          <div style={s.card}>
            <div style={{ fontSize: '14px', fontWeight: '800', color: theme.text, marginBottom: '14px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Liabilities & Equity</div>

            <div style={s.sectionTitle}>Current Liabilities</div>
            <div style={s.row(1)}><span>Trade Payables</span><AmountCell amount={data?.supplierPayables||0} compareAmount={compareData?.supplierPayables} /></div>
            {bs.currentLiabs.map(ob => {
              const cOb = bsC?.currentLiabs?.find(o => o.id === ob.id)
              return (
                <div key={ob.id} style={s.row(1)}>
                  <span>{ob.account_name}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    {bsC && <span style={{ color: theme.textMuted, fontSize: '12px' }}>{naira(cOb?.amount||0)}</span>}
                    <span style={{ fontWeight: '600', minWidth: '90px', textAlign: 'right' }}>{naira(ob.amount)}</span>
                    <EditBtn ob={ob} />
                  </div>
                </div>
              )
            })}
            <div style={s.totalRow(theme.red)}><span>Total Current Liabilities</span><AmountCell amount={bs.totalCurrentLiabilities} compareAmount={bsC?.totalCurrentLiabilities} /></div>

            <div style={{ height: '10px' }} />
            <div style={s.sectionTitle}>Long Term Liabilities</div>
            {bs.ltLiabs.map(ob => {
              const cOb = bsC?.ltLiabs?.find(o => o.id === ob.id)
              return (
                <div key={ob.id} style={s.row(1)}>
                  <span>{ob.account_name}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    {bsC && <span style={{ color: theme.textMuted, fontSize: '12px' }}>{naira(cOb?.amount||0)}</span>}
                    <span style={{ fontWeight: '600', minWidth: '90px', textAlign: 'right' }}>{naira(ob.amount)}</span>
                    <EditBtn ob={ob} />
                  </div>
                </div>
              )
            })}
            {bs.ltLiabs.length === 0 && <div style={{ color: theme.textMuted, fontSize: '12px', padding: '6px 0 6px 16px' }}>None recorded</div>}
            <div style={s.totalRow(theme.red)}><span>Total Long Term Liabilities</span><AmountCell amount={bs.totalLTLiabilities} compareAmount={bsC?.totalLTLiabilities} /></div>

            <div style={s.totalRow()}><span style={{ fontWeight: '700' }}>TOTAL LIABILITIES</span><AmountCell amount={bs.totalLiabilities} compareAmount={bsC?.totalLiabilities} /></div>

            <div style={{ height: '14px' }} />
            <div style={s.sectionTitle}>Equity</div>
            {bs.equityObs.map(ob => {
              const cOb = bsC?.equityObs?.find(o => o.id === ob.id)
              return (
                <div key={ob.id} style={s.row(1)}>
                  <span>{ob.account_name}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    {bsC && <span style={{ color: theme.textMuted, fontSize: '12px' }}>{naira(cOb?.amount||0)}</span>}
                    <span style={{ fontWeight: '600', minWidth: '90px', textAlign: 'right' }}>{naira(ob.amount)}</span>
                    <EditBtn ob={ob} />
                  </div>
                </div>
              )
            })}
            <div style={s.row(1)}>
              <span>Current Year Profit / (Loss)</span>
              <AmountCell amount={bs.ytdProfit} compareAmount={bsC?.ytdProfit} />
            </div>
            <div style={s.totalRow(theme.green)}><span>Total Equity</span><AmountCell amount={bs.totalEquity} compareAmount={bsC?.totalEquity} /></div>

            <div style={s.doubleRow}>
              <span>TOTAL LIABILITIES AND EQUITY</span>
              <AmountCell amount={bs.totalLiabEquity} compareAmount={bsC?.totalLiabEquity} />
            </div>
          </div>

          {/* Balance Check */}
          <div style={{ ...s.card, background: Math.abs(bs.difference) > 1 ? theme.red + '18' : theme.green + '18', border: `1px solid ${Math.abs(bs.difference) > 1 ? theme.red : theme.green}44` }}>
            {Math.abs(bs.difference) > 1
              ? <div style={{ color: theme.red, fontWeight: '700' }}>⚠ Balance Sheet does not balance — difference of {naira(Math.abs(bs.difference))}. Please check opening balances.</div>
              : <div style={{ color: theme.green, fontWeight: '700' }}>✓ Balance Sheet balances</div>
            }
          </div>

          {/* Adjustments */}
          {canEdit && (
            <div style={s.card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <div style={s.sectionTitle}>Manual Adjustments</div>
                <button style={s.btn('secondary')} onClick={() => setShowAdjForm(v => !v)}>+ Add Adjustment</button>
              </div>
              {showAdjForm && (
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '10px' }}>
                  <input style={s.input} placeholder="Account name" value={adjForm.account_name} onChange={e => setAdjForm(v => ({...v, account_name: e.target.value}))} />
                  <input type="number" style={s.input} placeholder="Amount (₦)" value={adjForm.amount} onChange={e => setAdjForm(v => ({...v, amount: e.target.value}))} />
                  <input style={s.input} placeholder="Reason" value={adjForm.reason} onChange={e => setAdjForm(v => ({...v, reason: e.target.value}))} />
                  <button style={s.btn('primary')} onClick={addAdj}>Add</button>
                  <button style={s.btn('secondary')} onClick={() => setShowAdjForm(false)}>Cancel</button>
                </div>
              )}
              {(bs.adjustments||[]).map(adj => (
                <div key={adj.id} style={s.row()}>
                  <span>{adj.account_name} {adj.reason && <span style={{ color: theme.textMuted, fontSize: '11px' }}>— {adj.reason}</span>}</span>
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <span style={{ fontWeight: '600' }}>{naira(adj.amount)}</span>
                    <button style={{ ...s.btn('danger'), padding: '2px 8px', fontSize: '10px' }} onClick={async () => { await financialAdjustmentsService.delete(adj.id); load(asAt, setData) }}>✕</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ── INCOME STATEMENT ───────────────────────────────────────────────
const IncomeStatementTab = ({ userProfile }) => {
  const [from, setFrom] = useState(firstOfYear())
  const [to, setTo] = useState(today())
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [drilldown, setDrilldown] = useState(null)

  const canEdit = ['md', 'accountant'].includes(userProfile?.role)

  useEffect(() => {
    setLoading(true); setErr('')
    incomeStatementService.getData(from, to)
      .then(setData).catch(e => setErr(e.message)).finally(() => setLoading(false))
  }, [from, to])

  const calc = (d) => {
    if (!d) return null
    const payments = d.payments || []
    const incomeRecords = d.incomeRecords || []
    const expenses = d.expenses || []

    // Revenue by block type
    const revByBlock = {}
    payments.forEach(p => {
      const items = p.invoice?.order?.order_items || []
      items.forEach(item => {
        if (!revByBlock[item.block_type]) revByBlock[item.block_type] = 0
        revByBlock[item.block_type] += Number(item.unit_price||0) * Number(item.quantity||0)
      })
    })
    // Fallback: if no order items linked, use raw payment amounts
    const totalPayments = payments.reduce((s, p) => s + Number(p.amount_paid||0), 0)
    const totalBlockRev = Object.values(revByBlock).reduce((s, v) => s + v, 0)
    const blockRevAdjusted = totalBlockRev > 0 ? revByBlock : null
    const otherIncome = incomeRecords.reduce((s, r) => s + Number(r.amount||0), 0)
    const totalRevenue = totalPayments + otherIncome

    // Group expenses
    const expByParent = {}
    expenses.forEach(e => {
      const parent = e.category?.parent_category || e.category?.name || 'General'
      const cat = e.category?.name || 'Uncategorised'
      if (!expByParent[parent]) expByParent[parent] = {}
      if (!expByParent[parent][cat]) expByParent[parent][cat] = 0
      expByParent[parent][cat] += Number(e.amount||0)
    })

    const costOfSalesGroups = ['Cost of Production']
    const cogsTotal = Object.entries(expByParent)
      .filter(([k]) => costOfSalesGroups.some(g => k.includes(g)))
      .reduce((s, [, cats]) => s + Object.values(cats).reduce((a, b) => a + b, 0), 0)

    const opExpGroups = Object.entries(expByParent)
      .filter(([k]) => !costOfSalesGroups.some(g => k.includes(g)))

    const totalOpEx = opExpGroups.reduce((s, [, cats]) => s + Object.values(cats).reduce((a, b) => a + b, 0), 0)

    const grossProfit = totalRevenue - cogsTotal
    const grossMargin = totalRevenue > 0 ? ((grossProfit / totalRevenue) * 100).toFixed(1) : 0
    const operatingProfit = grossProfit - totalOpEx
    const taxAdj = (d.adjustments||[]).filter(a => a.account_name.toLowerCase().includes('tax')).reduce((s, a) => s + Number(a.amount||0), 0)
    const netProfit = operatingProfit - taxAdj
    const netMargin = totalRevenue > 0 ? ((netProfit / totalRevenue) * 100).toFixed(1) : 0

    return { blockRevAdjusted, totalPayments, otherIncome, totalRevenue, expByParent, cogsTotal, opExpGroups, totalOpEx, grossProfit, grossMargin, operatingProfit, taxAdj, netProfit, netMargin, adjustments: d.adjustments||[], expenses }
  }

  const is = calc(data)

  const downloadPDF = async () => {
    if (!is) return
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    let y = await addPdfHeader(doc, 'INCOME STATEMENT', `${from} to ${to}`)
    const W = doc.internal.pageSize.getWidth(); const ml = 14; const mr = W - 14

    const row = (label, val, indent=0, bold=false) => {
      doc.setFontSize(9); doc.setFont('helvetica', bold?'bold':'normal'); doc.setTextColor(bold?20:40)
      doc.text(label, ml+indent, y); doc.text(`₦${fmt(val)}`, mr, y, {align:'right'}); y += 5
    }
    const divider = () => { doc.setDrawColor(200); doc.setLineWidth(0.3); doc.line(ml, y, mr, y); y += 3 }

    row('REVENUE', '', 0, true)
    row('Customer Payments', is.totalPayments, 4)
    row('Other Income', is.otherIncome, 4)
    row('TOTAL REVENUE', is.totalRevenue, 0, true); divider()

    row('COST OF SALES (Production)', '', 0, true)
    const cogs = Object.entries(is.expByParent).filter(([k]) => k.includes('Production'))
    cogs.forEach(([, cats]) => Object.entries(cats).forEach(([cat, val]) => row(cat, val, 4)))
    row('COST OF GOODS SOLD', is.cogsTotal, 0, true); divider()
    row(`GROSS PROFIT (${is.grossMargin}%)`, is.grossProfit, 0, true); divider()

    row('OPERATING EXPENSES', '', 0, true)
    is.opExpGroups.forEach(([parent, cats]) => {
      row(parent, '', 2, true)
      Object.entries(cats).forEach(([cat, val]) => row(cat, val, 6))
    })
    row('TOTAL OPERATING EXPENSES', is.totalOpEx, 0, true); divider()
    row('OPERATING PROFIT', is.operatingProfit, 0, true)
    if (is.taxAdj) row('Tax Provision', is.taxAdj, 4)
    divider()
    row(`NET PROFIT / (LOSS)  [${is.netMargin}% margin]`, is.netProfit, 0, true)

    doc.setFontSize(8); doc.setFont('helvetica','italic'); doc.setTextColor(140)
    doc.text(`Prepared: ${new Date().toLocaleDateString()}  |  Abuja Precast Concrete Limited`, W/2, doc.internal.pageSize.getHeight()-8, {align:'center'})
    doc.save(`Income_Statement_${from}_to_${to}.pdf`)
  }

  const Section = ({ title, items, total, totalColor, indent=1 }) => (
    <div style={{ marginBottom: '8px' }}>
      <div style={{ ...s.sectionTitle, marginTop: '8px' }}>{title}</div>
      {items.map(([label, val], i) => (
        <div key={i} style={{ ...s.row(indent), cursor: 'pointer' }} onClick={() => setDrilldown(drilldown===label ? null : label)}>
          <span>{label}</span>
          <span style={{ fontWeight: '600' }}>{naira(val)}</span>
        </div>
      ))}
      <div style={s.totalRow(totalColor || theme.text)}><span>Total {title}</span><span>{naira(total)}</span></div>
    </div>
  )

  return (
    <div>
      <div style={s.header}>
        <div>
          <div style={{ fontSize: '16px', fontWeight: '700', color: theme.text }}>Income Statement</div>
          <div style={{ fontSize: '12px', color: theme.textMuted, marginTop: '4px' }}>Revenue, costs and profitability for the period</div>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          <div><div style={s.label}>From</div><input type="date" style={s.input} value={from} onChange={e => setFrom(e.target.value)} /></div>
          <div><div style={s.label}>To</div><input type="date" style={s.input} value={to} onChange={e => setTo(e.target.value)} /></div>
          <button style={{ ...s.btn('primary'), marginTop: '18px' }} onClick={downloadPDF}>⬇ Download PDF</button>
        </div>
      </div>

      {err && <div style={{ color: theme.red, marginBottom: '12px', fontSize: '12px' }}>{err}</div>}
      {loading && <div style={{ color: theme.textMuted, marginBottom: '12px' }}>Loading...</div>}

      {is && (
        <>
          {/* KPI Summary */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '12px', marginBottom: '16px' }}>
            {[
              { label: 'Total Revenue', val: is.totalRevenue, color: theme.green },
              { label: 'Gross Profit', val: is.grossProfit, sub: `${is.grossMargin}% margin`, color: is.grossProfit >= 0 ? theme.green : theme.red },
              { label: 'Operating Profit', val: is.operatingProfit, color: is.operatingProfit >= 0 ? theme.green : theme.red },
              { label: 'Net Profit', val: is.netProfit, sub: `${is.netMargin}% margin`, color: is.netProfit >= 0 ? theme.green : theme.red },
            ].map(({ label, val, sub, color }) => (
              <div key={label} style={{ ...s.card, padding: '14px', marginBottom: 0 }}>
                <div style={{ fontSize: '10px', fontWeight: '700', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
                <div style={{ fontSize: '20px', fontWeight: '800', color, marginTop: '6px' }}>{naira(val)}</div>
                {sub && <div style={{ fontSize: '11px', color: theme.textMuted, marginTop: '2px' }}>{sub}</div>}
              </div>
            ))}
          </div>

          <div style={s.card}>
            {/* Revenue */}
            <div style={{ fontWeight: '800', fontSize: '13px', color: theme.text, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '10px' }}>Revenue</div>
            {is.blockRevAdjusted
              ? Object.entries(is.blockRevAdjusted).map(([bt, val]) => (
                  <div key={bt} style={s.row(1)}><span>{bt}</span><span style={{ fontWeight: '600' }}>{naira(val)}</span></div>
                ))
              : <div style={s.row(1)}><span>Customer Payments</span><span style={{ fontWeight: '600' }}>{naira(is.totalPayments)}</span></div>
            }
            {is.otherIncome > 0 && <div style={s.row(1)}><span>Other Income</span><span style={{ fontWeight: '600' }}>{naira(is.otherIncome)}</span></div>}
            <div style={s.totalRow(theme.green)}><span>Total Revenue</span><span>{naira(is.totalRevenue)}</span></div>

            <div style={{ height: '14px' }} />
            {/* COGS */}
            <div style={{ fontWeight: '800', fontSize: '13px', color: theme.text, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '10px' }}>Cost of Sales</div>
            {Object.entries(is.expByParent)
              .filter(([k]) => k.toLowerCase().includes('production') || k.toLowerCase().includes('cost of'))
              .map(([parent, cats]) => (
                <div key={parent}>
                  <div style={{ ...s.row(1), fontWeight: '700', color: theme.textMuted, fontSize: '12px' }}><span>{parent}</span></div>
                  {Object.entries(cats).map(([cat, val]) => (
                    <div key={cat} style={s.row(2)}><span>{cat}</span><span style={{ fontWeight: '600' }}>{naira(val)}</span></div>
                  ))}
                </div>
              ))}
            <div style={s.totalRow(theme.red)}><span>Cost of Goods Sold</span><span>{naira(is.cogsTotal)}</span></div>
            <div style={s.doubleRow}><span>Gross Profit ({is.grossMargin}%)</span><span style={{ color: is.grossProfit >= 0 ? theme.green : theme.red }}>{naira(is.grossProfit)}</span></div>

            <div style={{ height: '14px' }} />
            {/* Operating Expenses */}
            <div style={{ fontWeight: '800', fontSize: '13px', color: theme.text, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '10px' }}>Operating Expenses</div>
            {is.opExpGroups.map(([parent, cats]) => (
              <div key={parent}>
                <div style={{ ...s.row(1), fontWeight: '700', fontSize: '12px', color: theme.textMuted }}><span>{parent}</span><span style={{ fontWeight: '600', color: theme.text }}>{naira(Object.values(cats).reduce((a,b)=>a+b,0))}</span></div>
                {Object.entries(cats).map(([cat, val]) => (
                  <div key={cat} style={s.row(2)}><span>{cat}</span><span style={{ fontWeight: '600' }}>{naira(val)}</span></div>
                ))}
              </div>
            ))}
            <div style={s.totalRow(theme.red)}><span>Total Operating Expenses</span><span>{naira(is.totalOpEx)}</span></div>

            <div style={{ height: '8px' }} />
            <div style={s.doubleRow}><span>Operating Profit</span><span style={{ color: is.operatingProfit >= 0 ? theme.green : theme.red }}>{naira(is.operatingProfit)}</span></div>
            {is.taxAdj > 0 && <div style={s.row(1)}><span>Tax Provision</span><span style={{ fontWeight: '600', color: theme.red }}>{naira(is.taxAdj)}</span></div>}
            <div style={s.doubleRow}><span>Net Profit / (Loss) — {is.netMargin}%</span><span style={{ color: is.netProfit >= 0 ? theme.green : theme.red, fontSize: '15px' }}>{naira(is.netProfit)}</span></div>
          </div>
        </>
      )}
    </div>
  )
}

// ── CASH FLOW STATEMENT ────────────────────────────────────────────
const CashFlowTab = ({ userProfile }) => {
  const [from, setFrom] = useState(firstOfMonth())
  const [to, setTo] = useState(today())
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [adjForm, setAdjForm] = useState({ type: 'operating', account_name: '', amount: '', reason: '' })
  const [showAdjForm, setShowAdjForm] = useState(false)

  const canEdit = ['md', 'accountant'].includes(userProfile?.role)

  useEffect(() => {
    setLoading(true); setErr('')
    cashFlowService.getData(from, to)
      .then(setData).catch(e => setErr(e.message)).finally(() => setLoading(false))
  }, [from, to])

  const calc = (d) => {
    if (!d) return null
    const obs = d.openingBalances || []
    const adjs = d.adjustments || []
    const opAdjs = adjs.filter(a => a.statement_type === 'cashflow' && (!a.account_name.toLowerCase().includes('invest') && !a.account_name.toLowerCase().includes('loan') && !a.account_name.toLowerCase().includes('capital')))
    const invAdjs = adjs.filter(a => a.statement_type === 'cashflow' && (a.account_name.toLowerCase().includes('purchase') || a.account_name.toLowerCase().includes('invest') || a.account_name.toLowerCase().includes('equipment')))
    const finAdjs = adjs.filter(a => a.statement_type === 'cashflow' && (a.account_name.toLowerCase().includes('loan') || a.account_name.toLowerCase().includes('capital') || a.account_name.toLowerCase().includes('repay')))

    const netProfit = Number(d.netProfit || 0)
    const depreciation = obs.filter(o => o.sub_category === 'fixed_asset').reduce((s, o) => s + Number(o.depreciation_amount||0), 0)
    const opAdjTotal = opAdjs.reduce((s, a) => s + Number(a.amount||0), 0)
    const netCashOps = netProfit + depreciation + opAdjTotal

    const invAdjTotal = invAdjs.reduce((s, a) => s + Number(a.amount||0), 0)
    const netCashInv = invAdjTotal

    const finAdjTotal = finAdjs.reduce((s, a) => s + Number(a.amount||0), 0)
    const netCashFin = finAdjTotal

    const netChange = netCashOps + netCashInv + netCashFin
    const openingCash = Number(d.bankOpening||0)
    const closingCash = Number(d.bankClosing||0)
    const cashFromBanks = (d.bankAccounts||[]).reduce((s, b) => s + Number(b.current_balance||0), 0)
    const cashOnHand = obs.find(o => o.account_name?.toLowerCase().includes('cash on hand'))?.amount || 0

    return { netProfit, depreciation, opAdjs, opAdjTotal, netCashOps, invAdjs, invAdjTotal, netCashInv, finAdjs, finAdjTotal, netCashFin, netChange, openingCash, closingCash, cashFromBanks, cashOnHand, bankAccounts: d.bankAccounts||[] }
  }

  const cf = calc(data)

  const addAdj = async () => {
    if (!adjForm.account_name || !adjForm.amount) return
    try {
      await financialAdjustmentsService.create({ statement_type: 'cashflow', account_name: adjForm.account_name, amount: Number(adjForm.amount), period_from: from, period_to: to, adjustment_date: to, reason: adjForm.reason, entered_by: userProfile?.full_name })
      setAdjForm({ type: 'operating', account_name: '', amount: '', reason: '' }); setShowAdjForm(false)
      cashFlowService.getData(from, to).then(setData)
    } catch(e) { setErr(e.message) }
  }

  const downloadPDF = async () => {
    if (!cf) return
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    let y = await addPdfHeader(doc, 'CASH FLOW STATEMENT', `${from} to ${to}`)
    const W = doc.internal.pageSize.getWidth(); const ml = 14; const mr = W - 14
    const row = (label, val, indent=0, bold=false) => {
      doc.setFontSize(9); doc.setFont('helvetica', bold?'bold':'normal'); doc.setTextColor(bold?20:40)
      doc.text(label, ml+indent, y); if (val !== undefined) doc.text(`₦${fmt(val)}`, mr, y, {align:'right'}); y += 5
    }
    const divider = () => { doc.setDrawColor(200); doc.setLineWidth(0.3); doc.line(ml, y, mr, y); y += 3 }
    row('OPERATING ACTIVITIES', undefined, 0, true)
    row('Net Profit for Period', cf.netProfit, 4)
    row('Add: Depreciation', cf.depreciation, 4)
    cf.opAdjs.forEach(a => row(a.account_name, a.amount, 4))
    row('NET CASH FROM OPERATIONS', cf.netCashOps, 0, true); divider()
    row('INVESTING ACTIVITIES', undefined, 0, true)
    cf.invAdjs.forEach(a => row(a.account_name, a.amount, 4))
    if (!cf.invAdjs.length) row('No investing activities', 0, 4)
    row('NET CASH FROM INVESTING', cf.netCashInv, 0, true); divider()
    row('FINANCING ACTIVITIES', undefined, 0, true)
    cf.finAdjs.forEach(a => row(a.account_name, a.amount, 4))
    if (!cf.finAdjs.length) row('No financing activities', 0, 4)
    row('NET CASH FROM FINANCING', cf.netCashFin, 0, true); divider()
    row('NET INCREASE / (DECREASE) IN CASH', cf.netChange, 0, true); y += 2
    row('Opening Cash Balance', cf.openingCash, 4)
    row('CLOSING CASH BALANCE', cf.closingCash, 0, true); divider()
    y += 4; row('RECONCILIATION', undefined, 0, true)
    cf.bankAccounts.forEach(b => row(`Cash at Bank — ${b.account_name}`, b.current_balance, 4))
    row('Cash on Hand', cf.cashOnHand, 4)
    row('TOTAL CASH', cf.cashFromBanks + cf.cashOnHand, 0, true)
    doc.setFontSize(8); doc.setFont('helvetica','italic'); doc.setTextColor(140)
    doc.text(`Prepared: ${new Date().toLocaleDateString()}  |  Abuja Precast Concrete Limited`, W/2, doc.internal.pageSize.getHeight()-8, {align:'center'})
    doc.save(`Cash_Flow_${from}_to_${to}.pdf`)
  }

  const CfRow = ({ label, val, indent=0, color }) => (
    <div style={s.row(indent)}>
      <span>{label}</span>
      <span style={{ fontWeight: '600', color: color || (Number(val) < 0 ? theme.red : 'inherit') }}>{Number(val) >= 0 ? naira(val) : `(${naira(Math.abs(val))})`}</span>
    </div>
  )

  return (
    <div>
      <div style={s.header}>
        <div>
          <div style={{ fontSize: '16px', fontWeight: '700', color: theme.text }}>Cash Flow Statement</div>
          <div style={{ fontSize: '12px', color: theme.textMuted, marginTop: '4px' }}>Sources and uses of cash for the period</div>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          <div><div style={s.label}>From</div><input type="date" style={s.input} value={from} onChange={e => setFrom(e.target.value)} /></div>
          <div><div style={s.label}>To</div><input type="date" style={s.input} value={to} onChange={e => setTo(e.target.value)} /></div>
          <button style={{ ...s.btn('primary'), marginTop: '18px' }} onClick={downloadPDF}>⬇ Download PDF</button>
        </div>
      </div>

      {err && <div style={{ color: theme.red, marginBottom: '12px', fontSize: '12px' }}>{err}</div>}
      {loading && <div style={{ color: theme.textMuted, marginBottom: '12px' }}>Loading...</div>}

      {cf && (
        <div style={s.card}>
          <div style={s.sectionTitle}>Operating Activities</div>
          <CfRow label="Net Profit for Period" val={cf.netProfit} indent={1} />
          <CfRow label="Add: Depreciation" val={cf.depreciation} indent={1} />
          {cf.opAdjs.map(a => <CfRow key={a.id} label={a.account_name} val={a.amount} indent={1} />)}
          <div style={s.totalRow(cf.netCashOps >= 0 ? theme.green : theme.red)}><span>Net Cash from Operations</span><span>{cf.netCashOps >= 0 ? naira(cf.netCashOps) : `(${naira(Math.abs(cf.netCashOps))})`}</span></div>

          <div style={{ height: '14px' }} />
          <div style={s.sectionTitle}>Investing Activities</div>
          {cf.invAdjs.length === 0
            ? <div style={{ color: theme.textMuted, fontSize: '12px', padding: '4px 0 4px 16px' }}>No investing activities recorded</div>
            : cf.invAdjs.map(a => <CfRow key={a.id} label={a.account_name} val={a.amount} indent={1} />)
          }
          <div style={s.totalRow(cf.netCashInv >= 0 ? theme.green : theme.red)}><span>Net Cash from Investing</span><span>{cf.netCashInv >= 0 ? naira(cf.netCashInv) : `(${naira(Math.abs(cf.netCashInv))})`}</span></div>

          <div style={{ height: '14px' }} />
          <div style={s.sectionTitle}>Financing Activities</div>
          {cf.finAdjs.length === 0
            ? <div style={{ color: theme.textMuted, fontSize: '12px', padding: '4px 0 4px 16px' }}>No financing activities recorded</div>
            : cf.finAdjs.map(a => <CfRow key={a.id} label={a.account_name} val={a.amount} indent={1} />)
          }
          <div style={s.totalRow(cf.netCashFin >= 0 ? theme.green : theme.red)}><span>Net Cash from Financing</span><span>{cf.netCashFin >= 0 ? naira(cf.netCashFin) : `(${naira(Math.abs(cf.netCashFin))})`}</span></div>

          <div style={{ height: '14px' }} />
          <div style={s.doubleRow}>
            <span>Net Increase / (Decrease) in Cash</span>
            <span style={{ color: cf.netChange >= 0 ? theme.green : theme.red }}>{cf.netChange >= 0 ? naira(cf.netChange) : `(${naira(Math.abs(cf.netChange))})`}</span>
          </div>
          <div style={s.row(1)}><span>Opening Cash Balance</span><span style={{ fontWeight: '600' }}>{naira(cf.openingCash)}</span></div>
          <div style={s.totalRow(theme.green)}><span>Closing Cash Balance</span><span>{naira(cf.closingCash)}</span></div>

          <div style={{ height: '14px' }} />
          <div style={s.sectionTitle}>Reconciliation — Cash & Bank Balances</div>
          {cf.bankAccounts.map(b => <div key={b.id} style={s.row(1)}><span>Cash at Bank — {b.account_name}</span><span style={{ fontWeight: '600' }}>{naira(b.current_balance)}</span></div>)}
          <div style={s.row(1)}><span>Cash on Hand</span><span style={{ fontWeight: '600' }}>{naira(cf.cashOnHand)}</span></div>
          <div style={s.totalRow(theme.green)}><span>Total Cash</span><span>{naira(cf.cashFromBanks + cf.cashOnHand)}</span></div>

          {canEdit && (
            <div style={{ marginTop: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <div style={s.sectionTitle}>Manual Entries</div>
                <button style={s.btn('secondary')} onClick={() => setShowAdjForm(v => !v)}>+ Add Entry</button>
              </div>
              {showAdjForm && (
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '10px' }}>
                  <input style={s.input} placeholder="Description (include: invest/loan/capital for correct section)" value={adjForm.account_name} onChange={e => setAdjForm(v => ({...v, account_name: e.target.value}))} />
                  <input type="number" style={s.input} placeholder="Amount (₦, negative for outflows)" value={adjForm.amount} onChange={e => setAdjForm(v => ({...v, amount: e.target.value}))} />
                  <input style={s.input} placeholder="Reason" value={adjForm.reason} onChange={e => setAdjForm(v => ({...v, reason: e.target.value}))} />
                  <button style={s.btn('primary')} onClick={addAdj}>Add</button>
                  <button style={s.btn('secondary')} onClick={() => setShowAdjForm(false)}>Cancel</button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── MANAGEMENT ACCOUNTS ────────────────────────────────────────────
const ManagementAccountsTab = ({ userProfile }) => {
  const now = new Date()
  const [month, setMonth] = useState(`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')

  const from = `${month}-01`
  const toDate = new Date(month + '-01'); toDate.setMonth(toDate.getMonth()+1); toDate.setDate(0)
  const to = toDate.toISOString().split('T')[0]

  useEffect(() => {
    setLoading(true); setErr('')
    Promise.allSettled([
      incomeStatementService.getData(from, to),
      balanceSheetService.getData(to),
      cashFlowService.getData(from, to),
      // Previous month
      (() => {
        const prev = new Date(month + '-01'); prev.setMonth(prev.getMonth()-1)
        const pFrom = prev.toISOString().split('T')[0].slice(0,7)+'-01'
        const pEnd = new Date(pFrom); pEnd.setMonth(pEnd.getMonth()+1); pEnd.setDate(0)
        return incomeStatementService.getData(pFrom, pEnd.toISOString().split('T')[0])
      })(),
    ]).then(([is, bs, cf, prevIs]) => {
      setData({ is: is.value, bs: bs.value, cf: cf.value, prevIs: prevIs.value })
    }).finally(() => setLoading(false))
  }, [from, to])

  const calcIs = (d) => {
    if (!d) return null
    const payments = d.payments || []
    const incomeRecords = d.incomeRecords || []
    const expenses = d.expenses || []
    const totalPayments = payments.reduce((s, p) => s + Number(p.amount_paid||0), 0)
    const otherIncome = incomeRecords.reduce((s, r) => s + Number(r.amount||0), 0)
    const totalRevenue = totalPayments + otherIncome
    const expByParent = {}
    expenses.forEach(e => {
      const parent = e.category?.parent_category || e.category?.name || 'General'
      if (!expByParent[parent]) expByParent[parent] = 0
      expByParent[parent] += Number(e.amount||0)
    })
    const cogsTotal = Object.entries(expByParent).filter(([k]) => k.includes('Production')).reduce((s, [, v]) => s+v, 0)
    const totalOpEx = Object.entries(expByParent).filter(([k]) => !k.includes('Production')).reduce((s, [, v]) => s+v, 0)
    const grossProfit = totalRevenue - cogsTotal
    const netProfit = grossProfit - totalOpEx
    return { totalRevenue, cogsTotal, grossProfit, totalOpEx, netProfit, expByParent, payments, expenses }
  }

  const is = calcIs(data?.is)
  const prevIs = calcIs(data?.prevIs)
  const bs = data?.bs ? (() => {
    const obs = data.bs.openingBalances || []
    const bankTotal = (data.bs.bankAccounts||[]).reduce((s, b) => s + Number(b.current_balance||0), 0)
    const cashOnHand = obs.find(o => o.account_name?.toLowerCase().includes('cash on hand'))?.amount || 0
    return { cashPosition: bankTotal + cashOnHand, receivables: data.bs.receivables || 0 }
  })() : null

  const pct = (a, b) => b && b !== 0 ? `${((a - b) / Math.abs(b) * 100).toFixed(1)}%` : '—'
  const arrow = (a, b) => a >= b ? '▲' : '▼'
  const arrowColor = (a, b, lowerIsBetter=false) => {
    if (a === b) return theme.textMuted
    const better = lowerIsBetter ? a < b : a > b
    return better ? theme.green : theme.red
  }

  const downloadManagementAccounts = async () => {
    if (!is) return
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const monthLabel = new Date(month+'-01').toLocaleDateString('en-GB',{month:'long',year:'numeric'})
    let y = await addPdfHeader(doc, 'MANAGEMENT ACCOUNTS', monthLabel)
    const W = doc.internal.pageSize.getWidth(); const ml = 14; const mr = W - 14

    // PAGE 1 — Executive Summary
    doc.setFontSize(10); doc.setFont('helvetica','bold'); doc.setTextColor(245,166,35)
    doc.text('PAGE 1 — EXECUTIVE SUMMARY', ml, y); y += 8

    const kpis = [
      ['Revenue', is.totalRevenue, prevIs?.totalRevenue],
      ['Gross Profit', is.grossProfit, prevIs?.grossProfit],
      ['Net Profit', is.netProfit, prevIs?.netProfit],
      ['Cash Position', bs?.cashPosition, null],
      ['Outstanding Receivables', bs?.receivables, null],
    ]
    autoTable(doc, {
      startY: y, margin: { left: ml, right: 14 },
      head: [['Metric', 'This Month', 'Last Month', 'Change']],
      body: kpis.map(([label, val, prev]) => [label, `₦${fmt(val)}`, prev != null ? `₦${fmt(prev)}` : '—', prev != null ? `${arrow(val,prev)} ${pct(val,prev)}` : '—']),
      styles: { fontSize: 9, cellPadding: 3, textColor: [30,30,30] },
      headStyles: { fillColor: [245,166,35], textColor: [20,20,20], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [245,245,250] },
    })
    y = doc.lastAutoTable.finalY + 10

    // PAGE 2 — Income Statement
    if (y > 200) { doc.addPage(); y = 20 }
    doc.setFontSize(10); doc.setFont('helvetica','bold'); doc.setTextColor(245,166,35)
    doc.text('PAGE 2 — INCOME STATEMENT', ml, y); y += 6
    autoTable(doc, {
      startY: y, margin: { left: ml, right: 14 },
      head: [['Item', 'Amount']],
      body: [
        ['Total Revenue', `₦${fmt(is.totalRevenue)}`],
        ['Cost of Sales', `(₦${fmt(is.cogsTotal)})`],
        ['GROSS PROFIT', `₦${fmt(is.grossProfit)}`],
        ['Operating Expenses', `(₦${fmt(is.totalOpEx)})`],
        ['NET PROFIT / (LOSS)', `₦${fmt(is.netProfit)}`],
      ],
      styles: { fontSize: 9, cellPadding: 3 },
      headStyles: { fillColor: [245,166,35], textColor: [20,20,20] },
    })
    y = doc.lastAutoTable.finalY + 10

    // Top customers
    if (y > 220) { doc.addPage(); y = 20 }
    doc.setFontSize(10); doc.setFont('helvetica','bold'); doc.setTextColor(245,166,35)
    doc.text('PAGE 7 — TOP CUSTOMERS', ml, y); y += 6
    const custMap = {}
    ;(is.payments||[]).forEach(p => {
      const name = p.invoice?.order?.customer?.name || 'Unknown'
      custMap[name] = (custMap[name]||0) + Number(p.amount_paid||0)
    })
    const topCusts = Object.entries(custMap).sort((a,b) => b[1]-a[1]).slice(0,10)
    autoTable(doc, {
      startY: y, margin: { left: ml, right: 14 },
      head: [['#', 'Customer', 'Revenue', '% of Total']],
      body: topCusts.map(([name, rev], i) => [i+1, name, `₦${fmt(rev)}`, is.totalRevenue > 0 ? `${((rev/is.totalRevenue)*100).toFixed(1)}%` : '0%']),
      styles: { fontSize: 9 },
      headStyles: { fillColor: [245,166,35], textColor: [20,20,20] },
    })

    // Expense breakdown
    doc.addPage(); y = 20
    doc.setFontSize(10); doc.setFont('helvetica','bold'); doc.setTextColor(245,166,35)
    doc.text('PAGE 8 — EXPENSE ANALYSIS', ml, y); y += 6
    autoTable(doc, {
      startY: y, margin: { left: ml, right: 14 },
      head: [['Category', 'Amount', '% of Total Expenses']],
      body: Object.entries(is.expByParent||{}).sort((a,b) => b[1]-a[1]).map(([cat, val]) => [cat, `₦${fmt(val)}`, is.totalOpEx+is.cogsTotal > 0 ? `${((val/(is.totalOpEx+is.cogsTotal))*100).toFixed(1)}%` : '0%']),
      styles: { fontSize: 9 },
      headStyles: { fillColor: [245,166,35], textColor: [20,20,20] },
    })

    // Footer on all pages
    const pages = doc.internal.getNumberOfPages()
    for (let i = 1; i <= pages; i++) {
      doc.setPage(i)
      doc.setFontSize(8); doc.setFont('helvetica','italic'); doc.setTextColor(140)
      doc.text(`Page ${i} of ${pages}  |  ${monthLabel}  |  Abuja Precast Concrete Limited  |  CONFIDENTIAL`, W/2, doc.internal.pageSize.getHeight()-8, {align:'center'})
    }
    doc.save(`Management_Accounts_${month}.pdf`)
  }

  return (
    <div>
      <div style={s.header}>
        <div>
          <div style={{ fontSize: '16px', fontWeight: '700', color: theme.text }}>Management Accounts</div>
          <div style={{ fontSize: '12px', color: theme.textMuted, marginTop: '4px' }}>Monthly board-quality summary pack</div>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <div><div style={s.label}>Month</div><input type="month" style={s.input} value={month} onChange={e => setMonth(e.target.value)} /></div>
          <button style={{ ...s.btn('primary'), marginTop: '18px', fontWeight: '700' }} onClick={downloadManagementAccounts}>⬇ Download Management Accounts Pack</button>
        </div>
      </div>

      {err && <div style={{ color: theme.red, marginBottom: '12px', fontSize: '12px' }}>{err}</div>}
      {loading && <div style={{ color: theme.textMuted, marginBottom: '12px' }}>Loading...</div>}

      {is && (
        <>
          {/* KPI Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '12px', marginBottom: '16px' }}>
            {[
              { label: 'Revenue', val: is.totalRevenue, prev: prevIs?.totalRevenue, color: theme.green },
              { label: 'Gross Profit', val: is.grossProfit, prev: prevIs?.grossProfit, color: is.grossProfit >= 0 ? theme.green : theme.red },
              { label: 'Net Profit', val: is.netProfit, prev: prevIs?.netProfit, color: is.netProfit >= 0 ? theme.green : theme.red },
              { label: 'Cash Position', val: bs?.cashPosition, prev: null, color: theme.blue },
              { label: 'Outstanding Receivables', val: bs?.receivables, prev: null, color: theme.accent },
              { label: 'Total Expenses', val: (is.cogsTotal||0)+(is.totalOpEx||0), prev: prevIs ? (prevIs.cogsTotal||0)+(prevIs.totalOpEx||0) : null, color: theme.red },
            ].map(({ label, val, prev, color }) => (
              <div key={label} style={{ ...s.card, padding: '14px', marginBottom: 0 }}>
                <div style={{ fontSize: '10px', fontWeight: '700', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
                <div style={{ fontSize: '20px', fontWeight: '800', color, marginTop: '6px' }}>{naira(val||0)}</div>
                {prev != null && (
                  <div style={{ fontSize: '11px', color: arrowColor(val||0, prev, label.includes('Expense')||label.includes('Receivable')), marginTop: '2px' }}>
                    {arrow(val||0, prev)} {pct(val||0, prev)} vs last month
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* P&L Summary Table */}
          <div style={s.card}>
            <div style={s.sectionTitle}>Income Statement Summary — {new Date(month+'-01').toLocaleDateString('en-GB',{month:'long',year:'numeric'})}</div>
            {[
              { label: 'Total Revenue', val: is.totalRevenue, prev: prevIs?.totalRevenue, bold: false },
              { label: 'Cost of Sales', val: -is.cogsTotal, prev: prevIs ? -prevIs.cogsTotal : null, bold: false },
              { label: 'Gross Profit', val: is.grossProfit, prev: prevIs?.grossProfit, bold: true },
              { label: 'Operating Expenses', val: -is.totalOpEx, prev: prevIs ? -prevIs.totalOpEx : null, bold: false },
              { label: 'Net Profit / (Loss)', val: is.netProfit, prev: prevIs?.netProfit, bold: true },
            ].map(({ label, val, prev, bold }) => (
              <div key={label} style={{ ...s.row(), fontWeight: bold ? '700' : '400', borderTop: bold ? `1px solid ${theme.border}` : undefined }}>
                <span>{label}</span>
                <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
                  {prev != null && <span style={{ color: theme.textMuted, fontSize: '12px' }}>{naira(Math.abs(prev))}</span>}
                  <span style={{ minWidth: '100px', textAlign: 'right', color: bold ? (val >= 0 ? theme.green : theme.red) : 'inherit' }}>{naira(Math.abs(val))}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Expense Breakdown */}
          <div style={s.card}>
            <div style={s.sectionTitle}>Expense Breakdown</div>
            {Object.entries(is.expByParent||{}).sort((a,b) => b[1]-a[1]).map(([cat, val]) => {
              const totalExp = (is.cogsTotal||0) + (is.totalOpEx||0)
              const pctVal = totalExp > 0 ? ((val / totalExp) * 100).toFixed(1) : 0
              return (
                <div key={cat} style={{ padding: '5px 0', borderBottom: `1px solid ${theme.border}22` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                    <span style={{ fontSize: '12px' }}>{cat}</span>
                    <span style={{ fontSize: '12px', fontWeight: '600' }}>{naira(val)} <span style={{ color: theme.textMuted }}>({pctVal}%)</span></span>
                  </div>
                  <div style={{ background: theme.border, borderRadius: '2px', height: '4px' }}>
                    <div style={{ background: theme.accent, height: '4px', borderRadius: '2px', width: `${pctVal}%`, transition: 'width 0.3s' }} />
                  </div>
                </div>
              )
            })}
          </div>

          {/* Top Customers */}
          <div style={s.card}>
            <div style={s.sectionTitle}>Top Customers by Revenue</div>
            {(() => {
              const custMap = {}
              ;(is.payments||[]).forEach(p => {
                const name = p.invoice?.order?.customer?.name || 'Unknown'
                custMap[name] = (custMap[name]||0) + Number(p.amount_paid||0)
              })
              return Object.entries(custMap).sort((a,b) => b[1]-a[1]).slice(0,10).map(([name, rev], i) => (
                <div key={name} style={s.row()}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ width: '20px', height: '20px', background: theme.accent+'33', border: `1px solid ${theme.accent}44`, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: '700', color: theme.accent }}>{i+1}</span>
                    <span style={{ fontSize: '13px' }}>{name}</span>
                  </div>
                  <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                    <span style={{ fontSize: '11px', color: theme.textMuted }}>{is.totalRevenue > 0 ? ((rev/is.totalRevenue)*100).toFixed(1) : 0}%</span>
                    <span style={{ fontWeight: '700', color: theme.green }}>{naira(rev)}</span>
                  </div>
                </div>
              ))
            })()}
          </div>
        </>
      )}
    </div>
  )
}

// ── MAIN COMPONENT ─────────────────────────────────────────────────
export default function FinancialStatements({ userProfile }) {
  const [tab, setTab] = useState('balance_sheet')
  const TABS = [
    { id: 'balance_sheet', label: 'Balance Sheet' },
    { id: 'income', label: 'Income Statement' },
    { id: 'cashflow', label: 'Cash Flow' },
    { id: 'management', label: 'Management Accounts' },
  ]
  return (
    <div>
      <div style={s.tabBar}>
        {TABS.map(t => (
          <button key={t.id} style={s.tab(tab === t.id)} onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
      </div>
      {tab === 'balance_sheet' && <BalanceSheetTab userProfile={userProfile} />}
      {tab === 'income'        && <IncomeStatementTab userProfile={userProfile} />}
      {tab === 'cashflow'      && <CashFlowTab userProfile={userProfile} />}
      {tab === 'management'    && <ManagementAccountsTab userProfile={userProfile} />}
    </div>
  )
}
