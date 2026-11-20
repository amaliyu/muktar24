import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { RoleGrantsManager } from '../App'
import { MyAccess } from './GrantExpiry'
import NotificationBell from './NotificationBell'
import { roleLabel } from '../lib/roles'
import { lagosToday } from '../utils/lateEntry'
import { shiftScorecardDate } from '../utils/siteScorecard'
import { fmtDay, theme } from './site/siteUi'

const f = vi.hoisted(() => ({ calls: [], grants: [], events: [], error: null }))
vi.mock('pdfjs-dist', () => ({ GlobalWorkerOptions: {} }))
vi.mock('../lib/supabase', async () => {
  const { createSupabaseMock } = await import('../test/supabaseMock')
  const mock = createSupabaseMock((table, args) => {
    if (table === 'rpc:extend_role_grant') {
      if (f.error) return { error: f.error }
      f.grants = f.grants.map(grant => grant.id === args.p_grant_id ? { ...grant, expires_at: args.p_new_expires_at } : grant)
      return { data: f.grants.find(grant => grant.id === args.p_grant_id) }
    }
    if (table === 'user_role_grants') {
      const sorted = [...f.grants].sort((a, b) => (a.expires_at || 'z').localeCompare(b.expires_at || 'z'))
      return { data: sorted, error: null }
    }
    if (table === 'role_grant_events') return { data: f.events, error: null }
    return { data: [], error: null }
  })
  f.calls = mock.calls
  return { supabase: { ...mock.supabase, auth: { getUser: async () => ({ data: { user: { id: 'worker' } } }) } } }
})
vi.mock('../services/notifications', () => ({ notificationsService: {
  getUnreadCount: async () => 0,
  getRecent: async () => [{ id: 'notice', title: 'Grant ending soon', related_table: 'user_role_grants', related_id: 'a', read_at: '2026-11-01' }],
} }))

const today = lagosToday()
const end = days => shiftScorecardDate(today, days) + 'T22:59:59Z'
const users = [{ id: 'worker', full_name: 'Site Worker', role: 'ico' }]
const grant = (id, role, expires_at) => ({ id, user_id: 'worker', role, expires_at, granted_at: end(-10), granted_by_name: 'Managing Director' })
const manager = () => render(<RoleGrantsManager users={users} />)
const click = element => fireEvent.click(element)
const change = (element, value) => fireEvent.change(element, { target: { value } })
const rpc = () => f.calls.filter(call => call.rpc === 'extend_role_grant')

beforeEach(() => {
  f.calls.length = 0
  f.grants = [grant('c', 'hr_officer', null), grant('b', 'bdm', end(14)), grant('a', 'accountant', end(3))]
  f.events = []
  f.error = null
})
afterEach(cleanup)

it('sorts finite grants first and displays Lagos expiry dates, warning colours, and no end date', async () => {
  manager()
  const urgent = await screen.findByText('3 days left')
  expect(urgent).toHaveStyle({ color: theme.red })
  expect(screen.getByText('14 days left')).toHaveStyle({ color: theme.accent })
  expect(screen.getByText(fmtDay(end(3)))).toBeInTheDocument()
  const grantRows = within(screen.getByRole('table')).getAllByRole('row').slice(1)
  expect(grantRows[0]).toHaveTextContent('Accountant')
  expect(grantRows[1]).toHaveTextContent('BDM')
  expect(grantRows[2]).toHaveTextContent('No end date')
  expect(within(grantRows[2]).queryByRole('button', { name: 'Extend' })).not.toBeInTheDocument()
  expect(f.calls.find(call => call.table === 'user_role_grants').ops).toContainEqual(['order', 'expires_at', { ascending: true, nullsFirst: false }])
})

it('defaults +90 days, blocks dates through the current end, and refreshes after saving Lagos end of day', async () => {
  f.grants = [f.grants[2]]
  manager()
  click(await screen.findByRole('button', { name: 'Extend' }))
  const field = screen.getByLabelText('New end date')
  const submit = screen.getByRole('button', { name: 'Save' })
  const newDate = shiftScorecardDate(today, 93)
  expect(field).toHaveValue(newDate)
  expect(field).toHaveAttribute('min', shiftScorecardDate(today, 4))
  for (const days of [2, 3]) {
    change(field, shiftScorecardDate(today, days))
    expect(submit).toBeDisabled()
  }
  expect(rpc()).toHaveLength(0)
  change(field, newDate)
  change(screen.getByLabelText('Note (optional)'), 'Cover annual leave')
  click(submit)
  await waitFor(() => expect(rpc()[0]?.args).toEqual({
    p_grant_id: 'a', p_new_expires_at: newDate + 'T23:59:59+01:00', p_note: 'Cover annual leave',
  }))
  expect(await screen.findByText('93 days left')).toBeInTheDocument()
})

it('shows the extension error verbatim and keeps the new date and note', async () => {
  f.grants = [f.grants[2]]
  f.error = { message: 'This grant has ended.' }
  manager()
  click(await screen.findByRole('button', { name: 'Extend' }))
  change(screen.getByLabelText('Note (optional)'), 'Cover leave')
  click(screen.getByRole('button', { name: 'Save' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('This grant has ended.')
  expect(screen.getByLabelText('Note (optional)')).toHaveValue('Cover leave')
})

it('shows extension, warning and ending events in readable history', async () => {
  f.grants = [f.grants[2]]
  f.events = [
    { id: '1', action: 'extended', old_expires_at: end(3), new_expires_at: end(93), actor_name: 'Managing Director', note: 'Leave cover', created_at: end(0) },
    { id: '2', action: 'warned_3', created_at: end(-1) },
    { id: '3', action: 'warned_14', created_at: end(-2) },
    { id: '4', action: 'ended_notice', created_at: end(-3) },
  ]
  manager()
  click(await screen.findByRole('button', { name: 'History' }))
  expect(await screen.findByText('Extended from ' + fmtDay(end(3)) + ' to ' + fmtDay(end(93)) + ' by Managing Director — Leave cover')).toBeInTheDocument()
  for (const label of ['Warned 3 days', 'Warned 14 days', 'Ended notice']) expect(screen.getByText(label)).toBeInTheDocument()
  expect(f.calls.find(call => call.table === 'role_grant_events').ops).toEqual(expect.arrayContaining([
    ['eq', 'grant_id', 'a'], ['order', 'created_at', { ascending: false }],
  ]))
})

it('shows read-only access and expiry hints for current grants', async () => {
  render(<div data-ico-view="true"><MyAccess userId="worker" /></div>)
  const access = within(await screen.findByRole('region', { name: 'My access' }))
  expect(access.getByText('HR Officer')).toBeInTheDocument()
  expect(access.getAllByText('Ask the MD if you still need it')).toHaveLength(2)
  expect(access.queryByRole('button')).not.toBeInTheDocument()
  expect(f.calls.find(call => call.table === 'user_role_grants').ops).toEqual(expect.arrayContaining([
    ['eq', 'user_id', 'worker'], ['is', 'revoked_at', null],
    ['or', expect.stringMatching(/^expires_at\.is\.null,expires_at\.gt\./)],
  ]))
})

it('hides My access when there are no grants', async () => {
  f.grants = []
  render(<MyAccess userId="worker" />)
  await waitFor(() => expect(f.calls.some(call => call.table === 'user_role_grants')).toBe(true))
  expect(screen.queryByRole('region', { name: 'My access' })).not.toBeInTheDocument()
})

it.each([['md', 'user_management'], ['ico', 'my_profile']])('routes a grant notification for %s', async (role, page) => {
  const navigate = vi.fn()
  render(<NotificationBell userProfile={{ id: role, role }} onNavigate={navigate} />)
  click(screen.getByTitle('Notifications'))
  click(await screen.findByText('Grant ending soon'))
  expect(navigate).toHaveBeenCalledWith(page, 'a')
})

it('formats acronyms and multi-word roles', () => {
  for (const [role, label] of Object.entries({ md: 'MD', ico: 'ICO', bdm: 'BDM', hr_officer: 'HR Officer',
    assistant_production_manager: 'Assistant Production Manager' })) expect(roleLabel(role)).toBe(label)
})
