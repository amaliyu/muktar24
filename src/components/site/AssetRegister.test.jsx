import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('../../lib/supabase', () => ({ supabase: {} }))
vi.mock('../../services/sites', () => ({
  DUTSE_SITE_ID: 'dutse',
  siteName: (id) => ({ dutse: 'Dutse Factory', kado: 'Kado Site (Sequoia)' }[id] || '—'),
  sitesService: { getActive: vi.fn(async () => [
    { id: 'dutse', name: 'Dutse Factory', site_type: 'factory' },
    { id: 'kado', name: 'Kado Site (Sequoia)', site_type: 'client_site' },
  ]) },
}))
const MOVE_ERR = 'Quantity must be between 1 and 4.'
vi.mock('../../services/assets', async () => {
  const actual = await vi.importActual('../../services/assets')
  return {
    ...actual,
    assetsService: {
      listRegister: vi.fn(async () => [
        { asset_id: 'a1', code: null, name: 'TEST trolley', asset_type: 'equipment', category: 'trolley', quantity: 4, condition: 'good', status: 'active', funding_source: 'apcl', acquisition_cost: 120000, site_id: 'dutse', site_name: 'Dutse Factory', site_type: 'factory' },
        { asset_id: 'q2', code: 'QTJ-02', name: 'QTJ4-26B', asset_type: 'machine', category: 'machine', quantity: 1, condition: 'good', status: 'active', funding_source: 'investor', acquisition_cost: 27000000, site_id: 'kado', site_name: 'Kado Site (Sequoia)', site_type: 'client_site' },
      ]),
      listMovements: vi.fn(async () => []),
      moveAsset: vi.fn(async () => { throw new Error(MOVE_ERR) }),
    },
  }
})

import AssetRegister from './AssetRegister'

const as = (role) => ({ id: 'u', role, effectiveRoles: [role] })

describe('AssetRegister', () => {
  beforeEach(() => vi.clearAllMocks())

  it('production manager can add and move but never sees cost', async () => {
    render(<AssetRegister userProfile={as('production_manager')} />)
    expect(await screen.findByText('TEST trolley')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Add asset' }).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('button', { name: 'Move' }).length).toBe(2)
    expect(screen.queryByText(/₦/)).toBeNull()
    await userEvent.click(screen.getAllByRole('button', { name: 'Add asset' })[0])
    expect(screen.queryByLabelText(/Acquisition cost/)).toBeNull()
    expect(screen.queryByLabelText(/Investment pool ref/)).toBeNull()
  })

  it('accountant sees cost and per-site totals but cannot add, edit or move', async () => {
    render(<AssetRegister userProfile={as('accountant')} />)
    await screen.findByText('TEST trolley')
    expect(screen.getAllByText('₦120,000').length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: 'Add asset' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Move' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull()
  })

  it('a part move shows the split hint and the RPC message verbatim', async () => {
    const user = userEvent.setup()
    render(<AssetRegister userProfile={as('md')} />)
    await screen.findByText('TEST trolley')
    await user.click(screen.getAllByRole('button', { name: 'Move' })[0])
    const dialog = screen.getByText('Move TEST trolley').parentElement
    await user.selectOptions(within(dialog).getByLabelText('Destination *'), 'kado')
    const qty = within(dialog).getByLabelText('Quantity *')
    await user.clear(qty); await user.type(qty, '1')
    expect(within(dialog).getByText('This splits the record: 1 move, 3 stay')).toBeInTheDocument()
    await user.type(within(dialog).getByLabelText('Reason *'), 'TEST')
    await user.click(within(dialog).getByRole('button', { name: 'Move asset' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(MOVE_ERR)
  })

  it('offers the plant-on-site export only for client sites', async () => {
    render(<AssetRegister userProfile={as('board_member')} />)
    await screen.findByText('TEST trolley')
    expect(screen.getAllByRole('button', { name: 'Plant on site (PDF)' }).length).toBe(1)
    expect(screen.queryByRole('button', { name: 'Add asset' })).toBeNull()
  })
})
