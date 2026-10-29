import { beforeEach, it, expect, vi } from 'vitest'
const state = vi.hoisted(() => ({ calls: null, resolve: null }))
vi.mock('../lib/supabase', async () => {
  const { createSupabaseMock } = await import('../test/supabaseMock')
  const mock = createSupabaseMock((table, ops) => state.resolve(table, ops))
  state.calls = mock.calls
  return { supabase: mock.supabase }
})
import { weeklyPayrollService } from './weeklyPayroll'
import { payrollService as salaryService } from './attendance'
import { payrollService, rosterService, rateChangeService, truckLoadingService } from './labour'
import { advancesService } from './advances'
import { op } from '../test/supabaseMock'
const zero = { data: [], error: null }
const failure = { code: 'P0001', message: 'TEST database refusal' }
beforeEach(() => {
  state.calls.length = 0
  state.resolve = (_, ops) => ops.some(o => ['insert','update','upsert'].includes(o[0]))
    ? { data: ops.some(o => o[0] === 'single') ? { id: 'p', status: 'draft' } : [{ id: 'r' }], error: null } : zero
})
it('1: marking weekly payroll paid only calls advance_weekly_payroll, never inserts an expense', async () => {
  state.resolve = () => ({ data: { id: 'p', status: 'paid' }, error: null })
  await weeklyPayrollService.advance('p','mark_paid')
  await payrollService.markPaid('p')
  expect(state.calls).toEqual([{ rpc: 'advance_weekly_payroll', args: { p_payroll_id: 'p', p_action: 'mark_paid', p_reason: null } }, { rpc: 'advance_weekly_payroll', args: { p_payroll_id: 'p', p_action: 'mark_paid', p_reason: null } }])
})
it('1: payroll RPC failure is shown rather than marking paid or posting expenses', async () => {
  state.resolve = () => ({ data: null, error: failure })
  await expect(weeklyPayrollService.advance('p','mark_paid')).rejects.toEqual(failure)
  expect(state.calls).toHaveLength(1)
})
it('3: loading an approved payroll fetches its complete linked schedule, outside the chosen range too', async () => {
  state.resolve = (table, ops) => {
    if (table === 'weekly_labour_payroll') return { data: [{ id: 'p', payroll_type: 'production', status: 'paid', week_ending: '2026-10-24' }], error: null }
    if (table === 'daily_roster' && ops.some(o => o[0] === 'eq' && o[1] === 'payroll_id')) return { data: [{ id: 'owned-outside', payroll_id: 'p', entries: [] }], error: null }
    return zero
  }
  const result = await weeklyPayrollService.loadRange('2026-10-20','2026-10-24','p')
  expect(result.production.id).toBe('p')
  expect(result.rosters).toContainEqual({ id: 'owned-outside', payroll_id: 'p', entries: [] })
})
it('4: paid work cannot be selected into a new draft', async () => {
  state.resolve = () => ({ data: [{ id: 'r', payroll_id: null, payment_status: 'paid' }], error: null })
  await expect(weeklyPayrollService.saveDraft({ type: 'production', from: '2026-10-01', to: '2026-10-03', ids: ['r'], total: 1, workerCount: 1 })).rejects.toThrow('already paid')
  expect(state.calls.some(c => c.ops?.some(o => o[0] === 'insert'))).toBe(false)
})
it('4: duplicate weekly generation loads the existing draft without linking a new schedule', async () => {
  state.resolve = (table, ops) => {
    if (table === 'daily_roster') return { data: [{ id: 'r', payroll_id: null, payment_status: 'unpaid' }], error: null }
    if (op({ ops },'insert')) return { data: null, error: { code: '23505', message: 'duplicate' } }
    return { data: { id: 'existing', status: 'draft' }, error: null }
  }
  await expect(weeklyPayrollService.saveDraft({ type: 'production', ids: ['r'], to: '2026-10-03' })).resolves.toEqual({ payroll: { id: 'existing', status: 'draft' }, existing: true })
  expect(state.calls.some(c => op(c, 'update'))).toBe(false)
})
it('4: refused row linking stops the flow before header totals are updated', async () => {
  state.resolve = (table, ops) => {
    if (table === 'daily_roster' && op({ops},'update')) return { data: null, error: failure }
    if (table === 'daily_roster') return { data: [{ id: 'r', payroll_id: null }], error: null }
    return { data: { id: 'p', status: 'draft' }, error: null }
  }
  await expect(weeklyPayrollService.saveDraft({ type: 'production', ids: ['r'], total: 2000 })).rejects.toThrow('TEST database refusal')
  expect(state.calls.filter(c => c.table === 'weekly_labour_payroll' && op(c,'update'))).toHaveLength(0)
})
it('4: zero-row link is refused, not reported as a generated payroll', async () => {
  state.resolve = (table, ops) => table === 'daily_roster'
    ? op({ops},'update') ? zero : { data: [{ id: 'r', payroll_id: null }], error: null }
    : { data: { id: 'p', status: 'draft' }, error: null }
  await expect(weeklyPayrollService.saveDraft({ type: 'production', ids: ['r'] })).rejects.toThrow('Not saved')
})
it('5: roster entry failure leaves header/date/totals untouched', async () => {
  state.resolve = () => ({ data: null, error: failure })
  await expect(rosterService.saveEntriesFirst('r', { roster_date: '2026-10-29', total_daily_cost: 2000 }, [{ labour_id: 'w' }])).rejects.toEqual(failure)
  expect(state.calls.map(c => c.table)).toEqual(['daily_roster_entries'])
})
it('5: successful roster saves check entries before header totals', async () => {
  await rosterService.saveEntriesFirst('r', { total_daily_cost: 2000 }, [{ labour_id: 'w' }])
  expect(state.calls.map(c => c.table)).toEqual(['daily_roster_entries','daily_roster_entries','daily_roster'])
  expect(op(state.calls[2],'update')[1]).toEqual({ total_daily_cost: 2000 })
})
it('5: roster zero-row deletion errors without pre-deleting workers', async () => {
  state.resolve = () => zero
  await expect(rosterService.delete('r')).rejects.toThrow('nothing was removed')
  expect(state.calls.map(c => c.table)).toEqual(['daily_roster'])
})
it('6: loader failure is awaited and reports that the load already exists', async () => {
  state.resolve = (table, ops) => table === 'truck_loading_log'
    ? { data: { id: 'load' }, error: null }
    : op({ops},'insert') ? { data: null, error: failure } : zero
  await expect(truckLoadingService.createLog({ vehicle_id: 'v' }, ['worker'])).rejects.toMatchObject({ loadCreated: { id: 'load' }, message: 'Load load exists, but its crew was not saved: TEST database refusal' })
})
it('7: monthly fixed loads use monthStart/monthEnd date bounds instead of ILIKE', async () => {
  await weeklyPayrollService.loadMonthly('2024-02')
  expect(state.calls[0].ops).toContainEqual(['gte','week_ending','2024-02-01'])
  expect(state.calls[0].ops).toContainEqual(['lte','week_ending','2024-02-29'])
  expect(op(state.calls[0],'ilike')).toBeUndefined()
})
it('7: monthly load errors propagate rather than displaying an empty successful month', async () => {
  state.resolve = () => ({ data: null, error: failure })
  await expect(weeklyPayrollService.loadMonthly('2026-10')).rejects.toEqual(failure)
})
it('7: monthly duplicate insert loads the existing payroll, with no success claim for a new one', async () => {
  state.resolve = (_, ops) => op({ops},'insert') ? { data: null, error: { code: '23505' } } : { data: [{ id: 'existing' }], error: null }
  await expect(weeklyPayrollService.createMonthly('2026-10', 2000, 1, 'TEST')).resolves.toEqual({ payroll: { id: 'existing' }, existing: true })
  expect(state.calls.filter(c => op(c,'insert'))).toHaveLength(1)
  expect(state.calls.some(c => op(c,'upsert'))).toBe(false)
})
it('8a: salary generation stops before insert when an existing period overlaps', async () => {
  state.resolve = () => ({ data: [{ id: 'p', period_from: '2026-10-01', period_to: '2026-10-31' }], error: null })
  await expect(salaryService.createRun({ period_from: '2026-10-15', period_to: '2026-11-15' }, [])).rejects.toThrow('A salary run already covers 2026-10-01 to 2026-10-31')
  expect(state.calls).toHaveLength(1)
  expect(state.calls[0].ops).toContainEqual(['lte','period_from','2026-11-15'])
  expect(state.calls[0].ops).toContainEqual(['gte','period_to','2026-10-15'])
})
it('8a: database overlap refusal on line insert is preserved and identifies the existing new run', async () => {
  state.resolve = (table, ops) => op({ops},'insert') ? table === 'payroll_runs' ? { data: { id: 'run' }, error: null } : { data: null, error: failure } : zero
  await expect(salaryService.createRun({ period_from:'2026-10-01', period_to:'2026-10-31' }, [{ staff_id: 's' }])).rejects.toMatchObject({ runCreated: { id: 'run' }, message: 'Salary run run exists, but its lines were not saved: TEST database refusal' })
})
it('10: disbursed advance choices retain every advance id for a staff member', async () => {
  state.resolve = () => ({ data: [{ id: 'a', staff_id: 's' }, { id: 'b', staff_id: 's' }], error: null })
  expect(await advancesService.getOutstandingByStaff()).toEqual({ s: [{ id: 'a', staff_id: 's' }, { id: 'b', staff_id: 's' }] })
})
it('12: ICO review never writes labour_roles', async () => {
  await rateChangeService.icoReview('r','approved','TEST','TEST ICO')
  expect(state.calls.map(c => c.table)).toEqual(['labour_rate_change_requests'])
})
it('12: MD approval checks the live rate before the request and stops on its failure', async () => {
  state.resolve = (table, ops) => table === 'labour_rate_change_requests' && !op({ops},'update')
    ? { data: { role_id: 'r', proposed_rate: 200, ico_status: 'approved' }, error: null } : { data: null, error: failure }
  await expect(rateChangeService.mdReview('r','approved','TEST','TEST MD')).rejects.toEqual(failure)
  expect(state.calls.map(c => c.table)).toEqual(['labour_rate_change_requests','labour_roles'])
})
it('14: advance staff-name lookup errors are not swallowed', async () => {
  state.resolve = table => table === 'salary_advances' ? { data: [{ staff_id: 's' }], error: null } : { data: null, error: failure }
  await expect(advancesService.list()).rejects.toEqual(failure)
})
it('12: MD cannot change a live rate before ICO approval', async () => {
  state.resolve = () => ({ data: { id: 'request', ico_status: 'pending', role_id: 'r' }, error: null })
  await expect(rateChangeService.mdReview('request','approved','','TEST MD')).rejects.toThrow('The ICO must approve')
  expect(state.calls).toHaveLength(1)
})
it('12: MD checks both writes in live-rate then request order and discloses a partial save', async () => {
  state.resolve = (table, ops) => table === 'labour_rate_change_requests'
    ? op({ops},'update') ? { data: null, error: failure } : { data: { ico_status: 'approved', overall_status: 'md_review', role_id: 'r', proposed_rate: 1000 }, error: null }
    : { data: [{ id: 'r' }], error: null }
  await expect(rateChangeService.mdReview('request','approved','','TEST MD')).rejects.toThrow('The labour rate was updated, but the request could not be finalized: TEST database refusal')
  expect(state.calls.filter(c => op(c,'update')).map(c => c.table)).toEqual(['labour_roles','labour_rate_change_requests'])
})
