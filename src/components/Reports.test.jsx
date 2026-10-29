import { beforeEach, it, expect, vi } from 'vitest'

const db = vi.hoisted(() => ({ resolve: null, mock: null }))
vi.mock('../lib/supabase', async () => {
  const { createSupabaseMock } = await import('../test/supabaseMock')
  db.mock = createSupabaseMock((table, ops) => db.resolve(table, ops))
  return db.mock
})
import { GENERATORS } from './Reports'
import { op } from '../test/supabaseMock'

beforeEach(() => { db.mock.calls.length = 0 })

it('sales query includes status and returns each issued/paid order once at invoice value', async () => {
  db.resolve = () => ({ data: [
    { id: 'quote', invoice: [{ id: 'draft', status: 'draft', total_amount: 900 }] },
    { id: 'closed', invoice: [{ id: 'cancelled', status: 'cancelled', total_amount: 800 }] },
    { id: 'sale', items: [{ subtotal: 9999 }], invoice: [
      { id: 'one', status: 'issued', total_amount: 100 },
      { id: 'two', status: 'paid', total_amount: 50 },
      { id: 'void', status: 'cancelled', total_amount: 500 },
    ] },
  ], error: null })
  const result = await GENERATORS.sales_report({ from: '2026-10-01', to: '2026-10-25' })
  expect(result).toHaveLength(1)
  expect(result[0]).toMatchObject({ id: 'sale', salesTotal: 150 })
  expect(op(db.mock.calls[0], 'select')[1]).toContain('total_amount,status')
})

it('AR aging rejects the exact database error instead of returning an empty report', async () => {
  const error = { message: 'AR query denied', code: '42501' }
  db.resolve = () => ({ data: null, error })
  await expect(GENERATORS.ar_aging({ date: '2026-10-25' })).rejects.toBe(error)
})

it('AR aging still excludes draft/cancelled and permits a genuinely empty report', async () => {
  db.resolve = () => ({ data: [], error: null })
  expect(await GENERATORS.ar_aging({ date: '2026-10-25' })).toEqual([])
  expect(db.mock.calls[0].ops).toContainEqual(['not', 'status', 'in', '("draft","cancelled")'])
})
