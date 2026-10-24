import { describe, it, expect } from 'vitest'
import { createSupabaseMock, op } from '../test/supabaseMock'
import { deleteMaintenanceRecord, deleteById, deleteWhere } from './checkedDelete'

const record = { id: 'm1', linked_expense_id: 'e1' }
const deletesOn = (calls, table) => calls.filter(c => c.table === table && op(c, 'delete'))

// Default world: one linked supplier transaction, one expense, and every
// delete removes what it was asked to.
function world(overrides = {}) {
  return createSupabaseMock((table, ops) => {
    const isDelete = !!ops.find(o => o[0] === 'delete')
    const key = `${isDelete ? 'delete' : 'select'}:${table}`
    if (overrides[key]) return overrides[key]
    if (table === 'supplier_transactions') return { data: [{ id: 't1' }], error: null }
    if (table === 'expenses') return { data: [{ id: 'e1' }], error: null }
    if (table === 'vehicle_maintenance') return { data: [{ id: 'm1' }], error: null }
    return { data: [], error: null }
  })
}

describe('deleteMaintenanceRecord', () => {
  it('deletes the supplier transaction, then the expense, then the record, and reports success', async () => {
    const { supabase, calls } = world()
    const res = await deleteMaintenanceRecord(supabase, record)
    expect(res.ok).toBe(true)
    expect(res.message).toBe('Maintenance record deleted, with its linked expense and linked supplier transaction.')
    const order = calls.filter(c => op(c, 'delete')).map(c => c.table)
    expect(order).toEqual(['supplier_transactions', 'expenses', 'vehicle_maintenance'])
    // every delete asks for the removed rows back
    calls.filter(c => op(c, 'delete')).forEach(c => expect(op(c, 'select')).toBeTruthy())
  })

  it('stops when the expense delete errors: the record is not deleted and the message names the step', async () => {
    const { supabase, calls } = world({ 'delete:expenses': { data: null, error: { message: 'permission denied for table expenses' } } })
    const res = await deleteMaintenanceRecord(supabase, record)
    expect(res.ok).toBe(false)
    expect(res.message).toContain('The maintenance record was not deleted because the linked expense could not be removed: permission denied for table expenses')
    expect(res.message).toContain('The linked supplier transaction was already removed')
    expect(deletesOn(calls, 'vehicle_maintenance')).toHaveLength(0)
  })

  it('treats an expense delete that removes nothing (RLS) as a failure, not success', async () => {
    const { supabase, calls } = world({ 'delete:expenses': { data: [], error: null } })
    const res = await deleteMaintenanceRecord(supabase, record)
    expect(res.ok).toBe(false)
    expect(res.message).toMatch(/linked expense could not be removed: 0 of 1 removed/)
    expect(deletesOn(calls, 'vehicle_maintenance')).toHaveLength(0)
  })

  it('stops before anything else when the supplier transaction cannot be removed', async () => {
    const { supabase, calls } = world({ 'delete:supplier_transactions': { data: null, error: { message: 'boom' } } })
    const res = await deleteMaintenanceRecord(supabase, record)
    expect(res.ok).toBe(false)
    expect(res.message).toBe('The maintenance record was not deleted because the linked supplier transaction could not be removed: boom. Nothing was deleted.')
    expect(deletesOn(calls, 'expenses')).toHaveLength(0)
    expect(deletesOn(calls, 'vehicle_maintenance')).toHaveLength(0)
  })

  it('reports what was already removed when the record itself cannot be deleted', async () => {
    const { supabase } = world({ 'delete:vehicle_maintenance': { data: [], error: null } })
    const res = await deleteMaintenanceRecord(supabase, record)
    expect(res.ok).toBe(false)
    expect(res.message).toContain('The maintenance record could not be deleted')
    expect(res.message).toContain('Its linked expense and linked supplier transaction were already removed')
  })

  it('deletes a record with no linked expense on its own', async () => {
    const { supabase, calls } = world()
    const res = await deleteMaintenanceRecord(supabase, { id: 'm1', linked_expense_id: null })
    expect(res).toEqual({ ok: true, message: 'Maintenance record deleted.' })
    expect(calls.filter(c => op(c, 'delete')).map(c => c.table)).toEqual(['vehicle_maintenance'])
  })

  it('skips a supplier transaction that does not exist (no supplier on the record)', async () => {
    const { supabase, calls } = world({ 'select:supplier_transactions': { data: [], error: null } })
    const res = await deleteMaintenanceRecord(supabase, record)
    expect(res.ok).toBe(true)
    expect(res.message).toBe('Maintenance record deleted, with its linked expense.')
    expect(deletesOn(calls, 'supplier_transactions')).toHaveLength(0)
  })
})

describe('deleteById / deleteWhere', () => {
  it('deleteById throws when no row was removed', async () => {
    const { supabase } = createSupabaseMock(() => ({ data: [], error: null }))
    await expect(deleteById(supabase, 'vehicle_fuel_log', 'f1')).rejects.toThrow(/nothing was removed/)
  })
  it('deleteById throws the query error', async () => {
    const { supabase } = createSupabaseMock(() => ({ data: null, error: new Error('rls') }))
    await expect(deleteById(supabase, 'vehicle_fuel_log', 'f1')).rejects.toThrow('rls')
  })
  it('deleteWhere returns 0 without deleting when nothing matches', async () => {
    const { supabase, calls } = createSupabaseMock(() => ({ data: [], error: null }))
    expect(await deleteWhere(supabase, 'supplier_transactions', 'linked_stock_movement_id', 'x')).toBe(0)
    expect(calls.some(c => op(c, 'delete'))).toBe(false)
  })
})
