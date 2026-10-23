import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const GUARD = 'Cycle 1 cannot start: it is not fully paid or the production schedule is missing. Only the MD can start it early, with a written reason.'

vi.mock('../../lib/supabase', () => ({ supabase: {} }))
vi.mock('../../services/sites', () => ({
  DUTSE_SITE_ID: 'dutse',
  siteName: () => 'Kado Site (Sequoia)',
  sitesService: { getActive: vi.fn(async () => [{ id: 'kado', name: 'Kado Site (Sequoia)', site_type: 'client_site', code: 'KADO-SEQ' }]) },
}))
vi.mock('../../services/siteContracts', async () => {
  const actual = await vi.importActual('../../services/siteContracts')
  return {
    ...actual,
    lagosToday: () => '2026-12-21',
    siteContractsService: {
      listContracts: vi.fn(async () => [{ id: 'k1', site_id: 'kado', client_name: 'Sequoia Projects Limited', contract_ref: 'Phase 1', contract_model: 'full_supply', total_qty_9in: 125000, total_qty_6in: 25000, opening_rate_9in: 1000, opening_rate_6in: 960, planning_rate_per_day: 2880, advance_notice_days: 7, material_warning_days: 3, status: 'active' }]),
      listCycles: vi.fn(async () => [{ id: 'c1', contract_id: 'k1', cycle_no: 1, qty_9in: 20000, qty_6in: 5000, qty_total: 25000, rate_9in: 1000, rate_6in: 960, amount_due: 24800000, amount_received: 0, status: 'awaiting_payment' }]),
      listForecasts: vi.fn(async () => [{ cycle_id: 'c1', contract_id: 'k1', site_id: 'kado', cycle_no: 1, status: 'awaiting_payment', qty_total: 25000, done: 0, remaining: 25000, days_n: 0, rate_used: 2880, rate_basis: 'planning', days_left: 8.7, forecast_completion: '2027-01-01' }]),
      setCycleStatus: vi.fn(async () => { throw new Error(GUARD) }),
      listCycleAudit: vi.fn(async () => []),
      listHolidays: vi.fn(async () => []),
      runSiteWarnings: vi.fn(async () => 0),
    },
  }
})

const invMock = vi.hoisted(() => ({
  listSiteReceipts: vi.fn(async () => []),
  listBankAccounts: vi.fn(async () => [{ id: 'b1', bank_name: 'Taj Bank', account_name: 'APCL Collections', is_active: true }]),
  recordSiteReceipt: vi.fn(async () => ({ id: 'r1' })),
  voidSiteReceipt: vi.fn(async () => ({ id: 'r1' })),
}))
vi.mock('../../services/investors', () => ({ investorsService: invMock }))

import SiteContracts from './SiteContracts'

describe('SiteContracts', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows the forecast with its rate label, and the DB guard message verbatim when start is blocked', async () => {
    const user = userEvent.setup()
    render(<SiteContracts userProfile={{ id: 'u', role: 'md', effectiveRoles: ['md'] }} />)
    expect(await screen.findByText('Sequoia Projects Limited')).toBeInTheDocument()
    expect(screen.getByText('planning rate (fewer than 5 production days)')).toBeInTheDocument()
    expect(screen.getAllByText('₦24,800,000').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: /Start early/ })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Start cycle' }))
    const dialog = screen.getByText('Start cycle 1?').parentElement
    await user.click(within(dialog).getByRole('button', { name: 'Start cycle' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(GUARD)
  })

  it('cycle form shows amount received read-only and never sends it; receipts replace the edit', async () => {
    const user = userEvent.setup()
    render(<SiteContracts userProfile={{ id: 'a', role: 'accountant', effectiveRoles: ['accountant'] }} />)
    await screen.findByText('Sequoia Projects Limited')
    await user.click(screen.getByRole('button', { name: /Payment \/ scope/ }))
    expect(screen.queryByLabelText(/Amount received/)).toBeNull()
    expect(screen.getByText(/sum of this cycle's receipts/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    await user.click(await screen.findByRole('button', { name: 'Record receipt' }))
    const bank = screen.getByLabelText('Bank account')
    expect(within(bank).getByRole('option', { name: 'Taj Bank — APCL Collections' })).toBeInTheDocument()
    expect(screen.getByLabelText('Cycle')).toHaveValue('c1')
    await user.type(screen.getByLabelText('Amount (₦) *'), '1')
    await user.type(screen.getByLabelText('Reference'), 'TEST')
    await user.selectOptions(bank, 'b1')
    const buttons = screen.getAllByRole('button', { name: 'Record receipt' })
    await user.click(buttons[buttons.length - 1])
    await waitFor(() => expect(invMock.recordSiteReceipt).toHaveBeenCalled())
    const sent = invMock.recordSiteReceipt.mock.calls[0][0]
    expect(sent).toMatchObject({ site_id: 'kado', cycle_id: 'c1', amount: 1, reference: 'TEST', bank_account_id: 'b1' })
    expect(JSON.stringify(sent)).not.toMatch(/account_number/)
  })

  it('accountant sees no status actions; store officer sees no money', async () => {
    const { unmount } = render(<SiteContracts userProfile={{ id: 'a', role: 'accountant', effectiveRoles: ['accountant'] }} />)
    await screen.findByText('Sequoia Projects Limited')
    expect(screen.queryByRole('button', { name: 'Start cycle' })).toBeNull()
    expect(screen.getByRole('button', { name: /Payment \/ scope/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Weekly report' })).toBeInTheDocument()
    unmount()
    invMock.listSiteReceipts.mockClear()
    render(<SiteContracts userProfile={{ id: 's', role: 'store_officer', effectiveRoles: ['store_officer'] }} />)
    await screen.findByText('Sequoia Projects Limited')
    await waitFor(() => expect(screen.queryByText(/₦/)).toBeNull())
    expect(screen.queryByText('Receipts')).toBeNull()
    expect(invMock.listSiteReceipts).not.toHaveBeenCalled()
  })
})
