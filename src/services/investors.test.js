import { describe, it, expect, vi, beforeEach } from 'vitest'

const state = vi.hoisted(() => ({ resolve: null, mock: null }))
vi.mock('../lib/supabase', async () => {
  const { createSupabaseMock } = await import('../test/supabaseMock')
  state.mock = createSupabaseMock((table, ops) => state.resolve(table, ops))
  return state.mock
})

import { op } from '../test/supabaseMock'
import { investorsService, myInvestmentService } from './investors'

describe('investorsService', () => {
  beforeEach(() => { state.resolve = () => ({ data: [{ id: 'x' }], error: null }); state.mock.calls.length = 0 })

  it('a receipt never reads or sends a bank account number', async () => {
    await investorsService.listBankAccounts()
    expect(op(state.mock.calls[0], 'select')[1]).not.toMatch(/account_number/)
    await investorsService.recordSiteReceipt({
      site_id: 'kado', cycle_id: 'c1', received_on: '2026-10-23', amount: 1, payer: ' TEST ', reference: 'TEST',
      bank_account_id: 'b1', notes: '', account_number: '0123456789', bank: { account_number: '0123456789' },
    })
    const sent = op(state.mock.calls[1], 'insert')[1]
    expect(sent).toEqual({ site_id: 'kado', cycle_id: 'c1', received_on: '2026-10-23', amount: 1, payer: 'TEST', reference: 'TEST', bank_account_id: 'b1', notes: null })
    expect(JSON.stringify(sent)).not.toMatch(/0123456789|account_number/)
  })

  it('void sends only voided + reason, and an RLS no-op is an error (Rule 10.4)', async () => {
    await investorsService.voidSiteReceipt('r1', ' TEST void ')
    expect(op(state.mock.calls[0], 'update')[1]).toEqual({ voided: true, void_reason: 'TEST void' })
    state.resolve = () => ({ data: [], error: null })
    await expect(investorsService.voidSiteReceipt('r1', 'x')).rejects.toThrow(/not saved/)
  })

  it('throws DB messages unchanged (Rule 10.5)', async () => {
    state.resolve = () => ({ data: null, error: { message: 'The month Sep 2026 is already approved for this site. Record the receipt in the current month.' } })
    await expect(investorsService.recordSiteReceipt({ site_id: 'k', received_on: '2026-09-01', amount: 5 })).rejects.toMatchObject({ message: /already approved/ })
    await expect(investorsService.listContributions('k')).rejects.toBeTruthy()
  })

  it('RPCs use the p_ argument names from the migration record', async () => {
    await investorsService.computeMonth('kado', '2026-09-01')
    await investorsService.approveMonth('p1')
    await investorsService.voidMonth('p1', 'TEST')
    await investorsService.markPaid('d1', '2026-10-08', 'REF')
    await investorsService.capitalOn('kado', '2026-10-23')
    expect(state.mock.calls.map(c => [c.rpc, c.args])).toEqual([
      ['compute_ndc_period', { p_site_id: 'kado', p_month: '2026-09-01' }],
      ['approve_ndc_period', { p_period_id: 'p1' }],
      ['void_ndc_period', { p_period_id: 'p1', p_reason: 'TEST' }],
      ['mark_distribution_paid', { p_distribution_id: 'd1', p_paid_on: '2026-10-08', p_reference: 'REF' }],
      ['fn_site_capital_on', { p_site: 'kado', p_day: '2026-10-23' }],
    ])
  })

  it('a contribution sends the signed amount; investors are never sent a kind change', async () => {
    await investorsService.addContribution({ investor_id: 'i', site_id: 'kado', kind: 'bridge_refund', amount: -5, contributed_on: '2026-09-01', asset_id: '', reference: '', notes: '' })
    expect(op(state.mock.calls[0], 'insert')[1]).toMatchObject({ kind: 'bridge_refund', amount: -5, asset_id: null })
    await investorsService.updateInvestor('apcl', { name: 'APCL', phone: '', email: '', notes: '', is_active: false, kind: 'external' }, { isApcl: true })
    const patch = op(state.mock.calls[1], 'update')[1]
    expect(patch).not.toHaveProperty('kind')
    expect(patch).not.toHaveProperty('is_active')
    await investorsService.createInvestor({ name: ' TEST Investor ', phone: '', email: '', notes: '', is_active: true })
    expect(op(state.mock.calls[2], 'insert')[1]).toMatchObject({ name: 'TEST Investor', kind: 'external' })
  })
})

describe('myInvestmentService', () => {
  beforeEach(() => { state.resolve = () => ({ data: [], error: null }); state.mock.calls.length = 0 })
  it('reads only its own rows and never calls fn_site_capital_on', async () => {
    await myInvestmentService.myInvestor('u1')
    await myInvestmentService.myPositions('i1')
    await myInvestmentService.myDistributions('i1')
    expect(state.mock.calls.every(c => !c.rpc)).toBe(true)
    expect(state.mock.calls.map(c => [c.table, c.ops.find(o => o[0] === 'eq')])).toEqual([
      ['investors', ['eq', 'user_id', 'u1']],
      ['v_investor_position', ['eq', 'investor_id', 'i1']],
      ['distributions', ['eq', 'investor_id', 'i1']],
    ])
  })
})
