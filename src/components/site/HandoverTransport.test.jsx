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
  expect(transportProblem(emptyTransport(), options)).toBe('Enter the waybill number.')
  expect(transportProblem({ ...emptyTransport(), waybill_no: 'WB1' }, options)).toContain('truck')
  const v = { ...emptyTransport(), waybill_no: 'WB1', vehicle_plate: 'ABC' }
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

it('fills and replaces truck crews, filters unavailable ids, and keeps chips editable', () => {
  const opts = {
    vehicles: [{ id: 'a', label: 'AAA', driver_id: 'da', loader_ids: ['1', '2', 'missing'] }, { id: 'b', label: 'BBB', driver_id: 'db', loader_ids: ['3'] }],
    drivers: [{ id: 'da', name: 'A driver' }, { id: 'db', name: 'B driver' }],
    loaders: [{ id: '3', name: 'Third', truck: 'BBB' }, { id: '1', name: 'First', truck: 'AAA' }, { id: '2', name: 'Second', truck: 'AAA' }],
  }
  function Test() { const [v, setV] = React.useState(emptyTransport); return <TransportFields value={v} onChange={setV} options={opts} /> }
  render(<Test />)
  fireEvent.change(screen.getByLabelText('Truck'), { target: { value: 'a' } })
  expect(screen.getByLabelText('Driver')).toHaveValue('da')
  expect(screen.getAllByRole('button').map(x => x.textContent)).toEqual(['First · AAA', 'Second · AAA', 'Third · BBB'])
  expect(screen.getByRole('button', { name: 'First · AAA' })).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByRole('button', { name: 'Second · AAA' })).toHaveAttribute('aria-pressed', 'true')
  fireEvent.change(screen.getByLabelText('Truck'), { target: { value: 'b' } })
  expect(screen.getByLabelText('Driver')).toHaveValue('db')
  expect(screen.getByRole('button', { name: 'First · AAA' })).toHaveAttribute('aria-pressed', 'false')
  expect(screen.getByRole('button', { name: 'Third · BBB' })).toHaveAttribute('aria-pressed', 'true')
  fireEvent.change(screen.getByLabelText('Truck'), { target: { value: 'other' } })
  expect(screen.getByRole('button', { name: 'Third · BBB' })).toHaveAttribute('aria-pressed', 'true')
  fireEvent.change(screen.getByLabelText('Truck'), { target: { value: '' } })
  expect(screen.getByRole('button', { name: 'Third · BBB' })).toHaveAttribute('aria-pressed', 'true')
  fireEvent.click(screen.getByRole('button', { name: 'Third · BBB' }))
  expect(screen.getByRole('button', { name: 'Third · BBB' })).toHaveAttribute('aria-pressed', 'false')
})
