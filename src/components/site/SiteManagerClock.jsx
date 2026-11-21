import React, { useEffect, useRef, useState } from 'react'
import { Clock } from 'lucide-react'
import { todayLagos } from '../../utils/lagosDate'
import { siteAttendance } from '../../services/siteAttendance'
import { deviceId, freshFix, useLocation } from './attendanceHooks'

const time = value => new Date(value).toLocaleTimeString('en-GB', { timeZone: 'Africa/Lagos', hour: '2-digit', minute: '2-digit' })

function ClockCard({ staff }) {
  const [tracking, setTracking] = useState(false)
  const pending = useRef(null)
  const { fix, error: geoError } = useLocation(tracking)
  const [punches, setPunches] = useState([])
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [revision, setRevision] = useState(0)
  const date = todayLagos()
  useEffect(() => {
    let active = true
    siteAttendance.punches(staff, date).then(rows => { if (active) setPunches(rows) })
      .catch(error => { if (active) setError(error.message) })
    return () => { active = false }
  }, [staff, date, revision])

  async function clock(type) {
    const location = freshFix(fix)
    if (!location) { pending.current = type; setTracking(true); return }
    pending.current = null
    setError('')
    setSaving(true)
    try {
      setResult(await siteAttendance.clock(type, location, deviceId()))
      setRevision(n => n + 1)
      setTracking(false)
    } catch (error) { setError(error.message) }
    finally { setSaving(false) }
  }
  useEffect(() => {
    if (fix && pending.current && !saving) clock(pending.current)
  }, [fix, saving])

  return <section style={{ padding: 14, marginBottom: 14, border: '1px solid #414963', borderRadius: 10, overflowWrap: 'anywhere' }}>
    <h2><Clock size={18} aria-hidden="true" /> Site manager attendance</h2>
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      <button style={{ minHeight: 44 }} disabled={saving || (tracking && !fix)} onClick={() => clock('IN')}>Clock in</button>
      <button style={{ minHeight: 44 }} disabled={saving || (tracking && !fix)} onClick={() => clock('OUT')}>Clock out</button>
    </div>
    {tracking && <p role={geoError ? 'alert' : 'status'}>{geoError || (fix ? 'Location ±' + Math.round(fix.accuracy) + ' m' : 'Finding your location…')}</p>}
    {tracking && <button style={{ minHeight: 44 }} disabled={saving} onClick={() => { pending.current = null; setTracking(false) }}>Cancel location request</button>}
    {error && <p role="alert">{error}</p>}
    {result && <p role="status">{result.punch_type === 'IN' ? 'Clocked in' : 'Clocked out'} at {time(result.at)} · {result.distance_m} m from site centre</p>}
    <h3>Today’s punches</h3>
    {punches.length ? <ul>{punches.map(punch => <li key={punch.id}>{punch.punch_type === 'IN' ? 'In' : 'Out'} {time(punch.punch_time)}{punch.distance_m == null ? '' : ' · ' + Math.round(punch.distance_m) + ' m'}</li>)}</ul> : <p>No punches yet today.</p>}
  </section>
}

export default function SiteManagerClock({ userProfile }) {
  return userProfile?.staff_id && userProfile?.assigned_site_id ? <ClockCard key={userProfile.staff_id} staff={userProfile.staff_id} /> : null
}
