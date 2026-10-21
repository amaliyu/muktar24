import { describe, it, expect, vi, beforeEach } from 'vitest'

const state = vi.hoisted(() => ({ items: [], calls: null }))
vi.mock('../lib/supabase', async () => {
  const { createSupabaseMock } = await import('../test/supabaseMock')
  const mock = createSupabaseMock((table, ops) => {
    if (table === 'inventory_items' && ops[0][0] === 'select') return { data: state.items, error: null }
    return { data: null, error: null }
  })
  state.calls = mock.calls
  return { supabase: mock.supabase }
})

import { inventoryService } from './inventory'
import { op } from '../test/supabaseMock'

const DUTSE = '00000000-0000-4000-8000-000000000001'
const KADO = '00000000-0000-4000-8000-000000000002'

const movementInserts = () => state.calls.filter(c => c.table === 'stock_movements' && op(c, 'insert')).map(c => op(c, 'insert')[1])
const itemUpdates = () => state.calls.filter(c => c.table === 'inventory_items' && op(c, 'update')).map(c => ({ id: op(c, 'eq')[2], ...op(c, 'update')[1] }))

describe('inventoryService.autoDeductProduction (site + material)', () => {
  beforeEach(() => {
    state.calls.length = 0
    state.items = [
      // Dutse stock — tagged by material
      { id: 'd-cement', site_id: DUTSE, material: 'cement', name: 'CEMENT', current_stock: 500 },
      { id: 'd-dust', site_id: DUTSE, material: 'dust', name: 'DUST', current_stock: 9000 },
      { id: 'd-chip', site_id: DUTSE, material: 'chippings', name: 'CHIPPINGS 3/8', current_stock: 4000 },
      { id: 'd-diesel', site_id: DUTSE, material: 'diesel', name: 'DIESEL', current_stock: 300 },
      // Kado has cement only; a name that a keyword match WOULD pick up but has no material key
      { id: 'k-cement', site_id: KADO, material: 'cement', name: 'Cement (Kado)', current_stock: 100, owner: 'apcl' },
      { id: 'k-diesel-untagged', site_id: KADO, material: null, name: 'Diesel drum', current_stock: 50 },
    ]
  })

  it('requires a siteId', async () => {
    await expect(inventoryService.autoDeductProduction({ cementBags: 1, date: '2026-10-26', reference: 'PROD-x' }))
      .rejects.toThrow(/siteId is required/)
  })

  it('deducts only the items whose site_id and material match', async () => {
    const res = await inventoryService.autoDeductProduction({
      siteId: DUTSE, cementBags: 10, graniteDustKg: 200, chippingsKg: 100, dieselLitres: 5,
      date: '2026-10-26', reference: 'PROD-abcd1234',
    })
    expect(res.missing).toEqual([])
    expect(itemUpdates()).toEqual([
      expect.objectContaining({ id: 'd-cement', current_stock: 490 }),
      expect.objectContaining({ id: 'd-dust', current_stock: 8800 }),
      expect.objectContaining({ id: 'd-chip', current_stock: 3900 }),
      expect.objectContaining({ id: 'd-diesel', current_stock: 295 }),
    ])
    for (const m of movementInserts()) {
      expect(m).toMatchObject({ site_id: DUTSE, movement_type: 'out', reference: 'PROD-abcd1234' })
    }
  })

  it('reports missing materials and never falls back to another site or a name match', async () => {
    const res = await inventoryService.autoDeductProduction({
      siteId: KADO, cementBags: 20, graniteDustKg: 300, chippingsKg: 0, dieselLitres: 8,
      date: '2026-10-26', reference: 'PROD-kado0001',
    })
    // chippings had qty 0, so it is neither deducted nor reported
    expect(res.missing).toEqual(['dust', 'diesel'])
    const touched = itemUpdates().map(u => u.id)
    expect(touched).toEqual(['k-cement'])
    expect(touched).not.toContain('d-dust')
    expect(touched).not.toContain('d-diesel')
    expect(touched).not.toContain('k-diesel-untagged')
    expect(movementInserts()).toHaveLength(1)
    expect(movementInserts()[0]).toMatchObject({ item_id: 'k-cement', site_id: KADO, quantity: 20 })
  })

  it('deducts nothing at a site with no stock items and lists every used material', async () => {
    const res = await inventoryService.autoDeductProduction({
      siteId: '00000000-0000-4000-8000-000000000003', cementBags: 5, graniteDustKg: 50, chippingsKg: 20, dieselLitres: 2,
      date: '2026-10-26', reference: 'PROD-lc000001',
    })
    expect(res.missing).toEqual(['cement', 'dust', 'chippings', 'diesel'])
    expect(itemUpdates()).toHaveLength(0)
    expect(movementInserts()).toHaveLength(0)
  })
})
