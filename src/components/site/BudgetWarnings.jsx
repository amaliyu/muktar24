import React, { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { hasRole } from '../../lib/roles'
import { productionExceptionsService as api } from '../../services/productionExceptions'
import { siteName } from '../../services/sites'
import { dayNaira, groupWarningDays, lineBadge, lineText, parameterName, statusText, warningWindowStart } from '../../utils/productionExceptions'
import { useAssignedSite, withAssignedSite } from '../AssignedSite'
import { FixedSite, useSites } from '../SitePicker'
import { ErrorBox, fmtDec, fmtNaira, fmtDateTime, Pill, theme, ui, withPhase7Touch } from './siteUi'
import { useSiteRead } from './useSiteRead'

const tabs = [
  ['open', 'To explain', ['open']],
  ['explained', 'To review', ['explained']],
  ['closed', 'Done', ['closed', 'resolved']],
  ['all', 'All', null],
]
const actions = { explain: ['Explain', 10], comment: ['Add a note', 2], ask: ['Ask a question', 2], close: ['Close', 0] }
const kinds = { explanation: 'Explanation', comment: 'Note', question: 'Question', closed: 'Closed', system: 'App' }
const rowStyle = { display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }
const panel = { ...ui.panel, minWidth: 0, overflowWrap: 'anywhere' }
const input = { ...ui.input, width: '100%', minWidth: 0, minHeight: 44, boxSizing: 'border-box' }
const button = kind => ({ ...ui.btn(kind), minHeight: 44, whiteSpace: 'normal' })
const dayCount = count => count + (count === 1 ? ' day' : ' days')
const name = row => parameterName[row.parameter] || row.parameter

const shortDate = date => new Date(date + 'T00:00:00Z').toLocaleDateString('en-GB', {
  timeZone: 'Africa/Lagos', weekday: 'short', day: '2-digit', month: 'short',
}).replace(',', '')
const warningText = line => line.message ? lineText(line) : lineText(line).split(' — ')[0]
const reasonOptions = {
  cement: ['Mixer problem', 'Machine adjustment', 'Torn or wet bags', 'Other'],
  quality: ['Ran short of cement', 'Blocks checked — they are strong', 'Other'],
  diesel: ['Machine adjustment', 'Generator ran for other work', 'Machine ran idle (breakdown)', 'Other'],
  breakage: ['Broke while stacking', 'Machine problem', 'Weak mix', 'Other'],
}

function WarningFacts({ day, sites, assignedSiteId }) {
  const cleared = day.lines.filter(line => line.status === 'resolved')
  const cost = dayNaira(day)
  return <>
    <strong>{siteName(day.site_id, sites)} · {shortDate(day.date)} · {fmtDec(day.lines[0].blocks)} blocks</strong>
    <div style={rowStyle}>
      <Pill status={day.status} label={statusText(day, assignedSiteId)} />
      {day.age !== null && <span>waiting {dayCount(day.age)}</span>}
    </div>
    {day.lines.filter(line => line.status !== 'resolved').map(line => {
      const badge = lineBadge(line)
      return <div key={line.id} style={{ ...rowStyle, padding: '8px 0' }}>
        {badge && <Pill color={theme[badge.tone]} label={badge.label} />}
        <span>{warningText(line)}</span>
      </div>
    })}
    {cleared.length > 0 && <div style={ui.hint}>Cleared: {cleared.map(name).join(', ')}</div>}
    {cost != null && <div><strong>Extra cost: {fmtNaira(cost)}</strong></div>}
  </>
}

function WarningDetail({ id, initialAction, assignedSiteId, userProfile, sites, onBack, onCorrect }) {
  const [action, setAction] = useState(initialAction)
  const [message, setMessage] = useState('')
  const [reasons, setReasons] = useState({})
  const [revision, setRevision] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const record = useSiteRead(async () => {
    const anchor = await api.get(id)
    if (!anchor || (assignedSiteId && assignedSiteId !== anchor.site_id)) return null
    const lines = await api.list({ siteId: anchor.site_id, date: anchor.date })
    return groupWarningDays(lines)[0] || null
  }, [id, assignedSiteId, revision])
  const day = record.data
  const ids = day?.lines.map(line => line.id).join(',')
  const thread = useSiteRead(() => ids ? api.comments(ids.split(',')) : [], [ids, revision])
  const siteManager = day && assignedSiteId === day.site_id
  const md = hasRole(userProfile, 'md')
  const review = hasRole(userProfile, 'md', 'ico')
  const active = ['open', 'explained'].includes(day?.status)
  const options = active ? [
    ...(md || siteManager ? ['explain'] : []),
    ...(review || siteManager ? ['comment'] : []),
    ...(review ? ['ask', 'close'] : []),
  ] : []
  const selected = options.includes(action) ? action : ''
  const lines = day?.lines.filter(line => ['open', 'explained'].includes(line.status)) || []
  const needsNote = lines.some(line => reasons[line.id]?.includes('Other'))
  const explanationReady = lines.length > 0 && lines.every(line => reasons[line.id]?.length) && (!needsNote || message.trim().length >= 10)
  const valid = selected === 'explain' ? explanationReady : selected && message.trim().length >= actions[selected][1]
  const toggleReason = (id, reason) => setReasons(previous => {
    const picked = previous[id] || []
    return { ...previous, [id]: picked.includes(reason) ? picked.filter(item => item !== reason) : [...picked, reason] }
  })
  const save = async e => {
    e.preventDefault()
    if (!valid || busy) return
    setError(null); setBusy(true)
    try {
      const body = selected === 'explain'
        ? [...lines.map(line => name(line) + ': ' + reasons[line.id].join('; ')), ...(message.trim() ? ['Note: ' + message.trim()] : [])].join('\n')
        : message.trim() || null
      await api.respond(day.actionLine.id, selected, body)
      setReasons({})
      setMessage(''); setAction(''); setRevision(n => n + 1)
    } catch (e) { setError(e) }
    finally { setBusy(false) }
  }
  return <section style={panel} aria-label="Budget warning detail">
    <button style={button()} onClick={onBack}>Back to warnings</button>
    <ErrorBox error={record.error} />
    <ErrorBox error={thread.error} />
    <ErrorBox error={error} />
    {record.loading && <p role="status">Loading warning…</p>}
    {!record.loading && !record.error && !day && <p>Warning unavailable.</p>}
    {day && <>
      <h3>Budget warning</h3><WarningFacts day={day} sites={sites} assignedSiteId={assignedSiteId} />
      <h4>Thread</h4>
      {thread.loading && <p role="status">Loading thread…</p>}
      {!thread.loading && !thread.error && thread.data?.length === 0 && <p>No responses yet.</p>}
      {thread.data?.map(entry => <div key={entry.id} style={{ borderBottom: '1px solid ' + theme.border, padding: '10px 0', color: entry.kind === 'system' ? theme.textMuted : theme.text }}>
        <strong>{kinds[entry.kind] || entry.kind}</strong> · {entry.author_name || '—'}{entry.author_role && ' · ' + entry.author_role.replaceAll('_', ' ')} · {fmtDateTime(entry.created_at)}
        <div style={{ whiteSpace: 'pre-wrap' }}>{entry.body}</div>
      </div>)}
      <div style={{ ...rowStyle, marginTop: 12 }}>
        {options.map(option => <button key={option} style={button(selected === option ? 'primary' : 'secondary')}
          aria-pressed={selected === option} disabled={busy} onClick={() => { setAction(option); setMessage(''); setError(null) }}>{actions[option][0]}</button>)}
      </div>
      {selected && <form onSubmit={save}>
        {selected === 'explain' && <>
          <h4>Why did this happen? Tap all that apply.</h4>
          {lines.map(line => <div key={line.id} style={{ marginBottom: 12 }}>
            <strong>{name(line)}</strong>
            <div style={rowStyle}>
              {(reasonOptions[line.kind === 'quality' && line.parameter === 'cement' ? 'quality' : line.parameter] || ['Other']).map(reason => {
                const pressed = reasons[line.id]?.includes(reason) || false
                return <button type="button" key={reason} style={button(pressed ? 'primary' : 'secondary')} aria-pressed={pressed} disabled={busy}
                  onClick={() => toggleReason(line.id, reason)}>{reason}</button>
              })}
            </div>
          </div>)}
          {onCorrect && <button type="button" style={{ ...button('secondary'), width: '100%' }} onClick={() => onCorrect({ siteId: day.site_id, date: day.date })}>I recorded it wrong</button>}
        </>}
        <label style={{ display: 'block', marginTop: 12 }}>{selected === 'explain' ? (needsNote ? 'Tell us what happened' : 'Anything else? (optional)') : selected === 'close' ? 'Closing note (optional)' : actions[selected][0]}
          <textarea style={{ ...input, display: 'block' }} rows={3} minLength={selected === 'explain' ? (needsNote ? 10 : 0) : actions[selected][1]} value={message} onChange={e => setMessage(e.target.value)} />
        </label>
        {selected === 'ask' && <p style={ui.hint}>This sends it back to the site manager.</p>}
        <button style={button('primary')} disabled={busy || !valid}>{selected === 'close' ? 'Close warning' : 'Send ' + (selected === 'ask' ? 'question' : selected === 'explain' ? 'explanation' : 'note')}</button>
      </form>}
    </>}
  </section>
}

function BudgetWarnings({ assignedSiteId, userProfile, initial, onCorrect }) {
  const { sites, error } = useSites()
  const [filter, setFilter] = useState(initial?.status || 'open')
  const [choice, setChoice] = useState(initial?.siteId ?? null)
  const [id, setId] = useState(initial?.id || '')
  const [entryAction, setEntryAction] = useState(initial?.action || '')
  const [bulk, setBulk] = useState(null)
  const [bulkBusy, setBulkBusy] = useState(false)
  const [bulkError, setBulkError] = useState(null)
  const [closedCount, setClosedCount] = useState(null)
  const [revision, setRevision] = useState(0)
  const allSites = hasRole(userProfile, 'md', 'ico')
  const siteId = assignedSiteId || (choice ?? (allSites ? '' : sites[0]?.id))
  const list = useSiteRead(async () => {
    if (id || (!allSites && !siteId)) return []
    return groupWarningDays(await api.list({ siteId, since: warningWindowStart() }))
  }, [siteId, allSites, id, revision])
  const statuses = tabs.find(tab => tab[0] === filter)?.[2]
  const days = list.data?.filter(day => (!siteId || day.site_id === siteId) && (!statuses || statuses.includes(day.status)))
  async function closeAll(event) {
    event.preventDefault()
    if (bulkBusy || !bulk || !allSites || filter !== 'explained') return
    setBulkBusy(true)
    setBulkError(null)
    try {
      await api.closeExplained(siteId, bulk.note.trim())
      setClosedCount(bulk.count)
      setBulk(null)
      setRevision(n => n + 1)
    } catch (error) { setBulkError(error) }
    finally { setBulkBusy(false) }
  }
  return <div style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
    <h2><AlertTriangle size={20} aria-hidden="true" /> Budget Warnings</h2>
    <ErrorBox error={error} />
    {id ? <WarningDetail key={id} id={id} initialAction={entryAction} assignedSiteId={assignedSiteId}
      sites={sites} userProfile={userProfile} onBack={() => setId('')} onCorrect={onCorrect} /> :
      <>
        {assignedSiteId ? <FixedSite siteId={assignedSiteId} sites={sites} style={input} /> :
          <label>Site<select style={{ ...input, display: 'block' }} value={siteId || ''} disabled={bulkBusy} onChange={e => { setChoice(e.target.value); setBulk(null); setBulkError(null); setClosedCount(null) }}>
            {allSites && <option value="">All sites</option>}{sites.map(site => <option key={site.id} value={site.id}>{site.name}</option>)}
          </select></label>}
        <div style={{ ...rowStyle, margin: '12px 0' }} aria-label="Warning status">
          {tabs.map(([value, label]) => <button key={value} aria-pressed={filter === value}
            style={button(filter === value ? 'primary' : 'secondary')} disabled={bulkBusy} onClick={() => { setFilter(value); setBulk(null); setBulkError(null); setClosedCount(null) }}>{label}</button>)}
        </div>
        <ErrorBox error={list.error} />
        {list.loading && <p role="status">Loading budget warnings…</p>}
        {allSites && filter === 'explained' && days?.length > 0 && !bulk && <button style={button('secondary')} onClick={() => { setBulk({ note: '', count: days.length }); setClosedCount(null) }}>Close all explained ({dayCount(days.length)})</button>}
        {bulk && <form onSubmit={closeAll} style={panel}>
          <strong>Close the explained warnings for {dayCount(bulk.count)} at {siteId ? siteName(siteId, sites) : 'all sites'}?</strong>
          <label style={{ display: 'block' }}>Note (optional)
            <textarea style={input} value={bulk.note} disabled={bulkBusy} onChange={e => setBulk({ ...bulk, note: e.target.value })} />
          </label>
          <ErrorBox error={bulkError} />
          <div style={rowStyle}>
            <button style={button('primary')} disabled={bulkBusy}>Yes, close them</button>
            <button type="button" style={button('secondary')} disabled={bulkBusy} onClick={() => { setBulk(null); setBulkError(null) }}>Cancel</button>
          </div>
        </form>}
        {closedCount != null && <p role="status">Closed warnings for {dayCount(closedCount)}.</p>}
        {days?.length === 0 && <p>No warnings in this view.</p>}
        {days?.map(day => {
          const explain = assignedSiteId === day.site_id && day.status === 'open'
          return <article style={panel} key={day.key}>
            <WarningFacts day={day} sites={sites} assignedSiteId={assignedSiteId} />
            <button style={{ ...button(explain ? 'primary' : 'secondary'), marginTop: 8 }} disabled={bulkBusy} onClick={() => {
              setBulk(null)
              setEntryAction(explain ? 'explain' : '')
              setId((day.actionLine || day.lines[0]).id)
            }}>{explain ? 'Explain' : 'Open'}</button>
          </article>
        })}
      </>}
  </div>
}

export function BudgetWarningDashboardCards({ userProfile, onOpen }) {
  const { siteId } = useAssignedSite()
  const review = hasRole(userProfile, 'md', 'ico')
  const { sites } = useSites()
  const own = useSiteRead(async () => {
    if (!siteId) return []
    return groupWarningDays(await api.list({ siteId })).filter(day => day.status === 'open')
      .sort((a, b) => a.date.localeCompare(b.date))
  }, [siteId])
  const oversight = useSiteRead(async () => {
    if (!review) return null
    const days = groupWarningDays(await api.list())
    return { explained: days.filter(day => day.status === 'explained').length, open: days.filter(day => day.status === 'open').length }
  }, [review])
  return <>
    {siteId && <ErrorBox error={own.error} />}
    {siteId && own.data?.length > 0 && <section aria-label="Budget warnings to explain" style={panel}>
      <strong>Please explain: {dayCount(own.data.length)}</strong>
      {own.data.slice(0, 3).map(day => <div key={day.key} style={{ marginTop: 8 }}>
        <WarningFacts day={day} sites={sites} assignedSiteId={siteId} />
        <button style={button()} onClick={() => onOpen({ id: day.actionLine.id, siteId, action: 'explain' })}>Explain</button>
      </div>)}
    </section>}
    {review && <ErrorBox error={oversight.error} />}
    {review && oversight.data && <section aria-label="Budget warnings summary" style={panel}>
      <strong>Budget warnings: {oversight.data.explained} to review · {oversight.data.open} waiting for site managers</strong>
      <div style={rowStyle}>
        <button style={button()} onClick={() => onOpen({ status: 'explained' })}>Needs review</button>
        <button style={button()} onClick={() => onOpen({ status: 'open' })}>Waiting for site managers</button>
      </div>
    </section>}
  </>
}

export function useSavedBudgetWarnings() {
  const [result, setResult] = useState({ rows: [], error: null })
  const refresh = async (siteId, date) => {
    setResult({ rows: [], error: null })
    try { setResult({ rows: await api.list({ siteId, date, statuses: ['open'] }), error: null }) }
    catch (error) { setResult({ rows: [], error }) }
  }
  return { ...result, refresh }
}

export function SavedBudgetWarnings({ result, onOpen, userProfile, assignedSiteId }) {
  const day = groupWarningDays(result.rows.filter(line => line.status === 'open'))[0]
  const explain = day && (hasRole(userProfile, 'md') || assignedSiteId === day.site_id)
  return <>
    <ErrorBox error={result.error} />
    {day && <div style={panel}>
      <strong>This entry needs an explanation:</strong>
      <ul>{day.lines.map(line => <li key={line.id}>{warningText(line)}</li>)}</ul>
      {onOpen && <button style={{ ...button(), marginLeft: 8 }} onClick={() => onOpen({ id: day.actionLine.id, siteId: day.site_id, action: explain ? 'explain' : '' })}>{explain ? 'Explain now' : 'View warning'}</button>}
    </div>}
  </>
}

export default withPhase7Touch(withAssignedSite(BudgetWarnings))
