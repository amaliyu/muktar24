import React, { useState, useEffect } from 'react'
import { sitesService, DUTSE_SITE_ID } from '../services/sites'

const theme = {
  surface: '#1a1d27', border: '#2e3452', red: '#f06b6b',
  text: '#e8eaf0', textMuted: '#7c839e',
}

const baseInput = {
  background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: '8px',
  padding: '9px 12px', fontSize: '13px', color: theme.text, width: '100%', outline: 'none',
}

// One shared fetch per page load: every picker/filter on screen reuses it.
// A failed fetch is not cached, so the next mount retries.
let sitesPromise = null
const loadSites = () => {
  if (!sitesPromise) {
    sitesPromise = sitesService.getActive().catch(e => { sitesPromise = null; throw e })
  }
  return sitesPromise
}

// Active sites for labels, filters and factory checks. `error` is surfaced,
// never swallowed (Rule 10.5).
export function useSites() {
  const [sites, setSites] = useState([])
  const [error, setError] = useState(null)
  useEffect(() => {
    let alive = true
    loadSites()
      .then(s => { if (alive) { setSites(s); setError(null) } })
      .catch(e => {
        console.error('Could not load production sites:', e)
        if (alive) setError(e)
      })
    return () => { alive = false }
  }, [])
  return { sites, error }
}

// Site select. Form mode (default): value is a site id and an empty value is
// shown as Dutse — a load failure keeps Dutse selected and shows the error.
// Filter mode (allowAll): '' means "All sites".
export default function SitePicker({ value, onChange, allowAll = false, allLabel = 'All sites', disabled = false, style }) {
  const { sites, error } = useSites()
  const current = allowAll ? (value || '') : (value || DUTSE_SITE_ID)

  // Keep the selected id visible even if it isn't in the active list (inactive
  // site on an old record, or sites failed to load).
  const options = [...sites]
  if (current && !options.some(s => s.id === current)) {
    options.push({ id: current, name: current === DUTSE_SITE_ID ? 'Dutse Factory' : 'Unknown site' })
  }

  return (
    <div>
      <select
        // A site filter is read-only, so it stays usable on view-only (board) pages.
        data-board-allow={allowAll ? true : undefined}
        style={{ ...baseInput, ...style }}
        value={current}
        disabled={disabled}
        onChange={e => onChange(e.target.value)}
      >
        {allowAll && <option value="">{allLabel}</option>}
        {options.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
      {error && (
        <div style={{ fontSize: '11px', color: theme.red, marginTop: '4px' }}>
          Could not load sites ({error.message || 'unknown error'}).{allowAll ? '' : ' Using Dutse Factory.'}
        </div>
      )}
    </div>
  )
}
