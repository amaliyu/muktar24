import { beforeEach, afterEach, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const svc = vi.hoisted(() => ({
  orders: vi.fn(), record: vi.fn(), payments: vi.fn(), items: vi.fn(), pdf: vi.fn(),
  deleteInvoice: vi.fn(), deleteOrder: vi.fn(),
}))
vi.mock('./lib/supabase', () => ({ supabase: {} }))
vi.mock('pdfjs-dist', () => ({ GlobalWorkerOptions: {} }))
vi.mock('./services/orders', () => ({
  ordersService: { getAll: svc.orders, delete: svc.deleteOrder },
  customersService: { getAll: async () => [] }, customerSitesService: {},
}))
vi.mock('./services/staff', () => ({ staffService: { getPublicActive: async () => [] } }))
vi.mock('./services/products', () => ({ productsService: { getActive: async () => [] } }))
vi.mock('./services/payments', () => ({
  paymentsService: { recordPayment: svc.record, getByInvoice: svc.payments },
  invoicesService: { getItems: svc.items, delete: svc.deleteInvoice },
  orderPaymentsService: { getByOrderInvoices: svc.payments },
}))
vi.mock('./utils/generateInvoicePDF', () => ({ generateInvoicePDF: svc.pdf }))

import { Orders } from './App'

const invoice = (id, status, extra = {}) => ({ id, invoice_number: id, status, total_amount: 1000, payments: [], ...extra })
const order = (invoices, name = 'Test buyer') => ({
  id: name, status: 'pending', customer: { name }, invoices, order_items: [],
})
const profile = role => ({ id: 'test-user', full_name: 'Test user', role, effectiveRoles: [role] })

beforeEach(() => {
  vi.clearAllMocks()
  svc.record.mockResolvedValue({ id: 'payment' })
  svc.payments.mockResolvedValue([])
  svc.items.mockResolvedValue([])
})
afterEach(cleanup)

async function openOrder(invoices, role = 'accountant') {
  svc.orders.mockResolvedValue([order(invoices)])
  render(<Orders userProfile={profile(role)} onNavigate={vi.fn()} />)
  await userEvent.click(await screen.findByText('Test buyer', { exact: true }))
}

async function savePayment() {
  await userEvent.type(screen.getByLabelText('Amount (₦)'), '50')
  fireEvent.change(screen.getByLabelText('Payment Date'), { target: { value: '2026-10-25' } })
  await userEvent.click(screen.getByRole('button', { name: 'Confirm Payment', exact: true }))
}

it('saves against the clicked issued invoice after a cancelled proforma, never invoices[0]', async () => {
  await openOrder([invoice('closed-quote', 'cancelled'), invoice('issued-invoice', 'issued')])
  expect(screen.getAllByRole('button', { name: '+ Record Payment', exact: true })).toHaveLength(1)
  await userEvent.click(screen.getByRole('button', { name: '+ Record Payment', exact: true }))
  expect(screen.getByText('Invoice: issued-invoice', { exact: true })).toBeInTheDocument()
  await savePayment()
  await waitFor(() => expect(svc.record).toHaveBeenCalledWith({
    invoice_id: 'issued-invoice', amount_paid: 50, payment_date: '2026-10-25', status: 'confirmed',
  }))
})

it('switches the payment target when another issued invoice button is clicked', async () => {
  await openOrder([invoice('invoice-one', 'issued'), invoice('invoice-two', 'issued')])
  await userEvent.click(screen.getAllByRole('button', { name: '+ Record Payment', exact: true })[0])
  await userEvent.click(screen.getAllByRole('button', { name: '+ Record Payment', exact: true })[1])
  expect(screen.getByText('Invoice: invoice-two', { exact: true })).toBeInTheDocument()
  await savePayment()
  await waitFor(() => expect(svc.record).toHaveBeenCalledWith(expect.objectContaining({ invoice_id: 'invoice-two' })))
})

it.each(['draft', 'cancelled', 'paid'])('has no Record Payment button for a %s-only order', async status => {
  await openOrder([invoice('not-issued', status)])
  expect(screen.queryByRole('button', { name: '+ Record Payment', exact: true })).toBeNull()
})

it('clears the payment form when switching orders so an invoice cannot leak across customers', async () => {
  svc.orders.mockResolvedValue([
    order([invoice('first', 'issued')]), order([invoice('second', 'issued')], 'Other buyer'),
  ])
  render(<Orders userProfile={profile('accountant')} onNavigate={vi.fn()} />)
  await userEvent.click(await screen.findByText('Test buyer', { exact: true }))
  await userEvent.click(screen.getByRole('button', { name: '+ Record Payment', exact: true }))
  await userEvent.click(screen.getByText('Other buyer', { exact: true }))
  expect(screen.queryByRole('button', { name: 'Confirm Payment', exact: true })).toBeNull()
  expect(svc.record).not.toHaveBeenCalled()
})

it('BDM closes drafts and cannot permanently delete an invoice or its order', async () => {
  await openOrder([invoice('quote', 'draft')], 'bdm')
  expect(screen.getByRole('button', { name: 'Close proforma — customer did not proceed', exact: true })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /Delete/ })).toBeNull()
})

it('MD permanent deletion dialogs warn about history and Cancel performs no deletion', async () => {
  await openOrder([invoice('quote', 'draft')], 'md')
  await userEvent.click(screen.getByRole('button', { name: 'Delete permanently (MD)', exact: true }))
  expect(await screen.findByText(/Its history will be lost/)).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Cancel', exact: true }))
  await userEvent.click(screen.getByRole('button', { name: 'Delete order (MD)', exact: true }))
  expect(await screen.findByText(/all invoice history will be deleted/)).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Cancel', exact: true }))
  expect(svc.deleteInvoice).not.toHaveBeenCalled()
  expect(svc.deleteOrder).not.toHaveBeenCalled()
})

it('passes the issued timestamp through the cancelled PDF action', async () => {
  const issued_at = '2026-10-01T08:00:00Z'
  await openOrder([invoice('void-invoice', 'cancelled', { issued_at })])
  await userEvent.click(screen.getByRole('button', { name: 'Download cancelled PDF', exact: true }))
  await waitFor(() => expect(svc.pdf).toHaveBeenCalledWith(
    expect.objectContaining({ status: 'cancelled', issued_at }), expect.anything(),
  ))
})
