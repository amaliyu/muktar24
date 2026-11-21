import React, { useEffect, useRef, useState } from 'react'
import { Check, ScanFace } from 'lucide-react'
import SitePicker from '../SitePicker'
import { withAssignedSite } from '../AssignedSite'
import MobileScope from '../MobileScope'
import { hasRole } from '../../lib/roles'
import { todayLagos } from '../../utils/lagosDate'
import { averageFaces, captureJpeg, validFace } from '../../utils/siteFace'
import { siteAttendance } from '../../services/siteAttendance'
import { deviceId, freshFix, useFaceCamera, useLocation } from './attendanceHooks'

const control = { minHeight: 44, maxWidth: '100%', boxSizing: 'border-box' }
const panel = { marginBlock: 12, padding: 14, border: '1px solid #414963', borderRadius: 10, overflowWrap: 'anywhere', minWidth: 0 }
export const attendanceTime = value => new Date(value).toLocaleTimeString('en-GB', { timeZone: 'Africa/Lagos', hour: '2-digit', minute: '2-digit' })
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))

function LocationHint({ location }) {
  return <p role={location.error ? 'alert' : undefined}>{location.error || (location.fix ? 'Location ±' + Math.round(location.fix.accuracy) + ' m' : 'Waiting for a fresh location…')}</p>
}

function LocationPanel({ site, md, location }) {
  const [details, setDetails] = useState(null)
  const [radius, setRadius] = useState(300)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    let active = true
    siteAttendance.location(site).then(data => {
      if (active) { setDetails(data); setRadius(data.geo_radius_m ?? 300) }
    }).catch(error => { if (active) setError(error.message) })
    return () => { active = false }
  }, [site, revision])
  async function save(action) {
    setError('')
    setSaving(true)
    try {
      await action()
      setRevision(n => n + 1)
    } catch (error) { setError(error.message) }
    finally { setSaving(false) }
  }
  const propose = () => {
    const fix = freshFix(location.fix)
    if (fix && fix.accuracy <= 50) save(() => siteAttendance.propose(site, fix))
  }
  return <section style={panel}>
    <h2>Site location</h2>
    {details && <p>{({ unset: 'Not set', pending: 'Waiting for MD approval', approved: 'Approved' })[details.geo_status] || 'Not set'}</p>}
    <LocationHint location={location} />
    {error && <p role="alert">{error}</p>}
    <button style={control} disabled={saving || !location.fix || location.fix.accuracy > 50} onClick={propose}>Set site location from here</button>
    {location.fix?.accuracy > 50 && <p>Stand in the open and wait for accuracy within 50 m.</p>}
    {md && details?.geo_lat != null && details.geo_lng != null && (
      <p><a className="m-tap" style={{ ...control, display: 'inline-flex', alignItems: 'center' }} href={'https://www.google.com/maps?q=' + details.geo_lat + ',' + details.geo_lng} target="_blank" rel="noreferrer">Open in Google Maps</a></p>
    )}
    {md && details?.geo_status === 'pending' && <form className="m-form" onSubmit={event => {
      event.preventDefault()
      save(() => siteAttendance.review(site, true, Number(radius)))
    }}>
      <label>Radius (m) <input style={control} type="number" min="50" max="2000" step="1" required value={radius} onChange={e => setRadius(e.target.value)} /></label>
      <button style={control} disabled={saving}>Approve</button>{' '}
      <button style={control} type="button" disabled={saving} onClick={() => save(() => siteAttendance.review(site, false))}>Reject</button>
    </form>}
  </section>
}

function CameraPreview({ camera }) {
  return <>
    <video ref={camera.video} muted playsInline aria-label="Camera preview" style={{ display: 'block', width: '100%', maxWidth: 520, borderRadius: 8, background: '#111722' }} />
    {camera.loading && <p role="status">Loading face models. The first download can take a minute on mobile data.</p>}
    {camera.error && <p role="alert">{camera.error} <button style={control} onClick={camera.retry}>Retry</button></p>}
  </>
}

function WorkerSelect({ workers, worker, setWorker, registered = [], disabled }) {
  return <label style={{ display: 'block' }}>Worker <select style={{ ...control, width: '100%' }} value={worker} disabled={disabled} onChange={e => setWorker(e.target.value)}>
    <option value="">Choose a worker</option>
    {workers.map(row => <option key={row.id} value={row.id}>{row.full_name}{registered.includes(row.id) ? ' (face registered)' : ''}</option>)}
  </select></label>
}

function Enrolment({ site, workers, registered, refresh }) {
  const [worker, setWorker] = useState('')
  const [consent, setConsent] = useState(false)
  const [capturing, setCapturing] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const camera = useFaceCamera(Boolean(worker && consent), 'environment')
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  async function capture() {
    const video = camera.video.current
    if (!consent || !worker || !camera.engine || !video) return
    setCapturing(true)
    setError('')
    setMessage('')
    try {
      const embeddings = []
      let photo
      let lastTime = -1
      for (let i = 0; i < 3; i++) {
        if (i) await pause(1000)
        if (!mounted.current) return
        const frameTime = video.currentTime
        const frame = validFace(await camera.engine.detect(video), video.videoWidth)
        if (!frame || frameTime === lastTime) throw new Error('One person, closer to the camera')
        lastTime = frameTime
        embeddings.push(frame.embedding)
        if (i === 2) photo = await captureJpeg(video, video.videoWidth, video.videoHeight)
        setMessage('Captured ' + (i + 1) + ' of 3 frames.')
      }
      if (!mounted.current) return
      await siteAttendance.enrol(site, worker, averageFaces(embeddings), photo, consent)
      refresh()
      setConsent(false)
      setMessage('Face registered.')
    } catch (error) { if (mounted.current) setError(error.message) }
    finally { if (mounted.current) setCapturing(false) }
  }

  return <section style={panel}>
    <h2>Register faces</h2>
    <WorkerSelect workers={workers} worker={worker} setWorker={value => { setWorker(value); setConsent(false); setMessage(''); setError('') }} registered={registered} disabled={capturing} />
    {worker && <>
      <p>Read this to the worker</p>
      <blockquote>I agree that APCL may store my face pattern and one photo to confirm my attendance at this site. It will not be used for anything else and will be deleted when I stop working for APCL.</blockquote>
      <label style={{ minHeight: 44, display: 'flex', alignItems: 'center', gap: 8 }}><input type="checkbox" checked={consent} disabled={capturing} onChange={e => setConsent(e.target.checked)} /> The worker agreed</label>
      {consent && <CameraPreview camera={camera} />}
      <button style={control} disabled={!consent || !camera.engine || capturing} onClick={capture}>Capture 3 frames</button>
    </>}
    {message && <p role="status">{message}</p>}
    {error && <p role="alert">{error}</p>}
  </section>
}

export function useMorningScan({ camera, fix, threshold, site, refresh, lastCall, enabled }) {
  const latest = useRef({ fix, refresh })
  latest.current = { fix, refresh }
  const [notice, setNotice] = useState({ message: 'One person, closer to the camera' })
  useEffect(() => {
    if (!enabled || !camera.engine || threshold == null) return
    let stopped = false
    let timer
    let lastFrame = -1
    const schedule = (fn, ms) => { if (!stopped) timer = setTimeout(fn, ms) }
    async function scan() {
      const video = camera.video.current
      if (!video?.videoWidth || video.currentTime === lastFrame || !freshFix(latest.current.fix) || Date.now() - lastCall.current < 2000) {
        schedule(scan, 200)
        return
      }
      lastFrame = video.currentTime
      try {
        const frame = validFace(await camera.engine.detect(video), video.videoWidth)
        if (stopped) return
        if (!frame) {
          setNotice({ message: 'One person, closer to the camera' })
          schedule(scan, 250)
          return
        }
        if (frame.liveness < threshold) {
          setNotice({ message: 'Face the camera and move slightly.' })
          schedule(scan, 250)
          return
        }
        setNotice({ message: 'Hold still…' })
        schedule(async () => {
          const currentFix = freshFix(latest.current.fix)
          if (!currentFix) { schedule(scan, 250); return }
          lastCall.current = Date.now()
          try {
            const result = await siteAttendance.checkIn(site, frame, currentFix, deviceId())
            latest.current.refresh()
            if (!stopped) setNotice({
              message: (result.already ? result.name + ' · Already checked in at ' : result.name + ' ') + attendanceTime(result.checked_at),
              success: true,
            })
          } catch (error) { if (!stopped) setNotice({ message: error.message, error: true }) }
          schedule(scan, 2200)
        }, 1500)
      } catch (error) {
        if (!stopped) setNotice({ message: error.message, error: true })
        schedule(scan, 2200)
      }
    }
    schedule(scan, 100)
    return () => { stopped = true; clearTimeout(timer) }
  }, [enabled, camera.engine, camera.video, threshold, site, lastCall])
  return notice
}

function ManualCheckIn({ site, workers, fix, refresh, onCancel }) {
  const [worker, setWorker] = useState('')
  const [reason, setReason] = useState('')
  const [photo, setPhoto] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  async function submit(event) {
    event.preventDefault()
    const location = freshFix(fix)
    if (!worker || reason.trim().length < 10 || !photo || !location) return
    setSaving(true)
    setError('')
    try {
      const image = await createImageBitmap(photo)
      let jpeg
      try { jpeg = await captureJpeg(image, image.width, image.height) } finally { image.close() }
      await siteAttendance.manual(site, todayLagos(), worker, reason, jpeg, location, deviceId())
      refresh()
      onCancel()
    } catch (error) { setError(error.message) }
    finally { setSaving(false) }
  }
  return <form className="m-form" onSubmit={submit} style={panel}>
    <h3>Manual check-in</h3>
    <WorkerSelect workers={workers} worker={worker} setWorker={setWorker} disabled={saving} />
    <p><label>Why did the face check fail? <textarea style={{ ...control, width: '100%' }} value={reason} onChange={e => setReason(e.target.value)} minLength={10} required /></label></p>
    <p><label>Take a photo <input style={control} type="file" accept="image/*" capture="environment" onChange={e => setPhoto(e.target.files[0] || null)} required /></label></p>
    {error && <p role="alert">{error}</p>}
    <button style={control} disabled={saving || !worker || reason.trim().length < 10 || !photo || !fix}>Save check-in</button>{' '}
    <button style={control} type="button" disabled={saving} onClick={onCancel}>Cancel</button>
  </form>
}

function Morning({ site, workers, location, refresh, lastCall }) {
  const [scanning, setScanning] = useState(false)
  const [manual, setManual] = useState(false)
  const [facing, setFacing] = useState('environment')
  const [threshold, setThreshold] = useState(null)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    let active = true
    siteAttendance.settings().then(data => {
      if (active) { setThreshold(Number(data.min_liveness)); setError('') }
    }).catch(error => { if (active) setError(error.message) })
    return () => { active = false }
  }, [revision])
  const camera = useFaceCamera(scanning && !manual, facing)
  const notice = useMorningScan({ camera, fix: location.fix, threshold, site, refresh, lastCall, enabled: scanning && !manual })
  return <section style={panel}>
    <h2>Morning register</h2>
    <LocationHint location={location} />
    {error && <p role="alert">{error} <button style={control} onClick={() => setRevision(n => n + 1)}>Retry</button></p>}
    {!manual && <>
      <div className="m-wrap" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <button style={control} disabled={!scanning && threshold == null} onClick={() => setScanning(value => !value)}>{scanning ? 'Stop camera' : 'Start camera'}</button>
        <button style={control} onClick={() => setFacing(value => value === 'environment' ? 'user' : 'environment')}>{facing === 'environment' ? 'Use front camera' : 'Use back camera'}</button>
        <button style={control} onClick={() => { setScanning(false); setManual(true) }}>Manual check-in</button>
      </div>
      {scanning && <>
        <CameraPreview camera={camera} />
        <p role={notice.error ? 'alert' : 'status'} style={{ fontSize: notice.success ? 24 : 16, color: notice.success ? '#2dd4a0' : undefined }}>{notice.success && <Check size={22} aria-hidden="true" />} {notice.message}</p>
      </>}
    </>}
    {manual && <ManualCheckIn site={site} workers={workers} fix={location.fix} refresh={refresh} onCancel={() => setManual(false)} />}
  </section>
}

function ManualPhoto({ path }) {
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')
  async function show() {
    setError('')
    try { setUrl(await siteAttendance.photo(path)) } catch (error) { setError(error.message) }
  }
  return <>
    <button data-ico-allow style={control} onClick={show}>{url ? 'Reload photo' : 'View photo'}</button>
    {url && <img src={url} alt="Manual check-in photo" style={{ display: 'block', width: '100%', maxWidth: 320, marginTop: 8 }} />}
    {error && <p role="alert">{error}</p>}
  </>
}

function Register({ site, date, revision, showSimilarity }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    setError('')
    setData(null)
    siteAttendance.register(site, date).then(data => { if (active) setData(data) })
      .catch(error => { if (active) setError(error.message) })
    return () => { active = false }
  }, [site, date, revision])
  return <section style={panel} aria-label="Crew register">
    <h2>Crew register</h2>
    {error ? <p role="alert">{error}</p> : !data ? <p>Loading register…</p> : <>
      <p>{data.check_ins.length} checked in · {data.registered_faces} registered</p>
      {data.check_ins.map(row => <article key={row.labour_id} style={{ ...panel, ...(row.method === 'manual' ? { borderColor: '#f5a623', background: '#f5a62315' } : {}) }}>
        <strong>{row.name}</strong> · {attendanceTime(row.checked_at)} · {row.method === 'manual' ? 'Manual' : 'Face'}
        {showSimilarity && row.similarity != null && <small> · Match {Math.round(row.similarity * 100)}%</small>}
        {row.method === 'manual' && <>
          <p>{row.manual_reason}</p>
          {row.manual_photo_path && <ManualPhoto path={row.manual_photo_path} />}
        </>}
      </article>)}
      {data.on_roster_not_checked_in.length > 0 && <div style={{ color: '#f06b6b' }}>
        <strong>On the roster but not checked in</strong>
        <ul>{data.on_roster_not_checked_in.map(row => <li key={row.labour_id}>{row.name}</li>)}</ul>
      </div>}
    </>}
  </section>
}

function SiteView({ site, userProfile }) {
  const md = hasRole(userProfile, 'md')
  const manage = hasRole(userProfile, 'md', 'production_manager', 'assistant_production_manager')
  const location = useLocation(manage)
  const [tab, setTab] = useState('register')
  const [date, setDate] = useState(todayLagos)
  const [workers, setWorkers] = useState([])
  const [registered, setRegistered] = useState([])
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const lastCall = useRef(-Infinity)
  const refresh = () => setRevision(n => n + 1)
  useEffect(() => {
    if (!manage) return
    let active = true
    Promise.all([siteAttendance.workers(), siteAttendance.registered(site)]).then(([workers, profiles]) => {
      if (active) { setWorkers(workers); setRegistered(profiles.map(profile => profile.labour_id)); setError('') }
    }).catch(error => { if (active) setError(error.message) })
    return () => { active = false }
  }, [manage, revision, site])
  return <>
    {manage && <LocationPanel site={site} md={md} location={location} />}
    {manage && <div className="m-wrap" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {[['register', 'View register'], ['enrol', 'Register faces'], ['morning', 'Morning register']].map(([id, label]) =>
        <button key={id} style={control} aria-pressed={tab === id} onClick={() => setTab(id)}>{label}</button>)}
    </div>}
    {error && <p role="alert">{error} <button style={control} onClick={refresh}>Retry</button></p>}
    {manage && tab === 'enrol' && <Enrolment site={site} workers={workers} registered={registered} refresh={refresh} />}
    {manage && tab === 'morning' && <Morning site={site} workers={workers} location={location} refresh={refresh} lastCall={lastCall} />}
    {tab === 'register' && <label>Register date <input data-ico-allow style={control} type="date" value={date} max={todayLagos()} onChange={e => setDate(e.target.value)} /></label>}
    {(tab === 'morning' || (tab === 'register' && date)) && <Register site={site} date={tab === 'morning' ? todayLagos() : date} revision={revision} showSimilarity={hasRole(userProfile, 'md', 'ico')} />}
  </>
}

function SiteAttendance({ userProfile, assignedSiteId, initialSiteId }) {
  const [site, setSite] = useState(assignedSiteId || initialSiteId || '')
  return <MobileScope fit>
    <div style={{ ...panel, border: 0, padding: 0 }}>
      <h1><ScanFace aria-hidden="true" size={22} /> Site Attendance</h1>
      <label htmlFor="attendance-site">Site</label>
      <SitePicker id="attendance-site" value={site} onChange={setSite} allowAll={!assignedSiteId} allowIco allLabel="Choose a site" />
      {site && <SiteView key={site} site={site} userProfile={userProfile} />}
    </div>
  </MobileScope>
}
export default withAssignedSite(SiteAttendance)
