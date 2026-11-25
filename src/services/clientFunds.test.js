import { expect, it, vi } from 'vitest'
import { clientFunds, statementBalances } from './clientFunds'
const rpc = vi.hoisted(() => vi.fn(async () => ({ data: 'ok' })))
vi.mock('../lib/supabase', () => ({ supabase: { rpc } }))
it('maps records and set/clear/void calls', async () => {
  await clientFunds.record('s', { fund: 'diesel', kind: 'received', date: '2026-11-25', amount: '1500', reference: ' REF ' })
  expect(rpc).toHaveBeenLastCalledWith('record_client_fund', expect.objectContaining({ p_site_id: 's', p_fund: 'diesel', p_amount: 1500, p_reference: 'REF', p_bank_account_id: null }))
  await clientFunds.setRequestFund('r', null)
  expect(rpc).toHaveBeenLastCalledWith('set_payment_request_client_fund', { p_payment_request_id: 'r', p_fund: null })
  await clientFunds.void('e', '  Wrong entry reason  ')
  expect(rpc).toHaveBeenLastCalledWith('void_client_fund_entry', { p_id: 'e', p_reason: 'Wrong entry reason' })
})
it('only received, adjustments and spent change balance; voids do not', () => {
  const rows = ['asked','approved','received','pending','spent','adjustment','received'].map((kind, i) => ({ kind, date: `2026-11-${10+i}`, amount: kind === 'adjustment' ? -20 : 100, voided: i === 6 }))
  expect(statementBalances(rows).map(r => r.balance)).toEqual([0,0,100,100,0,-20,-20])
})
