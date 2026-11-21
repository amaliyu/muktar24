import React from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AssignedSiteProvider } from '../AssignedSite'
import { RosterCreateForm } from '../Labour'
import SiteAttendance, { useMorningScan } from './SiteAttendance'
import SiteManagerClock from './SiteManagerClock'
import { notificationTarget } from '../NotificationBell'
import { WagesToPay } from '../DailyWages'

const db = vi.hoisted(() => ({ calls: [], accuracy: 25, roster: [], status: 'pending', engine: null, upload: vi.fn(), frame: [], time: 0 }))
vi.mock('@vladmandic/human', () => ({ default: class {
  constructor(config) {
    db.engine = config
    this.tf = { getBackend: () => config.backend }
  }
  load() {}
  warmup() {}
  detect() { db.time++; return { face: db.frame } }
} }))
vi.mock('../../lib/supabase', async () => {
  const { createSupabaseMock } = await import('../../test/supabaseMock')
  const { supabase, calls } = createSupabaseMock((table, args) => {
    let data = []
    const rows = {
      production_sites: args?.some?.(([name]) => name === 'single')
        ? { geo_status: db.status, geo_radius_m: 300, geo_lat: 9, geo_lng: 7 }
        : [{ id: 'site', name: 'Kado', labour_pay_mode: 'daily' }],
      labour_pool: [{ id: 'crew', full_name: 'Crew member', is_active: true }],
      labour_face_profiles: [],
      face_match_settings: { min_liveness: 0.7 },
      'rpc:my_assigned_site': 'site',
      'rpc:site_crew_register': { check_ins: db.roster, registered_faces: 1, on_roster_not_checked_in: [] },
      'rpc:crew_check_in': { name: 'Crew member', checked_at: '2026-11-21T06:12:00Z' },
      'rpc:site_manager_clock': { punch_type: 'IN', distance_m: 42, at: '2026-11-21T06:12:00Z' },
      'rpc:daily_wages_due': [{ roster_id: 'roster', site_id: 'site', md_status: 'approved', roster_date: '2026-11-21', workers: 1, total: 6000 }],
    }
    if (table === 'rpc:pay_daily_roster') return { error: { message: 'Some workers have not checked in.' } }
    if (table in rows) data = rows[table]
    return { data, error: null }
  })
  db.calls = calls
  return { supabase: { ...supabase, storage: { from: () => ({ upload: db.upload }) } } }
})

const md = { role: 'md' }
const assigned = { role: 'assistant_production_manager' }
const page = profile => render(<AssignedSiteProvider><SiteAttendance userProfile={profile} /></AssignedSiteProvider>)
const face = (embedding = [1, 2]) => ({ embedding, score: .9, box: [0, 0, 100, 100], live: .8, real: .9 })
const click = name => fireEvent.click(screen.getByRole('button', { name }))
const choose = (label, value) => fireEvent.change(screen.getByLabelText(label), { target: { value } })
const rpc = name => db.calls.filter(call => call.rpc === name)
let updateLocation

beforeEach(() => {
  db.calls.length = 0
  db.frame = [face()]
  db.time = 0
  db.accuracy = 25
  db.roster = []
  db.status = 'pending'
  db.upload.mockImplementation(async path => {
    db.calls.push({ upload: path })
    return { data: {}, error: null }
  })
  vi.stubGlobal('localStorage', { getItem: () => 'phone-uuid', setItem: vi.fn() })
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value: {
    watchPosition(callback) {
      updateLocation = () => callback({ coords: { latitude: 9, longitude: 7, accuracy: db.accuracy }, timestamp: Date.now() })
      updateLocation()
      return 1
    },
    clearWatch: vi.fn(),
  } })
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: {
    getUserMedia: vi.fn(async () => ({ getTracks: () => [{ stop: vi.fn() }] })),
  } })
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()
  vi.spyOn(HTMLMediaElement.prototype, 'currentTime', 'get').mockImplementation(() => db.time)
  vi.spyOn(HTMLVideoElement.prototype, 'videoWidth', 'get').mockReturnValue(320)
  vi.spyOn(HTMLVideoElement.prototype, 'videoHeight', 'get').mockReturnValue(240)
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ({ drawImage: vi.fn() }))
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(callback => callback(new Blob(['photo'], { type: 'image/jpeg' })))
  vi.stubGlobal('createImageBitmap', async () => ({ width: 320, height: 240, close: vi.fn() }))
})
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

it('requires consent, then uploads the JPEG before enrolling the average of three frames', async () => {
  page(assigned)
  fireEvent.click(await screen.findByRole('button', { name: 'Register faces' }))
  await screen.findByRole('option', { name: 'Crew member' })
  choose('Worker', 'crew')
  expect(screen.getByRole('button', { name: 'Capture 3 frames' })).toBeDisabled()
  expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled()
  fireEvent.click(screen.getByLabelText('The worker agreed'))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Capture 3 frames' })).toBeEnabled())
  // The video clock advances independently of the model's inference.
  vi.spyOn(HTMLMediaElement.prototype, 'currentTime', 'get').mockImplementation(() => {
    const i = db.time++
    db.frame = [face([i, i * 2])]
    return i
  })
  vi.useFakeTimers()
  click('Capture 3 frames')
  await act(() => vi.advanceTimersByTimeAsync(2100))
  const [entry] = rpc('enroll_worker_face')
  expect(entry.args).toEqual(expect.objectContaining({
    p_site_id: 'site', p_labour_id: 'crew', p_descriptor: [2, 4], p_model: 'human-faceres', p_consent: true, p_photo_path: 'site/enrol/crew.jpg',
  }))
  expect(db.calls.indexOf(entry)).toBeGreaterThan(db.calls.findIndex(call => call.upload === 'site/enrol/crew.jpg'))
})

describe('live scanning', () => {
  function Scan({ detect, video, location }) {
    useMorningScan({
      camera: { engine: detect, video }, fix: location, threshold: .7,
      site: 'site', refresh: () => {}, lastCall: React.useRef(-Infinity), enabled: true,
    })
    return null
  }

  it('skips no face, multiple faces and small faces, then sends a fresh live frame with location', async () => {
    vi.useFakeTimers()
    const video = { current: { videoWidth: 320, currentTime: 1 } }
    const detect = { detect: vi.fn(async () => ({ face: db.frame })) }
    render(<Scan detect={detect} video={video} location={{ lat: 9, lng: 7, accuracy: 25, at: Date.now() }} />)
    for (const frame of [[], [face(), face()], [{ ...face(), box: [0, 0, 40, 20] }]]) {
      db.frame = frame
      video.current.currentTime++
      await act(() => vi.advanceTimersByTimeAsync(300))
    }
    expect(rpc('crew_check_in')).toHaveLength(0)
    db.frame = [face()]
    video.current.currentTime++
    await act(() => vi.advanceTimersByTimeAsync(1800))
    expect(rpc('crew_check_in')[0].args).toEqual({
      p_site_id: 'site', p_descriptor: [1, 2], p_model: 'human-faceres', p_liveness: .8, p_lat: 9, p_lng: 7, p_accuracy_m: 25, p_device_id: 'phone-uuid',
    })
    await act(() => vi.advanceTimersByTimeAsync(4000))
    expect(rpc('crew_check_in')).toHaveLength(1)
    video.current.currentTime++
    await act(() => vi.advanceTimersByTimeAsync(1900))
    expect(rpc('crew_check_in')).toHaveLength(2)
  })
})

it('requires a manual reason and photo before recording the check-in', async () => {
  page(assigned)
  fireEvent.click(await screen.findByRole('button', { name: 'Morning register' }))
  click('Manual check-in')
  await screen.findByRole('option', { name: 'Crew member' })
  choose('Worker', 'crew')
  choose('Why did the face check fail?', 'Face was not recognised.')
  expect(screen.getByRole('button', { name: 'Save check-in' })).toBeDisabled()
  fireEvent.change(screen.getByLabelText('Take a photo'), { target: { files: [new File(['photo'], 'crew.jpg', { type: 'image/jpeg' })] } })
  choose('Why did the face check fail?', 'short')
  expect(screen.getByRole('button', { name: 'Save check-in' })).toBeDisabled()
  choose('Why did the face check fail?', 'Face was not recognised.')
  const save = screen.getByRole('button', { name: 'Save check-in' })
  expect(save).toBeEnabled()
  fireEvent.submit(save.closest('form'))
  await waitFor(() => expect(rpc('crew_check_in_manual')[0]?.args).toMatchObject({ p_labour_id: 'crew', p_device_id: 'phone-uuid', p_photo_path: expect.stringMatching(/^site\/manual\/\d{4}-\d{2}-\d{2}\/crew\.jpg$/) }))
})

it('requires location within 50 m accuracy and lets the MD approve or reject', async () => {
  db.accuracy = 51
  page(md)
  const propose = await screen.findByRole('button', { name: 'Set site location from here' })
  expect(propose).toBeDisabled()
  db.accuracy = 50
  act(() => updateLocation())
  fireEvent.click(propose)
  expect(rpc('propose_site_location')[0].args).toEqual({ p_site_id: 'site', p_lat: 9, p_lng: 7, p_accuracy_m: 50 })
  await waitFor(() => expect(screen.getByRole('button', { name: 'Approve' })).toBeEnabled())
  click('Approve')
  expect(rpc('approve_site_location')[0].args).toEqual({ p_site_id: 'site', p_approve: true, p_radius_m: 300 })
  await waitFor(() => expect(screen.getByRole('button', { name: 'Reject' })).toBeEnabled())
  click('Reject')
  expect(rpc('approve_site_location')[1].args.p_approve).toBe(false)
})

it('clocks site managers in using a fresh fix and shows distance returned', async () => {
  render(<SiteManagerClock userProfile={{ staff_id: 'staff', assigned_site_id: 'site' }} />)
  click('Clock in')
  expect(await screen.findByText(/42 m from site centre/)).toBeInTheDocument()
  expect(rpc('site_manager_clock')[0].args).toEqual({ p_punch_type: 'IN', p_lat: 9, p_lng: 7, p_accuracy_m: 25, p_device_id: 'phone-uuid' })
})

it.each(['ico', 'hr_officer'])('shows a read-only register to %s', async role => {
  db.roster = [{ labour_id: 'crew', name: 'Crew member', method: 'face', checked_at: '2026-11-21T06:12:00Z' }]
  page({ role })
  expect(await screen.findByText('Crew member')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Register faces' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Morning register' })).toBeNull()
})

it('fills roster rows from the register', async () => {
  db.roster = [{ labour_id: 'crew', name: 'Crew member' }]
  render(<AssignedSiteProvider><RosterCreateForm userProfile={assigned} pool={[{ id: 'crew', is_active: true, full_name: 'Crew member' }]} roles={[{ id: 'job', site_id: 'site', role_name: 'Site crew', base_rate: 6000 }]} /></AssignedSiteProvider>)
  const fill = await screen.findByRole('button', { name: "Fill from today's register" })
  await waitFor(() => expect(fill).toBeEnabled())
  fireEvent.click(fill)
  expect(screen.getByRole('combobox', { name: 'Job / role' })).toHaveValue('job')
  expect(fill).toBeDisabled()
})

it('shows payment coverage and the wage payment refusal as returned', async () => {
  render(<WagesToPay userProfile={md} />)
  expect(await screen.findByText('Register: 1 of 1 checked in')).toBeInTheDocument()
  click('Record payment')
  choose('Paid to', 'Site lead')
  choose('Transfer reference', 'REF')
  click('Save payment')
  expect(await screen.findByText('Some workers have not checked in.')).toBeInTheDocument()
})

it('routes attendance notifications and limits site location notifications to the MD', () => {
  expect(notificationTarget('crew_check_ins', assigned)).toBe('site_attendance')
  expect(notificationTarget('production_sites', md)).toBe('site_attendance')
  expect(notificationTarget('production_sites', assigned)).toBeUndefined()
})
