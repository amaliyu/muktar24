import { owedInvoices } from './proforma'
export function statementRows(orders = [], from, to) {
  const entries = []
  for (const order of orders) for (const inv of owedInvoices(order.invoices)) {
    if (inv.issued_date) entries.push({ date: inv.issued_date, type: 'debit', description: `INVOICE ${inv.invoice_number || ''}`, ref: inv.invoice_number || '', debit: Number(inv.total_amount || 0), credit: 0, customer: order.customer?.name || '' })
    for (const p of inv.payments || []) if (p.status === 'confirmed' && p.payment_date) entries.push({ date: p.payment_date, type: 'credit', description: 'PAYMENT', ref: '', debit: 0, credit: Number(p.amount_paid || 0), customer: order.customer?.name || '' })
  }
  entries.sort((a, b) => a.date.localeCompare(b.date) || (a.type === b.type ? 0 : a.type === 'debit' ? -1 : 1))
  let running = entries.filter(r => from && r.date < from && (!to || r.date <= to)).reduce((n, r) => n + r.debit - r.credit, 0)
  const rows = from ? [{ date: from, type: 'opening', description: 'OPENING BALANCE', ref: '', debit: 0, credit: 0, balance: running }] : []
  for (const r of entries.filter(r => (!from || r.date >= from) && (!to || r.date <= to))) {
    running += r.debit - r.credit; rows.push({ ...r, balance: running })
  }
  return rows
}
export function invoiceAging(inv, asAt) {
  const paid = (inv.payments || []).filter(p => p.status === 'confirmed' && p.payment_date && p.payment_date <= asAt)
    .reduce((n, p) => n + Number(p.amount_paid || 0), 0)
  const days = inv.issued_date ? Math.floor((Date.parse(asAt) - Date.parse(inv.issued_date)) / 86400000) : 0
  return { paid, balance: Number(inv.total_amount || 0) - paid, days }
}
