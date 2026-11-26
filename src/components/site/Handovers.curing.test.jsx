import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import Handovers from './Handovers'
import { siteContractsService } from '../../services/siteContracts'
const f = vi.hoisted(() => ({ rows: [] }))
const stock = { applies: true, min_cure_days: 14, cutoff: '2026-11-12', available: 70, next_ready_on: '2026-11-30', next_ready_qty: 314 }
vi.mock('../../lib/supabase', () => ({ supabase: {} }))
const change = (label, value) => fireEvent.change(screen.getByLabelText(label), { target: { value } })
const save = () => screen.getByRole('button', { name: 'Record handover' })
async function form(qty = 200) {
  render(<Handovers userProfile={{ role: 'md' }} />)
  await screen.findByRole('option', { name: '9 Inch Block' })
  change('Block type *', '9 Inch Block')
  change('Quantity handed over *', String(qty))
  await screen.findByRole('option', { name: 'Truck' })
  change('Truck', 'v')
  change(/Waybill no/, 'WB1')
  await waitFor(() => expect(siteContractsService.curedStock).toHaveBeenCalled())
}
vi.mock('../../services/siteContracts', () => ({
  lagosToday: () => '2026-11-26',
  siteContractsService: {
    curedStock: vi.fn(), createHandover: vi.fn(),
    listHandovers: vi.fn(async () => f.rows),
    listYard: vi.fn(async () => [{ site_id: 'site', block_type: '9 Inch Block', in_yard: 0 }]),
    transportOptions: vi.fn(async () => ({ vehicles: [{ id: 'v', label: 'Truck', driver_id: 'd', loader_ids: ['l'] }], drivers: [{ id: 'd', name: 'Driver' }], loaders: [{ id: 'l', name: 'Loader' }] })),
    findByWaybill: vi.fn(async () => []),
  },
}))
vi.mock('../../services/products', () => ({ productsService: { getActive: vi.fn(async () => [{ id: 'p', name: '9 Inch Block' }, { id: 'p2', name: '6 Inch Block' }]) } }))
vi.mock('../../services/storage', () => ({ getSignedDocUrl: vi.fn() }))
vi.mock('../SitePicker', () => ({
  useSites: () => ({ sites: [{ id: 'site', name: 'Kado', site_type: 'client_site' }, { id: 'other', name: 'Life Camp', site_type: 'client_site' }] }),
}))
beforeEach(() => {
  vi.clearAllMocks(); f.rows = []
  siteContractsService.curedStock.mockResolvedValue(stock)
  siteContractsService.createHandover.mockResolvedValue({ id: 'saved' })
})
afterEach(cleanup)
it('shows ready stock, next date, and requires a trimmed 10-character early reason', async () => {
  await form()
  expect(await screen.findByText(/Ready to hand over/)).toHaveTextContent('Ready to hand over (14+ days old): 70. Next 314 ready on')
  expect(screen.getByText(/Only 70 blocks here/)).toHaveTextContent('130 of these 200 would be younger than 14 days.')
  expect(save()).toBeDisabled()
  change('Reason for handing over early', '  short  ')
  expect(save()).toBeDisabled()
  change('Reason for handing over early', '  Client needs blocks today  ')
  expect(save()).toBeEnabled()
  fireEvent.click(save())
  await waitFor(() => expect(siteContractsService.createHandover).toHaveBeenCalledWith(expect.objectContaining({ early_reason: 'Client needs blocks today', qty_handed_over: 200 })))
  await waitFor(() => expect(siteContractsService.curedStock).toHaveBeenCalledTimes(2))
  expect(screen.queryByRole('button', { name: 'Save anyway' })).toBeNull()
  expect(screen.queryByLabelText('Reason for handing over early')).toBeNull()
})
it('within ready stock clears the reason, sends null and skips the old yard warning', async () => {
  await form()
  expect(await screen.findByText(/Ready to hand over/)).toHaveTextContent('Next 314 ready on')
  await screen.findByLabelText('Reason for handing over early')
  change('Reason for handing over early', 'Previously entered reason')
  change('Quantity handed over *', '70')
  expect(screen.queryByLabelText('Reason for handing over early')).toBeNull()
  change('Quantity handed over *', '200')
  expect(screen.getByLabelText('Reason for handing over early')).toHaveValue('')
  change('Quantity handed over *', '70')
  fireEvent.click(save())
  await waitFor(() => expect(siteContractsService.createHandover).toHaveBeenCalledWith(expect.objectContaining({ early_reason: null })))
  expect(screen.queryByText('Yard balance too low')).toBeNull()
  expect(screen.queryByText(/More than the/)).toBeNull()
})
it.each(['error', 'does not apply'])('falls back to the yard warning when cured stock %s', async kind => {
  if (kind === 'error') siteContractsService.curedStock.mockRejectedValue(new Error('Curing lookup failed'))
  else siteContractsService.curedStock.mockResolvedValue({ applies: false })
  await form()
  if (kind === 'error') expect(await screen.findByText('Curing lookup failed')).toBeInTheDocument()
  await waitFor(() => expect(save()).toBeEnabled())
  fireEvent.click(save())
  fireEvent.click(await screen.findByRole('button', { name: 'Save anyway' }))
  await waitFor(() => expect(siteContractsService.createHandover).toHaveBeenCalledWith(expect.objectContaining({ early_reason: null })))
})
it('shows database curing errors verbatim', async () => {
  const message = 'Only 70 blocks here are 14 days old. Give a reason for handing over early.'
  siteContractsService.createHandover.mockRejectedValue(new Error(message))
  await form(70)
  await waitFor(() => expect(save()).toBeEnabled())
  fireEvent.click(save())
  expect(await screen.findByText(message)).toBeInTheDocument()
})
it('shows under-14-days quantities and the stored reason or fallback', async () => {
  f.rows = [
    { id: 'h', site_id: 'site', handover_date: '2026-11-26', block_type: '9 Inch Block', qty_handed_over: 200, under_cure_qty: 130, early_reason: 'Client requested urgent delivery' },
    { id: 'h2', site_id: 'site', handover_date: '2026-11-26', block_type: '9 Inch Block', qty_handed_over: 20, under_cure_qty: 20 },
  ]
  render(<Handovers userProfile={{ role: 'md' }} />)
  expect(await screen.findByText('130 under 14 days — Client requested urgent delivery')).toBeInTheDocument()
  expect(screen.getByText('20 under 14 days — no reason given')).toBeInTheDocument()
})
it.each(['Block type *', 'Site *', 'Handover date *'])('clears the early reason when %s changes', async label => {
  await form()
  await screen.findByLabelText('Reason for handing over early')
  change('Reason for handing over early', 'A reason from the old selection')
  const input = screen.getByLabelText(label)
  fireEvent.change(input, { target: { value: label === 'Site *' ? 'other' : label === 'Block type *' ? '6 Inch Block' : '2026-11-25' } })
  await waitFor(() => expect(screen.getByLabelText('Reason for handing over early')).toHaveValue(''))
})
it('ignores a stale cured-stock response after the block type changes', async () => {
  let finish
  siteContractsService.curedStock.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  await form()
  expect(save()).toBeDisabled()
  change('Block type *', '6 Inch Block')
  expect(await screen.findByText(/Ready to hand over/)).toHaveTextContent('70.')
  await act(async () => { finish({ ...stock, available: 9999 }) })
  expect(screen.getByText(/Ready to hand over/)).toHaveTextContent('70.')
  expect(screen.getByLabelText('Reason for handing over early')).toBeInTheDocument()
})
