import { supabase } from '../lib/supabase'
import { DUTSE_SITE_ID } from './sites'
import {
  deliveredRevenue, cashReceived, customerPosition, approvedExpenses,
  profitStatement, supplierPayables, adjustmentTotal,
  finishedGoodsValuation, cashFlowReconciliation, collectionRate,
  stockAsAt, productionUnitCosts, balancePresentation, expenseStatus,
  siteAccountingSources,
} from '../utils/accountingBasis'

// Shared, checked data access for all accounting/reporting screens.
// Errors are thrown; callers must display them rather than render financial zeros.
const checked = async query => {
  const rows = [], pageSize = 500
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await query.range(offset, offset + pageSize - 1)
    if (error) throw error
    rows.push(...(data || []))
    if (!data || data.length < pageSize) return rows
  }
}
const dates = (query, column, from, to) => {
  if (from) query = query.gte(column, from)
  if (to) query = query.lte(column, to)
  return query
}

async function orderDeliveries(from, to) {
  // The view does not expose site_id/customer_id. Resolve these from orders
  // without multiplying the one-waybill view rows.
  const rows = await checked(dates(
    supabase.from('v_delivered_revenue').select('*'),
    'waybill_date', from, to
  ))
  const ids = [...new Set(rows.map(row => row.order_id).filter(Boolean))]
  if (!ids.length) {
    if (rows.some(r => !r.unvalued && r.line_value != null)) throw new Error('A priced delivery has no order')
    return rows
  }
  const orders = await checked(supabase.from('orders')
    .select('id, customer_id, customer:customer_id(name)').in('id', ids))
  const orderById = new Map(orders.map(row => [row.id, row]))
  if (orderById.size !== ids.length) {
    throw new Error('Some delivery orders are unavailable; accounting figures cannot be verified')
  }
  if (rows.some(row => !row.unvalued && row.line_value != null && !orderById.get(row.order_id)?.customer_id)) {
    throw new Error('A priced delivery has no customer; accounting positions cannot be verified')
  }
  return rows.map(row => ({
    ...row, customer_id: orderById.get(row.order_id)?.customer_id,
    customer_name: orderById.get(row.order_id)?.customer?.name,
  }))
}

async function orderPayments(from, to) {
  // Invoice and order joins are required to attribute cash to both customer and site.
  let q = dates(
    supabase.from('payments').select(
      'amount_paid, payment_date, status, invoice:invoice_id!inner(status, order:order_id!inner(customer_id, customer:customer_id(name)))'
    ).eq('status', 'confirmed'),
    'payment_date', from, to
  )
  const rows = await checked(q)
  if (rows.some(row => !row.invoice?.order?.customer_id)) {
    throw new Error('A confirmed payment has no customer; accounting positions cannot be verified')
  }
  return rows.map(row => ({
    ...row,
    customer_id: row.invoice?.order?.customer_id,
    invoice_status: row.invoice?.status,
  }))
}

async function sources(from, to, siteId) {
  const [sites, contracts, deliveryRows, paymentRows, handovers, receipts] = await Promise.all([
    checked(supabase.from('production_sites').select('id, code, site_type')),
    checked(supabase.from('site_contracts').select('site_id, contract_model, opening_rate_9in, opening_rate_6in, fee_per_block')),
    orderDeliveries(from, to), orderPayments(from, to),
    checked(dates(supabase.from('block_handovers').select('id, site_id, handover_date, block_type, qty_accepted, status, deemed'), 'handover_date', from, to)),
    checked(dates(supabase.from('site_receipts').select('id, site_id, received_on, amount, voided').eq('voided', false), 'received_on', from, to)),
  ])
  return siteAccountingSources({ sites, contracts, deliveries: deliveryRows, payments: paymentRows, handovers, receipts }, siteId)
}
async function deliveries(from, to, siteId) { return (await sources(from, to, siteId)).deliveries }
async function payments(from, to, siteId) { return (await sources(from, to, siteId)).payments }

async function expenses(from, to, siteId) {
  let q = dates(
    supabase.from('expenses').select('amount, status, approval_status, expense_date, site_id, category:category_id(name, parent_category, cost_center)'),
    'expense_date', from, to
  )
  if (siteId) q = q.eq('site_id', siteId)
  return checked(q)
}

async function adjustments(statementType) {
  return checked(supabase.from('financial_adjustments').select(
    'id, statement_type, account_name, amount, adjustment_date, period_from, period_to, reason'
  ).eq('statement_type', statementType))
}

export const accountingBasisService = {
  async metrics(from, to, siteId = null, includeCosts = true) {
    const dayBefore = new Date(Date.parse(from + 'T00:00:00Z') - 86400000).toISOString().slice(0, 10)
    const [current, opening, position] = await Promise.all([
      includeCosts ? this.income(from, to, siteId) : sources(from, to, siteId).then(s => ({ ...s,
        ...deliveredRevenue(s.deliveries, { from, to, siteId }), cashReceived: cashReceived(s.payments, { from, to, siteId }), expenses: [] })),
      this.customerBalances(dayBefore, siteId), this.customerBalances(to, siteId),
    ])
    return { ...current, position, opening,
      collectionRate: collectionRate({ receipts: current.cashReceived, openingReceivables: opening.receivables, deliveredValue: current.revenue }) }
  },
  async income(from, to, siteId = null) {
    const [source, expenseRows, adjustmentRows] = await Promise.all([
      sources(from, to, siteId),
      expenses(from, to, siteId),
      siteId ? Promise.resolve([]) : adjustments('income'),
    ])
    const { deliveries: deliveryRows, payments: paymentRows } = source
    const totals = profitStatement(
      { deliveries: deliveryRows, payments: paymentRows, expenses: expenseRows, adjustments: adjustmentRows },
      { from, to, siteId }
    )
    return {
      ...totals,
      deliveries: deliveryRows,
      payments: paymentRows,
      expenses: expenseRows,
      adjustments: adjustmentRows,
      adjustmentNote: 'Manual income adjustments have no site attribution and are included only in the company view.',
    }
  },

  async customerBalances(asAt, siteId = null) {
    const { deliveries: deliveryRows, payments: paymentRows } = await sources(null, asAt, siteId)
    return customerPosition(deliveryRows, paymentRows, { asAt, siteId })
  },

  async payables(asAt) {
    const rows = await checked(dates(
      supabase.from('supplier_transactions').select(
        'supplier_id, transaction_type, transaction_date, amount'
      ), 'transaction_date', null, asAt
    ))
    return supplierPayables(rows, { asAt })
  },

  async snapshot(asAt, siteId = null) {
    const fromYear = asAt.slice(0, 4) + '-01-01'
    const [income, customers, payables, balanceAdjustments, stock, banks, openingBalances, vehicles] = await Promise.all([
      this.income(fromYear, asAt, siteId),
      this.customerBalances(asAt, siteId),
      this.payables(asAt),
      adjustments('balance_sheet'),
      this.stock(asAt), this.banks(asAt),
      checked(supabase.from('opening_balances').select('*').lte('as_at_date', asAt)),
      checked(supabase.from('vehicles').select('id, vehicle_number, vehicle_name, status')),
    ])
    const cashOnHand = openingBalances.filter(r => /cash on hand/i.test(r.account_name))
      .reduce((n, r) => n + Number(r.amount || 0), 0)
    return {
      income, customers, payables, ...stock, ...banks, openingBalances, vehicles,
      cashOnHand, cashTotal: banks.bankTotal + cashOnHand,
      historicalNotes: [...banks.historicalNotes,
        ...(cashOnHand ? ['Cash on Hand: current figure — history not available (opening balance register only).'] : []),
        ...openingBalances.filter(r => r.last_edited_at?.slice(0, 10) > asAt).map(r => `${r.account_name}: current figure — history not available`)],
      warnings: [], products: [], receivables: customers.receivables, customerDeposits: customers.deposits,
      supplierPayables: payables.total, ytdProfit: income.netProfit,
      adjustments: balanceAdjustments.filter(row => adjustmentTotal([row], 'balance_sheet', { to: asAt }) !== 0),
      balanceAdjustments: balanceAdjustments.filter(row =>
        adjustmentTotal([row], 'balance_sheet', { to: asAt }) !== 0),
    }
  },

  async banks(asAt) {
    const [accounts, transactions] = await Promise.all([
      checked(supabase.from('bank_accounts').select('id, account_name, current_balance')),
      checked(supabase.from('bank_transactions').select('id, bank_account_id, transaction_date, created_at, credit, debit, balance').order('transaction_date').order('created_at').order('id')),
    ])
    const historicalNotes = []
    const bankAccounts = accounts.map(account => {
      const tx = transactions.filter(t => t.bank_account_id === account.id)
      if (!tx.length || tx[0].balance == null) {
        historicalNotes.push(`${account.account_name}: current figure — history not available`)
        return account
      }
      if (asAt < tx[0].transaction_date) historicalNotes.push(`${account.account_name}: opening balance inferred from first available statement; earlier history not available`)
      const opening = Number(tx[0].balance) - Number(tx[0].credit || 0) + Number(tx[0].debit || 0)
      const balance = opening + tx.filter(t => t.transaction_date <= asAt)
        .reduce((n, t) => n + Number(t.credit || 0) - Number(t.debit || 0), 0)
      return { ...account, current_balance: balance }
    })
    return { bankAccounts, bankTotal: bankAccounts.reduce((n, a) => n + Number(a.current_balance || 0), 0), historicalNotes }
  },

  async stock(asAt) {
    const [items, movements, finished, batches, waybills, damage, production, labour] = await Promise.all([
      checked(supabase.from('inventory_items').select('id, name, current_stock, unit_cost').eq('owner', 'apcl')),
      checked(supabase.from('stock_movements').select('item_id, date, movement_type, quantity').gt('date', asAt)),
      checked(supabase.from('finished_goods_stock').select('block_type, quantity_in_yard')),
      checked(supabase.from('batches').select('id, block_type, date_cured, qty_accepted').eq('site_id', DUTSE_SITE_ID).gt('date_cured', asAt)),
      checked(supabase.from('waybills').select('block_type, waybill_date, quantity_loaded').gt('waybill_date', asAt)),
      checked(supabase.from('damage_log').select('block_type, date, quantity_damaged, batch_id').eq('site_id', DUTSE_SITE_ID).gt('date', asAt).not('batch_id', 'is', null)),
      checked(supabase.from('production_log').select('date, block_type, quantity_produced, cement_bags, granite_dust_kg, chippings_kg, diesel_litres').eq('site_id', DUTSE_SITE_ID).lte('date', asAt)),
      expenses(null, asAt, DUTSE_SITE_ID),
    ])
    const inventoryItems = items.map(item => ({ ...item,
      current_stock: stockAsAt(item.current_stock, movements.filter(m => m.item_id === item.id), asAt) }))
    const finishedGoods = finished.map(row => ({ ...row,
      quantity_in_yard: stockAsAt(row.quantity_in_yard, [
        ...batches.filter(b => b.block_type === row.block_type).map(b => ({ date: b.date_cured, delta: Number(b.qty_accepted) })),
        ...waybills.filter(b => b.block_type === row.block_type).map(b => ({ date: b.waybill_date, delta: -Number(b.quantity_loaded) })),
        ...damage.filter(b => b.block_type === row.block_type).map(b => ({ date: b.date, delta: -Number(b.quantity_damaged) })),
      ], asAt, { deltaOf: m => m.delta }) }))
    const stockValue = finishedGoodsValuation(finishedGoods, productionUnitCosts(production, labour, asAt))
    return { inventoryItems, finishedGoods, stockValue,
      rawMatsValue: inventoryItems.reduce((n, i) => n + Number(i.current_stock || 0) * Number(i.unit_cost || 0), 0),
      stockNotes: ['Raw material unit costs are current figure — history not available. Finished goods are the Dutse yard; client-site finished stock history is not available. Batch acceptance uses date_cured; edits/deletions before the cutoff have no immutable history.',
        'Production cost uses the Production Cost Analysis material estimates (cement ₦5,000/bag, dust/chippings ₦50/kg, diesel ₦750/litre), plus approved labour, over the latest three production months per block type.'] }
  },

  async cashflow(from, to, siteId = null) {
    const dayBefore = new Date(Date.parse(from + 'T00:00:00Z') - 86400000).toISOString().slice(0, 10)
    const [income, opening, closing, cashAdjustments] = await Promise.all([
      this.income(from, to, siteId),
      this.snapshot(dayBefore, siteId),
      this.snapshot(to, siteId),
      adjustments('cashflow'),
    ])
    const wcChange = (opening.customers.receivables - closing.customers.receivables)
      + (closing.customers.deposits - opening.customers.deposits)
      + (closing.payables.total - opening.payables.total)
    const stockChange = closing.stockValue.valued + closing.rawMatsValue - opening.stockValue.valued - opening.rawMatsValue
    const otherAdjustments = adjustmentTotal(cashAdjustments, 'cashflow', { from, to })
    const netChange = income.netProfit + wcChange - stockChange + otherAdjustments
    return {
      income, opening, closing,
      netProfit: income.netProfit,
      workingCapitalChange: wcChange,
      otherAdjustments,
      stockChange, netChange, openingCash: opening.cashTotal, closingCash: closing.cashTotal,
      reconciliation: cashFlowReconciliation({ openingCash: opening.cashTotal, closingCash: closing.cashTotal, netChange }),
      bankEnd: closing.bankAccounts, bankStart: opening.bankAccounts.map(b => ({ ...b, opening_balance: b.current_balance })),
      warnings: [], openingBalances: closing.openingBalances,
      historicalNotes: [...new Set([...opening.historicalNotes, ...closing.historicalNotes, ...closing.stockNotes])],
    }
  },

  deliveredRevenue,
  cashReceived,
  customerPosition,
  approvedExpenses,
  profitStatement,
  supplierPayables,
  adjustmentTotal,
  finishedGoodsValuation,
  cashFlowReconciliation,
  collectionRate,
  deliveries,
  payments,
  expenses,
  expenseStatus,
  balancePresentation,
}
