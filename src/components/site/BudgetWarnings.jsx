import React, { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { hasRole } from '../../lib/roles'
import { productionExceptionsService as api } from '../../services/productionExceptions'
import { siteName } from '../../services/sites'
import { isAdverse, parameterName, varianceLabel, warningAge, warningSentence } from '../../utils/productionExceptions'
import { useAssignedSite, withAssignedSite } from '../AssignedSite'
import { FixedSite, useSites } from '../SitePicker'
import { ErrorBox, fmtDate, fmtDateTime, Pill, theme, ui, withPhase7Touch } from './siteUi'
import { useSiteRead } from './useSiteRead'

const tabs = [
  ['open', 'Needs explanation', ['open']],
  ['explained', 'Needs review', ['explained']],
  ['closed', 'Closed', ['closed', 'resolved']],
  ['all', 'All', null],
]
const actions = { explain: ['Explain', 10], comment: ['Comment', 2], ask: ['Ask a question', 2], close: ['Close', 0] }
const kinds = { explanation: 'Explanation', comment: 'Comment', question: 'Question', closed: 'Closed', system: 'System' }
const rowStyle = { display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }
const panel = { ...ui.panel, minWidth: 0, overflowWrap: 'anywhere' }
const input = { ...ui.input, width: '100%', minWidth: 0, minHeight: 44, boxSizing: 'border-box' }
const button = kind => ({ ...ui.btn(kind), minHeight: 44, whiteSpace: 'normal' })
const name = row => parameterName[row.parameter] || row.parameter

function WarningFacts({ warning, sites }) {
  const age = warningAge(warning)
  return <>
    <strong>{name(warning)} · {siteName(warning.site_id, sites)} · {fmtDate(warning.date)}</strong>
    <p>{warningSentence(warning)}</p>
    <div style={rowStyle}>
      <Pill color={isAdverse(warning) ? theme.red : theme.accent} label={varianceLabel(warning.variance_pct)} />
      <Pill status={warning.status} label={warning.status} />
      {['open', 'explained'].includes(warning.status) && <span>{warning.status} {age} {age === 1 ? 'day' : 'days'}</span>}
    </div>
  </>
}

function WarningDetail({ id, initialAction, assignedSiteId, userProfile, sites, onBack }) {
  const [action, setAction] = useState(initialAction)
  const [message, setMessage] = useState('')
  const [updated, setUpdated] = useState(null)
  const [revision, setRevision] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const record = useSiteRead(() => api.get(id), [id])
  const thread = useSiteRead(() => api.comments(id), [id, revision])
  const warning = updated || record.data
  const siteManager = warning && assignedSiteId === warning.site_id
  const md = hasRole(userProfile, 'md')
  const review = hasRole(userProfile, 'md', 'ico')
  const active = ['open', 'explained'].includes(warning?.status)
  const options = active ? [
    ...(md || siteManager ? ['explain'] : []),
    ...(review || siteManager ? ['comment'] : []),
    ...(review ? ['ask', 'close'] : []),
  ] : []
  const selected = options.includes(action) ? action : ''
  const save = async e => {
    e.preventDefault()
    if (!selected || busy || message.trim().length < actions[selected][1]) return
    setError(null); setBusy(true)
    try {
      setUpdated(await api.respond(id, selected, message.trim() || null))
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
    {!record.loading && !record.error && !warning && <p>Warning unavailable.</p>}
    {warning && <>
      <h3>Budget warning</h3><WarningFacts warning={warning} sites={sites} />
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
        <label style={{ display: 'block', marginTop: 12 }}>{selected === 'close' ? 'Closing note (optional)' : actions[selected][0]}
          <textarea style={{ ...input, display: 'block' }} rows={3} minLength={actions[selected][1]} value={message} onChange={e => setMessage(e.target.value)} />
        </label>
        {selected === 'ask' && <p style={ui.hint}>This sends the warning back for explanation.</p>}
        <button style={button('primary')} disabled={busy || message.trim().length < actions[selected][1]}>{selected === 'close' ? 'Close warning' : 'Send ' + (selected === 'ask' ? 'question' : selected === 'explain' ? 'explanation' : 'comment')}</button>
      </form>}
    </>}
  </section>
}

function BudgetWarnings({ assignedSiteId, userProfile, initial }) {
  const { sites, error } = useSites()
  const [filter, setFilter] = useState(initial?.status || 'open')
  const [choice, setChoice] = useState(initial?.siteId || '')
  const [id, setId] = useState(initial?.id || '')
  const siteId = assignedSiteId || choice
  const list = useSiteRead(() => id ? [] : api.list({ siteId, statuses: tabs.find(tab => tab[0] === filter)?.[2] }), [siteId, filter, id])
  return <div style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
    <h2><AlertTriangle size={20} aria-hidden="true" /> Budget Warnings</h2>
    <ErrorBox error={error} />
    {id ? <WarningDetail key={id} id={id} initialAction={id === initial?.id && initial.action} assignedSiteId={assignedSiteId}
      sites={sites} userProfile={userProfile} onBack={() => setId('')} /> :
      <>
        {assignedSiteId ? <FixedSite siteId={assignedSiteId} sites={sites} style={input} /> :
          <label>Site<select style={{ ...input, display: 'block' }} value={choice} onChange={e => setChoice(e.target.value)}>
            <option value="">All sites</option>{sites.map(site => <option key={site.id} value={site.id}>{site.name}</option>)}
          </select></label>}
        <div style={{ ...rowStyle, margin: '12px 0' }} aria-label="Warning status">
          {tabs.map(([value, label]) => <button key={value} aria-pressed={filter === value}
            style={button(filter === value ? 'primary' : 'secondary')} onClick={() => setFilter(value)}>{label}</button>)}
        </div>
        <ErrorBox error={list.error} />
        {list.loading && <p role="status">Loading budget warnings…</p>}
        {list.data?.length === 0 && <p>No warnings in this view.</p>}
        {list.data?.filter(warning => !siteId || warning.site_id === siteId).map(warning => <article style={panel} key={warning.id}>
          <WarningFacts warning={warning} sites={sites} />
          <button style={{ ...button(), marginTop: 8 }} onClick={() => setId(warning.id)}>View {name(warning)} warning</button>
        </article>)}
      </>}
  </div>
}

export function BudgetWarningDashboardCards({ userProfile, onOpen }) {
  const { siteId } = useAssignedSite()
  const review = hasRole(userProfile, 'md', 'ico')
  const own = useSiteRead(async () => {
    if (!siteId) return null
    const [count, rows] = await Promise.all([api.count('open', siteId), api.list({ siteId, statuses: ['open'], oldest: true, limit: 3 })])
    return { count, rows }
  }, [siteId])
  const oversight = useSiteRead(async () => {
    if (!review) return null
    const [explained, open] = await Promise.all([api.count('explained'), api.count('open')])
    return { explained, open }
  }, [review])
  return <>
    {siteId && <ErrorBox error={own.error} />}
    {siteId && own.data?.count > 0 && <section aria-label="Budget warnings to explain" style={panel}>
      <strong>Budget warnings to explain: {own.data.count}</strong>
      {own.data.rows.map(warning => <div key={warning.id} style={rowStyle}>
        <span>{name(warning)} · {fmtDate(warning.date)}</span>
        <button style={button()} onClick={() => onOpen({ id: warning.id, siteId, action: 'explain' })}>Explain</button>
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
  return <>
    <ErrorBox error={result.error} />
    {result.rows.map(warning => {
      const explain = hasRole(userProfile, 'md') || assignedSiteId === warning.site_id
      return <div style={panel} key={warning.id}>
        <strong>{name(warning)} {varianceLabel(warning.variance_pct).replace(/^[+−]/, '')} {warning.direction} budget for {fmtDate(warning.date)}</strong>
        {onOpen && <button style={{ ...button(), marginLeft: 8 }} onClick={() => onOpen({ id: warning.id, siteId: warning.site_id, action: explain ? 'explain' : '' })}>{explain ? 'Explain now' : 'View warning'}</button>}
      </div>
    })}
  </>
}

export default withPhase7Touch(withAssignedSite(BudgetWarnings))
