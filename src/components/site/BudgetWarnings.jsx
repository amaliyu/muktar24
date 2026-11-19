import React, { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { hasRole } from '../../lib/roles'
import { productionExceptionsService as api } from '../../services/productionExceptions'
import { siteName } from '../../services/sites'
import { groupWarningDays, isAdverse, parameterName, varianceLabel, warningSentence, warningWindowStart } from '../../utils/productionExceptions'
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

function WarningFacts({ day, sites }) {
  return <>
    <strong>{siteName(day.site_id, sites)} · {fmtDate(day.date)}</strong>
    <div style={rowStyle}>
      <Pill status={day.status} label={day.status} />
      {day.age !== null && <span>open {day.age} {day.age === 1 ? 'day' : 'days'}</span>}
    </div>
    {day.lines.map(line => {
      const fixed = line.status === 'resolved'
      return <div key={line.id} style={{ padding: '8px 0', color: fixed ? theme.textMuted : theme.text }}>
        <strong>{name(line)}</strong>
        <div>{warningSentence(line)}</div>
        <Pill color={fixed ? theme.textMuted : isAdverse(line) ? theme.red : theme.accent} label={varianceLabel(line.variance_pct)} />
        {fixed && <span> fixed by a correction</span>}
      </div>
    })}
  </>
}

function WarningDetail({ id, initialAction, assignedSiteId, userProfile, sites, onBack }) {
  const [action, setAction] = useState(initialAction)
  const [message, setMessage] = useState('')
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
  const save = async e => {
    e.preventDefault()
    if (!selected || busy || message.trim().length < actions[selected][1]) return
    setError(null); setBusy(true)
    try {
      await api.respond(day.actionLine.id, selected, message.trim() || null)
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
      <h3>Budget warning</h3><WarningFacts day={day} sites={sites} />
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
  const [choice, setChoice] = useState(initial?.siteId ?? null)
  const [id, setId] = useState(initial?.id || '')
  const allSites = hasRole(userProfile, 'md', 'ico')
  const siteId = assignedSiteId || (choice ?? (allSites ? '' : sites[0]?.id))
  const list = useSiteRead(async () => {
    if (id || (!allSites && !siteId)) return []
    return groupWarningDays(await api.list({ siteId, since: warningWindowStart() }))
  }, [siteId, allSites, id])
  const statuses = tabs.find(tab => tab[0] === filter)?.[2]
  const days = list.data?.filter(day => (!siteId || day.site_id === siteId) && (!statuses || statuses.includes(day.status)))
  return <div style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
    <h2><AlertTriangle size={20} aria-hidden="true" /> Budget Warnings</h2>
    <ErrorBox error={error} />
    {id ? <WarningDetail key={id} id={id} initialAction={id === initial?.id && initial.action} assignedSiteId={assignedSiteId}
      sites={sites} userProfile={userProfile} onBack={() => setId('')} /> :
      <>
        {assignedSiteId ? <FixedSite siteId={assignedSiteId} sites={sites} style={input} /> :
          <label>Site<select style={{ ...input, display: 'block' }} value={siteId || ''} onChange={e => setChoice(e.target.value)}>
            {allSites && <option value="">All sites</option>}{sites.map(site => <option key={site.id} value={site.id}>{site.name}</option>)}
          </select></label>}
        <div style={{ ...rowStyle, margin: '12px 0' }} aria-label="Warning status">
          {tabs.map(([value, label]) => <button key={value} aria-pressed={filter === value}
            style={button(filter === value ? 'primary' : 'secondary')} onClick={() => setFilter(value)}>{label}</button>)}
        </div>
        <ErrorBox error={list.error} />
        {list.loading && <p role="status">Loading budget warnings…</p>}
        {days?.length === 0 && <p>No warnings in this view.</p>}
        {days?.map(day => <article style={panel} key={day.key}>
          <WarningFacts day={day} sites={sites} />
          <button style={{ ...button(), marginTop: 8 }} onClick={() => setId((day.actionLine || day.lines[0]).id)}>View warning for {fmtDate(day.date)}</button>
        </article>)}
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
      <strong>Budget warnings to explain: {own.data.length}</strong>
      {own.data.slice(0, 3).map(day => <div key={day.key} style={{ marginTop: 8 }}>
        <WarningFacts day={day} sites={sites} />
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
      <strong>Budget warning for {fmtDate(day.date)}: {day.lines.map(line => name(line) + ' ' + varianceLabel(line.variance_pct)).join(' · ')}</strong>
      {onOpen && <button style={{ ...button(), marginLeft: 8 }} onClick={() => onOpen({ id: day.actionLine.id, siteId: day.site_id, action: explain ? 'explain' : '' })}>{explain ? 'Explain now' : 'View warning'}</button>}
    </div>}
  </>
}

export default withPhase7Touch(withAssignedSite(BudgetWarnings))
