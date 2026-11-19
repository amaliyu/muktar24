import { paymentRequestsService } from '../../services/paymentRequests'
import { ErrorBox, fmtDay, fmtDec, fmtNaira, Pill, theme, ui } from './siteUi'
import { useSiteRead } from './useSiteRead'

export default function LinkedDeliveries({ requestId, category }) {
  if (category !== 'Production Fuel' && category !== 'Raw Materials') return null
  return <DeliveryList key={requestId} requestId={requestId} />
}

function DeliveryList({ requestId }) {
  const { data, error, loading } = useSiteRead(() => paymentRequestsService.listLinkedDeliveries(requestId), [requestId])
  if (!loading && !error && data === null) return null
  return <section aria-label="Deliveries" style={{ borderTop: `1px solid ${theme.border}`, paddingTop: 16, marginTop: 4, minWidth: 0, overflowWrap: 'anywhere' }}>
    <h3 style={{ ...ui.micro, margin: '0 0 10px' }}>Deliveries</h3>
    <ErrorBox error={error} />
    {loading && <div role="status" style={ui.hint}>Loading deliveries…</div>}
    {data?.length === 0 && <div style={ui.hint}>No delivery recorded against this request yet.</div>}
    {data?.map(delivery => {
      const { item, qty_accepted: quantity, unit_cost: unitCost, voided } = delivery
      const tonnes = item?.unit === 'kg'
      return <div key={delivery.id} style={{ padding: '8px 0', borderTop: `1px solid ${theme.border}` }}>
        {voided && <Pill status="voided" label="Voided" />}
        <div style={{ fontSize: 13, textDecoration: voided ? 'line-through' : undefined }}>
          <div>{fmtDay(delivery.received_on)} · <strong>{item?.name || '—'}</strong></div>
          <div>{fmtDec(tonnes ? quantity / 1000 : quantity, 3)} {tonnes ? 't' : item?.unit}{unitCost != null && ` · ${fmtNaira(quantity * unitCost)}`}</div>
          {delivery.truck_or_waybill_ref && <div style={ui.hint}>Waybill: {delivery.truck_or_waybill_ref}</div>}
          {delivery.received_by_name && <div style={ui.hint}>Received by {delivery.received_by_name}</div>}
        </div>
      </div>
    })}
  </section>
}
