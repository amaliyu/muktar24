import { afterEach, it, expect, vi } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
const svc = vi.hoisted(() => ({ income: vi.fn(), balance: vi.fn(), cash: vi.fn() }))
vi.mock('../services/financialService', () => ({
  incomeStatementService: { getData: svc.income }, balanceSheetService: { getData: svc.balance }, cashFlowService: { getData: svc.cash },
  openingBalancesService: {}, financialAdjustmentsService: {},
}))
vi.mock('../lib/supabase', () => ({ supabase: {} }))
import FinancialStatements from './FinancialStatements'
afterEach(cleanup)
it('6: Cash Flow renders opening, closing and accounts from the service bankStart/bankEnd', async () => {
  svc.balance.mockResolvedValue({})
  svc.cash.mockResolvedValue({ netProfit: 0, openingBalances: [], adjustments: [], bankStart: [{ opening_balance: 123 }], bankEnd: [{ account_id: 'test', account_name: 'TEST account', current_balance: 456 }], warnings: [] })
  render(<FinancialStatements userProfile={{ role: 'accountant' }} />)
  await userEvent.click(screen.getByRole('button', { name: 'Cash Flow', exact: true }))
  const opening = await screen.findByText('Opening Cash Balance')
  expect(within(opening.parentElement).getByText('₦123')).toBeInTheDocument()
  expect(within(screen.getByText('Closing Cash Balance').parentElement).getByText('₦456')).toBeInTheDocument()
  expect(screen.getByText('Cash at Bank — TEST account')).toBeInTheDocument()
})
it('7: Balance Sheet displays returned year-to-date profit', async () => {
  svc.balance.mockResolvedValue({ ytdProfit: 789 })
  render(<FinancialStatements userProfile={{ role: 'accountant' }} />)
  expect((await screen.findAllByText('₦789')).length).toBeGreaterThan(0)
})
