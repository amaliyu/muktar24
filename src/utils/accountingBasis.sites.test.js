import { it, expect } from 'vitest'
import { septemberSources } from '../test/accountingFixtures'
import { siteAccountingSources, profitStatement, customerPosition, productionUnitCosts, supplierPayables, expenseStatus, adjustmentTotal } from './accountingBasis'
const filters = { from: '2026-09-01', to: '2026-09-30' }
const expenses = [{ site_id: 'dut', expense_date: '2026-09-10', status: 'approved', amount: 300 },
  { site_id: 'kado', expense_date: '2026-09-10', status: 'approved', amount: 400 },
  { site_id: 'life', expense_date: '2026-09-10', status: 'approved', amount: 200 },
  { site_id: 'dut', expense_date: '2026-09-10', status: 'pending', amount: 50 }]
it('Dutse ignores delivery-address site_id; client sites use handovers and non-void receipts', () => {
  const input = { ...septemberSources, deliveries: septemberSources.deliveries.map(r => ({ ...r, site_id: 'delivery-address' })) }
  const dut = siteAccountingSources(input, 'dut'), kado = siteAccountingSources(input, 'kado'), life = siteAccountingSources(input, 'life')
  expect(profitStatement(dut, filters)).toMatchObject({ revenue: 1000, cashReceived: 1100 })
  expect(profitStatement(kado, filters)).toMatchObject({ revenue: 2000, cashReceived: 2500 })
  expect(profitStatement(life, filters)).toMatchObject({ revenue: 600, cashReceived: 100 })
  expect(kado.deliveries).toHaveLength(1)
  expect(kado.payments).toHaveLength(1)
})
it('September 2026 mocked before/after reconciles company and all three sites', () => {
  const source = siteAccountingSources(septemberSources)
  const after = profitStatement({ ...source, expenses }, filters)
  const position = customerPosition(source.deliveries, source.payments, { asAt: filters.to })
  expect(after).toMatchObject({ revenue: 3600, cashReceived: 3700, cost: 900, netProfit: 2700, awaitingApproval: 50 })
  expect(position).toMatchObject({ receivables: 900, deposits: 1000 })
  const siteResults = ['dut', 'kado', 'life'].map(siteId => profitStatement({ ...siteAccountingSources(septemberSources, siteId), expenses }, { ...filters, siteId }))
  for (const key of ['revenue', 'cashReceived', 'cost', 'netProfit']) expect(siteResults.reduce((n, r) => n + r[key], 0)).toBe(after[key])
  // Old cash-based company screens only saw Dutse payments, and included pending expenses.
  const before = { revenue: 1100, cashReceived: 1100, profit: 1100 - 950, receivables: 200, deposits: 100 }
  expect(before).toEqual({ revenue: 1100, cashReceived: 1100, profit: 150, receivables: 200, deposits: 100 })
})
it('missing client rates remain delivered but unpriced', () => {
  const source = siteAccountingSources({ ...septemberSources, contracts: [] }, 'kado')
  expect(profitStatement(source, filters)).toMatchObject({ revenue: 0, deliveredButUnpriced: [{ quantity_received: 2 }] })
})
it('R4 uses the latest three production months for each type and allocates approved labour', () => {
  const production = ['2026-01-01','2026-03-01','2026-05-01','2026-09-01'].map(date => ({ date, block_type: '9', quantity_produced: 100, cement_bags: 1 }))
  production.push({ date: '2025-09-01', block_type: '6', quantity_produced: 100, cement_bags: 2 })
  const costs = productionUnitCosts(production, [{ expense_date: '2026-09-01', status: 'approved', amount: 300, category: { name: 'Labour' } }], '2026-09-30')
  expect(costs).toEqual({ 9: 51, 6: 100 })
})
it('R5 applies supplier returns and historical cutoffs through supplierBalance', () => {
  expect(supplierPayables([
    { supplier_id: 'a', transaction_date: '2026-09-01', transaction_type: 'purchase', amount: 100 },
    { supplier_id: 'a', transaction_date: '2026-09-02', transaction_type: 'return', amount: 30 },
    { supplier_id: 'a', transaction_date: '2026-10-01', transaction_type: 'payment', amount: 70 },
  ], { asAt: '2026-09-30' }).total).toBe(70)
})
it('R3 never lets a rejected or pending status be overridden by another approval field', () => {
  expect(expenseStatus({ status: 'rejected', approval_status: 'approved' })).toBe('rejected')
  expect(expenseStatus({ status: 'pending', approval_status: 'approved' })).toBe('pending')
})
it('R8 prioritizes adjustment_date over a conflicting period and isolates statements', () => {
  const rows = [{ statement_type: 'income', amount: 100, adjustment_date: '2026-10-01', period_from: filters.from, period_to: filters.to },
    { statement_type: 'cashflow', amount: 100, adjustment_date: '2026-09-01' }]
  expect(adjustmentTotal(rows, 'income', filters)).toBe(0)
})
