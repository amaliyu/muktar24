import { describe, it, expect } from 'vitest'
import {
  deliveredRevenue, cashReceived, customerPosition, approvedExpenses,
  adjustmentTotal, profitStatement, finishedGoodsValuation,
  stockAsAt, cashFlowReconciliation,
} from './accountingBasis'

describe('Audit 2B accounting basis', () => {
  it('R1 excludes unpriced deliveries without treating receipts as revenue', () => {
    const rows = [
      { waybill_date: '2026-09-04', block_type: '6 inch', line_value: 400, unvalued: false },
      { waybill_date: '2026-09-05', block_type: '9 inch', line_value: null, unvalued: true },
    ]
    expect(deliveredRevenue(rows, { from: '2026-09-01', to: '2026-09-30' }).revenue).toBe(400)
    expect(deliveredRevenue(rows).deliveredButUnpriced).toHaveLength(1)
  })

  it('R2 separates positive trade receivables from negative customer deposits at a cutoff', () => {
    const deliveries = [
      { customer_id: 'a', waybill_date: '2026-09-01', line_value: 500 },
      { customer_id: 'a', waybill_date: '2026-10-01', line_value: 500 },
    ]
    const payments = [
      { customer_id: 'a', payment_date: '2026-09-02', amount_paid: 200, status: 'confirmed', invoice_status: 'issued' },
      { customer_id: 'b', payment_date: '2026-09-02', amount_paid: 300, status: 'confirmed', invoice_status: 'issued' },
      { customer_id: 'a', payment_date: '2026-09-02', amount_paid: 500, status: 'confirmed', invoice_status: 'draft' },
    ]
    expect(customerPosition(deliveries, payments, { asAt: '2026-09-30' }))
      .toMatchObject({ receivables: 300, deposits: 300 })
  })

  it('R3 ignores pending and rejected expenses', () => {
    const expenses = ['approved', 'pending', 'rejected'].map(status => ({
      status, expense_date: '2026-09-15', amount: 100,
    }))
    expect(approvedExpenses(expenses)).toEqual({ cost: 100, awaitingApproval: 100 })
  })

  it('R4 never substitutes selling prices for unknown production costs', () => {
    const value = finishedGoodsValuation([{ block_type: '6', quantity_in_yard: 20, unit_price: 900 }], {})
    expect(value.valued).toBe(0)
    expect(value.unvalued).toMatchObject([{ quantity: 20, label: 'not valued' }])
  })

  it('R6 applies the selected site to both revenue and receipts', () => {
    const deliveries = [{ waybill_date: '2026-09-01', site_id: 'kado', line_value: 300 },
      { waybill_date: '2026-09-01', site_id: 'dut', line_value: 700 }]
    const payments = [{ payment_date: '2026-09-02', site_id: 'kado', status: 'confirmed', amount_paid: 100 },
      { payment_date: '2026-09-02', site_id: 'dut', status: 'confirmed', amount_paid: 800 }]
    expect(deliveredRevenue(deliveries, { siteId: 'kado' }).revenue).toBe(300)
    expect(cashReceived(payments, { siteId: 'kado' })).toBe(100)
  })

  it('R7 reverses later stock changes', () => {
    expect(stockAsAt(90, [
      { date: '2026-10-01', movement_type: 'in', quantity: 20 },
      { date: '2026-10-02', movement_type: 'out', quantity: 10 },
    ], '2026-09-30')).toBe(80)
  })

  it('R8 includes income adjustments regardless of name, only within period', () => {
    const adjustments = [
      { statement_type: 'income', account_name: 'Other operating item', amount: 75, adjustment_date: '2026-09-10' },
      { statement_type: 'income', account_name: 'Unrelated', amount: 150, adjustment_date: '2026-10-10' },
    ]
    expect(adjustmentTotal(adjustments, 'income', { from: '2026-09-01', to: '2026-09-30' })).toBe(75)
    expect(profitStatement({ adjustments }, { from: '2026-09-01', to: '2026-09-30' }).netProfit).toBe(75)
  })

  it('reports unreconciled cash instead of hiding the difference', () => {
    expect(cashFlowReconciliation({ openingCash: 100, netChange: 25, closingCash: 125 }).reconciled).toBe(true)
    expect(cashFlowReconciliation({ openingCash: 100, netChange: 25, closingCash: 120 }))
      .toMatchObject({ reconciled: false, label: 'Unreconciled', difference: -5 })
  })
})
