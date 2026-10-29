import { afterEach, beforeEach, it, expect, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
const db = vi.hoisted(() => ({ resolve: null, mock: null }))
vi.mock('../lib/supabase', async () => {
  const { createSupabaseMock } = await import('../test/supabaseMock')
  db.mock = createSupabaseMock((table, ops) => db.resolve(table, ops))
  return db.mock
})
vi.mock('./SitePicker', () => ({ default: () => null, useSites: () => ({ sites: [], error: null }) }))
import BoardDashboard from './BoardDashboard'
import KPIDashboard from './KPIDashboard'
afterEach(cleanup)
beforeEach(() => { db.resolve = () => ({ data: [], error: null }) })
it.each([['Board revenue', BoardDashboard, 'payments', 'Revenue'], ['KPI revenue', KPIDashboard, 'payments', 'Revenue'], ['Board expenses', BoardDashboard, 'expenses', 'Expenses'], ['KPI expenses', KPIDashboard, 'expenses', 'Expenses']])('4: %s displays a resolved query error and removes profit/zero figures', async (_, Component, source, label) => {
  db.resolve = t => t === source ? { data: null, error: { message: 'TEST source denied' } } : { data: [], error: null }
  render(<Component />)
  expect(await screen.findByRole('alert')).toHaveTextContent(label + ' could not be loaded: TEST source denied')
  expect(screen.queryByText('₦0')).toBeNull()
  expect(screen.queryByText('Gross Profit')).toBeNull()
})
