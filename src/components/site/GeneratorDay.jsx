import { useState } from 'react'
import { siteGenerator } from '../../services/siteGenerator'
import { todayLagos } from '../../utils/lagosDate'
import { generatorLine, measures, reading } from '../../utils/siteGenerator'
import { LateReasonField, useLateReason } from '../LateReasonField'
import { useSiteRead } from './useSiteRead'
import { ui, theme, Pill, ErrorBox } from './siteUi'

export function GeneratorMeasures({ day }) {
  if (!day) return null
  return <div>{measures(day).filter(r => r.value != null).map(r => <p key={r.label}>{r.label}: {r.value} {r.target != null && <> · target {r.target} <Pill label={r.pill} color={r.good ? theme.green : theme.red} /></>}</p>)}<p>{reading(day)}</p></div>
}
export function GeneratorSummary({ day, missingLabel }) {
  return <section aria-label="Generator"><h3>Generator</h3><p style={{ color: day?.recorded ? undefined : theme.accent }}>{!day?.recorded && missingLabel ? missingLabel : generatorLine(day)}</p>
    {day?.hour_meter_start != null && day?.hour_meter_end != null && <p>Meter: {day.hour_meter_start} → {day.hour_meter_end} ({day.meter_hours} h)</p>}
    <GeneratorMeasures day={day} /></section>
}
function Editor({ siteId, date, day, onSaved }) {
  const [f, setF] = useState({ startedAt: day.started_at || '', stoppedAt: day.stopped_at || '', breakMinutes: day.break_minutes ?? 0, meterStart: day.hour_meter_start ?? '', meterEnd: day.hour_meter_end ?? '', note: day.note || '' })
  const late = useLateReason(date, day.recorded ? date : undefined)
  const [error, setError] = useState(null), [busy, setBusy] = useState(false)
  const field = (key, label, type = 'number') => <label style={ui.field}>{label}<input style={ui.input} type={type} step={type === 'number' ? 'any' : undefined} min={type === 'number' ? 0 : undefined} required={key === 'startedAt' || key === 'stoppedAt'} value={f[key]} onChange={e => setF({ ...f, [key]: e.target.value })} /></label>
  async function save(e) {
    e.preventDefault(); setError(null)
    const minutes = t => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5))
    if (minutes(f.stoppedAt) <= minutes(f.startedAt)) { setError(new Error('Generator off must be after generator on.')); return }
    if (Number(f.breakMinutes) >= minutes(f.stoppedAt) - minutes(f.startedAt)) { setError(new Error('Minutes switched off must be less than the time between on and off.')); return }
    if (f.meterStart !== '' && f.meterEnd !== '' && Number(f.meterEnd) < Number(f.meterStart)) { setError(new Error('End meter must be at least the start meter.')); return }
    if (late.invalid) return
    setBusy(true)
    try { await siteGenerator.record(siteId, date, { ...f, lateReason: late.required ? late.reason : null }); await onSaved() }
    catch (error) { late.handleError(error); setError(error) }
    finally { setBusy(false) }
  }
  return <form onSubmit={save} style={{ display: 'grid', gap: 12, minWidth: 0 }}>
    {field('startedAt', 'Generator on', 'time')}{field('stoppedAt', 'Generator off', 'time')}{field('breakMinutes', 'Minutes switched off during the day')}
    <details><summary style={{ minHeight: 44 }}>Hour meter (if it has one)</summary>{field('meterStart', 'Start reading')}{field('meterEnd', 'End reading')}</details>
    {field('note', 'Note (optional)', 'text')}<LateReasonField entry={late} /><ErrorBox error={error} />
    <button style={ui.btn()} disabled={busy || late.invalid}>Save generator times</button>
  </form>
}
export default function GeneratorDay({ siteId, canWrite, onSaved }) {
  const [date, setDate] = useState(todayLagos), [revision, setRevision] = useState(0), [saved, setSaved] = useState(false)
  const result = useSiteRead(() => siteGenerator.day(siteId, date), [siteId, date, revision])
  return <section style={{ ...ui.panel, minWidth: 0, overflowWrap: 'anywhere' }}>
    <label>Generator date<input data-ico-allow data-board-allow style={ui.input} type="date" value={date} max={todayLagos()} onChange={e => { if (e.target.value && e.target.value <= todayLagos()) { setDate(e.target.value); setSaved(false) } }} /></label>
    <ErrorBox error={result.error} />
    {result.data && <><GeneratorSummary day={result.data} missingLabel={'Generator times not recorded for ' + new Date(date + 'T12:00:00Z').toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) + '.'} />
      {canWrite && <Editor key={`${siteId}:${date}:${revision}`} siteId={siteId} date={date} day={result.data} onSaved={async () => { setRevision(n => n + 1); setSaved(true); await onSaved?.(date) }} />}</>}
    {saved && <p role="status">Saved</p>}
  </section>
}
