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
    listSiteItems: vi.fn(async () => [
      { id: 'cem', name: 'Cement', unit: 'bags', owner: 'apcl', site_id: 'dutse' },
      { id: 'dust', name: 'Granite dust', unit: 'kg', material: 'dust' },
      { id: 'chips', name: 'Chippings', unit: 'kg', material: 'chippings' },
      { id: 'other', name: 'Other stock', unit: 'kg', material: 'other' },
    ]),
    recordReceipt: vi.fn(async () => 'new-id'),
    uploadPhoto: vi.fn(),
  },
}))

import { ReceivingForm, receiptFormProblem } from './MaterialReceiving'
import { siteContractsService } from '../../services/siteContracts'

describe('ReceivingForm', () => {
  beforeEach(() => vi.clearAllMocks())

  it('resets the selector to each item’s default unit', async () => {
    const user = userEvent.setup()
    render(<ReceivingForm />)
    await screen.findByRole('option', { name: /Granite dust/ })
    const item = screen.getByLabelText(/^Item/)

    await user.selectOptions(item, 'dust')
    const unit = screen.getByLabelText('Unit')
    expect(unit).toHaveValue('tonnes')
    await user.selectOptions(unit, 'kg')
    await user.selectOptions(item, 'chips')
    expect(unit).toHaveValue('tonnes')
    await user.selectOptions(item, 'other')
    expect(unit).toHaveValue('kg')
    await user.selectOptions(unit, 'tonnes')
    await user.selectOptions(item, 'cem')
    expect(screen.queryByLabelText('Unit')).not.toBeInTheDocument()
    await user.selectOptions(item, 'other')
    expect(screen.getByLabelText('Unit')).toHaveValue('kg')
  })

  it('shows the stored kilograms and saves both weights from tonnes', async () => {
    const user = userEvent.setup()
    render(<ReceivingForm />)
    await screen.findByRole('option', { name: /Granite dust/ })
    await user.selectOptions(screen.getByLabelText(/^Item/), 'dust')
    await user.type(screen.getByLabelText(/^Delivered/), '30')
    expect(screen.getByText('= 30,000 kg will be stored')).toBeInTheDocument()
    await user.type(screen.getByLabelText(/^Accepted/), '29.5')
    await user.type(screen.getByLabelText(/^Rejection reason/), 'Wet')
    await user.click(screen.getByRole('button', { name: /record delivery/i }))
    expect(siteContractsService.recordReceipt).toHaveBeenCalledWith(expect.objectContaining({
      itemId: 'dust', qtyDelivered: 30000, qtyAccepted: 29500,
    }))
  })

  it.each(['dust', 'chips'])('requires confirmation before saving a small kilogram delivery for %s', async (itemId) => {
    const user = userEvent.setup()
    render(<ReceivingForm />)
    await screen.findByRole('option', { name: /Granite dust/ })
    await user.selectOptions(screen.getByLabelText(/^Item/), itemId)
    await user.selectOptions(screen.getByLabelText('Unit'), 'kg')
    const delivered = screen.getByLabelText(/^Delivered/)
    await user.type(delivered, '30')
    expect(screen.getByText('= 0.03 t')).toBeInTheDocument()

    const submit = screen.getByRole('button', { name: /record delivery/i })
    await user.click(submit)
    expect(screen.getByText('You entered 30 kg (0.03 t). Dust and chippings usually arrive by the tonne. Is 30 kg correct?')).toBeInTheDocument()
    expect(submit).toBeDisabled()
    expect(siteContractsService.recordReceipt).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Change it' }))
    expect(delivered).toBeEnabled()
    expect(delivered).toHaveValue(30)
    expect(siteContractsService.recordReceipt).not.toHaveBeenCalled()

    await user.click(submit)
    await user.click(screen.getByRole('button', { name: 'Yes, 30 kg' }))
    expect(siteContractsService.recordReceipt).toHaveBeenCalledTimes(1)
    expect(siteContractsService.recordReceipt).toHaveBeenCalledWith(expect.objectContaining({
      itemId, qtyDelivered: 30, qtyAccepted: 30,
    }))
  })

  it.each([['dust', '100'], ['other', '30']])('saves %s at %s kg without a prompt', async (itemId, quantity) => {
    const user = userEvent.setup()
    render(<ReceivingForm />)
    await screen.findByRole('option', { name: /Granite dust/ })
    await user.selectOptions(screen.getByLabelText(/^Item/), itemId)
    await user.selectOptions(screen.getByLabelText('Unit'), 'kg')
    await user.type(screen.getByLabelText(/^Delivered/), quantity)
    await user.click(screen.getByRole('button', { name: /record delivery/i }))
    expect(siteContractsService.recordReceipt).toHaveBeenCalledWith(expect.objectContaining({
      itemId, qtyDelivered: Number(quantity), qtyAccepted: Number(quantity),
    }))
  })

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
