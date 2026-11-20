import { useState } from 'react'
import { hasRole } from '../../lib/roles'
import { stockCounts } from '../../services/stockCounts'
import { lagosToday } from '../../utils/lateEntry'
import { shiftScorecardDate } from '../../utils/siteScorecard'
import { useAssignedSite, withAssignedSite } from '../AssignedSite'
import { FixedSite, useSites } from '../SitePicker'
import { LateReasonField, useLateReason } from '../LateReasonField'
import { ConfirmDialog, ErrorBox, fmtDate, fmtDateTime, fmtDec, fmtNaira, Pill, StackTable, theme, ui, withPhase7Touch } from './siteUi'
import { useSiteRead } from './useSiteRead'

const panel = { ...ui.panel, minWidth: 0, overflowWrap: 'anywhere' }
const row = { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }
const readControl = { 'data-board-allow': true, 'data-ico-allow': true }
const statusLabel = { submitted: 'Waiting for MD', approved: 'Approved', rejected: 'Rejected' }
const openingText = 'these differences are unrecorded past deliveries or usage, not losses.'
const unitLabel = unit => unit === 'kg' ? 'tonnes' : unit
const multiplier = unit => unit === 'kg' ? 1000 : 1

function quantity(value, unit, signed = false) {
  if (value == null) return '—'
  const amount = Number(value) / multiplier(unit)
  const prefix = signed && amount > 0 ? '+' : ''
  const formatted = unit === 'kg' ? amount.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : fmtDec(amount)
  return prefix + formatted + (unit ? ' ' + unitLabel(unit) : '')
}

function Status({ count }) {
  return <span style={row}>
    <Pill status={count.status} label={statusLabel[count.status]} color={count.status === 'submitted' ? theme.accent : undefined} />
    {count.is_opening && <Pill label="Opening" color={theme.blue} />}
  </span>
}

export function CountForm({ sheet, onSaved, onCancel }) {
  const [date, setDate] = useState(lagosToday)
  const [opening, setOpening] = useState(!sheet.has_approved_count)
  const [notes, setNotes] = useState('')
  const [entries, setEntries] = useState({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const late = useLateReason(date)
  const today = lagosToday()
  const items = sheet.items || []
  const valid = items.length > 0 && items.every(({ item_id, unit }) => {
    const value = entries[item_id]?.qty
    return value != null && value.trim() !== '' && Number.isFinite(Number(value) * multiplier(unit)) && Number(value) >= 0
  })
  const blocked = busy || !valid || !date || date > today || late.invalid
  const set = (id, field, value) => setEntries(previous => ({
    ...previous, [id]: { ...previous[id], [field]: value },
  }))
  const submit = async event => {
    event.preventDefault()
    if (blocked) return
    setBusy(true)
    setError(null)
    try {
      const lines = items.map(item => ({
        item_id: item.item_id,
        counted_qty: Number(entries[item.item_id].qty) * multiplier(item.unit),
        note: entries[item.item_id].note?.trim() || null,
      }))
      const id = await stockCounts.submit(sheet.site_id, date, lines, notes.trim(), opening, late.payload.late_reason)
      onSaved(id)
    } catch (error) {
      if (!late.handleError(error)) setError(error)
    } finally { setBusy(false) }
  }

  return <form style={panel} aria-label="Blind stock count" onSubmit={submit}>
    <h2 style={ui.section}>Count stock at {sheet.site_name}</h2>
    <p>Enter the quantity you physically counted for every item. Enter zero when none is left.</p>
    <ErrorBox error={error} />
    <label style={ui.label}>Count date
      <input style={ui.input} type="date" required max={today} value={date} disabled={busy}
        onChange={event => { setDate(event.target.value); late.reset(); setError(null) }} />
    </label>
    <label style={{ ...row, minHeight: 44 }}>
      <input type="checkbox" checked={opening} disabled={busy} onChange={event => setOpening(event.target.checked)} /> Opening count
    </label>
    <p style={ui.hint}>Use for the first count at a site — differences are unrecorded past deliveries or usage, not losses.</p>
    {items.map(item => <fieldset key={item.item_id} disabled={busy}
      style={{ border: '1px solid ' + theme.border, borderRadius: 8, margin: '12px 0', padding: 12, minInlineSize: 0 }}>
      <legend style={{ maxWidth: '100%', overflowWrap: 'anywhere' }}>{item.name}</legend>
      {item.owner === 'client' && <Pill label="Client-owned" color={theme.blue} />}
      <label style={ui.label}>Counted {item.name} ({unitLabel(item.unit)})
        <input style={ui.input} type="number" step="any" min="0" inputMode="decimal" required value={entries[item.item_id]?.qty ?? ''}
          onChange={event => set(item.item_id, 'qty', event.target.value)} />
      </label>
      <label style={ui.label}>Note for {item.name} (optional)
        <input style={ui.input} value={entries[item.item_id]?.note ?? ''} onChange={event => set(item.item_id, 'note', event.target.value)} />
      </label>
    </fieldset>)}
    <label style={ui.label}>Overall notes (optional)
      <textarea style={ui.textarea} value={notes} disabled={busy} onChange={event => setNotes(event.target.value)} />
    </label>
    <LateReasonField entry={late} />
    <div style={row}>
      <button type="submit" style={ui.btn('primary')} disabled={blocked}>{busy ? 'Sending…' : 'Submit count'}</button>
      <button type="button" style={ui.btn()} disabled={busy} onClick={onCancel}>Cancel</button>
    </div>
  </form>
}

export function CountDetail({ count, canReview, onReviewed }) {
  const [action, setAction] = useState(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const select = value => { setAction(value); setNote(''); setError(null) }
  const review = async () => {
    if (busy || !action || (action === 'reject' && !note.trim())) return
    setBusy(true)
    try {
      await stockCounts.review(count.id, action, note.trim())
      select(null)
      onReviewed()
    } catch (error) { setError(error) }
    finally { setBusy(false) }
  }
  return <section style={panel} aria-label="Stock count detail">
    <h2 style={ui.section}>Stock count · {fmtDate(count.count_date)}</h2>
    <Status count={count} />
    <p>Counted by {count.counted_by_name || '—'}</p>
    {count.notes && <p style={{ whiteSpace: 'pre-wrap' }}>{count.notes}</p>}
    {(count.reviewed_by_name || count.reviewed_at) && <p>Reviewed by {count.reviewed_by_name || '—'}
      {count.reviewed_at && ' · ' + fmtDateTime(count.reviewed_at)}</p>}
    {count.review_note && <p style={{ whiteSpace: 'pre-wrap' }}>{count.review_note}</p>}
    {count.is_opening && <p style={{ ...panel, color: theme.blue }}>Opening count — {openingText}</p>}
    <StackTable headers={['Item', 'Counted', 'App figure', 'Difference', '%', 'Value', 'Note']}>
      {(count.lines || []).map(line => {
        const unit = line.item?.unit
        const color = line.variance_qty > 0 ? theme.green : line.variance_qty < 0 ? theme.red : theme.textMuted
        return <tr key={line.id || line.item_id}>
          <td style={ui.td}>{line.item?.name || 'Item'}</td>
          <td style={ui.td}>{quantity(line.counted_qty, unit)}</td>
          <td style={ui.td}>{quantity(line.system_qty, unit)}</td>
          <td style={{ ...ui.td, color }}>
            {quantity(line.variance_qty, unit, true)}
            {line.over_tolerance && <div><Pill label="Outside tolerance" color={theme.red} /></div>}
          </td>
          <td style={ui.td}>{line.variance_pct == null ? '—' : fmtDec(line.variance_pct) + '%'}</td>
          <td style={ui.td}>{line.item?.owner === 'client' ? '—' : fmtNaira(line.variance_value)}</td>
          <td style={ui.td}>{line.note || '—'}</td>
        </tr>
      })}
    </StackTable>
    {canReview && count.status === 'submitted' && <div style={{ ...row, marginTop: 12 }}>
      <button type="button" style={ui.btn('primary')} onClick={() => select('approve')}>Approve</button>
      <button type="button" style={ui.btn('danger')} onClick={() => select('reject')}>Reject</button>
    </div>}
    {action && <ConfirmDialog title={action === 'approve' ? 'Approve stock count?' : 'Reject stock count?'}
      body={action === 'approve' ? 'Approval updates stock to the count and locks stock movements on and before the counted day.' : undefined}
      confirmLabel={action === 'approve' ? 'Approve count' : 'Reject count'} danger={action === 'reject'}
      busy={busy} confirmDisabled={action === 'reject' && !note.trim()} onConfirm={review} onCancel={() => select(null)}>
      <label style={ui.label}>{action === 'reject' ? 'Reason (required)' : 'Note (optional)'}
        <textarea style={ui.textarea} value={note} disabled={busy} onChange={event => setNote(event.target.value)} />
      </label>
      <ErrorBox error={error} />
    </ConfirmDialog>}
  </section>
}

function totalValue(lines) {
  const valued = (lines || []).filter(line => line.item?.owner !== 'client' && line.variance_value != null)
  return valued.length ? fmtNaira(valued.reduce((total, line) => total + Number(line.variance_value), 0)) : '—'
}

export function StockCountPage({ userProfile, assignedSiteId, initial }) {
  const canReview = hasRole(userProfile, 'md')
  const canCount = hasRole(userProfile, 'md', 'ico')
  const { sites, error: siteError } = useSites()
  const [selected, setSelected] = useState('')
  const [countId, setCountId] = useState(initial?.id || null)
  const [counting, setCounting] = useState(false)
  const [revision, setRevision] = useState(0)
  const [sent, setSent] = useState(false)
  const eligible = useSiteRead(() => canCount ? stockCounts.sitesWithItems() : null, [canCount])
  const eligibleIds = new Set((eligible.data || []).map(site => site.id))
  const detail = useSiteRead(async () => countId ? { id: countId, count: await stockCounts.get(countId) } : null, [countId, revision])
  const displayed = detail.data?.id === countId ? detail.data.count : null
  const siteId = assignedSiteId || selected || displayed?.site_id ||
    (canCount ? eligible.data?.[0]?.id : sites[0]?.id) || ''
  const list = useSiteRead(async () => siteId && !counting
    ? { siteId, rows: await stockCounts.list(siteId) } : null, [siteId, revision, counting])
  const sheetRead = useSiteRead(() => counting && siteId && canCount ? stockCounts.sheet(siteId) : null, [counting, siteId, canCount])
  const sheet = sheetRead.data?.site_id === siteId ? sheetRead.data : null
  const choices = canCount ? sites.filter(site => eligibleIds.has(site.id) || site.id === siteId) : sites
  const refresh = () => setRevision(previous => previous + 1)

  return <div style={{ minWidth: 0 }}>
    <h1 style={ui.title}>Stock Count</h1>
    <ErrorBox error={siteError || eligible.error} />
    <div style={panel}>
      <label style={ui.label} htmlFor="stock-count-site">Site</label>
      {assignedSiteId ? <FixedSite id="stock-count-site" siteId={assignedSiteId} sites={sites} style={ui.input} />
        : <select {...readControl} id="stock-count-site" style={ui.input} value={siteId} disabled={counting} onChange={event => {
          setSelected(event.target.value); setCountId(null); setSent(false); setCounting(false)
        }}>
          {!siteId && <option value="">Choose site</option>}
          {choices.map(site => <option key={site.id} value={site.id}>{site.name}</option>)}
        </select>}
      {!counting && canCount && eligibleIds.has(siteId) && <button type="button" style={{ ...ui.btn('primary'), marginTop: 10 }}
        onClick={() => { setCounting(true); setSent(false); setCountId(null) }}>Start count</button>}
      {!counting && canCount && siteId && eligible.data && !eligibleIds.has(siteId) && <p style={ui.hint}>There are no items to count at this site.</p>}
    </div>
    {counting ? <>
      <ErrorBox error={sheetRead.error} />
      {sheetRead.loading && <p role="status">Loading count sheet…</p>}
      {sheet?.items?.length ? <CountForm key={siteId} sheet={sheet} onSaved={id => {
        setSelected(siteId); setCountId(id); setCounting(false); setSent(true); refresh()
      }} onCancel={() => setCounting(false)} /> :
        <button type="button" style={ui.btn()} onClick={() => setCounting(false)}>Cancel</button>}
    </> : <>
      {sent && <p role="status" style={{ ...panel, color: theme.green }}>Sent to the MD for approval</p>}
      <ErrorBox error={detail.error} />
      {countId && !displayed && !detail.error && (detail.loading || detail.data?.id !== countId
        ? <p role="status">Loading count…</p> : <p>This stock count is unavailable.</p>)}
      {displayed && <CountDetail key={displayed.id} count={displayed} canReview={canReview} onReviewed={refresh} />}
      <section style={panel} aria-label="Recent counts">
        <h2 style={ui.section}>Recent counts</h2>
        <ErrorBox error={list.error} />
        {list.loading && siteId && <p role="status">Loading counts…</p>}
        {list.data?.siteId === siteId && (list.data.rows?.length ? list.data.rows.map(count => <button key={count.id} {...readControl} type="button"
          style={{ ...ui.btn(), display: 'block', textAlign: 'left', width: '100%', padding: '10px 12px', marginBottom: 8, overflowWrap: 'anywhere' }}
          onClick={() => { setCountId(count.id); setSent(false) }}>
          <strong>{fmtDate(count.count_date)}</strong>
          <Status count={count} />
          <div>{count.counted_by_name || '—'} · Total difference {totalValue(count.lines)}</div>
        </button>) : <p>No counts recorded for this site.</p>)}
      </section>
    </>}
  </div>
}

export function StockCountDashboard({ userProfile, onOpen, today = lagosToday() }) {
  const { siteId: assignedSiteId, loading: assignmentLoading, error: assignmentError } = useAssignedSite()
  const md = hasRole(userProfile, 'md')
  const ico = hasRole(userProfile, 'ico')
  const weekday = new Date(today + 'T00:00:00Z').getUTCDay()
  const dueDay = ico && (weekday === 5 || weekday === 6)
  const result = useSiteRead(async () => {
    if (assignmentLoading || assignmentError) return null
    const pending = md ? stockCounts.waitingCount().catch(() => 0) : 0
    const due = dueDay ? Promise.all([
      stockCounts.activeSites(), stockCounts.thisWeek(shiftScorecardDate(today, 1 - weekday), today),
    ]).then(([sites, counts]) => {
      const counted = new Set(counts.map(count => count.site_id))
      return sites.filter(site => (!assignedSiteId || assignedSiteId === site.id) && !counted.has(site.id)).map(site => site.name)
    }).catch(() => []) : []
    return { pending: await pending, due: await due }
  }, [md, dueDay, today, assignedSiteId, assignmentLoading, assignmentError])
  const pending = md ? result.data?.pending : 0
  const due = dueDay ? result.data?.due : null
  if (assignmentLoading || assignmentError || (!pending && !due?.length)) return null
  return <section style={{ ...panel, ...row }} aria-label="Stock count reminders">
    {pending > 0 && <button {...readControl} type="button" style={ui.btn('primary')} onClick={() => onOpen()}>
      {pending} stock {pending === 1 ? 'count' : 'counts'} waiting for approval
    </button>}
    {due?.length > 0 && <button {...readControl} type="button" style={{ ...ui.btn(), color: theme.accent, overflowWrap: 'anywhere' }} onClick={() => onOpen()}>
      Stock count due: {due.join(', ')}
    </button>}
  </section>
}

export default withPhase7Touch(withAssignedSite(StockCountPage))
