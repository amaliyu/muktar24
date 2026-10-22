import { describe, it, expect, vi, beforeEach } from 'vitest'

const state = vi.hoisted(() => ({ resolve: null, mock: null }))
vi.mock('../lib/supabase', async () => {
  const { createSupabaseMock } = await import('../test/supabaseMock')
  state.mock = createSupabaseMock((table, ops) => state.resolve(table, ops))
  return state.mock
})

import { siteContractsService, isCycleFunded } from './siteContracts'

const GUARD = 'Cycle 1 cannot start: it is not fully paid or the production schedule is missing. Only the MD can start it early, with a written reason.'

describe('siteContractsService — errors are surfaced, never swallowed (Rule 10.5)', () => {
  beforeEach(() => { state.resolve = () => ({ data: [], error: null }); state.mock.calls.length = 0 })

  it('setCycleStatus rethrows the DB guard message verbatim', async () => {
    state.resolve = () => ({ data: null, error: { message: GUARD, code: 'P0001' } })
    await expect(siteContractsService.setCycleStatus('c1', 'active')).rejects.toMatchObject({ message: GUARD })
  })

  it('setCycleStatus treats an RLS-filtered update (zero rows, no error) as a failure', async () => {
    state.resolve = () => ({ data: [], error: null })
    await expect(siteContractsService.setCycleStatus('c1', 'active')).rejects.toThrow(/not saved/)
  })

  it('recordReceipt rethrows the RPC error and sends p_-prefixed arguments', async () => {
    state.resolve = () => ({ data: null, error: { message: 'Give a reason for the rejected quantity.' } })
    await expect(siteContractsService.recordReceipt({ itemId: 'i1', receivedOn: '2026-12-21', qtyDelivered: 10, qtyAccepted: 8 }))
      .rejects.toMatchObject({ message: 'Give a reason for the rejected quantity.' })
    const call = state.mock.calls.find(c => c.rpc === 'record_material_receipt')
    expect(Object.keys(call.args).sort()).toEqual(['p_item_id', 'p_notes', 'p_photo_path', 'p_qty_accepted', 'p_qty_delivered', 'p_received_on', 'p_ref', 'p_rejection_reason', 'p_supplier'])
    expect(call.args).toMatchObject({ p_item_id: 'i1', p_qty_delivered: 10, p_qty_accepted: 8 })
  })

  it('voidReceipt and runSiteWarnings rethrow RPC errors', async () => {
    state.resolve = () => ({ data: null, error: { message: 'Only the MD or Store Officer can void a delivery record.' } })
    await expect(siteContractsService.voidReceipt('r1', 'TEST')).rejects.toMatchObject({ message: /Only the MD or Store Officer/ })
    state.resolve = () => ({ data: null, error: { message: 'Only the MD can run site warnings manually.' } })
    await expect(siteContractsService.runSiteWarnings()).rejects.toMatchObject({ message: /Only the MD/ })
  })

  it('list calls throw instead of returning an empty list', async () => {
    state.resolve = () => ({ data: null, error: { message: 'permission denied for view v_cycle_forecast' } })
    await expect(siteContractsService.listForecasts()).rejects.toMatchObject({ message: /permission denied/ })
    await expect(siteContractsService.listContracts()).rejects.toMatchObject({ message: /permission denied/ })
    await expect(siteContractsService.listHandovers({})).rejects.toMatchObject({ message: /permission denied/ })
    await expect(siteContractsService.listReceipts({})).rejects.toMatchObject({ message: /permission denied/ })
  })

  it('updateCycle sends only editable columns (never status or computed fields)', async () => {
    state.resolve = () => ({ data: [{ id: 'c1' }], error: null })
    await siteContractsService.updateCycle('c1', { qty_9in: 20000, qty_6in: 5000, status: 'active', amount_due: 1, remobilisation_deadline: '2026-12-30' })
    const upd = state.mock.calls[0].ops.find(o => o[0] === 'update')[1]
    expect(upd).toEqual({ qty_9in: 20000, qty_6in: 5000, amount_due: 1 })
  })

  it('isCycleFunded mirrors the guard: full payment, plus the schedule for full supply', () => {
    expect(isCycleFunded({ amount_due: 100, amount_received: 100 }, 'service_fee')).toBe(true)
    expect(isCycleFunded({ amount_due: 100, amount_received: 100 }, 'full_supply')).toBe(false)
    expect(isCycleFunded({ amount_due: 100, amount_received: 100, schedule_received_on: '2026-12-21' }, 'full_supply')).toBe(true)
    expect(isCycleFunded({ amount_due: null, amount_received: 0 }, 'service_fee')).toBe(false)
  })
})
