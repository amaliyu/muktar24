import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { AssignedSiteProvider } from '../AssignedSite'
import Scorecard, { ScorecardDashboard } from './SiteScorecard'
import { theme } from './siteUi'
import { lagosToday } from '../../utils/lateEntry'

const f = vi.hoisted(() => ({
  date: '2026-11-18',
  idle: false,
  sites: [
    { id: 'kado', code: 'KADO-SEQ', name: 'Kado Site (Sequoia)', site_type: 'client_site' },
    { id: 'life', code: 'LIFECAMP-BIL', name: 'Life Camp Site (Bilaad)', site_type: 'client_site' },
    { id: 'factory', code: 'DUTSE', name: 'Dutse Factory', site_type: 'factory' },
  ],
}))
const kado = {
  site_id: 'kado', site_name: f.sites[0].name, date: f.date, contract_model: 'full_supply',
  blocks_total: 1095, blocks_9in: 1095, blocks_6in: 0, dust_kg: 25185, chippings_kg: 0,
  cement: { bags: 26, blocks_per_bag: 42.115, budget_blocks_per_bag: 40, variance_pct: -5 },
  diesel: { litres: 22, per_1000: 20.09, budget_per_1000: 20, variance_pct: 0.46 },
  breakage: { blocks: 8, pct: 0.73, allowed_pct: 1 }, tolerance_pct: 5, open_warnings: 1,
  costs: {
    cement: 301600, dust: 428145, diesel: 43335, materials: 773080, materials_per_block: 706.01,
    materials_budget_per_block: 791.29, roster_recorded: false,
  },
}
const life = {
  ...kado, site_id: 'life', site_name: f.sites[1].name, contract_model: 'service_fee',
  open_warnings: 0,
  costs: { ...kado.costs, roster_recorded: true, workers: 8, labour: 48000, labour_per_block: 44, total: 48000, total_per_block: 44 },
}
vi.mock('../../lib/supabase', async () => {
  const { createSupabaseMock } = await import('../../test/supabaseMock')
  const mock = createSupabaseMock((table, args = {}) => {
    const data = {
      'rpc:my_assigned_site': f.assignment,
      'rpc:site_daily_scorecard': args.p_date === f.date ? (f.idle ? { ...kado, blocks_total: 0, day_status: { reason: 'rain', note: 'Wet yard', staff_worked: true, work_done: ['stacking', 'maintenance'] }, idle_labour: 45000 } : args.p_site_id === 'kado' ? kado : life) : null,
      'rpc:site_day_overview': f.idle ? { totals: { blocks: 500, production_days: 1, no_production_days: 1, idle_labour_cost: 45000, cost_per_block: 210, cost_per_block_excl_idle: 120, missing_records: 1, missing_rosters: 0 } } : null,
      production_sites: f.sites,
      production_log: { date: f.date },
      production_exceptions: [{ id: 'open-line', parameter: 'cement', kind: 'quality', status: 'open', message: 'Cement: check the blocks are strong.' }],
    }[table]
    return { data, error: null }
  })
  f.calls = mock.calls
  return { supabase: mock.supabase }
})
beforeEach(() => { f.assignment = null; f.idle = false; f.calls.length = 0 })
afterEach(cleanup)
const shareText = async () => {
  const launch = vi.spyOn(window, 'open').mockImplementation(() => null)
  expect(screen.getByRole('button', { name: 'Copy text' })).toBeInTheDocument()
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Send to WhatsApp' })))
  const text = new URL(launch.mock.calls[0][0]).searchParams.get('text')
  launch.mockRestore()
  return text
}

it('shows Kado’s rates, budget chips, missing roster and the link to the warning day', async () => {
  const onOpen = vi.fn()
  render(<Scorecard initial={{ date: f.date }} onOpenBudgetWarnings={onOpen} />)
  expect(await screen.findByText('Blocks: 1,095')).toBeInTheDocument()
  expect(screen.getByLabelText('Site')).toHaveValue('kado')
  expect(screen.getByText('26 bags')).toBeInTheDocument()
  expect(screen.getByText('22 L')).toBeInTheDocument()
  expect(await screen.findByText('Check quality')).toHaveStyle({ color: theme.accent })
  expect(screen.getByText('Cement: check the blocks are strong.')).toBeInTheDocument()
  for (const [rate, label] of [['20.1 L per 1,000 (budget 20)', 'Within limits'], ['₦706.01 per block (budget ₦791.29)', 'Within budget']]) {
    expect(within(screen.getByText(rate).parentElement).getByText(label)).toHaveStyle({ color: theme.green })
  }
  expect(screen.getByText('Roster not recorded for this day')).toHaveStyle({ color: theme.red })
  expect(await shareText()).toBe([
    'Production report 18/11/2026 — Kado Site (Sequoia)',
    'Blocks: 1,095 (9": 1,095, 6": 0)',
    'Cement: 26 bags — 42.1 per bag (budget 40) check quality',
    'Diesel: 22 L — 20.1 L per 1,000 (budget 20) within limits',
    'Dust: 25.185 t (calculated)',
    'Breakage: 8 broken — 0.73% (allowed 1%) within limits',
    'Cost: cement ₦301,600 · dust ₦428,145 · diesel ₦43,335',
    'Materials: ₦706.01 per block (budget ₦791.29)',
    'Labour: roster not recorded',
  ].join('\n'))
  expect(screen.getByText('This day has a budget warning to explain')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'View budget warning' }))
  await waitFor(() => expect(onOpen).toHaveBeenCalledWith({ id: 'open-line', siteId: 'kado' }))
})

it('fixes the assigned site, shows labour, and keeps all costs out of a Life Camp report', async () => {
  f.assignment = 'life'
  render(<AssignedSiteProvider><Scorecard initial={{ date: f.date, siteId: 'kado' }} /></AssignedSiteProvider>)
  expect(await screen.findByText("Bilaad's materials — not costed")).toBeInTheDocument()
  expect(screen.getByText('Life Camp Site (Bilaad)')).toBeInTheDocument()
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  expect(screen.getByText('Labour: 8 workers, ₦48,000 — ₦44 per block')).toBeInTheDocument()
  expect(await shareText()).toContain('Labour: 8 workers')
  expect(await shareText()).not.toMatch(/₦|Cost:|Materials:|Total:/)
})

it('defaults to the Lagos date and moves by calendar days', async () => {
  render(<Scorecard />)
  const date = screen.getByLabelText('Date')
  expect(date).toHaveValue(lagosToday())
  fireEvent.change(date, { target: { value: '2026-12-01' } })
  fireEvent.click(screen.getByRole('button', { name: 'Previous day' }))
  expect(date).toHaveValue('2026-11-30')
  expect(await screen.findByText('No production recorded for 30/11/2026.')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Next day' }))
  expect(date).toHaveValue('2026-12-01')
})

it('summarizes both client sites for the MD and opens the selected production date', async () => {
  const onOpen = vi.fn()
  render(<ScorecardDashboard userProfile={{ role: 'md' }} onOpen={onOpen} />)
  expect(await screen.findByText(/Kado Site.*1,095 blocks/)).toBeInTheDocument()
  expect(screen.getByText(/Life Camp Site.*1,095 blocks/)).toBeInTheDocument()
  expect(screen.queryByText(/Dutse Factory/)).not.toBeInTheDocument()
  fireEvent.click(screen.getAllByRole('button', { name: 'View scorecard' })[0])
  expect(onOpen).toHaveBeenCalledWith('kado', f.date)
})

it('shows idle labour and both period cost-per-block measures on a no-production day', async () => {
  f.idle = true
  const onProduction = vi.fn()
  render(<Scorecard initial={{ date: f.date }} onProduction={onProduction} />)
  expect(await screen.findByText('No production — Rain')).toBeInTheDocument()
  expect(screen.getByText('Staff worked: stacking, maintenance')).toBeInTheDocument()
  expect(screen.getByText('Idle labour ₦45,000')).toBeInTheDocument()
  const period = within(screen.getByRole('region', { name: 'Period totals' }))
  expect(period.getByText('Cost per block (all days)').nextSibling).toHaveTextContent('₦210')
  expect(period.getByText('Cost per block (production days only)').nextSibling).toHaveTextContent('₦120')
  fireEvent.click(period.getByRole('button', { name: 'Missing records: 1' }))
  expect(onProduction).toHaveBeenCalledWith('kado')
})
