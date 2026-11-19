import { useState } from 'react'
import { ChevronLeft, ChevronRight, Share2 } from 'lucide-react'
import { withAssignedSite, useAssignedSite } from '../AssignedSite'
import { FixedSite, useSites } from '../SitePicker'
import { hasRole } from '../../lib/roles'
import { getLatestSiteScorecard, getSiteScorecard } from '../../services/siteScorecards'
import { productionExceptionsService } from '../../services/productionExceptions'
import { lagosToday } from '../../utils/lateEntry'
import { scorecardCostLines, scorecardDate, scorecardLabour, scorecardMetrics, scorecardWhatsAppText, shiftScorecardDate } from '../../utils/siteScorecard'
import { ErrorBox, fmtDec, fmtNaira, Pill, theme, ui, withPhase7Touch } from './siteUi'
import { useSiteRead } from './useSiteRead'

const panel = { ...ui.panel, minWidth: 0, overflowWrap: 'anywhere' }
const row = { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }
const dateButton = { ...ui.btn(), padding: 0, width: 44, display: 'inline-grid', placeItems: 'center' }

function Metric({ label, metric, compact }) {
  if (compact ? !metric.rate : !metric.usage && !metric.rate) return null
  return <div style={row}>
    <strong>{label}</strong>
    {!compact && metric.usage && <span>{metric.usage}</span>}
    {metric.rate && <span>{metric.rate}</span>}
    {metric.chip && <Pill label={metric.chip.label} color={theme[metric.chip.tone]} />}
  </div>
}

function ScorecardBody({ score, onOpenBudgetWarnings }) {
  const [warningError, setWarningError] = useState(null)
  const [openingWarning, setOpeningWarning] = useState(false)
  const { costs } = score
  const metrics = scorecardMetrics(score)
  const labour = scorecardLabour(costs)
  const openWarning = async () => {
    setOpeningWarning(true)
    setWarningError(null)
    try {
      const [line] = await productionExceptionsService.list({ siteId: score.site_id, date: score.date, statuses: ['open'] })
      onOpenBudgetWarnings(line ? { id: line.id, siteId: score.site_id } : { siteId: score.site_id, status: 'open' })
    } catch (error) {
      setWarningError(error)
    } finally {
      setOpeningWarning(false)
    }
  }

  return <>
    {score.open_warnings > 0 && <div style={{ ...panel, ...row, color: theme.red }}>
      <strong>This day has a budget warning to explain</strong>
      {onOpenBudgetWarnings && <button type="button" style={ui.btn()} onClick={openWarning} disabled={openingWarning}>View budget warning</button>}
      <ErrorBox error={warningError} />
    </div>}
    <section style={{ ...panel, display: 'grid', gap: 14, ...ui.num }} aria-label="Production scorecard">
      <div><strong>Blocks: {fmtDec(score.blocks_total)}</strong><div>9": {fmtDec(score.blocks_9in)} · 6": {fmtDec(score.blocks_6in)}</div></div>
      <Metric label="Cement" metric={metrics.cement} />
      <Metric label="Diesel" metric={metrics.diesel} />
      <Metric label="Breakage" metric={metrics.breakage} />
      {score.dust_kg != null && <div>Dust: {fmtDec(score.dust_kg / 1000, 3)} t (calculated)</div>}
      {score.chippings_kg > 0 && <div>3/8: {fmtDec(score.chippings_kg / 1000, 3)} t (calculated)</div>}
      {score.contract_model === 'service_fee' ? <div>Bilaad's materials — not costed</div>
        : costs?.materials != null && <div>
          <Metric label="Materials" metric={{ ...metrics.materials, usage: fmtNaira(costs.materials) }} />
          {scorecardCostLines(costs).length > 0 && <div style={ui.hint}>{scorecardCostLines(costs).join(' · ')}</div>}
        </div>}
      {costs?.roster_recorded === false ? <strong style={{ color: theme.red }}>Roster not recorded for this day</strong>
        : labour && <div>Labour: {labour}{costs.labour_per_block != null && ` — ${fmtNaira(costs.labour_per_block)} per block`}</div>}
      {costs?.total != null && <div><strong>Total: {fmtNaira(costs.total)}</strong>
        {costs.total_per_block != null && ` — ${fmtNaira(costs.total_per_block)} per block`}</div>}
      <div>
        <a href={`https://wa.me/?text=${encodeURIComponent(scorecardWhatsAppText(score))}`} target="_blank" rel="noopener noreferrer"
          style={{ ...ui.btn('primary'), display: 'inline-flex', alignItems: 'center', gap: 8, textDecoration: 'none', boxSizing: 'border-box' }}>
          <Share2 size={16} aria-hidden="true" /> Send to WhatsApp
        </a>
      </div>
    </section>
  </>
}

export function SiteScorecard({ assignedSiteId, initial, onOpenBudgetWarnings }) {
  const { sites, error } = useSites()
  const [selected, setSelected] = useState(initial?.siteId || '')
  const [date, setDate] = useState(initial?.date || lagosToday)
  const siteId = assignedSiteId || selected || sites.find(site => site.code === 'KADO-SEQ')?.id || sites[0]?.id || ''
  const result = useSiteRead(() => siteId && date ? getSiteScorecard(siteId, date) : null, [siteId, date])
  const score = result.data?.site_id === siteId && result.data?.date === date ? result.data : null

  return <section>
    <h2 style={ui.title}>Daily Scorecard</h2>
    <div style={panel}>
      <label htmlFor="scorecard-site" style={ui.label}>Site</label>
      {assignedSiteId ? <FixedSite id="scorecard-site" siteId={assignedSiteId} sites={sites} style={ui.input} />
        : <select id="scorecard-site" style={ui.input} value={siteId} onChange={e => setSelected(e.target.value)}>
          {!sites.length && <option value="">Loading sites…</option>}
          {sites.map(site => <option key={site.id} value={site.id}>{site.name}</option>)}
        </select>}
      <label htmlFor="scorecard-date" style={{ ...ui.label, marginTop: 12 }}>Date</label>
      <div style={row}>
        <button type="button" aria-label="Previous day" style={dateButton} onClick={() => setDate(shiftScorecardDate(date, -1))}><ChevronLeft size={20} /></button>
        <input id="scorecard-date" type="date" style={{ ...ui.input, width: 'auto', minWidth: 0, flex: '1 1 120px' }}
          value={date} onChange={e => { if (e.target.value) setDate(e.target.value) }} />
        <button type="button" aria-label="Next day" style={dateButton} onClick={() => setDate(shiftScorecardDate(date, 1))}><ChevronRight size={20} /></button>
      </div>
    </div>
    <ErrorBox error={error || result.error} />
    {result.loading && siteId && <p role="status">Loading scorecard…</p>}
    {score?.blocks_total > 0 ? <ScorecardBody key={`${siteId}:${date}`} score={score} onOpenBudgetWarnings={onOpenBudgetWarnings} />
      : !result.loading && !result.error && siteId && <p>No production recorded for {scorecardDate(date)}.</p>}
  </section>
}

export function ScorecardDashboard({ userProfile, onOpen }) {
  const assignment = useAssignedSite()
  const md = hasRole(userProfile, 'md')
  const { sites, error } = useSites()
  const assignedId = assignment.siteId
  const enabled = md || !!assignedId
  const result = useSiteRead(() => {
    if (!enabled) return []
    const ids = md ? sites.filter(site => site.site_type === 'client_site').map(site => site.id) : [assignedId]
    return Promise.all(ids.map(async id => {
      try { return { id, score: await getLatestSiteScorecard(id) } }
      catch (error) { return { id, error } }
    }))
  }, [md, assignedId, sites])
  if (!enabled) return null
  const rows = result.data?.filter(({ score, error }) => md || score?.blocks_total > 0 || error) || []
  if (!rows.length && !(md && error)) return null

  return <section style={panel} aria-label="Daily scorecard summaries">
    <h3 style={ui.section}>Daily Scorecard</h3>
    <ErrorBox error={md ? error : null} />
    {rows.map(({ id, score, error }) => {
      if (error) return <div key={id}><strong>{sites.find(site => site.id === id)?.name}</strong><ErrorBox error={error} /></div>
      if (!score?.blocks_total) return <div key={id} style={{ padding: '8px 0' }}>
        <strong>{sites.find(site => site.id === id)?.name}</strong> · No production recorded
      </div>
      const metrics = scorecardMetrics(score)
      return <div key={id} style={{ display: 'grid', gap: 6, padding: '8px 0', borderTop: `1px solid ${theme.border}` }}>
        <strong>{score.site_name} · {scorecardDate(score.date)} · {fmtDec(score.blocks_total)} blocks</strong>
        <div style={{ ...row, columnGap: 16 }}>
          <Metric label="Cement" metric={metrics.cement} compact />
          <Metric label="Diesel" metric={metrics.diesel} compact />
          <Metric label="Breakage" metric={metrics.breakage} compact />
          <Metric label="Materials" metric={metrics.materials} compact />
        </div>
        <div><button type="button" style={ui.btn()} onClick={() => onOpen(id, score.date)}>View scorecard</button></div>
      </div>
    })}
  </section>
}

export default withPhase7Touch(withAssignedSite(SiteScorecard))
