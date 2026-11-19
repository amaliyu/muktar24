import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import BudgetWarnings, { BudgetWarningDashboardCards } from './BudgetWarnings'
import BudgetWarningSettings from './BudgetWarningSettings'
import RequisitionBudget from './RequisitionBudget'
import { AssignedSiteProvider } from '../AssignedSite'
import { theme } from './siteUi'
import { groupWarningDays, warningWindowStart } from '../../utils/productionExceptions'

const f = vi.hoisted(() => ({ assignment: 'life', rows: [], calls: [] }))
vi.mock('../../lib/supabase', async () => {
  const { createSupabaseMock } = await import('../../test/supabaseMock')
  const mock = createSupabaseMock((table, ops) => {
    if (table === 'rpc:my_assigned_site') return { data: f.assignment, error: null }
    if (table === 'rpc:respond_production_exception') {
      const statuses = { ask: 'open', explain: 'explained', close: 'closed' }
      const row = f.rows.find(row => row.id === ops.p_id)
      f.rows.filter(line => line.site_id === row.site_id && line.date === row.date && line.status !== 'resolved').forEach(line => { line.status = statuses[ops.p_action] || line.status })
      return { data: { ...row }, error: null }
    }
    if (table === 'rpc:client_requisition_budget') return { data: ['dust', 'chippings'].map((material, i) => ({
      material, unit: 'kg', budget_full: 304600, requested: 301200, received: 189000, blocks_made: 690,
      budget_for_made: 180000, used_for_made: 198000, variance_pct: i ? -10 : 10,
    })), error: null }
    const rows = {
      production_exceptions: f.rows,
      production_sites: [{ id: 'life', name: 'Life Camp', site_type: 'client_site', is_active: true, variance_tolerance_pct: 5, breakage_budget_pct: 1 }],
      production_exception_comments: [{ id: 'later', exception_id: 'diesel', kind: 'comment', body: 'Later diesel comment', created_at: '2026-11-19T12:00:00Z' }, { id: 'system', exception_id: 'cement', kind: 'system', body: 'Threshold exceeded', created_at: '2026-11-19T10:00:00Z' }],
    }[table] || []
    const matches = rows.filter(row => ops.every(([kind, column, value]) => kind === 'eq' ? row[column] === value : kind === 'in' ? value.includes(row[column]) : true))
    if (table === 'production_exception_comments') matches.sort((a, b) => a.created_at.localeCompare(b.created_at))
    if (ops.some(op => op[0] === 'select' && op[2]?.head)) return { data: null, count: matches.length, error: null }
    return { data: ops.some(op => op[0] === 'maybeSingle') ? matches[0] || null : matches, error: null }
  })
  f.calls = mock.calls
  return { supabase: mock.supabase }
})
vi.mock('../SitePicker', () => {
  const sites = [{ id: 'life', name: 'Life Camp' }, { id: 'kado', name: 'Kado' }]
  return { useSites: () => ({ sites }), FixedSite: ({ siteId }) => <div>{sites.find(s => s.id === siteId)?.name}</div> }
})
const common = { site_id: 'life', status: 'open', date: '2026-11-18', blocks: 690 }
beforeEach(() => {
  f.assignment = 'life'; f.calls.length = 0
  f.rows = [
    { ...common, id: 'cement', parameter: 'cement', actual_qty: 27, actual_rate: 25.6, budget_rate: 40, variance_pct: 56.5, direction: 'over' },
    { ...common, id: 'diesel', parameter: 'diesel', actual_qty: 13, actual_rate: 18.8, budget_rate: 20, variance_pct: -5.8, direction: 'under' },
    { ...common, id: 'broken', parameter: 'breakage', actual_qty: 7, actual_rate: 1.01, budget_rate: 1, variance_pct: 1, direction: 'over' },
    { ...common, id: 'kado-cement', site_id: 'kado', date: '2026-11-17', parameter: 'cement', status: 'explained' },
    { ...common, id: 'kado-diesel', site_id: 'kado', parameter: 'diesel' },
    { ...common, id: 'life-explained', parameter: 'cement', status: 'explained' },
  ]
})
afterEach(cleanup)
const renderWithSite = node => render(<AssignedSiteProvider>{node}</AssignedSiteProvider>)
const mount = (role, initial) => renderWithSite(<BudgetWarnings userProfile={{ role }} initial={initial} />)
const click = async name => fireEvent.click(await screen.findByRole('button', { name, exact: true }))
const change = (node, value) => fireEvent.change(node, { target: { value } })
const last = () => f.calls.filter(call => call.rpc === 'respond_production_exception').at(-1)?.args

it('limits the initial list to open warnings at the assigned site and validates explanations', async () => {
  mount('assistant_production_manager')
  expect(await screen.findByText('Life Camp', { exact: true })).toBeInTheDocument()
  fireEvent.click((await screen.findAllByRole('button', { name: /View warning for/ }))[0])
  await click('Explain')
  expect(screen.queryByRole('button', { name: 'Close', exact: true })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Ask a question' })).not.toBeInTheDocument()
  const text = screen.getByRole('textbox', { name: 'Explain' })
  change(text, 'Too short')
  expect(screen.getByRole('button', { name: 'Send explanation' })).toBeDisabled()
  change(text, 'The cement mix was adjusted.')
  await click('Send explanation')
  await waitFor(() => expect(last()).toEqual({ p_id: 'cement', p_action: 'explain', p_text: 'The cement mix was adjusted.' }))
  expect(f.calls.find(call => call.table === 'production_exceptions' && call.ops.some(op => op[0] === 'gte')).ops)
    .toEqual(expect.arrayContaining([['eq', 'site_id', 'life'], ['gte', 'date', warningWindowStart()]]))
})

it.each(['md', 'ico'])('allows %s to ask and close with a note', async role => {
  f.assignment = null
  f.rows[0].status = 'resolved'
  f.rows = f.rows.filter(row => row.id !== 'life-explained')
  mount(role, { id: 'cement' })
  await click('Ask a question')
  change(screen.getByRole('textbox', { name: 'Ask a question' }), 'What caused the variance?')
  await click('Send question')
  await waitFor(() => expect(last()).toMatchObject({ p_id: 'diesel', p_action: 'ask' }))
  await click('Close')
  change(screen.getByRole('textbox', { name: /Closing note/ }), 'Checked the explanation.')
  await click('Close warning')
  await waitFor(() => expect(last()).toEqual({ p_id: 'diesel', p_action: 'close', p_text: 'Checked the explanation.' }))
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Ask a question' })).not.toBeInTheDocument())
})

it('shows the three production sentences and colors', async () => {
  mount('assistant_production_manager')
  expect(await screen.findByText('27 bags for 690 blocks — 25.6 per bag against 40 (+56.5%)')).toBeInTheDocument()
  expect(screen.getByText('13 L for 690 blocks — 18.8 L per 1,000 against 20 (−5.8%)')).toBeInTheDocument()
  expect(screen.getByText('7 broken of 690 — 1.01% against 1% allowed')).toBeInTheDocument()
  expect(screen.getByText('+56.5%', { exact: true })).toHaveStyle({ color: theme.red })
  expect(screen.getByText('−5.8%', { exact: true })).toHaveStyle({ color: theme.accent })
  expect(screen.getByText('+1%', { exact: true })).toHaveStyle({ color: theme.red })
  expect(screen.getAllByRole('article')).toHaveLength(1)
  f.rows.push({ ...f.rows[0], id: 'yesterday', date: '2026-11-17' })
  await click('View warning for 18 Nov 2026'); await click('Back to warnings')
  await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(2))
})

it('shows site counts and links, and shows MD review totals', async () => {
  const onOpen = vi.fn()
  const own = renderWithSite(<BudgetWarningDashboardCards userProfile={{ role: 'assistant_production_manager' }} onOpen={onOpen} />)
  expect(await screen.findByText('Budget warnings to explain: 1')).toBeInTheDocument()
  fireEvent.click(screen.getAllByRole('button', { name: 'Explain' })[0])
  expect(onOpen).toHaveBeenCalledWith({ id: 'cement', siteId: 'life', action: 'explain' })
  own.unmount()
  f.assignment = null
  renderWithSite(<BudgetWarningDashboardCards userProfile={{ role: 'md' }} onOpen={onOpen} />)
  expect(await screen.findByText('Budget warnings: 1 to review · 2 waiting for site managers')).toBeInTheDocument()
  await click('Needs review')
  expect(onOpen).toHaveBeenCalledWith({ status: 'explained' })
})

it('hides dashboard cards for an unassigned marketer', async () => {
  f.assignment = null
  renderWithSite(<BudgetWarningDashboardCards userProfile={{ role: 'marketing' }} />)
  await waitFor(() => expect(f.calls.some(call => call.rpc === 'my_assigned_site')).toBe(true))
  expect(screen.queryByText(/Budget warnings:/)).not.toBeInTheDocument()
  expect(f.calls.some(call => call.table === 'production_exceptions')).toBe(false)
})

it('renders budget RPC lines with tonnes and site tolerance colors', async () => {
  render(<RequisitionBudget id="req" siteId="life" />)
  const dust = within(await screen.findByRole('row', { name: /^Dust / }))
  const chips = within(screen.getByRole('row', { name: /^3\/8 / }))
  expect(dust.getByText('304.6 t')).toBeInTheDocument()
  expect(chips.getByText('304.6 t')).toBeInTheDocument()
  expect(dust.getByText('+10%')).toHaveStyle({ color: theme.red })
  expect(chips.getByText('−10%')).toHaveStyle({ color: theme.accent })
  expect(f.calls.find(call => call.rpc === 'client_requisition_budget').args).toEqual({ p_requisition_id: 'req' })
})

it('validates both settings and accepts inclusive maximum and zero breakage', async () => {
  render(<BudgetWarningSettings userProfile={{ role: 'md' }} />)
  const variance = await screen.findByLabelText(/Allowed variance/)
  const breakage = screen.getByLabelText(/Breakage allowed/)
  const save = screen.getByRole('button', { name: 'Save Life Camp' })
  change(variance, '0'); expect(save).toBeDisabled()
  change(variance, '51'); expect(save).toBeDisabled()
  change(variance, '50')
  change(breakage, '-1'); expect(save).toBeDisabled()
  change(breakage, '21'); expect(save).toBeDisabled()
  change(breakage, '0'); expect(save).toBeEnabled()
  fireEvent.click(save)
  await screen.findByText('Settings saved.')
  expect(f.calls.flatMap(call => call.ops || []).find(op => op[0] === 'update')[1])
    .toEqual({ variance_tolerance_pct: 50, breakage_budget_pct: 0, material_cost_budget_per_block: null })
})

it.each([
  ['open', 'explained', 'open'], ['explained', 'closed', 'explained'],
  ['closed', 'resolved', 'closed'], ['resolved', 'resolved', 'resolved'],
])('uses day precedence for %s and %s', (a, b, expected) => {
  const [day] = groupWarningDays([{ ...common, parameter: 'cement', status: a }, { ...common, parameter: 'diesel', status: b }])
  expect(day.status).toBe(expected)
})

it('opens mixed days from any line id, merges the thread, and responds through an active line', async () => {
  f.rows[0].status = 'resolved'
  f.rows = f.rows.filter(row => row.id !== 'life-explained')
  mount('assistant_production_manager', { id: 'cement', action: 'explain' })
  const detail = within(await screen.findByRole('region', { name: 'Budget warning detail' }))
  await detail.findByText('Later diesel comment')
  expect(detail.getByText('fixed by a correction')).toBeInTheDocument()
  expect(detail.getByText('Threshold exceeded').compareDocumentPosition(detail.getByText('Later diesel comment')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  change(detail.getByRole('textbox', { name: 'Explain' }), 'Diesel usage was higher today.')
  await click('Send explanation')
  await waitFor(() => expect(last()).toMatchObject({ p_id: 'diesel', p_action: 'explain' }))
})

it('filters tabs by grouped day status', async () => {
  f.assignment = null
  mount('md')
  await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(2))
  await click('Needs review')
  expect(screen.getAllByRole('article')).toHaveLength(1)
  expect(screen.getByRole('article')).toHaveTextContent('Kado')
  await click('All')
  expect(screen.getAllByRole('article')).toHaveLength(3)
})

it('saves a positive materials budget and blocks zero and negative values', async () => {
  render(<BudgetWarningSettings userProfile={{ role: 'md' }} />)
  const budget = await screen.findByLabelText(/Materials budget per block/)
  const save = screen.getByRole('button', { name: 'Save Life Camp' })
  for (const invalid of ['0', '-1']) {
    change(budget, invalid)
    expect(save).toBeDisabled()
  }
  change(budget, '791.29')
  fireEvent.click(save)
  await screen.findByText('Settings saved.')
  expect(f.calls.flatMap(call => call.ops || []).find(op => op[0] === 'update')[1])
    .toMatchObject({ material_cost_budget_per_block: 791.29 })
})
