import { describe, it, expect, vi, beforeEach } from 'vitest'

const state = vi.hoisted(() => ({ calls: null }))
vi.mock('../lib/supabase', async () => {
  const { createSupabaseMock } = await import('../test/supabaseMock')
  const mock = createSupabaseMock((table, ops) => {
    if (table === 'batches' && ops[0][0] === 'insert') return { data: { id: 'b1', ...ops[0][1] }, error: null }
    if (table === 'batches' && ops[0][0] === 'select') return { data: [{ batch_number: 'APC-BATCH-007' }], error: null }
    return { data: null, error: null }
  })
  state.calls = mock.calls
  return { supabase: mock.supabase }
})
import { batchesService } from './batches'

const DUTSE = '00000000-0000-4000-8000-000000000001'
const KADO = '00000000-0000-4000-8000-000000000002'
const SITES = [
  { id: DUTSE, name: 'Dutse Factory', site_type: 'factory' },
  { id: KADO, name: 'Kado Site (Sequoia)', site_type: 'client_site' },
]
const batch = (siteId) => ({
  site_id: siteId, product_id: null, block_type: '9 Inch 3 Hole Block', date_cured: '2026-10-26',
  qty_accepted: 2500, qty_remaining: 2500, status: 'active', notes: null, created_by: null,
})

describe('batchesService.createBatch — database owns stock', () => {
  beforeEach(() => { vi.clearAllMocks(); state.calls.length = 0 })

  it('inserts a factory batch without any yard balance write', async () => {
    const res = await batchesService.createBatch({ batch: batch(DUTSE), sites: SITES })
    expect(res).toMatchObject({ batchNumber: 'APC-BATCH-008', batch: { site_id: DUTSE } })
    expect(state.calls.every(c => c.table === 'batches')).toBe(true)
  })

  it('inserts a client-site batch without any yard balance write', async () => {
    const res = await batchesService.createBatch({ batch: batch(KADO), sites: SITES })
    expect(res.batch).toMatchObject({ site_id: KADO })
    expect(state.calls.every(c => c.table === 'batches')).toBe(true)
  })

  it('does not need loaded sites to create a factory batch', async () => {
    await batchesService.createBatch({ batch: batch(DUTSE), sites: [] })
    expect(state.calls.filter(c => c.ops[0][0] === 'insert')).toHaveLength(1)
  })

  it('exposes no app-side batch balance mutators', () => {
    expect(batchesService.adjustYardStock).toBeUndefined()
    expect(batchesService.restoreStock).toBeUndefined()
    expect(batchesService.reduceStock).toBeUndefined()
  })
})

describe('waybill batch picker — factory batches only', () => {
  it('getActive({ siteId }) filters the query by site_id', async () => {
    state.calls.length = 0
    await batchesService.getActive({ siteId: DUTSE })
    const call = state.calls.find(c => c.table === 'batches')
    expect(call.ops).toContainEqual(['eq', 'status', 'active'])
    expect(call.ops).toContainEqual(['eq', 'site_id', DUTSE])
  })

  it('getActive() without a site keeps the unfiltered behaviour', async () => {
    state.calls.length = 0
    await batchesService.getActive()
    const call = state.calls.find(c => c.table === 'batches')
    expect(call.ops.some(o => o[0] === 'eq' && o[1] === 'site_id')).toBe(false)
  })

  it('factoryBatchesOnly drops client-site batches (and uses the Dutse id before sites load)', () => {
    const batches = [
      { id: 'd1', site_id: DUTSE },
      { id: 'k1', site_id: KADO },
      { id: 'l1', site_id: '00000000-0000-4000-8000-000000000003' },
    ]
    expect(batchesService.factoryBatchesOnly(batches, SITES).map(b => b.id)).toEqual(['d1'])
    expect(batchesService.factoryBatchesOnly(batches, []).map(b => b.id)).toEqual(['d1'])
  })
})
