import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
const svc = vi.hoisted(() => ({ waybills: vi.fn(), active: vi.fn(), batches: vi.fn(), productions: vi.fn(), yard: vi.fn(), items: vi.fn(), history: vi.fn(), movements: vi.fn(), calls: null, zeroDelete: false, errorUpdate: null }))
const DUTSE = '00000000-0000-4000-8000-000000000001'
const KADO = '00000000-0000-4000-8000-000000000002'
vi.mock('./lib/supabase', async () => {
  const { createSupabaseMock } = await import('./test/supabaseMock')
  const mock = createSupabaseMock((table, ops) => {
    if (ops.some(o => o[0] === 'update') && svc.errorUpdate) return { data: null, error: svc.errorUpdate }
    if (ops.some(o => o[0] === 'delete')) return { data: svc.zeroDelete ? [] : [{ id: 'w' }], error: null }
    if (ops.some(o => o[0] === 'update' || o[0] === 'insert')) return { data: [{ id: 'w' }], error: null }
    return { data: [], error: null }
  })
  svc.calls = mock.calls
  return { supabase: mock.supabase }
})
vi.mock('pdfjs-dist', () => ({ GlobalWorkerOptions: {} }))
vi.mock('./components/SitePicker', () => ({
  useSites: () => ({ sites: [{ id: '00000000-0000-4000-8000-000000000001', name: 'Dutse', site_type: 'factory' }, { id: '00000000-0000-4000-8000-000000000002', name: 'Kado', site_type: 'client_site' }] }),
  default: ({ value, onChange, disabled, allowAll }) => <select aria-label={allowAll ? 'Site filter' : 'Site'} disabled={disabled} value={value} onChange={e => onChange(e.target.value)}><option value="">All sites</option><option value="00000000-0000-4000-8000-000000000001">Dutse</option><option value="00000000-0000-4000-8000-000000000002">Kado</option></select>,
}))
vi.mock('./services/deliveries', async importOriginal => {
  const actual = await importOriginal()
  return { waybillsService: { ...actual.waybillsService, getAll: svc.waybills } }
})
vi.mock('./services/batches', async importOriginal => {
  const actual = await importOriginal()
  return { batchesService: { ...actual.batchesService, getAll: svc.batches, getActive: svc.active } }
})
vi.mock('./services/production', () => ({ productionService: { getAll: svc.productions, deleteTransitDamage: vi.fn(async () => {}) } }))
vi.mock('./services/siteContracts', () => ({ siteContractsService: { listYard: svc.yard } }))
vi.mock('./services/inventory', async importOriginal => {
  const actual = await importOriginal()
  return { inventoryService: { ...actual.inventoryService, getAllItems: svc.items, getMovements: svc.movements, hasMovements: svc.history } }
})
vi.mock('./services/products', () => ({ productsService: { getActive: async () => [{ id: 'p9', name: '9 Inch 3 Hole Block', category: 'Blocks' }, { id: 'p6', name: '6 Inch Block', category: 'Blocks' }] } }))
vi.mock('./services/orders', () => ({ ordersService: { getForDelivery: async () => [] }, customersService: {}, customerSitesService: {} }))
vi.mock('./services/staff', () => ({ staffService: { getPublicActive: async () => [] } }))
vi.mock('./services/vehicles', () => ({ vehiclesService: { getActive: async () => [] }, fuelLogService: { getByWaybill: async () => [] } }))
vi.mock('./services/labour', () => ({ truckLoadingService: { getAssignments: async () => [] }, labourPoolService: { getAll: async () => [] } }))
vi.mock('./services/schedules', () => ({ schedulesService: { getApproved: async () => [] } }))
vi.mock('./services/pendingDelivery', () => ({ pendingDeliveryService: { getByOrder: async () => [] } }))
vi.mock('./services/suppliers', () => ({ suppliersService: { getActive: async () => [] }, supplierTransactionsService: {} }))
vi.mock('./services/finishedGoods', () => ({ finishedGoodsService: { getAll: vi.fn(async () => []) } }))
import { Waybills, Batches, Inventory, ISSUED_TO } from './App'
import { finishedGoodsService } from './services/finishedGoods'

const wb = { id: 'w', waybill_number: 'TEST-WB', block_type: '9 Inch 3 Hole Block', waybill_date: '2026-10-29', quantity_loaded: 50, quantity_received: 50, quantity_damaged: 0, batch_id: 'b9' }
const batch = { id: 'b9', batch_number: 'TEST-B9', site_id: DUTSE, block_type: '9 Inch 3 Hole Block', status: 'active', qty_accepted: 100, qty_remaining: 50, links: [] }
const item = { id: 'i', name: 'TEST cement', unit: 'bags', site_id: DUTSE, current_stock: -25, reorder_level: 5 }
afterEach(cleanup)
beforeEach(() => {
  vi.clearAllMocks()
  svc.calls.length = 0
  svc.zeroDelete = false
  svc.errorUpdate = null
  svc.waybills.mockResolvedValue([wb])
  svc.batches.mockResolvedValue([batch])
  svc.active.mockResolvedValue([batch, { ...batch, id: 'b6', block_type: '6 Inch Block' }, { ...batch, id: 'k', site_id: KADO }, { ...batch, id: 'exhausted', status: 'exhausted' }])
  svc.productions.mockResolvedValue([])
  svc.yard.mockResolvedValue([])
  svc.items.mockResolvedValue([item])
  svc.history.mockResolvedValue(true)
  svc.movements.mockResolvedValue([])
})
const editWaybill = async () => {
  await userEvent.click(await screen.findByRole('button', { name: 'Edit', exact: true }))
  await screen.findByRole('button', { name: 'Update Waybill' })
}

it.each(['store_officer', 'logistics_manager', 'production_manager', 'ico', 'board_member'])('3: %s sees no waybill Delete button', async role => {
  render(<Waybills userProfile={{ role }} />)
  await screen.findByText('TEST-WB')
  expect(screen.queryByRole('button', { name: 'Delete', exact: true })).toBeNull()
})
it('3: MD zero-row delete shows the required message and never claims success', async () => {
  svc.zeroDelete = true
  render(<Waybills userProfile={{ role: 'md' }} />)
  await userEvent.click(await screen.findByRole('button', { name: 'Delete', exact: true }))
  await userEvent.click(screen.getByRole('button', { name: 'Delete waybill' }))
  expect(await screen.findByText('Not deleted — only the MD can delete a waybill.')).toBeInTheDocument()
  expect(screen.getByText('TEST-WB')).toBeInTheDocument()
  expect(svc.calls.filter(c => c.ops.some(o => o[0] === 'delete')).map(c => c.table)).toEqual(['waybills'])
})
it('1/5: saving a cleared waybill batch writes null, no balances, then reloads stock', async () => {
  render(<Waybills userProfile={{ role: 'md' }} />)
  await editWaybill()
  await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Batch Number' }), '')
  await userEvent.click(screen.getByRole('button', { name: 'Update Waybill' }))
  expect(await screen.findByText('Waybill TEST-WB saved.')).toBeInTheDocument()
  const writes = svc.calls.filter(c => c.ops.some(o => ['insert', 'update', 'delete'].includes(o[0])))
  expect(writes.map(c => c.table)).toEqual(['waybills'])
  expect(writes[0].ops.find(o => o[0] === 'update')[1]).toHaveProperty('batch_id', null)
  expect(finishedGoodsService.getAll.mock.calls.length).toBeGreaterThanOrEqual(2)
})
it('5: changing waybill product clears batch and offers only active matching Dutse batches', async () => {
  render(<Waybills userProfile={{ role: 'md' }} />)
  await editWaybill()
  const product = screen.getByText('Block Type', { selector: 'label' }).parentElement.querySelector('select')
  await userEvent.selectOptions(product, '6 Inch Block')
  const picker = screen.getByRole('combobox', { name: 'Batch Number' })
  expect(picker).toHaveValue('')
  expect(within(picker).getAllByRole('option').map(o => o.value)).toEqual(['', 'b6'])
})
it('2: refused waybill save surfaces the database message and makes no other write', async () => {
  svc.errorUpdate = { message: 'TEST waybill refused' }
  render(<Waybills userProfile={{ role: 'md' }} />)
  await editWaybill()
  await userEvent.click(screen.getByRole('button', { name: 'Update Waybill' }))
  expect(await screen.findByText(/TEST waybill refused/)).toBeInTheDocument()
  expect(svc.calls.filter(c => c.ops.some(o => o[0] === 'update'))).toHaveLength(1)
})
it('6: Stock Out has no Production option and explains automatic deduction', async () => {
  render(<Inventory userProfile={{ role: 'md' }} />)
  await userEvent.click(screen.getByRole('button', { name: 'Stock Out' }))
  expect(ISSUED_TO).toEqual(['Maintenance', 'Logistics', 'Administration', 'Other'])
  expect(screen.queryByRole('option', { name: 'Production', exact: true })).toBeNull()
  expect(screen.getByText('Materials used in production are deducted automatically when production is recorded.')).toBeInTheDocument()
})
it('1: negative material balances remain visible in red as Shortage', async () => {
  render(<Inventory userProfile={{ role: 'md' }} />)
  const shortage = await screen.findByText('-25 — Shortage')
  expect(shortage).toHaveStyle({ color: '#f06b6b' })
})
it('9: item site and unit lock after unfiltered history check', async () => {
  render(<Inventory userProfile={{ role: 'md' }} />)
  await userEvent.click(await screen.findByRole('button', { name: 'Edit', exact: true }))
  await screen.findByText('Locked — this item has stock history. Create a new item instead.')
  expect(screen.getByRole('combobox', { name: 'Site', exact: true })).toBeDisabled()
  expect(screen.getByText('Unit of Measure *').parentElement.querySelector('select')).toBeDisabled()
  expect(svc.history).toHaveBeenCalledWith('i')
})
it('9: a refused item save shows the database message without writing current_stock', async () => {
  svc.errorUpdate = { message: 'TEST item has stock history' }
  render(<Inventory userProfile={{ role: 'md' }} />)
  await userEvent.click(await screen.findByRole('button', { name: 'Edit', exact: true }))
  await userEvent.click(screen.getByRole('button', { name: 'Update Item' }))
  expect(await screen.findByText(/TEST item has stock history/)).toBeInTheDocument()
  expect(svc.calls.find(c => c.table === 'inventory_items').ops.find(o => o[0] === 'update')[1]).not.toHaveProperty('current_stock')
})
it('10: receipt movements show the delivery note and no Edit/Delete', async () => {
  svc.movements.mockResolvedValue([{ id: 'rcpt', reference: 'RCPT-TEST', movement_type: 'in', quantity: 10, date: '2026-10-29', item: { name: 'TEST cement', unit: 'bags' } }])
  render(<Inventory userProfile={{ role: 'md' }} />)
  await userEvent.click(screen.getByRole('button', { name: 'Movement Log' }))
  const note = await screen.findByText('From delivery record — void it in Material Receiving')
  const row = note.closest('tr')
  expect(within(row).queryByRole('button', { name: 'Edit' })).toBeNull()
  expect(within(row).queryByRole('button', { name: 'Delete' })).toBeNull()
})
it('8: client-site batch shows site-yard label and figure after handovers, counted once', async () => {
  svc.batches.mockResolvedValue([{ ...batch, id: 'k1', batch_number: 'TEST-K1', site_id: KADO, qty_remaining: 9999 }, { ...batch, id: 'k2', batch_number: 'TEST-K2', site_id: KADO, qty_remaining: 9999 }])
  svc.yard.mockResolvedValue([{ site_id: KADO, block_type: batch.block_type, in_yard: -12 }])
  render(<Batches userProfile={{ role: 'md' }} />)
  await screen.findByText('TEST-K1')
  expect(screen.getAllByText(/Site yard \(after handovers\)/)).toHaveLength(2)
  expect(screen.queryByText('9,999')).toBeNull()
  expect(screen.getAllByText('-12 — Shortage')[0]).toHaveStyle({ color: '#f06b6b' })
  await userEvent.click(screen.getByText('TEST-K1'))
  expect(screen.queryByText('Remaining in Batch')).toBeNull()
  expect(screen.getAllByText('-12 — Shortage')).toHaveLength(4)
  expect(svc.yard).toHaveBeenCalled()
})
it('7: batch form offers only production entries not already linked', async () => {
  svc.batches.mockResolvedValue([{ ...batch, links: [{ production_log_id: 'linked' }] }])
  svc.productions.mockResolvedValue([{ id: 'linked', date: '2026-10-29', site_id: DUTSE, block_type: batch.block_type, quantity_produced: 1234 }, { id: 'free', date: '2026-10-29', site_id: DUTSE, block_type: batch.block_type, quantity_produced: 5678 }])
  render(<Batches userProfile={{ role: 'md' }} />)
  await screen.findByText('TEST-B9')
  await userEvent.click(screen.getByRole('button', { name: '+ Create Batch' }))
  await waitFor(() => expect(screen.getByRole('option', { name: '9 Inch 3 Hole Block' })).toBeInTheDocument())
  await userEvent.selectOptions(screen.getByText('Block Type *').parentElement.querySelector('select'), 'p9')
  expect(screen.getByText(/5,678 blocks/)).toBeInTheDocument()
  expect(screen.queryByText(/1,234 blocks/)).toBeNull()
})

it('4: refused batch product/site edit shows the database message and writes only the batch', async () => {
  svc.errorUpdate = { message: 'TEST blocks already dispatched; product or site cannot change' }
  svc.batches.mockResolvedValue([{ ...batch, date_cured: '2026-10-29' }])
  render(<Batches userProfile={{ role: 'md' }} />)
  await userEvent.click(await screen.findByRole('button', { name: 'Edit', exact: true }))
  await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Site', exact: true }), KADO)
  await userEvent.click(screen.getByRole('button', { name: 'Save Changes' }))
  expect(await screen.findByText(/TEST blocks already dispatched/)).toBeInTheDocument()
  const writes = svc.calls.filter(c => c.ops.some(o => o[0] === 'update'))
  expect(writes.map(c => c.table)).toEqual(['batches'])
  expect(writes[0].ops.find(o => o[0] === 'update')[1]).not.toHaveProperty('qty_remaining')
  expect(writes[0].ops.find(o => o[0] === 'update')[1]).not.toHaveProperty('status')
})
it('8: factory batch keeps its own Remaining figure', async () => {
  render(<Batches userProfile={{ role: 'md' }} />)
  await screen.findByText('TEST-B9')
  expect(screen.getByText('Remaining:')).toHaveTextContent('Remaining: 50')
  expect(screen.queryByText(/Site yard \(after handovers\)/)).toBeNull()
})
it('9: item site and unit stay editable when there are no movements', async () => {
  svc.history.mockResolvedValue(false)
  render(<Inventory userProfile={{ role: 'md' }} />)
  await userEvent.click(await screen.findByRole('button', { name: 'Edit', exact: true }))
  await waitFor(() => expect(screen.getByRole('combobox', { name: 'Site', exact: true })).not.toBeDisabled())
  expect(screen.getByText('Unit of Measure *').parentElement.querySelector('select')).not.toBeDisabled()
  expect(screen.queryByText('Locked — this item has stock history. Create a new item instead.')).toBeNull()
})
