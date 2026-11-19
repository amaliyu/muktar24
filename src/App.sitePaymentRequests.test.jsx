import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { PaymentRequestsPage, ROLE_PAGES } from './App'
import { AssignedSiteProvider } from './components/AssignedSite'
import { DUTSE_SITE_ID } from './services/sites'

const f = vi.hoisted(() => ({
  site: 'kado', create: vi.fn(), vendors: vi.fn(), calls: [], statuses: ['draft'],
  list: async () => f.statuses.map((status, index) => ({ id: status, requested_by: 'manager', reference: 'PR-0' + (index + 1), status, amount: 200, purpose: status, created_at: '2026-11-19', site_id: 'kado' })),
}))
vi.mock('pdfjs-dist', () => ({ GlobalWorkerOptions: {} }))
vi.mock('./lib/supabase', async () => {
  const { createSupabaseMock } = await import('./test/supabaseMock')
  const fixture = createSupabaseMock(table => ({ error: null, data:
    table === 'rpc:backfill_payment_request_at_site' ? { id: 'backfilled' } : table === 'user_profiles_directory' ? [{ id: 'manager', full_name: 'Test Worker' }] : table === 'rpc:my_assigned_site' ? f.site : table === 'production_sites' ? [
      { id: '00000000-0000-4000-8000-000000000001', name: 'Dutse Factory', site_type: 'factory' },
      { id: 'kado', name: 'Kado Site (Sequoia)', site_type: 'client_site' },
      { id: 'life-camp', name: 'Life Camp Site (Bilaad)', site_type: 'client_site' },
    ] : [] })); f.calls = fixture.calls; return { supabase: fixture.supabase }
})
vi.mock('./services/paymentRequests', async importOriginal => ({
  paymentRequestsService: { ...(await importOriginal()).paymentRequestsService, list: f.list, listMine: f.list, create: f.create, getActiveSuppliers: f.vendors },
}))

beforeEach(() => {
  vi.clearAllMocks()
  f.site = 'kado'
  f.calls.length = 0
  f.statuses = ['draft']
  f.create.mockResolvedValue({ reference: 'PR-02' })
  f.vendors.mockResolvedValue([{ id: 'supplier', company_name: 'Test Vendor' }])
})
afterEach(cleanup)

const openPage = (role, effectiveRoles) => render(<AssignedSiteProvider>
  <PaymentRequestsPage userProfile={{ id: 'manager', role, effectiveRoles }} />
</AssignedSiteProvider>)
const newRequest = async () => {
  fireEvent.click(await screen.findByRole('button', { name: /New Request/ }))
  return (await screen.findByText('New Payment Request')).parentElement
}
const change = (element, value) => fireEvent.change(element, { target: { value } })

it('lets a Kado assistant manager submit a typed-payee request for Kado', async () => {
  const pages = ROLE_PAGES.assistant_production_manager
  expect(pages).toContain('payment_requests')
  expect(pages.indexOf('payment_requests')).toBeLessThan(pages.indexOf('messages'))
  openPage('assistant_production_manager')
  const form = within(await newRequest())
  expect(await form.findByText('Kado Site (Sequoia)')).toBeInTheDocument()
  expect(form.queryByRole('option', { name: 'Dutse Factory' })).not.toBeInTheDocument()
  expect(form.queryByRole('button', { name: 'Existing Vendor' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /Backfill|Recall/ })).not.toBeInTheDocument()
  expect(form.getByText('Diesel → Production Fuel. Cement or dust → Raw Materials.')).toBeInTheDocument()
  change(form.getByPlaceholderText('0'), '1000')
  change(form.getByPlaceholderText(/Brief description/), 'Diesel')
  change(form.getByPlaceholderText('Person or business name'), 'Fuel seller')
  change(form.getByPlaceholderText('10-digit account number'), '0000000001')
  fireEvent.click(form.getByRole('button', { name: 'Submit Request' }))
  await waitFor(() => expect(f.create).toHaveBeenCalledWith(expect.objectContaining({
    site_id: 'kado', payee_name: 'Fuel seller', payee_account_number: '0000000001', supplier_id: null,
  })))
  expect(f.vendors).not.toHaveBeenCalled()
})

it('shows the page without a New Request action for an unassigned assistant manager', async () => {
  f.site = null
  openPage('assistant_production_manager')
  await screen.findByText('Payment Requests', { exact: true })
  expect(screen.queryByRole('button', { name: /New Request/ })).not.toBeInTheDocument()
})

it('keeps vendor and backfill access for assigned logistics, with the Life Camp site fixed', async () => {
  f.site = 'life-camp'
  openPage('logistics_manager', ['logistics_manager', 'assistant_production_manager'])
  expect(await screen.findByRole('button', { name: /Backfill Entry/ })).toBeInTheDocument()
  const form = within(await newRequest())
  expect(await form.findByText('Life Camp Site (Bilaad)')).toBeInTheDocument()
  expect(form.queryByRole('option', { name: 'Dutse Factory' })).not.toBeInTheDocument()
  expect(await form.findByRole('option', { name: 'Test Vendor' })).toBeInTheDocument()
  // Main exposes Recall to ICO and MD in their approval queues, not in the logistics draft list.
  expect(screen.queryByRole('button', { name: 'Recall' })).not.toBeInTheDocument()
})

it('keeps the Dutse picker default for an unassigned production manager', async () => {
  f.site = null
  openPage('production_manager')
  const form = within(await newRequest())
  expect((await form.findByRole('option', { name: 'Dutse Factory' })).parentElement).toHaveValue(DUTSE_SITE_ID)
  expect(await form.findByRole('option', { name: 'Test Vendor' })).toBeInTheDocument()
})

it('honours supplier access granted through an effective role', async () => {
  openPage('assistant_production_manager', ['assistant_production_manager', 'logistics_manager'])
  const form = within(await newRequest())
  expect(await form.findByRole('option', { name: 'Test Vendor' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /Backfill Entry/ })).toBeInTheDocument()
})

it('shows the union of ICO and granted accountant actions and queues', async () => {
  f.statuses = ['draft', 'ico_approved', 'md_approved', 'funded', 'disbursed']
  openPage('ico', ['ico', 'accountant'])
  expect(await screen.findByRole('button', { name: 'Approve' })).toBeInTheDocument()
  for (const name of ['Mark Funded', 'Mark Disbursed', 'Close', 'Override Close']) {
    expect(screen.getByRole('button', { name })).toBeInTheDocument()
  }
  expect(screen.queryByText('PR-02')).not.toBeInTheDocument()
})

it('keeps approval and backfill for a plain ICO without accountant actions', async () => {
  f.statuses = ['draft', 'md_approved', 'funded', 'disbursed']
  openPage('ico')
  expect(await screen.findByRole('button', { name: 'Approve' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /Backfill Entry/ })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /Mark Funded|Mark Disbursed|Override Close/ })).not.toBeInTheDocument()
})

it('shows Close and Override Close only once for an MD with an accountant grant', async () => {
  f.statuses = ['disbursed']
  openPage('md', ['md', 'accountant'])
  expect(await screen.findByRole('button', { name: 'Close' })).toBeInTheDocument()
  expect(screen.getAllByRole('button', { name: 'Override Close' })).toHaveLength(1)
})

it('requires a site on backfill and passes it to the site-aware RPC', async () => {
  f.site = null
  openPage('accountant')
  fireEvent.click(await screen.findByRole('button', { name: /Backfill Entry/ }))
  const title = screen.getByText(/Backfill Historical Entry/)
  const form = within(title.parentElement)
  const site = form.getByLabelText('Site *')
  const save = form.getByRole('button', { name: 'Record Historical Entry' })
  expect(site).toHaveValue('')
  expect(save).toBeDisabled()
  change(site, 'kado')
  const worker = await form.findByRole('option', { name: 'Test Worker' })
  change(worker.parentElement, worker.value)
  change(title.parentElement.querySelector('input[type=date]'), '2026-11-01')
  change(form.getByPlaceholderText('0'), '1000')
  change(form.getByPlaceholderText(/Brief description/), 'Historical fuel')
  change(form.getByPlaceholderText(/originally authorised/), 'Approved by MD')
  fireEvent.click(form.getByRole('button', { name: 'New Payee' }))
  change(form.getByPlaceholderText('Person or business name'), 'Fuel supplier')
  fireEvent.click(save)
  await waitFor(() => expect(f.calls.find(call => call.rpc === 'backfill_payment_request_at_site')?.args).toMatchObject({
    p_site_id: 'kado', p_requested_by: 'manager', p_amount: 1000, p_payee_name: 'Fuel supplier',
  }))
})
