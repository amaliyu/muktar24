import { useEffect, useState } from 'react'
import { useSites } from '../SitePicker'
import { theme, ui } from '../site/siteUi'
import { monthLabel, recentMonths } from '../../utils/investorPools'

// Phase 7C — shared bits for the Investors (SPV) pages. Pools are per site, so
// every page starts with a site; client sites come first (Dutse has no pool).

// Who may open the Investors (SPV) pages and who sees their money. Board and
// ICO are view-only (the App's read-only masks hide their write buttons, and
// the pages don't render write controls for them either).
export const POOL_READ_ROLES = ['md', 'accountant', 'ico', 'board_member']
// The internal SPV close PDF carries every investor's line.
export const INTERNAL_PDF_ROLES = ['md', 'accountant', 'ico']

// Site select usable on view-only pages (data-board-allow / data-ico-allow).
// Defaults to the first client site once sites load.
export function PoolSitePicker({ value, onChange, id = 'pool-site' }) {
  const { sites, error } = useSites()
  const ordered = [...sites].sort((a, b) => (a.site_type === 'client_site' ? 0 : 1) - (b.site_type === 'client_site' ? 0 : 1) || a.name.localeCompare(b.name))
  useEffect(() => {
    if (!value && ordered.length) onChange(ordered[0].id)
  }, [value, ordered.length])
  return (
    <div style={{ ...ui.field, maxWidth: '360px' }}>
      <label style={ui.label} htmlFor={id}>Site</label>
      <select id={id} data-board-allow data-ico-allow style={ui.input} value={value || ''} onChange={e => onChange(e.target.value)}>
        {!value && <option value="">Loading sites…</option>}
        {ordered.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
      {error && <div style={ui.fieldError}>Could not load sites: {error.message || 'unknown error'}</div>}
    </div>
  )
}

// Month as a select (a month <input> is disabled by the board view mask).
export function MonthSelect({ value, onChange, latest, count = 24, id = 'pool-month', label = 'Month', allowAll = false }) {
  const months = recentMonths(latest, count)
  return (
    <div style={{ ...ui.field, maxWidth: '240px' }}>
      <label style={ui.label} htmlFor={id}>{label}</label>
      <select id={id} data-board-allow data-ico-allow style={ui.input} value={value} onChange={e => onChange(e.target.value)}>
        {allowAll && <option value="">All months</option>}
        {months.map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}
      </select>
    </div>
  )
}

export const PageHeader = ({ title, subtitle, children }) => (
  <div style={ui.header}>
    <div>
      <div style={ui.title}>{title}</div>
      {subtitle && <div style={ui.subtitle}>{subtitle}</div>}
    </div>
    {children && <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>{children}</div>}
  </div>
)

export const Fact = ({ label, value, sub, color }) => (
  <div style={{ border: `1px solid ${theme.border}`, borderRadius: '8px', padding: '12px', background: theme.surface, minWidth: 0 }}>
    <div style={ui.micro}>{label}</div>
    <div style={{ fontSize: '18px', fontWeight: '700', color: color || theme.text, marginTop: '4px', overflowWrap: 'anywhere', ...ui.num }}>{value}</div>
    {sub && <div style={ui.hint}>{sub}</div>}
  </div>
)

export const FactGrid = ({ children }) => (
  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', marginBottom: '16px' }}>{children}</div>
)

export const Field = ({ id, label, hint, error, children }) => (
  <div style={ui.field}>
    <label style={ui.label} htmlFor={id}>{label}</label>
    {children}
    {hint && <div style={ui.hint}>{hint}</div>}
    {error && <div style={ui.fieldError}>{error}</div>}
  </div>
)

export const Empty = ({ children }) => (
  <div style={{ ...ui.panel, color: theme.textMuted, fontSize: '13px' }}>{children}</div>
)

// Loads with visible errors (Rule 10.5): returns [data, error, loading, reload].
export function useLoad(fn, deps) {
  const [state, setState] = useState({ data: null, error: null, loading: true })
  const run = async () => {
    setState(s => ({ ...s, loading: true, error: null }))
    try {
      const data = await fn()
      setState({ data, error: null, loading: false })
    } catch (e) {
      setState({ data: null, error: e, loading: false })
    }
  }
  useEffect(() => { run() }, deps)
  return [state.data, state.error, state.loading, run]
}

export const NoAccess = () => <div style={ui.panel}>You do not have access to this page.</div>

// Investors use the same phone controls as the other Phase 7 pages.
export { withPhase7Touch } from '../site/siteUi'
