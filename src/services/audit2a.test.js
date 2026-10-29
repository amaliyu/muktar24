import { beforeEach, it, expect, vi } from 'vitest'
const db = vi.hoisted(() => ({ resolve: null, mock: null }))
vi.mock('../lib/supabase', async () => {
  const { createSupabaseMock } = await import('../test/supabaseMock')
  db.mock = createSupabaseMock((table, ops) => db.resolve(table, ops))
  return db.mock
})
import { ordersService, customersService } from './orders'
import { invoicesService } from './payments'
import { balanceSheetService, incomeStatementService, openingBalancesService } from './financialService'
import { supplierTransactionsService } from './suppliers'
import { op } from '../test/supabaseMock'

beforeEach(() => {
  db.mock.calls.length = 0
  db.resolve = () => ({ data: [], error: null })
})
const items = [{ block_type: 'Block', quantity: 100, unit_price: 1000 }]

it('1: replaces order lines once by RPC before a checked marketer update', async () => {
  db.resolve = t => ({ data: t.startsWith('rpc:') ? 1 : [{ id: 'o' }], error: null })
  await ordersService.updateOrder('o', { marketerId: 'staff', items })
  expect(db.mock.calls).toHaveLength(2)
  expect(db.mock.calls[0]).toEqual({ rpc: 'replace_order_items', args: { p_order_id: 'o', p_items: [{ ...items[0], source_type: 'manufactured', cost_basis: null }] } })
  expect(db.mock.calls[1].ops).toContainEqual(['select', 'id'])
})
it('1: RPC refusal preserves the exact DB message and writes nothing else', async () => {
  const error = { message: 'This order has an issued invoice. Cancel that invoice before changing the order lines.' }
  db.resolve = () => ({ error })
  await expect(ordersService.updateOrder('o', { items })).rejects.toBe(error)
  expect(db.mock.calls).toHaveLength(1)
})
it('1: zero-row marketer update reports partial completion', async () => {
  db.resolve = t => ({ data: t.startsWith('rpc:') ? 1 : [], error: null })
  await expect(ordersService.updateOrder('o', { items })).rejects.toThrow('marketer was not updated')
})
it.each(['update', 'cancel'])('2: invoice %s refuses zero rows', async method => {
  await expect(invoicesService[method]('i', {})).rejects.toThrow(/not updated|not cancelled/)
})
it('2: line replacement stops before insert when RLS leaves old lines', async () => {
  db.resolve = (t, ops) => ({ data: op({ ops }, 'delete') ? [] : [{ id: 'line', block_type: 'Old', quantity: 1, unit_price: 1 }], error: null })
  await expect(invoicesService.saveItems('i', items)).rejects.toThrow('no replacement lines were inserted')
  expect(db.mock.calls.some(c => op(c, 'insert'))).toBe(false)
})
it('2: invoice deletion checks returned rows', async () => {
  await expect(invoicesService.delete('i')).rejects.toThrow('nothing was removed')
})
it.each(['invoices', 'payments'])('2: order deletion stops on %s read errors', async table => {
  const error = { message: table + ' read denied' }
  db.resolve = t => t === table ? { error } : { data: [{ id: 'i' }], error: null }
  await expect(ordersService.delete('o')).rejects.toBe(error)
  expect(db.mock.calls.some(c => op(c, 'delete'))).toBe(false)
})
it('5: cash received filters payment_date and never the order date', async () => {
  db.resolve = () => ({ data: [{ amount_paid: '120' }, { amount_paid: '80' }], error: null })
  expect(await ordersService.getCashReceived({ from: '2026-09-01', to: '2026-09-30' })).toBe(200)
  const c = db.mock.calls[0]
  expect(c.table).toBe('payments')
  expect(c.ops).toContainEqual(['gte', 'payment_date', '2026-09-01'])
  expect(c.ops).toContainEqual(['lte', 'payment_date', '2026-09-30'])
  expect(JSON.stringify(c.ops)).not.toContain('created_at')
})
it('7: balance sheet returns YTD profit from the Income Statement sources to the as-at date', async () => {
  db.resolve = t => ({ data: t === 'payments' ? [{ amount_paid: 1000 }] : t === 'income_records' ? [{ amount: 100 }] : t === 'expenses' ? [{ amount: 400 }] : [], error: null })
  const d = await balanceSheetService.getData('2026-09-30')
  expect(d.ytdProfit).toBe(700)
  const paymentQuery = db.mock.calls.find(c => c.table === 'payments')
  expect(paymentQuery.ops).toContainEqual(['gte', 'payment_date', '2026-01-01'])
  expect(paymentQuery.ops).toContainEqual(['lte', 'payment_date', '2026-09-30'])
})
it('7: a failed revenue source cannot become zero YTD profit', async () => {
  db.resolve = t => t === 'payments' ? { error: { message: 'revenue denied' } } : { data: [], error: null }
  await expect(balanceSheetService.getData('2026-09-30')).rejects.toThrow('revenue denied')
})
it('8: payroll queries use total_payroll, the verified live column', async () => {
  await incomeStatementService.getData('2026-09-01', '2026-09-30')
  expect(op(db.mock.calls.find(c => c.table === 'payroll_runs'), 'select')[1]).toBe('total_payroll, period_from, period_to')
})
it('11: supplier service subtracts returns through the shared rule', async () => {
  db.resolve = () => ({ data: [{ transaction_type: 'purchase', amount: 100 }, { transaction_type: 'payment', amount: 20 }, { transaction_type: 'return', amount: 30 }], error: null })
  expect(await supplierTransactionsService.getBalance('s')).toBe(50)
})
it('15: opening balance deletion refuses zero rows', async () => {
  await expect(openingBalancesService.delete('ob')).rejects.toThrow('nothing was removed')
})
it.each([ordersService, customersService])('16: marketer requires a staff link before querying', async service => {
  await expect(service.getAllForMarketer()).rejects.toThrow('Your login is not linked to a staff record — ask HR')
  expect(db.mock.calls).toHaveLength(0)
  await service.getAllForMarketer('staff-id')
  expect(db.mock.calls[0].ops).toContainEqual(['eq', service === ordersService ? 'marketer_id' : 'added_by', 'staff-id'])
})

it.each(['update', 'cancel'])('2: invoice %s propagates the original database error', async method => {
  const error = { message: 'TEST database refusal' }
  db.resolve = () => ({ error })
  await expect(invoicesService[method]('i', {})).rejects.toBe(error)
})
it('2: order invoice deletion fails loudly when no invoice row was removed', async () => {
  db.resolve = (table, ops) => ({ data: table === 'invoices' && !op({ ops }, 'delete') ? [{ id: 'i' }] : [], error: null })
  await expect(ordersService.delete('o')).rejects.toThrow('0 of 1 removed')
  expect(db.mock.calls.filter(c => op(c, 'delete')).map(c => c.table)).toEqual(['invoices'])
})
