import { it, expect } from 'vitest'
import { septemberSources, emptyBalance } from '../test/accountingFixtures'
import { siteAccountingSources, profitStatement, customerPosition, productionUnitCosts, finishedGoodsValuation, materialPriceMap, supplierPayables, expenseStatus, adjustmentTotal, balancePresentation } from './accountingBasis'
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
  const oldCash = septemberSources.payments.reduce((n, r) => n + r.amount_paid, 0)
  const oldInvoiceTotal = [800, 500].reduce((n, value) => n + value, 0)
  const oldCost = expenses.reduce((n, r) => n + r.amount, 0)
  const before = { revenue: oldCash, cashReceived: oldCash, profit: oldCash - oldCost,
    receivables: oldInvoiceTotal - oldCash, deposits: Math.max(oldCash - 1000, 0) }
  expect(before).toEqual({ revenue: 1100, cashReceived: 1100, profit: 150, receivables: 200, deposits: 100 })
})
it('missing client rates remain delivered but unpriced', () => {
  const source = siteAccountingSources({ ...septemberSources, contracts: [] }, 'kado')
  expect(profitStatement(source, filters)).toMatchObject({ revenue: 0, deliveredButUnpriced: [{ quantity_received: 2 }] })
})
it('partly rejected handovers count accepted quantity only', () => {
  const source = siteAccountingSources({
    sites: [{ id: 'dut', code: 'DUTSE' }, { id: 'kado', code: 'KADO' }],
    contracts: [{ site_id: 'kado', contract_model: 'full_supply', opening_rate_9in: 10 }],
    deliveries: [], payments: [], receipts: [], handovers: [
      { id: 'partial', site_id: 'kado', handover_date: '2026-09-10', block_type: '9in', qty_handed_over: 3000, qty_accepted: 2800, status: 'partly_rejected' },
      { id: 'pending', site_id: 'kado', handover_date: '2026-09-10', block_type: '9in', qty_handed_over: 1000, qty_accepted: 1000, status: 'pending' },
      { id: 'rejected', site_id: 'kado', handover_date: '2026-09-10', block_type: '9in', qty_handed_over: 1000, qty_accepted: 1000, status: 'rejected' },
    ],
  }, 'kado')
  expect(source.deliveries).toHaveLength(1)
  expect(source.deliveries[0]).toMatchObject({ quantity_received: 2800, line_value: 28000 })
})
it('R4 uses the latest three production months for each type and allocates approved labour', () => {
  const production = ['2026-01-01','2026-03-01','2026-05-01','2026-09-01'].map(date => ({ date, block_type: '9', quantity_produced: 100, cement_bags: 1 }))
  production.push({ date: '2025-09-01', block_type: '6', quantity_produced: 100, cement_bags: 2 })
  const costs = productionUnitCosts(production, [{ expense_date: '2026-09-01', status: 'approved', amount: 300, category: { name: 'Labour' } }], '2026-09-30', { cement: 1000, dust: 50, chippings: 50, diesel: 750 })
  expect(costs).toEqual({ 9: 11, 6: 20 })
})
it('Stock Registry material prices drive production cost and missing prices leave stock not valued', () => {
  expect(materialPriceMap([
    { name: 'CEMENT', unit_cost: 11550 }, { name: 'DUST', unit_cost: 13.5 },
    { name: 'CHIPPINGS 3/8', unit_cost: 13.5 }, { name: 'DIESEL', unit_cost: 1680 },
    { name: 'CEMENT - KADO (SEQUOIA)', unit_cost: 1 },
  ])).toEqual({ cement: 11550, dust: 13.5, chippings: 13.5, diesel: 1680 })
  const production = [{ date: '2026-09-01', block_type: '9', quantity_produced: 100, cement_bags: 1, diesel_litres: 1 }]
  expect(productionUnitCosts(production, [], '2026-09-30', { cement: 11550, dust: 13.5, chippings: 13.5, diesel: 1680 })).toEqual({ 9: 132.3 })
  const missing = productionUnitCosts(production, [], '2026-09-30', { cement: 11550, dust: 13.5, chippings: 13.5 })
  expect(missing).toEqual({})
  expect(finishedGoodsValuation([{ block_type: '9', quantity_in_yard: 100 }], missing).unvalued).toEqual([{ block_type: '9', quantity: 100, label: 'not valued' }])
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
it('unallocated manual adjustments stay in company profit, never repeated in every site', () => {
  const adjustments = [{ statement_type: 'income', adjustment_date: '2026-09-15', amount: 100 }]
  const company = profitStatement({ ...siteAccountingSources(septemberSources), expenses, adjustments }, filters)
  const sites = ['dut','kado','life'].map(siteId => profitStatement({ ...siteAccountingSources(septemberSources,siteId), expenses, adjustments }, { ...filters, siteId }))
  expect(company.netProfit).toBe(sites.reduce((n, r) => n + r.netProfit, 0) + 100)
  expect(sites.every(r => r.adjustment === 0)).toBe(true)
})
it('balance adjustments appear in their matching section totals, with unmatched accounts explicit in equity', () => {
  const result = balancePresentation(emptyBalance({ openingBalances: [
    { account_name: 'Plant', category: 'asset', sub_category: 'fixed_asset_other', amount: 1000 },
    { account_name: 'Loan', category: 'liability', sub_category: 'long_term_liability', amount: 300 },
    { account_name: 'Trade Receivables', category: 'asset', sub_category: 'current_asset', amount: 9999 },
  ], adjustments: [{ account_name: 'Plant', amount: 50 }, { account_name: 'Loan', amount: 20 }, { account_name: 'Correction', amount: 10 }] }))
  expect(result).toMatchObject({ totalFixedAssets: 1050, totalLTLiabilities: 320, totalEquity: 10, totalAssets: 1050 })
  expect(result.otherFixed[1]).toMatchObject({ account_name: 'Plant (adjustment)', amount: 50, isAdjustment: true })
})
