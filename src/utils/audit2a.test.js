import { it, expect } from 'vitest'
import { cashBalances, incomeNetProfit, productReceipts, expenseCosts } from './financialTotals'
import { customerInvoiceStats } from './proforma'
import { queryRows, settledRows } from './moneyQueries'
import { monthStart, monthEnd, periodRange, todayLagos } from './lagosDate'
import { statementRows, invoiceAging } from './customerStatement'
import { buildRows } from './generateStatementPDF'
import { supplierTotals } from './supplierBalance'

it('3: a quotation creates no customer debt or sales value', () => {
  expect(customerInvoiceStats({ orders: [{ invoices: [{ status: 'draft', total_amount: 2000, payments: [{ status: 'confirmed', amount_paid: 50 }] }] }] })).toMatchObject({ totalValue: 0, totalPaid: 0, outstanding: 0 })
})
it('4: resolved PostgREST and rejected network errors cannot become empty financial data', () => {
  expect(() => queryRows({ data: null, error: { message: 'permission denied' } })).toThrow('Revenue could not be loaded: permission denied')
  expect(() => settledRows({ status: 'rejected', reason: new Error('offline') })).toThrow('Revenue could not be loaded: offline')
  expect(() => incomeNetProfit({ warnings: ['Revenue failed'], payments: [] })).toThrow('Revenue failed')
})
it('6: maps service bankStart/bankEnd rather than nonexistent bankOpening/bankClosing', () => {
  const end = [{ current_balance: 250 }, { current_balance: 50 }]
  expect(cashBalances({ bankStart: [{ opening_balance: 100 }, { opening_balance: 50 }], bankEnd: end })).toEqual({ openingCash: 150, closingCash: 300, bankAccounts: end })
})
it('8: Cost Analysis counts payroll expense once and keeps existing approval filtering', () => {
  expect(expenseCosts([{ amount: 100, status: 'approved', category: { name: 'Daily Labour Wages' } }, { amount: 50, status: 'pending' }, { amount: 900, status: 'rejected' }])).toEqual({ totalExpenses: 150, labourCost: 100, rawExpenses: 50 })
})
it('11: returns reduce supplier debt alongside payments', () => {
  expect(supplierTotals([{ transaction_type: 'purchase', amount: 100 }, { transaction_type: 'return', amount: 25 }, { transaction_type: 'payment', amount: 30 }])).toEqual({ purchased: 100, returned: 25, paid: 30, balance: 45 })
})
it('12: two instalments on the same order reconcile product receipts to period cash once', () => {
  const order = { id: 'o', order_items: [{ block_type: '6 inch', quantity: 1, unit_price: 60 }, { block_type: '9 inch', quantity: 1, unit_price: 40 }] }
  const r = productReceipts([{ amount_paid: 20, invoice: { order } }, { amount_paid: 30, invoice: { order } }, { amount_paid: 10 }])
  expect(r).toEqual({ '6 inch': 30, '9 inch': 20, 'Unallocated receipts': 10 })
  expect(Object.values(r).reduce((s, v) => s + v, 0)).toBe(60)
})
it('13: September and last month have exact Lagos calendar boundaries', () => {
  expect([monthStart(2026, 8), monthEnd(2026, 8)]).toEqual(['2026-09-01', '2026-09-30'])
  expect(periodRange('lastmonth', new Date('2026-10-15T12:00:00Z'))).toEqual({ from: '2026-09-01', to: '2026-09-30' })
  expect(todayLagos(new Date('2026-09-30T23:30:00Z'))).toBe('2026-10-01')
  expect(monthStart(2026, -1)).toBe('2025-12-01')
})
const invoices = [{ status: 'issued', issued_date: '2026-08-01', total_amount: 1000, payments: [
  { status: 'confirmed', payment_date: '2026-08-20', amount_paid: 200 },
  { status: 'confirmed', payment_date: '2026-09-10', amount_paid: 100 },
  { status: 'confirmed', payment_date: '2026-10-10', amount_paid: 500 },
  { status: 'pending', payment_date: '2026-08-02', amount_paid: 100 },
] }, { status: 'draft', issued_date: '2026-08-01', total_amount: 5000 }]
it('14: report and statement PDF retain pre-period opening balance, excluding quotes and future cash', () => {
  const orders = [{ invoices }]
  const rows = statementRows(orders, '2026-09-01', '2026-09-30')
  expect(rows).toHaveLength(2)
  expect(rows[0]).toMatchObject({ description: 'OPENING BALANCE', balance: 800 })
  expect(rows[1]).toMatchObject({ credit: 100, balance: 700 })
  expect(buildRows(orders, [], '2026-09-01', '2026-09-30')).toEqual(rows)
})
it('14: historical aging ignores later payments and ages from the selected date', () => {
  expect(invoiceAging(invoices[0], '2026-09-30')).toEqual({ paid: 300, balance: 700, days: 60 })
})
