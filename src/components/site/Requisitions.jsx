import React, { useState } from 'react'
import RequisitionBudget from './RequisitionBudget'
import { useSiteRead } from './useSiteRead'
import { Check, ClipboardList } from 'lucide-react'
import { hasRole } from '../../lib/roles'
import { requisitionsService as api } from '../../services/requisitions'
import { siteContractsService } from '../../services/siteContracts'
import { lagosToday } from '../../utils/lateEntry'
import { actionText, blockMix, MATERIALS, number, quantity, RECEIPT_STATUSES, reminderText, requisitionText, tomorrowLagos, whatsappUrl } from '../../utils/requisitionText'
import { useAssignedSite, withAssignedSite } from '../AssignedSite'
import { FixedSite, useSites } from '../SitePicker'
import { ConfirmDialog, ErrorBox, fmtDate, fmtDateTime, fmtTime, PhotoLink, Pill, StackTable, theme, ui, withPhase7Touch } from './siteUi'

const kinds = ['initial', 'balance', 'milestone']
const terminal = ['closed', 'cancelled']
const flowActions = { submit: 'Submit', approve: 'Approve', return: 'Return', cancel: 'Cancel', mark_sent: 'Mark sent', close: 'Close' }
const rowStyle = { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }
const panel = { ...ui.panel, overflowWrap: 'anywhere', minWidth: 0 }
const btn = (variant = 'secondary') => ({ ...ui.btn(variant), minHeight: 44, whiteSpace: 'normal' })
const field = { display: 'grid', gap: 5, minWidth: 0 }
const fields = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%, 180px),1fr))', gap: 12 }
const input = { ...ui.input, width: '100%', minWidth: 0, minHeight: 44, boxSizing: 'border-box' }
const statusLabel = status => status.replaceAll('_', ' ')
const siteMatches = (site, id) => site?.id === id
const whole = value => Number.isSafeInteger(Number(value)) && Number(value) >= 0 && Number(value) <= 2147483647

export function RequisitionProgress({ progress, canRaise, canSend, busy, onRaise, onOpen, onReminder }) {
  if (!progress) return null
  const { current, action, next_requisition: next } = progress
  const message = actionText(progress)
  return <section style={panel} aria-label="Requisition progress">
    <p>Since {fmtDate(progress.counting_from)}: {number(progress.produced_total)} blocks made (9": {number(progress.produced_9in)} · 6": {number(progress.produced_6in)}). Approved: {number(progress.approved_total)}.</p>
    {current && <>
      <div>{current.reference} — {number(current.pct)}% ({number(current.produced_against)} of {number(current.qty_total)})</div>
      <progress aria-label="Current requisition used" max={100} value={Math.max(0, Math.min(100, Number(current.pct)))} style={{ width: '100%' }} />
    </>}
    {progress.unapproved_production > 0 && <p role="alert" style={{ color: theme.red }}>{number(progress.unapproved_production)} blocks made beyond approved requisitions. Contract clause 3c: production only against an approved requisition.</p>}
    {message && <div style={rowStyle}>
      <strong>{message}</strong>
      {action === 'raise_next' && canRaise && <button style={btn('primary')} disabled={busy} onClick={onRaise}>Raise balance</button>}
      {['approve_next', 'send_next'].includes(action) && next && <button style={btn()} onClick={() => onOpen(next.id)}>Open requisition</button>}
      {action === 'remind_client' && progress.reminded_today && <span style={rowStyle}>Reminder sent today <Check size={16} aria-hidden="true" /> {fmtTime(progress.last_reminder_at)}</span>}
      {action === 'remind_client' && !progress.reminded_today && next && canSend && <button style={btn()} disabled={busy} onClick={() => onReminder(next.id)}>Send reminder</button>}
    </div>}
  </section>
}

export function RequisitionsDashboardBanner({ userProfile, onOpen }) {
  const assignment = useAssignedSite()
  const { sites, error: siteError } = useSites()
  const md = hasRole(userProfile, 'md')
  const eligible = md || Boolean(assignment.siteId)
  const lookup = useSiteRead(async () => {
    if (!eligible) return { rows: [], errors: [] }
    const clientSites = sites.filter(site => site.site_type === 'client_site' && (md || site.id === assignment.siteId))
    const results = await Promise.allSettled(clientSites.map(async site => ({ site, progress: await api.progress(site.id) })))
    return {
      rows: results.flatMap(result => result.status === 'fulfilled' ? [result.value] : []),
      errors: results.flatMap(result => result.status === 'rejected' ? [result.reason] : []),
    }
  }, [eligible, md, sites, assignment.siteId])
  const result = lookup.data?.rows.find(row => actionText(row.progress))
  if (!eligible) return null
  return <>
    <ErrorBox error={siteError || lookup.error} />
    {lookup.data?.errors.map((error, index) => <ErrorBox key={index} error={error} />)}
    {result && <section style={panel} aria-label="Material requisition action">
      <strong>{result.site.name}</strong>
      <div>{actionText(result.progress)}</div>
      <button style={btn()} onClick={() => onOpen(result.site.id)}>Material Requisitions</button>
    </section>}
  </>
}

function NewRequisition({ site, seed, busy, onCreate, onCancel }) {
  const [form, setForm] = useState(() => ({ nine: '', six: '', neededBy: tomorrowLagos(), kind: 'initial', notes: '', ...seed }))
  const set = key => e => setForm(previous => ({ ...previous, [key]: e.target.value }))
  const valid = whole(form.nine) && whole(form.six) && Number(form.nine) + Number(form.six) > 0 &&
    Number(form.nine) + Number(form.six) <= 2147483647 && form.neededBy >= tomorrowLagos()
  return <form style={panel} aria-label="New requisition" onSubmit={e => { e.preventDefault(); if (valid && !busy) onCreate(form) }}>
    <h3>New requisition</h3><p>{site.name}</p>
    <div style={fields}>
      <label style={field}>9" quantity<input style={input} type="number" min="0" step="1" value={form.nine} onChange={set('nine')} /></label>
      <label style={field}>6" quantity<input style={input} type="number" min="0" step="1" value={form.six} onChange={set('six')} /></label>
      <label style={field}>Needed by<input style={input} type="date" required min={tomorrowLagos()} value={form.neededBy} onChange={set('neededBy')} /></label>
      <label style={field}>Kind<select style={input} value={form.kind} onChange={set('kind')}>{kinds.map(kind => <option key={kind}>{kind}</option>)}</select></label>
    </div>
    <label style={field}>Notes<textarea style={input} value={form.notes} onChange={set('notes')} /></label>
    <div style={rowStyle}><button style={btn('primary')} disabled={!valid || busy}>Create requisition</button>
      <button style={btn()} type="button" onClick={onCancel}>Cancel</button></div>
  </form>
}

function MaterialLine({ line, editable, busy, combined, summary, showReceived, onSave }) {
  const isKg = line.unit === 'kg'
  const [value, setValue] = useState(() => String(isKg ? Number(line.qty_requested) / 1000 : line.qty_requested))
  const valid = value.trim() !== '' && Number.isFinite(Number(value)) && Number(value) >= 0 &&
    (isKg || Number.isInteger(Number(value)))
  const label = MATERIALS[line.material] || line.material
  return <tr>
    <td style={ui.td}>{label}{line.description && <small style={{ display: 'block' }}>{line.description}</small>}</td>
    <td style={ui.td}>
      <div>{quantity(line.qty_requested, line.unit)}</div>
      {editable && <div style={rowStyle}>
        <input aria-label={label + ' requested (' + (isKg ? 'tonnes' : line.unit) + ')'} style={{ ...input, maxWidth: 130 }}
          type="number" min="0" step={isKg ? 'any' : '1'} value={value} onChange={e => setValue(e.target.value)} />
        <button style={btn()} disabled={busy || !valid} onClick={() => onSave(line, isKg ? Math.round(Number(value) * 1000) : Number(value))}>Save {label}</button>
      </div>}
      {combined && <small>Dust and 3/8 together — move part of it to 3/8 if needed.</small>}
    </td>
    <td style={ui.td}>{quantity(line.qty_calculated, line.unit)}</td>
    <td style={{ ...ui.td, overflowWrap: 'anywhere' }}>{line.basis || '—'}</td>
    {showReceived && <td style={ui.td}>{quantity(summary?.qty_accepted ?? 0, line.unit)} accepted<br />{quantity(summary?.qty_rejected ?? 0, line.unit)} rejected</td>}
  </tr>
}

function ClientApproval({ busy, onSave }) {
  const [name, setName] = useState('')
  const [date, setDate] = useState(lagosToday)
  const [note, setNote] = useState('')
  const [file, setFile] = useState(null)
  const valid = Boolean(name.trim() && date && date <= lagosToday())
  return <form aria-label="Record client approval" onSubmit={e => { e.preventDefault(); if (valid && !busy) onSave({ name: name.trim(), date, note: note.trim(), file }) }}>
    <h4>Record client approval</h4>
    <div style={fields}>
      <label style={field}>Approved by<input required style={input} placeholder="e.g. Abdulkadir, Bali Grove PM" value={name} onChange={e => setName(e.target.value)} /></label>
      <label style={field}>Approval date<input required type="date" style={input} max={lagosToday()} value={date} onChange={e => setDate(e.target.value)} /></label>
      <label style={field}>Approval note<textarea style={input} value={note} onChange={e => setNote(e.target.value)} /></label>
      <label style={field}>Screenshot<input style={input} type="file" accept="image/*" onChange={e => setFile(e.target.files[0] || null)} /></label>
    </div>
    <button style={btn('primary')} disabled={busy || !valid}>Record client approval</button>
  </form>
}

function RequisitionDetail({ req, site, md, canSend, userId, revision, busy, onBack, onAdvance, onSaveLine, onApproveClient, onReminder }) {
  const [prompt, setPrompt] = useState(null)
  const [note, setNote] = useState('')
  const showReceived = [...RECEIPT_STATUSES, 'closed'].includes(req.status) || (req.status === 'cancelled' && Boolean(req.sent_at))
  const lines = useSiteRead(() => api.lines(req.id), [req.id, revision])
  const events = useSiteRead(() => api.events(req.id), [req.id, revision])
  const supplied = useSiteRead(() => showReceived ? api.supplied(req.id) : [], [req.id, revision, showReceived])
  const ownDraft = req.status === 'draft' && (md || req.raised_by === userId)
  const editable = ownDraft || (md && req.status === 'submitted')
  const request = action => {
    if (['return', 'cancel'].includes(action)) { setNote(''); setPrompt(action); return }
    onAdvance(req.id, action)
  }
  const action = name => <button key={name} style={btn()} disabled={busy} onClick={() => request(name)}>{flowActions[name]}</button>
  return <section style={panel} aria-label="Requisition detail">
    <button style={btn()} onClick={onBack}>Back to list</button>
    <h3>{req.reference}</h3>
    <p>{site.name} · {req.kind} · {blockMix(req)} = {number(req.qty_total)} blocks</p>
    <p>Needed by {fmtDate(req.needed_by)} · Raised by {req.raised_by_name || '—'} <Pill status={req.status} label={statusLabel(req.status)} /></p>
    {req.notes && <p>{req.notes}</p>}
    {req.cancelled_reason && <p>Cancellation reason: {req.cancelled_reason}</p>}
    {req.client_approved_on && <p>Approved by {req.client_approved_by} on {fmtDate(req.client_approved_on)}. {req.client_approval_note}</p>}
    {req.client_approval_photo_path && <PhotoLink path={req.client_approval_photo_path} />}
    <h4>{showReceived ? 'Materials received vs requested' : 'Requested materials'}</h4>
    <ErrorBox error={lines.error || supplied.error} />
    {(lines.loading || (showReceived && supplied.loading)) && <p role="status">Loading materials…</p>}
    {lines.data && <StackTable headers={['Material', 'Requested', 'Calculated', 'Basis', ...(showReceived ? ['Received'] : [])]}>
      {lines.data.map(line => <MaterialLine key={line.id + ':' + line.qty_requested} line={line} editable={editable} busy={busy}
        showReceived={showReceived} summary={supplied.data?.find(row => row.material === line.material)}
        combined={line.material === 'dust' && !lines.data.some(row => row.material === 'chippings' && Number(row.qty_requested) > 0)}
        onSave={(row, qty) => onSaveLine(req.id, row, qty)} />)}
    </StackTable>}
    <div style={{ ...rowStyle, marginTop: 12 }}>
      {ownDraft && action('submit')}
      {md && req.status === 'submitted' && [action('approve'), action('return')]}
      {(ownDraft || (md && !terminal.includes(req.status))) && action('cancel')}
      {canSend && req.status === 'apcl_approved' && <>
        {lines.data && <a style={{ ...btn(), display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }} href={whatsappUrl(requisitionText(req, site.name, lines.data))} target="_blank" rel="noopener noreferrer">Share on WhatsApp</a>}
        {action('mark_sent')}
      </>}
      {canSend && req.status === 'sent' && <button style={btn()} disabled={busy} onClick={() => onReminder(req.id)}>Send reminder</button>}
      {md && req.status === 'client_approved' && action('close')}
    </div>
    {canSend && req.status === 'sent' && <ClientApproval busy={busy} onSave={fields => onApproveClient(req.id, fields)} />}
    {['client_approved', 'closed'].includes(req.status) && <RequisitionBudget id={req.id} siteId={site.id} revision={revision} />}
    <h4>Timeline</h4>
    <ErrorBox error={events.error} />
    {events.loading && <p role="status">Loading timeline…</p>}
    {events.data?.map(event => <div key={event.id} style={{ padding: '8px 0', borderBottom: '1px solid ' + theme.border }}>
      <strong>{statusLabel(event.action)}</strong> · {event.actor_name || '—'} · {fmtDateTime(event.at)}{event.note && <div>{event.note}</div>}
    </div>)}
    {prompt && <ConfirmDialog title={flowActions[prompt] + ' requisition'} confirmLabel={flowActions[prompt]} busy={busy}
      confirmDisabled={!note.trim()} onCancel={() => setPrompt(null)}
      onConfirm={async () => { if (await onAdvance(req.id, prompt, { p_note: note.trim() })) setPrompt(null) }}>
      <label style={field}>{prompt === 'cancel' ? 'Reason' : 'Return note'}<textarea required style={input} value={note} onChange={e => setNote(e.target.value)} /></label>
    </ConfirmDialog>}
  </section>
}

function Requisitions({ userProfile, assignedSiteId, initialSiteId }) {
  const { sites, error: sitesError } = useSites()
  const [choice, setChoice] = useState(initialSiteId || '')
  const [filter, setFilter] = useState('open')
  const [detail, setDetail] = useState(null)
  const [seed, setSeed] = useState(null)
  const [revision, setRevision] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const clients = sites.filter(site => site.site_type === 'client_site')
  const site = assignedSiteId ? clients.find(site => siteMatches(site, assignedSiteId)) :
    clients.find(site => siteMatches(site, choice)) || clients.find(site => /life\s*camp/i.test(site.name)) || clients[0]
  const siteId = site?.id
  const md = hasRole(userProfile, 'md')
  const canSend = Boolean(md || (assignedSiteId && siteId === assignedSiteId))
  const canRaise = Boolean(site && (canSend || hasRole(userProfile, 'production_manager')))
  const list = useSiteRead(() => siteId ? api.list(siteId) : [], [siteId, revision])
  const progress = useSiteRead(() => siteId ? api.progress(siteId) : null, [siteId, revision])
  const rows = list.data || []
  const active = (detail?.site_id === siteId ? detail : null) || rows.find(row => row.id === detail && row.site_id === siteId)
  const run = async (task, refresh = true) => {
    if (busy) return false
    setError(null); setBusy(true)
    try {
      await task()
      if (refresh) setRevision(n => n + 1)
      return true
    } catch (e) { setError(e); return false }
    finally { setBusy(false) }
  }
  const open = id => { setSeed(null); setDetail(rows.find(row => row.id === id) || id); setError(null) }
  const start = draft => { setDetail(null); setSeed(draft); setError(null) }
  const advance = (id, action, values) => run(async () => {
    const saved = await api.advance(id, action, values)
    if (saved?.id === id) setDetail(previous => previous && saved)
  })
  const remind = id => {
    const req = rows.find(row => row.id === id && row.site_id === siteId) || (active?.id === id ? active : null)
    if (busy || !canSend || req?.status !== 'sent') return
    const message = reminderText(req, progress.data?.current)
    window.open(whatsappUrl(message), '_blank', 'noopener,noreferrer')
    return run(() => api.advance(id, 'log_reminder', { p_note: message }))
  }
  const raiseBalance = () => run(async () => {
    const draft = { kind: 'balance' }
    const current = rows.find(row => row.id === progress.data?.current?.id)
    try {
      const cycle = current?.cycle_id ? await api.cycle(current.cycle_id) : null
      if (cycle) {
        if (cycle.qty_9in != null) draft.nine = String(Math.max(0, cycle.qty_9in - (progress.data.approved_9in ?? 0)))
        if (cycle.qty_6in != null) draft.six = String(Math.max(0, cycle.qty_6in - (progress.data.approved_6in ?? 0)))
      }
      start(draft)
    } catch (e) { start(draft); throw e }
  }, false)

  return <div style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
    <h2><ClipboardList size={20} aria-hidden="true" /> Material Requisitions</h2>
    <ErrorBox error={error || sitesError || list.error || progress.error} />
    {assignedSiteId ? <FixedSite siteId={assignedSiteId} sites={sites} style={input} /> :
      <label style={field}>Client site<select style={input} value={siteId || ''} disabled={busy}
        onChange={e => { setChoice(e.target.value); setSeed(null); setDetail(null); setError(null) }}>
        {!clients.length && <option value="">No client sites</option>}{clients.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}
      </select></label>}
    <RequisitionProgress progress={progress.data} canRaise={canRaise} canSend={canSend} busy={busy}
      onRaise={raiseBalance} onOpen={open} onReminder={remind} />
    {site && seed && <NewRequisition site={site} seed={seed} busy={busy} onCancel={() => setSeed(null)}
      onCreate={fields => run(async () => { const created = await api.create(siteId, fields); setSeed(null); setDetail(created) })} />}
    {site && active && <RequisitionDetail key={active.id} req={active} site={site} md={md} canSend={canSend}
      userId={userProfile?.id} revision={revision} busy={busy} onBack={() => setDetail(null)} onAdvance={advance}
      onSaveLine={(id, line, qty) => run(() => api.saveLine(id, line, qty))}
      onReminder={remind} onApproveClient={(id, values) => run(async () => {
        const photo = values.file ? await siteContractsService.uploadPhoto({ siteCode: site.code, kind: 'requisitions', date: values.date, file: values.file }) : null
        const saved = await api.advance(id, 'record_client_approval', {
          p_client_approved_by: values.name, p_client_approved_on: values.date, p_note: values.note || null, p_photo_path: photo,
        })
        if (saved?.id === id) setDetail(previous => previous && saved)
      })} />}
    {site && !seed && !active && <section style={panel} aria-label="Requisitions list">
      <div style={rowStyle}>
        <label style={field}>Show<select style={input} value={filter} onChange={e => setFilter(e.target.value)}><option value="open">Open</option><option value="all">All</option></select></label>
        {canRaise && <button style={btn('primary')} disabled={busy} onClick={() => start({})}>New requisition</button>}
      </div>
      {list.loading && <p role="status">Loading requisitions…</p>}
      <StackTable headers={['Reference', 'Kind', 'Blocks', 'Needed by', 'Status']}>
        {rows.filter(row => filter === 'all' || !terminal.includes(row.status)).map(req => <tr key={req.id}>
          <td style={ui.td}><button style={btn()} onClick={() => open(req.id)}>{req.reference}</button></td>
          <td style={ui.td}>{req.kind}</td><td style={ui.td}>{blockMix(req)} = {number(req.qty_total)}</td>
          <td style={ui.td}>{fmtDate(req.needed_by)}</td><td style={ui.td}><Pill status={req.status} label={statusLabel(req.status)} /></td>
        </tr>)}
      </StackTable>
    </section>}
  </div>
}

export default withPhase7Touch(withAssignedSite(Requisitions))
