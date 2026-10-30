// Audit 2B: pure accounting-basis calculations. Monetary values are NGN.
// No database calls belong here: source errors must be handled by the service.
const amount = value => Number(value || 0)
const inRange = (date, from, to) => Boolean(date) && (!from || date >= from) && (!to || date <= to)
const through = (date, asAt) => Boolean(date) && (!asAt || date <= asAt)
const sameSite = (row, siteId) => !siteId || row.site_id === siteId

export function deliveredRevenue(rows = [], { from, to, siteId } = {}) {
  const priced = [], unpriced = []
  for (const row of rows) {
    if (!inRange(row.waybill_date, from, to) || !sameSite(row, siteId)) continue
    if (row.unvalued === true || row.line_value == null) unpriced.push(row)
    else priced.push(row)
  }
  return {
    revenue: priced.reduce((sum, row) => sum + amount(row.line_value), 0),
    deliveredButUnpriced: unpriced,
    byBlockType: Object.groupBy
      ? Object.fromEntries(Object.entries(Object.groupBy(priced, row => row.block_type || 'Unspecified'))
        .map(([key, values]) => [key, values.reduce((sum, row) => sum + amount(row.line_value), 0)]))
      : priced.reduce((totals, row) => {
          const key = row.block_type || 'Unspecified'
          totals[key] = (totals[key] || 0) + amount(row.line_value)
          return totals
        }, {}),
  }
}

export function cashReceived(payments = [], { from, to, siteId } = {}) {
  return payments
    .filter(row => row.status === 'confirmed'
      && inRange(row.payment_date, from, to)
      && sameSite(row, siteId)
      && !['draft', 'cancelled'].includes(row.invoice_status ?? row.invoice?.status))
    .reduce((sum, row) => sum + amount(row.amount_paid), 0)
}

export function customerPosition(deliveries = [], payments = [], { asAt, siteId } = {}) {
  const balances = new Map()
  for (const row of deliveries) {
    if (!through(row.waybill_date, asAt) || !sameSite(row, siteId)
      || row.unvalued === true || row.line_value == null) continue
    const key = row.customer_id
    if (!key) continue
    balances.set(key, (balances.get(key) || 0) + amount(row.line_value))
  }
  for (const row of payments) {
    if (row.status !== 'confirmed' || !through(row.payment_date, asAt)
      || !sameSite(row, siteId)
      || ['draft', 'cancelled'].includes(row.invoice_status ?? row.invoice?.status)) continue
    const key = row.customer_id
    if (!key) continue
    balances.set(key, (balances.get(key) || 0) - amount(row.amount_paid))
  }
  const customers = [...balances.entries()].map(([customer_id, balance]) => ({
    customer_id, balance, receivable: Math.max(balance, 0),
    deposit: Math.max(-balance, 0),
  }))
  return {
    customers,
    receivables: customers.reduce((n, row) => n + row.receivable, 0),
    deposits: customers.reduce((n, row) => n + row.deposit, 0),
  }
}

export function approvedExpenses(expenses = [], { from, to, siteId } = {}) {
  const rows = expenses.filter(row => inRange(row.expense_date, from, to) && sameSite(row, siteId))
  const status = row => row.approval_status ?? row.status
  return {
    cost: rows.filter(row => status(row) === 'approved').reduce((n, row) => n + amount(row.amount), 0),
    awaitingApproval: rows.filter(row => status(row) === 'pending').reduce((n, row) => n + amount(row.amount), 0),
  }
}

export function adjustmentTotal(rows = [], statementType, { from, to } = {}) {
  return rows.filter(row => row.statement_type === statementType
    && (inRange(row.adjustment_date, from, to)
      || (row.period_from && row.period_to && row.period_from <= (to || row.period_to)
        && row.period_to >= (from || row.period_from))))
    .reduce((n, row) => n + amount(row.amount), 0)
}

export function profitStatement({ deliveries = [], payments = [], expenses = [], adjustments = [] }, filters = {}) {
  const revenue = deliveredRevenue(deliveries, filters)
  const cost = approvedExpenses(expenses, filters)
  const adjustment = adjustmentTotal(adjustments, 'income', filters)
  return {
    ...revenue, ...cost,
    cashReceived: cashReceived(payments, filters),
    adjustment,
    netProfit: revenue.revenue - cost.cost + adjustment,
  }
}

export function finishedGoodsValuation(stock = [], unitCosts = {}) {
  const unvalued = []
  const valued = stock.reduce((total, row) => {
    const quantity = amount(row.quantity_in_yard ?? row.quantity)
    const type = row.block_type
    const cost = unitCosts[type]
    if (cost == null || !Number.isFinite(Number(cost))) {
      unvalued.push({ block_type: type, quantity, label: 'not valued' })
      return total
    }
    return total + quantity * Number(cost)
  }, 0)
  return { valued, unvalued }
}

export function supplierPayables(transactions = [], { asAt } = {}) {
  const bySupplier = new Map()
  for (const row of transactions) {
    if (!through(row.transaction_date, asAt)) continue
    const delta = row.transaction_type === 'purchase' ? amount(row.amount)
      : ['payment', 'return'].includes(row.transaction_type) ? -amount(row.amount) : 0
    bySupplier.set(row.supplier_id, (bySupplier.get(row.supplier_id) || 0) + delta)
  }
  return { bySupplier, total: [...bySupplier.values()].reduce((n, value) => n + value, 0) }
}

// Reverse changes after the historical cut-off, starting from today's quantity.
export function stockAsAt(current, movements = [], asAt, { dateField = 'date', deltaOf } = {}) {
  const getDelta = deltaOf || (row => {
    const qty = amount(row.quantity)
    return ['in', 'receipt', 'accepted'].includes(row.movement_type) ? qty : -qty
  })
  return amount(current) - movements
    .filter(row => row[dateField] > asAt)
    .reduce((n, row) => n + getDelta(row), 0)
}

export function collectionRate({ receipts, openingReceivables, deliveredValue }) {
  const denominator = amount(openingReceivables) + amount(deliveredValue)
  return denominator > 0 ? amount(receipts) / denominator : null
}

export function cashFlowReconciliation({ openingCash, closingCash, netChange, tolerance = 0.01 }) {
  const difference = amount(closingCash) - (amount(openingCash) + amount(netChange))
  return {
    difference, reconciled: Math.abs(difference) <= tolerance,
    label: Math.abs(difference) <= tolerance ? 'Reconciled' : 'Unreconciled',
  }
}
