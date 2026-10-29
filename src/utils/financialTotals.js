export function incomeNetProfit(data) {
  if (data.warnings?.length) throw new Error(data.warnings.join('; '))
  const sum = (rows, key) => (rows || []).reduce((n, r) => n + Number(r[key] || 0), 0)
  // Keep the Income Statement tab's cash basis and tax adjustment treatment.
  return sum(data.payments, 'amount_paid') + sum(data.incomeRecords, 'amount')
    - sum(data.expenses, 'amount')
    - sum((data.adjustments || []).filter(a => a.account_name?.toLowerCase().includes('tax')), 'amount')
}
export function cashBalances(data) {
  return {
    openingCash: (data.bankStart || []).reduce((n, a) => n + Number(a.opening_balance || 0), 0),
    closingCash: (data.bankEnd || []).reduce((n, a) => n + Number(a.current_balance || 0), 0),
    bankAccounts: data.bankEnd || [],
  }
}
export function productReceipts(payments = []) {
  // Group instalments first, then allocate the period's cash by each order's
  // line-value proportions. Every order's lines are visited once per period.
  const orders = new Map(), totals = {}
  for (const p of payments) {
    const order = p.invoice?.order, key = order?.id
    if (!key) { totals['Unallocated receipts'] = (totals['Unallocated receipts'] || 0) + Number(p.amount_paid || 0); continue }
    if (!orders.has(key)) orders.set(key, { order, cash: 0 })
    orders.get(key).cash += Number(p.amount_paid || 0)
  }
  for (const { order, cash } of orders.values()) {
    const items = order.order_items || [], value = items.reduce((n, i) => n + Number(i.quantity || 0) * Number(i.unit_price || 0), 0)
    if (!value) { totals['Unallocated receipts'] = (totals['Unallocated receipts'] || 0) + cash; continue }
    for (const i of items) totals[i.block_type] = (totals[i.block_type] || 0) + cash * Number(i.quantity || 0) * Number(i.unit_price || 0) / value
  }
  return totals
}

export function expenseCosts(expenses = []) {
  const included = expenses.filter(e => e.status !== 'rejected')
  const totalExpenses = included.reduce((n, e) => n + Number(e.amount || 0), 0)
  const labourCost = included.filter(e => /labour|wages|salaries|loading/i.test(e.category?.name || ''))
    .reduce((n, e) => n + Number(e.amount || 0), 0)
  return { totalExpenses, labourCost, rawExpenses: totalExpenses - labourCost }
}
