import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import App, { ROLE_PAGES } from '../../App'
import StockCountPage, { CountDetail, CountForm, StockCountDashboard } from './StockCounts'
import NotificationBell from '../NotificationBell'
import { lagosToday } from '../../utils/lateEntry'
import { shiftScorecardDate } from '../../utils/siteScorecard'

const f = vi.hoisted(() => ({ calls: [], count: null, sheet: null, waiting: 0, matching: [], reviewError: null, role: 'ico', notificationCount: false }))
vi.mock('pdfjs-dist', () => ({ GlobalWorkerOptions: {} }))
vi.mock('../../lib/supabase', async () => {
  const { createSupabaseMock } = await import('../../test/supabaseMock')
  const mock = createSupabaseMock((table, args) => {
    const profile = { id: 'worker', role: f.role, full_name: 'Site Worker', is_active: true }
    if (table === 'rpc:my_assigned_site') return { data: null }
    if (table === 'rpc:my_effective_roles') return { data: [f.role] }
    if (table === 'rpc:stock_count_sheet') return { data: f.sheet }
    if (table === 'rpc:submit_stock_count') return { data: 'count' }
    if (table === 'rpc:review_stock_count') return { data: null, error: f.reviewError }
    if (table === 'user_profiles') return { data: profile }
    if (table === 'production_sites') return { data: [{ id: 'kado', name: 'Kado Site', day_status_from: '2026-11-01' }] }
    if (table === 'stock_counts') {
      if (args.some(op => op[2]?.head)) return { count: f.waiting }
      if (args.some(op => op[0] === 'maybeSingle')) return { data: f.count }
      if (args.some(op => op[0] === 'gte')) return { data: f.matching }
      return { data: [f.count] }
    }
    return { data: [] }
  })
  f.calls = mock.calls
  return { supabase: { ...mock.supabase, auth: {
    getSession: async () => ({ data: { session: { user: { id: 'worker' }, expires_at: Math.floor(Date.now() / 1000) + 3600 } } }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
  } } }
})
vi.mock('../../services/notifications', () => ({ notificationsService: {
  getUnreadCount: async () => 0,
  getRecent: async () => [{ id: 'notice', title: 'Stock count reminder', related_table: 'stock_counts', related_id: f.notificationCount ? 'count' : null, read_at: '2026-11-01' }],
} }))

const today = lagosToday()
const sheet = { site_id: 'kado', site_name: 'Kado Site', has_approved_count: false, items: [
  { item_id: 'dust', name: 'Dust', unit: 'kg', owner: 'apcl', system_qty: 59091026 },
  { item_id: 'cement', name: 'Cement', unit: 'bags', owner: 'client' },
] }
const detail = { id: 'count', site_id: 'kado', count_date: today, is_opening: true, status: 'submitted',
  counted_by_name: 'Site Worker', notes: 'Physical count', lines: [
    { id: 'line', item: { name: 'Dust', unit: 'kg', owner: 'apcl' }, counted_qty: 30440, system_qty: 28000,
      variance_qty: 2440, variance_pct: 8.7, variance_value: 43000, over_tolerance: true, note: 'Weighed' },
    { id: 'client', item: { name: 'Cement', unit: 'bags', owner: 'client' }, counted_qty: 3, system_qty: 4, variance_qty: -1, variance_pct: -25, variance_value: 7000 },
  ],
}
const rpc = name => f.calls.filter(call => call.rpc === name).map(call => call.args)
const click = element => fireEvent.click(element)
const change = (element, value) => fireEvent.change(element, { target: { value } })
const fill = () => {
  change(screen.getByLabelText('Counted Dust (tonnes)'), '30.44')
  change(screen.getByLabelText('Counted Cement (bags)'), '0')
}
beforeEach(() => {
  f.calls.length = 0; f.count = detail; f.sheet = sheet; f.waiting = 0; f.matching = []; f.reviewError = null; f.role = 'ico'; f.notificationCount = false
})
afterEach(cleanup)

it('keeps the form blind, requires every number, defaults opening, and converts tonnes to kilograms', async () => {
  const saved = vi.fn()
  const { rerender } = render(<CountForm sheet={sheet} onSaved={saved} />)
  expect(screen.getByRole('checkbox', { name: 'Opening count' })).toBeChecked()
  expect(screen.queryByText(/App figure|59,091,026/)).not.toBeInTheDocument()
  const submit = screen.getByRole('button', { name: 'Submit count' })
  expect(submit).toBeDisabled()
  change(screen.getByLabelText('Counted Dust (tonnes)'), '30.44')
  expect(submit).toBeDisabled()
  change(screen.getByLabelText('Counted Cement (bags)'), '-1')
  expect(submit).toBeDisabled()
  fill()
  change(screen.getByLabelText(/Note for Dust/), 'Weighed')
  click(submit)
  await waitFor(() => expect(saved).toHaveBeenCalledWith('count'))
  expect(rpc('submit_stock_count')[0]).toEqual({
    p_site_id: 'kado', p_count_date: today, p_is_opening: true, p_notes: null,
    p_lines: [{ item_id: 'dust', counted_qty: 30440, note: 'Weighed' }, { item_id: 'cement', counted_qty: 0, note: null }],
  })
  rerender(<CountForm key="new-site" sheet={{ ...sheet, has_approved_count: true }} onSaved={saved} />)
  expect(screen.getByRole('checkbox', { name: 'Opening count' })).not.toBeChecked()
})

it('requires and sends the late reason for an older count', async () => {
  render(<CountForm sheet={sheet} onSaved={() => {}} />)
  fill()
  change(screen.getByLabelText('Count date'), shiftScorecardDate(today, -3))
  const submit = screen.getByRole('button', { name: 'Submit count' })
  expect(submit).toBeDisabled()
  change(screen.getByLabelText(/Why wasn't this recorded on time/), 'No internet at the site')
  click(submit)
  await waitFor(() => expect(rpc('submit_stock_count')[0]).toMatchObject({ p_late_reason: 'No internet at the site' }))
})

it('shows tonnes, signed differences, owned values, tolerance, and the opening warning', () => {
  render(<CountDetail count={detail} />)
  expect(screen.getByText('30.44 tonnes')).toBeInTheDocument()
  expect(screen.getByText('+2.44 tonnes')).toBeInTheDocument()
  expect(screen.getByText('₦43,000')).toBeInTheDocument()
  expect(screen.queryByText('₦7,000')).not.toBeInTheDocument()
  expect(screen.getByText('Outside tolerance')).toBeInTheDocument()
  expect(screen.getByText(/Opening count — these differences/)).toBeInTheDocument()
})

it('requires a rejection reason and submits both MD actions, showing a server error in full', async () => {
  f.reviewError = { message: 'Record production or the day status before approving.' }
  const reviewed = vi.fn()
  render(<CountDetail count={detail} canReview onReviewed={reviewed} />)
  click(screen.getByRole('button', { name: 'Approve', exact: true }))
  click(screen.getByRole('button', { name: 'Approve count' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(f.reviewError.message)
  expect(rpc('review_stock_count')[0]).toEqual({ p_count_id: 'count', p_action: 'approve', p_note: null })
  click(screen.getByRole('button', { name: 'Cancel' }))
  f.reviewError = null
  click(screen.getByRole('button', { name: 'Reject', exact: true }))
  const reject = screen.getByRole('button', { name: 'Reject count' })
  expect(reject).toBeDisabled()
  change(screen.getByLabelText('Reason (required)'), 'Count the bags again')
  click(reject)
  await waitFor(() => expect(reviewed).toHaveBeenCalled())
  expect(rpc('review_stock_count')[1]).toEqual({ p_count_id: 'count', p_action: 'reject', p_note: 'Count the bags again' })
})

it('lets an ICO submit from the routed page without the read-only mask', async () => {
  expect(ROLE_PAGES.ico).toContain('stock_counts')
  render(<App />)
  click(await within(await screen.findByRole('navigation')).findByText('Stock Count'))
  expect(screen.getByRole('main')).not.toHaveAttribute('data-ico-view')
  click(await screen.findByRole('button', { name: 'Start count' }))
  await screen.findByRole('form', { name: 'Blind stock count' })
  expect(screen.queryByRole('region', { name: 'Recent counts' })).not.toBeInTheDocument()
  fill()
  click(screen.getByRole('button', { name: 'Submit count' }))
  expect(await screen.findByText('Sent to the MD for approval')).toBeInTheDocument()
  expect(await screen.findByRole('region', { name: 'Stock count detail' })).toBeInTheDocument()
})

it('gives a board member read-only history and opens a linked count', async () => {
  expect(ROLE_PAGES.board_member).toContain('stock_counts')
  render(<StockCountPage userProfile={{ role: 'board_member' }} initial={{ id: 'count' }} />)
  expect(await screen.findByRole('region', { name: 'Stock count detail' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /Start count|Approve|Reject/ })).not.toBeInTheDocument()
  expect(rpc('stock_count_sheet')).toEqual([])
})

it.each([null, 'count'])('routes stock count notifications with related ID %s', async id => {
  f.notificationCount = Boolean(id)
  const open = vi.fn()
  render(<NotificationBell userProfile={{ id: 'worker', role: 'ico' }} onNavigate={open} />)
  click(screen.getByTitle('Notifications'))
  click(await screen.findByText('Stock count reminder'))
  expect(open).toHaveBeenCalledWith('stock_counts', id)
})

it('hides zero reminders and shows pending and due reminders when needed', async () => {
  f.matching = [{ site_id: 'kado' }]
  const open = vi.fn()
  const { rerender } = render(<StockCountDashboard userProfile={{ role: 'md', effectiveRoles: ['md', 'ico'] }} today="2026-11-20" onOpen={open} />)
  await waitFor(() => expect(f.calls.filter(call => call.table === 'stock_counts')).toHaveLength(2))
  expect(screen.queryByRole('region')).not.toBeInTheDocument()
  f.waiting = 2
  f.matching = []
  rerender(<StockCountDashboard userProfile={{ role: 'md', effectiveRoles: ['md', 'ico'] }} today="2026-11-21" onOpen={open} />)
  click(await screen.findByRole('button', { name: '2 stock counts waiting for approval' }))
  expect(screen.getByRole('button', { name: 'Stock count due: Kado Site' })).toBeInTheDocument()
  expect(open).toHaveBeenCalled()
  const week = f.calls.filter(call => call.table === 'stock_counts' && call.ops.some(op => op[0] === 'gte')).at(-1)
  expect(week.ops).toContainEqual(['gte', 'count_date', '2026-11-16'])
})
