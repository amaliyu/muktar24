import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const db = vi.hoisted(() => ({
  select: vi.fn(), eq: vi.fn(), delete: vi.fn(), from: vi.fn(), load: vi.fn(),
}))
vi.mock('../lib/supabase', () => ({ supabase: { from: db.from } }))
vi.mock('../services/financialService', async () => {
  const actual = await vi.importActual('../services/financialService')
  return { ...actual, balanceSheetService: { getData: db.load } }
})

import FinancialStatements from './FinancialStatements'

const adjustment = { id: 'adj-1', account_name: 'Test adjustment', amount: 100, reason: 'Correction' }
const profile = { id: 'test-user', role: 'accountant', effectiveRoles: ['accountant'] }

beforeEach(() => {
  vi.clearAllMocks()
  db.from.mockReturnValue({ delete: db.delete })
  db.delete.mockReturnValue({ eq: db.eq })
  db.eq.mockReturnValue({ select: db.select })
  db.select.mockResolvedValue({ data: [], error: null })
  db.load.mockResolvedValue({ adjustments: [adjustment] })
})

async function requestDelete() {
  render(<FinancialStatements userProfile={profile} />)
  await userEvent.click(await screen.findByRole('button', { name: 'Delete adjustment Test adjustment' }))
  expect(db.delete).not.toHaveBeenCalled()
  expect(screen.getByText('Delete adjustment?')).toBeInTheDocument()
}

describe('financial adjustment deletion', () => {
  it('shows the checked-delete error for zero removed rows, without success or reload', async () => {
    await requestDelete()
    await userEvent.click(screen.getByRole('button', { name: 'Delete adjustment', exact: true }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/nothing was removed.*permission/)
    expect(screen.queryByText('Adjustment deleted.')).toBeNull()
    expect(screen.getByRole('button', { name: 'Delete adjustment Test adjustment' })).toBeInTheDocument()
    expect(db.load).toHaveBeenCalledTimes(1)
    expect(db.from).toHaveBeenCalledWith('financial_adjustments')
    expect(db.eq).toHaveBeenCalledWith('id', 'adj-1')
    expect(db.select).toHaveBeenCalledWith('id')
  })

  it('surfaces database errors without a success message', async () => {
    db.select.mockResolvedValue({ data: null, error: { message: 'Delete permission denied' } })
    await requestDelete()
    await userEvent.click(screen.getByRole('button', { name: 'Delete adjustment', exact: true }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Delete permission denied')
    expect(screen.queryByText('Adjustment deleted.')).toBeNull()
    expect(db.load).toHaveBeenCalledTimes(1)
  })

  it('only reports success and reloads after a deleted row is returned', async () => {
    db.select.mockResolvedValue({ data: [{ id: 'adj-1' }], error: null })
    await requestDelete()
    db.load.mockResolvedValue({ adjustments: [] })
    await userEvent.click(screen.getByRole('button', { name: 'Delete adjustment', exact: true }))
    expect(await screen.findByRole('status')).toHaveTextContent('Adjustment deleted.')
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Delete adjustment Test adjustment' })).toBeNull())
    expect(db.load).toHaveBeenCalledTimes(2)
  })

  it('does not delete when confirmation is cancelled', async () => {
    await requestDelete()
    await userEvent.click(screen.getByRole('button', { name: 'Cancel', exact: true }))
    expect(screen.queryByText('Delete adjustment?')).toBeNull()
    expect(db.delete).not.toHaveBeenCalled()
  })
})
