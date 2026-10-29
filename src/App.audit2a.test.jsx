import { afterEach, beforeEach, it, expect, vi } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
const svc = vi.hoisted(() => ({ cash: vi.fn(), expenses: vi.fn(), customers: vi.fn(), orders: vi.fn(), confirmed: vi.fn(), receivables: vi.fn(), banks: vi.fn() }))
vi.mock('./lib/supabase', async () => {
  const { createSupabaseMock } = await import('./test/supabaseMock')
  return createSupabaseMock(() => ({ data: [], error: null }))
})
vi.mock('pdfjs-dist', () => ({ GlobalWorkerOptions: {} }))
vi.mock('./services/orders', () => ({
  ordersService: { getAll: svc.orders, getCashReceived: svc.cash },
  customersService: { getAll: async () => [], getAllWithStats: svc.customers },
  customerSitesService: { getByCustomer: async () => [] },
}))
vi.mock('./services/staff', () => ({ staffService: { getPublicList: async () => [], getPublicActive: async () => [] } }))
vi.mock('./services/accounting', () => ({
  expensesService: { getAll: svc.expenses },
  accountingService: { getProductionTotals: async () => [], getConfirmedPayments: svc.confirmed, getReceivables: svc.receivables, getOpenInvoices: async () => [] },
  incomeRecordsService: { getAll: async () => [] },
  expenseCategoriesService: { getActive: async () => [] },
}))
vi.mock('./services/bank', () => ({ bankAccountsService: { getAll: svc.banks }, bankTransactionsService: {}, bankImportBatchesService: {}, bankReconciliationsService: {}, receiptsService: {} }))
import { Dashboard, CostTab, Customers, Orders, BookkeepingTab, ReceivablesTab, BankAccountsTab } from './App'
afterEach(cleanup)
beforeEach(() => {
  vi.clearAllMocks()
  svc.cash.mockResolvedValue(0)
  svc.confirmed.mockResolvedValue([])
  svc.receivables.mockResolvedValue([])
  svc.banks.mockResolvedValue([])
  svc.expenses.mockResolvedValue([])
  svc.customers.mockResolvedValue([])
  svc.orders.mockResolvedValue([])
})
it('4: Dashboard cash query failure shows its message and hides money figures', async () => {
  svc.cash.mockRejectedValue(new Error('TEST cash denied'))
  render(<Dashboard userProfile={{ role: 'md' }} />)
  expect(await screen.findByRole('alert')).toHaveTextContent('Revenue could not be loaded: TEST cash denied')
  expect(screen.queryByText('₦0')).toBeNull()
})
it('4: Cost Analysis refuses a failed expense source instead of calculating zero costs', async () => {
  svc.expenses.mockRejectedValue(new Error('TEST expense denied'))
  render(<CostTab />)
  expect(await screen.findByRole('alert')).toHaveTextContent('Cost analysis could not be loaded: TEST expense denied')
  expect(screen.queryByText('₦0')).toBeNull()
})
it('3: Customers list, detail and order history never show a proforma as owed', async () => {
  svc.customers.mockResolvedValue([{ id: 'c', name: 'TEST quote customer', orders: [{
    id: 'o', status: 'pending', created_at: '2026-09-01',
    order_items: [{ block_type: 'TEST block', quantity: 10, unit_price: 250, subtotal: 2500 }],
    invoices: [{ status: 'draft', total_amount: 2500, payments: [] }],
  }] }])
  render(<Customers userProfile={{ role: 'md' }} />)
  await userEvent.click(await screen.findByText('TEST quote customer'))
  expect(await screen.findByText('Quote ₦2,500 — not owed')).toBeInTheDocument()
  expect(screen.queryByText(/^Owes /)).toBeNull()
  const outstanding = screen.getByText('Outstanding')
  expect(within(outstanding.parentElement).getByText('₦0')).toBeInTheDocument()
})
it.each([['Orders', Orders], ['Customers', Customers]])('16: %s displays the missing staff-link instruction', async (_, Component) => {
  render(<Component userProfile={{ id: 'login', role: 'marketer' }} />)
  expect(await screen.findByText(/Your login is not linked to a staff record — ask HR/)).toBeInTheDocument()
  expect(svc.orders).not.toHaveBeenCalled()
  expect(svc.customers).not.toHaveBeenCalled()
})

it.each([['Bookkeeping', BookkeepingTab, 'confirmed'], ['Receivables', ReceivablesTab, 'receivables'], ['Bank balances', BankAccountsTab, 'banks']])('4: %s never turns a failed money source into zero totals', async (label, Component, source) => {
  svc[source].mockRejectedValue(new Error('TEST source denied'))
  render(<Component userProfile={{ role: 'md' }} />)
  expect(await screen.findByRole('alert')).toHaveTextContent(label + ' could not be loaded: TEST source denied')
  expect(screen.queryByText('₦0')).toBeNull()
})
