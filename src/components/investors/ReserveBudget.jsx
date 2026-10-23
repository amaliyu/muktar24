import { useEffect, useState } from 'react'
import { useSites } from '../SitePicker'
import { siteName } from '../../services/sites'
import { lagosToday } from '../../services/siteContracts'
import { investorsService } from '../../services/investors'
import { hasRole } from '../../lib/roles'
import { fmtNaira2, monthLabel, addMonths } from '../../utils/investorPools'
import { theme, ui, Pill, ErrorBox, SkeletonRows, StackTable } from '../site/siteUi'
import { POOL_READ_ROLES, PoolSitePicker, PageHeader, Field, useLoad, NoAccess } from './investorUi'

// Phase 7C — monthly reserve budget per site (Term Sheet §14: a reviewed
// budget amount, not a fixed %). md edits; a month that is approved for the
// site is locked (RLS refuses it; the grid shows it read-only).

export default function ReserveBudget({ userProfile }) {
  const canRead = hasRole(userProfile, ...POOL_READ_ROLES)
  const isMD = userProfile?.role === 'md'
  const { sites } = useSites()
  const thisYear = Number(lagosToday().slice(0, 4))
  const [siteId, setSiteId] = useState('')
  const [year, setYear] = useState(thisYear)
  const [edits, setEdits] = useState({})
  const [busy, setBusy] = useState(false)
  const [saveErr, setSaveErr] = useState(null)
  const [notice, setNotice] = useState(null)
  const months = Array.from({ length: 12 }, (_, i) => addMonths(`${year}-01-01`, i))

  const [data, err, loading, reload] = useLoad(async () => {
    if (!canRead || !siteId) return null
    const [reserves, approved] = await Promise.all([
      investorsService.listReserves(siteId, months[0], months[11]),
      investorsService.listPeriods(siteId, { status: 'approved' }),
    ])
    return { reserves, approvedMonths: new Set(approved.map(p => p.period_month)) }
  }, [canRead, siteId, year])
  useEffect(() => { setEdits({}); setSaveErr(null) }, [siteId, year])

  if (!canRead) return <NoAccess />
  const saved = (m) => data?.reserves.find(r => r.month === m)
  const valueOf = (m) => (m in edits ? edits[m] : saved(m) ? String(saved(m).amount) : '')
  const changed = months.filter(m => m in edits && edits[m] !== (saved(m) ? String(saved(m).amount) : ''))
  const bad = changed.find(m => edits[m] !== '' && !(Number(edits[m]) >= 0))

  const save = async () => {
    setBusy(true); setSaveErr(null); setNotice(null)
    const failed = []
    for (const m of changed) {
      try {
        if (edits[m] === '') await investorsService.deleteReserve({ siteId, month: m })
        else await investorsService.saveReserve({ siteId, month: m, amount: Number(edits[m]) })
      } catch (e) {
        failed.push(`${monthLabel(m)}: ${e.message}`)
      }
    }
    setBusy(false)
    if (failed.length) setSaveErr(failed.join('\n'))
    else setNotice(`Reserve budget saved for ${changed.length} month${changed.length === 1 ? '' : 's'}.`)
    setEdits({})
    await reload()
  }

  return (
    <div>
      <PageHeader title="Reserve budget" subtitle="The reserve deducted from each month's receipts before NDC. Approved months are locked." />
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 240px' }}><PoolSitePicker value={siteId} onChange={setSiteId} id="rb-site" /></div>
        <div style={{ flex: '0 1 160px' }}>
          <Field id="rb-year" label="Year">
            <select id="rb-year" data-board-allow data-ico-allow style={ui.input} value={year} onChange={e => setYear(Number(e.target.value))}>
              {[thisYear - 1, thisYear, thisYear + 1].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </Field>
        </div>
      </div>
      <ErrorBox error={err && `Could not load reserve budgets: ${err.message}`} onRetry={reload} />
      <ErrorBox error={saveErr} />
      {notice && <div style={ui.ok} role="status">{notice}</div>}
      {loading ? <SkeletonRows rows={6} /> : !err && data && (
        <div style={ui.panel}>
          <div style={ui.section}>{siteName(siteId, sites)} — {year}</div>
          <StackTable headers={['Month', 'Reserve', 'Status']} rightCols={[1]}>
            {months.map(m => {
              const locked = data.approvedMonths.has(m)
              return (
                <tr key={m}>
                  <td style={{ ...ui.td, fontWeight: 600 }}>{monthLabel(m)}</td>
                  <td style={{ ...ui.td, ...ui.right }}>
                    {isMD && !locked ? (
                      <input aria-label={`Reserve ${monthLabel(m)}`} type="number" inputMode="decimal" min="0" step="any"
                        style={{ ...ui.input, maxWidth: '200px', textAlign: 'right', height: '40px' }}
                        value={valueOf(m)} placeholder="0" onChange={e => setEdits(x => ({ ...x, [m]: e.target.value }))} />
                    ) : (saved(m) ? fmtNaira2(saved(m).amount) : '—')}
                  </td>
                  <td style={ui.td}>{locked ? <Pill label="Approved — locked" color={theme.green} /> : m in edits && changed.includes(m) ? <Pill label="Unsaved" color={theme.accent} /> : saved(m) ? <Pill label="Set" color={theme.blue} /> : <Pill label="Not set" color={theme.textMuted} />}</td>
                </tr>
              )
            })}
          </StackTable>
          <div style={{ ...ui.hint, margin: '8px 0 12px' }}>Year total: {fmtNaira2(months.reduce((s, m) => s + (Number(valueOf(m)) || 0), 0))}. A blank month has no reserve.</div>
          {bad && <div style={ui.fieldError}>{monthLabel(bad)}: the reserve cannot be negative.</div>}
          {isMD && (
            <button type="button" style={ui.btn('primary', busy || !changed.length || !!bad)} disabled={busy || !changed.length || !!bad} onClick={save}>
              {busy ? 'Saving…' : `Save changes${changed.length ? ` (${changed.length})` : ''}`}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
