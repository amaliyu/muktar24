import { describe, it, expect, vi, beforeEach } from 'vitest'
const state = vi.hoisted(() => ({ resolve: null, mock: null }))
vi.mock('../lib/supabase', async () => {
  const { createSupabaseMock } = await import('../test/supabaseMock')
  state.mock = createSupabaseMock((table, ops) => state.resolve(table, ops))
  return state.mock
})
import { closeProforma } from './proformas'
import { invoicesService } from './payments'
import { INVOICE_LABELS, isPendingOrder, canCancelProformaOrder } from '../utils/proforma'
import { op } from '../test/supabaseMock'

let invoices, waybills, invoiceUpdate, orderUpdate
beforeEach(() => {
  invoices = [{ id: 'i1', status: 'cancelled', payments: [] }]
  waybills = { count: 0, error: null }
  invoiceUpdate = orderUpdate = { data: [{ id: 'saved' }], error: null }
  state.mock.calls.length = 0
  state.resolve = (table, ops) => {
    if (ops.some(o => o[0] === 'update')) return table === 'orders' ? orderUpdate : invoiceUpdate
    if (table === 'invoices') return { data: invoices, error: null }
    if (table === 'waybills') return waybills
    throw new Error('Unexpected table ' + table)
  }
})
const close = (profile = { role: 'md', full_name: 'Test MD' }) => closeProforma('i1', 'o1', profile, ' Price too high ')
const writes = () => state.mock.calls.filter(c => op(c, 'update'))

describe('proforma close', () => {
  it('maps all invoice labels', () => {
    expect(INVOICE_LABELS).toEqual({ draft: 'Proforma', issued: 'Invoice (owed)', paid: 'Paid', cancelled: 'Cancelled' })
  })
  it('cancels an empty order, keeps the invoice and records the reason', async () => {
    expect(await close()).toEqual({ orderCancelled: true })
    expect(writes().map(c => c.table)).toEqual(['invoices', 'orders'])
    expect(op(writes()[0], 'update')[1]).toMatchObject({ status: 'cancelled', cancellation_reason: 'Price too high' })
    expect(writes()[0].ops).toContainEqual(['eq', 'status', 'draft'])
    expect(writes().every(c => op(c, 'select')[1] === 'id')).toBe(true)
  })
  it.each(['draft', 'issued', 'paid'])('preserves order with another %s invoice', async status => {
    invoices.push({ id: 'i2', status, payments: [] })
    expect(await close()).toEqual({ orderCancelled: false })
    expect(writes()).toHaveLength(1)
  })
  it('permits other cancelled invoices but any payment blocks order cancellation', async () => {
    invoices.push({ id: 'i2', status: 'cancelled', payments: [{ id: 'p1' }] })
    expect(await close()).toEqual({ orderCancelled: false })
  })
  it('preserves an order with waybills', async () => {
    waybills.count = 1
    expect(await close()).toEqual({ orderCancelled: false })
    expect(writes()).toHaveLength(1)
  })
  it('zero invoice rows fails before touching the order', async () => {
    invoiceUpdate = { data: [], error: null }
    await expect(close()).rejects.toThrow('Proforma was not closed')
    expect(state.mock.calls).toHaveLength(1)
  })
  it('zero order rows reports partial failure', async () => {
    orderUpdate = { data: [], error: null }
    await expect(close()).rejects.toThrow('Proforma closed, but the order was left unchanged: Order was not cancelled')
  })
  it('preserves database error text', async () => {
    orderUpdate = { error: { message: 'Exact database guard message' } }
    await expect(close()).rejects.toThrow('Exact database guard message')
    invoiceUpdate = { error: { message: 'Invoice guard error' } }
    await expect(close()).rejects.toMatchObject({ message: 'Invoice guard error' })
  })
  it('does not mistake BDM-hidden waybills for no deliveries', async () => {
    await expect(close({ role: 'bdm' })).rejects.toThrow('Your role cannot verify waybills')
    expect(writes()).toHaveLength(1)
  })
  it('supports active accountant grants', async () => {
    expect(await close({ role: 'bdm', effectiveRoles: ['bdm', 'accountant'] })).toEqual({ orderCancelled: true })
  })
  it('does not swallow a waybill lookup failure', async () => {
    waybills = { error: { message: 'Delivery lookup failed' } }
    await expect(close()).rejects.toThrow('Delivery lookup failed')
    expect(writes()).toHaveLength(1)
  })
  it('issue also checks returned rows', async () => {
    invoiceUpdate = { data: [], error: null }
    await expect(invoicesService.issue('i1')).rejects.toThrow('Invoice was not issued')
  })
  it('pending count excludes closed-only orders, including legacy pending rows', () => {
    expect(isPendingOrder({ status: 'pending', invoices })).toBe(false)
    expect(isPendingOrder({ status: 'pending', invoices: [] })).toBe(true)
    expect(isPendingOrder({ status: 'pending', invoices: [{ status: 'draft' }] })).toBe(true)
    expect(isPendingOrder({ status: 'cancelled', invoices: [] })).toBe(false)
  })
  it('only cancels with nothing else', () => {
    expect(canCancelProformaOrder(invoices, 0, 0)).toBe(true)
    expect(canCancelProformaOrder(invoices, 1, 0)).toBe(false)
    expect(canCancelProformaOrder(invoices, 0, 1)).toBe(false)
  })
})
