import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('../../lib/supabase', () => ({ supabase: {} }))
vi.mock('../../services/sites', () => ({
  DUTSE_SITE_ID: 'dutse',
  siteName: () => 'Kado Site (Sequoia)',
  isFactorySite: () => false,
  sitesService: { getActive: vi.fn(async () => [{ id: 'dutse', name: 'Dutse Factory', site_type: 'factory', code: 'DUTSE' }]) },
}))
vi.mock('../../services/siteContracts', () => ({
  lagosToday: () => '2026-12-21',
  siteContractsService: {
    listSiteItems: vi.fn(async () => [{ id: 'cem', name: 'Cement', unit: 'bags', owner: 'apcl', site_id: 'dutse' }]),
    recordReceipt: vi.fn(async () => 'new-id'),
    uploadPhoto: vi.fn(),
  },
}))

import { ReceivingForm, receiptFormProblem } from './MaterialReceiving'
import { siteContractsService } from '../../services/siteContracts'

describe('ReceivingForm', () => {
  beforeEach(() => vi.clearAllMocks())

  it('disables submit while some is rejected and no reason is given', async () => {
    const user = userEvent.setup()
    render(<ReceivingForm />)
    await waitFor(() => expect(screen.getByRole('option', { name: /Cement/ })).toBeInTheDocument())
    await user.selectOptions(screen.getByLabelText(/^Item/), 'cem')
    await user.type(screen.getByLabelText(/^Delivered/), '10')
    const submit = screen.getByRole('button', { name: /record delivery/i })
    expect(submit).toBeEnabled()                          // accepted defaults to delivered

    await user.type(screen.getByLabelText(/^Accepted/), '8')
    expect(screen.getByTestId('rejected-live')).toHaveTextContent('Rejected: 2')
    expect(submit).toBeDisabled()                         // 2 rejected, no reason

    await user.type(screen.getByLabelText(/^Rejection reason/), 'TEST')
    expect(submit).toBeEnabled()
    await user.click(submit)
    await waitFor(() => expect(siteContractsService.recordReceipt).toHaveBeenCalledWith(expect.objectContaining({
      itemId: 'cem', qtyDelivered: 10, qtyAccepted: 8, rejectionReason: 'TEST',
    })))
  })

  it('shows the RPC error instead of swallowing it', async () => {
    siteContractsService.recordReceipt.mockRejectedValueOnce(new Error('You do not have permission to record material deliveries.'))
    const user = userEvent.setup()
    render(<ReceivingForm />)
    await waitFor(() => expect(screen.getByRole('option', { name: /Cement/ })).toBeInTheDocument())
    await user.selectOptions(screen.getByLabelText(/^Item/), 'cem')
    await user.type(screen.getByLabelText(/^Delivered/), '5')
    await user.click(screen.getByRole('button', { name: /record delivery/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent('You do not have permission to record material deliveries.')
  })

  it('receiptFormProblem enforces the reason rule', () => {
    const item = { id: 'x', unit: 'bags' }
    const base = { delivered: '10', accepted: '', reason: '', receivedOn: '2026-12-21' }
    expect(receiptFormProblem(base, item)).toBeNull()
    expect(receiptFormProblem({ ...base, accepted: '8' }, item)).toMatch(/reason/)
    expect(receiptFormProblem({ ...base, accepted: '8', reason: 'wet' }, item)).toBeNull()
    expect(receiptFormProblem({ ...base, accepted: '11' }, item)).toMatch(/between 0/)
    expect(receiptFormProblem(base, null)).toMatch(/item/)
  })
})
