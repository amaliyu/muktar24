import { useState } from 'react'
import { fetchWeeklyReportData } from '../../services/siteReports'
import { buildWeeklySiteReport, lastCompletedWeek, weekOf, weekLabel, lagosDateOf } from '../../utils/weeklySiteReport'
import { generateWeeklySiteReportPDF } from '../../utils/generateWeeklySiteReportPDF'
import { hasRole } from '../../lib/roles'
import { theme, ui, fmtQty, ErrorBox } from './siteUi'

// Phase 7B-2 — weekly site report (Mon–Sun) for one contract. The data is
// fetched, turned into a model by the pure builder, then drawn. A failed fetch
// is shown and no PDF is produced (Rule 10.5).
//
// Roles: the report reads production_log / damage_log / stock_movements, which
// RLS does not let the accountant read — an accountant's report would silently
// show no production, so the accountant is not offered it (see PR notes).
export const WEEKLY_REPORT_ROLES = ['md', 'production_manager', 'assistant_production_manager', 'ico', 'board_member']
export const WEEKLY_INTERNAL_ROLES = ['md', 'ico']

const isoShift = (iso, days) => new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10)

export default function WeeklyReportPanel({ contract, site, userProfile }) {
  const canInternal = hasRole(userProfile, ...WEEKLY_INTERNAL_ROLES)
  const [week, setWeek] = useState(() => lastCompletedWeek())
  const [busy, setBusy] = useState(null)
  const [err, setErr] = useState(null)
  const [done, setDone] = useState(null)
  const thisWeek = weekOf(lagosDateOf())

  const generate = async (version) => {
    setBusy(version); setErr(null); setDone(null)
    try {
      const data = await fetchWeeklyReportData({ contract, week, internal: version === 'internal' })
      const model = buildWeeklySiteReport({
        ...data,
        expenses: data.expenses.map(e => ({ ...e, category_name: e.category?.name })),
        version, week, contract, site,
        preparedBy: userProfile?.full_name || '', generatedOn: lagosDateOf(),
      })
      const { filename } = await generateWeeklySiteReportPDF(model, { contractModel: contract.contract_model })
      setDone({ version, filename, totals: model.totals, hasProduction: model.hasProduction })
    } catch (e) {
      setErr(e)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div style={{ border: `1px solid ${theme.border}`, borderRadius: '8px', padding: '16px', background: theme.surface, marginTop: '12px' }}>
      <div style={ui.section}>Weekly report</div>
      <div style={{ ...ui.hint, marginBottom: '12px' }}>
        Client version: quantities and dates only{contract.contract_model === 'service_fee' ? ', plus fee earned, advance balance and payments received' : ''}.
        {canInternal ? ' Internal version adds site expenses and the provisional margin — never send it to the client.' : ''}
      </div>

      <div style={ui.label}>Week (Mon–Sun)</div>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '12px' }}>
        <button type="button" data-board-allow data-ico-allow style={ui.btn('secondary')} aria-label="Previous week" onClick={() => setWeek(w => weekOf(isoShift(w.from, -7)))}>‹ Prev</button>
        <div style={{ fontSize: '14px', fontWeight: 700, color: theme.text, ...ui.num, textAlign: 'center' }}>{weekLabel(week)}</div>
        <button type="button" data-board-allow data-ico-allow style={ui.btn('secondary', week.from >= thisWeek.from)} disabled={week.from >= thisWeek.from} aria-label="Next week" onClick={() => setWeek(w => weekOf(isoShift(w.from, 7)))}>Next ›</button>
      </div>
      <div style={{ maxWidth: '240px', marginBottom: '12px' }}>
        <label style={ui.label} htmlFor={`wk-${contract.id}`}>Or pick any day in the week</label>
        <input id={`wk-${contract.id}`} type="date" data-board-allow data-ico-allow style={ui.input} value={week.from}
          max={thisWeek.to} onChange={e => e.target.value && setWeek(weekOf(e.target.value))} />
      </div>
      {week.from === thisWeek.from && <div style={{ ...ui.hint, color: theme.accent, marginBottom: '12px' }}>This week is not finished yet — figures are to date.</div>}

      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
        <button type="button" data-board-allow data-ico-allow style={ui.btn('primary', !!busy)} disabled={!!busy} onClick={() => generate('client')}>
          {busy === 'client' ? 'Preparing…' : 'Client PDF'}
        </button>
        {canInternal && (
          <button type="button" data-ico-allow style={ui.btn('secondary', !!busy)} disabled={!!busy} onClick={() => generate('internal')}>
            {busy === 'internal' ? 'Preparing…' : 'Internal PDF'}
          </button>
        )}
      </div>
      <div style={{ marginTop: '12px' }}>
        <ErrorBox error={err && `Report not generated — could not load the week's data: ${err.message}`} />
        {done && (
          <div style={ui.ok} role="status">
            {done.version === 'internal' ? 'Internal' : 'Client'} report saved as {done.filename}.{' '}
            {done.hasProduction
              ? `Produced ${fmtQty(done.totals.produced)}, good ${fmtQty(done.totals.good)}, accepted ${fmtQty(done.totals.accepted)}.`
              : 'No production recorded this week.'}
          </div>
        )}
      </div>
    </div>
  )
}
