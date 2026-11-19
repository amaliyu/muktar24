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
  blockType: '9 Inch 3 Hole Block',
  calls: [],
  assignment: null,
  production: [],
  warnings: [],
}))
vi.mock('pdfjs-dist', () => ({ GlobalWorkerOptions: {} }))
vi.mock('./lib/supabase', async () => {
  const { createSupabaseMock } = await import('./test/supabaseMock')
  const mock = createSupabaseMock((table, ops) => {
    if (table === 'rpc:my_assigned_site') return fixture.assignment()
    if (table === 'rpc:app_flag') return { data: true, error: null }
    if (table === 'rpc:record_material_receipt') return { data: 'receipt', error: null }
    if (ops.some(op => op[0] === 'insert')) return { data: { id: 'inserted' }, error: null }
    if (ops.some(op => op[0] === 'update')) return { data: [{ id: 'updated' }], error: null }
    const rows = {
      production_sites: [
        { id: '00000000-0000-4000-8000-000000000001', name: 'Dutse Factory', site_type: 'factory' },
        { id: fixture.site, name: fixture.siteName, site_type: 'client_site' },
      ],
      site_block_standards: [{ site_id: fixture.site, block_type: fixture.blockType, dust_kg_per_block: 18 }],
      assets: [{ id: 'life-camp-machine', site_id: fixture.site, name: 'Bilaad machine', code: 'LC-1' }],
      products: [{ id: 'product', name: fixture.blockType, category: 'Blocks' }],
      production_log: fixture.production,
      production_exceptions: fixture.warnings,
      inventory_items: [{ id: 'bilaad-cement', name: 'Bilaad cement', site_id: fixture.site, unit: 'bags' }],
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
  fixture.warnings = []
})
afterEach(cleanup)

it('waits for assignment, then opens Production on the assigned site with its machine and dust standard', async () => {
  const onOpen = vi.fn()
  fixture.warnings = [{ id: 'cement-warning', site_id: fixture.site, date: lagosToday(), status: 'open', parameter: 'cement', direction: 'over', variance_pct: 40 }]
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
  expect(await within(form).findByText('Dust (calculated):')).toBeInTheDocument()
  expect(within(form).getByText('Dust is calculated automatically — do not convert anything.')).toBeInTheDocument()
  expect(within(form).getByText('Total blocks produced (including broken)')).toBeInTheDocument()
  expect(container.querySelector('#production-granite')).toBeNull()
  change(form.querySelector('input[type=date]'), lagosToday())
  change(within(form).getByPlaceholderText('e.g. 850'), '20')
  fireEvent.click(within(form).getByRole('button', { name: 'Save Entry' }))
  await waitFor(() => expect(fixture.calls.find(call => call.table === 'production_log'
    && call.ops.some(op => op[0] === 'insert'))?.ops.find(op => op[0] === 'insert')[1])
    .toMatchObject({ site_id: fixture.site, asset_id: 'life-camp-machine', granite_dust_kg: 360 }))
  expect(await screen.findByText(/Cement 40% over budget/)).toBeInTheDocument()
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
  expect(await within(form).findByText('Dust (calculated):')).toBeInTheDocument()
})

it('keeps the Dutse default and the Production site control for an unassigned user', async () => {
  fixture.assignment = () => ({ data: null, error: null })
  render(session(<Production userProfile={profile} />))
  await showProduction()
  const form = screen.getByText('New Production Entry').parentElement
  const site = await within(form).findByRole('option', { name: 'Dutse Factory' })
  expect(site.parentElement).toHaveValue(DUTSE_SITE_ID)
  expect(within(form).getByText('Quantity Produced')).toBeInTheDocument()
  expect(within(form).getByLabelText('Granite dust (kg)')).toBeInTheDocument()
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
