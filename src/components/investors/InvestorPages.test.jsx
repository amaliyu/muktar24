import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('../../lib/supabase', () => ({ supabase: {} }))
vi.mock('../../services/sites', () => ({
  DUTSE_SITE_ID: 'dutse',
  siteName: () => 'Kado Site (Sequoia)',
  sitesService: { getActive: vi.fn(async () => [{ id: 'kado', name: 'Kado Site (Sequoia)', site_type: 'client_site' }]) },
}))
vi.mock('../../services/siteContracts', () => ({ lagosToday: () => '2026-10-23' }))
const pdf = vi.hoisted(() => ({ spv: vi.fn(async () => ({})), inv: vi.fn(async () => ({})) }))
vi.mock('../../utils/generateSpvClosePDF', () => ({ generateSpvClosePDF: pdf.spv }))
vi.mock('../../utils/generateInvestorStatementPDF', () => ({ generateInvestorStatementPDF: pdf.inv }))

const period = {
  id: 'p1', site_id: 'kado', period_month: '2026-09-01', status: 'draft', computed_at: '2026-10-02T09:00:00Z', term_template_id: 't1',
  receipts: 12000000, deductible_expenses: 4000000, excluded_expenses: 100000, pending_expenses_count: 2, reserve: 500000, management_fee: 0,
  ndc_raw: 7500000, deficit_brought_forward: 0, distributable: 7500000, deficit_carried_forward: 0, ica: 30000000, investor_receipts_before: 0,
  investor_portion: 4875000, apcl_operator_share: 2625000, tier_breakdown: [{ from: 0, to: 1, investor_pct: 65, ndc_in_tier: 7500000, investor: 4875000, apcl: 2625000 }],
}
const svc = vi.hoisted(() => ({
  listPeriods: vi.fn(), listDistributions: vi.fn(async () => []),
  listInvestors: vi.fn(async () => [{ id: 'A', name: 'TEST Investor', kind: 'external', is_active: true }, { id: 'APCL', name: 'Abuja Precast Concrete Limited (APCL)', kind: 'apcl', is_active: true }]),
  listTerms: vi.fn(async () => [{ id: 't1', name: 'Term Sheet V2', version: 1, tiers: [{ from: 0, to: null, investor_pct: 65 }], management_fee_pct: 0 }]),
  listPositions: vi.fn(async () => []),
  computeMonth: vi.fn(async () => { throw new Error('No terms are set for this site. Choose the terms for the site first.') }),
  approveMonth: vi.fn(async () => null),
}))
const mine = vi.hoisted(() => ({ myInvestor: vi.fn(), myPositions: vi.fn(), myDistributions: vi.fn(), periods: vi.fn(), terms: vi.fn(), siteNames: vi.fn() }))
vi.mock('../../services/investors', () => ({ investorsService: svc, myInvestmentService: mine }))

import MonthlyClose from './MonthlyClose'
import InvestorRegister from './InvestorRegister'
import MyInvestment from './MyInvestment'

const as = (role) => ({ id: 'u1', role, effectiveRoles: [role] })

describe('MonthlyClose', () => {
  beforeEach(() => { vi.clearAllMocks(); svc.listPeriods.mockResolvedValue([]) })

  it('defaults to the last completed month and shows the compute error verbatim', async () => {
    const user = userEvent.setup()
    render(<MonthlyClose userProfile={as('accountant')} />)
    await screen.findByText('Kado Site (Sequoia) — September 2026')
    expect(screen.getByText('Not computed')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Compute' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('No terms are set for this site. Choose the terms for the site first.')
    expect(svc.computeMonth).toHaveBeenCalledWith('kado', '2026-09-01')
  })

  it('pending expenses: red banner and Approve disabled; accountant never sees Approve', async () => {
    svc.listPeriods.mockResolvedValue([period])
    const { unmount } = render(<MonthlyClose userProfile={as('md')} />)
    expect(await screen.findByText(/2 site expenses for this month are still pending/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Approve month' })).toBeDisabled()
    expect(screen.queryByText('Less management fee')).toBeNull()
    expect(screen.getAllByText('₦7,500,000.00').length).toBeGreaterThan(0)
    unmount()
    render(<MonthlyClose userProfile={as('accountant')} />)
    await screen.findByText('Draft')
    expect(screen.queryByRole('button', { name: 'Approve month' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Void month' })).toBeNull()
  })

  it('approve asks in an app dialog, not window.confirm', async () => {
    const user = userEvent.setup()
    const confirmSpy = vi.spyOn(window, 'confirm')
    svc.listPeriods.mockResolvedValue([{ ...period, pending_expenses_count: 0 }])
    render(<MonthlyClose userProfile={as('md')} />)
    await user.click(await screen.findByRole('button', { name: 'Approve month' }))
    const title = screen.getByText('Approve Sep 2026 for Kado Site (Sequoia)?')
    await user.click(within(title.parentElement).getByRole('button', { name: 'Approve month' }))
    await waitFor(() => expect(svc.approveMonth).toHaveBeenCalledWith('p1'))
    expect(confirmSpy).not.toHaveBeenCalled()
  })

  it('board sees the statement but no compute', async () => {
    svc.listPeriods.mockResolvedValue([period])
    render(<MonthlyClose userProfile={as('board_member')} />)
    await screen.findByText('Draft')
    expect(screen.queryByRole('button', { name: /Compute/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /SPV close PDF/ })).toBeNull()
  })
})

describe('InvestorRegister', () => {
  beforeEach(() => vi.clearAllMocks())
  it('md can add; accountant reads only; the APCL row cannot be deactivated', async () => {
    const { unmount } = render(<InvestorRegister userProfile={as('md')} />)
    await screen.findByText('TEST Investor')
    expect(screen.getByRole('button', { name: 'Add investor' })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Deactivate' })).toHaveLength(1)
    unmount()
    render(<InvestorRegister userProfile={as('accountant')} />)
    await screen.findByText('TEST Investor')
    expect(screen.queryByRole('button', { name: 'Add investor' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull()
  })
})

describe('MyInvestment', () => {
  beforeEach(() => vi.clearAllMocks())
  it('an unlinked login is told to contact APCL and nothing else is read', async () => {
    mine.myInvestor.mockResolvedValue(null)
    render(<MyInvestment userProfile={as('investor')} />)
    expect(await screen.findByText('Your login is not linked to an investor record yet — contact APCL.')).toBeInTheDocument()
    expect(mine.myPositions).not.toHaveBeenCalled()
    expect(svc.listInvestors).not.toHaveBeenCalled()
  })
  it('shows own capital, months and multiple; never uses the staff service', async () => {
    mine.myInvestor.mockResolvedValue({ id: 'A', name: 'TEST Investor', kind: 'external' })
    mine.myPositions.mockResolvedValue([{ investor_id: 'A', site_id: 'kado', capital_net: 1000000 }])
    mine.myDistributions.mockResolvedValue([{ id: 'd1', period_id: 'p1', site_id: 'kado', investor_id: 'A', share_type: 'investor_portion', capital_share: 1, amount: 250000, paid_on: '2026-10-08' }])
    mine.periods.mockResolvedValue([{ ...period, status: 'approved' }])
    mine.terms.mockResolvedValue([{ id: 't1', name: 'Term Sheet V2', version: 1, tiers: [{ from: 0, to: 1, investor_pct: 65 }, { from: 1, to: null, investor_pct: 20 }] }])
    mine.siteNames.mockResolvedValue([{ id: 'kado', name: 'Kado Site (Sequoia)' }])
    render(<MyInvestment userProfile={as('investor')} />)
    expect(await screen.findByText('₦1,000,000.00')).toBeInTheDocument()
    expect(screen.getByText('0.25×')).toBeInTheDocument()
    expect(screen.getByText('Sep 2026')).toBeInTheDocument()
    expect(screen.getAllByText('Paid').length).toBeGreaterThan(0)
    await userEvent.click(screen.getByRole('button', { name: 'Statement PDF' }))
    await waitFor(() => expect(pdf.inv).toHaveBeenCalled())
    expect(pdf.inv.mock.calls[0][0]).toMatchObject({ investorName: 'TEST Investor', amount: 250000, cumulativePaid: 250000 })
    expect(Object.values(svc).every(f => f.mock.calls.length === 0)).toBe(true)
  })
})
