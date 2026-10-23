import { describe, it, expect, vi, beforeEach } from 'vitest'

const state = vi.hoisted(() => ({ resolve: null, mock: null }))
vi.mock('../lib/supabase', async () => {
  const { createSupabaseMock } = await import('../test/supabaseMock')
  state.mock = createSupabaseMock((table, ops) => state.resolve(table, ops))
  return state.mock
})

import { op } from '../test/supabaseMock'
import { assetsService, assetTypeFor } from './assets'

const GUARD = 'Use "Move asset" to change where an asset is.'
const form = { name: 'TEST trolley', code: '', category: 'trolley', quantity: 4, serial_or_tag: null, acquired_on: null, funding_source: 'apcl', condition: 'good', status: 'active', notes: null, acquisition_cost: 120000, investment_pool_ref: 'POOL-1', investor_id: 'inv-1', site_id: 'dutse' }

describe('assetsService', () => {
  beforeEach(() => { state.resolve = () => ({ data: [{ id: 'a1' }], error: null }); state.mock.calls.length = 0 })

  it('derives asset_type from category', () => {
    expect(assetTypeFor('machine')).toBe('machine')
    expect(assetTypeFor('vehicle')).toBe('vehicle')
    expect(assetTypeFor('trolley')).toBe('equipment')
  })

  it('edit never sends site_id, and leaves cost / investor out for roles that may not set them', async () => {
    await assetsService.updateAsset('a1', form, { canCost: false, canInvestor: false })
    const payload = op(state.mock.calls[0], 'update')[1]
    expect(payload).not.toHaveProperty('site_id')
    expect(payload).not.toHaveProperty('acquisition_cost')
    expect(payload).not.toHaveProperty('investor_id')
    expect(payload).not.toHaveProperty('investment_pool_ref')
    expect(payload.asset_type).toBe('equipment')
    await assetsService.updateAsset('a1', form, { canCost: true, canInvestor: true })
    const p2 = op(state.mock.calls[1], 'update')[1]
    // APCL-funded: the investor is cleared; the legacy pool ref is never written.
    expect(p2).toMatchObject({ acquisition_cost: 120000, investor_id: null })
    expect(p2).not.toHaveProperty('investment_pool_ref')
    expect(p2).not.toHaveProperty('site_id')
    await assetsService.updateAsset('a1', { ...form, funding_source: 'investor' }, { canInvestor: true })
    expect(op(state.mock.calls[2], 'update')[1].investor_id).toBe('inv-1')
  })

  it('add sends site_id', async () => {
    state.resolve = () => ({ data: { id: 'a1' }, error: null })
    await assetsService.createAsset(form, { canCost: false })
    const payload = op(state.mock.calls[0], 'insert')[1]
    expect(payload).toMatchObject({ site_id: 'dutse', asset_type: 'equipment', category: 'trolley', quantity: 4 })
    expect(payload).not.toHaveProperty('acquisition_cost')
  })

  it('an RLS-filtered edit (zero rows) is a failure; the site guard message is rethrown verbatim', async () => {
    state.resolve = () => ({ data: [], error: null })
    await expect(assetsService.updateAsset('a1', form)).rejects.toThrow(/not saved/)
    state.resolve = () => ({ data: null, error: { message: GUARD } })
    await expect(assetsService.updateAsset('a1', form)).rejects.toMatchObject({ message: GUARD })
  })

  it('moveAsset calls move_asset with p_-prefixed arguments and rethrows its message', async () => {
    state.resolve = () => ({ data: 'new-id', error: null })
    expect(await assetsService.moveAsset({ assetId: 'a1', toSiteId: 'kado', quantity: 1, movedOn: '2026-10-22', reason: 'TEST' })).toBe('new-id')
    const call = state.mock.calls.find(c => c.rpc === 'move_asset')
    expect(call.args).toEqual({ p_asset_id: 'a1', p_to_site_id: 'kado', p_quantity: 1, p_moved_on: '2026-10-22', p_reason: 'TEST' })
    state.resolve = () => ({ data: null, error: { message: 'Quantity must be between 1 and 4.' } })
    await expect(assetsService.moveAsset({ assetId: 'a1', toSiteId: 'kado', quantity: 9, movedOn: '2026-10-22', reason: 'x' }))
      .rejects.toMatchObject({ message: 'Quantity must be between 1 and 4.' })
  })

  it('listRegister throws instead of returning an empty list (Rule 10.5)', async () => {
    state.resolve = () => ({ data: null, error: { message: 'permission denied for view v_site_asset_register' } })
    await expect(assetsService.listRegister()).rejects.toMatchObject({ message: /permission denied/ })
  })
})
