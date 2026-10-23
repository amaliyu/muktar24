import { useState } from 'react'
import { useSites } from '../SitePicker'
import { siteName } from '../../services/sites'
import { lagosToday } from '../../services/siteContracts'
import { investorsService } from '../../services/investors'
import { hasRole } from '../../lib/roles'
import { fmtNaira2, fmtPct, lastCompletedMonth, monthLabel, monthLabelLong, monthEnd, buildCloseStatement, buildInvestorStatement, termLabel } from '../../utils/investorPools'
import { generateSpvClosePDF } from '../../utils/generateSpvClosePDF'
import { generateInvestorStatementPDF } from '../../utils/generateInvestorStatementPDF'
import { theme, ui, Pill, fmtDate, fmtDateTime, ErrorBox, SkeletonRows, ConfirmDialog, StackTable } from '../site/siteUi'
import { POOL_READ_ROLES, INTERNAL_PDF_ROLES, PoolSitePicker, MonthSelect, PageHeader, Field, useLoad, NoAccess } from './investorUi'

// Phase 7C — monthly close per site: compute (md, accountant) → review →
// approve (MD only) → mark lines paid (md, accountant). All figures come from
// compute_ndc_period; this page only lays them out. Every RPC message is shown
// verbatim.

const STATUS = { none: { label: 'Not computed', color: theme.textMuted }, draft: { label: 'Draft', color: theme.accent }, approved: { label: 'Approved', color: theme.green }, voided: { label: 'Voided', color: theme.red } }

export default function MonthlyClose({ userProfile }) {
  const canRead = hasRole(userProfile, ...POOL_READ_ROLES)
  const canCompute = hasRole(userProfile, 'md', 'accountant')
  const canPay = hasRole(userProfile, 'md', 'accountant')
  const isMD = userProfile?.role === 'md'
  const canInternalPdf = hasRole(userProfile, ...INTERNAL_PDF_ROLES)
  const { sites } = useSites()
  const today = lagosToday()
  const latest = lastCompletedMonth(today)
  const [siteId, setSiteId] = useState('')
  const [month, setMonth] = useState(latest)
  const [busy, setBusy] = useState(false)
  const [actErr, setActErr] = useState(null)
  const [notice, setNotice] = useState(null)
  const [dialog, setDialog] = useState(null)    // { kind: 'approve' | 'void' | 'pay', ... }
  const [pdfErr, setPdfErr] = useState(null)

  const [data, err, loading, reload] = useLoad(async () => {
    if (!canRead || !siteId) return null
    const [periods, investors, terms] = await Promise.all([
      investorsService.listPeriods(siteId, { month }),
      investorsService.listInvestors(),
      investorsService.listTerms(),
    ])
    const live = periods.find(p => p.status !== 'voided') || null
    const distributions = live ? await investorsService.listDistributions(live.id) : []
    return { live, voided: periods.filter(p => p.status === 'voided'), distributions, investors, terms }
  }, [canRead, siteId, month])

  if (!canRead) return <NoAccess />

  const live = data?.live
  const term = live ? data.terms.find(t => t.id === live.term_template_id) : null
  const st = live ? buildCloseStatement({ period: live, distributions: data.distributions, investors: data.investors, term }) : null
  const status = live ? live.status : 'none'
  const site = siteName(siteId, sites)

  const act = async (fn, msg) => {
    setBusy(true); setActErr(null); setNotice(null)
    try {
      await fn()
      setDialog(null)
      setNotice(msg)
      await reload()
    } catch (e) {
      setActErr(e)   // RPC message, verbatim
    } finally {
      setBusy(false)
    }
  }
  const compute = () => act(() => investorsService.computeMonth(siteId, month), `${monthLabel(month)} computed for ${site}. Review it below.`)

  const spvPdf = async () => {
    setPdfErr(null)
    try {
      await generateSpvClosePDF({ statement: st, siteName: site, termLabel: termLabel(term), computedAt: live.computed_at, approvedAt: live.approved_at })
    } catch (e) { setPdfErr(e) }
  }
  const investorPdf = async (line) => {
    setPdfErr(null)
    try {
      const inv = data.investors.find(i => i.id === line.investor_id)
      const [capRows, history] = await Promise.all([
        investorsService.capitalOn(siteId, monthEnd(month)),
        investorsService.listInvestorHistory(line.investor_id, siteId),
      ])
      const capital = (capRows || []).filter(r => r.investor_id === line.investor_id).reduce((s, r) => s + Number(r.capital || 0), 0)
      const model = buildInvestorStatement({ investor: inv, siteName: site, period: live, distributions: data.distributions, history, capital, tiers: term?.tiers || [], term })
      await generateInvestorStatementPDF(model)
    } catch (e) { setPdfErr(e) }
  }

  return (
    <div>
      <PageHeader title="Monthly close" subtitle="Net distributable cash for a site's month, split by the terms in force. Compute, review, then the MD approves." />
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 240px' }}><PoolSitePicker value={siteId} onChange={(v) => { setSiteId(v); setNotice(null); setActErr(null) }} id="mc-site" /></div>
        <div style={{ flex: '0 1 200px' }}><MonthSelect value={month} onChange={(v) => { setMonth(v); setNotice(null); setActErr(null) }} latest={latest} id="mc-month" /></div>
      </div>
      <ErrorBox error={err && `Could not load the month: ${err.message}`} onRetry={reload} />
      <ErrorBox error={actErr} />
      <ErrorBox error={pdfErr && `Could not create the PDF: ${pdfErr.message}`} />
      {notice && <div style={ui.ok} role="status">{notice}</div>}

      {loading ? <SkeletonRows rows={6} /> : !err && data && (
        <>
          <div style={{ ...ui.panel, display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: '17px', fontWeight: '700' }}>{site} — {monthLabelLong(month)}</div>
              <div style={ui.hint}>
                {live ? <>Terms: {termLabel(term)} · computed {fmtDateTime(live.computed_at)}{live.approved_at ? ` · approved ${fmtDateTime(live.approved_at)}` : ''}</> : 'Nothing computed for this month yet.'}
              </div>
            </div>
            <Pill label={STATUS[status].label} color={STATUS[status].color} />
          </div>

          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '16px' }}>
            {canCompute && status !== 'approved' && (
              <button type="button" style={ui.btn('primary', busy)} disabled={busy} onClick={compute}>{busy && !dialog ? 'Computing…' : live ? 'Compute again' : 'Compute'}</button>
            )}
            {isMD && status === 'draft' && (
              <button type="button" style={ui.btn('secondary', !st?.canApprove)} disabled={!st?.canApprove} onClick={() => { setActErr(null); setDialog({ kind: 'approve' }) }}>Approve month</button>
            )}
            {isMD && live && (
              <button type="button" style={ui.btn('ghost')} onClick={() => { setActErr(null); setDialog({ kind: 'void', reason: '' }) }}>Void month</button>
            )}
            {live && canInternalPdf && (
              <button type="button" data-ico-allow style={ui.btn('secondary')} onClick={spvPdf}>SPV close PDF (internal)</button>
            )}
          </div>

          {st?.banner && <div style={{ ...ui.error, fontWeight: 700 }} role="alert">{st.banner}</div>}
          {live && <Statement st={st} approved={status === 'approved'} canPay={canPay}
            onPay={(line) => { setActErr(null); setDialog({ kind: 'pay', line, date: today, reference: '' }) }}
            onPdf={investorPdf} />}

          {data.voided.length > 0 && (
            <div style={ui.panel}>
              <div style={ui.section}>Voided computations for this month</div>
              {data.voided.map(v => (
                <div key={v.id} style={{ fontSize: '13px', marginBottom: '6px' }}>
                  Computed {fmtDateTime(v.computed_at)} · distributable {fmtNaira2(v.distributable)} · <span style={{ color: theme.textMuted }}>reason: {v.void_reason || '—'}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {dialog?.kind === 'approve' && (
        <ConfirmDialog title={`Approve ${monthLabel(month)} for ${site}?`}
          body={`Locks this month: receipts, reserve and the terms used can no longer change for it. Investor portion ${fmtNaira2(st.investorPortion)}, APCL operator share ${fmtNaira2(st.apclOperatorShare)}.`}
          confirmLabel="Approve month" busy={busy} onCancel={() => setDialog(null)}
          onConfirm={() => act(() => investorsService.approveMonth(live.id), `${monthLabel(month)} approved for ${site}. Record payments as they are made.`)}>
          <ErrorBox error={actErr} />
        </ConfirmDialog>
      )}
      {dialog?.kind === 'void' && (
        <ConfirmDialog title={`Void ${monthLabel(month)} for ${site}?`} body="The computation is kept on record as voided. You can compute the month again afterwards."
          confirmLabel="Void month" danger busy={busy} confirmDisabled={!dialog.reason.trim()} onCancel={() => setDialog(null)}
          onConfirm={() => act(() => investorsService.voidMonth(live.id, dialog.reason.trim()), `${monthLabel(month)} voided for ${site}.`)}>
          <Field id="mc-void" label="Reason *"><textarea id="mc-void" style={ui.textarea} value={dialog.reason} onChange={e => setDialog(d => ({ ...d, reason: e.target.value }))} /></Field>
          <ErrorBox error={actErr} />
        </ConfirmDialog>
      )}
      {dialog?.kind === 'pay' && (
        <ConfirmDialog title={`Mark paid — ${dialog.line.name}`} body={`${fmtNaira2(dialog.line.amount)} for ${monthLabel(month)} at ${site}. Only paid amounts count toward the tier thresholds.`}
          confirmLabel="Mark paid" busy={busy} confirmDisabled={!dialog.date} onCancel={() => setDialog(null)}
          onConfirm={() => act(() => investorsService.markPaid(dialog.line.id, dialog.date, dialog.reference.trim()), `${dialog.line.name}: ${fmtNaira2(dialog.line.amount)} marked paid.`)}>
          <Field id="mc-paid-on" label="Paid on *"><input id="mc-paid-on" type="date" style={ui.input} value={dialog.date} onChange={e => setDialog(d => ({ ...d, date: e.target.value }))} /></Field>
          <Field id="mc-paid-ref" label="Payment reference"><input id="mc-paid-ref" style={ui.input} value={dialog.reference} onChange={e => setDialog(d => ({ ...d, reference: e.target.value }))} /></Field>
          <ErrorBox error={actErr} />
        </ConfirmDialog>
      )}
    </div>
  )
}

const Row = ({ label, amount, strong, note, color }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', padding: '8px 0', borderBottom: `1px solid ${theme.border}55`, fontWeight: strong ? 700 : 400, fontSize: strong ? '15px' : '14px' }}>
    <span style={{ minWidth: 0 }}>{label}{note && <span style={{ display: 'block', ...ui.hint, fontWeight: 400 }}>{note}</span>}</span>
    <span style={{ ...ui.num, whiteSpace: 'nowrap', color: color || theme.text }}>{fmtNaira2(amount)}</span>
  </div>
)

function Statement({ st, approved, canPay, onPay, onPdf }) {
  return (
    <>
      <div style={{ ...ui.panel, borderLeft: `2px solid ${theme.accent}` }}>
        <div style={ui.section}>Statement</div>
        {st.lines.map(l => <Row key={l.key} label={l.label} amount={l.amount} strong={l.kind === 'total'} color={l.kind === 'info' ? theme.textMuted : undefined} />)}
        <Row label={st.excluded.label} amount={st.excluded.amount} note={`Shown for information — ${st.excluded.note}.`} color={theme.textMuted} />
        <Row label="ICA (investors' capital at month end)" amount={st.ica} />
        <Row label="Investors already paid before this month" amount={st.investorsPaidBefore} />
      </div>

      <div style={ui.panel}>
        <div style={ui.section}>Waterfall</div>
        {st.tiers.length === 0 ? <div style={ui.hint}>Nothing to split this month{st.ica === 0 ? ' (no capital at the site)' : ''}.</div> : (
          <StackTable headers={['Tier', 'NDC in tier', 'Investors', 'APCL']} rightCols={[1, 2, 3]}>
            {st.tiers.map((t, i) => (
              <tr key={i}>
                <td style={ui.td}>{t.text}</td>
                <td style={{ ...ui.td, ...ui.right }}>{fmtNaira2(t.ndc_in_tier)}</td>
                <td style={{ ...ui.td, ...ui.right }}>{fmtNaira2(t.investor)}</td>
                <td style={{ ...ui.td, ...ui.right }}>{fmtNaira2(t.apcl)}</td>
              </tr>
            ))}
          </StackTable>
        )}
        <div style={{ marginTop: '8px' }}>
          <Row label="Investor portion" amount={st.investorPortion} strong />
          <Row label="APCL operator share" amount={st.apclOperatorShare} strong />
        </div>
      </div>

      <div style={ui.panel}>
        <div style={ui.section}>Lines</div>
        {st.investorLines.length === 0 ? <div style={ui.hint}>No distribution lines this month.</div> : (
          <StackTable headers={['Name', 'Capital share', 'Amount', 'Paid', '']} rightCols={[1, 2]}>
            {st.investorLines.map(l => (
              <tr key={l.id}>
                <td style={{ ...ui.td, fontWeight: 600 }}>{l.name}</td>
                <td style={{ ...ui.td, ...ui.right }}>{l.capital_share == null ? '—' : fmtPct(l.capital_share)}</td>
                <td style={{ ...ui.td, ...ui.right, fontWeight: 700 }}>{fmtNaira2(l.amount)}</td>
                <td style={ui.td}>
                  <Pill label={l.paid ? 'Paid' : approved ? 'Unpaid' : 'Draft'} color={l.paid ? theme.green : approved ? theme.accent : theme.textMuted} />
                  {l.paid && <div style={ui.hint}>{fmtDate(l.paid_on)}{l.paid_reference ? ` · ${l.paid_reference}` : ''}</div>}
                </td>
                <td style={ui.td}>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {approved && canPay && !l.paid && <button type="button" style={ui.small(theme.accent)} onClick={() => onPay(l)}>Mark paid</button>}
                    {approved && l.share_type === 'investor_portion' && (
                      <button type="button" data-board-allow data-ico-allow style={ui.small()} onClick={() => onPdf(l)}>Statement PDF</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </StackTable>
        )}
      </div>
    </>
  )
}
