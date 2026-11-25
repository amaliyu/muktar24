import React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { TransportFields, emptyTransport, transportProblem, useTransportOptions } from './HandoverTransport'
import { siteContractsService } from '../../services/siteContracts'
vi.mock('../../services/siteContracts', () => ({ siteContractsService: { transportOptions: vi.fn(async () => ({ vehicles: [], drivers: [], loaders: [] })) } }))
vi.mock('../../services/storage', () => ({ getSignedDocUrl: vi.fn() }))
afterEach(cleanup)
const options = { vehicles: [{ id: 'v', label: 'ABC', driver_id: 'd' }], drivers: [{ id: 'd', name: 'Driver' }], loaders: [{ id: 'l', name: 'Loader' }] }
it('loads options for site and date', async () => {
  function Test() { const r = useTransportOptions('site', '2026-11-25'); return <p>{r.data ? 'Loaded' : 'Loading'}</p> }
  render(<Test />); await screen.findByText('Loaded')
  expect(siteContractsService.transportOptions).toHaveBeenCalledWith('site', '2026-11-25')
})
it('requires truck, driver, and crew, or a note without crew', () => {
  expect(transportProblem(emptyTransport(), options)).toContain('truck')
  const v = { ...emptyTransport(), vehicle_plate: 'ABC' }
  expect(transportProblem(v, options)).toContain('driver')
  v.driver_name = 'Name'
  expect(transportProblem(v, options)).toContain('loader')
  v.loader_ids = ['l']; expect(transportProblem(v, options)).toBeNull()
  expect(transportProblem({ ...v, loader_ids: [] }, { loaders: [] }, 'No crew today')).toBeNull()
})
it('preselects fleet driver, supports typed values and toggles loader chips', () => {
  function Test() { const [v, setV] = React.useState(emptyTransport); return <><TransportFields value={v} onChange={setV} options={options} /><output>{JSON.stringify(v)}</output></> }
  render(<Test />)
  fireEvent.change(screen.getByLabelText('Truck'), { target: { value: 'v' } })
  expect(screen.getByLabelText('Driver')).toHaveValue('d')
  fireEvent.click(screen.getByRole('button', { name: 'Loader' }))
  expect(screen.getByRole('button', { name: 'Loader' })).toHaveAttribute('aria-pressed', 'true')
  fireEvent.change(screen.getByLabelText('Truck'), { target: { value: 'other' } })
  fireEvent.change(screen.getByLabelText('Truck plate'), { target: { value: 'XYZ' } })
  fireEvent.change(screen.getByLabelText('Driver'), { target: { value: 'other' } })
  fireEvent.change(screen.getByLabelText('Driver name'), { target: { value: 'Guest' } })
  expect(screen.getByRole('status')).toHaveTextContent('XYZ'); expect(screen.getByRole('status')).toHaveTextContent('Guest')
})
