import { withPhase7Touch } from './investorUi'
import { useState } from 'react'
import { useSites } from '../SitePicker'
import { siteName } from '../../services/sites'
import { lagosToday } from '../../services/siteContracts'
import { investorsService } from '../../services/investors'
import { hasRole } from '../../lib/roles'
import { fmtNaira2, fmtPct, CAPITAL_KINDS, capitalKindLabel, contributionAmount, withRunningTotal, capitalSummary, investorName } from '../../utils/investorPools'
import { theme, ui, Pill, fmtDate, ErrorBox, SkeletonRows, ConfirmDialog, StackTable } from '../site/siteUi'
import { POOL_READ_ROLES, PoolSitePicker, PageHeader, Field, Empty, useLoad, NoAccess } from './investorUi'

// Phase 7C — capital per site. md records; md, accountant, ico, board read.
// capital_contributions has no update or delete: a mistake is fixed with an
// offsetting correction entry. "Capital at this site today" comes from
// fn_site_capital_on, which also counts capital tied to assets moved here.

const KIND_COLOR = { contribution: theme.green, bridge: theme.blue, bridge_refund: theme.accent, correction: theme.red }

function Capital({ userProfile }) {
  const canRead = hasRole(userProfile, ...POOL_READ_ROLES)
  const isMD = userProfile?.role === 'md'
  const { sites } = useSites()
  const [siteId, setSiteId] = useState('')
  const [form, setForm] = useState(null)
  const [notice, setNotice] = useState(null)
  const today = lagosToday()

  const [data, err, loading, reload] = useLoad(async () => {
    if (!canRead || !siteId) return null
    const [rows, investors, today_, assets] = await Promise.all([
      investorsService.listContributions(siteId),
      investorsService.listInvestors(),
      investorsService.capitalOn(siteId, today),
      investorsService.listSiteAssets(siteId),
    ])
    const missing = [...new Set(rows.map(r => r.asset_id).filter(id => id && !assets.some(a => a.asset_id === id)))]
    const moved = await investorsService.listAssetsByIds(missing)
    return { rows: withRunningTotal(rows), investors, capital: capitalSummary(today_ || [], investors), assets, allAssets: [...assets, ...moved] }
  }, [canRead, siteId])

  if (!canRead) return <NoAccess />

  const invName = (id) => investorName(data?.investors.find(i => i.id === id))
  const assetName = (id) => {
    if (!id) return '—'
    const a = data?.allAssets.find(x => x.asset_id === id)
    return a ? `${a.code ? a.code + ' · ' : ''}${a.name}` : 'Asset'
  }
  const openAdd = () => { setNotice(null); setForm({ mode: 'add', investor_id: '', kind: 'contribution', amount: '', contributed_on: today, asset_id: '', reference: '', notes: '' }) }
  const openCorrect = (r) => {
    setNotice(null)
    setForm({ mode: 'correct', of: r, investor_id: r.investor_id, kind: 'correction', amount: String(-Number(r.amount)), contributed_on: today, asset_id: r.asset_id || '', reference: r.reference || '', notes: '' })
  }

  return (
    <div>
      <PageHeader title="Capital" subtitle="Capital put into each site's pool. Mistakes are fixed with a correction entry, never edited.">
        {isMD && siteId && <button type="button" style={ui.btn('primary')} onClick={openAdd}>Add contribution</button>}
      </PageHeader>
      <PoolSitePicker value={siteId} onChange={setSiteId} id="cap-site" />
      <ErrorBox error={err && `Could not load capital: ${err.message}`} onRetry={reload} />
      {notice && <div style={ui.ok} role="status">{notice}</div>}

      {loading ? <SkeletonRows rows={4} /> : !err && data && (
        <>
          <div style={{ ...ui.panel, borderLeft: `2px solid ${theme.accent}` }}>
            <div style={ui.section}>Capital at this site today</div>
            {data.capital.lines.length === 0 ? <div style={ui.hint}>No capital at {siteName(siteId, sites)} today.</div> : (
              <StackTable headers={['Investor', 'Amount', '% of pool']} rightCols={[1, 2]}>
                {data.capital.lines.map(l => (
                  <tr key={l.investor_id}>
                    <td style={ui.td}>{l.name}</td>
                    <td style={{ ...ui.td, ...ui.right, fontWeight: 700 }}>{fmtNaira2(l.capital)}</td>
                    <td style={{ ...ui.td, ...ui.right }}>{fmtPct(l.share)}</td>
                  </tr>
                ))}
                <tr>
                  <td style={{ ...ui.td, fontWeight: 700 }}>Total</td>
                  <td style={{ ...ui.td, ...ui.right, fontWeight: 700 }}>{fmtNaira2(data.capital.total)}</td>
                  <td style={{ ...ui.td, ...ui.right }}>100.00%</td>
                </tr>
              </StackTable>
            )}
            <div style={{ ...ui.hint, marginTop: '8px' }}>Includes capital tied to assets moved here from another site, from the move date.</div>
          </div>

          <div style={ui.panel}>
            <div style={ui.section}>Entries recorded at this site</div>
            {data.rows.length === 0 ? (
              <div style={{ ...ui.hint, display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                No capital entries at this site.
                {isMD && <button type="button" style={ui.small(theme.accent)} onClick={openAdd}>Add contribution</button>}
              </div>
            ) : (
              <StackTable headers={['Date', 'Investor', 'Kind', 'Item / asset', 'Amount', 'Reference', 'Notes', 'Running total', '']} rightCols={[4, 7]}>
                {data.rows.map(r => (
                  <tr key={r.id}>
                    <td style={ui.td}>{fmtDate(r.contributed_on)}</td>
                    <td style={ui.td}>{invName(r.investor_id)}</td>
                    <td style={ui.td}><Pill label={capitalKindLabel(r.kind)} color={KIND_COLOR[r.kind]} /></td>
                    <td style={ui.td}>{assetName(r.asset_id)}</td>
                    <td style={{ ...ui.td, ...ui.right, fontWeight: 700, color: Number(r.amount) < 0 ? theme.red : theme.text }}>{fmtNaira2(r.amount)}</td>
                    <td style={ui.td}>{r.reference || '—'}</td>
                    <td style={{ ...ui.td, whiteSpace: 'pre-wrap' }}>{r.notes || '—'}</td>
                    <td style={{ ...ui.td, ...ui.right }}>{fmtNaira2(r.running)}</td>
                    <td style={ui.td}>{isMD && <button type="button" style={ui.small(theme.red)} onClick={() => openCorrect(r)}>Correct an entry</button>}</td>
                  </tr>
                ))}
              </StackTable>
            )}
          </div>
        </>
      )}
      {!loading && !err && !data && <Empty>Choose a site.</Empty>}

      {form && data && (
        <ContributionForm form={form} setForm={setForm} siteId={siteId} siteLabel={siteName(siteId, sites)}
          investors={data.investors} assets={data.assets} assetName={assetName} invName={invName}
          onClose={() => setForm(null)}
          onSaved={async (msg) => { setForm(null); setNotice(msg); await reload() }} />
      )}
    </div>
  )
}

function ContributionForm({ form, setForm, siteId, siteLabel, investors, assets, assetName, invName, onClose, onSaved }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))
  const correcting = form.mode === 'correct'
  const kind = correcting ? 'correction' : form.kind
  const amt = contributionAmount(kind, form.amount)
  const problem = !form.investor_id ? 'Choose the investor.'
    : amt.error ? amt.error
    : !form.contributed_on ? 'Enter the date.'
    : kind === 'correction' && !form.notes.trim() ? 'A correction needs a note saying why.' : null

  const save = async () => {
    setBusy(true); setErr(null)
    try {
      await investorsService.addContribution({ ...form, kind, site_id: siteId, amount: amt.amount })
      await onSaved(`${capitalKindLabel(kind)} of ${fmtNaira2(amt.amount)} recorded for ${invName(form.investor_id)} at ${siteLabel}.`)
    } catch (e) {
      setErr(e)   // DB check / RLS message, verbatim
    } finally {
      setBusy(false)
    }
  }
  const active = investors.filter(i => i.is_active || i.id === form.investor_id)

  return (
    <ConfirmDialog title={correcting ? 'Correct an entry' : `Add contribution — ${siteLabel}`}
      body={correcting
        ? `Records an offsetting correction for ${invName(form.of.investor_id)}'s ${capitalKindLabel(form.of.kind).toLowerCase()} of ${fmtNaira2(form.of.amount)} on ${fmtDate(form.of.contributed_on)}. The original stays on record.`
        : null}
      confirmLabel={correcting ? 'Record correction' : 'Record entry'} busy={busy} confirmDisabled={!!problem} onCancel={onClose} onConfirm={save}>
      <div style={{ maxHeight: '60vh', overflowY: 'auto', paddingRight: '4px' }}>
        {correcting ? (
          <Field id="cc-inv-ro" label="Investor"><div id="cc-inv-ro" style={{ ...ui.input, display: 'flex', alignItems: 'center', background: 'transparent' }}>{invName(form.investor_id)}</div></Field>
        ) : (
          <>
            <Field id="cc-inv" label="Investor *">
              <select id="cc-inv" style={ui.input} value={form.investor_id} onChange={set('investor_id')}>
                <option value="">Choose…</option>
                {active.map(i => <option key={i.id} value={i.id}>{i.kind === 'apcl' ? `${i.name} — as contributor` : i.name}</option>)}
              </select>
            </Field>
            <Field id="cc-site" label="Site"><div id="cc-site" style={{ ...ui.input, display: 'flex', alignItems: 'center', background: 'transparent', color: theme.textMuted }}>{siteLabel}</div></Field>
            <Field id="cc-kind" label="Kind *">
              <select id="cc-kind" style={ui.input} value={form.kind} onChange={set('kind')}>
                {CAPITAL_KINDS.map(k => <option key={k.id} value={k.id}>{k.label}</option>)}
              </select>
            </Field>
          </>
        )}
        <Field id="cc-amt" label="Amount (₦) *"
          hint={kind === 'bridge_refund' ? 'Enter the refund as a positive number — it is recorded as a reduction.'
            : kind === 'correction' ? 'Negative reduces capital, positive adds. Prefilled with the opposite of the entry.' : null}>
          <input id="cc-amt" type="number" inputMode="decimal" step="any" min={kind === 'correction' ? undefined : '0'} style={ui.input} value={form.amount} onChange={set('amount')} />
        </Field>
        {!amt.error && <div style={{ ...ui.hint, marginTop: '-6px', marginBottom: '12px' }}>Will be recorded as {fmtNaira2(amt.amount)}</div>}
        <Field id="cc-date" label="Date *"><input id="cc-date" type="date" style={ui.input} value={form.contributed_on} onChange={set('contributed_on')} /></Field>
        {correcting ? (
          form.asset_id ? <Field id="cc-asset-ro" label="Item / asset"><div id="cc-asset-ro" style={{ ...ui.input, display: 'flex', alignItems: 'center', background: 'transparent' }}>{assetName(form.asset_id)}</div></Field> : null
        ) : (
          <Field id="cc-asset" label="Item / asset (optional)" hint="Capital tied to an asset follows it if the asset moves to another site.">
            <select id="cc-asset" style={ui.input} value={form.asset_id} onChange={set('asset_id')}>
              <option value="">Not tied to an asset</option>
              {assets.map(a => <option key={a.asset_id} value={a.asset_id}>{a.code ? `${a.code} · ` : ''}{a.name} ({a.quantity})</option>)}
            </select>
          </Field>
        )}
        <Field id="cc-ref" label="Reference"><input id="cc-ref" style={ui.input} value={form.reference} onChange={set('reference')} /></Field>
        <Field id="cc-notes" label={kind === 'correction' ? 'Notes * (why the correction)' : 'Notes'}><textarea id="cc-notes" style={ui.textarea} value={form.notes} onChange={set('notes')} /></Field>
        <div style={ui.hint}>Mistakes are fixed with a correction entry, never edited.</div>
        {problem && <div style={{ ...ui.hint, color: theme.accent }}>{problem}</div>}
        <ErrorBox error={err} />
      </div>
    </ConfirmDialog>
  )
}

export default withPhase7Touch(Capital)
