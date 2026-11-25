import { useState } from 'react'
import { hasRole } from '../../lib/roles'
import { clientFunds } from '../../services/clientFunds'
import { ui, ErrorBox, Pill } from './siteUi'
export function FundPill({ request, client }) {
  return request.client_fund ? <Pill label={`${client || 'Client'} ${request.client_fund}`} /> : null
}
export default function PaidFrom({ request, site, client, userProfile, onChanged }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState(null)
  if (site?.site_type !== 'client_site') return null
  const name = client || 'Client'
  const labels = { '': 'APCL', operating: `${name} operating fund`, diesel: `${name} diesel fund` }
  return <div style={{ minWidth: 0 }}>
    {hasRole(userProfile, 'md', 'accountant', 'ico') ? <label>Paid from:<select data-ico-allow style={ui.input} value={request.client_fund || ''} disabled={busy} onChange={async e => {
      const fund = e.target.value; setBusy(true); setError(null)
      try { await clientFunds.setRequestFund(request.id, fund || null); await onChanged?.(fund || null) }
      catch (error) { setError(error) } finally { setBusy(false) }
    }}>{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label> : <p>Paid from: {labels[request.client_fund || '']}</p>}
    <ErrorBox error={error} />
  </div>
}
