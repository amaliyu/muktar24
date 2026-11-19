import { useCallback, useEffect, useRef, useState } from 'react'
import { ClipboardList, Plus, Trash2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { hasRole } from '../../lib/roles'
import { staffTasksService as api } from '../../services/staffTasks'
import { lagosToday } from '../../utils/lateEntry'
import { ConfirmDialog, ErrorBox, fmtDate, fmtDateTime, fmtNaira, Pill, theme, ui } from '../site/siteUi'
import { useSiteRead } from '../site/useSiteRead'

const panel = { ...ui.panel, minWidth: 0, overflowWrap: 'anywhere' }
const row = { display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8 }
const permissions = { 'data-ico-allow': true, 'data-board-allow': true }
const empty = []
const initialRead = { rows: empty, error: null, loaded: false }
const labels = { open: 'Open', submitted: 'Waiting for MD', done: 'Done', cancelled: 'Cancelled' }
const events = { created: 'Created', ticked: 'Checked', unticked: 'Unchecked', submitted: 'Sent to MD',
  returned: 'Returned', cancelled: 'Cancelled', confirmed: 'Confirmed', comment: 'Comment', auto_done: 'Finished automatically' }

export function useTaskReminders(userId) {
  const [state, setState] = useState(initialRead)
  const generation = useRef(0)
  const refresh = useCallback(async () => {
    if (!userId) return
    const current = ++generation.current
    try {
      const rows = await api.list()
      if (current === generation.current) setState({ userId, rows, error: null, loaded: true })
    } catch (error) {
      if (current === generation.current) setState({ userId, rows: empty, error, loaded: true })
    }
  }, [userId])

  useEffect(() => {
    if (!userId) return
    refresh()
    const timer = setInterval(refresh, 5 * 60 * 1000)
    const onVisible = () => { if (document.visibilityState === 'visible') refresh() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      ++generation.current
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [userId, refresh])

  return { ...(state.userId === userId ? state : initialRead), refresh }
}

export function TaskReminder({ tasks, userId, onView }) {
  const open = tasks.filter(task => task.assigned_to === userId && task.status === 'open')
  if (!open.length) return null
  const color = open.some(task => task.overdue) ? theme.red : theme.accent
  return <aside aria-label="Open task reminder" style={{ ...panel, ...row, borderColor: color, color, justifyContent: 'space-between' }}>
    <span>You have {open.length} open {open.length === 1 ? 'task' : 'tasks'} from the MD — {open[0].progress_text}</span>
    <button {...permissions} type="button" style={ui.btn()} onClick={onView}>View</button>
  </aside>
}

function TaskCard({ task, userProfile, review, refresh, onPaymentRequest, focus }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [comment, setComment] = useState('')
  const [note, setNote] = useState('')
  const [action, setAction] = useState(null)
  const ref = useRef(null)
  useEffect(() => { if (focus) ref.current?.scrollIntoView?.({ block: 'nearest' }) }, [focus])

  const md = hasRole(userProfile, 'md')
  const assignee = task.assigned_to === userProfile.id
  const active = task.status === 'open' || task.status === 'submitted'
  const checklist = task.checklist || empty
  const manual = task.kind === 'manual'
  const needsNote = action === 'return' || action === 'cancel'
  const total = task.progress?.total ?? 0
  const done = total - (task.progress?.remaining ?? total)
  const save = async (operation, reset) => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await operation()
      reset?.()
      await refresh()
    } catch (error) { setError(error) }
    finally { setBusy(false) }
  }

  const begin = next => { setNote(''); setError(null); setAction(next) }
  return <article ref={ref} style={panel}>
    <header style={row}>
      <h3 style={{ ...ui.section, margin: 0 }}>{task.title}</h3>
      <Pill label={task.overdue && active ? 'Overdue' : labels[task.status]} color={task.overdue && active ? theme.red : task.status === 'done' ? theme.green : theme.blue} />
    </header>
    {task.due_on && <div style={ui.hint}>Due {fmtDate(task.due_on)}</div>}
    {task.progress_text && <p>{task.progress_text}</p>}
    <progress aria-label="Task progress" value={done} max={total || 1} style={{ width: '100%', accentColor: theme.green }} />
    <div style={ui.hint}>{done} of {total}</div>
    {task.details && <p style={{ whiteSpace: 'pre-wrap' }}>{task.details}</p>}
    {manual ? <>
      {checklist.map(item => <div key={item.key}>
        <label style={{ ...row, minHeight: 44 }}>
          <input type="checkbox" checked={item.done} disabled={busy || !active || !(assignee || md)}
            style={{ width: 22, height: 22, accentColor: theme.green }}
            onChange={event => save(() => api.tick(task.id, item.key, event.target.checked))} />
          <span>{item.label}</span>
        </label>
        {item.done && (item.done_by || item.done_at) && <div style={ui.hint}>
          {[item.done_by, item.done_at && fmtDateTime(item.done_at)].filter(Boolean).join(' · ')}
        </div>}
      </div>)}
      {assignee && task.status === 'open' && checklist.every(item => item.done) &&
        <button {...permissions} type="button" style={ui.btn()} disabled={busy} onClick={() => begin('submit')}>Send to MD</button>}
    </> : <>
      <p>This task finishes by itself when every request is closed.</p>
      {(task.open_requests || empty).map(request => <button {...permissions} key={request.id} type="button"
        style={{ ...ui.btn(), width: '100%', textAlign: 'left', marginBottom: 8, padding: '8px 12px', overflowWrap: 'anywhere' }}
        onClick={() => onPaymentRequest(request.id)}>
        <strong>{request.reference}</strong> · {fmtNaira(request.amount)} · {request.category}
        {(request.payee || request.purpose) && <div>{[request.payee, request.purpose].filter(Boolean).join(' · ')}</div>}
        {request.has_receipt && <div><Pill label="Receipt attached" color={theme.green} /></div>}
      </button>)}
    </>}
    <ErrorBox error={action ? null : error} />
    {review && md && active && <div style={{ ...row, marginTop: 8 }}>
      {task.status === 'submitted' && <>
        <button type="button" style={ui.btn('primary')} disabled={busy} onClick={() => save(() => api.review(task.id, 'confirm'))}>Confirm</button>
        <button type="button" style={ui.btn()} disabled={busy} onClick={() => begin('return')}>Return</button>
      </>}
      <button type="button" style={ui.btn('danger')} disabled={busy} onClick={() => begin('cancel')}>Cancel</button>
    </div>}
    {(assignee || md) && <form style={{ marginTop: 12 }} onSubmit={event => {
      event.preventDefault()
      if (comment.trim()) save(() => api.comment(task.id, comment.trim()), () => setComment(''))
    }}>
      <label style={ui.label}>Comment
        <textarea style={ui.textarea} value={comment} disabled={busy} onChange={event => setComment(event.target.value)} />
      </label>
      <button {...permissions} type="submit" style={ui.btn()} disabled={busy || !comment.trim()}>Post comment</button>
    </form>}
    <details style={{ marginTop: 8 }}>
      <summary style={{ minHeight: 44, cursor: 'pointer', alignContent: 'center' }}>History</summary>
      {task.events?.length ? <ul style={{ paddingLeft: 20 }}>{task.events.map((event, index) => <li key={index} style={{ marginBottom: 8 }}>
        <div>{events[event.action] || event.action} · {event.actor_name} · {fmtDateTime(event.created_at)}</div>
        {event.note && <div style={{ whiteSpace: 'pre-wrap' }}>{event.note}</div>}
      </li>)}</ul> : <div style={ui.hint}>No history yet.</div>}
    </details>
    {action && <ConfirmDialog
      title={action === 'submit' ? 'Send to MD' : action === 'return' ? 'Return task' : 'Cancel task'}
      confirmLabel={action === 'submit' ? 'Send to MD' : action === 'return' ? 'Return task' : 'Cancel task'}
      cancelLabel="Go back" danger={action === 'cancel'} busy={busy} confirmDisabled={needsNote && !note.trim()}
      onCancel={() => { setAction(null); setError(null) }}
      onConfirm={() => {
        if (needsNote && !note.trim()) return
        save(() => action === 'submit' ? api.submit(task.id, note.trim()) : api.review(task.id, action, note.trim()), () => setAction(null))
      }}>
      <label style={ui.label}>{action === 'cancel' ? 'Reason' : needsNote ? 'Note' : 'Note (optional)'}
        <textarea style={ui.textarea} value={note} onChange={event => setNote(event.target.value)} disabled={busy} />
      </label>
      <ErrorBox error={error} />
    </ConfirmDialog>}
  </article>
}

function useTaskList(source, targetId, historyOnly = false) {
  const [includeFinished, setIncludeFinished] = useState(Boolean(targetId))
  const [version, setVersion] = useState(0)
  const finished = useSiteRead(() => includeFinished || historyOnly ? api.list(true) : empty, [includeFinished, historyOnly, version])
  const refresh = async () => {
    if (includeFinished) setVersion(value => value + 1)
    await source.refresh()
  }
  return {
    rows: includeFinished ? finished.data || source.rows : source.rows,
    error: includeFinished || historyOnly ? finished.error : source.error,
    hasHistory: finished.data,
    includeFinished, setIncludeFinished, refresh,
  }
}

function FinishedToggle({ list }) {
  return <label style={{ ...row, minHeight: 44 }}>
    <input type="checkbox" checked={list.includeFinished} onChange={event => list.setIncludeFinished(event.target.checked)} />
    Show finished tasks
  </label>
}

export default function MyTasks({ userProfile, source, targetId, onPaymentRequest }) {
  const historyOnly = source.loaded && !source.error && !source.rows.some(task => task.assigned_to === userProfile.id)
  const list = useTaskList(source, targetId, historyOnly)
  const mine = list.rows.filter(task => task.assigned_to === userProfile.id)
  const hasHistory = list.hasHistory?.some(task => task.assigned_to === userProfile.id)
  if (!mine.length && !hasHistory && !list.includeFinished && !list.error) return null
  return <section data-task-controls aria-label="My Tasks">
    <h2 style={ui.title}>My Tasks</h2>
    <FinishedToggle list={list} />
    <ErrorBox error={list.error} />
    {mine.map(task => <TaskCard key={task.id} task={task} focus={task.id === targetId}
      userProfile={userProfile} onPaymentRequest={onPaymentRequest} refresh={list.refresh} />)}
  </section>
}

function NewTask({ onSaved }) {
  const people = useSiteRead(async () => {
    const { data, error } = await supabase.from('user_profiles').select('id, full_name')
      .eq('is_active', true).order('full_name')
    if (error) throw error
    return data || empty
  }, [])
  const [form, setForm] = useState({ assignedTo: '', title: '', details: '', dueOn: '', checklist: [] })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const nextKey = useRef(0)
  const change = (field, value) => setForm(old => ({ ...old, [field]: value }))
  const past = Boolean(form.dueOn && form.dueOn < lagosToday())
  return <form aria-label="New task" style={panel} onSubmit={async event => {
    event.preventDefault()
    if (busy || past || !form.assignedTo || !form.title.trim() || !form.dueOn) return
    setBusy(true); setError(null)
    try {
      await api.create({ ...form, title: form.title.trim(), details: form.details.trim(),
        checklist: form.checklist.map(item => item.label.trim()).filter(Boolean) })
      await onSaved()
    } catch (error) { setError(error) }
    finally { setBusy(false) }
  }}>
    <ErrorBox error={error || people.error} />
    <label style={ui.label}>Person
      <select style={ui.input} value={form.assignedTo} required onChange={event => change('assignedTo', event.target.value)}>
        <option value="">{people.loading ? 'Loading people…' : 'Choose a person'}</option>
        {people.data?.map(person => <option key={person.id} value={person.id}>{person.full_name}</option>)}
      </select>
    </label>
    <label style={ui.label}>Title<input style={ui.input} value={form.title} required onChange={event => change('title', event.target.value)} /></label>
    <label style={ui.label}>Details<textarea style={ui.textarea} value={form.details} onChange={event => change('details', event.target.value)} /></label>
    <label style={ui.label}>Due date<input style={ui.input} type="date" min={lagosToday()} required value={form.dueOn}
      onChange={event => change('dueOn', event.target.value)} /></label>
    {past && <p style={ui.fieldError}>The due date cannot be in the past.</p>}
    {form.checklist.map((item, index) => <div key={item.key} style={{ ...row, marginBottom: 8 }}>
      <input aria-label={'Checklist item ' + (index + 1)} style={{ ...ui.input, width: 'auto', minWidth: 0, flex: '1 1 160px' }} value={item.label}
        onChange={event => change('checklist', form.checklist.map(other => other.key === item.key ? { ...other, label: event.target.value } : other))} />
      <button aria-label={'Remove checklist item ' + (index + 1)} type="button" style={ui.btn()}
        onClick={() => change('checklist', form.checklist.filter(other => other.key !== item.key))}><Trash2 size={16} /></button>
    </div>)}
    <div style={row}>
      <button type="button" style={ui.btn()} onClick={() => change('checklist', [...form.checklist, { key: nextKey.current++, label: '' }])}>Add checklist item</button>
      <button type="submit" style={ui.btn('primary')} disabled={busy || past}>Create task</button>
    </div>
  </form>
}

export function StaffTasks({ userProfile, ...props }) {
  if (!hasRole(userProfile, 'md')) return null
  return <StaffTaskList userProfile={userProfile} {...props} />
}

function StaffTaskList({ userProfile, source, targetId, onPaymentRequest }) {
  const list = useTaskList(source, targetId)
  const [creating, setCreating] = useState(false)
  const groups = new Map()
  for (const task of list.rows) {
    if (!groups.has(task.assigned_to)) groups.set(task.assigned_to, [])
    groups.get(task.assigned_to).push(task)
  }
  return <section aria-label="Staff Tasks">
    <header style={{ ...ui.header, alignItems: 'center' }}>
      <h2 style={{ ...ui.title, margin: 0 }}><ClipboardList size={20} /> Staff Tasks</h2>
      <button type="button" style={ui.btn()} onClick={() => setCreating(value => !value)}>
        {creating ? 'Close form' : <><Plus size={16} /> New task</>}
      </button>
    </header>
    {creating && <NewTask onSaved={async () => { setCreating(false); await list.refresh() }} />}
    <FinishedToggle list={list} />
    <ErrorBox error={list.error} />
    {!groups.size && !list.error && <p>No tasks to show.</p>}
    {[...groups].map(([id, tasks]) => <section key={id}>
      <h3 style={ui.section}>{tasks[0].assigned_to_name || 'Staff member'}</h3>
      {tasks.map(task => <TaskCard key={task.id} task={task} focus={task.id === targetId} review
        userProfile={userProfile} onPaymentRequest={onPaymentRequest} refresh={list.refresh} />)}
    </section>)}
  </section>
}
