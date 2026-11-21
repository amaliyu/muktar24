import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import Requisitions, { RequisitionProgress, RequisitionsDashboardBanner } from './Requisitions'
import { AssignedSiteProvider } from '../AssignedSite'
import { ReceivingForm } from './MaterialReceiving'
import DustStandardsSettings from '../DustStandardsSettings'
import { lagosToday } from '../../utils/lateEntry'
import { tomorrowLagos } from '../../utils/requisitionText'

const f = vi.hoisted(() => ({
  site: 'life', assignment: 'life', rows: [], calls: [], progress: {}, position: null,
  upload: vi.fn(async () => 'LIFE/requisitions/approval.png'),
}))
vi.mock('../../lib/supabase', async () => {
  const { createSupabaseMock } = await import('../../test/supabaseMock')
  const fixture = createSupabaseMock((table, ops) => {
    const responses = {
      'rpc:my_assigned_site': f.assignment,
      'rpc:client_requisition_material_position': f.position,
      'rpc:client_requisition_progress': ops?.p_site_id === f.site ? f.progress : {},
      'rpc:create_client_requisition': { ...f.rows[0], status: 'draft' },
      'rpc:record_material_receipt': 'receipt',
      client_requisitions: f.rows,
      client_requisition_lines: [
        { id: 'dust', material: 'dust', unit: 'kg', qty_requested: 304600, qty_calculated: 304600 },
        { id: 'chips', material: 'chippings', unit: 'kg', qty_requested: 0, qty_calculated: 0 },
        { id: 'cement', material: 'cement', unit: 'bags', qty_requested: 300, qty_calculated: 300 },
      ],
      site_block_standards: [{ site_id: f.site, block_type: '9 Inch', dust_kg_per_block: 18, chippings_kg_per_block: null }],
      inventory_items: [{ id: 'cement', site_id: f.site, name: 'Client cement', unit: 'bags', owner: 'client' }],
    }
    return { data: responses[table] ?? [], error: null }
  })
  f.calls = fixture.calls
  return { supabase: fixture.supabase }
})
vi.mock('../SitePicker', () => {
  const sites = [
    { id: 'kado', site_type: 'client_site', name: 'Kado' },
    { id: 'life', site_type: 'client_site', name: 'Life Camp Site (Bilaad)', code: 'LIFE' },
  ]
  return {
    useSites: () => ({ sites }),
    FixedSite: ({ siteId }) => <div>{sites.find(site => site.id === siteId)?.name}</div>,
    default: () => null,
  }
})
vi.mock('../../services/siteContracts', async importOriginal => {
  const actual = await importOriginal()
  return { ...actual, siteContractsService: { ...actual.siteContractsService, uploadPhoto: f.upload } }
})

const request = { id: 'req', reference: 'REQ-LC-001', site_id: 'life', kind: 'initial', qty_9in: 1000, qty_6in: 200,
  qty_total: 1200, needed_by: '2027-01-02', raised_by: 'manager', status: 'draft',
  apcl_approved_by_name: 'MD', apcl_approved_at: '2026-11-19T00:00:00Z', sent_at: '2026-11-19T12:00:00Z' }
beforeEach(() => {
  f.assignment = 'life'; f.rows = [{ ...request }]; f.progress = {}; f.position = null; f.calls.length = 0; f.upload.mockClear()
})
afterEach(() => { cleanup(); vi.restoreAllMocks() })
const wrap = node => <AssignedSiteProvider>{node}</AssignedSiteProvider>
const rpc = name => f.calls.find(call => call.rpc === name)?.args
const change = (node, value) => fireEvent.change(node, { target: { value } })
const click = async name => fireEvent.click(await screen.findByRole('button', { name, exact: true }))
const mount = (role = 'assistant_production_manager') => render(wrap(<Requisitions userProfile={{ id: 'manager', role }} />))
const open = async () => { await click(request.reference); return screen.findByRole('region', { name: 'Requisition detail' }) }

it('validates Lagos needed-by, creates for the fixed site and sends dust edits in kg', async () => {
  mount()
  await click('New requisition')
  const form = within(screen.getByRole('form', { name: 'New requisition' }))
  expect(form.getByText('Life Camp Site (Bilaad)')).toBeInTheDocument()
  expect(screen.queryByLabelText('Client site')).not.toBeInTheDocument()
  change(form.getByLabelText('9" quantity'), '1000')
  change(form.getByLabelText('6" quantity'), '200')
  change(form.getByLabelText('Needed by'), lagosToday())
  expect(form.getByRole('button', { name: 'Create requisition' })).toBeDisabled()
  change(form.getByLabelText('Needed by'), tomorrowLagos())
  fireEvent.click(form.getByRole('button', { name: 'Create requisition' }))
  await waitFor(() => expect(rpc('create_client_requisition')).toEqual({
    p_site_id: 'life', p_qty_9in: 1000, p_qty_6in: 200, p_needed_by: tomorrowLagos(), p_kind: 'initial', p_notes: null,
  }))
  expect(await screen.findByRole('button', { name: 'Submit' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
  expect(await screen.findAllByText('304.6 t')).toHaveLength(2)
  expect(screen.getAllByText('0.0 t')).toHaveLength(2)
  change(screen.getByLabelText('Dust requested (tonnes)'), '300.5')
  await click('Save Dust')
  await waitFor(() => expect(rpc('set_client_requisition_line')).toMatchObject({ p_qty_requested: 300500, p_material: 'dust', p_unit: 'kg' }))
})

it.each([['md', true], ['assistant_production_manager', false]])('gates submitted actions for %s', async (role, allowed) => {
  f.rows[0].status = 'submitted'
  mount(role)
  const detail = within(await open())
  for (const action of ['Approve', 'Return', 'Cancel']) {
    expect(Boolean(detail.queryByRole('button', { name: action, exact: true }))).toBe(allowed)
  }
})

it('shares approved quantities and marks the request sent', async () => {
  f.rows[0].status = 'apcl_approved'
  mount(); await open()
  const launch = vi.spyOn(window, 'open').mockImplementation(() => null)
  await click('Send to WhatsApp')
  expect(screen.getByRole('button', { name: 'Copy text' })).toBeInTheDocument()
  const message = new URL(launch.mock.calls[0][0]).searchParams.get('text')
  expect(message).toContain('Material Requisition REQ-LC-001')
  expect(message).toContain('1,000 × 9" + 200 × 6" = 1,200')
  expect(message).toContain('Dust: 304.6 t')
  expect(message).toContain('Cement: 300 bags')
  expect(message).not.toContain('3/8:')
  await click('Mark sent')
  await waitFor(() => expect(rpc('advance_client_requisition')).toMatchObject({ p_id: 'req', p_action: 'mark_sent' }))
})

it('validates approval, uploads a screenshot and logs the exact WhatsApp reminder', async () => {
  f.rows[0].status = 'sent'
  f.progress = { current: { reference: 'REQ-LC-000', pct: 55 } }
  const launch = vi.spyOn(window, 'open').mockImplementation(() => null)
  mount(); await open()
  await click('Send to WhatsApp')
  await waitFor(() => expect(rpc('advance_client_requisition')).toMatchObject({
    p_action: 'log_reminder', p_note: new URL(launch.mock.calls[0][0]).searchParams.get('text'),
  }))
  expect(rpc('advance_client_requisition').p_note).toContain('REQ-LC-000 is 55% produced')
  await waitFor(() => expect(screen.getByPlaceholderText(/Abdulkadir/)).toBeInTheDocument())
  const form = within(screen.getByRole('form', { name: 'Record client approval' }))
  const save = form.getByRole('button', { name: 'Record client approval' })
  expect(save).toBeDisabled()
  change(form.getByLabelText('Approved by'), 'Client PM')
  change(form.getByLabelText('Approval date'), tomorrowLagos())
  expect(save).toBeDisabled()
  change(form.getByLabelText('Approval date'), lagosToday())
  fireEvent.change(form.getByLabelText('Screenshot'), { target: { files: [new File(['fixture'], 'approval.png', { type: 'image/png' })] } })
  fireEvent.click(save)
  await waitFor(() => expect(f.calls.filter(call => call.rpc === 'advance_client_requisition').at(-1)?.args).toMatchObject({
    p_action: 'record_client_approval', p_client_approved_by: 'Client PM', p_client_approved_on: lagosToday(),
    p_photo_path: 'LIFE/requisitions/approval.png',
  }))
})

it.each([
  ['raise_next', 'Raise the balance requisition now.', 'Raise balance'],
  ['approve_next', 'waiting for MD approval', 'Open requisition'],
  ['send_next', 'send it to the client', 'Open requisition'],
  ['remind_client', "Send today's reminder.", 'Send to WhatsApp'],
])('renders the %s progress action', (action, message, button) => {
  const progress = { action, current: { reference: 'REQ-OLD', pct: 51 }, next_requisition: request, unapproved_production: 1250 }
  const { rerender } = render(<RequisitionProgress progress={progress} canRaise canSend />)
  expect(screen.getByText(text => text.includes(message))).toBeInTheDocument()
  expect(screen.getByRole('button', { name: button })).toBeInTheDocument()
  expect(screen.getByRole('alert')).toHaveTextContent('1,250 blocks made beyond approved requisitions')
  if (action === 'remind_client') {
    rerender(<RequisitionProgress progress={{ ...progress, reminded_today: true, last_reminder_at: request.sent_at }} canSend />)
    expect(screen.getByText(/Reminder sent today/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: button })).not.toBeInTheDocument()
  }
})

it('checks every client site for MD and hides the dashboard banner for an unassigned ICO', async () => {
  f.assignment = null
  f.progress = { action: 'approve_next', next_requisition: request }
  const onOpen = vi.fn()
  const md = render(wrap(<RequisitionsDashboardBanner userProfile={{ role: 'md' }} onOpen={onOpen} />))
  await click('Material Requisitions')
  expect(onOpen).toHaveBeenCalledWith('life')
  expect(f.calls.filter(call => call.rpc === 'client_requisition_progress').map(call => call.args.p_site_id)).toEqual(['kado', 'life'])
  md.unmount()
  render(wrap(<RequisitionsDashboardBanner userProfile={{ role: 'ico' }} />))
  expect(screen.queryByRole('region', { name: 'Material requisition action' })).not.toBeInTheDocument()
})

it.each([true, false])('receiving includes the requisition only when chosen (%s)', async chosen => {
  f.rows[0].status = 'client_approved'
  render(wrap(<ReceivingForm />))
  const item = await screen.findByLabelText(/^Item/)
  await within(item).findByRole('option', { name: /Client cement/ })
  change(item, 'cement')
  const req = await screen.findByLabelText('Against requisition')
  await waitFor(() => expect(req).toHaveValue('req'))
  if (!chosen) change(req, '')
  change(screen.getByLabelText(/^Delivered/), '10')
  await click('Record delivery')
  await waitFor(() => expect(rpc('record_material_receipt')).toBeTruthy())
  if (chosen) expect(rpc('record_material_receipt').p_requisition_id).toBe('req')
  else expect(rpc('record_material_receipt')).not.toHaveProperty('p_requisition_id')
})

it('blocks 3/8 over the combined total and saves optional dust standard fields', async () => {
  render(<DustStandardsSettings userProfile={{ role: 'md', full_name: 'Test MD' }} />)
  await click('Edit')
  const chippings = screen.getByLabelText('3/8 per block (kg, part of the total)')
  change(chippings, '19')
  await click('Save')
  expect(screen.getByRole('alert')).toHaveTextContent('must be no more')
  change(chippings, '3')
  change(screen.getByLabelText('Blocks per bag of cement'), '40')
  await click('Save'); await click('Confirm change')
  await waitFor(() => expect(f.calls.flatMap(call => call.ops || []).find(op => op[0] === 'upsert')?.[1]).toMatchObject({
    dust_kg_per_block: 18, chippings_kg_per_block: 3, blocks_per_bag: 40, diesel_l_per_1000: null,
  }))
})

it('explains the client source and how to send the first requisition', async () => {
  f.rows = []
  const navigate = vi.fn()
  render(wrap(<ReceivingForm onNavigate={navigate} receipts={[{ site_id: 'life', supplier_or_source: 'Client quarry' }]} />))
  await screen.findByRole('option', { name: /Client cement/ })
  change(screen.getByLabelText(/^Item/), 'cement')
  expect(screen.getByText(/The company on the waybill/)).toBeInTheDocument()
  expect(screen.queryByText(/The supplier APCL paid/)).not.toBeInTheDocument()
  expect(await screen.findByText(/No sent requisition for this site yet/)).toBeInTheDocument()
  await click('Material Requisitions')
  expect(navigate).toHaveBeenCalledWith('requisitions', 'life')
  expect(f.calls.some(call => call.table === 'suppliers')).toBe(false)
  expect(document.querySelector('#rcv-sources option')).toHaveValue('Client quarry')
})

it('shows the material position in tonnes with short stock, over-delivery and unlinked warnings', async () => {
  f.position = { site_id: 'life', covers_from: '2026-11-17', requisitions: [{ id: 'req', reference: 'REQ-LC-001' }], materials: [
    { material: 'dust', unit: 'kg', requested: 30000, received: 31000, deliveries: 2, used: 35000, on_site: -4000,
      outstanding: 0, over_supplied: 1000, received_unlinked: 10000, deliveries_unlinked: 2 },
  ] }
  const receive = vi.fn()
  render(wrap(<Requisitions userProfile={{ role: 'ico' }} onReceive={receive} />))
  const card = within(await screen.findByRole('region', { name: 'Materials against requisitions' }))
  expect(await card.findByText('Stone dust')).toBeInTheDocument()
  expect(card.getByText('Requisitions included: REQ-LC-001')).toBeInTheDocument()
  expect(card.getByText('30.0 t')).toBeInTheDocument()
  expect(card.getByText('31.0 t (2 deliveries)')).toBeInTheDocument()
  expect(card.getByText('-4.0 t')).toHaveStyle({ color: '#f06b6b' })
  expect(card.getByText(/Used more than recorded as received/)).toHaveStyle({ color: '#f06b6b' })
  expect(card.getByText('Received more than requested')).toBeInTheDocument()
  expect(card.getByText(/2 deliveries not linked/)).toBeInTheDocument()
  fireEvent.click(card.getByRole('button', { name: 'Material Receiving' }))
  expect(receive).toHaveBeenCalledWith('life')
  expect(rpc('client_requisition_material_position')).toEqual({ p_site_id: 'life' })
})
