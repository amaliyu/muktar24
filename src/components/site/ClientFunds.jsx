import { useState } from 'react'
import { hasRole } from '../../lib/roles'
import { todayLagos } from '../../utils/lagosDate'
import { clientFunds, statementBalances } from '../../services/clientFunds'
import { paymentRequestsService } from '../../services/paymentRequests'
import { useSiteRead } from './useSiteRead'
import { useAssignedSite } from '../AssignedSite'
import PaidFrom from './PaidFrom'
import { ui, theme, fmtNaira, ErrorBox, ConfirmDialog } from './siteUi'
const kinds = { asked: 'Asked', approved: 'Approved', received: 'Received', adjustment: 'Adjustment', spent: 'Spent', pending: 'Pending' }
function Statement({ siteId, fund, md, revision, refresh }) {
  const [open, setOpen] = useState(false), [target, setTarget] = useState(null), [reason, setReason] = useState(''), [error, setError] = useState(null), [busy, setBusy] = useState(false)
  const result = useSiteRead(() => open ? clientFunds.statement(siteId, fund) : null, [open, siteId, fund, revision])
  return <details onToggle={e => setOpen(e.currentTarget.open)}><summary data-ico-allow style={{ minHeight: 44 }}>Statement — {fund}</summary><ErrorBox error={result.error} />
    {result.data && statementBalances(result.data).map((r, i) => <article key={`${r.source}:${r.id}:${i}`} style={{ ...ui.panel, color: ['asked', 'approved', 'pending'].includes(r.kind) ? theme.textMuted : undefined }}>
      <div style={{ textDecoration: r.voided ? 'line-through' : undefined }}>{r.date} · {kinds[r.kind]} · {r.reference}<p>{r.note}</p>{fmtNaira(r.amount)} · Balance {fmtNaira(r.balance)}</div>
      {r.voided && <p>{r.void_reason}</p>}
      {md && r.source === 'entry' && !r.voided && <button style={ui.btn()} onClick={() => { setTarget(r); setReason(''); setError(null) }}>Void</button>}
    </article>)}
    {target && <ConfirmDialog title="Void fund entry" confirmLabel="Void entry" confirmDisabled={reason.trim().length < 10} busy={busy} onCancel={() => setTarget(null)} onConfirm={async () => {
      setBusy(true); setError(null)
      try { await clientFunds.void(target.id, reason); setTarget(null); refresh() } catch (error) { setError(error) } finally { setBusy(false) }
    }}><label>Reason<textarea style={ui.textarea} value={reason} minLength={10} onChange={e => setReason(e.target.value)} /></label><ErrorBox error={error} /></ConfirmDialog>}
  </details>
}
function MoneyForm({ siteId, md, onSaved, onCancel }) {
  const [f, setF] = useState({ fund: 'operating', kind: 'approved', date: todayLagos(), amount: '', bankAccountId: '', reference: '', note: '' })
  const [busy, setBusy] = useState(false), [error, setError] = useState(null)
  const accounts = useSiteRead(() => f.kind === 'received' ? clientFunds.accounts() : null, [f.kind])
  const field = (key, label, type = 'text') => <label>{label}<input style={ui.input} type={type} max={type === 'date' ? todayLagos() : undefined} step={type === 'number' ? '0.01' : undefined} required={['date', 'amount'].includes(key) || key === 'reference' && f.kind === 'received'} value={f[key]} onChange={e => setF({ ...f, [key]: e.target.value })} /></label>
  const select = (key, label, options) => <label>{label}<select style={ui.input} value={f[key]} onChange={e => setF({ ...f, [key]: e.target.value })}>{options.map(([v, name]) => <option key={v} value={v}>{name}</option>)}</select></label>
  return <form style={{ display: 'grid', gap: 12 }} onSubmit={async e => {
    e.preventDefault(); setError(null)
    if (f.date > todayLagos() || !f.date) { setError(new Error('Choose a date that is not in the future.')); return }
    if (!Number.isFinite(Number(f.amount)) || f.amount === '' || f.kind !== 'adjustment' && Number(f.amount) <= 0) { setError(new Error('Enter a valid amount.')); return }
    if (f.kind === 'received' && !f.reference.trim()) { setError(new Error('Enter the receipt reference.')); return }
    if (f.kind === 'adjustment' && (!md || f.note.trim().length < 10)) { setError(new Error('An adjustment needs a note of at least 10 characters.')); return }
    setBusy(true)
    try { await clientFunds.record(siteId, f); onSaved() } catch (error) { setError(error) } finally { setBusy(false) }
  }}>
    {select('fund', 'Fund', [['operating', 'Operating'], ['diesel', 'Diesel']])}
    {select('kind', 'Type', [['approved', 'Approved by client'], ['received', 'Received'], ...(md ? [['adjustment', 'Adjustment']] : [])])}
    {field('date', 'Date', 'date')}{field('amount', 'Amount', 'number')}
    {f.kind === 'received' && <>{select('bankAccountId', 'Bank account', [['', 'None / cash'], ...(accounts.data || []).map(a => [a.id, a.account_name])])}<ErrorBox error={accounts.error} /></>}
    {field('reference', 'Reference')}<p style={ui.hint}>transfer reference, or 'cash — received by &lt;name&gt;'</p>{field('note', 'Note')}
    <ErrorBox error={error} /><button style={ui.btn()} disabled={busy}>Record</button><button type="button" style={ui.btn()} onClick={onCancel} disabled={busy}>Cancel</button>
  </form>
}
export default function ClientFunds({ contract, userProfile }) {
  const assignment = useAssignedSite()
  const allowed = hasRole(userProfile, 'md', 'accountant', 'ico', 'production_manager', 'assistant_production_manager') && !assignment.loading && !assignment.error && (!assignment.siteId || assignment.siteId === contract.site_id)
  const [revision, setRevision] = useState(0), [recording, setRecording] = useState(false), [assigning, setAssigning] = useState(false)
  const md = hasRole(userProfile, 'md'), edit = hasRole(userProfile, 'md', 'accountant', 'ico')
  const summary = useSiteRead(() => allowed ? clientFunds.summary(contract.site_id) : null, [allowed, contract.site_id, revision])
  const untagged = useSiteRead(() => allowed && edit && assigning ? paymentRequestsService.listUntagged(contract.site_id) : null, [allowed, edit, assigning, contract.site_id, revision])
  const refresh = () => setRevision(n => n + 1)
  if (!allowed || contract.contract_model !== 'service_fee') return null
  return <section style={{ ...ui.panel, minWidth: 0, overflowWrap: 'anywhere' }}><h3>Client funds — {contract.client_name}</h3><ErrorBox error={summary.error} />
    {['operating', 'diesel'].map(fund => { const f = summary.data?.funds?.find(x => x.fund === fund); return <section key={fund} style={ui.panel}><h4>{fund === 'operating' ? 'Operating' : 'Diesel'}</h4>
      {f && <><p>{['asked', 'approved', 'received', 'spent', 'pending'].map(k => `${kinds[k] || 'Approved'} ${fmtNaira(f[k])}`).join(' · ')}</p>
        <strong style={{ fontSize: 20, color: f.client_owes > 0 ? theme.red : theme.green }}>{f.client_owes > 0 ? `${contract.client_name} owes APCL ${fmtNaira(f.client_owes)}` : `Holding ${fmtNaira(f.balance)} of ${contract.client_name}'s money`}</strong></>}
      <Statement siteId={contract.site_id} fund={fund} md={md} revision={revision} refresh={refresh} /></section> })}
    {summary.data?.untagged_count > 0 && <><p style={{ color: theme.accent }}>{fmtNaira(summary.data.untagged_spent)} spent at this site in {summary.data.untagged_count} payment requests not assigned to a fund</p>
      {edit && <button data-ico-allow style={ui.btn()} onClick={() => setAssigning(!assigning)}>Assign</button>}
      {assigning && <><ErrorBox error={untagged.error} />{untagged.data?.map(r => <article key={r.id} style={ui.panel}>{r.reference} · {r.transaction_date} · {r.purpose} · {fmtNaira(r.amount)}<PaidFrom request={r} site={{ site_type: 'client_site' }} client={contract.client_name} userProfile={userProfile} onChanged={refresh} /></article>)}</>}
    </>}
    {hasRole(userProfile, 'md', 'accountant') && <button style={ui.btn()} onClick={() => setRecording(!recording)}>Record money</button>}
    {recording && <MoneyForm siteId={contract.site_id} md={md} onSaved={() => { setRecording(false); refresh() }} onCancel={() => setRecording(false)} />}
  </section>
}
