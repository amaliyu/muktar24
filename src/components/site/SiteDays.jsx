import { useEffect, useId, useState } from 'react'
import { hasRole } from '../../lib/roles'
import { siteDays } from '../../services/siteDays'
import { lagosToday } from '../../utils/lateEntry'
import { shiftScorecardDate } from '../../utils/siteScorecard'
import { useAssignedSite } from '../AssignedSite'
import { useSites } from '../SitePicker'
import { LateReasonField, useLateReason } from '../LateReasonField'
import { ConfirmDialog, ErrorBox, fmtDate, fmtDec, fmtNaira, theme, ui } from './siteUi'
import { useSiteRead } from './useSiteRead'

export const SITE_DAY_WRITE_ROLES = ['md', 'production_manager', 'assistant_production_manager']
export const SITE_DAY_READ_ROLES = [...SITE_DAY_WRITE_ROLES, 'board_member', 'ico', 'accountant', 'store_officer', 'logistics_manager']
export const DAY_REASONS = {
  rest_day: 'Rest day', breakdown: 'Machine breakdown', no_materials: 'No materials',
  no_diesel_power: 'No diesel / power', rain: 'Rain', client_hold: 'Client stopped work', other: 'Other',
}
export const DAY_WORK = { stacking: 'Stacking', offloading: 'Offloading', maintenance: 'Maintenance', cleaning: 'Cleaning', other: 'Other' }
const actions = { display: 'flex', flexWrap: 'wrap', gap: 8 }
const panel = { ...ui.panel, minWidth: 0, overflowWrap: 'anywhere' }
const option = { display: 'flex', gap: 10, alignItems: 'center', minHeight: 44 }
const controls = { 'data-board-allow': true, 'data-ico-allow': true }
const breakdownHint = 'A downtime record was opened for the machine — close it in Maintenance when repaired.'
const fortnight = today => shiftScorecardDate(today, -13)

export function useSiteDayOverview(siteId, revision) {
  const today = lagosToday()
  const result = useSiteRead(async () => siteId
    ? { siteId, overview: await siteDays.overview(siteId, fortnight(today), today) }
    : null, [siteId, revision, today])
  return { overview: result.data?.siteId === siteId ? result.data.overview : null, error: result.error }
}

export function SiteDayStrip({ overview, canWrite, onOpen, onLabour }) {
  const today = lagosToday()
  if (!overview?.day_status_from) return null
  return <section style={panel} aria-label="Last 14 days">
    <h2 style={ui.section}>Last 14 days · {overview.site_name}</h2>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 142px), 1fr))', gap: 8 }}>
      {(overview.days || []).map(day => {
        const text = day.has_production ? '✓ ' + fmtDec(day.blocks) + ' blocks'
          : day.status ? 'No production — ' + DAY_REASONS[day.status.reason]
          : day.missing_record ? 'Missing' : day.date === today ? 'Today' : null
        if (!text) return null
        const color = day.has_production ? theme.green : day.status ? theme.blue : day.missing_record ? theme.red : theme.textMuted
        const chip = { ...ui.btn(), display: 'block', width: '100%', textAlign: 'left', padding: '6px 10px', color, overflowWrap: 'anywhere' }
        const content = <><span>{fmtDate(day.date)}</span><br /><strong>{text}</strong></>
        return <div key={day.date} style={{ minWidth: 0 }}>
          {canWrite && (day.missing_record || day.status)
            ? <button {...controls} type="button" style={chip} onClick={() => onOpen(day.date)}>{content}</button>
            : <div style={{ ...chip, width: 'auto' }}>{content}</div>}
          {day.missing_roster && <button {...controls} type="button" style={{ ...ui.btn(), color: theme.accent, marginTop: 4 }} onClick={onLabour}>No roster</button>}
        </div>
      })}
    </div>
    {overview.days?.some(day => day.status?.reason === 'breakdown' && day.status.downtime_id) &&
      <p style={ui.hint}>{breakdownHint}</p>}
  </section>
}

export function SiteDayForm({ siteId, siteName, initialDate, overview, onSaved, onCancel }) {
  const today = lagosToday()
  const [date, setDate] = useState(initialDate)
  const known = overview.days?.find(day => day.date === date)
  const lookup = useSiteRead(async () => date && date <= today && !known
    ? { date, day: (await siteDays.overview(siteId, date, date))?.days?.[0] }
    : null, [date, siteId, known, today])
  const day = known || (lookup.data?.date === date ? lookup.data.day : null)
  const [form, setForm] = useState(() => dayFields(day?.status))
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const lateEntry = useLateReason(date)
  const group = useId()
  useEffect(() => { setForm(dayFields(day?.status)) }, [day])

  const set = (key, value) => setForm(previous => ({ ...previous, [key]: value }))
  const invalidNote = form.reason === 'other' && form.note.trim().length < 3
  const invalidWork = form.staffWorked && !form.workDone.length
  const invalidWorkNote = form.staffWorked && form.workDone.includes('other') && form.workNote.trim().length < 3
  const blocked = saving || !date || date > today || (!known && (lookup.loading || lookup.error || lookup.data?.date !== date)) ||
    day?.has_production || !form.reason || invalidNote || invalidWork || invalidWorkNote || lateEntry.invalid

  const save = async event => {
    event.preventDefault()
    if (blocked) return
    setSaving(true)
    setError(null)
    try {
      await siteDays.record(siteId, date, { ...form, note: form.note.trim(), workNote: form.workNote.trim(), lateReason: lateEntry.payload.late_reason })
      onSaved()
    } catch (error) {
      if (!lateEntry.handleError(error)) setError(error)
    } finally { setSaving(false) }
  }

  const remove = async () => {
    setSaving(true)
    setError(null)
    try { await siteDays.clear(siteId, date); onSaved() }
    catch (error) { setError(error); setConfirm(false) }
    finally { setSaving(false) }
  }

  return <form aria-label="Site day status" style={panel} onSubmit={save}>
    <h2 style={ui.section}>No production on a day · {siteName}</h2>
    <ErrorBox error={error || lookup.error} />
    <label style={ui.label}>Date
      <input type="date" style={ui.input} value={date} max={today} required disabled={saving}
        onChange={event => { setDate(event.target.value); setError(null); lateEntry.reset() }} />
    </label>
    {day?.has_production && <p style={ui.fieldError}>Production is already recorded for this day.</p>}
    <fieldset style={{ border: 0, padding: 0, margin: '10px 0', minInlineSize: 0 }} disabled={saving}>
      <legend>Why was there no production?</legend>
      {Object.entries(DAY_REASONS).map(([key, label]) => <label key={key} style={option}>
        <input type="radio" name={group + '-reason'} checked={form.reason === key} onChange={() => set('reason', key)} />{label}
      </label>)}
      <label style={ui.label}>Reason note {form.reason === 'other' ? '(required)' : '(optional)'}
        <textarea style={ui.textarea} value={form.note} onChange={event => set('note', event.target.value)} />
      </label>
      {invalidNote && <div style={ui.fieldError}>Say why there was no production.</div>}
      {day?.status?.reason === 'breakdown' && day.status.downtime_id && <p style={ui.hint}>{breakdownHint}</p>}
    </fieldset>
    <fieldset style={{ border: 0, padding: 0, margin: '10px 0', minInlineSize: 0 }} disabled={saving}>
      <legend>Did staff work?</legend>
      {[true, false].map(value => <label key={String(value)} style={option}>
        <input type="radio" name={group + '-staff'} checked={form.staffWorked === value} onChange={() => set('staffWorked', value)} />
        {value ? 'Yes' : 'No'}
      </label>)}
      {form.staffWorked && <>
        <div>What work did staff do?</div>
        {Object.entries(DAY_WORK).map(([key, label]) => <label key={key} style={option}>
          <input type="checkbox" checked={form.workDone.includes(key)} onChange={event => set('workDone', event.target.checked
            ? [...form.workDone, key] : form.workDone.filter(value => value !== key))} />{label}
        </label>)}
        {invalidWork && <div style={ui.fieldError}>Tick what the staff did.</div>}
        <label style={ui.label}>Work note {form.workDone.includes('other') ? '(required)' : '(optional)'}
          <textarea style={ui.textarea} value={form.workNote} onChange={event => set('workNote', event.target.value)} />
        </label>
        {invalidWorkNote && <div style={ui.fieldError}>Say what other work the staff did.</div>}
      </>}
    </fieldset>
    <LateReasonField entry={lateEntry} />
    <div style={actions}>
      <button type="submit" style={ui.btn('primary')} disabled={Boolean(blocked)}>{day?.status ? 'Update' : 'Save'}</button>
      {day?.status && <button type="button" style={ui.btn('danger')} disabled={saving} onClick={() => setConfirm(true)}>Remove day status</button>}
      <button type="button" style={ui.btn()} disabled={saving} onClick={onCancel}>Cancel</button>
    </div>
    {confirm && <ConfirmDialog title="Remove day status?" body={'Remove the no-production record for ' + fmtDate(date) + '?'}
      danger busy={saving} confirmLabel="Remove" onConfirm={remove} onCancel={() => setConfirm(false)} />}
  </form>
}

function dayFields(status) {
  return {
    reason: status?.reason || '', note: status?.note || '', staffWorked: status?.staff_worked ?? false,
    workDone: status?.work_done || [], workNote: status?.work_note || '',
  }
}

export function NoProductionDay({ status, idleLabour }) {
  return <section style={panel} aria-label="No production">
    <h3 style={ui.section}>No production — {DAY_REASONS[status.reason]}</h3>
    {status.note && <p>{status.note}</p>}
    <p>{status.staff_worked ? 'Staff worked: ' + (status.work_done || []).map(key => DAY_WORK[key]?.toLowerCase()).filter(Boolean).join(', ') : 'Staff did not work'}</p>
    {status.staff_worked && status.work_note && <p>{status.work_note}</p>}
    {idleLabour != null && <strong>Idle labour {fmtNaira(idleLabour)}</strong>}
  </section>
}

function periodDates(period, today) {
  const monthStart = today.slice(0, 7) + '-01'
  if (period === 'This month') return [monthStart, today]
  if (period === 'Last month') {
    const end = shiftScorecardDate(monthStart, -1)
    return [end.slice(0, 7) + '-01', end]
  }
  return [shiftScorecardDate(today, -6), today]
}

export function SiteDayPeriod({ siteId, onProduction }) {
  const [period, setPeriod] = useState('Last 7 days')
  const [from, to] = periodDates(period, lagosToday())
  const result = useSiteRead(async () => siteId
    ? { siteId, from, to, overview: await siteDays.overview(siteId, from, to) } : null, [siteId, from, to])
  const data = result.data
  const totals = data?.siteId === siteId && data?.from === from && data?.to === to ? data?.overview?.totals : null
  if (!siteId) return null
  return <section style={panel} aria-label="Period totals">
    <h3 style={ui.section}>Period</h3>
    <div style={actions}>
      {['Last 7 days', 'This month', 'Last month'].map(option => <button {...controls} key={option} type="button"
        style={ui.btn(period === option ? 'primary' : 'secondary')} aria-pressed={period === option} onClick={() => setPeriod(option)}>{option}</button>)}
    </div>
    <ErrorBox error={result.error} />
    {result.loading && <p role="status">Loading period totals…</p>}
    {totals && <dl style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: '8px 12px', marginBottom: 0 }}>
      {[
        ['Blocks', fmtDec(totals.blocks)], ['Production days', fmtDec(totals.production_days)],
        ['No-production days', fmtDec(totals.no_production_days)], ['Idle labour', fmtNaira(totals.idle_labour_cost)],
        ['Cost per block (all days)', fmtNaira(totals.cost_per_block)],
        ['Cost per block (production days only)', fmtNaira(totals.cost_per_block_excl_idle)],
      ].map(([label, value]) => <div key={label} style={{ display: 'contents' }}><dt>{label}</dt><dd style={{ margin: 0 }}>{value}</dd></div>)}
      {[['Missing records', totals.missing_records], ['Missing rosters', totals.missing_rosters]].map(([label, count]) => (
        <div key={label} style={{ gridColumn: '1 / -1', color: count > 0 ? theme.red : undefined }}>
          {count > 0 && onProduction
            ? <button {...controls} type="button" style={{ ...ui.btn(), color: theme.red }} onClick={() => onProduction(siteId)}>{label}: {fmtDec(count)}</button>
            : <span>{label}: {fmtDec(count)}</span>}
        </div>
      ))}
    </dl>}
  </section>
}

export function SiteDayDashboard({ userProfile, onProduction }) {
  const assignment = useAssignedSite()
  const { sites } = useSites()
  const canWrite = hasRole(userProfile, ...SITE_DAY_WRITE_ROLES)
  const today = lagosToday()
  const result = useSiteRead(async () => {
    if (!canWrite || assignment.loading || assignment.error) return []
    const ids = assignment.siteId ? [assignment.siteId] : sites.map(site => site.id)
    return (await Promise.allSettled(ids.map(async id => ({ id, overview: await siteDays.overview(id, fortnight(today), today) }))))
      .flatMap(result => result.status === 'fulfilled' && result.value.overview?.day_status_from ? [result.value] : [])
  }, [canWrite, assignment.siteId, assignment.loading, assignment.error, sites, today])
  if (!canWrite || assignment.loading || assignment.error) return null
  return (result.data || []).filter(({ id }) => !assignment.siteId || assignment.siteId === id).map(({ id, overview }) => {
    const missing = overview.totals?.missing_records || 0
    const rosters = overview.totals?.missing_rosters || 0
    if (!missing && !rosters) return null
    return <section key={id} style={panel} aria-label={overview.site_name + ' day checks'}>
      <h3 style={ui.section}>{overview.site_name}</h3>
      <div style={actions}>
        {missing > 0 && <button {...controls} type="button" style={{ ...ui.btn(), color: theme.red }} onClick={() => onProduction(id)}>
          {fmtDec(missing)} site {missing === 1 ? 'day needs' : 'days need'} a record
        </button>}
        {rosters > 0 && <button {...controls} type="button" style={{ ...ui.btn(), color: theme.accent }} onClick={() => onProduction(id)}>
          {fmtDec(rosters)} {rosters === 1 ? 'day' : 'days'} without a labour roster
        </button>}
      </div>
    </section>
  })
}
