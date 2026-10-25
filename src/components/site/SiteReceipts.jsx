import { withPhase7Touch } from './siteUi'
import { useEffect, useState } from 'react'
import { investorsService } from '../../services/investors'
import { lagosToday } from '../../services/siteContracts'
import { theme, ui, Pill, fmtNaira, fmtDate, ErrorBox, SkeletonRows, ConfirmDialog, StackTable } from './siteUi'

// Phase 7C — client receipts at a site (site_receipts). Every receipt is owed
// to the site's SPV until transferred. A receipt is never edited or deleted:
// it is voided with a reason. The DB keeps the cycle's amount_received and
// paid_on equal to its receipts, and refuses a receipt into an approved month.
// Money roles read (md, accountant, ico, board); md and accountant record.
// The bank picker shows bank and account name only — never the number.

export const bankLabel = (b) => (b ? `${b.bank_name || 'Bank'} — ${b.account_name || 'account'}` : '—')

function SiteReceipts({ siteId, siteLabel, cycles, currentCycleId, canWrite, onChanged }) {
  const [rows, setRows] = useState(null)
  const [banks, setBanks] = useState([])
  const [err, setErr] = useState(null)
  const [form, setForm] = useState(null)
  const [voiding, setVoiding] = useState(null)
  const [notice, setNotice] = useState(null)

  const load = async () => {
    setErr(null)
    try {
      const [r, b] = await Promise.all([investorsService.listSiteReceipts(siteId), investorsService.listBankAccounts()])
      setRows(r); setBanks(b)
    } catch (e) {
      setErr(e)
    }
  }
  useEffect(() => { load() }, [siteId])

  const cycleNo = (id) => cycles.find(c => c.id === id)?.cycle_no
  const bank = (id) => banks.find(b => b.id === id)
  const after = async (msg) => { setForm(null); setVoiding(null); setNotice(msg); await load(); await onChanged?.() }

  return (
    <div style={{ marginTop: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
        <div style={ui.micro}>Receipts</div>
        {canWrite && (
          <button type="button" style={ui.small(theme.accent)} onClick={() => {
            setNotice(null)
            setForm({ received_on: lagosToday(), amount: '', cycle_id: currentCycleId || '', payer: '', reference: '', bank_account_id: '', notes: '' })
          }}>Record receipt</button>
        )}
      </div>
      <ErrorBox error={err && `Could not load receipts: ${err.message}`} onRetry={load} />
      {notice && <div style={ui.ok} role="status">{notice}</div>}
      {!rows && !err ? <SkeletonRows rows={2} /> : rows && rows.length === 0 ? (
        <div style={ui.hint}>No receipts recorded for {siteLabel}.</div>
      ) : rows && (
        <StackTable headers={['Date', 'Cycle', 'Amount', 'Payer', 'Reference', 'Bank account', 'Status', '']} rightCols={[2]}>
          {rows.map(r => (
            <tr key={r.id}>
              <td style={ui.td}>{fmtDate(r.received_on)}</td>
              <td style={ui.td}>{r.cycle_id ? `Cycle ${cycleNo(r.cycle_id) ?? '?'}` : '—'}</td>
              <td style={{ ...ui.td, ...ui.right, fontWeight: 700, textDecoration: r.voided ? 'line-through' : 'none', color: r.voided ? theme.textMuted : theme.text }}>{fmtNaira(r.amount)}</td>
              <td style={ui.td}>{r.payer || '—'}</td>
              <td style={ui.td}>{r.reference || '—'}{r.notes && <div style={ui.hint}>{r.notes}</div>}</td>
              <td style={ui.td}>{r.bank_account_id ? bankLabel(bank(r.bank_account_id)) : '—'}</td>
              <td style={ui.td}>
                {r.voided ? <Pill label="Voided" color={theme.red} /> : <Pill label="Received" color={theme.green} />}
                {r.voided && r.void_reason && <div style={ui.hint}>{r.void_reason}</div>}
              </td>
              <td style={ui.td}>{canWrite && !r.voided && <button type="button" style={ui.small(theme.red)} onClick={() => setVoiding({ receipt: r, reason: '' })}>Void</button>}</td>
            </tr>
          ))}
        </StackTable>
      )}
      {form && <ReceiptForm form={form} setForm={setForm} siteId={siteId} siteLabel={siteLabel} cycles={cycles} banks={banks} onClose={() => setForm(null)} onSaved={after} />}
      {voiding && <VoidDialog voiding={voiding} setVoiding={setVoiding} onClose={() => setVoiding(null)} onDone={after} />}
    </div>
  )
}

function ReceiptForm({ form, setForm, siteId, siteLabel, cycles, banks, onClose, onSaved }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))
  const amt = form.amount === '' ? NaN : Number(form.amount)
  const problem = !form.received_on ? 'Enter the date.' : !(amt > 0) ? 'Enter an amount above zero.' : null
  const save = async () => {
    setBusy(true); setErr(null)
    try {
      await investorsService.recordSiteReceipt({ ...form, site_id: siteId, amount: amt })
      await onSaved(`Receipt of ${fmtNaira(amt)} recorded for ${siteLabel}.`)
    } catch (e) {
      setErr(e)   // trigger message (approved month, wrong site), verbatim
    } finally {
      setBusy(false)
    }
  }
  const pickable = cycles.filter(c => !['cancelled'].includes(c.status))
  return (
    <ConfirmDialog title={`Record receipt — ${siteLabel}`} body="Money received from the client. It is owed to the site's SPV until transferred. A receipt cannot be edited later — only voided."
      confirmLabel="Record receipt" busy={busy} confirmDisabled={!!problem} onCancel={onClose} onConfirm={save}>
      <div style={{ maxHeight: '60vh', overflowY: 'auto', paddingRight: '4px' }}>
        <F id="rc-date" label="Date received *"><input id="rc-date" type="date" style={ui.input} value={form.received_on} onChange={set('received_on')} /></F>
        <F id="rc-amt" label="Amount (₦) *"><input id="rc-amt" type="number" inputMode="decimal" min="0" step="any" style={ui.input} value={form.amount} onChange={set('amount')} /></F>
        <F id="rc-cycle" label="Cycle">
          <select id="rc-cycle" style={ui.input} value={form.cycle_id} onChange={set('cycle_id')}>
            <option value="">Not for a cycle</option>
            {pickable.map(c => <option key={c.id} value={c.id}>Cycle {c.cycle_no} ({String(c.status).replace(/_/g, ' ')})</option>)}
          </select>
        </F>
        <F id="rc-payer" label="Payer"><input id="rc-payer" style={ui.input} value={form.payer} onChange={set('payer')} /></F>
        <F id="rc-ref" label="Reference"><input id="rc-ref" style={ui.input} value={form.reference} onChange={set('reference')} /></F>
        <F id="rc-bank" label="Bank account">
          <select id="rc-bank" style={ui.input} value={form.bank_account_id} onChange={set('bank_account_id')}>
            <option value="">Not stated</option>
            {banks.filter(b => b.is_active !== false || b.id === form.bank_account_id).map(b => <option key={b.id} value={b.id}>{bankLabel(b)}</option>)}
          </select>
        </F>
        <F id="rc-notes" label="Notes"><textarea id="rc-notes" style={ui.textarea} value={form.notes} onChange={set('notes')} /></F>
        {problem && <div style={ui.hint}>{problem}</div>}
        <ErrorBox error={err} />
      </div>
    </ConfirmDialog>
  )
}

function VoidDialog({ voiding, setVoiding, onClose, onDone }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const r = voiding.receipt
  const run = async () => {
    setBusy(true); setErr(null)
    try {
      await investorsService.voidSiteReceipt(r.id, voiding.reason)
      await onDone(`Receipt of ${fmtNaira(r.amount)} on ${fmtDate(r.received_on)} voided.`)
    } catch (e) {
      setErr(e)
    } finally {
      setBusy(false)
    }
  }
  return (
    <ConfirmDialog title={`Void receipt of ${fmtNaira(r.amount)} on ${fmtDate(r.received_on)}?`}
      body="The receipt stays on record as voided and stops counting toward the cycle and the SPV. A voided receipt cannot be restored — record it again if needed."
      confirmLabel="Void receipt" danger busy={busy} confirmDisabled={!voiding.reason.trim()} onCancel={onClose} onConfirm={run}>
      <F id="rc-void" label="Reason *"><textarea id="rc-void" style={ui.textarea} value={voiding.reason} onChange={e => setVoiding(v => ({ ...v, reason: e.target.value }))} /></F>
      <ErrorBox error={err} />
    </ConfirmDialog>
  )
}

const F = ({ id, label, children }) => (
  <div style={ui.field}>
    <label style={ui.label} htmlFor={id}>{label}</label>
    {children}
  </div>
)

export default withPhase7Touch(SiteReceipts)
