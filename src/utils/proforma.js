export const INVOICE_LABELS = { draft: 'Proforma', issued: 'Invoice (owed)', paid: 'Paid', cancelled: 'Cancelled' }
export const PROFORMA_SUBTITLE = 'Price quote — not a sale, not owed yet'
export const PROFORMA_DISCLAIMER = 'This is a price quotation. It is not an invoice and no amount is owed until an invoice is issued.'

export const owedInvoices = (invoices) => (invoices || []).filter(i => ['issued', 'paid'].includes(i.status))

export function invoiceTotals(invoices) {
  const active = owedInvoices(invoices)
  const totalValue = active.reduce((s, i) => s + Number(i.total_amount || 0), 0)
  const totalPaid = active.flatMap(i => i.payments || []).filter(p => p.status === 'confirmed')
    .reduce((s, p) => s + Number(p.amount_paid || 0), 0)
  return { totalValue, totalPaid, outstanding: totalValue - totalPaid }
}

export function customerInvoiceStats(customer) {
  const orders = customer.orders || []
  const totals = invoiceTotals(orders.flatMap(o => o.invoices || []))
  return { ...totals, orderCount: orders.length }
}

// One report row per order; sum its issued/paid invoices once, never its quote
// or order-item fallback. Invoice totals include the saved VAT/discount/delivery.
export function salesOrders(orders) {
  return orders.filter(o => owedInvoices(o.invoice).length > 0)
    .map(o => ({ ...o, salesTotal: invoiceTotals(o.invoice).totalValue }))
}

export function canCancelProformaOrder(invoices, paymentCount, waybillCount) {
  return !invoices.some(i => ['draft', 'issued', 'paid'].includes(i.status))
    && paymentCount === 0 && waybillCount === 0
}

export function isPendingOrder(order) {
  return order.status === 'pending' && !(order.invoices?.length > 0
    && order.invoices.every(i => i.status === 'cancelled'))
}

export function requireUpdatedRow({ data, error }, message) {
  if (error) throw error
  if (!data?.length) throw new Error(message)
  return data
}
