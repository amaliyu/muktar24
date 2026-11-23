import React, { useState } from 'react'
import { hasRole } from '../../lib/roles'
import { sitesService } from '../../services/sites'
import { productionExceptionsService as api } from '../../services/productionExceptions'
import { ErrorBox, StackTable, theme, ui, withPhase7Touch } from './siteUi'
import { useSiteRead } from './useSiteRead'

const fields = [
  { key: 'variance_tolerance_pct', label: 'Warn when more than this % over', initial: 5, min: 0, max: 50, exclusive: true },
  { key: 'cement_under_tolerance_pct', label: 'Warn when cement is more than this % under', initial: 10, min: 0, max: 50, exclusive: true },
  { key: 'warn_min_cement_bags', label: 'Ignore cement differences smaller than (bags)', initial: 2, min: 0, max: 50 },
  { key: 'warn_min_diesel_l', label: 'Ignore diesel differences smaller than (L)', initial: 3, min: 0, max: 100 },
  { key: 'warn_min_breakage_blocks', label: 'Ignore breakage smaller than (blocks)', initial: 5, min: 0, max: 100 },
  { key: 'breakage_budget_pct', label: 'Breakage allowed (% of blocks made)', initial: 1, min: 0, max: 20 },
  { key: 'material_cost_budget_per_block', label: 'Materials budget per block (₦)', initial: '', min: 0, exclusive: true, optional: true },
]
const input = { ...ui.input, width: '100%', minWidth: 0, maxWidth: 120, minHeight: 44, boxSizing: 'border-box' }
const button = { ...ui.btn('primary'), minHeight: 44, whiteSpace: 'normal' }

function SiteSettings({ site, settings }) {
  const [values, setValues] = useState(() => Object.fromEntries(fields.map(field => [field.key, String(settings?.[field.key] ?? site[field.key] ?? field.initial)])))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [saved, setSaved] = useState(false)
  const invalid = fields.find(field => {
    const raw = values[field.key].trim()
    const value = Number(raw)
    return raw === '' ? !field.optional : !Number.isFinite(value)
      || (field.exclusive ? value <= field.min : value < field.min) || value > (field.max ?? Infinity)
  })
  const save = async () => {
    if (invalid || busy) return
    setError(null); setSaved(false); setBusy(true)
    try {
      await api.saveSettings(site.id, Object.fromEntries(fields.map(field => [
        field.key, values[field.key] === '' ? null : Number(values[field.key]),
      ])))
      setSaved(true)
    } catch (e) { setError(e) }
    finally { setBusy(false) }
  }
  return <tr>
    <td style={ui.td}>{site.name}</td>
    {fields.map(field => <td key={field.key} style={ui.td}><input aria-label={field.label + ' — ' + site.name} style={input}
      type="number" step="any" min={field.min} max={field.max} value={values[field.key]} disabled={busy}
      onChange={event => { setValues({ ...values, [field.key]: event.target.value }); setSaved(false) }} /></td>)}
    <td style={ui.td}>
      <ErrorBox error={error} />
      {invalid && <div style={{ color: theme.red }}>{invalid.label} must be {invalid.exclusive ? 'greater than 0' : 'at least 0'}{invalid.max != null && ' and at most ' + invalid.max}.</div>}
      {saved && <div role="status" style={{ color: theme.green }}>Settings saved.</div>}
      <button style={button} disabled={busy || Boolean(invalid)} onClick={save}>Save {site.name}</button>
    </td>
  </tr>
}

function BudgetWarningSettings({ userProfile }) {
  const md = hasRole(userProfile, 'md')
  const result = useSiteRead(async () => {
    if (!md) return []
    const sites = await sitesService.getActive()
    return Promise.all(sites.map(async site => ({ site, settings: await api.getSettings(site.id) })))
  }, [md])
  if (!md) return null
  return <section style={{ ...ui.panel, minWidth: 0, overflowWrap: 'anywhere' }} aria-label="Budget warning settings">
    <h3>Budget warning settings</h3>
    <ErrorBox error={result.error} />
    {result.loading && <p role="status">Loading sites…</p>}
    {result.data?.length > 0 && <>
      <StackTable headers={['Site', ...fields.map(field => field.label), '']}>
        {result.data.map(({ site, settings }) => <SiteSettings key={site.id} site={site} settings={settings} />)}
      </StackTable>
      <p style={ui.hint}>Changes apply to the next entry or correction. Past days are not re-checked.</p>
    </>}
  </section>
}

export default withPhase7Touch(BudgetWarningSettings)
