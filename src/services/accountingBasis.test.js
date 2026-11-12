import { beforeEach, it, expect, vi } from 'vitest'
import { sites } from '../test/accountingFixtures'
const db = vi.hoisted(() => ({ mock: null, resolve: null }))
vi.mock('../lib/supabase', async () => {
  const { createSupabaseMock } = await import('../test/supabaseMock')
  db.mock = createSupabaseMock((table, ops) => db.resolve(table, ops))
  return db.mock
})
import { accountingBasisService as basis } from './accountingBasis'
import { bankBalancesAsAt } from '../utils/accountingBasis'
beforeEach(() => {
  db.mock.calls.length = 0
  db.resolve = table => ({ data: table === 'production_sites' ? sites : [], error: null })
})
it.each(['production_sites','site_contracts','payments','expenses','v_delivered_revenue','block_handovers','site_receipts','financial_adjustments'])('failed %s aborts income instead of becoming zero', async table => {
  const error = { message: table + ' denied' }, base = db.resolve
  db.resolve = t => t === table ? { error } : base(t)
  await expect(basis.income('2026-09-01','2026-09-30')).rejects.toBe(error)
})
it.each(['supplier_transactions','bank_transactions','bank_accounts','stock_movements','batches','damage_log','waybills','production_log','inventory_items','finished_goods_stock','opening_balances','vehicles'])('failed %s aborts balance sheet', async table => {
  const error = { message: table + ' denied' }, base = db.resolve
  db.resolve = t => t === table ? { error } : base(t)
  await expect(basis.snapshot('2026-09-30')).rejects.toBe(error)
})
it('historical stock reverses later accepted batches, loaded blocks, damage and materials', async () => {
  const records = {
    inventory_items: [{ id: 'i', current_stock: 90, unit_cost: 2 }], stock_movements: [{ item_id: 'i', date: '2026-10-01', movement_type: 'in', quantity: 10 }],
    finished_goods_stock: [{ block_type: '9', quantity_in_yard: 90 }],
    batches: [{ block_type: '9', date_cured: '2026-10-01', qty_accepted: 30 }],
    waybills: [{ block_type: '9', waybill_date: '2026-10-02', quantity_loaded: 10 }],
    damage_log: [{ block_type: '9', date: '2026-10-03', batch_id: 'b', quantity_damaged: 5 }],
  }
  db.resolve = t => ({ data: records[t] || [], error: null })
  const stock = await basis.stock('2026-09-30')
  expect(stock.inventoryItems[0].current_stock).toBe(80)
  expect(stock.finishedGoods[0].quantity_in_yard).toBe(75)
  expect(stock.stockValue).toMatchObject({ valued: 0, unvalued: [{ quantity: 75, label: 'not valued' }] })
})
it('historical bank cash is inferred opening balance plus only transactions through cutoff', async () => {
  db.resolve = t => ({ data: t === 'bank_accounts' ? [{ id: 'b', account_name: 'Bank', current_balance: 9999 }] : [
    { bank_account_id: 'b', transaction_date: '2026-09-01', credit: 100, debit: 0, balance: 500 },
    { bank_account_id: 'b', transaction_date: '2026-10-01', credit: 300, debit: 0, balance: 800 },
  ], error: null })
  expect((await basis.banks('2026-09-30')).bankTotal).toBe(500)
})
it('bank integrity rejects phone-number credits and uses recorded current balance', () => {
  const result = bankBalancesAsAt([{ id: 'b', account_name: 'Amantelcom', current_balance: 1200 }], [
    { id: '1', bank_account_id: 'b', transaction_date: '2026-09-01', credit: 8069229567, debit: 0, balance: 100 },
  ], '2026-09-30')
  expect(result.bankAccounts[0].current_balance).toBe(1200)
  expect(result.historicalNotes[0]).toContain('failed the integrity check')
})
it('bank integrity rejects a running-balance mismatch', () => {
  const result = bankBalancesAsAt([{ id: 'b', account_name: 'Mismatch', current_balance: 900 }], [
    { id: '1', bank_account_id: 'b', transaction_date: '2026-09-01', credit: 100, debit: 0, balance: 500 },
    { id: '2', bank_account_id: 'b', transaction_date: '2026-09-02', credit: 10, debit: 0, balance: 700 },
  ], '2026-09-02')
  expect(result.bankAccounts[0].current_balance).toBe(900)
  expect(result.historicalNotes[0]).toContain('failed the integrity check')
})
it('reliable statements after their last date use the recorded current balance', () => {
  const result = bankBalancesAsAt([{ id: 'b', account_name: 'Stale', current_balance: 999 }], [
    { id: '1', bank_account_id: 'b', transaction_date: '2026-09-01', credit: 100, debit: 0, balance: 500 },
    { id: '2', bank_account_id: 'b', transaction_date: '2026-09-02', credit: 10, debit: 0, balance: 510 },
  ], '2026-09-30')
  expect(result.bankAccounts[0].current_balance).toBe(999)
  expect(result.historicalNotes[0]).toContain('statement data ends 2026-09-02')
})
it('reliable statements inside their range rebuild the as-at balance', () => {
  const result = bankBalancesAsAt([{ id: 'b', account_name: 'Clean', current_balance: 999 }], [
    { id: '1', bank_account_id: 'b', transaction_date: '2026-09-01', credit: 100, debit: 0, balance: 500 },
    { id: '2', bank_account_id: 'b', transaction_date: '2026-09-02', credit: 10, debit: 0, balance: 510 },
  ], '2026-09-01')
  expect(result.bankAccounts[0].current_balance).toBe(500)
})
it('accounts without transactions keep current balance and history note', () => {
  const result = bankBalancesAsAt([{ id: 'b', account_name: 'Empty', current_balance: 42 }], [], '2026-09-01')
  expect(result.bankAccounts[0].current_balance).toBe(42)
  expect(result.historicalNotes[0]).toBe('Empty: current figure — history not available')
})
it('every payment and client receipt uses its own period date, expenses use expense_date and site_id', async () => {
  await basis.income('2026-09-01','2026-09-30','kado')
  for (const [table,col] of [['payments','payment_date'],['site_receipts','received_on'],['block_handovers','handover_date'],['expenses','expense_date']]) {
    expect(db.mock.calls.find(c => c.table === table).ops).toContainEqual(['gte',col,'2026-09-01'])
    expect(db.mock.calls.find(c => c.table === table).ops).toContainEqual(['lte',col,'2026-09-30'])
  }
  expect(db.mock.calls.find(c => c.table === 'expenses').ops).toContainEqual(['eq','site_id','kado'])
  expect(db.mock.calls.some(c => c.table === 'orders' && c.ops.some(o => o[1] === 'site_id'))).toBe(false)
})
it('keeps adjustment identity and reason for checked deletion and statement notes', async () => {
  await basis.income('2026-09-01', '2026-09-30')
  const select = db.mock.calls.find(c => c.table === 'financial_adjustments').ops.find(o => o[0] === 'select')[1]
  expect(select.split(',').map(s => s.trim())).toEqual(expect.arrayContaining(['id','reason']))
})
it('paginates source rows instead of silently truncating the first database page', async () => {
  db.resolve = (table, ops) => {
    const offset = ops.filter(o => o[0] === 'range').at(-1)?.[1] || 0
    return { data: table === 'supplier_transactions' ? Array.from({length: offset === 0 ? 500 : 1}, () => ({supplier_id:'a',transaction_type:'purchase',transaction_date:'2026-09-01',amount:1})) : [], error: null }
  }
  expect((await basis.payables('2026-09-30')).total).toBe(501)
})
it('cash flow uses the same profit and working capital changes and reports a real cash difference', async () => {
  const income = vi.spyOn(basis, 'income').mockResolvedValue({ netProfit: 50 })
  const snapshot = vi.spyOn(basis, 'snapshot').mockImplementation(async date => ({
    customers: { receivables: date === '2026-08-31' ? 100 : 80, deposits: date === '2026-08-31' ? 0 : 10 },
    payables: { total: date === '2026-08-31' ? 50 : 60 }, stockValue: { valued: date === '2026-08-31' ? 100 : 120 }, rawMatsValue: 0,
    bankTotal: date === '2026-08-31' ? 100 : 160, cashTotal: date === '2026-08-31' ? 100 : 160, bankAccounts: [], openingBalances: [], historicalNotes: [], stockNotes: [],
  }))
  try {
    const result = await basis.cashflow('2026-09-01', '2026-09-30')
    expect(result).toMatchObject({ netProfit: 50, workingCapitalChange: 40, stockChange: 20, netChange: 70,
      openingCash: 100, closingCash: 160, reconciliation: { label: 'Unreconciled', difference: -10 } })
    expect(snapshot).toHaveBeenCalledWith('2026-08-31', null)
  } finally { income.mockRestore(); snapshot.mockRestore() }
})
