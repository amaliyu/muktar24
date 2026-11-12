import React from 'react'
import { it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
const mock = vi.hoisted(() => ({ metrics: vi.fn() }))
vi.mock('../services/accountingBasis', () => ({ accountingBasisService: {
  metrics: mock.metrics, deliveries: async () => [],
} }))
vi.mock('../lib/supabase', async () => {
  const { createSupabaseMock } = await import('../test/supabaseMock')
  return createSupabaseMock()
})
vi.mock('./SitePicker', () => ({ default: ({ onChange }) => <select aria-label="Site" onChange={e => onChange(e.target.value)}><option value="">Company</option><option value="kado">Kado</option></select> }))
import KPIDashboard from './KPIDashboard'
afterEach(() => { cleanup(); vi.clearAllMocks() })
const data = { revenue: 1000, cashReceived: 300, cost: 200, netProfit: 800, collectionRate: 0.3,
  deliveredButUnpriced:[{waybill_id:'unpriced',waybill_date:'2026-09-05',block_type:'Unpriced block',quantity_received:99}], deliveries: [], payments: [], expenses: [], position: { receivables: 700, deposits: 123 } }
it('R9 BDM gets delivered revenue and cash while profit, margins, expenses and Financial are hidden', async () => {
  mock.metrics.mockResolvedValue(data)
  render(<KPIDashboard userProfile={{ role: 'bdm' }} />)
  await screen.findByText('Delivered (revenue)')
  expect(screen.queryByRole('button', { name: /Financial/ })).toBeNull(); expect(screen.getByText(/Unpriced block/)).toBeInTheDocument()
  expect(screen.queryByText(/gross profit|total expenses|margin:/i)).toBeNull()
  expect(mock.metrics).toHaveBeenCalledWith(expect.any(String), expect.any(String), '', false)
})
it('site changes reload both income and customer positions for Kado', async () => {
  mock.metrics.mockResolvedValue(data)
  render(<KPIDashboard userProfile={{ role: 'md' }} />)
  await screen.findByText('Delivered (revenue)')
  await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Site' }), 'kado')
  await waitFor(() => expect(mock.metrics).toHaveBeenCalledWith(expect.any(String), expect.any(String), 'kado', true))
  await userEvent.click(screen.getByRole('button', { name: /Sales/ }))
  expect(await screen.findByText('Customer deposits')).toBeInTheDocument()
  expect(screen.getByText('₦123')).toBeInTheDocument()
})
