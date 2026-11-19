import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import MyTasks, { StaffTasks, TaskReminder, useTaskReminders } from './MyTasks'
import NotificationBell from '../NotificationBell'
import { lagosToday } from '../../utils/lateEntry'
import { theme } from '../site/siteUi'

const f = vi.hoisted(() => ({ calls: [], tasks: [], error: null }))
vi.mock('../../lib/supabase', async () => {
  const { createSupabaseMock } = await import('../../test/supabaseMock')
  const mock = createSupabaseMock(table => {
    if (table === 'rpc:list_staff_tasks') return { data: f.tasks, error: f.error }
    if (table === 'user_profiles') return { data: [{ id: 'worker', full_name: 'Site Worker' }], error: null }
    return { data: 'saved', error: null }
  })
  f.calls = mock.calls
  return { supabase: mock.supabase }
})
vi.mock('../../services/notifications', () => ({ notificationsService: {
  getUnreadCount: async () => 0,
  getRecent: async () => [{ id: 'notice', title: 'Task reminder', related_table: 'staff_tasks', related_id: 'task', read_at: '2026-11-01' }],
} }))

const worker = { id: 'worker', role: 'ico' }
const md = { id: 'md', role: 'md' }
const task = { id: 'task', title: 'Check diesel stock', assigned_to: 'worker', assigned_to_name: 'Site Worker',
  kind: 'manual', status: 'open', due_on: '2026-12-04', progress_text: '1 of 2 still open. Due 4 Dec.',
  progress: { remaining: 1, total: 2 },
  checklist: [{ key: 'i1', label: 'Count litres', done: false }, { key: 'i2', label: 'Check the log', done: true, done_by: 'Site Worker' }],
}
const rpc = name => f.calls.filter(call => call.rpc === name).map(call => call.args)
const click = element => fireEvent.click(element)
const change = (element, value) => fireEvent.change(element, { target: { value } })
const source = rows => ({ rows, refresh: async () => {} })
beforeEach(() => { f.calls.length = 0; f.tasks = []; f.error = null })
afterEach(cleanup)

it('shows progress, checks an item and opens a payment request without checklist controls', async () => {
  const open = vi.fn()
  const { rerender } = render(<MyTasks userProfile={worker} source={source([task])} onPaymentRequest={open} />)
  expect(screen.getByText(task.progress_text)).toBeInTheDocument()
  click(screen.getByRole('checkbox', { name: 'Count litres' }))
  await waitFor(() => expect(rpc('tick_staff_task_item')).toEqual([{ p_task_id: 'task', p_key: 'i1', p_done: true }]))
  rerender(<MyTasks userProfile={worker} source={source([{ ...task, id: 'closure', kind: 'pr_closure', open_requests: [
    { id: 'abc', reference: 'PR-FUEL', amount: 50000, has_receipt: true, purpose: 'Diesel' },
  ] }])} onPaymentRequest={open} />)
  expect(screen.queryByRole('checkbox', { name: 'Count litres' })).not.toBeInTheDocument()
  expect(screen.getByText('Receipt attached')).toBeInTheDocument()
  click(screen.getByRole('button', { name: /PR-FUEL/ }))
  expect(open).toHaveBeenCalledWith('abc')
})

it('lets an assignee send a returned and completed checklist to the MD', async () => {
  render(<MyTasks userProfile={worker} source={source([{ ...task, checklist: task.checklist.map(item => ({ ...item, done: true })) }])} />)
  click(screen.getByRole('button', { name: 'Send to MD' }))
  change(screen.getByLabelText('Note (optional)'), 'Updated')
  click(screen.getAllByRole('button', { name: 'Send to MD' }).at(-1))
  await waitFor(() => expect(rpc('submit_staff_task')).toEqual([{ p_task_id: 'task', p_note: 'Updated' }]))
})

function OtherPage() {
  const reminders = useTaskReminders(worker.id)
  return <><TaskReminder tasks={reminders.rows} userId={worker.id} onView={() => {}} /><h2>Another page</h2></>
}

it('shows the overdue reminder above other content and refreshes when the tab becomes visible', async () => {
  f.tasks = [{ ...task, overdue: true }]
  render(<OtherPage />)
  const banner = await screen.findByRole('complementary', { name: 'Open task reminder' })
  expect(banner).toHaveTextContent('You have 1 open task from the MD')
  expect(banner).toHaveStyle({ color: theme.red })
  expect(screen.getByText('Another page')).toBeInTheDocument()
  f.tasks = [{ ...task, status: 'submitted' }]
  fireEvent(document, new Event('visibilitychange'))
  await waitFor(() => expect(screen.queryByRole('complementary')).not.toBeInTheDocument())
})

it.each(['empty', 'submitted', 'error'])('hides the reminder for %s results', async outcome => {
  if (outcome === 'error') f.error = { message: 'Unavailable' }
  if (outcome === 'submitted') f.tasks = [{ ...task, status: 'submitted' }]
  render(<OtherPage />)
  await waitFor(() => expect(rpc('list_staff_tasks')).toHaveLength(1))
  expect(screen.queryByRole('complementary')).not.toBeInTheDocument()
  expect(screen.queryByText('Unavailable')).not.toBeInTheDocument()
})

it('lets the MD confirm, return and cancel with required notes where applicable', async () => {
  render(<StaffTasks userProfile={md} source={source([{ ...task, status: 'submitted' }])} />)
  click(screen.getByRole('button', { name: 'Confirm' }))
  await waitFor(() => expect(rpc('review_staff_task')[0]).toEqual({ p_task_id: 'task', p_action: 'confirm', p_note: null }))
  for (const action of ['Return', 'Cancel']) {
    const button = screen.getByRole('button', { name: action });
    await waitFor(() => expect(button).toBeEnabled())
    click(button)
    const confirm = screen.getByRole('button', { name: action + ' task' })
    expect(confirm).toBeDisabled()
    change(screen.getByLabelText(action === 'Return' ? 'Note' : 'Reason'), 'Needs checking')
    click(confirm)
  }
  await waitFor(() => expect(rpc('review_staff_task').slice(1)).toEqual([
    { p_task_id: 'task', p_action: 'return', p_note: 'Needs checking' },
    { p_task_id: 'task', p_action: 'cancel', p_note: 'Needs checking' },
  ]))
})

it('creates a task with checklist items and refuses a past due date', async () => {
  render(<StaffTasks userProfile={md} source={source([])} />)
  click(screen.getByRole('button', { name: 'New task' }))
  const form = within(screen.getByRole('form', { name: 'New task' }))
  const option = await form.findByRole('option', { name: 'Site Worker' })
  change(option.parentElement, option.value)
  change(form.getByLabelText('Title'), 'Stock check')
  change(form.getByLabelText('Due date'), '2000-01-01')
  expect(form.getByRole('button', { name: 'Create task' })).toBeDisabled()
  change(form.getByLabelText('Due date'), lagosToday())
  click(form.getByRole('button', { name: 'Add checklist item' }))
  change(form.getByLabelText('Checklist item 1'), 'Count stock')
  click(form.getByRole('button', { name: 'Create task' }))
  await waitFor(() => expect(rpc('create_staff_task')[0]).toMatchObject({
    p_assigned_to: 'worker', p_title: 'Stock check', p_checklist: ['Count stock'], p_due_on: lagosToday(), p_kind: 'manual',
  }))
})

it.each([['ico', 'my_profile'], ['md', 'staff_tasks']])('routes a task notification for %s', async (role, page) => {
  const navigate = vi.fn()
  render(<NotificationBell userProfile={{ id: role, role }} onNavigate={navigate} />)
  click(screen.getByTitle('Notifications'))
  click(await screen.findByText('Task reminder'))
  expect(navigate).toHaveBeenCalledWith(page, 'task')
})

it('makes finished history available when an assignee has no active tasks', async () => {
  f.tasks = [{ ...task, status: 'done' }]
  render(<MyTasks userProfile={worker} source={{ ...source([]), loaded: true }} />)
  const toggle = await screen.findByRole('checkbox', { name: 'Show finished tasks' })
  expect(screen.queryByText(task.title)).not.toBeInTheDocument()
  click(toggle)
  expect(await screen.findByText(task.title)).toBeInTheDocument()
  expect(rpc('list_staff_tasks')).toContainEqual({ p_include_closed: true })
})
