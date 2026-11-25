import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Batches, Production, Waybills } from './App'
import { RosterCreateForm } from './components/Labour'
import { DowntimeTab } from './components/Maintenance'
import LateEntries, { LateEntriesCard } from './components/LateEntries'
import Handovers from './components/site/Handovers'
import { ReceivingForm } from './components/site/MaterialReceiving'

const fixture = vi.hoisted(() => ({
  site: '00000000-0000-4000-8000-000000000001',
  type: '9 Inch 3 Hole Block',
  calls: [], reject: null, reviewError: null, count: 0, reviewed: false,
}))
vi.mock('pdfjs-dist', () => ({ GlobalWorkerOptions: {} }))
vi.mock('./lib/supabase', async () => {
  const { createSupabaseMock } = await import('./test/supabaseMock')
  const mock = createSupabaseMock((table, ops) => {
    const write = Array.isArray(ops) && ops.find(op => ['insert', 'update', 'upsert'].includes(op[0]))
    if (write) {
      if (fixture.reject?.table === table) return { data: null, error: fixture.reject.error }
      return { data: ops.some(op => op[0] === 'single') ? { id: 'saved-entry' } : [{ id: 'saved-entry' }], error: null }
    }
    if (table === 'rpc:handover_transport_options') return { data: { vehicles: [{ id: 'v', label: 'Truck', driver_id: 'd' }], drivers: [{ id: 'd', name: 'Driver' }], loaders: [{ id: 'l', name: 'Loader' }] }, error: null }
    if (table === 'rpc:app_flag') return { data: true, error: null }
    if (table === 'rpc:record_material_receipt') return { data: 'saved-entry', error: null }
    if (table === 'rpc:review_late_entry') {
      if (fixture.reviewError) return { error: fixture.reviewError }
      fixture.reviewed = true
      return { error: null }
    }
    if (table === 'late_entries') {
      if (ops.some(op => op[0] === 'select' && op[2]?.head)) return { count: fixture.count, error: null }
      return { data: fixture.reviewed ? [] : [{
        id: 'review-1', site_id: fixture.site, table_name: 'production_log', entry_date: '2026-11-16',
        entered_at: '2026-11-18T10:00:00Z', days_late: 2, entered_by_name: 'Test employee',
      }], error: null }
    }
    if (table === 'inventory_items') return { data: [{
      id: 'cement', name: 'Test cement', unit: 'bags', site_id: fixture.site,
    }], error: null }
    return { data: [], error: null }
  })
  fixture.calls = mock.calls
  return { supabase: mock.supabase }
})
vi.mock('./components/SitePicker', () => {
  const sites = [{ id: fixture.site, name: 'Test client site', site_type: 'client_site' }]
  return {
    useSites: () => ({ sites }),
    default: ({ id, value, onChange }) => <select id={id} value={value} onChange={e => onChange(e.target.value)}>
      <option value="">All sites</option><option value={fixture.site}>Test client site</option>
    </select>,
  }
})
vi.mock('./services/sites', async importOriginal => {
  const actual = await importOriginal()
  return { ...actual, sitesService: { ...actual.sitesService, getMachines: async () => [] } }
})
vi.mock('./services/products', () => ({
  productsService: { getActive: async () => [{ id: 'product', name: fixture.type, category: 'Blocks' }] },
}))
vi.mock('./services/batches', async importOriginal => {
  const actual = await importOriginal()
  return { batchesService: { ...actual.batchesService, getAll: async () => [{
    id: 'batch', batch_number: 'TEST-BATCH', site_id: fixture.site,
    block_type: fixture.type, status: 'active', qty_accepted: 100, qty_remaining: 100, links: [],
  }] } }
})
vi.mock('./services/deliveries', async importOriginal => {
  const actual = await importOriginal()
  return { waybillsService: { ...actual.waybillsService, getAll: async () => [{
    id: 'waybill', waybill_number: 'TEST-WB', block_type: fixture.type,
    waybill_date: '2026-11-15', quantity_loaded: 50, quantity_received: 50, quantity_damaged: 0,
  }] } }
})

const profile = { id: 'user', role: 'md' }
const explanation = 'The shift report arrived late.'
const reasonLabel = "Why wasn't this recorded on time?"
const set = (input, value) => fireEvent.change(input, { target: { value } })
const button = name => screen.getByRole('button', { name, exact: true })
const writes = table => fixture.calls.flatMap(call => call.table === table
  ? call.ops.filter(op => ['insert', 'update'].includes(op[0])).map(op => op[1]) : [])

beforeEach(() => {
  vi.setSystemTime(new Date('2026-11-18T10:00:00Z'))
  fixture.calls.length = 0
  fixture.reject = null
  fixture.count = 0
  fixture.reviewed = false
  fixture.reviewError = null
})
afterEach(() => { cleanup(); vi.useRealTimers() })

function enterLateReason(input, save, time = '') {
  set(input, '2026-11-17' + time)
  expect(screen.queryByLabelText(reasonLabel)).not.toBeInTheDocument()
  set(input, '2026-11-16' + time)
  expect(screen.getByText('This entry is for 2026-11-16, 2 days ago.')).toBeInTheDocument()
  expect(save).toBeDisabled()
  set(screen.getByLabelText(reasonLabel), '   too short  ')
  expect(save).toBeDisabled()
  set(screen.getByLabelText(reasonLabel), explanation)
  expect(save).toBeEnabled()
}

async function openProduction() {
  const { container } = render(<Production userProfile={profile} />)
  fireEvent.click(await screen.findByRole('button', { name: /Log Today's Production/ }))
  await screen.findByText('No active machine at this site')
  set(screen.getByPlaceholderText('e.g. 850'), '100')
  return container.querySelector('input[type=date]')
}

it('production requires and writes a reason for a late entry', async () => {
  const date = await openProduction()
  expect(date).toHaveAttribute('max', '2026-11-18')
  const save = button('Save Entry')
  enterLateReason(date, save)
  fireEvent.click(save)
  await waitFor(() => expect(writes('production_log')[0]).toMatchObject({ late_reason: explanation }))
})

it('production shows the database LATE_ENTRY message with an empty reason field and retries', async () => {
  const date = await openProduction()
  const save = button('Save Entry')
  set(date, '2026-11-17')
  const message = 'LATE_ENTRY: Enter a reason for this date.'
  fixture.reject = { table: 'production_log', error: { message } }
  fireEvent.click(save)
  expect(await screen.findByRole('alert')).toHaveTextContent(message)
  expect(writes('production_log')[0]).not.toHaveProperty('late_reason')
  const reason = screen.getByLabelText(reasonLabel)
  expect(reason).toHaveValue('')
  expect(save).toBeDisabled()
  fixture.reject = null
  set(reason, explanation)
  fireEvent.click(save)
  await waitFor(() => expect(writes('production_log')[1]).toMatchObject({ late_reason: explanation }))
})

it('production shows the database future-date message verbatim', async () => {
  const date = await openProduction()
  set(date, '2026-11-19')
  expect(date.validity.rangeOverflow).toBe(true)
  const message = 'The date 19 Nov 2026 is in the future. Record it on or after that day.'
  fixture.reject = { table: 'production_log', error: { code: '22007', message } }
  fireEvent.click(button('Save Entry'))
  expect(await screen.findByText(message, { exact: true })).toBeInTheDocument()
  expect(screen.queryByLabelText(reasonLabel)).not.toBeInTheDocument()
})

it('standalone breakage requires and writes a reason for a late entry', async () => {
  render(<Batches userProfile={profile} />)
  fireEvent.click(await screen.findByRole('button', { name: 'Log Damage' }))
  const date = screen.getByText('Date *', { selector: 'label' }).parentElement.querySelector('input')
  set(screen.getByPlaceholderText('e.g. 30'), '3')
  const save = screen.getAllByRole('button', { name: 'Log Damage' }).find(b => b.closest('div').textContent.includes('Cancel'))
  enterLateReason(date, save)
  fireEvent.click(save)
  await waitFor(() => expect(writes('damage_log')[0]).toMatchObject({ late_reason: explanation }))
})

it('waybill edits only require a reason when changing to a late date', async () => {
  const { container } = render(<Waybills userProfile={profile} />)
  fireEvent.click(await screen.findByRole('button', { name: 'Edit', exact: true }))
  expect(screen.queryByLabelText(reasonLabel)).not.toBeInTheDocument()
  const date = container.querySelector('input[type=date]')
  expect(date).not.toHaveAttribute('max')
  const save = button('Update Waybill')
  enterLateReason(date, save)
  fireEvent.click(save)
  await waitFor(() => expect(writes('waybills')[0]).toMatchObject({ late_reason: explanation }))
})

it('handover requires and writes a reason for a late entry', async () => {
  render(<Handovers userProfile={profile} />)
  set(await screen.findByLabelText(/Block type/i), fixture.type)
  set(screen.getByLabelText(/Quantity handed over/i), '30')
  const save = button('Record handover')
  set(screen.getByLabelText('Handover date *'), '2026-11-16')
  await screen.findByRole('option', { name: 'Truck' })
  set(screen.getByLabelText(/Waybill no/), 'WB1')
  set(screen.getByLabelText('Truck'), 'v')
  fireEvent.click(screen.getByRole('button', { name: 'Loader' }))
  set(screen.getByLabelText(reasonLabel), explanation)
  fireEvent.click(save)
  fireEvent.click(await screen.findByRole('button', { name: 'Save anyway' }))
  await waitFor(() => expect(writes('block_handovers')[0]).toMatchObject({ late_reason: explanation }))
})

it('material receiving sends its late reason to the receipt RPC', async () => {
  render(<ReceivingForm />)
  await screen.findByRole('option', { name: /Test cement/ })
  set(screen.getByLabelText(/^Item/), 'cement')
  set(screen.getByLabelText(/^Delivered/), '30')
  const save = button('Record delivery')
  const date = screen.getByRole('form', { name: 'Record a delivery' }).querySelector('input[type=date]')
  enterLateReason(date, save)
  fireEvent.click(save)
  await waitFor(() => expect(fixture.calls.find(call => call.rpc === 'record_material_receipt')?.args)
    .toMatchObject({ p_late_reason: explanation }))
})

it('roster requires and writes a reason for a late entry', async () => {
  const { container } = render(<RosterCreateForm userProfile={profile} onSave={vi.fn()}
    pool={[{ id: 'worker', usual_role_id: 'packer', is_active: true, full_name: 'Test worker' }]}
    roles={[{ id: 'packer', name: 'Packer', base_rate: 100 }]} />)
  fireEvent.click(button('+ Add Worker Row'))
  set(screen.getByRole('option', { name: 'Test worker' }).parentElement, 'worker')
  const save = button('Save as Draft')
  enterLateReason(container.querySelector('input[type=date]'), save)
  fireEvent.click(save)
  await waitFor(() => expect(writes('daily_roster')[0]).toMatchObject({ late_reason: explanation }))
})

it('downtime uses the Lagos start date and writes a reason for a late entry', async () => {
  render(<DowntimeTab userProfile={profile} canWrite activeStaff={[]} staffById={{}}
    assets={[{ id: 'machine', code: 'M1', name: 'Test machine', status: 'active', site_id: fixture.site }]} />)
  set(screen.getByRole('option', { name: /Test machine/ }).parentElement, 'machine')
  set(screen.getByRole('option', { name: 'Breakdown' }).parentElement, 'breakdown')
  const save = button('Log downtime')
  enterLateReason(screen.getByLabelText('Start time (Lagos)'), save, 'T00:30')
  fireEvent.click(save)
  await waitFor(() => expect(writes('downtime_log')[0]).toMatchObject({
    start_time: '2026-11-15T23:30:00.000Z', late_reason: explanation,
  }))
})

it('requires a review note, shows an RPC failure, then refreshes after review', async () => {
  render(<LateEntries />)
  expect(await screen.findByText('No reason — entered before the rule was switched on')).toBeInTheDocument()
  fireEvent.click(button('Mark reviewed'))
  const note = screen.getByLabelText(/Review note/)
  const confirm = screen.getAllByRole('button', { name: 'Mark reviewed' }).at(-1)
  set(note, 'ab')
  expect(confirm).toBeDisabled()
  set(note, 'Checked with site lead')
  fixture.reviewError = { message: 'Review permission refused' }
  fireEvent.click(confirm)
  expect(await screen.findByText('Review permission refused')).toBeInTheDocument()
  fixture.reviewError = null
  fireEvent.click(confirm)
  expect(await screen.findByText('No late entries match these filters.')).toBeInTheDocument()
  expect(fixture.calls.filter(call => call.rpc === 'review_late_entry').at(-1)?.args)
    .toEqual({ p_id: 'review-1', p_note: 'Checked with site lead' })
  expect(fixture.calls.filter(call => call.table === 'late_entries')).toHaveLength(2)
})

it('shows the dashboard link only when there are entries to review', async () => {
  const open = vi.fn()
  const rendered = render(<LateEntriesCard userProfile={{ role: 'ico' }} onOpen={open} />)
  await waitFor(() => expect(fixture.calls.some(call => call.table === 'late_entries')).toBe(true))
  expect(screen.queryByRole('button', { name: /Late entries to review/ })).not.toBeInTheDocument()
  rendered.unmount()
  fixture.count = 2
  render(<LateEntriesCard userProfile={profile} onOpen={open} />)
  fireEvent.click(await screen.findByRole('button', { name: 'Late entries to review: 2' }))
  expect(open).toHaveBeenCalledTimes(1)
})
