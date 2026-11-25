import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import PaidFrom, { FundPill } from './PaidFrom'
import { clientFunds } from '../../services/clientFunds'
vi.mock('../../services/clientFunds', () => ({ clientFunds: { setRequestFund: vi.fn(async () => {}) } }))
vi.mock('../../services/storage', () => ({ getSignedDocUrl: vi.fn() }))
afterEach(() => { cleanup(); vi.clearAllMocks() })
it.each(['md','accountant','ico'])('allows %s to tag a client request and clear it to APCL', async role => {
  render(<PaidFrom request={{ id: 'r' }} site={{ site_type: 'client_site' }} client="Bilaad" userProfile={{ role }} />)
  fireEvent.change(screen.getByLabelText('Paid from:'), { target: { value: 'diesel' } })
  await waitFor(() => expect(clientFunds.setRequestFund).toHaveBeenCalledWith('r', 'diesel'))
  await waitFor(() => expect(screen.getByRole('combobox')).toBeEnabled())
  fireEvent.change(screen.getByRole('combobox'), { target: { value: '' } })
  await waitFor(() => expect(clientFunds.setRequestFund).toHaveBeenCalledWith('r', null))
})
it('shows a read-only label to site managers and nothing for factory requests', () => {
  const props = { request: { client_fund: 'operating' }, client: 'Bilaad', userProfile: { role: 'assistant_production_manager' } }
  const { rerender } = render(<PaidFrom {...props} site={{ site_type: 'client_site' }} />)
  expect(screen.getByText('Paid from: Bilaad operating fund')).toBeInTheDocument()
  expect(screen.queryByRole('combobox')).toBeNull()
  rerender(<PaidFrom {...props} site={{ site_type: 'factory' }} />)
  expect(screen.queryByText(/Paid from/)).toBeNull()
})

it('uses short client names in fund choices and pills', () => {
  render(<><PaidFrom request={{}} site={{ site_type: 'client_site' }} client="Bilaad" userProfile={{ role: 'md' }} /><FundPill request={{ client_fund: 'diesel' }} client="Bilaad" /></>)
  expect(screen.getByRole('option', { name: 'Bilaad operating fund' })).toBeInTheDocument()
  expect(screen.getByRole('option', { name: 'Bilaad diesel fund' })).toBeInTheDocument()
  expect(screen.getByText('Bilaad diesel')).toBeInTheDocument()
})
