import { useEffect, useState } from 'react'
import { useSites } from '../SitePicker'
import { siteContractsService, lagosToday } from '../../services/siteContracts'
import { theme, ui, fmtQty, fmtDec, fmtDate, ErrorBox, SkeletonRows } from './siteUi'

// Phase 7B-1 — one card per client site on the main Dashboard. Each figure
// comes from a view (v_cycle_forecast, v_site_material_runway, v_site_yard), so
// the card never keeps its own counters. A failed load shows the error, never
// zeros (Rule 10.5). Tapping a card opens Site Contracts for that site.
export default function SiteDashboardCards({ userProfile, onOpenSite }) {
  const { sites, error: sitesErr } = useSites()
  const clientSites = sites.filter(s => s.site_type === 'client_site')
  const [data, setData] = useState(null)
  const [err, setErr] = useState(null)

  const load = async () => {
    if (!clientSites.length) return
    setErr(null)
    try {
      const ids = clientSites.map(s => s.id)
      const [output, forecasts, runway, yard, warnings] = await Promise.all([
        siteContractsService.outputOn(ids, lagosToday()),
        siteContractsService.listForecasts(),
        siteContractsService.listRunway(),
        siteContractsService.listYard(null),
        siteContractsService.openWarningsBySite(userProfile?.id),
      ])
      setData({ output, forecasts, runway, yard, warnings })
    } catch (e) {
      setErr(e)
    }
  }
  useEffect(() => { load() }, [clientSites.length, userProfile?.id])

  if (sitesErr) return <ErrorBox error={`Could not load sites: ${sitesErr.message}`} />
  if (!clientSites.length) return null

  return (
    <div style={{ marginBottom: '24px' }}>
      <div style={{ ...ui.micro, marginBottom: '8px' }}>Client sites</div>
      <ErrorBox error={err && `Could not load site figures: ${err.message}`} onRetry={load} />
      {!data && !err ? <SkeletonRows rows={2} /> : data && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
          {clientSites.map(s => {
            // The active cycle, else the latest one of any status.
            const fc = data.forecasts.find(f => f.site_id === s.id && f.status === 'active')
              || data.forecasts.filter(f => f.site_id === s.id && f.status !== 'cancelled').sort((a, b) => b.cycle_no - a.cycle_no)[0]
            // avg_rate_5day is the site's own 5-day production average,
            // identical on every cycle row of the site.
            const anyFc = data.forecasts.find(f => f.site_id === s.id)
            const items = data.runway.filter(r => r.site_id === s.id)
            const yard = data.yard.filter(y => y.site_id === s.id)
            const warn = data.warnings[s.id] || 0
            return (
              <div key={s.id} role="button" tabIndex={0} data-board-allow data-ico-allow
                onClick={() => onOpenSite?.(s.id)} onKeyDown={e => { if (e.key === 'Enter') onOpenSite?.(s.id) }}
                style={{ background: theme.card, border: `1px solid ${theme.border}`, borderLeft: `2px solid ${theme.accent}`, borderRadius: '8px', padding: '16px', cursor: 'pointer' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontSize: '15px', fontWeight: '700', color: theme.text }}>{s.name}</div>
                    <div style={ui.hint}>{s.client_name || ''}</div>
                  </div>
                  <span style={{ fontSize: '11px', fontWeight: '700', padding: '2px 8px', borderRadius: '4px', textTransform: 'uppercase', whiteSpace: 'nowrap',
                    background: (warn ? theme.red : theme.green) + '1f', color: warn ? theme.red : theme.green, border: `1px solid ${(warn ? theme.red : theme.green)}66` }}>
                    {warn ? `${warn} open warning${warn === 1 ? '' : 's'}` : 'No warnings'}
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '12px', ...ui.num }}>
                  <Metric label="Today's output" value={fmtQty(data.output[s.id] || 0)} />
                  <Metric label="5-day average" value={anyFc?.avg_rate_5day != null ? fmtQty(anyFc.avg_rate_5day) : '—'} sub={anyFc?.days_n < 5 ? `${anyFc?.days_n || 0} production day${anyFc?.days_n === 1 ? '' : 's'} so far` : null} />
                  <Metric label={fc ? `Cycle ${fc.cycle_no} remaining` : 'Cycle'} value={fc ? fmtQty(fc.remaining) : '—'} sub={fc ? (fc.status === 'active' ? `of ${fmtQty(fc.qty_total)}` : fc.status.replace(/_/g, ' ')) : 'no cycle'} />
                  {fc && ['completed', 'closed'].includes(fc.status)
                    ? <Metric label="Completed" value={fmtDate(fc.completed_on)} sub={fc.completion_notice_sent_on ? `remobilise by ${fmtDate(fc.remobilisation_deadline)}` : 'completion notice not sent'} />
                    : <Metric label="Forecast finish" value={fc?.status === 'active' ? fmtDate(fc.forecast_completion) : '—'} sub={fc?.status === 'active' ? (fc.rate_basis === 'actual' ? 'actual rate' : 'planning rate') : null} />}
                </div>

                <div style={{ ...ui.micro, marginTop: '12px', marginBottom: '4px' }}>Material days left</div>
                {items.length === 0 ? <div style={ui.hint}>No site stock items.</div> : items.map(i => {
                  const low = i.days_left != null && Number(i.days_left) <= Number(i.warning_days)
                  return (
                    <div key={i.item_id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', padding: '2px 0', ...ui.num }}>
                      <span style={{ color: theme.textMuted }}>{i.material || i.item_name}{i.owner === 'client' ? ' (client)' : ''}</span>
                      <span style={{ color: low ? theme.red : theme.text, fontWeight: low ? 700 : 400 }}>
                        {i.days_left == null ? 'no usage yet' : `${fmtDec(i.days_left, 1)} days${low ? ' — LOW' : ''}`}
                        <span style={{ color: theme.textMuted, fontWeight: 400 }}> · {fmtDec(i.current_stock)} {i.unit}</span>
                      </span>
                    </div>
                  )
                })}

                <div style={{ ...ui.micro, marginTop: '12px', marginBottom: '4px' }}>Yard balance</div>
                {yard.length === 0 ? <div style={ui.hint}>Nothing batched yet.</div> : yard.map(y => (
                  <div key={y.block_type} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', padding: '2px 0', ...ui.num }}>
                    <span style={{ color: theme.textMuted }}>{y.block_type}</span>
                    <span>{fmtQty(y.in_yard)}</span>
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

const Metric = ({ label, value, sub }) => (
  <div>
    <div style={ui.micro}>{label}</div>
    <div style={{ fontSize: '20px', fontWeight: '700', color: theme.text, marginTop: '2px' }}>{value}</div>
    {sub && <div style={ui.hint}>{sub}</div>}
  </div>
)
