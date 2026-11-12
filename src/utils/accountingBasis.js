import { supplierTotals } from './supplierBalance'
// Audit 2B: pure accounting-basis calculations. Monetary values are NGN.
// No database calls belong here: source errors must be handled by the service.
const amount = value => Number(value || 0)
const inRange = (date, from, to) => Boolean(date) && (!from || date >= from) && (!to || date <= to)
const through = (date, asAt) => Boolean(date) && (!asAt || date <= asAt)
const sameSite = (row, siteId) => !siteId || row.site_id === siteId

export const ACCOUNTING_EXPLANATION = 'Revenue counts when blocks are delivered. Cash received is shown separately.'
export const expenseStatus = row => {
  if (row.status === 'rejected' || row.approval_status === 'rejected') return 'rejected'
  if (row.status === 'pending' || row.approval_status === 'pending') return 'pending'
  return row.approval_status || row.status
}

// orders.site_id is a delivery address, never a production-site scope.
// All order-system sales belong to DUTSE; client sites use their own ledgers.
export function siteAccountingSources({ sites = [], contracts = [], deliveries = [], payments = [], handovers = [], receipts = [] }, siteId) {
  const dutse = sites.find(s => s.code === 'DUTSE')
  if (!dutse) throw new Error('DUTSE production site is unavailable')
  if (siteId && !sites.some(s => s.id === siteId)) throw new Error('Unknown production site')
  const deliveryRows = deliveries.map(r => ({ ...r, site_id: dutse.id }))
  const paymentRows = payments.map(r => ({ ...r, site_id: dutse.id }))
  for (const h of handovers) {
    if (!['accepted', 'deemed_accepted', 'partly_rejected'].includes(h.status)) continue
    const contract = contracts.find(c => c.site_id === h.site_id)
    const rate = contract?.contract_model === 'service_fee' ? contract.fee_per_block
      : /^9(?:\D|$)/.test(h.block_type) ? contract?.opening_rate_9in
        : /^6(?:\D|$)/.test(h.block_type) ? contract?.opening_rate_6in : null
    deliveryRows.push({ ...h, waybill_id: h.id, waybill_date: h.handover_date,
      customer_id: 'site:' + h.site_id, quantity_received: h.qty_accepted,
      line_value: rate == null ? null : amount(h.qty_accepted) * Number(rate), unvalued: rate == null })
  }
  for (const receipt of receipts) {
    if (receipt.voided !== false) continue
    paymentRows.push({ ...receipt, payment_date: receipt.received_on, amount_paid: receipt.amount,
      customer_id: 'site:' + receipt.site_id, status: 'confirmed', invoice_status: 'issued' })
  }
  return { deliveries: deliveryRows.filter(r => sameSite(r, siteId)), payments: paymentRows.filter(r => sameSite(r, siteId)) }
}

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
      && sameSite(row, siteId))
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
      || ['draft', 'proforma', 'cancelled'].includes(row.invoice_status ?? row.invoice?.status)) continue
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
  const status = expenseStatus
  return {
    cost: rows.filter(row => status(row) === 'approved').reduce((n, row) => n + amount(row.amount), 0),
    awaitingApproval: rows.filter(row => status(row) === 'pending').reduce((n, row) => n + amount(row.amount), 0),
  }
}

export function adjustmentTotal(rows = [], statementType, { from, to } = {}) {
  return rows.filter(row => row.statement_type === statementType
    && (row.adjustment_date ? inRange(row.adjustment_date, from, to)
      : (row.period_from && row.period_to && row.period_from <= (to || row.period_to)
        && row.period_to >= (from || row.period_from))))
    .reduce((n, row) => n + amount(row.amount), 0)
}

export function profitStatement({ deliveries = [], payments = [], expenses = [], adjustments = [] }, filters = {}) {
  const revenue = deliveredRevenue(deliveries, filters)
  const cost = approvedExpenses(expenses, filters)
  // Manual adjustments have no site_id in the schema: keep them company-only.
  const adjustment = filters.siteId ? 0 : adjustmentTotal(adjustments, 'income', filters)
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
    if (cost == null || !Number.isFinite(Number(cost)) || Number(cost) <= 0) {
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
    const delta = supplierTotals([row]).balance
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

const bankNumber = value => Number(value || 0)

// Rebuild historical balances only when the imported statement proves internally consistent.
export function bankBalancesAsAt(accounts = [], transactions = [], asAt) {
  const historicalNotes = []
  const bankAccounts = accounts.map(account => {
    const tx = transactions
      .filter(row => row.bank_account_id === account.id)
      .sort((a, b) => String(a.transaction_date || '').localeCompare(String(b.transaction_date || ''))
        || String(a.created_at || '').localeCompare(String(b.created_at || ''))
        || String(a.id || '').localeCompare(String(b.id || '')))
    if (!tx.length) {
      historicalNotes.push(`${account.account_name}: current figure — history not available`)
      return account
    }
    let running = null, reliable = true
    for (const row of tx) {
      if (Math.abs(bankNumber(row.credit)) > 1_000_000_000 || Math.abs(bankNumber(row.debit)) > 1_000_000_000) reliable = false
      if (running == null) {
        if (row.balance == null) { reliable = false; break }
        running = bankNumber(row.balance)
      } else {
        running += bankNumber(row.credit) - bankNumber(row.debit)
        if (row.balance != null && Math.abs(running - bankNumber(row.balance)) > 1) reliable = false
      }
      if (!reliable) break
    }
    const lastDate = tx.at(-1).transaction_date
    if (!reliable) {
      historicalNotes.push(`${account.account_name}: imported statement data failed the integrity check — showing recorded current balance; history not available.`)
      return account
    }
    if (asAt > lastDate) {
      historicalNotes.push(`${account.account_name}: statement data ends ${lastDate} — showing recorded current balance.`)
      return account
    }
    const first = tx[0]
    const opening = bankNumber(first.balance) - bankNumber(first.credit) + bankNumber(first.debit)
    if (asAt < first.transaction_date) historicalNotes.push(`${account.account_name}: opening balance inferred from first available statement; earlier history not available`)
    const balance = opening + tx.filter(row => row.transaction_date <= asAt)
      .reduce((total, row) => total + bankNumber(row.credit) - bankNumber(row.debit), 0)
    return { ...account, current_balance: balance }
  })
  return { bankAccounts, bankTotal: bankAccounts.reduce((total, account) => total + bankNumber(account.current_balance), 0), historicalNotes }
}

export function materialPriceMap(items = []) {
  const names = { cement: 'CEMENT', dust: 'DUST', chippings: 'CHIPPINGS 3/8', diesel: 'DIESEL' }
  return Object.fromEntries(Object.entries(names).map(([key, name]) => {
    const item = items.find(row => row.name === name)
    return [key, item?.unit_cost == null ? null : Number(item.unit_cost)]
  }))
}

// Both Production Cost Analysis and stock valuation use Stock Registry prices.
// Labour is allocated by blocks produced in each production month.
export function productionUnitCosts(production = [], labour = [], asAt, materialPrices = {}) {
  const eligible = production.filter(r => through(r.date, asAt) && amount(r.quantity_produced) > 0)
  const months = [...new Set(eligible.map(r => r.date.slice(0, 7)))].sort().reverse()
  const typeMonths = Object.fromEntries([...new Set(eligible.map(r => r.block_type))].map(type =>
    [type, months.filter(m => eligible.some(r => r.block_type === type && r.date.startsWith(m))).slice(0, 3)]))
  const quantities = {}, costs = {}, invalidTypes = new Set()
  const price = key => Number.isFinite(Number(materialPrices[key])) && Number(materialPrices[key]) > 0
  for (const month of months) {
    const rows = eligible.filter(r => r.date.startsWith(month))
    const totalQty = rows.reduce((n, r) => n + amount(r.quantity_produced), 0)
    const monthLabour = labour.filter(r => r.expense_date?.startsWith(month) && through(r.expense_date, asAt)
      && expenseStatus(r) === 'approved' && /labour|wages|salaries|loading/i.test(r.category?.name || ''))
      .reduce((n, r) => n + amount(r.amount), 0)
    for (const r of rows) {
      const type = r.block_type, qty = amount(r.quantity_produced)
      if (!typeMonths[type].includes(month)) continue
      quantities[type] = (quantities[type] || 0) + qty
      if ((amount(r.cement_bags) > 0 && !price('cement'))
        || (amount(r.granite_dust_kg) > 0 && !price('dust'))
        || (amount(r.chippings_kg) > 0 && !price('chippings'))
        || (amount(r.diesel_litres) > 0 && !price('diesel'))) invalidTypes.add(type)
      costs[type] = (costs[type] || 0) + amount(r.cement_bags) * (price('cement') ? Number(materialPrices.cement) : 0)
        + amount(r.granite_dust_kg) * (price('dust') ? Number(materialPrices.dust) : 0)
        + amount(r.chippings_kg) * (price('chippings') ? Number(materialPrices.chippings) : 0)
        + amount(r.diesel_litres) * (price('diesel') ? Number(materialPrices.diesel) : 0) + monthLabour * qty / totalQty
    }
  }
  return Object.fromEntries(Object.entries(quantities)
    .filter(([type]) => costs[type] > 0 && !invalidTypes.has(type))
    .map(([type, qty]) => [type, costs[type] / qty]))
}

export function financialBreakdown(deliveries = [], expenses = []) {
  const monthly = {}, customers = {}, categories = {}
  for (const r of deliveries) {
    if (r.unvalued || r.line_value == null) continue
    const month = r.waybill_date.slice(0, 7), id = r.customer_id
    monthly[month] = (monthly[month] || 0) + amount(r.line_value)
    customers[id] ||= { name: r.customer_name || id, total: 0 }
    customers[id].total += amount(r.line_value)
  }
  for (const r of expenses.filter(r => expenseStatus(r) === 'approved')) {
    const cat = r.category?.parent_category || r.category?.name || 'Other'
    categories[cat] = (categories[cat] || 0) + amount(r.amount)
  }
  return { monthly, topCustomers: Object.values(customers).sort((a, b) => b.total - a.total),
    expenseCategories: Object.entries(categories).sort((a, b) => b[1] - a[1]) }
}

export function incomePresentation(d) {
  if (!d || d.warnings?.length) return null
  const expenses = d.expenses.filter(e => expenseStatus(e) === 'approved')
  const expByParent = {}, directMap = {}, opMap = {}, directGroups = {}, operatingGroups = {}
  for (const e of expenses) {
    const parent = e.category?.parent_category || 'General', cat = e.category?.name || 'Uncategorised'
    expByParent[parent] ||= {}
    expByParent[parent][cat] = (expByParent[parent][cat] || 0) + amount(e.amount)
    const map = e.category?.cost_center === 'production' ? directMap : opMap
    map[cat] = (map[cat] || 0) + amount(e.amount)
    const groups = e.category?.cost_center === 'production' ? directGroups : operatingGroups
    groups[parent] ||= {}
    groups[parent][cat] = (groups[parent][cat] || 0) + amount(e.amount)
  }
  const lines = map => Object.entries(map).map(([label, value]) => ({ label, amount: value }))
  const cogsTotal = Object.values(directMap).reduce((n, v) => n + v, 0)
  const totalOpEx = d.cost - cogsTotal, grossProfit = d.revenue - cogsTotal
  return { ...d, expenses, expByParent, totalRevenue: d.revenue, totalPayments: d.cashReceived,
    directGroups: Object.entries(directGroups), opExpGroups: Object.entries(operatingGroups),
    parentTotals: Object.fromEntries(Object.entries(expByParent).map(([key, cats]) => [key, Object.values(cats).reduce((n, v) => n + v, 0)])),
    topCustomers: financialBreakdown(d.deliveries).topCustomers,
    otherIncome: 0, blockRevAdjusted: d.byBlockType, cogsTotal, totalOpEx, grossProfit,
    grossMargin: d.revenue ? (grossProfit / d.revenue * 100).toFixed(1) : 0,
    netMargin: d.revenue ? (d.netProfit / d.revenue * 100).toFixed(1) : 0,
    operatingProfit: d.revenue - d.cost, taxAdj: d.adjustment,
    directLines: lines(directMap), directTotal: cogsTotal, opLines: lines(opMap), operatingTotal: totalOpEx,
    unvaluedCount: d.deliveredButUnpriced.length, dailyLabour: 0, loadingUnpaidSum: 0,
    loadingUnpaidCount: 0, monthlySalaries: 0,
  }
}

export function balancePresentation(d) {
  if (!d || d.warnings?.length) return null
  const sum = rows => rows.reduce((n, r) => n + amount(r.amount), 0)
  const opening = d.openingBalances || []
  const computedAccounts = new Set(['trade receivables', 'accounts receivable', 'trade payables', 'customer deposits', 'inventory', 'finished goods stock', 'cash at bank'])
  const adjustmentEntries = (d.adjustments || []).map((adjustment, index) => {
    const match = opening.find(row => row.account_name === adjustment.account_name)
    const category = match?.category || 'equity'
    const subCategory = category === 'asset' && (match?.vehicle_id || match?.sub_category?.startsWith('fixed_asset'))
      ? 'fixed_asset_other' : match?.sub_category || 'equity'
    return { id: `adjustment:${index}`, account_name: `${adjustment.account_name} (adjustment)`,
      category, sub_category: subCategory, amount: adjustment.amount, isAdjustment: true }
  })
  const obs = [...opening.filter(row => !computedAccounts.has(row.account_name?.toLowerCase())), ...adjustmentEntries]
  const vehicleEntries = obs.filter(o => o.vehicle_id)
  const otherFixed = obs.filter(o => o.sub_category === 'fixed_asset_other' && !o.vehicle_id)
  const nbv = rows => rows.reduce((n, r) => n + amount(r.amount) - amount(r.depreciation_amount), 0)
  const totalVehiclesNBV = nbv(vehicleEntries), totalOtherFixedNBV = nbv(otherFixed)
  const totalFixedAssets = totalVehiclesNBV + totalOtherFixedNBV
  const manualCurrentAssets = obs.filter(o => o.sub_category === 'current_asset')
  const currentLiabs = obs.filter(o => o.sub_category === 'current_liability')
  const ltLiabs = obs.filter(o => o.sub_category === 'long_term_liability')
  const equityObs = obs.filter(o => o.sub_category === 'equity')
  const fgValue = d.stockValue.valued, rawMatsValue = d.rawMatsValue, bankTotal = d.bankTotal
  const manualCurrentTotal = sum(manualCurrentAssets)
  const totalCurrentAssets = fgValue + rawMatsValue + d.receivables + bankTotal + manualCurrentTotal
  const totalAssets = totalFixedAssets + totalCurrentAssets
  const currentLiabTotal = sum(currentLiabs)
  const totalCurrentLiabilities = d.supplierPayables + d.customerDeposits + currentLiabTotal
  const totalLTLiabilities = sum(ltLiabs), totalLiabilities = totalCurrentLiabilities + totalLTLiabilities
  const shareCapital = sum(equityObs), ytdProfit = d.ytdProfit
  const totalEquity = shareCapital + ytdProfit, totalLiabEquity = totalLiabilities + totalEquity
  return { ...d, vehicleEntries, otherFixed, totalVehiclesNBV, totalOtherFixedNBV, totalFixedAssets,
    manualCurrentAssets, currentLiabs, ltLiabs, equityObs, fgValue, rawMatsValue, bankTotal,
    manualCurrentTotal, totalCurrentAssets, totalAssets, currentLiabTotal, totalCurrentLiabilities,
    totalLTLiabilities, totalLiabilities, shareCapital, ytdProfit, totalEquity, totalLiabEquity,
    difference: totalAssets - totalLiabEquity }
}
