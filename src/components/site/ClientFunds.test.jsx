import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import ClientFunds from './ClientFunds'
import { clientFunds } from '../../services/clientFunds'
import { paymentRequestsService } from '../../services/paymentRequests'
vi.mock('../../services/clientFunds', async () => {
  const real = await vi.importActual('../../services/clientFunds')
  return { ...real, clientFunds: { summary: vi.fn(), statement: vi.fn(), accounts: vi.fn(async () => []), record: vi.fn(async () => {}), void: vi.fn(async () => {}), setRequestFund: vi.fn(async () => {}) } }
})
vi.mock('../../lib/supabase', () => ({ supabase: {} }))
vi.mock('../../services/paymentRequests', () => ({ paymentRequestsService: { listUntagged: vi.fn() } }))
vi.mock('../../services/storage', () => ({ getSignedDocUrl: vi.fn() }))
const contract = { site_id: 's', client_name: 'Bilaad', contract_model: 'service_fee' }
beforeEach(() => {
  clientFunds.summary.mockResolvedValue({ funds: [{ fund: 'operating', balance: 1000, client_owes: 0 }, { fund: 'diesel', balance: -200, client_owes: 200 }], untagged_count: 1, untagged_spent: 50 })
  clientFunds.statement.mockResolvedValue([{ source: 'entry', id: 'e', date: '2026-11-20', kind: 'received', amount: 100, reference: 'REF' }])
  paymentRequestsService.listUntagged.mockResolvedValue([{ id: 'r', reference: 'PR1', purpose: 'Fuel', amount: 50 }])
})
afterEach(() => { cleanup(); vi.clearAllMocks() })
const show = (role = 'md') => render(<ClientFunds contract={contract} userProfile={{ role }} />)
const fill = (label, value) => fireEvent.change(screen.getByLabelText(label), { target: { value } })
it('shows holding/owes cards and assigns an untagged request', async () => {
  show(); expect(await screen.findByText(/Holding.*Bilaad/)).toBeInTheDocument(); expect(screen.getByText(/Bilaad owes APCL/)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Assign' }))
  await screen.findByText(/PR1/); fill('Paid from:', 'operating')
  await waitFor(() => expect(clientFunds.setRequestFund).toHaveBeenCalledWith('r', 'operating'))
})
it('requires receipt reference and sends record fields', async () => {
  show(); fireEvent.click(screen.getByRole('button', { name: 'Record money' }))
  fill('Type', 'received'); fill('Amount', '200')
  const form = screen.getByRole('button', { name: 'Record', exact: true }).closest('form')
  fireEvent.submit(form); expect(await screen.findByText('Enter the receipt reference.')).toBeInTheDocument(); expect(clientFunds.record).not.toHaveBeenCalled()
  fill('Reference', 'CASH'); fireEvent.submit(form)
  await waitFor(() => expect(clientFunds.record).toHaveBeenCalledWith('s', expect.objectContaining({ kind: 'received', amount: '200', reference: 'CASH' })))
})
it('reserves adjustments and void for MD, validates adjustment note', async () => {
  show(); fireEvent.click(screen.getByRole('button', { name: 'Record money' })); fill('Type', 'adjustment'); fill('Amount', '-20')
  fireEvent.submit(screen.getByRole('button', { name: 'Record', exact: true }).closest('form'))
  expect(await screen.findByText(/adjustment needs a note/)).toBeInTheDocument()
  cleanup(); show('accountant'); fireEvent.click(screen.getByRole('button', { name: 'Record money' })); expect(screen.queryByRole('option', { name: 'Adjustment' })).toBeNull()
})
it('MD voids statement entries with a reason', async () => {
  show(); const details = screen.getByText('Statement — operating').closest('details'); details.open = true; fireEvent(details, new Event('toggle'))
  fireEvent.click(await screen.findByRole('button', { name: 'Void', exact: true }))
  fill('Reason', 'Duplicate transfer entry'); fireEvent.click(screen.getByRole('button', { name: 'Void entry' }))
  await waitFor(() => expect(clientFunds.void).toHaveBeenCalledWith('e', 'Duplicate transfer entry'))
})
it('site managers can read funds but cannot record or assign', async () => {
  show('assistant_production_manager'); await screen.findByText(/Holding/)
  expect(screen.queryByRole('button', { name: 'Record money' })).toBeNull(); expect(screen.queryByRole('button', { name: 'Assign' })).toBeNull()
})
