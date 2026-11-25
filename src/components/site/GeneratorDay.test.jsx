import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import GeneratorDay from './GeneratorDay'
import { siteGenerator } from '../../services/siteGenerator'
vi.mock('../../services/storage', () => ({ getSignedDocUrl: vi.fn() }))
vi.mock('../../services/siteGenerator', () => ({ siteGenerator: { day: vi.fn(), record: vi.fn() } }))
beforeEach(() => { siteGenerator.day.mockResolvedValue({ recorded: false, blocks_per_litre: 33 }); siteGenerator.record.mockResolvedValue('id') })
afterEach(() => { cleanup(); vi.clearAllMocks() })
const fill = (label, value) => fireEvent.change(screen.getByLabelText(label), { target: { value } })
async function form() {
  render(<GeneratorDay siteId="site" canWrite />)
  await screen.findByText(/Generator times not recorded for/)
  fill('Generator on', '07:30'); fill('Generator off', '17:00')
}
it('shows missing times and efficiency to readers without an edit form', async () => {
  render(<GeneratorDay siteId="site" canWrite={false} />)
  expect(await screen.findByText(/Generator times not recorded for/)).toBeInTheDocument()
  expect(screen.getAllByText(/Generator times not recorded/)).toHaveLength(1)
  expect(screen.getByText(/Blocks per litre: 33/)).toBeInTheDocument()
  expect(screen.queryByLabelText('Generator on')).toBeNull()
})
it.each([['Generator off', '06:00', /off must be after/], ['Minutes switched off during the day', '570', /must be less/], ['End reading', '5', /End meter/]])('validates %s', async (label, value, message) => {
  await form(); fill('Start reading', '10'); fill(label, value)
  fireEvent.submit(screen.getByRole('button', { name: 'Save generator times' }).closest('form'))
  expect(await screen.findByText(message)).toBeInTheDocument()
  expect(siteGenerator.record).not.toHaveBeenCalled()
})
it('saves the selected site/date, including required late reason, and reloads', async () => {
  await form()
  fill('Generator date', '2026-11-01')
  await screen.findByText(/Generator times not recorded for 01 Nov/)
  fill('Generator on', '07:30'); fill('Generator off', '17:00'); fill("Why wasn't this recorded on time?", 'Generator log was delayed')
  fireEvent.submit(screen.getByRole('button', { name: 'Save generator times' }).closest('form'))
  await waitFor(() => expect(siteGenerator.record).toHaveBeenCalledWith('site', '2026-11-01', expect.objectContaining({ startedAt: '07:30', stoppedAt: '17:00', lateReason: 'Generator log was delayed' })))
  expect(await screen.findByText('Saved')).toBeInTheDocument()
})
