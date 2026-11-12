import React, { useEffect, useState } from 'react'
import { Download } from 'lucide-react'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { accountingBasisService } from '../services/accountingBasis'
import { ACCOUNTING_EXPLANATION } from '../utils/accountingBasis'

const naira = n => `₦${Number(n).toLocaleString()}`
export default function AccountingSummary({ from, to, refresh = 0, title = 'P&L Statement' }) {
  const [state, setState] = useState({})
  useEffect(() => {
    let active = true
    setState({})
    accountingBasisService.income(from, to).then(data => { if (active) setState({ data }) })
      .catch(error => { if (active) setState({ error: error.message }) })
    return () => { active = false }
  }, [from, to, refresh])
  const d = state.data
  const rows = d ? [['Revenue (delivered)', d.revenue], ['Cost (approved)', d.cost],
    ['Other adjustments', d.adjustment], ['Profit', d.netProfit], ['Cash received (memo)', d.cashReceived]] : []
  const download = () => {
    const doc = new jsPDF()
    doc.text(`${title}: ${from} to ${to}`, 14, 20)
    doc.setFontSize(9)
    doc.text(doc.splitTextToSize(ACCOUNTING_EXPLANATION, 180), 14, 28)
    autoTable(doc, { startY: 42, head: [['Item', 'NGN']], body: [
      ...rows.map(([label, value]) => [label, Number(value).toLocaleString()]),
      ['Awaiting approval (not included)', d.awaitingApproval],
      ...d.deliveredButUnpriced.map(r => [`Delivered but unpriced: ${r.block_type}`, r.quantity_received]),
    ] })
    doc.save(`Accounting-${from}-${to}.pdf`)
  }
  return <section style={{ minWidth: 0, overflowWrap: 'anywhere' }} aria-label={title}>
    <p>{ACCOUNTING_EXPLANATION}</p>
    {state.error ? <p role="alert" style={{ color: '#f06b6b' }}>Statement could not be loaded: {state.error}</p>
      : !d ? <p>Loading statement…</p> : <>
        <dl style={{ margin: 0 }}>{rows.map(([label, value]) => <div key={label} style={{ display: 'flex', gap: 12, justifyContent: 'space-between', flexWrap: 'wrap', padding: '10px 0' }}>
          <dt>{label}</dt><dd style={{ margin: 0 }}>{naira(value)}</dd>
        </div>)}</dl>
        <p>Awaiting approval: {naira(d.awaitingApproval)} (not included)</p>
        <p>{d.adjustmentNote}</p>
        {d.deliveredButUnpriced.map((r, i) => <p key={i}>Delivered but unpriced: {r.block_type} — {r.quantity_received}</p>)}
        <button type="button" onClick={download} style={{ minHeight: 44, padding: '8px 14px' }}><Download size={16} aria-hidden="true" /> Download PDF</button>
      </>}
  </section>
}
