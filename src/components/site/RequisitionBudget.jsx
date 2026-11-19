import React from 'react'
import { productionExceptionsService as api } from '../../services/productionExceptions'
import { MATERIALS, number, quantity } from '../../utils/requisitionText'
import { varianceLabel } from '../../utils/productionExceptions'
import { ErrorBox, Pill, StackTable, theme, ui } from './siteUi'
import { useSiteRead } from './useSiteRead'

export default function RequisitionBudget({ id, siteId, revision }) {
  const result = useSiteRead(async () => {
    const [rows, site] = await Promise.all([api.budget(id), api.getSettings(siteId)])
    return { rows, tolerance: Number(site?.variance_tolerance_pct ?? 5) }
  }, [id, siteId, revision])
  return <section aria-label="Against budget" style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
    <h4>Against budget</h4>
    <ErrorBox error={result.error} />
    {result.loading && <p role="status">Loading requisition budget…</p>}
    {result.data?.rows.length === 0 && <p>No budget lines recorded.</p>}
    {result.data?.rows.length > 0 && <StackTable headers={['Material', 'Budget (whole requisition)', 'Requested', 'Received', 'Blocks made', 'Budget for blocks made', 'Used', 'Variance %']}>
      {result.data.rows.map((row, index) => {
        const variance = Number(row.variance_pct)
        const color = variance > result.data.tolerance ? theme.red : variance < -result.data.tolerance ? theme.accent : theme.textMuted
        return <tr key={row.material + ':' + row.unit + ':' + index}>
          <td style={ui.td}>{MATERIALS[row.material] || row.material}</td>
          {[row.budget_full, row.requested, row.received].map((value, i) => <td key={i} style={ui.td}>{quantity(value, row.unit)}</td>)}
          <td style={ui.td}>{number(row.blocks_made)}</td>
          <td style={ui.td}>{quantity(row.budget_for_made, row.unit)}</td>
          <td style={ui.td}>{quantity(row.used_for_made, row.unit)}</td>
          <td style={ui.td}>{row.variance_pct == null ? '—' : <Pill label={varianceLabel(variance)} color={color} />}</td>
        </tr>
      })}
    </StackTable>}
  </section>
}
