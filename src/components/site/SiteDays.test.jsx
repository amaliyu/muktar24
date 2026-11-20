import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { SiteDayDashboard, SiteDayForm, SiteDayStrip } from './SiteDays'
import NotificationBell from '../NotificationBell'
import { AssignedSiteProvider } from '../AssignedSite'
import { lagosToday } from '../../utils/lateEntry'
import { shiftScorecardDate } from '../../utils/siteScorecard'

const f = vi.hoisted(() => ({ calls: [], overview: null, error: null }))
vi.mock('../../lib/supabase', async () => {
  const { createSupabaseMock } = await import('../../test/supabaseMock')
  const mock = createSupabaseMock(table => {
    if (table === 'rpc:site_day_overview') return { data: f.overview, error: f.error }
    if (table === 'rpc:my_assigned_site') return { data: 'site', error: null }
    return { data: table === 'rpc:record_site_day_status' ? 'status-id' : [], error: null }
  })
  f.calls = mock.calls
  return { supabase: mock.supabase }
})
vi.mock('../../services/notifications', () => ({ notificationsService: {
  getUnreadCount: async () => 0,
  getRecent: async () => [{ id: 'notice', title: 'Record yesterday', related_table: 'site_day_status', related_id: 'site', read_at: '2026-11-01' }],
} }))

const today = lagosToday()
const older = shiftScorecardDate(today, -3)
const status = { reason: 'breakdown', note: 'Belt broke', staff_worked: true, work_done: ['maintenance'], work_note: 'Checked motor', downtime_id: 'dt' }
const overview = {
  site_name: 'Kado Site', day_status_from: shiftScorecardDate(today, -14),
  days: [
    { date: today },
    { date: shiftScorecardDate(today, -1), has_production: true, blocks: 3420, missing_roster: true },
    { date: shiftScorecardDate(today, -2), status },
    { date: older, missing_record: true },
  ],
  totals: { missing_records: 1, missing_rosters: 1 },
}
const rpc = name => f.calls.filter(call => call.rpc === name).map(call => call.args)
const click = element => fireEvent.click(element)
const change = (element, value) => fireEvent.change(element, { target: { value } })
const form = (date = today, onSaved = vi.fn()) => render(<SiteDayForm siteId="site" siteName="Kado Site"
  initialDate={date} overview={overview} onSaved={onSaved} />)

beforeEach(() => { f.calls.length = 0; f.overview = overview; f.error = null })
afterEach(cleanup)

it('shows produced, no-production, missing, today and no-roster chips', () => {
  const open = vi.fn(), labour = vi.fn()
  render(<SiteDayStrip overview={overview} canWrite onOpen={open} onLabour={labour} />)
  expect(screen.getByText('3,420 blocks')).toBeInTheDocument()
  expect(screen.getByText('Today')).toBeInTheDocument()
  click(screen.getByRole('button', { name: /No production — Machine breakdown/ }))
  expect(open).toHaveBeenCalledWith(overview.days[2].date)
  expect(screen.getByText(/A downtime record was opened/)).toBeInTheDocument()
  click(screen.getByRole('button', { name: /Missing/ }))
  expect(open).toHaveBeenCalledWith(older)
  click(screen.getByRole('button', { name: 'No roster' }))
  expect(labour).toHaveBeenCalled()
})

it('requires explanation for Other, staff work details, and a late reason', async () => {
  form(older)
  const save = screen.getByRole('button', { name: 'Save' })
  click(screen.getByRole('radio', { name: 'Other' }))
  expect(save).toBeDisabled()
  change(screen.getByLabelText(/Reason note/), 'Access road was blocked')
  const late = screen.getByLabelText(/Why wasn't this recorded on time/)
  expect(save).toBeDisabled()
  change(late, 'Network was unavailable')
  expect(save).toBeEnabled()
  click(screen.getByRole('radio', { name: 'Yes' }))
  expect(save).toBeDisabled()
  click(screen.getByRole('checkbox', { name: 'Other' }))
  expect(save).toBeDisabled()
  change(screen.getByLabelText(/Work note/), 'Counted stock')
  click(save)
  await waitFor(() => expect(rpc('record_site_day_status')[0]).toEqual({
    p_site_id: 'site', p_on_date: older, p_reason: 'other', p_note: 'Access road was blocked',
    p_staff_worked: true, p_work_done: ['other'], p_work_note: 'Counted stock', p_late_reason: 'Network was unavailable',
  }))
})

it('sends an empty work array when staff did not work', async () => {
  form()
  click(screen.getByRole('radio', { name: 'Rain' }))
  click(screen.getByRole('radio', { name: 'Yes' }))
  click(screen.getByRole('checkbox', { name: 'Cleaning' }))
  click(screen.getByRole('radio', { name: 'No' }))
  click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(rpc('record_site_day_status')[0]).toEqual({
    p_site_id: 'site', p_on_date: today, p_reason: 'rain', p_note: null, p_staff_worked: false,
    p_work_done: [], p_work_note: null,
  }))
})

it('pre-fills an existing status and removes it only after confirmation', async () => {
  const date = overview.days[2].date
  form(date)
  expect(screen.getByRole('radio', { name: 'Machine breakdown' })).toBeChecked()
  expect(screen.getByLabelText(/Reason note/)).toHaveValue('Belt broke')
  expect(screen.getByRole('checkbox', { name: 'Maintenance' })).toBeChecked()
  expect(screen.getByRole('button', { name: 'Update' })).toBeInTheDocument()
  click(screen.getByRole('button', { name: 'Remove day status' }))
  expect(rpc('clear_site_day_status')).toEqual([])
  click(screen.getByRole('button', { name: 'Remove', exact: true }))
  await waitFor(() => expect(rpc('clear_site_day_status')).toEqual([{ p_site_id: 'site', p_on_date: date }]))
})

it('routes morning notifications to Production for the referenced site', async () => {
  const navigate = vi.fn()
  render(<NotificationBell userProfile={{ id: 'user', role: 'production_manager' }} onNavigate={navigate} />)
  click(screen.getByTitle('Notifications'))
  click(await screen.findByText('Record yesterday'))
  expect(navigate).toHaveBeenCalledWith('production', 'site')
})

it('shows dashboard counts and links to the selected site', async () => {
  const open = vi.fn()
  render(<AssignedSiteProvider><SiteDayDashboard userProfile={{ role: 'ico', effectiveRoles: ['ico', 'production_manager'] }} onProduction={open} /></AssignedSiteProvider>)
  click(await screen.findByRole('button', { name: '1 site day needs a record' }))
  expect(screen.getByRole('button', { name: '1 day without a labour roster' })).toBeInTheDocument()
  expect(open).toHaveBeenCalledWith('site')
})

it.each(['zero', 'error'])('keeps the dashboard clear on %s', async mode => {
  f.overview = { ...overview, totals: { missing_records: 0, missing_rosters: 0 } }
  if (mode === 'error') f.error = { message: 'Unavailable' }
  render(<AssignedSiteProvider><SiteDayDashboard userProfile={{ role: 'production_manager' }} /></AssignedSiteProvider>)
  await waitFor(() => expect(rpc('site_day_overview')).toHaveLength(1))
  expect(screen.queryByRole('region')).not.toBeInTheDocument()
  expect(screen.queryByText('Unavailable')).not.toBeInTheDocument()
})
