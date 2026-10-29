import { beforeEach, describe, expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({ resolve: null, calls: null }))
vi.mock('../lib/supabase', async () => {
  const { createSupabaseMock } = await import('../test/supabaseMock')
  const mock = createSupabaseMock((table, ops) => state.resolve(table, ops))
  state.calls = mock.calls
  return { supabase: mock.supabase }
})
import { inventoryService } from './inventory'
import { waybillsService } from './deliveries'
import { productionService } from './production'
import { batchesService } from './batches'
import { finishedGoodsService } from './finishedGoods'
import { op } from '../test/supabaseMock'

beforeEach(() => {
  state.calls.length = 0
  state.resolve = (_, ops) => ({ data: ops.some(o => o[0] === 'single') ? { id: 'test', batch_number: 'TEST-B1' } : [{ id: 'test' }], error: null })
})
const zero = { data: [], error: null }
const dbError = { code: 'P0001', message: 'TEST database refusal' }

describe('4A checked stock ledger writes', () => {
  it('stockOut inserts one movement and never writes current_stock', async () => {
    await inventoryService.stockOut({ itemId: 'cement', quantity: 30, issuedTo: 'Maintenance', date: '2026-10-29' })
    expect(state.calls).toHaveLength(1)
    expect(state.calls[0]).toMatchObject({ table: 'stock_movements' })
    expect(op(state.calls[0], 'insert')[1]).toMatchObject({ movement_type: 'out', quantity: 30 })
    expect(state.calls[0].ops).toContainEqual(['select', 'id'])
  })
  it('stockIn updates only item metadata and inserts a movement', async () => {
    await inventoryService.stockIn({ itemId: 'cement', quantity: 10, unitCost: 2, supplier: 'TEST', date: '2026-10-29' })
    expect(state.calls).toHaveLength(2)
    expect(op(state.calls[0], 'update')[1]).toMatchObject({ unit_cost: 2, supplier: 'TEST' })
    expect(op(state.calls[0], 'update')[1]).not.toHaveProperty('current_stock')
    expect(state.calls[0].ops).toContainEqual(['select', 'id'])
  })
  it('movement edit and delete never read or write a balance', async () => {
    await inventoryService.editMovement('m', { quantity: 100 }, { quantity: 200 })
    await inventoryService.deleteMovement('m')
    expect(state.calls.map(c => c.table)).toEqual(['stock_movements', 'stock_movements'])
    expect(op(state.calls[0], 'update')[1]).toEqual({ quantity: 200 })
    expect(op(state.calls[1], 'delete')).toBeTruthy()
  })
  it('waybill create and edit write no balances and preserve explicit batch_id null', async () => {
    await waybillsService.create({ block_type: 'TEST', quantity_loaded: 100, batch_id: null })
    await waybillsService.update('w', { quantity_loaded: 90, batch_id: null })
    expect(state.calls.map(c => c.table)).toEqual(['waybills', 'waybills'])
    expect(op(state.calls[1], 'update')[1]).toEqual({ quantity_loaded: 90, batch_id: null })
    expect(finishedGoodsService.increase).toBeUndefined()
    expect(finishedGoodsService.decrease).toBeUndefined()
  })
  it('waybill zero-row delete shows the MD-only message', async () => {
    state.resolve = () => zero
    await expect(waybillsService.delete('w')).rejects.toThrow('Not deleted — only the MD can delete a waybill.')
    expect(state.calls[0].ops).toContainEqual(['select', 'id'])
  })
  it('production zero-row delete errors and never separately reverses materials', async () => {
    state.resolve = () => zero
    await expect(productionService.deleteEntry('prod')).rejects.toThrow('nothing was removed')
    expect(state.calls.some(c => c.table === 'stock_movements' || c.table === 'inventory_items')).toBe(false)
  })
  it('production deletion stops at a blocked child delete', async () => {
    state.resolve = (_, ops) => ops[0][0] === 'select' ? { data: [{ id: 'damage' }], error: null } : zero
    await expect(productionService.deleteEntry('prod')).rejects.toThrow('0 of 1 removed')
    expect(state.calls.some(c => c.table === 'production_log')).toBe(false)
  })
  it('batch damage FK refusal keeps production links and shows the required message', async () => {
    state.resolve = () => ({ data: null, error: { code: '23503', message: 'violates damage_log_batch_id_fkey' } })
    await expect(batchesService.delete('b')).rejects.toThrow('Batch has damage records — delete or move those first.')
    expect(state.calls).toHaveLength(1)
    expect(state.calls[0].table).toBe('batches')
  })
  it('batch edit refusal surfaces the database message without another write', async () => {
    state.resolve = () => ({ data: null, error: dbError })
    await expect(batchesService.update('b', { block_type: 'TEST', site_id: 'kado', qty_accepted: 2 })).rejects.toEqual(dbError)
    expect(state.calls).toHaveLength(1)
  })
  it('failed production links disclose the created batch and never retry creation', async () => {
    state.resolve = (table, ops) => {
      if (table === 'batch_production_links') return { data: null, error: { code: '23505', message: 'duplicate link' } }
      if (ops[0][0] === 'insert') return { data: { id: 'new', batch_number: 'TEST-NEW' }, error: null }
      return { data: [{ id: 'old', batch_number: 'TEST-OLD', links: [{ production_log_id: 'p' }] }], error: null }
    }
    await expect(batchesService.createBatch({ batch: { batch_number: 'TEST-NEW' }, productionLogIds: ['p'] }))
      .rejects.toMatchObject({ message: 'Batch TEST-NEW exists, but its production links were not saved. That production entry is already in batch TEST-OLD.', batchCreated: { id: 'new' } })
    expect(state.calls.filter(c => c.table === 'batches' && op(c, 'insert'))).toHaveLength(1)
  })
  it('zero returned production links disclose that the batch exists', async () => {
    state.resolve = (table) => table === 'batch_production_links' ? zero : { data: { id: 'b', batch_number: 'TEST' }, error: null }
    await expect(batchesService.create({ batch_number: 'TEST' }, ['p'])).rejects.toThrow('Batch TEST exists, but its production links were not saved.')
  })
  it.each([
    ['stockOut', () => inventoryService.stockOut({ itemId: 'm', quantity: 1 })],
    ['item update', () => inventoryService.updateItem('m', { unit: 'kg' })],
    ['movement edit', () => inventoryService.editMovement('m', {}, { quantity: 1 })],
    ['waybill update', () => waybillsService.update('w', { quantity_loaded: 10 })],
    ['batch update', () => batchesService.update('b', { qty_accepted: 100 })],
    ['batch curing', () => batchesService.markCured('b', 'u')],
    ['damage insert', () => productionService.logDamage({ quantity_damaged: 1 })],
    ['production update', () => productionService.update('p', { quantity_produced: 1 })],
  ])('%s rejects zero returned rows and preserves database messages', async (_, run) => {
    state.resolve = () => zero
    await expect(run()).rejects.toThrow('Not saved')
    state.resolve = () => ({ data: null, error: dbError })
    await expect(run()).rejects.toEqual(dbError)
  })
})
