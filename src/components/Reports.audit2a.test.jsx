import { beforeEach, it, expect, vi } from 'vitest'
const db = vi.hoisted(() => ({ resolve: null, mock: null, table: vi.fn() }))
vi.mock('../lib/supabase', async () => {
  const { createSupabaseMock } = await import('../test/supabaseMock')
  db.mock = createSupabaseMock((table, ops) => db.resolve(table, ops))
  return db.mock
})
vi.mock('jspdf', () => ({ default: function () {
  return new Proxy({ internal: { pageSize: { getWidth: () => 210, getHeight: () => 297 }, getNumberOfPages: () => 1 }, lastAutoTable: { finalY: 50 }, splitTextToSize: t => [t] }, { get: (o, k) => o[k] || (() => {}) })
} }))
vi.mock('jspdf-autotable', () => ({ default: db.table }))
import { GENERATORS, supplierStatementRows, renderPDF, monthBounds, weekBounds, fetchCustomers } from './Reports'
import { op } from '../test/supabaseMock'

beforeEach(() => { db.mock.calls.length = 0; db.table.mockClear(); db.resolve = () => ({ data: [], error: null }) })
it('9: Invoice Report joins payments directly to invoices and renders only confirmed credits', async () => {
  db.resolve = () => ({ data: [{ invoice_number: 'TEST', total_amount: 1000, order: { customer: { name: 'Test' } }, payments: [{ status: 'confirmed', amount_paid: 200 }, { status: 'pending', amount_paid: 500 }] }], error: null })
  const data = await GENERATORS.invoice_report({})
  expect(op(db.mock.calls[0], 'select')[1]).toBe('*, order:order_id(customer:customer_id(name)), payments(amount_paid, status)')
  renderPDF('invoice_report', data, {}, '')
  const row = db.table.mock.calls[0][1].body[0]
  expect(row.slice(4, 7)).toEqual(['₦1,000.00', '₦200.00', '₦800.00'])
})
it('10: Supplier Statement orders verified company_name and surfaces supplier fetch failure', async () => {
  const error = { message: 'supplier denied' }
  db.resolve = t => t === 'suppliers' ? { error } : { data: [], error: null }
  await expect(GENERATORS.supplier_statement({})).rejects.toBe(error)
  expect(db.mock.calls.find(c => c.table === 'suppliers').ops).toContainEqual(['order', 'company_name'])
})
it('10: customer picker fetch errors are never an empty customer report', async () => {
  const error = { message: 'customers denied' }
  db.resolve = t => t === 'customers' ? { error } : { data: [], error: null }
  await expect(fetchCustomers()).rejects.toBe(error)
})
it('11: supplier statement balance and aging both deduct returns', () => {
  const rows = supplierStatementRows({ suppliers: [{ id: 's', company_name: 'Test supplier' }], txns: [
    { supplier_id: 's', transaction_type: 'purchase', amount: 100, transaction_date: '2026-09-01' },
    { supplier_id: 's', transaction_type: 'return', amount: 40 },
    { supplier_id: 's', transaction_type: 'payment', amount: 10 },
  ] })
  expect(rows[0]).toMatchObject({ name: 'Test supplier', balance: 50, returned: 40 })
  expect(rows[0].current + rows[0].d31 + rows[0].d61 + rows[0].d90).toBe(50)
})
it('13: report month and ISO-week pickers return calendar dates', () => {
  expect(monthBounds('2026-09')).toEqual(['2026-09-01', '2026-09-30'])
  expect(weekBounds('2026-W01')).toEqual(['2025-12-29', '2026-01-04'])
})
it('14: Customer History returns the renderer contract and generates without crashing', async () => {
  const data = await GENERATORS.customer_history({})
  expect(data).toEqual({ orders: [] })
  expect(() => renderPDF('customer_history', data, {}, '')).not.toThrow()
})
it('14: Customer Statement fetches earlier debits and applies the opening balance in its PDF', async () => {
  db.resolve = () => ({ data: [{ invoices: [{ status: 'issued', issued_date: '2026-08-01', total_amount: 1000, payments: [{ status: 'confirmed', payment_date: '2026-09-05', amount_paid: 100 }] }] }], error: null })
  const data = await GENERATORS.customer_statement({ customer_id: 'c', from: '2026-09-01', to: '2026-09-30' })
  expect(data.rows[0]).toMatchObject({ description: 'OPENING BALANCE', balance: 1000 })
  expect(data.rows[1].balance).toBe(900)
  expect(db.mock.calls[0].ops).not.toContainEqual(['gte', 'created_at', '2026-09-01'])
  expect(() => renderPDF('customer_statement', data, {}, '')).not.toThrow()
})
