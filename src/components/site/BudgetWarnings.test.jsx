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
    if (table === 'rpc:close_explained_exceptions') {
      const lines = f.rows.filter(line => line.status === 'explained' && (!ops.p_site_id || line.site_id === ops.p_site_id))
      lines.forEach(line => { line.status = 'closed' })
      return { data: lines.length, error: null }
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
    { ...common, id: 'cement', parameter: 'cement', kind: 'cost', message: 'Cement: 2 bags too many.', value_naira: 24000, actual_qty: 27, actual_rate: 25.6, budget_rate: 40, variance_pct: 56.5, direction: 'over' },
    { ...common, id: 'diesel', parameter: 'diesel', kind: 'cost', message: 'Diesel: 3 L too many.', actual_qty: 13, actual_rate: 18.8, budget_rate: 20, variance_pct: -5.8, direction: 'under' },
    { ...common, id: 'broken', parameter: 'breakage', kind: 'cost', message: 'Breakage: 5 blocks too many.', actual_qty: 7, actual_rate: 1.01, budget_rate: 1, variance_pct: 1, direction: 'over' },
    { ...common, id: 'kado-cement', site_id: 'kado', date: '2026-11-17', parameter: 'cement', status: 'explained' },
    { ...common, id: 'kado-diesel', site_id: 'kado', parameter: 'diesel' },
    { ...common, id: 'life-explained', parameter: 'cement', status: 'explained' },
  ]
})
afterEach(cleanup)
const renderWithSite = node => render(<AssignedSiteProvider>{node}</AssignedSiteProvider>)
const mount = (role, initial, onCorrect) => renderWithSite(<BudgetWarnings userProfile={{ role }} initial={initial} onCorrect={onCorrect} />)
const click = async name => fireEvent.click(await screen.findByRole('button', { name, exact: true }))
const change = (node, value) => fireEvent.change(node, { target: { value } })
const last = () => f.calls.filter(call => call.rpc === 'respond_production_exception').at(-1)?.args

it('limits the initial list to open warnings at the assigned site and validates explanations', async () => {
  f.rows = f.rows.filter(row => row.id !== 'life-explained')
  mount('assistant_production_manager')
  expect(await screen.findByText('Life Camp', { exact: true })).toBeInTheDocument()
  await click('Explain')
  expect(screen.queryByRole('button', { name: 'Close', exact: true })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Ask a question' })).not.toBeInTheDocument()
  await click('Mixer problem')
  await click('Torn or wet bags')
  await click('Generator ran for other work')
  expect(screen.getByRole('button', { name: 'Send explanation' })).toBeDisabled()
  await click('Machine problem')
  change(screen.getByLabelText('Anything else? (optional)'), 'The mixer is fixed.')
  await click('Send explanation')
  await waitFor(() => expect(last()).toEqual({ p_id: 'cement', p_action: 'explain', p_text: 'Cement: Mixer problem; Torn or wet bags\nDiesel: Generator ran for other work\nProduction breakage: Machine problem\nNote: The mixer is fixed.' }))
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
  expect(await screen.findByText('Cement: 2 bags too many.')).toBeInTheDocument()
  expect(screen.getByText('Diesel: 3 L too many.')).toBeInTheDocument()
  expect(screen.getByText('Breakage: 5 blocks too many.')).toBeInTheDocument()
  expect(screen.getAllByText('Too much')[0]).toHaveStyle({ color: theme.red })
  expect(screen.getByText('Extra cost: ₦24,000')).toBeInTheDocument()
  expect(screen.getByRole('article')).not.toHaveTextContent('%')
  expect(screen.getAllByRole('article')).toHaveLength(1)
  f.rows.push({ ...f.rows[0], id: 'yesterday', date: '2026-11-17' })
  await click('Explain'); await click('Back to warnings')
  await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(2))
})

it('shows site counts and links, and shows MD review totals', async () => {
  const onOpen = vi.fn()
  const own = renderWithSite(<BudgetWarningDashboardCards userProfile={{ role: 'assistant_production_manager' }} onOpen={onOpen} />)
  expect(await screen.findByText('Please explain: 1 day')).toBeInTheDocument()
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
  const variance = await screen.findByLabelText(/Warn when more than this/)
  const breakage = screen.getByLabelText(/Production breakage allowed/)
  const save = screen.getByRole('button', { name: 'Save Life Camp' })
  change(variance, '0'); expect(save).toBeDisabled()
  change(variance, '51'); expect(save).toBeDisabled()
  change(variance, '50')
  change(breakage, '-1'); expect(save).toBeDisabled()
  change(breakage, '21'); expect(save).toBeDisabled()
  change(breakage, '0'); expect(save).toBeEnabled()
  for (const [label, invalid, valid] of [
    [/Warn when cement/, '0', '12'], [/cement differences/, '51', '4'],
    [/diesel differences/, '101', '0'], [/Ignore breakage/, '-1', '100'],
  ]) {
    const input = screen.getByLabelText(label)
    change(input, invalid); expect(save).toBeDisabled()
    change(input, valid); expect(save).toBeEnabled()
  }
  fireEvent.click(save)
  await screen.findByText('Settings saved.')
  expect(f.calls.flatMap(call => call.ops || []).find(op => op[0] === 'update')[1])
    .toEqual({ variance_tolerance_pct: 50, cement_under_tolerance_pct: 12, warn_min_cement_bags: 4, warn_min_diesel_l: 0, warn_min_breakage_blocks: 100, production_breakage_pct: 0, stacking_breakage_pct: 1, loading_breakage_pct: 0.5, offloading_breakage_pct: 0.5, material_cost_budget_per_block: null })
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
  expect(detail.getByText('Cleared: Cement')).toBeInTheDocument()
  expect(detail.getByText('Threshold exceeded').compareDocumentPosition(detail.getByText('Later diesel comment')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  await click('Generator ran for other work')
  await click('Machine problem')
  await click('Send explanation')
  await waitFor(() => expect(last()).toMatchObject({ p_id: 'diesel', p_action: 'explain' }))
})

it('filters tabs by grouped day status', async () => {
  f.assignment = null
  mount('md')
  await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(2))
  await click('To review')
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

it('requires a ten-character note for Other and opens correction without responding', async () => {
  const onCorrect = vi.fn()
  f.rows = f.rows.filter(row => row.id !== 'life-explained')
  mount('assistant_production_manager', { id: 'cement', action: 'explain' }, onCorrect)
  await click('Mixer problem')
  await click('Generator ran for other work')
  fireEvent.click(screen.getAllByRole('button', { name: 'Other' })[2])
  const send = screen.getByRole('button', { name: 'Send explanation' })
  const note = screen.getByLabelText('Tell us what happened')
  expect(send).toBeDisabled()
  change(note, 'Short')
  expect(send).toBeDisabled()
  change(note, 'A pallet tipped over.')
  expect(send).toBeEnabled()
  await click('I recorded it wrong')
  expect(onCorrect).toHaveBeenCalledWith({ siteId: 'life', date: common.date })
  expect(last()).toBeUndefined()
})

it.each([['kado', '1 day'], [null, '2 days']])('bulk closes explained lines for %s and reports %s', async (site, count) => {
  f.assignment = null
  f.rows.push({ ...f.rows[3], id: 'extra-line', parameter: 'diesel' })
  f.rows.find(row => row.id === 'life-explained').date = '2026-11-16'
  mount('md', { siteId: site, status: 'explained' })
  await click('Close all explained (' + count + ')')
  expect(screen.getByText('Close the explained warnings for ' + count + ' at ' + (site ? 'Kado' : 'all sites') + '?')).toBeInTheDocument()
  change(screen.getByLabelText('Note (optional)'), 'Reviewed today')
  await click('Yes, close them')
  expect(await screen.findByText('Closed warnings for ' + count + '.')).toBeInTheDocument()
  expect(f.calls.find(call => call.rpc === 'close_explained_exceptions').args).toEqual({ p_site_id: site, p_note: 'Reviewed today' })
})

it('hides cleared lines behind a summary and keeps bulk close away from the site manager', async () => {
  f.rows[1].status = 'resolved'
  f.rows[2].status = 'resolved'
  mount('assistant_production_manager')
  expect(await screen.findByText('Cleared: Diesel, Production breakage')).toBeInTheDocument()
  expect(screen.queryByText('Diesel: 3 L too many.')).not.toBeInTheDocument()
  await click('To review')
  expect(screen.queryByRole('button', { name: /Close all explained/ })).not.toBeInTheDocument()
})

it.each([
  ['breakage', ['Machine problem', 'Weak mix', 'Operator', 'Other']],
  ['stacking_breakage', ['Rough handling', 'Pallets', 'Uneven ground', 'Other']],
  ['loading_breakage', ['Rough loading', 'Truck packing', 'Other']],
  ['offloading_breakage', ['Rough offloading', 'Uneven ground at the client', 'Other']],
])('uses the right reason chips for %s', async (parameter, reasons) => {
  f.rows = [{ ...common, id: 'type', parameter, kind: 'cost', message: 'Broken blocks need an explanation.' }]
  mount('assistant_production_manager')
  await click('Explain')
  for (const reason of reasons) expect(await screen.findByRole('button', { name: reason, exact: true })).toBeInTheDocument()
  await click(reasons[0])
  await click('Send explanation')
  await waitFor(() => expect(last().p_text).toContain(reasons[0]))
})
it('shows four independent allowance defaults, validates each 0–20 and saves all four', async () => {
  render(<BudgetWarningSettings userProfile={{ role: 'md' }} />)
  const labels = [/Production breakage allowed/, /Stacking breakage allowed/, /Loading breakage allowed/, /Offloading breakage allowed/]
  const defaults = [2, 1, 0.5, 0.5]
  const save = await screen.findByRole('button', { name: 'Save Life Camp' })
  for (let i = 0; i < labels.length; i++) {
    const input = screen.getByLabelText(labels[i])
    expect(input).toHaveValue(defaults[i])
    expect(input).toHaveAttribute('min', '0'); expect(input).toHaveAttribute('max', '20')
    change(input, '-1'); expect(save).toBeDisabled()
    change(input, '20.1'); expect(save).toBeDisabled()
    change(input, String(i)); expect(save).toBeEnabled()
  }
  expect(screen.queryByLabelText(/^Breakage allowed/)).toBeNull()
  fireEvent.click(save)
  await screen.findByText('Settings saved.')
  const payload = f.calls.flatMap(c => c.ops || []).find(o => o[0] === 'update')[1]
  expect(payload).toMatchObject({ production_breakage_pct: 0, stacking_breakage_pct: 1, loading_breakage_pct: 2, offloading_breakage_pct: 3 })
  expect(payload).not.toHaveProperty('breakage_budget_pct')
  const columns = f.calls.find(c => c.table === 'production_sites' && c.ops.some(o => o[0] === 'maybeSingle')).ops.find(o => o[0] === 'select')[1]
  expect(columns).not.toContain('breakage_budget_pct')
  for (const key of ['production_breakage_pct','stacking_breakage_pct','loading_breakage_pct','offloading_breakage_pct']) expect(columns).toContain(key)
})
