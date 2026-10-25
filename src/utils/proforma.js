export const INVOICE_LABELS = { draft: 'Proforma', issued: 'Invoice (owed)', paid: 'Paid', cancelled: 'Cancelled' }
export const PROFORMA_SUBTITLE = 'Price quote — not a sale, not owed yet'
export const PROFORMA_DISCLAIMER = 'This is a price quotation. It is not an invoice and no amount is owed until an invoice is issued.'

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
