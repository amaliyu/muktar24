import React, { useState } from 'react'
import { hasRole } from '../../lib/roles'
import { sitesService } from '../../services/sites'
import { productionExceptionsService as api } from '../../services/productionExceptions'
import { ErrorBox, StackTable, theme, ui, withPhase7Touch } from './siteUi'
import { useSiteRead } from './useSiteRead'

const varianceLabel = 'Allowed variance before a warning (%)'
const breakageLabel = 'Breakage allowed (% of blocks made)'
const materialsLabel = 'Materials budget per block (₦)'
const input = { ...ui.input, width: '100%', minWidth: 0, maxWidth: 120, minHeight: 44 }
const button = { ...ui.btn('primary'), minHeight: 44 }

function SiteSettings({ site }) {
  const [variance, setVariance] = useState(String(site.variance_tolerance_pct ?? 5))
  const [breakage, setBreakage] = useState(String(site.breakage_budget_pct ?? 1))
  const [materials, setMaterials] = useState(String(site.material_cost_budget_per_block ?? ''))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [saved, setSaved] = useState(false)
  const v = Number(variance), b = Number(breakage)
  const validation = !variance.trim() || !Number.isFinite(v) || v <= 0 || v > 50
    ? 'Allowed variance must be greater than 0 and at most 50%.'
    : !breakage.trim() || !Number.isFinite(b) || b < 0 || b > 20
      ? 'Breakage allowed must be between 0 and 20%.'
      : materials !== '' && (!Number.isFinite(Number(materials)) || Number(materials) <= 0)
        ? 'Materials budget per block must be greater than 0.' : null
  const save = async () => {
    if (validation || busy) return
    setError(null); setSaved(false); setBusy(true)
    try {
      await api.saveSettings(site.id, { variance_tolerance_pct: v, breakage_budget_pct: b, material_cost_budget_per_block: materials === '' ? null : Number(materials) })
      setSaved(true)
    } catch (e) { setError(e) }
    finally { setBusy(false) }
  }
  return <tr>
    <td style={ui.td}>{site.name}</td>
    <td style={ui.td}><input aria-label={varianceLabel + ' — ' + site.name} style={input} type="number" step="any" max={50}
      value={variance} disabled={busy} onChange={e => { setVariance(e.target.value); setSaved(false) }} /></td>
    <td style={ui.td}><input aria-label={breakageLabel + ' — ' + site.name} style={input} type="number" step="any" min={0} max={20}
      value={breakage} disabled={busy} onChange={e => { setBreakage(e.target.value); setSaved(false) }} /></td>
    <td style={ui.td}><input aria-label={materialsLabel + ' — ' + site.name} style={input} type="number" step="any"
      value={materials} disabled={busy} onChange={e => { setMaterials(e.target.value); setSaved(false) }} /></td>
    <td style={ui.td}>
      <ErrorBox error={error} />
      {validation && <div style={{ color: theme.red }}>{validation}</div>}
      {saved && <div role="status" style={{ color: theme.green }}>Settings saved.</div>}
      <button style={button} disabled={busy || Boolean(validation)} onClick={save}>Save {site.name}</button>
    </td>
  </tr>
}

function BudgetWarningSettings({ userProfile }) {
  const md = hasRole(userProfile, 'md')
  const result = useSiteRead(() => md ? sitesService.getActive() : [], [md])
  if (!md) return null
  return <section style={{ ...ui.panel, minWidth: 0, overflowWrap: 'anywhere' }} aria-label="Budget warning settings">
    <h3>Budget warning settings</h3>
    <ErrorBox error={result.error} />
    {result.loading && <p role="status">Loading sites…</p>}
    {result.data?.length > 0 && <StackTable headers={['Site', varianceLabel, breakageLabel, materialsLabel, '']}>
      {result.data.map(site => <SiteSettings key={site.id} site={site} />)}
    </StackTable>}
  </section>
}

export default withPhase7Touch(BudgetWarningSettings)
