import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { Production } from './App'
import { AssignedSiteProvider } from './components/AssignedSite'
import { ReceivingForm } from './components/site/MaterialReceiving'
import Handovers from './components/site/Handovers'
import { DUTSE_SITE_ID } from './services/sites'
import { lagosToday } from './utils/lateEntry'

const fixture = vi.hoisted(() => ({
  site: '00000000-0000-4000-8000-000000000003',
  siteName: 'Life Camp Site (Bilaad)',
  kado: '00000000-0000-4000-8000-000000000002',
  blockType: '9 Inch 3 Hole Block',
  calls: [],
  assignment: null,
  production: [],
  marked: false,
  lockError: null,
  warnings: [],
}))
vi.mock('pdfjs-dist', () => ({ GlobalWorkerOptions: {} }))
vi.mock('./lib/supabase', async () => {
  const { createSupabaseMock } = await import('./test/supabaseMock')
  const mock = createSupabaseMock((table, ops) => {
    if (table === 'rpc:my_assigned_site') return fixture.assignment()
    if (table === 'rpc:clear_site_day_status') { fixture.marked = false; return { data: null, error: null } }
    if (table === 'production_log' && fixture.lockError && ops.some(op => op[0] === 'insert')) {
      return { data: null, error: { message: fixture.lockError } }
    }
    if (table === 'production_log' && fixture.marked && ops.some(op => op[0] === 'insert')) {
      return { data: null, error: { message: 'DAY_MARKED: Remove the day status before saving.' } }
    }
    if (table === 'rpc:app_flag') return { data: true, error: null }
    if (table === 'rpc:record_material_receipt') return { data: 'receipt', error: null }
    if (ops.some(op => op[0] === 'insert')) return { data: { id: 'inserted' }, error: null }
    if (ops.some(op => op[0] === 'update')) return { data: [{ id: 'updated' }], error: null }
    const rows = {
      production_sites: [
        { id: '00000000-0000-4000-8000-000000000001', name: 'Dutse Factory', site_type: 'factory' },
        { id: fixture.kado, name: 'Kado Site (Sequoia)', site_type: 'client_site' },
        { id: fixture.site, name: fixture.siteName, site_type: 'client_site' },
      ],
      site_block_standards: [
        { site_id: fixture.site, block_type: fixture.blockType, dust_kg_per_block: 18 },
        { site_id: fixture.kado, block_type: fixture.blockType, dust_kg_per_block: 23 },
      ],
      assets: [{ id: 'life-camp-machine', site_id: fixture.site, name: 'Bilaad machine', code: 'LC-1' }],
      products: [{ id: 'product', name: fixture.blockType, category: 'Blocks' }],
      production_log: fixture.production,
      production_exceptions: fixture.warnings,
      inventory_items: [
        { id: 'bilaad-cement', name: 'Bilaad cement', site_id: fixture.site, unit: 'bags', owner: 'client' },
        { id: 'kado-dust', name: 'Kado dust', site_id: fixture.kado, unit: 'kg', owner: 'apcl', material: 'dust' },
        { id: 'dutse-cement', name: 'Dutse cement', site_id: '00000000-0000-4000-8000-000000000001', unit: 'bags', owner: 'apcl' },
      ],
      v_site_yard: [{ site_id: fixture.site, site_name: fixture.siteName, block_type: fixture.blockType, in_yard: 100 }],
    }[table] || []
    const filters = ops.filter(op => op[0] === 'eq' && op[1] === 'site_id')
    return { data: rows.filter(row => filters.every(([, key, value]) => row[key] === value)), error: null }
  })
  fixture.calls = mock.calls
  return { supabase: mock.supabase }
})

const profile = { id: 'manager', role: 'production_manager' }
const change = (input, value) => fireEvent.change(input, { target: { value } })
const addProduction = () => screen.findByRole('button', { name: /Log Today's Production/ })
const showProduction = async () => fireEvent.click(await addProduction())
const session = children => <AssignedSiteProvider>{children}</AssignedSiteProvider>
const siteQuery = (table, id) => fixture.calls.some(call => call.table === table
  && call.ops.some(op => op[0] === 'eq' && op[1] === 'site_id' && op[2] === id))
beforeEach(() => {
  fixture.calls.length = 0
  fixture.assignment = () => ({ data: fixture.site, error: null })
  fixture.production = []
  fixture.marked = false
  fixture.lockError = null
  fixture.warnings = []
})
afterEach(cleanup)

it('waits for assignment, then opens Production on the assigned site with its machine and dust standard', async () => {
  const onOpen = vi.fn()
  const warning = { site_id: fixture.site, date: lagosToday(), status: 'open', direction: 'over' }
  fixture.warnings = [
    { ...warning, id: 'cement-warning', parameter: 'cement', variance_pct: 40 },
    { ...warning, id: 'diesel-warning', parameter: 'diesel', variance_pct: 87.5 },
  ]
  let resolve
  fixture.assignment = () => new Promise(r => { resolve = r })
  const { container } = render(session(<Production userProfile={profile} onOpenBudgetWarnings={onOpen} />))
  expect(screen.getByRole('status')).toHaveTextContent('Loading assigned site')
  expect(screen.queryByRole('button', { name: /Log Today's Production/ })).not.toBeInTheDocument()
  expect(siteQuery('assets', DUTSE_SITE_ID)).toBe(false)
  await waitFor(() => expect(resolve).toBeTypeOf('function'))
  resolve({ data: fixture.site, error: null })
  await showProduction()
  const form = screen.getByText('New Production Entry').parentElement
  expect(await within(form).findByText(fixture.siteName)).toBeInTheDocument()
  expect(within(form).queryByRole('option', { name: 'Dutse Factory' })).not.toBeInTheDocument()
  expect(await within(form).findByRole('option', { name: /Bilaad machine/ })).toBeInTheDocument()
  expect(await within(form).findByText(/Dust and 3\/8 are calculated by the app/)).toBeInTheDocument()
  expect(within(form).queryByText('Chippings (kg)')).not.toBeInTheDocument()
  expect(within(form).getByText('Total blocks produced (including broken)')).toBeInTheDocument()
  expect(container.querySelector('#production-granite')).toBeNull()
  change(form.querySelector('input[type=date]'), lagosToday())
  change(within(form).getByPlaceholderText('e.g. 850'), '20')
  fireEvent.click(within(form).getByRole('button', { name: 'Save Entry' }))
  const productionInsert = () => fixture.calls.find(call => call.table === 'production_log'
    && call.ops.some(op => op[0] === 'insert'))?.ops.find(op => op[0] === 'insert')[1]
  await waitFor(() => expect(productionInsert()).toMatchObject({ site_id: fixture.site, asset_id: 'life-camp-machine' }))
  expect(productionInsert()).not.toHaveProperty('granite_dust_kg')
  expect(productionInsert()).not.toHaveProperty('chippings_kg')
  expect(await screen.findByText(/Budget warning for .*: Cement \+40% · Diesel \+87\.5%/)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Explain now' }))
  expect(onOpen).toHaveBeenCalledWith({ id: 'cement-warning', siteId: fixture.site, action: 'explain' })
  expect(fixture.calls.find(call => call.table === 'production_exceptions').ops).toEqual(expect.arrayContaining([
    ['eq', 'site_id', fixture.site], ['eq', 'date', lagosToday()], ['in', 'status', ['open']],
  ]))
  expect(siteQuery('assets', DUTSE_SITE_ID)).toBe(false)
})

it('keeps the assigned site locked when editing an existing production entry', async () => {
  fixture.production = [{
    id: 'existing', date: lagosToday(), site_id: fixture.site, asset_id: 'life-camp-machine',
    block_type: fixture.blockType, quantity_produced: 20,
  }]
  render(session(<Production userProfile={profile} />))
  fireEvent.click(await screen.findByRole('button', { name: 'Edit' }))
  const form = screen.getByText('Edit Production Entry').parentElement
  expect(await within(form).findByText(fixture.siteName)).toBeInTheDocument()
  expect(within(form).queryByRole('option', { name: 'Dutse Factory' })).not.toBeInTheDocument()
  expect(await within(form).findByText(/Dust and 3\/8 are calculated by the app/)).toBeInTheDocument()
})

it('keeps the Dutse default and the Production site control for an unassigned user', async () => {
  fixture.assignment = () => ({ data: null, error: null })
  render(session(<Production userProfile={profile} />))
  await showProduction()
  const form = screen.getByText('New Production Entry').parentElement
  const site = await within(form).findByRole('option', { name: 'Dutse Factory' })
  expect(site.parentElement).toHaveValue(DUTSE_SITE_ID)
  expect(within(form).getByText('Quantity Produced')).toBeInTheDocument()
  expect(await within(form).findByLabelText('Granite dust (kg)')).toBeInTheDocument()
  expect(within(form).getByText('Chippings (kg)')).toBeInTheDocument()
})

it('shows the assignment RPC error and blocks the Production form and its reads', async () => {
  fixture.assignment = () => ({ data: null, error: { message: 'Assignment lookup refused' } })
  render(session(<Production userProfile={profile} />))
  expect(await screen.findByRole('alert')).toHaveTextContent('Assignment lookup refused')
  expect(screen.queryByRole('button', { name: /Log Today's Production|Save Entry/ })).not.toBeInTheDocument()
  expect(fixture.calls.some(call => call.table === 'production_log' || call.table === 'assets')).toBe(false)
})

it('uses one assignment request across Receiving and Handovers and locks both entry sites', async () => {
  const { rerender } = render(session(<ReceivingForm />))
  const receipt = await screen.findByRole('form', { name: 'Record a delivery' })
  expect(await within(receipt).findByText(fixture.siteName)).toBeInTheDocument()
  expect(within(receipt).queryByRole('option', { name: 'Dutse Factory' })).not.toBeInTheDocument()
  const cement = await within(receipt).findByRole('option', { name: /Bilaad cement/ })
  change(cement.parentElement, cement.value)
  expect(within(receipt).queryByLabelText(/Price per/)).not.toBeInTheDocument()
  change(within(receipt).getByLabelText(/^Delivered/), '10')
  fireEvent.click(within(receipt).getByRole('button', { name: 'Record delivery' }))
  await waitFor(() => expect(fixture.calls.find(call => call.rpc === 'record_material_receipt')?.args)
    .toMatchObject({ p_item_id: 'bilaad-cement' }))
  expect(siteQuery('inventory_items', fixture.site)).toBe(true)
  expect(siteQuery('inventory_items', DUTSE_SITE_ID)).toBe(false)

  rerender(session(<Handovers userProfile={profile} />))
  const handover = await screen.findByRole('form', { name: 'Record a handover' })
  expect(await within(handover).findByText(fixture.siteName)).toBeInTheDocument()
  expect(handover.querySelector('select#ho-site')).toBeNull()
  const block = await within(handover).findByRole('option', { name: fixture.blockType })
  change(block.parentElement, block.value)
  change(within(handover).getByLabelText(/Quantity handed over/), '10')
  fireEvent.click(within(handover).getByRole('button', { name: 'Record handover' }))
  await waitFor(() => expect(fixture.calls.find(call => call.table === 'block_handovers'
    && call.ops.some(op => op[0] === 'insert'))?.ops.find(op => op[0] === 'insert')[1])
    .toMatchObject({ site_id: fixture.site }))
  expect(fixture.calls.filter(call => call.rpc === 'my_assigned_site')).toHaveLength(1)
})

it('shows Kado’s automatic aggregate rate and hides both manual fields', async () => {
  fixture.assignment = () => ({ data: fixture.kado, error: null })
  render(session(<Production userProfile={profile} />))
  await showProduction()
  const form = screen.getByText('New Production Entry').parentElement
  expect(await within(form).findByText('Dust and 3/8 are calculated by the app (23 kg per 9-inch block)')).toBeInTheDocument()
  expect(within(form).queryByText('Chippings (kg)')).not.toBeInTheDocument()
  expect(within(form).queryByLabelText('Granite dust (kg)')).not.toBeInTheDocument()
})

it('requires Kado dust pricing and uses the accepted tonnes to show the total', async () => {
  fixture.assignment = () => ({ data: fixture.kado, error: null })
  render(session(<ReceivingForm />))
  const dust = await screen.findByRole('option', { name: /Kado dust/ })
  change(dust.parentElement, dust.value)
  change(screen.getByLabelText(/^Delivered/), '3')
  change(screen.getByLabelText(/^Accepted/), '2.5')
  change(screen.getByLabelText(/^Rejection reason/), 'Wet portion')
  const price = screen.getByLabelText('Price per tonne (₦)')
  const save = screen.getByRole('button', { name: 'Record delivery' })
  expect(price).toBeRequired()
  expect(save).toBeDisabled()
  expect(screen.getByText('Enter the price per tonne for this delivery.')).toBeInTheDocument()
  change(price, '17000')
  expect(screen.getByText('Accepted quantity total: ₦42,500')).toBeInTheDocument()
  fireEvent.click(save)
  await waitFor(() => expect(fixture.calls.find(call => call.rpc === 'record_material_receipt')?.args)
    .toMatchObject({ p_qty_accepted: 2500, p_unit_cost: 17 }))
})

it('omits an empty delivery price at Dutse', async () => {
  fixture.assignment = () => ({ data: null, error: null })
  render(session(<ReceivingForm />))
  const cement = await screen.findByRole('option', { name: /Dutse cement/ })
  change(cement.parentElement, cement.value)
  change(screen.getByLabelText(/^Delivered/), '10')
  expect(screen.getByLabelText('Price per bag (₦)')).not.toBeRequired()
  fireEvent.click(screen.getByRole('button', { name: 'Record delivery' }))
  await waitFor(() => expect(fixture.calls.find(call => call.rpc === 'record_material_receipt')?.args).toBeDefined())
  expect(fixture.calls.find(call => call.rpc === 'record_material_receipt').args).not.toHaveProperty('p_unit_cost')
})

it('removes a marked day after the production error and preserves the entry for retry', async () => {
  fixture.marked = true
  const { container } = render(session(<Production userProfile={profile} />))
  await showProduction()
  await screen.findByText(/Dust and 3\/8 are calculated by the app/)
  await screen.findByRole('option', { name: /Bilaad machine/ })
  change(container.querySelector('input[type=date]'), lagosToday())
  change(screen.getByPlaceholderText('e.g. 850'), '20')
  fireEvent.click(screen.getByRole('button', { name: 'Save Entry' }))
  expect(await screen.findByText(/DAY_MARKED:/)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /Remove day status for/ }))
  await waitFor(() => expect(fixture.calls.find(call => call.rpc === 'clear_site_day_status')?.args)
    .toEqual({ p_site_id: fixture.site, p_on_date: lagosToday() }))
  expect(screen.getByPlaceholderText('e.g. 850')).toHaveValue(20)
  fireEvent.click(screen.getByRole('button', { name: 'Save Entry' }))
  expect(await screen.findByText(/Production entry saved/)).toBeInTheDocument()
})

it('shows the complete STOCK_LOCKED message when production is blocked', async () => {
  fixture.lockError = 'STOCK_LOCKED: Kado was counted on 20 Nov. Stock movements dated on or before that day are locked.'
  const { container } = render(session(<Production userProfile={profile} />))
  await showProduction()
  await screen.findByText(/Dust and 3\/8 are calculated by the app/)
  await screen.findByRole('option', { name: /Bilaad machine/ })
  change(container.querySelector('input[type=date]'), lagosToday())
  change(screen.getByPlaceholderText('e.g. 850'), '20')
  fireEvent.click(screen.getByRole('button', { name: 'Save Entry' }))
  expect(await screen.findByText(fixture.lockError, { exact: true })).toBeInTheDocument()
  expect(screen.queryByText(/Failed to save/)).not.toBeInTheDocument()
})
