import React from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const db = vi.hoisted(() => ({ resolve: null, calls: [] }))
vi.mock('../lib/supabase', async () => {
  const { createSupabaseMock } = await import('../test/supabaseMock')
  const mock = createSupabaseMock((...args) => db.resolve(...args))
  db.calls = mock.calls
  return { supabase: mock.supabase }
})
import { AssignedSiteProvider } from './AssignedSite'
import Labour, { RosterCreateForm } from './Labour'
import { WagesToPay, WageDashboard } from './DailyWages'
import NotificationBell from './NotificationBell'
import { DUTSE_SITE_ID } from '../services/sites'
import { weeklyPayrollService } from '../services/weeklyPayroll'

const sites = [
  { id: DUTSE_SITE_ID, name: 'Dutse Factory', labour_pay_mode: 'weekly' },
  { id: 'kado', name: 'Kado', labour_pay_mode: 'daily' },
  { id: 'life-camp', name: 'Life Camp', labour_pay_mode: 'daily' },
]
const roles = [
  { id: 'kado-role', role_name: 'Site crew — Kado', site_id: 'kado', base_rate: 6000 },
  { id: 'lc-role', role_name: 'Site crew — Life Camp', site_id: 'life-camp', base_rate: 8000 },
  { id: 'factory-role', role_name: 'Factory crew', site_id: null, base_rate: 4000 },
]
const worker = { id: 'new', full_name: 'Temporary worker', usual_role_id: 'kado-role', is_active: true }
const due = { roster_id: 'r', site_id: 'kado', site_name: 'Kado', roster_date: '2026-11-19', workers: 3, total: 18000, md_status: 'approved', days_waiting: 2 }

const ok = (data = []) => ({ data, error: null })
const base = (table, ops) => {
  if (table === 'production_sites') return ok(sites)
  if (table === 'labour_pool') return ops.some(([name]) => name === 'insert') ? ok(worker) : { ...ok(), count: 5 }
  if (table === 'daily_roster') return ok(ops.some(([name]) => name === 'insert') ? { id: 'r' } : [{ id: 'r' }])
  if (table === 'daily_roster_entries') return ok([{ id: 'entry', labour_id: worker.id }])
  if (table === 'rpc:daily_wages_due') return ok([due])
  if (table === 'bank_accounts') return ok([{ id: 'bank', account_name: 'Operations' }])
  return ok()
}
beforeEach(() => { db.resolve = base; db.calls.length = 0; vi.stubGlobal('localStorage', { getItem: vi.fn(), setItem: vi.fn() }) })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

it('filters Dutse jobs to unassigned roles', async () => {
  render(<RosterCreateForm pool={[]} roles={roles} userProfile={{ role: 'md' }} />)
  await userEvent.click(await screen.findByRole('button', { name: /Add Worker Row/ }))
  const dropdown = screen.getByRole('combobox', { name: 'Job / role' })
  expect(within(dropdown).getByRole('option', { name: 'Factory crew' })).toBeInTheDocument()
  expect(within(dropdown).queryByText('Site crew — Kado')).toBeNull()
})

it('defaults Kado jobs and adds a temporary worker at the site rate, saving the updated header', async () => {
  db.resolve = (table, ops) => table === 'rpc:my_assigned_site' ? ok('kado') : base(table, ops)
  render(<AssignedSiteProvider><RosterCreateForm pool={[]} roles={roles} userProfile={{ role: 'assistant_production_manager' }} onSave={vi.fn()} /></AssignedSiteProvider>)
  await userEvent.click(await screen.findByRole('button', { name: 'Add temporary worker' }))
  await userEvent.type(screen.getByLabelText('Worker name'), worker.full_name)
  await userEvent.type(screen.getByLabelText('Phone'), '08012345678')
  await userEvent.click(screen.getByRole('button', { name: 'Add to roster' }))
  const dropdown = await screen.findByRole('combobox', { name: 'Job / role' })
  expect(dropdown).toHaveValue('kado-role')
  expect(within(dropdown).queryByText('Site crew — Life Camp')).toBeNull()
  expect(within(dropdown).queryByText('Factory crew')).toBeNull()
  expect(db.calls.find(c => c.table === 'labour_pool' && c.ops.some(([op]) => op === 'insert')).ops)
    .toContainEqual(['insert', expect.objectContaining({ full_name: worker.full_name, phone: '08012345678', usual_role_id: 'kado-role', category: 'daily', labour_number: 'APC-LAB-006' })])
  await userEvent.click(screen.getByRole('button', { name: 'Save as Draft' }))
  await waitFor(() => expect(db.calls.find(c => c.table === 'daily_roster' && c.ops.some(([op]) => op === 'update'))?.ops)
    .toContainEqual(['update', expect.objectContaining({ site_id: 'kado', total_daily_cost: 6000, worker_count: 1 })]))
})

it('shows wages due and sends the transfer details, then refreshes', async () => {
  const onRoster = vi.fn()
  const onPaid = vi.fn()
  localStorage.getItem.mockReturnValue('Crew lead')
  render(<WagesToPay userProfile={{ role: 'ico', effectiveRoles: ['ico', 'accountant'] }} onRoster={onRoster} onPaid={onPaid} />)
  await userEvent.click(await screen.findByRole('button', { name: /Kado.*View roster/ }))
  expect(onRoster).toHaveBeenCalledWith('r')
  expect(screen.getByText(/3 workers.*18,000/)).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Record payment' }))
  expect(screen.getByLabelText(/Amount/)).toHaveValue(18000)
  expect(screen.getByLabelText('Paid to')).toHaveValue('Crew lead')
  await userEvent.type(screen.getByLabelText('Transfer reference'), 'TR-33')
  await userEvent.selectOptions(screen.getByLabelText('From account'), 'bank')
  await userEvent.type(screen.getByLabelText('Note'), 'Crew transfer')
  await userEvent.click(screen.getByRole('button', { name: 'Save payment' }))
  expect(db.calls).toContainEqual({ rpc: 'pay_daily_roster', args: {
    p_roster_id: 'r', p_amount: 18000, p_paid_to: 'Crew lead', p_reference: 'TR-33', p_bank_account_id: 'bank', p_note: 'Crew transfer',
  } })
  expect(onPaid).toHaveBeenCalledOnce()
})

it('blocks the accountant until approval and lets the MD see the exact payment error', async () => {
  db.resolve = (table, ops) => table === 'rpc:daily_wages_due' ? ok([{ ...due, md_status: 'pending' }])
    : table === 'rpc:pay_daily_roster' ? { error: { message: 'Attendance must be confirmed first.' } } : base(table, ops)
  const view = render(<WagesToPay userProfile={{ role: 'accountant' }} />)
  expect(await screen.findByRole('button', { name: 'Waiting for MD approval' })).toBeDisabled()
  view.rerender(<WagesToPay userProfile={{ role: 'md' }} />)
  await userEvent.click(screen.getByRole('button', { name: 'Record payment' }))
  await userEvent.type(screen.getByLabelText('Paid to'), 'Crew lead')
  await userEvent.type(screen.getByLabelText('Transfer reference'), 'TR-33')
  await userEvent.click(screen.getByRole('button', { name: 'Save payment' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Attendance must be confirmed first.')
})

it('shows the dashboard count and total to reviewers and hides it at zero', async () => {
  const view = render(<WageDashboard userProfile={{ id: 'md', role: 'md' }} />)
  expect(await screen.findByRole('button', { name: /Wages to pay: 1 day,.*18,000/ })).toBeInTheDocument()
  db.resolve = () => ok()
  view.rerender(<WageDashboard userProfile={{ id: 'accountant', role: 'accountant' }} />)
  await waitFor(() => expect(screen.queryByRole('button')).toBeNull())
})

it('keeps weekly payroll drafts clear of daily sites and paid rosters', async () => {
  db.resolve = table => table === 'daily_roster' ? ok([
    { id: 'daily', site: { labour_pay_mode: 'daily' }, payment_status: 'unpaid' },
    { id: 'paid', site: { labour_pay_mode: 'weekly' }, payment_status: 'paid' },
    { id: 'eligible', site: { labour_pay_mode: 'weekly' }, payment_status: 'unpaid' },
  ]) : ok()
  const { rosters } = await weeklyPayrollService.loadRange('2026-11-16', '2026-11-21')
  expect(rosters.map(r => r.id)).toEqual(['eligible'])
})

it('opens the roster when a wage notification is clicked', async () => {
  const onNavigate = vi.fn()
  db.resolve = table => table === 'notifications'
    ? { ...ok([{ id: 'n', title: 'Wages paid: Kado', related_table: 'daily_roster', related_id: 'r', read_at: '2026-11-21' }]), count: 0 }
    : ok()
  render(<NotificationBell userProfile={{ id: 'worker', role: 'assistant_production_manager' }} onNavigate={onNavigate} />)
  await userEvent.click(screen.getByTitle('Notifications'))
  await userEvent.click(await screen.findByText('Wages paid: Kado'))
  expect(onNavigate).toHaveBeenCalledWith('labour', 'r')
})

it('shows the paid transfer and keeps the roster read-only', async () => {
  db.resolve = (table, ops) => table === 'daily_roster' ? ok([{
    id: 'r', site_id: 'kado', site: { labour_pay_mode: 'daily' }, roster_date: '2026-11-19',
    payment_status: 'paid', paid_amount: 6000, paid_to: 'Crew lead', payment_reference: 'TR-33',
    paid_at: '2026-11-20T07:00:00Z', ico_status: 'ico_approved', md_status: 'approved',
  }]) : base(table, ops)
  render(<Labour initialRosterId="r" userProfile={{ role: 'md' }} />)
  expect(await screen.findByText('Paid rosters are read-only.')).toBeInTheDocument()
  expect(screen.getByText(/Paid ₦6,000 to Crew lead, ref TR-33/)).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Back to List' }))
  expect(await screen.findByRole('button', { name: 'View', exact: true })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Edit', exact: true })).toBeNull()
})
