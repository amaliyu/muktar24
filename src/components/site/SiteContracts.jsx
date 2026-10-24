import { withPhase7Touch } from './siteUi'
import { useEffect, useMemo, useState } from 'react'
import { useSites } from '../SitePicker'
import { siteName } from '../../services/sites'
import { siteContractsService, lagosToday, isCycleFunded } from '../../services/siteContracts'
import { hasRole } from '../../lib/roles'
import { buildAdvanceNoticeText, buildCompletionNoticeText } from '../../utils/siteNotices'
import WeeklyReportPanel, { WEEKLY_REPORT_ROLES } from './WeeklyReportPanel'
import SiteReceipts from './SiteReceipts'
import { theme, ui, Pill, fmtQty, fmtNaira, fmtDate, fmtDateTime, countdown, ErrorBox, SkeletonRows, CopyButton, ConfirmDialog, StackTable } from './siteUi'

// Phase 7B-1 — client contracts and their prepaid cycles. The cycle is the
// unit of money. The DB guard (fn_contract_cycle_guard) computes qty_total,
// full-supply amount_due, remobilisation_deadline and third_party_from, and
// blocks an unfunded start unless the primary-role MD gives a written reason.
// Its message is shown verbatim.

export const SITE_READ_ROLES = ['md', 'board_member', 'ico', 'accountant', 'production_manager', 'assistant_production_manager', 'store_officer', 'logistics_manager']
// Who sees contract money (fee, rates, amounts). Operational roles see
// quantities and dates only — same split as the app's AMOUNT_ROLES.
const MONEY_ROLES = ['md', 'accountant', 'ico', 'board_member']
const CYCLE_EDIT_ROLES = ['md', 'accountant']

const MODEL_LABEL = { service_fee: 'Service fee', full_supply: 'Full supply' }

function SiteContracts({ userProfile, initialSiteId, initialReport = false }) {
  const isReader = hasRole(userProfile, ...SITE_READ_ROLES)
  const isMD = userProfile?.role === 'md'
  const canHolidays = isMD || hasRole(userProfile, 'hr_officer')
  const canEditCycle = hasRole(userProfile, ...CYCLE_EDIT_ROLES)
  const seeMoney = hasRole(userProfile, ...MONEY_ROLES)
  const canReport = hasRole(userProfile, ...WEEKLY_REPORT_ROLES)
  const { sites } = useSites()

  const [siteFilter, setSiteFilter] = useState(initialSiteId || '')
  const [contracts, setContracts] = useState([])
  const [cycles, setCycles] = useState([])
  const [forecasts, setForecasts] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(null)

  useEffect(() => { if (initialSiteId) setSiteFilter(initialSiteId) }, [initialSiteId])

  const load = async () => {
    if (!isReader) { setLoading(false); return }
    setLoading(true); setErr(null)
    try {
      const cs = await siteContractsService.listContracts()
      const [cy, fc] = await Promise.all([
        siteContractsService.listCycles(cs.map(c => c.id)),
        siteContractsService.listForecasts(),
      ])
      setContracts(cs); setCycles(cy); setForecasts(fc)
    } catch (e) {
      setErr(e)
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [isReader])

  const shown = contracts.filter(c => !siteFilter || c.site_id === siteFilter)

  return (
    <div>
      <div style={ui.header}>
        <div>
          <div style={ui.title}>Site Contracts</div>
          <div style={ui.subtitle}>Client contracts, prepaid cycles, forecasts and notices. Warnings are prompts for APCL — nothing is sent to clients automatically.</div>
        </div>
      </div>

      {isReader && (
        <>
          {contracts.length > 1 && (
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }}>
              {[{ site_id: '', label: 'All sites' }, ...contracts.map(c => ({ site_id: c.site_id, label: siteName(c.site_id, sites) }))]
                .filter((x, i, a) => a.findIndex(y => y.site_id === x.site_id) === i)
                .map(x => (
                  <button key={x.site_id || 'all'} data-board-allow data-ico-allow type="button" onClick={() => setSiteFilter(x.site_id)}
                    style={{ ...ui.small(siteFilter === x.site_id ? theme.accent : theme.textMuted), minHeight: '40px' }}>{x.label}</button>
                ))}
            </div>
          )}
          <ErrorBox error={err && `Could not load contracts: ${err.message}`} onRetry={load} />
          {loading ? <SkeletonRows rows={4} /> : !err && shown.length === 0 ? (
            <div style={{ ...ui.panel, color: theme.textMuted, fontSize: '13px' }}>No contracts for this site.</div>
          ) : !err && shown.map(c => (
            <ContractBlock key={c.id} contract={c} sites={sites}
              cycles={cycles.filter(x => x.contract_id === c.id)}
              forecasts={forecasts.filter(f => f.contract_id === c.id)}
              isMD={isMD} canEditCycle={canEditCycle} seeMoney={seeMoney} onChanged={load}
              userProfile={userProfile} canReport={canReport}
              reportOpen={initialReport && !!initialSiteId && c.site_id === initialSiteId} />
          ))}
          {isMD && <WarningsRunner />}
        </>
      )}
      {canHolidays && <HolidaysEditor />}
      {!isReader && !canHolidays && <div style={ui.panel}>You do not have access to site contracts.</div>}
    </div>
  )
}

// ── one contract ─────────────────────────────────────────────
function ContractBlock({ contract: c, sites, cycles, forecasts, isMD, canEditCycle, seeMoney, onChanged, userProfile, canReport, reportOpen }) {
  const today = lagosToday()
  const [cycleForm, setCycleForm] = useState(null)
  const [action, setAction] = useState(null)     // { kind, cycle, reason }
  const [busy, setBusy] = useState(false)
  const [actErr, setActErr] = useState(null)
  const [showHistory, setShowHistory] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showReport, setShowReport] = useState(!!reportOpen)
  useEffect(() => { if (reportOpen) setShowReport(true) }, [reportOpen])
  const site = siteName(c.site_id, sites)
  const full = c.contract_model === 'full_supply'

  // Current cycle: the active one, else the latest not yet closed.
  const current = cycles.find(x => x.status === 'active') ||
    [...cycles].reverse().find(x => ['awaiting_payment', 'completed'].includes(x.status)) || null
  const fc = current ? forecasts.find(f => f.cycle_id === current.id) : null
  const maxNo = cycles.reduce((m, x) => Math.max(m, x.cycle_no), 0)
  const last = cycles.find(x => x.cycle_no === maxNo)

  const openNewCycle = () => setCycleForm({
    mode: 'new', cycle_no: maxNo + 1,
    qty_9in: '', qty_6in: '', qty_total: '', amount_due: '',
    rate_9in: last?.rate_9in ?? c.opening_rate_9in ?? '', rate_6in: last?.rate_6in ?? c.opening_rate_6in ?? '',
    amount_received: '0', payment_ref: '', paid_on: '', schedule_received_on: '', notes: '',
  })
  const openEditCycle = (x) => setCycleForm({
    mode: 'edit', id: x.id, cycle_no: x.cycle_no, saved_amount_due: x.amount_due,
    qty_9in: String(x.qty_9in ?? ''), qty_6in: String(x.qty_6in ?? ''), qty_total: String(x.qty_total ?? ''),
    amount_due: x.amount_due == null ? '' : String(x.amount_due),
    rate_9in: x.rate_9in ?? '', rate_6in: x.rate_6in ?? '',
    amount_received: String(x.amount_received ?? 0), payment_ref: x.payment_ref || '', paid_on: x.paid_on || '',
    schedule_received_on: x.schedule_received_on || '', notes: x.notes || '',
  })

  const runAction = async () => {
    setBusy(true); setActErr(null)
    try {
      const { kind, cycle, reason } = action
      if (kind === 'start') await siteContractsService.setCycleStatus(cycle.id, 'active')
      else if (kind === 'start_early') await siteContractsService.setCycleStatus(cycle.id, 'active', reason.trim())
      else if (kind === 'complete') await siteContractsService.setCycleStatus(cycle.id, 'completed')
      else if (kind === 'advance') await siteContractsService.markNoticeSent(cycle.id, 'advance', action.date)
      else if (kind === 'completion') await siteContractsService.markNoticeSent(cycle.id, 'completion', action.date)
      setAction(null)
      await onChanged()
    } catch (e) {
      setActErr(e)   // DB guard text, verbatim
    } finally {
      setBusy(false)
    }
  }

  const ACTION_TEXT = {
    start: { title: `Start cycle ${action?.cycle?.cycle_no}?`, body: 'The cycle can start only when it is fully paid' + (full ? ' and the production schedule is received.' : '.'), label: 'Start cycle' },
    start_early: { title: `Start cycle ${action?.cycle?.cycle_no} early (unfunded)?`, body: 'This overrides the prepayment rule. Your reason is recorded in the cycle history.', label: 'Start early' },
    complete: { title: `Mark cycle ${action?.cycle?.cycle_no} complete?`, body: 'Record the completion. Then send the completion notice and mark it sent.', label: 'Mark complete' },
    advance: { title: 'Mark the 7-day notice as sent?', body: 'Records the date the notice went to the client and stops the warning repeating. This date is evidence of notice.', label: 'Mark sent' },
    completion: { title: 'Mark the completion notice as sent?', body: full ? 'Starts the 7-day remobilisation window from this date. After it, third-party production is allowed.' : 'Records the date the notice went to the client.', label: 'Mark sent' },
  }

  const noticeData = current && {
    clientName: c.client_name, siteName: site, contractModel: c.contract_model, cycleNo: current.cycle_no,
    qtyTotal: fc?.qty_total ?? current.qty_total, done: fc?.done ?? 0, remaining: fc?.remaining ?? current.qty_total,
    forecastFinish: fc?.forecast_completion,
  }
  const funded = current && isCycleFunded(current, c.contract_model)
  const pct = fc && fc.qty_total > 0 ? Math.min(100, (Number(fc.done) / Number(fc.qty_total)) * 100) : 0

  return (
    <div style={{ ...ui.panel, borderLeft: `2px solid ${theme.accent}` }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', marginBottom: '12px' }}>
        <div>
          <div style={{ fontSize: '18px', fontWeight: '700', color: theme.text }}>{c.client_name}</div>
          <div style={ui.hint}>{site} · {c.contract_ref || 'no ref'}</div>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <Pill label={MODEL_LABEL[c.contract_model] || c.contract_model} color={full ? theme.blue : theme.green} />
          <Pill status={c.status} color={c.status === 'active' ? theme.green : undefined} />
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px', marginBottom: '16px' }}>
        <Fact label='9" total' value={fmtQty(c.total_qty_9in)} />
        <Fact label='6" total' value={fmtQty(c.total_qty_6in)} />
        <Fact label="Total blocks" value={fmtQty(Number(c.total_qty_9in) + Number(c.total_qty_6in))} />
        {seeMoney && (full
          ? <Fact label='Opening rates 9" / 6"' value={`${fmtNaira(c.opening_rate_9in)} / ${fmtNaira(c.opening_rate_6in)}`} />
          : <Fact label="Fee per accepted block" value={fmtNaira(c.fee_per_block)} />)}
        <Fact label="Planning rate" value={`${fmtQty(c.planning_rate_per_day)}/day`} />
      </div>

      {/* Current cycle */}
      {current && (
        <div style={{ border: `1px solid ${theme.border}`, borderRadius: '8px', padding: '16px', background: theme.surface, marginBottom: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
            <div style={ui.section}>Current cycle — {current.cycle_no}</div>
            <Pill status={current.status} />
          </div>
          {fc ? (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', ...ui.num }}>
                <span>{fmtQty(fc.done)} of {fmtQty(fc.qty_total)} done</span>
                <span style={{ color: theme.textMuted }}>{fmtQty(fc.remaining)} remaining</span>
              </div>
              <div style={{ height: '8px', background: theme.border, borderRadius: '4px', overflow: 'hidden', margin: '6px 0 12px' }} role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
                <div style={{ height: '100%', width: `${pct}%`, background: theme.green }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px' }}>
                <Fact label="Rate used" value={`${fmtQty(fc.rate_used)}/day`} sub={fc.rate_basis === 'actual' ? 'actual 5-day average' : 'planning rate (fewer than 5 production days)'} />
                <Fact label="Days left" value={fc.days_left == null ? '—' : String(fc.days_left)} sub="production days" />
                {['completed', 'closed'].includes(current.status)
                  ? <Fact label="Completed" value={fmtDate(current.completed_on)} />
                  : <Fact label="Forecast finish" value={current.status === 'active' ? fmtDate(fc.forecast_completion) : '—'} sub={current.status === 'active' ? 'Mon–Fri, excl. holidays' : 'set when the cycle starts'} />}
                <Fact label="Started" value={fmtDate(current.started_on)} sub={full ? 'Done = net produced at site' : 'Done = accepted handovers'} />
              </div>
            </>
          ) : <div style={ui.hint}>No forecast available for this cycle.</div>}

          {/* Notices */}
          <div style={{ marginTop: '16px', display: 'grid', gap: '12px' }}>
            <NoticeRow
              title="7-day advance notice"
              sentOn={current.advance_notice_sent_on}
              canMark={isMD && current.status === 'active' && !current.advance_notice_sent_on}
              onMark={() => { setActErr(null); setAction({ kind: 'advance', cycle: current, date: lagosToday() }) }}
              copyText={buildAdvanceNoticeText(noticeData)}
            />
            {['completed', 'closed'].includes(current.status) && (
              <NoticeRow
                title="Completion notice"
                sentOn={current.completion_notice_sent_on}
                canMark={isMD && !current.completion_notice_sent_on}
                onMark={() => { setActErr(null); setAction({ kind: 'completion', cycle: current, date: lagosToday() }) }}
                copyText={buildCompletionNoticeText({ ...noticeData, completedOn: current.completed_on, noticeDate: current.completion_notice_sent_on || today, remobilisationDeadline: current.remobilisation_deadline })}
              >
                {full && current.remobilisation_deadline && (
                  <div style={{ fontSize: '13px', marginTop: '6px', ...ui.num }}>
                    <div>Remobilisation deadline: <strong>{fmtDate(current.remobilisation_deadline)}</strong> <span style={{ color: theme.accent }}>({countdown(today, current.remobilisation_deadline)})</span></div>
                    <div>Third-party production allowed from: <strong>{fmtDate(current.third_party_from)}</strong> <span style={{ color: theme.accent }}>({countdown(today, current.third_party_from)})</span></div>
                  </div>
                )}
              </NoticeRow>
            )}
            {current.resume_deadline && (
              <div style={ui.hint}>Resume production by {fmtDate(current.resume_deadline)} (10 working days after remobilisation).</div>
            )}
          </div>

          {/* Status actions — MD only (accountant records payments, never status) */}
          {isMD && (
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '16px' }}>
              {current.status === 'awaiting_payment' && (
                <button type="button" style={ui.btn('primary')} onClick={() => { setActErr(null); setAction({ kind: 'start', cycle: current }) }}>Start cycle</button>
              )}
              {current.status === 'awaiting_payment' && !funded && (
                <button type="button" style={ui.btn('secondary')} onClick={() => { setActErr(null); setAction({ kind: 'start_early', cycle: current, reason: '' }) }}>Start early (unfunded)…</button>
              )}
              {current.status === 'active' && (
                <button type="button" style={ui.btn('secondary')} onClick={() => { setActErr(null); setAction({ kind: 'complete', cycle: current }) }}>Mark complete</button>
              )}
            </div>
          )}
          {current.status === 'awaiting_payment' && !funded && (
            <div style={{ ...ui.hint, marginTop: '8px' }}>
              Not yet startable: {current.amount_due == null ? 'amount due not set' : 'not fully paid'}{full && !current.schedule_received_on ? ', production schedule not received' : ''}.
            </div>
          )}
        </div>
      )}

      {/* Cycles table */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
        <div style={ui.micro}>Cycles</div>
        {isMD && <button type="button" style={ui.small(theme.accent)} onClick={openNewCycle}>Add next cycle</button>}
      </div>
      <div>
        <StackTable headers={['No', 'Qty / mix', ...(seeMoney ? ['Due', 'Received'] : []), 'Status', 'Started', 'Completed', '']} rightCols={seeMoney ? [1, 2, 3] : [1]}>
            {cycles.length === 0 && <tr><td style={ui.td} colSpan={8}>No cycles yet.</td></tr>}
            {cycles.map(x => (
              <tr key={x.id}>
                <td style={ui.td}>{x.cycle_no}</td>
                <td style={{ ...ui.td, ...ui.right }}>
                  {fmtQty(x.qty_total)}
                  {(x.qty_9in > 0 || x.qty_6in > 0) ? <div style={ui.hint}>{fmtQty(x.qty_9in)} × 9" + {fmtQty(x.qty_6in)} × 6"</div> : full ? <div style={ui.hint}>mix not entered</div> : null}
                </td>
                {seeMoney && <td style={{ ...ui.td, ...ui.right }}>{fmtNaira(x.amount_due)}</td>}
                {seeMoney && <td style={{ ...ui.td, ...ui.right }}>{fmtNaira(x.amount_received)}{x.payment_ref && <div style={ui.hint}>{x.payment_ref}{x.paid_on ? ` · ${fmtDate(x.paid_on)}` : ''}</div>}</td>}
                <td style={ui.td}><Pill status={x.status} /></td>
                <td style={ui.td}>{fmtDate(x.started_on)}</td>
                <td style={ui.td}>{fmtDate(x.completed_on)}</td>
                <td style={ui.td}>{canEditCycle && !['closed', 'cancelled'].includes(x.status) && (
                  <button type="button" style={ui.small()} onClick={() => openEditCycle(x)}>{seeMoney ? 'Payment / scope' : 'Edit'}</button>
                )}</td>
              </tr>
            ))}
        </StackTable>
      </div>

      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '12px' }}>
        <button type="button" data-board-allow data-ico-allow style={ui.btn('ghost')} onClick={() => setShowHistory(s => !s)}>{showHistory ? 'Hide' : 'Show'} cycle history</button>
        {isMD && <button type="button" style={ui.btn('ghost')} onClick={() => setShowSettings(s => !s)}>{showSettings ? 'Hide' : 'Contract'} settings</button>}
        {canReport && <button type="button" data-board-allow data-ico-allow style={ui.btn('secondary')} onClick={() => setShowReport(s => !s)}>{showReport ? 'Hide weekly report' : 'Weekly report'}</button>}
      </div>
      {seeMoney && (
        <SiteReceipts siteId={c.site_id} siteLabel={site} cycles={cycles} currentCycleId={current?.id}
          canWrite={canEditCycle} onChanged={onChanged} />
      )}
      {showReport && canReport && <WeeklyReportPanel contract={c} site={{ id: c.site_id, name: site }} userProfile={userProfile} />}
      {showHistory && <CycleHistory cycles={cycles} seeMoney={seeMoney} />}
      {showSettings && isMD && <ContractSettings contract={c} onSaved={onChanged} />}

      {cycleForm && (
        <CycleForm contract={c} form={cycleForm} setForm={setCycleForm} seeMoney={seeMoney}
          onClose={() => setCycleForm(null)} onSaved={async () => { setCycleForm(null); await onChanged() }} />
      )}

      {action && (
        <ConfirmDialog
          title={ACTION_TEXT[action.kind].title} body={ACTION_TEXT[action.kind].body}
          confirmLabel={ACTION_TEXT[action.kind].label} busy={busy}
          confirmDisabled={(action.kind === 'start_early' && !action.reason?.trim()) || ((action.kind === 'advance' || action.kind === 'completion') && !action.date)}
          onCancel={() => setAction(null)} onConfirm={runAction}
        >
          {action.kind === 'start_early' && (
            <div style={ui.field}>
              <label style={ui.label} htmlFor="override-reason">Override reason *</label>
              <textarea id="override-reason" style={ui.textarea} value={action.reason} onChange={e => setAction(a => ({ ...a, reason: e.target.value }))} />
            </div>
          )}
          {(action.kind === 'advance' || action.kind === 'completion') && (
            <div style={ui.field}>
              <label style={ui.label} htmlFor="notice-date">Date sent *</label>
              <input id="notice-date" type="date" style={ui.input} value={action.date} onChange={e => setAction(a => ({ ...a, date: e.target.value }))} />
            </div>
          )}
          <ErrorBox error={actErr} />
        </ConfirmDialog>
      )}
    </div>
  )
}

const Fact = ({ label, value, sub }) => (
  <div>
    <div style={ui.micro}>{label}</div>
    <div style={{ fontSize: '16px', fontWeight: '700', color: theme.text, marginTop: '2px', ...ui.num }}>{value}</div>
    {sub && <div style={ui.hint}>{sub}</div>}
  </div>
)

const NoticeRow = ({ title, sentOn, canMark, onMark, copyText, children }) => (
  <div style={{ borderTop: `1px solid ${theme.border}`, paddingTop: '12px' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
      <div>
        <div style={{ fontSize: '13px', fontWeight: '700' }}>{title}</div>
        <div style={ui.hint}>{sentOn ? `Sent ${fmtDate(sentOn)}` : 'Not sent'}</div>
      </div>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <CopyButton text={copyText} />
        {canMark && <button type="button" style={ui.small(theme.accent)} onClick={onMark}>Mark {title.toLowerCase()} sent</button>}
      </div>
    </div>
    {children}
  </div>
)

// ── cycle payment / scope form (md, accountant) ──────────────
function CycleForm({ contract: c, form, setForm, seeMoney, onClose, onSaved }) {
  const full = c.contract_model === 'full_supply'
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))
  const n = (v) => (v === '' || v == null ? null : Number(v))
  const split = (Number(form.qty_9in) || 0) + (Number(form.qty_6in) || 0)
  const preview = full && split > 0 && form.rate_9in !== '' && form.rate_6in !== ''
    ? Number(form.qty_9in || 0) * Number(form.rate_9in) + Number(form.qty_6in || 0) * Number(form.rate_6in) : null

  const problem = (() => {
    const nums = ['qty_9in', 'qty_6in', 'qty_total', 'rate_9in', 'rate_6in', 'amount_due']
    if (nums.some(k => form[k] !== '' && form[k] != null && !(Number(form[k]) >= 0))) return 'Quantities and amounts cannot be negative.'
    if (form.mode === 'new' && !(full ? split > 0 : Number(form.qty_total) > 0)) return 'Enter the cycle quantity.'
    return null
  })()

  const save = async () => {
    setBusy(true); setErr(null)
    try {
      // amount_received and paid_on are kept equal to the cycle's site
      // receipts by the DB (7C) — record or void a receipt instead.
      const patch = {
        payment_ref: form.payment_ref.trim() || null,
        notes: form.notes.trim() || null,
      }
      if (full) {
        Object.assign(patch, {
          qty_9in: n(form.qty_9in) ?? 0, qty_6in: n(form.qty_6in) ?? 0,
          rate_9in: n(form.rate_9in), rate_6in: n(form.rate_6in),
          schedule_received_on: form.schedule_received_on || null,
        })
        if (split === 0 && form.qty_total !== '') patch.qty_total = n(form.qty_total)
      } else {
        Object.assign(patch, { qty_total: n(form.qty_total) ?? 0, amount_due: n(form.amount_due) })
      }
      if (form.mode === 'new') {
        await siteContractsService.createCycle({ ...patch, contract_id: c.id, cycle_no: form.cycle_no })
      } else {
        await siteContractsService.updateCycle(form.id, patch)
      }
      await onSaved()
    } catch (e) {
      setErr(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <ConfirmDialog
      title={form.mode === 'new' ? `Add cycle ${form.cycle_no} — ${c.client_name}` : `Cycle ${form.cycle_no} — ${c.client_name}`}
      body={form.mode === 'new' && full ? 'Rates default to the previous cycle. Under Proposal §5 the rate is re-agreed in writing for every cycle — confirm before saving.' : null}
      confirmLabel="Save cycle" busy={busy} confirmDisabled={!!problem}
      onCancel={onClose} onConfirm={save}
    >
      <div style={{ maxHeight: '60vh', overflowY: 'auto', paddingRight: '4px' }}>
        {full ? (
          <>
            <Num label='9" quantity' value={form.qty_9in} onChange={set('qty_9in')} />
            <Num label='6" quantity' value={form.qty_6in} onChange={set('qty_6in')} />
            <div style={{ ...ui.hint, marginTop: '-6px', marginBottom: '12px' }}>Total: {split > 0 ? fmtQty(split) : `${fmtQty(form.qty_total)} (no mix yet)`}</div>
            {seeMoney && <Num label='Rate 9" (₦)' value={form.rate_9in} onChange={set('rate_9in')} />}
            {seeMoney && <Num label='Rate 6" (₦)' value={form.rate_6in} onChange={set('rate_6in')} />}
            {seeMoney && (
              <div style={ui.field}>
                <div style={ui.label}>Amount due (calculated)</div>
                <div style={{ ...ui.input, display: 'flex', alignItems: 'center', background: 'transparent', color: theme.accent, fontWeight: 700 }}>
                  {form.mode === 'edit' ? fmtNaira(form.saved_amount_due) : '—'}
                </div>
                <div style={ui.hint}>Calculated by the database on save (qty × rate).{preview != null ? ` This entry gives ${fmtNaira(preview)}.` : ''}</div>
              </div>
            )}
            <DateField label="Schedule received on" value={form.schedule_received_on} onChange={set('schedule_received_on')} />
          </>
        ) : (
          <>
            <Num label="Cycle quantity (accepted blocks)" value={form.qty_total} onChange={set('qty_total')} />
            {seeMoney && <Num label="Amount due (₦)" value={form.amount_due} onChange={set('amount_due')}
              hint={c.fee_per_block && Number(form.qty_total) > 0 ? `At ${fmtNaira(c.fee_per_block)}/block: ${fmtNaira(Number(form.qty_total) * Number(c.fee_per_block))}` : null} />}
          </>
        )}
        {seeMoney && (
          <div style={ui.field}>
            <div style={ui.label}>Amount received</div>
            <div style={{ ...ui.input, display: 'flex', alignItems: 'center', background: 'transparent', fontWeight: 700 }}>
              {form.mode === 'edit' ? fmtNaira(form.amount_received) : fmtNaira(0)}
            </div>
            <div style={ui.hint}>The sum of this cycle's receipts{form.mode === 'edit' && form.paid_on ? `, last received ${fmtDate(form.paid_on)}` : ''}. Use Record receipt / Void under Receipts to change it.</div>
          </div>
        )}
        <div style={ui.field}>
          <label style={ui.label} htmlFor="cy-ref">Payment ref</label>
          <input id="cy-ref" style={ui.input} value={form.payment_ref} onChange={set('payment_ref')} />
        </div>
        <div style={ui.field}>
          <label style={ui.label} htmlFor="cy-notes">Notes</label>
          <textarea id="cy-notes" style={ui.textarea} value={form.notes} onChange={set('notes')} />
        </div>
        {problem && <div style={ui.hint}>{problem}</div>}
        <ErrorBox error={err} />
      </div>
    </ConfirmDialog>
  )
}

const Num = ({ label, value, onChange, hint }) => {
  const id = 'f-' + label.replace(/[^a-z0-9]/gi, '').toLowerCase()
  return (
    <div style={ui.field}>
      <label style={ui.label} htmlFor={id}>{label}</label>
      <input id={id} type="number" inputMode="decimal" min="0" step="any" style={ui.input} value={value ?? ''} onChange={onChange} />
      {hint && <div style={ui.hint}>{hint}</div>}
    </div>
  )
}
const DateField = ({ label, value, onChange }) => {
  const id = 'd-' + label.replace(/[^a-z0-9]/gi, '').toLowerCase()
  return (
    <div style={ui.field}>
      <label style={ui.label} htmlFor={id}>{label}</label>
      <input id={id} type="date" style={ui.input} value={value || ''} onChange={onChange} />
    </div>
  )
}

// ── cycle history (contract_cycle_audit, read-only) ──────────
function CycleHistory({ cycles, seeMoney }) {
  const [rows, setRows] = useState(null)
  const [err, setErr] = useState(null)
  const ids = cycles.map(c => c.id).join(',')
  const load = () => {
    setErr(null)
    siteContractsService.listCycleAudit(cycles.map(c => c.id)).then(setRows).catch(setErr)
  }
  useEffect(load, [ids])
  const noOf = (id) => cycles.find(c => c.id === id)?.cycle_no
  return (
    <div style={{ marginTop: '12px' }}>
      <ErrorBox error={err && `Could not load cycle history: ${err.message}`} onRetry={load} />
      {!rows && !err ? <SkeletonRows rows={2} /> : rows && rows.length === 0 ? <div style={ui.hint}>No history yet.</div> : rows && (
        <div style={{ borderLeft: `2px solid ${theme.border}`, paddingLeft: '12px' }}>
          {rows.map(r => (
            <div key={r.id} style={{ marginBottom: '10px', fontSize: '13px' }}>
              <div style={{ color: theme.textMuted, fontSize: '12px', ...ui.num }}>{fmtDateTime(r.at)} · {r.actor_role || 'system'}</div>
              <div>
                Cycle {noOf(r.cycle_id)}: {r.from_status ? `${r.from_status.replace(/_/g, ' ')} → ` : 'created as '}{(r.to_status || '').replace(/_/g, ' ')}
              </div>
              {r.note && (seeMoney || !/received/.test(r.note)) && <div style={ui.hint}>{r.note}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── MD contract settings ─────────────────────────────────────
function ContractSettings({ contract: c, onSaved }) {
  const [form, setForm] = useState({
    planning_rate_per_day: String(c.planning_rate_per_day), advance_notice_days: String(c.advance_notice_days),
    material_warning_days: String(c.material_warning_days), notes: c.notes || '',
  })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const [ok, setOk] = useState(false)
  const set = (k) => (e) => { setOk(false); setForm(f => ({ ...f, [k]: e.target.value })) }
  const problem = !(Number(form.planning_rate_per_day) > 0) ? 'Planning rate must be more than 0.'
    : !(Number(form.advance_notice_days) >= 0 && Number(form.advance_notice_days) <= 60) ? 'Advance notice days must be 0–60.'
    : !(Number(form.material_warning_days) >= 0 && Number(form.material_warning_days) <= 60) ? 'Material warning days must be 0–60.' : null
  const save = async () => {
    setBusy(true); setErr(null)
    try {
      await siteContractsService.updateContractSettings(c.id, {
        planning_rate_per_day: Math.round(Number(form.planning_rate_per_day)),
        advance_notice_days: Math.round(Number(form.advance_notice_days)),
        material_warning_days: Math.round(Number(form.material_warning_days)),
        notes: form.notes.trim() || null,
      })
      setOk(true)
      await onSaved()
    } catch (e) {
      setErr(e)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div style={{ border: `1px solid ${theme.border}`, borderRadius: '8px', padding: '16px', marginTop: '12px' }}>
      <div style={ui.section}>Contract settings</div>
      <div style={ui.formGrid}>
        <Num label="Planning rate (blocks/day)" value={form.planning_rate_per_day} onChange={set('planning_rate_per_day')} hint="Used until the site has 5 production days." />
        <Num label="Advance notice days" value={form.advance_notice_days} onChange={set('advance_notice_days')} />
        <Num label="Material warning days" value={form.material_warning_days} onChange={set('material_warning_days')} />
      </div>
      <div style={ui.field}>
        <label style={ui.label} htmlFor={`cs-notes-${c.id}`}>Notes</label>
        <textarea id={`cs-notes-${c.id}`} style={ui.textarea} value={form.notes} onChange={set('notes')} />
      </div>
      {problem && <div style={{ ...ui.hint, marginBottom: '8px' }}>{problem}</div>}
      <ErrorBox error={err} />
      {ok && <div style={ui.ok}>Settings saved.</div>}
      <button type="button" style={ui.btn('primary', !!problem || busy)} disabled={!!problem || busy} onClick={save}>{busy ? 'Saving…' : 'Save settings'}</button>
    </div>
  )
}

// ── MD: run site warnings now ────────────────────────────────
function WarningsRunner() {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const [result, setResult] = useState(null)
  const run = async () => {
    setBusy(true); setErr(null); setResult(null)
    try {
      setResult(await siteContractsService.runSiteWarnings())
    } catch (e) {
      setErr(e)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div style={ui.panel}>
      <div style={ui.section}>Site warnings</div>
      <div style={{ ...ui.hint, marginBottom: '12px' }}>Runs automatically every day at 06:00. Each warning is sent at most once (materials: once a day) to the MD and Production Manager.</div>
      <ErrorBox error={err} />
      {result != null && <div style={ui.ok}>{result} warning check{result === 1 ? '' : 's'} raised. New ones appear in the notification bell; repeats are suppressed.</div>}
      <button type="button" style={ui.btn('secondary', busy)} disabled={busy} onClick={run}>{busy ? 'Running…' : 'Run warnings now'}</button>
    </div>
  )
}

// ── public holidays (md, hr_officer) ─────────────────────────
function HolidaysEditor() {
  const [rows, setRows] = useState(null)
  const [err, setErr] = useState(null)
  const [form, setForm] = useState({ date: '', name: '' })
  const [busy, setBusy] = useState(false)
  const [del, setDel] = useState(null)
  const load = () => { setErr(null); siteContractsService.listHolidays().then(setRows).catch(setErr) }
  useEffect(load, [])
  const add = async () => {
    setBusy(true); setErr(null)
    try {
      await siteContractsService.addHoliday(form.date, form.name.trim())
      setForm({ date: '', name: '' })
      load()
    } catch (e) {
      setErr(e)
    } finally {
      setBusy(false)
    }
  }
  const remove = async () => {
    setBusy(true); setErr(null)
    try {
      await siteContractsService.deleteHoliday(del.holiday_date)
      setDel(null)
      load()
    } catch (e) {
      setErr(e); setDel(null)
    } finally {
      setBusy(false)
    }
  }
  const sorted = useMemo(() => rows || [], [rows])
  return (
    <div style={ui.panel}>
      <div style={ui.section}>Public holidays</div>
      <div style={{ ...ui.hint, marginBottom: '12px' }}>Working days are Monday–Friday minus these dates. They drive the 3-working-day acceptance and 10-working-day resume clocks.</div>
      <ErrorBox error={err} />
      <div style={ui.formGrid}>
        <DateField label="Date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
        <div style={ui.field}>
          <label style={ui.label} htmlFor="hol-name">Name</label>
          <input id="hol-name" style={ui.input} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Christmas Day" />
        </div>
      </div>
      <button type="button" style={ui.btn('primary', busy || !form.date || !form.name.trim())} disabled={busy || !form.date || !form.name.trim()} onClick={add}>Add holiday</button>
      <div style={{ marginTop: '16px' }}>
        {!rows && !err ? <SkeletonRows rows={2} /> : sorted.length === 0 ? <div style={ui.hint}>No holidays entered.</div> : (
          <table style={ui.table}>
            <thead><tr><th style={ui.th}>Date</th><th style={ui.th}>Name</th><th style={ui.th}></th></tr></thead>
            <tbody>
              {sorted.map(h => (
                <tr key={h.holiday_date}>
                  <td style={ui.td}>{fmtDate(h.holiday_date)}</td>
                  <td style={ui.td}>{h.name}</td>
                  <td style={ui.td}><button type="button" style={ui.small(theme.red)} onClick={() => setDel(h)}>Remove</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {del && (
        <ConfirmDialog title={`Remove ${del.name} (${fmtDate(del.holiday_date)})?`} body="That day becomes a working day for the site clocks." confirmLabel="Remove" danger busy={busy} onCancel={() => setDel(null)} onConfirm={remove} />
      )}
    </div>
  )
}

export default withPhase7Touch(SiteContracts)
