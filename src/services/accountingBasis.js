import { supabase } from '../lib/supabase'
import {
  deliveredRevenue, cashReceived, customerPosition, approvedExpenses,
  profitStatement, supplierPayables, adjustmentTotal,
  finishedGoodsValuation, cashFlowReconciliation, collectionRate,
} from '../utils/accountingBasis'

// Shared, checked data access for all accounting/reporting screens.
// Errors are thrown; callers must display them rather than render financial zeros.
const checked = async query => {
  const { data, error } = await query
  if (error) throw error
  return data ?? []
}
const dates = (query, column, from, to) => {
  if (from) query = query.gte(column, from)
  if (to) query = query.lte(column, to)
  return query
}

async function deliveries(from, to, siteId) {
  // One row per waybill, prices resolved by the database view.
  let q = dates(supabase.from('v_delivered_revenue').select('*'), 'waybill_date', from, to)
  if (siteId) q = q.eq('site_id', siteId)
  return checked(q)
}

async function payments(from, to, siteId) {
  // Invoice and order joins are required to attribute cash to both customer and site.
  let q = dates(
    supabase.from('payments').select(
      'amount_paid, payment_date, status, invoice:invoice_id!inner(status, order:order_id!inner(customer_id, site_id))'
    ).eq('status', 'confirmed'),
    'payment_date', from, to
  )
  const rows = await checked(q)
  return rows.map(row => ({
    ...row,
    customer_id: row.invoice?.order?.customer_id,
    site_id: row.invoice?.order?.site_id,
    invoice_status: row.invoice?.status,
  })).filter(row => !siteId || row.site_id === siteId)
}

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
    'statement_type, account_name, amount, adjustment_date, period_from, period_to'
  ).eq('statement_type', statementType))
}

export const accountingBasisService = {
  async income(from, to, siteId = null) {
    const [deliveryRows, paymentRows, expenseRows, adjustmentRows] = await Promise.all([
      deliveries(from, to, siteId),
      payments(from, to, siteId),
      expenses(from, to, siteId),
      adjustments('income'),
    ])
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
    }
  },

  async customerBalances(asAt, siteId = null) {
    const [deliveryRows, paymentRows] = await Promise.all([
      deliveries(null, asAt, siteId),
      payments(null, asAt, siteId),
    ])
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
    const [income, customers, payables, balanceAdjustments] = await Promise.all([
      this.income(fromYear, asAt, siteId),
      this.customerBalances(asAt, siteId),
      this.payables(asAt),
      adjustments('balance_sheet'),
    ])
    return {
      income, customers, payables,
      balanceAdjustments: balanceAdjustments.filter(row =>
        adjustmentTotal([row], 'balance_sheet', { to: asAt }) !== 0),
    }
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
    const otherAdjustments = adjustmentTotal(cashAdjustments, 'cashflow', { from, to })
    return {
      income, opening, closing,
      netProfit: income.netProfit,
      workingCapitalChange: wcChange,
      otherAdjustments,
      // Historical cash and stock must be supplied by their audited ledgers before reconciliation.
      historyAvailable: false,
      historicalWarning: 'Current figure — history not available',
      reconcile: (openingCash, closingCash, stockChange = 0) =>
        cashFlowReconciliation({
          openingCash, closingCash,
          netChange: income.netProfit + wcChange - stockChange + otherAdjustments,
        }),
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
}
