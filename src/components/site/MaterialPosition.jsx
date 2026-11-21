import { requisitionsService } from '../../services/requisitions'
import { ErrorBox, fmtDate, theme, ui } from './siteUi'
import { useSiteRead } from './useSiteRead'

const names = { cement: 'Cement', dust: 'Stone dust', chippings: '3/8 granite', diesel: 'Production diesel' }
const tonnes = new Intl.NumberFormat('en-NG', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const counts = new Intl.NumberFormat('en-NG', { maximumFractionDigits: 2 })
function quantity(value, unit) {
  if (value == null) return '—'
  return unit === 'kg' ? tonnes.format(Number(value) / 1000) + ' t' : counts.format(value) + ' ' + unit
}

export default function MaterialPosition({ siteId, revision, onReceive }) {
  const result = useSiteRead(async () => siteId
    ? { siteId, value: await requisitionsService.materialPosition(siteId) } : null, [siteId, revision])
  const data = result.data?.siteId === siteId ? result.data?.value : null
  if (!siteId) return null
  return <section aria-label="Materials against requisitions" style={{ ...ui.panel, minWidth: 0, overflowWrap: 'anywhere' }}>
    <h3 style={ui.section}>Materials against requisitions</h3>
    <ErrorBox error={result.error} />
    {result.loading && <div role="status">Loading material position…</div>}
    {data && <>
      <p style={ui.hint}>{data.requisitions?.length
        ? 'Requisitions included: ' + data.requisitions.map(row => row.reference).join(', ')
        : 'No sent requisitions included.'}</p>
      {(data.materials || []).map(material => {
        const qty = value => quantity(value, material.unit)
        return <article key={material.material} style={{ borderTop: '1px solid ' + theme.border, padding: '10px 0' }}>
          <h4 style={{ margin: '0 0 8px' }}>{names[material.material] || material.material}</h4>
          <dl style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: '6px 12px', margin: 0 }}>
            {[
              ['Requested', qty(material.requested)],
              ['Received', qty(material.received) + ' (' + counts.format(material.deliveries ?? 0) + ' deliveries)'],
              ['Used in production', qty(material.used)],
              ['On site now', qty(material.on_site), material.on_site < 0 ? theme.red : undefined],
              ['Still to come', qty(material.outstanding)],
            ].map(([label, value, color]) => <div key={label} style={{ display: 'contents' }}>
              <dt style={{ color }}>{label}</dt><dd style={{ margin: 0, color, textAlign: 'right' }}>{value}</dd>
            </div>)}
          </dl>
          {material.on_site < 0 && <p style={{ color: theme.red, marginBottom: 0 }}>Used more than recorded as received — record the missing deliveries or do a stock count</p>}
          {material.over_supplied > 0 && <p style={{ color: theme.accent, marginBottom: 0 }}>Received more than requested</p>}
          {material.received_unlinked > 0 && <div style={{ color: theme.accent, marginTop: 8 }}>
            {counts.format(material.deliveries_unlinked ?? 0)} {Number(material.deliveries_unlinked) === 1 ? 'delivery not linked' : 'deliveries not linked'} to a requisition
            {onReceive && <div><button type="button" data-board-allow data-ico-allow style={ui.btn()} onClick={() => onReceive(siteId)}>Material Receiving</button></div>}
          </div>}
        </article>
      })}
      <p style={ui.hint}>Requested = sent requisitions. Used = production {data.covers_from ? 'since ' + fmtDate(data.covers_from) : 'in the covered period'}. On site = app stock.</p>
    </>}
  </section>
}
