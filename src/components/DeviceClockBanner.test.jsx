import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import DeviceClockBanner from './DeviceClockBanner'
import { checkDeviceClock, clockWarningText } from '../utils/clockCheck'
import { startSessionMonitor } from '../utils/sessionMonitor'

const f = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('../lib/supabase', () => ({ supabase: { rpc: f.rpc } }))
const epoch = Date.parse('2026-11-21T08:00:00Z')
beforeEach(() => f.rpc.mockReset())
afterEach(() => { cleanup(); vi.restoreAllMocks() })

it.each([[300000, false], [300001, true], [-360000, true]])('uses the network midpoint for offset %s', async (offsetMs, wrong) => {
  const rpc = vi.fn().mockResolvedValue({ data: new Date(epoch + 100 + offsetMs).toISOString() })
  const now = vi.fn().mockReturnValueOnce(epoch).mockReturnValueOnce(epoch + 200)
  expect(await checkDeviceClock({ rpc }, now)).toEqual({ offsetMs, wrong })
  expect(rpc).toHaveBeenCalledWith('server_time')
})

it('never warns when the RPC fails or returns an invalid time', async () => {
  const rpc = vi.fn().mockResolvedValueOnce({ error: new Error('offline') })
    .mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ data: null })
  for (let i = 0; i < 3; i++) expect(await checkDeviceClock({ rpc })).toBeNull()
})

it('describes ahead and behind with minutes or hours', () => {
  expect(clockWarningText(-6 * 60000)).toBe("This device's clock is 6 minutes ahead — set date and time to automatic.")
  expect(clockWarningText(120 * 60000)).toBe("This device's clock is 2 hours behind — set date and time to automatic.")
})

it('dismisses the warning and only checks again on visibility after an hour', async () => {
  let elapsed = 0
  vi.spyOn(performance, 'now').mockImplementation(() => elapsed)
  f.rpc.mockImplementation(async () => ({ data: new Date(Date.now() - 7 * 60000).toISOString() }))
  render(<DeviceClockBanner userId="worker" />)
  expect(await screen.findByRole('status')).toHaveTextContent('7 minutes ahead')
  fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
  elapsed = 59 * 60000
  fireEvent(document, new Event('visibilitychange'))
  expect(f.rpc).toHaveBeenCalledTimes(1)
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
  elapsed = 60 * 60000
  fireEvent(document, new Event('visibilitychange'))
  expect(await screen.findByRole('status')).toHaveTextContent('7 minutes ahead')
  expect(f.rpc).toHaveBeenCalledTimes(2)
})

it('shows no clock banner for a correctly set clock with an old restored session expiry', async () => {
  const now = Date.now()
  f.rpc.mockResolvedValue({ data: new Date(now).toISOString() })
  const warning = vi.fn()
  const stop = startSessionMonitor({
    session: { expires_at: Math.floor(now / 1000) + 600, expires_in: 3600 },
    receivedAt: 0, now: () => 0, wallNow: () => now, auth: {}, onWarning: warning,
  })
  try {
    render(<DeviceClockBanner userId="worker" />)
    await waitFor(() => expect(f.rpc).toHaveBeenCalledWith('server_time'))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(warning).toHaveBeenCalledWith(true, 10)
  } finally { stop() }
})
