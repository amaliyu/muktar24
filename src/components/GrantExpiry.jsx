import { useState } from 'react'
import { authService } from '../services/authService'
import { roleLabel } from '../lib/roles'
import { lagosToday } from '../utils/lateEntry'
import { shiftScorecardDate } from '../utils/siteScorecard'
import { ErrorBox, fmtDay, fmtDateTime, theme, ui } from './site/siteUi'
import { useSiteRead } from './site/useSiteRead'

const row = { display: 'flex', flexWrap: 'wrap', gap: 8 }
const panel = { ...ui.panel, marginBottom: 12, minWidth: 0, overflowWrap: 'anywhere' }
const endDate = timestamp => lagosToday(new Date(timestamp))

export function GrantExpiry({ expiresAt, showHint = false }) {
  if (!expiresAt) return <span>No end date</span>
  const days = Math.max(0, (Date.parse(endDate(expiresAt)) - Date.parse(lagosToday())) / 86400000)
  const color = days <= 3 ? theme.red : days <= 14 ? theme.accent : theme.textMuted
  return <div>
    <div>{fmtDay(expiresAt)}</div>
    <strong style={{ color }}>{days} {days === 1 ? 'day' : 'days'} left</strong>
    {showHint && days <= 14 && <div style={ui.hint}>Ask the MD if you still need it</div>}
  </div>
}

function GrantHistory({ grantId, revision }) {
  const result = useSiteRead(() => authService.listGrantEvents(grantId), [grantId, revision])
  return <div style={{ marginTop: 8 }}>
    <ErrorBox error={result.error} />
    {result.loading && <div role="status">Loading history…</div>}
    {result.data?.length === 0 && <p style={ui.hint}>No history yet.</p>}
    {result.data?.length > 0 && <ul style={{ paddingLeft: 18 }}>
      {result.data.map(event => <li key={event.id} style={{ marginBottom: 8 }}>
        <div>{event.action === 'extended'
          ? 'Extended from ' + (event.old_expires_at ? fmtDay(event.old_expires_at) : 'no end date') +
            ' to ' + fmtDay(event.new_expires_at) + ' by ' + (event.actor_name || 'Unknown')
          : ({ warned_14: 'Warned 14 days', warned_3: 'Warned 3 days', ended_notice: 'Ended notice' })[event.action]}
          {event.note && ' — ' + event.note}</div>
        <div style={ui.hint}>{fmtDateTime(event.created_at)}</div>
      </li>)}
    </ul>}
  </div>
}

export function GrantActions({ grant, onExtended, onRevoke, revoking }) {
  const [extension, setExtension] = useState(null)
  const [history, setHistory] = useState(false)
  const [revision, setRevision] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const currentEnd = grant.expires_at ? endDate(grant.expires_at) : lagosToday()
  const min = shiftScorecardDate(currentEnd, 1)
  const start = () => {
    setError(null)
    setExtension({ date: shiftScorecardDate(currentEnd, 90), note: '' })
  }
  const save = async event => {
    event.preventDefault()
    if (busy || !extension?.date || extension.date < min) return
    setBusy(true)
    setError(null)
    try {
      await authService.extendGrant(grant.id, extension.date, extension.note.trim())
      setExtension(null)
      setRevision(previous => previous + 1)
      await onExtended()
    } catch (error) { setError(error) }
    finally { setBusy(false) }
  }

  return <div style={{ minWidth: 0, overflowWrap: 'anywhere', textAlign: 'left' }}>
    <div style={row}>
      {grant.expires_at && !extension && <button type="button" style={ui.btn()} disabled={busy || revoking} onClick={start}>Extend</button>}
      <button type="button" style={ui.btn()} aria-expanded={history} onClick={() => setHistory(previous => !previous)}>History</button>
      <button type="button" style={ui.btn('danger')} disabled={busy || revoking} onClick={() => onRevoke(grant)}>{revoking ? 'Revoking…' : 'Revoke'}</button>
    </div>
    {extension && <form aria-label="Extend grant" style={{ marginTop: 10, minWidth: 0 }} onSubmit={save}>
      <ErrorBox error={error} />
      <label style={ui.label}>New end date
        <input type="date" style={ui.input} min={min} required value={extension.date} disabled={busy}
          onChange={event => setExtension(previous => ({ ...previous, date: event.target.value }))} />
      </label>
      <label style={ui.label}>Note (optional)
        <textarea style={ui.textarea} value={extension.note} disabled={busy}
          onChange={event => setExtension(previous => ({ ...previous, note: event.target.value }))} />
      </label>
      <div style={row}>
        <button type="submit" style={ui.btn('primary')} disabled={busy || revoking || !extension.date || extension.date < min}>{busy ? 'Saving…' : 'Save'}</button>
        <button type="button" style={ui.btn()} disabled={busy} onClick={() => setExtension(null)}>Cancel</button>
      </div>
    </form>}
    {history && <GrantHistory grantId={grant.id} revision={revision} />}
  </div>
}

export function MyAccess({ userId }) {
  const result = useSiteRead(() => userId ? authService.listMyGrants() : [], [userId])
  if (!userId || (!result.data?.length && !result.error)) return null
  return <section aria-label="My access" style={panel}>
    <h2 style={ui.section}>My access</h2>
    <ErrorBox error={result.error} />
    {(result.data || []).map(grant => <div key={grant.id} style={{ ...row, justifyContent: 'space-between', marginBottom: 10 }}>
      <strong>{roleLabel(grant.role)}</strong>
      <GrantExpiry expiresAt={grant.expires_at} showHint />
    </div>)}
  </section>
}
