import { cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useFaceCamera } from './attendanceHooks'
import { getFaceEngineCheck, loadFaceEngine } from '../../utils/siteFace'
import { siteAttendance } from '../../services/siteAttendance'
vi.mock('../../utils/siteFace', () => ({ loadFaceEngine: vi.fn(), getFaceEngineCheck: vi.fn() }))
vi.mock('../../services/siteAttendance', () => ({ siteAttendance: { logEngine: vi.fn() } }))
beforeEach(() => {
  loadFaceEngine.mockResolvedValue({})
  getFaceEngineCheck.mockReturnValue({ backend: 'wasm', score: 1, min: .98 })
  siteAttendance.logEngine.mockResolvedValue({ passed: true })
  vi.stubGlobal('localStorage', { getItem: () => 'phone' })
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: vi.fn(async () => ({ getTracks: () => [] })) } })
})
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals() })
it('logs a passing check before opening the camera and exposes the check', async () => {
  const { result } = renderHook(() => useFaceCamera(true, 'environment', 'site'))
  result.current.video.current = { play: vi.fn(async () => {}) }
  await waitFor(() => expect(result.current.engineCheck).toEqual({ backend: 'wasm', score: 1 }))
  expect(siteAttendance.logEngine).toHaveBeenCalledWith('site', { backend: 'wasm', score: 1, min: .98 }, expect.any(String))
  expect(siteAttendance.logEngine).toHaveBeenCalledTimes(1)
})
it.each(['self-test', 'server', 'network'])('blocks camera on %s failure', async kind => {
  if (kind === 'self-test') getFaceEngineCheck.mockReturnValue({ backend: 'wasm', score: .42, min: .98 })
  if (kind === 'server') siteAttendance.logEngine.mockResolvedValue({ passed: false })
  if (kind === 'network') siteAttendance.logEngine.mockRejectedValue(new Error('offline'))
  const { result } = renderHook(() => useFaceCamera(true, 'environment', 'site'))
  await waitFor(() => expect(result.current.error).toContain(kind === 'network' ? 'Check the network and tap Retry.' : 'Use “Check in without face”'))
  if (kind === 'self-test') expect(result.current.error).toContain('0.420')
  expect(siteAttendance.logEngine).toHaveBeenCalledTimes(1)
  expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled()
})
