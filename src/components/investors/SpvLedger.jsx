import { withPhase7Touch } from './investorUi'
import { useState } from 'react'
import { useSites } from '../SitePicker'
import { siteName } from '../../services/sites'
import { lagosToday } from '../../services/siteContracts'
import { investorsService } from '../../services/investors'
import { hasRole } from '../../lib/roles'
import { fmtNaira2, ledgerWithBalances, LEDGER_LABEL, monthStart } from '../../utils/investorPools'
import { theme, ui, Pill, fmtDate, ErrorBox, SkeletonRows, ConfirmDialog, StackTable } from '../site/siteUi'
import { POOL_READ_ROLES, PoolSitePicker, MonthSelect, PageHeader, Field, Fact, FactGrid, useLoad, NoAccess } from './investorUi'

// Phase 7C — SPV ledger per site (v_spv_ledger). APCL collects from the
// client; every receipt is owed to the site's SPV until transferred. Paid-out
// is the distributions marked paid. md and accountant record transfers.

const TYPE_COLOR = { receipt: theme.green, transfer_to_spv: theme.blue, investor_distribution_paid: theme.accent, apcl_share_paid: theme.textMuted }

function SpvLedger({ userProfile }) {
  const canRead = hasRole(userProfile, ...POOL_READ_ROLES)
  const canWrite = hasRole(userProfile, 'md', 'accountant')
  const { sites } = useSites()
  const today = lagosToday()
  const [siteId, setSiteId] = useState('')
  const [month, setMonth] = useState('')
  const [form, setForm] = useState(null)
  const [notice, setNotice] = useState(null)

  const [rows, err, loading, reload] = useLoad(async () => (canRead && siteId ? ledgerWithBalances(await investorsService.listLedger(siteId)) : null), [canRead, siteId])
  if (!canRead) return <NoAccess />

  const shown = (rows || []).filter(r => !month || monthStart(r.entry_date) === month)
  const last = rows?.length ? rows[rows.length - 1] : null
  const sum = (k) => shown.reduce((s, r) => s + Number(r[k] || 0), 0)

  return (
    <div>
      <PageHeader title="SPV Ledger" subtitle="Client receipts owed to the site's SPV, transfers to the SPV, and distributions paid out.">
        {canWrite && siteId && <button type="button" style={ui.btn('primary')} onClick={() => { setNotice(null); setForm({ date: today, amount: '', reference: '', notes: '' }) }}>Record transfer to SPV</button>}
      </PageHeader>
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 240px' }}><PoolSitePicker value={siteId} onChange={setSiteId} id="spv-site" /></div>
        <div style={{ flex: '0 1 200px' }}><MonthSelect value={month} onChange={setMonth} latest={monthStart(today)} allowAll id="spv-month" /></div>
      </div>
      <ErrorBox error={err && `Could not load the SPV ledger: ${err.message}`} onRetry={reload} />
      {notice && <div style={ui.ok} role="status">{notice}</div>}

      {loading ? <SkeletonRows rows={5} /> : !err && rows && (
        <>
          <FactGrid>
            <Fact label="Owed to SPV now" value={fmtNaira2(last?.owed_balance ?? 0)} sub="receipts less transfers, all time" color={theme.accent} />
            <Fact label="Paid out, all time" value={fmtNaira2(last?.paid_total ?? 0)} />
            {month && <Fact label="Receipts in month" value={fmtNaira2(shown.filter(r => r.entry_type === 'receipt').reduce((s, r) => s + Number(r.owed_to_spv), 0))} />}
            {month && <Fact label="Paid out in month" value={fmtNaira2(sum('paid_out'))} />}
          </FactGrid>
          <div style={ui.panel}>
            {shown.length === 0 ? (
              <div style={{ ...ui.hint, display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                No ledger entries{month ? ' in this month' : ''} for {siteName(siteId, sites)}.
                {canWrite && <button type="button" style={ui.small(theme.accent)} onClick={() => setForm({ date: today, amount: '', reference: '', notes: '' })}>Record transfer to SPV</button>}
              </div>
            ) : (
              <StackTable headers={['Date', 'Entry', 'Reference', 'Owed to SPV', 'Owed balance', 'Paid out', 'Paid out total']} rightCols={[3, 4, 5, 6]}>
                {shown.map(r => (
                  <tr key={`${r.entry_type}-${r.source_id}`}>
                    <td style={ui.td}>{fmtDate(r.entry_date)}</td>
                    <td style={ui.td}><Pill label={LEDGER_LABEL[r.entry_type] || r.entry_type} color={TYPE_COLOR[r.entry_type]} /></td>
                    <td style={ui.td}>{r.reference || '—'}</td>
                    <td style={{ ...ui.td, ...ui.right }}>{Number(r.owed_to_spv) ? fmtNaira2(r.owed_to_spv) : '—'}</td>
                    <td style={{ ...ui.td, ...ui.right, fontWeight: 700 }}>{fmtNaira2(r.owed_balance)}</td>
                    <td style={{ ...ui.td, ...ui.right }}>{Number(r.paid_out) ? fmtNaira2(r.paid_out) : '—'}</td>
                    <td style={{ ...ui.td, ...ui.right }}>{fmtNaira2(r.paid_total)}</td>
                  </tr>
                ))}
              </StackTable>
            )}
          </div>
        </>
      )}

      {form && (
        <TransferDialog form={form} setForm={setForm} siteId={siteId} siteLabel={siteName(siteId, sites)} onClose={() => setForm(null)}
          onSaved={async (msg) => { setForm(null); setNotice(msg); await reload() }} />
      )}
    </div>
  )
}

function TransferDialog({ form, setForm, siteId, siteLabel, onClose, onSaved }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))
  const amt = form.amount === '' ? NaN : Number(form.amount)
  const problem = !form.date ? 'Enter the date.' : !(Number.isFinite(amt) && amt !== 0) ? 'Enter the amount (not zero).' : null
  const save = async () => {
    setBusy(true); setErr(null)
    try {
      await investorsService.recordTransfer({ siteId, transferredOn: form.date, amount: amt, reference: form.reference, notes: form.notes })
      await onSaved(`Transfer of ${fmtNaira2(amt)} to the ${siteLabel} SPV recorded.`)
    } catch (e) {
      setErr(e)
    } finally {
      setBusy(false)
    }
  }
  return (
    <ConfirmDialog title={`Record transfer to SPV — ${siteLabel}`} body="Money moved from APCL to the site's SPV. It reduces what APCL owes the SPV."
      confirmLabel="Record transfer" busy={busy} confirmDisabled={!!problem} onCancel={onClose} onConfirm={save}>
      <Field id="tr-date" label="Date *"><input id="tr-date" type="date" style={ui.input} value={form.date} onChange={set('date')} /></Field>
      <Field id="tr-amt" label="Amount (₦) *" hint="A negative amount records money returned from the SPV to APCL.">
        <input id="tr-amt" type="number" inputMode="decimal" step="any" style={ui.input} value={form.amount} onChange={set('amount')} />
      </Field>
      <Field id="tr-ref" label="Reference"><input id="tr-ref" style={ui.input} value={form.reference} onChange={set('reference')} /></Field>
      <Field id="tr-notes" label="Notes"><textarea id="tr-notes" style={ui.textarea} value={form.notes} onChange={set('notes')} /></Field>
      {problem && <div style={ui.hint}>{problem}</div>}
      <ErrorBox error={err} />
    </ConfirmDialog>
  )
}

export default withPhase7Touch(SpvLedger)
