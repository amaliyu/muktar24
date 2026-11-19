import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { AssignedSiteProvider } from '../AssignedSite'
import { ReceivingForm } from './MaterialReceiving'
import LinkedDeliveries from './LinkedDeliveries'
import { siteContractsService } from '../../services/siteContracts'

const f = vi.hoisted(() => ({
  calls: [], options: [], receipts: [], error: null, deliveryError: null, embedError: null,
  site: { id: 'site', name: 'Test site', site_type: 'factory' },
  items: [
    { id: 'diesel', name: 'APCL diesel', unit: 'litres', owner: 'apcl', material: 'diesel' },
    { id: 'cement', name: 'APCL cement', unit: 'bags', owner: 'apcl', material: 'cement' },
    { id: 'client', name: 'Client cement', unit: 'bags', owner: 'client', material: 'cement' },
  ],
}))
vi.mock('../../lib/supabase', async () => {
  const { createSupabaseMock } = await import('../../test/supabaseMock')
  const mock = createSupabaseMock((table, ops) => {
    if (table === 'rpc:my_assigned_site') return { data: f.site.id }
    if (table === 'rpc:site_open_material_requests') return { data: f.options, error: f.error }
    if (table === 'rpc:record_material_receipt') {
      f.options = f.options.filter(request => request.id !== ops.p_payment_request_id || request.status !== 'disbursed')
      return { data: 'saved' }
    }
    if (table === 'production_sites') return { data: [f.site] }
    if (table === 'inventory_items') return { data: f.items }
    if (table === 'material_receipts') {
      if (ops.some(op => op[1] === 'payment_request_id')) return { data: f.receipts, error: f.deliveryError }
      const embed = ops.some(op => op[0] === 'select' && op[1].includes('payment_request:'))
      return { data: f.receipts, error: embed ? f.embedError : null }
    }
    return { data: [] }
  })
  f.calls = mock.calls
  return { supabase: mock.supabase }
})

const denied = { code: '42501', message: 'permission denied for material_receipts' }
const fuel = { id: 'fuel', reference: 'PR-FUEL', category: 'Production Fuel', amount: 40000, purpose: 'Diesel for generator', status: 'disbursed' }
const raw = { id: 'raw', reference: 'PR-RAW', category: 'Raw Materials', amount: 2000, payee_name: 'Cement supplier', status: 'md_approved' }
const change = (field, value) => fireEvent.change(field, { target: { value } })
const picker = () => screen.getByLabelText('Paid by payment request')
const rpc = name => f.calls.find(call => call.rpc === name)?.args
const selectItem = async (name) => {
  const option = await screen.findByRole('option', { name })
  change(option.parentElement, option.value)
}
const openForm = () => render(<AssignedSiteProvider><ReceivingForm /></AssignedSiteProvider>)
const save = async () => {
  change(screen.getByLabelText(/^Delivered/), '10')
  fireEvent.click(screen.getByRole('button', { name: 'Record delivery' }))
  await waitFor(() => expect(rpc('record_material_receipt')).toBeDefined())
  await screen.findByText(/Delivery recorded/)
  return rpc('record_material_receipt')
}

beforeEach(() => {
  f.calls.length = 0
  f.options = [fuel, raw]
  f.receipts = []
  f.error = f.deliveryError = f.embedError = null
})
afterEach(cleanup)

it('only shows fuel requests for diesel, explains paid closure, and refreshes after saving the link', async () => {
  openForm()
  await selectItem(/APCL diesel/)
  await screen.findByRole('option', { name: 'PR-FUEL — ₦40,000 — Diesel for generator (Paid)' })
  expect(rpc('site_open_material_requests')).toEqual({ p_site_id: f.site.id })
  expect(screen.queryByRole('option', { name: /PR-RAW/ })).not.toBeInTheDocument()
  change(picker(), 'fuel')
  expect(screen.getByText('Saving this will close PR-FUEL.')).toBeInTheDocument()
  expect(await save()).toHaveProperty('p_payment_request_id', 'fuel')
  await selectItem(/APCL diesel/)
  await screen.findByText('No approved or paid requests for this material at this site.')
  expect(picker()).toBeDisabled()
  expect(f.calls.filter(call => call.rpc === 'site_open_material_requests')).toHaveLength(2)
})

it('only shows raw material requests for cement and leaves Not linked out of the payload', async () => {
  openForm()
  await selectItem(/APCL cement/)
  await screen.findByRole('option', { name: 'PR-RAW — ₦2,000 — Cement supplier (Approved)' })
  expect(screen.queryByRole('option', { name: /PR-FUEL/ })).not.toBeInTheDocument()
  change(picker(), 'raw')
  change(picker(), '')
  expect(picker()).toHaveValue('')
  expect(await save()).not.toHaveProperty('p_payment_request_id')
})

it('hides the picker for client-owned material and omits the link', async () => {
  openForm()
  await selectItem(/Client cement/)
  expect(screen.queryByLabelText('Paid by payment request')).not.toBeInTheDocument()
  expect(await save()).not.toHaveProperty('p_payment_request_id')
})

it('clears the link when the item changes', async () => {
  openForm()
  await selectItem(/APCL diesel/)
  await screen.findByRole('option', { name: /PR-FUEL/ })
  change(picker(), 'fuel')
  await selectItem(/APCL cement/)
  await selectItem(/APCL diesel/)
  expect(picker()).toHaveValue('')
  expect(await save()).not.toHaveProperty('p_payment_request_id')
})

it('shows the request lookup error and Retry while allowing an unlinked save', async () => {
  f.error = { message: 'Could not load payment requests.' }
  openForm()
  await selectItem(/APCL diesel/)
  await screen.findByText(f.error.message)
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
  await waitFor(() => expect(f.calls.filter(call => call.rpc === 'site_open_material_requests')).toHaveLength(2))
  expect(await save()).not.toHaveProperty('p_payment_request_id')
})

it('shows linked deliveries in tonnes with their value and marks voided rows', async () => {
  f.receipts = [{ id: 'delivery', received_on: '2026-11-19', qty_accepted: 2500, unit_cost: 17,
    truck_or_waybill_ref: 'WB-4', received_by_name: 'Site Manager', voided: true,
    item: { name: 'Dust', unit: 'kg' } }]
  render(<LinkedDeliveries requestId="fuel" category="Production Fuel" />)
  expect(await screen.findByRole('region', { name: 'Deliveries' })).toBeInTheDocument()
  expect(await screen.findByText('2.5 t · ₦42,500')).toBeInTheDocument()
  expect(screen.getByText('Dust')).toBeInTheDocument()
  expect(screen.getByText('Waybill: WB-4')).toBeInTheDocument()
  expect(screen.getByText('Received by Site Manager')).toBeInTheDocument()
  expect(screen.getByText('Voided')).toBeInTheDocument()
  expect(f.calls.find(call => call.table === 'material_receipts').ops).toEqual(expect.arrayContaining([
    ['eq', 'payment_request_id', 'fuel'], ['order', 'received_on'],
  ]))
})

it('skips unrelated categories and hides deliveries after a permission error', async () => {
  const { rerender } = render(<LinkedDeliveries requestId="fuel" category="Transport" />)
  expect(screen.queryByRole('region')).not.toBeInTheDocument()
  expect(f.calls).toHaveLength(0)
  f.deliveryError = denied
  rerender(<LinkedDeliveries requestId="fuel" category="Production Fuel" />)
  await waitFor(() => expect(f.calls).toHaveLength(1))
  await waitFor(() => expect(screen.queryByRole('region')).not.toBeInTheDocument())
  expect(screen.queryByText(denied.message)).not.toBeInTheDocument()
})

it('falls back to the receipt rows if the reference embed is denied', async () => {
  f.receipts = [{ id: 'r', payment_request_id: 'fuel' }]
  f.embedError = denied
  await expect(siteContractsService.listReceipts({ siteId: f.site.id })).resolves.toEqual(f.receipts)
  expect(f.calls.map(call => call.ops.find(op => op[0] === 'select')[1])).toEqual([
    '*, item:item_id(name, unit, owner, material), payment_request:payment_request_id(reference)',
    '*, item:item_id(name, unit, owner, material)',
  ])
})
