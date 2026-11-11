import { emptyBalance } from '../test/accountingFixtures'
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
import { profitStatement } from '../utils/accountingBasis'
afterEach(cleanup)
it('6: Cash Flow renders opening, closing and accounts from the service bankStart/bankEnd', async () => {
  svc.balance.mockResolvedValue(emptyBalance())
  svc.cash.mockResolvedValue({ closing: {bankTotal:456,cashOnHand:0}, netProfit: 0, netChange: 0, openingCash: 123, closingCash:456, reconciliation:{reconciled:false,difference:333}, historicalNotes:[], openingBalances: [], adjustments: [], bankStart: [{ opening_balance: 123 }], bankEnd: [{ account_id: 'test', account_name: 'TEST account', current_balance: 456 }], warnings: [] })
  render(<FinancialStatements userProfile={{ role: 'accountant' }} />)
  await userEvent.click(screen.getByRole('button', { name: 'Cash Flow', exact: true }))
  const opening = await screen.findByText('Opening Cash Balance')
  expect(within(opening.parentElement).getByText('₦123')).toBeInTheDocument()
  expect(within(screen.getByText('Closing Cash Balance').parentElement).getByText('₦456')).toBeInTheDocument()
  expect(screen.getByText('Cash at Bank — TEST account')).toBeInTheDocument(); expect(screen.getByRole('alert')).toHaveTextContent('Unreconciled: ₦333')
})
it('7: Balance Sheet displays returned year-to-date profit', async () => {
  svc.balance.mockResolvedValue(emptyBalance({ ytdProfit: 789, customerDeposits: 321 }))
  render(<FinancialStatements userProfile={{ role: 'accountant' }} />)
  expect((await screen.findAllByText('₦789')).length).toBeGreaterThan(0); expect(screen.getByText('Customer deposits')).toBeInTheDocument(); expect(screen.getAllByText('₦321').length).toBeGreaterThan(0)
})

const exampleIncome = () => ({ ...profitStatement({ deliveries: [{ customer_id: 'c', customer_name: 'Delivery customer', waybill_date: '2026-09-01', block_type: '9', line_value: 1000 }],
  payments: [], expenses: [{ expense_date: '2026-09-01', status: 'approved', amount: 400, category: { name: 'Labour', parent_category: 'General', cost_center: 'production' } }] }),
  deliveries: [{ customer_id: 'c', customer_name: 'Delivery customer', waybill_date: '2026-09-01', block_type: '9', line_value: 1000 }], payments: [],
  expenses: [{ expense_date: '2026-09-01', status: 'approved', amount: 400, category: { name: 'Labour', parent_category: 'General', cost_center: 'production' } }], adjustments: [] })
it('Management Accounts renders delivery customers and numeric expense breakdowns', async () => {
  svc.income.mockResolvedValue(exampleIncome())
  svc.balance.mockResolvedValue(emptyBalance())
  svc.cash.mockResolvedValue({})
  render(<FinancialStatements userProfile={{ role: 'accountant' }} />)
  await userEvent.click(screen.getByRole('button', { name: 'Management Accounts', exact: true }))
  expect(await screen.findByText('Delivery customer')).toBeInTheDocument()
  expect(screen.getByText('(100.0%)')).toBeInTheDocument()
  expect(document.body.textContent).not.toContain('NaN')
})
it('Management Accounts suppresses financial figures when its balance source fails', async () => {
  svc.income.mockResolvedValue(exampleIncome())
  svc.balance.mockRejectedValue(new Error('Balance unavailable'))
  svc.cash.mockResolvedValue({})
  render(<FinancialStatements userProfile={{ role: 'accountant' }} />)
  await userEvent.click(screen.getByRole('button', { name: 'Management Accounts', exact: true }))
  expect(await screen.findByText(/Balance sheet could not be loaded: Balance unavailable/)).toBeInTheDocument()
  expect(screen.queryByText('₦0')).toBeNull()
})
it('Balance Sheet displays unvalued quantity and unavailable history visibly', async () => {
  svc.balance.mockResolvedValue(emptyBalance({ stockValue: { valued: 0, unvalued: [{ block_type: '9 Inch', quantity: 50 }] }, historicalNotes: ['Bank: current figure — history not available'] }))
  render(<FinancialStatements userProfile={{ role: 'accountant' }} />)
  expect(await screen.findByText('9 Inch: 50 — not valued')).toBeInTheDocument()
  expect(screen.getByText('Bank: current figure — history not available')).toBeInTheDocument()
})
